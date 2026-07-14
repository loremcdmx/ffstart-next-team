import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const slots = require(resolve(repo, "assets/poker-simulator/simulator-seat-slots.js"));

assert.equal(slots.dimensionsFor({ tier: "T4", viewport: "FHD", playerCount: 9 }).revealCardTuckFraction, 0.2);

for (const tier of ["T1", "T2", "T4"]) {
  for (const viewport of ["FHD", "QHD"]) {
    for (let playerCount = 2; playerCount <= 9; playerCount += 1) {
      const layout = slots.layoutTable({ tier, viewport, uiScale: "standard", playerCount, phase: "finished-reveal", dealerSeatId: 1 });
      const separation = layout.revealCardSeparation;
      assert.equal(separation.placements.length, playerCount - 1, `${tier}/${viewport}/P${playerCount} exports one placement per opponent`);
      assert.equal(separation.residualPairs.length, 0, `${tier}/${viewport}/P${playerCount} has no unresolved reveal pair`);
      const boxes = new Map(layout.rects.filter((rect) => rect.kind === "box").map((rect) => [Number(rect.seatId), rect]));
      const resolved = new Map(separation.resolvedCards.map((entry) => [Number(entry.seatId), entry]));
      for (const placement of separation.placements) {
        const box = boxes.get(Number(placement.seatId));
        const card = resolved.get(Number(placement.seatId));
        assert(box && card, "placement keeps an owner and rendered card");
        assert(Math.abs((card.center.x - box.center.x) - placement.tx) < 0.002);
        assert(Math.abs((card.center.y - box.center.y) - placement.ty) < 0.002);
        assert(card.left >= -0.001 && card.top >= -0.001 && card.right <= 100.001 && card.bottom <= 100.001, "revealed cards stay inside the felt");
        const inwardX = 50 - box.center.x;
        const inwardY = 50 - box.center.y;
        assert(placement.tx * inwardX + placement.ty * inwardY > 0, "revealed cards open inward when the outer edge has no room");
      }
    }
  }
}

// The product promise is about the visible pocket, not the configuration
// token: 20% of the full card depth must sit under its rendered owner panel.
const topFixture = slots.layoutTable({
  tier: "T4",
  viewport: "FHD",
  uiScale: "standard",
  playerCount: 6,
  phase: "finished-reveal",
  dealerSeatId: 1
});
const topCard = topFixture.revealCardSeparation.resolvedCards.find((card) => card.zone === "top");
const topOwner = topFixture.rects.find((rect) => rect.kind === "box" && Number(rect.seatId) === Number(topCard?.seatId));
const topDimensions = slots.dimensionsFor({ tier: "T4", viewport: "FHD", uiScale: "standard", playerCount: 6 });
assert(topCard && topOwner, "T4/FHD/P6 has a top-center revealed hand");
const renderedOwnerHeight = Number(topDimensions.renderedRevealSeatBox?.h || topOwner.size.h);
const renderedOwnerBottom = topOwner.center.y + renderedOwnerHeight / 2;
const topOverlap = Math.max(0, Math.min(renderedOwnerBottom, topCard.bottom) - topCard.top);
const topOverlapRatio = topOverlap / topCard.size.h;
assert(topCard.center.y > topOwner.center.y, "top-center cards open down the felt, never above the iframe");
assert(Math.abs(topCard.center.x - topOwner.center.x) < 0.002, "top-center cards remain centered on their owner");
assert(
  topOverlapRatio >= 0.17 && topOverlapRatio <= 0.23,
  `top-center rendered pocket is 17-23% of the full card depth (actual ${(topOverlapRatio * 100).toFixed(1)}%)`
);

// Compact snapshot consumer: render a real answered spot and require every
// exported final placement to arrive in the generated inline CSS verbatim.
const snapshotContext = { innerWidth: 1280 };
snapshotContext.window = snapshotContext;
snapshotContext.globalThis = snapshotContext;
const browserAssets = new URL("../../", import.meta.url);
for (const path of [
  "poker-kit/decks/deck-library.js",
  "poker-kit/chips/chip-library.js",
  "poker-simulator/simulator-board-render.js",
  "poker-simulator/simulator-seat-slots.js",
  "poker-simulator/simulator-seat-renderer.js",
  "poker-simulator/simulator-table-renderer.js",
  "poker-trainer-shell/simulator-snapshot.js"
]) {
  runInNewContext(readFileSync(new URL(path, browserAssets), "utf8"), snapshotContext, { filename: path });
}
const compactSpot = {
  id: "reveal-placement-consumer",
  table: {
    seats: ["BB", "UTG", "HJ", "CO", "BTN", "SB"].map((label, index) => ({
      label,
      state: index === 0 ? "hero" : "waiting",
      stackBb: 40,
      cards: index === 0 ? [] : [index % 2 ? "Ah" : "Ks", index % 2 ? "2c" : "7d"],
      revealCardsAfterAnswer: index !== 0
    })),
    heroPosition: "BB",
    dealerPosition: "BB",
    heroStack: "40 BB",
    pot: "2.5 BB",
    heroCards: ["Qh", "Jd"],
    street: "preflop",
    actionLine: []
  },
  options: [{ key: "fold", label: "Пас", correct: true }]
};
const compactHtml = snapshotContext.FFTrainerSimulatorSnapshot.renderTable(compactSpot, { answered: true, selectedKey: "fold" });
const compactLayout = slots.layoutTable({ tier: "T1", viewport: "FHD", uiScale: "auto", playerCount: 6, phase: "finished-reveal", dealerSeatId: 0, tolerance: 0.3 });
for (const placement of compactLayout.revealCardSeparation.placements) {
  assert(
    compactHtml.includes(`--reveal-card-tx:${placement.tx}cqw`) && compactHtml.includes(`--reveal-card-ty:${placement.ty}cqh`),
    `snapshot consumes final placement for seat ${placement.seatId}`
  );
}

