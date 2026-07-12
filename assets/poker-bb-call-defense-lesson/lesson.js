(function () {
  "use strict";

  var Engine = window.PokerBbCallEngine;
  var Content = window.PokerBbCallData;
  var ASSET_ROOT = "assets/poker-bb-call-defense-lesson/";
  var PROGRESS_KEY = "ff-learning-hub:bb-call:v1";
  var state = {
    step: "idea",
    introStarted: false,
    firstChoice: "",
    wisdomStory: 0,
    sizeKey: "2_0",
    position: "BTN",
    practiceHands: 10,
    practiceRun: 0,
    practiceQueue: [],
    practiceIndex: 0,
    practiceChoice: "",
    practiceAnswered: false,
    stats: { correct: 0, missedCalls: 0, wideCalls: 0, missedThreeBets: 0 }
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function fmt(value, digits) {
    var count = digits == null ? 1 : digits;
    return Number(value).toFixed(count).replace(".", ",");
  }

  function readProgress() {
    try { return JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || "null") || {}; } catch (error) { return {}; }
  }

  function saveProgress() {
    try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({ step: state.step, unlocked: Boolean(state.firstChoice), firstChoice: state.firstChoice })); } catch (error) {}
  }

  function focusProgress(target) {
    if (!target) return;
    target.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 900px)").matches) {
      target.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }

  function optionFor(spot, key) {
    return (spot && spot.options || []).find(function (option) {
      return option.key === key;
    }) || null;
  }

  function showStep(next, options) {
    var config = options || {};
    state.step = next;
    saveProgress();
    $$(".screen").forEach(function (screen) {
      screen.classList.toggle("is-active", screen.dataset.step === next);
    });
    $$(".step-tab").forEach(function (tab) {
      var active = tab.dataset.stepTarget === next;
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.classList.toggle("is-active", active);
      tab.tabIndex = active ? 0 : -1;
    });
    if (next === "deep") renderDeep();
    if (next === "practice") renderPracticeSetup();
    if (next === "wisdom") requestAnimationFrame(function () {
      renderWisdomStory(state.wisdomStory);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (config.focusHeading) {
      requestAnimationFrame(function () {
        var heading = $(".screen[data-step='" + next + "'] h2");
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      });
    }
  }

  function renderRoomTable(host, spot, selectedKey, options) {
    var config = options || {};
    if (!window.FFTrainerSimulatorSnapshot || !window.FFTrainerSimulatorSnapshot.renderTable) {
      host.innerHTML = '<p class="table-load-error">Стол не загрузился: проверь simulator snapshot.</p>';
      return;
    }
    var tableMarkup = window.FFTrainerSimulatorSnapshot.renderTable(spot, {
      answered: Boolean(selectedKey),
      selectedKey: selectedKey || "",
      finished: false
    });
    // The shared snapshot renderer uses UTG as its geometry key; the supplied
    // methodology names the same early-position bucket EP. Translate only the
    // rendered markup so the learner sees one label while seat geometry and
    // action highlighting keep using the established renderer contract.
    host.innerHTML = tableMarkup
      .replace(/\bUTG\b/g, "EP")
      .replace(/(\d)\.(\d)(?=\s*BB)/g, "$1,$2");
    if (config.nextLabel) {
      var controls = host.querySelector(".client-controls");
      if (controls) {
        var nextRow = document.createElement("div");
        nextRow.className = "practice-next-row";
        nextRow.innerHTML = '<button class="practice-next-button" type="button" data-practice-next>' +
          '<span>' + config.nextLabel + '</span></button>';
        controls.appendChild(nextRow);
      }
    }
  }

  function renderPracticeRangeProof(spot) {
    var cell = spot.sourceChartCell;
    var size = Content.sizes[spot.sizeKey];
    var position = Content.positions[spot.openPosition];
    return '<figure class="practice-range-proof">' +
      '<div class="practice-range-proof__head"><strong>' + position.label + ' · ' + size.label + '</strong><span>Рамка — ' + spot.hand + '</span></div>' +
      '<div class="practice-range-canvas" data-matrix-row="' + String(cell.row) + '" data-matrix-column="' + String(cell.column) + '" style="--matrix-row:' + String(cell.row + 1) + ';--matrix-column:' + String(cell.column + 1) + '">' +
        '<img src="' + ASSET_ROOT + spot.sourceChart + '" width="470" height="470" alt="Чарт защиты BB против ' + position.label + ', опен ' + size.label + '">' +
        '<span class="practice-range-overlay" aria-hidden="true"><i class="practice-range-cell"></i></span>' +
      '</div>' +
      '<figcaption><strong>' + spot.hand + ' · ' + spot.sourceCell + '</strong><span>' + spot.answer + '</span><small>Посмотри на соседние клетки: смена цвета показывает, насколько рука близка к границе.</small></figcaption>' +
    '</figure>';
  }

  function renderIntroTableArt() {
    var chipKit = window.PokerChipKit;
    var deckKit = window.PokerDeckKit;
    if (chipKit && chipKit.renderAmount) {
      $("#introBtnChips").innerHTML = chipKit.renderAmount(2, { className: "intro-chip-stack intro-chip-stack--bet", label: "рейз BTN 2 BB", maxVisual: 3, detail: true });
      $("#introPotChips").innerHTML = chipKit.renderAmount(4.5, { className: "intro-chip-stack intro-chip-stack--pot", label: "банк 4,5 BB", maxVisual: 5, detail: true });
      $("#introCallChips").innerHTML = chipKit.renderAmount(1, { className: "intro-chip-stack intro-chip-stack--call", label: "колл BB 1 BB", maxVisual: 2, detail: true });
      if (chipKit.renderDealerButton) $("#introDealerButton").innerHTML = chipKit.renderDealerButton({ label: "D" });
    }
    if (deckKit && deckKit.renderCard) {
      $("#introHeroCards").innerHTML = ["Kh", "4d"].map(function (card) {
        return deckKit.renderCard(card, { theme: "color-block", hero: true, fourColor: true, className: "intro-card" });
      }).join("");
    }
  }

  function startLesson() {
    state.introStarted = true;
    $("#lessonIntro").hidden = true;
    $("#firstEncounter").hidden = false;
    renderFirstTable();
    renderFirstCoach();
    requestAnimationFrame(function () {
      var action = $("#firstEncounter .table-action");
      focusProgress(action);
    });
  }

  function renderFirstTable() {
    renderRoomTable($("#firstTable"), Content.firstSpot, state.firstChoice);
  }

  function renderFirstCoach() {
    var coach = $("#firstCoach");
    var spot = Content.firstSpot;
    if (!state.firstChoice) {
      coach.innerHTML = '<p class="eyebrow">Твой ход</p>' +
        '<h3>Что нажмёшь с K4o?</h3>' +
        '<p>BTN открыл 2 BB, малый блайнд выбросил. Ты на большом блайнде.</p>' +
        '<div class="spot-facts">' +
          '<div class="spot-fact is-price"><i>18%</i><div><b>Дешёвая цена</b><small>добавить 1 BB в итоговый банк 5,5 BB</small></div></div>' +
          '<div class="spot-fact is-position"><i>BTN</i><div><b>Широкий рейзер</b><small>52% — допущение чартов защиты; RFI-цель урока шире</small></div></div>' +
          '<div class="spot-fact is-hand"><i>K4</i><div><b>Некрасивая, но зелёная</b><small>K4o — колдколл 100% в исходной матрице</small></div></div>' +
        '</div>' +
        '<p class="coach-nudge">Нажми «Пас», «Колл» или «3-бет» под столом.</p>';
      return;
    }

    var chosen = optionFor(spot, state.firstChoice);
    var correct = Boolean(chosen && chosen.correct);
    coach.innerHTML = '<p class="eyebrow">Результат решения</p>' +
      '<h3>' + (correct ? "Хороший колл" : "Здесь лучше колл") + '</h3>' +
      '<div class="decision-result ' + (correct ? "is-correct" : "is-wrong") + '"><strong>Ты выбрал: ' + (chosen ? chosen.label : state.firstChoice) + '</strong><p>' + (chosen ? chosen.feedback : "") + '</p></div>' +
      '<div class="reason-list">' +
        '<div class="reason-line"><i></i><div><b>Цена — 18,2%</b><small>нужно добавить 1 BB в итоговый банк 5,5 BB</small></div></div>' +
        '<div class="reason-line"><i></i><div><b>BTN открывает широко</b><small>ориентир методички — диапазон 52%</small></div></div>' +
        '<div class="reason-line"><i></i><div><b>K4o лежит в колле</b><small>зелёная клетка 100%; именно такие руки часто пасуют на автопилоте</small></div></div>' +
      '</div>' +
      '<div class="ev-callout bb-boundary-callout"><i>i</i><div><strong>Оддсы — не весь ответ</strong><span>Дальше добавим реализацию эквити, позицию рейзера и сайз.</span></div></div>' +
      '<button class="btn primary" type="button" id="openWisdom">Разобрать главную идею</button>';
    $("#openWisdom").addEventListener("click", function () {
      showStep("wisdom", { focusHeading: true });
    });
  }

  function answerFirst(key) {
    if (state.firstChoice || !optionFor(Content.firstSpot, key)) return;
    state.firstChoice = key;
    saveProgress();
    $$(".step-tab").forEach(function (tab) {
      tab.disabled = false;
      tab.tabIndex = tab.dataset.stepTarget === state.step ? 0 : -1;
    });
    $("#firstEncounter").classList.add("has-answer");
    renderFirstTable();
    renderFirstCoach();
    requestAnimationFrame(function () {
      var next = $("#openWisdom");
      focusProgress(next);
    });
  }

  function renderWisdomStory(requestedIndex) {
    var track = $("#wisdomCarouselTrack");
    var slides = $$('[data-wisdom-slide]');
    if (!track || !slides.length) return;
    state.wisdomStory = (requestedIndex + slides.length) % slides.length;
    var activeSlide = slides[state.wisdomStory];
    var trackPadding = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
    track.style.transform = "translate3d(" + String(-(activeSlide.offsetLeft - trackPadding)) + "px,0,0)";
    slides.forEach(function (slide, index) {
      var active = index === state.wisdomStory;
      slide.setAttribute("aria-hidden", active ? "false" : "true");
      slide.classList.toggle("is-active", active);
    });
    $$("#wisdomStoryDots button").forEach(function (dot, index) {
      var active = index === state.wisdomStory;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "step" : "false");
    });
    $("#wisdomStoryCounter").textContent = String(state.wisdomStory + 1) + " из " + String(slides.length);
  }

  function setupWisdomCarousel() {
    var carousel = $("[data-wisdom-carousel]");
    var viewport = carousel && carousel.querySelector(".wisdom-carousel-viewport");
    var slides = $$('[data-wisdom-slide]');
    var dots = $("#wisdomStoryDots");
    if (!carousel || !viewport || !dots || !slides.length) return;
    slides.forEach(function (_, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", "Мысль " + String(index + 1));
      button.addEventListener("click", function () {
        renderWisdomStory(index);
      });
      dots.appendChild(button);
    });
    $("[data-wisdom-prev]").addEventListener("click", function () {
      renderWisdomStory(state.wisdomStory - 1);
    });
    $("[data-wisdom-next]").addEventListener("click", function () {
      renderWisdomStory(state.wisdomStory + 1);
    });
    carousel.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      renderWisdomStory(state.wisdomStory + (event.key === "ArrowRight" ? 1 : -1));
    });
    var pointerStart = null;
    viewport.addEventListener("pointerdown", function (event) {
      pointerStart = { x: event.clientX, y: event.clientY };
    });
    viewport.addEventListener("pointerup", function (event) {
      if (!pointerStart) return;
      var dx = event.clientX - pointerStart.x;
      var dy = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
      renderWisdomStory(state.wisdomStory + (dx < 0 ? 1 : -1));
    });
    window.addEventListener("resize", function () {
      requestAnimationFrame(function () {
        renderWisdomStory(state.wisdomStory);
      });
    });
    renderWisdomStory(0);
  }

  function makeSegmented(root, items, selected, onSelect) {
    root.innerHTML = "";
    var controlsByRoot = {
      oddsSizeTabs: "oddsSummary",
      rangeSizeTabs: "rangeChart",
      positionTabs: "rangeChart"
    };
    items.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.id = root.id + "-" + item.key;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", item.key === selected ? "true" : "false");
      button.setAttribute("aria-controls", controlsByRoot[root.id] || root.id);
      button.tabIndex = item.key === selected ? 0 : -1;
      button.classList.toggle("is-active", item.key === selected);
      button.addEventListener("click", function () {
        onSelect(item.key);
        requestAnimationFrame(function () {
          var replacement = document.getElementById(root.id + "-" + item.key);
          if (replacement) replacement.focus({ preventScroll: true });
        });
      });
      button.addEventListener("keydown", function (event) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        var tabs = Array.from(root.querySelectorAll('[role="tab"]'));
        var current = tabs.indexOf(button);
        var delta = event.key === "ArrowRight" ? 1 : -1;
        var next = tabs[(current + delta + tabs.length) % tabs.length];
        if (next) {
          next.focus();
          next.click();
        }
      });
      root.appendChild(button);
    });
  }

  function sizeItems() {
    return Object.keys(Content.sizes).map(function (key) {
      return { key: key, label: Content.sizes[key].label };
    });
  }

  function positionItems() {
    return Object.keys(Content.positions).map(function (key) {
      return { key: key, label: Content.positions[key].label };
    });
  }

  function renderOdds() {
    var size = Content.sizes[state.sizeKey];
    var model = Engine.potModel(size.openSize);
    makeSegmented($("#oddsSizeTabs"), sizeItems(), state.sizeKey, function (key) {
      state.sizeKey = key;
      renderDeep();
    });
    $("#oddsSummary").innerHTML = '<div><span>Нужно добавить</span><strong>' + fmt(model.toCall, 1).replace(",0", "") + ' BB</strong><small>решение сейчас</small></div>' +
      '<div><span>Банк до колла</span><strong>' + fmt(model.potBeforeCall, 1) + ' BB</strong><small>опен + SB + твой BB + ante</small></div>' +
      '<div><span>Итоговый банк</span><strong>' + fmt(model.finalPot, 1) + ' BB</strong><small>после твоего колла</small></div>' +
      '<div class="is-key"><span>Цена колла</span><strong>' + fmt(model.potOddsPct, 1) + '%</strong><small>минимум до поправки на реализацию</small></div>';
  }

  function renderRange() {
    var size = Content.sizes[state.sizeKey];
    var position = Content.positions[state.position];
    var scenario = Content.rangeScenarios[state.sizeKey][state.position];
    var summary = Engine.defenseSummary(scenario.foldPct, scenario.threeBetPct);
    makeSegmented($("#rangeSizeTabs"), sizeItems(), state.sizeKey, function (key) {
      state.sizeKey = key;
      renderDeep();
    });
    makeSegmented($("#positionTabs"), positionItems(), state.position, function (key) {
      state.position = key;
      renderDeep();
    });
    $("#rangeScenarioTitle").textContent = position.label + " · " + size.label;
    $("#rangeOpenerWidth").textContent = "Ренж рейзера " + String(position.openerPct) + "%";
    var image = $("#rangeChart");
    image.src = ASSET_ROOT + scenario.chart;
    image.alt = "Матрица защиты большого блайнда против " + position.label + " " + size.label;
    var splitHtml = summary.threeBetPct == null
      ? '<div><span>Колл + 3-бет</span><strong>' + fmt(summary.continuePct, 0) + '%</strong><small>точная смесь видна в клетках матрицы</small></div>'
      : '<div><span>Колдколл</span><strong>' + fmt(summary.coldCallPct, 0) + '%</strong><small>зелёная часть</small></div><div><span>3-бет</span><strong>' + fmt(summary.threeBetPct, 0) + '%</strong><small>розовая часть</small></div>';
    $("#rangeFacts").innerHTML = '<p class="eyebrow">Агрегаты методички</p>' +
      '<h3>' + position.label + ' против ' + size.label + '</h3>' +
      '<div class="range-fact-grid">' + splitHtml +
        '<div><span>Пас</span><strong>' + fmt(summary.foldPct, 0) + '%</strong><small>белая часть</small></div>' +
        '<div><span>Цена колла</span><strong>' + fmt(size.potOddsPct, 1) + '%</strong><small>из страницы 11</small></div>' +
      '</div>' +
      '<p class="range-reading-note">Сначала найди конкретную руку в матрице. Затем проверь, не двигают ли границу ICM, покрытие и глубина стека.</p>' +
      '<p class="source-boundary">Источник: физические страницы 10–11 PDF. Это не расчёт твоего личного EV.</p>';
  }

  function renderRealization() {
    var values = Content.equityRealization;
    var model = Engine.equityRealization(values.rawEquityPct, values.realizedEquityPct);
    $("#realizationRatio").textContent = fmt(model.realizationPct, 1) + "%";
    $("#realizationDetail").innerHTML = '<div class="realization-copy"><h4>Реализуем примерно 72% сырого эквити</h4><p>38,5% на флопе превращаются в 27,8% реализованного эквити. Потеря — 10,7 процентного пункта, или около 28% исходного запаса.</p></div>' +
      '<div class="realization-bars deep-realization-bars">' +
        '<div><span>Сырое эквити</span><i><b style="width:' + fmt(model.rawEquityPct, 1).replace(",", ".") + '%"></b></i><strong>' + fmt(model.rawEquityPct, 1) + '%</strong></div>' +
        '<div><span>Реализованное</span><i><b style="width:' + fmt(model.realizedEquityPct, 1).replace(",", ".") + '%"></b></i><strong>' + fmt(model.realizedEquityPct, 1) + '%</strong></div>' +
      '</div>';
  }

  function renderDeep() {
    renderOdds();
    renderRange();
    renderRealization();
  }

  function renderPracticeSetup() {
    $$('[data-session-hands]').forEach(function (button) {
      var selected = Number(button.dataset.sessionHands) === state.practiceHands;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    $("#startPracticeSession").textContent = "Начать · " + String(state.practiceHands) + " решений";
  }

  function makePracticeQueue(count) {
    var spots = Content.practiceSpots.slice();
    var offset = state.practiceRun % spots.length;
    var rotated = spots.slice(offset).concat(spots.slice(0, offset));
    var queue = [];
    while (queue.length < count) {
      rotated.forEach(function (spot) {
        if (queue.length < count) queue.push(spot);
      });
      rotated = rotated.slice(3).concat(rotated.slice(0, 3));
    }
    return queue;
  }

  function startPractice() {
    state.practiceRun += 1;
    state.practiceQueue = makePracticeQueue(state.practiceHands);
    state.practiceIndex = 0;
    state.practiceChoice = "";
    state.practiceAnswered = false;
    state.stats = { correct: 0, missedCalls: 0, wideCalls: 0, missedThreeBets: 0 };
    document.body.classList.add("practice-is-running");
    $("#practiceScreen").classList.add("is-running");
    $("#practiceSetup").hidden = true;
    $("#practiceRun").hidden = false;
    renderPracticeSpot();
    requestAnimationFrame(function () {
      var action = $("#practiceTable .table-action");
      focusProgress(action);
    });
  }

  function currentPracticeSpot() {
    return state.practiceQueue[state.practiceIndex] || null;
  }

  function renderPracticeHud() {
    var played = state.practiceIndex + (state.practiceAnswered ? 1 : 0);
    $("#practiceHands").textContent = String(played) + " / " + String(state.practiceHands);
    $("#practiceCorrect").textContent = String(state.stats.correct);
    $("#practiceMissedCalls").textContent = String(state.stats.missedCalls);
    $("#practiceWideCalls").textContent = String(state.stats.wideCalls);
    $("#practiceMissedThreeBets").textContent = String(state.stats.missedThreeBets);
  }

  function renderPracticeCoach() {
    var coach = $("#practiceCoach");
    var spot = currentPracticeSpot();
    if (!spot) return;
    var size = Content.sizes[spot.sizeKey];
    var position = Content.positions[spot.openPosition];
    if (!state.practiceAnswered) {
      coach.innerHTML = '<p class="eyebrow">Твой ход</p>' +
        '<h3>Что нажмёшь с ' + spot.hand + '?</h3>' +
        '<p>' + spot.question + '</p>' +
        '<div class="spot-facts">' +
          '<div class="spot-fact is-price"><i>' + fmt(size.potOddsPct, 0) + '%</i><div><b>Цена колла</b><small>добавить ' + fmt(size.toCall, 1).replace(",0", "") + ' BB</small></div></div>' +
          '<div class="spot-fact is-position"><i>' + position.label + '</i><div><b>Позиция рейзера</b><small>ориентир открытия ' + String(position.openerPct) + '%</small></div></div>' +
          '<div class="spot-fact is-hand"><i>' + spot.hand.replace(/[so]/, "") + '</i><div><b>Найди клетку</b><small>не угадывай по одной силе руки</small></div></div>' +
        '</div>' +
        '<p class="coach-nudge">' + spot.cue + '</p>';
      return;
    }
    var chosen = optionFor(spot, state.practiceChoice);
    var correct = Boolean(chosen && chosen.correct);
    coach.innerHTML = '<p class="eyebrow">Разбор решения</p>' +
      '<h3>' + (correct ? "Верно" : "Сверься с матрицей") + '</h3>' +
      '<div class="decision-result ' + (correct ? "is-correct" : "is-wrong") + '"><strong>Ты выбрал: ' + (chosen ? chosen.label : state.practiceChoice) + '</strong><p>' + (chosen ? chosen.feedback : "") + '</p></div>' +
      renderPracticeRangeProof(spot);
  }

  function advancePractice() {
    var last = state.practiceIndex >= state.practiceQueue.length - 1;
    if (last) {
      renderPracticeComplete();
      return;
    }
    state.practiceIndex += 1;
    state.practiceChoice = "";
    state.practiceAnswered = false;
    renderPracticeSpot();
    requestAnimationFrame(function () {
      var action = $("#practiceTable .table-action");
      focusProgress(action);
    });
  }

  function renderPracticeSpot() {
    var spot = currentPracticeSpot();
    if (!spot) return;
    $("#practiceKicker").textContent = "Решение " + String(state.practiceIndex + 1) + " из " + String(state.practiceHands);
    $("#practiceSpotTitle").textContent = Content.positions[spot.openPosition].label + " открыл. Твой ход с " + spot.hand;
    $("#practiceSpotPrompt").textContent = "Цена колла " + fmt(Content.sizes[spot.sizeKey].potOddsPct, 1) + "%. Сначала прочитай экшен, затем выбери действие.";
    var last = state.practiceIndex >= state.practiceQueue.length - 1;
    renderRoomTable($("#practiceTable"), spot, state.practiceChoice, state.practiceAnswered ? {
      nextLabel: last ? "Показать итог" : "Следующая раздача"
    } : null);
    $("#practiceCoach").closest(".practice-layout").classList.toggle("has-answer", state.practiceAnswered);
    renderPracticeCoach();
    renderPracticeHud();
  }

  function answerPractice(key) {
    var spot = currentPracticeSpot();
    var chosen = optionFor(spot, key);
    if (!spot || !chosen || state.practiceAnswered) return;
    state.practiceChoice = key;
    state.practiceAnswered = true;
    if (chosen.correct) state.stats.correct += 1;
    if (spot.correct === "call" && key !== "call") state.stats.missedCalls += 1;
    if (key === "call" && spot.correct !== "call") state.stats.wideCalls += 1;
    if (spot.correct === "raise" && key !== "raise") state.stats.missedThreeBets += 1;
    renderPracticeSpot();
    requestAnimationFrame(function () {
      var next = $("#practiceTable [data-practice-next]");
      focusProgress(next);
    });
  }

  function renderPracticeComplete() {
    var score = state.stats.correct;
    var total = state.practiceHands;
    $("#practiceSpotTitle").textContent = "Сессия завершена";
    $("#practiceSpotPrompt").textContent = "Смотри не только на процент верных ответов, но и на тип ошибок.";
    var nextRow = $("#practiceTable .practice-next-row");
    if (nextRow) nextRow.remove();
    $("#practiceCoach").closest(".practice-layout").classList.remove("has-answer");
    $("#practiceCoach").innerHTML = '<p class="eyebrow">Итог</p>' +
      '<h3>' + String(score) + ' из ' + String(total) + ' верно</h3>' +
      (score === total && state.stats.missedCalls === 0 && state.stats.wideCalls === 0 && state.stats.missedThreeBets === 0 ? '<div class="defender-medal"><strong>Защитник большого блайнда</strong><span>Все решения верны, ни одного правильного продолжения не пропущено</span></div>' : '') +
      '<div class="practice-final-grid"><div><span>Пропущенные коллы</span><strong>' + String(state.stats.missedCalls) + '</strong></div><div><span>Лишние коллы</span><strong>' + String(state.stats.wideCalls) + '</strong></div><div><span>Пропущенные 3-беты</span><strong>' + String(state.stats.missedThreeBets) + '</strong></div></div>' +
      '<p>Если ошибки сконцентрированы на 2,5x и 3x, вернись к цене колла. Если на EP/MP — к позиции рейзера.</p>' +
      '<button class="btn primary" type="button" id="restartPractice">Сыграть ещё ' + String(total) + '</button>' +
      '<button class="btn secondary" type="button" id="finishPractice">К уроку</button>';
    $("#restartPractice").addEventListener("click", startPractice);
    $("#finishPractice").addEventListener("click", exitPractice);
    requestAnimationFrame(function () {
      var restart = $("#restartPractice");
      focusProgress(restart);
    });
  }

  function exitPractice() {
    document.body.classList.remove("practice-is-running");
    $("#practiceScreen").classList.remove("is-running");
    $("#practiceRun").hidden = true;
    $("#practiceSetup").hidden = false;
    state.practiceQueue = [];
    renderPracticeSetup();
    requestAnimationFrame(function () {
      var start = $("#startPracticeSession");
      focusProgress(start);
    });
  }

  function setupEvents() {
    $$("[data-step-target]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!button.disabled) showStep(button.dataset.stepTarget);
      });
    });
    $$("[data-step-link]").forEach(function (button) {
      button.addEventListener("click", function () {
        showStep(button.dataset.stepLink, { focusHeading: true });
      });
    });
    $(".step-tabs").addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      var tabs = $$(".step-tab:not(:disabled)");
      var current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      var delta = event.key === "ArrowRight" ? 1 : -1;
      var next = tabs[(current + delta + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
    $("#startLesson").addEventListener("click", startLesson);
    $("#firstTable").addEventListener("click", function (event) {
      var action = event.target.closest("[data-option-key]");
      if (action) answerFirst(action.dataset.optionKey);
    });
    $$('[data-session-hands]').forEach(function (button) {
      button.addEventListener("click", function () {
        state.practiceHands = Number(button.dataset.sessionHands) || 10;
        renderPracticeSetup();
      });
    });
    $("#startPracticeSession").addEventListener("click", startPractice);
    $("#exitPractice").addEventListener("click", exitPractice);
    $("#practiceTable").addEventListener("click", function (event) {
      var next = event.target.closest("[data-practice-next]");
      if (next) {
        advancePractice();
        return;
      }
      var action = event.target.closest("[data-option-key]");
      if (action) answerPractice(action.dataset.optionKey);
    });
  }

  function init() {
    if (!Engine || !Content) return;
    renderIntroTableArt();
    renderFirstTable();
    renderFirstCoach();
    renderDeep();
    renderPracticeSetup();
    setupWisdomCarousel();
    setupEvents();
    var saved = readProgress();
    if (saved.unlocked) {
      state.firstChoice = saved.firstChoice || "call";
      $$(".step-tab").forEach(function (tab) { tab.disabled = false; });
      $("#firstEncounter").classList.add("has-answer");
      renderFirstTable();
      renderFirstCoach();
      if (["idea", "wisdom", "deep", "practice"].includes(saved.step)) showStep(saved.step);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
