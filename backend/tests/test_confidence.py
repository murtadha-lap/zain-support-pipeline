import json
import math
from datetime import datetime

from app.llm.base import TokenLogprob
from app.llm.mock import classify, fake_token_logprobs
from app.services.confidence import compute_confidence

TEXT = '{"category": "failed_transfer", "secondary_category": null, "priority": "high"}'


def _tokens(first_alts):
    lp = math.log
    return [
        TokenLogprob('{"', lp(0.999)),
        TokenLogprob("category", lp(0.999)),
        TokenLogprob('":', lp(0.999)),
        TokenLogprob(' "', lp(0.999)),
        TokenLogprob("failed", lp(0.90), first_alts),
        TokenLogprob("_transfer", lp(0.99)),
        TokenLogprob('",', lp(0.999)),
        TokenLogprob(' "secondary_category": null, "priority": "high"}', lp(0.5)),
    ]


def test_confidence_is_product_of_value_tokens():
    alts = [("failed", math.log(0.90)), ("wrong", math.log(0.05)), ("topup", math.log(0.03)), ("{", math.log(0.01))]
    conf, probs = compute_confidence(TEXT, _tokens(alts))
    assert math.isclose(conf, 0.90 * 0.99, rel_tol=1e-4)
    # alternatives normalised over matched categories only ("{" matches nothing)
    assert set(probs) == {"failed_transfer", "wrong_recipient", "topup_balance"}
    assert math.isclose(probs["failed_transfer"], 0.90 / 0.98, rel_tol=1e-3)
    assert math.isclose(probs["wrong_recipient"], 0.05 / 0.98, rel_tol=1e-3)
    assert math.isclose(sum(probs.values()), 1.0, rel_tol=1e-3)


def test_alternative_tokens_with_quotes_are_stripped_and_prefix_shared():
    # first value token carries the opening quote; an alternative prefix that matches two categories splits
    text = '{"category":"card_issue"}'
    toks = [
        TokenLogprob('{"category":', 0.0),
        TokenLogprob('"card', math.log(0.6), [('"card', math.log(0.6)), ('"c', math.log(0.2)), ('"login', math.log(0.2))]),
        TokenLogprob('_issue"', 0.0),
        TokenLogprob("}", 0.0),
    ]
    conf, probs = compute_confidence(text, toks)
    # the token '"card' overlaps the value span (it includes the opening quote) -> counted
    assert math.isclose(conf, 0.6, rel_tol=1e-6)
    assert math.isclose(probs["card_issue"], 0.8 / 1.0, rel_tol=1e-3)  # '"card' + '"c' (only card_issue starts with c)
    assert math.isclose(probs["login_problem"], 0.2, rel_tol=1e-3)


def test_no_logprobs_returns_none():
    assert compute_confidence(TEXT, None) == (None, None)
    assert compute_confidence(TEXT, []) == (None, None)
    assert compute_confidence('{"x": 1}', [TokenLogprob('{"x": 1}', 0.0)]) == (None, None)


def test_top5_limit():
    cats = ["failed", "wrong", "login", "agent", "card", "topup", "bill"]
    alts = [(c, math.log(0.1)) for c in cats]
    _, probs = compute_confidence(TEXT, _tokens(alts))
    assert len(probs) == 5


def test_mock_fake_logprobs_round_trip():
    out, conf, scores = classify("حولت ٥٠ الف لأخوية البارحة وما وصلت، رقم العملية TX12345678", datetime.fromisoformat("2026-10-20T10:00:00+03:00"))
    text = json.dumps(out, ensure_ascii=False)
    toks = fake_token_logprobs(text, out["category"], conf, scores)
    assert "".join(t.token for t in toks) == text
    c, probs = compute_confidence(text, toks)
    assert math.isclose(c, conf, rel_tol=1e-6)
    assert max(probs, key=probs.get) == out["category"]
