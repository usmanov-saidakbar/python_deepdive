"""Builds data/russian-days.json: the Russian roadmap from B1 to B2 in 240 days.

Run from the repo root:  python3 scripts/build_russian_plan.py
Check every link opens:  python3 scripts/build_russian_plan.py --check

The plan, per week (Mon–Sat about 2 hours, Sunday light):
- Words every day first, in the word app (its new words follow the vocabulary book).
- Grammar: two topics a week (learn → drill → mixed drill), because grammar is the weak spot.
- Book: Terence Wade, «Using Russian Vocabulary» (Cambridge, 2009), one unit about every 1¾ weeks.
- Watch: four episodes of «Кухня» a week (official STS channel), always after the day's words.
- Speak / write: use the week's grammar about the episodes and the book's topic, corrected by AI.
Days 29–30 of each month are a monthly check and a catch-up day with an optional film.
"""
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "russian-days.json")

APP = "https://anki-russian.onrender.com/"
AI = "https://chatgpt.com/"
BOOK_URL = "https://www.cambridge.org/core/books/using-russian-vocabulary/FE77DF466AA4F662DC11D86D7F5505C0"


def L(type_, title, url):
    return {"type": type_, "title": title, "url": url}


def yt(vid, channel, title, type_="Video"):
    return L(type_, f"{channel}: {title}", f"https://www.youtube.com/watch?v={vid}")


MANGO = "https://www.mangolanguages.com/resources/learn/grammar/russian/"


def mango(slug, title):
    return L("Lesson", f"Mango Languages: {title}", MANGO + slug)


def mango_ex(slug, title):
    return L("Exercise", f"Mango Languages: {title} (practice)", MANGO + slug + "/activities")


RFF = "https://www.russianforfree.com/"
CASES = {"acc": 0, "dat": 1, "gen": 2, "ins": 3, "pre": 4}
CASE_NAME = {"acc": "accusative", "dat": "dative", "gen": "genitive", "ins": "instrumental", "pre": "prepositional"}


def rff_table(page, title):
    return L("Lesson", f"Russian for Free: {title} (table)", RFF + page)


def rff_any(kind, case, n):
    """Intermediate level: one case, any gender (n = 1..5)."""
    code = f"a02{CASES[case] * 5 + n:03d}032"
    return L("Exercise", f"Russian for Free: {kind} in the {CASE_NAME[case]}, any gender {n}", f"{RFF}exercise-{kind}-{code}.php")


def rff_adv(kind, n):
    """Advanced level: phrases in any gender and case (n = 1..20)."""
    return L("Exercise", f"Russian for Free: {kind} in any case and gender, advanced {n}", f"{RFF}exercise-{kind}-a03{n:03d}032.php")


MR = "https://masterrussian.com/"


def mr(page, title):
    return L("Lesson", f"Master Russian: {title}", MR + page)


def pel(n, title):
    return L("Lesson", f"Pelister: {title}", f"https://pelister.org/russian/tutorials/{n:04d}.html")


def mn(path, title, type_="Lesson"):
    return L(type_, f"Между нами {title}", "https://mezhdunami.org/" + path)


def ory(vid, title):
    return yt(vid, "О русском по-русски (in Russian)", title)


def rg(vid, title, type_="Video"):
    return yt(vid, "Russian grammar", title, type_)


def ar(vid, title, type_="Video"):
    return yt(vid, "Amazing Russian", title, type_)


def bfr(vid, title, type_="Video"):
    return yt(vid, "Be Fluent in Russian", title, type_)


def rrc(vid, title, type_="Video"):
    return yt(vid, "Real Russian Club", title, type_)


def ai_drill(topic_ru):
    return L(
        "AI partner",
        f"ChatGPT: «Дай мне 15 предложений с пропуском на тему „{topic_ru}“, по одному. Я отвечаю, ты исправляешь и коротко объясняешь по-английски.»",
        AI,
    )


ENTH = "https://russianenthusiast.com/russian-grammar/verbs/"

# ---------------------------------------------------------------- grammar, weeks 1–28
# Each topic: name, short Russian label for AI drills, learn links (lesson → video), drill links (exercises).
T = {}


def topic(key, name, ru, learn, drill):
    T[key] = {"key": key, "name": name, "ru": ru, "learn": learn, "drill": drill}


topic("prep", "the prepositional case in full, singular and plural (в / на, о / об, the -у locative: в лесу́, на полу́)", "предложный падеж",
      [mango("how-to-use-the-prepositional-case-in-russian-", "the prepositional case"),
       mango("what-is-the-difference-between-v-and-na-in-russian-", "в or на"),
       rff_table("grammar-of-russian-nouns-prepositional.php", "nouns in the prepositional"),
       rg("yMLmPcdov0s", "Using the Prepositional Case in Russian"),
       ory("z5eXQfjK6bM", "Предложный падеж. Множественное число")],
      [rff_any("nouns", "pre", 1), rff_any("nouns", "pre", 2), rff_any("adjectives", "pre", 1),
       rrc("vT8MwV1gglM", "Practice Russian ACTIVELY! – Prepositional Case", "Exercise")])
topic("acc", "the accusative in full: people and things, plurals, direction (в / на + accusative) and time (в сре́ду, на неде́лю)", "винительный падеж",
      [mango("how-to-use-accusative-case-in-russian-", "the accusative case"),
       mango("how-to-use-accusative-case-in-russian-/study-resource-animate-vs-inanimate-accusative-case", "animate vs inanimate accusative"),
       rff_table("grammar-of-russian-nouns-accusative.php", "nouns in the accusative"),
       rg("5vSnigqIxCg", "Animate Masculine Nouns in the Accusative Case"),
       rg("F34JJTCprmI", "Russian Cases - Accusative Plural"),
       ory("E9nC0NAiNsM", "Урок 3. Винительный падеж. Множественное число")],
      [rff_any("nouns", "acc", 1), rff_any("nouns", "acc", 2), rff_any("adjectives", "acc", 1)])
topic("gen-sg", "the genitive singular: нет / не́ было + genitive, possession, and у, из, от, до, без, для, по́сле, о́коло, кро́ме, вме́сто", "родительный падеж (единственное число)",
      [mango("how-to-use-the-genitive-case-in-russian-", "the genitive case"),
       mango("which-prepositions-trigger-the-genitive-case-in-russian-", "prepositions with the genitive"),
       mango("how-to-use-the-genitive-case-of-absence-negation-in-russian-", "the genitive of absence"),
       rg("R-jB90T5nuI", "Russian Cases: Genitive Singular Noun Endings"),
       rg("xTy-PeemDVE", "The Case of the Negated Direct Object"),
       ory("6EmLJAcMGE4", "НЕТ, НЕ и НИ + Винительный или Родительный падеж?")],
      [rff_any("nouns", "gen", 1), rff_any("nouns", "gen", 2), rff_any("adjectives", "gen", 1)])
topic("gen-pl", "the genitive plural: -ов / -ев / -ей / no ending, the fleeting vowel, and мно́го / ма́ло / не́сколько / ско́лько", "родительный падеж множественного числа",
      [mango("when-to-use-the-genitive-case-with-quantity-words-and-numbers-in-russian-", "quantity words and numbers"),
       pel(37, "genitive plural of nouns"),
       pel(38, "genitive plural of adjectives"),
       rg("vamgXZcNXkM", "Taming the Genitive Plural (I)"),
       rg("-p50gv5eXoI", "Taming the Genitive Plural (II)"),
       rg("wZwhOYcGUXg", "Taming the Genitive Plural (III)"),
       rg("6F5yUb7XNyk", "Taming the Genitive Plural (IV): Exceptions"),
       ory("0P9fPYhJtWo", "Родительный падеж. Множественное число")],
      [rff_any("nouns", "gen", 4), rff_any("nouns", "gen", 5), rff_any("adjectives", "gen", 2)])
topic("dat", "the dative, singular and plural: кому́?, помога́ть / звони́ть / сове́товать / меша́ть / ве́рить, нра́виться, ну́жно, к and по", "дательный падеж",
      [mango("how-to-use-dative-case-in-russian-", "the dative case"),
       mango("dative-prepositions-in-russian-what-are-they-and-how-to-use-them-", "dative prepositions"),
       mango("how-to-use-dative-case-for-indirect-objects-in-russian-", "the dative for indirect objects"),
       rg("Kfq4DH9y1oo", "Dative Case Noun Endings in Russian"),
       rg("Lo6ftiDA90A", "Dative Adjective Endings"),
       ory("LCkYbgfO87k", "Дательный падеж. Множественное число"),
       ar("g8m7X4wTwDM", "Dative Case with Preposition ПО. Part 1")],
      [rff_any("nouns", "dat", 1), rff_any("nouns", "dat", 2), rff_any("adjectives", "dat", 1)])
topic("ins", "the instrumental, singular and plural: с кем?, рабо́тать / быть / стать кем?, занима́ться / интересова́ться / по́льзоваться чем?, над, под, пе́ред, за, ме́жду", "творительный падеж",
      [mango("the-instrumental-case-how-to-form-and-use-it-in-russian-", "the instrumental case"),
       rg("kzGt8ya1p_s", "Instrumental Case: Nouns"),
       rg("8oF2FSkEP0w", "Instrumental Case: Adjectives & Other Modifiers"),
       ar("8-8PmPgDJZQ", "Instrumental Case with ЗАНИМАТЬСЯ, УВЛЕКАТЬСЯ, ИНТЕРЕСОВАТЬСЯ"),
       ar("6xU6fOCNLnU", "Instrumental Case with СТАНОВИТЬСЯ / СТАТЬ"),
       ory("h9BFGt0ePTA", "БЫТЬ + … Именительный или Творительный падеж?"),
       ory("5hINZsAf8vk", "Творительный падеж. Множественное число")],
      [rff_any("nouns", "ins", 1), rff_any("nouns", "ins", 2), rff_any("adjectives", "ins", 1),
       mango_ex("the-instrumental-case-how-to-form-and-use-it-in-russian-", "instrumental case")])
