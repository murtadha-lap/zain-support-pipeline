from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..deps import require_admin, require_staff
from ..enums import CATEGORIES
from ..models import RoutingRule, Team
from ..schemas import RoutingRuleIO
from ..services.routing import SEED_ROUTING

router = APIRouter(prefix="/api/routing", tags=["routing"])


def _all_rules(session: Session) -> list[dict]:
    rules = {r.category: r for r in session.exec(select(RoutingRule)).all()}
    out = []
    for c in CATEGORIES:
        r = rules.get(c)
        team, prio = (r.team_key, r.default_priority) if r else SEED_ROUTING[c]
        out.append({"category": c, "team_key": team, "default_priority": prio})
    return out


@router.get("", response_model=list[RoutingRuleIO])
def get_routing(session: Session = Depends(get_session), _=Depends(require_staff)):
    return _all_rules(session)


@router.put("", response_model=list[RoutingRuleIO])
def put_routing(body: list[RoutingRuleIO], session: Session = Depends(get_session), _=Depends(require_admin)):
    cats = [r.category.value for r in body]
    if sorted(cats) != sorted(CATEGORIES):
        raise HTTPException(400, "Provide exactly one rule for each of the 9 categories")
    teams = {t.key for t in session.exec(select(Team)).all()}
    for r in body:
        if r.team_key not in teams:
            raise HTTPException(400, f"Unknown team '{r.team_key}'")
    for r in body:
        row = session.get(RoutingRule, r.category.value)
        if row is None:
            row = RoutingRule(category=r.category.value, team_key=r.team_key, default_priority=r.default_priority.value)
        else:
            row.team_key, row.default_priority = r.team_key, r.default_priority.value
        session.add(row)
    session.commit()
    return _all_rules(session)
