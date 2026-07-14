import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const routes = [
  { path: "/", file: "index.html", title: "FF · Префлоп-лаборатория" },
  { path: "/rfi-open-position-lesson", file: "rfi-open-position-lesson.html", title: "Опен-рейзы по позициям · FF Префлоп-лаборатория" },
  { path: "/bb-call-defense-lesson", file: "bb-call-defense-lesson.html", title: "Защита BB коллом · FF Префлоп-лаборатория" },
  { path: "/resteal-lesson", file: "resteal-lesson.html", title: "Рестилы в коротких стеках · FF Префлоп-лаборатория" },
];

const child = spawn(process.execPath, [join(root, "scripts/serve-local.mjs")], {
  cwd: root,
  env: { ...process.env, HOST: host, PORT: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr += chunk; });

function waitForBaseUrl() {
  return new Promise((resolveUrl, reject) => {
    let stdout = "";
    const timeout = setTimeout(() => reject(new Error(`Local server did not start. ${stderr}`.trim())), 5000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/Local learning hub: (http:\/\/127\.0\.0\.1:\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolveUrl(match[1]);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Local server exited with code ${code}. ${stderr}`.trim()));
    });
  });
}

async function stopServer() {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(2000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

try {
  const baseUrl = await waitForBaseUrl();
  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route.path}`);
    const body = await response.text();
    const expectedBody = await readFile(join(root, route.file), "utf8");
    assert.equal(response.status, 200, `${route.path} status`);
    assert.equal(response.headers.get("cache-control"), "no-store", `${route.path} cache policy`);
    assert.equal(body, expectedBody, `${route.path} serves current worktree file`);
    assert.ok(body.includes(`<title>${route.title}</title>`), `${route.path} title`);
    console.log(`✓ ${route.path} serves current ${route.file}`);
  }
  console.log("Local clean-route smoke passed.");
} finally {
  await stopServer();
}
