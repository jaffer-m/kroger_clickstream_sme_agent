from __future__ import annotations

import asyncio
import os
import httpx

from tools.alation import get_catalog_context

def _headers():
    return {
        "Authorization": f"Bearer {os.environ['DATABRICKS_TOKEN']}",
        "Content-Type": "application/json",
    }


async def ask_genie(question: str, genie_conversation_id: str | None = None) -> dict:
    workspace = os.environ["DATABRICKS_HOST"]
    space_id = os.environ["GENIE_SPACE_ID"]
    # Enrich the question with business context from the Alation catalog. This is
    # best-effort: get_catalog_context returns "" if Alation is unconfigured or
    # unreachable, in which case Genie receives the original question unchanged.
    catalog_context = await get_catalog_context(question)
    content = f"{catalog_context}\n\nQuestion: {question}" if catalog_context else question

    async with httpx.AsyncClient(base_url=workspace, headers=_headers(), timeout=90) as client:
        if genie_conversation_id is None:
            r = await client.post(
                f"/api/2.0/genie/spaces/{space_id}/start-conversation",
                json={"content": content},
            )
        else:
            r = await client.post(
                f"/api/2.0/genie/spaces/{space_id}/conversations/{genie_conversation_id}/messages",
                json={"content": content},
            )
        r.raise_for_status()
        data = r.json()
        conversation_id = data["conversation_id"]
        message_id = data["message_id"]

        # Poll until complete — start fast, then back off
        msg = {}
        for attempt in range(60):
            await asyncio.sleep(0.5 if attempt < 4 else 1.0)
            r = await client.get(
                f"/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}"
            )
            r.raise_for_status()
            msg = r.json()
            status = msg.get("status")
            if status == "COMPLETED":
                break
            if status == "FAILED":
                return {
                    "reply": "Genie failed to process the question.",
                    "columns": [],
                    "rows": [],
                    "genie_conversation_id": conversation_id,
                }

        reply = ""
        columns: list = []
        rows: list = []
        generated_sql: str | None = None

        for attachment in msg.get("attachments", []):
            atype = attachment.get("type")
            if atype == "text":
                reply = attachment.get("text", {}).get("content", "")
            elif atype == "query":
                generated_sql = attachment.get("query", {}).get("query")
                r2 = await client.get(
                    f"/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}"
                    f"/messages/{message_id}/query-result"
                )
                if r2.status_code == 200:
                    qr = r2.json()
                    stmt = qr.get("statement_response", {})
                    schema = stmt.get("manifest", {}).get("schema", {})
                    columns = [col["name"] for col in schema.get("columns", [])]
                    rows = stmt.get("result", {}).get("data_array", [])

        return {
            "reply": reply,
            "columns": columns,
            "rows": rows,
            "genie_conversation_id": conversation_id,
            "generated_sql": generated_sql,
        }
