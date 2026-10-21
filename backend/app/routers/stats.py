import statistics
from collections import Counter
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..deps import require_admin, require_staff
from ..enums import CATEGORIES, PRIORITY_LABELS, STATUS_LABELS
from ..models import Batch, Decision, Ticket, Triage, User, utcnow
from ..schemas import MyStatsOut, OverviewOut
from ..serializers import batch_out
from ..services.pipeline import as_utc

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/overview", response_model=OverviewOut)
def overview(session: Session = Depends(get_session), _=Depends(require_admin)):
    tickets = session.exec(select(Ticket)).all()
    total = len(tickets)
    by_status = {k: 0 for k in STATUS_LABELS}
    by_category = {k: 0 for k in CATEGORIES}
    by_priority = {k: 0 for k in PRIORITY_LABELS}
    by_team: Counter = Counter()
    confs = []
    for t in tickets:
        by_status[t.status] = by_status.get(t.status, 0) + 1
        if t.category:
            by_category[t.category] = by_category.get(t.category, 0) + 1
        if t.priority:
            by_priority[t.priority] = by_priority.get(t.priority, 0) + 1
        if t.team_key:
            by_team[t.team_key] += 1
        if t.confidence is not None:
            confs.append(t.confidence)

    latest_ids = [t.latest_triage_id for t in tickets if t.latest_triage_id]
    latest = {tr.id: tr for tr in session.exec(select(Triage).where(Triage.id.in_(latest_ids))).all()} if latest_ids else {}
    triaged = [latest[i] for i in latest_ids if i in latest]
    escalated_n = sum(1 for tr in triaged if tr.decision == "escalated")
    escalation_rate = round(escalated_n / len(triaged), 4) if triaged else 0.0

    relabelled = set(session.exec(select(Decision.ticket_id).where(Decision.action == "relabel")).all())
    auto_routed_resolved = [
        t for t in tickets
        if t.status == "resolved" and t.latest_triage_id in latest and latest[t.latest_triage_id].decision == "routed"
    ]
    auto_routed_accuracy = (
        round(sum(1 for t in auto_routed_resolved if t.id not in relabelled) / len(auto_routed_resolved), 4)
        if auto_routed_resolved else None
    )

    approves = session.exec(select(Decision).where(Decision.action == "approve")).all()
    unedited_rate = round(sum(1 for d in approves if d.draft_edited is False) / len(approves), 4) if approves else None

    res_times = [
        (as_utc(t.resolved_at) - as_utc(t.created_at)).total_seconds()
        for t in tickets if t.resolved_at and t.status == "resolved"
    ]
    median_resolution = round(statistics.median(res_times), 1) if res_times else None

    today = utcnow().date()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]
    created_c, resolved_c, escalated_c = Counter(), Counter(), Counter()
    for t in tickets:
        created_c[as_utc(t.created_at).date()] += 1
        if t.resolved_at:
            resolved_c[as_utc(t.resolved_at).date()] += 1
    since = utcnow() - timedelta(days=15)
    for tr in session.exec(select(Triage).where(Triage.decision == "escalated", Triage.created_at >= since)).all():
        escalated_c[as_utc(tr.created_at).date()] += 1
    daily = [{"date": d.isoformat(), "created": created_c[d], "resolved": resolved_c[d], "escalated": escalated_c[d]} for d in days]

    hist = [0] * 10
    for c in confs:
        hist[min(9, max(0, int(c * 10)))] += 1
    histogram = [{"bucket": f"{i / 10:.1f}-{(i + 1) / 10:.1f}", "count": hist[i]} for i in range(10)]

    recent = session.exec(select(Batch).order_by(Batch.id.desc()).limit(5)).all()
    return {
        "tickets_total": total,
        "by_status": by_status,
        "by_category": by_category,
        "by_team": dict(by_team),
        "by_priority": by_priority,
        "escalation_rate": escalation_rate,
        "avg_confidence": round(sum(confs) / len(confs), 4) if confs else None,
        "auto_routed_accuracy": auto_routed_accuracy,
        "drafts_sent_unedited_rate": unedited_rate,
        "median_resolution_s": median_resolution,
        "daily": daily,
        "confidence_histogram": histogram,
        "recent_batches": [batch_out(b) for b in recent],
    }


@router.get("/me", response_model=MyStatsOut)
def my_stats(session: Session = Depends(get_session), user: User = Depends(require_staff)):
    def count(*conds) -> int:
        return int(session.exec(select(func.count(Ticket.id)).where(*conds)).one())

    team_cond = [Ticket.team_key == user.team_key] if user.role == "team_member" else []
    if user.role == "team_member":
        escalated_open = count(Ticket.status == "escalated", *team_cond)
        team_open = count(Ticket.status == "routed", *team_cond)
        new_waiting = count(Ticket.status == "new", *team_cond)
    else:
        escalated_open = count(Ticket.status == "escalated")
        team_open = count(Ticket.status == "routed")
        new_waiting = count(Ticket.status.in_(["new", "processing"]))
    assigned = count(Ticket.assignee_id == user.id, Ticket.status.not_in(["resolved", "closed"]))
    start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    resolved_today = int(session.exec(
        select(func.count(Decision.id)).where(Decision.user_id == user.id, Decision.action == "approve",
                                              Decision.created_at >= start)
    ).one())
    return {"escalated_open": escalated_open, "team_open": team_open, "assigned_to_me": assigned,
            "resolved_today": resolved_today, "new_waiting": new_waiting}
