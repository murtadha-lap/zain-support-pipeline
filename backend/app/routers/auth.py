from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import LoginIn, OkResponse, RegisterIn, UserOut
from ..security import clear_auth_cookie, create_token, hash_password, set_auth_cookie, verify_password
from ..serializers import user_out_s

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, response: Response, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email.strip().lower())).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(403, "Account is deactivated")
    set_auth_cookie(response, create_token(user.id, user.role))
    return user_out_s(session, user)


@router.post("/register", response_model=UserOut)
def register(body: RegisterIn, response: Response, session: Session = Depends(get_session)):
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(422, "Invalid email")
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(409, "Email already registered")
    user = User(email=email, full_name=body.full_name.strip(), role="customer", password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    set_auth_cookie(response, create_token(user.id, user.role))
    return user_out_s(session, user)


@router.post("/logout", response_model=OkResponse)
def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return user_out_s(session, user)
