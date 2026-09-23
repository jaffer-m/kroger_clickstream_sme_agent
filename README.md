# Kroger Behavioral Analytics SME Agent

A chat agent for Kroger's `kr_behavioral_analytics_prod` data mart in Databricks Unity Catalog. Ask questions in plain English — the agent queries Databricks SQL and Genie directly and responds with data-backed answers.

## Architecture

```
┌─────────────────────┐     SSE stream     ┌──────────────────────┐
│   React Frontend    │ ──────────────────▶ │  FastAPI Backend     │
│   (Kroger theme)    │ ◀────────────────── │  (port 8002)         │
└─────────────────────┘                     └──────────┬───────────┘
                                                       │
                              ┌────────────────────────┼──────────────────────┐
                              ▼                        ▼                      ▼
                    Databricks SQL              Databricks Genie        Alation Catalog
                    (direct SQL)            (natural language AI/BI)    (optional context)
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- Access to a Kroger Databricks workspace
- An Anthropic API key or Kroger AI proxy URL

## Local Setup

### 1. Configure environment variables

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your credentials:

```env
DATABRICKS_HOST=https://<your-workspace>.azuredatabricks.net
DATABRICKS_TOKEN=<your-pat>
SQL_WAREHOUSE_ID=<your-warehouse-id>
GENIE_SPACE_ID=<your-genie-space-id>
ANTHROPIC_API_KEY=<your-api-key>

# Optional: use an internal AI proxy instead of public Anthropic
# ANTHROPIC_BASE_URL=https://your-internal-proxy-url

# Optional: Alation catalog enrichment
# ALATION_BASE_URL=
# ALATION_REFRESH_TOKEN=
# ALATION_USER_ID=
# ALATION_DS_ID=
```

### 2. Start the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8002 --reload
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABRICKS_HOST` | Yes | Workspace URL (e.g. `https://adb-xxx.azuredatabricks.net`) |
| `DATABRICKS_TOKEN` | Yes | Personal access token |
| `SQL_WAREHOUSE_ID` | Yes | SQL warehouse ID for query execution |
| `GENIE_SPACE_ID` | Yes | Genie space UUID for AI/BI queries |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `DEFAULT_CATALOG` | No | Defaults to `kr_behavioral_analytics_prod` |
| `ANTHROPIC_BASE_URL` | No | Internal AI proxy URL (omit to use public Anthropic) |
| `ALATION_BASE_URL` | No | Alation instance URL |
| `ALATION_REFRESH_TOKEN` | No | Alation API refresh token |
| `ALATION_USER_ID` | No | Alation user ID |
| `ALATION_DS_ID` | No | Alation data source ID |
