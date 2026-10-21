"""Mock provider - deterministic OFFLINE keyword classifier. DEV / DEMO ONLY.

It imitates a real model: it returns the same JSON text a constrained model would return and fake
per-token logprobs, so the output goes through exactly the same parse / confidence / checks code.
It is NOT a model and its labels are rough heuristics.
"""
from __future__ import annotations

import asyncio
import json
import math
import re
import time
import zlib
from datetime import date, datetime, timedelta, timezone

from .base import LLMResult, ProviderConfig, TokenLogprob

MOCK_LABEL = "mock (dev only)"
IRAQ_TZ = timezone(timedelta(hours=3))

# --------------------------------------------------------------------------- normalisation

_DIACRITICS = re.compile(r"[ً-ْٰـ]")
_TRANS = str.maketrans(
    {
        "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "گ": "ك", "ڨ": "ك", "چ": "ج",
        "پ": "ب", "ڤ": "ف", "ؤ": "و", "ئ": "ي",
        "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
        "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
    }
)


def norm(s: str) -> str:
    return _DIACRITICS.sub("", s.lower()).translate(_TRANS)


def to_int(digits: str) -> int:
    return int(re.sub(r"[^0-9]", "", digits.translate(_TRANS)) or 0)


# --------------------------------------------------------------------------- category keywords

