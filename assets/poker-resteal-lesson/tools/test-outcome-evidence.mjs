import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const dataUrl = new URL("../data/hero_outcomes.json", import.meta.url);
const data = JSON.parse(readFileSync(dataUrl, "utf8"));
const all = data.pooled.ALL;
const contentContext = {};
contentContext.window = contentContext;
runInNewContext(readFileSync(new URL("../data.js", import.meta.url), "utf8"), contentContext, { filename: "data.js" });
const foldBaselineBb = contentContext.PokerRestealData.comparisonFoldBaselineBb;

assert.equal(foldBaselineBb, -1.12, "comparison display uses the BB plus ante fold baseline");

assert.match(data.meta.window, /2026-01-01\.\.2026-06-01/);
assert.match(data.meta.spot, /SB or BB/);
assert.match(data.meta.spot, /single CO\/BTN open/);
assert.match(data.meta.spot, /no limpers/);
assert.match(data.meta.spot, /25-40bb/);
assert.match(data.meta.clean_definition, /is_preflop_could_3bet=1/);
assert.match(data.meta.clean_definition, /open<=3\.0bb/);
assert.match(data.meta.note, /unknown-holecard rows excluded/);

const expected = {
  pair_22_66: { jam: [20610, 0.8631], call: [31295, 0.1389], delta: 0.7242 },
  pair_77_99: { jam: [20308, 2.2194], call: [9300, 1.0189], delta: 1.2005 },
  ax_strong: { jam: [55358, 2.6518], call: [25113, 0.9675], delta: 1.6843 },
  broadway_offsuit: { jam: [12002, 0.2710], call: [80858, 0.1269], delta: 0.1441 },
  pair_TT_plus: { jam: [14358, 5.1641], call: [2605, 5.3558], delta: -0.1917 },
  suited_conn_low: { jam: [1334, -0.2789], call: [33576, -0.1935], delta: -0.0854 }
};

for (const [category, checks] of Object.entries(expected)) {
  const row = all[category];
  assert.ok(row, `${category} exists`);
  for (const action of ["jam", "call"]) {
    const [n, ev] = checks[action];
    assert.equal(row[action].n, n, `${category} ${action} sample size`);
    assert.equal(row[action].avg_ev_bb, ev, `${category} ${action} avg_ev_bb`);
    assert.ok(Number.isInteger(row[action].n) && row[action].n > 0, `${category} ${action} has valid n`);
    assert.ok(Number.isFinite(row[action].avg_ev_bb), `${category} ${action} has finite EV`);
  }
  const delta = Number((row.jam.avg_ev_bb - row.call.avg_ev_bb).toFixed(4));
  assert.equal(delta, checks.delta, `${category} delta uses unrounded source values`);
  const rebasedDelta = Number(((row.jam.avg_ev_bb - foldBaselineBb) - (row.call.avg_ev_bb - foldBaselineBb)).toFixed(4));
  assert.equal(rebasedDelta, checks.delta, `${category} jam-call delta is invariant after rebasing to fold`);
}

assert.equal(Number((all.broadway_offsuit.call.avg_ev_bb - foldBaselineBb).toFixed(4)), 1.2469, "broadway call displays +1.2469 BB relative to folding");
assert.equal(Number((all.suited_conn_low.jam.avg_ev_bb - foldBaselineBb).toFixed(4)), 0.8411, "negative raw jam EV becomes positive relative to folding");
assert.equal(Number((all.suited_conn_low.call.avg_ev_bb - foldBaselineBb).toFixed(4)), 0.9265, "negative raw call EV becomes positive relative to folding");

assert.ok(all.pair_TT_plus.call.n < 5000, "TT+ call line is explicitly a thinner sample");
assert.ok(all.suited_conn_low.jam.n < 5000, "low suited connector jam line is explicitly a thinner sample");

console.log("PASS resteal outcome evidence: metadata, samples, EV means, and deltas are reconciled");
