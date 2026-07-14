(function () {
  const root = typeof window !== "undefined" ? window : globalThis;

  // Tolerance (in BB) below which two slider values are treated as equal.
  const SLIDER_VALUE_TOLERANCE_BB = 0.05;
  // Epsilon (in BB) used as a buffer when comparing a slider/preset value
  // against the slider floor so a value sitting exactly on the floor is excluded.
  const SLIDER_VALUE_EPSILON_BB = 0.001;

  function roundBb(value) {
    return Math.round(Number(value) * 10) / 10;
  }

  function roundPercentValue(value) {
    const rounded = Math.round(Number(value) * 10) / 10;
    return Number.isInteger(rounded) ? Math.trunc(rounded) : rounded;
  }

  function clampPercentValue(value, bounds) {
    const numeric = Number.isFinite(Number(value)) ? Number(value) : bounds.min;
    return roundPercentValue(Math.max(bounds.min, Math.min(bounds.max, numeric)));
  }

  function clampBetValue(value, bounds) {
    const numeric = Number.isFinite(Number(value)) ? Number(value) : bounds.min;
    return roundBb(Math.max(bounds.min, Math.min(bounds.max, numeric)));
  }

  function sliderValuesMatch(left, right) {
    return Math.abs(Number(left) - Number(right)) < SLIDER_VALUE_TOLERANCE_BB;
  }

  function parsePresetConfig(value, fallbackConfig = "min,2.2x,2.5x,pot,3x,allin") {
    const tokens = String(value || "")
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 6);
    return tokens.length ? tokens : fallbackConfig.split(",");
  }

  function parsePostflopBetPercentConfig(value, sanitizePostflopBetPercents) {
    const sanitize = typeof sanitizePostflopBetPercents === "function"
      ? sanitizePostflopBetPercents
      : (input) => String(input || "33,50,75,100,allin");
    return sanitize(value)
      .split(",")
      .map((token) => {
        if (token === "allin") return { type: "allin", value: Infinity };
        if (token === "pot") return { type: "pot", value: 100 };
        return { type: "percent", value: Number(token) };
      })
      .filter((token) => token.type === "allin" || token.type === "pot" || (Number.isFinite(token.value) && token.value > 0));
  }

  function model(options = {}) {
    const startModel = options.startModel || {};
    const defaultPreflopPresetConfig = String(options.defaultPreflopPresetConfig || startModel.defaultPreflopPresetConfig || "min,2.2x,2.5x,pot,3x,allin");
    const getSliderPresets = typeof options.getSliderPresets === "function" ? options.getSliderPresets : () => defaultPreflopPresetConfig;
    const getPostflopBetPercents = typeof options.getPostflopBetPercents === "function" ? options.getPostflopBetPercents : () => "33,50,75,100,allin";
    const heroMaxContribution = typeof options.heroMaxContribution === "function" ? options.heroMaxContribution : () => 0;
    const formatAmount = typeof options.formatAmount === "function" ? options.formatAmount : (value) => `${roundBb(value)} BB`;
    const formatCompactAmount = typeof options.formatCompactAmount === "function" ? options.formatCompactAmount : formatAmount;
    const sanitizePostflopBetPercents = typeof options.sanitizePostflopBetPercents === "function"
      ? options.sanitizePostflopBetPercents
      : startModel.sanitizePostflopBetPercents;

    function postflopTokens() {
      return parsePostflopBetPercentConfig(getPostflopBetPercents(), sanitizePostflopBetPercents);
    }

    // Largest total the hero can put in and still have it matched: the hero's
    // own stack capped by the deepest live opponent's committable stack. Mirrors
    // the engine's effectiveAllInCeiling (engine-core.js) so the slider max — and
    // therefore the "All-in" preset (value: bounds.max), which the slider layout
    // commits via raise-custom/bet-custom — never targets dead chips no opponent
    // can call in a multiway covering spot. The engine clamps allin to this same
    // ceiling but clamps raise-custom/bet-custom only to the hero's full stack.
    function heroEffectiveAllInCeiling(table, ownMax) {
      const seats = Array.isArray(table?.seats) ? table.seats : [];
      const hero = seats.find((seat) => seat && seat.isHero);
      if (!hero) return ownMax;
      const contributions = table?.contributions || {};
      const opponentMax = seats
        .filter((seat) => seat && Number(seat.id) !== Number(hero.id) && !seat.folded)
        .map((seat) => roundBb(Math.max(0, Number(contributions[seat.id] || 0) + Number(seat.stack || 0))))
        .filter((amount) => amount > 0);
      if (!opponentMax.length) return ownMax;
      return roundBb(Math.min(ownMax, Math.max(...opponentMax)));
    }

    function betBounds(table) {
      const max = heroEffectiveAllInCeiling(table, heroMaxContribution(table));
      if (!(max > 0)) {
        return { min: 0, max: 0, step: 0.1, value: 0 };
      }
      const currentBet = Number(table.currentBet || 0);
      const lastRaiseSize = Number(table.lastRaiseSize || 1);
      const minRaiseFallback = Math.max(2, currentBet + lastRaiseSize);

      let min;
      let value;
      if (table.toCall > 0) {
        min = Number(table.minRaiseTo || minRaiseFallback);
        value = min;
      } else if (table.street === "preflop") {
        min = Number(table.minRaiseTo || 2);
        value = min;
      } else {
        min = 1;
        value = min;
      }

      min = Math.min(roundBb(min), max);
      const legalBounds = { min, max };
      if (table.street !== "preflop" && Number(table.toCall || 0) <= 0) {
        value = defaultPostflopBetAmount(table, legalBounds);
      }
      // Persisted hero slider draft: if the player already dragged an amount
      // this exact decision (same street + toCall), seed from it instead of the
      // engine default so a mid-turn re-render doesn't reset the slider.
      const draft = table.heroBetDraft;
      value = root.PokerSimulatorPracticePacks?.defaultBetAmount?.({
        table,
        bounds: legalBounds,
        value,
        draft
      }) ?? value;
      if (
        draft
        && draft.kind === "amount"
        && draft.street === table.street
        && Number(draft.toCall || 0) === Number(table.toCall || 0)
      ) {
        value = clampBetValue(draft.value, legalBounds);
      }
      return {
        min,
        max,
        step: 0.1,
        value: clampBetValue(value, legalBounds)
      };
    }

    function defaultPostflopBetAmount(table, bounds) {
      return clampBetValue(amountFromPostflopPercent(table, defaultPostflopBetPercent(table, bounds)), bounds);
    }

    function defaultPostflopBetPercent(table, bounds) {
      const percents = postflopTokens()
        .filter((token) => token.type === "percent" || token.type === "pot")
        .map((token) => token.value);
      const minPercent = postflopPercentFromAmount(table, bounds.min);
      const maxPercent = postflopPercentFromAmount(table, bounds.max);
      const fallback = Math.max(minPercent, Math.min(50, maxPercent));
      return percents.find((item) => amountFromPostflopPercent(table, item) >= bounds.min) || fallback;
    }

    function betSliderModel(table, bounds) {
      if (Number(table.toCall || 0) > 0) {
        if (table.street !== "preflop") return postflopPercentSliderModel(table, bounds);
        return {
          kind: "amount",
          min: bounds.min,
          max: bounds.max,
          step: bounds.step,
          value: bounds.value
        };
      }
      if (table.street !== "preflop") return postflopPercentSliderModel(table, bounds);
      return {
        kind: "amount",
        min: bounds.min,
        max: bounds.max,
        step: bounds.step,
        value: bounds.value
      };
    }

    function betSliderFillPercent(slider, value = slider?.value) {
      const min = Number(slider?.min || 0);
      const max = Number(slider?.max || 0);
      const current = Number(value ?? min);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
      return Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100));
    }

    function postflopPercentSliderModel(table, bounds) {
      const minPercent = Math.max(1, Math.ceil(postflopPercentFromAmount(table, bounds.min)));
      const allInPercent = Math.max(minPercent, Math.ceil(postflopPercentFromAmount(table, bounds.max)));
      // Always let the slider reach a true all-in: capping at the configured
      // Pot(100%) when "allin" is absent from the sizing config left the player
      // unable to shove postflop even with chips behind. allInPercent already
      // reflects bounds.max (the real all-in ceiling).
      const maxPercent = allInPercent;
      // Persisted hero slider draft (percent units): seed from the dragged
      // percent when it belongs to this exact decision so a mid-turn re-render
      // keeps the player's chosen sizing instead of snapping to the default.
      const draft = table.heroBetDraft;
      const seedPercent = draft
        && draft.kind === "postflop-percent"
        && draft.street === table.street
        && Number(draft.toCall || 0) === Number(table.toCall || 0)
        ? draft.value
        : defaultPostflopBetPercent(table, bounds);
      return {
        kind: "postflop-percent",
        min: minPercent,
        max: maxPercent,
        step: 1,
        value: clampPercentValue(seedPercent, { min: minPercent, max: maxPercent })
      };
    }

    function betPresets(table, bounds, slider = betSliderModel(table, bounds)) {
      if (slider.kind === "postflop-percent") return postflopPercentBetPresets(table, bounds, slider);
      // Preflop amount presets. When a real raise is already live (currentBet
      // above the big blind), hero is 3betting/4betting and an absolute open
      // size like "3.5bb" would be below the min-raise — so use the adaptive
      // Мин·3x·Pot·All-in set that scales with the current bet. An unraised pot
      // (RFI, limps, or the BB's check/raise option) uses the configurable open
      // set, whose default leads with the canonical 3.5bb open.
      const preflopRaised = Number(table.currentBet || 0) > 1;
      if (preflopRaised) {
        return dedupeAmountBetPresets([
          { label: "Мин", value: bounds.min },
          presetFromToken("3x", table, bounds),
          presetFromToken("pot", table, bounds),
          presetFromToken("allin", table, bounds)
        ].filter(Boolean), bounds);
      }
      const raw = parsePresetConfig(getSliderPresets(), defaultPreflopPresetConfig)
        .map((token) => presetFromToken(token, table, bounds))
        .filter(Boolean);

      return dedupeAmountBetPresets(raw, bounds);
    }

    function presetSortAmount(preset) {
      const value = Number(preset?.value);
      if (Number.isFinite(value)) return value;
      const sliderValue = Number(preset?.sliderValue);
      return Number.isFinite(sliderValue) ? sliderValue : Number.POSITIVE_INFINITY;
    }

    function compareBetPresetAmount(left, right) {
      // Pin the named edge presets to the logical ends of the row regardless of
      // raw amount: "Мин" (the minimum) reads first and "All-in" (the max) last,
      // so the row is Мин · ascending sizes · Pot · All-in. A min-RAISE often
      // costs more than 33%/50% pot, which otherwise floated "Мин" into the middle.
      const edgeRank = (p) => (p?.label === "Мин" ? -1 : p?.label === "All-in" ? 1 : 0);
      const edgeDelta = edgeRank(left) - edgeRank(right);
      if (edgeDelta) return edgeDelta;
      const amountDelta = presetSortAmount(left) - presetSortAmount(right);
      if (Math.abs(amountDelta) > SLIDER_VALUE_EPSILON_BB) return amountDelta;
      const leftSlider = Number.isFinite(Number(left?.sliderValue)) ? Number(left.sliderValue) : presetSortAmount(left);
      const rightSlider = Number.isFinite(Number(right?.sliderValue)) ? Number(right.sliderValue) : presetSortAmount(right);
      const sliderDelta = leftSlider - rightSlider;
      if (Math.abs(sliderDelta) > SLIDER_VALUE_EPSILON_BB) return sliderDelta;
      return 0;
    }

    function dedupeAmountBetPresets(raw, bounds) {
      function rankOf(label) {
        if (label === "All-in") return 6;
        // A fixed "Nbb" open (e.g. 3.5bb) outranks Pot on a value collision:
        // preflop a pot-sized raise equals 3.5bb in standard blinds, so the
        // canonical open keeps its explicit "3.5bb" label rather than folding
        // into "Pot". Pot still surfaces in limped/multiway pots where it diverges.
        if (/^\d+(?:\.\d+)?bb$/.test(label)) return 5;
        if (label === "Pot") return 4;
        if (/^\d+(?:\.\d+)?x$/.test(label)) return 3;
        if (/^\d+%$/.test(label)) return 2;
        return 1;
      }

      const clamped = raw.map((preset) => ({
        ...preset,
        value: clampBetValue(preset.value, bounds),
        sliderValue: clampBetValue(preset.value, bounds)
      }));

      const byKey = new Map();
      clamped.forEach((preset, index) => {
        const key = preset.value.toFixed(1);
        const existing = byKey.get(key);
        if (!existing || rankOf(preset.label) > rankOf(existing.preset.label)) {
          byKey.set(key, { preset, originalIndex: existing?.originalIndex ?? index });
        }
      });

      return Array.from(byKey.values())
        .sort((a, b) => compareBetPresetAmount(a.preset, b.preset) || a.originalIndex - b.originalIndex)
        .map(({ preset }) => preset);
    }

    function postflopPercentBetPresets(table, bounds, slider) {
      // Mirror the amount-preset path: always offer a "Мин" tick at the slider
      // floor so the player can snap to the minimum bet/raise. Injected before
      // dedupe (and ranked above plain percents) so it survives collisions.
      const minPreset = {
        label: "Мин",
        value: bounds.min,
        sliderValue: slider.min
      };
      // Presets whose natural percent is below the legal floor (minPercent) are
      // not legal sizings. The old code snapped each one up to the floor and
      // relabeled it "Мин", so Min/33%/configured-below-floor all collapsed onto
      // a single floor button. Instead, surface them disabled at their natural
      // label and keep them OUT of the floor dedup so the real "Мин" survives.
      const disabled = [];
      const raw = [minPreset, ...postflopTokens()
        .map((token) => {
          if (token.type === "allin") {
            return {
              label: "All-in",
              value: bounds.max,
              sliderValue: slider.max
            };
          }
          if (token.value < slider.min) {
            disabled.push({
              label: formatPercentLabel(token.value),
              value: amountFromPostflopPercent(table, token.value),
              sliderValue: slider.min,
              disabled: true
            });
            return null;
          }
          const sliderValue = clampPercentValue(token.value, slider);
          const isMinBet = sliderValue === slider.min && token.value <= slider.min;
          const isPotBet = sliderValue === 100 && token.value === 100;
          return {
            label: isMinBet ? "Мин" : isPotBet ? "Pot" : formatPercentLabel(sliderValue),
            value: amountFromBetSliderValue(table, sliderValue, bounds),
            sliderValue
          };
        })
        .filter(Boolean)];

      const labelRank = { "All-in": 6, "Pot": 5, "Мин": 4 };
      function rankOf(label) {
        if (labelRank[label] !== undefined) return labelRank[label];
        if (/^100%$/.test(label)) return 4;
        if (/^\d+(?:\.\d+)?%$/.test(label)) return 3;
        return 1;
      }

      const byKey = new Map();
      raw.forEach((preset, index) => {
        const key = preset.sliderValue.toFixed(1);
        const existing = byKey.get(key);
        if (!existing || rankOf(preset.label) > rankOf(existing.preset.label)) {
          byKey.set(key, { preset, originalIndex: existing?.originalIndex ?? index });
        }
      });
      const legalEntries = Array.from(byKey.values())
        .sort((a, b) => a.originalIndex - b.originalIndex);
      // Dedupe disabled presets by natural label so two sub-floor tokens don't
      // both render; then sort them with the legal sizings by natural amount.
      const seenDisabled = new Set();
      const disabledUnique = disabled.filter((preset) => {
        if (seenDisabled.has(preset.label)) return false;
        seenDisabled.add(preset.label);
        return true;
      });
      const disabledEntries = disabledUnique.map((preset, index) => ({ preset, originalIndex: raw.length + index }));
      return [...legalEntries, ...disabledEntries]
        .sort((a, b) => compareBetPresetAmount(a.preset, b.preset) || a.originalIndex - b.originalIndex)
        .map(({ preset }) => preset);
    }

    function presetFromToken(token, table, bounds) {
      if (token === "min") return { label: "Min", value: bounds.min };
      if (token === "allin" || token === "all-in" || token === "all in") return { label: "All-in", value: bounds.max };
      if (token === "pot") {
        const potBet = potRaiseReference(table);
        if (!(potBet > 0) || potBet <= Number(bounds?.min || 0) + SLIDER_VALUE_EPSILON_BB) return null;
        return { label: "Pot", value: potBet };
      }

      const percentMatch = token.match(/^(\d+(?:\.\d+)?)%$/);
      if (percentMatch) {
        const fraction = Number(percentMatch[1]) / 100;
        const potRef = potRaiseReference(table);
        return { label: `${Number(percentMatch[1])}%`, value: potRef * fraction };
      }

      const multiplierMatch = token.match(/^(\d+(?:\.\d+)?)x$/);
      if (multiplierMatch) {
        const multiplier = Number(multiplierMatch[1]);
        let base;
        if (Number(table.currentBet || 0) > 1) {
          base = Number(table.currentBet);
        } else if (table.street !== "preflop") {
          base = table.pot;
        } else {
          base = 1;
        }
        return { label: `${multiplier}x`, value: base * multiplier };
      }

      // Absolute open size in big blinds, e.g. "3.5bb" → a fixed 3.5 BB raise-to.
      // Unlike "Nx" it does not scale with the current bet, so it is only used in
      // the unraised-pot open set (a raised pot swaps in "Мин" — see betPresets).
      const bbMatch = token.match(/^(\d+(?:\.\d+)?)bb$/);
      if (bbMatch) {
        return { label: `${Number(bbMatch[1])}bb`, value: Number(bbMatch[1]) };
      }

      const number = Number(String(token).replace(",", "."));
      if (Number.isFinite(number) && number > 0) {
        return { label: `${number}`, value: number };
      }

      return null;
    }

    // Pot-limit "Pot" sizing as a raise TO-level. After Hero calls, the pot has
    // grown by `toCall` and Hero has matched `currentBet`; a pot-sized raise then
    // adds that post-call pot on top → currentBet + (pot + toCall). This equals
    // pot + 2*toCall + heroContributionThisStreet, because the engine keeps
    // toCall = currentBet - heroContribution. The chips Hero already committed this
    // street (blinds, an earlier open before a 4-bet) MUST stay in the reference —
    // dropping them under-sizes "Pot" and hands villain better than the 2:1 a pot
    // raise is supposed to lay.
    function potRaiseReference(table) {
      const pot = Number(table?.pot || 0);
      const toCall = Number(table?.toCall || 0);
      const currentBet = Number(table?.currentBet || 0);
      return pot + toCall + currentBet;
    }

    function postflopPotReference(table) {
      return Math.max(1, roundBb(potRaiseReference(table)));
    }

    function amountFromPostflopPercent(table, percent) {
      return roundBb((postflopPotReference(table) * Number(percent || 0)) / 100);
    }

    function postflopPercentFromAmount(table, amount) {
      return roundPercentValue((Number(amount || 0) / postflopPotReference(table)) * 100);
    }

    function amountFromBetSliderValue(table, value, bounds = betBounds(table)) {
      const slider = betSliderModel(table, bounds);
      if (slider.kind === "postflop-percent") {
        return clampBetValue(amountFromPostflopPercent(table, value), bounds);
      }
      return clampBetValue(value, bounds);
    }

    function preflopBetNudgeStep(table, bounds = betBounds(table)) {
      const range = Math.max(0, Number(bounds.max || 0) - Number(bounds.min || 0));
      if (range <= 1) return 0.1;
      return 0.5;
    }

    function formatPercentLabel(value) {
      return `${roundPercentValue(value)}%`;
    }

    function formatPostflopSizing(table, amount) {
      return `${formatPercentLabel(postflopPercentFromAmount(table, amount))} · ${formatAmount(amount)}`;
    }

    function formatBetSliderValue(table, bounds, sliderValue, options = {}) {
      const slider = betSliderModel(table, bounds);
      if (slider.kind === "postflop-percent") {
        const percent = clampPercentValue(sliderValue, slider);
        const label = percent === slider.min ? "Мин" : formatPercentLabel(percent);
        if (options.compact) return label;
        return `${label} · ${formatAmount(amountFromBetSliderValue(table, sliderValue, bounds))}`;
      }
      const amount = amountFromBetSliderValue(table, sliderValue, bounds);
      return options.compact ? formatCompactAmount(amount) : formatAmount(amount);
    }

    function formatBetActionAmount(table, bounds, sliderValue, options = {}) {
      const amount = amountFromBetSliderValue(table, sliderValue, bounds);
      return options.compact ? formatCompactAmount(amount) : formatAmount(amount);
    }

    return {
      betBounds,
      defaultPostflopBetAmount,
      defaultPostflopBetPercent,
      betSliderModel,
      betSliderFillPercent,
      postflopPercentSliderModel,
      betPresets,
      dedupeAmountBetPresets,
      postflopPercentBetPresets,
      parsePresetConfig: (value) => parsePresetConfig(value, defaultPreflopPresetConfig),
      parsePostflopBetPercentConfig: (value) => parsePostflopBetPercentConfig(value, sanitizePostflopBetPercents),
      presetFromToken,
      postflopPotReference,
      amountFromPostflopPercent,
      postflopPercentFromAmount,
      amountFromBetSliderValue,
      sliderValuesMatch,
      preflopBetNudgeStep,
      formatPercentLabel,
      formatPostflopSizing,
      formatBetSliderValue,
      formatBetActionAmount
    };
  }

  root.PokerSimulatorBetting = {
    roundBb,
    roundPercentValue,
    clampPercentValue,
    clampBetValue,
    sliderValuesMatch,
    parsePresetConfig,
    parsePostflopBetPercentConfig,
    model
  };
})();
