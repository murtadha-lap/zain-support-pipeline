"""Telegram bot channel.

Incoming: private text messages to the bot become `telegram` tickets for a customer account created per
chat, then go through the normal pipeline (auto-triage -> checks -> route / escalate). A message sent while
the customer still has an open Telegram ticket is added to that ticket as a follow-up.

Outgoing: when staff approve a reply on a Telegram ticket, it is sent to the chat (send_ticket_reply).

Transport is long polling (getUpdates), so it works on a machine with no public URL. Telegram allows one
getUpdates consumer per bot token: run a single backend process per bot.

The bot token is stored in the settings table (key "telegram") and never returned by the API.
"""
from __future__ import annotations

import asyncio
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import new_session
from ..logging_utils import get_logger, mask_pii
from ..models import Decision, Message, Setting, TelegramChat, Ticket, User, utcnow
from ..security import hash_password
from .pipeline import auto_triage_ticket, ticket_ref
from .routing import get_settings

log = get_logger("telegram")

API_BASE = "https://api.telegram.org"
CONFIG_KEY = "telegram"
OFFSET_KEY = "telegram_offset"
POLL_TIMEOUT_S = 25
MAX_TICKET_TEXT = 4000
MAX_MESSAGE = 4096  # Telegram's limit per message
CLOSED_STATUSES = ("resolved", "closed")

WELCOME = "أهلاً بيك بخدمة دعم المحفظة. اكتب مشكلتك بالتفصيل (رقم العملية، المبلغ، التاريخ) وفريق الدعم راح يرد عليك هنا."
RECEIVED = "استلمنا طلبك، رقم الطلب {ref}. فريق الدعم راح يراجعه ويرد عليك هنا. لا ترسل الرمز السري (PIN) أو رمز التحقق لأي أحد."
FOLLOW_UP = "وصلت رسالتك وأضفناها للطلب {ref}."
TEXT_ONLY = "حالياً نستقبل الرسائل النصية فقط. اكتب مشكلتك بالتفصيل رجاءً."


class TelegramError(Exception):
    """Bot API call failed. The message never contains the token."""


# --------------------------------------------------------------------------- config

def get_tg_config(session: Session) -> dict:
    cfg = {"enabled": False, "bot_token": None, "bot_username": None, "bot_name": None}
    row = session.get(Setting, CONFIG_KEY)
    if row is not None and isinstance(row.value, dict):
        cfg.update(row.value)
    return cfg


def save_tg_config(session: Session, cfg: dict) -> None:
    row = session.get(Setting, CONFIG_KEY)
    if row is None:
        session.add(Setting(key=CONFIG_KEY, value=dict(cfg)))
    else:
        row.value = dict(cfg)  # new object so SQLAlchemy sees the JSON change
        session.add(row)
    session.commit()


def public_config(session: Session) -> dict:
    cfg = get_tg_config(session)
    token = cfg.get("bot_token")
    chats = session.exec(select(func.count()).select_from(TelegramChat)).one()
    return {
        "enabled": bool(cfg.get("enabled")),
        "token_set": bool(token),
        "token_hint": token[-4:] if token else None,
        "bot_username": cfg.get("bot_username"),
        "bot_name": cfg.get("bot_name"),
        "chats": int(chats),
        **poller.status(),
    }


# --------------------------------------------------------------------------- Bot API

async def call_api(token: str, method: str, payload: dict | None = None, timeout: float = 15.0,
                   client: httpx.AsyncClient | None = None):
    url = f"{API_BASE}/bot{token}/{method}"
    own = client is None
    c = client or httpx.AsyncClient()
    try:
        r = await c.post(url, json=payload or {}, timeout=timeout)
    except httpx.HTTPError as e:
        # httpx messages can include the URL, which contains the token
        raise TelegramError(f"Could not reach Telegram ({type(e).__name__})") from None
    finally:
        if own:
            await c.aclose()
    try:
        data = r.json()
    except ValueError:
        raise TelegramError(f"Telegram returned HTTP {r.status_code}") from None
    if not data.get("ok"):
        raise TelegramError(str(data.get("description") or f"Telegram returned HTTP {r.status_code}").replace(token, "***"))
    return data.get("result")


