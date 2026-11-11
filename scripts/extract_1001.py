"""Extract the "1001 SUAL" PDF into questions_1001.json (one-time step).

The PDF (made in Canva) marks each right answer with a yellow highlight image placed
behind the option text. This script reads text and image positions with poppler's
`pdftohtml -xml`, rebuilds questions and options, and maps each highlight to the option
it covers. Highlights were placed by hand and are sometimes shifted half a line, so the
answer is computed two ways (largest vertical overlap, and "a box shifted down belongs to
the line above"). Where they disagree the page was checked by eye; those verdicts are in
ANSWER_FIXES. Text that the PDF garbles (overlapping text boxes) is in TEXT_FIXES.

The output has the same layout as questions_answers.json plus "n" (the number in the
PDF). Numbers 289, 361, 607 and 882 don't exist in the PDF. Edit questions_1001.json by
hand afterwards; re-running this script overwrites it.

Needs poppler-utils (pdftohtml).
Run: python3 scripts/extract_1001.py ["rawData/1001 SUAL TAM DR.LEYLA.pdf.pdf"]
"""
import json
import math
import re
import subprocess
import sys
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PDF = ROOT / "rawData" / "1001 SUAL TAM DR.LEYLA.pdf.pdf"
DEST = ROOT / "questions_1001.json"

# Answers checked by eye where the two highlight readings disagree or find nothing.
# "" = the PDF has no highlight for this question.
ANSWER_FIXES = {
    142: "b", 155: "e", 264: "a", 281: "", 334: "a", 343: "d", 453: "d", 514: "b",
    519: "d", 647: "c", 704: "a", 709: "b", 710: "a", 804: "e", 823: "a", 845: "c",
    856: "d", 873: "c", 959: "a", 971: "d", 981: "a",
}

# Text the PDF garbles: overlapping text boxes, two options on one label, lost options.
# Values replace the parsed stem ("q") and/or individual options.
TEXT_FIXES = {
    142: {"q": "Qida borusunun distal hissəsinin şaquli vəziyyətdə öyrənilməsinin optimal "
               "rentgenoloji proyeksiyası hansıdır?"},
    155: {"q": "USM zamanı uşaqlarda qida borusunun abdominal hissəsi dəliyinin eni nə qədərdir?"},
    180: {"q": "Qaraciyərin bədxassəli şişləri əsasən hansı damardan qidalanır?",
          "a": "Qaraciyər venalarından"},
    230: {"d": "Oynaqların başları", "e": "Apofizlər"},  # the PDF prints "D)" twice
    283: {"q": "Beyincik hemangioblastomları, spinal hemangioblastomlar, göz almasının və "
               "pankreasın kistalarının yaranması ilə müşayiət olunan xəstəlik hansıdır?"},
    635: {"q": "Poliserozit daha çox hansı xəstəlik üçün xarakterikdir?"},
    637: {"a": "Plevra boşluğunda mayenin toplanması", "b": "Diafraqmanın hərəkətinin pozulması"},
    658: {"q": "Böyüklərə nisbətən uşaqlarda diafraqma harada yerləşir?"},
    792: {"q": "Hematogen osteomiyelitin periostal reaksiyası və sümükdə rentgenoloji "
               "dəyişikliklər nə vaxt müəyyən olunur?"},
    801: {"d": "", "e": "Heç biri"},  # option D is printed over E and its text is lost
    30: {"a": "Reproduktiv dövrdə olan qadınlarda flüroqrafiyanı istifadə etməmək",
         "b": "Rentgenoloji müayinələri menstrual tsikldən əvvəl aparmaq",
         "c": "Rentgenoloji müayinələrdən əvvəl qadını ginekoloqun yanına göndərmək",
         "e": "Rentgenoloji müayinələri menstrual tsiklin ikinci yarısında aparmaq"},
    716: {"q": "Süd vəzilərinin mammoqrafik müayinəsini aparmaq menstrual siklin hansı günlərində "
               "daha əlverişlidir?",
          "a": "Aybaşı siklinin günlərində fərq yoxdur", "b": "Aybaşı siklinin 6-12-ci günlərində",
          "c": "Aybaşı siklinin ikinci yarısında", "e": "Aybaşı siklinin axırıncı günü"},
    972: {"q": "Antifosfolipid əks-cisimləri tərəfindən yaranan hiperkoaqulyasiyanın autoimmun "
               "vəziyyəti, arteriya və venalarda trombozun yaranması, ağırlaşmış hamiləliklə "
               "nəticələnən (düşük, ölü doğulma, vaxtından öncə doğuş, ağır preeklampsiya) "
               "xəstəlik necə adlanır?"},
}

