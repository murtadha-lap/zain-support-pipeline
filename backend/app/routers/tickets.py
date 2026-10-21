import re
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user, require_roles, require_staff
from ..enums import STAFF_ROLES
from ..models import Decision, Message, Team, Ticket, User, utcnow
from ..schemas import (
    ApproveIn,
    AssignIn,
    CloseIn,
    DraftIn,
    EscalateIn,
    LabelsIn,
    MessageCreate,
    Page,
    RetriageIn,
    RouteIn,
    TicketCreate,
    TicketDetail,
    TicketListItem,
)
from ..serializers import fields_out, ticket_detail, ticket_list_items
from ..services.pipeline import PipelineError, as_utc, auto_triage_ticket, triage_ticket
from ..services.routing import get_settings, route_for

router = APIRouter(prefix="/api/tickets", tags=["tickets"])

_REF_RE = re.compile(r"^\s*(?:ZS-?)?0*(\d{1,9})\s*$", re.IGNORECASE)


# --------------------------------------------------------------------------- helpers

def scope_filter(stmt, user: User):
    if user.role == "customer":
        return stmt.where(Ticket.customer_id == user.id)
    if user.role == "team_member":
        return stmt.where(Ticket.team_key == (user.team_key or "__none__"))
    return stmt


def can_view(user: User, t: Ticket) -> bool:
    if user.role == "customer":
        return t.customer_id == user.id
    if user.role == "team_member":
        return bool(user.team_key) and t.team_key == user.team_key
    return True


def load_ticket(session: Session, ticket_id: int, user: User) -> Ticket:
    t = session.get(Ticket, ticket_id)
    if t is None or not can_view(user, t):
        raise HTTPException(404, "Ticket not found")
    return t


def add_decision(session: Session, t: Ticket, user: User | None, action: str, before=None, after=None,
                 note: str = "", draft_edited: bool | None = None) -> None:
    session.add(Decision(
        ticket_id=t.id, user_id=user.id if user else None, user_name=user.full_name if user else "system",
        user_role=user.role if user else None, action=action, before=before, after=after,
        draft_edited=draft_edited, note=note or "",
    ))


def _touch_and_detail(session: Session, t: Ticket, user: User) -> dict:
    t.updated_at = utcnow()
    session.add(t)
    session.commit()
    session.refresh(t)
    return ticket_detail(session, t, user)


# --------------------------------------------------------------------------- create / list / read

@router.post("", response_model=TicketDetail)
def create_ticket(body: TicketCreate, background: BackgroundTasks, session: Session = Depends(get_session),
                  user: User = Depends(require_roles("customer"))):
    t = Ticket(customer_id=user.id, channel=body.channel.value, text=body.text.strip(), status="new", is_synthetic=False)
    session.add(t)
    session.commit()
    session.refresh(t)
    if get_settings(session)["auto_triage"]:
        background.add_task(auto_triage_ticket, t.id)
    return ticket_detail(session, t, user)


