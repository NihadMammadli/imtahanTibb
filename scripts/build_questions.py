"""Build data/questions.json from questions_answers.json.

Adds the original question number from the PDFs (Q134 and Q418 are missing
from the source, so numbering skips them) and drops empty answer options.
Run: python3 scripts/build_questions.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIPPED = {134, 418}  # not present in the scans, see info.md

# Questions whose answer is a number to memorise: sizes, times, doses, energies,
# half-lives, percentages, hormone levels, segment counts. Marked "num": true and
# used for the "Rəqəmli suallar" blocks. Edit this list and re-run to change them.
NUMERIC = {
    18, 21, 61, 65, 66, 68, 69, 70, 71, 72, 73, 74, 91, 96, 110, 112,
    120, 121, 122, 123, 142, 143, 144, 145, 146, 154, 155, 157, 163, 164, 165,
    171, 172, 173, 174, 175, 178, 179, 183, 184, 185, 186, 187, 189, 192, 194,
    419, 420, 422, 423, 424, 425, 426, 427, 428, 432, 433, 434,
    486, 508, 510, 516, 518, 519,
}


def original_numbers(count):
    n = 0
    for _ in range(count):
        n += 1
        while n in SKIPPED:
            n += 1
        yield n


def main():
    src = json.loads((ROOT / "questions_answers.json").read_text(encoding="utf-8"))
    out = []
    for num, item in zip(original_numbers(len(src)), src):
        options = {
            letter: item[f"answer_{letter}"].strip()
            for letter in "abcde"
            if item[f"answer_{letter}"].strip()
        }
        answer = item["right_answer"].strip().lower()
        if answer and answer not in options:
            raise SystemExit(f"Q{num}: right answer '{answer}' has no option text")
        entry = {"n": num, "q": item["question"].strip(), "o": options, "a": answer}
        if num in NUMERIC:
            entry["num"] = True
        out.append(entry)

    unknown = NUMERIC - {q["n"] for q in out}
    if unknown:
        raise SystemExit(f"NUMERIC has numbers that don't exist: {sorted(unknown)}")

    dest = ROOT / "data" / "questions.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    no_key = [q["n"] for q in out if not q["a"]]
    print(f"{len(out)} questions -> {dest.relative_to(ROOT)}; "
          f"numeric: {len(NUMERIC)}; no answer key: {no_key}")


if __name__ == "__main__":
    main()
