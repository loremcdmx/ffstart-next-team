(function () {
  "use strict";

  var Engine = window.PokerBbCallEngine;
  var Content = window.PokerBbCallData;
  var Recall = window.PokerBbCallRecall;
  var ASSET_ROOT = "assets/poker-bb-call-defense-lesson/";
  var PROGRESS_KEY = "ff-learning-hub:bb-call:v1";
  var state = {
    step: "idea",
    unlocked: false,
    introStarted: false,
    firstChoice: "",
    wisdomStory: 0,
    sizeKey: "2_0",
    position: "BTN",
    selectedHand: "K4o",
    equityData: null,
    equityLoading: null,
    equityError: "",
    ffRealizationData: null,
    ffRealizationLoading: null,
    ffRealizationError: "",
    memorySizeKey: "2_0",
    memoryPosition: "BTN",
    memoryPhase: "preview",
    memoryDraft: {},
    memoryTool: "C",
    memoryGrade: null,
    memorySeconds: 10,
    memoryTimer: null,
    memoryPainting: false,
    memoryPaintCode: null,
    memoryLastCell: null,
    memoryFocusHand: "AA",
    practiceRun: 0,
    practiceIndex: 0,
    practiceChoice: "",
    practiceAnswered: false,
    stats: { correct: 0, missedCalls: 0, wideCalls: 0, missedThreeBets: 0 }
  };

  var SIZE_DEFENSE_PREVIEW_COPY = Object.freeze({
    "2_5": Object.freeze({
      title: "2,5 BB: срезаем слабый offsuit",
      boundary: "По сравнению с минрейзом первыми уходят K4o, Q6o, J6o, T6o и 96o: доплата стала больше, а эти руки хуже реализуют эквити без позиции."
    }),
    "3_0": Object.freeze({
      title: "3 BB: остаётся плотное ядро",
      boundary: "По сравнению с 2,5 BB дальше уходят K2s–K4s, Q2s–Q6s, A2o–A7o и часть слабых коннекторов. Пары и лучшие связанные руки вроде 76s ещё защищаются."
    })
  });

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

  function fmtSigned(value, digits) {
    var number = Number(value) || 0;
    return (number > 0 ? "+" : "") + fmt(number, digits);
  }

  function fmtCount(value) {
    return Math.round(Number(value) || 0).toLocaleString("ru-RU");
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function actionLabel(cell) {
    if (cell.raisePct && cell.callPct) return "микс 3-бет / колл";
    if (cell.callPct && cell.foldPct) return "микс колл / пас";
    if (cell.raisePct) return "3-бет";
    if (cell.callPct) return "колл";
    return "пас";
  }

  function actionDetail(cell) {
    return [
      cell.raisePct ? "3-бет " + String(cell.raisePct) + "%" : "",
      cell.callPct ? "колл " + String(cell.callPct) + "%" : "",
      cell.foldPct ? "пас " + String(cell.foldPct) + "%" : ""
    ].filter(Boolean).join(" · ");
  }

  function ensureEquityData() {
    if (state.equityData) return Promise.resolve(state.equityData);
    if (state.equityLoading) return state.equityLoading;
    var root = Content.equityModel.dataRoot;
    state.equityLoading = Promise.all(Content.equityModel.files.map(function (file) {
      return fetch(root + file + "?v=" + Content.equityModel.version).then(function (response) {
        if (!response.ok) throw new Error(file + ": HTTP " + String(response.status));
        return response.json();
      });
    })).then(function (loaded) {
      var equity = loaded[0];
      var ranks = loaded[1];
      state.equityData = {
        equity: equity,
        handIndex: new Map(equity.hands.map(function (hand, index) { return [hand, index]; })),
        ranking: ranks.hands.map(function (hand, index) {
          return { hand: hand, score: ranks.equity_vs_random[index] };
        }).sort(function (left, right) {
          return right.score - left.score;
        }).map(function (item) { return item.hand; })
      };
      state.equityLoading = null;
      state.equityError = "";
      renderRealization();
      return state.equityData;
    }).catch(function (error) {
      state.equityLoading = null;
      state.equityError = error && error.message ? error.message : "Данные эквити не загрузились";
      renderRealization();
      throw error;
    });
    return state.equityLoading;
  }

  function ensureFfRealizationData() {
    if (state.ffRealizationData) return Promise.resolve(state.ffRealizationData);
    if (state.ffRealizationLoading) return state.ffRealizationLoading;
    var config = Content.ffRealizationModel;
    state.ffRealizationLoading = fetch(config.file + "?v=" + config.version).then(function (response) {
      if (!response.ok) throw new Error("FF realization: HTTP " + String(response.status));
      return response.json();
    }).then(function (payload) {
      if (!payload || !payload.rows || !payload.meta) throw new Error("FF realization: invalid payload");
      state.ffRealizationData = payload;
      state.ffRealizationLoading = null;
      state.ffRealizationError = "";
      renderRealization();
      return payload;
    }).catch(function (error) {
      state.ffRealizationLoading = null;
      state.ffRealizationError = error && error.message ? error.message : "Срез FF не загрузился";
      renderRealization();
      throw error;
    });
    return state.ffRealizationLoading;
  }

  function readProgress() {
    try { return JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || "null") || {}; } catch (error) { return {}; }
  }

  function saveProgress() {
    try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({ step: state.step, unlocked: state.unlocked })); } catch (error) {}
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
    if (!state.unlocked && next !== "idea") return;
    if (next !== "practice" && document.body.classList.contains("practice-is-running")) stopPractice(false);
    if (next !== "memory" && state.memoryPhase === "watching") cancelMemoryWatch();
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
    if (next === "memory") renderMemory();
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
    if (!window.FFTrainerSimulator || !window.FFTrainerSimulator.renderDecision) {
      host.innerHTML = '<p class="table-load-error">Стол не загрузился: проверь simulator snapshot.</p>';
      return;
    }
    window.FFTrainerSimulator.renderDecision(host, spot, {
      answered: Boolean(selectedKey),
      selectedKey: selectedKey || "",
      finished: false
    }, {
      positionLabels: { UTG: "EP" },
      decimalComma: true,
      hideActionStatus: Boolean(config.hideActionStatus),
      nextLabel: config.nextLabel || ""
    });
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
      $$('[data-leak-cards]').forEach(function (hand) {
        var host = hand.querySelector(".leak-hand-cards");
        if (!host) return;
        host.innerHTML = hand.dataset.leakCards.split(",").map(function (card) {
          return deckKit.renderCard(card, { theme: "color-block", mini: true, fourColor: true, className: "leak-color-card" });
        }).join("");
      });
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
    renderRoomTable($("#firstTable"), Content.firstSpot, state.firstChoice, { hideActionStatus: true });
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
        '<div class="reason-line"><i></i><div><b>K4o — это колл</b><small>Именно такие руки часто пасуют на автопилоте.</small></div></div>' +
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
    state.unlocked = true;
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
      slide.toggleAttribute("inert", !active);
    });
    if (!activeSlide.classList.contains("bb-size-slide")) hideSizeDefensePreview();
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
      button.className = "wisdom-story-dot";
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

  function hideSizeDefensePreview() {
    var root = $("#sizeDefensePreview");
    var defaultCopy = $("#sizeDefenseDefaultCopy");
    if (!root || !defaultCopy) return;
    root.hidden = true;
    root.removeAttribute("data-size-key");
    defaultCopy.hidden = false;
    $$('[data-size-preview]').forEach(function (button) {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function comboWeightedDefensePct(sizeKey) {
    var defendedCombos = 0;
    var totalCombos = 0;
    for (var row = 0; row < 13; row += 1) {
      for (var column = 0; column < 13; column += 1) {
        var hand = Content.matrixHandAt(row, column);
        var cell = Content.rangeCellFor(sizeKey, "BTN", hand);
        var combos = row === column ? 6 : row < column ? 4 : 12;
        defendedCombos += combos * (cell.raisePct + cell.callPct) / 100;
        totalCombos += combos;
      }
    }
    return totalCombos ? defendedCombos / totalCombos * 100 : 0;
  }

  function renderSizeDefensePreview(sizeKey) {
    var copy = SIZE_DEFENSE_PREVIEW_COPY[sizeKey];
    var root = $("#sizeDefensePreview");
    var defaultCopy = $("#sizeDefenseDefaultCopy");
    var size = Content.sizes[sizeKey];
    var scenario = Content.rangeScenarios[sizeKey] && Content.rangeScenarios[sizeKey].BTN;
    if (!copy || !root || !defaultCopy || !size || !scenario) return;

    var defendPct = 100 - scenario.foldPct;
    var matrixDefendPct = comboWeightedDefensePct(sizeKey);
    var toCall = fmt(size.toCall, 1).replace(",0", "");
    var finalPot = fmt(size.finalPot, 1).replace(",0", "");
    root.innerHTML = '<div class="size-preview-head"><div><p class="eyebrow">Исходная матрица · BTN</p><h3>' + copy.title + '</h3></div><strong>' + String(defendPct) + '%</strong></div>' +
      '<div class="size-preview-matrix" aria-hidden="true"></div>' +
      '<div class="size-preview-copy">' +
        '<div class="size-preview-legend" aria-label="Розовый — 3-бет, зелёный — колл, белый — пас"><span><i class="is-raise"></i>3-бет</span><span><i class="is-call"></i>Колл</span><span><i class="is-fold"></i>Пас</span></div>' +
        '<p class="size-preview-equation">' + toCall + ' ÷ ' + finalPot + ' = ' + fmt(size.potOddsPct, 1) + '%</p>' +
        '<p><strong>' + String(defendPct) + '% = 100% − ' + String(scenario.foldPct) + '% паса</strong> в сводке исходной матрицы.</p>' +
        '<p>' + copy.boundary + '</p>' +
        '<small>Сводка методички: ' + String(defendPct) + '%. Комбинационно-взвешенная транскрипция 169 клеток: ≈' + fmt(matrixDefendPct, 1) + '%. Цена колла объясняет сужение, а не сама задаёт точную границу.</small>' +
      '</div>';

    var matrix = root.querySelector(".size-preview-matrix");
    var fragment = document.createDocumentFragment();
    for (var row = 0; row < 13; row += 1) {
      for (var column = 0; column < 13; column += 1) {
        var hand = Content.matrixHandAt(row, column);
        var cell = Content.rangeCellFor(sizeKey, "BTN", hand);
        var block = document.createElement("i");
        block.className = "size-preview-cell";
        block.style.setProperty("--raise-end", String(cell.raisePct) + "%");
        block.style.setProperty("--call-end", String(cell.raisePct + cell.callPct) + "%");
        fragment.appendChild(block);
      }
    }
    matrix.appendChild(fragment);
    root.dataset.sizeKey = sizeKey;
    root.setAttribute("aria-label", "Разбор дефенда BB против BTN " + size.label + ": " + String(defendPct) + " процентов");
    root.hidden = false;
    defaultCopy.hidden = true;
    $$('[data-size-preview]').forEach(function (button) {
      button.setAttribute("aria-expanded", button.dataset.sizePreview === sizeKey ? "true" : "false");
    });
  }

  function setupSizeDefensePreviews() {
    var ladder = $(".bb-size-slide .size-ladder");
    var triggers = $$('[data-size-preview]');
    if (!ladder || !triggers.length) return;
    function restoreFocusedPreview() {
      var active = document.activeElement;
      var focusedTrigger = active && active.closest ? active.closest("[data-size-preview]") : null;
      if (focusedTrigger && ladder.contains(focusedTrigger)) {
        renderSizeDefensePreview(focusedTrigger.dataset.sizePreview);
        return;
      }
      hideSizeDefensePreview();
    }
    triggers.forEach(function (button) {
      button.addEventListener("pointerenter", function () {
        renderSizeDefensePreview(button.dataset.sizePreview);
      });
      button.addEventListener("focus", function () {
        renderSizeDefensePreview(button.dataset.sizePreview);
      });
      button.addEventListener("pointerleave", restoreFocusedPreview);
      button.addEventListener("click", function () {
        renderSizeDefensePreview(button.dataset.sizePreview);
      });
      button.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        hideSizeDefensePreview();
      });
    });
    ladder.addEventListener("pointerleave", restoreFocusedPreview);
    ladder.addEventListener("focusout", function () {
      requestAnimationFrame(function () {
        if (!ladder.contains(document.activeElement) && !ladder.matches(":hover")) hideSizeDefensePreview();
      });
    });
  }

  function makeSegmented(root, items, selected, onSelect, options) {
    var config = options || {};
    root.innerHTML = "";
    var controlsByRoot = {
      oddsSizeTabs: "oddsSummary",
      rangeSizeTabs: "rangeChart",
      positionTabs: "rangeChart",
      memorySizeTabs: "memoryChart",
      memoryPositionTabs: "memoryChart"
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
      button.disabled = Boolean(config.disabled);
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

  function renderRangeMatrix() {
    var root = $("#rangeChart");
    var fragment = document.createDocumentFragment();
    root.innerHTML = "";
    for (var row = 0; row < 13; row += 1) {
      for (var column = 0; column < 13; column += 1) {
        var hand = Content.matrixHandAt(row, column);
        var cell = Content.rangeCellFor(state.sizeKey, state.position, hand);
        var button = document.createElement("button");
        var shape = row === column ? "pair" : row < column ? "suited" : "offsuit";
        button.type = "button";
        button.className = "bb-range-cell is-" + shape;
        button.dataset.hand = hand;
        button.dataset.row = String(row);
        button.dataset.column = String(column);
        button.setAttribute("role", "gridcell");
        button.setAttribute("aria-selected", hand === state.selectedHand ? "true" : "false");
        button.setAttribute("aria-label", hand + ": " + actionDetail(cell));
        button.tabIndex = hand === state.selectedHand ? 0 : -1;
        button.style.setProperty("--raise-end", String(cell.raisePct) + "%");
        button.style.setProperty("--call-end", String(cell.raisePct + cell.callPct) + "%");
        button.innerHTML = "<span>" + hand + "</span><small>" + String(cell.raisePct + cell.callPct) + "%</small>";
        fragment.appendChild(button);
      }
    }
    root.appendChild(fragment);
  }

  function selectRangeHand(hand, shouldFocus) {
    state.selectedHand = hand;
    $$("#rangeChart .bb-range-cell").forEach(function (button) {
      var selected = button.dataset.hand === hand;
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    });
    renderRealization();
    if (shouldFocus) {
      var selectedButton = $('#rangeChart .bb-range-cell[data-hand="' + hand + '"]');
      if (selectedButton) selectedButton.focus({ preventScroll: true });
    }
  }

  function handleRangeMatrixKeydown(event) {
    var current = event.target.closest(".bb-range-cell");
    if (!current) return;
    var row = Number(current.dataset.row);
    var column = Number(current.dataset.column);
    if (event.key === "ArrowLeft") column -= 1;
    else if (event.key === "ArrowRight") column += 1;
    else if (event.key === "ArrowUp") row -= 1;
    else if (event.key === "ArrowDown") row += 1;
    else if (event.key === "Home") column = 0;
    else if (event.key === "End") column = 12;
    else return;
    event.preventDefault();
    row = Math.max(0, Math.min(12, row));
    column = Math.max(0, Math.min(12, column));
    selectRangeHand(Content.matrixHandAt(row, column), true);
  }

  function renderRange() {
    var size = Content.sizes[state.sizeKey];
    var position = Content.positions[state.position];
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
    $("#rangeChart").setAttribute("aria-label", "Защита BB против " + position.label + ", опен " + size.label);
    renderRangeMatrix();
  }

  function ffRealizationKey() {
    return state.sizeKey + ":" + state.position + ":" + state.selectedHand;
  }

  function renderFfBandSummary(record, rawEquityPct) {
    var labels = { "25_30": "25–30", "30_35": "30–35", "35_40": "35–40" };
    var items = Object.keys(labels).map(function (key) {
      var band = record.bands && record.bands[key];
      if (!band || !band.n || !rawEquityPct) return "";
      var ratio = band.meanRealizedEquityPct / rawEquityPct * 100;
      return "<span><b>" + labels[key] + " BB</b> " + fmt(ratio, 1) + "% <small>n=" + fmtCount(band.n) + "</small></span>";
    }).filter(Boolean);
    if (!items.length) return "";
    return '<div class="ff-realization-bands"><small>По стеку</small>' + items.join("") + "</div>";
  }

  function renderFfRealization(model, position, size) {
    var config = Content.ffRealizationModel;
    if (!state.ffRealizationData) {
      return '<section class="ff-realization-card is-pending"><div><span class="ff-realization-kicker">База рук FF · 25–40 BB</span><strong>' +
        (state.ffRealizationError ? "Срез недоступен" : "Загружаем фактические коллы…") +
        '</strong></div><p>Теоретическая математика выше работает независимо от этого среза.</p></section>';
    }

    var payload = state.ffRealizationData;
    var record = payload.rows[ffRealizationKey()];
    var minDisplay = Number(payload.meta.minDisplayN || config.minDisplayN);
    var minReliable = Number(payload.meta.minReliableN || config.minReliableN);
    var scope = position.label + " · " + size.label + " · все столы FF 3–9 max";

    if (!record || record.n < minDisplay) {
      var observed = record ? fmtCount(record.n) : "0";
      var exactObserved = record && record.exact7 ? fmtCount(record.exact7.n) : "0";
      return '<section class="ff-realization-card is-low-sample"><div class="ff-realization-head"><div><span class="ff-realization-kicker">База рук FF · 25–40 BB</span><strong>Пока мало данных</strong></div><b>n=' + observed + '</b></div>' +
        '<p>Для ' + state.selectedHand + " · " + scope + " нужно минимум " + fmtCount(minDisplay) + ' фактических коллов. Процент не показываем, чтобы не выдавать шум за закономерность.</p>' +
        '<small>Точный 7-max хранится отдельно: n=' + exactObserved + "; в основной срез он не подмешан.</small></section>";
    }

    var eqrPct = model.rawEquityPct > 0 ? record.meanRealizedEquityPct / model.rawEquityPct * 100 : 0;
    var foldBaselineBb = -(1 + Number(record.meanHeroAnteBb || 0));
    var reliable = record.n >= minReliable;
    var exact7 = record.exact7;
    var exact7Copy = exact7
      ? "Точный 7-max отдельно: n=" + fmtCount(exact7.n) + (exact7.n < minDisplay ? " — мало для отдельного вывода." : ".")
      : "Для точного 7-max в этом споте данных нет.";

    return '<section class="ff-realization-card ' + (reliable ? "is-reliable" : "is-preliminary") + '">' +
      '<div class="ff-realization-head"><div><span class="ff-realization-kicker">Реально в базе FF · 25–40 BB</span><strong>' +
        (reliable ? "Достаточный срез" : "Предварительный срез") +
        '</strong></div><b>' + fmt(eqrPct, 1) + "%</b></div>" +
      '<p class="ff-realization-lead">Игроки реализовали примерно <strong>' + fmt(eqrPct, 1) + "%</strong> модельного эквити " + state.selectedHand + ". Это соответствует " + fmt(record.meanRealizedEquityPct, 1) + '% эквивалентной доли банка.</p>' +
      '<div class="ff-realization-meter" aria-label="Реализация эквити в базе FF ' + fmt(eqrPct, 1) + '%"><i style="width:' + String(clampPercent(eqrPct)) + '%"></i></div>' +
      '<div class="ff-realization-stats"><span><small>К пасу</small><b>' + fmtSigned(record.meanEvVsFoldBb, 2) + ' BB</b></span><span><small>Коллов</small><b>' + fmtCount(record.n) + '</b></span><span><small>Игроков</small><b>' + fmtCount(record.players) + '</b></span></div>' +
      renderFfBandSummary(record, model.rawEquityPct) +
      '<details class="ff-realization-method"><summary>Как считаем относительно паса?</summary><p>Полный all-in-adjusted результат колла — ' + fmtSigned(record.meanNetEvBb, 2) + " BB. Пас на BB в том же срезе равен " + fmt(foldBaselineBb, 2) + " BB: уже потеряны блайнд и собственное анте. Поэтому колл дал " + fmtSigned(record.meanEvVsFoldBb, 2) + ' BB относительно паса. Затем этот результат переводится в долю банка и делится на модельное префлоп-эквити.</p><small>' + exact7Copy + " Срез описывает сыгранные коллы, а не доказывает причинный эффект для каждого игрока.</small></details>" +
      '<p class="ff-realization-scope">' + scope + ' · 01.01–13.07.2026</p></section>';
  }

  function renderRealization() {
    var cell = Content.rangeCellFor(state.sizeKey, state.position, state.selectedHand);
    var size = Content.sizes[state.sizeKey];
    var position = Content.positions[state.position];
    var sourceExample = Engine.equityRealization(Content.equityRealization.rawEquityPct, Content.equityRealization.realizedEquityPct);
    if (!state.equityData) {
      $("#realizationRatio").textContent = state.equityError ? "—" : "…";
      $("#realizationDetail").innerHTML = '<div class="realization-copy"><h4>' + state.selectedHand + ' · ' + actionLabel(cell) + '</h4><p>' +
        (state.equityError ? "Модель эквити не загрузилась. Действие клетки выше остаётся доступным." : "Загружаем модельное эквити для выбранной руки…") +
        '</p></div><p class="realization-boundary">Фактической реализации по каждой из 169 рук в исходнике нет; общий пример методички — ' + fmt(sourceExample.realizationPct, 1) + '%.</p>';
      return;
    }
    var equityFor = function (hero, villain) {
      var heroIndex = state.equityData.handIndex.get(hero);
      var villainIndex = state.equityData.handIndex.get(villain);
      return heroIndex == null || villainIndex == null ? 0.5 : state.equityData.equity.equity[heroIndex][villainIndex];
    };
    var model = Engine.equityAgainstRange(state.selectedHand, position.openerPct, state.equityData.ranking, equityFor);
    var minimum = Engine.minimumRealizationPct(size.potOddsPct, model.rawEquityPct);
    var callContext = cell.callPct
      ? "Расчёт относится к колл-части этой клетки."
      : "В чарте здесь " + actionLabel(cell) + "; числа ниже показывают только математику гипотетического колла, а не меняют решение.";
    $("#realizationRatio").textContent = fmt(minimum, 1) + "%";
    $("#realizationDetail").innerHTML = '<div class="realization-copy">' +
        '<div class="realization-handline"><strong>' + state.selectedHand + '</strong><span>Методичка: ' + actionDetail(cell) + '</span></div>' +
        '<h4>Нужно реализовать минимум ' + fmt(minimum, 1) + '% сырого эквити</h4>' +
        '<p>Шоудаун-эквити ' + state.selectedHand + ' против модельного top-' + String(position.openerPct) + '% диапазона — ' + fmt(model.rawEquityPct, 1) + '%. Цена ' + fmt(size.potOddsPct, 1) + '% составляет ' + fmt(minimum, 1) + '% этого запаса. ' + callContext + '</p>' +
        '<p class="realization-boundary">Фактической реализации по отдельным рукам в PDF нет. ' + fmt(sourceExample.realizationPct, 1) + '% — только общий пример диапазона 38,5 → 27,8%, не значение для ' + state.selectedHand + '.</p>' +
      '</div>' +
      '<div class="realization-metric-stack"><div class="realization-bars deep-realization-bars">' +
        '<div><span>Шоудаун-эквити</span><i><b style="width:' + String(clampPercent(model.rawEquityPct)) + '%"></b></i><strong>' + fmt(model.rawEquityPct, 1) + '%</strong></div>' +
        '<div class="is-price"><span>Цена колла</span><i><b style="width:' + String(clampPercent(size.potOddsPct)) + '%"></b></i><strong>' + fmt(size.potOddsPct, 1) + '%</strong></div>' +
        '<div class="is-required"><span>Нужно реализовать</span><i><b style="width:' + String(clampPercent(minimum)) + '%"></b></i><strong>' + fmt(minimum, 1) + '%</strong></div>' +
      '</div>' + renderFfRealization(model, position, size) + '</div>';
  }

  function renderDeep() {
    renderOdds();
    renderRange();
    renderRealization();
    if (state.step === "deep" && !state.equityData && !state.equityLoading) ensureEquityData().catch(function () {});
    if (state.step === "deep" && !state.ffRealizationData && !state.ffRealizationLoading) ensureFfRealizationData().catch(function () {});
  }

  var MEMORY_SPLITS = {
    R: { raise: 100, call: 100 },
    C: { raise: 0, call: 100 },
    F: { raise: 0, call: 0 },
    B: { raise: 50, call: 100 },
    M: { raise: 0, call: 50 }
  };

  function memoryScenarioLabel() {
    return Content.positions[state.memoryPosition].label + " · " + Content.sizes[state.memorySizeKey].label;
  }

  function memoryExpectedMap() {
    var expected = {};
    for (var row = 0; row < 13; row += 1) {
      for (var column = 0; column < 13; column += 1) {
        var hand = Content.matrixHandAt(row, column);
        expected[hand] = Content.rangeCellFor(state.memorySizeKey, state.memoryPosition, hand).code;
      }
    }
    return expected;
  }

  function memoryCounts() {
    var counts = { R: 0, C: 0, B: 0, M: 0, F: 169 };
    Object.keys(state.memoryDraft).forEach(function (hand) {
      var code = Recall.normalizeState(state.memoryDraft[hand]);
      if (code === "F") return;
      counts[code] += 1;
      counts.F -= 1;
    });
    return counts;
  }

  function memoryErrorTypeLabel(type) {
    return {
      missed: "пропущен дефенд",
      extra: "лишний дефенд",
      action: "перепутано действие"
    }[type] || "ошибка";
  }

  function setMemoryCellCode(cell, code) {
    var normalized = Recall.normalizeState(code);
    var split = MEMORY_SPLITS[normalized];
    cell.dataset.code = normalized;
    cell.style.setProperty("--raise-end", String(split.raise) + "%");
    cell.style.setProperty("--call-end", String(split.call) + "%");
  }

  function resetMemoryState() {
    stopMemoryTimer();
    state.memoryPhase = "preview";
    state.memoryDraft = {};
    state.memoryGrade = null;
    state.memorySeconds = 10;
    state.memoryPainting = false;
    state.memoryPaintCode = null;
    state.memoryLastCell = null;
    state.memoryFocusHand = "AA";
  }

  function stopMemoryTimer() {
    if (state.memoryTimer) window.clearInterval(state.memoryTimer);
    state.memoryTimer = null;
  }

  function cancelMemoryWatch() {
    stopMemoryTimer();
    state.memoryPhase = "preview";
    state.memoryDraft = {};
    state.memoryGrade = null;
    state.memorySeconds = 10;
  }

  function renderMemoryControls() {
    var locked = state.memoryPhase === "watching" || state.memoryPhase === "drawing";
    makeSegmented($("#memorySizeTabs"), sizeItems(), state.memorySizeKey, function (key) {
      state.memorySizeKey = key;
      resetMemoryState();
      renderMemory();
    }, { disabled: locked });
    makeSegmented($("#memoryPositionTabs"), positionItems(), state.memoryPosition, function (key) {
      state.memoryPosition = key;
      resetMemoryState();
      renderMemory();
    }, { disabled: locked });
  }

  function renderMemoryLegend() {
    var root = $("#memoryLegend");
    if (state.memoryPhase === "review") {
      root.innerHTML = '<span class="is-review-correct"><i></i>Точное совпадение</span>' +
        '<span class="is-review-missed"><i></i>Пропущен дефенд</span>' +
        '<span class="is-review-extra"><i></i>Лишний дефенд</span>' +
        '<span class="is-review-action"><i></i>Перепутано действие</span>' +
        '<small>После проверки заливка показывает правильное действие из источника.</small>';
      return;
    }
    if (state.memoryPhase === "drawing") {
      root.innerHTML = '<span><i class="is-shape-pair"></i>Пары</span>' +
        '<span><i class="is-shape-suited"></i>Suited</span>' +
        '<span><i class="is-shape-offsuit"></i>Offsuit</span>' +
        '<small>Нейтральная заливка показывает тип руки; выбранное действие перекрашивает клетку.</small>';
      return;
    }
    root.innerHTML = '<span><i class="is-code-r"></i>3-бет</span>' +
      '<span><i class="is-code-c"></i>Колл</span>' +
      '<span><i class="is-code-f"></i>Пас</span>' +
      '<span><i class="is-code-b"></i>3-бет / колл</span>' +
      '<span><i class="is-code-m"></i>Колл / пас</span>';
  }

  function renderMemoryMatrix() {
    var root = $("#memoryChart");
    var drawing = state.memoryPhase === "drawing";
    var review = state.memoryPhase === "review";
    var expected = memoryExpectedMap();
    var fragment = document.createDocumentFragment();
    root.innerHTML = "";
    root.classList.toggle("is-drawing", drawing);
    root.classList.toggle("is-review", review);
    root.setAttribute("aria-label", "Проверка памяти: " + memoryScenarioLabel());

    for (var row = 0; row < 13; row += 1) {
      for (var column = 0; column < 13; column += 1) {
        var hand = Content.matrixHandAt(row, column);
        var expectedCode = expected[hand];
        var chosenCode = Recall.normalizeState(state.memoryDraft[hand]);
        var shownCode = drawing ? chosenCode : expectedCode;
        var cell = document.createElement(drawing ? "button" : "div");
        var shape = row === column ? "pair" : row < column ? "suited" : "offsuit";
        cell.className = "bb-range-cell memory-range-cell is-" + shape;
        cell.dataset.hand = hand;
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        cell.setAttribute("role", "gridcell");
        setMemoryCellCode(cell, shownCode);
        cell.innerHTML = "<span>" + hand + "</span>";

        if (drawing) {
          cell.type = "button";
          cell.tabIndex = hand === state.memoryFocusHand ? 0 : -1;
          cell.setAttribute("aria-pressed", chosenCode === "F" ? "false" : "true");
          cell.setAttribute("aria-label", hand + ": отмечено " + Recall.stateLabel(chosenCode));
          cell.title = hand + " · отмечено: " + Recall.stateLabel(chosenCode);
        } else if (review) {
          var result = Recall.reviewState(chosenCode, expectedCode);
          var errorType = Recall.errorType(chosenCode, expectedCode);
          cell.classList.add("is-review-" + result);
          if (errorType) cell.classList.add("is-review-error-" + errorType);
          var errorPrefix = errorType ? memoryErrorTypeLabel(errorType) + "; " : "";
          cell.setAttribute("aria-label", hand + ": " + errorPrefix + "твой ответ " + Recall.stateLabel(chosenCode) + "; правильно " + Recall.stateLabel(expectedCode));
          cell.title = hand + " · " + errorPrefix + "твой ответ: " + Recall.stateLabel(chosenCode) + " · правильно: " + Recall.stateLabel(expectedCode);
        } else {
          cell.setAttribute("aria-label", hand + ": " + Recall.stateLabel(expectedCode));
          cell.title = hand + " · " + Recall.stateLabel(expectedCode);
        }
        fragment.appendChild(cell);
      }
    }
    root.appendChild(fragment);

    var phaseLabels = {
      preview: "Можно запоминать",
      watching: "Смотри · " + String(state.memorySeconds) + " сек",
      drawing: "Рисуем по памяти",
      review: "Результат проверки"
    };
    $("#memoryPhaseLabel").textContent = phaseLabels[state.memoryPhase];
    $("#memoryHint").textContent = state.memoryPhase === "drawing"
      ? "Выбери кисть. Нажми или проведи по клеткам; повторный клик тем же действием возвращает пас."
      : state.memoryPhase === "review"
        ? "Зелёная рамка — совпадение; розовая — пропущен дефенд; жёлтая — лишний дефенд; фиолетовая — перепутано действие. Заливка показывает правильный источник."
        : "До старта чарт открыт. После таймера выбери кисть и нарисуй его по памяти.";
  }

  function memoryToolMarkup(code, label) {
    return '<button type="button" data-memory-tool="' + code + '" aria-pressed="' + String(state.memoryTool === code) + '" class="' + (state.memoryTool === code ? "is-active" : "") + '">' +
      '<i class="memory-tool-swatch is-code-' + code.toLowerCase() + '"></i><span>' + label + '</span></button>';
  }

  function memoryCardsForHand(hand) {
    var firstRank = hand.charAt(0);
    var secondRank = hand.charAt(1);
    if (hand.endsWith("s")) return [firstRank + "h", secondRank + "h"];
    return [firstRank + "h", secondRank + "c"];
  }

  function renderMemoryErrorCards(hand) {
    var deckKit = window.PokerDeckKit;
    if (!deckKit || !deckKit.renderCard) return '<span class="memory-error-hand-fallback">' + hand + '</span>';
    return memoryCardsForHand(hand).map(function (card) {
      return deckKit.renderCard(card, { theme: "color-block", mini: true, fourColor: true, className: "memory-error-card" });
    }).join("");
  }

  function memoryActionShortLabel(code) {
    var normalized = Recall.normalizeState(code);
    return Recall.meta[normalized] ? Recall.meta[normalized].shortLabel : Recall.stateLabel(normalized);
  }

  function memoryErrorComboCount(error, tone) {
    if (tone === "missed") return error.missedDefenseCombos;
    if (tone === "extra") return error.extraDefenseCombos;
    return error.wrongActionCombos;
  }

  function renderMemoryErrorItem(error, tone) {
    var wrongCombos = memoryErrorComboCount(error, tone);
    var severity = wrongCombos < error.comboCount
      ? fmtCount(wrongCombos) + " из " + fmtCount(error.comboCount) + " комбо"
      : fmtCount(wrongCombos) + " комбо";
    return '<li class="memory-error-item">' +
      '<span class="memory-error-cards" aria-hidden="true">' + renderMemoryErrorCards(error.hand) + '</span>' +
      '<span class="memory-error-copy"><span class="memory-error-copy-head"><strong>' + error.hand + '</strong><small>' + severity + '</small></span><span><b>' + memoryActionShortLabel(error.chosen) + '</b><i aria-hidden="true">→</i><em>' + memoryActionShortLabel(error.expected) + '</em></span></span>' +
    '</li>';
  }

  function renderMemoryErrorGroup(title, description, errors, tone) {
    if (!errors.length) return "";
    var comboCount = errors.reduce(function (total, error) {
      return total + memoryErrorComboCount(error, tone);
    }, 0);
    return '<section class="memory-error-group is-' + tone + '">' +
      '<header><span><strong>' + title + '</strong><small>' + description + '</small></span><b aria-label="' + fmtCount(comboCount) + ' ошибочных комбинаций"><span>' + fmtCount(comboCount) + '</span><small>комбо</small></b></header>' +
      '<ul class="memory-error-list">' + errors.map(function (error) { return renderMemoryErrorItem(error, tone); }).join("") + '</ul>' +
    '</section>';
  }

  function renderMemoryCoach() {
    var root = $("#memoryCoachBody");
    var scenario = memoryScenarioLabel();
    if (state.memoryPhase === "preview") {
      root.innerHTML = '<p class="eyebrow">Проверка памяти</p>' +
        '<h3 id="memoryCoachTitle">Посмотри 10 секунд — нарисуй чарт сам</h3>' +
        '<p>Выбери диапазон сверху, запомни границы колла, 3-бета и оба микса. Затем восстанови все 169 клеток.</p>' +
        '<div class="memory-example" aria-hidden="true"><span class="is-fold">Пас</span><span class="is-call">Колл</span><span class="is-raise">3-бет</span></div>' +
        '<button class="btn primary memory-start" type="button" data-memory-action="start">Запомнить ' + scenario + ' за 10 секунд</button>' +
        '<small class="memory-source-note">Проверяем точный код каждой клетки, включая микс 3-бет / колл и микс колл / пас.</small>';
      return;
    }
    if (state.memoryPhase === "watching") {
      root.innerHTML = '<p class="eyebrow">Запоминай границу</p>' +
        '<h3 id="memoryCoachTitle">Смотри ' + scenario + ': ' + String(state.memorySeconds) + '</h3>' +
        '<p>Сначала найди розовую область 3-бета, затем зелёный колл и белую границу паса. Обрати внимание на split-клетки.</p>' +
        '<div class="memory-countdown" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="' + String(state.memorySeconds) + '"><i style="--remaining:' + String(state.memorySeconds * 10) + '%"></i></div>' +
        '<small class="memory-source-note">После нуля чарт станет пустым автоматически.</small>';
      return;
    }
    if (state.memoryPhase === "drawing") {
      var counts = memoryCounts();
      root.innerHTML = '<p class="eyebrow">Рисуем ' + scenario + '</p>' +
        '<h3 id="memoryCoachTitle">Восстанови все действия</h3>' +
        '<p>Кисть работает кликом и непрерывным проведением. Пас одновременно служит ластиком.</p>' +
        '<div class="memory-tools" role="toolbar" aria-label="Кисти для диапазона">' +
          memoryToolMarkup("C", "Колл") + memoryToolMarkup("R", "3-бет") + memoryToolMarkup("B", "3-бет / колл") + memoryToolMarkup("M", "Колл / пас") + memoryToolMarkup("F", "Стереть / пас") +
        '</div>' +
        '<p class="memory-status">3-бет: ' + String(counts.R) + ' · Колл: ' + String(counts.C) + ' · Миксы: ' + String(counts.B + counts.M) + ' · Пас: ' + String(counts.F) + '</p>' +
        '<div class="memory-actions"><button class="btn primary" type="button" data-memory-action="check">Проверить чарт</button><button class="btn secondary" type="button" data-memory-action="clear">Очистить</button></div>';
      return;
    }

    var grade = state.memoryGrade;
    var clean = grade && grade.wrongCombos === 0;
    var accuracy = grade.totalCombos ? grade.correctCombos / grade.totalCombos * 100 : 0;
    var accuracyLabel = fmt(accuracy, 1).replace(",0", "") + "%";
    var errorGroups = clean ? "" :
      '<div class="memory-error-groups" aria-label="Ошибки по категориям">' +
        renderMemoryErrorGroup("Пропущен дефенд", "Выбран пас, но руку нужно защищать", grade.missedDefense, "missed") +
        renderMemoryErrorGroup("Лишний дефенд", "Рука должна была уйти в пас", grade.extraDefense, "extra") +
        renderMemoryErrorGroup("Перепутано действие", "Дефенд верный, но действие другое", grade.wrongAction, "action") +
      '</div>';
    root.innerHTML = '<p class="eyebrow">Результат · ' + scenario + '</p>' +
      '<h3 id="memoryCoachTitle" tabindex="-1">' + (clean ? "Чарт восстановлен точно" : "Чарт пока не совпал") + '</h3>' +
      '<div class="memory-score-card ' + (clean ? "is-clean" : "has-errors") + '">' +
        '<div class="memory-score-head"><span><small>Точность по комбинациям</small><strong>' + accuracyLabel + '</strong></span><b>' + fmtCount(grade.correctCombos) + ' из ' + fmtCount(grade.totalCombos) + ' комбинаций</b></div>' +
        '<div class="memory-score-track" role="progressbar" aria-label="Точность ' + accuracyLabel + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + String(Math.round(accuracy * 10) / 10) + '"><i style="width:' + String(clampPercent(accuracy)) + '%"></i></div>' +
        '<p>' + (clean ? "Все " + fmtCount(grade.totalCombos) + " стартовых комбинаций распределены верно." : "Пары весят 6 комбо, suited — 4, offsuit — 12. Для микса в ошибку попадает только неверная половина.") + '</p>' +
      '</div>' +
      errorGroups +
      '<div class="memory-actions"><button class="btn primary" type="button" data-memory-action="again">Нарисовать ещё раз</button><button class="btn secondary" type="button" data-memory-action="finish">Выбрать другой чарт</button></div>';
  }

  function renderMemory() {
    renderMemoryControls();
    $("#memoryScenarioTitle").textContent = memoryScenarioLabel();
    renderMemoryLegend();
    renderMemoryMatrix();
    renderMemoryCoach();
  }

  function focusMemoryFirstCell() {
    requestAnimationFrame(function () {
      var first = $('#memoryChart .memory-range-cell[data-hand="' + state.memoryFocusHand + '"]');
      if (first) first.focus({ preventScroll: true });
    });
  }

  function startMemoryWatch() {
    resetMemoryState();
    state.memoryTool = "C";
    state.memoryPhase = "watching";
    state.memorySeconds = 10;
    renderMemory();
    state.memoryTimer = window.setInterval(function () {
      state.memorySeconds -= 1;
      if (state.memorySeconds <= 0) {
        stopMemoryTimer();
        state.memoryPhase = "drawing";
        state.memorySeconds = 0;
        state.memoryDraft = {};
        renderMemory();
        focusMemoryFirstCell();
        return;
      }
      renderMemoryCoach();
      $("#memoryPhaseLabel").textContent = "Смотри · " + String(state.memorySeconds) + " сек";
    }, 1000);
  }

  function updateMemoryStatus() {
    var status = $("#memoryCoach .memory-status");
    if (!status) return;
    var counts = memoryCounts();
    status.textContent = "3-бет: " + String(counts.R) + " · Колл: " + String(counts.C) + " · Миксы: " + String(counts.B + counts.M) + " · Пас: " + String(counts.F);
  }

  function syncMemoryTools() {
    $$("[data-memory-tool]").forEach(function (button) {
      var active = button.dataset.memoryTool === state.memoryTool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncMemoryCell(cell, code) {
    var normalized = Recall.normalizeState(code);
    setMemoryCellCode(cell, normalized);
    cell.setAttribute("aria-pressed", normalized === "F" ? "false" : "true");
    cell.setAttribute("aria-label", cell.dataset.hand + ": отмечено " + Recall.stateLabel(normalized));
    cell.title = cell.dataset.hand + " · отмечено: " + Recall.stateLabel(normalized);
  }

  function paintMemoryCell(cell, code) {
    if (state.memoryPhase !== "drawing" || !cell) return;
    var normalized = Recall.normalizeState(code || state.memoryPaintCode || state.memoryTool);
    var hand = cell.dataset.hand;
    if (normalized === "F") delete state.memoryDraft[hand];
    else state.memoryDraft[hand] = normalized;
    syncMemoryCell(cell, normalized);
    updateMemoryStatus();
  }

  function toggleMemoryCell(cell) {
    if (state.memoryPhase !== "drawing" || !cell) return;
    var current = Recall.normalizeState(state.memoryDraft[cell.dataset.hand]);
    var value = state.memoryTool === "F" || current === state.memoryTool ? "F" : state.memoryTool;
    paintMemoryCell(cell, value);
  }

  function paintMemoryToward(cell) {
    var from = state.memoryLastCell;
    if (!from) {
      paintMemoryCell(cell, state.memoryPaintCode);
      state.memoryLastCell = cell;
      return;
    }
    var row0 = Number(from.dataset.row);
    var column0 = Number(from.dataset.column);
    var row1 = Number(cell.dataset.row);
    var column1 = Number(cell.dataset.column);
    var deltaRow = Math.abs(row1 - row0);
    var deltaColumn = Math.abs(column1 - column0);
    var stepRow = row0 < row1 ? 1 : -1;
    var stepColumn = column0 < column1 ? 1 : -1;
    var error = deltaColumn - deltaRow;
    while (true) {
      paintMemoryCell($('#memoryChart [data-row="' + String(row0) + '"][data-column="' + String(column0) + '"]'), state.memoryPaintCode);
      if (row0 === row1 && column0 === column1) break;
      var doubled = 2 * error;
      if (doubled > -deltaRow) { error -= deltaRow; column0 += stepColumn; }
      if (doubled < deltaColumn) { error += deltaColumn; row0 += stepRow; }
    }
    state.memoryLastCell = cell;
  }

  function handleMemoryMatrixKeydown(event) {
    var cell = event.target.closest(".memory-range-cell");
    if (!cell || state.memoryPhase !== "drawing") return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleMemoryCell(cell);
      return;
    }
    var row = Number(cell.dataset.row);
    var column = Number(cell.dataset.column);
    if (event.key === "ArrowLeft") column -= 1;
    else if (event.key === "ArrowRight") column += 1;
    else if (event.key === "ArrowUp") row -= 1;
    else if (event.key === "ArrowDown") row += 1;
    else if (event.key === "Home") column = 0;
    else if (event.key === "End") column = 12;
    else return;
    event.preventDefault();
    row = Math.max(0, Math.min(12, row));
    column = Math.max(0, Math.min(12, column));
    state.memoryFocusHand = Content.matrixHandAt(row, column);
    $$("#memoryChart .memory-range-cell").forEach(function (button) {
      button.tabIndex = button.dataset.hand === state.memoryFocusHand ? 0 : -1;
    });
    focusMemoryFirstCell();
  }

  function checkMemory() {
    state.memoryGrade = Recall.gradeDraft(state.memoryDraft, memoryExpectedMap());
    state.memoryPhase = "review";
    state.memoryPainting = false;
    state.memoryPaintCode = null;
    state.memoryLastCell = null;
    renderMemory();
    requestAnimationFrame(function () {
      var heading = $("#memoryCoachTitle");
      if (heading) heading.focus({ preventScroll: true });
    });
  }

  function clearMemoryDraft() {
    state.memoryDraft = {};
    state.memoryFocusHand = "AA";
    renderMemoryMatrix();
    updateMemoryStatus();
    focusMemoryFirstCell();
  }

  function retryMemory() {
    state.memoryPhase = "drawing";
    state.memoryDraft = {};
    state.memoryTool = "C";
    state.memoryGrade = null;
    state.memoryFocusHand = "AA";
    renderMemory();
    focusMemoryFirstCell();
  }

  function finishMemory() {
    resetMemoryState();
    renderMemory();
    requestAnimationFrame(function () {
      var selected = $("#memoryPositionTabs [aria-selected='true']");
      if (selected) selected.focus({ preventScroll: true });
    });
  }

  function renderPracticeSetup() {
    $("#startPracticeSession").textContent = "Попробовать";
  }

  function startPractice() {
    state.practiceRun += 1;
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
    var spots = Content.practiceSpots;
    if (!spots.length) return null;
    var cycle = Math.floor(state.practiceIndex / spots.length);
    var withinCycle = state.practiceIndex % spots.length;
    var offset = (state.practiceRun + cycle * 3) % spots.length;
    return spots[(offset + withinCycle) % spots.length] || null;
  }

  function renderPracticeHud() {
    var played = state.practiceIndex + (state.practiceAnswered ? 1 : 0);
    $("#practiceHands").textContent = String(played);
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
    var tableOptions = { hideActionStatus: true };
    if (state.practiceAnswered) tableOptions.nextLabel = "Следующая раздача";
    renderRoomTable($("#practiceTable"), spot, state.practiceChoice, tableOptions);
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

  function stopPractice(focusStart) {
    document.body.classList.remove("practice-is-running");
    $("#practiceScreen").classList.remove("is-running");
    $("#practiceRun").hidden = true;
    $("#practiceSetup").hidden = false;
    renderPracticeSetup();
    if (focusStart) {
      requestAnimationFrame(function () {
        var start = $("#startPracticeSession");
        focusProgress(start);
      });
    }
  }

  function exitPractice() {
    stopPractice(true);
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
    $("#rangeChart").addEventListener("click", function (event) {
      var cell = event.target.closest(".bb-range-cell");
      if (cell) selectRangeHand(cell.dataset.hand, false);
    });
    $("#rangeChart").addEventListener("keydown", handleRangeMatrixKeydown);
    $("#memoryCoach").addEventListener("click", function (event) {
      var tool = event.target.closest("[data-memory-tool]");
      if (tool && state.memoryPhase === "drawing") {
        state.memoryTool = Recall.normalizeState(tool.dataset.memoryTool);
        syncMemoryTools();
        return;
      }
      var action = event.target.closest("[data-memory-action]");
      if (!action) return;
      if (action.dataset.memoryAction === "start") startMemoryWatch();
      else if (action.dataset.memoryAction === "check" && state.memoryPhase === "drawing") checkMemory();
      else if (action.dataset.memoryAction === "clear" && state.memoryPhase === "drawing") clearMemoryDraft();
      else if (action.dataset.memoryAction === "again" && state.memoryPhase === "review") retryMemory();
      else if (action.dataset.memoryAction === "finish" && state.memoryPhase === "review") finishMemory();
    });
    $("#memoryChart").addEventListener("pointerdown", function (event) {
      var cell = event.target.closest(".memory-range-cell");
      if (!cell || state.memoryPhase !== "drawing") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      state.memoryPainting = true;
      state.memoryLastCell = cell;
      state.memoryFocusHand = cell.dataset.hand;
      $$("#memoryChart .memory-range-cell").forEach(function (button) {
        button.tabIndex = button === cell ? 0 : -1;
      });
      var current = Recall.normalizeState(state.memoryDraft[cell.dataset.hand]);
      state.memoryPaintCode = state.memoryTool === "F" || current === state.memoryTool ? "F" : state.memoryTool;
      paintMemoryCell(cell, state.memoryPaintCode);
    });
    $("#memoryChart").addEventListener("pointermove", function (event) {
      if (!state.memoryPainting || state.memoryPhase !== "drawing") return;
      var target = document.elementFromPoint(event.clientX, event.clientY);
      var cell = target && target.closest(".memory-range-cell");
      if (cell && $("#memoryChart").contains(cell)) paintMemoryToward(cell);
    });
    $("#memoryChart").addEventListener("pointerleave", function (event) {
      if (!event.buttons) {
        state.memoryPainting = false;
        state.memoryPaintCode = null;
        state.memoryLastCell = null;
      }
    });
    $("#memoryChart").addEventListener("click", function (event) {
      var cell = event.target.closest(".memory-range-cell");
      if (cell && event.detail === 0) toggleMemoryCell(cell);
    });
    $("#memoryChart").addEventListener("keydown", handleMemoryMatrixKeydown);
    window.addEventListener("pointerup", function () {
      state.memoryPainting = false;
      state.memoryPaintCode = null;
      state.memoryLastCell = null;
    });
    window.addEventListener("pointercancel", function () {
      state.memoryPainting = false;
      state.memoryPaintCode = null;
      state.memoryLastCell = null;
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
    if (!Engine || !Content || !Recall) return;
    renderIntroTableArt();
    renderFirstTable();
    renderFirstCoach();
    renderDeep();
    renderMemory();
    renderPracticeSetup();
    setupWisdomCarousel();
    setupSizeDefensePreviews();
    setupEvents();
    var saved = readProgress();
    var restoredUnlock = Boolean(saved.unlocked || saved.firstChoice);
    if (restoredUnlock) {
      state.unlocked = true;
      $$(".step-tab").forEach(function (tab) { tab.disabled = false; });
      if (["idea", "wisdom", "deep", "practice", "memory"].includes(saved.step)) showStep(saved.step);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
