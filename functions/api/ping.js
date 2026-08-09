/**
 * Zero-dependency probe. If this responds but /api/ask does not, the problem is
 * npm bundling for the Function, not Pages Functions themselves.
 */
export function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, functions: "running" }), {
    headers: { "content-type": "application/json" },
  });
}
