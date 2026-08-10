/**
 * Where the model runs. Everything *about* the model — the prompt, the schema,
 * the range checks, the safety floor — stays in _ask-core.mjs, so swapping a
 * provider swaps only the transport.
 *
 * This exists so the church can answer "could an open model do this?" with a
 * measurement instead of an opinion. The production path is unchanged and still
 * Anthropic; the others are here for `scripts/test-ask.mjs --compare`, and are
 * ready if the answer turns out to be yes.
 *
 * Each provider returns { text, usage, refused }. `text` is expected to be the
 * JSON object the schema describes. Whether it arrives as clean JSON depends on
 * the host: Anthropic and the better OpenAI-compatible endpoints enforce the
 * schema, most open-model hosts only try. That is why extractJson() below is
 * forgiving, and why validate() in _ask-core.mjs range-checks everything after.
 * A weaker model cannot produce a broken reference or invented scripture — it
 * can only produce a less well-chosen one.
 */

/**
 * Pull a JSON object out of whatever the model actually said.
 *
 * Hosts that do not enforce a schema tend to wrap the object in a ```json
 * fence, or preface it with "Here is the JSON:", or append a closing remark.
 * Brace-matching from the first { is more robust than a regex, because the
 * strings inside contain braces of their own in some languages.
 */
export function extractJson(text) {
  const s = String(text || "").trim();
  try { return JSON.parse(s); } catch { /* keep going */ }

  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* keep going */ }
  }

  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

function fail(label, status, detail) {
  const err = new Error(`${label} ${status}: ${String(detail).slice(0, 300)}`);
  err.status = status;
  return err;
}

/** Anthropic Messages API. The production path. */
export async function anthropic({ apiKey }, { system, user, schema, model, effort, maxTokens }) {
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema } },
  };
  // Haiku 4.5 rejects `effort`; every current Opus/Sonnet accepts it.
  if (!model.startsWith("claude-haiku")) body.output_config.effort = effort;

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
    method: "POST", headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw fail("anthropic", res.status, await res.text().catch(() => ""));

  const response = await res.json();
  if (response.stop_reason === "refusal") return { refused: true, response };
  if (response.stop_reason === "max_tokens") {
    throw fail("anthropic", "max_tokens", `hit max_tokens (${maxTokens}); raise it`);
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return { refused: true, response };
  return { text, usage: response.usage, response };
}

/**
 * Any OpenAI-compatible /chat/completions endpoint.
 *
 * Covers most ways an open model is served — vLLM, Ollama, OpenRouter,
 * Together, DeepInfra, DashScope's compatible mode. `baseUrl` is the part
 * before /chat/completions.
 *
 * response_format is sent when the host claims to support json_schema and
 * dropped otherwise; either way the prompt asks for JSON and extractJson()
 * cleans up after. Not every host honours the schema, and the ones that do not
 * fail quietly rather than loudly — which is the argument for keeping every
 * range check on our side.
 */
export async function openaiCompatible(
  { apiKey, baseUrl, jsonSchema = true },
  { system, user, schema, model, maxTokens },
) {
  const body = {
    model,
    max_tokens: maxTokens,
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user + "\n\nReply with a single JSON object and nothing else." },
    ],
  };
  if (jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "passages", strict: true, schema },
    };
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw fail("openai-compatible", res.status, await res.text().catch(() => ""));

  const response = await res.json();
  const choice = response.choices?.[0];
  if (choice?.finish_reason === "content_filter") return { refused: true, response };
  if (choice?.finish_reason === "length") {
    throw fail("openai-compatible", "max_tokens", `hit max_tokens (${maxTokens}); raise it`);
  }
  const text = choice?.message?.content;
  if (!text) return { refused: true, response };
  return { text, usage: response.usage, response };
}

/**
 * Cloudflare Workers AI over REST.
 *
 * The realistic home for an open model here: the site is already on Cloudflare
 * Pages, so this needs a binding rather than a server. In a Function you would
 * call env.AI.run(model, body) instead — same body, no account id or token —
 * but the REST form is what a local bake-off can use.
 *
 * Check the current model catalogue before picking one; it changes.
 */
export async function workersAi(
  { apiToken, accountId },
  { system, user, schema, model, maxTokens },
) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user + "\n\nReply with a single JSON object and nothing else." },
        ],
        response_format: { type: "json_schema", json_schema: schema },
      }),
    },
  );
  if (!res.ok) throw fail("workers-ai", res.status, await res.text().catch(() => ""));

  const response = await res.json();
  if (response.success === false) {
    throw fail("workers-ai", "error", JSON.stringify(response.errors || response));
  }
  const text = response.result?.response
    ?? (typeof response.result === "string" ? response.result : null);
  if (!text) return { refused: true, response };
  return { text, usage: response.result?.usage, response };
}

/**
 * Workers AI through a binding, which is how a Pages Function should reach it:
 * no account id, no token, nothing to leak. `creds.ai` is env.AI.
 *
 * This is the overflow path. When the day's budget for the paid model is gone,
 * a reader gets a smaller model rather than "too many people are asking right
 * now" — see the note on graceful degradation in ask.js.
 */
export async function workersAiBinding({ ai }, { system, user, schema, model, maxTokens }) {
  const response = await ai.run(model, {
    max_tokens: maxTokens,
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user + "\n\nReply with a single JSON object and nothing else." },
    ],
    response_format: { type: "json_schema", json_schema: schema },
  });
  const text = response?.response ?? (typeof response === "string" ? response : null);
  if (!text) return { refused: true, response };
  return { text, usage: response?.usage, response };
}

export const PROVIDERS = {
  anthropic,
  "openai-compatible": openaiCompatible,
  "workers-ai": workersAi,
  "workers-ai-binding": workersAiBinding,
};
