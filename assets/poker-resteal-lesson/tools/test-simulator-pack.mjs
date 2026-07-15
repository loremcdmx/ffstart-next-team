import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script, createContext } from "node:vm";
import { runSimulatorEngineScripts } from "../../../scripts/simulator-engine-script-list.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const packCss = readFileSync(join(root, "assets/poker-resteal-lesson/simulator-pack.css"), "utf8");
let failures = 0;

function assert(condition, label, detail = "") {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}${detail ? `\n  ${detail}` : ""}`);
}

function seededMath(seed = 0x51eed) {
  let value = seed >>> 0;
  const math = Object.create(Math);
  math.random = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
  return math;
}

function loadPackHarness() {
  const postedMessages = [];
  const documentRef = {
    documentElement: { dataset: {} },
    readyState: "loading",
    addEventListener() {},
    querySelector() { return null; }
  };
  const windowRef = {
    location: { search: "?embedded=1&practice=resteal&hands=25&run=course-test", origin: "https://ff.test" },
    parent: { postMessage(payload, targetOrigin) { postedMessages.push({ payload, targetOrigin }); } },
    document: documentRef,
    setInterval,
    clearInterval,
    addEventListener() {}
  };
  const context = createContext({
    console,
    Math: seededMath(),
    URLSearchParams,
    setInterval,
    clearInterval,
    document: documentRef,
    window: windowRef,
    globalThis: {}
  });
  const profile = readFileSync(join(root, "assets/poker-kit/simulator/bot-strategy-profile.js"), "utf8");
  new Script(profile).runInContext(context);
  runSimulatorEngineScripts({ root, context, Script });
  const adviceSource = readFileSync(join(root, "assets/poker-resteal-lesson/advice.js"), "utf8");
  new Script(adviceSource).runInContext(context);
  const registrySource = readFileSync(join(root, "assets/poker-simulator/simulator-practice-packs.js"), "utf8");
  new Script(registrySource).runInContext(context);
  const packSource = readFileSync(join(root, "assets/poker-resteal-lesson/simulator-pack.js"), "utf8");
  new Script(packSource).runInContext(context);
  return {
    engine: context.window.PokerSimulatorEngine,
    pack: context.window.PokerRestealSimulatorPack,
    advice: context.window.PokerRestealAdvice,
    parts: context.window.PokerSimulatorEngineParts,
    document: documentRef,
    postedMessages
  };
}

function loadBrowserKit(relativePath, globalName, windowExtras = {}) {
  const windowRef = { ...windowExtras };
  const context = createContext({
    console,
    window: windowRef,
    globalThis: windowRef,
    module: { exports: {} }
  });
  const source = readFileSync(join(root, relativePath), "utf8");
  new Script(source, { filename: relativePath }).runInContext(context);
  return context.window[globalName] || context.module.exports;
}

const { engine, pack, advice, parts, document: packDocument, postedMessages } = loadPackHarness();
assert(pack.postCourseCompletion(24) === false && postedMessages.length === 0, "course completion is not posted before 25 played hands");
assert(pack.postCourseCompletion(25) === true && postedMessages.length === 1, "course completion is posted once at 25 played hands");
assert(pack.postCourseCompletion(30) === false && postedMessages.length === 1, "course completion bridge is one-shot per simulator run");
assert(postedMessages[0].targetOrigin === "https://ff.test", "course completion uses the exact same-origin postMessage target");
assert(postedMessages[0].payload.schema === "ffstart-legacy-bridge-v1" && postedMessages[0].payload.type === "ffstart:resteal-complete" && postedMessages[0].payload.completedHands === 25, "course completion payload has the verified bridge contract");
const settings = pack.applyBootSettings({
  difficulty: "standard",
  botLineup: "mixed",
  botStrategyPool: "auto",
  botPack: "hidden-archetypes",
  stakesLevel: "mid"
});

assert(/seat-action-badge:not\(\.is-lobby-state\)[^{]*\{[^}]*min-height:\s*28px[^}]*font-size:\s*clamp\(15px,\s*calc\(11px \* var\(--sim-stage-inverse-scale,\s*1\)\),\s*20px\)/.test(packCss), "practice opponent action badges compensate for iframe scaling");
assert(!/seat-cards\.is-hidden:not\(\.is-empty\) \.sim-card-back[^{]*\{[^}]*(?:width|height)\s*:/.test(packCss), "practice opponent card backs inherit shared simulator sizing");
assert(!/seat-zone-(?:top|bottom|left|right)[^{]*\{[^}]*--seat-cards-(?:t|d)[xy]/.test(packCss), "practice pack leaves card coordinates to the shared seat-slot model");
assert(!packCss.includes("seat-cards:is(.is-revealed"), "practice preserves the simulator's phase-specific revealed-card sizes");
assert(/client-controls:has\(\.bet-widget\) > \.bet-widget[^{]*\{[^}]*width:\s*100%[^}]*min-width:\s*0/.test(packCss), "practice bet widget fills the widened action dock on every street");
assert(/bet-widget\.is-preflop-amount \.bet-preset,[\s\S]*?bet-widget\.is-postflop-percent \.bet-preset[^{]*\{[^}]*min-height:\s*68px[^}]*font-size:\s*clamp\(21px,\s*calc\(15px \* var\(--sim-stage-inverse-scale,\s*1\)\),\s*30px\)/.test(packCss), "practice bet presets restore height and compensate typography for stage downscaling");
assert(packCss.includes("--resteal-slider-thumb: clamp(28px, calc(20px * var(--sim-stage-inverse-scale, 1)), 40px)"), "practice slider thumb keeps a readable physical target");

function contextForTip(tip) {
  const context = { entryId: `fixture:${tip.id}`, handNo: 1 };
  Object.entries(tip.when || {}).forEach(([rawKey, expected]) => {
    const boundary = rawKey.match(/^(.*?)(Min|Max)$/);
    const key = boundary ? boundary[1] : rawKey;
    context[key] = Array.isArray(expected) ? expected[0] : expected;
  });
  return context;
}

assert(advice.TIPS.length === 50, "advice catalog contains exactly 50 tips");
assert(new Set(advice.TIPS.map((tip) => tip.id)).size === 50, "all advice ids are unique");
assert(new Set(advice.TIPS.map((tip) => `${tip.title}|${tip.copy}`)).size === 50, "all advice messages are distinct");
advice.TIPS.forEach((tip) => {
  const context = contextForTip(tip);
  assert(advice.matchesTip(tip, context), `advice ${tip.id} is reachable from its declared context`);
  const matches = advice.matchingTips(context);
  const usage = Object.fromEntries(matches.map((candidate) => [candidate.id, candidate.id === tip.id ? 0 : 10]));
  assert(advice.selectTip(context, { usage, lastIds: [], lastFamily: "" }, "reachability")?.id === tip.id, `advice ${tip.id} can be selected`);
});
const deterministicContext = {
  entryId: "deterministic:1",
  handNo: 1,
  heroAction: "jam",
  response: "fold",
  spotType: "single-open",
  openerGroup: ["trash"],
  openerPosition: "BTN",
  openerCombo: "83o",
  openSizeBb: 2,
  effectiveStackBb: 30,
  bankBb: 4.5,
  unequalStacks: false,
  sessionFoldsToJam: 1
};
const deterministicFirst = advice.selectTip(deterministicContext, { usage: {}, lastIds: [], lastFamily: "" }, "same-seed");
const deterministicSecond = advice.selectTip(deterministicContext, { usage: {}, lastIds: [], lastFamily: "" }, "same-seed");
assert(deterministicFirst?.id === deterministicSecond?.id, "the same hand context always selects the same advice");
const alternate = advice.selectTip(deterministicContext, {
  usage: { [deterministicFirst.id]: 1 },
  lastIds: [deterministicFirst.id],
  lastFamily: deterministicFirst.family
}, "same-seed");
assert(alternate && alternate.id !== deterministicFirst.id && alternate.family !== deterministicFirst.family, "advice avoids the recent id and family when an alternative exists");
const qjoTip = advice.selectTip({
  entryId: "qjo:called-win",
  heroAction: "jam",
  response: "call",
  outcome: "win",
  spotType: "single-open",
  heroCombo: "QJo",
  heroGroup: ["broadway", "strong"],
  callerGroup: ["strong"],
  callerCombo: "A9o",
  botTier: "blue",
  equityPct: 0.34
}, { usage: {}, lastIds: [], lastFamily: "" }, "qjo");
assert(qjoTip?.id === "called-win-qjo-model", "the specific QJo explanation wins over generic called-win advice");

const greenPairTip = advice.selectTip({
  entryId: "green:66",
  heroAction: "jam",
  response: "call",
  outcome: "loss",
  spotType: "single-open",
  heroCombo: "65s",
  heroGroup: ["connector", "marginal"],
  callerCombo: "66",
  callerGroup: ["pair", "marginal"],
  botTier: "green",
  equityPct: 0.42
}, { usage: {}, lastIds: [], lastFamily: "" }, "green-66");
assert(greenPairTip?.id === "green-call-pair", "a green bot calling 66 is described as a normal pair call, not an optimistic call");

for (const callerCombo of ["JTs", "KJs", "QTs", "JTo", "KJo"]) {
  const optimisticTip = advice.selectTip({
    entryId: `green:${callerCombo}`,
    heroAction: "jam",
    response: "call",
    outcome: "loss",
    spotType: "single-open",
    heroCombo: "65s",
    heroGroup: ["connector", "marginal"],
    callerCombo,
    callerGroup: ["broadway", "marginal"],
    botTier: "green",
    equityPct: 0.4
  }, { usage: {}, lastIds: [], lastFamily: "" }, `green-${callerCombo}`);
  assert(
    optimisticTip?.id === "green-call-broadway",
    `a green bot calling ${callerCombo} triggers the optimistic unpaired-call advice`
  );
}

assert(settings.pack === pack.packKey, "lesson boot selects the resteal pack");
assert(settings.playerCount === 6 && settings.tableCount === 1, "lesson boot locks one six-max table");
assert(settings.randomStackMinBb === 25 && settings.randomStackMaxBb === 40, "lesson boot locks the 25-40 BB window");
assert(settings.bigBlindAnteBb === 1 && settings.anteBb === 0, "lesson boot uses a real 1 BB big-blind ante");
assert(settings.demoMode && !settings.manualNextHand, "lesson boot suppresses product progress and keeps native auto-deal enabled");
assert(settings.continueAfterBust && settings.uiScale === "xl", "lesson boot resets busted stacks and uses the largest simulator UI scale");
assert(settings.handTempo === "fast" && settings.turboMode, "lesson boot uses the simulator's fast hand tempo");
assert(!("simulatorStageProfile" in packDocument.documentElement.dataset), "lesson pack keeps the simulator's native stage profile");

const stageDocument = {
  documentElement: { dataset: {}, style: { setProperty() {}, getPropertyValue() { return ""; } } },
  readyState: "loading",
  addEventListener() {}
};
const stageKit = loadBrowserKit("assets/poker-simulator/simulator-stage.js", "PokerSimulatorStage", {
  document: stageDocument,
  getComputedStyle: () => ({ paddingLeft: "0", paddingRight: "0", paddingTop: "0", paddingBottom: "0" })
});
const stageGrid = { dataset: { count: "1" }, classList: { contains: () => false } };
const stageShell = { style: {} };
const stage = { style: {}, dataset: {}, querySelector: () => stageGrid };
const stageWorkspace = { getBoundingClientRect: () => ({ width: 1920, height: 1080 }) };
stageKit.syncStage(stageShell, stage, stageWorkspace);
assert(stage.style.width === "1920px" && stage.style.height === "1080px" && stage.style.transform === "scale(1)", "lesson practice uses the simulator's native 1920x1080 design plane");

const shortBbAnteTable = parts.createTable({
  id: 88,
  settings: {
    ...settings,
    simulationMode: "fixed",
    stackDepth: 1.5,
    autoStart: false
  },
  handNo: 1,
  testHeroPosition: "BB"
});
const shortBbHero = shortBbAnteTable.seats.find((seat) => seat.isHero);
const shortBbLiveBlind = Number(shortBbAnteTable.handContributions?.[shortBbHero?.id] || 0)
  + Number(shortBbAnteTable.contributions?.[shortBbHero?.id] || 0);
assert(
  shortBbHero
    && shortBbLiveBlind === 1
    && shortBbAnteTable.anteContributions[shortBbHero.id] === 0.5,
  "a short BB posts its live blind before the remaining stack becomes BB ante",
  JSON.stringify({ stack: shortBbHero?.stack, hand: shortBbAnteTable.handContributions, street: shortBbAnteTable.contributions, ante: shortBbAnteTable.anteContributions })
);

for (const total of [10, 25, 50, 100]) {
  const plans = Array.from({ length: total }, (_, index) => pack.planForHand(index + 1));
  const trickCount = plans.filter((plan) => plan.trick).length;
  assert(trickCount === Math.floor(total / 4), `${total}-hand queue keeps the one-in-four attention-check quota`);
  assert(plans.every((plan, index) => !plan.trick || index === 3 || !plans[index - 1]?.trick), `${total}-hand queue never puts attention checks back-to-back`);
}

const hands = Array.from({ length: 100 }, (_, index) => engine.createTable({
  id: 1,
  settings,
  handNo: index + 1
}));

assert(hands.every((table) => table.status === "playing" && table.heroTurn), "every queued hand reaches a legal Hero decision");
assert(hands.every((table) => table.heroPosition === "BB"), "Hero is always seated on the big blind");
assert(hands.every((table) => table.anteMode === "big-blind" && table.anteTotal === 1), "every hand posts exactly one BB ante");
assert(hands.every((table) => {
  const hero = table.seats.find((seat) => seat.isHero);
  return hero && table.anteContributions[hero.id] === 1;
}), "the ante is charged to the BB seat, not split across the table");
assert(hands.every((table) => table.restealDrill.actual.kind === table.restealDrill.target.kind), "engine-generated action lines match the planned scenario kind");
assert(hands.every((table) => !table.restealDrill.target.opener || table.restealDrill.actual.opener === table.restealDrill.target.opener), "core hands use the planned CO/BTN opener");
assert(new Set(hands.map((table) => table.combo)).size === hands.length, "even the 100-hand demo does not repeat Hero combos");

const first = hands[0];
assert(first.restealDrill.actual.opener === "BTN" && first.pot === first.currentBet + 2.5, "clean BTN open includes SB, BB and 1 BB ante only");
const handLogKit = loadBrowserKit("assets/poker-simulator/simulator-hand-log.js", "PokerSimulatorHandLog", {
  PokerSimulatorSessionGraph: {}
});
const rawAdviceSnapshot = engine.snapshotHandHistory(first);
const sanitizedAdviceSnapshot = handLogKit.sanitizeHandHistory(rawAdviceSnapshot);
assert(rawAdviceSnapshot?.restealAdvice?.openerCombo, "pack derives the opener combo while the completed table still has the cards");
assert(
  sanitizedAdviceSnapshot?.restealAdvice?.openerCombo === rawAdviceSnapshot.restealAdvice.openerCombo
    && sanitizedAdviceSnapshot.seats.filter((seat) => !seat.isHero).every((seat) => seat.cards.length === 0),
  "real hand-log sanitizer preserves the derived advice context without persisting opponent hole cards"
);
const actualJamTable = engine.createTable({ id: 7, settings, handNo: 101 });
const actualJamStart = engine.startHeroAction(actualJamTable, "allin", settings);
if (actualJamStart.needsBot) engine.resolveBotAction(actualJamTable, actualJamStart.heroAction, actualJamStart.heroAmount, settings);
const actualJamHistory = handLogKit.sanitizeHandHistory(engine.snapshotHandHistory(actualJamTable));
const actualJamWon = actualJamTable.status === "won" || actualJamTable.resultKind === "won";
const actualJamEntry = {
  id: `actual:101:${actualJamTable.id}`,
  sessionId: "actual",
  handNo: 101,
  tableId: actualJamTable.id,
  settings: { pack: "resteal-bb-demo" },
  hero: { combo: actualJamTable.combo, hand: actualJamTable.heroHand },
  result: {
    outcome: actualJamTable.resultKind === "split" ? "split" : actualJamWon ? "win" : "loss",
    won: actualJamWon,
    showdown: Boolean(actualJamHistory.showdown || actualJamHistory.allInRunout),
    netBb: 0
  },
  handHistory: actualJamHistory
};
const actualJamPayload = {
  sessionId: "actual",
  handLog: [actualJamEntry],
  decisions: [{ no: 101, tableId: actualJamTable.id, street: "Preflop", action: "allin" }]
};
const actualJamContext = pack.buildPostHandContext(actualJamPayload, actualJamEntry, {
  hands: 1,
  jams: 1,
  folds: actualJamHistory.allInRunout ? 0 : 1,
  netBb: 0,
  evNetBb: 0
}, [actualJamEntry]);
assert(
  actualJamTable.status !== "playing"
    && ["fold", "call"].includes(actualJamContext?.response)
    && actualJamContext?.openerCombo,
  "a real engine jam reaches a terminal result and produces advice-ready context"
);
const trickKinds = hands.filter((table) => table.restealDrill.target.trick).map((table) => table.restealDrill.actual.kind);
assert(trickKinds.includes("early-open") && trickKinds.includes("open-call") && trickKinds.includes("limp"), "attention checks rotate early open, open-call and limp");

const walkLikeTable = {
  seats: [],
  currentBet: 1,
  pot: 2.5,
  canCheck: true,
  actionTimeline: [{ phase: "action", street: "preflop", botReason: "forced live spot" }]
};
const naturalLimpTable = {
  ...walkLikeTable,
  actionTimeline: [{ phase: "action", street: "preflop", seatId: 4, botReason: "93o fish complete" }]
};
assert(pack.classify(walkLikeTable).kind !== "limp", "a forced walk is not mislabeled as a limp attention check");
assert(pack.classify(naturalLimpTable).kind === "limp", "a real limp/complete action is recognized as the limp attention check");

const metricPayload = {
  sessionId: "lesson-session",
  handLog: [
    {
      id: "lesson-session:1:1",
      sessionId: "lesson-session",
      settings: { pack: "resteal-bb-demo" },
      result: { won: true, showdown: false, netBb: 4.5 },
      handHistory: { actions: [{ phase: "action", street: "preflop", seatId: 0, label: "All-in 30 BB" }] }
    },
    {
      id: "lesson-session:2:1",
      sessionId: "lesson-session",
      settings: { pack: "resteal-bb-demo" },
      result: { won: false, showdown: true, netBb: -30 },
      handHistory: {
        actions: [{ phase: "action", street: "preflop", seatId: 0, label: "All-in 28 BB" }],
        showdown: { winners: [1] },
        allInRunout: { stages: [{ sampled: true }] }
      }
    },
    {
      id: "lesson-session:3:1",
      sessionId: "lesson-session",
      settings: { pack: "resteal-bb-demo" },
      result: { won: true, showdown: true, netBb: 7 },
      handHistory: { actions: [{ phase: "action", street: "preflop", seatId: 0, label: "Call 1 BB" }], showdown: { winners: [0] } }
    },
    {
      id: "other:1:1",
      sessionId: "other",
      settings: { pack: "resteal-bb-demo" },
      result: { won: true, netBb: 99 },
      handHistory: { actions: [{ phase: "action", street: "preflop", seatId: 0, label: "All-in" }] }
    }
  ]
};
const lessonMetrics = pack.sessionDrillMetrics(metricPayload, {
  aggregatePokerStats(entries) {
    return { netBb: entries.reduce((sum, entry) => sum + entry.result.netBb, 0), evNetBb: 3.2 };
  }
});
assert(lessonMetrics.hands === 3 && lessonMetrics.jams === 2, "HUD metrics count completed current-session hands and actual engine jams");
assert(lessonMetrics.folds === 1, "HUD metrics count an immediate fold win after Hero jams");
assert(lessonMetrics.netBb === -18.5 && lessonMetrics.evNetBb === 3.2 && lessonMetrics.sampled, "HUD separates factual result from sampled all-in equity result");

const trashFoldEntry = {
  id: "lesson-session:4:1",
  sessionId: "lesson-session",
  handNo: 4,
  tableId: 1,
  settings: { pack: "resteal-bb-demo" },
  hero: { combo: "A5s", hand: ["As", "5s"] },
  result: { outcome: "win", won: true, showdown: false, netBb: 4.5 },
  handHistory: {
    stackDepth: 30,
    combo: "A5s",
    board: [],
    actions: [{ phase: "action", street: "preflop", seatId: 0, label: "All-in 30 BB" }],
    restealAdvice: {
      spotType: "single-open",
      openerPosition: "BTN",
      openerName: "Balance",
      openerCombo: "83o",
      openerGroups: ["trash"],
      openerTier: "blue",
      bankBeforeHeroBb: 4.5,
      openSizeBb: 2,
      effectiveStackBb: 30,
      unequalStacks: false
    }
  }
};
const trashFoldPayload = {
  sessionId: "lesson-session",
  handLog: [trashFoldEntry],
  decisions: [{ no: 4, tableId: 1, street: "Preflop", action: "allin", amount: null }]
};
const trashFoldContext = pack.buildPostHandContext(trashFoldPayload, trashFoldEntry, {
  hands: 1, jams: 1, folds: 1, netBb: 4.5, evNetBb: 4.5
}, [trashFoldEntry]);
assert(
  trashFoldContext?.heroAction === "jam"
    && trashFoldContext.response === "fold"
    && trashFoldContext.openerCombo === "83o"
    && trashFoldContext.openerGroup.includes("trash"),
  "post-hand context recognizes a jam that folded out opener trash"
);
assert(
  advice.selectTip(trashFoldContext, { usage: {}, lastIds: [], lastFamily: "" }, "trash-fold")?.id === "fold-trash-theft",
  "trash folded to a resteal produces the concrete blind-theft explanation"
);

const greenCallEntry = {
  id: "lesson-session:5:1",
  sessionId: "lesson-session",
  handNo: 5,
  tableId: 1,
  settings: { pack: "resteal-bb-demo" },
  hero: { combo: "65s", hand: ["6s", "5s"] },
  result: { outcome: "loss", won: false, showdown: true, netBb: -30 },
  handHistory: {
    stackDepth: 30,
    combo: "65s",
    board: ["2c", "8d", "Kh", "4s", "Td"],
    actions: [{ phase: "action", street: "preflop", seatId: 0, label: "All-in 30 BB" }],
    allInRunout: {
      stages: [{ handEquities: [{ seatId: 0, isHero: true, equity: 0.36 }, { seatId: 4, isHero: false, equity: 0.64 }] }]
    },
    restealAdvice: {
      spotType: "single-open",
      openerPosition: "BTN",
      openerName: "Noda",
      openerCombo: "JTo",
      openerGroups: ["strong", "broadway"],
      callerCombo: "JTo",
      callerGroups: ["strong", "broadway"],
      callerTier: "green",
      bankBeforeHeroBb: 4.5,
      openSizeBb: 2,
      effectiveStackBb: 30,
      unequalStacks: false
    }
  }
};
const greenCallPayload = {
  sessionId: "lesson-session",
  handLog: [greenCallEntry],
  decisions: [{ no: 5, tableId: 1, street: "Preflop", action: "allin", amount: null }]
};
const greenCallContext = pack.buildPostHandContext(greenCallPayload, greenCallEntry, {
  hands: 1, jams: 1, folds: 0, netBb: -30, evNetBb: -6.9
}, [greenCallEntry]);
assert(
  greenCallContext?.response === "call"
    && greenCallContext.botTier === "green"
    && greenCallContext.callerCombo === "JTo"
    && greenCallContext.heroGroup.includes("connector"),
  "post-hand context recognizes an optimistic green-bot call against a vulnerable connector"
);
assert(
  advice.selectTip(greenCallContext, { usage: {}, lastIds: [], lastFamily: "" }, "green-call")?.id === "green-call-broadway",
  "green JTo call surfaces the robust-hands adjustment before generic variance advice"
);
assert(pack.buildPostHandContext(trashFoldPayload, { ...trashFoldEntry, result: null }) === null, "an incomplete hand log is not consumed as an advice event");
assert(
  pack.heroPreflopJam(
    { handHistory: { stackDepth: 30, actions: [{ street: "preflop", seatId: 0, label: "Raise to 30 BB" }] } },
    { street: "Preflop", action: "raise-custom", amount: 30 }
  ),
  "HUD recognizes a max-slider raise as a jam from the recorded decision fallback"
);
const greenPairEntry = {
  id: "lesson-session:66:1",
  sessionId: "lesson-session",
  handNo: 66,
  tableId: 1,
  settings: { pack: "resteal-bb-demo" },
  hero: { combo: "65s" },
  result: { won: false, showdown: true, outcome: "loss", netBb: -30 },
  handHistory: {
    stackDepth: 30,
    restealAdvice: {
      schema: "poker-resteal-advice-hand-v1",
      spotType: "single-open",
      openerPosition: "BTN",
      openerName: "Зелёный тест",
      openerCombo: "JTo",
      openerGroups: pack.handGroups("JTo"),
      openerTier: "green",
      callerCombo: "66",
      callerGroups: pack.handGroups("66"),
      callerTier: "green",
      heroCombo: "65s",
      heroGroups: pack.handGroups("65s"),
      openSizeBb: 2,
      bankBeforeHeroBb: 4.5,
      effectiveStackBb: 30,
      unequalStacks: false
    },
    actions: [{ phase: "action", street: "preflop", seatId: 0, label: "All-in 30 BB" }],
    allInRunout: {
      stages: [{ handEquities: [{ seatId: 0, isHero: true, equity: 0.42 }] }]
    }
  }
};
const greenPairPayload = {
  sessionId: "lesson-session",
  handLog: [greenPairEntry],
  decisions: [{ no: 66, tableId: 1, street: "Preflop", action: "allin" }]
};
const greenPairContext = pack.buildPostHandContext(greenPairPayload, greenPairEntry, {
  hands: 1,
  jams: 1,
  folds: 0,
  netBb: -30,
  evNetBb: -4.8
}, [greenPairEntry]);
assert(
  greenPairContext?.callerGroup?.includes("pair")
    && advice.selectTip(greenPairContext, { usage: {}, lastIds: [], lastFamily: "" }, "integrated-green-66")?.id === "green-call-pair",
  "the post-hand context keeps green 66 on the neutral pair branch"
);
assert(pack.foldedHandKind(["8h", "3c"]) === "trash", "wisdom recognizes the first trash hand folded to a jam");
assert(pack.foldedHandKind(["7h", "7c"]) === "normal" && pack.foldedHandKind(["Ks", "Js"]) === "normal", "wisdom recognizes pairs and KJs as respectable folds");
assert(
  pack.strongCalledHand({ handHistory: { seats: [{ isHero: true, cards: ["Qh", "Jd"] }, { isHero: false, folded: false, cards: ["As", "Kh"] }] } }) === "AKo",
  "wisdom recognizes a win after running into the top of the calling range"
);
assert(
  pack.greenCallerHand({ handHistory: { seats: [{ isHero: true }, { isHero: false, folded: false, cards: ["9s", "8s"], profile: { difficulty: "easy", style: "station" } }] } }) === "98s",
  "wisdom recognizes an optimistic call from a green weak bot"
);

const bbAnteSettlement = {
  id: 901,
  handNo: 1,
  pot: 59,
  potAwarded: false,
  anteMode: "big-blind",
  bigBlindAnteBb: 1,
  handContributions: { 0: 29, 1: 29 },
  contributions: {},
  anteContributions: { 0: 1 },
  seats: [
    { id: 0, stack: 0, folded: false },
    { id: 1, stack: 0, folded: false }
  ]
};
engine.settlePots(bbAnteSettlement, [[1], [0]]);
assert(
  bbAnteSettlement.seats[0].stack === 0 && bbAnteSettlement.seats[1].stack === 59,
  "a losing BB does not receive its ante back as an uncalled over-shove",
  JSON.stringify(bbAnteSettlement.seats)
);

const actionControlsKit = loadBrowserKit("assets/poker-simulator/simulator-action-controls.js", "PokerSimulatorActionControls", {
  PokerSimulatorPracticePacks: {
    sessionCompleteAction: () => ({ action: "resteal-play-again", label: "Сыграть ещё" }),
    decisionClass: () => ""
  }
});
const completedState = { settings: { manualNextHand: false, continueAfterBust: true, sessionHandLimit: 2, pack: "resteal-bb-demo" }, history: [{}, {}] };
const completedActions = actionControlsKit.model({ getState: () => completedState }).renderActions({ status: "won" });
assert(/Сессия завершена · 2 из 2/.test(completedActions), "terminal controls stop exactly at the selected session length");
assert(/data-action="resteal-play-again"[^>]*>Сыграть ещё</.test(completedActions), "terminal controls offer an in-frame session restart");
const continuingState = { settings: { manualNextHand: true, sessionHandLimit: 2 }, history: [{}] };
const continuingActions = actionControlsKit.model({ getState: () => continuingState }).renderActions({ status: "won" });
assert(/Следующая раздача/.test(continuingActions), "terminal controls offer a manual next hand before the limit");
const bustedAutoState = { settings: { manualNextHand: false, continueAfterBust: true, sessionHandLimit: 2 }, history: [{}] };
const bustedAutoActions = actionControlsKit.model({
  getState: () => bustedAutoState,
  heroBusted: () => true,
  renderAutoDealCountdown: () => '<span data-auto-countdown>Авто</span>'
}).renderActions({ status: "lost" });
assert(/data-auto-countdown/.test(bustedAutoActions) && !/restart-tournament/.test(bustedAutoActions), "isolated drill auto-deals a fresh stack after Hero busts");

const autoDealKit = loadBrowserKit("assets/poker-simulator/simulator-auto-deal.js", "PokerSimulatorAutoDeal");
const bustedTable = { id: 1, handNo: 1, status: "lost", tournamentComplete: false };
let autoDealCallback = null;
let autoDealReplacements = 0;
const autoDeal = autoDealKit.model({
  getState: () => ({ settings: { manualNextHand: false, continueAfterBust: true }, tables: [bustedTable] }),
  getTable: () => bustedTable,
  replaceTable: () => { autoDealReplacements += 1; },
  heroBusted: () => true,
  windowRef: {
    setTimeout(callback) { autoDealCallback = callback; return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {}
  }
});
autoDeal.queueNextHandIfNeeded(bustedTable);
autoDealCallback?.();
assert(bustedTable.autoQueued && autoDealReplacements === 1, "native auto-deal replaces a busted isolated-drill table without a second click handler");

const lifecycleKit = loadBrowserKit("assets/poker-simulator/simulator-table-lifecycle.js", "PokerSimulatorTableLifecycle");
const lifecycleState = {
  settings: { sessionHandLimit: 2, tableCount: 1, pack: "resteal-bb-demo", setupCompleted: true },
  history: [{}, {}],
  tables: [{ id: 1, status: "won" }],
  started: false,
  activeTableId: 1
};
let lifecycleCreateCalls = 0;
const lifecycle = lifecycleKit.model({
  state: lifecycleState,
  engine: {
    PACKS: { "resteal-bb-demo": { playableWeight: 1, spots: [{}] } },
    createTable() {
      lifecycleCreateCalls += 1;
      return { id: 1, status: "playing", seats: [] };
    }
  },
  isSupportedPack: () => true
});
assert(lifecycle.dealNextAllTables() === false && lifecycleCreateCalls === 0, "public new-hand flow cannot deal hand N+1 after the session limit");
assert(lifecycle.replaceTable(1) === false && lifecycleCreateCalls === 0, "table replacement cannot deal hand N+1 after the session limit");

const appLaunchSource = readFileSync(join(root, "assets/poker-simulator/simulator-app-launch.js"), "utf8");
assert(/if \(!state\.settings\?\.demoMode\) syncPendingSessionArchives\(\);/.test(appLaunchSource), "demo launch does not sync pending backend archives");
const simulatorBootSource = readFileSync(join(root, "assets/poker-simulator/simulator-boot.js"), "utf8");
assert(/function hydrateExternalPacks\(\) \{[\s\S]*?if \(current\.settings\?\.demoMode\) return;/.test(simulatorBootSource), "file demo skips the external pack fetch");

let telemetryCalls = 0;
const telemetryKit = loadBrowserKit("assets/poker-simulator/simulator-telemetry.js", "PokerSimulatorTelemetry", {
  FFTrainerEvents: { send() { telemetryCalls += 1; } }
});
const telemetry = telemetryKit.model({ getState: () => ({ settings: { demoMode: true } }) });
assert(telemetry.sendSimulatorTelemetry("trainer_decision", {}) === null && telemetryCalls === 0, "demo mode suppresses trainer telemetry");

if (failures) process.exitCode = 1;
else console.log("Resteal simulator pack smoke passed.");
