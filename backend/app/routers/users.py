from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlmodel import Session, select

from ..db import get_session
from ..deps import require_admin
from ..models import Team, User
from ..schemas import OkResponse, UserCreate, UserOut, UserUpdate
from ..security import hash_password
from ..serializers import user_out
from ..services.routing import team_names

router = APIRouter(prefix="/api/users", tags=["users"])


def _validate_team(session: Session, role: str, team_key: str | None) -> str | None:
    if role == "team_member":
        if not team_key:
            raise HTTPException(400, "team_key is required for role team_member")
        if session.get(Team, team_key) is None:
            raise HTTPException(400, f"Unknown team '{team_key}'")
        return team_key
    return None


@router.get("", response_model=list[UserOut])
def list_users(role: str | None = None, q: str | None = None, team_key: str | None = None,
               session: Session = Depends(get_session), _=Depends(require_admin)):
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if team_key:
        stmt = stmt.where(User.team_key == team_key)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.email.ilike(like), User.full_name.ilike(like)))
    teams = team_names(session)
    return [user_out(u, teams) for u in session.exec(stmt.order_by(User.id)).all()]


@router.post("", response_model=UserOut)
def create_user(body: UserCreate, session: Session = Depends(get_session), _=Depends(require_admin)):
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(422, "Invalid email")
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(409, "Email already exists")
    team_key = _validate_team(session, body.role.value, body.team_key)
    user = User(email=email, full_name=body.full_name.strip(), role=body.role.value, team_key=team_key,
                password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user_out(user, team_names(session))


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, session: Session = Depends(get_session), admin: User = Depends(require_admin)):
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    data = body.model_dump(exclude_unset=True)
    if user.id == admin.id and (data.get("is_active") is False or (data.get("role") and data["role"] != "admin")):
        raise HTTPException(400, "You cannot deactivate or demote yourself")
    if "full_name" in data and data["full_name"]:
        user.full_name = data["full_name"].strip()
    role = data["role"].value if data.get("role") else user.role
    team_key = data["team_key"] if "team_key" in data else user.team_key
    user.team_key = _validate_team(session, role, team_key)
    user.role = role
    if data.get("is_active") is not None:
        user.is_active = data["is_active"]
    if data.get("password"):
        user.password_hash = hash_password(data["password"])
    session.add(user)
    session.commit()
    session.refresh(user)
    return user_out(user, team_names(session))


@router.delete("/{user_id}", response_model=OkResponse)
def deactivate_user(user_id: int, session: Session = Depends(get_session), admin: User = Depends(require_admin)):
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "You cannot deactivate yourself")
    user.is_active = False
    session.add(user)
    session.commit()
    return {"ok": True}
