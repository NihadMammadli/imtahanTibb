# ŞD Suallar

Mobile-first quiz app for the 522 Şüa diaqnostikası exam questions. Plain HTML/CSS/JS, no build step, no login. Progress is saved in the browser (localStorage).

## Features

- **Three ways to split the questions:** 10 blocks (~52 each), 5 blocks (~104 each), or all 522 at once.
- **Random 50**: a new set every time, 5 random questions from each of the 10 blocks. An unfinished set resumes; after finishing, tapping it draws a new one. `RANDOM_PER_BLOCK` in `assets/app.js` sets the count.
- **Sabit variantlar**: 20 fixed tests of 50 (5 from each of the 10 blocks) that never change, so scores can be compared over time. Variants 1–10 share no questions and cover 500; all 20 cover the whole bank. The sets live in `data/variants.json`.
- **Numerical questions** (sizes, times, doses, energies, segment counts): two blocks of 32 and one with all 64. The list is `NUMERIC` in `scripts/build_questions.py`.
- **Export** from any result page, or for overall progress from the home page: wrong question numbers (copy/share), or a full report as PDF (via the print dialog), Word (.doc) or TXT.
- **Practice mode** shows the right answer after each question. **Exam mode** shows answers and the score at the end.
- Optional question shuffling, a question grid for jumping around, swipe and keyboard navigation (A–E / 1–5, ← →).
- Results with a per-question review, "repeat mistakes", a global "Səhvlərim" list, and a searchable question bank. Search also matches without Azerbaijani letters (`seh` finds `səh`).
- Light/dark theme, installable to the home screen, works offline after the first visit.

## Data

- `questions_answers.json` is the source (see `info.md` for scan issues).
- `data/questions.json` is what the app loads. Rebuild it after editing the source:

  ```sh
  python3 scripts/build_questions.py
  ```

  Each entry is `{ "n": original number, "q": question, "o": { "a": …, … }, "a": right letter, "num": true if numerical }`. Empty options are dropped. Every question has an answer key.
- `data/variants.json` holds the 20 fixed variants as lists of question numbers. `scripts/build_variants.py` drew them once and won't overwrite the file. To draw new ones, delete it and run `python3 scripts/build_variants.py` (saved best scores for the old variants won't match).

## Run locally

`fetch` doesn't work from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo.
2. Repo **Settings → Pages → Build and deployment**: Source **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site appears at `https://nihadmammadli.github.io/imtahanTibb/`. All paths are relative, so the sub-path works.

The source PDFs in `docs/` are git-ignored, so they aren't published.

After changing app files, bump `CACHE` in `sw.js` (e.g. `sd-suallar-v2`) so installed copies drop the old cache. The service worker is network-first, so online users get fresh files anyway.