# Glued words the dictionary split below can't handle (its parts are rare words). Checked by hand.
GLUED = {
    "Aortanınmənfəzinindaralması": "Aortanın mənfəzinin daralması",
    "Arteriyalarlabirlikdə": "Arteriyalarla birlikdə",
    "Aspirasionpnevmoniyadaağciyərinhansı": "Aspirasion pnevmoniyada ağciyərin hansı",
    "Axardaxilitörəmələrimüəyyənetmək": "Axardaxili törəmələri müəyyən etmək",
    "Ayparayabənzərsümüyün": "Ayparayabənzər sümüyün",
    "Ağciyərhipertenziyasının": "Ağciyər hipertenziyasının",
    "Ağciyərintorvari": "Ağciyərin torvari",
    "Ağciyərköklərininikitərəfligenişlənməsinə": "Ağciyər köklərinin ikitərəfli genişlənməsinə",
    "Biliodigestivanastomoz": "Biliodigestiv anastomoz",
    "Birmqradioaktivmaddəninradioaktivnüvəsininsayı": "Bir mq radioaktiv maddənin radioaktiv nüvəsinin sayı",
    "Bronxarteriyalarındamarları": "Bronx arteriyaların damarları",
    "Bronxlarlabirlikdə": "Bronxlarla birlikdə",
    "Bronxoektazxəstəliyi": "Bronxoektaz xəstəliyi",
    "Bronxunkonikgüdülü": "Bronxun konik güdülü",
    "Böyrəyinsinusundaninkişafedənbeyinmadəsində": "Böyrəyin sinusundan inkişaf edən, beyin maddəsində",
    "Böyükhəcmlihepatikhemangiomuna": "Böyük həcmli hepatik hemangiomuna",
    "Clostridiumdifficile": "Clostridium difficile",
    "Dalaqarteriyasınınokklyuziyası": "Dalaq arteriyasının okklyuziyası",
    "Daxiliqulaqkeçəcəyinindaralması": "Daxili qulaq keçəcəyinin daralması",
    "DiabetlixəstəninPET": "Diabetli xəstənin PET",
    "Diffuzpnevmosklerozunxarakterik": "Diffuz pnevmosklerozun xarakterik",
    "Divararalığınbronxo": "Divararalığın bronxo",
    "Divertikulyazun": "Divertikulyozun",
    "Düzhorizontalsəviyyəsi": "Düz horizontal səviyyəsi",
    "Düzproyeksiyadasolqulaqcığındəqiqkonturları": "Düz proyeksiyada sol qulaqcığın dəqiq konturları",
    "Fibrolamelyarhepatosellyularkarsinomaya": "Fibrolamelyar hepatosellyular karsinomaya",
    "Hematogenosteomielitinerkənrentgenoloji": "Hematogen osteomielitin erkən rentgenoloji",
    "Hemoxromatozaxasdır": "Hemoxromatoza xasdır",
    "Hepatikhemangioendoteliomaya": "Hepatik hemangioendoteliomaya",
    "Hirşbrunqxəstəliyində": "Hirşbrunq xəstəliyində",
    "Icmalmammoqrammadamammolojibərklikfonund": "İcmal mammoqrammada mammoloji bərklik fonunda",
    "apatolojitörəmənimüəyyənetmək": "patoloji törəməni müəyyən etmək",
    "Ikistandartproyeksiyadarentgenoqrafiya": "İki standart proyeksiyada rentgenoqrafiya",
    "Ikitərəfliplevritin": "İkitərəfli plevritin",
    "Involyusiyayauğramış": "İnvolyusiyaya uğramış",
    "Kisəlibronxoektazlar": "Kisəli bronxoektazlar",
    "Kiçikqandövranı": "Kiçik qan dövranı",
    "kiçikqandövranı": "kiçik qan dövranı",
    "Köklərindurğunluğuvə": "Köklərin durğunluğu və",
    "Kölgəliyinyüksəkintensivliyi": "Kölgəliyin yüksək intensivliyi",
    "Mayemöhtəviyyatınınböyükmiqdarı": "Maye möhtəviyyatının böyük miqdarı",
    "Mezenximalqamartoma": "Mezenximal qamartoma",
    "Mitralqapaqların": "Mitral qapaqların",
    "Monroedəliyininnahiyyəsində": "Monro dəliyinin nahiyəsində",
    "Mərmərxəstəliyi": "Mərmər xəstəliyi",
    "Nəfəsalmadadaralır": "Nəfəsalmada daralır",
    "Nəfəsalmadadaralırvə": "Nəfəsalmada daralır və",
    "Nəfəsalmadauzanırvə": "Nəfəsalmada uzanır və",
    "Ocaqlarınböyüklüyü": "Ocaqların böyüklüyü",
    "Osteogensarkoma": "Osteogen sarkoma",
    "Ovulyasiyanınexoqrafik": "Ovulyasiyanın exoqrafik",
    "Patolojitörəməninkonturlarını": "Patoloji törəmənin konturlarını",
    "patolojitörəmənimüəyyənetmək": "patoloji törəməni müəyyən etmək",
    "Paylarınhüdudları": "Payların hüdudları",
    "Payınintensivkölgəsi": "Payın intensiv kölgəsi",
    "Petrifikatlarınolmaması": "Petrifikatların olmaması",
    "Piramidanınosteoporozu": "Piramidanın osteoporozu",
    "Piramidanınsklerozlaşması": "Piramidanın sklerozlaşması",
    "Piylihepatozapatognomonikdir": "Piyli hepatoza patognomonikdir",
    "Plaşabənzərqatilə": "Plaşabənzər qat ilə",
    "Plevralmayeninevakuasiyasındansonra": "Plevral mayenin evakuasiyasından sonra",
    "Plevralnahiyədə": "Plevral nahiyədə",
    "Pnevmoniyanınxronikiformasınıngöstəricisinə": "Pnevmoniyanın xroniki formasının göstəricisinə",
    "Prostatvəzinsərhədzonasında": "Prostat vəzin sərhəd zonasında",
    "Qalçaarteriyalarınanevrizması": "Qalça arteriyaların anevrizması",
    "Qaraciyərinhepatomaları": "Qaraciyərin hepatomaları",
    "QaraciyərinkapillyarhemangiomasınınUSM": "Qaraciyərin kapillyar hemangiomasının USM",
    "Qaraciyərinkistoztiplimetastazları": "Qaraciyərin kistoz tipli metastazları",
    "Qarınaortanınanevrizması": "Qarın aortanın anevrizması",
    "Qayığabənzərsümüyünsınığı": "Qayığabənzər sümüyün sınığı",
    "Qonşuorqanlarınxərçəngininnəticəsində": "Qonşu orqanların xərçənginin nəticəsində",
    "Radionuklidaktivliyinədir": "Radionuklid aktivliyi nədir",
    "Relaksasiyaedicifaringoqrafiya": "Relaksasiyaedici faringoqrafiya",
    "SWIsekansındakortikal": "SWI sekansında kortikal",
    "Sağlamuşaqların": "Sağlam uşaqların",
    "Skirrozhepatosellularkarsinomaya": "Skirroz hepatosellular karsinomaya",
    "Spondilolizhansı": "Spondiloliz hansı",
    "Stenozluxərçəngdə": "Stenozlu xərçəngdə",
    "Südvəzininhansı": "Süd vəzinin hansı",
    "Südvəzixərçəngininhipervaskulyarizasiyası": "Süd vəzi xərçənginin hipervaskulyarizasiyası",
    "Uroqrammadaböyrəkləyəninvə": "Uroqrammada böyrək ləyənin və",
    "Uroqrammadasidikaxarı": "Uroqrammada sidik axarı",
    "Vahidzamandabaş": "Vahid zamanda baş",
    "Vaxtmiqdarındaradioaktivnüvəsinindağılması": "Vaxt miqdarında radioaktiv nüvəsinin dağılması",
    "VilmstumorunxarakterikKTgörüntüsü": "Vilms tumorun xarakterik KT görüntüsü",
    "Xronikihematogen": "Xroniki hematogen",
    "Xronikipielonefroz": "Xroniki pielonefroz",
    "Xronikiqandövranı": "Xroniki qan dövranı",
    "Xəlbirlabirintinhüceyrələri": "Xəlbir labirintin hüceyrələri",
    "Yanproyeksiyası": "Yan proyeksiyası",
    "akutdisseminəedici": "akut disseminəedici",
    "angioqrammalardadamarsızsahə": "angioqrammalarda damarsız sahə",
    "aortanınterminal": "aortanın terminal",
    "arteriyasınınneçənci": "arteriyasının neçənci",
    "aterosklerozinkar": "ateroskleroz inkar",
    "ağrılıorogenital": "ağrılı orogenital",
    "bağırsaqtraktınbədxassəli": "bağırsaq traktın bədxassəli",
    "beyincikarteriyasından": "beyincik arteriyasından",
    "böyrəkləyəniyerinidəyişib": "böyrək ləyəni yerini dəyişib",
    "bəndlərdənyanlış": "bəndlərdən yanlış",
    "bərabərinsulinvurulur": "bərabər insulin vurulur",
    "çantasınındrenirə": "çantasının drenirə",
    "dairesidamarlarının": "dairəsi damarlarının",
    "dərinliyindənasılı": "dərinliyindən asılı",
    "drenajborularvə": "drenaj borular və",
    "enterogenkistasında": "enterogen kistasında",
    "fasetoynaqlarınaartroz": "faset oynaqlarına artroz",
    "formasınındəyişməsi": "formasının dəyişməsi",
    "hemangiomayanadirhallardarastgəlinir": "hemangiomaya nadir hallarda rast gəlinir",
    "ilanvarikontrast": "ilanvari kontrast",
    "içərirotasiyailə": "içəri rotasiya ilə",
    "kasalarsıxılaraqitələnmişdir": "kasalar sıxılaraq itələnmişdir",
    "kasalarıngenişlənməsi": "kasaların genişlənməsi",
    "lakindəyişilməmişdir": "lakin dəyişilməmişdir",
    "ləyənsisteminingenişlənməsininolmaması": "ləyən sisteminin genişlənməsinin olmaması",
    "müalicələrətabe": "müalicələrə tabe",
    "olmayaninfiltrativtiplisahə": "olmayan infiltrativ tipli sahə",
    "olunanradiofarmpreparatı": "olunan radiofarmpreparatı",
    "optimproyeksiya": "optim proyeksiya",
    "parenximadadeffektvə": "parenximada deffekt və",
    "parçalanmalarıniınsayı": "parçalanmalarının sayı",
    "patolojidəyişikliklərinhamısı": "patoloji dəyişikliklərin hamısı",
    "piyinfiltrasiyası": "piy infiltrasiyası",
    "qaraciyərarxitektonikası": "qaraciyər arxitektonikası",
    "relyefsaxlanılıb": "relyef saxlanılıb",
    "sekanslarındagyruslarda": "sekanslarında gyruslarda",
    "sekvestrasiyasınaşübhə": "sekvestrasiyasına şübhə",
    "seqmentininhəcmininkiçilməsi": "seqmentinin həcminin kiçilməsi",
    "simptomlartuberozskleroz": "simptomlar tuberoz skleroz",
    "sirkulyardaralması": "sirkulyar daralması",
    "sistemlərizədələyən": "sistemləri zədələyən",
    "sümüklərinkənarınındestruksiyası": "sümüklərin kənarının destruksiyası",
    "sınıqlarınadaha": "sınıqlarına daha",
    "səbəbindənkalsium": "səbəbindən kalsium",
    "tutmalarvəyarıq": "tutmalar və yarıq",
    "təkrarənmayeyığılması": "təkrarən maye yığılması",
    "verənradioaktivmaddəninnüvə": "verən radioaktiv maddənin nüvə",
    "vərəmindifferensialdiaqnostikası": "vərəmin differensial diaqnostikası",
    "xarakterinindəqiqləşdirilməsi": "xarakterinin dəqiqləşdirilməsi",
    "xəstəliksimmetriksümükzədələnməsinə": "xəstəlik simmetrik sümük zədələnməsinə",
    "yaxudboyununlimfadenopatiyası": "yaxud boyunun limfadenopatiyası",
    "Çənbərbağırsağınnahamarkonturluvə": "Çənbər bağırsağın nahamar konturlu və",
    "ödaxacağınıneniUSM": "öd axacağının eni USM",
    "ölçülərininkiçilməsi": "ölçülərinin kiçilməsi",
    "ölçülərininnormadankiçikolması": "ölçülərinin normadan kiçik olması",
    "ölçülərinkiçilməsivə": "ölçülərin kiçilməsi və",
    "üstünlükləyayılmış": "üstünlüklə yayılmış",
    "şöbəsininokklyuziyası": "şöbəsinin okklyuziyası",
    "Əsascibinpnevmatizasiyasınınpozulması": "Əsas cibin pnevmatizasiyasının pozulması",
    "əməliyyataparılmalıdır": "əməliyyat aparılmalıdır",
    "əvvəlxəstə": "əvvəl xəstə",
    "ödvə": "öd və",
    "qazmüşahidə": "qaz müşahidə",
}

