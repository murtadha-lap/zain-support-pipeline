from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import select

from .config import get_config
from .db import init_db, new_session
from .logging_utils import get_logger, setup_logging
from .models import Batch, Ticket, utcnow
from .routers import auth, batches, export, health, meta, models, routing, settings, stats, teams, tickets, users


def _startup() -> None:
    from .seed import seed_base

    init_db()
    with new_session() as s:
        seed_base(s, only_if_empty=True)
        # recover work interrupted by a restart
        for t in s.exec(select(Ticket).where(Ticket.status == "processing")).all():
            t.status = "new"
            s.add(t)
        for b in s.exec(select(Batch).where(Batch.status == "running")).all():
            b.status, b.error, b.finished_at = "failed", "Server restarted while the batch was running", utcnow()
            s.add(b)
        s.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_config()
    setup_logging(cfg.log_level)
    _startup()
    get_logger("main").info("backend started (db=%s)" % cfg.database_url.split("@")[-1])
    yield


app = FastAPI(
    title="Zain support pipeline API",
    version="1.0.0",
    description="Support-ticket triage for an Iraqi mobile wallet. Contract: docs/api-contract.md.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_config().frontend_origin.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, meta, users, teams, routing, models, settings, stats, tickets, batches, export, health):
    app.include_router(module.router)