_KW: dict[str, list[tuple[str, int]]] = {
    "failed_transfer": [
        ("ما وصل", 2), ("ماوصل", 2), ("ما استلم", 2), ("للحين ما", 1), ("حوالة", 2), ("حولت", 2),
        ("تحويل", 1), ("عالقة", 2), ("معلقة", 2), ("فشلت", 2), ("فاشلة", 2), ("ناجحة بس", 2),
        ("تمت بنجاح", 1), ("انخصمت", 1), ("انسحب", 1), ("7awal", 2), ("ma wosal", 2), ("ma wsl", 2),
        ("ma wesal", 2), ("ma wsal", 2), ("failed", 2), ("transfer", 1), ("stuck", 2), ("pending", 1),
    ],
    "wrong_recipient": [
        ("رقم غلط", 3), ("بالغلط", 3), ("غلط", 1), ("لرقم مو", 3), ("مو رقم", 2), ("رقم ثاني", 2),
        ("شخص ثاني", 2), ("شخص غريب", 2), ("ارجعها", 2), ("استرجاع", 1), ("بدل", 1), ("ghalat", 3),
        ("wrong number", 3), ("wrong person", 3), ("wrong", 1),
    ],
    "login_problem": [
        ("الرمز غلط", 3), ("رمز غلط", 3), ("انقفل", 3), ("مقفول", 3), ("قفل الحساب", 3), ("افتح الحساب", 2),
        ("افتح حسابي", 2), ("ما يفتح", 2), ("نسيت الرمز", 3), ("نسيت", 1), ("رمز التحقق", 3),
        ("كود التحقق", 3), ("الكود ما", 2), ("otp", 2), ("تسجيل الدخول", 3), ("login", 3), ("log in", 3),
        ("password", 2), ("باسورد", 2), ("الرقم السري", 2), ("تلفون جديد", 2), ("موبايل جديد", 2),
        ("جهاز جديد", 2), ("crash", 2), ("ما يشتغل", 1), ("sign in", 3), ("مسدود", 2), ("محظور", 2),
    ],
    "agent_dispute": [
        ("وكيل", 3), ("صاحب المحل", 2), ("اخذ الفلوس", 2), ("اخذ مني", 1), ("سحب نقدي", 2), ("سحبت كاش", 2),
        ("wakeel", 3), ("wakil", 3), ("agent", 3), ("cash out", 2), ("cash in", 2), ("عمولة زايدة", 2),
        ("مكتب", 1),
    ],
    "card_issue": [
        ("بطاقة", 2), ("ماستر", 3), ("فيزا", 3), ("visa", 3), ("mastercard", 3), ("master card", 3),
        ("card", 2), ("انرفضت", 2), ("مرفوضة", 2), ("رفضت", 1), ("declined", 3), ("اونلاين", 1),
        ("online", 1), ("ضاعت البطاقة", 3),
    ],
    "topup_balance": [
        ("شحنت", 3), ("شحن", 2), ("تعبئة", 3), ("رصيدي", 1), ("رصيد", 1), ("ما نزل", 2), ("ما ينزل", 2),
        ("بحسابي", 1), ("بالمحفظة", 1), ("top up", 3), ("topup", 3), ("top-up", 3), ("recharge", 3),
        ("sha7an", 3), ("shi7ant", 3), ("sha7ant", 3), ("voucher", 3), ("قسيمة", 2), ("من البنك", 2),
        ("كرت", 1),
    ],
    "bill_payment": [
        ("فاتورة", 3), ("كهربا", 3), ("الماي", 2), ("الماء", 2), ("انترنت", 2), ("انترنيت", 2),
        ("مدفوعة", 2), ("قسط", 2), ("المدرسة", 2), ("الجامعة", 2), ("bill", 3), ("fatora", 3),
        ("fatura", 3), ("electricity", 3), ("اشتراك", 1), ("سددت", 2), ("تسديد", 2), ("دفعت", 1),
    ],
    "suspected_fraud": [
        ("طلب الرمز", 4), ("طلب مني الرمز", 4), ("طلب الكود", 4), ("انطيته الرمز", 4), ("انطيته", 2),
        ("ما سويت", 4), ("مو اني", 3), ("مو انا", 3), ("مخترق", 4), ("اختراق", 4), ("انخترق", 4),
        ("هكر", 4), ("hack", 4), ("رابط", 2), ("link", 2), ("احتيال", 4), ("محتال", 4), ("نصاب", 4),
        ("نصب", 2), ("سرقة", 3), ("سرقو", 3), ("مسروق", 3), ("fraud", 4), ("scam", 4), ("اتصال", 2),
        ("اتصلوا", 2), ("يدعي", 3), ("من زين كاش", 2), ("ما اعرف منو", 3), ("شخص مجهول", 3),
        ("ma sawet", 4),
    ],
    "general_question": [
        ("شكد", 2), ("عمولة", 2), ("حدود", 2), ("الحد اليومي", 3), ("اقصى", 2), ("شلون اسوي", 2),
        ("شلون افتح حساب", 3), ("كيف", 1), ("دوام", 2), ("ترقية", 3), ("كشف حساب", 3), ("رسوم", 2),
        ("fees", 3), ("limit", 3), ("how", 1), ("shgad", 2), ("هل اكو", 2), ("اريد اعرف", 2),
        ("استفسار", 3), ("سؤال", 2),
    ],
}
_KW_NORM = {cat: [(norm(k), w) for k, w in kws] for cat, kws in _KW.items()}

DEFAULT_PRIORITY = {
    "failed_transfer": "high", "wrong_recipient": "high", "login_problem": "medium", "agent_dispute": "medium",
    "card_issue": "medium", "topup_balance": "medium", "bill_payment": "medium", "suspected_fraud": "high",
    "general_question": "low",
}
_RANK = {"low": 0, "medium": 1, "high": 2}
_RANK_INV = {v: k for k, v in _RANK.items()}

# pairs that commonly co-occur in one complaint (not "two problems")
_RELATED = {
    frozenset(p)
    for p in [
        ("failed_transfer", "wrong_recipient"), ("agent_dispute", "topup_balance"), ("topup_balance", "card_issue"),
        ("failed_transfer", "topup_balance"), ("failed_transfer", "agent_dispute"), ("suspected_fraud", "failed_transfer"),
        ("suspected_fraud", "login_problem"), ("suspected_fraud", "wrong_recipient"), ("bill_payment", "topup_balance"),
        ("card_issue", "bill_payment"), ("suspected_fraud", "card_issue"),
    ]
}
_AMBIGUOUS = {frozenset(p) for p in [("agent_dispute", "topup_balance"), ("failed_transfer", "topup_balance"), ("failed_transfer", "agent_dispute")]}