topic("pron", "pronouns in every case (меня́ / мне / мной, у него́ with н-), свой, себя́, сам, весь, э́тот / тот", "местоимения в падежах",
      [mango("russian-personal-pronouns-what-are-they-and-how-to-use-them-", "personal pronouns"),
       mango("how-to-use-the-reflexive-adjective-svoj-in-russian-", "свой"),
       mango("how-to-use-the-russian-reflexive-pronouns-sebya-and-sam-", "себя and сам"),
       mango("how-to-use-the-word-ves-in-russian-", "весь"),
       rff_table("grammar-of-russian-personal-pronouns-cases.php", "personal pronouns in all cases"),
       rff_table("grammar-of-russian-possessive-pronouns-cases.php", "possessive pronouns in all cases"),
       ory("xNaBC3wU16o", "Личные местоимения во всех падежах"),
       ory("aML0Y-1GQZk", "Как использовать СВОЙ? Часть 1"),
       bfr("GvGMxXUniCQ", "How to use СЕБЯ like a native")],
      [mango_ex("russian-personal-pronouns-what-are-they-and-how-to-use-them-", "personal pronouns"),
       mango_ex("how-to-use-the-word-ves-in-russian-", "весь")])
topic("adj-pl", "adjectives and plurals in every case: -ого / -ому / -ым / -ом and -ам / -ами / -ах", "склонение прилагательных и множественное число",
      [mr("aa041201.shtml", "declension of adjectives"),
       mr("aa082100a.shtml", "declension of plural nouns"),
       mango("how-to-use-genitive-adjectives-in-russian-", "genitive adjectives"),
       ory("SZ_c64pV3kI", "Склонение прилагательных во множественном числе")],
      [rff_adv("nouns", 1), rff_adv("nouns", 2), rff_adv("adjectives", 1), rff_adv("adjectives", 2)])
topic("conj", "conjugation and stem changes: писа́ть – пишу́, люби́ть – люблю́, мочь – могу́, -овать verbs (рисова́ть – рису́ю)", "спряжение глаголов",
      [pel(2, "first conjugation"), pel(3, "second conjugation"), pel(4, "consonant mutation"),
       pel(8, "the verb suffixes -ова-, -ева-, -ва-"),
       bfr("-dFiOENeKLM", "Russian conjugation in detail - everything you need to know!"),
       rg("P3wd4B9bONk", "Verbs in -овать/-евать"),
       ory("w-U8gtsoPAM", "Урок 2. Спряжение глаголов: I и II спряжение (уровень B1+)")],
      [ai_drill("спряжение глаголов: формы я, ты, они")])
topic("sya", "reflexive verbs: the meanings of -ся (умыва́ться, встреча́ться, начина́ться, мне не спи́тся) and pairs like начина́ть / начина́ться", "возвратные глаголы на -ся",
      [mango("what-are-reflexive-verbs-in-russian-", "reflexive verbs"),
       pel(7, "reflexive verbs"),
       mn("unit08/8_3/language.shtml", "8.3: more on -ся"),
       ar("dBt6isSsB80", "Intermediate Russian: Reflexive Verbs"),
       ar("faeyxsHM2Do", "Intermediate Russian II: Passive Constructions with Reflexive Verbs")],
      [ai_drill("глаголы с -ся и без -ся (начинать / начинаться)")])
topic("asp1", "aspect, part 1: how pairs are made (де́лать – сде́лать, дава́ть – дать, -ыва- / -ива-) and aspect in the past", "вид глагола в прошедшем времени",
      [mango("what-are-aspect-pairs-in-russian-", "aspect pairs"),
       mr("aa031600a.shtml", "aspect of the verb"),
       pel(22, "verb aspect formation"),
       rg("M35fd3NQp7A", "Verbal Aspect in Russian: an Introduction (UPDATED)"),
       rg("ux-_paa63Oc", "Creating Secondary Imperfectives with -ыв-/-ив-"),
       rg("hGV9mgX_9g8", "Verbal Aspect in Russian: 2 Actions in the Past"),
       bfr("VZh0XyhA2xA", "THE ONLY 3 rules you need for correct ASPECTS usage")],
      [mango_ex("what-are-aspect-pairs-in-russian-", "aspect pairs"),
       mango_ex("what-is-the-imperfective-aspect-in-russian-", "imperfective aspect"),
       mn("unit06/6_1/language.shtml", "6.1: aspect in the past — Упражнения", "Exercise")])
topic("asp2", "aspect, part 2: the future (бу́ду де́лать or сде́лаю), after хоте́ть / нача́ть / на́до, and with не", "вид глагола в будущем времени и в инфинитиве",
      [mango("what-is-the-perfective-aspect-in-russian-", "the perfective aspect"),
       mango("how-to-talk-about-the-future-in-russian-", "talking about the future"),
       mn("unit06/6_2/language.shtml", "6.2: aspect and negation"),
       rg("rMQJntd5Gw8", "Expressing the Future in Russian with Perfective Verbs"),
       rg("MBSulFoPdIg", "Aspect: A Matter of Perspective")],
      [mango_ex("what-is-the-perfective-aspect-in-russian-", "perfective aspect"),
       L("Exercise", "Mango Languages: perfective aspect (practice 2)", MANGO + "what-is-the-perfective-aspect-in-russian-/activities-2"),
       mn("unit06/6_3/language.shtml", "6.3: aspect and tense — Упражнения 1–3", "Exercise")])
topic("imper", "the imperative and aspect: сядь / сади́сь, позвони́ / не звони́, дава́й(те), пусть", "повелительное наклонение",
      [mango("how-to-form-and-use-the-imperative-mood-in-russian-", "the imperative"),
       ory("gpOivY8gWg4", "Урок 1. ИМПЕРАТИВ. Как образовывать формы?"),
       ory("ndQ_dFzXN90", "Урок 2. ИМПЕРАТИВ НСВ и СВ"),
       ory("xTJPd4cGv9k", "Урок 3. ДАВАЙ(ТЕ), ПУСТЬ, ПУСКАЙ, ПОШЛИ и пр."),
       rg("HIMTC5SG_mY", "Imperatives and Aspect in Russian")],
      [mango_ex("how-to-form-and-use-the-imperative-mood-in-russian-", "imperative"),
       mn("unit06/6_7/language.shtml", "6.7: commands — Упражнение 1", "Exercise")])
topic("asp3", "aspect in stories: the chain of events (perfective) vs background, process and habit (imperfective); вдруг, сра́зу, ка́ждый день, до́лго", "вид глагола в рассказе о прошлом",
      [mango("what-is-the-imperfective-aspect-in-russian-", "the imperfective aspect"),
       rg("xp7fXjbSc_k", "Verbal Aspect in Russian: Basics for the Imperfective"),
       ar("H7vojqRJtOc", "Verbal Aspect: Imperfective Present vs. Perfective Past")],
      [mango_ex("what-is-the-imperfective-aspect-in-russian-", "imperfective aspect"),
       mn("unit06/6_3/language.shtml", "6.3: aspect and tense — Упражнения 1–3", "Exercise")])
topic("vom1", "verbs of motion without prefixes, part 1: идти́ / ходи́ть, е́хать / е́здить in the present, past and future", "глаголы движения идти/ходить, ехать/ездить",
      [mango("how-to-use-verbs-of-motion-in-russian-", "verbs of motion"),
       mango("how-to-use-verbs-of-motion-in-russian-/study-resource-conjugating-russian-verbs-of-motion", "conjugating verbs of motion"),
       ar("-GOXNIJZQrM", "Unprefixed Verbs of Motion: Forms and Meanings"),
       ar("QmpZ0VrIaTg", "Unprefixed Verbs of Motion: Present Tense Uses"),
       ar("RcHagO2RQjg", "Unprefixed Verbs of Motion: Past Tense Uses"),
       ar("9JEtaO2sC9s", "Unprefixed Verbs of Motion: Future Tense Uses")],
      [mango_ex("how-to-use-verbs-of-motion-in-russian-", "verbs of motion"),
       mn("unit05/5_8/language.shtml", "5.8: verbs of motion — Упражнения", "Exercise"),
       rrc("f40sKIe7avQ", "PRACTICE Russian verbs of motion - Lesson 2 - Ехать", "Exercise")])
topic("vom2", "verbs of motion without prefixes, part 2: нести́ / носи́ть, вести́ / води́ть, везти́ / вози́ть, бежа́ть, лете́ть, плыть", "глаголы движения нести, вести, везти, бежать, лететь",
      [mango("how-to-use-carrying-verbs-of-motion-in-russian-", "нести, везти, вести"),
       rg("45pfbCoEz2E", "Motion Verbs XIII: carrying - носить, нести"),
       rg("2mknIhnbEfU", "Motion Verbs IX: Taking, Leading on foot - водить"),
       rg("cmo5eG5zBDI", "Motion Verbs XI: 'Taking' by Vehicle - возить"),
       rg("RhmLjxA7SmY", "Motion Verbs XV: flying - летать, лететь"),
       ar("rtqXK4pLa-A", "Driving in Russian: за рулём, ехать-ездить, вести-водить, везти-возить")],
      [ar("jH6POWhfkVc", "Intermediate Russian: Verbs of Motion: Practice", "Exercise"),
       rrc("EBcOVZR4aqM", "PRACTICE Russian verbs of motion - Lesson 1 - Бежать", "Exercise"),
       mango_ex("how-to-use-verbs-of-motion-in-russian-", "verbs of motion")])
topic("vom3", "prefixed verbs of motion, part 1: при-, у-, в-, вы-, под-, от-, до-, за- (прийти́ / приходи́ть) and the prepositions that go with them", "глаголы движения с приставками при-, у-, в-, вы-, под-, от-, до-, за-",
      [mango("how-to-use-prefixed-verbs-of-motion-in-russian-/ru15-how-to-use-prefixed-verbs-of-motion-in-russian-", "prefixed verbs of motion"),
       mn("unit07/7_7/language.shtml", "7.7: prefixes on verbs of motion"),
       bfr("sDwgUgXsUy8", "How do VERBS OF MOTION work with PREFIXES???"),
       ory("3_nIH6gocrQ", "ИДТИ - ХОДИТЬ и ЕХАТЬ - ЕЗДИТЬ со всеми приставками"),
       yt("9EHxaEI-O4M", "Russian With Max", "Russian Verbs of Motion With Prefixes - Lesson 1")],
      [ar("jy_oaOcBV8U", "Forms of Prefixed Verbs of Motion. Practice", "Exercise"),
       ar("PGA_znvoQ-o", "Identifying Forms of Prefixed Verbs of Motion. Practice", "Exercise"),
       mn("unit07/7_7/language.shtml", "7.7: prefixed motion verbs — Упражнения", "Exercise"),
       ory("99hWjvx7MJs", "ПОЙТИ, УЙТИ или ВЫЙТИ?")])
