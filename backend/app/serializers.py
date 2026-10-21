"""Table rows -> API dicts (shapes from docs/api-contract.md)."""
from __future__ import annotations

import os

from sqlalchemy import func
from sqlmodel import Session, select

from .enums import CLOUD_PROVIDERS
from .models import Batch, Decision, Message, ModelConfig, Team, Ticket, Triage, User
from .services.pipeline import as_utc, ticket_ref
from .services.routing import team_names

EMPTY_FIELDS = {"transaction_ref": None, "amount_iqd": None, "amount_text": None, "date": None, "date_text": None}


def fields_out(fields: dict | None) -> dict:
    out = dict(EMPTY_FIELDS)
    if fields:
        out.update({k: fields.get(k) for k in EMPTY_FIELDS if k in fields})
    return out


def user_out(user: User, teams: dict[str, str] | None = None) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "team_key": user.team_key,
        "team_name": (teams or {}).get(user.team_key) if user.team_key else None,
        "is_active": user.is_active,
        "created_at": as_utc(user.created_at),
    }


def user_out_s(session: Session, user: User) -> dict:
    teams = {}
    if user.team_key:
        t = session.get(Team, user.team_key)
        teams = {t.key: t.name} if t else {}
    return user_out(user, teams)


def has_api_key(row: ModelConfig) -> bool:
    env = row.api_key_env or ("ANTHROPIC_API_KEY" if row.provider == "anthropic" else None)
    return bool(env and os.environ.get(env))


def model_out(row: ModelConfig) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "provider": row.provider,
        "model_id": row.model_id,
        "base_url": row.base_url,
        "api_key_env": row.api_key_env,
        "has_api_key": has_api_key(row),
        "is_cloud": row.provider in CLOUD_PROVIDERS,
        "supports_logprobs": row.supports_logprobs,
        "temperature": row.temperature,
        "max_tokens": row.max_tokens,
        "timeout_s": row.timeout_s,
        "effort": row.effort,
        "use_fallbacks": row.use_fallbacks,
        "enabled": row.enabled,
        "is_default": row.is_default,
        "notes": row.notes or "",
        "created_at": as_utc(row.created_at),
        "updated_at": as_utc(row.updated_at),
    }


def triage_out(row: Triage, include_raw: bool = True) -> dict:
    return {
        "id": row.id or 0,
        "ticket_id": row.ticket_id or 0,
        "model_config_id": row.model_config_id,
        "model_name": row.model_name,
        "model_id": row.model_id,
        "provider": row.provider,
        "prompt_version": row.prompt_version,
        "threshold": row.threshold,
        "category": row.category,
        "secondary_category": row.secondary_category,
        "priority": row.priority,
        "fields": fields_out(row.fields),
        "flags": list(row.flags or []),
        "draft_reply": row.draft_reply or "",
        "confidence": row.confidence,
        "category_probs": row.category_probs,
        "checks": list(row.checks or []),
        "decision": row.decision,
        "escalation_reason": row.escalation_reason,
        "latency_ms": row.latency_ms,
        "tokens_in": row.tokens_in,
        "tokens_out": row.tokens_out,
        "raw_output": row.raw_output if include_raw else None,
        "error": row.error,
        "created_at": as_utc(row.created_at),
    }


def message_out(m: Message) -> dict:
    return {
        "id": m.id,
        "ticket_id": m.ticket_id,
        "author_type": m.author_type,
        "author_name": m.author_name,
        "body_md": m.body_md,
        "created_at": as_utc(m.created_at),
    }


def decision_out(d: Decision) -> dict:
    return {
        "id": d.id,
        "ticket_id": d.ticket_id,
        "user_id": d.user_id,
        "user_name": d.user_name,
        "user_role": d.user_role,
        "action": d.action,
        "before": d.before,
        "after": d.after,
        "draft_edited": d.draft_edited,
        "note": d.note or "",
        "created_at": as_utc(d.created_at),
    }