# Other words glued together in the PDF are split with a dictionary built from both banks.
# These are real one-word compounds and stay as they are.
KEEP_WHOLE = {
    "məqsədəuyğun", "uzunmüddətli", "çənəaltı", "dalaqaltı", "diafraqmaüstü", "udlaqarxası",
    "qarınarxası", "boruşəkilli", "pnevmoniyaşəkilli", "sümüküstüaltı", "yenidoğulmuş",
}

LABEL = re.compile(r"\(?[A-E]\)")
NUMBER = re.compile(r"\d{1,4}\)")
OPT = re.compile(r"(?:(?<=\s)|(?<=^)|(?<=\())\(?([A-E])\s?\)")
WORD = re.compile(r"[A-Za-zƏəİıÖöÜüĞğŞşÇç]+")


def run_pdftohtml(pdf):
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftohtml", "-xml", "-q", str(pdf), str(Path(tmp) / "doc")], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return ET.parse(Path(tmp) / "doc.xml").getroot()


def read_page_items(root):
    elems, images = [], []
    for page in root.iter("page"):
        pn = int(page.get("number"))
        for el in page:
            if el.tag not in ("text", "image"):
                continue
            box = {k: int(el.get(k)) for k in ("top", "left", "width", "height")}
            if el.tag == "text":
                text = unicodedata.normalize("NFC", "".join(el.itertext()))
                if text:
                    elems.append({"page": pn, **box, "text": text})
            elif el.tag == "image":
                images.append({"page": pn, **box})
    return elems, images


