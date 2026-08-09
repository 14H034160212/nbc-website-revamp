/**
 * POST /api/ask — Cloudflare Pages Function.
 *
 * Why a server-side function at all: an API key shipped to the browser is a
 * public API key. This endpoint is the only place the credential exists; the
 * page calls same-origin and never sees it.
 *
 * Setup (Cloudflare dashboard → the Pages project → Settings):
 *   1. Variables and Secrets → add ANTHROPIC_API_KEY as an *encrypted* secret,
 *      for Production and Preview.
 *   2. Optional but recommended — KV → create a namespace and bind it as
 *      ASK_RATELIMIT. Without it, rate limiting falls back to per-isolate
 *      counters, which a determined caller can walk around (see below).
 *   3. Optional — set ASK_DAILY_CAP to a number of questions per day across the
 *      whole site. Defaults to 300. Requires the KV binding to be enforceable.
 *
 * Nothing here runs unless the secret is set: with no key the endpoint returns
 * a disabled response and the page hides the feature, so a deploy without the
 * secret degrades to the curated topical finder rather than erroring.
 */

import Anthropic from "@anthropic-ai/sdk";
import { askClaude, checkQuestion, LANGUAGES } from "./_ask-core.js";

const PER_IP_PER_HOUR = 10;
const DEFAULT_DAILY_CAP = 300;

/**
 * Fallback limiter for deployments without a KV binding.
 *
 * Module scope on Workers is per-isolate and short-lived, so this is a speed
 * bump, not a control. It exists so an un-configured deploy is not wide open;
 * bind ASK_RATELIMIT for anything you actually rely on.
 */
const memory = new Map();

function tooManyFromMemory(ip) {
  const now = Date.now();
  const hour = 3600_000;
  const hits = (memory.get(ip) || []).filter((t) => now - t < hour);
  hits.push(now);
  memory.set(ip, hits);
  if (memory.size > 5000) memory.clear();  // bound the isolate's memory
  return hits.length > PER_IP_PER_HOUR;
}

async function tooManyFromKV(kv, ip, dailyCap) {
  const hourKey = `ip:${ip}:${Math.floor(Date.now() / 3600_000)}`;
  const dayKey = `all:${new Date().toISOString().slice(0, 10)}`;

  const [ipCount, dayCount] = await Promise.all([
    kv.get(hourKey).then((v) => parseInt(v || "0", 10)),
    kv.get(dayKey).then((v) => parseInt(v || "0", 10)),
  ]);

  if (ipCount >= PER_IP_PER_HOUR) return "ip";
  if (dayCount >= dailyCap) return "day";

  await Promise.all([
    kv.put(hourKey, String(ipCount + 1), { expirationTtl: 3900 }),
    kv.put(dayKey, String(dayCount + 1), { expirationTtl: 90000 }),
  ]);
  return null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** The page calls this on load to decide whether to show the feature at all. */
export function onRequestGet({ env }) {
  return json({ enabled: Boolean(env.ANTHROPIC_API_KEY) });
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "not_configured" }, 503);
  }

  // Same-origin only. This endpoint exists for one page on this site; there is
  // no reason for another origin to reach it, and no CORS headers are sent.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ error: "forbidden" }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const question = body?.question;
  const lang = LANGUAGES[body?.lang] ? body.lang : "en";

  const problem = checkQuestion(question);
  if (problem) return json({ error: "invalid_question", message: problem }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const dailyCap = parseInt(env.ASK_DAILY_CAP || DEFAULT_DAILY_CAP, 10);

  if (env.ASK_RATELIMIT) {
    const limited = await tooManyFromKV(env.ASK_RATELIMIT, ip, dailyCap);
    if (limited === "ip") return json({ error: "rate_limited_ip" }, 429);
    if (limited === "day") return json({ error: "rate_limited_day" }, 429);
  } else if (tooManyFromMemory(ip)) {
    return json({ error: "rate_limited_ip" }, 429);
  }

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const { refused, result } = await askClaude(client, { question: question.trim(), lang });

    if (refused) return json({ error: "declined" }, 200);
    return json(result);
  } catch (err) {
    // Never leak provider errors or the key to the page.
    const status = err?.status;
    if (status === 429 || status === 529) return json({ error: "busy" }, 503);
    console.error("ask failed", status, err?.message);
    return json({ error: "failed" }, 502);
  }
}
