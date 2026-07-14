import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "engine.js"), "utf8");
const context = {};
vm.runInNewContext(source, context);
const Engine = context.PokerBbCallEngine;

const minraise = Engine.potModel(2);
assert.equal(minraise.toCall, 1);
assert.equal(minraise.finalPot, 5.5);
assert.ok(Math.abs(minraise.potOddsPct - 18.181818) < 0.0001);

const twoFive = Engine.potModel(2.5);
assert.equal(twoFive.toCall, 1.5);
assert.equal(twoFive.finalPot, 6.5);
assert.ok(Math.abs(twoFive.potOddsPct - 23.076923) < 0.0001);

const three = Engine.potModel(3);
assert.equal(three.toCall, 2);
assert.equal(three.finalPot, 7.5);
assert.ok(Math.abs(three.potOddsPct - 26.666667) < 0.0001);

const realization = Engine.equityRealization(38.5, 27.8);
assert.ok(Math.abs(realization.realizationPct - 72.207792) < 0.0001);
assert.ok(Math.abs(realization.unrealizedSharePct - 27.792208) < 0.0001);

const split = Engine.defenseSummary(10, 9);
assert.equal(JSON.stringify(split), JSON.stringify({ foldPct: 10, continuePct: 90, threeBetPct: 9, coldCallPct: 81 }));

const unsplit = Engine.defenseSummary(45);
assert.equal(JSON.stringify(unsplit), JSON.stringify({ foldPct: 45, continuePct: 55, threeBetPct: null, coldCallPct: null }));

assert.equal(Engine.totalCombos("AA"), 6);
assert.equal(Engine.totalCombos("AKs"), 4);
assert.equal(Engine.totalCombos("AKo"), 12);
assert.equal(Engine.combosLeft("AA", "AKo"), 3);
assert.equal(Engine.combosLeft("AKs", "AKs"), 3);
assert.equal(Engine.combosLeft("AKo", "AKs"), 6);

const rangeEquity = Engine.equityAgainstRange("KQo", 0.4, ["AA", "KK", "AKs"], () => 0.25);
assert.equal(rangeEquity.rawEquityPct, 25);
assert.equal(rangeEquity.rangeHands, 1);
assert.ok(Math.abs(Engine.minimumRealizationPct(18.2, 43.2) - 42.1296296) < 0.0001);

console.log("BB call defense engine: ok");
