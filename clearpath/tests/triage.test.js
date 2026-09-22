import assert from "node:assert/strict";
import test from "node:test";
import { keywordRoute } from "../src/lib/journey.js";
import { coverage, detectLanguage, isFullyTranslated, resolveLanguage } from "../src/lib/i18n/index.js";

/**
 * The deterministic router is the only triage path when the model is disabled,
 * so the same complaint must reach the same department in every language we
 * claim to support. Each row is one patient's own words.
 */
const ROUTING = [
  // Cardiac red flags
  ["en", "I have crushing chest pain", "emergency", "high"],
  ["es", "me duele mucho el pecho desde esta mañana", "emergency", "high"],
  ["pt", "estou com dor no peito desde cedo", "emergency", "high"],
  ["ht", "pwatrin mwen ap fè mal depi maten", "emergency", "high"],
  ["zh", "我从今天早上开始胸口痛", "emergency", "high"],
  ["ar", "أعاني من ألم في الصدر منذ الصباح", "emergency", "high"],
  ["ru", "у меня болит грудь с утра", "emergency", "high"],

  // Respiratory red flags
  ["en", "I cannot breathe properly", "emergency", "high"],
  ["es", "no puedo respirar bien", "emergency", "high"],
  ["ru", "мне трудно дышать", "emergency", "high"],
  ["zh", "我呼吸困难", "emergency", "high"],

  // A red flag in a child is an emergency first, paediatric second
  ["en", "my child has a seizure", "pediatric", "high"],
  ["es", "mi hijo tiene convulsiones", "pediatric", "high"],
  ["ht", "pitit mwen gen kriz", "pediatric", "high"],
  ["es", "mi hija tiene fiebre alta", "pediatric", "high"],

  // Specialty routing
  ["es", "un perro callejero me mordió la mano", "rabies", "medium"],
  ["ru", "меня укусила бродячая собака", "rabies", "medium"],
  ["zh", "我很抑郁", "winchester", "medium"],
  ["pt", "eu caí e acho que quebrei o pulso", "ypb", "medium"],
  ["es", "me duele el estómago desde ayer", "dana", "low"],
  ["ht", "vant mwen ap fè mal", "dana", "low"],
];

/**
 * Over-triage is its own harm: it floods Emergency and buries the patients who
 * genuinely need it. These are the phrases most likely to trip a naive matcher.
 */
const MUST_NOT_ESCALATE = [
  ["I have an appointment in the Winchester Building", "triage", "low"],
  ["I am going to the chest clinic in Fitkin", "fitkin", "low"],
  ["I need a mammogram", "north", "low"],
  ["where is the cafeteria", "atrium", "low"],
  ["I have an MRI referral", "clinicbldg", "low"],
];

test("routes the same complaint identically in every supported language", () => {
  for (const [lang, situation, department, urgency] of ROUTING) {
    const got = keywordRoute(situation);
    assert.equal(got.department, department, `[${lang}] "${situation}" -> ${got.department}`);
    assert.equal(got.urgency, urgency, `[${lang}] "${situation}" -> ${got.urgency}`);
  }
});

test("does not over-triage building names or routine referrals", () => {
  for (const [situation, department, urgency] of MUST_NOT_ESCALATE) {
    const got = keywordRoute(situation);
    assert.equal(got.department, department, `"${situation}" -> ${got.department}`);
    assert.equal(got.urgency, urgency, `"${situation}" -> ${got.urgency}`);
  }
});

test("detects language from free text, staying English when ambiguous", () => {
  const cases = [
    ["me duele mucho el pecho", "es"],
    ["mwen gen doulè nan vant mwen", "ht"],
    ["我的胸口很痛", "zh"],
    ["болит голова", "ru"],
    ["أعاني من ألم في صدري", "ar"],
    ["estou com muita dor de cabeça", "pt"],
    ["my chest hurts", "en"],
    ["", "en"],
    // Spanish and Portuguese share "dor"/"caí"; the distinguishing words decide.
    ["un perro callejero me mordió la mano", "es"],
    ["eu caí e acho que quebrei o pulso", "pt"],
    ["minha filha está com febre alta", "pt"],
    ["mi hija tiene fiebre alta", "es"],
    ["pwatrin mwen ap fè mal depi maten", "ht"],
  ];
  for (const [text, expected] of cases) {
    assert.equal(detectLanguage(text), expected, `"${text}"`);
  }
});

test("every supported language fully covers the clinical copy", () => {
  for (const code of ["en", "es", "zh", "pt", "ht", "ar", "ru"]) {
    assert.equal(coverage(code), 1, `${code} clinical coverage`);
    assert.ok(isFullyTranslated(code), `${code} should be fully translated`);
  }
});

test("remembers an unsupported language instead of silently calling it English", () => {
  const vietnamese = resolveLanguage("Vietnamese");
  assert.equal(vietnamese.rendered, "en", "renders English because we have no catalog");
  assert.equal(vietnamese.supported, false, "but must not claim the patient speaks English");
  assert.equal(vietnamese.requestedLabel, "Vietnamese", "so staff and the banner can name it");

  const spanish = resolveLanguage("Spanish");
  assert.equal(spanish.rendered, "es");
  assert.equal(spanish.supported, true);

  const plainEnglish = resolveLanguage("English");
  assert.equal(plainEnglish.supported, true, "English itself is supported, not a fallback");
});

test("Arabic renders right to left", () => {
  assert.equal(resolveLanguage("ar").dir, "rtl");
  assert.equal(resolveLanguage("es").dir, "ltr");
});
