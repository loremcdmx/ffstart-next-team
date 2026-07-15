import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "course/ffstart-manifest.json"), "utf8"));
const lessons = manifest.modules.flatMap((module) => module.lessons);
const legacyEntrypoints = new Map([
  ["rfi-open-position", "rfi-open-position-lesson.html"],
  ["bb-call-defense", "bb-call-defense-lesson.html"],
  ["resteal", "resteal-lesson.html"]
]);
const expectedRoutes = new Map([
  ["/ffstart", "ffstart.html"],
  ["/ffstart-review", "ffstart-review.html"],
  ["/ffstart-handoff", "ffstart-handoff.html"],
  ["/ffstart/play-session", "ffstart/play-session.html"],
  ...lessons.map((lesson) => [lesson.route, lesson.kind === "legacy" ? legacyEntrypoints.get(lesson.id) : `ffstart/${lesson.id}.html`])
]);
const pages = [...new Set([
  "index.html",
  "poker-simulator.html",
  ...expectedRoutes.values()
])];
const requiredDirectories = [
  "assets/poker-kit",
  "assets/poker-simulator",
  "assets/poker-trainer-shell",
  "assets/poker-progress",
  "assets/player-survey",
  "assets/poker-rfi-open-lesson",
  "assets/poker-bb-call-defense-lesson",
  "assets/poker-resteal-lesson",
  "assets/lesson-platform",
  "assets/ffstart-course",
  "course",
  "ffstart"
];

let failures = 0;
function check(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
  } else {
    failures += 1;
    console.error(`✗ ${message}`);
  }
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(absolute) : [absolute];
  });
}

