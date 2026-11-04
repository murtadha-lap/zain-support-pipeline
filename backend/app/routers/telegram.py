from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..db import get_session
from ..deps import require_admin
from ..models import Setting
from ..schemas import TelegramOut, TelegramUpdate
from ..services import telegram as tg

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


@router.get("", response_model=TelegramOut)
def read_telegram(session: Session = Depends(get_session), _=Depends(require_admin)):
    return tg.public_config(session)


@router.put("", response_model=TelegramOut)
async def write_telegram(body: TelegramUpdate, session: Session = Depends(get_session), _=Depends(require_admin)):
    cfg = tg.get_tg_config(session)
    patch = body.model_dump(exclude_unset=True)

    if "bot_token" in patch:
        token = (patch["bot_token"] or "").strip()
        if token:
            try:
                me = await tg.get_me(token)
            except tg.TelegramError as e:
                raise HTTPException(400, f"Telegram rejected the token: {e}") from e
            if token != cfg.get("bot_token"):
                # update ids are per bot: an old offset could skip the new bot's messages
                row = session.get(Setting, tg.OFFSET_KEY)
                if row is not None:
                    session.delete(row)
            cfg.update(bot_token=token, bot_username=me.get("username"), bot_name=me.get("first_name"))
        else:
            cfg.update(bot_token=None, bot_username=None, bot_name=None, enabled=False)

    if "enabled" in patch and patch["enabled"] is not None:
        if patch["enabled"] and not cfg.get("bot_token"):
            raise HTTPException(400, "Save a bot token before turning the bot on")
        cfg["enabled"] = patch["enabled"]

    if cfg.get("enabled") and cfg.get("bot_token"):
        # polling and a webhook cannot both be active for one bot
        try:
            await tg.call_api(cfg["bot_token"], "deleteWebhook", {"drop_pending_updates": False})
        except tg.TelegramError as e:
            raise HTTPException(400, f"Could not switch the bot to polling: {e}") from e

    tg.save_tg_config(session, cfg)
    tg.poller.reload()
    return tg.public_config(session)
