import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(readFileSync(join(root, "course/ffstart-manifest.json"), "utf8"));
const outputRoot = join(root, "ffstart");
const version = "20260715-ffstart-v20";
mkdirSync(outputRoot, { recursive: true });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);
}

function page(lesson, module) {
  const title = `${lesson.title} · FF Start`;
  const description = `${module.title}: решение, разбор, видео и практика в пошаговом уроке FF Start.`;
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0a0910">
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/assets/favicon.svg">
  <link rel="stylesheet" href="/assets/poker-kit/tokens.css?v=${version}">
  <link rel="stylesheet" href="/assets/poker-kit/decks/decks.css?v=${version}">
  <link rel="stylesheet" href="/assets/poker-kit/chips/chips.css?v=${version}">
  <link rel="stylesheet" href="/assets/poker-simulator/simulator-table.css?v=${version}">
  <link rel="stylesheet" href="/assets/poker-simulator/simulator-polish.css?v=${version}">
  <link rel="stylesheet" href="/assets/poker-trainer-shell/shell.css?v=${version}">
  <link rel="stylesheet" href="/assets/poker-kit/trainer-ui-sanitizer.css?v=${version}">
  <link rel="stylesheet" href="/assets/4k-scale.css?v=${version}">
  <link rel="stylesheet" href="/assets/lesson-platform/lesson-platform.css?v=${version}">
  <link rel="stylesheet" href="/assets/ffstart-course/media-player.css?v=${version}">
</head>
<body data-lesson-id="${escapeHtml(lesson.id)}">
  <main data-ffstart-lesson aria-busy="true"><noscript>Для интерактивного урока нужен JavaScript.</noscript></main>
  <script src="/assets/poker-kit/decks/deck-library.js?v=${version}"></script>
  <script src="/assets/poker-kit/chips/chip-library.js?v=${version}"></script>
  <script src="/assets/poker-simulator/simulator-random.js?v=${version}"></script>
  <script src="/assets/poker-simulator/simulator-board-render.js?v=${version}"></script>
  <script src="/assets/poker-simulator/simulator-seat-slots.js?v=${version}"></script>
  <script src="/assets/poker-simulator/simulator-seat-renderer.js?v=${version}"></script>
  <script src="/assets/poker-simulator/simulator-table-renderer.js?v=${version}"></script>
  <script src="/assets/poker-trainer-shell/simulator-snapshot.js?v=${version}"></script>
  <script src="/assets/poker-trainer-shell/simulator-practice.js?v=${version}"></script>
  <script src="/assets/poker-progress/progress.js?v=${version}"></script>
  <script src="/assets/ffstart-course/media-player.js?v=${version}"></script>
  <script src="/assets/lesson-platform/lesson-platform.js?v=${version}"></script>
  <script src="/assets/ffstart-course/content-foundations.js?v=${version}"></script>
  <script src="/assets/ffstart-course/content-strategy.js?v=${version}"></script>
  <script src="/assets/ffstart-course/boot.js?v=${version}"></script>
</body>
</html>
`;
}

const generated = [];
for (const module of manifest.modules) {
  for (const lesson of module.lessons) {
    if (lesson.kind === "legacy") continue;
    const file = join(outputRoot, `${lesson.id}.html`);
    writeFileSync(file, page(lesson, module));
    generated.push(file);
  }
}

console.log(`FFStart pages: ${generated.length}`);
