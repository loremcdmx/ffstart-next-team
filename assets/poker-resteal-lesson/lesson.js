(function () {
  "use strict";

  const Engine = window.PokerRestealEngine;
  const Content = window.PokerRestealData;
  const PROGRESS_KEY = "ff-learning-hub:resteal:v1";
  const DATA_ROOT = "assets/poker-resteal-lesson/data/";
  const DATA_VERSION = "20260711-v2";
  const files = [
    "equity169.json",
    "rank_vs_random169.json",
    "field_opens.json",
    "field_vs_jam.json",
    "field_call_range.json",
    "hero_outcomes.json"
  ];
  const state = {
    step: "idea",
    introStarted: false,
    loaded: false,
    loading: null,
    data: {},
    handIndex: new Map(),
    ranking: [],
    controls: { stack: 40, openSize: 2, ante: 1, openPct: 50, callPct: 12, threshold: 0.5, bounty: 0 },
    customControls: { stack: 40, openSize: 2, ante: 1, openPct: 50, callPct: 12, threshold: 0.5, bounty: 0 },
    theory: new Map(),
    matrixSource: "custom",
    opponent: "custom",
    selectedTheoryHand: "77",
    fieldBounty: 0,
    renderFrame: 0,
    firstChoice: "",
    wisdomStory: 0,
    practiceHands: 10,
    practiceStarted: false,
    practiceRun: 0,
    infoTrigger: null
  };

  const opponentTypes = [
    ["custom", "Свои настройки"],
    ["overall", "Среднее поле"],
    ["good_reg", "Сильный рег"],
    ["mid_reg", "Обычный рег"],
    ["nit", "Редкий опен"],
    ["aggro_fish", "Активный любитель"],
    ["passive_fish", "Широко коллирует"]
  ];
  const categoryLabels = {
    pair_22_66: "Пары 22–66",
    pair_77_99: "Пары 77–99",
    pair_TT_plus: "TT и сильнее",
    ax_strong: "Сильные тузы",
    ax_weak: "Слабые тузы",
    broadway_suited: "Бродвей одной масти",
    broadway_offsuit: "Бродвей разных мастей",
    suited_conn_low: "Низкие связки"
  };
  const categoryDetails = {
    pair_22_66: "22, 33, 44, 55, 66",
    pair_77_99: "77, 88, 99",
    pair_TT_plus: "TT, JJ, QQ, KK, AA",
    ax_strong: "AT, AJ, AQ, AK · одной и разных мастей",
    broadway_offsuit: "KQo, KJo, KTo, QJo, QTo, JTo",
    suited_conn_low: "T9s, 98s, 87s, 76s, 65s, 54s"
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const pct = (value, digits = 0) => `${(Number(value) * 100).toFixed(digits).replace(".", ",")}%`;
  const number = (value, digits = 1) => Number(value).toFixed(digits).replace(".", ",");
  const signed = (value, digits = 2) => {
    const normalized = Math.abs(Number(value)) < 0.5 * 10 ** -digits ? 0 : Number(value);
    return `${normalized >= 0 ? "+" : "−"}${number(Math.abs(normalized), digits)} BB`;
  };
  const compactSigned = (value, digits = 1) => {
    const normalized = Math.abs(Number(value)) < 0.5 * 10 ** -digits ? 0 : Number(value);
    return `${normalized >= 0 ? "+" : "−"}${number(Math.abs(normalized), digits)}`;
  };
  const readProgress = () => {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null") || {}; } catch (error) { return {}; }
  };
  const saveProgress = () => {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ step: state.step, unlocked: Boolean(state.firstChoice), firstChoice: state.firstChoice })); } catch (error) {}
  };
  const sampleSize = (value) => Math.round(Number(value) || 0).toLocaleString("ru-RU");
  const foldBaselineBb = Number(Content?.comparisonFoldBaselineBb ?? -1.12);
  const advantageOverFold = (rawEvBb) => Number(rawEvBb || 0) - foldBaselineBb;

  function showStep(next, options = {}) {
    if (!state.firstChoice && next !== "idea") return;
    closeInfo();
    state.step = next;
    saveProgress();
    document.body.classList.toggle("practice-is-running", next === "practice" && state.practiceStarted);
    $$(".screen").forEach((screen) => screen.classList.toggle("is-active", screen.dataset.step === next));
    $$(".step-tab").forEach((tab) => {
      const active = tab.dataset.stepTarget === next;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    if (next === "practice") renderPracticeSetup();
    if (next === "wisdom") requestAnimationFrame(() => renderWisdomStory(state.wisdomStory));
    if (next !== "idea" && next !== "practice") {
      ensureData().then(() => {
        if (next === "deep") {
          renderTheory();
        }
      }).catch(() => {});
    }
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (options.focusHeading) {
      requestAnimationFrame(() => {
        const heading = $(`.screen[data-step="${next}"] h2`);
        if (!heading) return;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      });
    }
  }

  async function fetchJson(name) {
    const response = await fetch(`${DATA_ROOT}${name}?v=${DATA_VERSION}`);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  }

  function hydrateData(data) {
    state.data = data;
    const equity = state.data.equity169;
    state.handIndex = new Map(equity.hands.map((hand, index) => [hand, index]));
    const ranks = state.data.rank_vs_random169;
    state.ranking = ranks.hands
      .map((hand, index) => ({ hand, score: ranks.equity_vs_random[index] }))
      .sort((left, right) => right.score - left.score)
      .map((item) => item.hand);
    state.loaded = true;
    $$(".matrix").forEach((matrix) => matrix.classList.remove("is-loading"));
    renderTheory();
    renderEvidence();
    if (state.firstChoice) renderFirstCoach();
    return state.data;
  }

  function ensureData() {
    if (state.loaded) return Promise.resolve(state.data);
    if (state.loading) return state.loading;
    if (window.PokerRestealBundle) {
      state.loading = Promise.resolve(hydrateData(window.PokerRestealBundle));
      return state.loading;
    }
    state.loading = Promise.all(files.map(async (name) => [name.replace(".json", ""), await fetchJson(name)]))
      .then((entries) => hydrateData(Object.fromEntries(entries)))
      .catch((error) => {
        state.loading = null;
        console.error("Resteal data load failed", error);
        $("#matrixStatus").classList.remove("is-ready");
        $("#matrixStatus").textContent = "Данные урока не загрузились. Пересобери browser-bundle.js.";
        throw error;
      });
    return state.loading;
  }

  function equityFor(hero, villain) {
    const heroIndex = state.handIndex.get(hero);
    const villainIndex = state.handIndex.get(villain);
    return heroIndex == null || villainIndex == null ? 0.5 : state.data.equity169.equity[heroIndex][villainIndex];
  }

  function optionFor(spot, key) {
    return (spot?.options || []).find((option) => option.key === key) || null;
  }

  function renderRoomTable(host, spot, selectedKey = "") {
    if (!window.FFTrainerSimulatorSnapshot?.renderTable) {
      host.innerHTML = '<p class="table-load-error">Стол не загрузился: проверь simulator snapshot.</p>';
      return;
    }
    host.innerHTML = window.FFTrainerSimulatorSnapshot.renderTable(spot, {
      answered: Boolean(selectedKey),
      selectedKey,
      finished: false
    });
  }

  function observationHtml(recent = []) {
    const opened = recent.filter((item) => item === "open").length;
    return `<div class="observation-dots" aria-label="Открыл ${opened} из ${recent.length} последних возможностей">${recent.map((item) => `<i class="${item === "open" ? "is-open" : ""}"></i>`).join("")}</div>`;
  }

  function renderIntroTableArt() {
    const chipKit = window.PokerChipKit;
    const deckKit = window.PokerDeckKit;
    if (chipKit?.renderAmount) {
      $("#introBtnChips").innerHTML = chipKit.renderAmount(2, { className: "intro-chip-stack intro-chip-stack--bet", label: "рейз BTN 2 BB", maxVisual: 3, detail: true });
      $("#introPotChips").innerHTML = chipKit.renderAmount(4.5, { className: "intro-chip-stack intro-chip-stack--pot", label: "банк 4,5 BB", maxVisual: 5, detail: true });
      $("#introJamChips").innerHTML = chipKit.renderAmount(30, { className: "intro-chip-stack intro-chip-stack--jam", label: "олл-ин BB 30 BB", maxVisual: 4, detail: true });
      if (chipKit.renderDealerButton) $("#introDealerButton").innerHTML = chipKit.renderDealerButton({ label: "D" });
    }
    if (deckKit?.renderCard) {
      $("#introHeroCards").innerHTML = ["Qh", "Jd"].map((card) => deckKit.renderCard(card, { theme: "color-block", hero: true, fourColor: true, className: "intro-card" })).join("");
    }
  }

  function startLesson() {
    state.introStarted = true;
    $("#lessonIntro").hidden = true;
    $("#firstEncounter").hidden = false;
    requestAnimationFrame(() => $("#firstEncounter .table-action")?.focus({ preventScroll: true }));
  }

  function firstModelResult() {
    if (!state.loaded) return null;
    return Engine.theoreticalHand({
      hand: Content.firstSpot.hand,
      openPct: Content.firstSpot.profile.openPct,
      callPct: 10,
      stack: 30,
      openSize: 2,
      ante: 1,
      bounty: 0,
      ranking: state.ranking,
      equityFor
    });
  }

  function renderFirstTable() {
    renderRoomTable($("#firstTable"), Content.firstSpot, state.firstChoice);
  }

  function renderFirstCoach() {
    const coach = $("#firstCoach");
    if (!state.firstChoice) {
      coach.innerHTML = `<p class="eyebrow">Твой ход</p><h3>Что нажмёшь с QJo?</h3><p>Все выбросили до BTN. Он открыл 2 BB, малый блайнд выбросил. Ты на большом блайнде.</p>
        <div class="spot-facts">
          <div class="spot-fact is-position"><i>BTN</i><div><b>Открыл поздно</b><small>в его наборе много слабых рук</small></div></div>
          <div class="spot-fact is-stack"><i>30</i><div><b>В игре 30 BB</b><small>стек подходит для рестил-олл-ина</small></div></div>
          <div class="spot-fact is-hand"><i>QJ</i><div><b>Две высокие карты</b><small>они блокируют часть сильных ответов</small></div></div>
        </div><p class="coach-nudge">Нажми «Пас», «Колл», «3-бет» или «Олл-ин» под столом.</p>`;
      return;
    }
    const chosen = optionFor(Content.firstSpot, state.firstChoice);
    const correct = Boolean(chosen?.correct);
    const model = firstModelResult();
    const modelCopy = model ? `В учебной модели этот пуш даёт в среднем ${signed(model.ev)}.` : "Точный расчёт уже загружается.";
    coach.innerHTML = `<p class="eyebrow">Результат решения</p><h3>${correct ? "Хороший олл-ин" : "Здесь лучше олл-ин"}</h3>
      <div class="decision-result ${correct ? "is-correct" : "is-wrong"}"><strong>Ты выбрал: ${chosen?.label || state.firstChoice}</strong><p>${chosen?.feedback || ""}</p></div>
      <div class="reason-list">
        <div class="reason-line"><i></i><div><b>Забираем 4,5 BB сразу</b><small>опен, оба блайнда и BB ante уже в центре</small></div></div>
        <div class="reason-line"><i></i><div><b>Широкий опен часто сдаётся</b><small>BTN не может коллировать со всеми руками</small></div></div>
        <div class="reason-line"><i></i><div><b>QJo может выиграть колл</b><small>${modelCopy}</small></div></div>
      </div>
      <div class="ev-callout"><i>!</i><div><strong>Это просто и плюсово</strong><span>Не окажешься в сложной постфлоп-ситуации, а сразу напечатаешь EV-шку.</span></div></div>
      <button class="btn primary" type="button" id="openWisdom">Разобрать главную идею</button>`;
    $("#openWisdom").addEventListener("click", () => showStep("wisdom", { focusHeading: true }));
  }

  function answerFirst(key) {
    if (state.firstChoice || !optionFor(Content.firstSpot, key)) return;
    state.firstChoice = key;
    saveProgress();
    $$(".step-tab").forEach((tab) => { tab.disabled = false; });
    $("#firstEncounter").classList.add("has-answer");
    renderFirstTable();
    renderFirstCoach();
    ensureData().catch(() => {});
  }

  function renderPracticeSetup() {
    $$('[data-session-hands]').forEach((button) => {
      const selected = Number(button.dataset.sessionHands) === state.practiceHands;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("is-active", selected);
    });
    $("#startPracticeSession").textContent = `${state.practiceStarted ? "Начать заново" : "Начать"} · ${state.practiceHands} раздач`;
  }

  function practiceSimulatorUrl() {
    const local = /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const url = new URL(local ? "poker-simulator.html" : "poker-simulator", document.baseURI);
    url.searchParams.set("embedded", "1");
    url.searchParams.set("lesson", "resteal");
    url.searchParams.set("hands", String(state.practiceHands));
    url.searchParams.set("tempo", "fast");
    url.searchParams.set("run", `${Date.now().toString(36)}-${state.practiceRun}`);
    return url.href;
  }

  function setPracticeSimulatorLoading(loading) {
    const shell = $("#practiceSimulatorShell");
    const indicator = $("#practiceSimulatorLoading");
    shell.classList.toggle("is-loading", loading);
    shell.setAttribute("aria-busy", String(loading));
    indicator.hidden = !loading;
  }

  function startPracticeSession() {
    state.practiceStarted = true;
    state.practiceRun += 1;
    document.body.classList.add("practice-is-running");
    $("#practiceScreen").classList.add("is-running");
    $("#practiceSimulatorShell").hidden = false;
    setPracticeSimulatorLoading(true);
    $("#restealSimulator").src = practiceSimulatorUrl();
    renderPracticeSetup();
  }

  function renderMatrixShell(element, source) {
    const fragment = document.createDocumentFragment();
    for (let row = 0; row < 13; row += 1) {
      for (let col = 0; col < 13; col += 1) {
        const hand = Engine.handFromPosition(row, col);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hand-cell";
        button.dataset.hand = hand;
        button.dataset.source = source;
        button.textContent = hand;
        button.addEventListener("click", () => selectHand(hand, source));
        fragment.append(button);
      }
    }
    element.replaceChildren(fragment);
  }

  function evColor(ev) {
    if (!Number.isFinite(ev)) return "var(--panel-3)";
    if (ev >= 0) {
      const lightness = 28 + clamp(ev / 5, 0, 1) * 17;
      return `hsl(151 46% ${lightness}%)`;
    }
    const lightness = 28 + (1 - clamp(Math.abs(ev) / 8, 0, 1)) * 12;
    return `hsl(355 46% ${lightness}%)`;
  }

  function paintMatrix(element, results, threshold) {
    $$(".hand-cell", element).forEach((cell) => {
      const result = results.get(cell.dataset.hand);
      if (!result) return;
      cell.style.backgroundColor = evColor(result.ev);
      cell.classList.toggle("is-cut", result.ev < threshold);
      cell.setAttribute("aria-label", `${cell.dataset.hand}: ${signed(result.ev)}`);
      cell.innerHTML = `<span>${cell.dataset.hand}</span><small>${compactSigned(result.ev)}</small>`;
    });
  }

  function markSelectedMatrix(source, hand) {
    $$(`.hand-cell[data-source="${source}"]`).forEach((cell) => cell.classList.toggle("is-selected", cell.dataset.hand === hand));
  }

  function scheduleTheory() {
    cancelAnimationFrame(state.renderFrame);
    state.renderFrame = requestAnimationFrame(renderTheory);
  }

  function renderTheory() {
    if (!state.loaded) return;
    const controls = state.controls;
    const usesFieldProfile = state.matrixSource === "field" && state.opponent !== "custom";
    const metrics = usesFieldProfile ? fieldMetrics(state.opponent) : null;
    const weights = usesFieldProfile ? callWeights(state.opponent) : null;
    const results = new Map();
    for (const hand of state.data.equity169.hands) {
      results.set(hand, usesFieldProfile
        ? Engine.fieldHand({
          hand,
          openPct: controls.openPct,
          callPct: controls.callPct,
          callWeights: weights,
          stack: controls.stack,
          openSize: controls.openSize,
          ante: 1,
          bounty: state.fieldBounty,
          ranking: state.ranking,
          equityFor
        })
        : Engine.theoreticalHand({ ...controls, bounty: state.fieldBounty, hand, ranking: state.ranking, equityFor }));
    }
    state.theory = results;
    paintMatrix($("#handMatrix"), results, controls.threshold);
    const pushed = [...results.values()].filter((item) => item.ev >= controls.threshold);
    const pushedCombos = pushed.reduce((sum, item) => sum + Engine.totalCombos(item.hand), 0);
    $("#pushPct").textContent = pct(pushedCombos / 1326, 1);
    $("#matrixStatus").textContent = usesFieldProfile
      ? `Матрица обновлена: ${opponentLabel(state.opponent)} · опен ${controls.openPct}% · модель продолжения ${controls.callPct}%.`
      : "Матрица обновлена: свои настройки.";
    $("#matrixStatus").classList.add("is-ready");
    selectHand(state.selectedTheoryHand, "theory");
  }

  function renderTheoryHand(hand) {
    const result = state.theory.get(hand);
    if (!result) return;
    const controls = state.controls;
    const pot = controls.openSize + 1.5 + controls.ante;
    const callChance = 1 - result.foldEquity;
    const calledPot = 2 * controls.stack + 0.5 + controls.ante;
    const risk = controls.stack - 1;
    const bounty = Number(state.fieldBounty) || 0;
    const calledOutcome = result.equity * calledPot - risk + result.equity * bounty;
    const foldContribution = result.foldEquity * pot;
    const callContribution = callChance * calledOutcome;
    const verdict = result.ev < 0
      ? { label: "Пас лучше", className: "is-negative" }
      : result.ev < controls.threshold
        ? { label: "Плюс ниже фильтра", className: "is-thin" }
        : result.ev < 1
          ? { label: "Тонкий плюс", className: "is-thin" }
          : { label: "Уверенный плюс", className: "is-positive" };
    const insight = result.ev < 0
      ? "Даже частых пасов BTN недостаточно: при колле эта рука теряет слишком много."
      : calledOutcome < 0
        ? `Главный источник плюса — пас BTN. Колл для ${hand} в среднем убыточен, но происходит только в ${pct(callChance, 1)} случаев.`
        : `${hand} зарабатывает и на пасах BTN, и когда получает колл.`;
    const bountyFormula = bounty ? ` + ${pct(result.equity, 1)} × ${number(bounty)}` : "";
    $("#handDetail").innerHTML = `
      <div class="hand-detail-head">
        <div><p class="eyebrow">Выбранная рука</p><h3><span>${hand}</span><b>${signed(result.ev)}</b></h3></div>
        <span class="hand-verdict ${verdict.className}">${verdict.label}</span>
      </div>
      <div class="ev-breakdown">
        <article class="ev-component is-fold">
          <span>1 · BTN пасует</span><strong>${pct(result.foldEquity, 1)}</strong>
          <p>Забираешь банк <b>+${number(pot)} BB</b></p>
          <small>Вклад в итог: <b>${signed(foldContribution)}</b></small>
        </article>
        <article class="ev-component is-call">
          <span>2 · BTN коллирует</span><strong>${pct(callChance, 1)}</strong>
          <p>Шанс выиграть: <b>${pct(result.equity, 1)}</b> · результат колла: <b>${signed(calledOutcome)}</b></p>
          <small>Вклад в итог: <b>${signed(callContribution)}</b></small>
        </article>
        <article class="ev-component is-total ${result.ev < 0 ? "is-negative" : ""}">
          <span>Итог одного решения</span><strong>${signed(result.ev)}</strong>
          <p>На 100 таких решений: <b>${signed(result.ev * 100, 0)}</b></p>
          <small>${result.ev >= controls.threshold ? "Рука проходит выбранный порог." : `Порог матрицы сейчас ${signed(controls.threshold, 1)}.`}</small>
        </article>
      </div>
      <div class="hand-detail-bottom">
        <p class="hand-insight"><strong>Откуда результат</strong><span>${insight}</span></p>
        <div class="formula"><strong>EV олл-ина = пас × банк + колл × результат олл-ина</strong><span>${pct(result.foldEquity, 1)} × ${number(pot)} + ${pct(callChance, 1)} × (${pct(result.equity, 1)} × ${number(calledPot)} − ${number(risk)}${bountyFormula}) = <b>${signed(result.ev)}</b></span></div>
      </div>`;
  }

  function selectHand(hand, source) {
    state.selectedTheoryHand = hand;
    markSelectedMatrix("theory", hand);
    renderTheoryHand(hand);
  }

  function renderControlButtons() {
    const groups = [
      ["stack", [25, 30, 35, 40], (value) => `${value} BB`],
      ["openSize", [2, 2.2, 2.5, 3], (value) => `${number(value)} BB`]
    ];
    for (const [key, values, label] of groups) {
      const root = $(`[data-control="${key}"]`);
      root.replaceChildren(...values.map((value) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label(value);
        button.classList.toggle("is-active", state.controls[key] === value);
        button.addEventListener("click", () => {
          state.controls[key] = value;
          state.customControls[key] = value;
          renderControlButtons();
          closeInfo();
          scheduleTheory();
        });
        return button;
      }));
    }
  }

  function syncOutputs() {
    const open = state.controls.openPct;
    const call = state.controls.callPct;
    const usesFieldProfile = state.loaded && state.matrixSource === "field" && state.opponent !== "custom";
    const field = usesFieldProfile ? fieldMetrics(state.opponent) : null;
    const foldAfterOpen = usesFieldProfile
      ? field.fold * 100
      : open > 0 ? clamp((open - call) / open * 100, 0, 100) : 0;
    $("#openPctOut").textContent = `${open}%`;
    $("#callPctOut").textContent = `${call}% рук`;
    $("#thresholdOut").textContent = signed(state.controls.threshold, 1);
    $("#foldSummary").textContent = usesFieldProfile
      ? `В выборке пасовал ${Math.round(foldAfterOpen)} раз из 100 узких пушей. Матрица считает отдельный диапазон продолжения ${Math.round(field.call * 100)}%.`
      : `После опена выбросит примерно ${Math.round(foldAfterOpen)} раз из 100.`;
  }

  function weightedField(category, source, field) {
    if (category !== "overall") return source[category]?.[field] ?? 0;
    const shares = state.data.field_opens.category_share.window_25_40.BTN;
    return Object.entries(shares).reduce((sum, [key, weight]) => sum + weight * (source[key]?.[field] || 0), 0);
  }

  function callWeights(category) {
    const calls = state.data.field_call_range;
    if (category === "overall") return calls.pooled?.hands || calls.pooled || {};
    const record = calls.by_category[category];
    if ((record?.n_known_holecards || 0) >= 500) return record.hands || {};
    const group = ["good_reg", "mid_reg", "weak_reg", "nit"].includes(category) ? "reg" : "fish";
    return calls.super_groups[group]?.hands || calls.super_groups[group] || {};
  }

  function fieldMetrics(category) {
    const opens = state.data.field_opens.pooled_25_40;
    const vsJam = state.data.field_vs_jam.pooled;
    const shares = state.data.field_opens.category_share.window_25_40.BTN;
    const open = category === "overall"
      ? Object.entries(shares).reduce((sum, [key, weight]) => sum + weight * (opens[key]?.BTN?.open_clean_pct || 0), 0)
      : opens[category]?.BTN?.open_clean_pct || 0;
    const fold = weightedField(category, vsJam, "fold_pct");
    const empiricalCall = open * (1 - fold);
    // Field fold-to-jam is selected on naturally narrow jams. Keep it as
    // evidence, but build recommendations from a structural continuation
    // range that is never narrower than the 12% teaching baseline at 25-40 BB.
    const call = Math.min(open, Math.max(empiricalCall, 0.12));
    return {
      open,
      fold,
      call,
      n: category === "overall"
        ? Object.values(vsJam).reduce((sum, item) => sum + (item.n_faced || 0), 0)
        : vsJam[category]?.n_faced || 0
    };
  }

  function opponentLabel(key) {
    return opponentTypes.find(([candidate]) => candidate === key)?.[1] || key;
  }

  function renderOpponentTabs() {
    $("#opponentTabs").replaceChildren(...opponentTypes.map(([key, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `opponent-tab${key === "overall" ? " is-overall" : ""}`;
      button.role = "tab";
      button.dataset.opponent = key;
      const selected = key === "custom" ? state.matrixSource === "custom" : state.matrixSource === "field" && key === state.opponent;
      button.setAttribute("aria-selected", String(selected));
      button.textContent = label;
      button.addEventListener("click", () => applyOpponentProfile(key));
      return button;
    }));
  }

  function applyOpponentProfile(key) {
    if (!state.loaded) return;
    state.opponent = key;
    if (key === "custom") {
      state.matrixSource = "custom";
      Object.assign(state.controls, state.customControls);
    } else {
      state.matrixSource = "field";
      const metrics = fieldMetrics(key);
      state.controls.openPct = Math.round(metrics.open * 100);
      state.controls.callPct = Math.max(1, Math.round(metrics.call * 100));
    }
    $("#openPct").value = String(state.controls.openPct);
    $("#callPct").value = String(state.controls.callPct);
    $("#threshold").value = String(state.controls.threshold);
    syncOutputs();
    renderControlButtons();
    renderOpponentTabs();
    closeInfo();
    renderTheory();
  }

  function renderOutcomeBars() {
    const all = state.data.hero_outcomes.pooled.ALL;
    const keys = ["pair_22_66", "pair_77_99", "ax_strong", "broadway_offsuit", "pair_TT_plus", "suited_conn_low"].filter((key) => all[key]);
    const max = Math.max(...keys.flatMap((key) => [
      Math.abs(advantageOverFold(all[key].jam?.avg_ev_bb)),
      Math.abs(advantageOverFold(all[key].call?.avg_ev_bb))
    ]), 1);
    $("#outcomeBars").innerHTML = keys.map((key) => {
      const jamRow = all[key].jam;
      const callRow = all[key].call;
      const jamRaw = Number(jamRow?.avg_ev_bb) || 0;
      const callRaw = Number(callRow?.avg_ev_bb) || 0;
      const baseline = foldBaselineBb;
      const jam = advantageOverFold(jamRaw);
      const call = advantageOverFold(callRaw);
      const difference = jamRaw - callRaw;
      const smallerAction = Number(jamRow?.n) < Number(callRow?.n) ? "олл-инов" : "коллов";
      const thinSample = Math.min(Number(jamRow?.n) || 0, Number(callRow?.n) || 0) < 5000;
      return `<div class="compare-row ${thinSample ? "is-thin-sample" : ""}">
        <div class="compare-category"><strong>${categoryLabels[key] || key}</strong><small>${categoryDetails[key] || ""}</small>${thinSample ? `<span>меньше 5 000 ${smallerAction}</span>` : ""}</div>
        <div class="compare-lines">
          <div class="compare-line ${jam < 0 ? "is-negative" : ""}" title="Сырой chips_ev: ${compactSigned(jamRaw, 2)} BB · пас с BB: ${signed(baseline, 1)}"><span class="compare-action"><b>Олл-ин</b><small>${sampleSize(jamRow?.n)} раздач</small></span><i><b style="width:${Math.abs(jam) / max * 100}%"></b></i><strong>${compactSigned(jam, 2)} BB</strong></div>
          <div class="compare-line is-call ${call < 0 ? "is-negative" : ""}" title="Сырой chips_ev: ${compactSigned(callRaw, 2)} BB · пас с BB: ${signed(baseline, 1)}"><span class="compare-action"><b>Колл</b><small>${sampleSize(callRow?.n)} раздач</small></span><i><b style="width:${Math.abs(call) / max * 100}%"></b></i><strong>${compactSigned(call, 2)} BB</strong></div>
        </div>
        <div class="compare-delta ${difference < 0 ? "is-negative" : Math.abs(difference) < 0.2 ? "is-close" : ""}"><span>Олл-ин − колл</span><strong>${compactSigned(difference, 2)} BB</strong></div>
      </div>`;
    }).join("");
  }

  function renderEvidence() {
    if (!state.loaded) return;
    renderWisdomEvidence();
    renderOutcomeBars();
  }

  function renderWisdomEvidence() {
    // Keep every outcome in this card tied to the same QJo model from the
    // first hand; field-wide bustouts and showdown wins are not comparable.
    const example = firstModelResult();
    if (!example) return;
    const passShare = Math.round(example.foldEquity * 100);
    const callShare = 100 - passShare;
    const doubleShare = Math.round((1 - example.foldEquity) * example.equity * 100);
    const bustShare = callShare - doubleShare;
    if ($("#wisdomFoldRate")) $("#wisdomFoldRate").textContent = `≈ ${passShare} из 100`;
    $("#wisdomEquity").textContent = `${pct(example.equity, 0)} эквити`;
    $("#wisdomPassRate").textContent = String(passShare);
    $("#wisdomCallRate").textContent = String(callShare);
    $("#wisdomBustRate").textContent = String(bustShare);
    $("#wisdomDoubleRate").textContent = String(doubleShare);
    $("#wisdomJamEv").textContent = signed(example.ev, 1);
    $("#wisdomRiskDots").innerHTML = `
      <span class="risk-share is-fold"><b>${passShare}</b><small>BTN пасует — забираешь банк сразу</small></span>
      <span class="risk-called">
        <span class="risk-called-head"><b>${callShare}</b><small>BTN коллирует</small></span>
        <span class="risk-called-outcomes">
          <span class="risk-share is-bust"><b>${bustShare}</b><small>QJo проигрывает</small></span>
          <span class="risk-share is-double"><b>${doubleShare}</b><small>QJo выигрывает</small></span>
        </span>
      </span>`;
  }

  function renderBountySegments() {
    const values = [0, 2, 5];
    $("#bountySegments").replaceChildren(...values.map((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = value ? `+${value} BB` : "Без баунти";
      button.classList.toggle("is-active", state.fieldBounty === value);
      button.addEventListener("click", () => {
        state.fieldBounty = value;
        renderBountySegments();
        renderTheory();
      });
      return button;
    }));
  }

  function rangePreviewHtml(percent, mode) {
    const active = new Set(Engine.buildRange(state.ranking, percent).map((item) => item.hand));
    return `<div class="info-range-grid" aria-label="Пример диапазона ${percent}%">${Array.from({ length: 169 }, (_, index) => {
      const row = Math.floor(index / 13);
      const col = index % 13;
      const hand = Engine.handFromPosition(row, col);
      return `<span class="${active.has(hand) ? mode : ""}">${hand}</span>`;
    }).join("")}</div>`;
  }

  function stackVisualHtml() {
    const effective = state.controls.stack;
    return `<div class="stack-visual"><div class="stack-column is-effective"><i style="height:${Math.max(28, effective / 45 * 88)}px"></i><span>Ты · ${effective} BB</span></div><div class="stack-column"><i style="height:${Math.max(28, (effective + 5) / 45 * 88)}px"></i><span>BTN · ${effective + 5} BB</span></div></div>`;
  }

  function potBreakdownHtml() {
    const rows = [["Опен BTN", state.controls.openSize], ["Малый блайнд", 0.5], ["Твой BB", 1], ["BB ante", 1]];
    const total = rows.reduce((sum, [, value]) => sum + value, 0);
    return `<div class="pot-breakdown">${rows.map(([label, value]) => `<div><span>${label}</span><i style="width:${value / total * 100}%"></i><b>${number(value)} BB</b></div>`).join("")}<div><span>Банк</span><i style="width:100%;background:var(--good)"></i><b>${number(total)} BB</b></div></div>`;
  }

  function infoContent(key) {
    const controls = state.controls;
    if (key === "effectiveStack") return {
      eyebrow: "Почему эта настройка здесь",
      title: `${controls.stack} BB задают размер олл-ина и риск`,
      visual: stackVisualHtml(),
      copy: `Ты выбрал эффективный стек ${controls.stack} BB — именно от него матрица считает риск олл-ина и диапазон рестила. Даже если у BTN больше фишек, его лишняя часть в этой раздаче не участвует: разыграть можно только меньший из двух стеков.`
    };
    if (key === "openSize") return {
      eyebrow: "Банк до твоего решения",
      title: `После опена в центре ${number(controls.openSize + 2.5)} BB`,
      visual: potBreakdownHtml(),
      copy: "BB ante всегда включён. Чем больше банк уже собран, тем ценнее забрать его олл-ином без флопа."
    };
    if (key === "openRange") return {
      eyebrow: "Учебный диапазон открытия",
      title: `BTN начинает примерно с ${controls.openPct}% рук`,
      visual: rangePreviewHtml(controls.openPct, "is-open"),
      copy: "Фиолетовые клетки — пример набора рук от самых сильных к более слабым. Это учебная модель, а не готовый чарт любого игрока."
    };
    if (key === "callRange") return {
      eyebrow: "Учебный диапазон ответа",
      title: `На олл-ин остаются лучшие ${controls.callPct}% рук`,
      visual: rangePreviewHtml(controls.callPct, "is-call"),
      copy: `Это ${controls.callPct}% всех стартовых рук, а не ${controls.callPct}% его опенов. Поэтому после широкого открытия соперник часто выбрасывает.`
    };
    return {
      eyebrow: "Фильтр запаса",
      title: `Показываем руки от ${signed(controls.threshold, 1)}`,
      visual: `<div class="threshold-visual"><i><b style="width:${clamp(controls.threshold / 2 * 100, 2, 100)}%"></b></i><strong>${signed(controls.threshold, 1)}</strong></div>`,
      copy: "Пас считаем за 0. Если поставить порог +0,5 BB, матрица приглушит руки, которые всё ещё в плюсе, но дают слишком маленький запас."
    };
  }

  function showInfo(key, trigger) {
    if (!key) return;
    if (!state.loaded && ["openRange", "callRange"].includes(key)) {
      ensureData().then(() => showInfo(key, trigger)).catch(() => {});
      return;
    }
    closeInfo();
    const content = infoContent(key);
    state.infoTrigger = trigger || null;
    state.infoTrigger?.setAttribute("aria-expanded", "true");
    $("#infoEyebrow").textContent = content.eyebrow;
    $("#infoTitle").textContent = content.title;
    $("#infoVisual").innerHTML = content.visual;
    $("#infoCopy").textContent = content.copy;
    $("#infoPopover").hidden = false;
  }

  function closeInfo() {
    state.infoTrigger?.setAttribute("aria-expanded", "false");
    state.infoTrigger = null;
    $("#infoPopover").hidden = true;
  }

  function renderWisdomStory(requestedIndex) {
    const track = $("#wisdomCarouselTrack");
    const slides = $$('[data-wisdom-slide]');
    if (!track || !slides.length) return;
    state.wisdomStory = clamp(Number(requestedIndex) || 0, 0, slides.length - 1);
    const activeSlide = slides[state.wisdomStory];
    const trackPadding = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
    track.style.transform = `translate3d(${-Math.max(0, activeSlide.offsetLeft - trackPadding)}px, 0, 0)`;
    slides.forEach((slide, index) => {
      const active = index === state.wisdomStory;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
    });
    $$(".wisdom-story-dot").forEach((dot, index) => {
      const active = index === state.wisdomStory;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "step" : "false");
    });
    $("#wisdomStoryCounter").textContent = `${state.wisdomStory + 1} из ${slides.length}`;
    $("[data-wisdom-prev]").disabled = state.wisdomStory === 0;
    $("[data-wisdom-next]").disabled = state.wisdomStory === slides.length - 1;
  }

  function setupWisdomCarousel() {
    const carousel = $("[data-wisdom-carousel]");
    const viewport = carousel?.querySelector(".wisdom-carousel-viewport");
    const slides = $$('[data-wisdom-slide]');
    const dots = $("#wisdomStoryDots");
    if (!carousel || !viewport || !slides.length || !dots) return;
    dots.replaceChildren(...slides.map((slide, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wisdom-story-dot";
      button.setAttribute("aria-label", `Мысль ${index + 1} из ${slides.length}`);
      button.addEventListener("click", () => renderWisdomStory(index));
      return button;
    }));
    $("[data-wisdom-prev]").addEventListener("click", () => renderWisdomStory(state.wisdomStory - 1));
    $("[data-wisdom-next]").addEventListener("click", () => renderWisdomStory(state.wisdomStory + 1));
    carousel.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      renderWisdomStory(state.wisdomStory + (event.key === 'ArrowRight' ? 1 : -1));
    });
    let pointerStart = null;
    viewport.addEventListener("pointerdown", (event) => { pointerStart = { x: event.clientX, y: event.clientY }; });
    viewport.addEventListener("pointerup", (event) => {
      if (!pointerStart) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.abs(dx) < 44 || Math.abs(dx) <= Math.abs(dy)) return;
      renderWisdomStory(state.wisdomStory + (dx < 0 ? 1 : -1));
    });
    window.addEventListener("resize", () => requestAnimationFrame(() => renderWisdomStory(state.wisdomStory)));
    renderWisdomStory(0);
  }

  function setupEvents() {
    $$("[data-step-target]").forEach((button) => button.addEventListener("click", () => showStep(button.dataset.stepTarget)));
    $$("[data-step-link]").forEach((button) => button.addEventListener("click", () => showStep(button.dataset.stepLink, { focusHeading: true })));
    $(".step-tabs").addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const tabs = $$(".step-tab:not(:disabled)");
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(current + delta + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
    $("#startLesson").addEventListener("click", startLesson);
    [["openPct", "openPct"], ["callPct", "callPct"], ["threshold", "threshold"]].forEach(([id, key]) => {
      $(`#${id}`).addEventListener("input", (event) => {
        state.controls[key] = Number(event.target.value);
        state.customControls[key] = state.controls[key];
        if (key !== "threshold") {
          state.matrixSource = "custom";
          state.opponent = "custom";
          renderOpponentTabs();
        }
        syncOutputs();
        closeInfo();
        scheduleTheory();
      });
    });
    $("#firstTable").addEventListener("click", (event) => {
      const action = event.target.closest("[data-option-key]");
      if (action) answerFirst(action.dataset.optionKey);
    });
    $$('[data-session-hands]').forEach((button) => button.addEventListener("click", () => {
      state.practiceHands = Number(button.dataset.sessionHands);
      renderPracticeSetup();
    }));
    $("#startPracticeSession").addEventListener("click", startPracticeSession);
    $("#exitPractice").addEventListener("click", () => showStep("wisdom", { focusHeading: true }));
    $("#restealSimulator").addEventListener("load", () => setPracticeSimulatorLoading(false));
    $$("[data-select-hand]").forEach((button) => button.addEventListener("click", () => selectHand(button.dataset.selectHand, "theory")));
    $$(".info-button").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showInfo(button.dataset.info, button);
      });
    });
    $("#infoClose").addEventListener("click", closeInfo);
    document.addEventListener("click", (event) => {
      if ($("#infoPopover").hidden) return;
      if (event.target.closest("#infoPopover") || event.target.closest(".info-button")) return;
      closeInfo();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeInfo();
    });
  }

  function init() {
    renderIntroTableArt();
    renderFirstTable();
    renderFirstCoach();
    renderPracticeSetup();
    renderMatrixShell($("#handMatrix"), "theory");
    renderControlButtons();
    renderOpponentTabs();
    renderBountySegments();
    setupWisdomCarousel();
    setupEvents();
    syncOutputs();
    const saved = readProgress();
    if (saved.unlocked) {
      state.firstChoice = saved.firstChoice || "jam";
      $$(".step-tab").forEach((tab) => { tab.disabled = false; });
      $("#firstEncounter").classList.add("has-answer");
      renderFirstTable();
      renderFirstCoach();
      if (["idea", "wisdom", "deep", "practice"].includes(saved.step)) showStep(saved.step);
    }
    setTimeout(() => ensureData().catch(() => {}), 180);
  }

  init();
})();
