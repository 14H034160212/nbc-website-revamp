/**
 * Check drafted translations before anything ships.
 *
 *   node scripts/check-translations.mjs                 # check everything
 *   node scripts/check-translations.mjs --only NEW.json # only these keys
 *
 * ── What this can and cannot do ───────────────────────────────────────────
 * It catches mechanical failures. It cannot tell you whether the register is
 * right for a church, whether a doctrinal nuance survived, or whether a
 * sentence reads naturally to someone who grew up speaking the language. No
 * automated check can, and pretending otherwise is how unreviewed text ends up
 * on a church's website.
 *
 * What it does catch is the class of error that actually happens. Both of these
 * are real, from the hand-written batches in this repo:
 *
 *   zh-Hans  "更多的connection其实发生在平日"     an English word left in
 *   ko       "NBC 안전보건 양식 (Google форм)"    Russian, from nowhere
 *
 * Neither changes the meaning enough to notice while skimming; both are
 * obvious to a script. That is the division of labour: the script reads every
 * string looking for the mistakes a reader would skim past, and a person reads
 * the ones where being wrong would matter.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const SCRIPTS = {
  "zh-Hans": {
    name: "Chinese",
    must: /[一-鿿]/,                        // some Han
    mustNot: [
      [/[가-힯]/, "Korean (Hangul)"],
      [/[Ѐ-ӿ]/, "Cyrillic"],
      [/[぀-ヿ]/, "Japanese kana"],
    ],
  },
  ko: {
    name: "Korean",
    must: /[가-힯]/,                        // some Hangul
    mustNot: [
      [/[Ѐ-ӿ]/, "Cyrillic"],
      [/[぀-ヿ]/, "Japanese kana"],
    ],
  },
};

// Present in the English, so present in the translation. A translation that
// drops an email address has dropped the only actionable thing in the sentence.
const MUST_SURVIVE = [
  { name: "email", re: /[\w.+-]+@[\w-]+\.[\w.]+/g },
  { name: "URL", re: /https?:\/\/[^\s"'<>)]+|www\.[\w.-]+/g },
  { name: "phone", re: /\(0\d\)\s?\d{3}\s?\d{4}|\+64\s?\d[\d\s]{7,}/g },
];

// English words that name something the reader will physically look at, and so
// are more useful left in English. The Reference field in a New Zealand banking
// app is labelled "Reference"; translating it sends someone hunting for a field
// that does not exist. Same principle as leaving a sermon series its English
// name — the label and the thing it points at should agree.
const LABELS_IN_ENGLISH = new Set(["reference", "particulars", "code"]);

// Te reo and brand names stay themselves, in every language.
const KEEP_AS_IS = [
  "tamariki", "whānau", "rangatahi", "aroha", "Aroha nui", "taonga",
  "Instagram", "Facebook", "YouTube", "Twitter", "Zoom",
  "Sunday@10", "NBC", "CAP",
];

// Length ratios, derived from the 329 zh / 326 ko strings already in the
// dictionary rather than guessed. Two things that measurement showed:
//
//   * Below 60 characters the ratio carries no information at all — the range
//     is 0.11 to 2.00. "Throughout the Year" is correctly 全年, eleven percent
//     of the English. Checking short strings only produces false alarms.
//   * Above 60 characters it is tight and useful: zh never went below 0.19,
//     ko never below 0.30, so a floor under each catches real truncation.
const RATIO_MIN_LENGTH = 60;
const RATIO = {
  "zh-Hans": { min: 0.15, max: 1.2 },   // observed 0.19 – 0.78
  ko:        { min: 0.22, max: 1.8 },   // observed 0.30 – 1.27
};

// The settled terminology, loaded from the same file the translator is given.
// One file, so the instruction and the check cannot drift apart — a glossary
// the translator is told about but not held to is a suggestion, and a glossary
// enforced without being stated is a trap.
let GLOSSARY = { enforced: {}, guidance: {} };

const problems = [];
const notes = [];

// Words allowed inside a name without breaking it: "More than Music",
// "Christians Against Poverty", "Kingdom of God".
const CONNECTORS = new Set(["of", "the", "than", "and", "a", "for", "on", "in",
                            "to", "at", "with", "de"]);

/**
 * Proper names and titles in the English, longest first.
 *
 * A run of words where the first is capitalised and the rest are either
 * capitalised or connectors. "Bring a friend" does not qualify — "friend" is
 * neither — which is what keeps the leftover check honest about sentences that
 * merely start with a capital.
 */
