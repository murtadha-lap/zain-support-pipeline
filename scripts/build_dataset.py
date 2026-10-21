"""Merge data/raw/*.jsonl into the final dataset.

- validates every row (scripts/validate_dataset.py rules) and checks cross-file near-duplicates
- assigns meta.split stratified by category: 200 test, 100 val, rest train (seed 42)
- writes data/tickets.jsonl (all rows, full examples: text + labels + draft_reply + meta, no system prompt)
  and data/train.jsonl, data/val.jsonl, data/test.jsonl

Usage: python scripts/build_dataset.py
"""
import glob
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_dataset as v  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
N_TEST, N_VAL = 200, 100


def shingles(s, k=5):
    s = "".join(s.split())
    return {s[i:i + k] for i in range(max(len(s) - k + 1, 1))}


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    rows, bad = [], 0
    for path in sorted(glob.glob(str(ROOT / "data" / "raw" / "*.jsonl"))):
        parsed, errs = v.load(path)
        bad += len(errs)
        for m in errs:
            print(path, m)
        for r in parsed:
            er, _ = v.check_row(r)
            for m in er:
                print(f"ERROR {r.get('id')}: {m}")
            bad += len(er)
            rows.append(r)

    ids = [r["id"] for r in rows]
    if len(set(ids)) != len(ids):
        print("ERROR duplicate ids")
        bad += 1
    sh = [shingles(r["text"]) for r in rows]
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            inter = len(sh[i] & sh[j])
            if inter and inter / len(sh[i] | sh[j]) > 0.6:
                print(f"ERROR near-duplicate: {rows[i]['id']} ~ {rows[j]['id']}")
                bad += 1
    if bad:
        sys.exit(f"{bad} problem(s); fix before building")
    if len(rows) != 1200:
        print(f"warning: {len(rows)} rows (expected 1200)")

    rows.sort(key=lambda r: r["id"])
    rng = random.Random(42)
    by_cat = defaultdict(list)
    for r in rows:
        by_cat[r["labels"]["category"]].append(r)
    n = len(rows)

    def quota(total):
        raw = {c: len(g) * total / n for c, g in by_cat.items()}
        q = {c: int(x) for c, x in raw.items()}
        for c in sorted(raw, key=lambda c: raw[c] - q[c], reverse=True)[: total - sum(q.values())]:
            q[c] += 1
        return q

    qt, qv = quota(N_TEST), quota(N_VAL)
    for c, g in by_cat.items():
        rng.shuffle(g)
        for i, r in enumerate(g):
            r["meta"]["split"] = "test" if i < qt[c] else "val" if i < qt[c] + qv[c] else "train"

    def dump(path, items):
        with open(ROOT / "data" / path, "w", encoding="utf-8", newline="\n") as f:
            for r in items:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    dump("tickets.jsonl", rows)
    for s in ("train", "val", "test"):
        dump(f"{s}.jsonl", [r for r in rows if r["meta"]["split"] == s])
        print(s, sum(r["meta"]["split"] == s for r in rows))
    v.summarize(rows)


if __name__ == "__main__":
    main()
