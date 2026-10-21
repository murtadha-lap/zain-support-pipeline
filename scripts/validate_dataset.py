"""Validate dataset rows (JSONL) against schemas/ticket.schema.json plus the labelling rules in docs/generation_spec.md.

Usage:
    python scripts/validate_dataset.py data/raw/agent_01.jsonl [--range 1 100]

Exit code 0 = no errors (warnings are allowed), 1 = at least one error.
"""
import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime, timedelta
from difflib import SequenceMatcher

CATEGORIES = [
    "failed_transfer", "wrong_recipient", "login_problem", "agent_dispute", "card_issue",
    "topup_balance", "bill_payment", "suspected_fraud", "general_question",
]
ROUTING = {
    "failed_transfer": ("transfers", "high"), "wrong_recipient": ("transfers", "high"),
    "login_problem": ("accounts", "medium"), "agent_dispute": ("agent_network", "medium"),
    "card_issue": ("cards", "medium"), "topup_balance": ("payments", "medium"),
    "bill_payment": ("payments", "medium"), "suspected_fraud": ("security", "high"),
    "general_question": ("general_support", "low"),
}
RANK = {"low": 0, "medium": 1, "high": 2}
TRANSACTIONAL = {"failed_transfer", "wrong_recipient", "topup_balance", "bill_payment", "agent_dispute", "suspected_fraud"}
FLAGS = {"missing_reference", "amount_unit_inferred", "mixed_issue", "instruction_in_text", "ambiguous_category", "money_already_gone"}
EDGE_CASES = {None, "two_problems", "amount_in_words", "no_reference", "arabizi", "english_mix", "injection",
              "balance_not_amount", "relative_date", "long_rant", "very_short"}
TEAM_WORDS = {
    "transfers": ["الحوالات"], "accounts": ["الحسابات"], "agent_network": ["الوكلاء", "الوكيل"],
    "cards": ["البطاقات"], "payments": ["المدفوعات"], "security": ["الأمان", "الامان"],
    "general_support": ["الدعم"],
}
PROMISE_WORDS = ["نضمن", "اكيد يرجع", "أكيد يرجع", "خلال ساعة", "خلال ساعتين", "خلال دقايق", "100%", "مضمون", "بالتأكيد يرجع"]
SECRET_REQUESTS = ["دزلنا الرمز", "دزلي الرمز", "انطينا الرمز", "ارسل لنا الرمز", "أرسل لنا الرمز", "دزلنا الرقم السري", "دزلنا رقم البطاقة", "انطينا رقم البطاقة"]
LENGTH_BINS = {"very_short": (1, 12), "short": (13, 30), "medium": (31, 70), "long": (71, 400)}
TOP_KEYS = {"id", "text", "channel", "created_at", "labels", "draft_reply", "meta"}
LABEL_KEYS = {"category", "secondary_category", "priority", "fields", "flags", "escalate", "escalate_reason"}
FIELD_KEYS = {"transaction_ref", "amount_iqd", "amount_text", "date", "date_text"}
STYLE_ENUMS = {
    "region": {"baghdad", "najaf", "basra", "mosul", "erbil", "generic"},
    "tone": {"calm", "worried", "angry", "polite", "confused"},
    "length": set(LENGTH_BINS),
}
AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
WEEKDAYS = {"الاثنين": 0, "الإثنين": 0, "الثلاثاء": 1, "الاربعاء": 2, "الأربعاء": 2, "الخميس": 3,
            "الجمعة": 4, "السبت": 5, "الاحد": 6, "الأحد": 6}
# phrase -> day offset from created_at; longest phrases are matched first
REL_DAYS = {
    "اول البارحة": -2, "أول البارحة": -2, "اول امس": -2, "أول أمس": -2, "قبل يومين": -2,
    "قبل ثلاث ايام": -3, "قبل ثلاثة ايام": -3, "قبل ٣ ايام": -3, "قبل 3 ايام": -3,
    "البارحة": -1, "البارحه": -1, "امس": -1, "أمس": -1,
    "اليوم": 0, "هسه": 0, "هسة": 0, "الصبح": 0, "صباح اليوم": 0, "قبل ساعة": 0, "قبل ساعتين": 0, "قبل شوي": 0,
    "من شوي": 0, "قبل نص ساعة": 0, "قبل دقايق": 0, "الظهر": 0,
}


