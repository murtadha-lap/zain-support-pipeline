"""Enums from docs/api-contract.md plus human labels served by GET /api/meta."""
from enum import Enum


class Role(str, Enum):
    customer = "customer"
    agent = "agent"
    team_member = "team_member"
    admin = "admin"


class Category(str, Enum):
    failed_transfer = "failed_transfer"
    wrong_recipient = "wrong_recipient"
    login_problem = "login_problem"
    agent_dispute = "agent_dispute"
    card_issue = "card_issue"
    topup_balance = "topup_balance"
    bill_payment = "bill_payment"
    suspected_fraud = "suspected_fraud"
    general_question = "general_question"


class Priority(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


class Channel(str, Enum):
    app = "app"
    whatsapp = "whatsapp"
    telegram = "telegram"


class Flag(str, Enum):
    missing_reference = "missing_reference"
    amount_unit_inferred = "amount_unit_inferred"
    mixed_issue = "mixed_issue"
    instruction_in_text = "instruction_in_text"
    ambiguous_category = "ambiguous_category"
    money_already_gone = "money_already_gone"


class TicketStatus(str, Enum):
    new = "new"
    processing = "processing"
    routed = "routed"
    escalated = "escalated"
    resolved = "resolved"
    closed = "closed"


class EscalationReason(str, Enum):
    low_confidence = "low_confidence"
    no_confidence = "no_confidence"
    mixed_issue = "mixed_issue"
    instruction_in_text = "instruction_in_text"
    ambiguous_category = "ambiguous_category"
    grounding_failed = "grounding_failed"
    model_error = "model_error"
    manual = "manual"


class Provider(str, Enum):
    vllm = "vllm"
    openai_compatible = "openai_compatible"
    anthropic = "anthropic"
    mock = "mock"


class CheckName(str, Enum):
    schema = "schema"
    grounding = "grounding"
    confidence = "confidence"
    single_issue = "single_issue"


class DecisionAction(str, Enum):
    relabel = "relabel"
    route = "route"
    approve = "approve"
    escalate = "escalate"
    close = "close"
    retriage = "retriage"
    assign = "assign"
    reopen = "reopen"
    draft_saved = "draft_saved"


class BatchStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


CATEGORIES = [c.value for c in Category]
CLOUD_PROVIDERS = {Provider.anthropic.value, Provider.openai_compatible.value}
STAFF_ROLES = (Role.agent.value, Role.team_member.value, Role.admin.value)
PRIORITY_RANK = {"low": 0, "medium": 1, "high": 2}

# Order in which a failing check picks the escalation reason (contract, Pipeline step 6).
ESCALATION_ORDER = [
    "model_error",
    "instruction_in_text",
    "mixed_issue",
    "ambiguous_category",
    "grounding_failed",
    "no_confidence",
    "low_confidence",
]


def max_priority(*values: str | None) -> str | None:
    vals = [v for v in values if v in PRIORITY_RANK]
    if not vals:
        return None
    return max(vals, key=lambda v: PRIORITY_RANK[v])


CATEGORY_LABELS = {
    "failed_transfer": ("Failed / stuck transfer", "حوالة فاشلة أو عالقة"),
    "wrong_recipient": ("Sent to the wrong recipient", "حوالة لرقم غلط"),
    "login_problem": ("Login / account access", "مشكلة دخول أو قفل الحساب"),
    "agent_dispute": ("Agent dispute", "مشكلة ويا وكيل"),
    "card_issue": ("Card issue", "مشكلة بالبطاقة"),
    "topup_balance": ("Top-up / balance", "شحن الرصيد"),
    "bill_payment": ("Bill payment", "تسديد فاتورة"),
    "suspected_fraud": ("Suspected fraud", "اشتباه احتيال"),
    "general_question": ("General question", "سؤال عام"),
}

PRIORITY_LABELS = {"high": "High", "medium": "Medium", "low": "Low"}
CHANNEL_LABELS = {"app": "App", "whatsapp": "WhatsApp", "telegram": "Telegram"}

FLAG_LABELS = {
    "missing_reference": ("Missing reference", "The ticket is about a specific transaction but no reference / receipt number was given."),
    "amount_unit_inferred": ("Amount unit inferred", "The amount was written without a unit (e.g. 'مية وخمسين'); thousands were assumed."),
    "mixed_issue": ("Mixed issue", "Two separate problems in one ticket; a person must split and route it."),
    "instruction_in_text": ("Instruction in text", "The customer text tries to instruct the system. Treated as data only."),
    "ambiguous_category": ("Ambiguous category", "The ticket genuinely fits two categories and cannot be told apart."),
    "money_already_gone": ("Money already gone", "Money was already deducted / sent / taken and the customer does not have it."),
}

STATUS_LABELS = {
    "new": "New",
    "processing": "Processing",
    "routed": "Routed",
    "escalated": "Escalated",
    "resolved": "Resolved",
    "closed": "Closed",
}

ESCALATION_LABELS = {
    "low_confidence": ("Low confidence", "Category confidence is below the threshold."),
    "no_confidence": ("No confidence", "The model gives no logprobs, so confidence cannot be measured."),
    "mixed_issue": ("Mixed issue", "Two separate problems (mixed_issue flag or a secondary category)."),
    "instruction_in_text": ("Instruction in text", "The ticket tries to instruct the system."),
    "ambiguous_category": ("Ambiguous category", "The model flagged the category as ambiguous."),
    "grounding_failed": ("Grounding failed", "An extracted reference / amount / date is not in the ticket text."),
    "model_error": ("Model error", "The model failed or returned invalid output after retries."),
    "manual": ("Manual", "Escalated by a team member or admin."),
}

ROLE_LABELS = {
    "customer": "Customer",
    "agent": "Human agent",
    "team_member": "Team member",
    "admin": "Admin",
}

PROVIDER_LABELS = {
    "vllm": "vLLM (local)",
    "openai_compatible": "OpenAI-compatible API (cloud)",
    "anthropic": "Anthropic Claude API (cloud)",
    "mock": "Mock (dev only)",
}