async def get_me(token: str) -> dict:
    return await call_api(token, "getMe")


async def send_message(token: str, chat_id: int, text: str) -> None:
    text = text.strip() or "…"
    for i in range(0, len(text), MAX_MESSAGE):
        await call_api(token, "sendMessage", {"chat_id": chat_id, "text": text[i:i + MAX_MESSAGE]})


# --------------------------------------------------------------------------- incoming

@dataclass
class Incoming:
    chat_id: int
    reply: str | None
    triage_ticket_id: int | None = None


def customer_for_chat(session: Session, chat_id: int, sender: dict) -> User:
    link = session.get(TelegramChat, chat_id)
    if link is not None:
        user = session.get(User, link.user_id)
        if user is not None:
            return user
    email = f"tg{chat_id}@telegram.local"
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        name = " ".join(p for p in (sender.get("first_name"), sender.get("last_name")) if p) or sender.get("username") or f"Telegram {chat_id}"
        # random password: these accounts exist for ticket ownership and cannot sign in
        user = User(email=email, full_name=name[:255], role="customer", password_hash=hash_password(secrets.token_urlsafe(24)))
        session.add(user)
        session.flush()
    if link is None:
        session.add(TelegramChat(chat_id=chat_id, user_id=user.id, username=sender.get("username")))
    else:
        link.user_id = user.id
        session.add(link)
    session.commit()
    session.refresh(user)
    return user


def process_update(session: Session, update: dict) -> Incoming | None:
    """Turn one Telegram update into a ticket or follow-up. Returns what to answer, or None to ignore."""
    msg = update.get("message")
    if not isinstance(msg, dict):
        return None
    chat = msg.get("chat") or {}
    if chat.get("type") != "private" or "id" not in chat:
        return None  # groups and channels are not support conversations
    chat_id = int(chat["id"])
    text = (msg.get("text") or msg.get("caption") or "").strip()
    if text.split(maxsplit=1)[:1] == ["/start"]:
        return Incoming(chat_id, WELCOME)
    if not text:
        return Incoming(chat_id, TEXT_ONLY)
    text = text[:MAX_TICKET_TEXT]
    user = customer_for_chat(session, chat_id, msg.get("from") or {})

    open_ticket = session.exec(
        select(Ticket)
        .where(Ticket.customer_id == user.id, Ticket.channel == "telegram", Ticket.status.not_in(CLOSED_STATUSES))
        .order_by(Ticket.id.desc())
    ).first()
    if open_ticket is not None:
        session.add(Message(ticket_id=open_ticket.id, author_type="customer", author_id=user.id,
                            author_name=user.full_name, body_md=text))
        open_ticket.updated_at = utcnow()
        session.add(open_ticket)
        session.commit()
        return Incoming(chat_id, FOLLOW_UP.format(ref=ticket_ref(open_ticket.id)))

    sent_at = msg.get("date")
    created_at = datetime.fromtimestamp(sent_at, timezone.utc) if isinstance(sent_at, int) else utcnow()
    t = Ticket(customer_id=user.id, channel="telegram", text=text, status="new", is_synthetic=False, created_at=created_at)
    session.add(t)
    session.commit()
    session.refresh(t)
    triage = t.id if get_settings(session)["auto_triage"] else None
    return Incoming(chat_id, RECEIVED.format(ref=ticket_ref(t.id)), triage)


# --------------------------------------------------------------------------- outgoing

