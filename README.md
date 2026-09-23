# Kroger Behavioral Analytics SME Agent

A chat agent for Kroger's `kr_behavioral_analytics_prod` data mart in Databricks Unity Catalog. Ask questions in plain English — the agent queries Databricks directly and responds with data-backed answers.

Built on the same architecture as the 8451 sparkathon_clickstream_sme_agent. See that project for implementation details.

## Architecture

```
┌─────────────────────┐     SSE stream     ┌──────────────────────┐
│   React Frontend    │ ──────────────────▶ │  FastAPI Backend     │
│   (Kroger red theme)│ ◀────────────────── │  (port 8002 local /  │
└─────────────────────┘                     │   port 8000 in Apps) │
                                            └──────────┬───────────┘
                                                       │
                              ┌────────────────────────┼──────────────────────┐
                              ▼                        ▼                      ▼
                    Databricks SQL              Databricks Genie        Alation Catalog
                    (direct SQL)            (natural language AI/BI)    (optional context)
```

**Deployment target:** Databricks Apps (production) or localhost (dev)

## Prerequisites

- Python 3.11+
- Node.js 18+
- Access to a Kroger Databricks workspace
- An Anthropic API key (or a Kroger AI proxy URL)

## Setup — REQUIRED before first use

### 1. Discover the Kroger schemas

Connect to the Kroger Databricks workspace and run:

```sql
-- List schemas in the catalog
SHOW SCHEMAS IN `kr_behavioral_analytics_prod`;

-- For each schema, list tables
SHOW TABLES IN `kr_behavioral_analytics_prod`.`<schema>`;

-- Describe each key table
DESCRIBE TABLE `kr_behavioral_analytics_prod`.`<schema>`.`<table>`;
```

### 2. Update `backend/agent_metadata.md`

Replace the TODO sections with actual table descriptions using the output from step 1.
Use `learn/sparkathon_clickstream_sme_agent/backend/agent_metadata.md` as a template.

### 3. Update `backend/tools/sql.py`

Populate `ALLOWED_TABLES` with the real schema and table names:

```python
ALLOWED_TABLES = {
    ("kr_behavioral_analytics_prod", "clickstream"): {
        "session", "fact", "product", ...  # real table names
    },
}
```

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with real Kroger credentials
uvicorn main:app --port 8002 --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

## Databricks Apps Deployment

```bash
# 1. Build the frontend (produces frontend/dist/ served by FastAPI)
cd frontend && npm run build

# 2. Create workspace secrets in the Kroger Databricks workspace
databricks secrets create-scope kroger-sme-agent
databricks secrets put-secret kroger-sme-agent sql_warehouse_id    --string-value "..."
databricks secrets put-secret kroger-sme-agent databricks_token    --string-value "..."
databricks secrets put-secret kroger-sme-agent genie_space_id      --string-value "..."
databricks secrets put-secret kroger-sme-agent anthropic_base_url  --string-value "..."
databricks secrets put-secret kroger-sme-agent anthropic_api_key   --string-value "..."

# 3. Deploy via Databricks CLI (from the repo root)
databricks apps deploy kroger-sme-agent --source-code-path .

# Or deploy via the Databricks workspace UI:
#   Compute → Apps → Create App → upload this folder → configure app.yaml
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABRICKS_HOST` | Yes | Kroger workspace URL (auto-injected in Databricks Apps) |
| `DATABRICKS_TOKEN` | Yes | PAT or OAuth token |
| `SQL_WAREHOUSE_ID` | Yes | SQL warehouse ID for query execution |
| `GENIE_SPACE_ID` | Yes | Genie space UUID for AI/BI natural language queries |
| `DEFAULT_CATALOG` | No | Defaults to `kr_behavioral_analytics_prod` |
| `ANTHROPIC_BASE_URL` | No | Kroger AI proxy URL (omit to use public Anthropic) |
| `ANTHROPIC_API_KEY` | Yes | API key |
| `ALATION_BASE_URL` | No | Kroger Alation instance URL |
| `ALATION_REFRESH_TOKEN` | No | Alation API refresh token |
| `ALATION_USER_ID` | No | Alation user ID |
| `ALATION_DS_ID` | No | Alation data source ID |

## TODO Checklist

Before going live, verify all of these are done:

- [ ] Run schema discovery queries and document available tables
- [ ] Update `backend/agent_metadata.md` with Kroger-specific table descriptions
- [ ] Populate `ALLOWED_TABLES` in `backend/tools/sql.py` with real table names
- [ ] Update example questions in `tests/kroger_sme_questions.py`
- [ ] Update capability cards in `frontend/src/components/ChatWindow.jsx`
- [ ] Configure workspace secrets in Databricks
- [ ] Test with `npm run build` + `uvicorn` to verify static file serving works
- [ ] Deploy to Databricks Apps and run a smoke test

```bash
# Quick TODO audit
grep -rn "TODO" backend/agent_metadata.md backend/tools/sql.py frontend/src/components/ChatWindow.jsx
```