def words(s):
    return len(s.split())


def parse_amount(span):
    """Return the IQD value if the span is digits (+ unit), else None (words are not checked)."""
    s = span.translate(AR_DIGITS).replace(",", "").replace("٬", "")
    m = re.search(r"(\d+(?:\.\d+)?)", s)
    if not m or re.search(r"[ء-ي]{3,}", s.replace("الف", "").replace("ألف", "").replace("مليون", "").replace("آلاف", "").replace("الاف", "")):
        return None
    n = float(m.group(1))
    if "مليون" in s:
        return int(n * 1_000_000)
    if re.search(r"(الف|ألف|آلاف|الاف|alf|\bk\b)", s, re.I):
        return int(n * 1000)
    return int(n)


def check_row(r, lo=None, hi=None):
    """Return (errors, warnings) for one parsed row."""
    err, warn = [], []
    e = err.append

    if set(r) != TOP_KEYS:
        return [f"top-level keys must be exactly {sorted(TOP_KEYS)}, got {sorted(r)}"], warn
    if not re.fullmatch(r"tkt_\d{6}", str(r["id"])):
        e("bad id format")
    elif lo is not None and not (lo <= int(r["id"][4:]) <= hi):
        e(f"id outside assigned range {lo}-{hi}")
    text = r["text"]
    if not isinstance(text, str) or len(text) < 5:
        return err + ["text too short"], warn
    if r["channel"] not in {"app", "whatsapp", "telegram"}:
        e("bad channel")
    try:
        created = datetime.fromisoformat(r["created_at"])
        if not r["created_at"].endswith("+03:00"):
            e("created_at must end with +03:00")
    except Exception:
        return err + ["created_at not ISO date-time"], warn

    L, meta = r["labels"], r["meta"]
    if set(L) != LABEL_KEYS:
        return err + [f"labels keys must be {sorted(LABEL_KEYS)}"], warn
    F = L["fields"]
    if set(F) != FIELD_KEYS:
        return err + [f"fields keys must be {sorted(FIELD_KEYS)}"], warn
    if set(meta) != {"split", "source", "generator", "edge_case", "style", "reviewed"}:
        return err + ["meta keys must be split, source, generator, edge_case, style, reviewed"], warn

    cat, sec = L["category"], L["secondary_category"]
    if cat not in CATEGORIES:
        e("bad category")
        return err, warn
    if sec is not None and (sec not in CATEGORIES or sec == cat):
        e("bad secondary_category")
    if L["priority"] not in RANK:
        e("bad priority")
        return err, warn
    flags = L["flags"]
    if not isinstance(flags, list) or len(set(flags)) != len(flags) or not set(flags) <= FLAGS:
        e("flags must be a unique list from the enum")
        return err, warn
    flags = set(flags)
    esc, reason, draft = L["escalate"], L["escalate_reason"], r["draft_reply"]
    edge, style = meta["edge_case"], meta["style"]
    if edge not in EDGE_CASES:
        e("bad edge_case")
    if meta["source"] != "synthetic" or meta["split"] not in {"train", "val", "test"} or meta["reviewed"] is not False:
        e('meta must be split "train", source "synthetic", reviewed false (build script reassigns split)')
    if not isinstance(style, dict) or set(style) != {"region", "tone", "length", "typos", "arabizi", "english_mix"}:
        return err + ["style keys must be region, tone, length, typos, arabizi, english_mix"], warn
    for k, allowed in STYLE_ENUMS.items():
        if style[k] not in allowed:
            e(f"bad style.{k}")
    for k in ("typos", "arabizi", "english_mix"):
        if not isinstance(style[k], bool):
            e(f"style.{k} must be boolean")

    # priority never below the category default (and the higher of both defaults for mixed tickets)
    floor = RANK[ROUTING[cat][1]]
    if sec:
        floor = max(floor, RANK[ROUTING[sec][1]])
    if RANK[L["priority"]] < floor:
        e(f"priority {L['priority']} below default for {cat}" + (f"/{sec}" if sec else ""))

    # grounding
    ref, at, dt = F["transaction_ref"], F["amount_text"], F["date_text"]
    if ref is not None and ref not in text:
        e("transaction_ref is not a substring of text")
    if at is not None and at not in text:
        e("amount_text is not a substring of text")
    if dt is not None and dt not in text:
        e("date_text is not a substring of text")
    if (F["amount_iqd"] is None) != (at is None):
        e("amount_iqd and amount_text must both be null or both set")
    if (F["date"] is None) != (dt is None):
        e("date and date_text must both be null or both set")
    if F["amount_iqd"] is not None:
        if not isinstance(F["amount_iqd"], int) or isinstance(F["amount_iqd"], bool) or F["amount_iqd"] <= 0:
            e("amount_iqd must be a positive integer")
        elif at is not None:
            parsed = parse_amount(at)
            if parsed is not None and parsed != F["amount_iqd"]:
                e(f"amount_iqd {F['amount_iqd']} does not match amount_text '{at}' (parsed {parsed})")
    if F["date"] is not None:
        try:
            d = datetime.strptime(F["date"], "%Y-%m-%d").date()
            cd = created.date()
            if d > cd or d < cd - timedelta(days=60):
                e("date must be on/before created_at and within 60 days")
            found = None
            for phrase in sorted(REL_DAYS, key=len, reverse=True):
                if dt and phrase in dt:
                    found = phrase
                    break
            if found:
                want = cd + timedelta(days=REL_DAYS[found])
                okdates = {want}
                if REL_DAYS[found] == 0 and created.hour < 4:
                    okdates.add(want - timedelta(days=1))
                if d not in okdates:
                    e(f"date {F['date']} wrong for '{found}' with created_at {r['created_at'][:10]} (expected {want})")
            else:
                for name, wd in WEEKDAYS.items():
                    if dt and name in dt:
                        gap = (cd - d).days
                        if d.weekday() != wd or not (1 <= gap <= 7):
                            e(f"date {F['date']} is not the most recent {name} before {cd}")
                        break
                else:
                    warn.append(f"unrecognised date_text '{dt}', date not checked")
        except ValueError:
            e("date not YYYY-MM-DD")

    # flag / escalation consistency
    if ref is None and cat in TRANSACTIONAL and "missing_reference" not in flags:
        e("transactional category with no transaction_ref needs the missing_reference flag")
    if "missing_reference" in flags and ref is not None:
        e("missing_reference flag but transaction_ref is set")
    if ("mixed_issue" in flags) != (sec is not None):
        e("mixed_issue flag must match secondary_category being set")
    must_escalate = bool(flags & {"mixed_issue", "instruction_in_text", "ambiguous_category"})
    if must_escalate and not esc:
        e("mixed_issue / instruction_in_text / ambiguous_category require escalate=true")
    if esc and not must_escalate:
        e("escalate=true only for mixed_issue, instruction_in_text or ambiguous_category tickets")
    if esc:
        if not isinstance(reason, str) or words(reason) < 4:
            e("escalate=true needs a short English escalate_reason")
        if draft != "":
            e("draft_reply must be an empty string when escalate=true")
    else:
        if reason is not None:
            e("escalate_reason must be null when escalate=false")
        if not isinstance(draft, str) or not draft.strip():
            e("draft_reply required when escalate=false")

    # edge_case consistency
    if (edge == "two_problems") != ("mixed_issue" in flags):
        e("edge_case two_problems <-> mixed_issue flag")
    if (edge == "injection") != ("instruction_in_text" in flags):
        e("edge_case injection <-> instruction_in_text flag")
    if edge == "no_reference" and (ref is not None or "missing_reference" not in flags):
        e("no_reference needs transaction_ref null + missing_reference flag")
    if edge == "arabizi" and not style["arabizi"]:
        e("edge arabizi needs style.arabizi true")
    if edge == "english_mix" and not style["english_mix"]:
        e("edge english_mix needs style.english_mix true")
    if edge == "very_short" and style["length"] != "very_short":
        e("edge very_short needs style.length very_short")
    if edge == "long_rant" and (style["length"] != "long" or words(text) < 120):
        e("edge long_rant needs style.length long and >= 120 words")
    if edge == "amount_in_words" and (at is None or re.search(r"[0-9٠-٩]", at)):
        e("amount_in_words needs an amount_text written in words (no digits)")
    if edge == "relative_date" and dt is None:
        e("relative_date needs date_text")

    # length bin
    n = words(text)
    lo_n, hi_n = LENGTH_BINS.get(style["length"], (0, 0))
    if not (lo_n <= n <= hi_n):
        e(f"style.length={style['length']} but text has {n} words (bins: {LENGTH_BINS})")

    # script checks
    stripped = re.sub(r"TX\d+", "", text)
    latin = len(re.findall(r"[A-Za-z]", stripped))
    if style["arabizi"] and latin < 8:
        e("style.arabizi true but text has almost no Latin letters")
    if not style["arabizi"] and not style["english_mix"] and latin > 0:
        e("Latin letters in text but arabizi/english_mix are both false")
    if style["english_mix"] and not style["arabizi"] and not re.search(r"[A-Za-z]{3,}", stripped):
        e("style.english_mix true but no English word in text")

    # draft rules
    if draft:
        if words(draft) > 60:
            e("draft_reply longer than 60 words")
        for p in PROMISE_WORDS:
            if p in draft:
                e(f"draft_reply contains promise word '{p}'")
        for p in SECRET_REQUESTS:
            if p in draft:
                e(f"draft_reply asks for a secret: '{p}'")
        team = ROUTING[cat][0]
        if not any(w in draft for w in TEAM_WORDS[team]):
            e(f"draft_reply must name the team ({'/'.join(TEAM_WORDS[team])})")
        if ref and ref not in draft:
            e("draft_reply must repeat the transaction_ref")
        if re.search(r"[A-Za-z]", re.sub(r"TX\d+", "", draft)):
            e("draft_reply must be Arabic script only (no Latin letters except the TX ref)")
    return err, warn


