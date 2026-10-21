from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..db import get_session
from ..deps import require_admin, require_staff
from ..schemas import SettingsOut, SettingsUpdate
from ..services.pipeline import PROMPTS_DIR
from ..services.routing import get_settings, update_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def read_settings(session: Session = Depends(get_session), _=Depends(require_staff)):
    return get_settings(session)


@router.put("", response_model=SettingsOut)
def write_settings(body: SettingsUpdate, session: Session = Depends(get_session), _=Depends(require_admin)):
    patch = body.model_dump(exclude_unset=True)
    pv = patch.get("prompt_version")
    if pv and not (PROMPTS_DIR / f"{pv}.md").is_file():
        raise HTTPException(400, f"Prompt version '{pv}' not found (expected backend/app/prompts/{pv}.md)")
    return update_settings(session, patch)
