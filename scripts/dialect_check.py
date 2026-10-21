"""Flag non-Iraqi wording (MSA, Levantine, Egyptian, Gulf) in ticket text and draft replies.

Usage:
    python scripts/dialect_check.py data/raw/agent_01_p*.jsonl        # list every hit
    python scripts/dialect_check.py data/tickets.jsonl --summary       # counts only

A keyword check catches only the obvious words; the spec in docs/generation_spec.md still has to be
read for phrasing. Exit code 1 if any hit is found.
"""
import argparse
import collections
import json
import re
import sys

# marker -> (dialect it belongs to, Iraqi replacement to prefer)
MARKERS = {
    # Levantine
    "مبارح": ("Levantine", "البارحة / امس"), "بدي": ("Levantine", "اريد"), "بدك": ("Levantine", "تريد"),
    "شو": ("Levantine", "شنو"), "هيك": ("Levantine", "هيچ / جذي"), "هون": ("Levantine", "هنا"),
    "كتير": ("Levantine", "هواية / كلش"), "هلأ": ("Levantine", "هسه"), "هلق": ("Levantine", "هسه"),
    "منيح": ("Levantine", "زين"), "مش": ("Levantine/Egyptian", "مو"), "كمان": ("Levantine", "هم / همين"),
    "رح": ("Levantine", "راح"), "هاد": ("Levantine", "هذا"), "هيدا": ("Levantine", "هذا"),
    "اهلين": ("Levantine", "هلا"), "لسا": ("Levantine", "للحين / بعد"), "تاني": ("Levantine/Egyptian", "ثاني"),
    "يعطيك العافية": ("Levantine/Gulf", "عاشت ايدك / تسلم"), "عم": ("Levantine", "دا / گاعد"),
    # Egyptian
    "عايز": ("Egyptian", "اريد"), "عاوز": ("Egyptian", "اريد"), "دلوقتي": ("Egyptian", "هسه"),
    "ليه": ("Egyptian", "ليش"), "كده": ("Egyptian", "هيچ / جذي"), "ازاي": ("Egyptian", "شلون"),
    "فين": ("Egyptian", "وين"), "لسه": ("Egyptian", "للحين / بعد / بعده"), "خالص": ("Egyptian", "ابد / نهائياً"),
    "اوي": ("Egyptian", "هواية / كلش"), "بتاع": ("Egyptian", "مال"), "ايوه": ("Egyptian", "اي / ايه"),
    "عشان": ("Egyptian/Gulf", "علمود / حتى / لأن"), "علشان": ("Egyptian", "علمود / حتى"),
    "حضرتك": ("Egyptian", "حضرتك is rare in Iraq; use استاذ / حجي / عمي"),
    # Gulf
    "ابغى": ("Gulf", "اريد"), "ابي": ("Gulf", "اريد"), "وش": ("Gulf", "شنو"), "الحين": ("Gulf", "هسه"),
    "كذا": ("Gulf", "هيچ / جذي"), "وايد": ("Gulf", "هواية / كلش"), "شفيه": ("Gulf", "شبيه"),
    "ترا": ("Gulf", "تره"), "اشوا": ("Gulf", "الحمدلله"),
    # Modern Standard Arabic
    "كيف": ("MSA", "شلون"), "ماذا": ("MSA", "شنو"), "لماذا": ("MSA", "ليش"), "سوف": ("MSA", "راح"),
    "الآن": ("MSA", "هسه"), "الان": ("MSA", "هسه"), "أيضاً": ("MSA", "هم / همين"), "ايضا": ("MSA", "هم / همين"),
    "أيضا": ("MSA", "هم / همين"), "جداً": ("MSA", "كلش / هواية"), "جدا": ("MSA", "كلش / هواية"),
    "يرجى": ("MSA", "رجاءً / الله يخليك"), "الرجاء": ("MSA", "رجاءً"), "يمكنك": ("MSA", "تگدر"),
    "يمكنني": ("MSA", "اگدر"), "لا يمكن": ("MSA", "ما يصير / ما اگدر"), "استطيع": ("MSA", "اگدر"),
    "أستطيع": ("MSA", "اگدر"), "لا استطيع": ("MSA", "ما اگدر"), "لديك": ("MSA", "عندك"), "لدينا": ("MSA", "عدنا"),
    "لدي": ("MSA", "عندي"), "سيتم": ("MSA", "راح"), "يتم": ("MSA", "يصير / ينعمل"), "قام": ("MSA", "سوى"),
    "قمت": ("MSA", "سويت"), "نقوم": ("MSA", "نسوي"), "يقوم": ("MSA", "يسوي"), "تقوم": ("MSA", "تسوي"),
    "ذلك": ("MSA", "هذا / هاي"), "معك": ("MSA", "وياك"), "معكم": ("MSA", "وياكم"), "من فضلك": ("MSA/Egyptian", "الله يخليك / رجاءً"),
    "لم": ("MSA", "ما"), "لن": ("MSA", "ما راح"), "ليس": ("MSA", "مو"), "ليست": ("MSA", "مو"), "لقد": ("MSA", "drop it"),
    "حيث": ("MSA", "لأن / وين"), "لكي": ("MSA", "حتى / علمود"), "هناك": ("MSA", "اكو"), "كثير": ("MSA", "هواية / كلش"),
    "كثيرا": ("MSA", "هواية"), "نعم": ("MSA", "اي / ايه"), "ولكن": ("MSA", "بس"), "بشكل": ("MSA", "rephrase: صح / عدل / طبيعي"),
    "حالياً": ("MSA", "هسه"), "حاليا": ("MSA", "هسه"), "الذي": ("MSA", "اللي"), "التي": ("MSA", "اللي"),
    "ما هو": ("MSA", "شنو"), "ماهو": ("MSA", "شنو"), "ما هي": ("MSA", "شنو"), "ماهي": ("MSA", "شنو"),
    "يوجد": ("MSA", "اكو"), "لا يوجد": ("MSA", "ماكو"), "توجد": ("MSA", "اكو"), "نحن": ("MSA", "احنا / إحنا"),
    "انتم": ("MSA", "انتو"), "أنتم": ("MSA", "انتو"), "بإمكانك": ("MSA", "تگدر"), "بامكانك": ("MSA", "تگدر"),
    "ارجو": ("MSA", "الله يخليكم / رجاءً / يا ريت"), "أرجو": ("MSA", "الله يخليكم / رجاءً / يا ريت"),
    "شكرا لك": ("MSA", "شكراً / تسلم"), "شكراً لك": ("MSA", "شكراً / تسلم"), "سأقوم": ("MSA", "راح اسوي"),
    "سنقوم": ("MSA", "راح نسوي"), "سريعاً": ("MSA", "بسرعة"), "قريباً": ("MSA", "عن قريب"),
    "بأسرع": ("MSA", "بسرعة / بأقرب فرصة"), "في اقرب": ("MSA", "بأقرب"), "في أقرب": ("MSA", "بأقرب"),
    "نأسف": ("MSA", "نعتذر / آسفين"), "الاستفسار": ("MSA", "السؤال"), "استفسار": ("MSA", "سؤال"),
    "بالتالي": ("MSA", "يعني / فـ"), "ثم": ("MSA", "وبعدين"), "هل يمكن": ("MSA", "ممكن / اگدر"),
    "لا أعلم": ("MSA", "ما أدري"), "لا اعلم": ("MSA", "ما أدري"), "لا أعرف": ("MSA", "ما أعرف / ما أدري"),
    "ماذا أفعل": ("MSA", "شسوي / شنو أسوي"), "أين": ("MSA", "وين"), "اين": ("MSA", "وين"), "متى": ("MSA", "شوكت / يمتى"),
    "كم": ("MSA", "شگد / اشكثر (only when asking how much)"), "فقط": ("MSA", "بس"), "أريد أن": ("MSA", "اريد"),
    "يجب": ("MSA", "لازم"), "ينبغي": ("MSA", "لازم"), "بالفعل": ("MSA", "فعلاً / صدگ"), "مرة أخرى": ("MSA", "مرة ثانية"),
    "مرة اخرى": ("MSA", "مرة ثانية"), "أخرى": ("MSA", "ثانية"), "اخرى": ("MSA", "ثانية"), "آخر": ("MSA", "ثاني"),
    "حسناً": ("MSA", "زين / طيب"), "حسنا": ("MSA", "زين / طيب"), "إلى": ("MSA", "لـ / على"), "الى": ("MSA", "لـ / على"),
}
AR = r"[ء-يٰ-ە]"


def hits(s):
    out = []
    for w, (kind, alt) in MARKERS.items():
        if re.search(rf"(?<!{AR}){re.escape(w)}(?!{AR})", s):
            out.append((w, kind, alt))
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--summary", action="store_true")
    a = ap.parse_args()
    total = collections.Counter()
    n = 0
    for path in a.files:
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            for field in ("text", "draft_reply"):
                for w, kind, alt in hits(r[field]):
                    n += 1
                    total[(field, w, kind, alt)] += 1
                    if not a.summary:
                        print(f"{r['id']} {field:11s} [{kind}] '{w}' -> {alt}")
    for (field, w, kind, alt), c in sorted(total.items(), key=lambda x: -x[1]):
        print(f"{c:4d} {field:11s} [{kind}] {w} -> {alt}")
    print(f"{n} hit(s)" if n else "OK: no non-Iraqi markers found")
    sys.exit(1 if n else 0)


if __name__ == "__main__":
    main()
