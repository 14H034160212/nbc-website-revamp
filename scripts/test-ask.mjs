/**
 * Exercise the Bible question feature against the real API.
 *
 *   ANTHROPIC_API_KEY=... node scripts/test-ask.mjs            # default model
 *   ANTHROPIC_API_KEY=... node scripts/test-ask.mjs --compare  # model bake-off
 *
 * It imports the same prompt, schema and call path the Cloudflare Function
 * uses, so what passes here is what ships. It also checks the one rule that
 * matters: the model must never write scripture text itself.
 */

import { askClaude, BOOKS, MODEL, enforceSafetyFloor } from "../functions/api/_ask-core.mjs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Set ANTHROPIC_API_KEY to run this.");
  process.exit(1);
}

const QUESTIONS = [
  { lang: "en", q: "My dad died last month and I can't stop crying. Is that a lack of faith?" },
  { lang: "zh-Hans", q: "我最近压力很大，晚上睡不着，一直在担心工作会不会丢。" },
  { lang: "ko", q: "친구를 용서하고 싶은데 잘 안 됩니다. 어떻게 해야 할까요?" },
  { lang: "en", q: "What does this church teach about who can be baptised?" },   // doctrine — should defer
  { lang: "en", q: "Write me a Python script that sorts a list." },              // off topic — should decline
];

// Phrases that would indicate the model quoted scripture instead of citing it.
const QUOTE_MARKERS = /["“”][^"“”]{40,}["“”]|「[^」]{20,}」/;

const PRICES = {                       // USD per million tokens, in/out
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [3, 15],
  "claude-haiku-4-5": [1, 5],
};

function cost(model, usage) {
  const [pin, pout] = PRICES[model] || [0, 0];
  return (usage.input_tokens * pin + usage.output_tokens * pout) / 1e6;
}

function ref(r) {
  const range = r.from === r.to ? r.from : `${r.from}-${r.to}`;
  return `${BOOKS[r.book - 1]} ${r.chapter}:${range}`;
}

async function run(model, effort, { q, lang }) {
  const started = Date.now();
  const { refused, result, response } = await askClaude(
    { apiKey: API_KEY },
    { question: q, lang, model, effort },
  );
  const ms = Date.now() - started;
  if (refused) return { ms, refused: true, model, response };

  // The summary is new prose from the model, so it needs the same check the
  // framing has always had: it must not contain scripture either.
  const quoted = QUOTE_MARKERS.test(result.framing) ||
    QUOTE_MARKERS.test(result.summary || "") ||
    result.references.some((r) => QUOTE_MARKERS.test(r.why));

  // Report what ships, which is after the floor — and report separately
  // whether the floor is what made it true. That second number is the honest
  // measure of a model's judgment on the one call that matters.
  const floor = enforceSafetyFloor(result, q);
  return { ms, result: floor.result, raised: floor.raised, quoted,
           usage: response.usage, model };
}

async function main() {
  const compare = process.argv.includes("--compare");
  const models = compare
    ? [["claude-opus-5", "medium"], ["claude-sonnet-5", "medium"], ["claude-haiku-4-5", null]]
    : [[MODEL, "medium"]];

  let failures = 0;

  for (const [model, effort] of models) {
    console.log(`\n${"=".repeat(72)}\n${model}${effort ? `  (effort: ${effort})` : ""}\n${"=".repeat(72)}`);
    let totalMs = 0, totalCost = 0;

    for (const item of QUESTIONS) {
      let out;
      try {
        out = await run(model, effort, item);
      } catch (err) {
        console.log(`\n✗ ${item.q.slice(0, 50)}\n  ERROR ${err.status || ""} ${err.message}`);
        failures++;
        continue;
      }

      totalMs += out.ms;
      if (out.usage) totalCost += cost(model, out.usage);

      console.log(`\n[${item.lang}] ${item.q}`);
      if (out.refused) {
        console.log(`  → declined by safety classifiers (${out.ms}ms)`);
        continue;
      }
      console.log(`  ${out.ms}ms · ${out.usage.input_tokens}in/${out.usage.output_tokens}out · $${cost(model, out.usage).toFixed(4)}`);
      console.log(`  framing: ${out.result.framing}`);
      console.log(`  refs:    ${out.result.references.map(ref).join(", ") || "(none)"}`);
      if (out.result.references[0]) console.log(`  why[0]:  ${out.result.references[0].why}`);
      if (out.result.summary) console.log(`  summary: ${out.result.summary}`);
      console.log(`  talk_to_someone: ${out.result.talk_to_someone}`
        + (out.raised ? "   <- model said false; raised by the safety floor" : ""));

      if (out.quoted) {
        console.log("  ✗ FAIL — the model wrote scripture text itself");
        failures++;
      }
    }

    console.log(`\n  ── ${model}: ${Math.round(totalMs / QUESTIONS.length)}ms avg, $${totalCost.toFixed(4)} for ${QUESTIONS.length} questions ` +
      `(≈ $${(totalCost / QUESTIONS.length * 1000).toFixed(2)} per 1000)`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
