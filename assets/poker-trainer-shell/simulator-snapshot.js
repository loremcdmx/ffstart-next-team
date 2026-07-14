(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const VERSION = "ff-trainer-simulator-snapshot-v1";
  const DEFAULT_DECK_THEME = "color-block";
  const CARD_BASE = "assets/poker-kit/decks/classic-english";

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function cleanLine(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function safeClass(value, fallback = "neutral") {
    const text = String(value || fallback).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    return text || fallback;
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function trimNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0";
    return String(Math.round(number * 10) / 10).replace(/\.0$/, "");
  }

  function normalizeAmountText(value) {
    return cleanLine(value).replace(",", ".").replace(/бб/i, "BB").replace(/(\d)(BB)\b/i, "$1 BB");
  }

  function normalizeCardCode(code) {
    const text = String(code || "").trim();
    if (!text) return "";
    const rankRaw = text.length === 3 ? text.slice(0, 2) : text.slice(0, -1);
    const suitRaw = text.slice(text.length === 3 ? 2 : -1);
    const rank = rankRaw.toUpperCase() === "10" ? "T" : rankRaw.toUpperCase();
    const suit = suitRaw.toLowerCase();
    return `${rank}${suit}`;
  }

  function toBbNumber(value, fallback = 0, pot = 0) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = cleanLine(value).replace(",", ".");
    if (!text) return fallback;
    const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percent) return Math.max(0, (Number(percent[1]) / 100) * Number(pot || 0));
    const match = text.match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : fallback;
  }

  function amountDisplay(value, fallback = "0 BB") {
    if (typeof value === "string" && value.trim()) return normalizeAmountText(value);
    const number = Number(value);
    return Number.isFinite(number) ? `${trimNumber(number)} BB` : fallback;
  }

  function streetLabel(value, boardCards = []) {
    const text = cleanLine(value).toLowerCase();
    if (/preflop|префлоп/.test(text)) return "preflop";
    if (/river|ривер/.test(text)) return "river";
    if (/turn|терн|тёрн/.test(text)) return "turn";
    if (/flop|флоп/.test(text)) return "flop";
    if (boardCards.length >= 5) return "river";
    if (boardCards.length >= 4) return "turn";
    if (boardCards.length >= 3) return "flop";
    return "preflop";
  }

  function streetTitle(street) {
    return {
      preflop: "Префлоп",
      flop: "Флоп",
      turn: "Терн",
      river: "Ривер"
    }[street] || "Раздача";
  }

  function normalizeSeatKey(value) {
    const compact = cleanLine(value).toUpperCase().replace(/\s+/g, "");
    if (!compact) return "";
    if (compact === "HERO" || compact === "ГЕРОЙ") return "HERO";
    const aliases = {
      "РАННЯЯ": "UTG",
      "РАННЯЯПОЗИЦИЯ": "UTG",
      "EARLY": "UTG",
      "UTG1": "UTG+1",
      "СРЕДНЯЯ": "HJ",
      "СРЕДНЯЯПОЗИЦИЯ": "HJ",
      "MIDDLE": "HJ",
      "КАТОФФ": "CO",
      "БАТТОН": "BTN",
      "ДИЛЕР": "BTN",
      "МАЛЫЙБЛАЙНД": "SB",
      "МАЛЫЙБЛАЙНДЗ": "SB",
      "БОЛЬШОЙБЛАЙНД": "BB",
      "БОЛЬШОЙБЛАЙНДЗ": "BB"
    };
    return aliases[compact] || compact;
  }

  function actionLabelFromText(value) {
    const text = cleanLine(value);
    const lower = text.toLowerCase();
    if (/all[-\s]?in|олл[-\s]?ин|пуш|jam/.test(lower)) return "олл-ин";
    if (/squeeze|сквиз/.test(lower)) return "сквиз";
    if (/3[-\s]?bet|three.?bet|три.?бет|3-бет/.test(lower)) return "3-бет";
    if (/open|откр|рейз|raise/.test(lower)) return /limp|лимп/.test(lower) ? "лимп" : "рейз";
    if (/bet|barrel|став/.test(lower)) return "ставка";
    if (/call|колл|защит/.test(lower)) return "колл";
    if (/check|чек/.test(lower)) return "чек";
    if (/fold|пас|выкин|сброс/.test(lower)) return "пас";
    if (/limp|лимп/.test(lower)) return "лимп";
    return text.slice(0, 24);
  }

  function actionTone(label) {
    const text = cleanLine(label).toLowerCase();
    if (/пас|fold/.test(text)) return "fold";
    if (/чек|check/.test(text)) return "passive";
    if (/колл|call/.test(text)) return "passive";
    if (/лимп|limp/.test(text)) return "passive";
    if (/олл|пуш|сквиз|3-бет|рейз|став/.test(text)) return "aggressive";
    return "neutral";
  }

  function actionAmountFromText(value) {
    const text = cleanLine(value).replace(",", ".");
    const match = text.match(/(\d+(?:\.\d+)?)\s*(BB|ББ|%)/i);
    return match ? `${match[1]} ${match[2].toUpperCase().replace("ББ", "BB")}` : "";
  }

  function actionAmountFromRow(row, potBb) {
    const raw = row?.amount ?? row?.amountBb ?? row?.toBb ?? row?.sizeBb ?? row?.size;
    const text = normalizeAmountText(raw);
    if (!text) return "";
    const numeric = toBbNumber(raw, Number.NaN, potBb);
    return Number.isFinite(numeric) && numeric > 0 ? amountDisplay(numeric) : text;
  }

  function stripStreetPrefix(value) {
    return cleanLine(value).replace(/^(?:preflop|flop|turn|river|префлоп|флоп|терн|тёрн|ривер)\s*[:/.-]\s*/i, "");
  }

  function actionSegmentsFromText(value) {
    const text = stripStreetPrefix(value);
    if (!text) return [];
    return text
      .replace(/\s+and\s+/gi, ", ")
      .split(/[,;]\s*/i)
      .map(cleanLine)
      .filter(Boolean);
  }

  function findSeatLabel(segment, sourceSeats, heroPosition) {
    const normalizedSegment = cleanLine(segment).toLowerCase();
    const labels = sourceSeats
      .map((seat) => cleanLine(typeof seat === "string" ? seat : (seat?.label || seat?.position || seat?.name || seat?.seat)))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    const direct = labels.find((label) => {
      const lower = label.toLowerCase();
      return normalizedSegment === lower || normalizedSegment.startsWith(`${lower} `);
    });
    if (direct) return direct;
    const canonical = segment.match(/\b(UTG(?:\+1)?|MP|LJ|HJ|CO|BTN|SB|BB|Hero|Герой)\b/i)?.[1] || "";
    if (/^(hero|герой)$/i.test(canonical)) return heroPosition || canonical;
    return canonical;
  }

  function inferActionStreet(segment, tableStreet) {
    const text = cleanLine(segment).toLowerCase();
    if (/river|ривер/.test(text)) return "river";
    if (/turn|терн|тёрн/.test(text)) return "turn";
    if (/flop|флоп/.test(text)) return "flop";
    if (/open|limp|3[-\s]?bet|squeeze|сквиз|лимп|откр/.test(text)) return "preflop";
    return tableStreet;
  }

  function actionRowsFromLine(raw, index, sourceTable, sourceSeats, tableStreet, potBb) {
    const row = raw && typeof raw === "object" ? raw : { text: raw };
    const explicitSeat = cleanLine(row.seat || row.position || row.actor || row.player);
    const explicitAction = cleanLine(row.action || row.type || row.kind);
    const explicitAmount = actionAmountFromRow(row, potBb);
    const text = cleanLine(row.text || row.line || row.label || row.title || [explicitSeat, explicitAction, explicitAmount].filter(Boolean).join(" "));
    if (!text) return [];
    const segments = explicitSeat ? [text] : actionSegmentsFromText(text);
    const rows = segments.length ? segments : [text];
    return rows.map((segment) => {
      const seatLabel = explicitSeat || findSeatLabel(segment, sourceSeats, sourceTable.heroPosition);
      const label = actionLabelFromText(row.action || row.type || segment);
      const amount = /пас|fold|чек|check/i.test(label) ? "" : (explicitAmount || actionAmountFromText(segment));
      return {
        index,
        street: cleanLine(row.street) || inferActionStreet(segment, tableStreet),
        seat: seatLabel,
        seatKey: normalizeSeatKey(seatLabel),
        label,
        tone: actionTone(label),
        amount,
        amountBb: toBbNumber(amount, 0, potBb),
        text: segment
      };
    });
  }

  function normalizeActionRows(sourceTable, sourceSeats, tableStreet, potBb) {
    const rows = [
      ...asArray(sourceTable.actionLine),
      ...asArray(sourceTable.actions),
      ...asArray(sourceTable.flowSteps)
    ].flatMap((line, index) => actionRowsFromLine(line, index, sourceTable, sourceSeats, tableStreet, potBb));
    if (rows.length) return rows.slice(0, 10);
    const fallback = cleanLine(sourceTable.line);
    if (!fallback) return [];
    // The prose `line` is a last-resort fallback and often carries a narrative
    // sentence (e.g. "Hero попал в деньги с 19 BB") rather than a real action list.
    // The hero is always the seat to act, so a hero-attributed row parsed out of
    // prose is a stack/context misread — never a committed street bet. Dropping it
    // stops the narrative from minting a phantom hero commit that would eat the
    // hero's rendered stack via Math.max(0, stack - committed).
    const heroKey = normalizeSeatKey(sourceTable.heroPosition || "");
    return actionRowsFromLine(fallback, 0, sourceTable, sourceSeats, tableStreet, potBb)
      .filter((row) => !heroKey || row.seatKey !== heroKey)
      .slice(0, 4);
  }

  function latestActionBySeat(actions) {
    const map = new Map();
    asArray(actions).forEach((action) => {
      if (action.seatKey) map.set(action.seatKey, action);
    });
    return map;
  }

  function latestAggressor(actions, seatIdByKey) {
    const row = [...asArray(actions)].reverse().find((action) => /aggressive/.test(action.tone || ""));
    if (!row) return null;
    const id = seatIdByKey.get(row.seatKey);
    return Number.isFinite(Number(id)) ? Number(id) : null;
  }

  function latestDecisionActor(actions, seatIdByKey) {
    const aggressor = latestAggressor(actions, seatIdByKey);
    if (aggressor !== null) return aggressor;
    const row = [...asArray(actions)].reverse().find((action) => action?.seatKey && action.tone && action.tone !== "fold");
    if (!row) return null;
    const id = seatIdByKey.get(row.seatKey);
    return Number.isFinite(Number(id)) ? Number(id) : null;
  }

  function seatZone(point) {
    if (!point) return "mid";
    if (point.y >= 70) return "bottom";
    if (point.y <= 30) return "top";
    if (point.x <= 33) return "left";
    if (point.x >= 67) return "right";
    return "mid";
  }

  function roundPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 50;
  }

  function slotPhase(table) {
    const revealsOpponentCards = Boolean(table?.__answered)
      && asArray(table?.seats).some((seat) => seat?.revealCardsAfterAnswer && asArray(seat.cards).length === 2);
    if (revealsOpponentCards) return "finished-reveal";
    return table?.street === "preflop" ? "preflop-blinds" : "postflop-bets";
  }

  function slotLayout(table) {
    if (table?.__slotLayout) return table.__slotLayout;
    const kit = root.PokerSimulatorSeatSlots;
    if (!kit || typeof kit.layoutTable !== "function") return null;
    try {
      const dealer = asArray(table?.seats).find((seat) => seat.dealer);
      const layout = kit.layoutTable({
        tier: "T1",
        viewport: "FHD",
        uiScale: "auto",
        playerCount: Math.max(2, asArray(table?.seats).length || 6),
        phase: slotPhase(table),
        dealerSeatId: Number.isFinite(Number(dealer?.id)) ? Number(dealer.id) : 0,
        tolerance: 0.3
      });
      table.__slotLayout = layout || null;
      return table.__slotLayout;
    } catch {
      table.__slotLayout = null;
      return null;
    }
  }

  function slotRect(table, seatId, kind) {
    const layout = slotLayout(table);
    const id = `seat-${Number(seatId)}-${kind}`;
    return asArray(layout?.rects).find((rect) => rect?.id === id) || null;
  }

  function slotPoint(table, seatId, kind) {
    const rect = slotRect(table, seatId, kind);
    if (!rect?.center) return null;
    return { x: roundPercent(rect.center.x), y: roundPercent(rect.center.y) };
  }

  function pointDelta(from, to) {
    if (!from || !to) return { x: 0, y: 0 };
    return {
      x: roundPercent(Number(to.x) - Number(from.x)),
      y: roundPercent(Number(to.y) - Number(from.y))
    };
  }

  function revealPlacement(table, seatId, fallback) {
    const placements = slotLayout(table)?.revealCardSeparation?.placements;
    if (!Array.isArray(placements)) return fallback;
    const row = placements.find((placement) => Number(placement?.seatId) === Number(seatId));
    if (!row) return fallback;
    return {
      tx: Number.isFinite(Number(row.tx)) ? Number(row.tx) : Number(fallback?.tx || 0),
      ty: Number.isFinite(Number(row.ty)) ? Number(row.ty) : Number(fallback?.ty || 0)
    };
  }

  function slotSeatContext(table, seatId) {
    const box = slotPoint(table, seatId, "box");
    if (!box) return null;
    const cards = slotPoint(table, seatId, "cards") || box;
    const marker = slotPoint(table, seatId, "marker") || null;
    const dealer = slotPoint(table, seatId, "dealer") || null;
    const cardsDelta = pointDelta(box, cards);
    const dealerDelta = pointDelta(box, dealer || box);
    const heroMarkerDelta = pointDelta(cards, marker || cards);
    const revealCardPlacement = revealPlacement(table, seatId, { tx: cardsDelta.x, ty: cardsDelta.y });
    const styleVars = [
      `--seat-anchor-x:${box.x}`,
      `--seat-anchor-y:${box.y}`,
      `--seat-cards-dx:${cardsDelta.x}`,
      `--seat-cards-dy:${cardsDelta.y}`,
      `--seat-cards-tx:${cardsDelta.x}cqw`,
      `--seat-cards-ty:${cardsDelta.y}cqh`,
      `--reveal-card-tx:${revealCardPlacement.tx}cqw`,
      `--reveal-card-ty:${revealCardPlacement.ty}cqh`,
      "--reveal-nudge-ty:0cqh",
      `--dealer-dx:${dealerDelta.x}`,
      `--dealer-dy:${dealerDelta.y}`,
      `--dealer-tx:${dealerDelta.x}cqw`,
      `--dealer-ty:${dealerDelta.y}cqh`,
      `--hero-marker-dx:${heroMarkerDelta.x}`,
      `--hero-marker-dy:${heroMarkerDelta.y}`,
      `--hero-marker-tx:${heroMarkerDelta.x}cqw`,
      `--hero-marker-ty:${heroMarkerDelta.y}cqh`
    ].join("; ");
    return {
      mode: "slot-model",
      box,
      cards,
      marker,
      dealer,
      cardsDelta,
      dealerDelta,
      heroMarkerDelta,
      zone: seatZone(box),
      styleVars
    };
  }

  function seatPointFor(label, seat, index, heroPosition) {
    if (Number.isFinite(Number(seat?.x)) && Number.isFinite(Number(seat?.y))) {
      return { x: clamp(Number(seat.x), 6, 94), y: clamp(Number(seat.y), 8, 88) };
    }
    const key = normalizeSeatKey(label);
    const heroKey = normalizeSeatKey(heroPosition);
    if (seat?.state === "hero" || key === heroKey) return { x: 50, y: 76 };
    const compact = Number(root.innerWidth || 0) <= 620;
    const canonical = compact ? {
      UTG: { x: 5, y: 38 },
      "UTG+1": { x: 27, y: 8 },
      LJ: { x: 34, y: 8 },
      MP: { x: 20, y: 12 },
      HJ: { x: 60, y: 8 },
      CO: { x: 95, y: 38 },
      BTN: { x: 95, y: 62 },
      SB: { x: 82, y: 73 },
      BB: { x: 18, y: 73 }
    } : {
      UTG: { x: 4, y: 40 },
      "UTG+1": { x: 31, y: 7 },
      LJ: { x: 38, y: 7 },
      MP: { x: 22, y: 12 },
      HJ: { x: 60, y: 7 },
      CO: { x: 96, y: 40 },
      BTN: { x: 96, y: 62 },
      SB: { x: 68, y: 73 },
      BB: { x: 32, y: 73 }
    };
    if (canonical[key]) return canonical[key];
    const fallback = [
      { x: 50, y: 18 },
      { x: 22, y: 36 },
      { x: 18, y: 63 },
      { x: 82, y: 36 },
      { x: 78, y: 63 },
      { x: 50, y: 18 }
    ];
    return fallback[index % fallback.length];
  }

  function defaultSeats(heroPosition) {
    const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
    return positions.map((position) => ({
      label: position,
      state: normalizeSeatKey(position) === normalizeSeatKey(heroPosition) ? "hero" : /SB|BB/.test(position) ? "blind" : "waiting"
    }));
  }

  function seatLabel(seat, fallback) {
    if (typeof seat === "string") return seat;
    return cleanLine(seat?.label || seat?.position || seat?.name || seat?.seat || fallback);
  }

  const TABLE_POSITION_RING = Object.freeze(["SB", "BB", "UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN"]);

  function positionDistanceFromHero(label, heroPosition) {
    const key = normalizeSeatKey(label);
    const heroKey = normalizeSeatKey(heroPosition);
    const heroIndex = TABLE_POSITION_RING.indexOf(heroKey);
    const seatIndex = TABLE_POSITION_RING.indexOf(key);
    if (heroIndex < 0 || seatIndex < 0) return Number.POSITIVE_INFINITY;
    return (seatIndex - heroIndex + TABLE_POSITION_RING.length) % TABLE_POSITION_RING.length;
  }

  function orderRowsAroundHero(sourceRows, heroPosition) {
    const heroRows = sourceRows.filter((seat) => seat.isHero);
    const nonHeroRows = sourceRows
      .filter((seat) => !seat.isHero)
      .map((seat, fallbackIndex) => ({
        seat,
        fallbackIndex,
        distance: positionDistanceFromHero(seat.label, heroPosition)
      }))
      .sort((left, right) => {
        if (left.distance !== right.distance) return left.distance - right.distance;
        return left.fallbackIndex - right.fallbackIndex;
      })
      .map((entry) => entry.seat);
    return [...heroRows, ...nonHeroRows];
  }

  function normalizeSeats(sourceTable, actions, potBb) {
    const sourceSeats = asArray(sourceTable.seats).length ? asArray(sourceTable.seats) : defaultSeats(sourceTable.heroPosition || "Hero");
    const heroPosition = cleanLine(sourceTable.heroPosition || sourceSeats.find((seat) => seat?.state === "hero")?.label || "Hero");
    const heroKey = normalizeSeatKey(heroPosition);
    const actionBySeat = latestActionBySeat(actions);
    // The top bet on the current street (the raise). A "call" action carries no
    // amount of its own — a caller simply matches this — so callers commit it too.
    const streetTopBet = asArray(actions).reduce((max, action) => Math.max(max, Number(action?.amountBb) || 0), 0);
    const sourceRows = sourceSeats.map((sourceSeat, index) => {
      const label = seatLabel(sourceSeat, `S${index + 1}`);
      const state = cleanLine(sourceSeat?.state || sourceSeat?.status || (normalizeSeatKey(label) === heroKey ? "hero" : "waiting"));
      return { sourceSeat, label, state, index, isHero: state === "hero" || normalizeSeatKey(label) === heroKey };
    });
    const ordered = orderRowsAroundHero(sourceRows, heroPosition);
    const seatIdByKey = new Map();
    const pointsBySeatId = new Map();
    const seats = ordered.map((row, orderedIndex) => {
      const id = row.isHero ? 0 : orderedIndex;
      const key = normalizeSeatKey(row.label);
      const latest = actionBySeat.get(key) || null;
      const blind = /^(SB|BB)$/i.test(key) || /blind/i.test(row.state);
      const blindAmount = key === "SB" ? 0.5 : key === "BB" ? 1 : 0;
      const latestAmount = latest?.amountBb || 0;
      const latestIsCall = /колл|call/i.test(latest?.label || "");
      const isPreflop = streetLabel(sourceTable.street, asArray(sourceTable.boardCards)) === "preflop";
      // caller matches the street's top bet even though the call action has no
      // amount. Preflop only: postflop a preflop call already lives in the pot,
      // so it must not paint a fresh street chip.
      const committed = latestAmount
        || (latestIsCall && !row.isHero && isPreflop ? streetTopBet : 0)
        || (isPreflop ? blindAmount : 0);
      const explicitVisibleStack = Number(row.sourceSeat?.visibleStackBb);
      const hasVisibleStack = Number.isFinite(explicitVisibleStack);
      const stack = row.isHero
        ? toBbNumber(sourceTable.heroStack, 40)
        : toBbNumber(row.sourceSeat?.stackBb ?? row.sourceSeat?.stack ?? sourceTable.effectiveStack ?? sourceTable.heroStack, 40);
      const point = seatPointFor(row.label, row.sourceSeat, row.index, heroPosition);
      const latestFold = /пас|fold/i.test(latest?.label || "");
      seatIdByKey.set(key, id);
      pointsBySeatId.set(id, point);
      const revealCardsAfterAnswer = Boolean(row.sourceSeat?.revealCardsAfterAnswer);
      const opponentCards = revealCardsAfterAnswer
        ? asArray(row.sourceSeat?.cards).map(normalizeCardCode).filter(Boolean)
        : [];
      return {
        id,
        name: row.isHero ? "Hero" : row.label,
        position: row.label,
        stack: Math.max(0, hasVisibleStack ? explicitVisibleStack : stack - committed),
        isHero: row.isHero,
        isBot: !row.isHero,
        // The hero is the decision-maker (to act), never folded — some packs
        // describe the fold side of the choice as a "hero folds" row, which must
        // not grey out the hero's own seat/cards.
        folded: row.isHero ? false : (latest ? latestFold : /fold|пас|folded/i.test(row.state)),
        dealer: key === "BTN" || normalizeSeatKey(sourceTable.dealerPosition) === key,
        blind,
        cards: row.isHero ? asArray(sourceTable.heroCards).map(normalizeCardCode).filter(Boolean) : opponentCards,
        revealCardsAfterAnswer,
        committedStreet: committed,
        botProfile: row.isHero ? null : { difficulty: "standard", label: "trainer" }
      };
    });
    return { seats, seatIdByKey, pointsBySeatId, sourceSeats, heroPosition };
  }

  function renderCard(code, options = {}) {
    const normalized = normalizeCardCode(code);
    if (root.PokerDeckKit?.renderCard) {
      return root.PokerDeckKit.renderCard(normalized, {
        theme: DEFAULT_DECK_THEME,
        hero: Boolean(options.hero),
        board: Boolean(options.board),
        mini: Boolean(options.mini),
        fourColor: true
      });
    }
    if (!normalized) return "";
    const file = `${CARD_BASE}/${escapeHtml(normalized)}.svg`;
    return `<article class="poker-deck-card poker-deck-card--image ${options.board ? "poker-deck-card--board" : ""} ${options.hero ? "poker-deck-card--hero" : ""}"><img class="poker-deck-card__img" src="${file}" alt="${escapeHtml(normalized)}"></article>`;
  }

  function renderBackCard() {
    if (root.PokerDeckKit?.renderCard) {
      return root.PokerDeckKit.renderCard("", { back: true, mini: true, backStyle: "trainer-online" });
    }
    return '<article class="poker-deck-card poker-deck-card--back poker-deck-card--mini" aria-label="рубашка карты"></article>';
  }

  function renderSeatCards(_table, seat, cardState) {
    if (seat.isHero) {
      return asArray(cardState.cards).map((card) => renderCard(card, { hero: true })).join("");
    }
    if (cardState.reveal) {
      return asArray(cardState.cards || seat.cards).map((card) => renderCard(card, { mini: true })).join("");
    }
    if (cardState.folded) return "";
    return `${renderBackCard()}${renderBackCard()}`;
  }

  function renderAmountChips(amount, className = "") {
    if (root.PokerChipKit?.renderAmount) {
      return root.PokerChipKit.renderAmount(amount, {
        className,
        label: `фишки ${amountDisplay(amount)}`,
        detail: false,
        maxVisual: 5
      });
    }
    return `<span class="poker-chip-stack ${escapeHtml(className)}"><span class="poker-chip poker-chip--one poker-chip--white"></span></span>`;
  }

  function renderPotStacks(potState) {
    const amount = Number(potState?.carriedAmount ?? potState?.totalAmount ?? potState?.visibleAmount ?? 0);
    return renderAmountChips(amount, "pot-chip-stack");
  }

  function renderHeroFeltBet(table) {
    const amount = Number(table.__heroBet || 0);
    if (!(amount > 0)) return "";
    return `
      <span class="hero-felt-bet">
        ${renderAmountChips(amount, "bet-chip-stack")}
        <span class="bet-marker-amount">${escapeHtml(amountDisplay(amount))}</span>
      </span>
    `;
  }

  function betPoint(point) {
    const compact = Number(root.innerWidth || 0) <= 620;
    const zone = seatZone(point);
    const pull = compact
      ? ({ top: 0.46, bottom: 0.2, left: 0.32, right: 0.32 }[zone] || 0.26)
      : ({ top: 0.46, bottom: 0.2, left: 0.36, right: 0.36 }[zone] || 0.28);
    return {
      x: point.x + (50 - point.x) * pull,
      y: point.y + (50 - point.y) * pull
    };
  }

  function seatBetPoint(table, seat) {
    const fallback = table.__pointsBySeatId.get(seat.id) || { x: 50, y: 50 };
    // PokerSimulatorSeatSlots is the single geometry owner for both the live
    // simulator and trainer snapshots. Only use the radial fallback when the
    // slot kit is unavailable; viewport-specific lesson nudges would make the
    // same betting line drift between products.
    return slotPoint(table, seat.id, "marker") || betPoint(fallback);
  }

  function renderSeatBets(table) {
    return asArray(table.seats)
      .filter((seat) => !seat.isHero && Number(seat.committedStreet) > 0)
      .map((seat) => {
        const point = seatBetPoint(table, seat);
        const amount = Number(seat.committedStreet);
        return `
          <span class="bet-marker bet-marker--${seat.id}" style="left:${point.x}%; top:${point.y}%;">
            ${renderAmountChips(amount, "bet-chip-stack")}
            <span class="bet-marker-amount">${escapeHtml(amountDisplay(amount))}</span>
          </span>
        `;
      }).join("");
  }

  function usesBoardLayout(table) {
    return asArray(table.board).length > 0;
  }

  function renderBoard(table) {
    if (root.PokerSimulatorBoardRender?.model) {
      const boardRenderer = root.PokerSimulatorBoardRender.model({
        visibleBoardLength: (currentTable) => asArray(currentTable.board).length,
        renderCard
      });
      return boardRenderer.renderBoard(table);
    }
    return asArray(table.board).map((card) => renderCard(card, { board: true })).join("");
  }

  function renderSeatFactory() {
    if (!root.PokerSimulatorSeatRenderer?.model) return null;
    return root.PokerSimulatorSeatRenderer.model({
      visibleSeatLobbyState: () => "active",
      canHeroAct: (table) => !table.__answered,
      seatVisuallyFolded: (_table, seat) => Boolean(seat.folded),
      visibleSeatStack: (_table, seat) => Number(seat.stack || 0),
      visibleSeatAction: (table, seat) => table.__latestActionBySeat.get(normalizeSeatKey(seat.position)) || null,
      seatCardState: (table, seat) => seat.isHero
        ? { className: "hero-cards", cards: seat.cards, reveal: true, hidden: false, folded: false }
        : table.__answered && seat.revealCardsAfterAnswer && asArray(seat.cards).length === 2
          ? { className: "is-revealed is-revealed-live", cards: seat.cards, reveal: true, hidden: false, folded: false }
          : { className: "hidden-cards", cards: [], reveal: false, hidden: true, folded: Boolean(seat.folded) },
      renderSeatCards,
      renderHeroFeltBet,
      seatSlotContext: slotSeatContext,
      seatZone,
      seatPoint: (table, seatId) => slotPoint(table, seatId, "box") || table.__pointsBySeatId.get(Number(seatId)) || { x: 50, y: 50 },
      formatAmount: (value) => amountDisplay(value)
    });
  }

  function splitActionLabel(label) {
    const text = cleanLine(label);
    const match = text.match(/^(.*?)(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:BB|ББ|%))$/i);
    if (!match) return { verb: text, amount: "" };
    return {
      verb: cleanLine(match[1]).replace(/[·:-]\s*$/, "") || text,
      amount: normalizeAmountText(match[2])
    };
  }

  function displayActionVerb(value) {
    const text = cleanLine(value);
    if (/^3\s*бет$/i.test(text)) return "3-бет";
    if (/^с-?бет$/i.test(text)) return "С-бет";
    if (/^колд\s*колл$/i.test(text)) return "Колд-колл";
    return text;
  }

  function optionClass(option, state, expected, concept = false) {
    const picked = state?.selectedKey === option?.key;
    const correct = expected?.key === option?.key;
    return [
      "table-action",
      !concept && splitActionLabel(option?.label || "").amount ? "has-amount" : "",
      state?.answered && picked ? "is-picked" : "",
      state?.answered && correct ? "is-correct" : "",
      state?.answered && picked && !correct ? "is-wrong" : ""
    ].filter(Boolean).join(" ");
  }

  function renderOptionButton(option, state, expected, concept = false) {
    const label = splitActionLabel(option.label || option.key);
    const amount = label.amount;
    const picked = state?.selectedKey === option?.key;
    const correct = expected?.key === option?.key;
    const answerState = state?.answered && correct
      ? { key: "correct", mark: "Верно", label: "верный ответ" }
      : state?.answered && picked
        ? { key: "wrong", mark: "Ошибка", label: "твой неверный ответ" }
        : null;
    const accessibleLabel = `${cleanLine(option.label || option.key)}${answerState ? ` — ${answerState.label}` : ""}`;
    return `
      <button class="${optionClass(option, state, expected, concept)}" type="button" data-shell-action="choose" data-option-key="${escapeHtml(option.key)}" aria-label="${escapeHtml(accessibleLabel)}"${answerState ? ` data-answer-state="${answerState.key}"` : ""} ${state?.answered ? "disabled" : ""}>
        <span class="table-action-label">
          <span class="table-action-verb">${escapeHtml(concept ? (option.label || option.key) : displayActionVerb(label.verb || option.key))}</span>
          ${!concept && amount ? `<span class="table-action-amount">${escapeHtml(amount)}</span>` : ""}
        </span>
        ${answerState ? `<span class="table-action-result-mark" aria-hidden="true">${answerState.mark}</span>` : ""}
      </button>
    `;
  }

  function renderActions(table) {
    const state = table.__state;
    const spot = table.__spot;
    const expected = asArray(spot?.options).find((option) => option.correct) || asArray(spot?.options)[0] || null;
    if (!spot || state?.finished) return "";
    const optionCount = Math.max(1, Math.min(4, asArray(spot.options).length));
    const concept = !asArray(table.heroCards).length;
    const compactConcept = concept && asArray(spot.options).every((option) => cleanLine(option?.label || option?.key).length <= 8);
    return `
      <div class="client-controls ${table.toCall > 0 ? "is-facing-raise" : ""} ${concept ? "is-concept-options" : ""} ${compactConcept ? "is-compact-concept-options" : ""}" data-trainer-simulator-actions data-option-count="${optionCount}" style="--trainer-option-count:${optionCount};">
        <div class="client-row">
          ${asArray(spot.options).map((option) => renderOptionButton(option, state, expected, concept)).join("")}
        </div>
      </div>
    `;
  }

  function renderActionStatus(table) {
    if (!asArray(table.heroCards).length) {
      return `
        <div class="action-status is-hero is-concept">
          <strong>Ситуация</strong>
          <span>${escapeHtml(cleanLine(table.__spot?.question) || "Выберите лучший вывод для этой турнирной ситуации.")}</span>
        </div>
      `;
    }
    // Only real villain actions in the recap: a recognized verb (tone is
    // fold/passive/aggressive, not the "neutral" bucket that catches coaching
    // narrative like "blinds defend normally" / "Hero вылетел в re-entry"),
    // with a seat, and not the hero's own (the hero is still to act).
    const heroKey = normalizeSeatKey(table.heroPosition || "");
    const actions = asArray(table.__actions)
      .filter((action) => action
        && action.tone && action.tone !== "neutral"
        && cleanLine(action.seat)
        && normalizeSeatKey(action.seat) !== heroKey)
      .slice(-4);
    const summary = table.toCall
      ? `К коллу ${amountDisplay(table.toCall)}`
      : table.currentBet
        ? `Ставка ${amountDisplay(table.currentBet)}`
        : "Выберите действие";
    const actionSummary = actions.map((action) => {
      const parts = [action.seat, action.label, action.amount]
        .map((part) => cleanLine(part))
        .filter(Boolean)
        .filter((part, index, list) => index === 0 || part.toLowerCase() !== list[index - 1].toLowerCase());
      return parts.join(" ");
    }).filter(Boolean).join(" · ");
    const context = [cleanLine(table.__historyLine), actionSummary].filter(Boolean).join(" · ");
    return `
      <div class="action-status is-hero">
        <strong>${escapeHtml(streetTitle(table.street))}</strong>
        <span>${escapeHtml(summary)}</span>
        ${context ? `<em>${escapeHtml(context)}</em>` : ""}
      </div>
    `;
  }

  function buildTable(spot, state) {
    const sourceTable = spot?.table || {};
    const board = asArray(sourceTable.boardCards).map(normalizeCardCode).filter(Boolean);
    const street = streetLabel(sourceTable.street || sourceTable.potLabel, board);
    const pot = toBbNumber(sourceTable.pot, 0);
    const sourceSeats = asArray(sourceTable.seats).length ? asArray(sourceTable.seats) : defaultSeats(sourceTable.heroPosition || "Hero");
    const hasExplicitActions = asArray(sourceTable.actionLine).length
      || asArray(sourceTable.actions).length
      || asArray(sourceTable.flowSteps).length;
    const concept = !asArray(sourceTable.heroCards).length;
    const actions = concept && !hasExplicitActions
      ? []
      : normalizeActionRows(sourceTable, sourceSeats, street, pot);
    const normalized = normalizeSeats(sourceTable, actions, pot);
    const table = {
      id: 1,
      status: "playing",
      street,
      board,
      pot,
      toCall: toBbNumber(sourceTable.toCall, 0),
      currentBet: toBbNumber(sourceTable.currentBet, 0),
      canCheck: !sourceTable.toCall,
      seats: normalized.seats,
      heroCards: asArray(sourceTable.heroCards).map(normalizeCardCode).filter(Boolean),
      heroPosition: normalized.heroPosition,
      busy: false,
      serverMode: false,
      __spot: spot,
      __state: state,
      __answered: Boolean(state?.answered),
      __actions: actions,
      __historyLine: cleanLine(sourceTable.historyLine),
      __latestActionBySeat: latestActionBySeat(actions),
      __pointsBySeatId: normalized.pointsBySeatId
    };
    table.__heroBet = table.seats.find((seat) => seat.isHero)?.committedStreet || 0;
    table.streetAggressorSeatId = latestDecisionActor(actions, normalized.seatIdByKey);
    return table;
  }

  function renderTable(spot, state = {}) {
    if (!root.PokerSimulatorTableRenderer?.model || !root.PokerSimulatorSeatRenderer?.model) return "";
    const table = buildTable(spot, state);
    const conceptClass = table.heroCards.length ? "" : "is-concept-spot";
    const compactConceptClass = !table.heroCards.length && asArray(spot?.options).every((option) => cleanLine(option?.label || option?.key).length <= 8)
      ? "has-compact-concept-options"
      : "";
    const zeroPotClass = table.pot > 0 ? "" : "has-zero-pot";
    const seatRenderer = renderSeatFactory();
    if (!seatRenderer) return "";
    const renderer = root.PokerSimulatorTableRenderer.model({
      getActiveTableId: () => 1,
      usesBoardLayout,
      potAnimationState: (currentTable) => ({
        visibleAmount: currentTable.pot,
        carriedAmount: currentTable.pot,
        totalAmount: currentTable.pot,
        hasPending: false
      }),
      renderPotStacks,
      renderBoard,
      renderSeat: (currentTable, seat) => seatRenderer.renderSeat(currentTable, seat),
      renderSeatBets,
      actionBarClass: () => `is-hero-turn ${table.__answered ? "is-result" : ""}`,
      renderActionStatus,
      renderActions,
      formatAmount: amountDisplay
    });
    return `
      <div class="ff-shell-simulator-snapshot table-grid ${conceptClass} ${compactConceptClass} ${zeroPotClass}" data-count="1" data-snapshot-version="${VERSION}" data-marker-geometry="simulator-slot-v1">
        ${renderer.renderTable(table)}
      </div>
    `;
  }

  root.FFTrainerSimulatorSnapshot = {
    version: VERSION,
    renderTable,
    buildTable
  };
})();
