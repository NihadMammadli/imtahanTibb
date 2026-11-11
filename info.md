The file has 522 questions in your format, in the same order as the PDFs. right_answer is the letter that has the parentheses in the scan.

A few places in the scans don’t fit the format cleanly:

Not in the exam (numbering skips them):
Q134 and Q418 don't exist.
Answers filled in by hand (the scan has no letter in parentheses): Q72 c, Q75 b, Q76 d, Q77 a, Q78 b, Q118 a, Q121 a, Q136 a, Q148 b, Q319 c, Q479 a.
Fewer than 5 options (empty answer fields ""):
Q139 and Q195 have options A–D.
Q319 and Q524 have options A–C.
Q374 has options A–B.
Q145 has no option B in the scan.
Q36: the printed (A) was crossed out by hand and (B) was circled instead, so I used b.
Q380: it has two options labelled D. I put both into answer_d, separated by “ / “.

## 1001 sual (questions_1001.json)

From "1001 SUAL TAM DR.LEYLA" (PDF made in Canva). Numbers 289, 361, 607 and 882 don't exist, so there are 997 questions.

Right answers are yellow highlight boxes behind the option text, placed by hand and sometimes shifted half a line. `scripts/extract_1001.py` reads them two ways and the 21 questions where the readings disagreed were checked on the page (`ANSWER_FIXES`). Q281 has no highlight, so it has no answer key. Q453 and Q856: the box sits between D and E; D was used, as in the other shifted boxes.

Text the PDF garbles (overlapping text boxes) was retyped from the page (`TEXT_FIXES`), and words the PDF glues together were split (`GLUED` plus a dictionary). The PDF's font also drops the marks on capital İ, Ö, Ü ("Iki", "Od"); these were restored. Some glued words may remain.

Other issues in the PDF:
- Q230 prints "D)" twice; the second is option E.
- Q801: option D is printed over E and its text is lost, so the question has options A, B, C, E.
- Q697: options A and D are the same answer.

Shared with the 522 bank (305 questions): the app uses the 522 text and answer. Where the 522 scan lost options (522 Q319, Q374, Q524) it uses the 1001 text with all five options. The 1001 highlights disagree with the 522 key on these:
- 1001 Q439 / 522 Q319 (abdominal circumference landmark): the 522 scan only had A–C and its key "c, Öd kisəsi" was filled in by hand; the 1001 PDF marks D "Mədə", the standard answer. The 1001 tab uses D. The 522 tab still has the old key.
- 1001 Q514 / 522 Q405, Q570 / Q504, Q959 / Q427, Q971 / Q439, Q990 / Q458: the 1001 tab uses the 522 key. For Q959 (lacerum = C3), Q971 (MoyaMoya) and Q990 (T2*/SWI) the 522 key is the standard answer.