topic("vom4", "prefixed verbs of motion, part 2: пере-, про-, об-, с-…-ся, раз-…-ся, принести́ / привезти́ / привести́, and set phrases (идёт дождь, вести́ себя́, провести́ вре́мя)", "глаголы движения с приставками пере-, про-, об-, с-, раз-; переносное значение",
      [ory("jASU9b-xbxQ", "Глаголы НЕСТИ и НОСИТЬ, ВЕСТИ и ВОДИТЬ, ВЕЗТИ и ВОЗИТЬ со всеми приставками"),
       ory("rEGIecINVwk", "Урок 10. Глаголы движения БЕЗ ПРИСТАВОК в ПЕРЕНОСНОМ значении"),
       ory("jrI250k_jzY", "Урок 11. Глаголы движения С ПРИСТАВКАМИ в ПЕРЕНОСНОМ значении"),
       yt("bsPpIiUStX4", "Russian With Max", "Verbs of motion with prefixes (Russian) - EXAMPLES (Lesson 4)")],
      [ory("UUgYEuPkn9E", "Урок 6. ПОДХОДИТЬ, ДОХОДИТЬ, ПРИХОДИТЬ и другие"),
       ai_drill("глаголы движения с приставками")])
topic("num1", "numbers with nouns and adjectives: 1, 2–4 (два больши́х до́ма), 5+ (пять больши́х домо́в), дво́е / тро́е, о́ба / о́бе", "числительные с существительными и прилагательными",
      [mango("russian-cardinal-numbers-how-to-form-them-and-use-them-in-a-sentence-", "cardinal numbers"),
       mango("russian-collective-numerals-what-are-they-and-how-to-use-them-", "collective numerals"),
       ory("2BijFfC3N2E", "Урок 1. Как использовать существительные после числительных?"),
       ory("QGlw54QZQVA", "Урок 2. Как использовать прилагательные после числительных?"),
       rg("fshm0sW7SQk", "Adjectives after два/две, три, четыре in Russian"),
       ory("AzwxlcuR71w", "Урок 7. Собирательные числительные (двое, трое, четверо…)"),
       ar("P_8RgYuGv40", "Intermediate Russian: Expressing Similarity with BOTH: ОБА/ОБЕ")],
      [ai_drill("числительные 2, 3, 4, 5, 21 с существительными и прилагательными")])
topic("num2", "numbers in every case (a B2 must): в двух города́х, с пятью́ колле́гами, о́коло ста челове́к; ordinal numbers", "склонение числительных",
      [rff_table("russian-numbers-in-all-cases.php", "numbers in all cases"),
       mr("aa050601a.shtml", "cardinal numbers"),
       ory("HsLOY-NXeQE", "Урок 3. ЧИСЛИТЕЛЬНЫЕ 1, 2 – 4"),
       ory("QYJRKeweZnQ", "Урок 4. ЧИСЛИТЕЛЬНЫЕ 5 – 20, 30, 50 – 80, 40, 90, 100"),
       ory("tma2PKCAJog", "Урок 5. ЧИСЛИТЕЛЬНЫЕ 200 … 1000000000"),
       ory("h87kmDwefTI", "Урок 6. Порядковые числительные"),
       rg("rUYzNgGy_HU", "Genitive of Numbers"),
       rg("HDjH4wrCnuY", "Russian Numbers in the Instrumental Case")],
      [ai_drill("числительные в косвенных падежах (в двух городах, с пятью друзьями)")])
topic("time", "time expressions: в сре́ду / в ма́е / на э́той неде́ле, че́рез / наза́д, за / на + accusative, с … до, к, по, в тече́ние", "выражение времени",
      [mango("what-are-prepositions-of-time-in-russian-", "prepositions of time"),
       mango("when-to-use-the-accusative-case-to-discuss-time-in-russian-", "the accusative for time"),
       mango("when-to-use-the-prepositional-case-russian-time-descriptions-", "the prepositional for time"),
       pel(62, "duration of time"),
       rg("LwxSVmOPzGk", "Prepositions and Time Expressions in Russian"),
       bfr("X6HoB2dQtvE", "How to talk about time like a Russian native")],
      [mn("unit08/8_5/language.shtml", "8.5: через and назад — Упражнение 1", "Exercise"),
       ai_drill("выражение времени: в, на, через, назад, за, на, с … до")])
topic("dates", "dates, years, fractions and percentages: пя́того ма́я 2025 го́да, в 2026 году́, с 2010 по 2015 год, на 15 проце́нтов, две тре́ти", "даты, годы, проценты",
      [mango("how-to-say-dates-in-russian-", "dates"),
       mango("how-to-use-ordinal-numbers-in-russian-", "ordinal numbers"),
       pel(49, "dates"),
       rg("z0tyKHYgDZQ", "Expressing Dates in Russian"),
       rg("ZbSKttkOxvw", "Years in Russian"),
       ory("oHBmY8KG0DA", "Часть 2. Как отвечать на вопрос КОГДА? (день, месяц, год)"),
       ory("pNsnYimh9yE", "Урок 8. Дробные числа (½, 0,5…)"),
       ory("-TVOQFc_84c", "ПО + числительные. Как использовать?")],
      [ai_drill("даты, годы и проценты в разных падежах")])
topic("comp", "comparatives and superlatives: бо́льше / лу́чше / доро́же, бо́лее интере́сный, чем or the genitive, гора́здо, как мо́жно скоре́е, са́мый / наибо́лее / -ейший", "сравнительная и превосходная степень",
      [mango("what-are-comparatives-in-russian-", "comparatives"),
       mango("what-are-superlatives-in-russian-", "superlatives"),
       pel(25, "comparative degree of adjectives and adverbs"),
       rg("upUk9pPUiAY", "Comparatives (I)"),
       rg("M_bWXo4tiUA", "Comparisons II - Simple, Irregular"),
       rg("hBE49tdUTIA", "Comparatives III - \"than...\""),
       rg("BU5G06rgcS0", "Comparatives IV - Compound comparatives")],
      [mango_ex("how-to-form-different-types-of-comparisons-in-russian-", "comparisons")])
topic("short", "short adjectives: рад, прав, гото́в, за́нят, до́лжен, бо́лен; short vs long (он бо́лен / больно́й), сли́шком вели́к / мал", "краткие прилагательные",
      [mango("what-is-the-difference-between-long-and-short-adjectives-in-russian-", "long and short adjectives"),
       mr("aa041601a.shtml", "long and short forms of adjectives"),
       pel(27, "short forms of adjectives"),
       bfr("P58kohODIr0", "Short Adjectives - Everything you need to know"),
       ar("U7iEzba7oks", "Intermediate Russian: Short-form Adjectives")],
      [ai_drill("краткие прилагательные: рад, прав, готов, занят, должен, болен")])
topic("kotory", "кото́рый in every case: в кото́ром, с кото́рой, о кото́рых, and чей", "слово который во всех падежах",
      [mango("how-to-use-the-word-kotoryj-in-russian-", "который"),
       mango("how-to-use-the-word-kotoryj-in-russian-/study-resource-forms-of-kakoj-and-chej", "forms of какой and чей"),
       mr("aa012501a.shtml", "relative pronouns"),
       ory("O4ULc9Y0kOQ", "Урок 1. КОТОРЫЙ, КОТОРАЯ, КОТОРОЕ во всех падежах"),
       ory("STDYWRRP8ro", "Урок 2. КОТОРЫЕ во всех падежах"),
       rg("PQt_arA90l4", "Который: Expressing '..who../..that..'")],
      [mango_ex("how-to-use-the-word-kotoryj-in-russian-", "который")])
topic("tot-kto", "тот, кто / то, что / все, кто / всё, что, and о том, что / от того́, как (Э́то зави́сит от того́, …)", "тот, кто; то, что; о том, что",
      [rg("OF9IC-hl8Wk", "Connecting Clauses in Russian with то, что (and other question words)"),
       rg("N1JK6KNofrI", "Everything that.../Everyone who... - что, кто as Relative Pronouns"),
       ory("PwYBJ_sAFbM", "Урок 5. Как использовать ТОТ, КТО в сложном предложении?"),
       ory("nM4bldT0J7w", "Урок 4. Как склонять КТО и ЧТО и использовать эти формы?"),
       ory("_G9Ru9AuFyg", "ТОТ, ТА, ТО или ТЕ? Часть 2")],
      [ai_drill("тот, кто; то, что; о том, что; от того, что")])
topic("chtoby", "что or что́бы: хочу́, что́бы ты пришёл; для того́ что́бы; заче́м?", "что или чтобы",
      [mango("object-clauses-what-are-they-and-how-to-form-them-in-russian-", "что and ли clauses"),
       mango("how-to-use-dlya-for-na-for-chtoby-in-order-to-and-other-purpose-words-in-russian-", "для, на, чтобы"),
       mango("subjunctive-mood-in-russian-what-is-it-and-how-is-it-used-", "бы and чтобы"),
       ory("XYco_rTyMck", "ЧТО или ЧТОБЫ?"),
       ory("kDctmozLYlc", "Как сказать о ЦЕЛИ?"),
       ar("k2F98KSioiY", "Expressing Purpose with чтобы and Зачем?")],
      [ai_drill("что или чтобы; хочу, чтобы…")])
topic("reported", "reported speech and indirect questions: он сказа́л, что…; она́ спроси́ла, придёт ли он; попроси́л, что́бы…", "косвенная речь",
      [mango("how-to-report-speech-in-russian-", "reported speech"),
       mango("how-to-report-speech-in-russian-/study-resource-how-to-use-common-reporting-verbs-in-russian", "common reporting verbs"),
       pel(68, "indirect speech"),
       pel(67, "indirect commands")],
      [mango_ex("how-to-report-speech-in-russian-", "reported speech")])
topic("cond", "real and unreal conditions: е́сли + future, е́сли бы + past, я бы…, хорошо́ бы", "реальное и нереальное условие",
      [mango("russian-conditionals-how-to-form-if-then-sentences-in-russian-", "if-then sentences"),
       mr("aa042700a.shtml", "subjunctive and imperative mood"),
       pel(48, "conditional mood"),
       ory("n3SbEsVVEps", "Условие (часть 1): реальное условие"),
       ory("WK7wQO7fb7Q", "Условие (часть 2): нереальное условие"),
       rg("YGG03nCWngQ", "Real conditions"),
       rg("bmUDl920IKM", "Hypothetical Situations")],
      [ai_drill("если и если бы")])