// Full renderer consumer: capture the public seat-slot callback passed to the
// shared renderer and compare its variables with the same final placements.
let fullSeatSlotContext = null;
const noLegacyGeometry = {
  seatPoint: () => ({ x: 50, y: 50 }),
  usesDenseTableGeometry: () => false,
  usesWideTableGeometry: () => false,
  compactSeatBetPoint: () => ({ x: 50, y: 50 }),
  activeSeatBetPoint: () => ({ x: 50, y: 50 }),
  blindSeatBetPoint: () => ({ x: 50, y: 50 }),
  clampBetPoint: (point) => point,
  actionPoint: () => ({ x: 50, y: 50 }),
  seatZone: () => "mid",
  heroBetTarget: () => ({ x: 50, y: 50 })
};
const fullState = { settings: { tableCount: 4, playerCount: 6, uiScale: "standard" }, tables: [] };
const fullAdapter = require(resolve(repo, "assets/poker-simulator/simulator-table-render-adapter.js"));
fullAdapter.model({
  getState: () => fullState,
  seatSlotsKit: slots,
  geometryKit: { geometry: () => noLegacyGeometry },
  dealAnimationsKit: { model: () => ({}) },
  boardRenderKit: { model: () => ({ renderBoard: () => "" }) },
  tableEffectsKit: { model: () => ({ renderHeroFeltBet: () => "", renderPotStacks: () => "", renderSeatBets: () => "", clearBetAnimations: () => {} }) },
  seatRendererKit: { model: (options) => { fullSeatSlotContext = options.seatSlotContext; return { renderSeat: () => "" }; } },
  tableRendererKit: { model: () => ({ renderTable: () => "" }) },
  seatCardState: () => ({ reveal: true, className: "is-revealed-showdown" }),
  allInRunoutStageState: () => ({ index: -1, cardCount: 5, complete: true })
});
assert.equal(typeof fullSeatSlotContext, "function", "full renderer receives the shared seat-slot callback");
const fullTable = {
  id: 1,
  status: "showdown",
  street: "showdown",
  seats: Array.from({ length: 6 }, (_, id) => ({ id, isHero: id === 0, dealer: id === 1 }))
};
const fullLayout = slots.layoutTable({ tier: "T4", viewport: "FHD", uiScale: "standard", playerCount: 6, phase: "finished-reveal", dealerSeatId: 1, tolerance: 0.3 });
for (const placement of fullLayout.revealCardSeparation.placements) {
  const context = fullSeatSlotContext(fullTable, placement.seatId);
  assert(context?.styleVars.includes(`--reveal-card-tx:${placement.tx}cqw`), `full renderer consumes final tx for seat ${placement.seatId}`);
  assert(context?.styleVars.includes(`--reveal-card-ty:${placement.ty}cqh`), `full renderer consumes final ty for seat ${placement.seatId}`);
}

const snapshot = readFileSync(resolve(repo, "assets/poker-trainer-shell/simulator-snapshot.js"), "utf8");
assert(snapshot.includes("revealCardSeparation?.placements"));
assert(snapshot.includes("--reveal-card-tx") && snapshot.includes("--reveal-card-ty"));
const polish = readFileSync(resolve(repo, "assets/poker-simulator/simulator-polish.css"), "utf8");
assert(polish.includes("var(--reveal-card-tx") && polish.includes("var(--reveal-card-ty"));
const restealCss = readFileSync(resolve(repo, "assets/poker-resteal-lesson/simulator-pack.css"), "utf8");
assert(!/seat-zone-(?:top|bottom|left|right)[^{]*\{[^}]*--seat-cards-(?:t|d)[xy]/.test(restealCss));

console.log("Reveal-card geometry contract: ok");
