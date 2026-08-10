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
  // The widget offers 繁體中文, and a missing entry here does not fail loudly —
  // it falls through to English, so the page is Traditional Chinese and the
  // answer under it is English, with nothing to explain why.
  "zh-Hant": "Traditional Chinese (繁體中文)",
  ko: "Korean (한국어)",
  mi: "English",  // see the note in SYSTEM_PROMPT
};

export const SYSTEM_PROMPT = `You help visitors to Northcote Baptist Church — an intergenerational, multicultural church in Hillcrest, Auckland — find passages of scripture that speak to what they are going through.

Someone types a question or a situation in their own words. You return two things: a short framing, and a handful of Bible references.

WHAT YOU RETURN
- "framing": two or three sentences that acknowledge what they asked and say briefly why these particular passages speak to it. Warm and plain, not preachy. Do not quote or paraphrase scripture here — the passages themselves are shown underneath your framing, in full, from a real translation.
- "references": two to five passages, each as a book number (1-66), chapter, and verse range. Choose passages a thoughtful pastor would actually point to. Prefer a short, well-chosen range over a whole chapter.
- "summary": one or two sentences, shown after the reader has read the passages. This is a closing, not an explanation. Say what these passages have in common and what someone might do with them next — sit with one of them, pray one of them back, bring it to someone. Do NOT explain what a passage means, do not draw a doctrinal conclusion, and do not tell them what God is doing in their situation. If you cannot write one without explaining scripture, return an empty string.
- "talk_to_someone": true when the question involves grief, abuse, self-harm, addiction, family crisis, financial distress, or anything else where a person matters more than a passage. When true, the reply will also offer the church's contact details.

NEVER QUOTE SCRIPTURE
You must not write out any verse text, in any language, anywhere in your response — not in the framing, not in a "why", not in the summary, not as a preview, not in quotation marks. You are choosing references only. The actual words are fetched from a real Bible translation and displayed to the reader. Quoting from memory is how misquotations reach a church's website.

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
    summary: {
      type: "string",
      description:
        "One or two sentences in the requested language, shown under the passages. "
        + "A closing, not an explanation of what the passages mean. No scripture text. "
        + "Empty string if there is nothing to add.",
    },
    talk_to_someone: { type: "boolean" },
  },
  required: ["framing", "references", "summary", "talk_to_someone"],
  additionalProperties: false,
};

export function userPrompt(question, lang) {
  const language = LANGUAGES[lang] || LANGUAGES.en;
  return `Write the framing, every "why", and the summary in ${language}.

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
    summary: String(result.summary || "").slice(0, 500),
    talk_to_someone: Boolean(result.talk_to_someone),
  };
}

/**
 * Deterministic floor under `talk_to_someone`.
 *
 * That flag decides whether the reply carries the church office's phone number
 * and email. Until now it rested entirely on the model's judgment, and the
 * model bake-off showed exactly how that fails: Haiku 4.5 read "I am under a
 * lot of pressure, I cannot sleep, I keep worrying about losing my job" and set
 * it to false. Twice, in two languages.
 *
 * When that call is wrong, the cost is not a worse answer. It is a person who
 * needed a person and got five verses.
 *
 * So the patterns below force it TRUE, and can never force it false — the
 * model's own judgment is a union with this, never an override. It may notice
 * distress these words miss, which is the half it is good at; it may not talk
 * the site out of offering help. False positives here are nearly free: someone
 * who did not need the phone number sees a phone number.
 *
 * Deliberately blunt. This is a floor, not a classifier — matching too much is
 * the failure mode we want.
 */