topic("when", "time clauses: когда́, пока́ / пока́ не, как то́лько, по́сле того́ как, до того́ как, пе́ред тем как, пре́жде чем, с тех пор как", "сложные предложения времени",
      [mango("how-to-use-kogda-when-and-other-conjunctions-of-time-in-russian-", "когда and other time words"),
       ory("-kmR7_4WcrU", "Значение ВРЕМЯ в сложном предложении (союзы КОГДА и ПОКА). Часть 1"),
       ory("_7yq7EpF5uw", "Значение ВРЕМЯ в сложном предложении. Часть 2"),
       rg("NFtTs8fJOD8", "\"After I graduated...\" – после in Dependent Clauses")],
      [mango_ex("what-are-conjunctions-in-russian-", "conjunctions"),
       ai_drill("когда, пока, пока не, как только, после того как, перед тем как")])
topic("cause", "cause and result: потому́ что, так как, поско́льку, благодаря́ + dative, из-за + genitive, от / по + case, поэ́тому, так что", "причина и следствие",
      [mango("how-to-say-because-and-because-of-in-russian-", "because and because of"),
       mango("how-to-use-conjunctions-of-reason-purpose-result-and-concession-in-russian-", "reason, purpose, result and concession"),
       ory("atTA1ZRP3XY", "Как сказать о ПРИЧИНЕ?"),
       ory("HZmMQ2Rsb8o", "Как сказать о ПРИЧИНЕ: предлоги ОТ, ИЗ, ПО, ЗА")],
      [mango_ex("what-are-conjunctions-in-russian-", "conjunctions"),
       ai_drill("благодаря, из-за, потому что, так как, поэтому")])
topic("concede", "concession and contrast: хотя́, несмотря́ на (то, что), всё-таки, одна́ко, зато́, тем не ме́нее, в то вре́мя как, вме́сто того́ что́бы", "уступка и противопоставление",
      [mango("how-to-use-russian-coordinating-conjunctions-", "coordinating conjunctions"),
       mango("what-are-conjunctions-in-russian-", "conjunctions"),
       ory("I9fGvjB9jT0", "Значение УСТУПКА в простом и сложном предложениях")],
      [mango_ex("what-are-conjunctions-in-russian-", "conjunctions"),
       ai_drill("хотя, несмотря на то что, зато, однако, тем не менее")])
topic("indef", "indefinite words: кто́-то / кто́-нибудь / ко́е-кто, где́-то, когда́-нибудь", "неопределённые местоимения -то, -нибудь, кое-",
      [mango("indefinite-words-how-to-form-and-use-them-in-russian-", "indefinite words"),
       mr("aa010801a.shtml", "indefinite pronouns"),
       rg("gvC2-Gl6fVM", "Indefinite Expressions with -то, -нибудь in Russian"),
       rg("CUziLK_55ws", "Indefinite expressions in Russian with кое-"),
       ar("6CiUCSEVvno", "Indefinite Pronouns and Adverbs with -ТО and -НИБУДЬ")],
      [mn("unit08/8_4/language.shtml", "8.4: -то and -нибудь — Упражнение 1", "Exercise"),
       ai_drill("-то, -нибудь, кое-")])
topic("neg", "negative words: никто́ не… / ничего́ не… / нигде́ не…, and не́кого / не́чего / не́где / не́когда + infinitive", "отрицательные местоимения ни- и не-",
      [mango("how-to-form-and-use-negative-words-in-russian-", "negative words"),
       mr("aa022401a.shtml", "negative pronouns"),
       ar("wEkhyWhWQfs", "Negative Pronouns and Adverbs with НИ"),
       ar("MVWx0gos30I", "Intermediate Russian: Negative Pronouns and Adverbs: НЕ-words"),
       rg("R7B6BEqxEpE", "Negation in Russian")],
      [ar("8VUe4NA_S_A", "Intermediate Russian: Negative Idioms with НИ"),
       ai_drill("никто не… и некого…, ничего не… и нечего…")])
topic("impers", "impersonal sentences: мне хо́лодно / жаль / пора́, на́до / мо́жно / нельзя́, прихо́дится, удаётся, хо́чется, не спи́тся; Что мне де́лать?; Говоря́т, что…", "безличные предложения",
      [mango("how-to-use-impersonal-sentences-in-russian-", "impersonal sentences"),
       pel(58, "impersonal sentences"), pel(65, "impersonal construction"), pel(66, "indefinite subject"),
       rg("PR5iOYybOdc", "Feelings, Possibilities, and Permission in Russian: Subjectless Expressions and the Dative")],
      [ai_drill("безличные предложения: мне нужно, мне хочется, мне удалось, нам пришлось")])
topic("govern1", "verbs and the case they take: боя́ться / избега́ть / достига́ть + genitive; помога́ть / меша́ть / сове́товать / удивля́ться + dative; по́льзоваться / руководи́ть / горди́ться / увлека́ться + instrumental", "управление глаголов",
      [ar("zBv0PywKaoY", "Intermediate Russian: БОЯТЬСЯ. Verb TO BE AFRAID OF"),
       yt("nGt617HxR8g", "русский с носителем", "#69 Verbs governing the instrumental case"),
       L("Tool", "OpenRussian (look up which case a verb takes)", "https://en.openrussian.org/")],
      [ai_drill("управление глаголов: бояться, помогать, пользоваться, гордиться, достигать")])
topic("govern2", "verbs with prepositions: ду́мать о, зави́сеть от, отлича́ться от, согласи́ться с, уча́ствовать в, влия́ть на, жа́ловаться на, гото́виться к, относи́ться к", "глаголы с предлогами",
      [mango("what-are-object-prepositions-in-russian-", "object prepositions"),
       mango("what-are-object-prepositions-in-russian-/study-resource-russian-object-prepositions-reference-sheet", "object prepositions reference sheet")],
      [mango_ex("what-are-object-prepositions-in-russian-", "object prepositions"),
       ai_drill("глаголы с предлогами: зависеть от, влиять на, участвовать в, готовиться к")])
topic("prepos", "place and direction: в / на / к – из / с / от, у, над, под, пе́ред, за, ме́жду, ря́дом с, напро́тив; где / куда́ / отку́да", "предлоги места и направления",
      [mango("how-to-use-russian-prepositions-of-place-", "prepositions of place"),
       mango("how-to-use-russian-prepositions-of-direction-", "prepositions of direction"),
       mango("adverbs-of-place-vs-adverbs-of-direction-in-russian", "adverbs of place vs direction"),
       ory("tii5PXENEHo", "В, НА или К? ИЗ, С или ОТ?"),
       rg("QPKXWHSEYGg", "To and From with Motion in Russian"),
       bfr("CnXu0hMgZUQ", "Prepositions with Russian cases - a trick to cases")],
      [rrc("iWPzyRWBxW4", "PRACTICE Russian prepositions of place", "Exercise"),
       mn("unit05/5_7/language.shtml", "5.7: в or на — Упражнение 1", "Exercise")])
topic("prefix", "verb prefixes beyond motion: де́лать → переде́лать / доде́лать, чита́ть → дочита́ть / перечита́ть, брать, дава́ть, рабо́тать with prefixes", "глагольные приставки",
      [bfr("_8VNP_NjblY", "All the basics of PREFIXES in Russian"),
       rg("8OY0NQdhnKI", "Verbal Prefixes in Russian: an Introduction"),
       ory("zqPV2gGSyvQ", "Глагол ДЕЛАТЬ с приставками"),
       ory("9mVQLmvT3ck", "Глагол ЧИТАТЬ с приставками"),
       ory("g7CHxbPbLRs", "Глагол БРАТЬ с приставками (без суффикса -СЯ-). Часть 1"),
       ory("UKFi6XCq-ps", "Глагол ДАВАТЬ с приставками"),
       L("Lesson", "Wiktionary: Russian prefixes", "https://en.wiktionary.org/wiki/Category:Russian_prefixes")],
      [ai_drill("глаголы с приставками пере-, до-, за-, при-, раз-")])
topic("wordform", "word formation: -тель, -ник, -щик / -чик, -ость, -ние, -ство, -ец, -ка; adjectives in -н-, -ск-, -ов-, -лив- (and the word-formation notes in your book)", "словообразование",
      [L("Lesson", "Wiktionary: Russian suffixes", "https://en.wiktionary.org/wiki/Category:Russian_suffixes"),
       yt("3o502haXXmE", "Practice Russian Online", "Russian suffixes ЩИК and ЧИК")],
      [ai_drill("словообразование: от глагола к существительному (учить → учитель, решать → решение)")])
topic("pap", "active participles, present: чита́ющий, говоря́щий (= кото́рый чита́ет)", "действительные причастия настоящего времени",
      [L("Lesson", "Russian Enthusiast: participles", ENTH + "participles/"),
       ory("VWxt9wxDPbE", "Урок 1. Активные причастия (настоящее время)"),
       rg("4rgMOqDjdvs", "Present Active Participles in Russian"),
       ar("W8vyYlIv9Rs", "Intermediate Russian: Present Active Participles")],
      [rg("YCJcrxIzEgk", "Present Active Participles: Practice", "Exercise"),
       ai_drill("замени «который + глагол» действительным причастием настоящего времени")])
topic("pastap", "active participles, past: чита́вший, прочита́вший, прише́дший (= кото́рый чита́л / прочита́л / пришёл)", "действительные причастия прошедшего времени",
      [ory("J1vJTTNGJG4", "Урок 2. Активные причастия (прошедшее время)"),
       rg("g2ZRpCp0Ruo", "Past Active Participles"),
       ar("3qlMc1doDhM", "Intermediate Russian: Past Active Participles")],
      [ai_drill("замени «который + глагол в прошедшем времени» причастием")])
topic("ppp-pres", "passive participles, present: уважа́емый, люби́мый, так называ́емый, обсужда́емый (mostly to recognise when reading)", "страдательные причастия настоящего времени",
      [mango("what-are-passive-participles-in-russian-", "passive participles"),
       ory("2HL1l0952nM", "Урок 3. Пассивные причастия (настоящее время)"),
       rg("Y3wv1GWYEvY", "Present Passive Participles in Russian"),
       ar("wRMkd71wOpQ", "Intermediate Russian: Present Passive Participles")],
      [ai_drill("страдательные причастия настоящего времени (читаемый, любимый)")])