_INSTRUCTION = [norm(x) for x in [
    "تجاهل", "ignore", "system:", "انت الان", "انت هسه", "انا المدير", "اوامر من الادارة", "بدون موافقة",
    "اطبع ال", "prompt", "غير الفئة", "غير التصنيف", "اكتب بالرد", "اكتب في الرد", "you are now", "disregard",
    "forget previous", "developer mode",
]]

_TXN_CATEGORIES = {"failed_transfer", "wrong_recipient", "topup_balance", "bill_payment", "agent_dispute", "suspected_fraud"}
_MONEY_GONE_CATEGORIES = {"failed_transfer", "wrong_recipient", "topup_balance", "suspected_fraud"}
_MONEY_GONE_KW = [norm(x) for x in [
    "انخصم", "انسحب", "راحت", "طالعة من حسابي", "طلعت من حسابي", "اخذ الفلوس", "دزيت", "حولت", "شحنت",
    "دفعت", "inkhasm", "deducted", "7awalt",
]]

TEAM_AR = {
    "failed_transfer": "قسم الحوالات", "wrong_recipient": "قسم الحوالات", "login_problem": "قسم الحسابات",
    "agent_dispute": "قسم الوكلاء", "card_issue": "قسم البطاقات", "topup_balance": "قسم المدفوعات",
    "bill_payment": "قسم المدفوعات", "suspected_fraud": "قسم الأمان", "general_question": "فريق الدعم",
}

# --------------------------------------------------------------------------- extraction

_D = "0-9٠-٩۰-۹"
_AR_OR_LATIN = "ؠ-يٮ-ۓA-Za-z"  # letters only (not Arabic punctuation like ،)
_REF_TX = re.compile(r"(?<![A-Za-z0-9])(?:TX|tx|Tx)[0-9]{6,10}(?![0-9])")
_REF_RECEIPT = re.compile(
    rf"(?:وصل|ايصال|إيصال|الوصل|الايصال|الإيصال|العملية|العمليه|الحوالة|الحواله|receipt|ref|reference)"
    rf"\s*(?:رقم|رقمه|رقمها|no\.?|#)?\s*[:：#\-]?\s*([{_D}]{{4,10}})(?![{_D}])(?!\s*(?:الف|ألف|alf|دينار|مليون))"
)
_PHONE = re.compile(rf"(?:\+|00)?(?:964|٩٦٤)?\s?[0٠]?[7٧][{_D}]{{9}}|[0٠][7٧][{_D}]{{9}}")