def batch_out(b: Batch) -> dict:
    started, finished = as_utc(b.started_at), as_utc(b.finished_at)
    duration = round((finished - started).total_seconds(), 2) if started and finished else None
    return {
        "id": b.id,
        "name": b.name,
        "model_config_id": b.model_config_id,
        "model_name": b.model_name,
        "status": b.status,
        "source": b.source,
        "total": b.total,
        "processed": b.processed,
        "routed": b.routed,
        "escalated": b.escalated,
        "failed": b.failed,
        "avg_confidence": b.avg_confidence,
        "per_team": dict(b.per_team or {}),
        "escalation_reasons": dict(b.escalation_reasons or {}),
        "eval": b.eval,
        "error": b.error,
        "created_by_name": b.created_by_name,
        "created_at": as_utc(b.created_at),
        "started_at": started,
        "finished_at": finished,
        "duration_s": duration,
    }


def _is_customer(viewer: User | None) -> bool:
    return viewer is not None and viewer.role == "customer"


def ticket_list_items(session: Session, tickets: list[Ticket], viewer: User | None = None) -> list[dict]:
    if not tickets:
        return []
    teams = team_names(session)
    user_ids = {t.customer_id for t in tickets if t.customer_id} | {t.assignee_id for t in tickets if t.assignee_id}
    users = {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()} if user_ids else {}
    ids = [t.id for t in tickets]
    counts = dict(
        session.exec(
            select(Message.ticket_id, func.count(Message.id)).where(Message.ticket_id.in_(ids)).group_by(Message.ticket_id)
        ).all()
    )
    customer_view = _is_customer(viewer)
    out = []
    for t in tickets:
        cust = users.get(t.customer_id) if t.customer_id else None
        assignee = users.get(t.assignee_id) if t.assignee_id else None
        out.append({
            "id": t.id,
            "ref": ticket_ref(t.id),
            "channel": t.channel,
            "text_preview": (t.text[:140] + "…") if len(t.text) > 140 else t.text,
            "status": t.status,
            "category": t.category,
            "priority": t.priority,
            "team_key": t.team_key,
            "team_name": teams.get(t.team_key) if t.team_key else None,
            "confidence": None if customer_view else t.confidence,
            "escalation_reason": None if customer_view else t.escalation_reason,
            "flags": [] if customer_view else list(t.flags or []),
            "customer_name": cust.full_name if cust else None,
            "assignee_id": t.assignee_id,
            "assignee_name": assignee.full_name if assignee else None,
            "is_synthetic": t.is_synthetic,
            "message_count": int(counts.get(t.id, 0)),
            "created_at": as_utc(t.created_at),
            "updated_at": as_utc(t.updated_at),
        })
    return out


def ticket_detail(session: Session, t: Ticket, viewer: User) -> dict:
    base = ticket_list_items(session, [t], viewer)[0]
    customer_view = _is_customer(viewer)
    see_raw = viewer.role in ("agent", "admin")
    cust = session.get(User, t.customer_id) if t.customer_id else None
    messages = session.exec(select(Message).where(Message.ticket_id == t.id).order_by(Message.created_at, Message.id)).all()
    if customer_view:
        triages, decisions = [], []
    else:
        triages = session.exec(select(Triage).where(Triage.ticket_id == t.id).order_by(Triage.id.desc())).all()
        decisions = session.exec(select(Decision).where(Decision.ticket_id == t.id).order_by(Decision.id.desc())).all()
    history = [triage_out(x, include_raw=see_raw) for x in triages]
    base.update({
        "text": t.text,
        "secondary_category": t.secondary_category,
        "fields": fields_out(t.fields),
        "escalation_note": None if customer_view else t.escalation_note,
        "draft_md": "" if customer_view else (t.draft_md or ""),
        "ai_draft": "" if customer_view else (t.ai_draft or ""),
        "customer": {"id": cust.id, "full_name": cust.full_name, "email": cust.email} if cust else None,
        "triage": history[0] if history else None,
        "triage_history": history,
        "messages": [message_out(m) for m in messages],
        "decisions": [decision_out(d) for d in decisions],
        "gold": t.gold if see_raw else None,
        "batch_id": t.batch_id,
        "triaged_at": as_utc(t.triaged_at),
        "resolved_at": as_utc(t.resolved_at),
    })
    return base
