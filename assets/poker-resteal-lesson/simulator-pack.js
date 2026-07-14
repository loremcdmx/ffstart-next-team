(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const params = new URLSearchParams(root.location?.search || "");
  const requestedPractice = params.get("practice") || params.get("lesson") || params.get("drill");
  const active = requestedPractice === "resteal" || requestedPractice === "bb-resteal";
  const PACK_KEY = "resteal-bb-demo";
  const trickKinds = ["early-open", "open-call", "limp"];
  let lastCombo = "";
  const seenCombos = new Set();
  const processedAdviceEntryIds = new Set();
  const adviceSelectionState = { usage: {}, lastIds: [], lastFamily: "" };
  let restartHandlerInstalled = false;
  let wisdomTimer = 0;
  let completionTimer = 0;
  let pendingCompletionCount = 0;
  let completionHintScheduled = false;

  function sessionHands(value = params.get("hands")) {
    const requested = Number(value);
    return [10, 25, 50, 100].includes(requested) ? requested : 10;
  }

  function planForHand(handNo) {
    const index = Math.max(0, Math.floor(Number(handNo || 1)) - 1);
    const slot = index % 4;
    if (slot === 0) return { kind: "single-open", opener: "BTN", trick: false };
    if (slot === 1) return { kind: "single-open", opener: "CO", trick: false };
    if (slot === 2) return { kind: "single-open", opener: "BTN", trick: false };
    return { kind: trickKinds[Math.floor(index / 4) % trickKinds.length], opener: "", trick: true };
  }

  function openerSeat(table) {
    const rawOpenerId = table?.preflopOpenerSeatId;
    if (rawOpenerId == null || rawOpenerId === "") return null;
    const openerId = Number(rawOpenerId);
    if (!Number.isFinite(openerId)) return null;
    return (table?.seats || []).find((seat) => Number(seat?.id) === openerId) || null;
  }

  function realLimpSeatIds(table) {
    const preflopActions = (Array.isArray(table?.actionTimeline) ? table.actionTimeline : [])
      .filter((event) => event?.phase === "action" && event?.street === "preflop");
    const reasonFor = (event) => String(event?.botReason || "").trim().toLowerCase();
    if (preflopActions.some((event) => reasonFor(event).includes("forced live spot"))) return [];
    return [...new Set(preflopActions
      .filter((event) => /(?:^|[\s-])(?:limp|complete)(?:$|[\s-])/.test(reasonFor(event)))
      .map((event) => Number(event?.seatId))
      .filter(Number.isFinite))];
  }

  function classify(table) {
    const opener = openerSeat(table);
    const openerId = Number(opener?.id);
    const rawAggressorId = table?.preflopAggressorSeatId;
    const aggressorId = rawAggressorId == null || rawAggressorId === "" ? NaN : Number(rawAggressorId);
    const callers = (table?.preflopOpenCallerSeatIds || [])
      .map(Number)
      .filter((seatId) => Number.isFinite(seatId) && seatId !== openerId);
    const limpers = realLimpSeatIds(table);
    const openTo = Number(table?.currentBet || 0);
    const baselinePot = openTo + 2.5; // open + SB + BB + one BB ante
    const hasOnlyForcedDeadMoney = Math.abs(Number(table?.pot || 0) - baselinePot) <= 0.11;
    const cleanOpen = Boolean(
      opener
      && openTo > 1
      && openTo <= 2.6
      && aggressorId === openerId
    );

    if (!opener && openTo <= 1 && table?.canCheck && limpers.length) {
      return { kind: "limp", opener: "", callers: limpers, openTo };
    }
    if (cleanOpen && callers.length) {
      return { kind: "open-call", opener: opener.position || "", callers, openTo };
    }
    if (cleanOpen && !callers.length && hasOnlyForcedDeadMoney && ["UTG", "HJ", "MP"].includes(opener.position)) {
      return { kind: "early-open", opener: opener.position, callers: [], openTo };
    }
    if (cleanOpen && !callers.length && hasOnlyForcedDeadMoney && ["CO", "BTN"].includes(opener.position)) {
      return { kind: "single-open", opener: opener.position, callers: [], openTo };
    }
    return { kind: "other", opener: opener?.position || "", callers, openTo };
  }

  function matchesPlan(table, plan) {
    if (!table || table.status !== "playing" || !table.heroTurn || table.heroPosition !== "BB") return false;
    const actual = classify(table);
    if (actual.kind !== plan.kind) return false;
    if (plan.opener && actual.opener !== plan.opener) return false;
    return true;
  }

  function applyBootSettings(settings) {
    if (!active || !settings) return settings;
    Object.assign(settings, {
      pack: PACK_KEY,
      tableCount: 1,
      playerCount: 6,
      setupCompleted: true,
      autoStart: true,
      simulationMode: "random",
      randomStackMinBb: 25,
      randomStackMaxBb: 40,
      actionTimerSeconds: 0,
      trainingMode: false,
      manualNextHand: false,
      continueAfterBust: true,
      sessionHandLimit: sessionHands(),
      demoMode: true,
      uiScale: "xl",
      anteBb: 0,
      bigBlindAnteBb: 1,
      lobbyEvents: false,
      revealOpponentCardsOnFinish: true,
      statsScope: "session",
      handTempo: "fast",
      turboMode: true,
      sound: false
    });
    return settings;
  }

  function botTier(profile = {}) {
    const source = profile && typeof profile === "object" ? profile : {};
    if (!Object.keys(source).length) return "unknown";
    const difficulty = String(source.difficulty || "").toLowerCase();
    const style = String(source.style || source.archetype || "").toLowerCase();
    if (["easy", "loose", "weak"].includes(difficulty) || ["fish", "station", "calling-station"].includes(style)) return "green";
    if (["pro", "nitty", "hard", "expert"].includes(difficulty)) return "red";
    return "blue";
  }

  function seatStartingStack(table, seat) {
    if (!seat) return 0;
    const seatId = Number(seat.id);
    return Number(seat.stack || 0)
      + Number(table?.handContributions?.[seatId] || 0)
      + Number(table?.contributions?.[seatId] || 0)
      + Number(table?.anteContributions?.[seatId] || 0);
  }

  function tableAdviceSnapshot(table) {
    if (!table?.restealDrill) return null;
    const drill = table.restealDrill;
    const seats = Array.isArray(table.seats) ? table.seats : [];
    const opener = seats.find((seat) => Number(seat?.id) === Number(drill.openerSeatId)) || openerSeat(table);
    const liveParticipant = [
      ...(Array.isArray(table?.allInRunout?.participants) ? table.allInRunout.participants : []),
      ...(Array.isArray(table?.showdown?.participants) ? table.showdown.participants : [])
    ].find((participant) => !participant?.isHero);
    const caller = seats.find((seat) => Number(seat?.id) === Number(liveParticipant?.seatId))
      || seats.find((seat) => !seat?.isHero && !seat?.folded && Number(seat?.id) !== Number(opener?.id))
      || (opener && !opener.folded ? opener : null);
    const openerProfile = opener?.botProfile || opener?.profile || {};
    const callerProfile = caller?.botProfile || caller?.profile || {};
    const openerCombo = comboLabel(opener?.cards);
    const callerCombo = comboLabel(liveParticipant?.cards) || comboLabel(caller?.cards);
    return {
      schema: "poker-resteal-advice-hand-v1",
      spotType: String(drill.actual?.kind || drill.target?.kind || "other"),
      openerSeatId: Number.isFinite(Number(opener?.id)) ? Number(opener.id) : null,
      openerPosition: String(opener?.position || drill.actual?.opener || drill.target?.opener || ""),
      openerName: String(opener?.name || ""),
      openerCombo,
      openerGroups: handGroups(openerCombo),
      openerTier: botTier(openerProfile),
      callerSeatId: Number.isFinite(Number(caller?.id)) ? Number(caller.id) : null,
      callerPosition: String(caller?.position || liveParticipant?.position || ""),
      callerName: String(caller?.name || liveParticipant?.name || ""),
      callerCombo,
      callerGroups: handGroups(callerCombo),
      callerTier: botTier(callerProfile),
      heroCombo: String(table.combo || comboLabel(table.heroHand) || ""),
      heroGroups: handGroups(table.combo || comboLabel(table.heroHand)),
      openSizeBb: Number(drill.openSizeBb || drill.actual?.openTo || 0),
      bankBeforeHeroBb: Number(drill.bankBeforeHeroBb || 0),
      effectiveStackBb: Number(drill.effectiveStackBb || table.stackDepth || 0),
      unequalStacks: Boolean(drill.unequalStacks)
    };
  }

  function installEngine(engine) {
    if (!engine?.registerPack) return false;
    engine.registerPack(PACK_KEY, {
      name: "Рестил с BB · демо",
      stackDepths: [25, 30, 35, 40],
      playableWeight: 0.75,
      spots: [{
        key: "bb-decision",
        title: "BB: прочитай действие перед тобой",
        heroPosition: "BB",
        villainPosition: "BTN",
        prompt: "Твой ход на большом блайнде"
      }]
    });

    if (!engine.__restealAdviceSnapshotWrapped && typeof engine.snapshotHandHistory === "function") {
      const snapshotHandHistory = engine.snapshotHandHistory.bind(engine);
      engine.snapshotHandHistory = function snapshotRestealHandHistory(table) {
        const snapshot = snapshotHandHistory(table);
        if (snapshot && table?.restealDrill) snapshot.restealAdvice = tableAdviceSnapshot(table);
        return snapshot;
      };
      Object.defineProperty(engine, "__restealAdviceSnapshotWrapped", { value: true, configurable: true });
    }

    return true;
  }

  function scenarioSettings() {
    return {
      pack: PACK_KEY,
      playerCount: 6,
      simulationMode: "random",
      randomStackMinBb: 25,
      randomStackMaxBb: 40,
      anteBb: 0,
      bigBlindAnteBb: 1,
      lobbyEvents: false
    };
  }

  function practiceScenario({ handNo }) {
    const plan = planForHand(handNo);
    const beforeHero = [];
    if (plan.kind === "single-open") beforeHero.push({ position: plan.opener, action: "open", toBb: 2 });
    if (plan.kind === "early-open") beforeHero.push({ position: "UTG", action: "open", toBb: 2 });
    if (plan.kind === "open-call") beforeHero.push(
      { position: "CO", action: "open", toBb: 2 },
      { position: "BTN", action: "call" }
    );
    if (plan.kind === "limp") beforeHero.push({ position: "SB", action: "limp", toBb: 1 });
    return { beforeHero, defaultBeforeHero: { action: "fold" } };
  }

  function decorateScenario(table, { handNo, attempts }) {
    const plan = planForHand(handNo);
    const actual = classify(table);
    const selectedOpener = openerSeat(table);
    const hero = (table.seats || []).find((seat) => seat?.isHero) || null;
    const heroStart = seatStartingStack(table, hero) || Number(table.stackDepth || 0);
    const openerStart = seatStartingStack(table, selectedOpener) || heroStart;
    const effectiveStack = [heroStart, openerStart].filter((value) => Number.isFinite(value) && value > 0);
    table.restealDrill = {
      schema: "poker-resteal-drill-hand-v2",
      index: handNo,
      target: { ...plan },
      actual,
      openerSeatId: Number.isFinite(Number(selectedOpener?.id)) ? Number(selectedOpener.id) : null,
      openSizeBb: Number(actual.openTo || 0),
      bankBeforeHeroBb: Number(table.pot || 0),
      effectiveStackBb: effectiveStack.length ? Math.min(...effectiveStack) : Number(table.stackDepth || 0),
      unequalStacks: Math.abs(heroStart - openerStart) >= 0.5,
      attempts
    };
    table.spot = {
      ...table.spot,
      prompt: "Сначала прочитай экшен. Затем выбери обычное действие симулятора.",
      tags: [...new Set([...(table.spot?.tags || []), "resteal-demo", plan.trick ? "attention-check" : "core-resteal"])]
    };
    lastCombo = table.combo || "";
    if (lastCombo) seenCombos.add(lastCombo);
    return table;
  }

  function installPack(engine) {
    let registry = root.PokerSimulatorPracticePacks;
    if (!registry && typeof require === "function") {
      try { registry = require("../poker-simulator/simulator-practice-packs.js"); } catch (_) {}
    }
    if (registry?.installForEngine) return registry.installForEngine(practiceDescriptor, engine, { force: true });
    return installEngine(engine);
  }

  function completedEntries(payload) {
    const sessionId = String(payload?.sessionId || "");
    const seen = new Set();
    return (Array.isArray(payload?.handLog) ? payload.handLog : []).filter((entry) => {
      const key = String(entry?.id || `${entry?.sessionId || ""}:${entry?.handNo || 0}:${entry?.tableId || 0}`);
      if (!entry || seen.has(key)) return false;
      if (sessionId && String(entry.sessionId || "") !== sessionId) return false;
      if (String(entry.settings?.pack || "") !== PACK_KEY) return false;
      seen.add(key);
      return true;
    });
  }

  function decisionsForEntry(payload, entry) {
    return (Array.isArray(payload?.decisions) ? payload.decisions : []).filter((decision) =>
      Number(decision?.no) === Number(entry?.handNo)
      && Number(decision?.tableId) === Number(entry?.tableId)
    );
  }

  function decisionForEntry(payload, entry) {
    const decisions = decisionsForEntry(payload, entry);
    return [...decisions].reverse().find((decision) => /preflop/i.test(String(decision?.street || "")))
      || decisions[decisions.length - 1]
      || null;
  }

  function heroPreflopJam(entry, decision = null) {
    const actions = Array.isArray(entry?.handHistory?.actions) ? entry.handHistory.actions : [];
    const timelineJam = actions.some((event) => {
      const phase = String(event?.phase || "").toLowerCase();
      const street = String(event?.street || event?.state?.street || "").toLowerCase();
      const label = String(event?.label || event?.text || event?.action || "").trim();
      return (!phase || phase === "action")
        && (!street || street === "preflop")
        && Number(event?.seatId) === 0
        && (event?.allIn === true || /^(?:all[\s-]?in|олл[\s-]?ин)(?:$|\s|·)/i.test(label));
    });
    if (timelineJam) return true;
    if (!decision || !/preflop/i.test(String(decision.street || ""))) return false;
    if (String(decision.action || "").toLowerCase() === "allin") return true;
    const aggressive = ["raise-custom", "open", "raise-half"].includes(String(decision.action || "").toLowerCase());
    const stackDepth = Number(entry?.handHistory?.stackDepth || 0);
    const amount = Number(decision.amount || 0);
    return aggressive && stackDepth > 0 && amount >= stackDepth - 0.2;
  }

  function wonByFoldAfterJam(entry, decision = null) {
    if (!heroPreflopJam(entry, decision) || !entry?.result?.won) return false;
    const history = entry.handHistory || {};
    return !entry.result.showdown && !history.showdown && !history.allInRunout;
  }

  function sampledAllInEquity(entry) {
    const runout = entry?.handHistory?.allInRunout;
    if (!runout) return false;
    if (runout.sampled) return true;
    return (Array.isArray(runout.stages) ? runout.stages : []).some((stage) => stage?.sampled);
  }

  function sessionDrillMetrics(payload, app = root.PokerSimulatorApp) {
    const entries = completedEntries(payload);
    const jams = entries.filter((entry) => heroPreflopJam(entry, decisionForEntry(payload, entry)));
    const folds = jams.filter((entry) => wonByFoldAfterJam(entry, decisionForEntry(payload, entry)));
    const aggregate = typeof app?.aggregatePokerStats === "function"
      ? app.aggregatePokerStats(entries)
      : {
          netBb: entries.reduce((sum, entry) => sum + Number(entry?.result?.netBb || 0), 0),
          evNetBb: entries.reduce((sum, entry) => sum + Number(entry?.result?.netBb || 0), 0)
        };
    return {
      entries,
      hands: entries.length,
      jams: jams.length,
      folds: folds.length,
      netBb: Number(aggregate?.netBb || 0),
      evNetBb: Number(aggregate?.evNetBb || 0),
      sampled: entries.some(sampledAllInEquity)
    };
  }

  function comboLabel(cards) {
    const list = Array.isArray(cards) ? cards.slice(0, 2).map(String) : [];
    if (list.length < 2) return "";
    const rank = (card) => card.slice(0, -1).toUpperCase().replace("10", "T");
    const values = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
    let first = rank(list[0]);
    let second = rank(list[1]);
    if (first === second) return `${first}${second}`;
    if ((values[second] || 0) > (values[first] || 0)) [first, second] = [second, first];
    return `${first}${second}${list[0].slice(-1) === list[1].slice(-1) ? "s" : "o"}`;
  }

  function handGroups(input) {
    const combo = Array.isArray(input) ? comboLabel(input) : String(input || "").trim();
    if (!combo) return ["unknown"];
    const first = combo[0]?.toUpperCase();
    const second = combo[1]?.toUpperCase();
    const suited = combo.endsWith("s");
    const pair = first && first === second;
    const values = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
    const high = Math.max(values[first] || 0, values[second] || 0);
    const low = Math.min(values[first] || 0, values[second] || 0);
    const tags = new Set(["any"]);
    if (!pair) tags.add("unpaired");
    if (pair) {
      tags.add("pair");
      tags.add("pair_or_ace_or_broadway");
      tags.add("pair_or_strong_defend");
      if (high <= 6) tags.add("small_pair");
      if (high >= 7 && high <= 9) tags.add("medium_pair");
      if (high <= 9) tags.add("small_or_medium_pair");
      if (high >= 10) {
        tags.add("premium_pair");
        tags.add("premium");
      }
    }
    if (first === "A") {
      tags.add("ace_x");
      tags.add("ace");
      tags.add("pair_or_ace_or_broadway");
      tags.add("pair_or_strong_defend");
      if (low >= 11) tags.add("strong_ace");
      else tags.add("weak_ace");
      if (low >= 12) tags.add("premium");
    }
    if (!pair && high >= 10 && low >= 10) {
      tags.add("broadway");
      tags.add("two_high_cards");
      tags.add("pair_or_ace_or_broadway");
      tags.add("pair_or_strong_defend");
      if (high >= 13 && low >= 11) tags.add("strong_broadway");
      else tags.add("medium_broadway");
    }
    if (!pair && suited && high <= 9 && high - low <= 1) {
      tags.add("suited_connector_low");
      tags.add("connector");
    }
    if (!pair && !suited && high <= 11) tags.add("weak_offsuit");
    const playable = pair || first === "A" || high >= 11 || tags.has("suited_connector_low");
    if (playable) {
      tags.add("playable");
      tags.add("non_trash");
    } else {
      tags.add("trash");
      tags.add("trash_or_marginal");
    }
    if (tags.has("medium_pair") || tags.has("strong_broadway")) tags.add("medium_pair_or_strong_broadway");
    if (tags.has("premium") || tags.has("pair") || tags.has("broadway")) tags.add("medium_or_strong");
    if (!tags.has("premium")) tags.add("weak_or_medium");
    if (!tags.has("premium") && !pair) tags.add("weaker_unpaired");
    if (tags.has("medium_broadway")) tags.add("weaker_broadway");
    if (tags.has("premium")) tags.add("strong");
    else if (tags.has("medium_pair") || tags.has("strong_ace") || tags.has("broadway")) tags.add("strong");
    else if (tags.has("small_pair") || tags.has("weak_ace") || tags.has("connector") || high >= 11) tags.add("marginal");
    return [...tags];
  }

  function foldedOpener(entry) {
    const history = entry?.handHistory || {};
    const actions = Array.isArray(history.actions) ? history.actions : [];
    const heroJamIndex = actions.findIndex((event) => Number(event?.seatId) === 0 && /^(?:all[\s-]?in|олл[\s-]?ин)/i.test(String(event?.label || "")));
    const beforeJam = heroJamIndex >= 0 ? actions.slice(0, heroJamIndex) : actions;
    const opener = [...beforeJam].reverse().find((event) =>
      Number(event?.seatId) !== 0
      && String(event?.street || event?.state?.street || "preflop") === "preflop"
      && /^(?:raise|рейз|all[\s-]?in|олл[\s-]?ин)/i.test(String(event?.label || ""))
    );
    const seats = Array.isArray(history.seats) ? history.seats : [];
    const seat = seats.find((item) => Number(item?.id) === Number(opener?.seatId))
      || seats.find((item) => !item?.isHero && item?.folded && Array.isArray(item?.cards) && item.cards.length >= 2);
    return seat?.folded && Array.isArray(seat.cards) && seat.cards.length >= 2 ? seat : null;
  }

  function foldedHandKind(cards) {
    const list = Array.isArray(cards) ? cards.slice(0, 2).map(String) : [];
    if (list.length < 2) return "";
    const ranks = list.map((card) => card.slice(0, -1).toUpperCase().replace("10", "T"));
    const pair = ranks[0] === ranks[1];
    const suitedKj = new Set(ranks).has("K") && new Set(ranks).has("J") && list[0].slice(-1) === list[1].slice(-1);
    if (pair || suitedKj) return "normal";
    const values = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
    if (!ranks.includes("A") && Math.max(...ranks.map((rank) => values[rank] || 0)) <= 10) return "trash";
    return "";
  }

  function strongCalledHand(entry) {
    const seats = Array.isArray(entry?.handHistory?.seats) ? entry.handHistory.seats : [];
    const villain = seats.find((seat) => !seat?.isHero && !seat?.folded && Array.isArray(seat?.cards) && seat.cards.length >= 2);
    if (!villain) return "";
    const ranks = villain.cards.slice(0, 2).map((card) => String(card).slice(0, -1).toUpperCase().replace("10", "T"));
    const values = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
    const premiumPair = ranks[0] === ranks[1] && (values[ranks[0]] || 0) >= 10;
    const premiumAce = ranks.includes("A") && (ranks.includes("K") || ranks.includes("Q"));
    return premiumPair || premiumAce ? comboLabel(villain.cards) : "";
  }

  function greenCallerHand(entry) {
    const seats = Array.isArray(entry?.handHistory?.seats) ? entry.handHistory.seats : [];
    const villain = seats.find((seat) => {
      if (seat?.isHero || seat?.folded) return false;
      const profile = seat?.botProfile || seat?.profile || {};
      const difficulty = String(profile.difficulty || "").toLowerCase();
      const style = String(profile.style || profile.archetype || "").toLowerCase();
      return ["easy", "loose", "weak"].includes(difficulty) || ["fish", "station"].includes(style);
    });
    if (!villain) return "";
    return comboLabel(villain.cards) || "широкой рукой";
  }

  function entryKey(entry) {
    return String(entry?.id || `${entry?.sessionId || ""}:${entry?.handNo || 0}:${entry?.tableId || 0}`);
  }

  function heroActionForEntry(payload, entry) {
    const decision = decisionForEntry(payload, entry);
    const action = String(decision?.action || "").toLowerCase();
    if (action === "allin") return "jam";
    if (["raise-custom", "open", "raise-half"].includes(action)) {
      return heroPreflopJam(entry, decision) ? "jam" : "raise";
    }
    if (["fold", "call", "check"].includes(action)) return action;
    const event = (Array.isArray(entry?.handHistory?.actions) ? entry.handHistory.actions : []).find((item) =>
      Number(item?.seatId) === 0
      && String(item?.phase || "action") === "action"
      && String(item?.street || item?.state?.street || "preflop") === "preflop"
    );
    const label = String(event?.label || event?.text || "").toLowerCase();
    if (/all[\s-]?in|олл[\s-]?ин/.test(label)) return "jam";
    if (/raise|рейз/.test(label)) return "raise";
    if (/call|колл/.test(label)) return "call";
    if (/check|чек/.test(label)) return "check";
    if (/fold|pass|пас/.test(label)) return "fold";
    return "";
  }

  function responseForEntry(entry, heroAction, decision = null) {
    const history = entry?.handHistory || {};
    const showdown = Boolean(entry?.result?.showdown || history.showdown || history.allInRunout);
    if (heroAction === "jam") {
      if (showdown) return "call";
      if (wonByFoldAfterJam(entry, decision)) return "fold";
      return "";
    }
    if (heroAction !== "raise") return "none";
    const actions = Array.isArray(history.actions) ? history.actions : [];
    const heroRaiseIndex = actions.findIndex((event) =>
      Number(event?.seatId) === 0
      && /raise|рейз/i.test(String(event?.label || ""))
    );
    const afterRaise = heroRaiseIndex >= 0 ? actions.slice(heroRaiseIndex + 1) : [];
    if (afterRaise.some((event) => Number(event?.seatId) !== 0 && /all[\s-]?in|олл[\s-]?ин|raise|рейз/i.test(String(event?.label || "")))) return "four_bet";
    if (entry?.result?.won && !showdown && !(Array.isArray(history.board) && history.board.length)) return "fold_to_raise";
    return "none";
  }

  function outcomeForAdvice(entry, heroAction, response) {
    const history = entry?.handHistory || {};
    const outcome = String(entry?.result?.outcome || "").toLowerCase();
    if (outcome === "split" || outcome === "chop") return "split";
    if (heroAction === "jam" && response === "fold") return "preflop_win";
    if (entry?.result?.showdown || history.showdown || history.allInRunout) return entry?.result?.won ? "win" : "loss";
    const reachedPostflop = (Array.isArray(history.board) && history.board.length > 0)
      || (Array.isArray(history.actions) && history.actions.some((event) => ["flop", "turn", "river"].includes(String(event?.street || ""))));
    if (reachedPostflop) return entry?.result?.won ? "postflop_win" : "postflop_loss";
    return entry?.result?.won ? "preflop_win" : "loss";
  }

  function adviceSpotType(value) {
    const kind = String(value || "other");
    if (kind === "single-open") return "single-open";
    if (kind === "early-open") return "early-open";
    if (kind === "open-call") return "open-call";
    if (kind === "limp") return "limp";
    return "other";
  }

  function heroEquityForEntry(entry) {
    const stages = Array.isArray(entry?.handHistory?.allInRunout?.stages) ? entry.handHistory.allInRunout.stages : [];
    const stage = stages[0] || null;
    const rows = Array.isArray(stage?.handEquities) && stage.handEquities.length ? stage.handEquities : stage?.equities;
    const hero = (Array.isArray(rows) ? rows : []).find((row) => row?.isHero || Number(row?.seatId) === 0);
    return Number.isFinite(Number(hero?.equity)) ? Number(hero.equity) : null;
  }

  function equityLeadChanged(entry) {
    const stages = Array.isArray(entry?.handHistory?.allInRunout?.stages) ? entry.handHistory.allInRunout.stages : [];
    const sides = stages.map((stage) => {
      const rows = Array.isArray(stage?.handEquities) && stage.handEquities.length ? stage.handEquities : stage?.equities;
      const hero = (Array.isArray(rows) ? rows : []).find((row) => row?.isHero || Number(row?.seatId) === 0);
      const equity = Number(hero?.equity);
      return Number.isFinite(equity) ? Math.sign(equity - 0.5) : 0;
    }).filter(Boolean);
    return sides.some((side, index) => index > 0 && side !== sides[index - 1]);
  }

  function addRelationalGroups(context) {
    const hero = String(context.heroCombo || "");
    const caller = String(context.callerCombo || "");
    const ranks = (combo) => [combo[0], combo[1]];
    const values = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
    const heroRanks = ranks(hero);
    const callerRanks = ranks(caller);
    if (heroRanks[0] === "A" && callerRanks[0] === "A" && (values[callerRanks[1]] || 0) > (values[heroRanks[1]] || 0)) {
      context.callerGroup = [...new Set([...(context.callerGroup || []), "better_ace"])];
    }
    return context;
  }

  function buildPostHandContext(payload, entry, metrics = null, entries = completedEntries(payload)) {
    if (!entry || !entry.result || !entry.handHistory) return null;
    const decision = decisionForEntry(payload, entry);
    const heroAction = heroActionForEntry(payload, entry);
    if (!heroAction) return null;
    const response = responseForEntry(entry, heroAction, decision);
    if (heroAction === "jam" && !response) return null;
    const advice = entry.handHistory.restealAdvice || {};
    const heroCombo = String(entry?.hero?.combo || advice.heroCombo || entry?.handHistory?.combo || comboLabel(entry?.hero?.hand) || "");
    const heroGroup = handGroups(heroCombo);
    const openerGroup = Array.isArray(advice.openerGroups) ? advice.openerGroups : handGroups(advice.openerCombo);
    const callerGroup = Array.isArray(advice.callerGroups) ? advice.callerGroups : handGroups(advice.callerCombo);
    const heroEquity = heroEquityForEntry(entry);
    const openerName = String(advice.openerName || "");
    const priorSameVillain = (Array.isArray(entries) ? entries : []).filter((other) => {
      if (entryKey(other) === entryKey(entry)) return false;
      const otherAdvice = other?.handHistory?.restealAdvice || {};
      return openerName && String(otherAdvice.openerName || "") === openerName;
    });
    const drillMetrics = metrics || sessionDrillMetrics(payload);
    const context = {
      entryId: entryKey(entry),
      handNo: Number(entry.handNo || 0),
      heroAction,
      response,
      outcome: outcomeForAdvice(entry, heroAction, response),
      spotType: adviceSpotType(advice.spotType || planForHand(entry.handNo).kind),
      heroCombo,
      heroGroup,
      openerCombo: String(advice.openerCombo || ""),
      openerGroup,
      openerPosition: String(advice.openerPosition || ""),
      callerCombo: String(advice.callerCombo || ""),
      callerGroup,
      botTier: response === "call" ? String(advice.callerTier || "unknown") : String(advice.openerTier || "unknown"),
      bankBb: Number(advice.bankBeforeHeroBb || 0),
      openSizeBb: Number(advice.openSizeBb || 0),
      effectiveStackBb: Number(advice.effectiveStackBb || entry.handHistory.stackDepth || 0),
      unequalStacks: Boolean(advice.unequalStacks),
      heroEquity,
      equityPct: heroEquity,
      equityLeadChanged: equityLeadChanged(entry),
      repeatedVillain: priorSameVillain.length > 0,
      sameVillainSpots: priorSameVillain.length + 1,
      villainSpotCount: priorSameVillain.length + 1,
      sessionHands: Number(drillMetrics?.hands || 0),
      sessionJams: Number(drillMetrics?.jams || 0),
      sessionFoldsToJam: Number(drillMetrics?.folds || 0),
      sessionNetBb: Number(drillMetrics?.netBb || 0),
      sessionAllInEvBb: Number(drillMetrics?.evNetBb || 0)
    };
    return addRelationalGroups(context);
  }

  function ensureWisdomToast() {
    if (!root.document) return null;
    let toast = root.document.querySelector("[data-resteal-wisdom]");
    if (toast) return toast;
    toast = root.document.createElement("aside");
    toast.className = "resteal-wisdom-toast";
    toast.dataset.restealWisdom = "";
    toast.setAttribute("role", "region");
    toast.setAttribute("aria-label", "Совет после раздачи");
    toast.innerHTML = '<button type="button" class="resteal-wisdom-close" aria-label="Закрыть совет">×</button><div class="resteal-wisdom-live" role="status" aria-live="polite" aria-atomic="true"><small data-resteal-wisdom-kicker>Совет после раздачи</small><strong></strong><p></p></div><div class="resteal-wisdom-actions" data-resteal-wisdom-actions hidden></div>';
    toast.querySelector(".resteal-wisdom-close").addEventListener("click", () => {
      root.clearTimeout(wisdomTimer);
      toast.classList.remove("is-visible");
      if (pendingCompletionCount) scheduleCompletionToast(pendingCompletionCount, 180);
    });
    root.document.body.appendChild(toast);
    return toast;
  }

  function showAdviceTip(tip, context = {}) {
    const catalog = root.PokerRestealAdvice;
    const message = catalog?.renderTip?.(tip, context);
    const toast = ensureWisdomToast();
    if (!message || !toast) return false;
    const catalogIndex = Math.max(0, catalog.TIPS.findIndex((item) => item.id === tip.id));
    root.clearTimeout(wisdomTimer);
    toast.dataset.mode = "advice";
    toast.dataset.tipId = String(tip.id || "");
    toast.dataset.tipFamily = String(tip.family || "");
    toast.querySelector("[data-resteal-wisdom-kicker]").textContent = `Совет после раздачи · ${catalogIndex + 1} из ${catalog.TIPS.length}`;
    toast.querySelector("strong").textContent = message.title;
    toast.querySelector("p").textContent = message.copy;
    const actions = toast.querySelector("[data-resteal-wisdom-actions]");
    actions.replaceChildren();
    actions.hidden = true;
    toast.classList.add("is-visible");
    wisdomTimer = root.setTimeout(() => {
      toast.classList.remove("is-visible");
      if (pendingCompletionCount) scheduleCompletionToast(pendingCompletionCount, 180);
    }, 6800);
    return true;
  }

  function showSessionComplete(total = sessionHands()) {
    const toast = ensureWisdomToast();
    if (!toast) return false;
    root.clearTimeout(wisdomTimer);
    root.clearTimeout(completionTimer);
    pendingCompletionCount = 0;
    toast.dataset.mode = "complete";
    delete toast.dataset.tipId;
    delete toast.dataset.tipFamily;
    toast.querySelector("[data-resteal-wisdom-kicker]").textContent = "Сессия завершена";
    toast.querySelector("strong").textContent = `Сыграны все ${total} раздач. Сыграть ещё?`;
    toast.querySelector("p").textContent = "Выбери, сколько раздач запустить в новой чистой сессии.";
    const actions = toast.querySelector("[data-resteal-wisdom-actions]");
    actions.replaceChildren();
    actions.hidden = false;
    [10, 25, 50, 100].forEach((count) => {
      const button = root.document.createElement("button");
      button.type = "button";
      button.textContent = String(count);
      button.setAttribute("aria-label", `Сыграть ещё ${count} раздач`);
      button.addEventListener("click", () => restartSession(count));
      actions.appendChild(button);
    });
    toast.classList.add("is-visible");
    return true;
  }

  function scheduleCompletionToast(total, delay = 7200) {
    pendingCompletionCount = Number(total || sessionHands());
    root.clearTimeout(completionTimer);
    completionTimer = root.setTimeout(() => showSessionComplete(pendingCompletionCount), Math.max(0, Number(delay || 0)));
  }

  function updateDrillAdvice(payload, entries, metrics = null) {
    const catalog = root.PokerRestealAdvice;
    if (!catalog?.selectTip) return false;
    for (const entry of entries) {
      const id = entryKey(entry);
      if (!id || processedAdviceEntryIds.has(id)) continue;
      const context = buildPostHandContext(payload, entry, metrics, entries);
      if (!context) continue;
      const tip = catalog.selectTip(context, adviceSelectionState, `${entry?.sessionId || payload?.sessionId || ""}:${entry?.handNo || 0}`);
      if (!tip) {
        processedAdviceEntryIds.add(id);
        continue;
      }
      if (!showAdviceTip(tip, context)) return false;
      processedAdviceEntryIds.add(id);
      adviceSelectionState.usage[tip.id] = Number(adviceSelectionState.usage[tip.id] || 0) + 1;
      adviceSelectionState.lastIds = [...adviceSelectionState.lastIds, tip.id].slice(-3);
      adviceSelectionState.lastFamily = tip.family;
      return true;
    }
    return false;
  }

  function formatBb(value, approximate = false) {
    const numeric = Number(value || 0);
    const normalized = Math.abs(numeric) < 0.05 ? 0 : numeric;
    return `${approximate ? "≈" : ""}${normalized >= 0 ? "+" : "−"}${Math.abs(normalized).toFixed(1).replace(".", ",")} BB`;
  }

  function installHud() {
    if (!active || !root.document) return;
    const total = sessionHands();
    const topbar = root.document.querySelector(".topbar");
    if (!topbar || topbar.querySelector("[data-resteal-drill-hud]")) return;
    const hud = root.document.createElement("section");
    hud.className = "resteal-drill-hud";
    hud.dataset.restealDrillHud = "";
    hud.setAttribute("aria-live", "polite");
    hud.innerHTML = `<div class="resteal-drill-title"><strong>Рестил · BB</strong><span>25–40 BB · BB ante</span></div>
      <div class="resteal-drill-stats">
        <span><small>Руки</small><b data-resteal-hands>0 / ${total}</b></span>
        <span><small>Пуши</small><b data-resteal-jams>0</b></span>
        <span><small>Пас на пуш</small><b data-resteal-folds>0</b></span>
        <span><small>По факту</small><b data-resteal-net>+0,0 BB</b></span>
        <span title="All-in EV убирает удачу вскрытия, но не оценивает правильность решения"><small>По эквити</small><b data-resteal-ev>+0,0 BB</b></span>
      </div>`;
    topbar.prepend(hud);

    let lastSignature = "";
    const update = () => {
      const snapshot = root.PokerSimulatorApp?.sessionSnapshot?.();
      const payload = root.PokerSimulatorApp?.currentSessionPayload?.() || {};
      const latestLog = Array.isArray(payload.handLog) ? payload.handLog[0] : null;
      const signature = `${Number(snapshot?.hands || payload.handLog?.length || 0)}:${latestLog?.id || snapshot?.latestHand?.id || snapshot?.latestHand?.no || ""}:${payload.decisions?.length || 0}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      const metrics = sessionDrillMetrics(payload);
      const played = Math.min(total, metrics.hands);
      const foldRate = metrics.jams ? Math.round(metrics.folds / metrics.jams * 100) : 0;
      hud.querySelector("[data-resteal-hands]").textContent = `${played} / ${total}${played >= total ? " · готово" : ""}`;
      hud.querySelector("[data-resteal-jams]").textContent = String(metrics.jams);
      hud.querySelector("[data-resteal-folds]").textContent = metrics.jams ? `${metrics.folds} · ${foldRate}%` : "0";
      const netMetric = hud.querySelector("[data-resteal-net]");
      const evMetric = hud.querySelector("[data-resteal-ev]");
      netMetric.textContent = formatBb(metrics.netBb);
      evMetric.textContent = formatBb(metrics.evNetBb, metrics.sampled);
      [[netMetric, metrics.netBb], [evMetric, metrics.evNetBb]].forEach(([element, value]) => {
        const numeric = Number(value) || 0;
        element.classList.toggle("is-positive", numeric > 0.005);
        element.classList.toggle("is-negative", numeric < -0.005);
      });
      const adviceShown = updateDrillAdvice(payload, metrics.entries, metrics);
      hud.classList.toggle("is-complete", played >= total);
      hud.setAttribute("aria-label", `Сыграно ${played} из ${total}. Пушей ${metrics.jams}. Пасов на пуш ${metrics.folds}. По факту ${formatBb(metrics.netBb)}. По эквити ${formatBb(metrics.evNetBb, metrics.sampled)}.`);
      if (played >= total && !completionHintScheduled) {
        completionHintScheduled = true;
        scheduleCompletionToast(total, adviceShown ? 7200 : 1300);
      }
    };

    update();
    const timer = root.setInterval(update, 300);
    root.addEventListener("pagehide", () => root.clearInterval(timer), { once: true });
  }

  function restartSession(hands = sessionHands()) {
    const url = new URL(root.location.href);
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    url.searchParams.set("hands", String(sessionHands(hands)));
    url.searchParams.set("run", token);
    root.location.assign(url.href);
  }

  function installRestartHandler() {
    if (!active || !root.document || restartHandlerInstalled) return;
    restartHandlerInstalled = true;
    root.document.addEventListener("click", (event) => {
      const button = event.target?.closest?.('[data-action="resteal-play-again"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      restartSession();
    }, true);
  }

  const practiceDescriptor = {
    id: "resteal",
    aliases: ["bb-resteal"],
    packKey: PACK_KEY,
    storageSuffix: "resteal-bb-demo",
    applyBootSettings,
    installEngine,
    scenario: {
      freshDeal: true,
      // Scenario shape is deterministic in one deal. Additional deals are used
      // only to preserve the lesson's no-repeat Hero-combo promise.
      maxAttempts: 320,
      onFailure: "error",
      failureMessage: ({ handNo }) => `Resteal practice scenario ${planForHand(handNo).kind} was not generated`,
      heroPosition: "BB",
      settings: scenarioSettings,
      practiceScenario,
      accept: (table, { handNo, attempts }) => matchesPlan(table, planForHand(handNo))
        && !((lastCombo === table.combo || seenCombos.has(table.combo)) && attempts < 160),
      decorate: decorateScenario
    },
    defaultBetAmount({ table, bounds, value, draft }) {
      if (draft || table?.street !== "preflop" || Number(table?.toCall || 0) <= 0) return value;
      return bounds.max;
    },
    sessionCompleteAction: { action: "resteal-play-again", label: "Сыграть ещё" }
  };

  const api = {
    active,
    packKey: PACK_KEY,
    storageSuffix: "resteal-bb-demo",
    sessionHands,
    planForHand,
    realLimpSeatIds,
    classify,
    matchesPlan,
    applyBootSettings,
    practiceDescriptor,
    installEngine,
    installPack,
    completedEntries,
    decisionsForEntry,
    decisionForEntry,
    heroPreflopJam,
    wonByFoldAfterJam,
    sessionDrillMetrics,
    comboLabel,
    handGroups,
    botTier,
    tableAdviceSnapshot,
    foldedHandKind,
    strongCalledHand,
    greenCallerHand,
    heroActionForEntry,
    responseForEntry,
    outcomeForAdvice,
    buildPostHandContext,
    showAdviceTip,
    showSessionComplete,
    updateDrillAdvice,
    formatBb,
    installHud,
    restartSession,
    installRestartHandler
  };

  root.PokerRestealSimulatorPack = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PokerSimulatorPracticePacks?.register?.(practiceDescriptor);
  if (!active) return;

  if (root.document?.documentElement?.dataset) {
    root.document.documentElement.dataset.restealDrill = "true";
    // Keep the simulator's native 1920×1080 table plane. The denser teaching
    // profile enlarged the entire table inside a laptop iframe and made fixed-
    // pixel cards/controls collide with their felt lanes.
    delete root.document.documentElement.dataset.simulatorStageProfile;
  }
  if (!root.PokerSimulatorPracticePacks) installPack(root.PokerSimulatorEngine);
  if (root.document?.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", () => {
      installHud();
      installRestartHandler();
    }, { once: true });
  } else {
    installHud();
    installRestartHandler();
  }
})();
