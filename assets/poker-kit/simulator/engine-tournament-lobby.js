// Tournament, lobby, hero-action orchestration, and bot-only hand flow. Loaded before simulator-engine.js facade.
  function preflopOrderAfterHero(table) {
    const index = table.positions.indexOf(table.heroPosition);
    const start = index >= 0 ? index + 1 : 0;
    return [...table.positions.slice(start), ...table.positions.slice(0, start)];
  }

  function postflopOrderedContestingSeats(table) {
    const { dealer } = blindPositions(table.positions);
    const order = clockwisePositionsForCount(table.positions.length);
    const dealerIndex = order.indexOf(dealer);
    const startIndex = dealerIndex >= 0 ? dealerIndex : 0;
    const ids = contestingSeatIdSet(table);
    const seats = [];

    for (let offset = 1; offset <= order.length; offset += 1) {
      const position = order[(startIndex + offset) % order.length];
      const seat = table.seats.find((candidate) =>
        candidate.position === position
        && !candidate.folded
        && ids.has(candidate.id)
      );
      if (seat) seats.push(seat);
    }

    return seats;
  }

  // C1b: postflop relative-position contract. Returns true if seatA acts AFTER seatB in the postflop
  // order (button-relative: the seat left of the dealer acts first, the dealer acts last — a later
  // action rank means more "in position"). This is a pure position relationship, so it is valid on any
  // street (the 4bet sizing in C2 calls it preflop). Returns null when either seat is missing, folded,
  // or non-active (sitting-out / disconnected / eliminated), or when both are the same seat; callers
  // must treat null as a safe out-of-position default rather than guessing.
  function isInPositionVs(table, seatA, seatB) {
    if (!table || !seatA || !seatB) return null;
    if (!Array.isArray(table.positions) || !table.positions.length) return null;
    const isLive = (seat) => seat && !seat.folded && (seat.lobbyState || "active") === "active";
    if (!isLive(seatA) || !isLive(seatB)) return null;
    if (Number(seatA.id) === Number(seatB.id)) return null;
    const { dealer } = blindPositions(table.positions);
    const order = clockwisePositionsForCount(table.positions.length);
    const dealerIndex = order.indexOf(dealer);
    const startIndex = dealerIndex >= 0 ? dealerIndex : 0;
    const rankOf = (position) => {
      for (let offset = 1; offset <= order.length; offset += 1) {
        if (order[(startIndex + offset) % order.length] === position) return offset;
      }
      return -1;
    };
    const rankA = rankOf(seatA.position);
    const rankB = rankOf(seatB.position);
    if (rankA < 0 || rankB < 0) return null;
    return rankA > rankB;
  }

  function choosePrimaryPostflopVillain(table) {
    const orderedOpponent = postflopOrderedContestingSeats(table).find((seat) => !seat.isHero);
    if (orderedOpponent) return orderedOpponent.id;
    const liveOpponent = liveContestingOpponents(table)[0];
    return liveOpponent?.id ?? chooseDefaultVillain(table);
  }

  function markStreetAction(table, seatId) {
    if (!table || table.street === "preflop" || table.street === "showdown") return;
    table.streetActionSeatIds = Array.isArray(table.streetActionSeatIds) ? table.streetActionSeatIds : [];
    const normalizedSeatId = Number(seatId);
    if (!Number.isFinite(normalizedSeatId)) return;
    if (!table.streetActionSeatIds.map(Number).includes(normalizedSeatId)) {
      table.streetActionSeatIds.push(normalizedSeatId);
    }
  }

  function hasStreetAction(table, seatId) {
    return (table?.streetActionSeatIds || []).map(Number).includes(Number(seatId));
  }

  function nextPostflopActor(table, afterSeatId = null) {
    for (const seat of postflopSeatsAfter(table, afterSeatId)) {
      if (!seat || seat.folded || hasStreetAction(table, seat.id)) continue;
      if (remainingStack(table, seat.id) <= 0) continue;
      return seat;
    }

    return null;
  }

  function postflopSeatsAfter(table, afterSeatId = null) {
    const ordered = postflopOrderedContestingSeats(table);
    if (!ordered.length) return [];
    const startIndex = afterSeatId == null
      ? -1
      : ordered.findIndex((seat) => Number(seat.id) === Number(afterSeatId));
    const normalizedStart = Math.max(startIndex, -1);
    return ordered.map((_, offset) => ordered[(normalizedStart + offset + 1) % ordered.length]);
  }

  function refreshSpotText(table) {
    const villain = table.seats[table.activeVillain];
    let title = `${table.heroPosition} first in`;
    let prompt = `${table.heroPosition}: первый вход`;

    const isBlindCall = table.toCall > 0 && villain && Number(table.currentBet || 0) <= 1 && villain.position === "BB";
    if (isBlindCall) {
      title = `${table.heroPosition} first in`;
      prompt = `Первый вход: call ${formatBb(table.toCall)} или raise`;
    } else if (table.toCall > 0 && villain) {
      const villainAmount = contributionOf(table, villain.id);
      title = `${table.heroPosition} vs ${villain.position} open`;
      prompt = `Решение против ${villain.position} ${formatBb(villainAmount)}`;
    } else if (table.canCheck) {
      title = `${table.heroPosition} option`;
      prompt = "BB option: check или raise";
    }

    table.spot = {
      ...table.spot,
      title,
      prompt,
      heroPosition: table.heroPosition,
      villainPosition: villain?.position || table.spot.villainPosition
    };
    table.lastAction = !isBlindCall && table.toCall > 0
      ? `Ждем Hero vs ${villain?.position || "open"}`
      : "Ждем решение Hero";
  }

  function simulationMode(settings) {
    const raw = String(settings?.simulationMode || "").toLowerCase();
    if (raw === "tournament") return "tournament";
    if (raw === "fixed") return "fixed";
    return "random";
  }

  function settingsNumber(value, fallback, min = -Infinity, max = Infinity) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  }

  function settingsInteger(value, fallback, min = -Infinity, max = Infinity) {
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  }

  function randomStackRange(settings) {
    const min = settingsNumber(settings?.randomStackMinBb, 5, 1, 500);
    const max = settingsNumber(settings?.randomStackMaxBb, 150, 1, 500);
    return min <= max ? { min, max } : { min: max, max: min };
  }

  function randomStackDepth(settings) {
    const range = randomStackRange(settings);
    return roundBbValue(range.min + randomUnit() * (range.max - range.min));
  }

  function randomSeatStackDepths(count, settings) {
    return Array.from({ length: Math.max(1, Number(count || 1)) }, () => randomStackDepth(settings));
  }

  function explicitFixedStackDepth(settings) {
    const direct = Number(settings?.stackDepth);
    if (Number.isFinite(direct) && direct > 0) return roundBbValue(Math.min(500, Math.max(1, direct)));
    const starting = Number(settings?.startingStackBb);
    if (Number.isFinite(starting) && starting > 0) return roundBbValue(Math.min(500, Math.max(1, starting)));
    return null;
  }

  function tournamentBlindLevels(settings) {
    const raw = Array.isArray(settings?.tournamentBlindLevels)
      ? settings.tournamentBlindLevels.join(",")
      : String(settings?.tournamentBlindLevels || "1,2,3,5,8,12");
    const levels = raw
      .split(/[,\s;]+/)
      .map((token) => Number(String(token).replace(",", ".")))
      .filter((level) => Number.isFinite(level) && level > 0)
      .map((level) => Math.max(1, Math.round(level)));
    const normalized = levels.length ? levels : [1, 2, 3, 5, 8, 12];
    const sortedUnique = [];
    normalized.sort((first, second) => first - second).forEach((level) => {
      if (!sortedUnique.includes(level)) sortedUnique.push(level);
    });
    const trimmed = sortedUnique.slice(0, 40);
    // Blind levels are RELATIVE to the starting level: hand 1 plays the entered
    // starting stack (multiplier 1) and later levels scale the blinds up from
    // there. Without this, a schedule like "2,3,5" made hand 1 play
    // startingStack/2 BB instead of the entered depth. Default schedules already
    // start at 1, so they are unchanged.
    const base = trimmed[0] > 0 ? trimmed[0] : 1;
    // Dedup AFTER computing the rounded relative multiplier, not on the raw
    // integer levels above: roundBbValue can collapse two distinct integers
    // (e.g. 21,22 over base 21 -> 1.0 and 1.0476 -> 1.0) onto the SAME
    // multiplier. Keeping both would advance blindLevelIndex without changing
    // the blinds — a silent level-up with no blind-level-up announcement. Keep
    // only distinct multipliers so every advertised level is a real blind step. (T4)
    const multipliers = [];
    trimmed.forEach((level) => {
      const mult = roundBbValue(level / base);
      if (!multipliers.includes(mult)) multipliers.push(mult);
    });
    return multipliers;
  }

  function tournamentLevelHands(settings) {
    return settingsInteger(settings?.tournamentLevelHands, 12, 1, 200);
  }

  function tournamentLevelIndex(settings, handNo) {
    const levels = tournamentBlindLevels(settings);
    const handsPerLevel = tournamentLevelHands(settings);
    const rawIndex = Math.floor(Math.max(0, Number(handNo || 1) - 1) / handsPerLevel);
    return Math.min(levels.length - 1, Math.max(0, rawIndex));
  }

  function tournamentBlindMultiplier(settings, handNo) {
    const levels = tournamentBlindLevels(settings);
    return levels[tournamentLevelIndex(settings, handNo)] || 1;
  }

  function tournamentStartingStackDepth(settings, blindMultiplier = 1) {
    const startingStack = settingsNumber(settings?.tournamentStartingStackBb, 100, 5, 500);
    return roundBbValue(startingStack / Math.max(0.1, Number(blindMultiplier || 1)));
  }

  // scenarioHeroPosition: public practice-pack override (e.g. "SB"/"BB").
  // testHeroPosition remains the equivalent TEST-ONLY hook for geometry tests.
  // Both are applied ONLY for non-carryover
  // (cash) deals and only when it names a real position in this hand; otherwise ignored, so
  // heroPosition / seatPositions[0] / posted blind (seatBets[0]) never desync. Never set
  // from normal UX (see the gated __dealHeroAt hook).
  function createTable({ id, settings, handNo, previousTable = null, tournamentHandNo = handNo, scenarioHeroPosition = "", practiceScenario = null, testHeroPosition = "" }) {
    const pack = PACKS[settings.pack] || PACKS["basic-vpip"];
    const configuredPlayerCount = playerCount(settings);
    const configuredPositions = positionsForCount(configuredPlayerCount);
    const deck = shuffle(makeDeck());
    const mode = simulationMode(settings);
    const tournamentSequenceHandNo = Math.max(
      1,
      Number.isFinite(Number(tournamentHandNo))
        ? Math.floor(Number(tournamentHandNo))
        : Math.floor(Number(handNo || 1))
    );
    const blindLevelIndex = mode === "tournament" ? tournamentLevelIndex(settings, tournamentSequenceHandNo) : 0;
    const blindMultiplier = mode === "tournament" ? tournamentBlindMultiplier(settings, tournamentSequenceHandNo) : 1;
    const previousBlindLevelIndex = mode === "tournament" && previousTable?.simulationMode === "tournament"
      ? Math.max(
        0,
        Number.isFinite(Number(previousTable.blindLevelIndex))
          ? Number(previousTable.blindLevelIndex)
          : Number(previousTable.blindLevel || 1) - 1
      )
      : -1;
    const previousBlindLevel = mode === "tournament" && previousTable?.simulationMode === "tournament"
      ? Math.max(1, Number(previousTable.blindLevel || previousBlindLevelIndex + 1 || 1))
      : 0;
    const previousBlindMultiplier = mode === "tournament" && previousTable?.simulationMode === "tournament"
      ? Number(previousTable.blindMultiplier || 1)
      : 1;
    const blindLevelUp = mode === "tournament"
      && previousTable?.simulationMode === "tournament"
      && blindLevelIndex > previousBlindLevelIndex
      && Number(blindMultiplier || 0) > Number(previousBlindMultiplier || 0);
    const blindLevelAnnouncement = blindLevelUp
      ? {
        fromLevel: previousBlindLevel,
        toLevel: blindLevelIndex + 1,
        fromMultiplier: roundBbValue(previousBlindMultiplier || 1),
        toMultiplier: roundBbValue(blindMultiplier || 1),
        handNo: tournamentSequenceHandNo
      }
      : null;
    const carryoverSeats = mode === "tournament"
      ? carryoverSeatsForTable(previousTable, configuredPlayerCount, blindMultiplier)
      : null;
    const blindRingSeatIds = carryoverSeats ? blindRingCarryoverSeatIds(carryoverSeats) : null;
    const dealtSeatIds = carryoverSeats ? activeCarryoverSeatIds(carryoverSeats) : null;
    const positions = carryoverSeats
      ? playablePositionsForCount(blindRingSeatIds.length)
      : configuredPositions;
    const seatPositions = carryoverSeats
      ? positionsForActiveSeatIds(
        configuredPlayerCount,
        blindRingSeatIds,
        nextActiveDealerSeatId(previousTable, blindRingSeatIds, configuredPlayerCount)
      )
      : null;
    const requestedHeroPosition = scenarioHeroPosition || testHeroPosition;
    const effectiveScenarioHeroPosition = (!carryoverSeats && requestedHeroPosition && positions.includes(requestedHeroPosition))
      ? requestedHeroPosition
      : "";
    const heroPosition = effectiveScenarioHeroPosition || seatPositions?.[0] || chooseSpot(pack, positions).heroPosition;
    // Both branches resolved the spot identically (the carry-over branch never
    // diverged), so the ternary was dead complexity — collapsed to one call. (ENG-14)
    const spot = chooseSpotForHero(pack, positions, heroPosition);
    const resolvedSeatPositions = seatPositions || orderedSeatsForHero(clockwisePositionsForCount(positions.length), spot.heroPosition);
    const randomStacks = mode === "random" ? randomSeatStackDepths(configuredPlayerCount, settings) : null;
    const fixedStackDepth = mode === "random" || mode === "tournament" ? null : explicitFixedStackDepth(settings);
    const stackDepth = randomStacks
      ? randomStacks[0]
      : carryoverSeats
      ? Math.max(1, roundBbValue(carryoverSeats[0]?.stack || 0))
      : mode === "tournament"
      ? tournamentStartingStackDepth(settings, blindMultiplier)
      : fixedStackDepth != null
      ? fixedStackDepth
      : randomItem(pack.stackDepths);
    const trainingDeal = Boolean(settings?.trainingMode);
    const handGroup = trainingDeal
      ? (randomChance(pack.playableWeight) ? "vpip" : "fold")
      : "random";
    const forcedHeroCombo = trainingDeal
      ? (handGroup === "vpip" ? randomItem(PLAYABLE_COMBOS) : randomItem(FOLD_COMBOS))
      : "";
    const forcedHeroHand = forcedHeroCombo ? dealCombo(deck, forcedHeroCombo) : [];

    while (forcedHeroCombo && forcedHeroHand.length < 2) {
      forcedHeroHand.push(drawCard(deck));
    }

    const seatHoleCards = dealSeatHoleCards(
      deck,
      resolvedSeatPositions,
      forcedHeroHand.length >= 2 ? { 0: forcedHeroHand } : {},
      dealtSeatIds
    );
    const heroHand = Array.isArray(seatHoleCards[0]) ? seatHoleCards[0].slice(0, 2) : [];

    const table = {
      id,
      handNo,
      deck,
      heroHand,
      handGroup,
      combo: normalizeCombo(heroHand),
      board: [],
      street: "preflop",
      status: "playing",
      stackDepth,
      simulationMode: mode,
      tournamentHandNo: mode === "tournament" ? tournamentSequenceHandNo : 0,
      blindLevelIndex,
      blindLevel: blindLevelIndex + 1,
      blindMultiplier,
      blindLevelUp,
      blindLevelAnnouncement,
      tournamentLevelHands: mode === "tournament" ? tournamentLevelHands(settings) : 0,
      actionTimerSeconds: settingsInteger(settings?.actionTimerSeconds, 20, 0, 300),
      playerCount: positions.length,
      seatSlotCount: configuredPlayerCount,
      activeSeatIds: activeSeatIdsForPositions(resolvedSeatPositions),
      positions,
      seatPositions: resolvedSeatPositions,
      heroPosition: spot.heroPosition,
      spot,
      activeVillain: -1,
      currentBet: 1,
      lastRaiseSize: 1,
      minRaiseTo: 2,
      heroPreflopRaiseLocked: false,
      heroPostflopRaiseLocked: false,
      pot: 0,
      toCall: 0,
      canCheck: false,
      heroTurn: true,
      busy: false,
      result: "",
      resultKind: "live",
      heroBusted: false,
      bustedReason: "",
      tournamentFinish: null,
      lastAction: "Ждем решение Hero",
      villainActedThisStreet: false,
      streetActionSeatIds: [],
      villainTurnRiverBets: 0,
      streetAggressorSeatId: null,
      previousStreetAggressorSeatId: null,
      previousStreetCheckedThrough: false,
      preflopAggressorSeatId: null,
      preflopOpenerSeatId: null,
      preflopOpenToBb: 0,
      preflopOpenCallerSeatIds: [],
      initiativeSeatId: null,
      contestingSeatIds: [],
      logs: [],
      contributions: {},
      handContributions: {},
      anteContributions: {},
      seatBets: {},
      betAnimations: [],
      actionAnimations: [],
      animationSeq: 0,
      actionSeq: 0,
      timelineSeq: 0,
      actionTimeline: [],
      seatActions: {},
      seats: [],
      winningCards: [],
      practiceScenario: practiceScenario && typeof practiceScenario === "object" ? practiceScenario : null
    };

    table.seats = createSeats(table, deck, positions, stackDepth, settings, carryoverSeats, seatHoleCards, randomStacks);
    markInactiveLobbySeatsForHand(table);
    if (finishHeroBustedCarryoverIfNeeded(table)) return table;
    if (spot.startStreet && spot.startStreet !== "preflop") {
      initializePostflopSpot(table, spot);
    } else {
      initializePreflop(table, settings);
      if (table.status === "playing" && isAllInRunoutLocked(table)) {
        maybeRunoutAllIn(table);
      } else if (shouldRunBotsAfterHeroAllIn(table)) {
        // A short tournament stack can be consumed by its forced blind before
        // Hero ever receives a decision. initializePreflop only resolves seats
        // before Hero, so a later bot raise can leave an earlier live bot owing
        // while Hero has 0 chips and no scheduled response callback. Continue
        // the hand through the existing bot-only state machine instead of
        // returning an un-actionable status="playing" table.
        runBotsAfterHeroAllIn(table, settings);
      }
    }
    markTournamentCompleteIfNeeded(table);
    return table;
  }

  // Lobby state gate: a seat in sitting-out / disconnected skips the hand
  // (no cards, no action, no contesting) but remains in the button/blind ring.
  // If its physical seat is SB/BB, `initializePreflop` still charges the blind.
  // `folded=true` is the universal "this seat is not in the live pot" flag,
  // so downstream action loops naturally skip these seats once it's set.
  // `foldedAt` carries the lobby reason so it does not collide with a
  // real preflop fold and so `removeSeatFoldAction` can scope to live
  // folds only.
  function markInactiveLobbySeatsForHand(table) {
    if (!table || !Array.isArray(table.seats)) return;
    for (const seat of table.seats) {
      if (!seat || seat.isHero) continue;
      const lobbyState = String(seat.lobbyState || "active");
      if (lobbyState === "active") continue;
      seat.folded = true;
      seat.foldedAt = lobbyState;
      seat.cards = [];
      seat.revealed = false;
    }
  }

  // True when Hero is the last player left in a tournament — every other seat is
  // eliminated. Shared by both completion paths below so they can never disagree
  // on "is the tournament over?".
  //
  // An opponent counts as still in if it is not eliminated AND it either has
  // chips behind OR is still contesting the current hand with committed chips.
  // That second clause is load-bearing: a seat that just shoved all-in (or a
  // short stack that posted a blind for its whole stack) sits on stack 0 yet is
  // NOT out — its chips are live in the pot and the hand has not resolved.
  // Elimination is only stamped AFTER a hand settles (markTournamentEliminations),
  // so lobbyState — not a transient 0 stack — is the authoritative "this opponent
  // is gone" signal. Without the committed-chips clause, an opponent all-in
  // preflop reads as "no opponents left" and createTable declares the tournament
  // won before Hero ever gets to call or fold.
  function heroHasWonTournament(table) {
    if (!table || table.simulationMode !== "tournament" || !Array.isArray(table.seats)) return false;
    const hero = heroSeat(table);
    if (!hero || Number(hero.stack || 0) <= 0) return false;
    return !table.seats.some((seat) =>
      seat
      && !seat.isHero
      && String(seat.lobbyState || "active") !== "eliminated"
      && (Number(seat.stack || 0) > 0 || (!seat.folded && handCommitmentOf(table, seat.id) > 0))
    );
  }

  // In-hand win: the hand that just resolved may have busted the LAST opponent.
  // That winning hand IS the end of the tournament, so flag it here — mirroring
  // markHeroBustedIfNeeded — the moment the showdown settles. Without this the
  // just-won table still looks non-terminal, so the auto-dealer deals one
  // phantom extra hand before the next createTable finally notices the win
  // (the "after winning, cards were dealt again" bug). Status / board / showdown
  // are deliberately left intact so the reveal + pot-award animation still plays
  // before the victory screen appears — the busted path settles the same way.
  function markTournamentWonIfNeeded(table) {
    if (!table || table.tournamentComplete) return false;
    if (!heroHasWonTournament(table)) return false;
    table.tournamentComplete = true;
    table.resultKind = "tournament-won";
    return true;
  }

  // Fresh-hand teardown: createTable can deal a hand before the win is known
  // (e.g. a manual deal after the final bustout). Here there is no showdown to
  // preserve, so collapse the just-dealt hand straight into the terminal won
  // state. With markTournamentWonIfNeeded firing at showdown this is now a
  // safety net rather than the primary path.
  function markTournamentCompleteIfNeeded(table) {
    if (!heroHasWonTournament(table)) return false;

    table.status = "won";
    table.resultKind = "tournament-won";
    table.tournamentComplete = true;
    table.heroTurn = false;
    table.busy = false;
    table.toCall = 0;
    table.canCheck = false;
    table.currentBet = 0;
    table.lastAction = "Tournament won";
    table.result = "Hero wins tournament";
    table.contestingSeatIds = [0];
    closeTerminalBettingState(table);
    addLog(table, table.result);
    recordTimeline(table, "result", table.result, {
      status: table.status,
      result: table.result,
      tournamentComplete: true
    });
    return true;
  }

  function formatBb(value) {
    const rounded = roundBbValue(value);
    return `${rounded} BB`;
  }

  function roundBbValue(value) {
    return Math.round(Number(value || 0) * 10) / 10;
  }

  function difficultyLabel(value) {
    const difficulty = normalizeDifficulty(value);
    if (difficulty === "easy") return "легкий: хаотичный";
    if (difficulty === "pro") return "топ: pro v0";
    return "средний: стандарт";
  }

  function streetLabel(street) {
    const labels = { preflop: "Preflop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown" };
    return labels[street] || street;
  }

  function addLog(table, line) {
    table.logs.unshift(line);
    table.logs = table.logs.slice(0, 6);
  }

  function startHeroAction(table, action, settings, options = {}) {
    if (!table || table.status !== "playing" || table.busy || !table.heroTurn || remainingStack(table, 0) <= 0) {
      return { accepted: false };
    }

    if (action === "fold") {
      foldSeat(table, seatById(table, 0), table.street);
      recordSeatAction(table, 0, "Fold", "fold", false);
      if (shouldRunTournamentBotsAfterHeroFold(table)) {
        addLog(table, "Hero fold");
        return runTournamentBotsAfterHeroFold(table, settings);
      }
      table.status = "folded";
      table.heroTurn = false;
      awardPot(table, winnerSeatsWhenHeroFolds(table));
      closeTerminalBettingState(table);
      table.result = "Hero fold";
      table.resultKind = "lost";
      table.lastAction = "Hero fold";
      markHeroBustedIfNeeded(table);
      addLog(table, "Hero fold");
      recordTimeline(table, "result", "Hero fold", { result: table.result, status: table.status, heroBusted: Boolean(table.heroBusted) });
      revealVillainIfShowdown(table, false);
      return { accepted: true, needsBot: false, tone: "fold" };
    }

    // Public-API guard (E3): reject semantically illegal actions. The UI only
    // ever offers a legal one, but PokerSimulatorEngine.startHeroAction is called
    // directly by embeds/tests — a "check" facing a bet, or a "call" with nothing
    // to call, would otherwise corrupt the hand state.
    const toCall = Number(table.toCall || 0);
    if ((action === "check" && toCall > 0) || (action === "call" && toCall <= 0) || (toCall > 0 && isBetOnlyHeroAction(action))) {
      return { accepted: false };
    }
    if (heroRaiseBlockedByShortPreflopAllIn(table, action, options) || heroRaiseBlockedByShortPostflopAllIn(table, action, options)) {
      return { accepted: false };
    }

    const heroAmount = applyHeroAction(table, action, options);
    table.heroTurn = false;
    table.busy = true;

    return {
      accepted: true,
      needsBot: true,
      tone: "action",
      heroAction: action,
      heroAmount,
      delay: botDelay(table, action, heroAmount, settings)
    };
  }

  // Force-settle a still-live hand as a hero LOSS without playing it out. Used
  // when the player reduces the active table count while a hand is in progress:
  // the abandoned hand must count against them (anti-cheat) instead of vanishing.
  // Honest accounting is automatic — every chip the hero has committed this hand
  // is already deducted from seat.stack (addSeatContribution deducts on the spot),
  // so the recorded netBb = finalStack - startStack is exactly the forfeited
  // amount. Unlike startHeroAction("fold"), this works on ANY turn (including when
  // it is a bot's turn to act) and never hands the table to the bot-continuation
  // path: the table is about to be discarded, so we only need a terminal,
  // recordable LOSS. Mirrors the terminal-fold branch of startHeroAction.
  function forfeitHeroHand(table) {
    if (!table || table.status !== "playing") return { accepted: false };
    const hero = seatById(table, 0);
    if (hero && !hero.folded) {
      foldSeat(table, hero, table.street);
      recordSeatAction(table, 0, "Fold", "fold", false);
    }
    table.status = "folded";
    table.heroTurn = false;
    table.busy = false;
    awardPot(table, winnerSeatsWhenHeroFolds(table));
    closeTerminalBettingState(table);
    table.result = "Раздача засчитана как проигрыш";
    table.resultKind = "lost";
    table.lastAction = "Сдача при закрытии стола";
    table.forfeited = true;
    markHeroBustedIfNeeded(table);
    addLog(table, "Стол закрыт — раздача засчитана как проигрыш");
    recordTimeline(table, "result", table.result, {
      result: table.result,
      status: table.status,
      heroBusted: Boolean(table.heroBusted)
    });
    revealVillainIfShowdown(table, false);
    return { accepted: true };
  }

  function applyHeroAction(table, action, options = {}) {
    let amount = 0;
    if (action === "check") {
      markStreetAction(table, 0);
      table.lastAction = "Hero check";
      addLog(table, "Hero check");
      recordSeatAction(table, 0, "Check", "passive", false);
      return amount;
    }

    if (action === "call") {
      amount = Math.min(table.toCall, remainingStack(table, 0));
      table.toCall = 0;
      amount = addSeatContribution(table, 0, amount);
      markStreetAction(table, 0);
      table.lastAction = `Hero call ${formatBb(amount)}`;
      addLog(table, table.lastAction);
      markPreflopOpenCaller(table, 0);
      recordSeatAction(table, 0, `Call ${formatBb(amount)}`, "passive", false);
      return amount;
    }

    table.heroPreflopRaiseLocked = false;
    table.heroPostflopRaiseLocked = false;
    const previousBet = Number(table.currentBet || 0);
    let targetTotal = actionAmount(table, action, options);
    const commit = commitRaise(table, 0, targetTotal, {
      previousBet,
      preflop: table.street === "preflop",
      postflop: table.street !== "preflop",
      previousAggressorSeatId: table.preflopAggressorSeatId
    });
    amount = commit.paidAmount;
    targetTotal = commit.target;
    table.toCall = 0;
    markStreetAction(table, 0);
    const isShove = action === "allin"
      || remainingStack(table, 0) <= 0
      || Math.abs(targetTotal - maxContributionForSeat(table, 0)) < EPSILON_BB;
    const verb = isShove ? "All-in" : actionVerb(action);
    table.lastAction = `${verb} ${formatBb(targetTotal)}`;
    addLog(table, `Hero ${table.lastAction}`);
    recordSeatAction(table, 0, `${verb} ${formatBb(targetTotal)}`, "aggressive", false);
    return targetTotal;
  }

  function actionAmount(table, action, options = {}) {
    const max = maxContributionForSeat(table, 0);
    if (action === "raise-custom" || action === "bet-custom") {
      const min = action === "raise-custom" ? Number(table.minRaiseTo || 2) : 1;
      if (Number.isFinite(Number(options.amount))) {
        return clamp(Number(options.amount), Math.min(min, max), max);
      }
      return action === "raise-custom" ? actionAmount(table, "raise-half") : actionAmount(table, "bet-half");
    }
    if (action === "open") return Math.min(2.2, max);
    if (action === "raise-half") return table.street === "preflop" ? Math.min(max, Math.max(Number(table.minRaiseTo || 2), 3)) : clamp(table.pot * 0.5, Math.min(1, max), max);
    if (action === "bet-third") return clamp(table.pot * 0.33, Math.min(1, max), max);
    if (action === "bet-half") return clamp(table.pot * 0.5, Math.min(1, max), max);
    if (action === "bet-pot") return clamp(table.pot, Math.min(1, max), max);
    // Cap the shove to what the deepest live opponent can actually call —
    // never commit dead money no one can match. The withheld excess (vs a
    // shorter opponent) stays in hero's stack instead of being refunded later.
    if (action === "allin") return Math.min(max, effectiveAllInCeiling(table, 0));
    return 0;
  }

  function heroRaiseBlockedByShortPreflopAllIn(table, action, options = {}) {
    if (!table || table.street !== "preflop" || !table.heroPreflopRaiseLocked) return false;
    if (!isRaiseLikeHeroAction(action)) return false;
    if (!(Number(table.toCall || 0) > 0)) return false;
    const targetTotal = actionAmount(table, action, options);
    return targetTotal > Number(table.currentBet || 0) + EPSILON_BB;
  }

  function heroRaiseBlockedByShortPostflopAllIn(table, action, options = {}) {
    if (!table || table.street === "preflop" || table.street === "showdown" || !table.heroPostflopRaiseLocked) return false;
    if (!isRaiseLikeHeroAction(action)) return false;
    if (!(Number(table.toCall || 0) > 0)) return false;
    const targetTotal = actionAmount(table, action, options);
    return targetTotal > Number(table.currentBet || 0) + EPSILON_BB;
  }

  function actionVerb(action) {
    if (action === "allin") return "All-in";
    if (action === "open" || action.includes("raise")) return "Raise to";
    return "Bet";
  }

  function botDelay(table, heroAction, heroAmount, settings) {
    if (!table) return 140;
    const villain = table.seats?.[table.activeVillain];
    const difficulty = difficultyForSeat(settings, villain);
    const turboScale = settings?.turboMode ? 0.72 : 1;
    const sample = (base, spread) => Math.round((base + randomInt(spread)) * turboScale);
    if (difficulty === "easy") {
      return sample(280, 620);
    }

    const marginal = isMarginalBotDecision(table, heroAction, heroAmount, difficulty);
    if (marginal) return sample(760, 360);
    if (table.street !== "preflop") return sample(460, 320);
    return sample(180, 180);
  }

  function resolveBotAction(table, heroAction, heroAmount, settings) {
    if (!table || table.status !== "playing") return { accepted: false };
    let tone = table.street === "preflop"
      ? resolvePreflop(table, heroAction, heroAmount, settings)
      : resolvePostflop(table, heroAction, heroAmount, settings);
    if (shouldRunBotsAfterHeroAllIn(table)) {
      tone = runBotsAfterHeroAllIn(table, settings) || tone;
    }
    return { accepted: true, tone };
  }

  function resolvePreflop(table, heroAction, heroAmount, settings) {
    settlePreflopAfterHero(table, settings, heroAction);
    updatePreflopStateForHero(table);
    const opponents = liveContestingOpponents(table);

    if (!opponents.length) {
      table.status = "won";
      table.busy = false;
      awardPot(table, [heroSeat(table)]);
      closeTerminalBettingState(table);
      table.result = `Hero win ${formatBb(table.pot)}`;
      table.lastAction = table.result;
      markHeroBustedIfNeeded(table);
      addLog(table, "Все оппоненты fold");
      recordTimeline(table, "result", table.result, { status: table.status, result: table.result, heroBusted: Boolean(table.heroBusted) });
      return "win";
    }

    if (needsHeroPreflopResponse(table)) {
      table.heroTurn = true;
      table.busy = false;
      refreshSpotText(table);
      return "action";
    }

    table.activeVillain = choosePrimaryPostflopVillain(table);
    return maybeRunoutAllIn(table) || advanceStreet(table, "flop", settings);
  }

  function needsHeroPreflopResponse(table) {
    return table?.street === "preflop"
      && table.status === "playing"
      && remainingStack(table, 0) > 0
      && Number(table.toCall || 0) > 0;
  }

  function isRaiseLikeHeroAction(action) {
    const value = String(action || "");
    return value === "allin" || value === "open" || value.includes("raise");
  }

  function isBetOnlyHeroAction(action) {
    return String(action || "").startsWith("bet");
  }

  function isFacingHeroPreflopThreeBet(table, seat, heroAction) {
    if (!table || table.street !== "preflop" || !seat || seat.isHero) return false;
    if (!isRaiseLikeHeroAction(heroAction)) return false;
    if (isFacingHeroPreflopFourBet(table, seat, heroAction)) return false;
    const target = Number(table.currentBet || 0);
    if (!Number.isFinite(target) || target <= 2.2) return false;
    return contributionOf(table, seat.id) > 1;
  }

  function isFacingHeroPreflopFourBet(table, seat, heroAction) {
    if (!table || table.street !== "preflop" || !seat || seat.isHero) return false;
    if (!isRaiseLikeHeroAction(heroAction)) return false;
    const heroTarget = Number(table.currentBet || 0);
    if (!Number.isFinite(heroTarget) || heroTarget <= MAX_SINGLE_OPEN_TO_BB + 0.01) return false;
    const priorReraise = Math.max(0, ...(Array.isArray(table.seats) ? table.seats : [])
      .filter((item) => item && !item.isHero)
      .map((item) => contributionOf(table, item.id))
      .filter((value) => value > MAX_SINGLE_OPEN_TO_BB + 0.01));
    return priorReraise > MAX_SINGLE_OPEN_TO_BB + 0.01 && heroTarget > priorReraise + EPSILON_BB;
  }

  function preflopResponseLabSpots(table, seat, heroAction) {
    if (isFacingHeroPreflopFourBet(table, seat, heroAction)) return ["defense", "fourBet"];
    if (isFacingHeroPreflopThreeBet(table, seat, heroAction)) return ["defense", "threeBet"];
    return Number(table.currentBet || 0) > 1 ? ["defense"] : ["open"];
  }

  function preflopFoldLabel(table, seat, heroAction) {
    if (isFacingHeroPreflopFourBet(table, seat, heroAction)) return "Fold vs 4bet";
    return isFacingHeroPreflopThreeBet(table, seat, heroAction) ? "Fold vs 3bet" : "Fold";
  }

  function settlePreflopAfterHero(table, settings, heroAction = "") {
    const positions = preflopOrderAfterHero(table);
    const { bigBlind } = blindPositions(table.positions);

    const settleOnce = (position) => {
      const seat = seatByPosition(table, position);
      resolvePreflopBotTurn(table, seat, settings, {
        skipMatched: true,
        checkOption: position === bigBlind,
        labSpotsFor: () => preflopResponseLabSpots(table, seat, heroAction),
        foldLabel: () => preflopFoldLabel(table, seat, heroAction)
      });
    };

    // Close the round before advancing: a mid-sweep bot raise/all-in leaves seats
    // earlier in position (already iterated, or the all-in hero who cannot act)
    // still owing the new currentBet. Re-sweep until every live chip-stacked,
    // non-hero seat has matched or folded so no under-contributed seat is dragged
    // into showdown and the round does not hang.
    const roundClosed = () => !preflopOrderAfterHero(table).some((position) => {
      const seat = seatByPosition(table, position);
      if (!seat || seat.isHero || seat.folded) return false;
      if (remainingStack(table, seat.id) <= 0) return false;
      const required = Math.min(Number(table.currentBet || 0), maxContributionForSeat(table, seat.id));
      return contributionOf(table, seat.id) + EPSILON_BB < required;
    });
    // Turn-order guard: ONE pass over `preflopOrderAfterHero` is always in
    // correct clockwise order (it starts immediately left of hero), so a
    // re-raise inside a single pass only lets seats that sit *before* hero
    // respond. The danger is the RE-SWEEP: once a bot re-opens the betting,
    // re-running the pass would let seats that sit *after* hero (e.g. the
    // button) call the raise before hero acts — out of turn. Stop sweeping the
    // moment hero owes a live action; `resolvePreflop` then hands the turn back
    // to hero, and the seats behind hero settle on the next call, after hero
    // responds. (When hero is folded/all-in and cannot act, keep sweeping so a
    // bot-only round still closes before the street advances.)
    const heroOwesLiveAction = () => {
      const heroSeat = seatById(table, 0);
      if (!heroSeat || heroSeat.folded) return false;
      if (remainingStack(table, 0) <= 0) return false;
      return contributionOf(table, 0) + EPSILON_BB < Number(table.currentBet || 0);
    };
    let settleGuard = 0;
    do {
      settleGuard += 1;
      preflopOrderAfterHero(table).forEach(settleOnce);
    } while (!roundClosed() && !heroOwesLiveAction() && settleGuard < 8);

    // Use the per-HAND commitment (ante + closed streets + open street), the
    // SAME ledger contestingSeatIdSet (the runout/showdown fallback) and
    // settlePots ranking use — not per-street contributionOf. This keeps an
    // ante-only all-in seat eligible for its lowest pot layer and guarantees
    // that the contesting set cannot drift from the winner-ranking ledger.
    // (L7-family — sibling of L7's fallback fix)
    const opponentIds = table.seats
      .filter((seat) => !seat.isHero && !seat.folded && handCommitmentOf(table, seat.id) > 0)
      .map((seat) => seat.id);
    table.contestingSeatIds = [0, ...opponentIds];
  }

  function resolvePostflop(table, heroAction, heroAmount, settings) {
    normalizePostflopContestants(table);

    if (heroAction === "check") {
      return resolvePostflopLeadSequence(table, settings, 0);
    }

    if (heroAction === "call") {
      const response = resolveBotResponsesToCurrentBet(table, settings, {
        aggressorSeatId: table.streetAggressorSeatId ?? table.activeVillain,
        afterSeatId: 0,
        stopAtHero: false,
        labSpot: "multiway-call"
      });
      if (response.stoppedAtHero) return "action";
      return maybeRunoutAllIn(table) || advanceAfterStreetAction(table, settings);
    }

    const response = resolveBotResponsesToCurrentBet(table, settings, {
      aggressorSeatId: 0,
      afterSeatId: 0,
      stopAtHero: false,
      labSpot: "vsHeroBet"
    });
    if (response.stoppedAtHero) return "action";

    const opponents = liveContestingOpponents(table);
    if (!opponents.length) {
      table.status = "won";
      table.busy = false;
      awardPot(table, [heroSeat(table)]);
      closeTerminalBettingState(table);
      table.result = `Hero win ${formatBb(table.pot)}`;
      table.lastAction = "Opponents fold";
      markHeroBustedIfNeeded(table);
      addLog(table, "All opponents fold");
      recordTimeline(table, "result", table.result, { status: table.status, result: table.result, heroBusted: Boolean(table.heroBusted) });
      return "win";
    }

    table.activeVillain = choosePrimaryPostflopVillain(table);
    return maybeRunoutAllIn(table) || advanceAfterStreetAction(table, settings);
  }

  function shouldRunTournamentBotsAfterHeroFold(table) {
    if (!table) return false;
    return liveBotContestants(table).length > 1;
  }

  function runTournamentBotsAfterHeroFold(table, settings) {
    table.heroTurn = false;
    table.busy = true;
    table.toCall = 0;
    table.canCheck = false;
    table.resultKind = "lost";
    table.lastAction = "Hero fold";
    table.contestingSeatIds = liveBotContestants(table).map((seat) => seat.id);
    recordTimeline(table, "action", "Hero fold - bots continue", {
      status: table.status,
      result: "Hero fold",
      botOnly: true
    });

    const tone = finishTournamentBotOnlyHand(table, settings);
    return { accepted: true, needsBot: false, tone: tone || "fold" };
  }

  function shouldRunBotsAfterHeroAllIn(table) {
    if (!table || table.status !== "playing") return false;
    const hero = heroSeat(table);
    if (!hero || hero.folded || remainingStack(table, 0) > 0) return false;
    if (!contestingSeatIdSet(table).has(0) || !(handCommitmentOf(table, 0) > 0)) return false;
    return liveContestingOpponents(table).length > 0;
  }

  function runBotsAfterHeroAllIn(table, settings) {
    table.heroTurn = false;
    table.busy = true;
    table.toCall = 0;
    table.canCheck = false;
    table.contestingSeatIds = botOnlyContestingSeatIds(table);
    recordTimeline(table, "action", "Hero all-in - bots continue", {
      status: table.status,
      result: "Hero all-in",
      botOnly: true
    });
    return finishTournamentBotOnlyHand(table, settings);
  }

  function finishTournamentBotOnlyHand(table, settings) {
    let guard = 0;
    while (table && table.status === "playing" && guard < 40) {
      guard += 1;
      const winner = singleLiveBotContestant(table);
      if (winner) return finishBotOnlyFoldWin(table, winner);
      if (botOnlyAllInLocked(table)) return runBotOnlyAllInToShowdown(table);

      if (table.street === "preflop") {
        const tone = playBotOnlyPreflop(table, settings);
        if (table.status !== "playing") return tone;
        if (tone === "all-in") continue;
        if (tone === "closed") {
          dealNextBotOnlyStreet(table, "flop", settings);
          if (table.status !== "playing") return table.status === "showdown" ? "fold" : "win";
          continue;
        }
        continue;
      }

      const streetTone = playBotOnlyPostflopStreet(table, settings);
      if (table.status !== "playing") return streetTone;
      if (streetTone === "all-in") continue;
      if (table.street === "flop") {
        dealNextBotOnlyStreet(table, "turn", settings);
      } else if (table.street === "turn") {
        dealNextBotOnlyStreet(table, "river", settings);
      } else {
        return showdown(table);
      }
    }

    table.busy = false;
    table.heroTurn = false;
    return table.status === "playing" ? showdown(table) : "fold";
  }

  function playBotOnlyPreflop(table, settings) {
    const initialTarget = Number(table.currentBet || 0);
    const acted = new Set(liveBotContestants(table)
      .filter((seat) => contributionOf(table, seat.id) >= Math.min(initialTarget, maxContributionForSeat(table, seat.id)) - EPSILON_BB)
      .map((seat) => seat.id));
    const heroIndex = Math.max(0, table.positions.indexOf(table.heroPosition));
    const orderedPositions = [
      ...table.positions.slice(heroIndex + 1),
      ...table.positions.slice(0, heroIndex)
    ];
    let cursor = 0;
    let guard = 0;

    while (table.status === "playing" && guard < 120) {
      guard += 1;
      const winner = singleLiveBotContestant(table);
      if (winner) return finishBotOnlyFoldWin(table, winner);
      if (botOnlyPreflopRoundClosed(table, acted)) return botOnlyAllInLocked(table) ? "all-in" : "closed";

      const position = orderedPositions[cursor % Math.max(1, orderedPositions.length)];
      cursor += 1;
      const seat = seatByPosition(table, position);
      if (!seat || seat.isHero || seat.folded || String(seat.lobbyState || "active") !== "active") continue;
      const target = Number(table.currentBet || 0);
      const contribution = contributionOf(table, seat.id);
      if (acted.has(seat.id) && contribution >= Math.min(target, maxContributionForSeat(table, seat.id))) continue;

      resolvePreflopBotTurn(table, seat, settings, {
        acted,
        skipActedMatched: true,
        checkOption: true
      });
    }

    return botOnlyAllInLocked(table) ? "all-in" : "closed";
  }

  function botOnlyPreflopRoundClosed(table, acted) {
    const live = liveBotContestants(table);
    if (live.length <= 1) return true;
    const target = Number(table.currentBet || 0);
    return live.every((seat) => {
      if (remainingStack(table, seat.id) <= 0) return true;
      if (!acted.has(seat.id)) return false;
      return contributionOf(table, seat.id) >= Math.min(target, maxContributionForSeat(table, seat.id)) - EPSILON_BB;
    });
  }

  function dealNextBotOnlyStreet(table, nextStreet, settings) {
    rememberClosedStreet(table);
    clearStreetBets(table);
    const drawCount = nextStreet === "flop" ? 3 : 1;
    for (let index = 0; index < drawCount; index += 1) {
      table.board.push(drawCard(table.deck));
    }

    table.street = nextStreet;
    table.currentBet = 0;
    table.lastRaiseSize = 0;
    table.minRaiseTo = 1;
    table.toCall = 0;
    table.canCheck = false;
    table.heroTurn = false;
    table.busy = true;
    table.heroPreflopRaiseLocked = false;
    table.heroPostflopRaiseLocked = false;
    table.villainActedThisStreet = false;
    table.streetActionSeatIds = [];
    table.streetAggressorSeatId = null;
    table.contestingSeatIds = botOnlyContestingSeatIds(table);
    table.lastAction = `${streetLabel(nextStreet)} раздан`;
    addLog(table, table.lastAction);
    recordTimeline(table, "street", table.lastAction, { board: table.board.slice(), botOnly: true });
    const allInRunout = botOnlyAllInLocked(table) ? runBotOnlyAllInToShowdown(table) : "";
    if (allInRunout) return allInRunout;
    return playBotOnlyPostflopStreet(table, settings);
  }

  function playBotOnlyPostflopStreet(table, settings) {
    normalizePostflopContestants(table);
    table.contestingSeatIds = botOnlyContestingSeatIds(table);
    const acted = new Set((table.streetActionSeatIds || []).map(Number).filter((seatId) => Number.isFinite(seatId)));
    let afterSeatId = Number(table.currentBet || 0) > 0 && Number.isFinite(Number(table.streetAggressorSeatId))
      ? Number(table.streetAggressorSeatId)
      : null;
    let guard = 0;

    while (table.status === "playing" && guard < 120) {
      guard += 1;
      const winner = singleLiveBotContestant(table);
      if (winner) return finishBotOnlyFoldWin(table, winner);
      if (botOnlyPostflopRoundClosed(table, acted) && botOnlyAllInLocked(table)) return "all-in";
      if (botOnlyPostflopRoundClosed(table, acted)) return "closed";

      const actor = nextBotOnlyPostflopActor(table, acted, afterSeatId);
      if (!actor) return "closed";
      table.activeVillain = actor.id;
      const target = Number(table.currentBet || 0);
      if (target > contributionOf(table, actor.id) + EPSILON_BB) {
        // NL re-open rule (BUGHUNT F003): a seat that has already acted and matched the
        // last FULL bet may only call/fold when it is re-offered solely because a short
        // (sub-min) all-in bumped the bet — it may NOT re-raise. `acted` membership is
        // exactly "acted since the last full re-open" (a full raise clears it below), so
        // an already-acted seat gets allowRaise=false.
        const allowRaise = !acted.has(actor.id);
        const response = resolveBotCallOrFoldToCurrentBet(table, actor, target, settings, "bot-only", allowRaise);
        if (response === "raise-full") {
          // A full legal min-raise re-opens the betting for everyone.
          acted.clear();
          acted.add(actor.id);
        } else {
          // "raise-short" (incomplete all-in — does NOT reopen), "call", or "fold":
          // keep already-acted seats closed to raising.
          acted.add(actor.id);
        }
        afterSeatId = actor.id;
        continue;
      }

      const lead = botPostflopIntent(table, actor.cards, settings, false, actor);
      table.lastBotDecision = lead.label;
      markStreetAction(table, actor.id);
      if (lead.bet) {
        const commit = commitRaise(table, actor.id, lead.amount, {
          previousBet: 0,
          postflop: false,
          minRaiseSeatId: actor.id
        });
        if (commit.paidAmount > 0) {
          table.lastAction = `${actor.position} bet ${formatBb(commit.paidAmount)} · ${lead.label}`;
          const labSpot = lead.labSpot || postflopLabSpot(table, lead.label, false);
          recordSeatAction(table, actor.id, `Bet ${formatBb(commit.paidAmount)}`, "aggressive", true, { botReason: lead.label, labSpot, labSpots: [labSpot] });
          addLog(table, table.lastAction);
          acted.clear();
          acted.add(actor.id);
          afterSeatId = actor.id;
          continue;
        }
      }

      table.lastAction = `${actor.position} check`;
      const labSpot = lead.labSpot || postflopLabSpot(table, lead.label, false);
      recordSeatAction(table, actor.id, "Check", "passive", true, { botReason: lead.label, labSpot, labSpots: [labSpot] });
      addLog(table, `${actor.position} check · ${lead.label}`);
      acted.add(actor.id);
      afterSeatId = actor.id;
    }

    return "closed";
  }

  function botOnlyPostflopRoundClosed(table, acted) {
    const live = liveBotContestants(table);
    if (live.length <= 1) return true;
    const target = Number(table.currentBet || 0);
    return live.every((seat) => {
      if (remainingStack(table, seat.id) <= 0) return true;
      if (target > contributionOf(table, seat.id) + EPSILON_BB) return false;
      return acted.has(seat.id);
    });
  }

  function nextBotOnlyPostflopActor(table, acted, afterSeatId = null) {
    const target = Number(table.currentBet || 0);
    const ordered = afterSeatId == null ? postflopOrderedContestingSeats(table) : postflopSeatsAfter(table, afterSeatId);
    for (const seat of ordered) {
      if (!seat || seat.isHero || seat.folded || remainingStack(table, seat.id) <= 0) continue;
      if (target > contributionOf(table, seat.id) + EPSILON_BB) return seat;
      if (!acted.has(seat.id)) return seat;
    }
    return null;
  }

  function liveBotContestants(table) {
    const explicitIds = Array.isArray(table?.contestingSeatIds) && table.contestingSeatIds.length
      ? new Set(table.contestingSeatIds.map(Number).filter((seatId) => Number.isFinite(seatId)))
      : null;
    return (table?.seats || []).filter((seat) =>
      seat
      && !seat.isHero
      && !seat.folded
      && String(seat.lobbyState || "active") === "active"
      && (!explicitIds || explicitIds.has(Number(seat.id)))
    );
  }

  function botOnlyContestingSeatIds(table) {
    const ids = [];
    const hero = heroSeat(table);
    if (hero && !hero.folded && handCommitmentOf(table, hero.id) > 0 && contestingSeatIdSet(table).has(hero.id)) {
      ids.push(hero.id);
    }
    liveBotContestants(table).forEach((seat) => {
      if (!ids.includes(seat.id)) ids.push(seat.id);
    });
    return ids;
  }

  function singleLiveBotContestant(table) {
    const hero = heroSeat(table);
    if (hero && !hero.folded && contestingSeatIdSet(table).has(0)) return null;
    const live = liveBotContestants(table);
    return live.length === 1 ? live[0] : null;
  }

  function botOnlyAllInLocked(table) {
    const hero = heroSeat(table);
    if (hero && !hero.folded && contestingSeatIdSet(table).has(0)) return isAllInRunoutLocked(table);
    const live = liveBotContestants(table);
    if (live.length < 2) return false;
    const target = Number(table.currentBet || 0);
    if (target > 0) {
      const hasUnansweredBet = live.some((seat) => {
        if (remainingStack(table, seat.id) <= 0) return false;
        const required = Math.min(target, maxContributionForSeat(table, seat.id));
        return contributionOf(table, seat.id) + EPSILON_BB < required;
      });
      if (hasUnansweredBet) return false;
    }
    const liveWithChips = live.filter((seat) => remainingStack(table, seat.id) > 0);
    return liveWithChips.length <= 1;
  }

  function runBotOnlyAllInToShowdown(table) {
    const startBoard = Array.isArray(table.board) ? table.board.slice() : [];
    const deckBeforeRunout = Array.isArray(table.deck) ? table.deck.slice() : [];
    const runoutOpponents = liveBotContestants(table);
    table.heroTurn = false;
    table.busy = true;
    table.toCall = 0;
    table.canCheck = false;
    table.currentBet = 0;
    table.lastRaiseSize = 0;
    table.minRaiseTo = 0;

    // See maybeRunoutAllIn: snapshot the closing-street bets up-front (contested
    // street + live seatBets) so the felt-rest markers match the action stamp,
    // before the board fill + showdown() street jump mislabel them {showdown,5}.
    snapshotClosingStreetBets(table);

    while (table.board.length < 5) {
      table.board.push(drawCard(table.deck));
    }

    table.allInRunout = buildAllInRunout(table, {
      startBoard,
      finalBoard: table.board.slice(),
      deckBeforeRunout,
      opponents: runoutOpponents
    });
    table.lastAction = "Bot all-in runout";
    addLog(table, "Bot all-in: board до showdown");
    recordTimeline(table, "street", "Bot all-in runout to showdown", {
      board: table.board.slice(),
      startBoard,
      allInRunout: table.allInRunout,
      botOnly: true
    });
    return showdown(table);
  }

  function finishBotOnlyFoldWin(table, winner) {
    if (!winner) return "fold";
    table.status = "folded";
    table.heroTurn = false;
    table.busy = false;
    table.toCall = 0;
    table.canCheck = false;
    awardPot(table, [winner]);
    const eliminated = markTournamentEliminations(table);
    markHeroBustedIfNeeded(table);
    closeTerminalBettingState(table);
    table.result = `${winner.position || winner.name} win ${formatBb(table.pot)}`;
    table.resultKind = "lost";
    table.lastAction = table.result;
    if (eliminated.length) {
      addLog(table, `${eliminated.map((seat) => seat.position || seat.name).join(", ")} eliminated`);
    }
    addLog(table, table.result);
    recordTimeline(table, "result", table.result, {
      status: table.status,
      result: table.result,
      heroBusted: Boolean(table.heroBusted),
      tournamentFinish: table.tournamentFinish ? { ...table.tournamentFinish } : null,
      eliminatedSeatIds: eliminated.map((seat) => seat.id),
      botOnly: true
    });
    return "fold";
  }

  function resolvePostflopLeadSequence(table, settings, afterSeatId = null) {
    normalizePostflopContestants(table);

    const maxSteps = Math.max(1, postflopOrderedContestingSeats(table).length + 2);
    let actor = nextPostflopActor(table, afterSeatId);
    let steps = 0;

    while (actor && !actor.isHero && steps < maxSteps) {
      steps += 1;
      table.activeVillain = actor.id;
      table.heroTurn = false;
      table.busy = true;

      const villainAction = applyVillainPostflopAction(table, settings, true);
      if (villainAction === "bet") {
        resolveBotResponsesToCurrentBet(table, settings, {
          aggressorSeatId: actor.id,
          afterSeatId: actor.id,
          stopAtHero: true,
          labSpot: "multiway-bet"
        });
        return maybeRunoutAllIn(table) || "action";
      }

      actor = nextPostflopActor(table, actor.id);
    }

    if (actor?.isHero) {
      updateHeroPostflopDecision(table);
      return "action";
    }

    return maybeRunoutAllIn(table) || advanceAfterStreetAction(table, settings);
  }

  function updateHeroPostflopDecision(table) {
    const hero = heroSeat(table);
    const toCall = roundBbValue(Math.max(0, Number(table.currentBet || 0) - contributionOf(table, 0)));
    table.toCall = toCall;
    table.canCheck = toCall <= 0;
    table.heroTurn = Boolean(hero && !hero.folded && remainingStack(table, 0) > 0);
    table.busy = false;
    if (table.heroTurn) {
      table.lastAction = toCall > 0
        ? `Hero to call ${formatBb(toCall)}`
        : "Hero action";
    }
  }

  function resolveBotResponsesToCurrentBet(table, settings, options = {}) {
    const target = Number(table.currentBet || 0);
    if (!(target > 0)) return { stoppedAtHero: false };

    const aggressorSeatId = Number(options.aggressorSeatId);
    const afterSeatId = options.afterSeatId ?? aggressorSeatId;
    const stopAtHero = Boolean(options.stopAtHero);
    let stoppedAtHero = false;

    for (const seat of postflopSeatsAfter(table, afterSeatId)) {
      if (!seat) continue;
      // Skip the aggressor (it holds the high bet) but KEEP sweeping the rest of the rotation —
      // `break` here closed the street early and skipped live seats positioned after the aggressor
      // (e.g. a checked BB owing the raise), dealing the next street and gifting a free card.
      if (Number.isFinite(aggressorSeatId) && Number(seat.id) === aggressorSeatId) continue;

      if (seat.isHero) {
        // Only stop at the hero when the hero can actually act. An all-in hero
        // is chip-less at this boundary and must be swept past so live bots
        // seated after it still get a call/fold/raise.
        if (stopAtHero && remainingStack(table, 0) > 0) {
          stoppedAtHero = true;
          break;
        }
        continue;
      }

      if (seat.folded || remainingStack(table, seat.id) <= 0) continue;
      if (contributionOf(table, seat.id) >= target) continue;

      table.activeVillain = seat.id;
      const response = resolveBotCallOrFoldToCurrentBet(table, seat, target, settings, options.labSpot || "multiway");
      // Any aggression (full or short all-in) continues the clockwise sweep toward Hero
      // so seats between the raiser and Hero still act. (The reopen-lock that restricts
      // already-acted seats from re-raising a short all-in is enforced in the bot-only
      // loop via allowRaise; the hero-present multiway loop's own lock is a follow-up —
      // see BUGHUNT F003 scope note.)
      if (response === "raise-full" || response === "raise-short") {
        // Continue clockwise from the raiser until Hero is reached; otherwise
        // bots between the raiser and Hero are skipped and Hero gets an
        // out-of-turn response in multiway pots.
        return resolveBotResponsesToCurrentBet(table, settings, {
          ...options,
          aggressorSeatId: seat.id,
          afterSeatId: seat.id,
          stopAtHero: true
        });
      }
    }

    if (stopAtHero) {
      updateHeroPostflopDecision(table);
    }

    table.activeVillain = stopAtHero && Number.isFinite(aggressorSeatId)
      ? aggressorSeatId
      : choosePrimaryPostflopVillain(table);
    return { stoppedAtHero };
  }

  function resolveBotCallOrFoldToCurrentBet(table, seat, target, settings, labSpot, allowRaise = true) {
    const villainPlan = botCallVsBet(table, seat.cards, target, settings, seat);
    table.lastBotDecision = villainPlan.label;

    if (!villainPlan.call) {
      markStreetAction(table, seat.id);
      foldSeat(table, seat, table.street);
      recordSeatAction(table, seat.id, "Fold", "fold", true, { botReason: villainPlan.label, labSpot });
      addLog(table, `${seat.position} fold · ${villainPlan.label}`);
      return "fold";
    }

    // allowRaise=false: this seat has already closed its action at the current full
    // bet and is only re-offered because a short all-in bumped the bet — under the NL
    // re-open rule it may only call or fold, never re-raise (BUGHUNT F003). Fall through
    // to the call path instead of the raise/shove branches.
    if (allowRaise && villainPlan.raiseTo && Number(villainPlan.raiseTo) > target) {
      return applyBotPostflopRaiseOverBet(table, seat, target, villainPlan, labSpot);
    }

    if (allowRaise && villainPlan.shove) {
      return applyBotPostflopShoveOverBet(table, seat, target, villainPlan, labSpot);
    }

    const callTarget = Math.min(target, maxContributionForSeat(table, seat.id));
    const callAmount = Math.max(0, callTarget - contributionOf(table, seat.id));
    const paidAmount = addSeatContribution(table, seat.id, callAmount);
    markStreetAction(table, seat.id);
    recordSeatAction(table, seat.id, `Call ${formatBb(contributionOf(table, seat.id))}`, "passive", true, { botReason: villainPlan.label, labSpot });
    addLog(table, `${seat.position} call ${formatBb(paidAmount)} · ${villainPlan.label}`);
    return "call";
  }

  function applyBotPostflopShoveOverBet(table, seat, target, villainPlan, labSpot) {
    const previousBet = Number(table.currentBet || target || 0);
    // Cap the shove to the effective stack (deepest live opponent) so a deep
    // bot never over-commits chips a short opponent can't cover — mirrors the
    // cap already applied on the raise path (effectivePostflopRaiseCap).
    const allInTarget = Math.min(
      Number(villainPlan.allInTarget || maxContributionForSeat(table, seat.id)),
      effectiveAllInCeiling(table, seat.id)
    );
    const commit = commitRaise(table, seat.id, allInTarget, {
      previousBet,
      postflop: true,
      lockHeroPostflopOnShortRaise: true
    });
    if (!(commit.paidAmount > 0)) return "call";

    const newTotal = commit.target;
    table.lastAction = `${seat.position} all-in to ${formatBb(newTotal)} - ${villainPlan.label}`;

    markStreetAction(table, seat.id);
    recordSeatAction(table, seat.id, `All-in ${formatBb(newTotal)}`, "aggressive", true, {
      botReason: villainPlan.label,
      labSpot,
      allInResponse: true
    });
    addLog(table, table.lastAction);
    // "raise-full" reopens the betting; "raise-short" is an incomplete all-in that
    // does NOT reopen action for already-acted seats (BUGHUNT F003).
    return commit.reopened ? "raise-full" : "raise-short";
  }

  function applyBotPostflopRaiseOverBet(table, seat, target, villainPlan, labSpot) {
    const previousBet = Number(table.currentBet || target || 0);
    const raiseTarget = Math.min(
      Number(villainPlan.raiseTo || 0),
      maxContributionForSeat(table, seat.id),
      effectivePostflopRaiseCap(table, seat.id)
    );
    if (!(raiseTarget > previousBet)) return "call";

    const commit = commitRaise(table, seat.id, raiseTarget, {
      previousBet,
      postflop: true,
      lockHeroPostflopOnShortAllIn: true
    });
    if (!(commit.paidAmount > 0)) return "call";

    const newTotal = commit.target;
    const allIn = commit.allIn;
    table.lastAction = `${seat.position} ${allIn ? "all-in" : "raise"} to ${formatBb(newTotal)} - ${villainPlan.label}`;

    markStreetAction(table, seat.id);
    recordSeatAction(table, seat.id, `${allIn ? "All-in" : "Raise to"} ${formatBb(newTotal)}`, "aggressive", true, {
      botReason: villainPlan.label,
      labSpot,
      postflopRaise: true
    });
    addLog(table, table.lastAction);
    // "raise-full" reopens; "raise-short" (incomplete all-in) does NOT. BUGHUNT F003.
    return commit.reopened ? "raise-full" : "raise-short";
  }

  function applyVillainPostflopAction(table, settings, leadOnStreet) {
    const villain = table.seats[table.activeVillain];
    if (!villain || villain.folded) return "check";

    const lead = botPostflopIntent(table, villain.cards, settings, leadOnStreet, villain);
    table.villainActedThisStreet = true;
    markStreetAction(table, table.activeVillain);
    table.lastBotDecision = lead.label;

    if (lead.bet) {
      const commit = commitRaise(table, table.activeVillain, lead.amount, {
        previousBet: 0,
        postflop: true
      });
      if (!(commit.paidAmount > 0)) {
        const labSpot = postflopLabSpot(table, "empty stack", leadOnStreet);
        recordSeatAction(table, table.activeVillain, "Check", "passive", true, { botReason: "empty stack", labSpot, labSpots: [labSpot] });
        addLog(table, `${villain.position} check · empty stack`);
        return "check";
      }
      table.heroTurn = true;
      table.busy = false;
      table.toCall = commit.paidAmount;
      table.canCheck = false;
      if (table.street === "turn" || table.street === "river") {
        table.villainTurnRiverBets = Number(table.villainTurnRiverBets || 0) + 1;
      }
      table.lastAction = `${villain.position} bet ${formatBb(commit.paidAmount)} · ${lead.label}`;
      const labSpot = lead.labSpot || postflopLabSpot(table, lead.label, leadOnStreet);
      recordSeatAction(table, table.activeVillain, `Bet ${formatBb(commit.paidAmount)}`, "aggressive", true, { botReason: lead.label, labSpot, labSpots: [labSpot] });
      addLog(table, table.lastAction);
      return "bet";
    }

    table.heroTurn = true;
    table.busy = false;
    table.toCall = 0;
    table.canCheck = true;
    table.lastAction = `${villain.position} check`;
    const labSpot = lead.labSpot || postflopLabSpot(table, lead.label, leadOnStreet);
    recordSeatAction(table, table.activeVillain, "Check", "passive", true, { botReason: lead.label, labSpot, labSpots: [labSpot] });
    addLog(table, `${villain.position} check · ${lead.label}`);
    return "check";
  }

  function advanceAfterStreetAction(table, settings) {
    if (table.street === "flop") {
      return advanceStreet(table, "turn", settings);
    }

    if (table.street === "turn") {
      return advanceStreet(table, "river", settings);
    }

    return showdown(table);
  }

  function advanceStreet(table, nextStreet, settings) {
    // Defensive backstop: never deal the next street while a non-folded seat
    // with chips still owes the standing bet. A street that has not been
    // closed must resolve responses first (prevents an unmatched seat being
    // dragged into showdown or a hung table).
    const standingBet = Number(table.currentBet || 0);
    if (standingBet > 0) {
      const seatOwes = (seat) => {
        if (!seat || seat.folded || remainingStack(table, seat.id) <= 0) return false;
        const required = Math.min(standingBet, maxContributionForSeat(table, seat.id));
        return contributionOf(table, seat.id) + EPSILON_BB < required;
      };
      const owing = (table.seats || []).some(seatOwes);
      if (owing) {
        const lockedRunout = maybeRunoutAllIn(table);
        if (lockedRunout) return lockedRunout;
        // Authoritative backstop: the runout is NOT locked, so >=2 live
        // chip-stacked seats genuinely still owe the standing bet. Do NOT deal
        // the next street with an open round — re-run the closure sweep so
        // every owing bot calls/folds/raises and the round actually closes
        // (mirrors the call-path sweep in resolvePostflop). The sweep visits
        // each contesting seat once and only recurses on a raise (which
        // advances the aggressor), so it terminates.
        const heroSeatRef = heroSeat(table);
        const heroOwes = Boolean(heroSeatRef) && seatOwes(heroSeatRef);
        const sweepResult = resolveBotResponsesToCurrentBet(table, settings, {
          aggressorSeatId: table.streetAggressorSeatId ?? table.activeVillain,
          afterSeatId: table.streetAggressorSeatId ?? table.activeVillain,
          stopAtHero: heroOwes,
          labSpot: "advance-backstop"
        });
        // Hero still owes a live decision: hand control back, never deal here.
        if (sweepResult && sweepResult.stoppedAtHero) return "action";
        // A bot raise/shove during the sweep may have created a locked runout.
        const sweptRunout = maybeRunoutAllIn(table);
        if (sweptRunout) return sweptRunout;
        // After a full deterministic bot sweep every live non-hero seat has
        // matched, folded, or is all-in, and a still-owing hero was returned
        // above — so the round is now closed and dealing is correct.
      }
    }
    normalizePostflopContestants(table);
    rememberClosedStreet(table);
    clearStreetBets(table);
    const drawCount = nextStreet === "flop" ? 3 : 1;
    for (let index = 0; index < drawCount; index += 1) {
      table.board.push(drawCard(table.deck));
    }

    table.street = nextStreet;
    table.currentBet = 0;
    table.lastRaiseSize = 0;
    table.minRaiseTo = 1;
    table.toCall = 0;
    table.canCheck = true;
    table.busy = false;
    table.heroTurn = true;
    table.heroPreflopRaiseLocked = false;
    table.heroPostflopRaiseLocked = false;
    table.villainActedThisStreet = false;
    table.streetActionSeatIds = [];
    table.streetAggressorSeatId = null;
    table.lastAction = `${streetLabel(nextStreet)} раздан`;
    addLog(table, table.lastAction);
    recordTimeline(table, "street", table.lastAction, { board: table.board.slice() });

    const allInRunout = maybeRunoutAllIn(table);
    if (allInRunout) return allInRunout;

    const firstActor = nextPostflopActor(table);
    const firstOpponent = postflopOrderedContestingSeats(table).find((seat) => !seat.isHero);
    if (firstOpponent) {
      table.activeVillain = firstOpponent.id;
    }

    if (firstActor && !firstActor.isHero) {
      const leadTone = resolvePostflopLeadSequence(table, settings);
      return table.status === "playing" ? "deal" : leadTone;
    } else {
      table.heroTurn = Boolean(firstActor?.isHero ?? true);
      table.busy = false;
    }

    return "deal";
  }


  // Multi-lobby scaffolding: future real-player seats can be put in
  // sitting-out / disconnected states by the lobby layer. Bot seats stay
  // "active" — bots never time out. Engine helper exists so the lobby
  // doesn't reach into seat fields directly; if we later need auto-fold
  // for sitting-out players, the logic goes here too.
  function setSeatLobbyState(table, seatId, lobbyState) {
    if (!table) return false;
    const allowed = new Set(["active", "sitting-out", "disconnected", "eliminated"]);
    if (!allowed.has(lobbyState)) return false;
    const seat = seatById(table, seatId);
    if (!seat) return false;
    if (String(seat.lobbyState || "active") === "eliminated" && lobbyState !== "eliminated") return false;
    seat.lobbyState = lobbyState;
    return true;
  }

  // Multi-lobby driver. Called between hands by the simulator UI on the
  // *previous* table, so the new lobby states ride into the next hand via
  // `carryoverSeatsForTable`.
  //
  // Transitions are probabilistic and Markov-ish:
  //   active        -> sitting-out (1.2%) | disconnected (0.5%)
  //   sitting-out   -> active (25%)
  //   disconnected  -> active (35%) | sitting-out (8% timeout)
  //   eliminated    -> eliminated (terminal tournament bustout)
  //
  // A seat that *would become* dealer / SB / BB in the next hand is held active:
  // an active blind seat never sits out, and a seat already sitting-out /
  // disconnected that rotates onto a blind is pulled back to active. Otherwise
  // the engine would skip a blind and the seat would render folded with chips
  // posted before the action reached it. The next button/blinds are computed
  // over the same ring `createTable` uses (see `ringSeatIds` below), so the
  // protected seats match the real next hand. Other sitouts stay in the ring.
  // Hero is always pinned active. Pass a deterministic `random` for tests.
  function tickLobbyForHand(table, options = {}) {
    const transitions = [];
    if (!table || !Array.isArray(table.seats) || table.seats.length < 2) return transitions;
    const random = typeof options.random === "function" ? options.random : randomUnit;

    const count = table.seats.length;
    // The next hand's button/blinds must be computed over the SAME ring
    // `createTable` uses — every seat still in the hand (not eliminated, stack
    // > 0), INCLUDING sitting-out / disconnected seats. Using only active seats
    // here computes a different button and SB/BB than the actual next hand, so
    // the "protected" set guarded the wrong seats and a sitting-out seat could
    // land on the real SB/BB — posting a blind and rendering folded before the
    // action reached it. Mirrors `blindRingCarryoverSeatIds`.
    const ringSeatIds = table.seats
      .filter((seat) =>
        seat
        && String(seat.lobbyState || "active") !== "eliminated"
        && Number(seat.stack || 0) > 0
      )
      .map((seat) => Number(seat.id))
      .filter((seatId) => Number.isFinite(seatId));
    const nextDealerSeat = nextActiveDealerSeatId(table, ringSeatIds, count);
    const nextPositions = positionsForActiveSeatIds(count, ringSeatIds, nextDealerSeat);
    const { dealer, smallBlind, bigBlind } = blindPositions(playablePositionsForCount(ringSeatIds.length));
    const protectedSeatIds = new Set();
    nextPositions.forEach((position, seatId) => {
      if (position === dealer || position === smallBlind || position === bigBlind) {
        protectedSeatIds.add(seatId);
      }
    });

    for (const seat of table.seats) {
      if (!seat || seat.isHero) continue;
      const current = String(seat.lobbyState || "active");
      if (current === "eliminated") continue;

      // The next dealer / SB / BB is held active. If it is already sitting-out
      // or disconnected, pull it back to active now so it is dealt in and posts
      // a real blind instead of rendering folded with chips in the pot before
      // the action reaches it. Active protected seats simply skip the sit-out
      // roll. Without this an existing sit-out rotating onto a blind reproduced
      // the "SB shown folded though the action never reached it" bug.
      if (protectedSeatIds.has(Number(seat.id))) {
        if (current !== "active") {
          seat.lobbyState = "active";
          transitions.push({ seatId: seat.id, name: seat.name || "", position: seat.position || "", from: current, to: "active" });
        }
        continue;
      }

      let next = current;
      const roll = random();

      if (current === "active") {
        if (roll < 0.012) next = "sitting-out";
        else if (roll < 0.012 + 0.005) next = "disconnected";
      } else if (current === "disconnected") {
        if (roll < 0.35) next = "active";
        else if (roll < 0.35 + 0.08) next = "sitting-out";
      } else if (current === "sitting-out") {
        if (roll < 0.25) next = "active";
      }

      if (next !== current) {
        seat.lobbyState = next;
        transitions.push({
          seatId: seat.id,
          name: seat.name || "",
          position: seat.position || "",
          from: current,
          to: next
        });
      }
    }

    return transitions;
  }