def build_lines(elems):
    elems.sort(key=lambda e: (e["page"], e["top"], e["left"]))
    lines = []
    for e in elems:
        last = lines[-1] if lines else None
        if last and last["page"] == e["page"] and abs(last["top"] - e["top"]) <= 6:
            last["els"].append(e)
        else:
            lines.append({"page": e["page"], "top": e["top"], "els": [e]})

    # A question number ("710)") printed a few px off its text line belongs to that line.
    def only_number(ln):
        return len(ln["els"]) <= 2 and NUMBER.fullmatch("".join(e["text"] for e in ln["els"]).strip())

    out = []
    for ln in lines:
        prev = out[-1] if out else None
        close = prev and prev["page"] == ln["page"] and abs(prev["top"] - ln["top"]) <= 14
        if close and (only_number(ln) or only_number(prev)):
            prev["els"].extend(ln["els"])
        else:
            out.append(ln)
    return out


def build_stream(lines):
    """Text of the whole PDF in reading order, with line index and x centre per char."""
    chars, xs, owner = [], [], []
    for li, ln in enumerate(lines):
        # A bare option label ("E)") can share its x with the option text: put it first.
        ln["els"].sort(key=lambda e: e["left"] - (3 if LABEL.fullmatch(e["text"].strip()) else 0))
        prev_right = None
        for e in ln["els"]:
            t = e["text"]
            if (chars and chars[-1] not in " \n" and not t[:1].isspace()
                    and prev_right is not None and e["left"] - prev_right > 1):
                chars.append(" "); xs.append(e["left"]); owner.append(li)
            for i, ch in enumerate(t):
                chars.append(ch); xs.append(e["left"] + e["width"] * (i + 0.5) / len(t)); owner.append(li)
            prev_right = e["left"] + e["width"]
        chars.append("\n"); xs.append(0); owner.append(li)
    return "".join(chars), xs, owner