_NUM = rf"[{_D}]+(?:[,٬.][{_D}]{{3}})*"
_AMT_THOUSAND = re.compile(rf"(?<![{_D}A-Za-z])({_NUM})\s*(?:الف|ألف|آلاف|الاف|الآف|alf|alef|k|K)(?![{_AR_OR_LATIN}])")
_AMT_MILLION = re.compile(rf"(?<![{_D}A-Za-z])({_NUM})\s*(?:مليون|ملايين|malyoon|malyon|million)(?![{_AR_OR_LATIN}])")
_AMT_DINAR = re.compile(rf"(?<![{_D}A-Za-z])({_NUM})\s*(?:دينار|IQD|iqd)(?![{_AR_OR_LATIN}])")
_AMT_COMMAS = re.compile(rf"(?<![{_D}A-Za-z])([{_D}]{{1,3}}(?:[,٬][{_D}]{{3}})+)(?![{_D}])")
_AMT_WORDS_FIXED = [
    (re.compile(r"مليون\s*ونص|مليون\s*ونصف"), 1_500_000),
    (re.compile(r"ربع\s*مليون|rob3\s*malyoo?n|rub3\s*malyoo?n"), 250_000),
    (re.compile(r"(?:نص|نصف)\s*مليون|nos\s*malyoo?n|nus\s*malyoo?n"), 500_000),
    (re.compile(r"مليونين"), 2_000_000),
    (re.compile(rf"(?<![{_AR_OR_LATIN}])(?:مليون|malyoo?n|million)(?![{_AR_OR_LATIN}])"), 1_000_000),
]
_WORD_VALUES = {
    "واحد": 1, "اثنين": 2, "ثنين": 2, "ثلاث": 3, "ثلاثة": 3, "ثلث": 3, "اربع": 4, "اربعة": 4, "أربع": 4, "أربعة": 4,
    "خمس": 5, "خمسة": 5, "ست": 6, "ستة": 6, "سبع": 7, "سبعة": 7, "ثمان": 8, "ثمانية": 8, "ثمن": 8, "تسع": 9,
    "تسعة": 9, "عشر": 10, "عشرة": 10, "عشرين": 20, "ثلاثين": 30, "ثلثين": 30, "اربعين": 40, "أربعين": 40,
    "خمسين": 50, "ستين": 60, "سبعين": 70, "ثمانين": 80, "ثمنين": 80, "تسعين": 90, "مية": 100, "ميه": 100,
    "مئة": 100, "ميتين": 200, "مئتين": 200, "ثلاثمية": 300, "ثلثمية": 300, "اربعمية": 400, "أربعمية": 400,
    "خمسمية": 500, "ستمية": 600, "سبعمية": 700, "ثمنمية": 800, "ثمانمية": 800, "تسعمية": 900,
}
_W = "|".join(sorted(_WORD_VALUES, key=len, reverse=True))
_AMT_WORDS = re.compile(
    rf"(?<![{_AR_OR_LATIN}])((?:{_W}))((?:\s+و\s*(?:{_W}))*)(\s+(?:الف|ألف))?(?![{_AR_OR_LATIN}])"
)
_BALANCE_CONTEXT = re.compile(r"(رصيدي|راتبي|راتب|الحد|حدود|اقصى|أقصى|limit|balance|رصيدي هو)\s*\S{0,6}\s*$")

_DATE_GROUPS: list[tuple[list[str], int | None]] = [
    (["اول البارحة", "أول البارحة", "اول البارحه", "أول البارحه", "اول امس", "أول أمس", "قبل يومين"], -2),
    (["البارحة", "البارحه", "امس", "أمس", "el bare7a", "lbare7a", "bare7a", "yesterday"], -1),
    (["قبل ساعة", "قبل ساعه", "قبل ساعتين", "هسه", "هسة", "اليوم", "el yom", "el youm", "today"], 0),
]
_WEEKDAYS = {  # python weekday(): Monday=0
    "الاحد": 6, "الأحد": 6, "الاثنين": 0, "الإثنين": 0, "الثلاثاء": 1, "الثلاثا": 1, "الاربعاء": 2, "الأربعاء": 2,
    "الاربعا": 2, "الخميس": 3, "الجمعة": 4, "الجمعه": 4, "السبت": 5,
}


def _bounded(term: str) -> re.Pattern:
    return re.compile(rf"(?<![{_AR_OR_LATIN}])(?:و)?({re.escape(term)})(?![{_AR_OR_LATIN}])", re.IGNORECASE)


def extract_ref(text: str) -> str | None:
    m = _REF_TX.search(text)
    if m:
        return m.group(0)
    m = _REF_RECEIPT.search(text)
    if m:
        return m.group(1)
    return None


def _overlaps(span: tuple[int, int], spans: list[tuple[int, int]]) -> bool:
    return any(span[0] < e and span[1] > s for s, e in spans)


