from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlmodel import Session

from ..db import get_session
from ..deps import require_admin
from ..services.export import corrections_lines, tickets_csv

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/corrections.jsonl")
def export_corrections(session: Session = Depends(get_session), _=Depends(require_admin)):
    lines = corrections_lines(session)
    body = "\n".join(lines) + ("\n" if lines else "")
    return Response(
        content=body.encode("utf-8"),
        media_type="application/x-ndjson; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="corrections.jsonl"'},
    )


@router.get("/tickets.csv")
def export_tickets_csv(session: Session = Depends(get_session), _=Depends(require_admin)):
    return Response(
        content=tickets_csv(session).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="tickets.csv"'},
    )
