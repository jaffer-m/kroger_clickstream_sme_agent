# Databricks notebook — Kroger Behavioral Analytics SME Agent test questions
# Run this against a live backend to validate SQL generation, date handling, and result display.
# Update AGENT_URL below to point at the deployed Databricks App URL when running in production.

QUESTIONS = [
    # ── Sessions & traffic ──────────────────────────────────────────────────
    "How many sessions were there in the past 7 days?",
    "What is the daily session count trend over the past 14 days?",
    "What is the average session duration in minutes over the last 7 days?",
    "What percentage of sessions bounced this week?",
    "Compare session counts this week vs last week",
    "What days of the week have the most sessions?",

    # ── Visitors ────────────────────────────────────────────────────────────
    "What share of visitors were new vs returning this week?",
    "How many unique visitors were there in the past 7 days?",
    "Show me daily unique visitor counts for the past 14 days",

    # ── Search ──────────────────────────────────────────────────────────────
    "What are the top 10 most searched terms this week?",
    "How many searches returned zero results in the last 7 days?",
    "Which search terms had the highest add-to-cart rate last week?",

    # ── Funnel & conversion ─────────────────────────────────────────────────
    "What percentage of sessions had an add-to-cart this week?",
    "What percentage of sessions resulted in an order submission this week?",
    "Show me the conversion rate from add-to-cart to order submission this week",
    "Show me the conversion rate from product view to purchase this week",
    "What is the checkout start rate for sessions this week?",

    # ── Orders & fulfillment ────────────────────────────────────────────────
    "Break down orders by fulfillment method (pickup vs delivery) last week",
    "What percentage of orders were fulfilled via pickup vs delivery last month?",
    "What are the most popular fulfillment time slot types this week?",

    # ── Channels, devices & banners ─────────────────────────────────────────
    "Which device platforms had the most sessions this week?",
    "Which banners had the most sessions in the past 7 days?",
    "Which channels drove the most sessions last week?",
    "Which traffic sources sent the most visitors this week?",
    "Break down sessions by shopping modality (delivery, pickup, ship) this week",

    # ── Scenarios & pages ───────────────────────────────────────────────────
    "What are all the available scenario names?",
    "Which scenarios had the most events in the last 7 days?",
    "What are the top 10 most visited pages this week?",
    "Show me daily metrics from visitor_visit_daily_metrics for the past 14 days",

    # ── Schema exploration ──────────────────────────────────────────────────
    "What tables are available in the behavioral analytics mart?",
    "Describe the columns in the fact_session table",
    "Describe the columns in the fact_event table",
    "Describe the columns in the fact_order_fulfillment table",
]

# ─────────────────────────────────────────────────────────────────────────────
# Run all questions against the SME agent API
# ─────────────────────────────────────────────────────────────────────────────

# COMMAND ----------
import requests, json

AGENT_URL = "http://localhost:8002/api/chat"  # update to Databricks App URL in production

for i, question in enumerate(QUESTIONS, 1):
    print(f"\n{'='*60}")
    print(f"Q{i}: {question}")
    print('='*60)
    try:
        resp = requests.post(AGENT_URL, json={"message": question}, stream=True, timeout=120)
        for line in resp.iter_lines():
            if line and line.startswith(b"data:"):
                event = json.loads(line[5:])
                if event.get("type") == "text":
                    print(event["content"], end="", flush=True)
                elif event.get("type") == "tool_call":
                    args = event.get("args", {})
                    detail = args.get("query") or args.get("question") or args.get("table") or ""
                    print(f"\n  [tool: {event['name']}]  {detail[:80]}", flush=True)
                elif event.get("type") == "tool_result":
                    result = event.get("result", {})
                    row_count = result.get("row_count") or len(result.get("rows") or [])
                    if row_count:
                        print(f"  → {row_count} rows", flush=True)
                    if result.get("error"):
                        print(f"  ✗ ERROR: {result['error']}", flush=True)
                elif event.get("type") == "done":
                    print()
                    break
    except Exception as e:
        print(f"  ✗ Request failed: {e}")
