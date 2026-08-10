/**
 * Draft translations for strings the church has added or rewritten.
 *
 *   ANTHROPIC_API_KEY=... node scripts/translate-new.mjs
 *   ANTHROPIC_API_KEY=... node scripts/translate-new.mjs --dry-run
 *
 * Reads the report scripts/check-build.py writes, asks a model for each
 * missing string, and writes the results into src/i18n/*.json. It does not
 * decide whether they ship — scripts/check-translations.mjs checks them and
 * the workflow decides.
 *
 * ── Why the whole page goes into the prompt ───────────────────────────────
 * The judgments that make these translations usable are page-level, not
 * string-level, and every one of them was made by reading the page:
 *
 *   * the whakataukī on /ministries/ stays in te reo while the English gloss
 *     beside it is translated — you cannot tell which is which from one string
 *   * a sermon series keeps its English name, because the label opens forty
 *     minutes of English
 *   * WordPress splits paragraphs across <span>s mid-clause, so a fragment
 *     only makes sense next to its neighbours
 *   * register: a church writing about faith, not product copy
 *
 * So each request carries the page's visible text, and the strings to
 * translate are pointed at inside it.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { askModel } from "../functions/api/_ask-core.mjs";
import { PROVIDERS, extractJson } from "../functions/api/_providers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODEL = process.env.TRANSLATE_MODEL || "claude-opus-5";

/**
 * Which endpoint drafts the translations. Anthropic by default; anything
 * OpenAI-compatible if TRANSLATE_BASE_URL is set. The override exists so this
 * can be exercised against a local model — and against a stub, which is how
 * the chain was tested without spending a token.
 */
function provider() {
  const baseUrl = process.env.TRANSLATE_BASE_URL;
  if (baseUrl) {
    return {
      call: PROVIDERS["openai-compatible"],
      creds: { baseUrl, apiKey: process.env.TRANSLATE_API_KEY || "not-needed",
               jsonSchema: process.env.TRANSLATE_JSON_SCHEMA === "1" },
      model: process.env.TRANSLATE_MODEL || "local",
    };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Set ANTHROPIC_API_KEY, or TRANSLATE_BASE_URL for another endpoint.");
  }
  return {
    call: PROVIDERS.anthropic,
    creds: { apiKey: process.env.ANTHROPIC_API_KEY },
    model: MODEL,
  };
}

const LANGUAGE = {
  "zh-Hans": "Simplified Chinese (简体中文)",
  ko: "Korean (한국어)",
};

const SYSTEM = `You translate pages of a church website — Northcote Baptist Church in Hillcrest, Auckland — for readers who speak the target language at home.

You are given the full visible text of one page, and a list of strings from that page that need translating. Return a translation for each.

WHAT TO LEAVE ALONE
- Te reo Māori. Words and whakataukī stay in te reo: tamariki, whānau, rangatahi, aroha, "He aha te mea nui o te ao". Where an English gloss sits beside the te reo, translate the gloss and leave the te reo. Te reo is an official language of Aotearoa and a taonga; it is not a source language to be converted.
- Names of English content. A sermon series titled "Haggai – A Time to Rebuild" opens an English playlist; translating the title tells the reader it is about rebuilding and then hands them forty minutes of English.
- Brand names, people's names, email addresses, URLs, phone numbers, street names.
- Scripture references (Matthew 18:5). Where a verse is quoted, use the standard wording of a real translation in the target language — 和合本 for Chinese, 개역개정 for Korean — not your own rendering of the English.

FRAGMENTS
WordPress splits paragraphs across several <span>s at arbitrary points, so some strings end mid-clause. When strings are consecutive fragments of one paragraph, put the whole translated paragraph in the FIRST fragment and return exactly "[merged]" for the rest. Do not try to translate each fragment separately — word order does not survive the English break points.

TONE
Write the way the church writes: warm, plain, unhurried. Not product copy, not a brochure. Match the register of the surrounding page. Short sentences.

ACCURACY
Say what the English says. Do not add encouragement it does not contain, do not soften a statement of belief, do not resolve an ambiguity the English leaves open. If a string is a heading, keep it short like a heading.`;

const SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string", description: "The English string, copied exactly." },
          translation: { type: "string", description: "The translation, or [merged]." },
          note: { type: "string", description: "Only if something needs flagging. Usually empty." },
        },
        required: ["source", "translation", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

/** Visible text of a built page, for context. */
async function pageText(url) {
  const file = join(ROOT, url.replace(/^\//, "") + "index.html");
  let html;
  try {
    html = await readFile(file, "utf8");
  } catch {
    return "";
  }
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

async function translatePage(lang, url, strings) {
  const context = await pageText(url);
  const user = `Page: ${url}

The page reads:

"""
${context}
"""

Translate these ${strings.length} string(s) into ${LANGUAGE[lang]}. They appear on that page, in this order:

${strings.map((s, i) => `${i + 1}. ${JSON.stringify(s)}`).join("\n")}

Copy each "source" back exactly as given.`;

  const { call, creds, model } = provider();
  const { text, refused } = await call(
    creds,
    { system: SYSTEM, user, schema: SCHEMA, model,
      effort: "medium", maxTokens: 16000 },
  );
  if (refused) throw new Error(`${url} (${lang}): the model declined`);

  const parsed = extractJson(text);
  if (!parsed?.translations) throw new Error(`${url} (${lang}): unparseable reply`);

  const out = {};
  for (const t of parsed.translations) {
    if (typeof t.source === "string" && typeof t.translation === "string") {
      out[t.source] = t.translation;
    }
  }
  // A string that came back under a slightly different key is a string that
  // will never match the page. Report it rather than writing it.
  const missing = strings.filter((s) => !(s in out));
  if (missing.length) {
    console.error(`  ${url} (${lang}): ${missing.length} string(s) came back with a `
      + `changed source and were dropped`);
    for (const s of missing.slice(0, 3)) console.error(`    ${s.slice(0, 70)}`);
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const report = JSON.parse(await readFile(join(ROOT, "translation-todo.json"), "utf8"));
  const langs = Object.keys(report);
  if (!langs.length) {
    console.log("nothing to translate");
    return;
  }

  for (const lang of langs) {
    const byPage = report[lang];
    const dictPath = join(ROOT, "src", "i18n", `${lang}.json`);
    const dict = JSON.parse(await readFile(dictPath, "utf8"));
    let added = 0;

    for (const [url, strings] of Object.entries(byPage)) {
      process.stdout.write(`${lang} ${url} — ${strings.length} string(s)… `);
      const result = await translatePage(lang, url, strings);
      for (const [source, translation] of Object.entries(result)) {
        dict[source] = translation;
        added++;
      }
      console.log(`${Object.keys(result).length} translated`);
    }

    if (dryRun) {
      console.log(`\n--dry-run: would add ${added} entries to ${lang}.json`);
    } else {
      await writeFile(dictPath, JSON.stringify(dict, null, 2) + "\n", "utf8");
      console.log(`${lang}.json: +${added} entries`);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
