from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from .db import get_session
from .enums import STAFF_ROLES
from .models import User
from .security import COOKIE_NAME, decode_token

SessionDep = Depends(get_session)


def _token_from_request(request: Request) -> str | None:
    auth = request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return request.cookies.get(COOKIE_NAME)


def get_current_user(request: Request, session: Session = Depends(get_session)) -> User:
    token = _token_from_request(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    try:
        user = session.get(User, int(payload["sub"]))
    except (TypeError, ValueError):
        user = None
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    return user


def require_roles(*roles: str) -> Callable[..., User]:
    allowed = set(roles)

    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed for your role")
        return user

    return dep


require_staff = require_roles(*STAFF_ROLES)
require_admin = require_roles("admin")
