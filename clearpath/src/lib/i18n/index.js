/**
 * Localization for the deterministic (no-LLM) path.
 *
 * ClearPath must stay useful when the model is disabled or unreachable, and a
 * patient who speaks Spanish should not silently drop to English the moment we
 * stop calling out. Every key falls back to English individually, and a
 * language whose coverage is incomplete is flagged so the UI can offer a human
 * interpreter instead of pretending the translation is complete.
 */
import en from "./strings.en.js";
import es from "./strings.es.js";
import zh from "./strings.zh.js";
import pt from "./strings.pt.js";
import ht from "./strings.ht.js";
import ar from "./strings.ar.js";
import ru from "./strings.ru.js";

const CATALOG = { en, es, zh, pt, ht, ar, ru };

export const LANGUAGES = {
  en: { label: "English", native: "English", dir: "ltr", aliases: ["english", "en", "eng"] },
  es: { label: "Spanish", native: "Español", dir: "ltr", aliases: ["spanish", "espanol", "español", "es", "castellano"] },
  zh: { label: "Chinese", native: "中文", dir: "ltr", aliases: ["chinese", "mandarin", "cantonese", "zh", "zh-cn", "中文", "simplified chinese", "traditional chinese"] },
  pt: { label: "Portuguese", native: "Português", dir: "ltr", aliases: ["portuguese", "portugues", "português", "pt", "pt-br", "brazilian portuguese"] },
  ht: { label: "Haitian Creole", native: "Kreyòl Ayisyen", dir: "ltr", aliases: ["haitian creole", "haitian", "creole", "kreyol", "kreyòl", "ht", "kreyòl ayisyen"] },
  ar: { label: "Arabic", native: "العربية", dir: "rtl", aliases: ["arabic", "ar", "العربية"] },
  ru: { label: "Russian", native: "Русский", dir: "ltr", aliases: ["russian", "ru", "русский"] },
};

/** Languages we can render end to end without falling back mid-sentence. */
const FULL_COVERAGE_THRESHOLD = 0.98;

/**
 * Chrome keys (buttons, field labels, section headings) are counted separately
 * from clinical copy. Falling back to English on a button label is an
 * inconvenience; falling back on "what you are waiting for" is a safety
 * problem. Only the clinical surface decides whether we offer an interpreter.
 */
const CHROME_PREFIX = "ui.";
const CLINICAL_KEYS = Object.keys(en).filter((k) => !k.startsWith(CHROME_PREFIX));
const CHROME_KEYS = Object.keys(en).filter((k) => k.startsWith(CHROME_PREFIX));

