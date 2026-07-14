import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3] || path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../data/ff-bb-call-realization.json"
);

if (!inputPath) {
  throw new Error("Usage: node build-ff-realization.mjs <clickhouse-export.csv> [output.json]");
}

function parseCsv(text) {
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      records.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    records.push(row);
  }

  const [header, ...data] = records;
  if (!header) throw new Error("CSV export is empty");
  return data
    .filter((values) => values.length === header.length)
    .map((values) => Object.fromEntries(header.map((name, index) => [name, values[index]])));
}

function numeric(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}: ${value}`);
  return parsed;
}

function sizeKey(value) {
  return numeric(value, "open_size_bb").toFixed(1).replace(".", "_");
}

function primaryStats(row) {
  return {
    n: numeric(row.hand_count, "hand_count"),
    players: numeric(row.unique_players, "unique_players"),
    meanNetEvBb: numeric(row.avg_chips_ev_bb, "avg_chips_ev_bb"),
    meanHeroAnteBb: numeric(row.mean_hero_ante_bb, "mean_hero_ante_bb"),
    meanPotAfterCallBb: numeric(row.mean_pot_after_call_bb, "mean_pot_after_call_bb"),
    meanRealizedEquityPct: numeric(row.realized_equity_pct, "realized_equity_pct"),
    meanEvVsFoldBb: numeric(row.mean_ev_vs_fold_bb, "mean_ev_vs_fold_bb")
  };
}

function diagnosticStats(row) {
  return {
    n: numeric(row.hand_count, "hand_count"),
    players: numeric(row.unique_players, "unique_players"),
    meanRealizedEquityPct: numeric(row.realized_equity_pct, "realized_equity_pct"),
    meanEvVsFoldBb: numeric(row.mean_ev_vs_fold_bb, "mean_ev_vs_fold_bb")
  };
}

const sourceRows = parseCsv(fs.readFileSync(inputPath, "utf8"));
const output = {
  meta: {
    version: "2026-07-14.1",
    window: {
      startInclusive: "2026-01-01T00:00:00",
      endExclusive: "2026-07-14T00:00:00"
    },
    snapshot: "2026-07-14",
    scope: "FF tracker · BB call vs one raiser · heads-up flop · effective stack 25–40 BB · open 2.0/2.5/3.0 BB ±0.05",
    primaryCohort: "all_ff_3_9max",
    primaryCohortLabel: "Все столы FF 3–9 max",
    diagnosticCohort: "exact_7max",
    diagnosticCohortLabel: "Только 7-max; не смешивается с primary",
    minDisplayN: 500,
    minReliableN: 2000,
    passBaseline: "fold = -(1 BB + hero ante); meanEvVsFoldBb = meanNetEvBb + 1 + meanHeroAnteBb",
    realizedEquityFormula: "SUM(netEvBb + openBb + heroAnteBb) / SUM(2*openBb + 0.5 + totalAnteBb)",
    totalAnteMethod: "hero ante per player × cnt_players",
    knowledgeContext: {
      entryId: "1a324dc9-3cc3-421a-b71c-fee46c00dac2",
      status: "validated",
      rule: "Per-hand EV is aggregated with hand weighting; pre-aggregated rates are never averaged unweighted."
    }
  },
  rows: {}
};

for (const row of sourceRows) {
  if (row.cohort !== "all_ff_3_9max" || row.stack_bucket !== "25-40") continue;
  const key = `${sizeKey(row.open_size_bb)}:${row.opener_position}:${row.holecards_str}`;
  if (output.rows[key]) throw new Error(`Duplicate primary key: ${key}`);
  output.rows[key] = { ...primaryStats(row), bands: {} };
}

for (const row of sourceRows) {
  const key = `${sizeKey(row.open_size_bb)}:${row.opener_position}:${row.holecards_str}`;
  const target = output.rows[key];
  if (!target) continue;

  if (row.cohort === "all_ff_3_9max" && row.stack_bucket !== "25-40") {
    const band = row.stack_bucket.replace("-", "_");
    if (target.bands[band]) throw new Error(`Duplicate band key: ${key}/${band}`);
    target.bands[band] = {
      n: numeric(row.hand_count, "hand_count"),
      meanRealizedEquityPct: numeric(row.realized_equity_pct, "realized_equity_pct"),
      meanEvVsFoldBb: numeric(row.mean_ev_vs_fold_bb, "mean_ev_vs_fold_bb")
    };
  }

  if (row.cohort === "exact_7max" && row.stack_bucket === "25-40") {
    if (target.exact7) throw new Error(`Duplicate exact7 key: ${key}`);
    target.exact7 = diagnosticStats(row);
  }
}

const keys = Object.keys(output.rows);
const primaryHands = keys.reduce((sum, key) => sum + output.rows[key].n, 0);
output.meta.coverage = {
  observedPrimaryCells: keys.length,
  primaryHands,
  cellsAtOrAboveMinDisplayN: keys.filter((key) => output.rows[key].n >= output.meta.minDisplayN).length,
  cellsAtOrAboveMinReliableN: keys.filter((key) => output.rows[key].n >= output.meta.minReliableN).length,
  expectedGridCells: 169 * 5 * 3
};

if (keys.length !== 2443 || primaryHands !== 1061045) {
  throw new Error(`Snapshot reconciliation failed: ${keys.length} cells / ${primaryHands} hands`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ output: outputPath, bytes: fs.statSync(outputPath).size, ...output.meta.coverage }, null, 2));