def extract_amount(text: str, ref: str | None) -> tuple[int | None, str | None, bool]:
    """Returns (amount_iqd, amount_text, unit_inferred)."""
    blocked = [m.span() for m in _PHONE.finditer(text)]
    if ref:
        i = text.find(ref)
        if i >= 0:
            blocked.append((i, i + len(ref)))
    cands: list[tuple[int, int, int, str, bool]] = []  # start, end, value, text, inferred

    def add(start: int, end: int, value: int, inferred: bool = False):
        if value <= 0 or _overlaps((start, end), blocked):
            return
        if _BALANCE_CONTEXT.search(text[max(0, start - 20):start]):
            return
        cands.append((start, end, value, text[start:end], inferred))

    for m in _AMT_THOUSAND.finditer(text):
        add(m.start(), m.end(), int(round(float(m.group(1).translate(_TRANS).replace(",", "").replace("٬", "")) * 1000)))
    for m in _AMT_MILLION.finditer(text):
        add(m.start(), m.end(), int(round(float(m.group(1).translate(_TRANS).replace(",", "").replace("٬", "")) * 1_000_000)))
    for m in _AMT_DINAR.finditer(text):
        add(m.start(), m.end(), to_int(m.group(1)))
    for m in _AMT_COMMAS.finditer(text):
        add(m.start(), m.end(), to_int(m.group(1)))
    for rx, value in _AMT_WORDS_FIXED:
        for m in rx.finditer(text):
            add(m.start(), m.end(), value)
    for m in _AMT_WORDS.finditer(text):
        parts = [m.group(1)] + re.findall(rf"(?:{_W})", m.group(2) or "")
        value = sum(_WORD_VALUES[p] for p in parts)
        has_unit = bool(m.group(3))
        if not has_unit and len(parts) == 1 and value < 20:
            continue  # "ثلاث مرات" is not an amount
        if has_unit:
            add(m.start(), m.end(), value * 1000)
        elif value < 1000:
            add(m.start(), m.end(), value * 1000, inferred=True)
    if not cands:
        return None, None, False
    # earliest start; on ties prefer the longest span
    cands.sort(key=lambda c: (c[0], -(c[1] - c[0])))
    start, end, value, span_text, inferred = cands[0]
    return value, span_text.strip(), inferred


def extract_date(text: str, created: datetime) -> tuple[str | None, str | None]:
    created_day: date = created.astimezone(IRAQ_TZ).date()
    for terms, offset in _DATE_GROUPS[:2]:
        for term in terms:
            m = _bounded(term).search(text)
            if m:
                return (created_day + timedelta(days=offset)).isoformat(), m.group(1)
    m = re.search(rf"(?<![{_AR_OR_LATIN}])(?:و)?(يوم\s+(?:{'|'.join(_WEEKDAYS)}))(?![{_AR_OR_LATIN}])", text)
    if m:
        name = m.group(1).split()[-1]
        delta = (created_day.weekday() - _WEEKDAYS[name]) % 7 or 7
        return (created_day - timedelta(days=delta)).isoformat(), m.group(1)
    for term in _DATE_GROUPS[2][0]:
        m = _bounded(term).search(text)
        if m:
            return created_day.isoformat(), m.group(1)
    return None, None


# --------------------------------------------------------------------------- classification

def score_categories(text: str) -> dict[str, int]:
    t = norm(text)
    return {cat: sum(w for k, w in kws if k in t) for cat, kws in _KW_NORM.items()}


def _jitter(text: str, salt: str = "") -> float:
    return (zlib.crc32((salt + text).encode("utf-8")) % 1000) / 1000.0


def _fmt_amount(v: int) -> str:
    if v >= 1_000_000:
        m = v / 1_000_000
        return "مليون" if m == 1 else f"{m:g} مليون"
    if v >= 1000:
        return f"{v // 1000:g} ألف" if v % 1000 == 0 else f"{v:,} دينار"
    return f"{v} دينار"


_OPENINGS = ["هلا بيك، ", "أهلاً بيك، ", "سلام عليكم، ", "شكراً لتواصلك، ", "نعتذر على الإزعاج، "]


