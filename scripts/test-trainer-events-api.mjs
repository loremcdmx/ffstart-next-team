import assert from "node:assert/strict";
import handler from "../api/trainer-events.js";

function makeResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: "",
    ended: false,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    end(body = "") { this.body = String(body); this.ended = true; }
  };
}

const originalFetch = globalThis.fetch;
const originalUpstream = process.env.TRAINER_EVENTS_UPSTREAM;
let fetchCalls = [];

try {
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    return new Response(JSON.stringify({ ok: true, accepted: 1 }), {
      status: 202,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  };
  process.env.TRAINER_EVENTS_UPSTREAM = "https://events.example.test/api/trainer-events";

  const optionsResponse = makeResponse();
  await handler({ method: "OPTIONS", headers: {} }, optionsResponse);
  assert.equal(optionsResponse.statusCode, 204, "OPTIONS is handled locally");
  assert.equal(fetchCalls.length, 0, "OPTIONS does not reach the upstream");

  const getResponse = makeResponse();
  await handler({ method: "GET", headers: {} }, getResponse);
  assert.equal(getResponse.statusCode, 405, "non-POST methods are rejected");
  assert.equal(getResponse.getHeader("allow"), "POST, OPTIONS", "method response declares allowed verbs");
  assert.deepEqual(JSON.parse(getResponse.body), { ok: false, error: "method_not_allowed" });

  const largeResponse = makeResponse();
  await handler({ method: "POST", headers: {}, body: "x".repeat(4_500_001) }, largeResponse);
  assert.equal(largeResponse.statusCode, 413, "oversized payloads are rejected before forwarding");
  assert.equal(fetchCalls.length, 0, "oversized payloads do not reach the upstream");

  const postResponse = makeResponse();
  await handler({ method: "POST", headers: { "x-forwarded-for": "203.0.113.5" }, body: { schema: "ff-trainer-event-v1", events: [{ type: "lesson_complete" }] } }, postResponse);
  assert.equal(postResponse.statusCode, 202, "upstream status is preserved");
  assert.equal(postResponse.getHeader("cache-control"), "no-store", "proxy responses are never cached");
  assert.deepEqual(JSON.parse(postResponse.body), { ok: true, accepted: 1 }, "upstream payload is preserved");
  assert.equal(fetchCalls.length, 1, "valid POST reaches the upstream exactly once");
  assert.equal(fetchCalls[0].url, process.env.TRAINER_EVENTS_UPSTREAM, "preview-specific upstream is honored");
  assert.equal(fetchCalls[0].options.method, "POST");
  assert.equal(fetchCalls[0].options.headers["X-Forwarded-For"], "203.0.113.5", "forwarded player address is preserved");
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), { schema: "ff-trainer-event-v1", events: [{ type: "lesson_complete" }] }, "event body is forwarded unchanged");

  globalThis.fetch = async () => { throw new Error("offline"); };
  const unavailableResponse = makeResponse();
  await handler({ method: "POST", headers: {}, body: { events: [] } }, unavailableResponse);
  assert.equal(unavailableResponse.statusCode, 502, "upstream failure becomes a bounded proxy error");
  assert.deepEqual(JSON.parse(unavailableResponse.body), { ok: false, error: "upstream_unavailable" });
} finally {
  globalThis.fetch = originalFetch;
  if (originalUpstream === undefined) delete process.env.TRAINER_EVENTS_UPSTREAM;
  else process.env.TRAINER_EVENTS_UPSTREAM = originalUpstream;
}

console.log("Trainer events API contract passed: methods, size limit, forwarding and failure boundary.");