def near_duplicates(rows, threshold=0.85):
    out = []
    texts = [(r["id"], r["text"]) for r in rows]
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            a, b = texts[i][1], texts[j][1]
            if abs(len(a) - len(b)) > 0.5 * max(len(a), len(b)):
                continue
            if SequenceMatcher(None, a, b).quick_ratio() > threshold and SequenceMatcher(None, a, b).ratio() > threshold:
                out.append((texts[i][0], texts[j][0]))
    return out


def load(path):
    rows, errors = [], []
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as ex:
                errors.append(f"line {i}: invalid JSON ({ex})")
    return rows, errors


def summarize(rows):
    c = Counter(r["labels"]["category"] for r in rows)
    ln = Counter(r["meta"]["style"]["length"] for r in rows)
    ed = Counter(r["meta"]["edge_case"] for r in rows)
    esc = sum(r["labels"]["escalate"] for r in rows)
    reg = Counter(r["meta"]["style"]["region"] for r in rows)
    print(f"rows={len(rows)} escalated={esc} ({esc / max(len(rows), 1):.0%})")
    print("category:", dict(c))
    print("length:  ", dict(ln))
    print("edge:    ", dict(ed))
    print("region:  ", dict(reg))
    print("no amount:", sum(r['labels']['fields']['amount_iqd'] is None for r in rows),
          "| no ref:", sum(r['labels']['fields']['transaction_ref'] is None for r in rows))


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--range", nargs=2, type=int, metavar=("LO", "HI"))
    a = ap.parse_args()
    lo, hi = a.range if a.range else (None, None)
    all_rows, bad = [], 0
    for path in a.files:
        rows, errs = load(path)
        for m in errs:
            print(f"{path}: {m}")
            bad += 1
        for i, r in enumerate(rows, 1):
            try:
                er, wa = check_row(r, lo, hi)
            except Exception as ex:  # malformed structure
                er, wa = [f"unexpected structure: {ex!r}"], []
            rid = r.get("id", f"row{i}") if isinstance(r, dict) else f"row{i}"
            for m in er:
                print(f"ERROR {rid}: {m}")
                bad += 1
            for m in wa:
                print(f"warn  {rid}: {m}")
        all_rows += [r for r in rows if isinstance(r, dict) and "id" in r]
    ids = Counter(r["id"] for r in all_rows)
    for k, v in ids.items():
        if v > 1:
            print(f"ERROR duplicate id {k}")
            bad += 1
    for x, y in near_duplicates([r for r in all_rows if isinstance(r.get("text"), str)]):
        print(f"ERROR near-duplicate text: {x} ~ {y}")
        bad += 1
    summarize([r for r in all_rows if "labels" in r and "meta" in r and isinstance(r["meta"].get("style"), dict)])
    print("OK" if not bad else f"{bad} error(s)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