function localTargetExists(sourceFile, reference) {
  const clean = String(reference || "").split(/[?#]/, 1)[0];
  if (!clean || /^(?:https?:|data:|mailto:|tel:|#)/.test(clean)) return true;
  if (clean === "/") return existsSync(join(root, "index.html"));
  if (clean.startsWith("/")) {
    if (clean === "/poker-simulator" || clean === "/poker-simulator.html") return existsSync(join(root, "poker-simulator.html"));
    const route = expectedRoutes.get(clean);
    return route ? existsSync(join(root, route)) : existsSync(join(root, clean.slice(1)));
  }
  return existsSync(resolve(dirname(sourceFile), clean));
}

function documentTargetExists(reference) {
  const clean = String(reference || "").split(/[?#]/, 1)[0].replace(/^\.\//, "");
  if (!clean || clean.startsWith("/api/") || clean.includes("${")) return true;
  if (clean === "poker-simulator" || clean === "poker-simulator.html") return existsSync(join(root, "poker-simulator.html"));
  return localTargetExists(join(root, "index.html"), clean.startsWith("/") ? clean : `/${clean}`);
}

for (const page of pages) check(existsSync(join(root, page)), `${page} exists`);
for (const directory of requiredDirectories) check(existsSync(join(root, directory)), `${directory} exists`);

const localRefPattern = /(?:src|href)=["']([^"']+)["']/g;
for (const page of pages) {
  const pagePath = join(root, page);
  if (!existsSync(pagePath)) continue;
  const html = readFileSync(pagePath, "utf8");
  for (const match of html.matchAll(localRefPattern)) {
    const ref = match[1];
    if (/^(?:https?:|data:|mailto:|tel:|#)/.test(ref)) continue;
    const cleanRef = ref.split(/[?#]/, 1)[0];
    if (!cleanRef) continue;
    check(localTargetExists(pagePath, ref), `${page} resolves ${cleanRef}`);
  }
}

const sourceFiles = filesBelow(join(root, "assets")).filter((path) => /\.(?:css|js)$/.test(path));
const embeddedRefPatterns = [
  { pattern: /url\(\s*["']?([^"')]+)["']?\s*\)/g, documentRelative: false },
  { pattern: /fetch\(\s*["']([^"']+)["']/g, documentRelative: true },
  { pattern: /new URL\(\s*["']([^"']+)["']/g, documentRelative: true }
];
for (const sourceFile of sourceFiles) {
  const text = readFileSync(sourceFile, "utf8");
  for (const rule of embeddedRefPatterns) {
    for (const match of text.matchAll(rule.pattern)) {
      const reference = match[1];
      if (/^(?:https?:|data:|#|var\()/.test(reference) || reference.includes("${")) continue;
      const resolved = rule.documentRelative && !reference.startsWith(".")
        ? documentTargetExists(reference)
        : localTargetExists(sourceFile, reference);
      check(resolved, `${sourceFile.slice(root.length + 1)} resolves ${reference.split(/[?#]/, 1)[0]}`);
    }
  }
}

const hub = readFileSync(join(root, "index.html"), "utf8");
check((hub.match(/class="trainer-card /g) || []).length >= 3, "hub keeps the three focused trainer cards");
check(hub.includes('href="/ffstart"'), "hub links to the FF Start program");
for (const lesson of lessons.filter((lesson) => lesson.kind === "legacy")) check(hub.includes(`href="${lesson.route}"`), `hub links to ${lesson.route}`);

const courseOverview = readFileSync(join(root, "ffstart.html"), "utf8");
check(courseOverview.includes("data-course-modules-list"), "FF Start overview owns the complete module list");
check(courseOverview.includes("/assets/ffstart-course/course.js"), "FF Start overview loads its course runtime");
check(courseOverview.includes('href="/"'), "FF Start overview links back to the learning hub");

const handoffOverview = readFileSync(join(root, "ffstart-handoff.html"), "utf8");
check(handoffOverview.includes('href="/FFSTART_CODEX_HANDOFF.md"'), "FF Start handoff exposes its Codex entrypoint");
check(handoffOverview.includes("data-handoff-modules"), "FF Start handoff owns the target program map");
check(handoffOverview.includes("data-handoff-archive"), "FF Start handoff keeps a reconsideration archive");

const playSessionPage = readFileSync(join(root, "ffstart/play-session.html"), "utf8");
check(playSessionPage.includes("/assets/poker-simulator/embed.js"), "FF Start game break loads the full simulator embed");
check(playSessionPage.includes("/assets/ffstart-course/play-session.js"), "FF Start game break loads its session controller");
check(!/data-shell-action=|data-trainer-simulator-actions/.test(playSessionPage), "FF Start game break does not fake simulator controls");

for (const page of legacyEntrypoints.values()) {
  const html = readFileSync(join(root, page), "utf8");
  check(html.includes('href="/"'), `${page} links back to the learning hub`);
  check(html.includes('rel="icon"'), `${page} declares a favicon`);
}
for (const lesson of lessons.filter((lesson) => lesson.kind !== "legacy")) {
  const page = `ffstart/${lesson.id}.html`;
  const html = readFileSync(join(root, page), "utf8");
  check(html.includes(`<body data-lesson-id="${lesson.id}">`), `${page} selects its lesson content`);
  check(html.includes("/assets/poker-trainer-shell/simulator-snapshot.js"), `${page} loads the functional simulator table`);
  check(html.includes("/assets/poker-trainer-shell/simulator-practice.js"), `${page} loads the simulator decision adapter`);
  check(html.includes("/assets/lesson-platform/lesson-platform.js"), `${page} loads the shared lesson platform`);
  check(html.includes("/assets/ffstart-course/boot.js"), `${page} loads the course boot runtime`);
}
check(!readFileSync(join(root, "assets/poker-rfi-open-lesson/simulator-pack.js"), "utf8").includes('"MP","HJ"'), "RFI engine pack does not target nonexistent 7-max MP");
check(!readFileSync(join(root, "assets/poker-resteal-lesson/lesson.js"), "utf8").includes('new URL("poker-simulator.html"'), "resteal practice starts without a clean-URL redirect");

const vercelConfig = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
check(vercelConfig.cleanUrls === true, "Vercel serves HTML entrypoints without extensions");
check(vercelConfig.rewrites?.some((rule) => rule.source === "/favicon.ico" && rule.destination === "/assets/favicon.svg"), "Vercel serves /favicon.ico from the hub icon");
for (const [source, destination] of expectedRoutes) {
  check(existsSync(join(root, destination)), `${source} clean URL entrypoint exists`);
}

if (failures) {
  console.error(`\n${failures} static check(s) failed.`);
  process.exit(1);
}

console.log("\nStatic hub contract passed.");
