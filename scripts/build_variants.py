"""Draw the fixed variants once: data/variants.json (522 tab) or data/variants1001.json.

Tests of 50 questions, 5 from each of 10 equal blocks of the bank in order (for the 522
bank the same split as buildBlocks in assets/app.js), so each variant covers the whole
bank evenly. Within a block the questions are dealt from shuffled decks, so variants
never share a question until a block runs out. Questions without an answer key and
repeats inside the 1001 set ("dup") are left out.

The variants must stay the same, so this won't overwrite an existing file. To draw new
ones, delete the file and re-run (saved best scores won't match then).
Run: python3 scripts/build_variants.py          (522 bank, 20 variants)
     python3 scripts/build_variants.py 1001     (1001 bank, 5 variants)
"""
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANKS = {
    "522": {"source": "data/questions.json", "dest": "data/variants.json", "variants": 20, "seed": 522},
    "1001": {"source": "data/questions1001.json", "dest": "data/variants1001.json", "variants": 5, "seed": 1001},
}
BLOCKS = 10
PER_BLOCK = 5


def split(nums):
    base, extra = divmod(len(nums), BLOCKS)
    start = 0
    for i in range(BLOCKS):
        size = base + (i < extra)
        yield nums[start:start + size]
        start += size


def deal(rng, block, variants):
    """PER_BLOCK questions for each variant, dealt from back-to-back shuffled decks."""
    while True:
        seq = []
        while len(seq) < variants * PER_BLOCK:
            seq += rng.sample(block, len(block))
        hands = [seq[i * PER_BLOCK:(i + 1) * PER_BLOCK] for i in range(variants)]
        # A hand that straddles two decks can repeat a question; redraw if so.
        if all(len(set(hand)) == PER_BLOCK for hand in hands):
            return hands


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "522"
    if name not in BANKS:
        raise SystemExit(f"Unknown bank '{name}'; use one of {', '.join(BANKS)}.")
    cfg = BANKS[name]
    dest = ROOT / cfg["dest"]
    if dest.exists():
        raise SystemExit(f"{cfg['dest']} already exists; delete it to draw new variants.")
    questions = json.loads((ROOT / cfg["source"]).read_text(encoding="utf-8"))
    usable = {q["n"] for q in questions if q["a"] and "dup" not in q}
    rng = random.Random(cfg["seed"])
    variants = [[] for _ in range(cfg["variants"])]
    for block in split([q["n"] for q in questions]):
        hands = deal(rng, [n for n in block if n in usable], cfg["variants"])
        for variant, hand in zip(variants, hands):
            variant.extend(hand)

    lines = ",\n".join(json.dumps(sorted(v)) for v in variants)
    dest.write_text(f"[\n{lines}\n]\n", encoding="utf-8")
    covered = len({n for v in variants for n in v})
    print(f"{cfg['variants']} variants of {BLOCKS * PER_BLOCK} -> {cfg['dest']}; "
          f"they cover {covered} of {len(questions)} questions")


if __name__ == "__main__":
    main()