export function normalizeLanguage(value) {
  if (!value) return "en";
  const raw = String(value).trim().toLowerCase();
  if (CATALOG[raw]) return raw;
  for (const [code, meta] of Object.entries(LANGUAGES)) {
    if (meta.aliases.includes(raw)) return code;
    if (meta.native.toLowerCase() === raw) return code;
  }
  // "Spanish (Mexico)" / "pt-BR" style values
  const head = raw.split(/[\s(_-]/)[0];
  if (CATALOG[head]) return head;
  for (const [code, meta] of Object.entries(LANGUAGES)) {
    if (meta.aliases.includes(head)) return code;
  }
  return "en";
}

function ratio(code, keys) {
  const table = CATALOG[normalizeLanguage(code)];
  if (!table) return 0;
  const present = keys.filter((k) => typeof table[k] === "string" && table[k].length).length;
  return keys.length ? present / keys.length : 1;
}

/** Share of clinical copy available in this language. Drives interpreter offers. */
export function coverage(code) {
  return ratio(code, CLINICAL_KEYS);
}

/** Share of buttons and labels available. Cosmetic; never triggers an offer. */
export function chromeCoverage(code) {
  return ratio(code, CHROME_KEYS);
}

export function isFullyTranslated(code) {
  return coverage(code) >= FULL_COVERAGE_THRESHOLD;
}

export function direction(code) {
  return LANGUAGES[normalizeLanguage(code)]?.dir || "ltr";
}

export function languageLabel(code) {
  const c = normalizeLanguage(code);
  return LANGUAGES[c]?.label || "English";
}

export function nativeLabel(code) {
  const c = normalizeLanguage(code);
  return LANGUAGES[c]?.native || "English";
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}

/**
 * Look up `key` in `lang`, falling back to English for that single key.
 * Returns the key itself if it is unknown so missing copy is obvious in dev
 * rather than rendering as an empty element.
 */
export function t(lang, key, vars) {
  const code = normalizeLanguage(lang);
  const template = CATALOG[code]?.[key] ?? en[key];
  if (template == null) return key;
  return interpolate(template, vars);
}

/** True when this specific key had to fall back to English. */
export function isFallback(lang, key) {
  const code = normalizeLanguage(lang);
  if (code === "en") return false;
  return typeof CATALOG[code]?.[key] !== "string";
}

/** Bind a language once and reuse, so call sites stay readable. */
export function translator(lang) {
  const code = normalizeLanguage(lang);
  const fn = (key, vars) => t(code, key, vars);
  fn.lang = code;
  fn.dir = direction(code);
  fn.label = languageLabel(code);
  fn.native = nativeLabel(code);
  fn.full = isFullyTranslated(code);
  fn.coverage = coverage(code);
  return fn;
}

const SCRIPTS = [
  [/[\u4e00-\u9fff\u3400-\u4dbf]/, "zh"],
  [/[\u0600-\u06ff\u0750-\u077f]/, "ar"],
  [/[\u0400-\u04ff]/, "ru"],
];

/** Spelling only one language uses, worth more than a single shared word. */
const ORTHOGRAPHY = [
  [/[¿¡]|ñ/, "es", 2],
  [/[ãõ]|ç/, "pt", 2],
];

/**
 * Marker words per language. Compiled with `\p{L}` lookarounds rather than
 * `\b`, which is ASCII-only and silently fails on exactly the accented words
 * that carry the most signal ("caí", "não", "está", "mordió").
 */
const MARKER_WORDS = {
  ht: [
    "mwen", "pitit", "doktè", "kounye", "pa ka", "tanpri", "kreyòl", "èske",
    "fè mal", "doulè", "vant", "pwatrin", "mèsi", "jodi", "konbyen", "tonbe",
  ],
  pt: [
    "não", "você", "estou", "está", "muito", "obrigado", "obrigada", "filho", "filha",
    "perto", "sinto", "peito", "dói", "cabeça", "caí", "criança", "febre", "eu", "acho", "quebrei",
  ],
  es: [
    "estoy", "dolor", "duele", "cabeza", "mucho", "gracias", "hijo", "hija",
    "tengo", "pecho", "mareado", "mareada", "ayuda", "perro", "mordió", "mano",
    "desde", "muy", "puedo", "necesito", "callejero", "fiebre", "caí", "creo",
  ],
};

const MARKERS = Object.fromEntries(
  Object.entries(MARKER_WORDS).map(([code, words]) => [
    code,
    words.map((w) => new RegExp(`(?<!\\p{L})${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\p{L})`, "iu")),
  ])
);

/** Applied only when scores tie: most distinctive vocabulary first. */
const TIE_BREAK = ["ht", "pt", "es"];

/**
 * Best-effort language detection for free-text intake. Script evidence is
 * trusted outright; Latin-script guesses are scored across languages rather
 * than first-match, because "dor" alone cannot separate Portuguese from
 * Spanish but "dor" plus "cabeça" can. Anything without evidence stays English.
 *
 * Detection only chooses which copy to render — routing matches symptoms in
 * every language independently, so a miss here costs readability, not triage.
 */
export function detectLanguage(text = "") {
  const raw = String(text);
  if (!raw.trim()) return "en";
  for (const [pattern, code] of SCRIPTS) {
    if (pattern.test(raw)) return code;
  }

  const lower = raw.toLowerCase();
  const scores = new Map();
  const bump = (code, by) => scores.set(code, (scores.get(code) || 0) + by);

  for (const [pattern, code, weight] of ORTHOGRAPHY) {
    if (pattern.test(lower)) bump(code, weight);
  }
  for (const [code, patterns] of Object.entries(MARKERS)) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) bump(code, 1);
    }
  }
  if (!scores.size) return "en";

  return [...scores.entries()].sort(
    (a, b) => b[1] - a[1] || TIE_BREAK.indexOf(a[0]) - TIE_BREAK.indexOf(b[0])
  )[0][0];
}

export const SUPPORTED_LANGUAGES = Object.entries(LANGUAGES).map(([code, meta]) => ({
  code,
  ...meta,
  coverage: coverage(code),
  full: isFullyTranslated(code),
}));

function titleCase(value) {
  return String(value)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Keep the language a patient asked for separate from the one we can render.
 * A Vietnamese speaker normalizes to English for display, but forgetting that
 * they asked for Vietnamese is the whole failure mode: that is precisely when a
 * human interpreter matters most. `supported: false` means "render English and
 * offer a person", not "this patient speaks English".
 */
export function resolveLanguage(raw) {
  const requested = raw ? String(raw).trim() : "";
  const rendered = normalizeLanguage(requested);
  const supported = !requested || rendered !== "en" || /^(en|eng|english)$/i.test(requested);
  return {
    requested,
    rendered,
    supported,
    requestedLabel: supported ? languageLabel(rendered) : titleCase(requested),
    nativeLabel: nativeLabel(rendered),
    dir: direction(rendered),
    full: supported && isFullyTranslated(rendered),
    coverage: coverage(rendered),
  };
}
