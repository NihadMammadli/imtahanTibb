"""Draw the fixed variants once: data/variants.json.

20 tests of 50 questions, 5 from each of the 10 blocks the app uses (same split as
buildBlocks in assets/app.js). Within a block the questions are dealt from shuffled
decks, so variants 1-10 never share a question and all 20 together cover the bank.

The variants must stay the same, so this won't overwrite an existing file. To draw
new ones, delete data/variants.json and re-run (saved best scores won't match then).
Run: python3 scripts/build_variants.py
"""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "data" / "variants.json"
VARIANTS = 20
BLOCKS = 10
PER_BLOCK = 5
SEED = 522


def split(nums):
    base, extra = divmod(len(nums), BLOCKS)
    start = 0
    for i in range(BLOCKS):
        size = base + (i < extra)
        yield nums[start:start + size]
        start += size


def deal(rng, block):
    """PER_BLOCK questions for each variant, dealt from back-to-back shuffled decks."""
    while True:
        seq = []
        while len(seq) < VARIANTS * PER_BLOCK:
            seq += rng.sample(block, len(block))
        hands = [seq[i * PER_BLOCK:(i + 1) * PER_BLOCK] for i in range(VARIANTS)]
        # A hand that straddles two decks can repeat a question; redraw if so.
        if all(len(set(hand)) == PER_BLOCK for hand in hands):
            return hands


def main():
    if DEST.exists():
        raise SystemExit(f"{DEST.relative_to(ROOT)} already exists; delete it to draw new variants.")
    questions = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))
    keyed = {q["n"] for q in questions if q["a"]}
    rng = random.Random(SEED)
    variants = [[] for _ in range(VARIANTS)]
    for block in split([q["n"] for q in questions]):
        for variant, hand in zip(variants, deal(rng, [n for n in block if n in keyed])):
            variant.extend(hand)

    lines = ",\n".join(json.dumps(sorted(v)) for v in variants)
    DEST.write_text(f"[\n{lines}\n]\n", encoding="utf-8")
    covered = len({n for v in variants for n in v})
    print(f"{VARIANTS} variants of {BLOCKS * PER_BLOCK} -> {DEST.relative_to(ROOT)}; "
          f"they cover {covered} of {len(questions)} questions")


if __name__ == "__main__":
    main()
