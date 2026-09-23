import json
import os
import uuid
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

load_dotenv(override=True)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import audit_log
from agent import run_agent

app = FastAPI(title="Kroger Behavioral Analytics SME Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class HistoryMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    genie_conversation_id: Optional[str] = None
    file_name: Optional[str] = None
    file_content: Optional[str] = None
    image_data: Optional[str] = None
    image_media_type: Optional[str] = None
    history: Optional[list[HistoryMessage]] = None
    user: Optional[str] = None


@app.get("/api/health")
def health():
    return {"status": "ok"}


_AUDIT_FILE = Path(__file__).parent / "logs" / "audit.jsonl"

@app.get("/api/audit")
def get_audit(limit: int = 200, event: str = None, q: str = None):
    if not _AUDIT_FILE.exists():
        return {"entries": [], "total": 0}
    lines = _AUDIT_FILE.read_text(encoding="utf-8").splitlines()
    entries = []
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except Exception:
            continue
        if event and rec.get("event") != event:
            continue
        if q and q.lower() not in line.lower():
            continue
        entries.append(rec)
        if len(entries) >= limit:
            break
    return {"entries": entries, "total": len(lines)}


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    request_id = uuid.uuid4().hex[:12]
    history = [{"role": m.role, "content": m.content} for m in (req.history or [])]
    messages = history + [{"role": "user", "content": req.message}]

    audit_log.log_event(
        "chat_request",
        request_id=request_id,
        client_ip=request.client.host if request.client else None,
        user=req.user,
        message=audit_log.truncate(req.message),
        history_turns=len(history),
        has_file=bool(req.file_content),
        file_name=req.file_name,
        has_image=bool(req.image_data),
        genie_conversation_id=req.genie_conversation_id,
    )

    async def stream():
        try:
            async for event in run_agent(
                messages,
                req.genie_conversation_id,
                req.file_name,
                req.file_content,
                req.image_data,
                req.image_media_type,
                request_id=request_id,
            ):
                yield {"data": json.dumps(event)}
        except Exception as exc:
            audit_log.log_event("chat_request_failed", request_id=request_id, error=str(exc))
            raise

    return EventSourceResponse(stream())


# Serve built React frontend — active when running as a Databricks App (production).
# In local dev, the Vite dev server (npm run dev) proxies /api to this backend.
_FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="static")
