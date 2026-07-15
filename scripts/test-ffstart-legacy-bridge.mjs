import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const course = read("assets/ffstart-course/course.js");
for (const route of [
  '"rfi-open-position": "/rfi-open-position-lesson?from=ffstart"',
  '"bb-call-defense": "/bb-call-defense-lesson?from=ffstart"',
  'resteal: "/resteal-lesson?from=ffstart"'
]) assert.ok(course.includes(route), `course route preserves context: ${route}`);
assert.match(course, /lesson\.id === "resteal"[\s\S]*result\?\.evaluated === false[\s\S]*Number\(result\?\.completedHands\) >= 25[\s\S]*status\.completionOnly \? `Закреплено · \$\{status\.attempts\} раздач`/, "completion-only resteal progress never renders as a fake zero-percent grade");

function assertDependencyOrder(html, lessonAsset) {
  const progressMatch = html.match(/assets\/poker-progress\/progress\.js\?v=[a-z0-9-]+/i);
  const escapedLessonAsset = lessonAsset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lessonMatch = html.match(new RegExp(`${escapedLessonAsset}\\?v=[a-z0-9-]+`, "i"));
  assert.ok(progressMatch, "canonical progress loads with an explicit cache key");
  assert.ok(lessonMatch, `${lessonAsset} loads with an explicit cache key`);
  assert.ok(progressMatch.index < lessonMatch.index, `${lessonAsset} loads after canonical progress`);
}

const rfiHtml = read("rfi-open-position-lesson.html");
const rfi = read("assets/poker-rfi-open-lesson/lesson.js");
assertDependencyOrder(rfiHtml, "assets/poker-rfi-open-lesson/lesson.js");
assert.match(rfi, /ffStartCourseContext=new URLSearchParams\(window\.location\.search\)\.get\('from'\)==='ffstart'/);
assert.match(rfi, /function configureFfStartNavigation\(\)[\s\S]*\/ffstart#program[\s\S]*\/ffstart\/betting-purpose/);
assert.match(rfi, /function reportFfStartPractice\(\)[\s\S]*attempts<25[\s\S]*api\.setResult\('ffstart_rfi-open-position'/);
assert.match(rfi, /attempts:25,correct:correct,score:score,bestScore:score,status:score>=80\?'passed':'repeat'/);
assert.equal((rfi.match(/api\.setResult\('ffstart_rfi-open-position'/g) || []).length, 1, "RFI has one canonical result writer");
assert.match(rfi, /if\(ok\)state\.score\+\+;else state\.miss\+\+;reportFfStartPractice\(\);/);

const bbHtml = read("bb-call-defense-lesson.html");
const bb = read("assets/poker-bb-call-defense-lesson/lesson.js");
assertDependencyOrder(bbHtml, "assets/poker-bb-call-defense-lesson/lesson.js");
assert.match(bb, /FFSTART_COURSE_CONTEXT = new URLSearchParams\(window\.location\.search\)\.get\("from"\) === "ffstart"/);
assert.match(bb, /function configureFfStartNavigation\(\)[\s\S]*\/ffstart#program[\s\S]*\/ffstart\/blind-versus-blind/);
assert.match(bb, /function reportFfStartPractice\(\)[\s\S]*attempts < 21[\s\S]*api\.setResult\("ffstart_bb-call-defense"/);
assert.match(bb, /attempts: 21,[\s\S]*correct: correct,[\s\S]*score: score,[\s\S]*bestScore: score,[\s\S]*status: score >= 78 \? "passed" : "repeat"/);
assert.equal((bb.match(/api\.setResult\("ffstart_bb-call-defense"/g) || []).length, 1, "BB defense has one canonical result writer");
assert.match(bb, /if \(spot\.correct === "raise" && key !== "raise"\) state\.stats\.missedThreeBets \+= 1;\s*reportFfStartPractice\(\);/);

const restealHtml = read("resteal-lesson.html");
const resteal = read("assets/poker-resteal-lesson/lesson.js");
const pack = read("assets/poker-resteal-lesson/simulator-pack.js");
const registry = read("assets/poker-simulator/simulator-practice-packs.js");
assertDependencyOrder(restealHtml, "assets/poker-resteal-lesson/lesson.js");
assert.match(resteal, /practiceHands: FFSTART_COURSE_CONTEXT \? 25 : 10/);
assert.match(resteal, /function configureFfStartNavigation\(\)[\s\S]*\/ffstart#program[\s\S]*\/ffstart\/play-session\?session=short-stack-run/);
assert.match(resteal, /event\.source !== frame\.contentWindow \|\| event\.origin !== window\.location\.origin/);
assert.match(resteal, /message\.schema !== "ffstart-legacy-bridge-v1"[\s\S]*message\.type !== "ffstart:resteal-complete"[\s\S]*message\.run !== state\.courseSessionId[\s\S]*Number\(message\.completedHands\) < 25/);
assert.match(resteal, /run: state\.courseSessionId \|\|/, "resteal passes the exact parent session id into the simulator run");
assert.match(resteal, /api\.setResult\("ffstart_resteal", \{\s*evaluated: false,\s*completed: true,\s*completedHands: 25,\s*targetHands: 25,\s*attempts: 25,\s*status: "passed"\s*\}/);
assert.match(resteal, /metadata: \{ courseContext: true, evaluated: false \}/);
assert.equal((resteal.match(/api\.setResult\("ffstart_resteal"/g) || []).length, 1, "resteal parent has one completion-only writer");
assert.match(pack, /completedHands < 25[\s\S]*root\.parent\.postMessage\([\s\S]*}, targetOrigin\)/);
assert.match(pack, /courseCompletionPosted = true/);
assert.match(registry, /assets\/poker-resteal-lesson\/simulator-pack\.js\?v=20260715-ffstart-handoff-v16/);

for (const html of [rfiHtml, bbHtml, restealHtml]) {
  assert.match(html, /class="lesson-home" href="\/">← В лабораторию<\/a>/, "standalone navigation remains unchanged in source HTML");
}
assert.match(rfiHtml, /href="\/bb-call-defense-lesson">Следующий урок: защита BB →<\/a>/, "standalone RFI continues to BB defense");
assert.match(bbHtml, /href="\/resteal-lesson">Следующий урок: рестил →<\/a>/, "standalone BB defense continues to resteal");
assert.match(restealHtml, /href="\/rfi-open-position-lesson">Начать маршрут заново →<\/a>/, "standalone resteal keeps the laboratory loop");

console.log("PASS FF Start legacy bridge: scoped navigation, canonical completion, same-origin iframe message");
