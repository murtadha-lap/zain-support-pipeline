"""Evaluation of model triage against gold labels (uploaded dataset rows)."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from ..enums import CATEGORIES

FIELD_KEYS = ("transaction_ref", "amount_iqd", "date")


@dataclass
class EvalItem:
    text: str
    gold: dict           # dataset `labels` (+ draft_reply)
    pred_category: str | None
    pred_fields: dict | None       # after grounding (what the pipeline stores)
    raw_fields: dict | None        # what the model wrote (before grounding)
    escalated: bool


def compute_eval(items: list[EvalItem]) -> dict | None:
    items = [i for i in items if i.gold and i.gold.get("category")]
    n = len(items)
    if n == 0:
        return None

    correct = sum(1 for i in items if i.pred_category == i.gold["category"])

    tp: Counter = Counter()
    fp: Counter = Counter()
    fn: Counter = Counter()
    support: Counter = Counter()
    confusions: Counter = Counter()
    for i in items:
        g, p = i.gold["category"], i.pred_category
        support[g] += 1
        if p == g:
            tp[g] += 1
        else:
            fn[g] += 1
            if p:
                fp[p] += 1
                confusions[(g, p)] += 1

    per_category = []
    f1s = []
    for c in CATEGORIES:
        prec = tp[c] / (tp[c] + fp[c]) if (tp[c] + fp[c]) else 0.0
        rec = tp[c] / (tp[c] + fn[c]) if (tp[c] + fn[c]) else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        per_category.append({"category": c, "precision": round(prec, 4), "recall": round(rec, 4),
                             "f1": round(f1, 4), "support": support[c]})
        if support[c] or fp[c]:
            f1s.append(f1)
    macro_f1 = sum(f1s) / len(f1s) if f1s else 0.0

    field_hits = 0
    for i in items:
        gf = i.gold.get("fields") or {}
        pf = i.pred_fields or {}
        for k in FIELD_KEYS:
            if pf.get(k) == gf.get(k):
                field_hits += 1
    field_exact = field_hits / (n * len(FIELD_KEYS))

    invented = 0
    for i in items:
        ref = (i.raw_fields or {}).get("transaction_ref")
        if ref and ref not in i.text:
            invented += 1

    agree = sum(1 for i in items if bool(i.gold.get("escalate")) == i.escalated)

    return {
        "n": n,
        "category_accuracy": round(correct / n, 4),
        "macro_f1": round(macro_f1, 4),
        "field_exact": round(field_exact, 4),
        "invented_refs": invented,
        "escalation_agreement": round(agree / n, 4),
        "confusions": [
            {"gold": g, "predicted": p, "count": c}
            for (g, p), c in sorted(confusions.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
        ],
        "per_category": per_category,
    }
