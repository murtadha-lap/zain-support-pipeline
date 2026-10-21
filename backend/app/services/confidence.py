"""Category confidence from token logprobs.

confidence = exp(sum of logprobs of the generated tokens that overlap the category VALUE span in the
generated JSON text). category_probs = at the first value token, map each top-logprob alternative to
the categories whose value starts with that token text, normalise over matched categories, keep top 5.
"""
from __future__ import annotations

import math
import re
from collections.abc import Sequence

from ..enums import CATEGORIES
from ..llm.base import TokenLogprob

_CATEGORY_VALUE = re.compile(r'"category"\s*:\s*"([^"]*)"')
_STRIP = " \t\r\n\"':{,"


def _token_spans(text: str, tokens: Sequence[TokenLogprob]) -> list[tuple[int, int]] | None:
    """Character span of every token in `text`. Tokens normally concatenate to the text exactly;
    if they don't (e.g. leading whitespace trimmed), fall back to locating the joined token text."""
    joined = "".join(t.token for t in tokens)
    offset = 0
    if joined != text:
        idx = text.find(joined) if joined else -1
        if idx < 0:
            idx = joined.find(text)
            if idx < 0:
                return None
            offset = -idx
        else:
            offset = idx
    spans = []
    pos = offset
    for t in tokens:
        spans.append((pos, pos + len(t.token)))
        pos += len(t.token)
    return spans


def compute_confidence(
    text: str, tokens: Sequence[TokenLogprob] | None
) -> tuple[float | None, dict[str, float] | None]:
    if not tokens:
        return None, None
    m = _CATEGORY_VALUE.search(text)
    if not m:
        return None, None
    v_start, v_end = m.span(1)
    spans = _token_spans(text, tokens)
    if spans is None:
        return None, None
    idx = [i for i, (s, e) in enumerate(spans) if s < v_end and e > v_start]
    if not idx:
        return None, None
    logprob_sum = sum(tokens[i].logprob for i in idx)
    confidence = math.exp(logprob_sum)

    first = tokens[idx[0]]
    mass: dict[str, float] = {}
    alternatives = first.top_logprobs or [(first.token, first.logprob)]
    # the part of the first token that lies before the value (e.g. '"' or ': "') is shared by all
    # alternatives; strip quotes / spaces / punctuation and match the rest against category names.
    for tok, lp in alternatives:
        t = tok.strip(_STRIP)
        if not t:
            continue
        matched = [c for c in CATEGORIES if c.startswith(t)]
        if not matched:
            continue
        p = math.exp(lp)
        for c in matched:
            mass[c] = mass.get(c, 0.0) + p / len(matched)
    category_probs = None
    total = sum(mass.values())
    if total > 0:
        normed = sorted(((c, v / total) for c, v in mass.items()), key=lambda kv: -kv[1])[:5]
        category_probs = {c: round(v, 4) for c, v in normed}
    return round(confidence, 6), category_probs
