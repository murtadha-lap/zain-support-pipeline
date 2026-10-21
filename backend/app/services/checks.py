"""Deterministic checks run by CODE on the model output (contract, Pipeline step 5/6)."""
from __future__ import annotations

from dataclasses import dataclass, field

from ..enums import ESCALATION_ORDER
from ..schemas import TriageOutput

GROUNDED_FIELDS = ("transaction_ref", "amount_text", "date_text")
_SINGLE_ISSUE_FLAGS = ("instruction_in_text", "mixed_issue", "ambiguous_category")


@dataclass
class CheckResult:
    checks: list[dict]
    fields: dict
    decision: str  # routed | escalated
    escalation_reason: str | None
    failed_reasons: list[str] = field(default_factory=list)


def check_grounding(fields: dict, text: str) -> tuple[dict, list[str]]:
    """Ungrounded values (not a substring of the ticket text) are set to null. Returns (fields, bad keys)."""
    cleaned = dict(fields)
    bad = []
    for key in GROUNDED_FIELDS:
        val = cleaned.get(key)
        if val is None:
            continue
        if not isinstance(val, str) or not val.strip() or val not in text:
            bad.append(key)
            cleaned[key] = None
    return cleaned, bad


def run_checks(
    output: TriageOutput | None,
    ticket_text: str,
    confidence: float | None,
    threshold: float,
    escalate_without_confidence: bool,
    error: str | None = None,
) -> CheckResult:
    empty_fields = {"transaction_ref": None, "amount_iqd": None, "amount_text": None, "date": None, "date_text": None}
    if output is None:
        checks = [
            {"name": "schema", "passed": False, "detail": f"Invalid or missing model output: {error or 'unknown error'}"},
            {"name": "grounding", "passed": None, "detail": "Not applicable (no valid output)."},
            {"name": "confidence", "passed": None, "detail": "Not applicable (no valid output)."},
            {"name": "single_issue", "passed": None, "detail": "Not applicable (no valid output)."},
        ]
        return CheckResult(checks, empty_fields, "escalated", "model_error", ["model_error"])

    reasons: list[str] = []
    checks = [{"name": "schema", "passed": True, "detail": "Output parsed and matches the schema."}]

    fields, bad = check_grounding(output.fields.model_dump(), ticket_text)
    if bad:
        checks.append({
            "name": "grounding", "passed": False,
            "detail": "Not found in the ticket text (set to null): " + ", ".join(bad),
        })
        reasons.append("grounding_failed")
    else:
        present = [k for k in GROUNDED_FIELDS if fields.get(k)]
        detail = ("All extracted spans appear in the text: " + ", ".join(present)) if present else "No spans extracted."
        checks.append({"name": "grounding", "passed": True, "detail": detail})

    if confidence is None:
        if escalate_without_confidence:
            detail = "No logprobs from this model, so confidence is unknown; escalating (escalate_without_confidence)."
            reasons.append("no_confidence")
        else:
            detail = "No logprobs from this model; confidence check skipped."
        checks.append({"name": "confidence", "passed": None, "detail": detail})
    elif confidence >= threshold:
        checks.append({"name": "confidence", "passed": True, "detail": f"{confidence:.3f} >= threshold {threshold:.2f}"})
    else:
        checks.append({"name": "confidence", "passed": False, "detail": f"{confidence:.3f} < threshold {threshold:.2f}"})
        reasons.append("low_confidence")

    flags = [f.value if hasattr(f, "value") else f for f in output.flags]
    problems = [f for f in _SINGLE_ISSUE_FLAGS if f in flags]
    secondary = output.secondary_category.value if output.secondary_category else None
    if problems or secondary:
        parts = []
        if problems:
            parts.append("flags: " + ", ".join(problems))
        if secondary:
            parts.append(f"secondary_category: {secondary}")
        checks.append({"name": "single_issue", "passed": False, "detail": "; ".join(parts)})
        reasons.extend(problems)
        if secondary and "mixed_issue" not in problems:
            reasons.append("mixed_issue")
    else:
        checks.append({"name": "single_issue", "passed": True, "detail": "One issue, no secondary category."})

    if reasons:
        reason = min(reasons, key=ESCALATION_ORDER.index)
        return CheckResult(checks, fields, "escalated", reason, reasons)
    return CheckResult(checks, fields, "routed", None, [])