def split_questions(text):
    """Questions with stem/options, and a (number, part) label for every char."""
    starts, last = [], 0
    for m in re.finditer(r"(?:^|\s|(?<=[A-E]\)))(\d{1,4})\s?\)", text):
        n = int(m.group(1))
        if last < n <= last + 3:  # numbers only go up; a few are skipped in the PDF
            starts.append((m.start(1), n))
            last = n
    label = [None] * len(text)
    questions = {}
    for k, (pos, n) in enumerate(starts):
        end = starts[k + 1][0] if k + 1 < len(starts) else len(text)
        block = text[pos:end]
        chosen = []
        for m in OPT.finditer(block):
            if len(chosen) < 5 and m.group(1) == "ABCDE"[len(chosen)]:
                chosen.append(m)
        head = chosen[0].start() if chosen else len(block)
        for i in range(pos, pos + head):
            label[i] = (n, "Q")
        options = {}
        for j, m in enumerate(chosen):
            stop = chosen[j + 1].start() if j + 1 < len(chosen) else len(block)
            for i in range(pos + m.start(), pos + stop):
                label[i] = (n, m.group(1).lower())
            option = " ".join(block[m.end():stop].split())
            options[m.group(1).lower()] = re.sub(r"^\(?[A-E]\)\s*", "", option)  # "(E) (E) text"
        stem = re.sub(r"^\d{1,4}\s?\)\s*", "", block[:head])
        questions[n] = {"q": " ".join(stem.split()), "o": options}
    return questions, label


