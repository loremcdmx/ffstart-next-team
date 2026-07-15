const DEFAULT_UPSTREAM = "https://ff-start-poker-hub.vercel.app/api/trainer-events";
const MAX_BODY_BYTES = 4_500_000;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function requestBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body;
  return JSON.stringify(req.body || {});
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const body = requestBody(req);
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
    json(res, 413, { ok: false, error: "payload_too_large" });
    return;
  }

  const upstream = process.env.TRAINER_EVENTS_UPSTREAM || DEFAULT_UPSTREAM;
  if (upstream === "disabled") {
    json(res, 202, { ok: true, accepted: 0, disabled: true });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ff-poker-learning-hub",
        ...(req.headers["x-forwarded-for"] ? { "X-Forwarded-For": String(req.headers["x-forwarded-for"]) } : {})
      },
      body,
      signal: controller.signal
    });
    const payload = await response.text();
    res.statusCode = response.status;
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(payload);
  } catch (error) {
    json(res, 502, { ok: false, error: error?.name === "AbortError" ? "upstream_timeout" : "upstream_unavailable" });
  } finally {
    clearTimeout(timeout);
  }
}
