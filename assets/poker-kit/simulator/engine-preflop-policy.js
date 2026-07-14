// Preflop policy and preflop round resolution. Loaded before simulator-engine.js facade.
  function resolvePreflopBotTurn(table, seat, settings, ctx = {}) {
    if (!seat || seat.isHero || seat.folded) return { kind: "skip" };
    const acted = ctx.acted instanceof Set ? ctx.acted : null;
    const markActed = () => {
      if (acted) acted.add(seat.id);
    };

    if (remainingStack(table, seat.id) <= 0) {
      if (Number(table.currentBet || 0) > 0 && contributionOf(table, seat.id) > 0) {
        table.activeVillain = seat.id;
      }
      markActed();
      return { kind: "all-in-skip" };
    }

    const target = Number(table.currentBet || 0);
    const contribution = contributionOf(table, seat.id);
    const hasMatchedCheckOption = Boolean(
      ctx.checkOption
      && target <= 1 + EPSILON_BB
      && contribution >= Math.min(target, maxContributionForSeat(table, seat.id)) - EPSILON_BB
    );
    if (ctx.skipActedMatched && acted?.has(seat.id) && contribution >= Math.min(target, maxContributionForSeat(table, seat.id)) - EPSILON_BB) {
      return { kind: "matched" };
    }
    if (ctx.skipMatched && !hasMatchedCheckOption && contribution >= Math.min(target, maxContributionForSeat(table, seat.id)) - EPSILON_BB) {
      if (target > 0 && contribution > 0) table.activeVillain = seat.id;
      markActed();
      return { kind: "matched" };
    }

    const decision = preHeroDecision(table, seat, settings);
    // NL re-open rule (BUGHUNT F007): a seat already in `acted` that is re-offered here
    // is only owing chips because a short (sub-min) all-in bumped the bet — a full raise
    // clears `acted` below. Such a seat may call or fold, NOT re-raise. Downgrade a
    // raise/open to a call of the current bet (capped by stack).
    if (acted?.has(seat.id) && (decision.action === "open" || decision.action === "raise")) {
      const callTarget = Math.min(target, maxContributionForSeat(table, seat.id));
      decision.action = "call";
      decision.added = Math.max(0, callTarget - contribution);
    }
    const labSpotsFor = (fallbackDecision) =>
      typeof ctx.labSpotsFor === "function" ? ctx.labSpotsFor(table, seat, fallbackDecision) : defaultPreflopLabSpots(table, fallbackDecision);
    const foldLabel = typeof ctx.foldLabel === "function" ? ctx.foldLabel(table, seat, decision) : "Fold";

    if (ctx.checkOption && target <= 1 && contribution >= target && decision.action !== "open" && decision.action !== "raise") {
      recordSeatAction(table, seat.id, "Check", "passive", true, { botReason: "bot-only BB option", labSpot: "open", labSpots: ["open"] });
      addLog(table, `${seat.position} check · bot-only`);
      markActed();
      return { kind: "check", decision };
    }

    if (decision.action === "fold") {
      foldSeat(table, seat, "preflop");
      const labSpots = labSpotsFor(decision);
      recordSeatAction(table, seat.id, foldLabel, "fold", true, { botReason: decision.label, labSpot: labSpots[0], labSpots });
      addLog(table, `${seat.position} fold · ${decision.label}`);
      markActed();
      return { kind: "fold", decision };
    }

    if (decision.action === "call") {
      const paidAmount = addSeatContribution(table, seat.id, decision.added, true);
      markPreflopOpenCaller(table, seat.id);
      table.activeVillain = seat.id;
      const labSpots = labSpotsFor(decision);
      recordSeatAction(table, seat.id, `Call ${formatBb(contributionOf(table, seat.id))}`, "passive", true, { botReason: decision.label, labSpot: labSpots[0], labSpots, pushFold: Boolean(decision.pushFold) });
      addLog(table, `${seat.position} call ${formatBb(paidAmount)} · ${decision.label}`);
      markActed();
      return { kind: "call", decision, paidAmount };
    }

    if (decision.action === "open" || decision.action === "raise") {
      const actionLabSpots = decision.action === "open" ? ["open"] : labSpotsFor(decision);
      const commit = commitCappedPreflopRaise(table, seat, decision);
      if (commit.kind === "call") {
        recordSeatAction(table, seat.id, `Call ${formatBb(contributionOf(table, seat.id))}`, "passive", true, { botReason: decision.label, labSpot: actionLabSpots[0], labSpots: actionLabSpots, pushFold: Boolean(decision.pushFold) });
        addLog(table, `${seat.position} call ${formatBb(commit.paidAmount)} · ${decision.label}`);
        markActed();
        return { kind: "call", decision, commit };
      }
      const cappedDecision = { ...decision, target: commit.target, added: commit.added, allIn: commit.allIn || commit.allInPressure || decision.allIn };
      recordSeatAction(table, seat.id, preflopAggressiveActionLabel(cappedDecision), "aggressive", true, { botReason: decision.label, labSpot: actionLabSpots[actionLabSpots.length - 1], labSpots: actionLabSpots, pushFold: Boolean(decision.pushFold) });
      addLog(table, `${seat.position} ${preflopAggressiveLogLabel(cappedDecision)} · ${decision.label}`);
      if (acted) {
        // Only a FULL legal min-raise re-opens the betting (clears `acted`); a short
        // (incomplete) all-in does not — already-acted seats stay closed to raising so
        // they are offered call/fold only above. BUGHUNT F007.
        if (commit.reopened) acted.clear();
        acted.add(seat.id);
      }
      return { kind: "raise", decision, commit };
    }

    return { kind: "skip", decision };
  }

  // Fixed per-player ante (in BB), posted on every hand. A lesson/drill may
  // instead set `bigBlindAnteBb` to post one tournament-style ante from the BB.
  // The two modes are mutually exclusive; BB ante wins when both are present.
  // The engine settles
  // chips on a 0.1 BB grid, so the ante is grid-aligned. Antes are dead money:
  // they go straight into the pot, never into `contributions` (so they never
  // change `currentBet`/`toCall`) and never set a per-seat bet marker. The
  // side-pot builder folds them into the main pot as dead money at showdown,
  // which is exactly how antes behave in real play.
  const PREFLOP_ANTE_BB = 0.1;

  function postPreflopAntes(table, settings = {}) {
    const bigBlindAnteSetting = Number(settings?.bigBlindAnteBb || 0);
    const bigBlindAnte = roundBbValue(Number.isFinite(bigBlindAnteSetting) && bigBlindAnteSetting > 0 ? bigBlindAnteSetting : 0);
    const anteSetting = Object.prototype.hasOwnProperty.call(settings || {}, "anteBb")
      ? Number(settings.anteBb)
      : settings?.disableAnte === true || settings?.antes === false
        ? 0
        : PREFLOP_ANTE_BB;
    const ante = bigBlindAnte > 0 ? 0 : roundBbValue(Number.isFinite(anteSetting) && anteSetting > 0 ? anteSetting : 0);
    table.anteBb = ante;
    table.bigBlindAnteBb = bigBlindAnte;
    table.anteMode = bigBlindAnte > 0 ? "big-blind" : ante > 0 ? "per-player" : "none";
    table.anteTotal = 0;
    table.anteContributions = {};
    if (bigBlindAnte > 0 && Array.isArray(table.seats)) {
      const { bigBlind } = blindPositions(table.positions);
      const seat = seatByPosition(table, bigBlind);
      if (!seat || seat.folded || String(seat.lobbyState || "active") === "eliminated") return 0;
      const paid = roundBbValue(Math.min(bigBlindAnte, remainingStack(table, seat.id)));
      if (!(paid > 0)) return 0;
      seat.stack = roundBbValue(remainingStack(table, seat.id) - paid);
      table.pot = roundBbValue(Number(table.pot || 0) + paid);
      table.anteContributions[seat.id] = paid;
      table.anteTotal = paid;
      addLog(table, `BB ante ${formatBb(paid)}`);
      return paid;
    }
    if (!(ante > 0) || !Array.isArray(table.seats)) return 0;

    let postedTotal = 0;
    let postedSeats = 0;
    for (const seat of table.seats) {
      // Only seats actually in the hand ante: an eliminated, sitting-out,
      // disconnected or busted seat is dealt out and posts nothing. `folded`
      // is the universal "not in the live pot" flag, already set for inactive
      // lobby seats before preflop init runs.
      if (!seat || seat.folded || String(seat.lobbyState || "active") === "eliminated") continue;
      const paid = roundBbValue(Math.min(ante, remainingStack(table, seat.id)));
      if (!(paid > 0)) continue;
      seat.stack = roundBbValue(remainingStack(table, seat.id) - paid);
      table.pot = roundBbValue(Number(table.pot || 0) + paid);
      table.anteContributions[seat.id] = roundBbValue(Number(table.anteContributions[seat.id] || 0) + paid);
      postedTotal = roundBbValue(postedTotal + paid);
      postedSeats += 1;
    }

    table.anteTotal = postedTotal;
    if (postedSeats > 0) {
      addLog(table, `Анте ${formatBb(ante)} × ${postedSeats} = ${formatBb(postedTotal)} в банк`);
    }
    return postedTotal;
  }

  // Declarative practice scenarios may prescribe the action before Hero. This
  // is intentionally action-only: the regular engine still posts blinds/antes,
  // deals one legal deck and owns every chip/state transition. A pack never
  // receives coordinates or mutates the rendered table.
  function resolvePracticePreflopAction(table, seat, action = {}, settings = {}) {
    if (!seat || seat.isHero || seat.folded) return { kind: "skip" };
    const kind = String(action.action || action.kind || "").toLowerCase();
    const reason = `practice scenario ${kind || "action"}`;

    if (kind === "fold") {
      foldSeat(table, seat, "preflop");
      recordSeatAction(table, seat.id, "Fold", "fold", true, { botReason: reason, labSpot: "open", labSpots: ["open"] });
      addLog(table, `${seat.position} fold · ${reason}`);
      return { kind: "fold" };
    }

    if (kind === "call" || kind === "limp" || kind === "complete") {
      const target = Math.max(0, Number(action.toBb ?? table.currentBet ?? 0));
      const added = Math.max(0, Math.min(target, maxContributionForSeat(table, seat.id)) - contributionOf(table, seat.id));
      const paidAmount = addSeatContribution(table, seat.id, added, true);
      markPreflopOpenCaller(table, seat.id);
      table.activeVillain = seat.id;
      const label = kind === "limp" || kind === "complete" ? "Limp" : `Call ${formatBb(contributionOf(table, seat.id))}`;
      recordSeatAction(table, seat.id, label, "passive", true, { botReason: reason, labSpot: "open", labSpots: ["open"] });
      addLog(table, `${seat.position} ${kind} ${formatBb(paidAmount)} · ${reason}`);
      return { kind: "call", paidAmount };
    }

    if (kind === "raise" || kind === "open") {
      const target = Math.max(Number(table.currentBet || 0), Number(action.toBb ?? action.targetBb ?? 2));
      const decision = {
        action: Number(table.currentBet || 0) > 1 ? "raise" : "open",
        target,
        added: Math.max(0, target - contributionOf(table, seat.id)),
        label: reason,
        allIn: target >= maxContributionForSeat(table, seat.id) - EPSILON_BB
      };
      const commit = commitCappedPreflopRaise(table, seat, decision);
      const resolved = { ...decision, target: commit.target, added: commit.added, allIn: commit.allIn || decision.allIn };
      recordSeatAction(table, seat.id, preflopAggressiveActionLabel(resolved), "aggressive", true, { botReason: reason, labSpot: "open", labSpots: ["open"] });
      addLog(table, `${seat.position} ${preflopAggressiveLogLabel(resolved)} · ${reason}`);
      return { kind: "raise", commit };
    }

    return resolvePreflopBotTurn(table, seat, settings);
  }

  function initializePreflop(table, settings) {
    const { smallBlind, bigBlind } = blindPositions(table.positions);
    const smallBlindSeat = seatByPosition(table, smallBlind);
    const bigBlindSeat = seatByPosition(table, bigBlind);
    const heroActionIndex = table.positions.indexOf(table.heroPosition);

    const canPostBlind = (seat) =>
      seat
      && String(seat.lobbyState || "active") !== "eliminated"
      && Number(seat.stack || 0) > 0;

    const rawBigBlindAnte = Number(settings?.bigBlindAnteBb || 0);
    const usesBigBlindAnte = Number.isFinite(rawBigBlindAnte) && rawBigBlindAnte > 0;

    // Traditional per-player antes are collected before the blinds. A BB ante
    // is different: the live big blind has priority, and only the BB's remaining
    // stack posts the dead ante. This keeps a sub-2 BB stack eligible through its
    // live blind instead of consuming it as ante first.
    if (!usesBigBlindAnte) postPreflopAntes(table, settings);

    const sbPaid = canPostBlind(smallBlindSeat)
      ? addSeatContribution(table, smallBlindSeat.id, 0.5, false)
      : 0;
    const bbPaid = canPostBlind(bigBlindSeat)
      ? addSeatContribution(table, bigBlindSeat.id, 1, false)
      : 0;

    if (usesBigBlindAnte) postPreflopAntes(table, settings);

    // Floor currentBet at the full big blind whenever the BB seat is
    // lobby-active. A short all-in BB (stack < 1bb) only pays a partial blind,
    // but the table is still priced at a full big blind to act behind — never
    // at the underpriced short amount. A non-active (dead) BB seat keeps the
    // documented dead-blind behavior (no floor).
    const bbFloor = (bigBlindSeat && String(bigBlindSeat.lobbyState || "active") === "active") ? 1 : 0;
    table.currentBet = Math.max(sbPaid, bbPaid, bbFloor, 0);
    table.lastRaiseSize = 1;

    const practiceActions = Array.isArray(table.practiceScenario?.beforeHero)
      ? table.practiceScenario.beforeHero
      : [];
    const practiceActionByPosition = new Map(practiceActions
      .map((action) => [String(action?.position || "").toUpperCase(), action])
      .filter(([position]) => position));
    const defaultPracticeAction = table.practiceScenario?.defaultBeforeHero || null;
    for (const position of table.positions.slice(0, Math.max(0, heroActionIndex))) {
      const seat = seatByPosition(table, position);
      const practiceAction = practiceActionByPosition.get(String(position).toUpperCase()) || defaultPracticeAction;
      if (practiceAction) resolvePracticePreflopAction(table, seat, practiceAction, settings);
      else resolvePreflopBotTurn(table, seat, settings);
    }

    if (!table.seats.some((seat) => !seat.isHero && !seat.folded)) {
      // Forced live-spot fallback must respect lobby state — a sitting-out
      // or disconnected seat cannot suddenly start acting just because
      // everyone else folded.
      // Heads-up is the exception: an SB open-fold is a real walk for the BB,
      // not a fake forced limp that keeps the hand alive.
      if (!isHeadsUpTable(table)) {
        const isLobbyActiveOpponent = (seat) => seat && !seat.isHero && (seat.lobbyState || "active") === "active";
        const fallback = isLobbyActiveOpponent(smallBlindSeat)
          ? smallBlindSeat
          : table.seats.find(isLobbyActiveOpponent);
        if (fallback) {
          removeSeatFoldAction(table, fallback.id);
          fallback.folded = false;
          fallback.foldedAt = "";
          table.activeVillain = fallback.id;
          const target = Math.max(1, table.currentBet);
          const added = Math.max(0, target - contributionOf(table, fallback.id));
          if (added > 0) addSeatContribution(table, fallback.id, added, true);
          recordSeatAction(table, fallback.id, `Call ${formatBb(target)}`, "passive", true, { botReason: "forced live spot", labSpot: "open", labSpots: ["open"] });
          addLog(table, `${fallback.position} call ${formatBb(target)} · forced live spot`);
        }
      }
    }

    if (!table.seats.some((seat) => !seat.isHero && !seat.folded)) {
      table.status = "won";
      table.busy = false;
      awardPot(table, [heroSeat(table)]);
      closeTerminalBettingState(table);
      table.result = `Hero win ${formatBb(table.pot)}`;
      table.lastAction = isHeadsUpTable(table) ? "Walk" : "Opponents sit out";
      addLog(table, table.lastAction);
      recordTimeline(table, "result", table.result, { status: table.status, result: table.result });
      return;
    }

    if (table.activeVillain < 0) {
      table.activeVillain = chooseDefaultVillain(table);
    }

    updatePreflopStateForHero(table);
    refreshSpotText(table);
  }

  function removeSeatFoldAction(table, seatId) {
    const normalizedSeatId = Number(seatId);
    table.actionAnimations = (table.actionAnimations || [])
      .filter((event) => !(Number(event.seatId) === normalizedSeatId && event.tone === "fold"));
    table.actionTimeline = (table.actionTimeline || [])
      .filter((event) => !(Number(event.seatId) === normalizedSeatId && event.tone === "fold"));
    const label = `${seatTimelineLabel(table, normalizedSeatId)} fold`;
    table.logs = (table.logs || []).filter((line) => !String(line).toLowerCase().startsWith(label.toLowerCase()));
  }

  // Aggro spew leak (gated to the aggro archetype, never pro): a calibrated minority of opens and
  // raises get a too-large "splashy" sizing. Realistic, not every hand — the exploit is that the
  // bot occasionally bloats the pot OOP with a face-up over-size, not that it always does. The
  // grader judges Hero on the pro-chart / reg-style, so a bot's larger bet never widens Hero's good
  // zone; if anything it correctly invites Hero to over-fold to the big sizing per the 15-11 overlay.
  function aggroOversizeOpenTarget(baseTarget, table, seat, difficulty, style) {
    if (style !== "aggro" || normalizeDifficulty(difficulty) === "pro") return baseTarget;
    if (!randomChance(0.22)) return baseTarget;
    const ceiling = maxContributionForSeat(table, seat.id);
    const bloated = roundBbValue(Number(baseTarget || 0) * (1.2 + randomInt(3) * 0.05)); // ~1.2-1.3x aggro spew
    return Math.min(ceiling, Math.max(Number(baseTarget || 0), bloated));
  }

  function arenaOpenTarget(baseTarget, table, seat, difficulty, combo, stackDepth) {
    const depth = Number.isFinite(Number(stackDepth)) && Number(stackDepth) > 0 ? Number(stackDepth) : Number(table?.stackDepth || 0);
    // 20bb chart opens are smoke-locked to min-open sizing; push/fold handles the real jam band.
    if (depth > 0 && depth <= 24) return baseTarget;

    const minSizingBias = clamp(Number(botStrategyArenaProductionAdjustment(difficulty, "smallBetFrequency", seat) || 0), 0, 0.35);
    const overbetBias = clamp(Number(botStrategyArenaProductionAdjustment(difficulty, "overbetFrequency", seat) || 0), 0, 0.35);
    const jamBias = clamp(Number(botStrategyArenaProductionAdjustment(difficulty, "jamFrequency", seat) || 0), 0, 0.35);
    const sizeBias = clamp(Number(botStrategyArenaProductionAdjustment(difficulty, "sizeBias", seat) || 0), -0.35, 0.35);
    if (!minSizingBias && !overbetBias && !jamBias && !sizeBias) return baseTarget;

    const ceiling = roundBbValue(Math.min(maxContributionForSeat(table, seat.id), effectiveAllInCeiling(table, seat.id)));
    const minOpenTo = roundBbValue(Math.min(ceiling, Math.max(2, Number(table.minRaiseTo || 2))));
    if (!(ceiling > 0) || minOpenTo >= ceiling) return Math.min(ceiling, baseTarget);

    const position = String(seat?.position || "");
    const late = position === "SB" || position === "BTN" || position === "CO";
    const strong = isPremiumPreflopCombo(combo) || isPocketPairCombo(combo);
    const minOpenFrequency = clamp(
      minSizingBias
        + (late ? 0.025 : 0)
        - Math.max(0, sizeBias) * 0.08,
      0,
      0.42
    );
    if (Number(baseTarget || 0) > minOpenTo + EPSILON_BB && randomChance(minOpenFrequency)) {
      return minOpenTo;
    }

    const jamFrequency = clamp(
      (depth <= 35 ? jamBias * 0.42 : jamBias * (strong ? 0.045 : 0.012))
        + (depth <= 30 && strong ? 0.012 : 0),
      0,
      depth <= 35 ? 0.2 : 0.025
    );
    if (ceiling > minOpenTo + EPSILON_BB && randomChance(jamFrequency)) return ceiling;

    const adjusted = roundBbValue(
      Number(baseTarget || 0)
        * (1 + sizeBias * 0.35 + overbetBias * 0.22 - minSizingBias * 0.12)
    );
    return Math.min(ceiling, Math.max(minOpenTo, adjusted));
  }

  function aggroOversizeRaiseTarget(baseTarget, table, seat, difficulty, style) {
    if (style !== "aggro" || normalizeDifficulty(difficulty) === "pro") return baseTarget;
    if (Number(table?.currentBet || 0) > MAX_SINGLE_OPEN_TO_BB + 0.01) return baseTarget;
    if (!randomChance(0.26)) return baseTarget;
    const ceiling = maxContributionForSeat(table, seat.id);
    const bloated = roundBbValue(Number(baseTarget || 0) * (1.18 + randomInt(3) * 0.04)); // ~1.18-1.26x
    return Math.min(ceiling, Math.max(Number(baseTarget || 0), bloated));
  }

  function preHeroDecision(table, seat, settings) {
    const combo = normalizeCombo(seat.cards);
    const difficulty = difficultyForSeat(settings, seat);
    const style = styleForSeat(seat);
    const headsUp = isHeadsUpTable(table);

    if (table.currentBet <= 1) {
      const openStackDepth = effectiveOpenStackDepth(table, seat);
      const pushFoldDecision = botOpenPushFoldDecision(table, seat, combo, difficulty, style, openStackDepth);
      if (pushFoldDecision) return pushFoldDecision;

      const patterns = openPatternsFor(seat.position, difficulty, openStackDepth, headsUp, seat);
      const inOpenChart = chartContains(patterns, combo);
      // C5: fish open-limp competes with (and can preempt) the open — evaluated before the open-chart
      // decision so the trap-limped nuts and the random in-chart limps are not pre-empted by a raise.
      const fishLimp = botFishLimpDecision(table, seat, combo, difficulty, style, inOpenChart, openStackDepth);
      if (fishLimp) return fishLimp;
      const openFrequency = botOpenFrequency(difficulty, style, inOpenChart, combo, openStackDepth, seat.position, seat);
      if (inOpenChart && randomChance(openFrequency)) {
        const baseTarget = openSizeFor(seat.position, table, openStackDepth);
        const target = aggroOversizeOpenTarget(arenaOpenTarget(baseTarget, table, seat, difficulty, combo, openStackDepth), table, seat, difficulty, style);
        return {
          action: "open",
          target,
          added: Math.max(0, target - contributionOf(table, seat.id)),
          label: `${combo} open chart ${stackDepthLabel(openStackDepth)} · ${style}`
        };
      }

      if (!inOpenChart && style === "aggro" && difficulty !== "pro" && randomChance(0.08)) {
        const baseTarget = openSizeFor(seat.position, table, openStackDepth);
        const target = arenaOpenTarget(baseTarget, table, seat, difficulty, combo, openStackDepth);
        return {
          action: "open",
          target,
          added: Math.max(0, target - contributionOf(table, seat.id)),
          label: `${combo} aggro splash`
        };
      }

      const looseOpenChance = botLooseOpenFrequency(difficulty, style, combo, openStackDepth);
      if (!inOpenChart && looseOpenChance > 0 && randomChance(looseOpenChance)) {
        const baseTarget = openSizeFor(seat.position, table, openStackDepth);
        const target = arenaOpenTarget(baseTarget, table, seat, difficulty, combo, openStackDepth);
        return {
          action: "open",
          target,
          added: Math.max(0, target - contributionOf(table, seat.id)),
          label: `${combo} loose archetype open`
        };
      }

      if (seat.position === "SB" && table.heroPosition === "BB" && randomChance(sbCompleteFrequency(style, headsUp))) {
        return {
          action: "call",
          target: 1,
          added: Math.max(0, 1 - contributionOf(table, seat.id)),
          label: `${combo} ${style} complete`
        };
      }

      return { action: "fold", label: `${combo} outside open chart` };
    }

    const singleRaise = isFacingSinglePreflopRaise(table, seat);
    const openerPosition = singleRaise ? preflopOpenerPosition(table) : "";
    const responseStackDepth = effectiveResponseStackDepth(table, seat, openerPosition);
    const pushFoldOpenerPosition = singleRaise ? openerPosition : currentPreflopAggressorPosition(table);
    const pushFoldDecision = botFacingPushFoldDecision(table, seat, combo, difficulty, style, pushFoldOpenerPosition, responseStackDepth);
    if (pushFoldDecision) return pushFoldDecision;

    const threeBetPatterns = (headsUp && seat.position === "BB")
      ? huThreeBetPatternsFor(difficulty, responseStackDepth, openerPosition)
      : threeBetPatternsFor(seat.position, difficulty, openerPosition, responseStackDepth, seat);
    const facingFiveBetDecision = isFacingFiveBetDecision(table, seat);
    const facingFourBet = !facingFiveBetDecision && isFacingFourBet(table, seat);
    const facingThreeBet = !facingFiveBetDecision && !facingFourBet && !singleRaise && Number(table.currentBet || 0) > MAX_SINGLE_OPEN_TO_BB + 0.01;
    if (facingFiveBetDecision) {
      return defendVsFiveBetDecision(table, seat, combo, difficulty, style, responseStackDepth);
    }
    if (facingFourBet) {
      const fiveBetJam = fiveBetJamDecision(table, seat, combo, difficulty, style, responseStackDepth);
      if (fiveBetJam) return fiveBetJam;
      return defendVsFourBetDecision(table, seat, combo, difficulty, style, responseStackDepth);
    }
    // Key the 4bet range on the ACTUAL 3-bettor's position, not table.heroPosition. In a
    // multiway/bot-vs-bot 3bet pot where the hero isn't the 3-bettor, using the hero's
    // fixed seat picked a tight/loose 4bet range against the wrong player (e.g. jumped to
    // a wide bluff-4bet range because the hero sat on the BTN). Mirrors the 4bet SIZING
    // path, which already uses preflopAggressorSeatId. BUGHUNT F031.
    const threeBettorSeat = facingThreeBet ? seatById(table, table.preflopAggressorSeatId) : null;
    const threeBettorPosition = threeBettorSeat ? threeBettorSeat.position : table.heroPosition;
    const raisePatterns = facingThreeBet
      ? fourBetPatternsFor(seat.position, difficulty, threeBettorPosition, responseStackDepth, seat)
      : threeBetPatterns;
    const canRaise = remainingStack(table, seat.id) > Math.max(2, Number(table.currentBet || 0));
    const facingFiveBetOrLater = isFacingPreflopFiveBetOrLater(table);
    // Squeeze: tighten the 3-bet (fewer combos get there) when cold-callers are already in — multiway
    // equity realization is worse and the open is capped by the callers, so squeeze tighter than HU.
    const squeezeCallers = singleRaise ? preflopPotCallerCount(table, seat.id) : 0;
    const squeezeBase = (normalizeDifficulty(difficulty) === "pro" && squeezeCallers >= 2) ? 0.5 : 0.6;
    const squeezePenalty = squeezeCallers > 0 ? Math.pow(squeezeBase, squeezeCallers) : 1;
    const learnedAdjustment = botLearningPreflopAdjustment(seat, "threeBet");
    const raiseFrequencyBase = facingThreeBet
      ? fourBetFrequency(difficulty, style, combo, responseStackDepth, seat)
      : threeBetFrequency(difficulty, style, combo, responseStackDepth, seat);
    const raiseFrequency = clamp(raiseFrequencyBase + learnedAdjustment, 0.02, 0.94);
    if (!facingFiveBetOrLater && canRaise && chartContains(raisePatterns, combo) && randomChance(raiseFrequency * squeezePenalty)) {
      const target = aggroOversizeRaiseTarget(threeBetTarget(table, seat, responseStackDepth, difficulty), table, seat, difficulty, style);
      return {
        action: "raise",
        target,
        added: Math.max(0, target - contributionOf(table, seat.id)),
        label: `${combo} ${facingThreeBet ? "4bet" : "3bet"} chart ${stackDepthLabel(responseStackDepth)} · ${positionBucket(seat.position)}`
      };
    }

    // C3: cold-call-vs-3bet. A non-opener facing a (non-all-in) 3bet that did not 4bet above gets a
    // narrow flat-or-fold by class; the original opener is NOT cold and keeps the wider continue below.
    if (facingThreeBet && !isOriginalPreflopOpener(table, seat) && !isFacingPreflopAllInRaise(table, seat.id)) {
      return coldCallVsThreeBetDecision(table, seat, combo, style, responseStackDepth);
    }

    if (isSmallBlindCompleteFacingHeroIso(table, seat)) {
      const completeCallPatterns = sbCompleteCallPatternsFor(difficulty, seat);
      const isoTarget = Number(table.currentBet || 0);
      const pressure = isoTarget >= Math.max(8, responseStackDepth * 0.35)
        || isoTarget >= maxContributionForSeat(table, seat.id) * 0.75;
      if (!pressure && chartContains(completeCallPatterns, combo)) {
        return {
          action: "call",
          target: table.currentBet,
          added: Math.max(0, table.currentBet - contributionOf(table, seat.id)),
          label: `${combo} SB complete-call vs BB iso`
        };
      }
    }

    const chart = PREFLOP_CHARTS[difficulty] || PREFLOP_CHARTS.standard;
    const facingPreflopAllInRaise = facingThreeBet && isFacingPreflopAllInRaise(table, seat.id);
    const continuePatterns = facingPreflopAllInRaise
      ? chart.callJam
      : defensePatternsFor(seat.position, difficulty, responseStackDepth, openerPosition, headsUp, seat) || (responseStackDepth <= 30 ? chart.shortContinue : chart.continueVsRaise);
    const continueDecision = preHeroContinueDecision(difficulty, style, combo, continuePatterns || chart.continueVsRaise, {
      singleRaise,
      openerPosition,
      defenderPosition: seat.position,
      stackDepth: responseStackDepth,
      facingThreeBet,
      allInPressure: facingPreflopAllInRaise,
      coldCallers: squeezeCallers,
      seat,
      openTo: Number(table.currentBet || 0),
      threeBetRatio: facingThreeBet ? Number(table.currentBet || 0) / Math.max(1, originalOpenToBb(table)) : 1
    });
    if (continueDecision.continue) {
      return {
        action: "call",
        target: table.currentBet,
        added: Math.max(0, table.currentBet - contributionOf(table, seat.id)),
        label: `${combo} ${continueDecision.label}`
      };
    }

    return { action: "fold", label: `${combo} ${continueDecision.label}` };
  }

  function botOpenPushFoldDecision(table, seat, combo, difficulty, style, stackDepth = effectiveOpenStackDepth(table, seat)) {
    const maxTotal = maxContributionForSeat(table, seat.id);
    const currentBet = Number(table.currentBet || 0);
    if (maxTotal > BOT_OPEN_PUSH_FOLD_MAX_BB || stackDepth > BOT_OPEN_PUSH_FOLD_MAX_BB || maxTotal <= Math.max(1, currentBet)) return null;
    const modeLabel = isMicroStackDepth(stackDepth) ? "micro push/fold" : "push/fold";
    const patterns = pushFoldOpenPatternsFor(seat.position, difficulty, stackDepth);
    const inChart = chartContains(patterns, combo);
    if (inChart && randomChance(botPushFoldFrequency(difficulty, style, combo, seat, "open"))) {
      // Shove effective stacks only: don't commit past the deepest opponent
      // (the excess is uncalled — refunded at showdown — and inflates the pot).
      const openTarget = roundBbValue(Math.min(maxTotal, effectiveAllInCeiling(table, seat.id)));
      return {
        action: "open",
        target: openTarget,
        added: Math.max(0, roundBbValue(openTarget - contributionOf(table, seat.id))),
        label: `${combo} ${modeLabel} open shove · ${style}`,
        allIn: openTarget >= maxTotal - EPSILON_BB,
        pushFold: true
      };
    }
    return {
      action: "fold",
      label: `${combo} ${modeLabel} open fold`,
      pushFold: true
    };
  }

  function botFacingPushFoldDecision(table, seat, combo, difficulty, style, openerPosition = "", stackDepth = effectiveResponseStackDepth(table, seat, openerPosition)) {
    const maxTotal = maxContributionForSeat(table, seat.id);
    const currentBet = Number(table.currentBet || 0);
    const toCall = Math.max(0, currentBet - contributionOf(table, seat.id));
    if (currentBet <= 1 || toCall <= 0) return null;
    if (remainingStack(table, seat.id) <= 0) {
      // Already all-in (the posted blind consumed the stack): there is no
      // decision to make — an all-in seat must never fold its live chips.
      return {
        action: "call",
        target: currentBet,
        added: 0,
        label: `${combo} already all-in from blind`,
        allIn: true,
        pushFold: true
      };
    }

    const depth = Number.isFinite(Number(stackDepth)) && Number(stackDepth) > 0 ? Number(stackDepth) : maxTotal;
    if (Math.min(maxTotal, depth) > BOT_FACING_PUSH_FOLD_MAX_BB) return null;
    const modeLabel = isMicroStackDepth(depth) ? "micro push/fold" : "push/fold";
    // C10: pot-committed — a seat that already has a large share of its stack in the pot (e.g. 1 BB
    // posted on the BB with only ~3 BB behind) is committed and should defend/jam very wide: it folds
    // into the pressure path (wider patterns) and is exempt from the open-stack fold gate below.
    const committedShare = maxTotal > 0 ? contributionOf(table, seat.id) / maxTotal : 0;
    const potCommitted = committedShare >= 0.3
      || (contributionOf(table, seat.id) >= 0.5 && remainingStack(table, seat.id) <= 3);
    const pressure = potCommitted || currentBet >= maxTotal * 0.62 || currentBet >= Math.max(8, depth * 0.45);
    if (!pressure && depth > BOT_OPEN_PUSH_FOLD_MAX_BB) return null;

    const pricedShortAllIn = pricedShortAllInDefenseDecision(table, seat, combo, difficulty, style, openerPosition, depth);
    if (pricedShortAllIn) return pricedShortAllIn;

    const patterns = pushFoldDefensePatternsFor(seat.position, difficulty, openerPosition, pressure, depth);
    // Pot-committed seats defend essentially any two (they are priced in).
    const inChart = chartContains(patterns, combo) || potCommitted;
    const frequencyMode = potCommitted ? "potCommitted" : "defense";
    if (!inChart || !randomChance(botPushFoldFrequency(difficulty, style, combo, seat, frequencyMode))) {
      return {
        action: "fold",
        label: `${combo} ${modeLabel} defend fold`,
        pushFold: true
      };
    }

    if (maxTotal <= currentBet) {
      return {
        action: "call",
        target: currentBet,
        added: toCall,
        label: `${combo} ${modeLabel} call all-in`,
        allIn: true,
        pushFold: true
      };
    }

    // Rejam only up to what the opponent can match; if they're already all-in
    // (ceiling <= currentBet) this is a call, not a dead-chip over-shove.
    const rejamCeiling = effectiveAllInCeiling(table, seat.id);
    if (rejamCeiling <= currentBet) {
      return {
        action: "call",
        target: currentBet,
        added: toCall,
        label: `${combo} ${modeLabel} call all-in`,
        allIn: true,
        pushFold: true
      };
    }
    if (effectiveOpenStackDepth(table, seat) > BOT_FACING_PUSH_FOLD_MAX_BB) {
      const chart = PREFLOP_CHARTS[difficulty] || PREFLOP_CHARTS.standard;
      if (!chartContains(chart.callJam, combo)) {
        return {
          action: "fold",
          label: `${combo} ${modeLabel} fold short all-in with deep stacks behind`,
          pushFold: true
        };
      }
      return {
        action: "call",
        target: currentBet,
        added: toCall,
        label: `${combo} ${modeLabel} call short all-in with deep stacks behind`,
        allIn: maxTotal <= currentBet + EPSILON_BB,
        pushFold: true
      };
    }
    const rejamTarget = roundBbValue(Math.min(maxTotal, rejamCeiling));
    return {
      action: "raise",
      target: rejamTarget,
      added: Math.max(0, roundBbValue(rejamTarget - contributionOf(table, seat.id))),
      label: `${combo} ${modeLabel} rejam · ${openerPosition || "open"}`,
      allIn: rejamTarget >= maxTotal - EPSILON_BB,
      pushFold: true
    };
  }

  function pushFoldOpenPatternsFor(position, difficulty, stackDepth = Infinity) {
    const ranges = PUSH_FOLD_OPEN_RANGES[normalizeDifficulty(difficulty)] || PUSH_FOLD_OPEN_RANGES.standard;
    const positionKey = pushFoldPositionKey(position);
    const base = ranges[positionKey] || ranges.CO;
    if (!isMicroStackDepth(stackDepth)) return base;
    return uniquePatterns(base, microStackOpenAdditionsFor(position));
  }

  function pushFoldDefensePatternsFor(position, difficulty, openerPosition = "", pressure = false, stackDepth = Infinity) {
    const chart = PREFLOP_CHARTS[normalizeDifficulty(difficulty)] || PREFLOP_CHARTS.standard;
    const microAdditions = isMicroStackDepth(stackDepth)
      ? microStackCallJamAdditionsFor(position, openerPosition)
      : [];
    if (pressure) {
      return uniquePatterns(chart.callJam, shortStackMatrixPatterns(MTT_SHORT_STACK_DEFENSE_ADDITIONS, position, openerPosition), microAdditions);
    }
    return uniquePatterns(
      chart.callJam,
      chart.shortContinue,
      microAdditions,
      singleRaiseMatrixPatterns(SINGLE_RAISE_THREE_BET_RANGES, position, openerPosition, difficulty),
      singleRaiseMatrixPatterns(SINGLE_RAISE_DEFENSE_RANGES, position, openerPosition, difficulty)
    );
  }

  function isMicroStackDepth(stackDepth) {
    const depth = Number(stackDepth);
    return Number.isFinite(depth) && depth > 0 && depth <= BOT_MICRO_STACK_MAX_BB;
  }

  function microStackOpenAdditionsFor(position) {
    const positionKey = pushFoldPositionKey(position);
    return MICRO_STACK_OPEN_ADDITIONS[positionKey] || MICRO_STACK_OPEN_ADDITIONS.CO || [];
  }

  function microStackCallJamAdditionsFor(position, openerPosition = "") {
    return shortStackMatrixPatterns(MICRO_STACK_CALL_JAM_ADDITIONS, position, openerPosition);
  }

  function pushFoldPositionKey(position) {
    if (position === "UTG" || position === "UTG+1") return "EP";
    if (position === "MP" || position === "LJ") return "MP";
    if (position === "HJ") return "HJ";
    if (position === "CO") return "CO";
    if (position === "BTN") return "BTN";
    if (position === "SB") return "SB";
    return "CO";
  }

  function uniquePatterns(...groups) {
    const result = [];
    groups.flat().filter(Boolean).forEach((pattern) => {
      if (!result.includes(pattern)) result.push(pattern);
    });
    return result;
  }

  function botPushFoldFrequency(difficulty, style, combo, seat = null, mode = "neutral") {
    if (mode === "potCommitted") return 1;
    let frequency = difficulty === "easy" ? 0.86 : difficulty === "pro" ? 0.98 : 0.94;
    if (difficulty !== "pro") {
      // style call/fold leaks (passive folds, station weak-discipline) belong to
      // exploitable archetypes only; a pro keeps its disciplined open-jam frequency.
      if (style === "passive") frequency -= 0.1;
      if (style === "station" && !isPremiumPreflopCombo(combo)) frequency -= 0.06;
      frequency += botPreflopTrait(style, "pushFold");
    }
    if (style === "aggro") frequency += 0.04;
    if (style === "nit" && isPremiumPreflopCombo(combo)) frequency += 0.08;
    const productionDelta = botPushFoldProductionDelta(difficulty, seat, mode);
    frequency += productionDelta;
    if (isPremiumPreflopCombo(combo)) return 1;
    else if (isPocketPairCombo(combo)) frequency = Math.max(frequency, 0.98);
    const floor = mode === "potCommitted" ? 0.92 : difficulty === "pro" ? 0.58 : 0.48;
    return clamp(frequency, floor, 0.99);
  }

  function botPushFoldProductionDelta(difficulty, seat = null, mode = "neutral") {
    const adjustment = (key) => clamp(Number(botStrategyArenaProductionAdjustment(difficulty, key, seat) || 0), -0.4, 0.4);
    const open = adjustment("openFrequency");
    const defense = adjustment("defenseFrequency");
    const threeBet = adjustment("threeBetFrequency");
    const jam = adjustment("jamFrequency");
    if (mode === "open") return clamp(open * 0.72 + jam * 0.28, -0.34, 0.28);
    if (mode === "defense") return clamp(defense * 0.58 + threeBet * 0.16 + jam * 0.26, -0.34, 0.28);
    if (mode === "potCommitted") return clamp(Math.max(0, defense) * 0.2 + Math.max(0, jam) * 0.2, 0, 0.1);
    return clamp((open + defense + jam) / 3, -0.2, 0.2);
  }

  function preflopAggressiveActionLabel(decision) {
    return decision?.allIn ? `All-in ${formatBb(decision.target)}` : `Raise to ${formatBb(decision.target)}`;
  }

  function preflopAggressiveLogLabel(decision) {
    return decision?.allIn ? `all-in ${formatBb(decision.target)}` : `raise to ${formatBb(decision.target)}`;
  }

  function isHeadsUpTable(table) {
    const positionCount = Array.isArray(table?.positions) ? table.positions.length : 0;
    if (positionCount) return positionCount === 2;
    return Array.isArray(table?.seats) && table.seats.length === 2;
  }

  function headsUpRangesFor(difficulty) {
    return HEADS_UP_RANGES[normalizeDifficulty(difficulty)] || HEADS_UP_RANGES.standard;
  }

  // Heads-up BB 3bet vs the SB/BTN raise (value + suited-wheel/connector bluffs).
  // Kept separate from threeBetPatternsFor so that fn's exact signature stays
  // locked by the regression-shield static contract (perf-smoke).
  function huThreeBetPatternsFor(difficulty, stackDepth = Infinity, openerPosition = "") {
    const huThreeBet = headsUpRangesFor(difficulty).threeBet;
    if (Number(stackDepth) <= 30) return uniquePatterns(shortStackThreeBetPatternsFor("BB", openerPosition), huThreeBet);
    return huThreeBet;
  }

  // Stat-driven realizer override. When a bot carries a precomputed
  // `realizedRanges` map (built by assets/poker-kit/simulator/bot-range-realizer.js)
  // and opts in via `useRealizedRanges`, the preflop membership functions prefer
  // that map over the hardcoded charts. Returns a string[] for the requested
  // (street, position[, opener]) or null to fall through to the existing chart, so
  // default behavior (no realized map / flag off) is byte-identical.
  function realizedRangeFor(seat, street, position, openerPosition) {
    const model = seat && seat.botProfile && seat.botProfile.strategyModel;
    if (!model || !model.useRealizedRanges) return null;
    const ranges = model.realizedRanges;
    if (!ranges || typeof ranges !== "object") return null;
    let node = ranges[street];
    if (!node) return null;
    if (Array.isArray(node)) return node.length ? node : null;        // flat, e.g. sbCompleteCall
    node = node[position];
    if (!node) return null;
    if (Array.isArray(node)) return node.length ? node : null;        // position-keyed, e.g. open[pos]
    if (openerPosition != null) {                                     // opener-keyed, e.g. defense[pos][opener]
      const byOpener = node[openerPosition] || node["*"] || null;
      return Array.isArray(byOpener) && byOpener.length ? byOpener : null;
    }
    return null;
  }

  function openPatternsFor(position, difficulty, stackDepth = Infinity, headsUp = false, seat = null) {
    const realized = realizedRangeFor(seat, "open", position);
    if (realized) return realized;
    if (headsUp && position === "SB") {
      // Heads-up button RFI: wide raise-or-fold, far beyond the multiway SB bucket.
      return uniquePatterns(headsUpRangesFor(difficulty).open, stackOpenAdditionsFor(position, stackDepth));
    }
    const ranges = OPEN_RANGES[normalizeDifficulty(difficulty)] || OPEN_RANGES.standard;
    return uniquePatterns(ranges[position] || ranges.CO, stackOpenAdditionsFor(position, stackDepth));
  }

  function defensePatternsFor(position, difficulty, stackDepth, openerPosition = "", headsUp = false, seat = null) {
    const realized = realizedRangeFor(seat, "defense", position, openerPosition);
    if (realized) return realized;
    if (headsUp && position === "BB") {
      // Heads-up BB flat-continue vs the SB/BTN raise (3bets handled in threeBetPatternsFor).
      const huDefense = headsUpRangesFor(difficulty).defense;
      if (stackDepth <= 30) return shortStackDefensePatternsFor(position, difficulty, openerPosition, huDefense);
      return huDefense;
    }
    const singleRaisePatterns = singleRaiseMatrixPatterns(SINGLE_RAISE_DEFENSE_RANGES, position, openerPosition, difficulty);
    if (stackDepth <= 30) {
      return shortStackDefensePatternsFor(position, difficulty, openerPosition, singleRaisePatterns);
    }
    if (singleRaisePatterns) return singleRaisePatterns;
    const ranges = DEFENSE_RANGES[normalizeDifficulty(difficulty)] || DEFENSE_RANGES.standard;
    return ranges[positionBucket(position)] || ranges.LP;
  }

  function preflopOpenerPosition(table) {
    const originalOpener = seatById(table, table?.preflopOpenerSeatId);
    if (originalOpener) return originalOpener.position;
    const explicitAggressor = seatById(table, table?.preflopAggressorSeatId);
    if (explicitAggressor) return explicitAggressor.position;
    const activeSeat = seatById(table, table?.activeVillain);
    if (activeSeat && contributionOf(table, activeSeat.id) > 1) return activeSeat.position;
    const currentBet = Number(table?.currentBet || 0);
    const opener = Array.isArray(table?.seats)
      ? table.seats.find((seat) => !seat.folded && contributionOf(table, seat.id) >= currentBet && currentBet > 1)
      : null;
    return opener?.position || "";
  }

  function currentPreflopAggressorPosition(table) {
    const currentBet = Number(table?.currentBet || 0);
    const explicitAggressor = seatById(table, table?.preflopAggressorSeatId);
    if (explicitAggressor && contributionOf(table, explicitAggressor.id) >= currentBet - EPSILON_BB) {
      return explicitAggressor.position;
    }
    const aggressor = Array.isArray(table?.seats)
      ? table.seats.find((seat) => !seat.folded && contributionOf(table, seat.id) >= currentBet - EPSILON_BB && currentBet > 1)
      : null;
    return aggressor?.position || preflopOpenerPosition(table);
  }

  // C1a: original-open tracking. table.preflopAggressorSeatId is overwritten by each 3bet/4bet, so the
  // original opener and the open-to size are captured separately, exactly ONCE — on the first voluntary
  // raise over the blinds (previousBet <= 1). Used by cold-call-vs-3bet classification (C3) and the
  // 3bet sizing-elasticity ratio (C4).
  function markPreflopOpenContext(table, seatId, previousBet) {
    if (!table || table.street !== "preflop") return;
    if (table.preflopOpenerSeatId != null) return;
    if (Number(previousBet) > 1) return;
    table.preflopOpenerSeatId = Number(seatId);
    table.preflopOpenToBb = roundBbValue(Number(table.currentBet || 0));
  }

  // C1a: record a seat that VOLUNTARILY flat-called a single open (1 < currentBet <= single-open
  // ceiling) and is not the opener — the squeeze-caller candidates for C3. Derived explicitly here,
  // never inferred from contribution alone (which also matches forced-live / SB-complete / scripted).
  function markPreflopOpenCaller(table, seatId) {
    if (!table || table.street !== "preflop") return;
    const currentBet = Number(table.currentBet || 0);
    if (!(currentBet > 1) || currentBet > MAX_SINGLE_OPEN_TO_BB + 0.01) return;
    if (Number(seatId) === Number(table.preflopOpenerSeatId)) return;
    if (!Array.isArray(table.preflopOpenCallerSeatIds)) table.preflopOpenCallerSeatIds = [];
    if (!table.preflopOpenCallerSeatIds.includes(Number(seatId))) {
      table.preflopOpenCallerSeatIds.push(Number(seatId));
    }
  }

  function isOriginalPreflopOpener(table, seat) {
    if (!table || !seat || table.preflopOpenerSeatId == null) return false;
    return Number(table.preflopOpenerSeatId) === Number(seat.id);
  }

  function isPreflopOpenCaller(table, seat) {
    if (!table || !seat || !Array.isArray(table.preflopOpenCallerSeatIds)) return false;
    return table.preflopOpenCallerSeatIds.includes(Number(seat.id));
  }

  function originalOpenToBb(table) {
    const value = Number(table?.preflopOpenToBb || 0);
    // Fallback to a sane single-open baseline so the 3bet-elasticity ratio (C4) stays finite when the
    // open size was not tracked (e.g. a scripted spot set up mid-hand).
    return value > 1 ? roundBbValue(value) : 2.3;
  }

  function preflopAggressiveActionCount(table) {
    if (!table || !Array.isArray(table.actionTimeline)) return 0;
    return table.actionTimeline.filter((event) => {
      if (!event || event.phase !== "action" || event.street !== "preflop") return false;
      const label = String(event.label || "").toLowerCase();
      return event.tone === "aggressive" || label.includes("raise") || label.includes("all-in") || label.includes("open");
    }).length;
  }

  function isFacingPreflopFiveBetOrLater(table) {
    return table?.street === "preflop"
      && Number(table.currentBet || 0) > MAX_SINGLE_OPEN_TO_BB + 0.01
      && preflopAggressiveActionCount(table) >= 3;
  }

  function isFacingFourBet(table, seat) {
    if (!table || table.street !== "preflop" || !seat || seat.isHero) return false;
    const currentBet = Number(table.currentBet || 0);
    if (!(currentBet > MAX_SINGLE_OPEN_TO_BB + 0.01)) return false;
    if (preflopAggressiveActionCount(table) < 3) return false;
    if (isOriginalPreflopOpener(table, seat)) return false;
    const contribution = contributionOf(table, seat.id);
    return contribution > MAX_SINGLE_OPEN_TO_BB + 0.01 && contribution + EPSILON_BB < currentBet;
  }

  function isFacingFiveBetDecision(table, seat) {
    if (!table || table.street !== "preflop" || !seat || seat.isHero) return false;
    const currentBet = Number(table.currentBet || 0);
    if (!(currentBet > MAX_SINGLE_OPEN_TO_BB + 0.01)) return false;
    if (preflopAggressiveActionCount(table) < 4) return false;
    const contribution = contributionOf(table, seat.id);
    return contribution > MAX_SINGLE_OPEN_TO_BB + 0.01 && contribution + EPSILON_BB < currentBet;
  }

  function isFacingPreflopAllInRaise(table, seatId) {
    return Boolean(preflopAllInAggressor(table, seatId));
  }

  function preflopAllInAggressor(table, seatId) {
    if (!table || table.street !== "preflop" || !Array.isArray(table.seats)) return false;
    const currentBet = Number(table.currentBet || 0);
    if (!(currentBet > 1 + EPSILON_BB)) return null;
    return table.seats.find((seat) =>
      seat
      && !seat.folded
      && Number(seat.id) !== Number(seatId)
      && contributionOf(table, seat.id) >= currentBet - EPSILON_BB
      && remainingStack(table, seat.id) <= EPSILON_BB
    ) || null;
  }

  function preflopPotForCallPrice(table) {
    const explicitPot = Number(table?.pot || 0);
    if (explicitPot > 0) return explicitPot;
    const contributions = Object.values(table?.contributions || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const antes = Object.values(table?.anteContributions || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    return Math.max(0, contributions + antes);
  }

  function preflopCallPrice(table, seatId, target = Number(table?.currentBet || 0)) {
    const toCall = Math.max(0, Math.min(Number(target || 0), maxContributionForSeat(table, seatId)) - contributionOf(table, seatId));
    return toCall > 0 ? toCall / Math.max(1, preflopPotForCallPrice(table) + toCall) : 0;
  }

  function hasUnmatchedLivePreflopSeat(table, defenderSeatId) {
    const currentBet = Number(table?.currentBet || 0);
    if (!(currentBet > 1 + EPSILON_BB) || !Array.isArray(table?.seats)) return false;
    return table.seats.some((seat) => {
      if (!seat || seat.folded || Number(seat.id) === Number(defenderSeatId)) return false;
      if (remainingStack(table, seat.id) <= EPSILON_BB) return false;
      const required = Math.min(currentBet, maxContributionForSeat(table, seat.id));
      return contributionOf(table, seat.id) + EPSILON_BB < required;
    });
  }

  function shortAllInDefenseMaxPrice(combo, openerPosition = "", defenderPosition = "", difficulty = "standard", style = "reg") {
    if (isPremiumPreflopCombo(combo) || isPocketPairCombo(combo)) return 0.55;
    const shape = preflopRankShape(combo);
    const suited = isSuitedCombo(combo);
    const openerBucket = openerPositionBucket(openerPosition);
    const lateOrBlindOpen = openerBucket === "SB" || openerBucket === "BTN" || openerBucket === "CO";
    let maxPrice = 0.24;
    if (lateOrBlindOpen) maxPrice += 0.03;
    if (openerBucket === "EP") maxPrice -= 0.02;
    if (shape.high >= RANK_VALUES.A) maxPrice += 0.08;
    else if (shape.high >= RANK_VALUES.K) maxPrice += 0.05;
    else if (shape.high >= RANK_VALUES.Q) maxPrice += 0.03;
    else if (shape.high >= RANK_VALUES.J) maxPrice += 0.015;
    if (shape.low >= RANK_VALUES.T) maxPrice += 0.045;
    else if (shape.low >= RANK_VALUES["8"]) maxPrice += 0.025;
    if (suited) maxPrice += 0.035;
    if (shape.distance <= 1) maxPrice += 0.035;
    else if (shape.distance <= 3) maxPrice += 0.018;
    else if (shape.low <= RANK_VALUES["4"]) maxPrice -= 0.018;
    if (defenderPosition === "BB") maxPrice += 0.012;
    if (style === "nit") maxPrice -= 0.018;
    if (style === "station" || style === "fish") maxPrice += 0.018;
    if (normalizeDifficulty(difficulty) === "pro") maxPrice += 0.006;
    return clamp(maxPrice, 0.22, 0.48);
  }

  function pricedShortAllInDefenseDecision(table, seat, combo, difficulty, style, openerPosition = "", stackDepth = Infinity) {
    const allInAggressor = preflopAllInAggressor(table, seat?.id);
    if (!allInAggressor) return null;
    if (hasUnmatchedLivePreflopSeat(table, seat.id)) return null;

    const currentBet = Number(table.currentBet || 0);
    const toCall = Math.max(0, Math.min(currentBet, maxContributionForSeat(table, seat.id)) - contributionOf(table, seat.id));
    if (!(toCall > 0)) return null;
    const allInTotal = contributionOf(table, allInAggressor.id);
    const depth = Number.isFinite(Number(stackDepth)) && Number(stackDepth) > 0
      ? Number(stackDepth)
      : effectiveStackBetweenSeats(table, seat.id, allInAggressor.id);
    if (allInTotal > Math.max(6, depth + EPSILON_BB)) return null;

    const price = preflopCallPrice(table, seat.id, currentBet);
    const maxPrice = shortAllInDefenseMaxPrice(combo, openerPosition || allInAggressor.position, seat.position, difficulty, style);
    if (price > maxPrice) return null;
    return {
      action: "call",
      target: currentBet,
      added: toCall,
      label: `${combo} priced short all-in call ${Math.round(price * 100)}% <= ${Math.round(maxPrice * 100)}%`,
      allIn: maxContributionForSeat(table, seat.id) <= currentBet + EPSILON_BB,
      pushFold: true
    };
  }

  function isFacingSinglePreflopRaise(table, seat) {
    if (!table || table.street !== "preflop" || !seat) return false;
    const currentBet = Number(table.currentBet || 0);
    const lastRaiseSize = Number(table.lastRaiseSize || 0);
    if (!Number.isFinite(currentBet) || currentBet <= 1) return false;
    // The first voluntary raise of the hand stays a single raise even when it
    // is bigger than a normal open (e.g. an iso-raise over limpers): only a
    // re-raise over the recorded open is a 3-bet. Without this, a 4bb iso
    // pushed limpers into the ultra-narrow cold-call-vs-3bet class and they
    // folded ~100%. All-in jams keep the tight facing-jam classification.
    const openTo = Number(table.preflopOpenToBb || 0);
    const isFirstVoluntaryRaise = openTo > 1 && currentBet <= openTo + 0.01;
    if (!isFirstVoluntaryRaise || isFacingPreflopAllInRaise(table, seat.id)) {
      if (currentBet > MAX_SINGLE_OPEN_TO_BB) return false;
      if (Number.isFinite(lastRaiseSize) && lastRaiseSize > MAX_SINGLE_OPEN_RAISE_SIZE_BB) return false;
    }
    return contributionOf(table, seat.id) <= 1;
  }

  function sbCompleteCallPatternsFor(difficulty, seat = null) {
    const realized = realizedRangeFor(seat, "sbCompleteCall", "SB");
    if (realized) return realized;
    return SB_COMPLETE_CALL_RANGES[normalizeDifficulty(difficulty)] || SB_COMPLETE_CALL_RANGES.standard;
  }

  function isSmallBlindCompleteFacingHeroIso(table, seat) {
    if (!table || !seat) return false;
    return table.heroPosition === "BB"
      && seat.position === "SB"
      && Number(table.preflopAggressorSeatId) === 0
      && Number(table.currentBet || 0) > 1
      && contributionOf(table, seat.id) >= 1;
  }

  function threeBetPatternsFor(position, difficulty, openerPosition = "", stackDepth = Infinity, seat = null) {
    const realized = realizedRangeFor(seat, "threeBet", position, openerPosition);
    if (realized) return realized;
    const singleRaisePatterns = singleRaiseMatrixPatterns(SINGLE_RAISE_THREE_BET_RANGES, position, openerPosition, difficulty);
    const singleRaiseAdditions = singleRaiseThreeBetAdditionsFor(position, openerPosition, difficulty);
    if (stackDepth <= 30) {
      return uniquePatterns(shortStackThreeBetPatternsFor(position, openerPosition), singleRaisePatterns || [], singleRaiseAdditions);
    }
    if (singleRaisePatterns) return uniquePatterns(singleRaisePatterns, singleRaiseAdditions);
    const ranges = THREE_BET_RANGES[normalizeDifficulty(difficulty)] || THREE_BET_RANGES.standard;
    return uniquePatterns(ranges[positionBucket(position)] || ranges.LP, singleRaiseAdditions);
  }

  function fourBetPatternsFor(position, difficulty, heroPosition = "", stackDepth = Infinity, seat = null) {
    const realized = realizedRangeFor(seat, "fourBet", position, heroPosition);
    if (realized) return realized;
    const bucket = positionBucket(position);
    const heroBucket = positionBucket(heroPosition);
    const lateBattle = bucket === "LP" || bucket === "BLIND" || heroBucket === "LP" || heroBucket === "BLIND";
    const short = Number(stackDepth) <= 40;
    const tier = normalizeDifficulty(difficulty);
    let patterns;

    if (tier === "easy") {
      patterns = lateBattle
        ? ["JJ+", "AKs", "AQs", "AKo", "A5s"]
        : ["QQ+", "AKs", "AKo", "A5s"];
    } else if (tier === "pro") {
      patterns = lateBattle
        ? ["77+", "A2s+", "ATo+", "KTs+", "KTo+", "QTs+", "QTo+", "JTs"]
        : ["QQ+", "AKs", "AQs", "AKo", "AQo", "KQs", "A5s", "A4s", "A3s"];
    } else {
      patterns = lateBattle
        ? ["JJ+", "AKs", "AQs", "AKo", "A5s", "A4s"]
        : ["QQ+", "AKs", "AKo", "A5s"];
    }

    if (!short) return patterns;
    // C10: 15-30bb 4bet-jam set ~ 99+/AK/AQ/KQ (the user's short-stack 4bet-push range).
    const shortAdditions = lateBattle
      ? ["99+", "AJs+", "AQo+", "KQs", "KQo", "A5s", "A4s"]
      : ["99+", "AQs+", "AKo", "AQo", "KQs", "A5s"];
    return uniquePatterns(patterns, shortAdditions);
  }

  function singleRaiseThreeBetAdditionsFor(position, openerPosition = "", difficulty = "standard") {
    if (!openerPosition) return [];
    const ranges = SINGLE_RAISE_THREE_BET_ADDITIONS[normalizeDifficulty(difficulty)] || SINGLE_RAISE_THREE_BET_ADDITIONS.standard;
    const defenderBucket = positionBucket(position);
    const openerBucket = openerPositionBucket(openerPosition);
    return ranges?.[defenderBucket]?.[openerBucket] || [];
  }

  function singleRaiseMatrixPatterns(matrix, defenderPosition, openerPosition, difficulty) {
    if (!openerPosition) return null;
    const ranges = matrix[normalizeDifficulty(difficulty)] || matrix.standard;
    const defenderBucket = positionBucket(defenderPosition);
    const openerBucket = openerPositionBucket(openerPosition);
    return ranges?.[defenderBucket]?.[openerBucket] || null;
  }

  function stackOpenAdditionsFor(position, stackDepth) {
    const tier = stackOpenTier(stackDepth);
    if (!tier) return [];
    const ranges = MTT_STACK_OPEN_ADDITIONS[tier];
    return ranges?.[pushFoldPositionKey(position)] || ranges?.CO || [];
  }

  function stackOpenTier(stackDepth) {
    const depth = Number(stackDepth);
    if (!Number.isFinite(depth)) return "";
    if (depth <= 24) return "short";
    if (depth <= 45) return "medium";
    return "";
  }

  function stackDepthLabel(stackDepth) {
    const depth = Number(stackDepth);
    return Number.isFinite(depth) && depth > 0 ? `${Math.round(depth * 10) / 10}bb` : "stack";
  }

  function shortStackDefensePatternsFor(position, difficulty, openerPosition = "", singleRaisePatterns = null) {
    const chart = PREFLOP_CHARTS[normalizeDifficulty(difficulty)] || PREFLOP_CHARTS.standard;
    const additions = shortStackMatrixPatterns(MTT_SHORT_STACK_DEFENSE_ADDITIONS, position, openerPosition);
    if (singleRaisePatterns) return uniquePatterns(singleRaisePatterns, additions);
    return uniquePatterns(additions, chart.shortContinue);
  }

  function shortStackThreeBetPatternsFor(position, openerPosition = "") {
    return shortStackMatrixPatterns(MTT_SHORT_STACK_THREE_BET_ADDITIONS, position, openerPosition);
  }

  function shortStackMatrixPatterns(matrix, defenderPosition, openerPosition = "") {
    const defenderBucket = positionBucket(defenderPosition);
    const openerBucket = openerPositionBucket(openerPosition);
    return matrix?.[defenderBucket]?.[openerBucket] || matrix?.[defenderBucket]?.CO || [];
  }

  function openerPositionBucket(position) {
    if (position === "UTG" || position === "UTG+1") return "EP";
    if (position === "MP" || position === "LJ") return "MP";
    if (position === "HJ") return "HJ";
    if (position === "CO") return "CO";
    if (position === "BTN") return "BTN";
    if (position === "SB") return "SB";
    return "CO";
  }

  function positionBucket(position) {
    if (position === "UTG" || position === "UTG+1") return "EP";
    if (position === "MP" || position === "LJ") return "MP";
    if (position === "SB" || position === "BB") return "BLIND";
    return "LP";
  }

  function threeBetFrequency(difficulty, style, combo, stackDepth = Infinity, seat = null) {
    let frequency = difficulty === "pro" ? 0.78 : difficulty === "easy" ? 0.48 : 0.56;
    if (Number(stackDepth) <= 30) frequency += 0.1;
    if (Number(stackDepth) <= 20 && (isPocketPairCombo(combo) || String(combo || "").startsWith("A"))) frequency += 0.08;
    if (isPremiumPreflopCombo(combo)) frequency += 0.18;
    if (LOW_ACE_3BET_SUITS.includes(combo)) frequency = Math.max(frequency, 0.86);
    if (style === "passive") frequency -= 0.2;
    if (style === "aggro") frequency += 0.18;
    if (style === "station") frequency -= 0.12;
    frequency += botPreflopTrait(style, "threeBet");
    frequency += botStrategyPreflopFrequencyAdjustment(difficulty, "threeBet");
    frequency += botStrategyArenaProductionAdjustment(difficulty, "threeBetFrequency", seat);
    if (style === "nit" && isPremiumPreflopCombo(combo)) frequency += 0.16;
    // nit underbluffs: 3bets are almost pure value. Cut light/non-premium 3bets hard
    // (a nit rarely turns a hand into a bluff), keeping the premium value line intact.
    if (style === "nit" && !isPremiumPreflopCombo(combo)) frequency -= 0.16;
    if (style === "fish" && !isPremiumPreflopCombo(combo)) frequency -= 0.08;
    if (isPremiumPreflopCombo(combo)) frequency = Math.max(frequency, 0.9);
    return clamp(frequency, 0.08, 0.94);
  }

  function fourBetFrequency(difficulty, style, combo, stackDepth = Infinity, seat = null) {
    let frequency = difficulty === "pro" ? 0.62 : difficulty === "easy" ? 0.38 : 0.5;
    if (Number(stackDepth) <= 40) frequency += 0.08;
    if (isPremiumPreflopCombo(combo)) frequency += 0.22;
    if (LOW_ACE_3BET_SUITS.includes(combo)) frequency = Math.max(frequency, difficulty === "easy" ? 0.42 : 0.56);
    if (style === "passive") frequency -= 0.16;
    if (style === "aggro") frequency += 0.08;
    if (style === "station") frequency -= 0.18;
    frequency += botPreflopTrait(style, "threeBet") * 0.55;
    frequency += botStrategyPreflopFrequencyAdjustment(difficulty, "fourBet");
    frequency += botStrategyArenaProductionAdjustment(difficulty, "fourBetFrequency", seat);
    if (difficulty === "pro" && Number(stackDepth) >= 60 && (isPocketPairCombo(combo) || isMarginalPreflopCombo(combo))) frequency += 0.1;
    if (style === "nit" && isPremiumPreflopCombo(combo)) frequency += 0.12;
    // nit barely 4bet-bluffs: collapse the light 4bet (incl. the A5s-type bluff-4bet floor lifted
    // above) so only genuine value 4bets remain. Applied after the LOW_ACE floor to override it.
    if (style === "nit" && !isPremiumPreflopCombo(combo)) frequency -= 0.18;
    if (style === "fish" && !isPremiumPreflopCombo(combo)) frequency -= 0.12;
    if (isPremiumPreflopCombo(combo)) frequency = Math.max(frequency, difficulty === "pro" ? 0.9 : 0.78);
    return clamp(frequency, 0.04, 0.88);
  }

  function fiveBetJamDecision(table, seat, combo, difficulty, style, stackDepth = Infinity) {
    const target = roundBbValue(Math.min(maxContributionForSeat(table, seat.id), effectiveAllInCeiling(table, seat.id)));
    if (!(target > Number(table.currentBet || 0) + EPSILON_BB)) return null;
    const frequency = fiveBetJamFrequency(table, seat, combo, difficulty, style, stackDepth);
    if (!(frequency > 0) || !randomChance(frequency)) return null;
    return {
      action: "raise",
      target,
      added: Math.max(0, target - contributionOf(table, seat.id)),
      label: `${combo} 5bet jam vs 4bet ${stackDepthLabel(stackDepth)} · ${positionBucket(seat.position)}`,
      allIn: target >= maxContributionForSeat(table, seat.id) - EPSILON_BB
    };
  }

  function fiveBetJamFrequency(table, seat, combo, difficulty, style, stackDepth = Infinity) {
    const tier = normalizeDifficulty(difficulty);
    const depth = Number.isFinite(Number(stackDepth)) && Number(stackDepth) > 0 ? Number(stackDepth) : Number(table?.stackDepth || 0);
    if (combo === "AA" || combo === "KK") return tier === "easy" && style === "passive" ? 0.92 : 1;
    if (combo === "QQ") {
      let frequency = tier === "pro" ? 0.62 : tier === "easy" ? 0.34 : 0.48;
      if (depth <= 55) frequency += 0.14;
      if (style === "nit") frequency -= 0.16;
      if (style === "aggro") frequency += 0.08;
      if (style === "passive" || style === "station") frequency -= 0.08;
      frequency += fiveBetProductionDelta(difficulty, seat);
      return clamp(frequency, 0.18, 0.78);
    }
    if (combo === "AKs" || combo === "AKo") {
      let frequency = tier === "pro" ? 0.58 : tier === "easy" ? 0.28 : 0.42;
      if (combo === "AKs") frequency += 0.08;
      if (depth <= 55) frequency += 0.12;
      if (style === "nit") frequency -= 0.14;
      if (style === "aggro") frequency += 0.08;
      if (style === "passive" || style === "station") frequency -= 0.08;
      frequency += fiveBetProductionDelta(difficulty, seat);
      return clamp(frequency, 0.14, 0.76);
    }
    if (combo !== "A5s" && combo !== "A4s") return 0;
    if (tier !== "pro" || !isHeadsUpTable(table)) return 0;
    if (depth < 65 || depth > 150) return 0;
    const bucket = positionBucket(seat.position);
    const heroBucket = positionBucket(table.heroPosition);
    const lateBattle = bucket === "LP" || bucket === "BLIND" || heroBucket === "LP" || heroBucket === "BLIND";
    if (!lateBattle || style === "nit" || style === "passive" || style === "station") return 0;
    const base = combo === "A5s" ? 0.16 : 0.1;
    return clamp(base + (style === "aggro" ? 0.04 : 0) + fiveBetProductionDelta(difficulty, seat) * 0.35, 0, 0.28);
  }

  function fiveBetProductionDelta(difficulty, seat = null) {
    const adjustment = (key) => clamp(Number(botStrategyArenaProductionAdjustment(difficulty, key, seat) || 0), -0.4, 0.4);
    const jam = adjustment("jamFrequency");
    const fourBet = adjustment("fourBetFrequency");
    const threeBet = adjustment("threeBetFrequency");
    return clamp(jam * 0.52 + fourBet * 0.3 + threeBet * 0.18, -0.24, 0.22);
  }

  function defendVsFourBetDecision(table, seat, combo, difficulty, style, stackDepth = Infinity) {
    if (combo === "AA" || combo === "KK") {
      return {
        action: "call",
        target: table.currentBet,
        added: Math.max(0, table.currentBet - contributionOf(table, seat.id)),
        label: `${combo} trap-call vs 4bet after declined 5bet`
      };
    }
    const tier = normalizeDifficulty(difficulty);
    const depth = Number.isFinite(Number(stackDepth)) && Number(stackDepth) > 0 ? Number(stackDepth) : Number(table?.stackDepth || 0);
    const canMixCall = (combo === "QQ" || combo === "AKs" || combo === "AKo")
      && depth >= 70
      && style !== "nit"
      && style !== "passive";
    if (canMixCall) {
      const frequency = combo === "QQ"
        ? (tier === "pro" ? 0.34 : 0.22)
        : (tier === "pro" ? 0.24 : 0.16);
      if (randomChance(frequency)) {
        return {
          action: "call",
          target: table.currentBet,
          added: Math.max(0, table.currentBet - contributionOf(table, seat.id)),
          label: `${combo} controlled call vs 4bet ${stackDepthLabel(stackDepth)}`
        };
      }
    }
    return { action: "fold", label: `${combo} fold vs 4bet` };
  }

  function defendVsFiveBetDecision(table, seat, combo, difficulty, style, stackDepth = Infinity) {
    const currentBet = Number(table.currentBet || 0);
    const toCall = Math.max(0, currentBet - contributionOf(table, seat.id));
    const depth = Number.isFinite(Number(stackDepth)) && Number(stackDepth) > 0 ? Number(stackDepth) : Number(table?.stackDepth || 0);
    const price = toCall / Math.max(1, Number(table.pot || 0) + toCall);
    const facingAllIn = isFacingPreflopAllInRaise(table, seat.id);
    const call = (label) => ({
      action: "call",
      target: currentBet,
      added: toCall,
      label
    });

    if (combo === "AA" || combo === "KK") {
      return call(`${combo} continue vs 5bet ${stackDepthLabel(depth)}`);
    }

    const canPriceContinue = facingAllIn
      && (combo === "QQ" || combo === "AKs" || combo === "AKo")
      && (depth <= 55 || price <= 0.32)
      && style !== "nit"
      && style !== "passive";
    if (canPriceContinue) {
      return call(`${combo} priced call vs 5bet all-in`);
    }

    return { action: "fold", label: `${combo} fold vs 5bet` };
  }

  function preflopPotCallerCount(table, seatId) {
    const currentBet = Number(table.currentBet || 0);
    if (!(currentBet > 1) || !Array.isArray(table?.seats)) return 0;
    const openerId = Number(table.preflopAggressorSeatId);
    return table.seats.filter((seat) =>
      seat && !seat.folded
      && Number(seat.id) !== Number(seatId)
      && Number(seat.id) !== openerId
      && contributionOf(table, seat.id) >= currentBet - EPSILON_BB
    ).length;
  }

  function threeBetTarget(table, seat, stackDepth = effectiveResponseStackDepth(table, seat, preflopOpenerPosition(table)), difficulty = difficultyForSeat({}, seat)) {
    const currentBet = Number(table.currentBet || 1);
    const openerSeat = currentBet <= MAX_SINGLE_OPEN_TO_BB + 0.01 ? seatById(table, table.preflopOpenerSeatId) : null;
    const relativePosition = openerSeat ? isInPositionVs(table, seat, openerSeat) : null;
    const inPosition = relativePosition != null ? relativePosition === true : ["CO", "BTN"].includes(seat.position);
    const depth = Number.isFinite(Number(stackDepth)) && Number(stackDepth) > 0 ? Number(stackDepth) : Number(table.stackDepth || 0);
    const deep = depth >= 90;
    const maxTarget = roundBbValue(Math.min(maxContributionForSeat(table, seat.id), effectiveAllInCeiling(table, seat.id)));
    if (depth <= 30 && maxContributionForSeat(table, seat.id) <= 34) {
      return maxTarget;
    }
    // A re-raise over an existing raise (currentBet already above a single open)
    // is a 4bet+, sized ~2.25x IP / 3x OOP of the previous bet (C2) — NOT the ~3-5x
    // open multiplier used to 3bet an open (that produced ~4-5x, absurdly large 4bets).
    const facingThreeBet = currentBet > MAX_SINGLE_OPEN_TO_BB + 0.01;
    // C2: a 4bet's IP/OOP is relative to the 3-bettor being re-raised (who realises position postflop),
    // NOT the raw seat name — e.g. CO 4betting a BTN 3bet is OUT of position. null/untracked → OOP.
    const threeBettorSeat = facingThreeBet ? seatById(table, table.preflopAggressorSeatId) : null;
    const fourBetInPosition = facingThreeBet && isInPositionVs(table, seat, threeBettorSeat) === true;
    const minRaiseTo = Number(table.minRaiseTo || currentBet + Number(table.lastRaiseSize || 1));
    const minSizingBias = clamp(Number(botStrategyArenaProductionAdjustment(difficulty, "smallBetFrequency", seat) || 0), 0, 0.35);
    const overbetBias = clamp(Number(botStrategyArenaProductionAdjustment(difficulty, "overbetFrequency", seat) || 0), 0, 0.35);
    const jamBias = clamp(Number(botStrategyArenaProductionAdjustment(difficulty, "jamFrequency", seat) || 0), 0, 0.35);
    const sizeBias = clamp(Number(botStrategyArenaProductionAdjustment(difficulty, "sizeBias", seat) || 0), -0.35, 0.35);
    const multiplier = (facingThreeBet
      ? (fourBetInPosition ? 2.25 : 3)
      : inPosition
      ? (deep ? 4 : 3)
      : (deep ? 5 : 4))
      * (1 + sizeBias * 0.5 + overbetBias * 0.4 - minSizingBias * 0.22);
    // Squeeze: charge ~1 BB of dead money per cold-caller so the raise is sized to fold the field
    // instead of offering it a multiway price. Only over an open (not at a 4-bet node).
    const squeezeCallers = facingThreeBet ? 0 : preflopPotCallerCount(table, seat.id);
    const target = facingThreeBet
      ? currentBet * multiplier
      : Math.max(
        minRaiseTo,
        currentBet * multiplier + (squeezeCallers >= 2 ? squeezeCallers * 1.3 : squeezeCallers)
      );
    const canMinRaise = minRaiseTo > currentBet + EPSILON_BB && minRaiseTo < target - EPSILON_BB;
    if (canMinRaise && minSizingBias > 0 && randomChance(minSizingBias)) {
      return roundBbValue(Math.min(maxTarget, minRaiseTo));
    }
    const canJam = maxTarget > Math.max(minRaiseTo + EPSILON_BB, target * 1.15);
    const jamFrequency = jamBias * (facingThreeBet ? 1 : 0.7);
    if (canJam && jamFrequency > 0 && randomChance(jamFrequency)) {
      return maxTarget;
    }
    return Math.round(Math.min(maxTarget, target) * 10) / 10;
  }

  function openSizeFor(position, table, stackDepth = effectiveOpenStackDepth(table, seatByPosition(table, position))) {
    const depth = Number.isFinite(Number(stackDepth)) && Number(stackDepth) > 0 ? Number(stackDepth) : Number(table?.stackDepth || 0);
    if (depth <= 24) return 2; // LOCKED by smoke: 20bb UTG A5s -> 'Raise to 2 BB'
    if (position === "SB") {
      // Heads-up button (SB) min-raises by default and mixes in completes (see
      // sbCompleteFrequency). The 3.5bb methodic 15-11 open applies multiway only.
      if (isHeadsUpTable(table)) return 2;
      return 3.5; // methodic 15-11 SB raise size (open-first data.js)
    }
    if (depth <= 45) {
      if (position === "BTN") return 2;
      if (position === "CO") return 2.1;
      return 2.2;
    }
    // deep (>45bb): late position minimal (wide range + position), early larger (range protection)
    if (position === "BTN") return 2.1;
    if (position === "CO") return 2.2;
    if (position === "UTG" || position === "UTG+1") return 2.5;
    return 2.3;
  }

  function botOpenFrequency(difficulty, style, inOpenChart, combo, stackDepth = Infinity, position = "", seat = null) {
    if (!inOpenChart) return 0;
    let frequency = difficulty === "easy" ? 0.86 : difficulty === "pro" ? 0.98 : 0.94;
    const arenaOpen = botStrategyArenaProductionAdjustment(difficulty, "openFrequency", seat);
    frequency += arenaOpen;
    if (position === "SB") {
      frequency += botStrategyArenaProductionAdjustment(difficulty, "sbOpenFrequency", seat);
    }
    if (Number(stackDepth) <= 24 && isMarginalPreflopCombo(combo)) frequency -= 0.08;
    if (Number(stackDepth) <= 24 && (isPremiumPreflopCombo(combo) || String(combo || "").startsWith("A"))) frequency += 0.04;
    if (style === "passive") frequency -= 0.16;
    if (style === "aggro") frequency += 0.05;
    if (style === "station" && !isPremiumPreflopCombo(combo)) frequency -= 0.08;
    if (style === "nit" && isMarginalPreflopCombo(combo)) frequency -= 0.2;
    if (style === "fish" && isMarginalPreflopCombo(combo)) frequency += 0.08;
    if (isPremiumPreflopCombo(combo)) frequency = Math.max(frequency, 1);
    else if (isPocketPairCombo(combo)) frequency = Math.max(frequency, 0.9);
    else if (isMarginalPreflopCombo(combo) || isSmallBlindStealTail(position, combo)) {
      const marginalCapBoost = Number(botStrategyArenaProductionAdjustment(difficulty, "marginalOpenCap", seat) || 0)
        + (position === "SB" ? Number(botStrategyArenaProductionAdjustment(difficulty, "sbOpenFrequency", seat) || 0) : 0);
      frequency = Math.min(
        frequency,
        marginalOpenFrequencyCap(position, difficulty, stackDepth) + Math.max(0, marginalCapBoost)
      );
    }
    return clamp(frequency, 0.42, 1);
  }

  function marginalOpenFrequencyCap(position, difficulty, stackDepth = Infinity) {
    const bucket = positionBucket(position);
    let cap = difficulty === "pro" ? 0.72 : difficulty === "easy" ? 0.86 : 0.78;
    if (bucket === "EP") cap -= 0.08;
    if (position === "HJ") cap -= 0.04;
    if (position === "CO") cap -= 0.02;
    if (position === "SB") cap -= 0.08;
    if (Number(stackDepth) <= 24) cap -= 0.08;
    return clamp(cap, 0.54, 0.88);
  }

  function botLooseOpenFrequency(difficulty, style, combo, stackDepth = Infinity) {
    // Top bot (pro) is tight-correct: never opens off-chart. Off-chart loose opens are a leak
    // strictly gated to weak styles on lower difficulties. Mirrors the difficulty !== "pro"
    // guard on the aggro-splash branch.
    if (normalizeDifficulty(difficulty) === "pro") return 0;
    const trait = botPreflopTrait(style, "looseOpen");
    if (!(trait > 0)) return 0;
    if (!isLoosePreflopCandidate(combo, "open")) return 0;
    let frequency = trait;
    if (difficulty === "easy") frequency += 0.04;
    if (Number(stackDepth) <= 22) frequency *= 0.55;
    if (isPremiumPreflopCombo(combo) || isPocketPairCombo(combo)) frequency += 0.04;
    if (style === "fish" && comboLowValue(combo) <= RANK_VALUES["6"]) frequency *= 0.55;
    return clamp(frequency, 0, 0.28);
  }

  // C5: open-limp branch for fish and explicit limper pack models. Default bots
  // stay on the old fish-only behavior; packs opt in through production.limpFrequency.
  function botFishLimpDecision(table, seat, combo, difficulty, style, inOpenChart, stackDepth) {
    const productionLimp = clamp(Number(botStrategyArenaProductionAdjustment(difficulty, "limpFrequency", seat) || 0), -0.2, 0.78);
    const packLimper = productionLimp > 0.02;
    if (style !== "fish" && !packLimper) return null;
    if (contributionOf(table, seat.id) >= 1) return null; // BB option / already in for a full BB → no limp
    if (Number(stackDepth) <= BOT_OPEN_PUSH_FOLD_MAX_BB + 2) return null; // stay out of the jam band
    const baseLimpTrait = style === "fish" ? Math.max(0, botPreflopTrait("fish", "limp")) : Math.max(0, botPreflopTrait(style, "limp")) * 0.35;
    const limpTrait = clamp(baseLimpTrait + productionLimp, 0, 0.82);
    const limp = () => ({
      action: "call",
      target: 1,
      added: Math.max(0, 1 - contributionOf(table, seat.id)),
      label: `${combo} fish open-limp`
    });
    // Trap-limp the nuts sometimes (classic fish slowplay).
    if (["AA", "KK", "AKs", "AKo"].includes(combo) && randomChance(style === "fish" ? 0.5 : Math.min(0.35, limpTrait * 0.45))) return limp();
    // Sometimes flat an in-chart hand instead of raising.
    if (inOpenChart && randomChance(limpTrait)) return limp();
    // A wide layer of off-chart speculative hands the normal open range folds.
    if (!inOpenChart && isLoosePreflopCandidate(combo, "open") && randomChance(clamp(limpTrait + (style === "fish" ? 0.06 : 0.02), 0, 0.86))) return limp();
    return null;
  }

  function sbCompleteFrequency(style, headsUp = false) {
    let frequency;
    if (style === "passive") frequency = 0.54;
    else if (style === "station") frequency = 0.66;
    else if (style === "aggro") frequency = 0.28;
    else {
      const baseline = style === "fish" ? 0.6 : style === "nit" ? 0.18 : 0.42;
      frequency = clamp(baseline + botPreflopTrait(style, "limp"), 0.08, 0.78);
    }
    if (headsUp) {
      // Heads-up button is a raise-or-fold spot; only spewy styles limp, and rarely.
      const huCap = (style === "fish" || style === "station") ? 0.22 : style === "passive" ? 0.18 : 0.1;
      frequency = Math.min(frequency, huCap);
    }
    return frequency;
  }

  function chooseDefaultVillain(table) {
    const isLobbyActive = (seat) => (seat?.lobbyState || "active") === "active";
    const { bigBlind } = blindPositions(table.positions);
    const bigBlindSeat = seatByPosition(table, bigBlind);
    if (bigBlindSeat && !bigBlindSeat.isHero && isLobbyActive(bigBlindSeat)) return bigBlindSeat.id;

    const nextLiveSeat = table.seats.find((seat) => !seat.isHero && !seat.folded);
    const anyActiveOpponent = table.seats.find((seat) => !seat.isHero && isLobbyActive(seat));
    return nextLiveSeat?.id || anyActiveOpponent?.id || 0;
  }

  function contestingSeatIdSet(table) {
    let ids;
    if (Array.isArray(table.contestingSeatIds) && table.contestingSeatIds.length) {
      // Normal post-hero path: settlePreflopAfterHero (and the postflop
      // contest tracking) already populated the authoritative contesting set.
      // Behavior here is unchanged.
      ids = table.contestingSeatIds;
    } else {
      // Empty/unset contestingSeatIds. This happens when an all-in runout is
      // built BEFORE settlePreflopAfterHero runs — e.g. createTable fires
      // isAllInRunoutLocked/maybeRunoutAllIn while hero is still to act (heroTurn
      // false, hero all-in for its blind). The old fallback [0, activeVillain]
      // collapsed to a SINGLE opponent, silently dropping every other live
      // committed all-in seat from the runout, showdown tiers, and settlePots —
      // paying the rightful best hand 0 (money misaward, bug L7).
      //
      // Correct fallback: hero (seat 0) plus EVERY non-folded opponent that has
      // committed chips this hand, including a player all-in for only the ante.
      // Ante-only players still hold live cards and are eligible for the lowest
      // side-pot layer; folded ante contributors are excluded by !seat.folded.
      const opponentIds = (table.seats || [])
        .filter((seat) => seat && !seat.isHero && !seat.folded && handCommitmentOf(table, seat.id) > 0)
        .map((seat) => seat.id);
      ids = [0, ...opponentIds];
    }
    return new Set(ids.filter((seatId) => {
      const seat = seatById(table, seatId);
      return seat && !seat.folded;
    }));
  }

  function liveContestingOpponents(table) {
    const ids = contestingSeatIdSet(table);
    return table.seats.filter((seat) => !seat.isHero && !seat.folded && ids.has(seat.id));
  }

  function normalizePostflopContestants(table) {
    if (!table || table.street === "preflop") return [];
    if (!Array.isArray(table.contestingSeatIds) || !table.contestingSeatIds.length) return [];
    const contestingIds = new Set(table.contestingSeatIds.map(Number).filter((seatId) => Number.isFinite(seatId)));
    const foldedSeats = [];

    (table.seats || []).forEach((seat) => {
      if (!seat || seat.isHero || seat.folded) return;
      if (String(seat.lobbyState || "active") !== "active") return;
      if (contestingIds.has(Number(seat.id))) return;
      foldSeat(table, seat, seat.foldedAt || "preflop");
      foldedSeats.push(seat);
    });

    const normalizedIds = [];
    if (contestingIds.has(0)) normalizedIds.push(0);
    (table.seats || []).forEach((seat) => {
      if (!seat || seat.isHero || seat.folded) return;
      if (!contestingIds.has(Number(seat.id))) return;
      normalizedIds.push(seat.id);
    });
    table.contestingSeatIds = normalizedIds;
    return foldedSeats;
  }

  function isAllInRunoutLocked(table) {
    if (!table || table.status !== "playing") return false;
    const hero = seatById(table, 0);
    if (!hero || hero.folded) return false;
    const opponents = liveContestingOpponents(table);
    if (!opponents.length) return false;

    const target = Number(table.currentBet || 0);
    if (target > 0) {
      const liveSeats = [hero, ...opponents].filter((seat) => seat && !seat.folded);
      const hasUnansweredBet = liveSeats.some((seat) => {
        if (remainingStack(table, seat.id) <= 0) return false;
        const required = Math.min(target, maxContributionForSeat(table, seat.id));
        return contributionOf(table, seat.id) + EPSILON_BB < required;
      });
      if (hasUnansweredBet) return false;
    }

    const liveWithChips = [hero, ...opponents].filter((seat) => remainingStack(table, seat.id) > 0);
    return liveWithChips.length <= 1;
  }


var __pokerSimulatorEngineParts = (typeof window !== "undefined" ? window : globalThis).PokerSimulatorEngineParts
  || ((typeof window !== "undefined" ? window : globalThis).PokerSimulatorEngineParts = {});
Object.assign(__pokerSimulatorEngineParts, {
  resolvePreflopBotTurn,
  initializePreflop,
  removeSeatFoldAction,
  aggroOversizeOpenTarget,
  aggroOversizeRaiseTarget,
  preHeroDecision,
  botOpenPushFoldDecision,
  botFacingPushFoldDecision,
  pushFoldOpenPatternsFor,
  pushFoldDefensePatternsFor,
  isMicroStackDepth,
  microStackOpenAdditionsFor,
  microStackCallJamAdditionsFor,
  pushFoldPositionKey,
  uniquePatterns,
  botPushFoldFrequency,
  botPushFoldProductionDelta,
  preflopAggressiveActionLabel,
  preflopAggressiveLogLabel,
  isHeadsUpTable,
  headsUpRangesFor,
  huThreeBetPatternsFor,
  openPatternsFor,
  defensePatternsFor,
  preflopOpenerPosition,
  currentPreflopAggressorPosition,
  markPreflopOpenContext,
  markPreflopOpenCaller,
  isOriginalPreflopOpener,
  isPreflopOpenCaller,
  originalOpenToBb,
  preflopAggressiveActionCount,
  isFacingPreflopFiveBetOrLater,
  isFacingFiveBetDecision,
  isFacingFourBet,
  isFacingPreflopAllInRaise,
  isFacingSinglePreflopRaise,
  sbCompleteCallPatternsFor,
  isSmallBlindCompleteFacingHeroIso,
  threeBetPatternsFor,
  fourBetPatternsFor,
  singleRaiseThreeBetAdditionsFor,
  singleRaiseMatrixPatterns,
  stackOpenAdditionsFor,
  stackOpenTier,
  stackDepthLabel,
  shortStackDefensePatternsFor,
  shortStackThreeBetPatternsFor,
  shortStackMatrixPatterns,
  openerPositionBucket,
  positionBucket,
  threeBetFrequency,
  fourBetFrequency,
  fiveBetJamDecision,
  fiveBetJamFrequency,
  fiveBetProductionDelta,
  defendVsFourBetDecision,
  defendVsFiveBetDecision,
  preflopPotCallerCount,
  threeBetTarget,
  openSizeFor,
  botOpenFrequency,
  marginalOpenFrequencyCap,
  botLooseOpenFrequency,
  botFishLimpDecision,
  sbCompleteFrequency,
  chooseDefaultVillain,
  contestingSeatIdSet,
  liveContestingOpponents,
  normalizePostflopContestants,
  isAllInRunoutLocked
});