def read_answers(lines, images, text, xs, owner, label):
    line_chars = defaultdict(list)
    for i, ch in enumerate(text):
        if not ch.isspace() and label[i]:
            line_chars[owner[i]].append((xs[i], label[i]))
    page_lines = defaultdict(list)
    for li, ln in enumerate(lines):
        if line_chars[li]:
            page_lines[ln["page"]].append(li)

    def by_overlap(img, cands):
        best, most = None, 0
        for li in cands:
            top = lines[li]["top"]
            o = min(img["top"] + img["height"], top + 24) - max(img["top"], top)
            if o > most:
                best, most = li, o
        return best

    def by_shift(img, cands):
        above = [li for li in cands if img["top"] - 45 <= lines[li]["top"] <= img["top"] + 8]
        if above:
            return max(above, key=lambda li: lines[li]["top"])
        near = [li for li in cands if abs(lines[li]["top"] - img["top"]) <= 30]
        return min(near, key=lambda li: abs(lines[li]["top"] - img["top"])) if near else None

    def vote(pick_line):
        votes = defaultdict(Counter)
        for img in images:
            x0, x1 = img["left"] - 6, img["left"] + img["width"] + 6
            cands = [li for li in page_lines[img["page"]] if any(x0 <= x <= x1 for x, _ in line_chars[li])]
            li = pick_line(img, cands)
            if li is None:
                continue
            inside = Counter(lab for x, lab in line_chars[li] if x0 <= x <= x1)
            if inside:
                (n, part), count = inside.most_common(1)[0]
                if part != "Q":
                    votes[n][part] += count
        result = {}
        for n, v in votes.items():
            top2 = v.most_common(2)
            clear = len(top2) == 1 or top2[1][1] < 0.5 * top2[0][1]
            result[n] = (top2[0][0], clear)
        return result

    return vote(by_overlap), vote(by_shift)


