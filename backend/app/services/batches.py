"""In-process background batches: asyncio + Semaphore(batch_concurrency), one DB session per ticket."""
from __future__ import annotations

import asyncio
from collections import Counter

from sqlmodel import select

from ..db import new_session
from ..logging_utils import get_logger, mask_pii
from ..models import Batch, Ticket, Triage, utcnow
from .evaluation import EvalItem, compute_eval
from .pipeline import CloudNotAllowed, PipelineError, triage_ticket
from .routing import get_settings, route_for

log = get_logger("batches")


async def run_batch(batch_id: int) -> None:
    with new_session() as s:
        batch = s.get(Batch, batch_id)
        if batch is None:
            return
        settings = get_settings(s)
        batch.status = "running"
        batch.started_at = utcnow()
        batch.processed = batch.routed = batch.escalated = batch.failed = 0
        batch.error = None
        s.add(batch)
        s.commit()
        ticket_ids = list(batch.ticket_ids or [])
        model_config_id = batch.model_config_id
    concurrency = max(1, int(settings.get("batch_concurrency", 8)))
    sem = asyncio.Semaphore(concurrency)
    errors: Counter = Counter()

    async def one(tid: int) -> None:
        decision = None
        async with sem:
            try:
                outcome = await triage_ticket(tid, model_config_id, batch_id=batch_id)
                decision = outcome.decision
            except CloudNotAllowed:
                errors["cloud model not allowed for live tickets (set allow_cloud_for_live_tickets or upload synthetic tickets)"] += 1
            except PipelineError as e:
                errors[str(e)] += 1
            except Exception as e:  # keep the batch going
                errors[f"{type(e).__name__}: {e}"[:200]] += 1
                log.exception(mask_pii(f"batch {batch_id}: ticket {tid} failed"))
        # sync DB update without awaiting in between: no race between coroutines on the event loop
        with new_session() as s2:
            b = s2.get(Batch, batch_id)
            b.processed += 1
            if decision == "routed":
                b.routed += 1
            elif decision == "escalated":
                b.escalated += 1
            else:
                b.failed += 1
            s2.add(b)
            s2.commit()

    try:
        await asyncio.gather(*(one(t) for t in ticket_ids))
        finalize_batch(batch_id, errors)
    except Exception as e:  # pragma: no cover
        log.exception(f"batch {batch_id} crashed")
        with new_session() as s:
            b = s.get(Batch, batch_id)
            b.status = "failed"
            b.error = f"{type(e).__name__}: {e}"
            b.finished_at = utcnow()
            s.add(b)
            s.commit()


def finalize_batch(batch_id: int, errors: Counter | None = None) -> None:
    with new_session() as s:
        b = s.get(Batch, batch_id)
        ids = list(b.ticket_ids or [])
        triages = s.exec(select(Triage).where(Triage.batch_id == batch_id).order_by(Triage.id)).all() if ids else []
        latest: dict[int, Triage] = {}
        for t in triages:
            latest[t.ticket_id] = t
        tickets = {t.id: t for t in s.exec(select(Ticket).where(Ticket.id.in_(ids))).all()} if ids else {}

        per_team: Counter = Counter()
        reasons: Counter = Counter()
        confs = []
        items: list[EvalItem] = []
        for tid, tri in latest.items():
            if tri.decision == "routed":
                team, _ = route_for(s, tri.category)
                per_team[team or "unrouted"] += 1
            elif tri.escalation_reason:
                reasons[tri.escalation_reason] += 1
            if tri.confidence is not None:
                confs.append(tri.confidence)
            ticket = tickets.get(tid)
            if ticket is not None and ticket.gold:
                items.append(EvalItem(
                    text=ticket.text,
                    gold=ticket.gold,
                    pred_category=tri.category,
                    pred_fields=tri.fields,
                    raw_fields=tri.raw_fields,
                    escalated=tri.decision == "escalated",
                ))
        b.per_team = dict(per_team)
        b.escalation_reasons = dict(reasons)
        b.avg_confidence = round(sum(confs) / len(confs), 4) if confs else None
        b.eval = compute_eval(items)
        if errors:
            b.error = "; ".join(f"{n} ticket(s) skipped: {msg}" for msg, n in errors.items())
        b.status = "failed" if b.total and b.failed >= b.total else "completed"
        b.finished_at = utcnow()
        s.add(b)
        s.commit()
        log.info(f"batch {batch_id} {b.status}: total={b.total} routed={b.routed} escalated={b.escalated} failed={b.failed}")