topic("ppp-past", "passive participles, past: прочи́танный, решённый, откры́тый, постро́енный", "страдательные причастия прошедшего времени",
      [ory("79Id4a5aS6Y", "Урок 4. Пассивные причастия (прошедшее время)"),
       rg("7_UHljEoxCQ", "Past Passive Participles I"),
       rg("VUDQqBvqfmM", "Past Passive Participles II"),
       rg("mMzVCkhYpH4", "Past Passive Participles III"),
       ar("MRZMh9utgkM", "Intermediate Russian: Past Passive Participles")],
      [ai_drill("страдательные причастия прошедшего времени (прочитанный, открытый)")])
topic("passive", "short passive participles and the passive: магази́н закры́т, дом был постро́ен в 1900 году́, дома́ стро́ятся", "краткие причастия и пассив",
      [mango("how-to-use-passive-voice-in-russian-", "the passive voice"),
       rg("y7Zh_ZyCBlM", "Past Passive Participles IV: Short Forms"),
       ory("DUyMbyKmKt4", "Урок 1. Активная или пассивная конструкция?"),
       ory("QKVJSHhnmGw", "Урок 2. Активная или пассивная конструкция? Краткие причастия"),
       yt("92kvhknmw9E", "Lina's Lessons", "Passive Voice in Russian")],
      [ai_drill("актив → пассив: «Строители построили дом» → «Дом был построен строителями»")])
topic("part-rev", "all participles together: participial phrases, commas, and turning кото́рый-clauses into participles and back", "причастные обороты",
      [ory("wEyGMHY4G3U", "Урок 5. Активные и пассивные причастия. Повторение"),
       L("Lesson", "Russian Enthusiast: participles", ENTH + "participles/")],
      [ai_drill("причастный оборот ↔ придаточное с «который»")])
topic("dpr-impf", "imperfective verbal adverbs: чита́я, говоря́, занима́ясь (= while doing)", "деепричастия несовершенного вида",
      [mango("what-are-verbal-adverbs-in-russian-", "verbal adverbs"),
       L("Lesson", "Russian Enthusiast: verbal adverbs (gerunds)", ENTH + "gerunds/"),
       ory("K-AWZvKPeVQ", "Урок 1. Что такое ДЕЕПРИЧАСТИЕ? Как его образовать?"),
       ar("VTVfZnMm3Nk", "Intermediate Russian: Imperfective Verbal Adverbs"),
       rg("9dlpjqX7LzM", "Imperfective Verbal Adverbs in Russian")],
      [mango_ex("what-are-verbal-adverbs-in-russian-", "verbal adverbs"),
       ar("HViPu3XI52k", "Imperfective Verbal Adverbs. Деепричастие или нет?", "Exercise")])
topic("dpr-pf", "perfective verbal adverbs: прочита́в, верну́вшись, придя́; adverbial phrases ↔ когда́ / по́сле того́ как / е́сли / так как", "деепричастия совершенного вида",
      [mango("what-are-verbal-adverbs-in-russian-/study-resource-forming-perfective-verbal-adverbs", "forming perfective verbal adverbs"),
       ar("ZUrDZFhcHyg", "Intermediate Russian: Perfective Verbal Adverbs"),
       ory("aldtsDXtW9g", "Урок 2. Деепричастный оборот и сложное предложение")],
      [mango_ex("what-are-verbal-adverbs-in-russian-", "verbal adverbs"),
       ai_drill("деепричастный оборот ↔ «когда / после того как / если»")])
topic("order", "word order and emphasis: new information goes last (Брат прие́хал вчера́ / Вчера́ прие́хал брат)", "порядок слов",
      [mr("aa060500a.shtml", "sentence structure"),
       bfr("GEkUWZeWuvc", "How NATIVES use WORD ORDER in Russian"),
       rg("x0m6rZFZt0Y", "Word Order in Russian (I)"),
       rg("uzz8WKmOBbs", "Word Order in Russian (II)")],
      [ai_drill("порядок слов: что нового в предложении")])
topic("particles", "particles: же, ведь, ли, да́же, то́лько, ещё / уже́, всё-таки, вот, ну", "частицы",
      [mango("particles-in-russian-what-are-they-and-when-to-use-them-", "particles"),
       bfr("22RDGqhOqRc", "All natives use ВЕДЬ, and you should too!"),
       bfr("FUERovst-_0", "How to use ЖЕ CORRECTLY in your sentences in Russian"),
       rg("9QOVTm67Kyk", "Using же for emphasis, emotion, contrast, and more"),
       ar("ZiqFk01ipdU", "What's the Difference: ТОТ ЖЕ vs. ТАКОЙ ЖЕ")],
      [mango_ex("particles-in-russian-what-are-they-and-when-to-use-them-", "particles")])
topic("commas", "commas in complex sentences: before что / что́бы / кото́рый / е́сли / хотя́, and around participial and adverbial phrases", "запятые в сложном предложении",
      [mango("how-to-use-commas-in-russian-vs-english-", "commas in Russian vs English"),
       mango("how-to-report-speech-in-russian-/study-resource-how-to-punctuate-dialogue-in-russian-", "punctuating dialogue"),
       ory("JZlozA1g04w", "Урок 5. Запятая в сложносочинённом предложении (ССП)")],
      [ai_drill("расставь запятые в сложных предложениях")])
topic("argue", "arguing: во-пе́рвых, с одной стороны́ … с друго́й стороны́, кро́ме того́, бо́лее того́, сле́довательно, таки́м о́бразом, на мой взгляд, су́дя по", "аргументация: вводные слова",
      [bfr("yPlaudmm3pk", "18 phrases that natives use to express their opinion"),
       mango("how-to-use-conjunctions-of-reason-purpose-result-and-concession-in-russian-", "reason, purpose, result and concession")],
      [ai_drill("вводные слова для аргументации")])
topic("formal", "formal Russian: official letters, requests and complaints (Уважа́емый…, Прошу́ Вас…, В связи́ с…, С уваже́нием)", "официальное письмо",
      [mr("aa092199.shtml", "writing a business letter"),
       pel(70, "how to write a short composition in Russian"),
       bfr("YXJuLt_XHKE", "Learn Russian FORMAL vs INFORMAL in 10 minutes")],
      [ai_drill("официальное письмо: просьба и жалоба")])
topic("bookish", "bookish style in news and reports: verbal nouns (приня́тие реше́ния), в связи́ с, в тече́ние, в результа́те, с це́лью, по сравне́нию с", "книжный стиль: отглагольные существительные",
      [mango("what-are-prepositions-of-manner-in-russian-", "prepositions of manner"),
       ar("ZiJqSdaUS7c", "Advanced Russian: Dative Case with Preposition ПО: Mass Media"),
       L("Read", "Gazeta.uz (news in Russian)", "https://www.gazeta.uz/ru/")],
      [ai_drill("книжный стиль: в связи с, в результате, с целью, по сравнению с")])
topic("asp4", "aspect, advanced: Вы чита́ли э́ту кни́гу?, Ко мне приходи́л друг (came and left), не на́до + imperfective, нельзя́ + perfective, polite vs blunt commands", "вид глагола: трудные случаи",
      [mr("aa031600a.shtml", "aspect of the verb"),
       mn("unit06/6_2/language.shtml", "6.2: aspect and negation"),
       ory("ndQ_dFzXN90", "Урок 2. ИМПЕРАТИВ НСВ и СВ"),
       rg("MBSulFoPdIg", "Aspect: A Matter of Perspective")],
      [mango_ex("what-is-the-perfective-aspect-in-russian-", "perfective aspect"),
       mn("unit06/6_2/language.shtml", "6.2: aspect and negation — Упражнения 3–4", "Exercise")])
topic("errors", "your own top-10 mistakes: the ones that come up most in your error log", "мои типичные ошибки",
      [rff_adv("nouns", 19), rff_adv("adjectives", 19)],
      [rff_adv("nouns", 20), rff_adv("adjectives", 20), ai_drill("мои типичные ошибки (вставь список из журнала ошибок)")])

GRAMMAR_WEEKS = [
    ("prep", "acc"), ("gen-sg", "gen-pl"), ("dat", "ins"), ("pron", "adj-pl"),
    ("conj", "sya"), ("asp1", "asp2"), ("imper", "asp3"), ("vom1", "vom2"),
    ("vom3", "vom4"), ("num1", "num2"), ("time", "dates"), ("comp", "short"),
    ("kotory", "tot-kto"), ("chtoby", "reported"), ("cond", "when"), ("cause", "concede"),
    ("indef", "neg"), ("impers", "govern1"), ("govern2", "prepos"), ("prefix", "wordform"),
    ("pap", "pastap"), ("ppp-pres", "ppp-past"), ("passive", "part-rev"), ("dpr-impf", "dpr-pf"),
    ("order", "particles"), ("commas", "argue"), ("formal", "bookish"), ("asp4", "errors"),
]
MONTH_THEMES = [
    "Cases: getting the endings right",
    "Verbs: conjugation, -ся, aspect, motion",
    "Prefixed motion verbs, numbers, time, comparison",
    "Complex sentences",
    "Pronouns, impersonal sentences, verb government, word formation",
    "Participles and verbal adverbs",
    "Word order, particles, style",
    "ТРКИ-2 (B2) exam practice",
]

