import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const js = await readFile(path.join(repoRoot, "assets/lesson-platform/lesson-platform.js"), "utf8");
const css = await readFile(path.join(repoRoot, "assets/lesson-platform/lesson-platform.css"), "utf8");

function contains(source, fragment, message) {
  assert.ok(source.includes(fragment), message || `Missing contract fragment: ${fragment}`);
}

contains(js, "rootScope.FFStartLessonPlatform = api", "global platform API is exposed");
contains(js, "root.setAttribute(\"data-ffstart-lesson\"", "mount marks the lesson root");
contains(js, "FFTrainerSimulator.renderDecision", "simulator action API is the explicit dependency");
contains(js, "renderDecision(host, spot", "all lesson decisions enter through the shared simulator adapter");
contains(js, "[data-shell-action=\"choose\"]", "shared table actions are delegated");
contains(js, "data-ffstart-table-kind=\"encounter\"", "encounter owns a functional table host");
contains(js, "data-ffstart-table-kind=\"practice\"", "practice owns a functional table host");
contains(js, "[data-trainer-simulator-actions]", "feedback and next controls attach inside the table controls");
contains(js, "root.addEventListener(\"click\", click, true)", "lesson controls run in capture phase before simulator handlers can consume them");
contains(js, "goStep(controller, \"wisdom\", true)", "the encounter feedback advances into the lesson flow");
contains(js, "activeTab.closest(\".ffstart-step-tabs\")", "active mobile steps scroll within their own tab rail");
contains(js, "rail.scrollTo({ left", "active mobile steps remain visible without moving the page");

for (const step of ["encounter", "wisdom", "deep", "practice"]) {
  contains(js, `[\"${step}\"`, `flow includes ${step}`);
}

for (const behavior of ["Home", "End", "ArrowLeft", "ArrowRight", "pointerdown", "pointerup", "aria-hidden", "inert"]) {
  contains(js, behavior, `wisdom accessibility behavior ${behavior} is present`);
}

for (const visual of ["ladder", "bar", "compare", "flow", "seat-map", "hand-rank", "stack-zones", "odds", "range-matrix"]) {
  contains(js, `\"${visual}\"`, `visual renderer ${visual} is registered`);
}

contains(js, "FFTrainerEvents.send", "central trainer events hook is present");
contains(js, "FFPlayerProgress.setResult", "central completion hook is present");
contains(js, "ffstart-lesson-events-v1", "bounded event fallback is present");
contains(js, "ffstart-lesson-progress-v1", "result/progress fallback is present");
contains(js, "choice: selected.key", "decision telemetry uses the canonical choice field");
contains(js, "expected: expected.key", "decision telemetry uses the canonical expected field");
assert.ok(!js.includes('"trainer_session_started"'), "practice start cannot degrade into a fake zero-score result");
contains(js, "catch (_error) {\n      tableError(host);", "simulator render failures keep a learner-facing recovery state");

for (const token of ["--brand-violet", "--brand-yellow", "--brand-ink", "--bg", "--panel", "--text"]) {
  contains(css, `var(${token}`, `FunFarm token ${token} is inherited`);
}

for (const breakpoint of ["1180px", "900px", "760px", "620px"]) {
  contains(css, `max-width: ${breakpoint}`, `responsive breakpoint ${breakpoint} is present`);
}

contains(css, "prefers-reduced-motion: reduce", "reduced motion is respected");
contains(css, ":focus-visible", "keyboard focus remains visible");
contains(css, "overflow-x: clip", "the lesson root prevents horizontal page overflow");
contains(css, "grid-template-columns: repeat(13", "range matrix has thirteen columns");
contains(css, "--ffstart-action-gutter", "table feedback reserves simulator-owned action space");
contains(css, "min-height: calc(var(--trainer-table-plane-height) + var(--ffstart-action-gutter))", "mobile tables honor the full feedback gutter");
contains(css, ".ffstart-table-host:has(.is-concept-spot)", "mobile concept decisions reserve enough action space");
contains(css, "container-type: inline-size", "shared lesson table geometry can use container units");

console.log("FFStart platform static contract: OK");
