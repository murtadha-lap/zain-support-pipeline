from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


class AppConfig(BaseSettings):
    """Process configuration from environment / backend/.env (runtime settings live in the DB)."""

    model_config = SettingsConfigDict(env_file=str(BACKEND_DIR / ".env"), extra="ignore")

    database_url: str = "sqlite:///./zsp.db"
    jwt_secret: str = "dev-only-change-me-please-32-bytes-min"
    jwt_expire_days: int = 7
    cookie_secure: bool = False
    frontend_origin: str = "http://localhost:3000"
    log_level: str = "INFO"
    data_dir: str = str(REPO_DIR / "data")


@lru_cache
def get_config() -> AppConfig:
    return AppConfig()
