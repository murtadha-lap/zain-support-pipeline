from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..deps import require_admin
from ..models import Batch, Ticket, User, utcnow
from ..schemas import BatchCreate, BatchOut, Page, TicketListItem
from ..serializers import batch_out, ticket_list_items
from ..services.batches import run_batch
from ..services.pipeline import PipelineError, resolve_model
from ..services.upload import UploadError, parse_upload

router = APIRouter(prefix="/api/batches", tags=["batches"])


def _get(session: Session, batch_id: int) -> Batch:
    b = session.get(Batch, batch_id)
    if b is None:
        raise HTTPException(404, "Batch not found")
    return b


@router.get("", response_model=list[BatchOut])
def list_batches(session: Session = Depends(get_session), _=Depends(require_admin)):
    return [batch_out(b) for b in session.exec(select(Batch).order_by(Batch.id.desc())).all()]


@router.get("/{batch_id}", response_model=BatchOut)
def get_batch(batch_id: int, session: Session = Depends(get_session), _=Depends(require_admin)):
    return batch_out(_get(session, batch_id))


@router.post("", response_model=BatchOut)
def create_batch(body: BatchCreate, background: BackgroundTasks, session: Session = Depends(get_session),
                 admin: User = Depends(require_admin)):
    try:
        model = resolve_model(session, body.model_config_id, require_enabled=True)
    except PipelineError as e:
        raise HTTPException(400, str(e)) from e
    if body.ticket_ids:
        ids = sorted(set(session.exec(select(Ticket.id).where(Ticket.id.in_(body.ticket_ids))).all()))
    else:
        statuses = [s.value for s in (body.statuses or [])] or ["new"]
        ids = list(session.exec(select(Ticket.id).where(Ticket.status.in_(statuses)).order_by(Ticket.id)).all())
    ids = [i for i in ids if i is not None]
    if not ids:
        raise HTTPException(400, "No tickets match this selection")
    b = Batch(
        name=body.name or f"Batch {utcnow():%Y-%m-%d %H:%M} ({model.name})",
        model_config_id=model.id, model_name=model.name, status="queued", source="live",
        ticket_ids=ids, total=len(ids), created_by_id=admin.id, created_by_name=admin.full_name,
    )
    session.add(b)
    session.commit()
    session.refresh(b)
    background.add_task(run_batch, b.id)
    return batch_out(b)


@router.post("/upload", response_model=BatchOut)
async def upload_batch(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    model_config_id: int | None = Form(None),
    name: str | None = Form(None),
    run: bool = Form(True),
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
):
    try:
        model = resolve_model(session, model_config_id, require_enabled=run)
    except PipelineError as e:
        raise HTTPException(400, str(e)) from e
    content = await file.read()
    try:
        rows = parse_upload(file.filename or "", content)
    except UploadError as e:
        raise HTTPException(400, str(e)) from e

    emails = {r.customer_email for r in rows if r.customer_email}
    customers = {u.email: u.id for u in session.exec(select(User).where(User.email.in_(emails))).all()} if emails else {}
    tickets = []
    now = utcnow()
    for r in rows:
        tickets.append(Ticket(
            customer_id=customers.get(r.customer_email) if r.customer_email else None,
            channel=r.channel, text=r.text, status="new", is_synthetic=True, gold=r.gold,
            external_id=r.external_id, created_at=r.created_at or now, updated_at=now,
        ))
    session.add_all(tickets)
    session.flush()
    ids = [t.id for t in tickets]
    b = Batch(
        name=name or f"Upload {file.filename} ({len(ids)} tickets)",
        model_config_id=model.id, model_name=model.name, status="queued", source="upload",
        ticket_ids=ids, total=len(ids), created_by_id=admin.id, created_by_name=admin.full_name,
    )
    session.add(b)
    session.flush()
    for t in tickets:
        t.batch_id = b.id
        session.add(t)
    session.commit()
    session.refresh(b)
    if run:
        background.add_task(run_batch, b.id)
    return batch_out(b)


@router.get("/{batch_id}/tickets", response_model=Page[TicketListItem])
def batch_tickets(batch_id: int, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1),
                  session: Session = Depends(get_session), admin: User = Depends(require_admin)):
    page_size = min(page_size, 100)
    b = _get(session, batch_id)
    ids = list(b.ticket_ids or [])
    if not ids:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}
    stmt = select(Ticket).where(Ticket.id.in_(ids))
    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()
    rows = session.exec(stmt.order_by(Ticket.id).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": ticket_list_items(session, list(rows), admin), "total": int(total), "page": page, "page_size": page_size}