function properNames(source) {
  const words = stripAddresses(source).split(/\s+/);
  const names = new Set();
  for (let i = 0; i < words.length; i++) {
    const first = words[i].replace(/^[^A-Za-z]+|[^A-Za-z0-9@]+$/g, "");
    if (!/^[A-Z]/.test(first)) continue;
    let run = [first];
    names.add(first);
    for (let j = i + 1; j < Math.min(i + 4, words.length); j++) {
      const w = words[j].replace(/^[^A-Za-z]+|[^A-Za-z0-9@]+$/g, "");
      if (!w) break;
      if (/^[A-Z]/.test(w) || CONNECTORS.has(w.toLowerCase())) {
        run.push(w);
        if (/^[A-Z]/.test(w)) names.add(run.join(" "));
      } else break;
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

/** Emails and URLs, out of the way. They contain words that look like content. */
function stripAddresses(s) {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, " ")
    .replace(/https?:\/\/[^\s"'<>)]+|www\.[\w.-]+/g, " ");
}

function checkOne(lang, source, value) {
  const where = `[${lang}] ${source.slice(0, 60)}${source.length > 60 ? "…" : ""}`;
  const spec = SCRIPTS[lang];

  if (value === "[merged]" || value === "") return;      // deliberate, see load_dictionary

  if (!value.trim()) {
    problems.push(`${where}\n    empty translation`);
    return;
  }

  // 1. Identical to the English — but only a problem if there was English
  //    prose to translate. Names, emails and URLs are supposed to come back
  //    unchanged: "Marcus Collings" and "www.nbcp.org.nz" are not untranslated,
  //    they are correct. The signal for prose is a lowercase word, once
  //    addresses are taken out of the picture.
  if (value.trim() === source.trim()) {
    if (/(?:^|\s)[a-z]{3,}(?:\s|$|[.,;:!?])/.test(stripAddresses(source))) {
      problems.push(`${where}\n    identical to the English — not translated`);
    }
    return;
  }

  // 2. Wrong script present.
  for (const [re, what] of spec.mustNot) {
    if (re.test(value)) {
      problems.push(`${where}\n    contains ${what}: ${value.slice(0, 60)}`);
    }
  }

  // 3. Right script absent. Skip strings with no letters to translate
  //    (numbers, addresses) — they legitimately come back unchanged.
  const hasWords = /[A-Za-z]{3}/.test(source);
  if (hasWords && !spec.must.test(value)) {
    problems.push(`${where}\n    no ${spec.name} characters at all: ${value.slice(0, 60)}`);
  }

  // 4. Anything actionable in the English survived.
  for (const { name, re } of MUST_SURVIVE) {
    for (const found of source.match(re) || []) {
      if (!value.includes(found)) {
        problems.push(`${where}\n    the ${name} "${found}" is missing from the translation`);
      }
    }
  }

  // 5. Words that stay themselves.
  //
  //    This was a note until a real run shipped 유튜브 for YouTube. It is
  //    mechanically checkable and objectively inconsistent — the button on the
  //    page says YouTube, and the rest of the dictionary keeps it — so it is a
  //    failure now. That routes the batch to a pull request rather than
  //    discarding it, which is the right amount of ceremony: a person decides
  //    whether 유튜브 is fine, and nobody has to notice it first.
  //
  //    Addresses come out first: "NBC" matches
  //    inside nbc.org.nz, so an email in both source and translation was being
  //    reported as a dropped word. The comparison is case-insensitive for the
  //    same reason — nbc.org.nz is not a missing NBC.
  const bare = stripAddresses(source);
  const bareValue = stripAddresses(value).toLowerCase();
  for (const word of KEEP_AS_IS) {
    const inSource = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (inSource.test(bare) && !bareValue.includes(word.toLowerCase())) {
      problems.push(`${where}\n    "${word}" is in the English but not the `
        + `translation — it should stay as it is\n    ${value.slice(0, 80)}`);
    }
  }

  // 7. English prose left inside the translation.
  //
  //    This is the check the file header cites as motivation and the one I
  //    first forgot to write: the stub that returned
  //    "第四学期以 10 月 18 日的 games night 开场。Bring a friend——免费。"
  //    passed every other check, because it does contain Han characters.
  //
  //    Plenty of English is supposed to survive — names, brands, Kids Rock,
  //    RISE, getBible, Sunday@10 — so the test is not "any Latin letters". It
  //    is: does a word appear here that the English used as an ordinary
  //    lowercase word? Proper nouns are capitalised in the source and pass;
  //    "games" and "friend" are not.
  //    Names first. "Kids Rock" and "More than Music" are programme names that
  //    survive into the translation, and both contain a word the source also
  //    uses in lowercase prose — "kids", "than". Take the names out before
  //    scanning, or the check flags the very English it is supposed to allow.
  let residue = stripAddresses(value);
  for (const name of properNames(source)) residue = residue.split(name).join(" ");

  const lowercaseInSource = new Set(
    (stripAddresses(source).match(/\b[a-z]{4,}\b/g) || []));
  const leftovers = new Set();
  for (const word of residue.match(/[A-Za-z]{4,}/g) || []) {
    if (lowercaseInSource.has(word.toLowerCase())
        && !LABELS_IN_ENGLISH.has(word.toLowerCase())
        && !KEEP_AS_IS.some((k) => k.toLowerCase() === word.toLowerCase())) {
      leftovers.add(word);
    }
  }
  if (leftovers.size) {
    problems.push(`${where}\n    English left in the translation: `
      + `${[...leftovers].slice(0, 6).join(", ")}\n    ${value.slice(0, 80)}`);
  }

  // 8. Settled terminology.
  //
  //    The model rendered "separation of church and state" as 政教分离 one week
  //    and 教会与国家分立 the next. Both are correct; only one is the term this
  //    site uses. A statement of faith should not reword itself because a
  //    workflow ran again.
  //
  //    Only the enforced tier is checked. The guidance tier is deliberately not
  //    — "discipleship journey" is 门徒之路, not 门徒训练, and pinning that one
  //    made the check wrong about a translation of mine that was right.
  for (const [term, want] of Object.entries(GLOSSARY.enforced)) {
    // Plurals, because \bsermon\b does not match "Sermons" — the page title is
    // plural and 证道 sailed straight through the first version of this check.
    // Irregular plurals (ministry/ministries) need their own glossary entry;
    // this handles the regular ones rather than pretending to handle all.
    const inSource = new RegExp(
      `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?\\b`, "i");
    if (inSource.test(source) && !value.includes(want[lang])) {
      problems.push(`${where}\n    "${term}" should be ${want[lang]} on this site`
        + `\n    ${value.slice(0, 80)}`);
    }
  }

  // 6. Length sanity, on prose only.
  if (source.length >= RATIO_MIN_LENGTH) {
    const band = RATIO[lang];
    const ratio = value.length / source.length;
    if (ratio < band.min) {
      problems.push(`${where}\n    translation is ${Math.round(ratio * 100)}% the length `
        + `of the English — content is missing`);
    } else if (ratio > band.max) {
      problems.push(`${where}\n    translation is ${Math.round(ratio * 100)}% the length `
        + `of the English — something has been added`);
    }
  }
}

async function main() {
  GLOSSARY = JSON.parse(
    await readFile(join(ROOT, "src", "i18n", "glossary.json"), "utf8"));

  const onlyArg = process.argv.indexOf("--only");
  let only = null;
  if (onlyArg > -1) {
    only = JSON.parse(await readFile(process.argv[onlyArg + 1], "utf8"));
  }

  let checked = 0;
  for (const lang of Object.keys(SCRIPTS)) {
    const dict = JSON.parse(
      await readFile(join(ROOT, "src", "i18n", `${lang}.json`), "utf8"));
    const keys = only
      ? [...new Set(Object.values(only[lang] || {}).flat())]
      : Object.keys(dict).filter((k) => !k.startsWith("_"));

    for (const key of keys) {
      if (!(key in dict)) {
        problems.push(`[${lang}] ${key.slice(0, 60)}\n    no translation was produced`);
        continue;
      }
      checkOne(lang, key, dict[key]);
      checked++;
    }
  }

  console.log(`checked ${checked} translation(s)`);
  for (const n of notes) console.log(`NOTE  ${n}`);
  for (const p of problems) console.log(`FAIL  ${p}`);

  if (problems.length) {
    console.log(`\n${problems.length} problem(s) — these need a person`);
    process.exit(1);
  }
  console.log(notes.length ? `\n${notes.length} note(s), nothing blocking` : "\nall clear");
}

main().catch((e) => { console.error(e); process.exit(1); });
