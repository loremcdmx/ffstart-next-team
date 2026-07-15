import { readFileSync } from "node:fs";
import { request } from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const library = JSON.parse(readFileSync(path.join(root, "course/ffstart-media.json"), "utf8"));
const items = [...new Map(Object.values(library.lessons || {}).flat().map((item) => [item.id, item])).values()];
const sampleIds = [
  "01-chto_vas_zhdet_intro",
  "34-start_za_stolom_vebinar_01",
  "35-start_za_stolom_vebinar_02",
  "36-start_za_stolom_vebinar_03"
];

function vimeoIdentity(item) {
  try {
    const embed = new URL(item.embedUrl);
    const fallback = new URL(item.fallbackUrl);
    const videoId = embed.pathname.split("/").filter(Boolean).at(-1) || "";
    const privacyHash = embed.searchParams.get("h") || "";
    const fallbackParts = fallback.pathname.split("/").filter(Boolean);
    if (embed.protocol !== "https:" || embed.hostname !== "player.vimeo.com") return null;
    if (!/^\d+$/.test(videoId) || !/^[a-z0-9]+$/i.test(privacyHash)) return null;
    if (fallbackParts[0] !== videoId || fallbackParts[1] !== privacyHash) return null;
    return { videoId, privacyHash };
  } catch (_error) {
    return null;
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function next() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, next));
  return results;
}

async function probeOembed(item) {
  const identity = vimeoIdentity(item);
  if (!identity) return { id: item.id, valid: false, detail: "invalid hashed Vimeo URLs" };
  try {
    const endpoint = new URL("https://vimeo.com/api/oembed.json");
    endpoint.searchParams.set("url", item.fallbackUrl);
    const response = await fetchWithTimeout(endpoint);
    if (!response.ok) return { id: item.id, valid: false, detail: `oEmbed HTTP ${response.status}` };
    const payload = await response.json();
    const html = String(payload.html || "");
    const valid = payload.provider_name === "Vimeo"
      && Number(payload.duration) > 0
      && html.includes(`/video/${identity.videoId}`)
      && html.includes(`h=${identity.privacyHash}`);
    return {
      id: item.id,
      valid,
      detail: valid ? `${Math.round(Number(payload.duration))}s` : "oEmbed omitted the hashed player"
    };
  } catch (error) {
    return { id: item.id, valid: false, detail: error.name === "AbortError" ? "oEmbed timeout" : error.message };
  }
}

async function probePlayer(item) {
  try {
    const url = new URL(item.embedUrl);
    url.searchParams.set("ff_delivery_probe", `${Date.now()}-${item.id}`);
    const response = await fetchWithTimeout(url, { headers: { "Cache-Control": "no-cache" } });
    const contentType = response.headers.get("content-type") || "";
    const vimeoError = response.headers.get("x-vimeo-error") || "";
    if (response.body) await response.body.cancel();
    const valid = response.status === 200 && /^text\/html\b/i.test(contentType) && !vimeoError;
    return { id: item.id, valid, detail: `${response.status} · ${contentType || "no content type"}${vimeoError ? ` · ${vimeoError}` : ""}` };
  } catch (error) {
    return { id: item.id, valid: false, detail: error.name === "AbortError" ? "player timeout" : error.message };
  }
}

function probeCdnRange(item, index) {
  return new Promise((resolveProbe) => {
    const url = new URL(item.videoUrl);
    url.searchParams.set("ff_range_diagnostic", `${Date.now()}-${index}`);
    const client = request(url, {
      method: "GET",
      headers: {
        "Accept-Encoding": "identity",
        "Cache-Control": "no-cache",
        Range: "bytes=0-0"
      }
    });
    const finish = (result) => resolveProbe({ id: item.id, ...result });
    client.setTimeout(12_000, () => client.destroy(new Error("timeout")));
    client.once("response", (response) => {
      const result = {
        status: response.statusCode || 0,
        acceptRanges: response.headers["accept-ranges"] || "",
        contentRange: response.headers["content-range"] || "",
        contentLength: response.headers["content-length"] || ""
      };
      response.destroy();
      finish(result);
    });
    client.once("error", (error) => finish({ status: 0, error: error.message }));
    client.end();
  });
}

if (items.length !== 36) throw new Error(`Expected 36 unique media items, got ${items.length}`);
const oembedResults = await mapLimit(items, 6, probeOembed);
const sampleItems = sampleIds.map((id) => {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Missing delivery sample: ${id}`);
  return item;
});
const playerResults = await mapLimit(sampleItems, 4, probePlayer);
const cdnResults = await Promise.all(sampleItems.map(probeCdnRange));

for (const result of oembedResults) {
  console.log(`${result.valid ? "PASS" : "FAIL"} Vimeo oEmbed ${result.id}: ${result.detail}`);
}
for (const result of playerResults) {
  console.log(`${result.valid ? "PASS" : "FAIL"} Vimeo player ${result.id}: ${result.detail}`);
}
for (const result of cdnResults) {
  const rangeOk = result.status === 206
    && /^bytes 0-0\/\d+$/i.test(result.contentRange)
    && String(result.acceptRanges).toLowerCase() === "bytes"
    && String(result.contentLength) === "1";
  console.log(`${rangeOk ? "INFO" : "WARN"} non-primary CDN ${result.id}: ${result.status} · range=${result.contentRange || "missing"} · length=${result.contentLength || "missing"}${result.error ? ` · ${result.error}` : ""}`);
}

const failed = [...oembedResults, ...playerResults].filter((result) => !result.valid);
if (failed.length) {
  console.error(`External FF Start primary delivery failed: ${failed.length} Vimeo probe(s). Do not publish media until every hashed embed is available.`);
  process.exitCode = 1;
} else {
  console.log(`External FF Start primary delivery: Vimeo embeds OK (${oembedResults.length}/36); CDN MP4 is retained only as a diagnostic source.`);
}
