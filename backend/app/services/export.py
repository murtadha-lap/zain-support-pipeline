"""Exports: human-corrected training rows (schemas/ticket.schema.json) and a flat CSV."""
from __future__ import annotations

import csv
import io
import json
from datetime import timedelta, timezone

from sqlmodel import Session, select

from ..models import Message, Ticket, Triage, User
from .pipeline import as_utc, ticket_ref
from .routing import route_for, team_names

IRAQ_TZ = timezone(timedelta(hours=3))
_ESCALATE_FLAGS = ("mixed_issue", "instruction_in_text", "ambiguous_category")
_EMPTY_FIELDS = {"transaction_ref": None, "amount_iqd": None, "amount_text": None, "date": None, "date_text": None}


def corrections_lines(session: Session) -> list[str]:
    tickets = session.exec(select(Ticket).where(Ticket.status == "resolved").order_by(Ticket.id)).all()
    lines = []
    for t in tickets:
        if not t.category:
            continue
        sent = session.exec(
            select(Message).where(Message.ticket_id == t.id, Message.author_type == "staff").order_by(Message.id.desc())
        ).first()
        flags = [f for f in (t.flags or [])]
        escalate = any(f in flags for f in _ESCALATE_FLAGS)
        _, default_priority = route_for(session, t.category)
        fields = dict(_EMPTY_FIELDS)
        fields.update({k: v for k, v in (t.fields or {}).items() if k in _EMPTY_FIELDS})
        row = {
            "id": f"tkt_{t.id:06d}",
            "text": t.text,
            "channel": t.channel,
            "created_at": as_utc(t.created_at).astimezone(IRAQ_TZ).isoformat(timespec="seconds"),
            "labels": {
                "category": t.category,
                "secondary_category": t.secondary_category,
                "priority": t.priority or default_priority or "medium",
                "fields": fields,
                "flags": flags,
                "escalate": escalate,
                "escalate_reason": (t.escalation_note or "Escalated to a human agent by the pipeline.") if escalate else None,
            },
            "draft_reply": sent.body_md if sent else t.draft_md,
            "meta": {
                "split": "train",
                "source": "human",
                "generator": None,
                "edge_case": None,
                "style": {},
                "reviewed": True,
            },
        }
        lines.append(json.dumps(row, ensure_ascii=False))
    return lines


def tickets_csv(session: Session) -> str:
    teams = team_names(session)
    users = {u.id: u for u in session.exec(select(User)).all()}
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel opens Arabic text correctly
    w = csv.writer(buf)
    w.writerow([
        "ref", "id", "created_at", "channel", "status", "category", "secondary_category", "priority", "team_key",
        "team_name", "confidence", "escalation_reason", "transaction_ref", "amount_iqd", "amount_text", "date",
        "date_text", "flags", "is_synthetic", "customer_email", "assignee", "model", "triaged_at", "resolved_at", "text",
    ])
    triages = {tr.id: tr for tr in session.exec(select(Triage)).all()}
    for t in session.exec(select(Ticket).order_by(Ticket.id)).all():
        f = t.fields or {}
        tri = triages.get(t.latest_triage_id) if t.latest_triage_id else None
        cust = users.get(t.customer_id) if t.customer_id else None
        assignee = users.get(t.assignee_id) if t.assignee_id else None
        w.writerow([
            ticket_ref(t.id), t.id, as_utc(t.created_at).isoformat(), t.channel, t.status, t.category or "",
            t.secondary_category or "", t.priority or "", t.team_key or "", teams.get(t.team_key, "") if t.team_key else "",
            "" if t.confidence is None else round(t.confidence, 4), t.escalation_reason or "",
            f.get("transaction_ref") or "", "" if f.get("amount_iqd") is None else f.get("amount_iqd"),
            f.get("amount_text") or "", f.get("date") or "", f.get("date_text") or "", "|".join(t.flags or []),
            t.is_synthetic, cust.email if cust else "", assignee.full_name if assignee else "",
            tri.model_name if tri else "", as_utc(t.triaged_at).isoformat() if t.triaged_at else "",
            as_utc(t.resolved_at).isoformat() if t.resolved_at else "", t.text,
        ])
    return buf.getvalue()