def fix_capitals(questions, freq):
    """The PDF font drops the marks on capital İ, Ö, Ü: "Iki", "Od", "Umumi"."""
    swap = {"I": ("ı", "i", "İ"), "O": ("o", "ö", "Ö"), "U": ("u", "ü", "Ü")}

    def fix(match):
        w = match.group(0)
        plain, marked, cap = swap[w[0]]
        if freq[marked + w[1:]] and not freq[plain + w[1:]]:
            return cap + w[1:]
        return w

    def fix_all(text):
        text = re.sub(r"\b[IOU][a-zəıöüğşç]+", fix, text)
        # "On" (ten) is a word too, so "Ön" (front) needs its own rule: "On beyin" -> "Ön beyin"
        return re.sub(r"\bOn(?= (?!yaş|bir\b))", "Ön", text)

    for q in questions.values():
        q["q"] = fix_all(q["q"])
        q["o"] = {k: fix_all(v) for k, v in q["o"].items()}


SUFFIX = re.compile(r"^(l[əa]r|nd[əa]n|[ıiuü]n|[ıiuü]nd[əa]|[ıiuü]n[ıiuü]n|d[əa]|t[əa]|ki|ya|y[əa]|n[əa]|"
                    r"[əa]n|unun|ının|inin|ında|ində|ndan|alar|ları|ləri|məsi|ması|l[əa]y[əa]n)")
PREFIX = {"peri", "hiper", "hipo", "fronto", "kardio", "qeyri", "yarım"}
JOINERS = {"və", "ilə"}