export const SAFETY_PATTERNS = [
  // grief and death
  /\b(die[ds]?|died|death|passed away|funeral|grief|grieving|bereave|mourn|widow|miscarriage|stillborn|suicid)/i,
  /(去世|過世|过世|离世|離世|走了|死了|丧|喪|葬礼|葬禮|遗体|遺體|哀伤|哀傷|悲伤|悲傷|流产|流產)/,
  /(돌아가|사망|죽|장례|사별|유산|슬픔|애도)/,
  // self-harm and crisis
  /\b(self[- ]?harm|kill myself|end my life|hurt myself|hopeless|worthless|cannot go on|can't go on)/i,
  /(自杀|自殺|自残|自殘|活不下去|不想活|了结|了結|绝望|絕望|没有意义|沒有意義)/,
  /(자해|자살|살고 싶지|절망|희망이 없)/,
  // abuse, violence, family crisis
  /\b(abuse|abusive|violence|violent|assault|divorce|separat(ed|ing)|custody|restraining)/i,
  // Idiom matters more than vocabulary here. Nobody writes "domestic violence";
  // they write "he raised his hand to me". 我先生对我动手 slipped through the
  // first version of this list, which is why the test file keeps it.
  /(家暴|虐待|暴力|离婚|離婚|分居|抚养权|撫養權|骚扰|騷擾|动手|動手|打我|挨打|被打|欺负我|欺負我)/,
  /(학대|폭력|이혼|별거|양육권|때리|맞았|폭행)/,
  /\b(hits? me|beats? me|hurts? me|raised (his|her) hand)/i,
  // addiction
  /\b(addict|addiction|alcoholic|drinking problem|gambl|porn|relapse)/i,
  /(成瘾|成癮|酗酒|赌博|賭博|戒不掉|复吸|復吸|色情)/,
  /(중독|알코올|도박|끊지 못)/,
  // mental health and sleeplessness
  /\b(depress|anxiet|anxious|panic attack|cannot sleep|can't sleep|insomnia|breakdown|therapy|counsell?or)/i,
  /(抑郁|抑鬱|焦虑|焦慮|恐慌|睡不着|睡不著|失眠|崩溃|崩潰|心理|咨询|諮詢)/,
  /(우울|불안|공황|잠이 오지|잠을 못|불면|무너)/,
  // money and work loss
  /\b(lost my job|losing my job|redundan|unemploy|evict|homeless|debt|bankrupt|cannot afford|can't afford)/i,
  /(失业|失業|丢工作|丟工作|裁员|裁員|欠债|欠債|破产|破產|付不起|无家可归|無家可歸|房租)/,
  /(실직|해고|빚|파산|집세|노숙)/,
  // illness
  /\b(cancer|terminal|diagnos|hospital|chronic pain|dying)/i,
  /(癌|绝症|絕症|确诊|確診|住院|重病|临终|臨終)/,
  /(암 |암\b|시한부|진단|입원|중병)/,
];

/**
 * Returns the result with `talk_to_someone` raised if the question trips a
 * pattern. `matched` says whether the floor did the raising, so the caller can
 * log how often the model would have missed it.
 */
export function enforceSafetyFloor(result, question) {
  if (result.talk_to_someone) return { result, matched: false, raised: false };
  const q = String(question || "");
  const matched = SAFETY_PATTERNS.some((re) => re.test(q));
  if (!matched) return { result, matched: false, raised: false };
  return { result: { ...result, talk_to_someone: true }, matched: true, raised: true };
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
/**
 * One call to the Messages API, over plain fetch.
 *
 * WHY NOT THE OFFICIAL SDK
 * The SDK is the right default and works fine on Workers — but adding a
 * package.json to this repo turns the Cloudflare Pages project from "upload
 * this directory" into "build this project", and that build fails here (the
 * site is a mirrored WordPress tree, not an npm project). Three deploys
 * silently never shipped before that was caught. A dependency-free Function
 * keeps the project purely static, which is what actually deploys.
 *
 * The trade is small: one endpoint, one request shape, no streaming.
 */
export async function askClaude({ apiKey }, { question, lang, model = MODEL, effort = "medium" }) {
  const body = {
    model,
    // Adaptive thinking is on by default on Opus 5 and shares this budget with
    // the reply. The reply itself is small (a framing plus five short `why`
    // lines), so the headroom is almost entirely for thinking; 3000 was tight
    // enough that a question worth thinking about could truncate the JSON.
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt(question, lang) }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
  };

  // Haiku 4.5 rejects `effort`; every current Opus/Sonnet accepts it.
  if (!model.startsWith("claude-haiku")) {
    body.output_config.effort = effort;
  }

  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  // A safety decline is retried on another model server-side rather than
  // surfacing to the reader as a dead end. Opus-tier only.
  if (model === "claude-opus-5" || model === "claude-fable-5") {
    body.fallbacks = "default";
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`anthropic ${res.status}: ${detail.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const response = await res.json();

  if (response.stop_reason === "refusal") {
    return { refused: true, response };
  }

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return { refused: true, response };

  // Truncated output is not malformed JSON to be puzzled over — say what
  // happened, so the log names the cause instead of a SyntaxError at column N.
  if (response.stop_reason === "max_tokens") {
    const err = new Error(`response hit max_tokens (${body.max_tokens}); raise it`);
    err.status = "max_tokens";
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const err = new Error(`model returned unparseable JSON: ${text.slice(0, 200)}`);
    err.status = "bad_json";
    throw err;
  }

  return { result: validate(parsed), response };
}
