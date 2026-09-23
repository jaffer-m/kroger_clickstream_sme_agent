"""Alation catalog client.

Fetches business metadata (table descriptions, column definitions) from an
Alation data catalog and formats it as a compact context block that is prepended
to questions sent to Databricks Genie. Everything here is best-effort: if Alation
is unconfigured or unreachable, get_catalog_context() returns "" so the Genie
flow continues unchanged.
"""

from __future__ import annotations

import asyncio
import html
import os
import re
import time

import httpx

BASE_URL = os.environ.get("ALATION_BASE_URL", "").rstrip("/")
REFRESH_TOKEN = os.environ.get("ALATION_REFRESH_TOKEN", "")
USER_ID = os.environ.get("ALATION_USER_ID", "")
DS_ID = os.environ.get("ALATION_DS_ID", "")  # optional: scope to one data source
# Scope catalog lookups to a single Unity Catalog catalog. Alation exposes the
# catalog as the first segment of a table's schema_name ("<catalog>.<schema>"),
# so we keep only tables whose schema_name starts with "<CATALOG>.". Blank = no
# catalog filter (all catalogs in the data source).
CATALOG = os.environ.get("ALATION_CATALOG", "kr_behavioral_analytics_prod").strip()
MAX_TABLES = int(os.environ.get("ALATION_MAX_TABLES", "5"))
MAX_COLUMNS_PER_TABLE = int(os.environ.get("ALATION_MAX_COLUMNS_PER_TABLE", "40"))

# How long to trust cached data before re-fetching (seconds).
_ACCESS_TOKEN_TTL = 23 * 3600  # Alation access tokens live ~24h
_METADATA_TTL = 3600  # re-pull the table list at most once an hour

_STOP_WORDS = {
    "the", "a", "an", "of", "for", "and", "or", "to", "in", "on", "by", "is",
    "are", "was", "were", "be", "what", "which", "how", "many", "much", "show",
    "me", "give", "list", "get", "find", "average", "avg", "count", "sum",
    "total", "per", "over", "top", "most", "number", "num", "all", "each",
    "with", "from", "that", "this", "do", "does", "have", "has",
}

_token_cache: dict = {"token": None, "expires_at": 0.0}
_token_lock = asyncio.Lock()

# {"tables": [...], "fetched_at": float}
_tables_cache: dict = {"tables": None, "fetched_at": 0.0}
_tables_lock = asyncio.Lock()

# table_id -> list[column dict]
_columns_cache: dict = {}


def _configured() -> bool:
    return bool(BASE_URL and REFRESH_TOKEN and USER_ID)


def _strip_html(text: str | None) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _keywords(question: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9_]+", question.lower())
    return {t for t in tokens if len(t) > 2 and t not in _STOP_WORDS}


async def _get_access_token(client: httpx.AsyncClient) -> str:
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"]:
        return _token_cache["token"]

    async with _token_lock:
        now = time.time()
        if _token_cache["token"] and now < _token_cache["expires_at"]:
            return _token_cache["token"]

        r = await client.post(
            "/integration/v1/createAPIAccessToken/",
            json={"refresh_token": REFRESH_TOKEN, "user_id": int(USER_ID)},
        )
        r.raise_for_status()
        data = r.json()
        token = data["api_access_token"]
        _token_cache["token"] = token
        _token_cache["expires_at"] = now + _ACCESS_TOKEN_TTL
        return token


async def _fetch_tables(client: httpx.AsyncClient, token: str) -> list[dict]:
    """Fetch tables for the configured data source/catalog, paginating through results."""
    tables: list[dict] = []
    limit = 100
    skip = 0
    params_base: dict = {"limit": limit}
    if DS_ID:
        params_base["ds_id"] = int(DS_ID)

    catalog_prefix = f"{CATALOG}.".lower() if CATALOG else ""

    for _ in range(50):  # hard cap: 5000 tables
        params = {**params_base, "skip": skip}
        r = await client.get("/integration/v2/table/", params=params, headers={"TOKEN": token})
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        for t in batch:
            schema_name = t.get("schema_name", "")
            # Keep only tables in the target catalog. schema_name is
            # "<catalog>.<schema>" (e.g. "kr_behavioral_analytics_prod.clickstream").
            if catalog_prefix and not schema_name.lower().startswith(catalog_prefix):
                continue
            tables.append({
                "id": t.get("id"),
                "name": t.get("name", ""),
                "title": _strip_html(t.get("title")),
                "description": _strip_html(t.get("description")),
                "schema_name": schema_name,
            })
        if len(batch) < limit:
            break
        skip += limit

    return tables


