/**
 * Local stand-in for Cloudflare Pages: serves the built site and implements
 * /api/ask with the same core module the real Function uses.
 *
 *   ANTHROPIC_API_KEY=... node scripts/dev-server.mjs
 *   → http://localhost:8788
 *
 * This exists so the question box can be exercised in a browser without a
 * Cloudflare deploy. It is not the production path — functions/api/ask.js is.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { askClaude, checkQuestion, enforceSafetyFloor, LANGUAGES } from "../functions/api/_ask-core.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 8788);

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
    return send(res, 200, JSON.stringify({ enabled: Boolean(process.env.ANTHROPIC_API_KEY) }));
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

  try {
    const { refused, result } = await askClaude(
      { apiKey: process.env.ANTHROPIC_API_KEY },
      { question: body.question.trim(), lang },
    );
    if (refused) return send(res, 200, JSON.stringify({ error: "declined" }));
    const floor = enforceSafetyFloor(result, body.question);
    if (floor.raised) console.log("safety floor raised talk_to_someone");
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
  console.log(process.env.ANTHROPIC_API_KEY
    ? "  /api/ask is live (ANTHROPIC_API_KEY found)"
    : "  /api/ask is disabled (no ANTHROPIC_API_KEY) — the box will hide itself");
});
