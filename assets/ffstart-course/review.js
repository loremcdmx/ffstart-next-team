(function () {
  "use strict";

  const STORAGE_KEY = "ffstart-program-critique-v1";
  const BACKUP_KEY = "ffstart-program-critique-v1-backup";
  const DATABASE_NAME = "ffstart-program-critique";
  const DATABASE_STORE = "review-state";
  const STATE_SCHEMA = "ffstart-program-critique-state-v1";
  const ALLOWED_STATUSES = new Set(["keep", "question", "remove"]);
  const STATUS_LABELS = { keep: "Оставить", question: "Под вопросом", remove: "Убрать", empty: "Без решения" };
  const VISUAL_LABELS = {
    ladder: "шкала",
    bar: "сравнение",
    compare: "сравнение",
    flow: "схема решения",
    "seat-map": "карта позиций",
    "hand-rank": "лестница комбинаций",
    "stack-zones": "зоны стека",
    odds: "расчёт цены",
    "range-matrix": "чарт диапазона"
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);
  }

  function plural(count, one, few, many) {
    const value = Math.abs(Number(count)) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return many;
    if (last === 1) return one;
    if (last > 1 && last < 5) return few;
    return many;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("ru-RU");
  }

  function formatDuration(seconds) {
    const minutes = Math.max(1, Math.round(Number(seconds || 0) / 60));
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  }

  function flattenData(data) {
    return data.modules.flatMap((module) => [
      { ...module, items: undefined, moduleId: module.id, moduleTitle: module.title },
      ...module.items.map((item) => ({ ...item, moduleId: module.id, moduleTitle: module.title }))
    ]);
  }

  function normalizedDecision(value, fallbackUpdatedAt) {
    if (!value || typeof value !== "object") return null;
    const status = ALLOWED_STATUSES.has(value.status) ? value.status : "";
    const note = String(value.note || "").slice(0, 8000);
    const deleted = Boolean(value.deleted) && !status && !note;
    if (!status && !note && !deleted) return null;
    return {
      status,
      note,
      updatedAt: String(value.updatedAt || fallbackUpdatedAt || ""),
      ...(deleted ? { deleted: true } : {})
    };
  }

  function maxTimestamp(...values) {
    return values.flat().map((value) => String(value || "")).sort().at(-1) || "";
  }

  function nextTimestamp(previous) {
    const previousTime = Date.parse(String(previous || ""));
    return new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
  }

  function chooseDecision(left, right) {
    if (!left) return right || null;
    if (!right) return left;
    const leftTime = String(left.updatedAt || "");
    const rightTime = String(right.updatedAt || "");
    if (leftTime !== rightTime) return leftTime > rightTime ? left : right;
    if (Boolean(left.deleted) !== Boolean(right.deleted)) return left.deleted ? left : right;
    return JSON.stringify(left) >= JSON.stringify(right) ? left : right;
  }

  function checksumFor(value) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function sealState(value) {
    const payload = {
      schema: value.schema,
      courseVersion: value.courseVersion,
      mediaVersion: value.mediaVersion,
      updatedAt: value.updatedAt,
      decisions: value.decisions || {},
      orphaned: value.orphaned || {}
    };
    return { ...payload, checksum: checksumFor(payload) };
  }

  function verifyStoredState(value) {
    if (!value || typeof value !== "object") return null;
    if (!value.checksum) return value;
    const { checksum, ...payload } = value;
    return checksum === checksumFor(payload) ? value : null;
  }

  function normalizeState(candidate, knownIds, versions) {
    const source = candidate && typeof candidate === "object" ? candidate : {};
    const candidateDecisions = source.decisions && typeof source.decisions === "object" ? source.decisions : {};
    const candidateOrphans = source.orphaned && typeof source.orphaned === "object" ? source.orphaned : {};
    const decisions = {};
    const orphaned = {};
    for (const [id, value] of Object.entries({ ...candidateOrphans, ...candidateDecisions })) {
      const decision = normalizedDecision(value, source.updatedAt);
      if (!decision) continue;
      if (knownIds.has(id)) decisions[id] = decision;
      else orphaned[id] = decision;
    }
    return {
      schema: STATE_SCHEMA,
      courseVersion: versions.course || "",
      mediaVersion: versions.media || "",
      updatedAt: maxTimestamp(source.updatedAt, Object.values(decisions).map((value) => value.updatedAt), Object.values(orphaned).map((value) => value.updatedAt)),
      decisions,
      orphaned
    };
  }

  function mergeStates(current, incoming, knownIds, versions) {
    const left = normalizeState(current, knownIds, versions);
    const right = normalizeState(incoming, knownIds, versions);
    const leftItems = { ...left.orphaned, ...left.decisions };
    const rightItems = { ...right.orphaned, ...right.decisions };
    const decisions = {};
    const orphaned = {};
    for (const id of new Set([...Object.keys(leftItems), ...Object.keys(rightItems)])) {
      const decision = chooseDecision(leftItems[id], rightItems[id]);
      if (!decision) continue;
      if (knownIds.has(id)) decisions[id] = decision;
      else orphaned[id] = decision;
    }
    return {
      schema: STATE_SCHEMA,
      courseVersion: versions.course || "",
      mediaVersion: versions.media || "",
      updatedAt: maxTimestamp(left.updatedAt, right.updatedAt, Object.values(decisions).map((value) => value.updatedAt), Object.values(orphaned).map((value) => value.updatedAt)),
      decisions,
      orphaned
    };
  }

  function countsFor(items, state) {
    const counts = { keep: 0, question: 0, remove: 0, empty: 0, total: items.length, reviewed: 0 };
    for (const item of items) {
      const status = state.decisions[item.reviewId]?.status;
      if (ALLOWED_STATUSES.has(status)) {
        counts[status] += 1;
        counts.reviewed += 1;
      } else counts.empty += 1;
    }
    return counts;
  }

  function exportPayload(data, state) {
    const items = flattenData(data);
    const snapshot = items.map((item) => ({
      reviewId: item.reviewId,
      type: item.type,
      moduleId: item.moduleId,
      title: item.title,
      status: state.decisions[item.reviewId]?.status || "",
      note: state.decisions[item.reviewId]?.note || ""
    }));
    return {
      schema: "ffstart-program-critique-export-v1",
      courseVersion: data.versions.course,
      mediaVersion: data.versions.media,
      exportedAt: new Date().toISOString(),
      summary: countsFor(items, state),
      decisions: { ...state.orphaned, ...state.decisions },
      snapshot
    };
  }

  function markdownSummary(data, state) {
    const items = flattenData(data);
    const counts = countsFor(items, state);
    const lines = [
      "# Ревью архитектуры FF Start",
      "",
      `Разобрано ${counts.reviewed} из ${counts.total}: оставить ${counts.keep}, под вопросом ${counts.question}, убрать ${counts.remove}, без решения ${counts.empty}.`,
      ""
    ];
    for (const module of data.modules) {
      const moduleDecision = state.decisions[module.reviewId] || {};
      lines.push(`## ${String(module.order).padStart(2, "0")}. ${module.title} — ${STATUS_LABELS[moduleDecision.status] || STATUS_LABELS.empty}`);
      if (moduleDecision.note) lines.push(`Комментарий: ${moduleDecision.note}`);
      lines.push("");
      for (const item of module.items) {
        const decision = state.decisions[item.reviewId] || {};
        const prefix = item.type === "play" ? "Игровая пауза" : `Урок ${String(item.order).padStart(2, "0")}`;
        lines.push(`- ${prefix}: ${item.title} — ${STATUS_LABELS[decision.status] || STATUS_LABELS.empty}${decision.note ? `. ${decision.note}` : ""}`);
      }
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  function persistenceResultLabel(localCopies, databaseSaved, message) {
    const prefix = message ? `${message} · ` : "";
    if (localCopies === 2 && databaseSaved) return `${prefix}сохранено в трёх копиях`;
    if (localCopies === 2) return `${prefix}сохранено в двух localStorage-копиях; IndexedDB недоступна`;
    if (localCopies === 1 && databaseSaved) return `${prefix}сохранено в localStorage и IndexedDB; зафиксируй итог файлом`;
    if (localCopies === 1) return `${prefix}сохранено только в одной localStorage-копии; зафиксируй итог файлом`;
    if (databaseSaved) return `${prefix}сохранено только в IndexedDB; зафиксируй итог файлом`;
    return `${prefix}не удалось сохранить в браузере — зафиксируй итог файлом`;
  }

  window.FFStartArchitectureReview = {
    __test: { ALLOWED_STATUSES, flattenData, checksumFor, sealState, verifyStoredState, normalizeState, mergeStates, countsFor, exportPayload, markdownSummary, persistenceResultLabel }
  };
  if (typeof document === "undefined") return;

  const root = document.querySelector("[data-review-root]");
  if (!root) return;

  let data = null;
  let items = [];
  let itemById = new Map();
  let state = null;
  let persistenceRequested = false;
  let databasePendingPayload = null;
  let databaseWritePromise = null;
  let databaseLastChecksum = "";
  const filters = { query: "", status: "all", type: "all", signal: "all" };

  function parseStoredState(raw) {
    try { return verifyStoredState(JSON.parse(raw || "null")); } catch (_error) { return null; }
  }

  function readLocalStates() {
    try {
      return [
        parseStoredState(localStorage.getItem(STORAGE_KEY)),
        parseStoredState(localStorage.getItem(BACKUP_KEY))
      ].filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  function openBackupDatabase() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    return new Promise((resolveDatabase) => {
      let request;
      try { request = indexedDB.open(DATABASE_NAME, 1); } catch (_error) { resolveDatabase(null); return; }
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(DATABASE_STORE)) request.result.createObjectStore(DATABASE_STORE);
      };
      request.onsuccess = function () { resolveDatabase(request.result); };
      request.onerror = function () { resolveDatabase(null); };
      request.onblocked = function () { resolveDatabase(null); };
    });
  }

  async function readDatabaseState() {
    const database = await openBackupDatabase();
    if (!database) return null;
    return new Promise((resolveState) => {
      const transaction = database.transaction(DATABASE_STORE, "readonly");
      const request = transaction.objectStore(DATABASE_STORE).get("latest");
      request.onsuccess = function () { resolveState(verifyStoredState(request.result)); };
      request.onerror = function () { resolveState(null); };
      transaction.oncomplete = function () { database.close(); };
      transaction.onerror = function () { database.close(); };
    });
  }

  async function writeDatabaseState(payload) {
    const database = await openBackupDatabase();
    if (!database) return false;
    return new Promise((resolveWrite) => {
      let transaction;
      try {
        transaction = database.transaction(DATABASE_STORE, "readwrite");
        transaction.objectStore(DATABASE_STORE).put(payload, "latest");
      } catch (_error) {
        database.close();
        resolveWrite(false);
        return;
      }
      transaction.oncomplete = function () { database.close(); resolveWrite(true); };
      transaction.onerror = function () { database.close(); resolveWrite(false); };
      transaction.onabort = function () { database.close(); resolveWrite(false); };
    });
  }

  async function drainDatabaseWrites() {
    let saved = true;
    while (databasePendingPayload) {
      const payload = databasePendingPayload;
      databasePendingPayload = null;
      const currentSaved = await writeDatabaseState(payload);
      if (currentSaved) databaseLastChecksum = payload.checksum;
      else saved = false;
    }
    databaseWritePromise = null;
    if (databasePendingPayload) return queueDatabaseState(databasePendingPayload);
    return saved;
  }

  function queueDatabaseState(payload) {
    databasePendingPayload = payload;
    if (!databaseWritePromise) databaseWritePromise = drainDatabaseWrites();
    return databaseWritePromise;
  }

  function requestPersistentStorage() {
    if (persistenceRequested) return;
    persistenceRequested = true;
    if (navigator.storage?.persist) navigator.storage.persist().catch(function () {});
  }

  function saveLabel(message) {
    const host = document.querySelector("[data-save-state]");
    if (host) host.textContent = message;
  }

  function persistState(message) {
    if (!state) return;
    const payload = sealState(state);
    const serialized = JSON.stringify(payload);
    let localCopies = 0;
    for (const key of [BACKUP_KEY, STORAGE_KEY]) {
      try {
        localStorage.setItem(key, serialized);
        localCopies += 1;
      } catch (_error) {}
    }
    if (localCopies === 2) saveLabel("Две localStorage-копии готовы · сохраняем в IndexedDB…");
    else if (localCopies === 1) saveLabel("Одна localStorage-копия готова · сохраняем в IndexedDB…");
    else saveLabel("localStorage недоступен · сохраняем в IndexedDB…");
    queueDatabaseState(payload).then(function () {
      const currentChecksum = state ? sealState(state).checksum : "";
      if (currentChecksum !== payload.checksum) return;
      saveLabel(persistenceResultLabel(localCopies, databaseLastChecksum === payload.checksum, message));
    }).catch(function () {
      const currentChecksum = state ? sealState(state).checksum : "";
      if (currentChecksum === payload.checksum) saveLabel(persistenceResultLabel(localCopies, false, message));
    });
  }

  function decisionFor(reviewId) {
    return state.decisions[reviewId] || { status: "", note: "" };
  }

  function setDecision(reviewId, patch) {
    requestPersistentStorage();
    const current = decisionFor(reviewId);
    const updatedAt = nextTimestamp(current.updatedAt);
    const next = { ...current, ...patch };
    state.decisions[reviewId] = !next.status && !next.note
      ? { status: "", note: "", updatedAt, deleted: true }
      : { status: next.status || "", note: next.note || "", updatedAt };
    state.updatedAt = maxTimestamp(state.updatedAt, updatedAt);
    persistState();
    syncCard(reviewId);
    updateSummary();
    applyFilters();
  }

  function decisionMarkup(item) {
    const decision = decisionFor(item.reviewId);
    const name = `review-${item.reviewId.replace(/[^a-z0-9]+/gi, "-")}`;
    return `<fieldset class="review-decision" data-decision-for="${escapeHtml(item.reviewId)}">
      <legend class="review-sr-only">Решение по пункту «${escapeHtml(item.title)}»</legend>
      ${["keep", "question", "remove"].map((status) => `<label><input type="radio" name="${name}" value="${status}" data-review-status="${escapeHtml(item.reviewId)}" ${decision.status === status ? "checked" : ""}><span>${STATUS_LABELS[status]}</span></label>`).join("")}
      <button class="review-clear" type="button" data-clear-status="${escapeHtml(item.reviewId)}" ${decision.status ? "" : "hidden"}>Снять выбор</button>
    </fieldset>`;
  }

  function noteMarkup(item) {
    const note = decisionFor(item.reviewId).note || "";
    return `<details class="review-note ${note ? "has-note" : ""}" data-note-box="${escapeHtml(item.reviewId)}">
      <summary>${note ? "Комментарий добавлен" : "Добавить комментарий"}</summary>
      <label class="review-sr-only" for="note-${escapeHtml(item.reviewId)}">Комментарий к пункту «${escapeHtml(item.title)}»</label>
      <textarea id="note-${escapeHtml(item.reviewId)}" maxlength="8000" placeholder="Что изменить, куда перенести или почему оставить" data-review-note="${escapeHtml(item.reviewId)}">${escapeHtml(note)}</textarea>
    </details>`;
  }

  function visualSummary(content) {
    const labels = [...new Set((content.visualTypes || []).map((type) => VISUAL_LABELS[type]).filter(Boolean))];
    return labels.length ? labels.join(" · ") : "без отдельного чарта";
  }

  function mediaLine(media) {
    if (!media.count) return { title: "Видео не привязано", body: "Урок держится на слайдах и практике.", meta: "Стоит проверить, нужен ли здесь живой пример." };
    const titles = media.items.map((item) => item.title).join(" · ");
    const reused = media.items.filter((item) => item.usageCount > 1).length;
    const additions = [
      `${media.count} ${plural(media.count, "видео", "видео", "видео")}`,
      formatDuration(media.durationSeconds),
      `${media.checkpointCount} ${plural(media.checkpointCount, "точка просмотра", "точки просмотра", "точек просмотра")}`
    ];
    if (media.guidedCount) additions.push(`${media.guidedCount} по фрагментам`);
    if (reused) additions.push(`${reused} повторно используется`);
    return { title: titles, body: media.items.map((item) => item.learningTitle).filter(Boolean).join(" · "), meta: additions.join(" · ") };
  }

  function interactionLabel(practice) {
    if (practice.delivery === "full-simulator") return "Свободная игра в полном симуляторе";
    const interaction = practice.interaction || {};
    const parts = [];
    if (interaction.pokerAction) parts.push("действия за столом");
    if (interaction.tableBackedChoice) parts.push("выбор по раздаче");
    if (interaction.conceptChoice) parts.push("теоретический выбор");
    return parts.join(" + ") || "интерактивные решения";
  }

  function practiceMeta(practice) {
    if (practice.grading === "completion") return `${practice.sessionLength} полных раздач · без оценки точности`;
    const bank = practice.bankSize ? ` из ${formatNumber(practice.bankSize)}` : "";
    return `серия ${practice.sessionLength}${bank} · порог ${practice.passScore}% · ${interactionLabel(practice)}`;
  }

  function detailMarkup(item) {
    const mediaItems = item.media.items.length
      ? `<ul>${item.media.items.map((video) => `<li><strong>${escapeHtml(video.title)}</strong>: ${escapeHtml(video.watchFor || video.learningTitle)}${video.longForm ? " · длинный разбор" : ""}${video.guided ? " · только выбранные фрагменты" : ""}</li>`).join("")}</ul>`
      : "<p>Видео в этом уроке нет.</p>";
    const sampleQuestions = item.practice.sampleQuestions?.length
      ? `<ul>${item.practice.sampleQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul>`
      : `<p>${escapeHtml(item.practice.summary)}</p>`;
    return `<details class="review-detail">
      <summary>Посмотреть состав подробнее</summary>
      <div class="review-detail__grid">
        <section><h4>Слайды и чарты</h4><p><strong>${escapeHtml(item.content.deepTitle)}</strong></p><ul>${item.content.wisdomTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}</ul></section>
        <section><h4>Видео</h4>${mediaItems}</section>
        <section><h4>Примеры практики</h4>${sampleQuestions}</section>
      </div>
    </details>`;
  }

  function lessonMarkup(item) {
    const media = mediaLine(item.media);
    const flags = [];
    if (item.kind === "legacy") flags.push('<span class="review-chip is-accent">отдельная лаборатория</span>');
    if (item.content.recall) flags.push('<span class="review-chip is-accent">восстановление чарта</span>');
    if (!item.media.count) flags.push('<span class="review-chip is-alert">без видео</span>');
    if (item.media.longFormCount) {
      flags.push(`<span class="review-chip">${item.media.longFormCount} ${plural(item.media.longFormCount, "длинный разбор", "длинных разбора", "длинных разборов")}</span>`);
    }
    if (item.practice.mediaLinkedSpots) {
      flags.push(`<span class="review-chip is-accent">${item.practice.mediaLinkedSpots} ${plural(item.practice.mediaLinkedSpots, "точный переход", "точных перехода", "точных переходов")} из видео</span>`);
    }
    const decision = decisionFor(item.reviewId);
    return `<article class="review-item review-card" data-review-card data-review-item data-review-id="${escapeHtml(item.reviewId)}" data-type="lesson" data-status="${escapeHtml(decision.status)}">
      <div class="review-item__copy">
        <p class="review-item__eyebrow">Урок ${String(item.order).padStart(2, "0")} · ${escapeHtml(item.moduleTitle)}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <div class="review-item__chips"><span class="review-chip">${item.minutes} мин</span>${flags.join("")}</div>
        <a class="review-item__link" href="${escapeHtml(item.route)}" target="_blank" rel="noopener">Открыть урок</a>
      </div>
      <div class="review-item__materials">
        <section class="review-material"><strong>Внутри</strong><div><b>${escapeHtml(item.content.encounterTitle)}</b><p>${item.content.wisdomCount} ${plural(item.content.wisdomCount, "слайд", "слайда", "слайдов")} мудрости · ${item.content.deepCardCount} ${plural(item.content.deepCardCount, "подробный разбор", "подробных разбора", "подробных разборов")}</p><small>${escapeHtml(visualSummary(item.content))}</small></div></section>
        <section class="review-material ${item.media.count ? "" : "is-missing"}"><strong>Видео</strong><div><b>${escapeHtml(media.title)}</b><p>${escapeHtml(media.body)}</p><small>${escapeHtml(media.meta)}</small></div></section>
        <section class="review-material"><strong>Тренажёр</strong><div><b>${escapeHtml(item.practice.title || item.practice.trainerTitle)}</b><p>${escapeHtml(item.practice.summary)}</p><small>${escapeHtml(practiceMeta(item.practice))}</small></div></section>
        ${detailMarkup(item)}
      </div>
      <div class="review-item__decision">${decisionMarkup(item)}${noteMarkup(item)}</div>
    </article>`;
  }

  function playMarkup(item) {
    const decision = decisionFor(item.reviewId);
    return `<article class="review-item review-card is-play" data-review-card data-review-item data-review-id="${escapeHtml(item.reviewId)}" data-type="play" data-status="${escapeHtml(decision.status)}">
      <div class="review-item__copy">
        <p class="review-item__eyebrow">Игровая пауза · после урока ${escapeHtml(item.afterLessonId)}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <div class="review-item__chips"><span class="review-chip is-accent">без оценки</span><span class="review-chip">${escapeHtml(item.duration)}</span></div>
        <a class="review-item__link" href="${escapeHtml(item.route)}" target="_blank" rel="noopener">Открыть игровую паузу</a>
      </div>
      <div class="review-item__materials">
        <section class="review-material"><strong>Формат</strong><div><b>Свободная игра в полном симуляторе</b><p>${escapeHtml(item.kicker)}: ${item.hands} ${plural(item.hands, "полная раздача", "полные раздачи", "полных раздач")} без подсказок по правильной кнопке.</p><small>${escapeHtml(item.modeLabel)} · ${escapeHtml(item.stackLabel)} · темп: ${item.tempo === "fast" ? "быстрый" : "спокойный"}</small></div></section>
        <section class="review-material"><strong>Задача</strong><div><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.summary)}</p><small>Развлечение и перенос навыка между учебными блоками</small></div></section>
      </div>
      <div class="review-item__decision">${decisionMarkup(item)}${noteMarkup(item)}</div>
    </article>`;
  }

  function modulePracticeMarkup(totals) {
    const parts = [];
    if (totals.generatedPracticeSpots) {
      parts.push(`<span><strong>${formatNumber(totals.generatedPracticeSpots)}</strong> ${plural(totals.generatedPracticeSpots, "ситуация", "ситуации", "ситуаций")} в общем тренажёре</span>`);
    }
    if (totals.legacyPracticeSpots) {
      parts.push(`<span><strong>${formatNumber(totals.legacyPracticeSpots)}</strong> ${plural(totals.legacyPracticeSpots, "ситуация", "ситуации", "ситуаций")} в отдельном тренажёре</span>`);
    }
    if (totals.fullSimulatorPractices) {
      parts.push(`<span><strong>${totals.fullSimulatorPractices}</strong> ${plural(totals.fullSimulatorPractices, "практика", "практики", "практик")} в полном симуляторе</span>`);
    }
    return parts.join("");
  }

  function moduleMarkup(module) {
    const decision = decisionFor(module.reviewId);
    return `<section class="review-module" data-review-module data-module-id="${escapeHtml(module.id)}">
      <header class="review-module__head review-card" data-review-card data-review-id="${escapeHtml(module.reviewId)}" data-type="module" data-status="${escapeHtml(decision.status)}">
        <span class="review-module__number">${String(module.order).padStart(2, "0")}</span>
        <div class="review-module__copy"><h2>${escapeHtml(module.title)}</h2><p>${escapeHtml(module.summary)}</p><div class="review-module__meta"><span><strong>${module.totals.lessons}</strong> ${plural(module.totals.lessons, "урок", "урока", "уроков")}</span><span><strong>${module.totals.minutes}</strong> мин</span><span><strong>${module.totals.videoLinks}</strong> видео · ${formatDuration(module.totals.videoSeconds)}</span>${modulePracticeMarkup(module.totals)}${module.totals.playSessions ? `<span><strong>${module.totals.playSessions}</strong> игровая пауза</span>` : ""}<span class="review-module__reviewed" data-module-reviewed="${escapeHtml(module.id)}">Внутри: 0 из ${module.items.length}</span></div></div>
        <div class="review-module__controls">${decisionMarkup(module)}${noteMarkup(module)}<button class="review-module__toggle" type="button" data-toggle-module="${escapeHtml(module.id)}" aria-expanded="true">Свернуть модуль</button></div>
      </header>
      <div class="review-module__body" data-module-body="${escapeHtml(module.id)}">${module.items.map((item) => item.type === "play" ? playMarkup({ ...item, moduleTitle: module.title }) : lessonMarkup({ ...item, moduleTitle: module.title })).join("")}</div>
    </section>`;
  }

  function render() {
    root.innerHTML = data.modules.map(moduleMarkup).join("");
    root.removeAttribute("aria-busy");
    updateSummary();
    applyFilters();
  }

  function syncCard(reviewId) {
    const decision = decisionFor(reviewId);
    const card = root.querySelector(`[data-review-card][data-review-id="${CSS.escape(reviewId)}"]`);
    if (!card) return;
    card.dataset.status = decision.status || "";
    const clear = card.querySelector(`[data-clear-status="${CSS.escape(reviewId)}"]`);
    if (clear) clear.hidden = !decision.status;
    const noteBox = card.querySelector(`[data-note-box="${CSS.escape(reviewId)}"]`);
    if (noteBox) {
      noteBox.classList.toggle("has-note", Boolean(decision.note));
      const summary = noteBox.querySelector("summary");
      if (summary) summary.textContent = decision.note ? "Комментарий добавлен" : "Добавить комментарий";
    }
  }

  function updateSummary() {
    const counts = countsFor(items, state);
    document.querySelector("[data-reviewed-count]").textContent = `${counts.reviewed} из ${counts.total}`;
    document.querySelector("[data-reviewed-bar]").style.width = `${counts.total ? counts.reviewed / counts.total * 100 : 0}%`;
    for (const status of ["keep", "question", "remove", "empty"]) document.querySelector(`[data-count-${status}]`).textContent = counts[status];
    for (const module of data.modules) {
      const reviewed = module.items.filter((item) => ALLOWED_STATUSES.has(decisionFor(item.reviewId).status)).length;
      const host = document.querySelector(`[data-module-reviewed="${CSS.escape(module.id)}"]`);
      if (host) host.textContent = `Внутри: ${reviewed} из ${module.items.length}`;
    }
  }

  function hasSignal(item, signal) {
    if (signal === "all") return true;
    if (item.type === "module") {
      if (signal === "no-video") return item.items.some((child) => child.type === "lesson" && !child.media.count);
      if (signal === "long-video") return item.items.some((child) => child.type === "lesson" && child.media.longFormCount);
      if (signal === "guided-video") return item.items.some((child) => child.type === "lesson" && child.media.guidedCount);
      if (signal === "full-simulator") return item.items.some((child) => child.type === "play" || child.practice?.delivery === "full-simulator");
      if (signal === "recall") return item.items.some((child) => child.type === "lesson" && child.content.recall);
      return false;
    }
    if (signal === "no-video") return item.type === "lesson" && !item.media.count;
    if (signal === "long-video") return item.type === "lesson" && item.media.longFormCount > 0;
    if (signal === "guided-video") return item.type === "lesson" && item.media.guidedCount > 0;
    if (signal === "full-simulator") return item.type === "play" || item.practice?.delivery === "full-simulator";
    if (signal === "recall") return item.type === "lesson" && item.content.recall;
    return true;
  }

  function searchableText(item) {
    if (item.type === "module") return `${item.title} ${item.summary}`.toLowerCase();
    if (item.type === "play") return `${item.title} ${item.summary} ${item.modeLabel}`.toLowerCase();
    return `${item.title} ${item.summary} ${item.content.wisdomTitles.join(" ")} ${item.media.items.map((video) => `${video.title} ${video.learningTitle}`).join(" ")} ${item.practice.title} ${item.practice.summary}`.toLowerCase();
  }

  function matches(item) {
    const status = decisionFor(item.reviewId).status || "empty";
    if (filters.status !== "all" && filters.status !== status) return false;
    if (filters.type !== "all" && filters.type !== item.type) return false;
    if (!hasSignal(item, filters.signal)) return false;
    return !filters.query || searchableText(item).includes(filters.query);
  }

  function applyFilters() {
    if (!data) return;
    let visible = 0;
    for (const module of data.modules) {
      const moduleMatch = matches(module);
      const childMatches = module.items.filter(matches);
      const moduleHost = root.querySelector(`[data-review-module][data-module-id="${CSS.escape(module.id)}"]`);
      const header = moduleHost.querySelector(".review-module__head");
      const showModule = moduleMatch || childMatches.length > 0;
      moduleHost.hidden = !showModule;
      moduleHost.classList.toggle("is-context-only", showModule && !moduleMatch);
      header.hidden = !showModule;
      visible += moduleMatch ? 1 : 0;
      for (const item of module.items) {
        const card = moduleHost.querySelector(`[data-review-item][data-review-id="${CSS.escape(item.reviewId)}"]`);
        const itemMatch = matches(item);
        card.hidden = !itemMatch;
        if (itemMatch) visible += 1;
      }
      if (showModule && (filters.query || filters.status !== "all" || filters.type !== "all" || filters.signal !== "all")) setModuleCollapsed(moduleHost, false);
    }
    let empty = root.querySelector(".review-empty");
    if (!visible) {
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "review-empty";
        empty.textContent = "По этим фильтрам ничего не найдено. Измени запрос или покажи все пункты.";
        root.appendChild(empty);
      }
    } else if (empty) empty.remove();
    document.querySelectorAll("[data-visible-count]").forEach((host) => { host.textContent = `Показываем ${visible} из ${items.length}`; });
  }

  function setModuleCollapsed(moduleHost, collapsed) {
    moduleHost.classList.toggle("is-collapsed", collapsed);
    const toggle = moduleHost.querySelector("[data-toggle-module]");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.textContent = collapsed ? "Развернуть модуль" : "Свернуть модуль";
    }
  }

  function showActionStatus(message) {
    const host = document.querySelector("[data-action-status]");
    if (host) host.textContent = message;
  }

  function downloadReview() {
    const payload = exportPayload(data, state);
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ffstart-review-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showActionStatus(`Скачана копия: ${countsFor(items, state).reviewed} решений из ${items.length}.`);
  }

  async function copySummary() {
    const summary = markdownSummary(data, state);
    try {
      await navigator.clipboard.writeText(summary);
      showActionStatus("Сводка скопирована — её можно вставить в задачу на доработку.");
    } catch (_error) {
      showActionStatus("Не удалось скопировать автоматически. Скачай решения файлом.");
    }
  }

  function importReview(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const payload = JSON.parse(String(reader.result || ""));
        const candidate = payload.decisions ? payload : {
          decisions: Object.fromEntries((payload.snapshot || []).map((row) => [row.reviewId, { status: row.status, note: row.note }]))
        };
        const knownIds = new Set(items.map((item) => item.reviewId));
        state = mergeStates(state, candidate, knownIds, data.versions);
        persistState("Загруженные решения объединены и сохранены");
        render();
        showActionStatus(`Решения безопасно объединены: ${countsFor(items, state).reviewed} из ${items.length} пунктов отмечено.`);
      } catch (_error) {
        showActionStatus("Файл не прочитан. Нужен JSON, скачанный с этой страницы.");
      }
    };
    reader.readAsText(file);
  }

  root.addEventListener("change", function (event) {
    const statusInput = event.target.closest("[data-review-status]");
    if (statusInput) setDecision(statusInput.dataset.reviewStatus, { status: statusInput.value });
  });

  root.addEventListener("input", function (event) {
    const note = event.target.closest("[data-review-note]");
    if (note) setDecision(note.dataset.reviewNote, { note: note.value });
  });

  root.addEventListener("click", function (event) {
    const clear = event.target.closest("[data-clear-status]");
    if (clear) {
      const reviewId = clear.dataset.clearStatus;
      root.querySelectorAll(`[data-review-status="${CSS.escape(reviewId)}"]`).forEach((input) => { input.checked = false; });
      setDecision(reviewId, { status: "" });
      return;
    }
    const toggle = event.target.closest("[data-toggle-module]");
    if (toggle) {
      const moduleHost = toggle.closest("[data-review-module]");
      setModuleCollapsed(moduleHost, !moduleHost.classList.contains("is-collapsed"));
    }
  });

  document.querySelector("[data-filter-search]").addEventListener("input", function (event) { filters.query = event.target.value.trim().toLowerCase(); applyFilters(); });
  document.querySelector("[data-filter-status]").addEventListener("change", function (event) { filters.status = event.target.value; applyFilters(); });
  document.querySelector("[data-filter-type]").addEventListener("change", function (event) { filters.type = event.target.value; applyFilters(); });
  document.querySelector("[data-filter-signal]").addEventListener("change", function (event) { filters.signal = event.target.value; applyFilters(); });
  document.querySelector("[data-filters-toggle]").addEventListener("click", function (event) {
    const toolbar = event.currentTarget.closest(".review-toolbar");
    const open = toolbar.classList.toggle("is-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  document.querySelector("[data-expand-all]").addEventListener("click", function () { root.querySelectorAll("[data-review-module]").forEach((module) => setModuleCollapsed(module, false)); });
  document.querySelector("[data-collapse-all]").addEventListener("click", function () { root.querySelectorAll("[data-review-module]").forEach((module) => setModuleCollapsed(module, true)); });
  document.querySelector("[data-export-review]").addEventListener("click", downloadReview);
  document.querySelector("[data-copy-summary]").addEventListener("click", copySummary);
  document.querySelector("[data-import-review]").addEventListener("click", function () { document.querySelector("[data-import-file]").click(); });
  document.querySelector("[data-import-file]").addEventListener("change", function (event) {
    const file = event.target.files?.[0];
    if (file) importReview(file);
    event.target.value = "";
  });

  window.addEventListener("storage", function (event) {
    if (!data || !state || ![STORAGE_KEY, BACKUP_KEY].includes(event.key)) return;
    const incoming = parseStoredState(event.newValue);
    if (!incoming) return;
    const before = sealState(state).checksum;
    const merged = mergeStates(state, incoming, new Set(itemById.keys()), data.versions);
    if (sealState(merged).checksum === before) return;
    state = merged;
    persistState("Синхронизировано между вкладками и сохранено");
    render();
    showActionStatus("Подтянута более свежая версия из другой вкладки.");
  });

  async function init() {
    const [response, databaseState] = await Promise.all([
      fetch("/course/ffstart-review-data.json", { cache: "no-store" }),
      readDatabaseState()
    ]);
    if (!response.ok) throw new Error("Карта программы не загрузилась");
    const payload = await response.json();
    {
      data = payload;
      items = flattenData(data);
      itemById = new Map(items.map((item) => [item.reviewId, item]));
      const recoveredStates = [...readLocalStates(), databaseState].filter(Boolean);
      const knownIds = new Set(itemById.keys());
      state = recoveredStates.reduce(
        (merged, candidate) => mergeStates(merged, candidate, knownIds, data.versions),
        normalizeState(null, knownIds, data.versions)
      );
      document.querySelector("[data-structure-counts]").textContent = `${data.totals.modules} модулей · ${data.totals.lessons} уроков · ${data.totals.playSessions} игровых пауз`;
      render();
      if (recoveredStates.length) persistState("Сохранённое ревью собрано и защищено резервными копиями");
    }
  }

  init().catch(function (error) {
      root.removeAttribute("aria-busy");
      root.innerHTML = `<div class="review-empty" role="alert">${escapeHtml(error.message)}. Обнови страницу после сборки FF Start.</div>`;
  });
})();
