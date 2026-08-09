/**
 * The prompt, schema and guardrails for the Bible question feature.
 *
 * Kept separate from the request handler so `scripts/test-ask.mjs` can exercise
 * exactly what ships, against the real API, without a Cloudflare runtime.
 *
 * ── The one architectural rule ────────────────────────────────────────────
 * The model never supplies scripture text. It returns *references* — book,
 * chapter, verse range — and a short framing in the reader's language. The
 * browser then fetches the actual words from getBible, the same way the
 * curated topical finder does.
 *
 * Language models misquote and paraphrase scripture confidently. On a church's
 * own website that is the one failure mode worth engineering away, so the model
 * is given the job it is good at (understanding what someone is asking, and
 * knowing which passages speak to it) and kept away from the job it is bad at
 * (reproducing a text exactly).
 */

export const MODEL = "claude-opus-5";

/** Book names, 1-indexed by book number, for the model to choose from. */
export const BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges",
  "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles",
  "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
  "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
  "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
  "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus",
  "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John",
  "3 John", "Jude", "Revelation",
];

/** Chapter count per book, so a reference can be range-checked server-side. */
export const CHAPTERS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150,
  31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16,
  24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1,
  1, 22,
];

export const LANGUAGES = {
  en: "English",
  "zh-Hans": "Simplified Chinese (简体中文)",
  ko: "Korean (한국어)",
  mi: "English",  // see the note in SYSTEM_PROMPT
};

export const SYSTEM_PROMPT = `You help visitors to Northcote Baptist Church — an intergenerational, multicultural church in Hillcrest, Auckland — find passages of scripture that speak to what they are going through.

Someone types a question or a situation in their own words. You return two things: a short framing, and a handful of Bible references.

WHAT YOU RETURN
- "framing": two or three sentences that acknowledge what they asked and say briefly why these particular passages speak to it. Warm and plain, not preachy. Do not quote or paraphrase scripture here — the passages themselves are shown underneath your framing, in full, from a real translation.
- "references": two to five passages, each as a book number (1-66), chapter, and verse range. Choose passages a thoughtful pastor would actually point to. Prefer a short, well-chosen range over a whole chapter.
- "talk_to_someone": true when the question involves grief, abuse, self-harm, addiction, family crisis, financial distress, or anything else where a person matters more than a passage. When true, the reply will also offer the church's contact details.

NEVER QUOTE SCRIPTURE
You must not write out any verse text, in any language, anywhere in your response — not in the framing, not as a preview, not in quotation marks. You are choosing references only. The actual words are fetched from a real Bible translation and displayed to the reader. Quoting from memory is how misquotations reach a church's website.

STAY IN YOUR LANE
- You are not the church's voice on doctrine. If someone asks what this church teaches about baptism, membership, women in leadership, sexuality, or any other question of position, do not answer it. Set talk_to_someone to true and say in the framing that this is a conversation to have with someone here, then offer passages that are genuinely relevant background rather than a verdict.
- You are not a counsellor, a doctor, or a lawyer. Point to scripture and to people.
- If the question is not about faith, life, or scripture at all — a coding question, homework, a request to write something — say so plainly in the framing, set talk_to_someone to false, and return an empty references list.
- Never claim to know what will happen, what God has decided about a particular person, or that a particular outcome is guaranteed.

TONE
Write to one person, not a congregation. Short sentences. No exclamation marks. Do not open with "Great question" or similar. Do not use the person's situation as a lead-in to a sermon.`;

export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    framing: {
      type: "string",
      description:
        "Two or three sentences in the requested language. No scripture text.",
    },
    references: {
      type: "array",
      description: "Two to five passages, or empty if the question is off-topic.",
      items: {
        type: "object",
        properties: {
          book: { type: "integer", description: "Book number, 1 (Genesis) to 66 (Revelation)." },
          chapter: { type: "integer" },
          from: { type: "integer", description: "First verse." },
          to: { type: "integer", description: "Last verse; equal to `from` for a single verse." },
          why: {
            type: "string",
            description:
              "One short clause in the requested language on why this passage. No scripture text.",
          },
        },
        required: ["book", "chapter", "from", "to", "why"],
        additionalProperties: false,
      },
    },
    talk_to_someone: { type: "boolean" },
  },
  required: ["framing", "references", "talk_to_someone"],
  additionalProperties: false,
};

export function userPrompt(question, lang) {
  const language = LANGUAGES[lang] || LANGUAGES.en;
  return `Write the framing and every "why" in ${language}.

The person asked:

${question}`;
}

/**
 * Reject anything the model got wrong before it reaches the reader.
 *
 * A structured-output schema guarantees the *shape*, not that Revelation has a
 * chapter 40. Everything here is a range check the browser would otherwise turn
 * into a failed fetch and an empty card.
 */
export function validate(result) {
  const refs = [];
  for (const r of result.references || []) {
    if (!Number.isInteger(r.book) || r.book < 1 || r.book > 66) continue;
    const maxChapter = CHAPTERS[r.book - 1];
    if (!Number.isInteger(r.chapter) || r.chapter < 1 || r.chapter > maxChapter) continue;
    const from = Math.max(1, r.from || 1);
    const to = Math.max(from, r.to || from);
    if (to - from > 30) continue;  // a whole-chapter dump is not an answer
    refs.push({ book: r.book, chapter: r.chapter, from, to, why: String(r.why || "").slice(0, 300) });
  }
  return {
    framing: String(result.framing || "").slice(0, 1200),
    references: refs.slice(0, 5),
    talk_to_someone: Boolean(result.talk_to_someone),
  };
}

/** Guard rails on the incoming question, before any token is spent. */
export function checkQuestion(question) {
  if (typeof question !== "string") return "Please type a question.";
  const q = question.trim();
  if (q.length < 4) return "Please type a little more so we can help.";
  if (q.length > 600) return "Please shorten the question to under 600 characters.";
  return null;
}

/**
 * One call to Claude. Shared by the Cloudflare Function and the local test so
 * the thing under test is the thing that ships.
 *
 * `effort` is the main quality/latency/cost dial. This is a short, well-scoped
 * task — understand a question, pick passages, write three sentences — so it
 * does not need a deep reasoning budget. "medium" is the shipped default;
 * "low" is worth measuring if latency matters more than nuance.
 */
export async function askClaude(client, { question, lang, model = MODEL, effort = "medium" }) {
  const params = {
    model,
    max_tokens: 3000,          // thinking shares max_tokens with the reply on
                               // current models — leave room for both
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt(question, lang) }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
  };

  // Haiku 4.5 rejects `effort`; every current Opus/Sonnet accepts it.
  if (!model.startsWith("claude-haiku")) {
    params.output_config.effort = effort;
  }

  // A safety decline is retried on another model server-side rather than
  // surfacing to the reader as a dead end. Opus-tier only.
  if (model === "claude-opus-5" || model === "claude-fable-5") {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }

  const response = params.betas
    ? await client.beta.messages.create(params)
    : await client.messages.create(params);

  if (response.stop_reason === "refusal") {
    return { refused: true, response };
  }

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return { refused: true, response };

  return { result: validate(JSON.parse(text)), response };
}
