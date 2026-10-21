from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..deps import require_admin, require_staff
from ..models import RoutingRule, Team, Ticket, User
from ..schemas import OkResponse, TeamCreate, TeamOut, TeamUpdate

router = APIRouter(prefix="/api/teams", tags=["teams"])

OPEN_STATUSES = ("new", "processing", "routed", "escalated")


def _counts(session: Session) -> tuple[dict, dict]:
    members = dict(session.exec(
        select(User.team_key, func.count(User.id)).where(User.is_active == True, User.team_key.is_not(None))  # noqa: E712
        .group_by(User.team_key)
    ).all())
    open_t = dict(session.exec(
        select(Ticket.team_key, func.count(Ticket.id)).where(Ticket.status.in_(OPEN_STATUSES), Ticket.team_key.is_not(None))
        .group_by(Ticket.team_key)
    ).all())
    return members, open_t


def team_out(t: Team, members: dict, open_t: dict) -> dict:
    return {
        "key": t.key, "name": t.name, "name_ar": t.name_ar, "description": t.description or "", "color": t.color,
        "member_count": int(members.get(t.key, 0)), "open_tickets": int(open_t.get(t.key, 0)),
    }


@router.get("", response_model=list[TeamOut])
def list_teams(session: Session = Depends(get_session), _=Depends(require_staff)):
    members, open_t = _counts(session)
    return [team_out(t, members, open_t) for t in session.exec(select(Team).order_by(Team.created_at, Team.key)).all()]


@router.post("", response_model=TeamOut)
def create_team(body: TeamCreate, session: Session = Depends(get_session), _=Depends(require_admin)):
    if session.get(Team, body.key):
        raise HTTPException(409, "Team key already exists")
    t = Team(**body.model_dump())
    session.add(t)
    session.commit()
    members, open_t = _counts(session)
    return team_out(t, members, open_t)


@router.patch("/{key}", response_model=TeamOut)
def update_team(key: str, body: TeamUpdate, session: Session = Depends(get_session), _=Depends(require_admin)):
    t = session.get(Team, key)
    if t is None:
        raise HTTPException(404, "Team not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(t, k, v)
    session.add(t)
    session.commit()
    members, open_t = _counts(session)
    return team_out(t, members, open_t)


@router.delete("/{key}", response_model=OkResponse)
def delete_team(key: str, session: Session = Depends(get_session), _=Depends(require_admin)):
    t = session.get(Team, key)
    if t is None:
        raise HTTPException(404, "Team not found")
    if session.exec(select(RoutingRule).where(RoutingRule.team_key == key)).first():
        raise HTTPException(409, "A routing rule still uses this team")
    if session.exec(select(User).where(User.team_key == key)).first():
        raise HTTPException(409, "A user still belongs to this team")
    session.delete(t)
    session.commit()
    return {"ok": True}