# ---------------------------------------------------------------- exam weeks 29–32
TRKI2 = L("Exam task", "SPbU: ТРКИ-2 (B2) sample test (PDF)", "https://testingcenter.spbu.ru/images/files/TRKI-2.pdf")
TRKI2_PI = L("Exam task", "Pushkin Institute: ТРКИ-II sample test (PDF)", "https://www.pushkin.institute/wp-content/uploads/2022/11/%D0%A2%D0%A0%D0%9A%D0%98-II.pdf")
SPBU_SPEAK = L("Exam task", "SPbU: speaking test tasks and scoring (PDF)", "https://testingcenter.spbu.ru/images/webinars/webinar_9_test_rki.pdf")
SPBU_B2 = L("Exam task", "SPbU: the B2 test and its 15 speaking tasks (PDF)", "https://testingcenter.spbu.ru/images/webinars/webinar_trki_b2.pdf")
EXAM = {
    "x-grammar": ("the grammar and vocabulary part of the B2 test", [TRKI2, TRKI2_PI]),
    "x-reading": ("the reading part of the B2 test", [TRKI2, TRKI2_PI]),
    "x-listening": ("the listening part of the B2 test", [TRKI2, TRKI2_PI]),
    "x-writing": ("the writing part of the B2 test (a letter and an opinion text)", [TRKI2, TRKI2_PI]),
    "x-speak1": ("speaking tasks 1–12 (reacting in dialogues, intentions, intonation)", [SPBU_SPEAK, SPBU_B2]),
    "x-speak2": ("speaking tasks 13–15 (describe a video, phone about an ad, a 10–15-minute discussion)", [SPBU_B2, SPBU_SPEAK]),
    "x-mock1": ("a full mock test, written parts, timed", [TRKI2_PI, TRKI2]),
    "x-mock2": ("a full mock test, speaking, with an AI as the examiner", [SPBU_B2, SPBU_SPEAK]),
}
EXAM_WEEKS = [("x-grammar", "x-reading"), ("x-listening", "x-writing"), ("x-speak1", "x-speak2"), ("x-mock1", "x-mock2")]

# ---------------------------------------------------------------- the vocabulary book
UNITS = [
    (1, 3, "Towns and buildings. The household. Gardens", "Мой го́род и мой дом: что мне нра́вится и что я бы измени́л"),
    (2, 40, "The physical world", "Приро́да и пого́да в Узбекиста́не: како́е вре́мя го́да вы лю́бите и почему́"),
    (3, 76, "The human body and health", "Как вы забо́титесь о здоро́вье? Что вы де́лаете, когда́ боле́ете?"),
    (4, 122, "Appearance and movement", "Опиши́те вне́шность и мане́ру дви́гаться одного́ из геро́ев «Ку́хни»"),
    (5, 163, "Personality and human behaviour", "Хара́ктеры геро́ев «Ку́хни»: кто вам нра́вится, кто нет и почему́"),
    (6, 205, "Clothes, footwear, and accessories. Food and drink", "Ва́ше люби́мое блю́до: как его́ гото́вят"),
    (7, 232, "Perception", "Зву́ки, за́пахи и цвета́ ва́шего де́тства"),
    (8, 259, "Shapes and patterns. Size and quantity. Containers", "Опиши́те предме́т, не называ́я его́: фо́рма, разме́р, из чего́ он сде́лан"),
    (9, 286, "Visual and performing arts", "Фильм и́ли спекта́кль, кото́рый произвёл на вас впечатле́ние"),
    (10, 314, "Literature and literary criticism. Speaking, reading, and writing", "Кни́га, кото́рую вы бы посове́товали дру́гу"),
    (11, 341, "Leisure", "Как вы прово́дите свобо́дное вре́мя и выходны́е"),
    (12, 367, "Tourism, travel, and transport", "Са́мая интере́сная пое́здка в ва́шей жи́зни"),
    (13, 397, "Family, birth, death, and marriage", "Сва́дьба в Узбекиста́не: тради́ции и как они́ меня́ются"),
    (14, 423, "Education", "Плю́сы и ми́нусы онла́йн-обуче́ния"),
    (15, 451, "Agriculture. Industry", "Каки́е о́трасли эконо́мики важны́ для ва́шей страны́"),
    (16, 478, "Business and commerce", "Как откры́ть своё де́ло: сове́ты начина́ющим"),
    (17, 507, "The office and computing. Post and telecommunications", "Ваш рабо́чий день: чем занима́ется дата-инжене́р"),
    (18, 530, "Law and finance", "Как плани́ровать ли́чный бюдже́т"),
]
# Pages and exercise numbers checked in the publisher's preview (Unit 1 and the start of Unit 2).
KNOWN = {
    (1, 1, "lists"): "pp. 3–8",
    (1, 1, "ex"): ("pp. 8–14", "2, 3, 4, 7, 9, 16, 18, 21, 22"),
    (1, 2, "lists"): "pp. 15–20",
    (1, 2, "ex"): ("pp. 20–25", "2, 5, 6, 14, 15, 17"),
    (1, 3, "lists"): "pp. 26–31",
    (1, 3, "ex"): ("pp. 31–35", "6, 7, 9, 10"),
    (1, "extra"): "pp. 35–39",
    (2, 1, "lists"): "pp. 40–44",
    (2, 1, "ex"): ("pp. 44–48", "1, 2, 6, 11, 12"),
    (2, 2, "lists"): "pp. 49–52 are in the preview; the rest is in the full book",
}
BOOK = L("Book", "Terence Wade, «Using Russian Vocabulary» (Cambridge)", BOOK_URL)


def book_tasks():
    """Seven book sessions per unit, in order."""
    out = []
    for u, start, title, _ in UNITS:
        name = f"Unit {u} «{title}»"
        for lvl in (1, 2, 3):
            pages = KNOWN.get((u, lvl, "lists"))
            where = f", {pages}" if pages else (f" (the unit starts on p. {start})" if lvl == 1 else "")
            out.append((u, f"{name}, Level {lvl} word lists{where}. Read every list and the notes under it out loud (word formation, cognates, origins). Mark the words you didn't know: the word app is teaching you the same words, in the same order."))
            ex = KNOWN.get((u, lvl, "ex"))
            if ex:
                txt = f"{name}, Level {lvl} exercises, {ex[0]}. Do these first, they drill grammar and use the words in sentences: {ex[1]}. Then any others if there's time."
            else:
                txt = f"{name}, Level {lvl} exercises. Do the grammar ones first (gender, plurals, stress, verb forms, cases), then «Fill the gaps» and «Translate into Russian»; leave word origins for last."
            out.append((u, txt + " Check your answers in the Key to exercises at the back of the book (p. 557), or ask an AI if you only have the preview."))
        extra = KNOWN.get((u, "extra"))
        out.append((u, f"{name}, Additional vocabulary at the end of the unit{', ' + extra if extra else ''}. Skim it and add up to 10 words you really want as your own words in the word app. Then redo this unit's «Translate into Russian» exercises from memory."))
    return out


EPISODE_NOTE = "Russian subtitles on (CC → Russian, auto-generated)."
FILMS = [
    ("Служебный роман (part 1)", "hR-1QGMK75c"), ("Москва слезам не верит (part 1)", "X7GuhjGZ-xs"),
    ("Афоня", "L9HATyYkZLs"), ("Берегись автомобиля", "PGr-NddVue0"), ("Гараж", "Xqsa4u00GXM"),
    ("Мимино", "P4k2LNPRV-0"), ("Осенний марафон", "deEuVTAAzbg"), ("Вокзал для двоих", "3g-p1d8H02o"),
]

