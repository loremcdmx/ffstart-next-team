(function () {
  "use strict";

  const rootScope = typeof window !== "undefined" ? window : globalThis;
  const VERSION = "ffstart-lesson-platform-v2";
  const EVENT_STORAGE_KEY = "ffstart-lesson-events-v1";
  const PROGRESS_STORAGE_KEY = "ffstart-lesson-progress-v1";
  const LESSON_STATE_SCHEMA = "ffstart-lesson-state-v2";
  const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  const VISUAL_TYPES = new Set([
    "ladder",
    "bar",
    "compare",
    "flow",
    "seat-map",
    "hand-rank",
    "stack-zones",
    "odds",
    "range-matrix"
  ]);
  const instances = new WeakMap();
  let instanceCount = 0;

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[character];
    });
  }

  function safeToken(value, fallback) {
    const token = clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return token || fallback || "item";
  }

  function clamp(value, minimum, maximum) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : minimum;
  }

  function plural(value, one, few, many) {
    const count = Math.abs(Number(value)) % 100;
    const last = count % 10;
    if (count > 10 && count < 20) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function uniqueId(prefix) {
    instanceCount += 1;
    return `${prefix}-${instanceCount}`;
  }

  function stableHash(value) {
    let hash = 2166136261;
    const input = String(value == null ? "" : value);
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededOrder(items, seed) {
    return items.slice().sort(function (left, right) {
      const leftKey = stableHash(`${seed}:${clean(left && left.id)}`);
      const rightKey = stableHash(`${seed}:${clean(right && right.id)}`);
      return leftKey - rightKey || clean(left && left.id).localeCompare(clean(right && right.id));
    });
  }

  function actionFamily(spot) {
    const option = correctOption(spot) || {};
    const token = clean(option.actionType || option.key || option.label).toLowerCase();
    if (/fold|пас/.test(token)) return "fold";
    if (/call|колл/.test(token)) return "call";
    if (/check|чек/.test(token)) return "check";
    if (/all.?in|jam|push|олл/.test(token)) return "all-in";
    if (/raise|bet|open|three|four|iso|рейз|ставк|изол|3-бет|4-бет/.test(token)) return "raise";
    return "choice";
  }

  function practiceQuotas(groups, sessionLength, passScore) {
    const entries = Array.from(groups.entries()).map(function (entry) {
      return { family: entry[0], size: entry[1].length, quota: 1 };
    });
    if (!entries.length) return entries;
    if (entries.length > sessionLength) {
      return entries.slice(0, sessionLength).map(function (entry) { return Object.assign(entry, { quota: 1 }); });
    }
    const passNeeded = Math.ceil(sessionLength * Number(passScore || 80) / 100);
    const safeFamilyCap = Math.max(1, passNeeded - 1);
    let assigned = entries.length;
    while (assigned < sessionLength) {
      const candidates = entries.filter(function (entry) {
        return entry.quota < entry.size && entry.quota < safeFamilyCap;
      });
      const fallback = candidates.length ? candidates : entries.filter(function (entry) { return entry.quota < entry.size; });
      if (!fallback.length) break;
      fallback.sort(function (left, right) {
        const leftNeed = left.size / (left.quota + 1);
        const rightNeed = right.size / (right.quota + 1);
        return rightNeed - leftNeed || left.family.localeCompare(right.family);
      });
      fallback[0].quota += 1;
      assigned += 1;
    }
    return entries;
  }

  function handAt(row, column) {
    const first = RANKS[row];
    const second = RANKS[column];
    if (row === column) return first + first;
    return row < column ? first + second + "s" : second + first + "o";
  }

  function handCombinations(hand) {
    if (/^([AKQJT2-9])\1$/.test(hand)) return 6;
    if (/s$/.test(hand)) return 4;
    return 12;
  }

  function correctOption(spot) {
    return asArray(spot && spot.options).find(function (option) { return Boolean(option.correct); }) || null;
  }

  function optionFor(spot, key) {
    return asArray(spot && spot.options).find(function (option) { return option.key === key; }) || null;
  }

  function validateSpot(spot, label) {
    if (!spot || typeof spot !== "object") throw new Error(`${label}: decision spot is required`);
    const options = asArray(spot.options);
    if (options.length < 2) throw new Error(`${label}: at least two options are required`);
    if (options.filter(function (option) { return Boolean(option.correct); }).length !== 1) {
      throw new Error(`${label}: exactly one correct option is required`);
    }
    options.forEach(function (option, index) {
      if (!clean(option.key) || !clean(option.label)) throw new Error(`${label}: option ${index + 1} needs key and label`);
    });
    const hasFeedback = clean(spot.explanation || spot.feedback) || options.some(function (option) { return clean(option.feedback); });
    const hasWisdom = clean(spot.wisdom || spot.rule) || options.some(function (option) { return clean(option.wisdom); });
    if (!hasFeedback) throw new Error(`${label}: learner feedback is required`);
    if (!hasWisdom) throw new Error(`${label}: contextual wisdom is required`);
    return spot;
  }

  function normalizeLesson(input, practiceInput) {
    const lesson = input && typeof input === "object" ? input : {};
    const practice = practiceInput && typeof practiceInput === "object" ? practiceInput : {};
    if (!clean(lesson.id || lesson.key)) throw new Error("lesson.id is required");
    if (!clean(lesson.title)) throw new Error("lesson.title is required");
    if (!lesson.encounter || !clean(lesson.encounter.title) || !clean(lesson.encounter.body || lesson.encounter.text)) {
      throw new Error("lesson.encounter needs title and body");
    }
    validateSpot(lesson.encounter.spot, "lesson.encounter.spot");

    const wisdom = asArray(lesson.wisdom);
    if (!wisdom.length) throw new Error("lesson.wisdom needs at least one thought");
    wisdom.forEach(function (thought, index) {
      if (!clean(thought.title) || !clean(thought.body || thought.text)) {
        throw new Error(`lesson.wisdom[${index}] needs title and body`);
      }
      const type = clean(thought.visual && thought.visual.type);
      if (type && !VISUAL_TYPES.has(type)) throw new Error(`Unknown wisdom visual type: ${type}`);
    });

    const deep = lesson.deep && typeof lesson.deep === "object" ? lesson.deep : {};
    const deepCards = asArray(deep.cards || deep.visualizations);
    if (!deepCards.length) throw new Error("lesson.deep.cards needs at least one visualization");
    deepCards.forEach(function (card, index) {
      const visual = card && card.visual ? card.visual : card;
      const type = clean(visual && visual.type);
      if (!VISUAL_TYPES.has(type)) throw new Error(`lesson.deep.cards[${index}] has an unknown visual type`);
      if (!clean(card && card.title)) throw new Error(`lesson.deep.cards[${index}] needs a learner-facing title`);
    });

    const spots = asArray(practice.spots || (lesson.practice && lesson.practice.spots));
    if (!spots.length) throw new Error("practice.spots needs at least one decision spot");
    spots.forEach(function (spot, index) { validateSpot(spot, `practice.spots[${index}]`); });

    const id = safeToken(lesson.id || lesson.key, "ffstart-lesson");
    const media = asArray(lesson.media).map(function (item) {
      return item && typeof item === "object" ? Object.assign({}, item) : item;
    });
    const recall = lesson.recall && typeof lesson.recall === "object" ? lesson.recall : null;
    if (recall) {
      const visual = recall.visual || {};
      if (visual.type !== "range-matrix") throw new Error("lesson.recall.visual must be a range-matrix");
    }

    return {
      id,
      key: clean(lesson.key || lesson.id),
      version: clean(lesson.version || VERSION),
      title: clean(lesson.title),
      eyebrow: clean(lesson.eyebrow || "FF Старт"),
      wisdomTitle: clean(lesson.wisdomTitle || lesson.title),
      wisdomEyebrow: clean(lesson.wisdomEyebrow || "Сначала пойми идею"),
      homeHref: clean(lesson.homeHref || "/"),
      homeLabel: clean(lesson.homeLabel || "← Все уроки"),
      nextHref: clean(lesson.nextHref),
      nextLabel: clean(lesson.nextLabel || "Следующий урок →"),
      encounter: lesson.encounter,
      wisdom,
      media,
      deep: Object.assign({}, deep, { cards: deepCards }),
      practice: Object.assign({}, lesson.practice || {}, practice, {
        spots,
        mediaFocus: clean((lesson.practice && lesson.practice.mediaFocus) || practice.mediaFocus),
        sessionLength: Math.max(1, Math.min(spots.length, Number(practice.sessionLength || (lesson.practice && lesson.practice.sessionLength) || spots.length))),
        passScore: clamp(practice.passScore || (lesson.practice && lesson.practice.passScore) || 80, 1, 100)
      }),
      recall,
      labels: Object.assign({
        encounter: "Решение",
        wisdom: "Мудрость",
        deep: "Чарт",
        practice: "Практика",
        recall: "Проверка чарта"
      }, lesson.labels || {})
    };
  }

  function visualLabel(visual, fallback) {
    return clean(visual.ariaLabel || visual.label || fallback);
  }

  function renderLadder(visual) {
    const items = asArray(visual.items);
    const maximum = Math.max(1, Number(visual.max) || Math.max.apply(null, items.map(function (item) { return Number(item.value) || 0; })));
    return `<div class="ffstart-ladder" role="img" aria-label="${escapeHtml(visualLabel(visual, "Сравнение значений"))}">${items.map(function (item) {
      const width = clamp((Number(item.value) || 0) / maximum * 100, 0, 100);
      return `<div class="ffstart-ladder__row ${item.emphasis ? "is-emphasis" : ""}"><span>${escapeHtml(item.label)}</span><i><em style="--ffstart-value:${width}%"></em></i><b>${escapeHtml(item.display == null ? item.value : item.display)}</b>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</div>`;
    }).join("")}</div>`;
  }

  function renderCompare(visual) {
    return `<div class="ffstart-compare" role="group" aria-label="${escapeHtml(visualLabel(visual, "Сравнение"))}">${asArray(visual.items).map(function (item) {
      return `<article class="ffstart-compare__item is-${safeToken(item.tone, "neutral")}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</article>`;
    }).join("")}</div>`;
  }

  function renderFlow(visual) {
    return `<ol class="ffstart-flow" aria-label="${escapeHtml(visualLabel(visual, "Последовательность решения"))}">${asArray(visual.steps || visual.items).map(function (item, index) {
      return `<li class="is-${safeToken(item.tone, "neutral")}"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(item.label)}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</div></li>`;
    }).join("")}</ol>`;
  }

  function renderSeatMap(visual) {
    return `<div class="ffstart-seat-map" role="img" aria-label="${escapeHtml(visualLabel(visual, "Позиции за покерным столом"))}"><div class="ffstart-seat-map__felt" aria-hidden="true"><span class="ffstart-seat-map__pot">${escapeHtml(visual.centerLabel || "Банк")}</span>${asArray(visual.seats).map(function (seat) {
      const position = safeToken(seat.position || seat.id, "seat");
      return `<span class="ffstart-seat is-${position} ${seat.active ? "is-active" : ""} ${seat.hero ? "is-hero" : ""}"><b>${escapeHtml(seat.label || seat.position)}</b>${seat.detail ? `<small>${escapeHtml(seat.detail)}</small>` : ""}</span>`;
    }).join("")}</div></div>`;
  }

  function renderHandRank(visual) {
    return `<ol class="ffstart-hand-rank" aria-label="${escapeHtml(visualLabel(visual, "Сила комбинаций"))}">${asArray(visual.items).map(function (item, index) {
      return `<li class="is-${safeToken(item.tone, "neutral")}"><span>${escapeHtml(item.rank || index + 1)}</span><div><strong>${escapeHtml(item.label)}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</div>${item.example ? `<b>${escapeHtml(item.example)}</b>` : ""}</li>`;
    }).join("")}</ol>`;
  }

  function renderStackZones(visual) {
    const zones = asArray(visual.zones || visual.items);
    const totalWeight = Math.max(1, zones.reduce(function (sum, zone) { return sum + Math.max(0, Number(zone.weight) || 1); }, 0));
    return `<div class="ffstart-stack-zones" role="img" aria-label="${escapeHtml(visualLabel(visual, "Стратегия по глубине стека"))}"><div class="ffstart-stack-zones__bar">${zones.map(function (zone) {
      const width = Math.max(0, Number(zone.weight) || 1) / totalWeight * 100;
      return `<span class="is-${safeToken(zone.tone, "neutral")}" style="--ffstart-zone:${width}%"><b>${escapeHtml(zone.label)}</b><small>${escapeHtml(zone.range || zone.value)}</small></span>`;
    }).join("")}</div><div class="ffstart-stack-zones__notes">${zones.map(function (zone) {
      return `<article><i class="is-${safeToken(zone.tone, "neutral")}"></i><div><strong>${escapeHtml(zone.label)}</strong>${zone.detail ? `<small>${escapeHtml(zone.detail)}</small>` : ""}</div></article>`;
    }).join("")}</div></div>`;
  }

  function renderOdds(visual) {
    const required = clamp(visual.required, 0, 100);
    const equity = clamp(visual.equity, 0, 100);
    return `<div class="ffstart-odds" role="img" aria-label="${escapeHtml(visualLabel(visual, "Шансы банка и эквити"))}"><div class="ffstart-odds__formula"><span><small>Банк</small><strong>${escapeHtml(visual.pot)}</strong></span><i>+</i><span><small>Колл</small><strong>${escapeHtml(visual.call)}</strong></span><i>→</i><span class="is-answer"><small>Нужно</small><strong>${escapeHtml(visual.requiredDisplay == null ? `${required}%` : visual.requiredDisplay)}</strong></span></div><div class="ffstart-odds__meters"><div><span>Порог колла</span><i><em style="--ffstart-value:${required}%"></em></i><b>${required}%</b></div><div class="is-equity"><span>${escapeHtml(visual.equityLabel || "Эквити руки")}</span><i><em style="--ffstart-value:${equity}%"></em></i><b>${equity}%</b></div></div>${visual.note ? `<p>${escapeHtml(visual.note)}</p>` : ""}</div>`;
  }

  function matrixState(value, fallback) {
    if (value && typeof value === "object") return clean(value.state || value.action || fallback);
    if (typeof value === "number") return value > 0 ? "raise" : fallback;
    return clean(value || fallback);
  }

  function matrixStateLabel(value) {
    const state = clean(value).toLowerCase();
    return { fold: "Пас", call: "Колл", raise: "Рейз" }[state] || clean(value);
  }

  function renderRangeMatrix(visual, options) {
    const config = options || {};
    const cells = config.cells || visual.cells || {};
    const defaultState = clean(config.defaultState || visual.defaultState || "fold");
    const interactive = config.interactive == null ? Boolean(visual.interactive) : Boolean(config.interactive);
    const allowedStates = asArray(config.states || visual.states).map(clean).filter(Boolean);
    const cellStates = Object.keys(cells).map(function (hand) { return matrixState(cells[hand], defaultState); });
    const derivedStates = Array.from(new Set([defaultState].concat(cellStates).filter(Boolean)));
    const states = allowedStates.length ? allowedStates : (derivedStates.length > 1 ? derivedStates : [defaultState, "raise"]);
    const visualKey = safeToken(config.visualKey || visual.id || "range", "range");
    const mode = clean(config.mode || "deep");
    const review = config.review || null;
    const matrix = [];
    RANKS.forEach(function (_rank, row) {
      RANKS.forEach(function (_rankTwo, column) {
        const hand = handAt(row, column);
        const state = matrixState(cells[hand], defaultState);
        const expected = review ? matrixState(review.expected[hand], defaultState) : "";
        const verdict = review ? (state === expected ? "correct" : "wrong") : "";
        const type = row === column ? "pair" : row < column ? "suited" : "offsuit";
        matrix.push(`<button type="button" role="gridcell" class="ffstart-matrix__cell is-${safeToken(state, "fold")} is-${type}${verdict ? ` is-${verdict}` : ""}" data-ffstart-matrix-cell data-matrix-mode="${escapeHtml(mode)}" data-visual-key="${escapeHtml(visualKey)}" data-hand="${hand}" data-row="${row}" data-column="${column}" data-matrix-state="${escapeHtml(state)}" data-matrix-states="${escapeHtml(states.join(","))}" data-interactive="${interactive ? "true" : "false"}" aria-label="${escapeHtml(`${hand}: ${matrixStateLabel(state)}`)}" aria-pressed="false" tabindex="${row === 0 && column === 0 ? "0" : "-1"}"><span>${hand}</span></button>`);
      });
    });
    const legend = asArray(visual.legend).length ? asArray(visual.legend) : states.map(function (state) { return { state, label: matrixStateLabel(state) }; });
    return `<div class="ffstart-range" data-ffstart-range="${escapeHtml(visualKey)}"><div class="ffstart-matrix-key">${legend.map(function (item) {
      return `<span><i class="is-${safeToken(item.state, "fold")}"></i>${escapeHtml(item.label)}</span>`;
    }).join("")}</div><div class="ffstart-matrix" role="grid" aria-label="${escapeHtml(visualLabel(visual, "Матрица стартовых рук 13 на 13"))}">${matrix.join("")}</div><p class="ffstart-matrix__detail" data-matrix-detail-for="${escapeHtml(visualKey)}" aria-live="polite">${escapeHtml(visual.hint || "Нажми на руку, чтобы рассмотреть её место в диапазоне.")}</p></div>`;
  }

  function renderVisual(visual, options) {
    const item = visual && typeof visual === "object" ? visual : {};
    switch (item.type) {
      case "ladder":
      case "bar": return renderLadder(item);
      case "compare": return renderCompare(item);
      case "flow": return renderFlow(item);
      case "seat-map": return renderSeatMap(item);
      case "hand-rank": return renderHandRank(item);
      case "stack-zones": return renderStackZones(item);
      case "odds": return renderOdds(item);
      case "range-matrix": return renderRangeMatrix(item, options);
      default: throw new Error(`Unknown visualization: ${clean(item.type)}`);
    }
  }

  function renderWisdomSlide(thought, index, count) {
    const accent = clean(thought.accent || "#ffdf51");
    const style = /^#[0-9a-f]{3,8}$/i.test(accent) ? ` style="--ffstart-slide-accent:${accent}"` : "";
    return `<article class="ffstart-wisdom-slide${index === 0 ? " is-active" : ""}" role="group" aria-roledescription="слайд" aria-label="${index + 1} из ${count}: ${escapeHtml(thought.title)}" aria-hidden="${index === 0 ? "false" : "true"}"${index === 0 ? "" : " inert"} data-wisdom-slide="${index}"${style}><span class="ffstart-wisdom-slide__number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><div class="ffstart-wisdom-slide__copy"><p class="ffstart-eyebrow">${escapeHtml(thought.eyebrow || thought.label || "Главная мысль")}</p><h2>${escapeHtml(thought.title)}</h2><p>${escapeHtml(thought.body || thought.text)}</p>${thought.rule ? `<strong class="ffstart-wisdom-rule">${escapeHtml(thought.rule)}</strong>` : ""}</div>${thought.visual ? `<div class="ffstart-wisdom-slide__visual">${renderVisual(thought.visual, { visualKey: `wisdom-${index}` })}</div>` : ""}</article>`;
  }

  function renderDeepCard(card, index) {
    const visual = card.visual || card;
    return `<article class="ffstart-deep-card ffstart-panel${card.wide ? " is-wide" : ""}"><header><p class="ffstart-eyebrow">${escapeHtml(card.eyebrow || `Разбор ${index + 1}`)}</p>${card.title ? `<h3>${escapeHtml(card.title)}</h3>` : ""}${card.body ? `<p>${escapeHtml(card.body)}</p>` : ""}</header><div class="ffstart-deep-card__visual">${renderVisual(visual, { visualKey: visual.id || `deep-${index}` })}</div>${card.rule ? `<strong class="ffstart-deep-card__rule">${escapeHtml(card.rule)}</strong>` : ""}</article>`;
  }

  function stepEntries(lesson) {
    const entries = [
      ["encounter", lesson.labels.encounter],
      ["wisdom", lesson.labels.wisdom],
      ["deep", lesson.labels.deep],
      ["practice", lesson.labels.practice]
    ];
    if (lesson.recall) entries.push(["recall", lesson.labels.recall]);
    return entries;
  }

  function renderShell(lesson) {
    const steps = stepEntries(lesson);
    const encounter = lesson.encounter;
    const practice = lesson.practice;
    return `<div class="ffstart-platform" data-ffstart-platform-version="${VERSION}" data-lesson-key="${escapeHtml(lesson.key)}"><header class="ffstart-topline"><div class="ffstart-brand"><a href="${escapeHtml(lesson.homeHref)}">${escapeHtml(lesson.homeLabel)}</a><p class="ffstart-eyebrow">${escapeHtml(lesson.eyebrow)}</p></div><nav class="ffstart-step-tabs" role="tablist" aria-label="Шаги урока">${steps.map(function (entry, index) {
      const stepId = `${lesson.id}-tab-${entry[0]}`;
      const panelId = `${lesson.id}-panel-${entry[0]}`;
      return `<button id="${escapeHtml(stepId)}" class="ffstart-step-tab${index === 0 ? " is-active" : ""}" type="button" role="tab" aria-controls="${escapeHtml(panelId)}" aria-selected="${index === 0 ? "true" : "false"}" data-step-target="${entry[0]}"${index === 0 ? "" : " disabled"}><span>${index + 1}</span>${escapeHtml(entry[1])}</button>`;
    }).join("")}</nav></header><main class="ffstart-main"><section id="${escapeHtml(`${lesson.id}-panel-encounter`)}" class="ffstart-screen is-active" role="tabpanel" aria-labelledby="${escapeHtml(`${lesson.id}-tab-encounter`)}" data-step="encounter"><article class="ffstart-encounter ffstart-panel"><div class="ffstart-encounter__copy"><p class="ffstart-eyebrow">${escapeHtml(encounter.eyebrow || "Первая раздача")}</p><h1>${escapeHtml(encounter.title || lesson.title)}</h1>${encounter.subtitle ? `<p class="ffstart-encounter__subtitle">${escapeHtml(encounter.subtitle)}</p>` : ""}<p class="ffstart-encounter__lead">${escapeHtml(encounter.body || encounter.text)}</p>${encounter.support ? `<p class="ffstart-encounter__support">${escapeHtml(encounter.support)}</p>` : ""}</div><div class="ffstart-table-card"><div class="ffstart-table-card__head"><i aria-hidden="true"></i><strong>${escapeHtml(encounter.tableLabel || "Учебный стол")}</strong>${encounter.context ? `<span>${escapeHtml(encounter.context)}</span>` : ""}</div><div class="ffstart-table-host lesson-table-host" data-ffstart-table-kind="encounter"></div></div></article></section><section id="${escapeHtml(`${lesson.id}-panel-wisdom`)}" class="ffstart-screen" role="tabpanel" aria-labelledby="${escapeHtml(`${lesson.id}-tab-wisdom`)}" data-step="wisdom" hidden><div class="ffstart-section-heading"><div><p class="ffstart-eyebrow">${escapeHtml(lesson.wisdomEyebrow)}</p><h2>${escapeHtml(lesson.wisdomTitle)}</h2></div><p><strong>${lesson.wisdom.length} ${plural(lesson.wisdom.length, "мысль", "мысли", "мыслей")}</strong> · стрелки, точки или свайп</p></div><div class="ffstart-wisdom ffstart-panel" data-wisdom-carousel tabindex="0" role="region" aria-roledescription="карусель" aria-label="Главные мысли урока">${lesson.wisdom.map(function (thought, index) { return renderWisdomSlide(thought, index, lesson.wisdom.length); }).join("")}<div class="ffstart-wisdom-controls" role="group" aria-label="Навигация по мыслям"><button type="button" class="ffstart-wisdom-arrow" data-wisdom-prev aria-label="Предыдущая мысль">←</button><div><strong data-wisdom-counter aria-live="polite">1 из ${lesson.wisdom.length}</strong><span class="ffstart-wisdom-dots" data-wisdom-dots>${lesson.wisdom.map(function (thought, index) { return `<button type="button" data-wisdom-dot="${index}" aria-label="${escapeHtml(`Перейти: ${thought.title}`)}"${index === 0 ? " aria-current=\"step\" class=\"is-active\"" : ""}></button>`; }).join("")}</span><small data-wisdom-remaining>${lesson.wisdom.length > 1 ? `Ещё ${lesson.wisdom.length - 1}` : "Последняя мысль"}</small></div><button type="button" class="ffstart-wisdom-arrow" data-wisdom-next aria-label="Следующая мысль"${lesson.wisdom.length === 1 ? " disabled" : ""}>→</button></div></div><div class="ffstart-section-actions"><button type="button" class="ffstart-btn is-primary" data-go-step="practice">Сразу попробовать</button><button type="button" class="ffstart-btn" data-go-step="deep">Разобрать подробнее</button></div></section><section id="${escapeHtml(`${lesson.id}-panel-deep`)}" class="ffstart-screen" role="tabpanel" aria-labelledby="${escapeHtml(`${lesson.id}-tab-deep`)}" data-step="deep" hidden><div class="ffstart-section-heading"><div><p class="ffstart-eyebrow">${escapeHtml(lesson.deep.eyebrow || "Разбираем механику")}</p><h2>${escapeHtml(lesson.deep.title || lesson.title)}</h2></div>${lesson.deep.body ? `<p>${escapeHtml(lesson.deep.body)}</p>` : ""}</div>${lesson.media.length ? '<div data-ffstart-media-host></div>' : ""}<div class="ffstart-deep-grid">${lesson.deep.cards.map(renderDeepCard).join("")}</div><div class="ffstart-section-actions"><button type="button" class="ffstart-btn is-primary" data-go-step="practice">Закрепить за столом →</button></div></section><section id="${escapeHtml(`${lesson.id}-panel-practice`)}" class="ffstart-screen" role="tabpanel" aria-labelledby="${escapeHtml(`${lesson.id}-tab-practice`)}" data-step="practice" hidden><div class="ffstart-section-heading"><div><p class="ffstart-eyebrow">${escapeHtml(practice.eyebrow || "Решения за столом")}</p><h2>${escapeHtml(practice.title || "Практика")}</h2></div>${practice.body ? `<p>${escapeHtml(practice.body)}</p>` : ""}</div>${practice.mediaFocus ? `<aside class="ffstart-practice-focus ffstart-panel"><p class="ffstart-eyebrow">Фокус серии</p><strong data-media-practice-focus>${escapeHtml(practice.mediaFocus)}</strong></aside>` : ""}<div data-practice-stage><div class="ffstart-practice-hud ffstart-panel" aria-live="polite" aria-atomic="true"><span>Задача <b data-hud-hand>1</b><small>из ${practice.sessionLength}</small></span><span>Верно <b data-hud-correct>0</b></span><span>Ошибки <b data-hud-errors>0</b></span><span>Серия <b data-hud-streak>0</b></span></div><article class="ffstart-practice-table ffstart-panel"><div class="ffstart-table-host lesson-table-host" data-ffstart-table-kind="practice"></div></article></div></section>${lesson.recall ? `<section id="${escapeHtml(`${lesson.id}-panel-recall`)}" class="ffstart-screen" role="tabpanel" aria-labelledby="${escapeHtml(`${lesson.id}-tab-recall`)}" data-step="recall" hidden><div data-recall-stage></div></section>` : ""}</main><footer class="ffstart-footer"><a href="${escapeHtml(lesson.homeHref)}">${escapeHtml(lesson.homeLabel)}</a>${lesson.nextHref ? `<a href="${escapeHtml(lesson.nextHref)}">${escapeHtml(lesson.nextLabel)}</a>` : ""}</footer></div>`;
  }

  function readJson(storage, key, fallback) {
    try {
      const value = JSON.parse(storage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function localStorageFor(controller) {
    try {
      return controller.window && controller.window.localStorage ? controller.window.localStorage : null;
    } catch (_error) {
      return null;
    }
  }

  function localEvent(controller, event) {
    const storage = localStorageFor(controller);
    if (!storage) return null;
    const saved = readJson(storage, EVENT_STORAGE_KEY, []);
    const archive = Array.isArray(saved) ? saved : [];
    archive.push(event);
    writeJson(storage, EVENT_STORAGE_KEY, archive.slice(-250));
    return event;
  }

  function trainerMeta(controller) {
    return {
      key: controller.lesson.key,
      title: controller.lesson.title,
      version: controller.lesson.version
    };
  }

  function activeProfile(controller) {
    try {
      return controller.window.FFPlayerProgress && controller.window.FFPlayerProgress.getActiveProfile
        ? controller.window.FFPlayerProgress.getActiveProfile()
        : null;
    } catch (_error) {
      return null;
    }
  }

  function sendEvent(controller, kind, payload) {
    const event = Object.assign({
      kind,
      trainer: trainerMeta(controller),
      profile: activeProfile(controller),
      client: {
        source: "ffstart-lesson-platform",
        platformVersion: VERSION,
        lessonId: controller.lesson.id
      },
      occurredAt: nowIso()
    }, payload || {});
    try {
      if (controller.window.FFTrainerEvents && typeof controller.window.FFTrainerEvents.send === "function") {
        const sent = controller.window.FFTrainerEvents.send(event);
        if (sent && typeof sent.catch === "function") return sent.catch(function () { return localEvent(controller, event); });
        return sent;
      }
    } catch (_error) {
      return localEvent(controller, event);
    }
    return localEvent(controller, event);
  }

  function persistLocalResult(controller, result) {
    const storage = localStorageFor(controller);
    if (!storage) return;
    const saved = readJson(storage, PROGRESS_STORAGE_KEY, {});
    const results = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    results[controller.lesson.key] = result;
    writeJson(storage, PROGRESS_STORAGE_KEY, results);
  }

  function persistResult(controller, result) {
    try {
      if (controller.window.FFPlayerProgress && typeof controller.window.FFPlayerProgress.setResult === "function") {
        const saved = controller.window.FFPlayerProgress.setResult(controller.lesson.key, result);
        if (saved && typeof saved.catch === "function") saved.catch(function () { persistLocalResult(controller, result); });
        return;
      }
    } catch (_error) {
      // The local path below keeps the result available when the central client is offline.
    }
    persistLocalResult(controller, result);
  }

  function progressProfileId(controller) {
    const profile = activeProfile(controller);
    return safeToken(profile && profile.id, "guest");
  }

  function progressStorageKey(controller) {
    return `${PROGRESS_STORAGE_KEY}:${progressProfileId(controller)}:${controller.lesson.key}`;
  }

  function legacyProgressStorageKey(controller) {
    return `${PROGRESS_STORAGE_KEY}:${controller.lesson.key}`;
  }

  function saveLessonProgress(controller) {
    const storage = localStorageFor(controller);
    if (!storage) return;
    const practice = controller.state.practice;
    writeJson(storage, progressStorageKey(controller), {
      schema: LESSON_STATE_SCHEMA,
      lessonVersion: controller.lesson.version,
      unlocked: controller.state.unlocked,
      encounterSelected: controller.state.encounterSelected,
      step: controller.state.step,
      practice: {
        attemptIndex: practice.attemptIndex,
        mediaId: practice.mediaId,
        queueIds: practice.queue.map(function (spot) { return clean(spot && spot.id); }),
        index: practice.index,
        correct: practice.correct,
        errors: practice.errors,
        streak: practice.streak,
        bestStreak: practice.bestStreak,
        selectedKey: practice.selectedKey,
        history: practice.history,
        startedAt: practice.startedAt,
        result: practice.result,
        summary: practice.summary,
        sessionId: practice.sessionId
      }
    });
  }

  function readLessonProgress(controller) {
    const storage = localStorageFor(controller);
    if (!storage) return {};
    const scoped = readJson(storage, progressStorageKey(controller), null);
    if (scoped && scoped.lessonVersion === controller.lesson.version) return scoped;
    if (progressProfileId(controller) !== "guest") return {};
    const legacy = readJson(storage, legacyProgressStorageKey(controller), {});
    return legacy && typeof legacy === "object" ? legacy : {};
  }

  function simulator(controller) {
    return controller.window.FFTrainerSimulator && typeof controller.window.FFTrainerSimulator.renderDecision === "function"
      ? controller.window.FFTrainerSimulator
      : null;
  }

  function tableError(host) {
    host.innerHTML = '<div class="ffstart-table-unavailable" role="alert"><strong>Интерактивный стол не загрузился</strong><span>Попробуй ещё раз или вернись в программу — прогресс урока не потеряется.</span><button type="button" class="ffstart-btn is-primary" data-platform-reload>Попробовать ещё раз</button><a class="ffstart-btn" href="/ffstart#program">К программе</a></div>';
  }

  function renderDecisionTable(controller, host, spot, selectedKey) {
    const api = simulator(controller);
    if (!api) {
      tableError(host);
      return null;
    }
    host.style.removeProperty("--ffstart-action-gutter");
    try {
      api.renderDecision(host, spot, {
        answered: Boolean(selectedKey),
        selectedKey: selectedKey || "",
        finished: false
      }, Object.assign({ decimalComma: true }, controller.lesson.practice.simulatorOptions || {}));
      if (!host.firstElementChild) tableError(host);
      return host;
    } catch (_error) {
      tableError(host);
      return null;
    }
  }

  function feedbackMarkup(config) {
    const correct = Boolean(config.correct);
    return `<div class="ffstart-table-feedback ${correct ? "is-correct" : "is-wrong"}" role="status" aria-live="polite"><div class="ffstart-table-feedback__verdict"><i aria-hidden="true"></i><div><strong>${correct ? "Верно" : "Разберём ошибку"}</strong><span>${escapeHtml(config.answerLine)}</span></div></div><p>${escapeHtml(config.explanation)}</p>${config.wisdom ? `<blockquote><span>Запомни</span>${escapeHtml(config.wisdom)}</blockquote>` : ""}<button type="button" class="ffstart-btn is-primary" data-platform-next="${escapeHtml(config.next)}">${escapeHtml(config.nextLabel)}</button></div>`;
  }

  function appendFeedback(host, config) {
    const controls = host.querySelector("[data-trainer-simulator-actions]");
    if (!controls) return false;
    controls.insertAdjacentHTML("beforeend", feedbackMarkup(config));
    const measuredHeight = Math.ceil(controls.getBoundingClientRect().height);
    if (measuredHeight > 0) host.style.setProperty("--ffstart-action-gutter", `${Math.max(132, measuredHeight + 18)}px`);
    return true;
  }

  function prefersReducedMotion(controller) {
    return Boolean(controller.window.matchMedia && controller.window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function focusRendered(controller, element, ensureVisible) {
    if (!element) return;
    const applyFocus = function () {
      if (element.isConnected === false) return;
      try { element.focus({ preventScroll: true }); } catch (_error) { element.focus(); }
      if (!ensureVisible || typeof element.scrollIntoView !== "function") return;
      const rect = element.getBoundingClientRect();
      const viewportHeight = controller.window.innerHeight || 0;
      if (rect.top >= 0 && rect.bottom <= viewportHeight) return;
      const viewportPadding = 20;
      const currentY = controller.window.scrollY || 0;
      const targetY = rect.bottom > viewportHeight - viewportPadding
        ? currentY + rect.bottom - viewportHeight + viewportPadding
        : currentY + rect.top - viewportPadding;
      if (typeof controller.window.scrollTo === "function") {
        controller.window.scrollTo({
          top: Math.max(0, targetY),
          behavior: prefersReducedMotion(controller) ? "auto" : "smooth"
        });
      } else {
        element.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion(controller) ? "auto" : "smooth" });
      }
    };
    if (typeof controller.window.requestAnimationFrame === "function") controller.window.requestAnimationFrame(applyFocus);
    else applyFocus();
  }

  function feedbackFor(spot, selected, expected) {
    const correct = selected && expected && selected.key === expected.key;
    const explanation = clean((selected && selected.feedback) || (correct ? expected.feedback : spot.explanation) || expected.feedback || spot.feedback);
    const rawWisdom = clean((selected && selected.wisdom) || spot.wisdom || spot.rule);
    const wisdom = rawWisdom === explanation ? "" : rawWisdom;
    return {
      correct,
      answerLine: correct
        ? `Лучшее действие: ${expected.label}.`
        : `Твой выбор: ${selected.label}. Лучшее действие: ${expected.label}.`,
      explanation: explanation || (correct ? "Решение совпало с базовой стратегией." : "Сверь действие с логикой этого спота."),
      wisdom
    };
  }

  function updateTabs(controller) {
    const tabs = Array.from(controller.root.querySelectorAll("[data-step-target]"));
    let activeTab = null;
    tabs.forEach(function (tab, index) {
      const active = tab.dataset.stepTarget === controller.state.step;
      tab.disabled = index > 0 && !controller.state.unlocked;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      if (active) activeTab = tab;
    });
    const rail = activeTab && activeTab.closest(".ffstart-step-tabs");
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;
    const left = Math.max(0, activeTab.offsetLeft - ((rail.clientWidth - activeTab.offsetWidth) / 2));
    if (typeof rail.scrollTo === "function") rail.scrollTo({ left, behavior: "auto" });
    else rail.scrollLeft = left;
  }

  function goStep(controller, step, focusHeading) {
    const allowed = step === "encounter" || controller.state.unlocked;
    const screen = controller.root.querySelector(`[data-step="${step}"]`);
    if (!allowed || !screen) return false;
    if (step !== "recall" && controller.state.recall && controller.state.recall.timer) {
      controller.window.clearInterval(controller.state.recall.timer);
      controller.state.recall.timer = null;
      controller.state.recall.phase = "idle";
      controller.state.recall.secondsLeft = controller.state.recall.watchSeconds;
    }
    if (step !== "deep" && controller.media && typeof controller.media.pause === "function") controller.media.pause();
    controller.state.step = step;
    Array.from(controller.root.querySelectorAll("[data-step]")).forEach(function (item) {
      const active = item.dataset.step === step;
      item.hidden = !active;
      item.classList.toggle("is-active", active);
    });
    updateTabs(controller);
    if (step === "practice") ensurePracticeStarted(controller);
    if (step === "recall") renderRecall(controller);
    saveLessonProgress(controller);
    if (controller.window.scrollTo) controller.window.scrollTo({ top: 0, behavior: prefersReducedMotion(controller) ? "auto" : "smooth" });
    if (focusHeading) {
      const heading = screen.querySelector("h1,h2");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
    return true;
  }

  function renderEncounter(controller) {
    const host = controller.root.querySelector('[data-ffstart-table-kind="encounter"]');
    if (!host) return;
    const spot = controller.lesson.encounter.spot;
    renderDecisionTable(controller, host, spot, controller.state.encounterSelected);
    if (!controller.state.encounterSelected) return;
    const selected = optionFor(spot, controller.state.encounterSelected);
    const expected = correctOption(spot);
    const feedback = feedbackFor(spot, selected, expected);
    appendFeedback(host, Object.assign({}, feedback, {
      next: "wisdom",
      nextLabel: controller.lesson.encounter.continueLabel || "Понять, почему →"
    }));
  }

  function answerEncounter(controller, key) {
    if (controller.state.encounterSelected) return;
    const spot = controller.lesson.encounter.spot;
    const selected = optionFor(spot, key);
    const expected = correctOption(spot);
    if (!selected || !expected) return;
    controller.state.encounterSelected = selected.key;
    controller.state.unlocked = true;
    const correct = selected.key === expected.key;
    renderEncounter(controller);
    updateTabs(controller);
    saveLessonProgress(controller);
    sendEvent(controller, "trainer_decision", {
      decision: {
        phase: "encounter",
        spotId: clean(spot.id || "encounter"),
        choice: selected.key,
        expected: expected.key,
        correct
      }
    });
    const host = controller.root.querySelector('[data-ffstart-table-kind="encounter"]');
    focusRendered(controller, host && host.querySelector("[data-platform-next]"), true);
  }

  function setWisdomSlide(controller, nextIndex) {
    const slides = Array.from(controller.root.querySelectorAll("[data-wisdom-slide]"));
    if (!slides.length) return;
    const index = clamp(nextIndex, 0, slides.length - 1);
    controller.state.wisdomIndex = index;
    slides.forEach(function (slide, slideIndex) {
      const active = slideIndex === index;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
      if (active) slide.removeAttribute("inert");
      else slide.setAttribute("inert", "");
    });
    Array.from(controller.root.querySelectorAll("[data-wisdom-dot]")).forEach(function (dot, dotIndex) {
      const active = dotIndex === index;
      dot.classList.toggle("is-active", active);
      if (active) dot.setAttribute("aria-current", "step");
      else dot.removeAttribute("aria-current");
    });
    const counter = controller.root.querySelector("[data-wisdom-counter]");
    const remaining = controller.root.querySelector("[data-wisdom-remaining]");
    const previous = controller.root.querySelector("[data-wisdom-prev]");
    const next = controller.root.querySelector("[data-wisdom-next]");
    if (counter) counter.textContent = `${index + 1} из ${slides.length}`;
    if (remaining) remaining.textContent = index === slides.length - 1 ? "Последняя мысль" : `Ещё ${slides.length - index - 1}`;
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === slides.length - 1;
  }

  function setupWisdom(controller) {
    const carousel = controller.root.querySelector("[data-wisdom-carousel]");
    if (!carousel) return;
    let startX = 0;
    let startY = 0;
    let pointerId = null;
    const keydown = function (event) {
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        setWisdomSlide(controller, event.key === "Home" ? 0 : controller.lesson.wisdom.length - 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setWisdomSlide(controller, controller.state.wisdomIndex + (event.key === "ArrowRight" ? 1 : -1));
      }
    };
    const pointerdown = function (event) {
      if (event.target.closest("button,a")) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      if (carousel.setPointerCapture) carousel.setPointerCapture(pointerId);
    };
    const pointerup = function (event) {
      if (event.pointerId !== pointerId) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (carousel.hasPointerCapture && carousel.hasPointerCapture(pointerId)) carousel.releasePointerCapture(pointerId);
      pointerId = null;
      if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
        setWisdomSlide(controller, controller.state.wisdomIndex + (deltaX < 0 ? 1 : -1));
      }
    };
    const pointercancel = function (event) {
      if (event.pointerId !== pointerId) return;
      if (carousel.hasPointerCapture && carousel.hasPointerCapture(pointerId)) carousel.releasePointerCapture(pointerId);
      pointerId = null;
    };
    carousel.addEventListener("keydown", keydown);
    carousel.addEventListener("pointerdown", pointerdown);
    carousel.addEventListener("pointerup", pointerup);
    carousel.addEventListener("pointercancel", pointercancel);
    controller.cleanup.push(function () {
      carousel.removeEventListener("keydown", keydown);
      carousel.removeEventListener("pointerdown", pointerdown);
      carousel.removeEventListener("pointerup", pointerup);
      carousel.removeEventListener("pointercancel", pointercancel);
    });
    setWisdomSlide(controller, 0);
  }

  function practiceQueue(lesson, attemptIndex) {
    const spots = lesson.practice.spots.slice();
    const sessionLength = Math.min(spots.length, lesson.practice.sessionLength);
    const attempt = Math.max(0, Math.floor(Number(attemptIndex) || 0));
    const groups = new Map();
    spots.forEach(function (spot) {
      const family = actionFamily(spot);
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(spot);
    });
    const quotas = practiceQuotas(groups, sessionLength, lesson.practice.passScore);
    const selected = [];
    quotas.forEach(function (entry) {
      const ordered = seededOrder(groups.get(entry.family), `${lesson.id}:${entry.family}`);
      const start = ordered.length ? (attempt * entry.quota) % ordered.length : 0;
      for (let offset = 0; offset < entry.quota; offset += 1) {
        selected.push(ordered[(start + offset) % ordered.length]);
      }
    });
    if (selected.length < sessionLength) {
      const selectedIds = new Set(selected.map(function (spot) { return clean(spot && spot.id); }));
      const remaining = seededOrder(spots.filter(function (spot) { return !selectedIds.has(clean(spot && spot.id)); }), `${lesson.id}:remaining:${attempt}`);
      selected.push.apply(selected, remaining.slice(0, sessionLength - selected.length));
    }
    return seededOrder(selected, `${lesson.id}:session:${attempt}`).slice(0, sessionLength);
  }

  function practiceQueueForMedia(lesson, currentQueue, mediaId) {
    const targetId = clean(mediaId);
    const base = asArray(currentQueue).slice();
    if (!targetId) return base;
    const linked = asArray(lesson && lesson.practice && lesson.practice.spots).filter(function (spot) {
      return clean(spot && spot.mediaMoment && spot.mediaMoment.mediaId) === targetId;
    });
    if (!linked.length) return base;
    const limit = Math.max(1, base.length || Math.min(linked.length, Number(lesson.practice.sessionLength) || linked.length));
    const linkedIds = new Set(linked.map(function (spot) { return clean(spot && spot.id); }));
    return linked.concat(base.filter(function (spot) { return !linkedIds.has(clean(spot && spot.id)); })).slice(0, limit);
  }

  function updateMediaPracticeFocus(controller, item) {
    const cue = clean(item && item.learning && item.learning.practiceCue);
    if (!cue) return;
    controller.state.practice.mediaId = clean(item.id);
    const target = controller.root.querySelector("[data-media-practice-focus]");
    if (target) target.textContent = cue;
  }

  function updateMediaPracticeButtons(controller) {
    const practice = controller.state.practice;
    const hasAnswered = practice.history.length || practice.selectedKey || practice.result || practice.summary || practice.index > 0;
    Array.from(controller.root.querySelectorAll('[data-media-practice-exact="true"]')).forEach(function (button) {
      button.textContent = hasAnswered ? "Начать новую связанную серию →" : "Начать с этого задания →";
    });
  }

  function prepareMediaPractice(controller, mediaId) {
    const practice = controller.state.practice;
    const item = controller.lesson.media.find(function (entry) { return clean(entry && entry.id) === clean(mediaId); });
    if (item) updateMediaPracticeFocus(controller, item);
    const hasLinkedPractice = controller.lesson.practice.spots.some(function (spot) {
      return clean(spot && spot.mediaMoment && spot.mediaMoment.mediaId) === clean(mediaId);
    });
    if (!hasLinkedPractice) return;
    const hasAnswered = practice.history.length || practice.selectedKey || practice.result || practice.summary || practice.index > 0;
    if (hasAnswered) {
      const nextAttempt = practice.attemptIndex + 1;
      const base = practiceQueue(controller.lesson, nextAttempt);
      resetPracticeState(controller, practiceQueueForMedia(controller.lesson, base, mediaId), nextAttempt);
      rebuildPracticeStage(controller);
      updateMediaPracticeButtons(controller);
      return;
    }
    practice.queue = practiceQueueForMedia(controller.lesson, practice.queue, mediaId);
    practice.index = 0;
  }

  function currentPracticeSpot(controller) {
    return controller.state.practice.queue[controller.state.practice.index] || null;
  }

  function updatePracticeHud(controller) {
    const practice = controller.state.practice;
    const hand = controller.root.querySelector("[data-hud-hand]");
    const correct = controller.root.querySelector("[data-hud-correct]");
    const errors = controller.root.querySelector("[data-hud-errors]");
    const streak = controller.root.querySelector("[data-hud-streak]");
    if (hand) hand.textContent = String(Math.min(practice.index + 1, practice.queue.length));
    if (correct) correct.textContent = String(practice.correct);
    if (errors) errors.textContent = String(practice.errors);
    if (streak) streak.textContent = String(practice.streak);
  }

  function renderPracticeTable(controller) {
    const host = controller.root.querySelector('[data-ffstart-table-kind="practice"]');
    const spot = currentPracticeSpot(controller);
    if (!host || !spot) return;
    renderDecisionTable(controller, host, spot, controller.state.practice.selectedKey);
    updatePracticeHud(controller);
    if (!controller.state.practice.selectedKey) return;
    const selected = optionFor(spot, controller.state.practice.selectedKey);
    const expected = correctOption(spot);
    const feedback = feedbackFor(spot, selected, expected);
    const last = controller.state.practice.index === controller.state.practice.queue.length - 1;
    appendFeedback(host, Object.assign({}, feedback, {
      next: last ? "summary" : "practice",
      nextLabel: last ? "Посмотреть итог →" : "Следующая рука →"
    }));
  }

  function ensurePracticeStarted(controller) {
    const practice = controller.state.practice;
    if (!practice.startedAt) {
      practice.startedAt = nowIso();
      saveLessonProgress(controller);
    }
    if (!practice.summary) renderPracticeTable(controller);
  }

  function resultForPractice(controller) {
    const practice = controller.state.practice;
    const score = practice.queue.length ? Math.round(practice.correct / practice.queue.length * 100) : 0;
    return {
      schema: "ff-trainer-result-v1",
      skillKey: controller.lesson.key,
      trainerKey: controller.lesson.key,
      trainerTitle: controller.lesson.title,
      version: controller.lesson.version,
      status: score >= controller.lesson.practice.passScore ? "passed" : "repeat",
      score,
      bestScore: score,
      passScore: controller.lesson.practice.passScore,
      attempts: practice.history.length,
      correct: practice.correct,
      total: practice.queue.length,
      bestStreak: practice.bestStreak,
      startedAt: practice.startedAt,
      completedAt: nowIso(),
      answers: practice.history
    };
  }

  function completePractice(controller) {
    const practice = controller.state.practice;
    if (practice.result) return practice.result;
    const result = resultForPractice(controller);
    practice.result = result;
    persistResult(controller, result);
    saveLessonProgress(controller);
    sendEvent(controller, "trainer_session", {
      session: {
        id: practice.sessionId,
        type: "ffstart_lesson_practice",
        startedAt: practice.startedAt,
        completedAt: result.completedAt,
        total: result.total,
        attempts: result.attempts,
        correct: result.correct,
        accuracy: result.score,
        status: result.status,
        answers: practice.history
      },
      result
    });
    return result;
  }

  function answerPractice(controller, key) {
    const practice = controller.state.practice;
    if (practice.selectedKey || practice.summary) return;
    const spot = currentPracticeSpot(controller);
    const selected = optionFor(spot, key);
    const expected = correctOption(spot);
    if (!spot || !selected || !expected) return;
    const correct = selected.key === expected.key;
    practice.selectedKey = selected.key;
    if (correct) {
      practice.correct += 1;
      practice.streak += 1;
      practice.bestStreak = Math.max(practice.bestStreak, practice.streak);
    } else {
      practice.errors += 1;
      practice.streak = 0;
    }
    const decision = {
      phase: "practice",
      spotId: clean(spot.id || `spot-${practice.index + 1}`),
      choice: selected.key,
      expected: expected.key,
      correct,
      index: practice.index,
      answeredAt: nowIso()
    };
    practice.history.push(decision);
    updateMediaPracticeButtons(controller);
    sendEvent(controller, "trainer_decision", { decision, sessionId: practice.sessionId });
    renderPracticeTable(controller);
    if (practice.index === practice.queue.length - 1) completePractice(controller);
    saveLessonProgress(controller);
    const host = controller.root.querySelector('[data-ffstart-table-kind="practice"]');
    focusRendered(controller, host && host.querySelector("[data-platform-next]"), true);
  }

  function practiceSummaryMarkup(controller) {
    const result = controller.state.practice.result || completePractice(controller);
    const passed = result.status === "passed";
    const next = controller.lesson.nextHref
      ? `<a class="ffstart-btn ${passed ? "is-primary" : ""}" href="${escapeHtml(controller.lesson.nextHref)}">${escapeHtml(controller.lesson.nextLabel)}</a>`
      : "";
    const restartClass = passed && next ? "ffstart-btn" : "ffstart-btn is-primary";
    return `<article class="ffstart-practice-summary ffstart-panel ${passed ? "is-passed" : "is-repeat"}" role="status"><p class="ffstart-eyebrow">Сессия завершена</p><h2>${passed ? "Навык закреплён" : "Ещё один круг — и тема станет понятнее"}</h2><div class="ffstart-summary-score"><strong>${result.score}%</strong><span>${result.correct} из ${result.total} решений</span></div><div class="ffstart-summary-grid"><span><small>Ошибки</small><b>${controller.state.practice.errors}</b></span><span><small>Лучшая серия</small><b>${result.bestStreak}</b></span><span><small>Порог</small><b>${result.passScore}%</b></span></div>${next}<button type="button" class="${restartClass}" data-practice-restart>Пройти ещё раз</button>${controller.lesson.recall ? '<button type="button" class="ffstart-btn" data-go-step="recall">Проверить память →</button>' : ""}</article>`;
  }

  function showPracticeSummary(controller) {
    const stage = controller.root.querySelector("[data-practice-stage]");
    if (!stage) return;
    controller.state.practice.summary = true;
    stage.innerHTML = practiceSummaryMarkup(controller);
    saveLessonProgress(controller);
    const heading = stage.querySelector("h2");
    if (heading) heading.tabIndex = -1;
    focusRendered(controller, heading, true);
  }

  function resetPracticeState(controller, queue, attemptIndex) {
    const practice = controller.state.practice;
    practice.attemptIndex = Math.max(0, Math.floor(Number(attemptIndex) || 0));
    practice.queue = asArray(queue).slice();
    practice.index = 0;
    practice.correct = 0;
    practice.errors = 0;
    practice.streak = 0;
    practice.bestStreak = 0;
    practice.selectedKey = "";
    practice.history = [];
    practice.startedAt = "";
    practice.result = null;
    practice.summary = false;
    practice.sessionId = uniqueId(`${controller.lesson.id}-session`);
  }

  function rebuildPracticeStage(controller) {
    const practice = controller.state.practice;
    const screen = controller.root.querySelector('[data-step="practice"]');
    const templateLesson = controller.lesson;
    const practiceData = templateLesson.practice;
    const existingStage = screen && screen.querySelector("[data-practice-stage]");
    if (existingStage) {
      existingStage.outerHTML = `<div data-practice-stage><div class="ffstart-practice-hud ffstart-panel" aria-live="polite" aria-atomic="true"><span>Задача <b data-hud-hand>1</b><small>из ${practiceData.sessionLength}</small></span><span>Верно <b data-hud-correct>0</b></span><span>Ошибки <b data-hud-errors>0</b></span><span>Серия <b data-hud-streak>0</b></span></div><article class="ffstart-practice-table ffstart-panel"><div class="ffstart-table-host lesson-table-host" data-ffstart-table-kind="practice"></div></article></div>`;
    }
    return practice;
  }

  function resetPractice(controller) {
    const nextAttempt = controller.state.practice.attemptIndex + 1;
    resetPracticeState(controller, practiceQueue(controller.lesson, nextAttempt), nextAttempt);
    rebuildPracticeStage(controller);
    updateMediaPracticeButtons(controller);
    ensurePracticeStarted(controller);
    saveLessonProgress(controller);
    focusRendered(controller, controller.root.querySelector('[data-ffstart-table-kind="practice"] [data-shell-action="choose"]'), true);
  }

  function advancePractice(controller) {
    const practice = controller.state.practice;
    if (!practice.selectedKey) return;
    if (practice.index >= practice.queue.length - 1) {
      showPracticeSummary(controller);
      return;
    }
    practice.index += 1;
    practice.selectedKey = "";
    renderPracticeTable(controller);
    saveLessonProgress(controller);
    focusRendered(controller, controller.root.querySelector('[data-ffstart-table-kind="practice"] [data-shell-action="choose"]'), true);
  }

  function expectedRecallCells(recall) {
    const cells = recall.visual.cells || {};
    const fallback = clean(recall.visual.defaultState || "fold");
    const expected = {};
    RANKS.forEach(function (_rank, row) {
      RANKS.forEach(function (_rankTwo, column) {
        const hand = handAt(row, column);
        expected[hand] = matrixState(cells[hand], fallback);
      });
    });
    return expected;
  }

  function blankRecallCells(recall) {
    const fallback = clean(recall.defaultState || recall.visual.defaultState || "fold");
    const draft = {};
    RANKS.forEach(function (_rank, row) {
      RANKS.forEach(function (_rankTwo, column) { draft[handAt(row, column)] = fallback; });
    });
    return draft;
  }

  function scoreRecall(draft, expected) {
    let correctCombos = 0;
    let totalCombos = 0;
    let errors = 0;
    Object.keys(expected).forEach(function (hand) {
      const combinations = handCombinations(hand);
      totalCombos += combinations;
      if (draft[hand] === expected[hand]) correctCombos += combinations;
      else errors += 1;
    });
    return {
      correctCombos,
      totalCombos,
      errors,
      score: totalCombos ? Math.round(correctCombos / totalCombos * 100) : 0
    };
  }

  function recallHeading(controller) {
    const recall = controller.lesson.recall;
    return `<div class="ffstart-section-heading"><div><p class="ffstart-eyebrow">${escapeHtml(recall.eyebrow || "Проверка памяти")}</p><h2>${escapeHtml(recall.title || "Восстанови чарт сам")}</h2></div>${recall.body ? `<p>${escapeHtml(recall.body)}</p>` : ""}</div>`;
  }

  function renderRecall(controller) {
    const stage = controller.root.querySelector("[data-recall-stage]");
    const recall = controller.lesson.recall;
    if (!stage || !recall) return;
    const state = controller.state.recall;
    if (state.phase === "idle") {
      stage.innerHTML = `${recallHeading(controller)}<article class="ffstart-recall-start ffstart-panel"><div><p class="ffstart-eyebrow">Смотри на форму, не на отдельные клетки</p><h3>${escapeHtml(recall.prompt || "Запомни границу и восстанови её без подсказки")}</h3><p>${escapeHtml(recall.hint || "Чарт откроется на несколько секунд, затем исчезнет.")}</p></div><button type="button" class="ffstart-btn is-primary" data-recall-start>Запомнить за ${state.watchSeconds} секунд</button></article>`;
      return;
    }
    if (state.phase === "watching") {
      stage.innerHTML = `${recallHeading(controller)}<article class="ffstart-recall-work ffstart-panel"><div class="ffstart-recall-status"><strong>Смотри: <span data-recall-countdown>${state.secondsLeft}</span></strong><small>Сейчас чарт исчезнет</small></div>${renderRangeMatrix(recall.visual, { visualKey: "recall-reference", cells: state.expected, interactive: false, mode: "recall-reference" })}</article>`;
      return;
    }
    const states = asArray(recall.states).length ? asArray(recall.states) : [
      { key: recall.visual.defaultState || "fold", label: "Пас" },
      { key: "raise", label: "Рейз" }
    ];
    if (state.phase === "drawing") {
      stage.innerHTML = `${recallHeading(controller)}<article class="ffstart-recall-work ffstart-panel"><div class="ffstart-recall-toolbar" role="toolbar" aria-label="Кисть для чарта">${states.map(function (tool) { return `<button type="button" data-recall-tool="${escapeHtml(tool.key)}" class="${tool.key === state.tool ? "is-active" : ""}" aria-pressed="${tool.key === state.tool ? "true" : "false"}">${escapeHtml(tool.label)}</button>`; }).join("")}</div>${renderRangeMatrix(recall.visual, { visualKey: "recall-draft", cells: state.draft, states: states.map(function (tool) { return tool.key; }), interactive: true, mode: "recall" })}<div class="ffstart-recall-actions"><button type="button" class="ffstart-btn is-primary" data-recall-check>Проверить чарт</button><span data-recall-painted>Отмечено клеток: ${Object.keys(state.draft).filter(function (hand) { return state.draft[hand] !== (recall.visual.defaultState || "fold"); }).length}</span></div></article>`;
      return;
    }
    const result = state.result;
    stage.innerHTML = `${recallHeading(controller)}<article class="ffstart-recall-work ffstart-panel"><div class="ffstart-recall-result ${result.errors ? "is-repeat" : "is-clean"}" role="status"><strong>${result.errors ? "Граница пока не совпала" : "Чарт восстановлен точно"}</strong><span>${result.correctCombos.toLocaleString("ru-RU")} из ${result.totalCombos.toLocaleString("ru-RU")} комбинаций · ${result.score}%</span></div>${renderRangeMatrix(recall.visual, { visualKey: "recall-review", cells: state.draft, interactive: false, mode: "recall-review", review: { expected: state.expected } })}<div class="ffstart-recall-actions"><button type="button" class="ffstart-btn is-primary" data-recall-retry>Попробовать ещё раз</button></div></article>`;
  }

  function startRecall(controller) {
    const state = controller.state.recall;
    state.phase = "watching";
    state.secondsLeft = state.watchSeconds;
    state.expected = expectedRecallCells(controller.lesson.recall);
    renderRecall(controller);
    if (state.timer) controller.window.clearInterval(state.timer);
    state.timer = controller.window.setInterval(function () {
      state.secondsLeft -= 1;
      const countdown = controller.root.querySelector("[data-recall-countdown]");
      if (countdown) countdown.textContent = String(Math.max(0, state.secondsLeft));
      if (state.secondsLeft <= 0) {
        controller.window.clearInterval(state.timer);
        state.timer = null;
        state.phase = "drawing";
        state.draft = blankRecallCells(controller.lesson.recall);
        renderRecall(controller);
      }
    }, 1000);
  }

  function checkRecall(controller) {
    const state = controller.state.recall;
    state.result = scoreRecall(state.draft, state.expected);
    state.phase = "result";
    renderRecall(controller);
    sendEvent(controller, "trainer_recall", {
      recall: {
        score: state.result.score,
        correctCombinations: state.result.correctCombos,
        totalCombinations: state.result.totalCombos,
        errors: state.result.errors
      }
    });
  }

  function resetRecall(controller) {
    const state = controller.state.recall;
    state.phase = "watching";
    state.secondsLeft = state.watchSeconds;
    state.draft = {};
    state.result = null;
    startRecall(controller);
  }

  function updateMatrixCell(button, state) {
    button.classList.remove(`is-${safeToken(button.dataset.matrixState, "fold")}`);
    button.dataset.matrixState = state;
    button.classList.add(`is-${safeToken(state, "fold")}`);
    button.setAttribute("aria-label", `${button.dataset.hand}: ${matrixStateLabel(state)}`);
  }

  function selectMatrixCell(controller, button) {
    const matrix = button.closest(".ffstart-matrix");
    if (!matrix) return;
    Array.from(matrix.querySelectorAll(".is-selected")).forEach(function (item) {
      item.classList.remove("is-selected");
      item.setAttribute("aria-pressed", "false");
    });
    button.classList.add("is-selected");
    button.setAttribute("aria-pressed", "true");
    const detail = controller.root.querySelector(`[data-matrix-detail-for="${button.dataset.visualKey}"]`);
    if (detail) detail.textContent = `${button.dataset.hand} · ${matrixStateLabel(button.dataset.matrixState)}`;
  }

  function activateMatrixCell(controller, button) {
    selectMatrixCell(controller, button);
    if (button.dataset.interactive !== "true") return;
    if (button.dataset.matrixMode === "recall") {
      const state = controller.state.recall.tool;
      controller.state.recall.draft[button.dataset.hand] = state;
      updateMatrixCell(button, state);
      selectMatrixCell(controller, button);
      const painted = controller.root.querySelector("[data-recall-painted]");
      if (painted) {
        const fallback = controller.lesson.recall.visual.defaultState || "fold";
        const count = Object.keys(controller.state.recall.draft).filter(function (hand) { return controller.state.recall.draft[hand] !== fallback; }).length;
        painted.textContent = `Отмечено клеток: ${count}`;
      }
      return;
    }
    const states = clean(button.dataset.matrixStates).split(",").filter(Boolean);
    const current = states.indexOf(button.dataset.matrixState);
    const next = states[(current + 1) % states.length] || button.dataset.matrixState;
    updateMatrixCell(button, next);
    selectMatrixCell(controller, button);
    const visualKey = button.dataset.visualKey;
    if (!controller.state.matrixDrafts[visualKey]) controller.state.matrixDrafts[visualKey] = {};
    controller.state.matrixDrafts[visualKey][button.dataset.hand] = next;
  }

  function matrixKeydown(controller, event, button) {
    const movement = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0]
    }[event.key];
    if (movement) {
      event.preventDefault();
      const row = clamp(Number(button.dataset.row) + movement[0], 0, 12);
      const column = clamp(Number(button.dataset.column) + movement[1], 0, 12);
      const target = button.closest(".ffstart-matrix").querySelector(`[data-row="${row}"][data-column="${column}"]`);
      if (target) {
        button.tabIndex = -1;
        target.tabIndex = 0;
        target.focus();
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateMatrixCell(controller, button);
    }
  }

  function handleClick(controller, event) {
    const action = event.target.closest('[data-shell-action="choose"]');
    if (action && controller.root.contains(action)) {
      const host = action.closest("[data-ffstart-table-kind]");
      if (!host) return;
      if (host.dataset.ffstartTableKind === "encounter") answerEncounter(controller, action.dataset.optionKey);
      if (host.dataset.ffstartTableKind === "practice") answerPractice(controller, action.dataset.optionKey);
      return;
    }
    const stepTab = event.target.closest("[data-step-target]");
    if (stepTab && !stepTab.disabled) { goStep(controller, stepTab.dataset.stepTarget, true); return; }
    const mediaPractice = event.target.closest("[data-media-practice]");
    if (mediaPractice) {
      prepareMediaPractice(controller, mediaPractice.dataset.mediaPractice);
      goStep(controller, mediaPractice.dataset.goStep || "practice", true);
      return;
    }
    const go = event.target.closest("[data-go-step]");
    if (go) { goStep(controller, go.dataset.goStep, true); return; }
    const next = event.target.closest("[data-platform-next]");
    if (next) {
      if (next.dataset.platformNext === "wisdom") goStep(controller, "wisdom", true);
      else if (next.dataset.platformNext === "practice") advancePractice(controller);
      else if (next.dataset.platformNext === "summary") showPracticeSummary(controller);
      return;
    }
    const previousThought = event.target.closest("[data-wisdom-prev]");
    if (previousThought) { setWisdomSlide(controller, controller.state.wisdomIndex - 1); return; }
    const nextThought = event.target.closest("[data-wisdom-next]");
    if (nextThought) { setWisdomSlide(controller, controller.state.wisdomIndex + 1); return; }
    const dot = event.target.closest("[data-wisdom-dot]");
    if (dot) { setWisdomSlide(controller, Number(dot.dataset.wisdomDot)); return; }
    const matrix = event.target.closest("[data-ffstart-matrix-cell]");
    if (matrix) { activateMatrixCell(controller, matrix); return; }
    if (event.target.closest("[data-practice-restart]")) { resetPractice(controller); return; }
    if (event.target.closest("[data-platform-reload]")) { controller.window.location.reload(); return; }
    if (event.target.closest("[data-recall-start]")) { startRecall(controller); return; }
    if (event.target.closest("[data-recall-check]")) { checkRecall(controller); return; }
    if (event.target.closest("[data-recall-retry]")) { resetRecall(controller); return; }
    const tool = event.target.closest("[data-recall-tool]");
    if (tool) {
      controller.state.recall.tool = tool.dataset.recallTool;
      Array.from(controller.root.querySelectorAll("[data-recall-tool]")).forEach(function (button) {
        const active = button === tool;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }
  }

  function handleKeydown(controller, event) {
    const stepTab = event.target.closest && event.target.closest("[data-step-target]");
    if (stepTab && controller.root.contains(stepTab) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const tabs = Array.from(controller.root.querySelectorAll("[data-step-target]")).filter(function (tab) { return !tab.disabled; });
      const index = tabs.indexOf(stepTab);
      if (index >= 0 && tabs.length > 1) {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const next = tabs[(index + direction + tabs.length) % tabs.length];
        goStep(controller, next.dataset.stepTarget, false);
        try { next.focus({ preventScroll: true }); } catch (_error) { next.focus(); }
      }
      return;
    }
    const matrix = event.target.closest && event.target.closest("[data-ffstart-matrix-cell]");
    if (matrix && controller.root.contains(matrix)) matrixKeydown(controller, event, matrix);
  }

  function destroyController(controller) {
    controller.cleanup.forEach(function (cleanup) {
      try { cleanup(); } catch (_error) { /* nothing to release */ }
    });
    if (controller.state.recall && controller.state.recall.timer) controller.window.clearInterval(controller.state.recall.timer);
    instances.delete(controller.root);
  }

  function resolveRoot(target) {
    if (typeof target === "string") return rootScope.document && rootScope.document.querySelector(target);
    return target;
  }

  function restorePractice(controller, saved) {
    if (!saved || saved.schema !== LESSON_STATE_SCHEMA || saved.lessonVersion !== controller.lesson.version) return;
    const source = saved.practice;
    if (!source || typeof source !== "object") return;
    const practice = controller.state.practice;
    practice.attemptIndex = Math.max(0, Math.floor(Number(source.attemptIndex) || 0));
    practice.mediaId = clean(source.mediaId);
    const spotsById = new Map(controller.lesson.practice.spots.map(function (spot) { return [clean(spot && spot.id), spot]; }));
    const queueIds = asArray(source.queueIds).map(clean).filter(Boolean);
    const restoredQueue = queueIds.map(function (id) { return spotsById.get(id); }).filter(Boolean);
    practice.queue = restoredQueue.length === controller.lesson.practice.sessionLength
      && new Set(queueIds).size === queueIds.length
      ? restoredQueue
      : practiceQueue(controller.lesson, practice.attemptIndex);
    practice.index = clamp(source.index, 0, Math.max(0, practice.queue.length - 1));
    practice.correct = Math.max(0, Math.floor(Number(source.correct) || 0));
    practice.errors = Math.max(0, Math.floor(Number(source.errors) || 0));
    practice.streak = Math.max(0, Math.floor(Number(source.streak) || 0));
    practice.bestStreak = Math.max(practice.streak, Math.floor(Number(source.bestStreak) || 0));
    practice.history = asArray(source.history).slice(0, practice.queue.length);
    practice.startedAt = clean(source.startedAt);
    practice.result = source.result && typeof source.result === "object" ? source.result : null;
    practice.summary = Boolean(source.summary && practice.result);
    practice.sessionId = clean(source.sessionId) || uniqueId(`${controller.lesson.id}-session`);
    const spot = currentPracticeSpot(controller);
    practice.selectedKey = optionFor(spot, clean(source.selectedKey)) ? clean(source.selectedKey) : "";
  }

  function mount(target, configuration) {
    const root = resolveRoot(target);
    if (!root || !root.ownerDocument) throw new Error("FFStartLessonPlatform root was not found");
    if (instances.has(root)) destroyController(instances.get(root));
    const config = configuration && typeof configuration === "object" ? configuration : {};
    const lesson = normalizeLesson(config.lesson, config.practice);
    const controller = {
      root,
      window: root.ownerDocument.defaultView || rootScope,
      lesson,
      media: null,
      cleanup: [],
      state: {
        step: "encounter",
        unlocked: false,
        encounterSelected: "",
        wisdomIndex: 0,
        matrixDrafts: {},
        practice: {
          queue: practiceQueue(lesson, 0),
          attemptIndex: 0,
          index: 0,
          correct: 0,
          errors: 0,
          streak: 0,
          bestStreak: 0,
          selectedKey: "",
          history: [],
          startedAt: "",
          result: null,
          summary: false,
          mediaId: "",
          sessionId: uniqueId(`${lesson.id}-session`)
        },
        recall: lesson.recall ? {
          phase: "idle",
          watchSeconds: Math.max(3, Number(lesson.recall.watchSeconds || 10)),
          secondsLeft: Math.max(3, Number(lesson.recall.watchSeconds || 10)),
          expected: {},
          draft: {},
          tool: clean(lesson.recall.defaultState || lesson.recall.visual.defaultState || "fold"),
          result: null,
          timer: null
        } : null
      }
    };
    const saved = readLessonProgress(controller);
    const savedEncounter = optionFor(lesson.encounter.spot, clean(saved.encounterSelected));
    controller.state.unlocked = Boolean(saved.unlocked && savedEncounter);
    controller.state.encounterSelected = controller.state.unlocked ? savedEncounter.key : "";
    controller.state.step = controller.state.unlocked && stepEntries(lesson).some(function (entry) { return entry[0] === saved.step; }) ? saved.step : "encounter";
    restorePractice(controller, saved);

    root.setAttribute("data-ffstart-lesson", lesson.id);
    root.innerHTML = renderShell(lesson);
    const mediaHost = root.querySelector("[data-ffstart-media-host]");
    if (mediaHost) {
      const mediaApi = controller.window.FFStartCourseMedia;
      if (!mediaApi || typeof mediaApi.mount !== "function") throw new Error("FFStartCourseMedia is required for lessons with media");
      controller.media = mediaApi.mount(mediaHost, {
        items: lesson.media,
        heading: lesson.media.length > 1 ? "Разборы этого урока" : "Посмотри полный разбор",
        practiceTarget: "practice",
        practiceMediaIds: Array.from(new Set(lesson.practice.spots.map(function (spot) {
          return clean(spot && spot.mediaMoment && spot.mediaMoment.mediaId);
        }).filter(Boolean))),
        initialItemId: controller.state.practice.mediaId,
        onSelect: function (selection) {
          updateMediaPracticeFocus(controller, selection && selection.item);
          saveLessonProgress(controller);
        }
      });
      controller.cleanup.push(function () {
        if (controller.media && typeof controller.media.destroy === "function") controller.media.destroy();
      });
      updateMediaPracticeButtons(controller);
    }
    const click = function (event) { handleClick(controller, event); };
    const keydown = function (event) { handleKeydown(controller, event); };
    root.addEventListener("click", click, true);
    root.addEventListener("keydown", keydown);
    controller.cleanup.push(function () {
      root.removeEventListener("click", click, true);
      root.removeEventListener("keydown", keydown);
    });
    instances.set(root, controller);
    setupWisdom(controller);
    renderEncounter(controller);
    if (controller.state.step !== "encounter") {
      goStep(controller, controller.state.step, false);
      if (controller.state.step === "practice" && controller.state.practice.summary) showPracticeSummary(controller);
    }
    else updateTabs(controller);

    return {
      version: VERSION,
      go: function (step) { return goStep(controller, step, true); },
      restartPractice: function () { resetPractice(controller); },
      getState: function () {
        return {
          step: controller.state.step,
          unlocked: controller.state.unlocked,
          encounterSelected: controller.state.encounterSelected,
          wisdomIndex: controller.state.wisdomIndex,
          practice: {
            attemptIndex: controller.state.practice.attemptIndex,
            mediaId: controller.state.practice.mediaId,
            queueIds: controller.state.practice.queue.map(function (spot) { return clean(spot && spot.id); }),
            index: controller.state.practice.index,
            correct: controller.state.practice.correct,
            errors: controller.state.practice.errors,
            streak: controller.state.practice.streak,
            bestStreak: controller.state.practice.bestStreak,
            finished: Boolean(controller.state.practice.result)
          }
        };
      },
      destroy: function () { destroyController(controller); }
    };
  }

  const api = {
    version: VERSION,
    mount,
    __test: {
      RANKS,
      VISUAL_TYPES: Array.from(VISUAL_TYPES),
      handAt,
      handCombinations,
      actionFamily,
      practiceQueue,
      practiceQueueForMedia,
      practiceQuotas,
      normalizeLesson,
      renderShell,
      renderVisual,
      scoreRecall
    }
  };

  rootScope.FFStartLessonPlatform = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
