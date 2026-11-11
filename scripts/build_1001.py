"""Build data/questions1001.json from questions_1001.json for the "1001 sual" tab.

- Questions that are also in the 522 bank (questions_answers.json) use the 522 bank's
  text, options and answer, so a shared question reads and scores the same in both tabs.
  They get "m": the question's number in the 522 bank. Questions without "m" are new.
- "usm": true marks ultrasound questions (the USM list below).
- "dup": n marks a question that repeats an earlier one in the 1001 set. The app leaves
  these out of the topic blocks and variants; they stay in the question bank.

Rebuild data/questions.json first (scripts/build_questions.py), since shared questions
are copied from it.
Run: python3 scripts/build_1001.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Ultrasound questions: every question whose text names ultrasound (USM, exo-, Doppler,
# sonoqrafiya, transvaginal, akustik kölgə, ...), the ones whose right answer is
# ultrasound, and ultrasound measurements/findings that don't name the method
# (prenatal, gynaecological norms, organ sizes, Doppler flow). Edit and re-run.
USM = {
    56, 71, 139, 155, 241, 248, 252, 253, 256, 257, 262, 268, 278, 279, 280, 281, 282, 286,
    287, 290, 291, 292, 322, 323, 324, 326, 327, 338, 340, 341, 342, 343, 344, 345, 346, 349,
    350, 355, 357, 359, 365, 366, 371, 372, 373, 374, 375, 394, 401, 402, 405, 409, 416, 417,
    422, 424, 425, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441,
    443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 464, 467, 468, 469,
    470, 471, 472, 473, 475, 476, 478, 479, 480, 481, 482, 483, 484, 485, 487, 488, 489, 490,
    491, 492, 493, 494, 495, 496, 497, 498, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509,
    513, 514, 515, 516, 518, 519, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 531, 532,
    533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550,
    551, 552, 553, 554, 557, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 608, 730,
    731, 824, 854, 855, 856, 857, 861, 862, 863, 872, 873, 874, 876, 877, 881, 891,
}

# Pairs the text matcher can't decide on its own: 1001 number -> 522 number (or None).
SAME_AS = {205: 329}

# Where the 522 scan lost options (522 Q319, Q374, Q524 have 3, 2 and 3), the shared
# question uses the 1001 text and options; the key is the 522 key, found by option text,
# unless set here. 522 Q319's key was filled in by hand from a scan without options D-E;
# the 1001 PDF marks D "Mədə", the standard landmark for abdominal circumference.
KEY_FROM_1001 = {439: "d"}

TR = str.maketrans({"ə": "e", "ı": "i", "ü": "u", "ö": "o", "ğ": "g", "ş": "s", "ç": "c",
                    "Ə": "e", "I": "i", "İ": "i", "Ü": "u", "Ö": "o", "Ğ": "g", "Ş": "s", "Ç": "c"})


def grams(text, k=4):
    s = re.sub(r"[^a-z0-9]", "", text.translate(TR).lower())
    return {s[i:i + k] for i in range(max(1, len(s) - k + 1))}


def jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def features(stem, options):
    return grams(stem), grams(" ".join(sorted(o for o in options if o)))


def similarity(fa, fb):
    """Weighted text similarity of stems and option sets; >= 0.6 means the same question."""
    return 0.6 * jaccard(fa[0], fb[0]) + 0.4 * jaccard(fa[1], fb[1])


def main():
    rows = json.loads((ROOT / "questions_1001.json").read_text(encoding="utf-8"))
    bank = json.loads((ROOT / "data" / "questions.json").read_text(encoding="utf-8"))
    by522 = {q["n"]: q for q in bank}
    f522 = {q["n"]: features(q["q"], q["o"].values()) for q in bank}

    out, feats = [], {}
    for row in rows:
        n = row["n"]
        options = {l: row[f"answer_{l}"].strip() for l in "abcde" if row[f"answer_{l}"].strip()}
        answer = row["right_answer"].strip().lower()
        if answer and answer not in options:
            raise SystemExit(f"Q{n}: right answer '{answer}' has no option text")
        feats[n] = features(row["question"], options.values())

        match = SAME_AS.get(n)
        if n not in SAME_AS:
            best = max(f522, key=lambda m: similarity(feats[n], f522[m]))
            if similarity(feats[n], f522[best]) >= 0.6:
                match = best
        if match and len(by522[match]["o"]) < len(options):
            shared = by522[match]
            key = KEY_FROM_1001.get(n)
            if key is None:
                key_text = grams(shared["o"][shared["a"]])
                key = max(options, key=lambda l: jaccard(grams(options[l]), key_text))
            entry = {"n": n, "q": row["question"].strip(), "o": options, "a": key, "m": match}
        elif match:
            shared = by522[match]
            entry = {"n": n, "q": shared["q"], "o": shared["o"], "a": shared["a"], "m": match}
        else:
            entry = {"n": n, "q": row["question"].strip(), "o": options, "a": answer}
        if n in USM:
            entry["usm"] = True
        out.append(entry)

    # Repeats inside the 1001 set: mark the later copy. Two shared questions repeat only if
    # they are the same 522 question (series like 962-966 differ by a few words only).
    for i, entry in enumerate(out):
        for earlier in out[:i]:
            if "m" in entry and "m" in earlier:
                repeat = entry["m"] == earlier["m"]
            else:
                repeat = similarity(feats[entry["n"]], feats[earlier["n"]]) >= 0.9
            if repeat:
                entry["dup"] = earlier["n"]
                break

    unknown = USM - {q["n"] for q in out}
    if unknown:
        raise SystemExit(f"USM has numbers that don't exist: {sorted(unknown)}")

    dest = ROOT / "data" / "questions1001.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    shared = sum(1 for q in out if "m" in q)
    usm = [q for q in out if q.get("usm") and "dup" not in q]
    print(f"{len(out)} questions -> {dest.relative_to(ROOT)}")
    print(f"in the 522 bank: {shared}; new: {len(out) - shared}; "
          f"ultrasound: {len(usm)} ({sum(1 for q in usm if 'm' not in q)} new)")
    print(f"repeats: {[(q['n'], q['dup']) for q in out if 'dup' in q]}; "
          f"no answer key: {[q['n'] for q in out if not q['a']]}")


if __name__ == "__main__":
    main()