def split_glued(questions, freq):
    """Split words the PDF glued together ("əlamətlərihansıdır") into known words."""
    vocab = {w for w, c in freq.items() if c >= 3}

    def segment(word):
        n = len(word)
        best = [(0.0, None)] + [(math.inf, None)] * n
        for i in range(1, n + 1):
            for j in range(max(0, i - 30), i):
                part = word[j:i]
                ok = part in vocab and (len(part) >= 4 or part in JOINERS)
                if ok and j > 0 and part not in JOINERS and SUFFIX.match(part):
                    ok = False
                if ok and i < n and part in PREFIX:
                    ok = False
                if ok:
                    cost = best[j][0] + 1 + 1 / math.log(freq[part] + 1.5)
                    if cost < best[i][0]:
                        best[i] = (cost, j)
        if best[n][0] == math.inf:
            return None
        parts, i = [], n
        while i:
            j = best[i][1]
            parts.append(word[j:i])
            i = j
        return parts[::-1]

    def fix(match):
        w = match.group(0)
        lower = {"I": "ı", "İ": "i"}.get(w[0], w[0].lower()) + w[1:]
        if len(lower) < 8 or freq[lower] >= 2 or lower in vocab or lower in KEEP_WHOLE:
            return w
        parts = segment(lower)
        if not parts or len(parts) < 2:
            return w
        out = " ".join(parts)
        return w[0] + out[1:] if w[0].isupper() else out

    count = 0
    for q in questions.values():
        for key in ("q", *q["o"]):
            old = q["q"] if key == "q" else q["o"][key]
            new = WORD.sub(fix, old)
            count += new != old
            if key == "q":
                q["q"] = new
            else:
                q["o"][key] = new
    return count


def word_freq(questions):
    freq = Counter()

    def feed(t, weight):
        for w in WORD.findall(t):
            if w[0].islower():
                freq[w] += weight

    bank = json.loads((ROOT / "questions_answers.json").read_text(encoding="utf-8"))
    for row in bank:  # the 522 bank is clean text, weight it higher
        for key in ("question", "answer_a", "answer_b", "answer_c", "answer_d", "answer_e"):
            feed(row[key], 2)
    for q in questions.values():
        feed(q["q"], 1)
        for v in q["o"].values():
            feed(v, 1)
    return freq


def tidy(s):
    s = " ".join(s.split())
    s = re.sub(r"\s+([?,.:;)])", r"\1", s)
    return re.sub(r"\(\s+", "(", s).strip()


def main():
    pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    root = run_pdftohtml(pdf)
    elems, images = read_page_items(root)
    lines = build_lines(elems)
    text, xs, owner = build_stream(lines)
    questions, label = split_questions(text)
    overlap, shift = read_answers(lines, images, text, xs, owner, label)

    unresolved = []
    for n, q in questions.items():
        a, b = overlap.get(n), shift.get(n)
        if n in ANSWER_FIXES:
            q["a"] = ANSWER_FIXES[n]
        elif a and b and a[0] == b[0] and a[1] and b[1]:
            q["a"] = a[0]
        else:
            q["a"] = (b or a or ("",))[0]
            unresolved.append((n, a, b))

    for n, fix in TEXT_FIXES.items():
        for key, value in fix.items():
            if key == "q":
                questions[n]["q"] = value
            else:
                questions[n]["o"][key] = value

    for q in questions.values():
        q["q"] = WORD.sub(lambda m: GLUED.get(m.group(0), m.group(0)), q["q"])
        q["o"] = {k: WORD.sub(lambda m: GLUED.get(m.group(0), m.group(0)), v) for k, v in q["o"].items()}

    freq = word_freq(questions)
    fix_capitals(questions, freq)
    glued = split_glued(questions, freq)

    rows = []
    for n in sorted(questions):
        q = questions[n]
        row = {"n": n, "question": tidy(q["q"])}
        for letter in "abcde":
            row[f"answer_{letter}"] = tidy(q["o"].get(letter, ""))
        row["right_answer"] = q["a"] if q["o"].get(q["a"]) else ""
        rows.append(row)

    DEST.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    missing = sorted(set(range(1, rows[-1]["n"] + 1)) - {r["n"] for r in rows})
    print(f"{len(rows)} questions -> {DEST.relative_to(ROOT)}; numbers not in the PDF: {missing}")
    print(f"no answer key: {[r['n'] for r in rows if not r['right_answer']]}; "
          f"fields with glued words split: {glued}")
    if unresolved:
        print("Highlight readings disagree, check these pages and add them to ANSWER_FIXES:")
        for n, a, b in unresolved:
            print(f"  Q{n}: overlap={a} shift={b}")


if __name__ == "__main__":
    main()
