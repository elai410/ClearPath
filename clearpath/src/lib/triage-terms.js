/**
 * Multilingual symptom vocabulary for the deterministic router.
 *
 * With the model disabled, `keywordRoute` is the only thing between a patient's
 * own words and the right department. English-only patterns meant someone
 * typing "me duele mucho el pecho" fell through every branch into low-urgency
 * triage — the most consequential failure in the app, and silent.
 *
 * Terms are grouped by clinical concept rather than by language, so adding a
 * language is one line per concept and the routing logic never changes.
 */

function esc(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Latin and Cyrillic terms need boundaries so "chest" cannot match inside
 * "Winchester", but JS `\b` is ASCII-only and breaks on "está" — hence the
 * explicit `\p{L}` lookarounds. CJK and Arabic are matched as plain substrings
 * because they are not space-delimited.
 */
function bounded(term) {
  const alphabetic = /[a-z\u00c0-\u024f\u0400-\u04ff]/i.test(term);
  return alphabetic ? `(?<!\\p{L})${esc(term)}(?!\\p{L})` : esc(term);
}

/**
 * "Any of A within `gap` characters of any of B, in either order" — the shape of
 * nearly every way a person describes a symptom: "chest pain", "pain in my
 * chest", "me duele mucho el pecho". Exact phrase lists miss the middle word.
 * Sentence punctuation bounds the gap so two unrelated complaints in adjacent
 * sentences don't combine into a third one nobody reported.
 */
function near(a, b, gap = 24) {
  const left = a.map(bounded).join("|");
  const right = b.map(bounded).join("|");
  const sep = `[^.!?;。！？]{0,${gap}}`;
  return new RegExp(`(?:${left})${sep}(?:${right})|(?:${right})${sep}(?:${left})`, "iu");
}

/** Body parts and symptom words, kept separate so they can be matched near each other. */
const CHEST = ["chest", "pecho", "peito", "tórax", "torax", "pwatrin", "грудь", "груди", "грудной", "الصدر", "صدري", "بصدري", "胸", "胸口", "心口"];
const PAIN = [
  "pain", "hurt", "hurts", "hurting", "ache", "aching", "pressure", "tight", "tightness", "crushing",
  "dolor", "duele", "dolía", "presión", "opresión",
  "dor", "dói", "doi", "aperto", "pressão",
  "fè mal", "doulè",
  "боль", "болит", "боли", "давит", "ноет",
  "ألم", "وجع", "ضيق", "آلام",
  "痛", "疼", "闷",
];
const BELLY = ["stomach", "abdomen", "abdominal", "belly", "tummy", "estómago", "estomago", "abdominal", "barriga", "vientre", "estômago", "vant", "живот", "животе", "المعدة", "البطن", "胃", "腹", "肚子"];

export const SYMPTOM_TERMS = {
  chest_pain: [
    near(CHEST, PAIN),
    "chest pain", "pressure in my chest",
    "胸痛", "胸闷",
    "боль в груди",
  ],
  breathing: [
    near(["breathe", "breathing", "breath", "respirar", "aire", "ar", "respire", "souf", "дышать", "дыхание", "воздуха", "التنفس", "呼吸", "气"],
         ["can't", "cannot", "trouble", "hard", "difficult", "short", "shortness",
          "no puedo", "falta", "dificultad", "cuesta",
          "não consigo", "falta", "dificuldade",
          "pa ka", "pwoblèm", "kout",
          "не могу", "трудно", "тяжело", "нехватка",
          "لا أستطيع", "ضيق", "صعوبة",
          "困难", "不上", "短", "无法"]),
    "short of breath", "shortness of breath",
    "одышка", "喘不上气", "气短",
  ],
  stroke: [
    "stroke", "face is drooping", "slurred speech", "can't move my arm", "sudden weakness",
    "derrame", "embolia", "no puedo mover el brazo", "se me torció la cara", "hablo raro",
    "derrame cerebral", "avc", "não consigo mover o braço",
    "konjesyon serebral", "mwen pa ka bouje bra m",
    "中风", "脑中风", "半边身体不能动", "说话不清",
    "جلطة دماغية", "سكتة دماغية", "لا أستطيع تحريك ذراعي",
    "инсульт", "перекосило лицо", "не могу двигать рукой", "невнятная речь",
  ],
  unconscious: [
    "unconscious", "passed out", "fainted", "not responding", "collapsed",
    "inconsciente", "se desmayó", "no responde", "se cayó desmayado",
    "desmaiou", "não responde", "perdeu a consciência",
    "li pèdi konesans", "li pa reponn",
    "昏迷", "失去意识", "晕倒", "没有反应",
    "فاقد الوعي", "أُغمي عليه", "لا يستجيب",
    "потерял сознание", "без сознания", "не реагирует", "упал в обморок",
  ],
  bleeding: [
    "severe bleeding", "bleeding a lot", "won't stop bleeding", "lost a lot of blood",
    "sangrado abundante", "sangra mucho", "no para de sangrar", "hemorragia",
    "sangrando muito", "não para de sangrar", "hemorragia",
    "l ap senyen anpil", "san an pa kanpe",
    "大出血", "流血不止", "出血很多",
    "نزيف شديد", "ينزف بغزارة", "لا يتوقف النزيف",
    "сильное кровотечение", "кровь не останавливается", "много крови",
  ],
  child: [
    "my child", "my kid", "my daughter", "my son", "my baby", "toddler", "infant",
    "mi hijo", "mi hija", "mi bebé", "mi niño", "mi niña", "mi nene",
    "meu filho", "minha filha", "meu bebê", "minha criança",
    "pitit mwen", "pitit fi mwen", "pitit gason mwen", "tibebe mwen",
    "我的孩子", "我儿子", "我女儿", "我的宝宝", "小孩",
    "طفلي", "ابني", "ابنتي", "رضيعي",
    "мой ребёнок", "мой сын", "моя дочь", "мой малыш",
  ],
  pregnancy: [
    "pregnant", "in labor", "contractions", "water broke",
    "embarazada", "de parto", "contracciones", "se me rompió la fuente",
    "grávida", "em trabalho de parto", "contrações", "bolsa rompeu",
    "ansent", "mwen gen tranche",
    "怀孕", "临产", "宫缩", "破水",
    "حامل", "في المخاض", "تقلصات", "نزل ماء الرأس",
    "беременна", "роды", "схватки", "воды отошли",
  ],
  fever: [
    "fever", "high temperature", "burning up",
    "fiebre", "calentura", "mucha temperatura",
    "febre", "temperatura alta",
    "lafyèv", "li cho anpil",
    "发烧", "高烧", "发热",
    "حمى", "سخونة", "حرارة عالية",
    "температура", "жар", "высокая температура",
  ],
  seizure: [
    "seizure", "convulsion", "shaking uncontrollably",
    "convulsión", "ataque", "convulsiones",
    "convulsão", "crise convulsiva",
    "kriz", "lakranp",
    "抽搐", "癫痫", "惊厥",
    "تشنج", "نوبة تشنجية",
    "судороги", "приступ", "конвульсии",
  ],
  animal_bite: [
    "bite", "bit me", "bitten", "rabies", "stray dog", "bat", "raccoon",
    "mordida", "me mordió", "mordedura", "rabia", "perro callejero", "murciélago",
    "mordida", "me mordeu", "raiva", "cão de rua", "morcego",
    "mòde", "chen mòde m", "laraj", "chen lari",
    "咬伤", "被狗咬", "狂犬病", "流浪狗", "蝙蝠",
    "عضة", "عضني", "داء الكلب", "كلب ضال", "خفاش",
    "укус", "укусила собака", "бешенство", "бродячая собака",
  ],
  imaging: [
    "mri", "pet scan", "ct scan", "referral for a scan", "neuroradiology",
    "resonancia", "tomografía", "referido para un estudio",
    "ressonância", "tomografia", "encaminhamento para exame",
    "mri", "eskanè",
    "核磁共振", "ct", "影像检查", "扫描",
    "رنين مغناطيسي", "أشعة مقطعية", "تصوير",
    "мрт", "кт", "направление на обследование",
  ],
  abdominal: [
    near(BELLY, PAIN),
    "nausea", "vomiting", "náusea", "vómito", "vômito", "kè plen", "vomi",
    "恶心", "呕吐", "غثيان", "قيء", "тошнота", "рвота",
  ],
  vision: [
    "eye", "vision", "can't see", "blurry",
    "ojo", "vista", "no puedo ver", "visión borrosa",
    "olho", "visão", "não consigo ver", "visão embaçada",
    "je", "je m fè mal", "mwen pa wè klè",
    "眼睛", "视力", "看不清",
    "عين", "بصر", "لا أرى بوضوح",
    "глаз", "зрение", "плохо вижу", "расплывается",
  ],
  diabetes: [
    "diabetes", "blood sugar", "insulin",
    "diabetes", "azúcar en la sangre", "insulina",
    "diabetes", "açúcar no sangue", "insulina",
    "dyabèt", "sik nan san",
    "糖尿病", "血糖", "胰岛素",
    "سكري", "سكر في الدم", "إنسولين",
    "диабет", "сахар в крови", "инсулин",
  ],
  fracture: [
    "wrist", "broken bone", "fracture", "sprained", "fell and",
    "muñeca", "hueso roto", "fractura", "esguince", "me caí",
    "pulso", "osso quebrado", "fratura", "torção", "eu caí",
    "ponyèt", "zo kase", "mwen tonbe",
    "手腕", "骨折", "扭伤", "摔倒",
    "معصم", "كسر", "التواء", "وقعت",
    "запястье", "перелом", "вывих", "упал",
  ],
  surgery: [
    "surgery", "operation", "transplant", "post-op",
    "cirugía", "operación", "trasplante",
    "cirurgia", "operação", "transplante",
    "operasyon", "chiriji",
    "手术", "移植", "术后",
    "عملية", "جراحة", "زرع",
    "операция", "хирургия", "трансплантация",
  ],
  oncology: [
    "breast", "cancer", "oncology", "mammogram", "chemo", "tumor",
    "seno", "cáncer", "oncología", "mamografía", "quimio", "tumor",
    "mama", "câncer", "oncologia", "mamografia", "quimio", "tumor",
    "tete", "kansè", "chemyo",
    "乳房", "癌症", "肿瘤", "化疗", "乳腺",
    "ثدي", "سرطان", "أورام", "تصوير الثدي", "كيماوي",
    "грудь", "рак", "онкология", "маммография", "химия", "опухоль",
  ],
  pulmonary: [
    "asthma", "pulmonary", "eeg", "wheezing", "copd", "chest clinic",
    "asma", "pulmonar", "silbidos al respirar",
    "asma", "pulmonar", "chiado no peito",
    "opresyon", "hik nan respire",
    "哮喘", "肺", "脑电图", "呼吸有哨音",
    "ربو", "رئوي", "صفير في التنفس",
    "астма", "лёгкие", "ээг", "свист при дыхании",
  ],
  behavioral: [
    "anxious", "anxiety", "depressed", "depression", "panic", "suicidal", "hopeless", "isolated",
    "ansioso", "ansiedad", "deprimido", "depresión", "pánico", "quitarme la vida", "sin esperanza",
    "ansioso", "ansiedade", "deprimido", "depressão", "pânico", "sem esperança",
    "enkyete", "kè sote", "dekouraje", "tris anpil",
    "焦虑", "抑郁", "恐慌", "想自杀", "绝望",
    "قلق", "اكتئاب", "هلع", "أفكار انتحارية", "يائس",
    "тревога", "депрессия", "паника", "мысли о самоубийстве", "безнадёжность",
  ],
  nonmedical: [
    "cafeteria", "gift shop", "i'm lost", "information desk", "parking", "visiting someone",
    "cafetería", "estoy perdido", "información", "estacionamiento", "vengo a visitar",
    "cafeteria", "estou perdido", "informação", "estacionamento", "vim visitar",
    "kafeterya", "mwen pèdi", "enfòmasyon",
    "餐厅", "食堂", "我迷路了", "咨询台", "停车", "探访",
    "كافتيريا", "أنا تائه", "مكتب المعلومات", "موقف السيارات", "زيارة",
    "столовая", "я заблудился", "справочная", "парковка", "навестить",
  ],
};

const MATCHERS = Object.fromEntries(
  Object.entries(SYMPTOM_TERMS).map(([concept, terms]) => [
    concept,
    terms.map((term) => (term instanceof RegExp ? term : new RegExp(bounded(term), "iu"))),
  ])
);

/** Every clinical concept present in the text, in any supported language. */
export function conceptsIn(text = "") {
  const s = String(text).toLowerCase();
  if (!s.trim()) return new Set();
  const found = new Set();
  for (const [concept, patterns] of Object.entries(MATCHERS)) {
    if (patterns.some((re) => re.test(s))) found.add(concept);
  }
  return found;
}

export function hasConcept(text, ...names) {
  const found = conceptsIn(text);
  return names.some((n) => found.has(n));
}