# ---------------------------------------------------------------- «Кухня» on STS's official channel (episode 21 isn't there), then «Отель Элеон»
EPISODES = [
    ('Кухня', 1, 1, 'HHAb-4Bmz70'),
    ('Кухня', 1, 2, 'RvlMxTlFf7w'),
    ('Кухня', 1, 3, 'o7jLJlTpkwo'),
    ('Кухня', 1, 4, '130Dt68uVN8'),
    ('Кухня', 1, 5, 'N-Cn0GOLl74'),
    ('Кухня', 1, 6, 'bEGMhMjrZdA'),
    ('Кухня', 1, 7, 'GR3vGBDtJ1s'),
    ('Кухня', 1, 8, 'tCLeN5ReavI'),
    ('Кухня', 1, 9, 'xzO5Da5sirs'),
    ('Кухня', 1, 10, 'wNFgaxeBaxU'),
    ('Кухня', 1, 11, 'IDNA-pwbHOA'),
    ('Кухня', 1, 12, 'db67SLeT8IE'),
    ('Кухня', 1, 13, 'QSXdtSO2TCA'),
    ('Кухня', 1, 14, '4MNYXF53Be8'),
    ('Кухня', 1, 15, 'IQplg-FuFSo'),
    ('Кухня', 1, 16, 'JAUFBVjbsxg'),
    ('Кухня', 1, 17, 'XJzNgtw7koQ'),
    ('Кухня', 1, 18, 'Bn4ZbzMlkBc'),
    ('Кухня', 1, 19, 'Y6cYtLCFuN8'),
    ('Кухня', 1, 20, '2AyV7L7ptHQ'),
    ('Кухня', 2, 22, 'wwlIRg_iJtM'),
    ('Кухня', 2, 23, 'GxVkto08hnk'),
    ('Кухня', 2, 24, 'DNGFY9T3SHg'),
    ('Кухня', 2, 25, '3ZKtLQ_4P4A'),
    ('Кухня', 2, 26, 'JXfOAXZJDz4'),
    ('Кухня', 2, 27, 'viRepRtBtmY'),
    ('Кухня', 2, 28, 'UA_dJjNp0po'),
    ('Кухня', 2, 29, 'TEjyr5M7Sd0'),
    ('Кухня', 2, 30, 'ScmDIwqookk'),
    ('Кухня', 2, 31, 'bWhU40YmL7A'),
    ('Кухня', 2, 32, 'exU3NK6xkWE'),
    ('Кухня', 2, 33, 'ur4F9PxfmIg'),
    ('Кухня', 2, 34, '1oEkH8Ne8Cw'),
    ('Кухня', 2, 35, 'y-x0b4TTUM0'),
    ('Кухня', 2, 36, 'AjK31GMU6Ic'),
    ('Кухня', 2, 37, '3y2tfe-3r_M'),
    ('Кухня', 2, 38, 'Q5rYkw7z0Vg'),
    ('Кухня', 2, 39, 'kWe9wizz12g'),
    ('Кухня', 2, 40, 'tpe7f-aTtQs'),
    ('Кухня', 3, 41, 'lbY-hVV6yQQ'),
    ('Кухня', 3, 42, 'wbTlJ98icXE'),
    ('Кухня', 3, 43, '_xwNIrINktg'),
    ('Кухня', 3, 44, 'g5IhynkQKYg'),
    ('Кухня', 3, 45, 'd9aYwdanCfg'),
    ('Кухня', 3, 46, 'EWjMmkc3CAY'),
    ('Кухня', 3, 47, 'OfdQWNIYjLs'),
    ('Кухня', 3, 48, 'nt7WR45cNZ8'),
    ('Кухня', 3, 49, 'L-dCUJx1Chg'),
    ('Кухня', 3, 50, '2p7BwS-VsGM'),
    ('Кухня', 3, 51, 'w5quSaKh3ic'),
    ('Кухня', 3, 52, 'u4gVUWSUQZg'),
    ('Кухня', 3, 53, '__I7LuHM8DY'),
    ('Кухня', 3, 54, 'NjqypukhSc4'),
    ('Кухня', 3, 55, 'Ge7PcD8hQ-0'),
    ('Кухня', 3, 56, 'BpMVHD3Gowo'),
    ('Кухня', 3, 57, 'bBjvGNtXVE8'),
    ('Кухня', 3, 58, 'clEY2yVv7z4'),
    ('Кухня', 3, 59, '-pYD7CMIqqw'),
    ('Кухня', 4, 60, 'xnTIFJ6B200'),
    ('Кухня', 4, 61, 'qQJ1R7wCsEQ'),
    ('Кухня', 4, 62, '-o82SQGFT6w'),
    ('Кухня', 4, 63, 'y5PoP30Um4g'),
    ('Кухня', 4, 64, 'j_7i1OIDBB0'),
    ('Кухня', 4, 65, 'OAuvtCsoOmY'),
    ('Кухня', 4, 66, 'ljmOn8hTdZs'),
    ('Кухня', 4, 67, 'VTQ9A9j8rAU'),
    ('Кухня', 4, 68, '_RFQb5reXxs'),
    ('Кухня', 4, 69, 'esrpUVoUaSw'),
    ('Кухня', 4, 70, 'fhk4XpJ5dVg'),
    ('Кухня', 4, 71, 'CeazMuklDlA'),
    ('Кухня', 4, 72, '3BhLgPZulYo'),
    ('Кухня', 4, 73, 'N7GR-LHVICY'),
    ('Кухня', 4, 74, 'qV82HcE90bo'),
    ('Кухня', 4, 75, 'Vy3B8NhYnRA'),
    ('Кухня', 4, 76, 'JrLn0Iygb4Y'),
    ('Кухня', 4, 77, 'srkl0s0dgIM'),
    ('Кухня', 4, 78, '3ILtaueRrQE'),
    ('Кухня', 4, 79, '8rfYuSRPtuM'),
    ('Кухня', 4, 80, 'gUFkd8ufgNI'),
    ('Кухня', 5, 81, 'SvqYtaxrqW0'),
    ('Кухня', 5, 82, 'poR2kqMRO3g'),
    ('Кухня', 5, 83, 'SkNCYFr7HoQ'),
    ('Кухня', 5, 84, 'ax74cXbp84Y'),
    ('Кухня', 5, 85, 'WayUvPHGv2s'),
    ('Кухня', 5, 86, 'l7y9bSU-SxU'),
    ('Кухня', 5, 87, '5WDxOiYQoTc'),
    ('Кухня', 5, 88, 'SfVV68oiSgw'),
    ('Кухня', 5, 89, 'VZaeF2oj1I0'),
    ('Кухня', 5, 90, 'mOf22zR3hc4'),
    ('Кухня', 5, 91, 'BDGQRDdy8Ek'),
    ('Кухня', 5, 92, 'G-CMc74ISQg'),
    ('Кухня', 5, 93, 'Yd1bY6CeVtc'),
    ('Кухня', 5, 94, 'Iv2TudIh9Rw'),
    ('Кухня', 5, 95, 'ZcAjmdrdhj4'),
    ('Кухня', 5, 96, 'r_RhtwJHav4'),
    ('Кухня', 5, 97, 'l2bngVLSKms'),
    ('Кухня', 5, 98, '4UKiWVtwEAk'),
    ('Кухня', 5, 99, '_pWp9XOw0p0'),
    ('Кухня', 5, 100, '7kgvxc_DwX0'),
    ('Кухня', 6, 101, 'bT_WAJSiUVU'),
    ('Кухня', 6, 102, 'sGD48B3psZM'),
    ('Кухня', 6, 103, 'hpqXygkbQGM'),
    ('Кухня', 6, 104, '75XS4SXNzro'),
    ('Кухня', 6, 105, 'f0YfHAzTLSo'),
    ('Кухня', 6, 106, 'reDWpYU3UZw'),
    ('Кухня', 6, 107, 'Zc5Mxhjygqs'),
    ('Кухня', 6, 108, 'sAWNoT5ae5o'),
    ('Кухня', 6, 109, '3HhUPSxhxIw'),
    ('Кухня', 6, 110, '09MfzdAJxho'),
    ('Кухня', 6, 111, 'qrQ5fU9oGLU'),
    ('Кухня', 6, 112, 'NLbedLYBWJg'),
    ('Кухня', 6, 113, 'WnUEafhFQ8g'),
    ('Кухня', 6, 114, 'YKLaZzqnSnQ'),
    ('Кухня', 6, 115, '1O-yF3Uj210'),
    ('Кухня', 6, 116, 'h_whvtBQloA'),
    ('Кухня', 6, 117, 'gmnyaHlExo8'),
    ('Кухня', 6, 118, '3aXj1-lvkpo'),
    ('Кухня', 6, 119, '8qntD1yFB24'),
    ('Кухня', 6, 120, '3pDRnWULdQY'),
    ('Отель Элеон', 1, 1, 'gyAfNkej5ts'),
    ('Отель Элеон', 1, 2, 'QAqjlvp3KmI'),
    ('Отель Элеон', 1, 3, 'lBHcy1khKKk'),
    ('Отель Элеон', 1, 4, 'JH1GFME7kDM'),
    ('Отель Элеон', 1, 5, 'qR67UnJpVb4'),
    ('Отель Элеон', 1, 6, '0dzqQj0vOTg'),
    ('Отель Элеон', 1, 7, 'W77_k6hEEGI'),
    ('Отель Элеон', 1, 8, 'D6RVbrO6djM'),
    ('Отель Элеон', 1, 9, 'ulMT1tQt_JQ'),
    ('Отель Элеон', 1, 10, 'e71f_il_gB8'),
    ('Отель Элеон', 1, 11, '1BsmM4fdZL4'),
    ('Отель Элеон', 1, 12, 'GhXBRA3Ty5w'),
]


# ---------------------------------------------------------------- building the days
WORDS = L("Words", "Слово за словом (word app)", APP)
AI_VOICE = L("AI partner", "ChatGPT voice chat", AI)
PLAN_MONTHS = 8


def ep_link(e):
    show, season, num, vid = e
    return L("Watch", f"«{show}», сезон {season}, серия {num} (official STS channel)", f"https://www.youtube.com/watch?v={vid}")


def ep_name(e):
    return f"«{e[0]}» episode {e[2]}"


def sent(text):
    """End a phrase with a full stop unless it already ends with one."""
    return text if text.endswith(("…", ".", "?", "!")) else text + "."


