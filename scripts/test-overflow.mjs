/**
 * The overflow path, offline. No API key, no tokens, no network.
 *
 *   node scripts/test-overflow.mjs
 *
 * What it pins down: when the day's cap is reached, or the provider is
 * overloaded, a reader gets an answer from the smaller model instead of "a lot
 * of people are asking right now" — and the paid model is genuinely not called.
 * Also that the per-IP limit does NOT degrade, because that one is abuse
 * protection rather than budget: someone asking eleven times in an hour should
 * wait, not be handed a cheaper model.
 *
 * functions/api/ask.js is a .js file with ESM syntax, which Node will not load
 * as a module without a package.json — and this repo deliberately has none, so
 * that Cloudflare Pages keeps treating it as a static upload rather than a
 * build. Copying it to a .mjs in the temp directory, with its one relative
 * import made absolute, is the cheapest way to test the real file rather than a
 * transcription of it.
 */
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const fnPath = join(here, "..", "functions", "api", "ask.js");
const corePath = join(here, "..", "functions", "api", "_ask-core.mjs");

const src = (await readFile(fnPath, "utf8"))
  .replace('"./_ask-core.mjs"', JSON.stringify(pathToFileURL(corePath).href));
const dir = await mkdtemp(join(tmpdir(), "nbc-ask-"));
const copy = join(dir, "ask.mjs");
await writeFile(copy, src);
const { onRequestPost, onRequestGet } = await import(pathToFileURL(copy).href);

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? (pass++, console.log("  ok   " + n))
                                 : (fail++, console.log("  FAIL " + n + "  " + d)); };

const payload = (over = {}) => JSON.stringify({
  framing: "f", summary: "s", talk_to_someone: false,
  references: [{ book: 19, chapter: 23, from: 1, to: 4, why: "w" }], ...over,
});

let anthropicCalls = 0, aiCalls = 0, anthropicStatus = 200;
globalThis.fetch = async () => {
  anthropicCalls++;
  if (anthropicStatus !== 200) {
    return { ok: false, status: anthropicStatus, text: async () => "overloaded" };
  }
  return { ok: true, json: async () => ({
    stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: "text", text: payload({ framing: "from-anthropic" }) }],
  }) };
};

// Deliberately wrapped in a fence and prose, the way a host that does not
// enforce a schema replies. extractJson() has to cope.
const AI = { run: async () => { aiCalls++;
  return { response: "Here you go:\n```json\n" + payload({ framing: "from-workers-ai" }) + "\n```" }; } };

const kvDayFull = { get: async (k) => (k.startsWith("all:") ? "9999" : "0"), put: async () => {} };
const kvIpFull  = { get: async (k) => (k.startsWith("ip:") ? "9999" : "0"), put: async () => {} };
const kvOk      = { get: async () => "0", put: async () => {} };

const req = () => new Request("https://x.pages.dev/api/ask", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ question: "我想开始读圣经，从哪里开始", lang: "zh-Hans" }),
});
const body = async (env) => (await onRequestPost({ request: req(), env })).json();
const FB = { AI, ASK_FALLBACK_MODEL: "@cf/test/model" };

console.log("no overflow configured — the cap still refuses");
let r = await onRequestPost({ request: req(), env: { ANTHROPIC_API_KEY: "k", ASK_RATELIMIT: kvDayFull } });
ok("429 rate_limited_day", r.status === 429 && (await r.json()).error === "rate_limited_day");

console.log("\noverflow configured — the cap degrades instead");
anthropicCalls = aiCalls = 0;
let b = await body({ ANTHROPIC_API_KEY: "k", ASK_RATELIMIT: kvDayFull, ...FB });
ok("answered by the overflow model", b.framing === "from-workers-ai", JSON.stringify(b).slice(0, 90));
ok("the paid model was not called", anthropicCalls === 0 && aiCalls === 1,
   `anthropic=${anthropicCalls} ai=${aiCalls}`);

console.log("\nunder the cap — still the paid model");
anthropicCalls = aiCalls = 0;
b = await body({ ANTHROPIC_API_KEY: "k", ASK_RATELIMIT: kvOk, ...FB });
ok("answered by anthropic", b.framing === "from-anthropic" && anthropicCalls === 1 && aiCalls === 0);

console.log("\nprovider overloaded (529) — retried on the overflow model");
anthropicCalls = aiCalls = 0; anthropicStatus = 529;
b = await body({ ANTHROPIC_API_KEY: "k", ASK_RATELIMIT: kvOk, ...FB });
ok("degraded after 529", b.framing === "from-workers-ai" && aiCalls === 1, JSON.stringify(b).slice(0, 90));
anthropicStatus = 200;

console.log("\nWorkers AI alone, no Anthropic key");
anthropicCalls = aiCalls = 0;
let g = await onRequestGet({ env: FB });
ok("GET reports enabled", (await g.json()).enabled === true);
b = await body({ ...FB, ASK_RATELIMIT: kvOk });
ok("POST served by workers-ai", b.framing === "from-workers-ai" && anthropicCalls === 0);

console.log("\nneither configured — the feature stays off");
g = await onRequestGet({ env: {} });
ok("GET enabled=false", (await g.json()).enabled === false);
r = await onRequestPost({ request: req(), env: {} });
ok("POST 503 not_configured", r.status === 503);

console.log("\nper-IP limit does not degrade — it is abuse protection, not budget");
r = await onRequestPost({ request: req(), env: { ANTHROPIC_API_KEY: "k", ASK_RATELIMIT: kvIpFull, ...FB } });
ok("still 429 rate_limited_ip", r.status === 429 && (await r.json()).error === "rate_limited_ip");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
