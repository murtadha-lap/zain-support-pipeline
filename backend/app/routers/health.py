import asyncio

import httpx
from fastapi import APIRouter
from sqlalchemy import text
from sqlmodel import select

from ..db import new_session
from ..models import ModelConfig
from ..schemas import HealthOut

router = APIRouter(prefix="/api", tags=["health"])


async def _probe(base_url: str | None) -> bool:
    if not base_url:
        return False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(base_url.rstrip("/") + "/models")
            return r.status_code < 500
    except Exception:
        return False


@router.get("/health", response_model=HealthOut)
async def health():
    db_status = "ok"
    models = []
    try:
        with new_session() as s:
            s.exec(text("SELECT 1"))
            models = [(m.id, m.name, m.provider, m.base_url) for m in s.exec(select(ModelConfig).order_by(ModelConfig.id)).all()]
    except Exception as e:  # pragma: no cover
        db_status = f"error: {type(e).__name__}"
    probes = await asyncio.gather(*[_probe(b) if p == "vllm" else asyncio.sleep(0, result=None) for (_, _, p, b) in models])
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        "models": [{"id": i, "name": n, "provider": p, "reachable": r} for (i, n, p, _), r in zip(models, probes)],
    }
