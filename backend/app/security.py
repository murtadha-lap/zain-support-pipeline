from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_config

COOKIE_NAME = "zsp_token"
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


def create_token(user_id: int, role: str) -> str:
    cfg = get_config()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=cfg.jwt_expire_days)).timestamp()),
    }
    return jwt.encode(payload, cfg.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, get_config().jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


def set_auth_cookie(response, token: str) -> None:
    cfg = get_config()
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=cfg.jwt_expire_days * 86400,
        httponly=True,
        samesite="lax",
        secure=cfg.cookie_secure,
        path="/",
    )


def clear_auth_cookie(response) -> None:
    cfg = get_config()
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=cfg.cookie_secure)