async def send_ticket_reply(ticket_id: int, text: str) -> None:
    """Deliver an approved reply to the ticket's Telegram chat. Records the outcome on the ticket. Never raises."""
    with new_session() as s:
        t = s.get(Ticket, ticket_id)
        if t is None or t.channel != "telegram" or t.customer_id is None:
            return
        link = s.exec(select(TelegramChat).where(TelegramChat.user_id == t.customer_id)).first()
        if link is None:
            return  # a portal ticket that picked "telegram" as channel: nothing to deliver to
        chat_id = link.chat_id
        token = get_tg_config(s).get("bot_token")
    error = None
    if not token:
        error = "No Telegram bot token is saved"
    else:
        try:
            await send_message(token, chat_id, text)
        except TelegramError as e:
            error = str(e)
    with new_session() as s:
        s.add(Decision(ticket_id=ticket_id, user_name="system", action="telegram_failed" if error else "telegram_sent",
                       note=f"Telegram delivery failed: {error}" if error else ""))
        s.commit()
    if error:
        log.warning("telegram reply for %s not delivered: %s", ticket_ref(ticket_id), error)


# --------------------------------------------------------------------------- poller

class TelegramPoller:
    """Background long-polling loop. reload() restarts it after the config changes."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._jobs: set[asyncio.Task] = set()
        self.state = "stopped"
        self.last_error: str | None = None
        self.last_update_at: datetime | None = None

    def status(self) -> dict:
        return {"state": self.state, "last_error": self.last_error, "last_update_at": self.last_update_at}

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="telegram-poller")

    def reload(self) -> None:
        if self._task is not None and not self._task.done():
            self._task.cancel()
        self._task = None
        self.last_error = None
        self.start()

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        self.state = "stopped"

    def _spawn(self, coro) -> None:
        job = asyncio.create_task(coro)
        self._jobs.add(job)
        job.add_done_callback(self._jobs.discard)

    async def _run(self) -> None:
        backoff = 1.0
        async with httpx.AsyncClient() as client:
            while True:
                with new_session() as s:
                    cfg = get_tg_config(s)
                    row = s.get(Setting, OFFSET_KEY)
                    offset = row.value if row is not None else None
                token = cfg.get("bot_token")
                if not (cfg.get("enabled") and token):
                    self.state = "stopped"
                    return
                self.state = "running" if self.last_error is None else "error"
                try:
                    updates = await call_api(
                        token, "getUpdates",
                        {"offset": offset, "timeout": POLL_TIMEOUT_S, "allowed_updates": ["message"]},
                        timeout=POLL_TIMEOUT_S + 10, client=client,
                    )
                except TelegramError as e:
                    self.state, self.last_error = "error", str(e)
                    log.warning("telegram polling failed: %s (retry in %.0fs)", e, backoff)
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 60)
                    continue
                backoff, self.last_error, self.state = 1.0, None, "running"
                for update in updates or []:
                    await self._handle(token, update, client)
                    self._save_offset(int(update["update_id"]) + 1)

    def _save_offset(self, offset: int) -> None:
        with new_session() as s:
            row = s.get(Setting, OFFSET_KEY)
            if row is None:
                s.add(Setting(key=OFFSET_KEY, value=offset))
            else:
                row.value = offset
                s.add(row)
            s.commit()

    async def _handle(self, token: str, update: dict, client: httpx.AsyncClient) -> None:
        try:
            with new_session() as s:
                incoming = process_update(s, update)
        except Exception as e:  # one bad update must not stop the loop
            log.exception(mask_pii(f"telegram update {update.get('update_id')} failed: {e}"))
            return
        self.last_update_at = utcnow()
        if incoming is None:
            return
        if incoming.reply:
            try:
                await call_api(token, "sendMessage", {"chat_id": incoming.chat_id, "text": incoming.reply}, client=client)
            except TelegramError as e:
                log.warning("telegram acknowledgement not sent: %s", e)
        if incoming.triage_ticket_id is not None:
            self._spawn(auto_triage_ticket(incoming.triage_ticket_id))


poller = TelegramPoller()
