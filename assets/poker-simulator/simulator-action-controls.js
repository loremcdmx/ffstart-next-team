(function () {
  const root = typeof window !== "undefined" ? window : globalThis;

  // Viewport width (px) at or below which action controls switch to the
  // compact (multi-table / narrow) layout.
  const COMPACT_LAYOUT_MAX_WIDTH_PX = 620;
  // Fallback width (px) used when window.innerWidth is unavailable, so the
  // compact-layout test errs toward the roomy desktop layout.
  const UNKNOWN_VIEWPORT_WIDTH_PX = 9999;
  // Step size (in pot-percent units) for the postflop bet/raise slider when
  // nudged via the +/- stepper. Postflop slider values are pot percentages.
  const POSTFLOP_SLIDER_STEP_PERCENT = 5;

  function model(options = {}) {
    const getState = typeof options.getState === "function" ? options.getState : () => ({ settings: {} });
    const getTable = typeof options.getTable === "function" ? options.getTable : () => null;
    const window = options.windowRef;
    const escapeHtml = typeof options.escapeHtml === "function" ? options.escapeHtml : (value) => String(value ?? "");
    const isPaused = typeof options.isPaused === "function" ? options.isPaused : () => false;
    const renderHeroTimebank = typeof options.renderHeroTimebank === "function" ? options.renderHeroTimebank : () => "";
    const renderAutoDealCountdown = typeof options.renderAutoDealCountdown === "function" ? options.renderAutoDealCountdown : () => "";
    const dealAnimationActive = typeof options.dealAnimationActive === "function" ? options.dealAnimationActive : () => false;
    const canQueueFoldAny = typeof options.canQueueFoldAny === "function" ? options.canQueueFoldAny : () => false;
    const canHeroAct = typeof options.canHeroAct === "function" ? options.canHeroAct : () => false;
    const isActionRevealLocked = typeof options.isActionRevealLocked === "function" ? options.isActionRevealLocked : () => false;
    const isActionSequenceActive = typeof options.isActionSequenceActive === "function" ? options.isActionSequenceActive : () => false;
    const showdownTerminalControlsLocked = typeof options.showdownTerminalControlsLocked === "function" ? options.showdownTerminalControlsLocked : () => false;
    const tournamentFinishScreenVisible = typeof options.tournamentFinishScreenVisible === "function" ? options.tournamentFinishScreenVisible : () => false;
    const heroBusted = typeof options.heroBusted === "function" ? options.heroBusted : () => false;
    const heroBustedRestartAction = typeof options.heroBustedRestartAction === "function" ? options.heroBustedRestartAction : () => "restart-tournament";
    const heroBustedRestartLabel = typeof options.heroBustedRestartLabel === "function" ? options.heroBustedRestartLabel : () => "New";
    const heroIsAllIn = typeof options.heroIsAllIn === "function" ? options.heroIsAllIn : () => false;
    const heroFacesLoneOpponentAllIn = typeof options.heroFacesLoneOpponentAllIn === "function" ? options.heroFacesLoneOpponentAllIn : () => false;
    const heroFacingCallOnlyRaise = typeof options.heroFacingCallOnlyRaise === "function" ? options.heroFacingCallOnlyRaise : () => false;
    const heroCanShortAllIn = typeof options.heroCanShortAllIn === "function" ? options.heroCanShortAllIn : () => false;
    const effectiveHeroCallAmount = typeof options.effectiveHeroCallAmount === "function" ? options.effectiveHeroCallAmount : () => 0;
    const betBounds = typeof options.betBounds === "function" ? options.betBounds : () => ({ min: 0, max: 0, step: 0.1, value: 0 });
    const betSliderModel = typeof options.betSliderModel === "function" ? options.betSliderModel : (_table, bounds) => ({ kind: "amount", min: bounds.min, max: bounds.max, step: bounds.step || 0.1, value: bounds.value || bounds.min || 0 });
    const betSliderFillPercent = typeof options.betSliderFillPercent === "function" ? options.betSliderFillPercent : () => 0;
    const betPresets = typeof options.betPresets === "function" ? options.betPresets : () => [];
    const amountFromBetSliderValue = typeof options.amountFromBetSliderValue === "function" ? options.amountFromBetSliderValue : (_table, value) => Number(value || 0);
    const sliderValuesMatch = typeof options.sliderValuesMatch === "function" ? options.sliderValuesMatch : (left, right) => Number(left) === Number(right);
    const preflopBetNudgeStep = typeof options.preflopBetNudgeStep === "function" ? options.preflopBetNudgeStep : () => 0.1;
    const clampPercentValue = typeof options.clampPercentValue === "function" ? options.clampPercentValue : (value) => Number(value || 0);
    const clampBetValue = typeof options.clampBetValue === "function" ? options.clampBetValue : (value) => Number(value || 0);
    const formatAmount = typeof options.formatAmount === "function" ? options.formatAmount : (value) => String(value ?? "");
    const formatCompactAmount = typeof options.formatCompactAmount === "function" ? options.formatCompactAmount : formatAmount;
    const formatBetSliderValue = typeof options.formatBetSliderValue === "function" ? options.formatBetSliderValue : formatAmount;
    const actionHint = typeof options.actionHint === "function" ? options.actionHint : () => "";
    const inlineHeroTimebank = (table) => table?.serverMode ? renderHeroTimebank(table) : "";

      function renderFoldAnyControl(table) {
        const checked = table?.foldAnyQueued ? " checked" : "";
        return `
          <label class="fold-any-control ${table?.foldAnyQueued ? "is-armed" : ""}" data-fold-any-control>
            <input type="checkbox" data-fold-any${checked}>
            <span class="fold-any-check" aria-hidden="true"></span>
            <span class="fold-any-label">Пас на любое</span>
          </label>
        `;
      }


      function renderActions(table) {
        if (isPaused()) {
          return "";
        }

        if (table.status !== "playing" && (isActionSequenceActive(table) || showdownTerminalControlsLocked(table))) {
          return "";
        }

        if (table.status !== "playing") {
          if (table?.serverMode) return "";
          if (tournamentFinishScreenVisible(table)) return "";
          const current = getState();
          if (heroBusted(table) && !current.settings?.continueAfterBust) {
            const restartAction = heroBustedRestartAction(table);
            const restartLabel = heroBustedRestartLabel(table);
            return `<div class="client-controls is-idle is-busted"><div class="client-row">
              <button class="table-action is-main" type="button" data-action="${escapeHtml(restartAction)}">${escapeHtml(restartLabel)}</button>
            </div></div>`;
          }
          const sessionLimit = Math.max(0, Number(current.settings?.sessionHandLimit || 0));
          const completedHands = Array.isArray(current.history) ? current.history.length : 0;
          if (sessionLimit > 0 && completedHands >= sessionLimit) {
            const playAgainConfig = root.PokerSimulatorPracticePacks?.sessionCompleteAction?.({
              table,
              settings: current.settings,
              completedHands,
              sessionLimit
            });
            const playAgain = playAgainConfig?.action
              ? `<button class="table-action is-main" type="button" data-action="${escapeHtml(playAgainConfig.action)}">${escapeHtml(playAgainConfig.label || "Сыграть ещё")}</button>`
              : "";
            return `<div class="client-controls is-idle is-session-complete"><div class="client-row">
              <strong>Сессия завершена · ${completedHands} из ${sessionLimit}</strong>
              ${playAgain}
            </div></div>`;
          }
          if (!current.settings.trainingMode && !current.settings.manualNextHand) {
            return `<div class="client-controls is-waiting">${renderAutoDealCountdown(table, "action-waiting")}</div>`;
          }
          const nextHandLabel = current.settings.manualNextHand ? "Следующая раздача" : "Новая";
          return `<div class="client-controls is-idle"><div class="client-row">
            <button class="table-action is-main" type="button" data-action="new-table-hand">${nextHandLabel}</button>
          </div></div>`;
        }

        if (dealAnimationActive(table)) {
          return "";
        }

        if (table?.serverMode && !canHeroAct(table)) {
          return "";
        }

        if (!table?.serverMode && canQueueFoldAny(table)) {
          return `<div class="client-controls is-waiting is-fold-any">${renderFoldAnyControl(table)}</div>`;
        }

        if (table.busy || isActionRevealLocked(table) || !canHeroAct(table)) {
          const waiting = table.busy ? "Бот думает" : "Ожидание";
          return `<div class="client-controls is-waiting"><span class="action-waiting">${waiting}</span></div>`;
        }

        if (heroIsAllIn(table)) {
          return `<div class="client-controls is-waiting"><span class="action-waiting">Hero олл-ин</span></div>`;
        }

        // All-in-or-fold mode: if the legal raise space collapses (stack
        // ≤ min-raise threshold), real clients hide the slider and show
        // only Fold + push button. Sliding through an empty range is
        // confusing — better to lock to the only legal aggressive option.
        const bounds = betBounds(table);
        const compactActions = Number(getState().settings.tableCount || 1) >= 2 || (typeof window !== "undefined" && (window.innerWidth || UNKNOWN_VIEWPORT_WIDTH_PX) <= COMPACT_LAYOUT_MAX_WIDTH_PX);
        const facingRaiseDecision = Number(table.toCall || 0) > 0;
        const practiceDecisionClass = root.PokerSimulatorPracticePacks?.decisionClass?.({ table, settings: getState().settings }) || "";
        const practiceDecisionClassName = practiceDecisionClass ? ` ${practiceDecisionClass}` : "";
        const aggressiveVerb = table.toCall > 0 ? "Рейз" : (table.street === "preflop" ? "Рейз" : "Бет");
        // Action buttons show the verb only — the live size is already on the
        // slider/stepper, and a bare label avoids the "Рейз ..." truncation seen
        // on narrow and multi-table layouts.
        const aggressiveLabel = aggressiveVerb === "Рейз" ? "Рейз" : "Бет";
        const isAllInOnly = bounds.max > 0 && bounds.min >= bounds.max;
        const foldLabel = "Пас";
        const checkLabel = "Чек";
        const allInLabel = (amount) => compactActions
          ? `Олл-ин ${formatCompactAmount(amount)}`
          : `Олл-ин ${formatAmount(amount)}`;
        const callContext = facingRaiseDecision
          ? callButtonText()
          : "";
        const finalAllInDecision = heroFacesLoneOpponentAllIn(table);
        const callOnlyRaiseDecision = heroFacingCallOnlyRaise(table, bounds);
        // D11: a short all-in (push) is still legal when hero can't make a full
        // min-raise but has chips behind the call — keep it out of the no-push
        // call/fold layout so the shove button below stays available.
        const shortAllInDecision = heroCanShortAllIn(table, bounds);

        // The main bet/raise button carries the live size next to the verb
        // ("Рейз · 7 BB" / "Бет · 75%") so the chosen size is readable at a
        // glance even where there is no stepper readout (postflop). The amount
        // uses the same compact format as the stepper [data-bet-output] so both
        // stay in sync, and lives in a dedicated span so tight layouts can
        // ellipsis or drop it via CSS without clipping the verb mid-character.
        const betCompact = Number(getState().settings.tableCount || 1) >= 2;
        const aggressiveButton = (commitAction, hotkeyOverride = "") => {
          const slider = betSliderModel(table, bounds);
          // The button shares a row with 1-2 other buttons, so it carries the
          // short size: percent-only postflop ("33%") and the BB amount preflop
          // ("7 BB"). The detailed "33% · 6.1 BB" form stays on the stepper/aria.
          const buttonCompact = betCompact || slider.kind === "postflop-percent";
          const amount = escapeHtml(formatBetSliderValue(table, bounds, slider.value, { compact: buttonCompact }));
          const label = `<span class="table-action-verb">${aggressiveLabel}</span><span class="table-action-amount" data-bet-display>${amount}</span>`;
          return actionButton(commitAction, label, "is-main has-amount", hotkeyOverride);
        };
        const timebankHtml = inlineHeroTimebank(table);

        if (facingRaiseDecision) {
          if ((finalAllInDecision || callOnlyRaiseDecision) && !shortAllInDecision) {
            return `
              <div class="client-controls is-facing-raise is-final-all-in${practiceDecisionClassName}" data-commit-action="call">
                ${timebankHtml}
                <div class="client-row">
                  ${actionButton("fold", foldLabel, "is-fold")}
                  ${actionButton("call", callContext, "is-main")}
                </div>
              </div>
            `;
          }
          if (isAllInOnly || shortAllInDecision) {
            return `
              <div class="client-controls is-shove is-facing-raise${practiceDecisionClassName}" data-commit-action="raise-custom">
                ${timebankHtml}
                <div class="client-row">
                  ${actionButton("fold", foldLabel, "is-fold")}
                  ${actionButton("call", callContext)}
                  ${actionButton("allin", allInLabel(bounds.max), "is-main")}
                </div>
              </div>
            `;
          }
          return `
            <div class="client-controls is-facing-raise${practiceDecisionClassName}" data-commit-action="raise-custom">
              ${timebankHtml}
              ${renderBetWidget(table, "raise-custom")}
              <div class="client-row">
                ${actionButton("fold", foldLabel, "is-fold")}
                ${actionButton("call", callContext)}
                ${aggressiveButton("raise-custom")}
              </div>
            </div>
          `;
        }

        if (table.street === "preflop") {
          if (isAllInOnly) {
            return `
              <div class="client-controls is-shove" data-commit-action="raise-custom">
                ${timebankHtml}
                <div class="client-row">
                  ${table.canCheck ? actionButton("check", checkLabel) : actionButton("fold", foldLabel, "is-fold")}
                  ${actionButton("allin", allInLabel(bounds.max), "is-main")}
                </div>
              </div>
            `;
          }
        return `
          <div class="client-controls" data-commit-action="raise-custom">
            ${timebankHtml}
            ${renderBetWidget(table, "raise-custom")}
            <div class="client-row">
              ${table.canCheck ? actionButton("check", checkLabel) : actionButton("fold", foldLabel, "is-fold")}
              ${aggressiveButton("raise-custom", table.canCheck ? "" : "C")}
            </div>
          </div>
        `;
      }

        if (isAllInOnly) {
          return `
            <div class="client-controls is-shove" data-commit-action="bet-custom">
              ${timebankHtml}
              <div class="client-row">
                ${actionButton("check", checkLabel)}
                ${actionButton("allin", allInLabel(bounds.max), "is-main")}
              </div>
            </div>
          `;
        }

        return `
          <div class="client-controls" data-commit-action="bet-custom">
            ${timebankHtml}
            ${renderBetWidget(table, "bet-custom")}
            <div class="client-row">
              ${actionButton("check", checkLabel)}
              ${aggressiveButton("bet-custom")}
            </div>
          </div>
        `;
      }


      function callButtonText() {
        // The action button shows the verb only — the amount to call is visible
        // in the live table state, and a bare label keeps the button from
        // truncating ("Колл ...") on narrow and multi-table layouts.
        return "Колл";
      }


      function renderBetWidget(table, commitAction) {
        const bounds = betBounds(table);
        const slider = betSliderModel(table, bounds);
        const presets = betPresets(table, bounds, slider);
        const isPreflopAmount = table.street === "preflop" && slider.kind === "amount";
        const widgetClass = `bet-widget is-${slider.kind}${isPreflopAmount ? " is-preflop-amount" : ""}`;
        const sliderDisplay = escapeHtml(formatBetSliderValue(table, bounds, slider.value, { compact: Number(getState().settings.tableCount || 1) >= 2 }));
        // Accessible name for the range input (WCAG 4.1.2): screen readers
        // otherwise announce a bare "slider"/number with no context.
        const sliderName = /raise|3bet|4bet|open/i.test(String(commitAction || "")) ? "Размер рейза" : "Размер ставки";
        const presetButtons = presets
          .map((preset) => renderBetPresetButton(preset, slider.value))
          .join("");
        // Tick marks on the slider track give the player a visual map of
        // preset positions (Min at far-left, All-in at far-right). Also
        // covers item #9 — the "Min" tick makes the minimum legal raise
        // visible; the slider's `min` attribute already prevents dragging
        // below it, but without a visible mark users couldn't tell where
        // that floor was.
        const range = slider.max - slider.min;
        const ticksHtml = range > 0
          ? [...presets]
              .filter((preset) => !preset.disabled)
              .sort((a, b) => Number(a.sliderValue) - Number(b.sliderValue))
              .map((preset) => {
                const position = Math.max(0, Math.min(100, ((preset.sliderValue - slider.min) / range) * 100));
                return `<span class="bet-tick" style="left:${position}%;">
                  <span class="bet-tick-mark"></span>
                  <span class="bet-tick-label">${escapeHtml(preset.label)}</span>
                </span>`;
              })
              .join("")
          : "";
        // Preflop uses the presets+stepper pad; postflop pairs the percent
        // presets with the same +/- stepper so the size is adjustable in fixed
        // pot-percent steps (not only by dragging) and the chosen size is
        // always shown in the stepper readout.
        const betControls = isPreflopAmount
          ? renderPreflopBetControls(table, bounds, slider, presetButtons, sliderDisplay)
          : `<div class="bet-presets">${presetButtons}</div>${renderBetStepper(table, bounds, slider, sliderDisplay)}`;
        return `
          <div class="${widgetClass}" data-bet-widget data-commit-action="${commitAction}">
            ${betControls}
            <label class="bet-slider-row ${isPreflopAmount ? "is-preflop-track" : ""}">
              <input type="range" min="${slider.min}" max="${slider.max}" step="${slider.step}" value="${slider.value}" data-bet-slider style="--bet-slider-fill:${betSliderFillPercent(slider, slider.value)}%;" aria-label="${escapeHtml(sliderName)}" aria-valuetext="${sliderDisplay}">
            </label>
            ${ticksHtml ? `<div class="bet-tick-track" aria-hidden="true">${ticksHtml}</div>` : ""}
          </div>
        `;
      }

      function renderBetPresetButton(preset, currentValue) {
        const selected = !preset.disabled && sliderValuesMatch(preset.sliderValue, currentValue);
        const compactLabel = compactBetPresetLabel(preset.label);
        // A preset whose natural percent is below the legal floor is rendered
        // disabled (not snapped onto "Мин"), so the player sees it is offered
        // but unavailable in this spot. browser-smoke filters [disabled] presets.
        const disabledAttr = preset.disabled ? " disabled aria-disabled=\"true\"" : "";
        const disabledClass = preset.disabled ? " is-disabled" : "";
        return `<button class="bet-preset ${selected ? "is-selected" : ""}${disabledClass}" type="button" data-bet-preset="${preset.sliderValue}" aria-label="${escapeHtml(preset.label)}" aria-pressed="${selected ? "true" : "false"}"${disabledAttr}><span class="bet-preset-full">${escapeHtml(preset.label)}</span><span class="bet-preset-short" aria-hidden="true">${escapeHtml(compactLabel)}</span></button>`;
      }

      function compactBetPresetLabel(label) {
        const value = String(label || "");
        if (/^мин/i.test(value)) return "Мин";
        if (/all|олл/i.test(value)) return "AI";
        // Drop the "bb" suffix in the short form (3.5bb -> 3.5) so the fixed
        // open size still fits the tight multi-table preset chips.
        const bb = value.match(/^(\d+(?:\.\d+)?)bb$/i);
        if (bb) return bb[1];
        return value;
      }

      // Shared +/- stepper for fine size adjustment, used preflop AND postflop.
      // Preflop nudges in BB and calls the action "рейз"; postflop nudges by a
      // fixed pot-percent ("ставку"). Both write the live size into the readout
      // [data-bet-output] and move the slider via the shared [data-bet-step]
      // handler (updateBetSliderByStep already picks the right unit per kind).
      function renderBetStepper(table, bounds, slider, sliderDisplay) {
        const isPercent = slider.kind === "postflop-percent";
        const nudgeText = isPercent ? `${POSTFLOP_SLIDER_STEP_PERCENT}%` : formatAmount(preflopBetNudgeStep(table, bounds));
        const sizeWord = isPercent ? "ставку" : "рейз";
        const canDecrease = Number(slider.value) > Number(slider.min);
        const canIncrease = Number(slider.value) < Number(slider.max);
        return `
            <div class="bet-stepper" aria-label="Точная настройка размера">
              <button class="bet-step" type="button" data-bet-step="-1" aria-label="Уменьшить ${sizeWord} на ${escapeHtml(nudgeText)}" ${canDecrease ? "" : "disabled"}>-</button>
              <output class="bet-slider-value bet-stepper-value" data-bet-output>${sliderDisplay}</output>
              <button class="bet-step" type="button" data-bet-step="1" aria-label="Увеличить ${sizeWord} на ${escapeHtml(nudgeText)}" ${canIncrease ? "" : "disabled"}>+</button>
            </div>`;
      }

      function renderPreflopBetControls(table, bounds, slider, presetButtons, sliderDisplay) {
        return `
          <div class="preflop-bet-pad">
            <div class="preflop-bet-presets" aria-label="Быстрые размеры префлоп-рейза">
              ${presetButtons}
            </div>
            ${renderBetStepper(table, bounds, slider, sliderDisplay)}
          </div>
        `;
      }


      function readBetAmount(shell, table) {
        const currentTable = table || getTable(shell?.dataset.tableId);
        if (!currentTable) return 0;
        const bounds = betBounds(currentTable);
        const sliderModel = betSliderModel(currentTable, bounds);
        const slider = shell?.querySelector("[data-bet-slider]");
        return amountFromBetSliderValue(currentTable, slider?.value ?? sliderModel.value, bounds);
      }

      function updateBetSlider(shell, value) {
        const table = getTable(shell?.dataset.tableId);
        if (!table) return;
        const bounds = betBounds(table);
        const sliderModel = betSliderModel(table, bounds);
        const nextValue = sliderModel.kind === "postflop-percent"
          ? clampPercentValue(value, sliderModel)
          : clampBetValue(value, bounds);
        // Persist the dragged value so a mid-turn re-render (bot tick, async
        // refresh) doesn't reset the slider to the engine default. For the
        // postflop-percent kind we store the percent (the slider's own unit).
        table.heroBetDraft = {
          kind: sliderModel.kind,
          value: nextValue,
          street: table.street,
          toCall: Number(table.toCall || 0)
        };
        const slider = shell.querySelector("[data-bet-slider]");
        const outputs = shell.querySelectorAll("[data-bet-output]");
        if (slider) {
          // Refresh the bounds, not just the value: the legal range can shift
          // mid-turn (toCall/street/stack), and the input's min/max were baked at
          // render time. A stale range would map the thumb to the wrong spot — so
          // selecting a preset keeps the thumb at the chosen size correctly between
          // min-bet and all-in.
          slider.min = String(sliderModel.min);
          slider.max = String(sliderModel.max);
          slider.step = String(sliderModel.step);
          slider.value = String(nextValue);
          slider.style.setProperty("--bet-slider-fill", `${betSliderFillPercent(sliderModel, nextValue)}%`);
        }
        const compact = Number(getState().settings.tableCount || 1) >= 2;
        const formatted = formatBetSliderValue(table, bounds, nextValue, { compact });
        // The button carries the short size (percent-only postflop); the stepper
        // and aria keep the detailed form. Both stay in sync with the drag.
        const buttonText = formatBetSliderValue(table, bounds, nextValue, { compact: compact || sliderModel.kind === "postflop-percent" });
        if (slider) slider.setAttribute("aria-valuetext", formatted);
        outputs.forEach((output) => { output.textContent = formatted; });
        shell.querySelectorAll("[data-bet-display]").forEach((display) => { display.textContent = buttonText; });
        syncBetControlState(shell, table, sliderModel, nextValue);
      }

      function updateBetSliderByStep(shell, direction) {
        const table = getTable(shell?.dataset.tableId);
        if (!table) return;
        const bounds = betBounds(table);
        const sliderModel = betSliderModel(table, bounds);
        const slider = shell?.querySelector("[data-bet-slider]");
        const currentValue = Number(slider?.value ?? sliderModel.value);
        const rawDirection = Number(direction);
        if (!Number.isFinite(rawDirection) || rawDirection === 0) return;
        const step = sliderModel.kind === "postflop-percent" ? POSTFLOP_SLIDER_STEP_PERCENT : preflopBetNudgeStep(table, bounds);
        updateBetSlider(shell, currentValue + Math.sign(rawDirection) * step);
      }

      function syncBetControlState(shell, table, sliderModel, sliderValue) {
        shell.querySelectorAll("[data-bet-preset]").forEach((button) => {
          const selected = !button.disabled && sliderValuesMatch(button.dataset.betPreset, sliderValue);
          button.classList.toggle("is-selected", selected);
          button.setAttribute("aria-pressed", selected ? "true" : "false");
        });
        shell.querySelectorAll("[data-bet-step]").forEach((button) => {
          const direction = Number(button.dataset.betStep || 0);
          const disabled = direction < 0
            ? Number(sliderValue) <= Number(sliderModel.min)
            : Number(sliderValue) >= Number(sliderModel.max);
          button.disabled = disabled;
        });
      }

      function hotkeyHintForAction(action) {
        if (action === "fold") return "F";
        if (action === "check" || action === "call") return "C";
        if (action === "allin") return "A";
        if (action === "raise-custom") return "R";
        if (action === "bet-custom") return "B";
        return "";
      }

      function actionButton(action, label, className = "", hotkeyOverride = "") {
        const hotkey = String(hotkeyOverride || hotkeyHintForAction(action) || "").trim();
        const hotkeyAttr = hotkey ? ` aria-keyshortcuts="${hotkey}"` : "";
        const hotkeyHtml = hotkey
          ? `<span class="table-action-hotkey" aria-hidden="true"><kbd>${hotkey}</kbd></span>`
          : "";
        return `<button class="table-action ${className}" type="button" data-action="${action}"${hotkeyAttr}><span class="table-action-label">${label}</span>${hotkeyHtml}</button>`;
      }



    return {
      renderFoldAnyControl,
      renderActions,
      callButtonText,
      renderBetWidget,
      renderBetPresetButton,
      compactBetPresetLabel,
      renderPreflopBetControls,
        readBetAmount,
        updateBetSlider,
        updateBetSliderByStep,
        syncBetControlState,
        hotkeyHintForAction,
        actionButton
      };
  }

  root.PokerSimulatorActionControls = { model };
  if (typeof module !== "undefined" && module.exports) module.exports = { model };
})();
