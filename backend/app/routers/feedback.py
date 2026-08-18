"""Feedback proxy endpoint — forwards to Discord webhook + creates GitHub issue."""

import logging
import os
import re

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..dependencies import shared_limiter
from ..services import rate_limit_config
from ..metrics import feedback_submissions
from ..services import github_issues

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])

WEBHOOK_URL = os.environ.get("FEEDBACK_WEBHOOK_URL", "")

limiter = shared_limiter


class FeedbackRequest(BaseModel):
    type: str
    contact: str
    contents: str


@router.post("")
@limiter.limit(rate_limit_config.endpoint_limit("feedback.submit_feedback", "5/minute"))
async def submit_feedback(request: Request, body: FeedbackRequest):
    if not WEBHOOK_URL:
        raise HTTPException(status_code=503, detail="Feedback not configured")

    if not body.contents.strip() or not body.contact.strip():
        raise HTTPException(status_code=422, detail="Contact and contents are required")

    feedback_type = body.type.strip() or "Feedback"
    contact = body.contact.strip()
    contents = body.contents.strip()

    # ── Discord notification (live ping) ───────────────────────
    color = 0xFF4444 if feedback_type == "Bug" else 0x44AAFF
    payload = {
        "content": "<@99656376954916864>",
        "embeds": [
            {
                "title": f"{feedback_type} Report",
                "description": contents,
                "color": color,
                "fields": [{"name": "Contact", "value": contact, "inline": True}],
                "footer": {"text": "Spire Codex Feedback"},
            }
        ],
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(WEBHOOK_URL, json=payload)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail="Failed to send feedback")

    # Copy into the admin inbox so feedback is reviewable on /admin, not
    # just a Discord scrollback. Best effort by design.
    from ..services.admin_db import record_feedback

    record_feedback("feedback", body.model_dump())

    # ── GitHub issue (best-effort, non-blocking failure) ───────
    if github_issues.is_configured():
        try:
            referer = request.headers.get("referer", "unknown")
            user_agent = request.headers.get("user-agent", "unknown")
            issue_body = (
                f"{contents}\n\n"
                f"---\n"
                f"**Type:** {feedback_type}\n"
                f"**Contact:** {contact}\n"
                f"**Page:** {referer}\n"
                f"**User-Agent:** `{user_agent}`\n"
                f"\n_Submitted via the Spire Codex feedback form._"
            )
            label = "bug" if feedback_type.lower() == "bug" else "feedback"
            await github_issues.create_issue(
                title=f"[{feedback_type}] {contents.splitlines()[0][:80]}",
                body=issue_body,
                labels=[label, "from-website"],
            )
        except Exception as e:
            logger.warning("Failed to create GitHub issue from feedback: %s", e)

    feedback_submissions.labels(type=feedback_type).inc()
    return {"ok": True}


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
_HASH_RE = re.compile(r"^[0-9a-f]{16}$")


class RunReportRequest(BaseModel):
    run_hash: str
    email: str
    reason: str


@router.post("/run-report")
@limiter.limit(rate_limit_config.endpoint_limit("feedback.report_run", "3/minute"))
async def report_run(request: Request, body: RunReportRequest):
    """A viewer reporting a specific run (suspected cheat, wrong hide, ...).
    Lands in the Discord feedback channel and the admin inbox — never GitHub,
    since the required email must stay private."""
    if not WEBHOOK_URL:
        raise HTTPException(status_code=503, detail="Feedback not configured")

    run_hash = body.run_hash.strip().lower()
    email = body.email.strip()
    reason = body.reason.strip()
    if not _HASH_RE.match(run_hash):
        raise HTTPException(status_code=422, detail="Bad run hash")
    if not reason or len(reason) > 2000:
        raise HTTPException(status_code=422, detail="A reason is required")
    if len(email) > 254 or not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="A valid email address is required")

    from ..services.runs_db_mongo import get_share_meta_for_hash

    meta = get_share_meta_for_hash(run_hash)
    if not meta.get("exists"):
        raise HTTPException(status_code=404, detail="Run not found")

    payload = {
        "content": "<@99656376954916864>",
        "embeds": [
            {
                "title": "Run report",
                "description": reason,
                "color": 0xE8B830,
                "fields": [
                    {
                        "name": "Run",
                        "value": f"https://spire-codex.com/runs/{run_hash}",
                        "inline": False,
                    },
                    {
                        "name": "Uploader",
                        "value": meta.get("username") or "anonymous",
                        "inline": True,
                    },
                    {
                        "name": "Hidden",
                        "value": "yes" if meta.get("hidden") else "no",
                        "inline": True,
                    },
                    {"name": "Reporter email", "value": email, "inline": True},
                ],
                "footer": {"text": "Spire Codex Run Report"},
            }
        ],
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(WEBHOOK_URL, json=payload)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail="Failed to send report")

    from ..services.admin_db import record_feedback

    record_feedback(
        "run_report",
        {
            "run_hash": run_hash,
            "email": email,
            "reason": reason,
            "uploader": meta.get("username"),
            "hidden": bool(meta.get("hidden")),
        },
    )
    feedback_submissions.labels(type="RunReport").inc()
    return {"ok": True}
