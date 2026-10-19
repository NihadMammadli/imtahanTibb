"""Build data/questions.json from questions_answers.json.

Adds the original question number from the PDFs (Q134 and Q418 are missing
from the source, so numbering skips them) and drops empty answer options.
Run: python3 scripts/build_questions.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIPPED = {134, 418}  # not present in the scans, see info.md


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
        out.append({"n": num, "q": item["question"].strip(), "o": options, "a": answer})

    dest = ROOT / "data" / "questions.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    no_key = [q["n"] for q in out if not q["a"]]
    print(f"{len(out)} questions -> {dest.relative_to(ROOT)}; no answer key: {no_key}")


if __name__ == "__main__":
    main()