def _draft(category: str, ref: str | None, amount: int | None, missing_ref: bool, text: str) -> str:
    opening = _OPENINGS[zlib.crc32(text.encode("utf-8")) % len(_OPENINGS)]
    r = f" برقم {ref}" if ref else ""
    a = f" بمبلغ {_fmt_amount(amount)}" if amount else ""
    team = TEAM_AR[category]
    body = {
        "failed_transfer": f"فهمنا إن الحوالة{r}{a} ما وصلت. {team} دا يتابعها هسه ونرجعلك أول ما يتبين وين صارت.",
        "wrong_recipient": f"فهمنا إن الحوالة{r}{a} راحت لرقم غلط. {team} راح يتواصل ويا المستلم ويطلب الإرجاع، وما نگدر نوعد بنتيجة بس نخبرك بكل خطوة.",
        "login_problem": f"{team} راح يتواصل وياك لتأكيد هويتك ويساعدك تفتح الحساب، ولا تنطي الرمز لأي أحد.",
        "agent_dispute": f"سجلنا شكواك على الوكيل{a}{r}. {team} راح يتحقق من العملية ويتواصل وياك، احتفظ بالوصل لحد ما تنحل.",
        "card_issue": f"{team} راح يفحص حالة البطاقة والعملية{r}{a} ويرجعلك بالسبب، وإذا تحتاج تجميد مؤقت گلنا.",
        "topup_balance": f"بخصوص الشحن{a}{r}، أحياناً ينزل الرصيد متأخر شوية. {team} دا يتابعها هسه ونخبرك أول ما ينزل.",
        "bill_payment": f"وصلتنا تفاصيل الفاتورة{a}{r}. {team} راح يتأكد من وصولها للجهة ويرجعلك بالتأكيد.",
        "suspected_fraud": f"فهمنا الموقف و{team} راح يتواصل وياك فوراً. غيّر الرمز هسه من التطبيق ولا تنطيه لأي أحد، إحنا ما نطلب الرمز أبداً.",
        "general_question": f"{team} راح يدزلك التفاصيل الخاصة بحسابك، وتگدر تشوف الحدود والرسوم هم من التطبيق.",
    }[category]
    if missing_ref:
        body += " حتى نتابعها بسرعة، دزلنا رقم العملية من سجل المعاملات بالتطبيق."
    return opening + body


def classify(text: str, created: datetime) -> tuple[dict, float, dict[str, int]]:
    """Returns (output dict in model_output_schema shape, confidence, category scores)."""
    scores = score_categories(text)
    t = norm(text)
    instruction = any(p in t for p in _INSTRUCTION)
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    (c1, s1), (c2, s2) = ranked[0], ranked[1]
    flags: list[str] = []
    secondary = None
    j = _jitter(text)

    if s1 < 2:
        category, conf = "general_question", 0.45 + 0.13 * j
    else:
        category = c1
        if c2 == "general_question" or c1 == "general_question":
            competing = 0
        else:
            competing = s2
        pair = frozenset((c1, c2))
        if competing >= 3 and competing >= 0.6 * s1 and pair not in _RELATED:
            # two separate problems: primary = the more urgent one
            first, second = sorted(
                [(c1, s1), (c2, s2)], key=lambda cs: (-_RANK[DEFAULT_PRIORITY[cs[0]]], -cs[1])
            )
            category, secondary = first[0], second[0]
            flags.append("mixed_issue")
            conf = 0.50 + 0.15 * j
        elif competing >= 3 and s1 - competing <= 1 and pair in _AMBIGUOUS:
            flags.append("ambiguous_category")
            conf = 0.50 + 0.18 * j
        elif s1 >= 3 and competing <= max(1, 0.4 * s1):
            conf = min(0.97, 0.84 + 0.02 * (s1 - 3) + 0.05 * j)
        else:
            conf = 0.62 + 0.16 * j

    if instruction:
        flags.append("instruction_in_text")
        if s1 < 4:
            category, secondary = "general_question", None
            flags = [f for f in flags if f not in ("mixed_issue", "ambiguous_category")]
        conf = min(conf, 0.55 + 0.15 * j)

    ref = extract_ref(text)
    amount, amount_text, inferred = extract_amount(text, ref)
    date_iso, date_text = extract_date(text, created)
    if inferred:
        flags.append("amount_unit_inferred")
    missing_ref = category in _TXN_CATEGORIES and ref is None and "instruction_in_text" not in flags
    if missing_ref:
        flags.append("missing_reference")
    if category in _MONEY_GONE_CATEGORIES and (amount or any(k in t for k in _MONEY_GONE_KW)):
        flags.append("money_already_gone")

    priority = DEFAULT_PRIORITY[category]
    if secondary:
        priority = _RANK_INV[max(_RANK[priority], _RANK[DEFAULT_PRIORITY[secondary]])]
    repeat = any(norm(k) in t for k in ["ثالث يوم", "ثاني مرة", "ثالث مرة", "كل يوم اتصل", "صارلي اسبوع"])
    if (amount and amount >= 1_000_000) or repeat:
        priority = _RANK_INV[min(2, _RANK[priority] + 1)]

    escalate_like = any(f in flags for f in ("mixed_issue", "instruction_in_text", "ambiguous_category"))
    draft = "" if escalate_like else _draft(category, ref, amount, missing_ref, text)
    out = {
        "category": category,
        "secondary_category": secondary,
        "priority": priority,
        "fields": {
            "transaction_ref": ref,
            "amount_iqd": amount,
            "amount_text": amount_text,
            "date": date_iso,
            "date_text": date_text,
        },
        "flags": flags,
        "draft_reply": draft,
    }
    return out, round(conf, 4), scores


