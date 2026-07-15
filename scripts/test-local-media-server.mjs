import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const serverFile = fileURLToPath(new URL("./serve-local.mjs", import.meta.url));
const fixtureRoot = await mkdtemp(join(tmpdir(), "ff-local-media-"));
const fixture = Buffer.from("0123456789abcdefghijklmnopqrstuvwxyz", "utf8");
const fixtureTypes = new Map([
  ["mp4", "video/mp4"],
  ["m4a", "audio/mp4"],
  ["mp3", "audio/mpeg"],
  ["vtt", "text/vtt; charset=utf-8"],
  ["srt", "application/x-subrip; charset=utf-8"],
  ["webm", "video/webm"],
]);

await Promise.all([
  writeFile(join(fixtureRoot, "index.html"), "fixture"),
  ...[...fixtureTypes.keys()].map((extension) => (
    writeFile(join(fixtureRoot, `sample.${extension}`), fixture)
  )),
]);

const child = spawn(process.execPath, [serverFile], {
  env: {
    ...process.env,
    FF_LOCAL_ROOT: fixtureRoot,
    HOST: "127.0.0.1",
    PORT: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr += chunk; });

function waitForPort() {
  return new Promise((resolvePort, reject) => {
    let stdout = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Local media server did not start. ${stderr}`.trim()));
    }, 5000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/Local learning hub: http:\/\/127\.0\.0\.1:(\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolvePort(Number(match[1]));
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Local media server exited with code ${code}. ${stderr}`.trim()));
    });
  });
}

function getResponse(port, pathname, options = {}) {
  return new Promise((resolveResponse, reject) => {
    const request = httpRequest({
      host: "127.0.0.1",
      port,
      path: pathname,
      method: options.method || "GET",
      headers: options.headers || {},
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolveResponse({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once("error", reject);
    request.end();
  });
}

async function stopServer() {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(2000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

try {
  const port = await waitForPort();

  for (const [extension, contentType] of fixtureTypes) {
    const response = await getResponse(port, `/sample.${extension}`, { method: "HEAD" });
    assert.equal(response.status, 200, `${extension} HEAD status`);
    assert.equal(response.headers["content-type"], contentType, `${extension} MIME`);
    assert.equal(response.headers["accept-ranges"], "bytes", `${extension} advertises ranges`);
    assert.equal(response.headers["content-length"], String(fixture.length), `${extension} length`);
    assert.equal(response.body.length, 0, `${extension} HEAD has no body`);
  }

  const full = await getResponse(port, "/sample.mp4");
  assert.equal(full.status, 200, "full media request status");
  assert.deepEqual(full.body, fixture, "full media request body");

  const rangeCases = [
    { value: "bytes=2-6", start: 2, end: 6 },
    { value: "bytes=30-", start: 30, end: fixture.length - 1 },
    { value: "bytes=-4", start: fixture.length - 4, end: fixture.length - 1 },
    { value: "bytes=34-999", start: 34, end: fixture.length - 1 },
  ];

  for (const rangeCase of rangeCases) {
    const response = await getResponse(port, "/sample.mp4", {
      headers: { Range: rangeCase.value },
    });
    const expected = fixture.subarray(rangeCase.start, rangeCase.end + 1);
    assert.equal(response.status, 206, `${rangeCase.value} status`);
    assert.equal(
      response.headers["content-range"],
      `bytes ${rangeCase.start}-${rangeCase.end}/${fixture.length}`,
      `${rangeCase.value} content range`,
    );
    assert.equal(response.headers["content-length"], String(expected.length), `${rangeCase.value} length`);
    assert.deepEqual(response.body, expected, `${rangeCase.value} body`);
  }

  for (const invalidRange of [
    "bytes=999-",
    "bytes=5-2",
    "bytes=-0",
    "bytes=0-1,3-4",
    "items=0-1",
    "bytes=-",
  ]) {
    const response = await getResponse(port, "/sample.mp4", {
      headers: { Range: invalidRange },
    });
    assert.equal(response.status, 416, `${invalidRange} is rejected`);
    assert.equal(response.headers["content-range"], `bytes */${fixture.length}`, `${invalidRange} total size`);
    assert.equal(response.body.length, 0, `${invalidRange} has no response body`);
  }

  const source = await readFile(serverFile, "utf8");
  assert.match(source, /createReadStream\(/, "server streams files");
  assert.doesNotMatch(source, /\breadFile\(/, "server does not buffer complete files");

  console.log("Local media server contract passed: MIME, HEAD, streaming, ranges, and 416 rejection.");
} finally {
  await stopServer();
  await rm(fixtureRoot, { recursive: true, force: true });
}
