/**
 * Local stand-in for Cloudflare Pages: serves the built site and implements
 * /api/ask with the same core module the real Function uses.
 *
 *   ANTHROPIC_API_KEY=... node scripts/dev-server.mjs
 *   → http://localhost:8788/ask/
 *
 * This exists so the question box can be exercised in a browser without a
 * Cloudflare deploy. It is not the production path — functions/api/ask.js is.
 *
 * ── Trying an open model ──────────────────────────────────────────────────
 * Point it at anything that speaks the OpenAI chat API — Ollama, vLLM, an
 * inference host. Reading a bake-off table tells you which model scored what;
 * clicking through the real page tells you whether you would put it in front
 * of someone who has just lost their father.
 *
 *   ASK_PROVIDER=openai-compatible \
 *   ASK_BASE_URL=http://localhost:11434/v1 \
 *   ASK_MODEL=qwen3:30b \
 *   node scripts/dev-server.mjs
 *
 * ── Trying the overflow path ──────────────────────────────────────────────
 * The real degradation is a Workers AI binding, which does not exist off
 * Cloudflare. But the *decision* is ours, so it can be rehearsed here: give a
 * second model the ASK_FALLBACK_ prefix and a low ASK_DAILY_CAP, and the
 * counter will hand over mid-session exactly the way the deployed one does.
 *
 *   ANTHROPIC_API_KEY=... ASK_DAILY_CAP=3 \
 *   ASK_FALLBACK_PROVIDER=openai-compatible \
 *   ASK_FALLBACK_BASE_URL=http://localhost:11434/v1 \
 *   ASK_FALLBACK_MODEL=qwen3:30b \
 *   node scripts/dev-server.mjs
 *
 * Ask four questions and watch the fourth answer come from the small model.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { askModel, checkQuestion, enforceSafetyFloor, LANGUAGES, MODEL }
  from "../functions/api/_ask-core.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 8788);

/**
 * Build a model from environment variables under a prefix, so the primary and
 * the overflow are configured the same way. Returns null when the prefix has
 * nothing usable, which is how "no fallback configured" is expressed.
 */
function modelFromEnv(prefix = "ASK_") {
  const e = (k) => process.env[prefix + k];
  const provider = e("PROVIDER") || (prefix === "ASK_" ? "anthropic" : null);
  if (!provider) return null;

  if (provider === "anthropic") {
    const apiKey = e("API_KEY") || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return { label: e("MODEL") || MODEL, model: e("MODEL") || MODEL,
             creds: { provider: "anthropic", apiKey } };
  }
  if (provider === "openai-compatible") {
    const baseUrl = e("BASE_URL");
    const model = e("MODEL");
    if (!baseUrl || !model) return null;
    return { label: `${model} @ ${baseUrl}`, model,
             creds: { provider: "openai-compatible", baseUrl,
                      apiKey: e("API_KEY") || "not-needed",
                      // Most local servers accept the request and ignore the
                      // schema; a few reject it outright. Off by default here,
                      // since extractJson() and validate() cover the fallout.
                      jsonSchema: e("JSON_SCHEMA") === "1" } };
  }
  if (provider === "workers-ai") {
    const accountId = e("ACCOUNT_ID") || process.env.CF_ACCOUNT_ID;
    const apiToken = e("API_TOKEN") || process.env.CF_API_TOKEN;
    const model = e("MODEL");
    if (!accountId || !apiToken || !model) return null;
    return { label: model, model, creds: { provider: "workers-ai", accountId, apiToken } };
  }
  return null;
}

const PRIMARY = modelFromEnv("ASK_");
const OVERFLOW = modelFromEnv("ASK_FALLBACK_");
const DAILY_CAP = Number(process.env.ASK_DAILY_CAP || 0);   // 0 = no cap locally
let asked = 0;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".woff": "font/woff",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".eot": "application/vnd.ms-fontobject",
  ".mp4": "video/mp4",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function handleAsk(req, res) {
  if (req.method === "GET") {
    return send(res, 200, JSON.stringify({ enabled: Boolean(PRIMARY || OVERFLOW) }));
  }
  if (req.method !== "POST") return send(res, 405, JSON.stringify({ error: "method" }));

  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return send(res, 400, JSON.stringify({ error: "bad_request" })); }

  const lang = LANGUAGES[body?.lang] ? body.lang : "en";
  const problem = checkQuestion(body?.question);
  if (problem) return send(res, 400, JSON.stringify({ error: "invalid_question", message: problem }));

  // Same decision the deployed Function makes, on a counter instead of KV.
  asked++;
  const overCap = DAILY_CAP > 0 && asked > DAILY_CAP;
  let pick = (overCap && OVERFLOW) || PRIMARY || OVERFLOW;
  if (!pick) return send(res, 503, JSON.stringify({ error: "not_configured" }));
  if (overCap && OVERFLOW) console.log(`cap of ${DAILY_CAP} reached — using ${OVERFLOW.label}`);
  else if (overCap) console.log(`cap of ${DAILY_CAP} reached and no fallback — answering anyway (local only)`);

  const question = body.question.trim();
  try {
    let out;
    try {
      out = await askModel(pick.creds, { question, lang, model: pick.model });
    } catch (err) {
      const overloaded = err?.status === 429 || err?.status === 529 || err?.status === 503;
      if (!overloaded || pick === OVERFLOW || !OVERFLOW) throw err;
      console.log(`primary returned ${err.status} — retrying on ${OVERFLOW.label}`);
      out = await askModel(OVERFLOW.creds, { question, lang, model: OVERFLOW.model });
      pick = OVERFLOW;
    }

    if (out.refused) return send(res, 200, JSON.stringify({ error: "declined" }));
    const floor = enforceSafetyFloor(out.result, body.question);
    console.log(`  ${pick.label}  talk_to_someone=${floor.result.talk_to_someone}`
      + (floor.raised ? " (raised by the safety floor)" : "")
      + `  refs=${floor.result.references.length}`);
    return send(res, 200, JSON.stringify(floor.result));
  } catch (err) {
    console.error("ask failed:", err.status || "", err.message);
    return send(res, 502, JSON.stringify({ error: "failed" }));
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/ask") return handleAsk(req, res);

  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, rel);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    return send(res, 404, "Not found", "text/plain");
  }
  try {
    const data = await readFile(file);
    send(res, 200, data, TYPES[extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}).listen(PORT, () => {
  console.log(`dev server on http://localhost:${PORT}`);
  if (!PRIMARY && !OVERFLOW) {
    console.log("  /api/ask is disabled — set ANTHROPIC_API_KEY, or ASK_PROVIDER "
      + "with ASK_BASE_URL and ASK_MODEL. The question box will hide itself.");
  } else {
    console.log(`  model:    ${PRIMARY ? PRIMARY.label : "(none — overflow only)"}`);
    if (OVERFLOW) console.log(`  overflow: ${OVERFLOW.label}`);
    if (DAILY_CAP) console.log(`  cap:      ${DAILY_CAP} questions, then the overflow model`);
  }
});