@router.get("", response_model=Page[TicketListItem])
def list_tickets(
    status: str | None = None,
    category: str | None = None,
    priority: str | None = None,
    team_key: str | None = None,
    escalation_reason: str | None = None,
    assignee: str | None = None,
    q: str | None = None,
    is_synthetic: bool | None = None,
    sort: str = "-created_at",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    page_size = min(page_size, 100)
    stmt = scope_filter(select(Ticket), user)
    if status:
        stmt = stmt.where(Ticket.status.in_([s.strip() for s in status.split(",") if s.strip()]))
    if category:
        stmt = stmt.where(Ticket.category.in_([s.strip() for s in category.split(",") if s.strip()]))
    if priority:
        stmt = stmt.where(Ticket.priority.in_([s.strip() for s in priority.split(",") if s.strip()]))
    if team_key:
        stmt = stmt.where(Ticket.team_key.in_([s.strip() for s in team_key.split(",") if s.strip()]))
    if escalation_reason:
        stmt = stmt.where(Ticket.escalation_reason.in_([s.strip() for s in escalation_reason.split(",") if s.strip()]))
    if assignee:
        if assignee == "me":
            stmt = stmt.where(Ticket.assignee_id == user.id)
        elif assignee in ("none", "null"):
            stmt = stmt.where(Ticket.assignee_id.is_(None))
        elif assignee.isdigit():
            stmt = stmt.where(Ticket.assignee_id == int(assignee))
        else:
            raise HTTPException(400, "assignee must be 'me' or a user id")
    if is_synthetic is not None:
        stmt = stmt.where(Ticket.is_synthetic == is_synthetic)
    if q and q.strip():
        m = _REF_RE.match(q)
        like = f"%{q.strip()}%"
        conds = [Ticket.text.ilike(like)]
        if m and (q.strip().upper().startswith("ZS") or q.strip().isdigit()):
            conds.append(Ticket.id == int(m.group(1)))
        stmt = stmt.where(or_(*conds))

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()

    prio_rank = case((Ticket.priority == "high", 0), (Ticket.priority == "medium", 1), (Ticket.priority == "low", 2), else_=3)
    if sort == "created_at":
        order = [Ticket.created_at.asc(), Ticket.id.asc()]
    elif sort == "-priority":
        order = [prio_rank.asc(), Ticket.created_at.desc(), Ticket.id.desc()]
    elif sort == "priority":
        order = [prio_rank.desc(), Ticket.created_at.desc(), Ticket.id.desc()]
    elif sort == "confidence":
        order = [case((Ticket.confidence.is_(None), 1), else_=0).asc(), Ticket.confidence.asc(), Ticket.id.desc()]
    elif sort == "-confidence":
        order = [case((Ticket.confidence.is_(None), 1), else_=0).asc(), Ticket.confidence.desc(), Ticket.id.desc()]
    elif sort == "-updated_at":
        order = [Ticket.updated_at.desc(), Ticket.id.desc()]
    else:
        order = [Ticket.created_at.desc(), Ticket.id.desc()]
    rows = session.exec(stmt.order_by(*order).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": ticket_list_items(session, list(rows), user), "total": int(total), "page": page, "page_size": page_size}


@router.get("/{ticket_id}", response_model=TicketDetail)
def get_ticket(ticket_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return ticket_detail(session, load_ticket(session, ticket_id, user), user)


# --------------------------------------------------------------------------- customer

@router.post("/{ticket_id}/messages", response_model=TicketDetail)
def add_message(ticket_id: int, body: MessageCreate, background: BackgroundTasks,
                session: Session = Depends(get_session), user: User = Depends(require_roles("customer"))):
    t = load_ticket(session, ticket_id, user)
    session.add(Message(ticket_id=t.id, author_type="customer", author_id=user.id, author_name=user.full_name,
                        body_md=body.body.strip()))
    retriage = False
    if t.status in ("resolved", "closed"):
        before = {"status": t.status}
        t.status = "routed" if t.team_key else "new"
        t.resolved_at = None
        add_decision(session, t, user, "reopen", before, {"status": t.status}, note="Customer replied")
        retriage = t.status == "new"
    detail = _touch_and_detail(session, t, user)
    if retriage and get_settings(session)["auto_triage"]:
        background.add_task(auto_triage_ticket, t.id)
    return detail


# --------------------------------------------------------------------------- staff actions

@router.put("/{ticket_id}/draft", response_model=TicketDetail)
def save_draft(ticket_id: int, body: DraftIn, session: Session = Depends(get_session), user: User = Depends(require_staff)):
    t = load_ticket(session, ticket_id, user)
    t.draft_md = body.draft_md
    since = utcnow() - timedelta(minutes=1)
    recent = session.exec(
        select(Decision).where(Decision.ticket_id == t.id, Decision.user_id == user.id, Decision.action == "draft_saved")
        .order_by(Decision.id.desc())
    ).first()
    if recent is None or as_utc(recent.created_at) < as_utc(since):
        add_decision(session, t, user, "draft_saved")
    return _touch_and_detail(session, t, user)


@router.patch("/{ticket_id}/labels", response_model=TicketDetail)
def relabel(ticket_id: int, body: LabelsIn, session: Session = Depends(get_session),
            user: User = Depends(require_roles("agent", "admin", "team_member"))):
    t = load_ticket(session, ticket_id, user)
    sent = body.model_fields_set
    if user.role == "team_member" and "category" in sent and body.category and body.category.value != t.category:
        raise HTTPException(403, "Team members cannot change the category")
    before, after = {}, {}
    if "category" in sent and body.category is not None and body.category.value != t.category:
        before["category"], after["category"] = t.category, body.category.value
        t.category = body.category.value
        if t.status == "routed":
            new_team, _ = route_for(session, t.category)
            if new_team and new_team != t.team_key:
                before["team_key"], after["team_key"] = t.team_key, new_team
                t.team_key = new_team
    if "secondary_category" in sent:
        new_sec = body.secondary_category.value if body.secondary_category else None
        if new_sec != t.secondary_category:
            before["secondary_category"], after["secondary_category"] = t.secondary_category, new_sec
            t.secondary_category = new_sec
    if "priority" in sent and body.priority is not None and body.priority.value != t.priority:
        before["priority"], after["priority"] = t.priority, body.priority.value
        t.priority = body.priority.value
    if "fields" in sent and body.fields is not None:
        cur = fields_out(t.fields)
        new = dict(cur)
        new.update(body.fields.model_dump(exclude_unset=True))
        if new != cur:
            before["fields"], after["fields"] = cur, new
            t.fields = new
    if not after and not body.note:
        return ticket_detail(session, t, user)
    add_decision(session, t, user, "relabel", before or None, after or None, note=body.note)
    return _touch_and_detail(session, t, user)


@router.post("/{ticket_id}/route", response_model=TicketDetail)
def route_ticket(ticket_id: int, body: RouteIn, session: Session = Depends(get_session),
                 user: User = Depends(require_roles("agent", "admin"))):
    t = load_ticket(session, ticket_id, user)
    team_key = body.team_key
    default_team, default_prio = route_for(session, t.category)
    if not team_key:
        team_key = default_team
    if not team_key:
        raise HTTPException(400, "Ticket has no category; pass team_key")
    if session.get(Team, team_key) is None:
        raise HTTPException(400, f"Unknown team '{team_key}'")
    before = {"status": t.status, "team_key": t.team_key, "escalation_reason": t.escalation_reason}
    t.status, t.team_key, t.escalation_reason = "routed", team_key, None
    if not t.priority and default_prio:
        t.priority = default_prio
    add_decision(session, t, user, "route", before, {"status": "routed", "team_key": team_key}, note=body.note)
    return _touch_and_detail(session, t, user)


@router.post("/{ticket_id}/approve", response_model=TicketDetail)
def approve(ticket_id: int, body: ApproveIn, session: Session = Depends(get_session),
            user: User = Depends(require_roles("agent", "admin", "team_member"))):
    t = load_ticket(session, ticket_id, user)
    if t.status in ("new", "processing"):
        raise HTTPException(400, f"Ticket is '{t.status}'; wait for triage before approving")
    draft = (body.draft_md or "").strip()
    if not draft:
        raise HTTPException(400, "Draft is empty")
    edited = draft != (t.ai_draft or "").strip()
    before = {"status": t.status}
    session.add(Message(ticket_id=t.id, author_type="staff", author_id=user.id, author_name=user.full_name, body_md=draft))
    t.draft_md = draft
    t.status = "resolved"
    t.resolved_at = utcnow()
    add_decision(session, t, user, "approve", before, {"status": "resolved"}, note=body.note, draft_edited=edited)
    return _touch_and_detail(session, t, user)


@router.post("/{ticket_id}/escalate", response_model=TicketDetail)
def escalate(ticket_id: int, body: EscalateIn, session: Session = Depends(get_session),
             user: User = Depends(require_roles("team_member", "admin"))):
    t = load_ticket(session, ticket_id, user)
    before = {"status": t.status, "escalation_reason": t.escalation_reason}
    t.status, t.escalation_reason, t.escalation_note = "escalated", "manual", body.note
    add_decision(session, t, user, "escalate", before, {"status": "escalated", "escalation_reason": "manual"}, note=body.note)
    return _touch_and_detail(session, t, user)


@router.post("/{ticket_id}/close", response_model=TicketDetail)
def close(ticket_id: int, body: CloseIn | None = None, session: Session = Depends(get_session),
          user: User = Depends(require_staff)):
    t = load_ticket(session, ticket_id, user)
    before = {"status": t.status}
    t.status = "closed"
    add_decision(session, t, user, "close", before, {"status": "closed"}, note=body.note if body else "")
    return _touch_and_detail(session, t, user)


@router.post("/{ticket_id}/assign", response_model=TicketDetail)
def assign(ticket_id: int, body: AssignIn, session: Session = Depends(get_session), user: User = Depends(require_staff)):
    t = load_ticket(session, ticket_id, user)
    target = body.user_id
    if target is not None:
        if user.role != "admin" and target != user.id:
            raise HTTPException(403, "You may only assign tickets to yourself")
        assignee = session.get(User, target)
        if assignee is None or not assignee.is_active or assignee.role not in STAFF_ROLES:
            raise HTTPException(400, "Assignee must be an active staff user")
    elif user.role != "admin" and t.assignee_id not in (None, user.id):
        raise HTTPException(403, "You may only unassign yourself")
    before = {"assignee_id": t.assignee_id}
    t.assignee_id = target
    add_decision(session, t, user, "assign", before, {"assignee_id": target})
    return _touch_and_detail(session, t, user)


@router.post("/{ticket_id}/retriage", response_model=TicketDetail)
async def retriage(ticket_id: int, body: RetriageIn | None = None, session: Session = Depends(get_session),
                   user: User = Depends(require_roles("agent", "admin"))):
    t = load_ticket(session, ticket_id, user)
    if t.status == "processing":
        raise HTTPException(409, "Ticket is already being processed")
    before = {"status": t.status, "category": t.category, "team_key": t.team_key, "confidence": t.confidence}
    session.rollback()  # no open write transaction while the pipeline writes (SQLite)
    try:
        await triage_ticket(ticket_id, body.model_config_id if body else None)
    except PipelineError as e:
        raise HTTPException(400, str(e)) from e
    session.expire_all()
    t = session.get(Ticket, ticket_id)
    after = {"status": t.status, "category": t.category, "team_key": t.team_key, "confidence": t.confidence}
    add_decision(session, t, user, "retriage", before, after)
    session.commit()
    session.refresh(t)
    return ticket_detail(session, t, user)
