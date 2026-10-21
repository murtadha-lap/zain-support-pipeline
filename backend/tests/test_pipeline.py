import json

import pytest
from sqlmodel import select

from app.db import new_session
from app.llm.base import LLMResult
from app.models import ModelConfig, Ticket, Triage
from app.services import pipeline
from app.services.pipeline import CloudNotAllowed, triage_ticket

CLEAR = "السلام عليكم، حولت ربع مليون لأخوية البارحة وطلعتلي العملية ناجحة بس هو للحين ما وصلته. رقم العملية TX84213907"
MIXED = "الحوالة TX61004477 ما وصلت للمستلم، وفوگاها من البارحة البطاقة انقفلت وما أگدر أفتح الحساب أصلاً. شنو أسوي؟"


def _ticket(text: str, synthetic: bool = False) -> int:
    with new_session() as s:
        t = Ticket(text=text, channel="app", is_synthetic=synthetic)
        s.add(t)
        s.commit()
        return t.id


class FakeProvider:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = 0

    async def complete(self, system, user, schema):
        self.calls += 1
        assert "{created_at}" not in system and "Today is 20" in system
        assert user  # ticket text is the user message, untouched
        out = self.outputs.pop(0) if len(self.outputs) > 1 else self.outputs[0]
        text = out if isinstance(out, str) else json.dumps(out, ensure_ascii=False)
        return LLMResult(text=text, token_logprobs=None, tokens_in=10, tokens_out=20, latency_ms=5)


VALID = {
    "category": "failed_transfer", "secondary_category": None, "priority": "low",
    "fields": {"transaction_ref": "TX84213907", "amount_iqd": 250000, "amount_text": "ربع مليون", "date": "2026-10-19", "date_text": "البارحة"},
    "flags": ["money_already_gone"], "draft_reply": "هلا بيك، قسم الحوالات دا يتابعها.",
}


async def test_mock_routes_clear_ticket(db):
    tid = _ticket(CLEAR)
    outcome = await triage_ticket(tid)
    assert outcome.decision == "routed"
    with new_session() as s:
        t = s.get(Ticket, tid)
        tri = s.get(Triage, outcome.triage_id)
        assert t.status == "routed" and t.team_key == "transfers" and t.priority == "high"
        assert t.fields["transaction_ref"] == "TX84213907" and t.fields["amount_iqd"] == 250000
        assert t.draft_md and t.draft_md == t.ai_draft and "TX84213907" in t.draft_md
        assert tri.confidence and tri.confidence >= 0.8 and tri.category_probs
        assert tri.prompt_version == "triage_v1" and tri.raw_output.startswith('{"category"')
        assert [c["name"] for c in tri.checks] == ["schema", "grounding", "confidence", "single_issue"]


async def test_mock_escalates_mixed_ticket(db):
    tid = _ticket(MIXED)
    outcome = await triage_ticket(tid)
    assert outcome.decision == "escalated" and outcome.escalation_reason == "mixed_issue"
    with new_session() as s:
        t = s.get(Ticket, tid)
        assert t.status == "escalated" and t.team_key is None and t.secondary_category == "login_problem"


async def test_retry_then_success_and_priority_floor(db, monkeypatch):
    fake = FakeProvider(["not json at all", VALID])
    monkeypatch.setattr(pipeline, "get_provider", lambda cfg: fake)
    with new_session() as s:  # fake gives no logprobs -> do not escalate for that in this test
        from app.services.routing import update_settings
        update_settings(s, {"escalate_without_confidence": False})
    tid = _ticket(CLEAR)
    outcome = await triage_ticket(tid)
    assert fake.calls == 2 and outcome.decision == "routed"
    with new_session() as s:
        t = s.get(Ticket, tid)
        assert t.priority == "high"  # max(model 'low', routing default 'high')


async def test_invalid_output_after_retries_is_model_error(db, monkeypatch):
    fake = FakeProvider(['{"category": "nonsense"}'])
    monkeypatch.setattr(pipeline, "get_provider", lambda cfg: fake)
    tid = _ticket(CLEAR)
    outcome = await triage_ticket(tid)
    assert fake.calls == 2  # 1 + max_retries(1)
    assert outcome.decision == "escalated" and outcome.escalation_reason == "model_error"
    with new_session() as s:
        tri = s.get(Triage, outcome.triage_id)
        assert tri.error and tri.category is None


async def test_no_logprobs_escalates_by_default(db, monkeypatch):
    monkeypatch.setattr(pipeline, "get_provider", lambda cfg: FakeProvider([VALID]))
    outcome = await triage_ticket(_ticket(CLEAR))
    assert outcome.escalation_reason == "no_confidence"


async def test_cloud_guard(db, monkeypatch):
    monkeypatch.setattr(pipeline, "get_provider", lambda cfg: FakeProvider([VALID]))
    with new_session() as s:
        claude = s.exec(select(ModelConfig).where(ModelConfig.provider == "anthropic")).first()
        claude.enabled = True
        s.add(claude)
        s.commit()
        cid = claude.id
    live = _ticket(CLEAR, synthetic=False)
    with pytest.raises(CloudNotAllowed):
        await triage_ticket(live, cid)
    with new_session() as s:
        assert s.get(Ticket, live).status == "new"
    synthetic = _ticket(CLEAR, synthetic=True)
    outcome = await triage_ticket(synthetic, cid)
    assert outcome.escalation_reason == "no_confidence"  # anthropic: no logprobs