# --------------------------------------------------------------------------- fake logprobs

def _chunks(s: str, n: int = 4) -> list[str]:
    return [s[i:i + n] for i in range(0, len(s), n)]


def fake_token_logprobs(text: str, category: str, conf: float, scores: dict[str, int]) -> list[TokenLogprob]:
    m = re.search(r'"category"\s*:\s*"([^"]*)"', text)
    if not m:
        return [TokenLogprob(c, -1e-4, []) for c in _chunks(text)]
    s, e = m.span(1)
    tokens = [TokenLogprob(c, -1e-4, [(c, -1e-4)]) for c in _chunks(text[:s])]
    value = text[s:e]
    first, rest = value[:4], value[4:]
    others = sorted((c for c in scores if c != category), key=lambda c: (-scores[c], c))[:4]
    weights = {c: scores[c] + 0.5 for c in others}
    remaining = max(1e-6, 1.0 - conf)
    total_w = sum(weights.values()) or 1.0
    top = [(first, math.log(conf))] + [(c[:4], math.log(remaining * weights[c] / total_w)) for c in others]
    tokens.append(TokenLogprob(first, math.log(conf), top))
    if rest:
        tokens.append(TokenLogprob(rest, 0.0, [(rest, 0.0)]))
    tokens += [TokenLogprob(c, -1e-4, [(c, -1e-4)]) for c in _chunks(text[e:])]
    return tokens


_ISO_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?")


def _created_from_prompt(system: str) -> datetime:
    m = _ISO_RE.search(system)
    if m:
        try:
            dt = datetime.fromisoformat(m.group(0).replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=IRAQ_TZ)
        except ValueError:
            pass
    return datetime.now(IRAQ_TZ)


class MockProvider:
    """Offline keyword classifier. Label: 'mock (dev only)'."""

    label = MOCK_LABEL

    def __init__(self, cfg: ProviderConfig):
        self.cfg = cfg

    async def complete(self, system: str, user: str, schema: dict) -> LLMResult:
        t0 = time.perf_counter()
        await asyncio.sleep(0)  # yield like a real network call
        created = _created_from_prompt(system)
        out, conf, scores = classify(user, created)
        text = json.dumps(out, ensure_ascii=False)
        tokens = fake_token_logprobs(text, out["category"], conf, scores) if self.cfg.supports_logprobs else None
        return LLMResult(
            text=text,
            token_logprobs=tokens,
            tokens_in=(len(system) + len(user)) // 4,
            tokens_out=len(text) // 4,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            raw={"provider": "mock", "note": MOCK_LABEL, "scores": scores},
        )