async def _get_tables(client: httpx.AsyncClient, token: str) -> list[dict]:
    now = time.time()
    if _tables_cache["tables"] is not None and now - _tables_cache["fetched_at"] < _METADATA_TTL:
        return _tables_cache["tables"]

    async with _tables_lock:
        now = time.time()
        if _tables_cache["tables"] is not None and now - _tables_cache["fetched_at"] < _METADATA_TTL:
            return _tables_cache["tables"]
        tables = await _fetch_tables(client, token)
        _tables_cache["tables"] = tables
        _tables_cache["fetched_at"] = now
        return tables


async def _get_columns(client: httpx.AsyncClient, token: str, table_id) -> list[dict]:
    if table_id in _columns_cache:
        return _columns_cache[table_id]

    r = await client.get(
        "/integration/v2/column/",
        params={"table_id": table_id, "limit": MAX_COLUMNS_PER_TABLE},
        headers={"TOKEN": token},
    )
    r.raise_for_status()
    cols = [
        {
            "name": c.get("name", ""),
            "type": c.get("column_type", ""),
            "description": _strip_html(c.get("description")),
        }
        for c in r.json()
    ]
    _columns_cache[table_id] = cols
    return cols


def _score_table(table: dict, keywords: set[str]) -> int:
    haystack = " ".join([
        table.get("name", ""),
        table.get("title", ""),
        table.get("description", ""),
    ]).lower()
    return sum(1 for kw in keywords if kw in haystack)


def _format_context(tables: list[dict], columns_by_table: dict) -> str:
    lines = [
        "Business context from the data catalog (Alation). Use these definitions "
        "to interpret table and column meanings when writing SQL:",
    ]
    for t in tables:
        header = t["name"]
        if t.get("schema_name"):
            header = f"{t['schema_name']}.{t['name']}"
        desc = t.get("description") or t.get("title") or "(no description)"
        lines.append(f"\nTable {header}: {desc}")
        cols = columns_by_table.get(t["id"], [])
        described = [c for c in cols if c["description"]]
        for c in described[:MAX_COLUMNS_PER_TABLE]:
            type_part = f" ({c['type']})" if c["type"] else ""
            lines.append(f"  - {c['name']}{type_part}: {c['description']}")
    return "\n".join(lines)


async def get_catalog_context(question: str) -> str:
    """Return an Alation-derived context block for the question, or "" on failure.

    Never raises: any error (missing config, auth failure, network) yields ""
    so the caller can proceed without catalog context.
    """
    if not _configured():
        return ""

    try:
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=30) as client:
            token = await _get_access_token(client)
            tables = await _get_tables(client, token)
            if not tables:
                return ""

            keywords = _keywords(question)
            scored = sorted(
                tables,
                key=lambda t: _score_table(t, keywords),
                reverse=True,
            )
            # Keep only tables that actually matched a keyword; if none matched,
            # fall back to nothing rather than injecting irrelevant tables.
            relevant = [t for t in scored if _score_table(t, keywords) > 0][:MAX_TABLES]
            if not relevant:
                return ""

            columns_by_table = {}
            for t in relevant:
                try:
                    columns_by_table[t["id"]] = await _get_columns(client, token, t["id"])
                except Exception:
                    columns_by_table[t["id"]] = []

            return _format_context(relevant, columns_by_table)
    except Exception:
        # Best-effort only — Genie should still work without catalog context.
        return ""
