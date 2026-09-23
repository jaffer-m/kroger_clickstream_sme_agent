from __future__ import annotations

import json
import os
import uuid
from datetime import date
from pathlib import Path
import httpx
import httpx2
from anthropic import AsyncAnthropic
import audit_log
from tools.genie import ask_genie
from tools.sql import run_sql, list_tables, get_schema, DEFAULT_CATALOG

_anthropic_kwargs: dict = {"api_key": os.environ.get("ANTHROPIC_API_KEY", "placeholder")}
if _base_url := os.environ.get("ANTHROPIC_BASE_URL"):
    _anthropic_kwargs["base_url"] = _base_url
    # Corporate proxies often use self-signed certs — disable SSL verification for internal URLs
    _anthropic_kwargs["http_client"] = httpx2.AsyncClient(verify=False, timeout=120.0)
client = AsyncAnthropic(**_anthropic_kwargs)

_BASE_PROMPT = (Path(__file__).parent / "agent_metadata.md").read_text()


def _system_prompt() -> str:
    today = date.today().strftime("%Y-%m-%d")
    return f"Today's date is {today}. Use this for any date calculations or relative time filters (e.g. 'this week', 'yesterday', 'last 7 days').\n\n{_BASE_PROMPT}"

TOOLS = [
    {
        "name": "ask_genie",
        "description": (
            "Ask a natural-language question to the AI/BI Genie space configured on the "
            "Kroger behavioral analytics data mart. Genie generates and executes SQL automatically. "
            "Best for exploratory questions or when the schema is not yet fully documented."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "The natural-language question"},
                "genie_conversation_id": {
                    "type": "string",
                    "description": "Omit for a new conversation; pass to continue an existing one",
                },
            },
            "required": ["question"],
        },
    },
    {
        "name": "run_sql",
        "description": (
            "Execute a SQL query directly on the Databricks SQL Warehouse. "
            "Use when you know exactly what SQL to write."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The SQL query to execute"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_tables",
        "description": "List tables in a Unity Catalog schema.",
        "input_schema": {
            "type": "object",
            "properties": {
                "catalog": {"type": "string", "default": DEFAULT_CATALOG},
                "schema": {"type": "string", "default": "clickstream_fact"},
            },
        },
    },
    {
        "name": "get_schema",
        "description": "Get column definitions for a specific table.",
        "input_schema": {
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "description": "Fully-qualified table name, e.g. catalog.schema.table",
                },
            },
            "required": ["table"],
        },
        "cache_control": {"type": "ephemeral"},
    },
]


async def _dispatch(name: str, inputs: dict) -> dict:
    if name == "ask_genie":
        return await ask_genie(inputs["question"], inputs.get("genie_conversation_id"))
    if name == "run_sql":
        return await run_sql(inputs["query"])
    if name == "list_tables":
        return await list_tables(inputs.get("catalog", DEFAULT_CATALOG), inputs.get("schema", "clickstream_fact"))
    if name == "get_schema":
        return await get_schema(inputs["table"])
    return {"error": f"Unknown tool: {name}"}


def _tool_call_audit_fields(name: str, inputs: dict) -> dict:
    """What SQL/question actually went out — this is the core of the audit
    trail, so log it in full (bounded) regardless of tool."""
    if name == "run_sql":
        return {"query": audit_log.truncate(inputs.get("query", ""))}
    if name == "ask_genie":
        return {
            "question": audit_log.truncate(inputs.get("question", "")),
            "genie_conversation_id": inputs.get("genie_conversation_id"),
        }
    return {"args": inputs}


def _tool_result_audit_fields(name: str, result: dict) -> dict:
    """Summarizes a tool result for the log without persisting raw row data,
    which can carry customer-level fields (e.g. ehhn, account_guid)."""
    fields = {"error": result.get("error")}
    if name in ("run_sql", "ask_genie"):
        fields["columns"] = result.get("columns")
        fields["row_count"] = result.get("row_count", len(result.get("rows", [])) if "rows" in result else None)
        fields["truncated"] = result.get("truncated")
    if name == "ask_genie":
        fields["generated_sql"] = audit_log.truncate(result.get("generated_sql") or "")
        fields["reply"] = audit_log.truncate(result.get("reply", ""))
    if name == "list_tables":
        fields["total"] = result.get("total")
    return fields


