import asyncio

from sqlmodel import select

from app.db import new_session
from app.models import Decision, Message, TelegramChat, Ticket, User
from app.services import telegram as tg
from app.services.pipeline import auto_triage_ticket

ADMIN = ("admin@zain.local", "Admin123!")
AGENT = ("agent@zain.local", "Agent123!")
TOKEN = "123456789:AAH-test-token-test-token-test-1234"


def update(update_id: int, text: str | None, chat_id: int = 555001, chat_type: str = "private") -> dict:
    msg = {"message_id": update_id, "date": 1793000000, "chat": {"id": chat_id, "type": chat_type},
           "from": {"id": chat_id, "first_name": "Ali", "last_name": "Hasan", "username": "ali_h"}}
    if text is not None:
        msg["text"] = text
    return {"update_id": update_id, "message": msg}


class FakeBot:
    """Stands in for the Bot API: records sent messages, idles getUpdates."""

    def __init__(self):
        self.sent: list[tuple[int, str]] = []
        self.calls: list[str] = []

    async def call_api(self, token, method, payload=None, timeout=15.0, client=None):
        self.calls.append(method)
        if method == "getMe":
            if token != TOKEN:
                raise tg.TelegramError("Unauthorized")
            return {"id": 123456789, "username": "zain_support_bot", "first_name": "Zain Support"}
        if method == "getUpdates":
            await asyncio.sleep(3600)
            return []
        if method == "sendMessage":
            self.sent.append((payload["chat_id"], payload["text"]))
        return True


def test_message_becomes_ticket_then_follow_up(db):
    with new_session() as s:
        assert tg.process_update(s, update(1, "/start")).reply == tg.WELCOME
        assert tg.process_update(s, update(2, "hi", chat_type="group")) is None
        assert tg.process_update(s, update(3, None)).reply == tg.TEXT_ONLY
        assert s.exec(select(TelegramChat)).first() is None  # nothing stored before a real message

        first = tg.process_update(s, update(4, "حولت ١٠٠ الف لاخوي TX12345678 وما وصلت"))
        t = s.get(Ticket, first.triage_ticket_id)
        assert t.channel == "telegram" and t.status == "new" and not t.is_synthetic
        user = s.get(User, t.customer_id)
        assert user.role == "customer" and user.full_name == "Ali Hasan" and user.email == "tg555001@telegram.local"
        assert first.chat_id == 555001 and f"ZS-{t.id:06d}" in first.reply

        follow = tg.process_update(s, update(5, "صار يومين"))
        assert follow.triage_ticket_id is None
        assert s.exec(select(Message).where(Message.ticket_id == t.id)).one().body_md == "صار يومين"
        assert len(s.exec(select(Ticket).where(Ticket.customer_id == user.id)).all()) == 1


def test_triaged_and_approved_reply_goes_back_to_chat(client, login, monkeypatch):
    bot = FakeBot()
    monkeypatch.setattr(tg, "call_api", bot.call_api)
    with new_session() as s:
        tid = tg.process_update(s, update(10, "ما اگدر اسجل دخول للتطبيق، يگول الرمز غلط")).triage_ticket_id
    asyncio.run(auto_triage_ticket(tid))
    with new_session() as s:
        t = s.get(Ticket, tid)
        assert t.status in ("routed", "escalated") and t.category

    admin = login(*ADMIN)
    # no token saved yet: the failure is recorded on the ticket
    assert admin.post(f"/api/tickets/{tid}/approve", json={"draft_md": "اهلا، نراجع حسابك"}).status_code == 200
    with new_session() as s:
        assert s.exec(select(Decision).where(Decision.ticket_id == tid, Decision.action == "telegram_failed")).first()

    assert admin.put("/api/telegram", json={"bot_token": TOKEN}).status_code == 200
    with new_session() as s:  # reopen so it can be approved again
        t = s.get(Ticket, tid)
        t.status = "routed"
        s.add(t)
        s.commit()
    assert admin.post(f"/api/tickets/{tid}/approve", json={"draft_md": "تم فتح حسابك"}).status_code == 200
    assert bot.sent == [(555001, "تم فتح حسابك")]
    with new_session() as s:
        assert s.exec(select(Decision).where(Decision.ticket_id == tid, Decision.action == "telegram_sent")).first()
    actions = [d["action"] for d in admin.get(f"/api/tickets/{tid}").json()["decisions"]]
    assert "telegram_sent" in actions and "telegram_failed" in actions


def test_settings_api(client, login, monkeypatch):
    bot = FakeBot()
    monkeypatch.setattr(tg, "call_api", bot.call_api)
    admin = login(*ADMIN)
    r = admin.get("/api/telegram").json()
    assert r["token_set"] is False and r["enabled"] is False and r["state"] == "stopped"
    assert login(*AGENT).get("/api/telegram").status_code == 403

    assert admin.put("/api/telegram", json={"enabled": True}).status_code == 400  # no token yet
    assert admin.put("/api/telegram", json={"bot_token": "not-a-token"}).status_code == 422
    bad = admin.put("/api/telegram", json={"bot_token": "123456789:" + "x" * 35})
    assert bad.status_code == 400 and "Unauthorized" in bad.text

    r = admin.put("/api/telegram", json={"bot_token": TOKEN, "enabled": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token_set"] and body["enabled"] and body["token_hint"] == "1234" and body["bot_username"] == "zain_support_bot"
    assert TOKEN not in r.text and "deleteWebhook" in bot.calls

    r = admin.put("/api/telegram", json={"bot_token": ""}).json()
    assert r["token_set"] is False and r["enabled"] is False and r["bot_username"] is None
