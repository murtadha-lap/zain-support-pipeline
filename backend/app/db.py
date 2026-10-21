from collections.abc import Iterator

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from .config import get_config

_engine: Engine | None = None


def _make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        eng = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})

        @event.listens_for(eng, "connect")
        def _sqlite_pragmas(dbapi_conn, _rec):  # pragma: no cover - trivial
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

        return eng
    return create_engine(url, pool_pre_ping=True)


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _make_engine(get_config().database_url)
    return _engine


def configure_engine(url: str) -> Engine:
    """Swap the engine (tests)."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = _make_engine(url)
    return _engine


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)

    SQLModel.metadata.create_all(get_engine())


def drop_db() -> None:
    from . import models  # noqa: F401

    SQLModel.metadata.drop_all(get_engine())


def new_session() -> Session:
    return Session(get_engine(), expire_on_commit=False)


def get_session() -> Iterator[Session]:
    with new_session() as session:
        yield session
