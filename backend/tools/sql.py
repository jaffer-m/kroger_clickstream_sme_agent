from __future__ import annotations

import asyncio
import os
import re
import httpx

DEFAULT_CATALOG = os.environ.get("DEFAULT_CATALOG", "kr_behavioral_analytics_prod")


def _headers():
    return {
        "Authorization": f"Bearer {os.environ['DATABRICKS_TOKEN']}",
        "Content-Type": "application/json",
    }


# Strips string/identifier literals and comments so keyword checks below can't be
# fooled by a blocked word inside a string (e.g. a search term of "delete account")
# and can't be bypassed by a blocked word hidden inside a comment.
_STRING_OR_COMMENT_RE = re.compile(
    r"'(?:[^']|'')*'"      # single-quoted strings ('' is an escaped quote)
    r'|"(?:[^"]|"")*"'     # double-quoted strings
    r'|`[^`]*`'            # backtick-quoted identifiers
    r'|--[^\n]*'           # line comments
    r'|/\*.*?\*/',         # block comments
    re.DOTALL,
)

_ALLOWED_START_KEYWORDS = {"SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"}

_BLOCKED_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "MERGE", "DROP", "CREATE", "ALTER",
    "TRUNCATE", "GRANT", "REVOKE", "COPY", "CACHE", "UNCACHE", "REFRESH",
    "VACUUM", "OPTIMIZE", "RESTORE", "MSCK", "LOAD", "SET", "USE", "CALL",
    "EXECUTE", "DENY", "COMMENT", "ANALYZE", "PUT", "REMOVE",
}


def _validate_readonly_sql(query: str) -> str | None:
    """Returns an error message if `query` is not a single safe read-only
    statement, else None. Enforced in code — never rely on prompt instructions
    alone to keep an LLM-generated query from mutating data."""
    cleaned = _STRING_OR_COMMENT_RE.sub(" ", query)

    statements = [s.strip() for s in cleaned.split(";") if s.strip()]
    if not statements:
        return "Empty query."
    if len(statements) > 1:
        return "Only a single read-only statement is allowed per call (multiple statements detected)."

    stmt = statements[0]
    first_word_match = re.match(r"^[\s(]*([A-Za-z]+)", stmt)
    first_word = first_word_match.group(1).upper() if first_word_match else ""
    if first_word not in _ALLOWED_START_KEYWORDS:
        return (
            f"Rejected: only read-only statements are allowed "
            f"({', '.join(sorted(_ALLOWED_START_KEYWORDS))}). "
            f"Statement starts with '{first_word or stmt[:20]}'."
        )

    tokens = {w.upper() for w in re.findall(r"\b\w+\b", stmt)}
    blocked = tokens & _BLOCKED_KEYWORDS
    if blocked:
        return f"Rejected: query contains disallowed keyword(s): {', '.join(sorted(blocked))}."

    return None


async def run_sql(query: str) -> dict:
    validation_error = _validate_readonly_sql(query)
    if validation_error:
        return {"columns": [], "rows": [], "row_count": 0, "error": validation_error}

    workspace = os.environ["DATABRICKS_HOST"]
    warehouse_id = os.environ["SQL_WAREHOUSE_ID"]
    async with httpx.AsyncClient(base_url=workspace, headers=_headers(), timeout=90) as client:
        r = await client.post(
            "/api/2.0/sql/statements",
            json={
                "warehouse_id": warehouse_id,
                "statement": query,
                "wait_timeout": "50s",
                "on_wait_timeout": "CONTINUE",
            },
        )
        if r.status_code >= 400:
            return {"columns": [], "rows": [], "row_count": 0, "error": f"Databricks {r.status_code}: {r.text[:300]}"}
        data = r.json()
        statement_id = data["statement_id"]

        for attempt in range(60):
            state = data.get("status", {}).get("state")
            if state in ("SUCCEEDED", "FAILED", "CANCELED", "CLOSED"):
                break
            await asyncio.sleep(0.5 if attempt < 4 else 1.0)
            r = await client.get(f"/api/2.0/sql/statements/{statement_id}")
            if r.status_code >= 400:
                return {"columns": [], "rows": [], "row_count": 0, "error": f"Databricks {r.status_code}: {r.text[:300]}"}
            data = r.json()

        if data.get("status", {}).get("state") != "SUCCEEDED":
            error = data.get("status", {}).get("error", {}).get("message", "SQL execution failed")
            return {"columns": [], "rows": [], "row_count": 0, "error": error}

        schema = data.get("manifest", {}).get("schema", {})
        result = data.get("result", {})
        columns = [col["name"] for col in schema.get("columns", [])]
        rows = result.get("data_array", [])
        row_count = result.get("row_count", len(rows))
        return {"columns": columns, "rows": rows[:500], "row_count": row_count, "truncated": row_count > 500}


ALLOWED_TABLES: dict[tuple[str, str], set[str]] = {
    (DEFAULT_CATALOG, "clickstream_fact"): {
        "fact_event",
        "fact_session",
        "fact_visitor",
        "fact_order",
        "fact_order_event_bridge",
        "fact_order_fulfillment",
        "fact_order_fulfillment_options",
    },
    (DEFAULT_CATALOG, "clickstream_dim"): {
        "dim_banner",
        "dim_channel",
        "dim_component",
        "dim_date",
        "dim_device_platform",
        "dim_modality",
        "dim_page",
        "dim_producer",
        "dim_scenario",
        "dim_source",
    },
    (DEFAULT_CATALOG, "modelbehavior"): {
        "cx_all_scenarios",
        "cx_all_scenarios_products",
        "cx_all_scenarios_search",
        "cx_all_scenarios_order",
        "mb_clickstream_visitor_visit",
        "visitor_visit_daily_metrics",
    },
}


async def list_tables(catalog: str = DEFAULT_CATALOG, schema: str = "clickstream_fact") -> dict:
    result = await run_sql(f"SHOW TABLES IN `{catalog}`.`{schema}`")
    tables = [row[1] for row in result.get("rows", []) if len(row) > 1]
    allowed = ALLOWED_TABLES.get((catalog, schema))
    if allowed is not None and allowed:  # only filter if the set is non-empty
        tables = [t for t in tables if t in allowed]
    return {"tables": tables[:200], "total": len(tables), "truncated": len(tables) > 200}


async def get_schema(table: str) -> dict:
    result = await run_sql(f"DESCRIBE TABLE {table}")
    columns = [
        {"name": row[0], "type": row[1], "comment": row[2] if len(row) > 2 else ""}
        for row in result.get("rows", [])
        if row and row[0] and not row[0].startswith("#")
    ]
    return {"columns": columns}