async def run_agent(
    messages: list,
    genie_conversation_id: str | None = None,
    file_name: str | None = None,
    file_content: str | None = None,
    image_data: str | None = None,
    image_media_type: str | None = None,
    request_id: str | None = None,
):
    """
    Async generator — yields SSE-ready dicts:
      {"type": "tool_call",   "name": str, "args": dict}
      {"type": "tool_result", "name": str, "result": dict}
      {"type": "text",        "content": str}
      {"type": "done",        "genie_conversation_id": str | None}
    """
    request_id = request_id or uuid.uuid4().hex[:12]
    model = "claude-sonnet-4-6"
    turn = 0
    total_usage = {"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}

    system = [{"type": "text", "text": _system_prompt(), "cache_control": {"type": "ephemeral"}}]

    if image_data:
        messages = [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": image_media_type or "image/jpeg",
                        "data": image_data,
                    },
                },
                {"type": "text", "text": messages[0]["content"]},
            ],
        }] + messages[1:]
    elif file_content:
        truncated = file_content[:60000]
        file_ctx = (
            f"The user has attached a file named '{file_name}'.\n"
            f"Use this data to answer their question. Here is the file content:\n\n{truncated}"
        )
        messages = [{"role": "user", "content": f"{file_ctx}\n\n{messages[0]['content']}"}] + messages[1:]

    while True:
        turn += 1
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            system=system,
            tools=TOOLS,
            messages=messages,
        )

        usage = response.usage.model_dump() if response.usage else {}
        for key in total_usage:
            total_usage[key] += usage.get(key, 0) or 0
        audit_log.log_event(
            "llm_usage",
            request_id=request_id,
            turn=turn,
            model=model,
            usage=usage,
            estimated_cost_usd=audit_log.estimate_cost_usd(model, usage),
        )

        tool_uses = []
        text_content = ""
        for block in response.content:
            if block.type == "text":
                text_content += block.text
            elif block.type == "tool_use":
                tool_uses.append(block)

        if text_content:
            yield {"type": "text", "content": text_content}

        if response.stop_reason == "end_turn" or not tool_uses:
            audit_log.log_event(
                "chat_done",
                request_id=request_id,
                turns=turn,
                total_usage=total_usage,
                total_estimated_cost_usd=audit_log.estimate_cost_usd(model, total_usage),
                final_answer=audit_log.truncate(text_content),
            )
            yield {"type": "done", "genie_conversation_id": genie_conversation_id}
            return

        # Append assistant turn with tool_use blocks
        messages.append({
            "role": "assistant",
            "content": [
                {"type": "text", "text": text_content} if text_content else None,
                *[
                    {"type": "tool_use", "id": t.id, "name": t.name, "input": t.input}
                    for t in tool_uses
                ],
            ],
        })
        # Remove None entries
        messages[-1]["content"] = [c for c in messages[-1]["content"] if c]

        tool_results = []
        for tool_use in tool_uses:
            yield {"type": "tool_call", "name": tool_use.name, "args": tool_use.input}
            audit_log.log_event(
                "tool_call",
                request_id=request_id,
                turn=turn,
                tool=tool_use.name,
                **_tool_call_audit_fields(tool_use.name, tool_use.input),
            )

            try:
                result = await _dispatch(tool_use.name, tool_use.input)
            except Exception as exc:
                result = {"error": str(exc)}

            if tool_use.name == "ask_genie" and "genie_conversation_id" in result:
                genie_conversation_id = result["genie_conversation_id"]

            audit_log.log_event(
                "tool_result",
                request_id=request_id,
                turn=turn,
                tool=tool_use.name,
                **_tool_result_audit_fields(tool_use.name, result),
            )
            yield {"type": "tool_result", "name": tool_use.name, "result": result}

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": json.dumps(result),
            })

        messages.append({"role": "user", "content": tool_results})