def build():
    books = book_tasks()
    bi = 0  # next book task
    ei = 0  # next episode
    days = []
    month_topics = {}
    unit_of_week = {}

    def task(n, slot, kind, text, links):
        return {"id": f"b{n}-{slot}", "kind": kind, "text": text, "links": links}

    for m in range(1, PLAN_MONTHS + 1):
        for d in range(1, 31):
            n = (m - 1) * 30 + d
            items = []
            if d <= 28:
                w = (m - 1) * 4 + (d - 1) // 7 + 1
                dow = (d - 1) % 7 + 1
                exam = w > len(GRAMMAR_WEEKS)
                if exam:
                    ka, kb = EXAM_WEEKS[w - len(GRAMMAR_WEEKS) - 1]
                    A = {"key": ka, "name": EXAM[ka][0], "ru": EXAM[ka][0], "learn": EXAM[ka][1], "drill": EXAM[ka][1]}
                    B = {"key": kb, "name": EXAM[kb][0], "ru": EXAM[kb][0], "learn": EXAM[kb][1], "drill": EXAM[kb][1]}
                else:
                    A, B = T[GRAMMAR_WEEKS[w - 1][0]], T[GRAMMAR_WEEKS[w - 1][1]]
                month_topics.setdefault(m, [])
                for t in (A, B):
                    if t not in month_topics[m]:
                        month_topics[m].append(t)
                # the week's episodes (Mon, Wed, Fri, Sat) and book unit
                week_start_ei = ei - {1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 4}[dow]
                week_eps = EPISODES[week_start_ei: week_start_ei + 4]
                if w not in unit_of_week:
                    unit_of_week[w] = books[min(bi, len(books) - 1)][0]
                unit = UNITS[unit_of_week[w] - 1]
                theme = f"Grammar: {A['ru']} · {B['ru']}" if not exam else f"B2 exam: {A['name']} · {B['name']}"
                theme += f" · Book: Unit {unit[0]} · {week_eps[0][0]} {week_eps[0][2]}–{week_eps[-1][2]}" if week_eps else ""
                k = 1
                # 1. words, always first
                if dow == 7:
                    items.append(task(n, "words", "anki", f"{k}. Words (15 min): your reviews and the test in Слово за словом. Skip new words today if you're short on time.", [WORDS]))
                else:
                    before = " Do this first: the episode comes after your words." if dow in (1, 3, 5, 6) else ""
                    items.append(task(n, "words", "anki", f"{k}. Words (20 min): in Слово за словом, do today's new words, your reviews and the test if there is one. The new words follow your book, so this week they come from Unit {unit[0]} «{unit[2]}».{before}", [WORDS]))
                k += 1
                if n == 1:
                    items.insert(0, task(n, "setup", "setup", "Before you start (30 min): take the Russian for Free level test. Then write about 150 words «О себе́, о рабо́те и заче́м мне ру́сский» and ask ChatGPT to list your mistakes grouped by grammar topic. Write the 3 biggest groups in the notes below: those are the topics to watch most. Last, record a 2-minute «before» answer to «Расскажи́ о себе́» and keep the file.",
                                         [L("Test", "Russian for Free level test", "https://www.russianforfree.com/Russian-level-test.php"), AI_VOICE]))
                    items.insert(1, task(n, "app", "setup", "Set up the word app (5 min): in Слово за словом → Options, set «New words a day» to 25 (the book has about 5,000 words), leave «Additional vocabulary» on Skip, and enter the same email as on this page so your words sync. New words now come from Terence Wade's «Using Russian Vocabulary», unit by unit.", [WORDS]))
                    for i, it in enumerate(items):
                        it["text"] = f"{i + 1}." + it["text"].split(".", 1)[1] if it["text"][0].isdigit() else f"{i + 1}. " + it["text"]
                    k = len(items) + 1

                def add(slot, kind, text, links):
                    nonlocal k
                    items.append(task(n, slot, kind, f"{k}. {text}", links))
                    k += 1

                def add_book():
                    nonlocal bi
                    if bi < len(books):
                        add("book", "book", f"Book (20 min): {books[bi][1]}", [BOOK])
                        bi += 1

                def add_watch():
                    nonlocal ei
                    e = EPISODES[ei]
                    intro = ""
                    if ei == 0:
                        intro = " «Кухня» (2012–2016) is a comedy set in the kitchen of an expensive Moscow restaurant: everyday modern Russian, about 25 minutes an episode, and plenty of food and work words. All episodes are free on STS's official channel (episode 21 isn't, so the plan skips it)."
                    elif e[0] != EPISODES[ei - 1][0]:
                        intro = " «Кухня» is over: «Отель Элеон» continues the story with the same characters, in a hotel."
                    add("watch", "watch", f"Watch (30 min): {ep_name(e)}, after your words.{intro} {EPISODE_NOTE} Watch it through, then replay one scene you liked twice. Add 3–5 words you heard and want to keep as your own words in Слово за словом (Words → Add your own word); they come first tomorrow.",
                        [ep_link(e), WORDS])
                    ei += 1

                if dow == 1:
                    if exam:
                        add("grammar", "test", f"Exam practice (40 min): {sent(A['name'])} Do this part of the first sample test below with a timer, then mark it. Write what went wrong in the error log.", A["learn"])
                    else:
                        add("grammar", "grammar", f"Learn (40 min): {sent(A['name'])} Study the lessons and videos below. You're done when you can explain the rule in your own words and give 3 examples.", A["learn"])
                    if n != 1:
                        add_book()
                    add_watch()
                elif dow == 2:
                    if exam:
                        add("grammar", "test", f"Exam practice (35 min): {A['name']} again, in the second sample test below. Compare with yesterday.", A["drill"][::-1])
                    else:
                        add("grammar", "grammar", f"Drill (35 min): {sent(A['name'])} Look at the first lesson again, then do the exercises below until about 9 in 10 are right. Every mistake goes into the error log.", [A["learn"][0]] + A["drill"])
                    add_book()
                    last = EPISODES[ei - 1]
                    add("write", "write", f"Write (25 min): 8–10 sentences about {ep_name(last)} using {('the week’s grammar (' + A['ru'] + ')') if not exam else 'linking words (во-первых, однако, поэтому)'}. Paste them into ChatGPT with «Испра́вь мои́ оши́бки и объясни́ ка́ждую по-англи́йски.» Copy every correction into the error log below.",
                        [ep_link(last), AI_VOICE])
                elif dow == 3:
                    if exam:
                        add("grammar", "test", f"Exam practice (40 min): {sent(B['name'])} Do it in the first sample test below, timed, then mark it.", B["learn"])
                    else:
                        add("grammar", "grammar", f"Learn (40 min): {sent(B['name'])} Study the lessons and videos below. You're done when you can explain the rule in your own words and give 3 examples.", B["learn"])
                    add_watch()
                    add("speak", "speak", f"Speak (20 min): a 10-minute voice chat with an AI on this unit's topic, «{unit[3]}». Start with «Дава́й поговори́м по-ру́сски. Мой у́ровень — B1. Те́ма: {unit[3]}. Задава́й вопро́сы по одному́ и исправля́й мои́ оши́бки{', осо́бенно ' + A['ru'] if not exam else ''}.» Use words from the book unit.",
                        [AI_VOICE])
                elif dow == 4:
                    if exam:
                        add("grammar", "test", f"Exam practice (35 min): {B['name']} again, in the second sample test below.", B["drill"][::-1])
                    else:
                        add("grammar", "grammar", f"Drill (35 min): {sent(B['name'])} Look at the first lesson again, then do the exercises below until about 9 in 10 are right. Every mistake goes into the error log.", [B["learn"][0]] + B["drill"])
                    add_book()
                    e1, e2 = EPISODES[ei - 2], EPISODES[ei - 1]
                    add("speak", "speak", f"Speak (25 min): retell {ep_name(e1)} and episode {e2[2]} in 3 minutes{', using ' + A['ru'] + ' and ' + B['ru'] if not exam else ''}. Record yourself, listen back and write 3 mistakes in the error log. Then let the AI ask you 5 questions about the episodes.",
                        [ep_link(e1), ep_link(e2), AI_VOICE])
                elif dow == 5:
                    if exam:
                        add("grammar", "test", "Accuracy drill (30 min): your error log's 10 most common mistakes. Make an AI quiz of them, then do the two advanced case tests below.",
                            [rff_adv("nouns", (w % 16) + 3), rff_adv("adjectives", (w % 16) + 3), ai_drill("мои типичные ошибки (вставь список из журнала ошибок)")])
                    else:
                        add("grammar", "grammar", f"Mixed drill (30 min): redo this week's exercises that went wrong ({A['ru']}; {B['ru']}). Then keep your cases sharp with the two advanced tests below, 10 questions each.",
                            [A["drill"][0], B["drill"][0], rff_adv("nouns", ((w - 1) % 16) + 3), rff_adv("adjectives", ((w - 1) % 16) + 3)])
                    add_book()
                    add_watch()
                elif dow == 6:
                    add_watch()
                    add("write", "write", f"Write (30 min): 120–150 words on «{unit[3]}», using this week's grammar{' (' + A['ru'] + '; ' + B['ru'] + ')' if not exam else ''} and at least 10 words from the book unit. Get it corrected by AI as on Tuesday and keep the corrected text in your notes.",
                        [AI_VOICE])
                else:  # Sunday
                    add("weekly", "review", "Weekly check (20 min): read your error log. Which 3 mistakes came up most this week? Redo the exercises below where you went wrong, then write 5 corrected sentences from memory.",
                        [A["drill"][0], B["drill"][0]])
                    add("rewatch", "watch", "Rewatch (25 min): your favourite of this week's episodes, without subtitles this time. How much did you understand: half? Two thirds? Write the number in the notes and compare it week to week.",
                        [ep_link(e) for e in week_eps])
                day = {"n": n, "month": m, "week": w, "dow": dow, "theme": theme, "items": items}
            elif d == 29:
                topics = month_topics.get(m, [])
                last_units = sorted({unit_of_week[x] for x in unit_of_week if (x - 1) // 4 + 1 == m})
                items.append(task(n, "words", "anki", "1. Words (15 min): your reviews and the test in Слово за словом.", [WORDS]))
                if m == PLAN_MONTHS:
                    rec = "2. Final recording (15 min): answer «Расскажи́ о себе́, о свое́й рабо́те и о сериа́ле, кото́рый ты смо́тришь» for 3 minutes without notes. Listen to it next to your day 1 recording: what's better?"
                else:
                    rec = "2. Monthly recording (10 min): answer «Расскажи́ о себе́, о свое́й рабо́те и о сериа́ле, кото́рый ты смо́тришь» for 2 minutes without notes, and listen to it next to last month's."
                items.append(task(n, "recording", "speak", rec, [AI_VOICE]))
                names = " · ".join(t["ru"] for t in topics)
                items.append(task(n, "check", "review", f"3. Grammar check (35 min): one exercise for each of this month's topics ({names}). Any topic under 8 in 10 goes into next week's Friday drill.",
                                  [t["drill"][0] for t in topics]))
                units_txt = ", ".join(str(u) for u in last_units)
                items.append(task(n, "bookcheck", "book", f"4. Book check (20 min): look back at this month's units ({units_txt}). Redo the «Translate into Russian» exercises you got wrong, and say each new word out loud in a sentence.", [BOOK]))
                day = {"n": n, "month": m, "theme": "Monthly check", "items": items}
            else:
                title, vid = FILMS[m - 1]
                items.append(task(n, "words", "anki", "1. Words (15 min): your reviews and the test in Слово за словом.", [WORDS]))
                items.append(task(n, "catchup", "review", "2. Catch up (60 min): finish any task from this month you haven't ticked. Days with open tasks have no green in the calendar above.", [WORDS]))
                film = f"3. Film night (1½–2 h): Mosfilm «{title}», a Soviet classic full of everyday speech that Russians still quote. Watch with Russian subtitles if the player has them, and add 5 phrases you liked as your own words."
                items.append(task(n, "film", "watch", film, [L("Watch", f"Mosfilm: «{title}» (full film)", f"https://www.youtube.com/watch?v={vid}"), WORDS]))
                if m == PLAN_MONTHS:
                    items.append(task(n, "next", "test", "4. Next step: book the ТРКИ-2 (B2) exam at a test centre and take a full mock test the week before.",
                                      [L("Course", "ТРКИ test centres", "https://pushkininstitute.ru/certified2"), TRKI2]))
                day = {"n": n, "month": m, "theme": "Catch-up and film", "items": items}
            days.append(day)
    assert bi == len(books), (bi, len(books))
    # Stress marks belong to the word app, where they're copied from the book; none in the plan's own text.
    for day in days:
        for it in day["items"]:
            it["text"] = it["text"].replace("\u0301", "")
            for link in it["links"]:
                link["title"] = link["title"].replace("\u0301", "")
        day["theme"] = day["theme"].replace("\u0301", "")
    return {"title": f"{PLAN_MONTHS * 30} days", "days": days}


def check(plan):
    urls = sorted({l["url"] for day in plan["days"] for it in day["items"] for l in it["links"]})
    bad = []
    ua = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}
    for u in urls:
        target = u
        if "youtube.com/watch" in u:
            target = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(u, safe="")
        try:
            req = urllib.request.Request(target, headers=ua)
            with urllib.request.urlopen(req, timeout=30) as r:
                ok = r.status == 200
        except Exception as e:  # noqa: BLE001
            ok = False
            print("FAIL", u, e)
        if not ok:
            bad.append(u)
    print(f"{len(urls) - len(bad)} of {len(urls)} links open")
    return bad


if __name__ == "__main__":
    import urllib.parse

    plan = build()
    if "--check" in sys.argv:
        sys.exit(1 if check(plan) else 0)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=1)
        f.write("\n")
    tasks = sum(len(d["items"]) for d in plan["days"])
    print(f"wrote {OUT}: {len(plan['days'])} days, {tasks} tasks")