var __pokerSimulatorEngineParts = (typeof window !== "undefined" ? window : globalThis).PokerSimulatorEngineParts
  || ((typeof window !== "undefined" ? window : globalThis).PokerSimulatorEngineParts = {});
Object.assign(__pokerSimulatorEngineParts, {
  preflopOrderAfterHero,
  postflopOrderedContestingSeats,
  isInPositionVs,
  choosePrimaryPostflopVillain,
  markStreetAction,
  hasStreetAction,
  nextPostflopActor,
  postflopSeatsAfter,
  refreshSpotText,
  simulationMode,
  settingsNumber,
  settingsInteger,
  randomStackRange,
  randomStackDepth,
  randomSeatStackDepths,
  tournamentBlindLevels,
  tournamentLevelHands,
  tournamentLevelIndex,
  tournamentBlindMultiplier,
  tournamentStartingStackDepth,
  createTable,
  markInactiveLobbySeatsForHand,
  heroHasWonTournament,
  markTournamentWonIfNeeded,
  markTournamentCompleteIfNeeded,
  formatBb,
  roundBbValue,
  difficultyLabel,
  streetLabel,
  addLog,
  startHeroAction,
  forfeitHeroHand,
  applyHeroAction,
  actionAmount,
  heroRaiseBlockedByShortPreflopAllIn,
  heroRaiseBlockedByShortPostflopAllIn,
  actionVerb,
  botDelay,
  resolveBotAction,
  resolvePreflop,
  needsHeroPreflopResponse,
  isRaiseLikeHeroAction,
  isBetOnlyHeroAction,
  isFacingHeroPreflopThreeBet,
  isFacingHeroPreflopFourBet,
  preflopResponseLabSpots,
  preflopFoldLabel,
  settlePreflopAfterHero,
  resolvePostflop,
  shouldRunTournamentBotsAfterHeroFold,
  runTournamentBotsAfterHeroFold,
  finishTournamentBotOnlyHand,
  playBotOnlyPreflop,
  botOnlyPreflopRoundClosed,
  dealNextBotOnlyStreet,
  playBotOnlyPostflopStreet,
  botOnlyPostflopRoundClosed,
  nextBotOnlyPostflopActor,
  liveBotContestants,
  singleLiveBotContestant,
  botOnlyAllInLocked,
  runBotOnlyAllInToShowdown,
  finishBotOnlyFoldWin,
  resolvePostflopLeadSequence,
  updateHeroPostflopDecision,
  resolveBotResponsesToCurrentBet,
  resolveBotCallOrFoldToCurrentBet,
  applyBotPostflopShoveOverBet,
  applyBotPostflopRaiseOverBet,
  applyVillainPostflopAction,
  advanceAfterStreetAction,
  advanceStreet,
  setSeatLobbyState,
  tickLobbyForHand
});
