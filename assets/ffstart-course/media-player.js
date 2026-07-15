(function () {
  "use strict";

  const rootScope = typeof window !== "undefined" ? window : globalThis;
  const VERSION = "ffstart-media-player-v5";
  const instances = new WeakMap();
  const transcriptCache = new Map();
  const captionChunkCache = new WeakMap();
  let vimeoApiPromise = null;

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
    return token || fallback || "media";
  }

  function safeUrl(value, kind) {
    const raw = clean(value);
    if (!raw) return "";
    if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")) {
      return kind === "embed" || kind === "fallback" ? "" : raw;
    }
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") return "";
      if ((kind === "video" || kind === "audio") && url.hostname === "cdn.funfarm.name") return url.href;
      if (kind === "embed" && url.hostname === "player.vimeo.com" && /^\/video\/\d+$/u.test(url.pathname) && url.searchParams.get("h")) return url.href;
      if (kind === "fallback" && (url.hostname === "vimeo.com" || url.hostname === "www.vimeo.com")) return url.href;
    } catch (_error) {
      return "";
    }
    return "";
  }

  function guidedEmbedUrl(value) {
    const raw = safeUrl(value, "embed");
    if (!raw) return "";
    const url = new URL(raw);
    url.searchParams.set("controls", "0");
    url.searchParams.set("keyboard", "0");
    url.searchParams.set("autopause", "1");
    return url.href;
  }

  function normalizeStartSeconds(value, durationSeconds) {
    const start = Math.max(0, Number(value) || 0);
    const duration = Math.max(0, Number(durationSeconds) || 0);
    return duration > 0 ? Math.min(start, Math.max(0, duration - 0.001)) : start;
  }

  function withStartTime(value, seconds) {
    const start = Math.max(0, Number(seconds) || 0);
    if (!value || !start) return value;
    const url = new URL(value);
    const token = String(Math.round(start * 1000) / 1000);
    url.hash = `t=${token}s`;
    return url.href;
  }

  function playbackFloor(item, seconds) {
    return Math.max(Number(item && item.startAtSeconds) || 0, Number(seconds) || 0);
  }

  function durationLabel(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const rest = total % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  function normalizeLearning(value, durationSeconds) {
    const input = value && typeof value === "object" ? value : {};
    const checkpoints = asArray(input.checkpoints).map(function (checkpoint) {
      const item = checkpoint && typeof checkpoint === "object" ? checkpoint : {};
      const start = Math.max(0, Math.min(Number(durationSeconds) || 0, Number(item.start) || 0));
      const rawEnd = Number(item.end);
      return {
        start,
        end: Number.isFinite(rawEnd) && rawEnd > start ? Math.min(Number(durationSeconds) || rawEnd, rawEnd) : null,
        title: clean(item.title),
        body: clean(item.body)
      };
    }).filter(function (checkpoint) {
      return checkpoint.title && checkpoint.body;
    });
    const learning = {
      title: clean(input.title),
      body: clean(input.body),
      rule: clean(input.rule),
      boundary: clean(input.boundary),
      playback: clean(input.playback),
      watchFor: clean(input.watchFor),
      practiceCue: clean(input.practiceCue),
      checkpoints
    };
    return learning.title && learning.body && learning.rule && learning.watchFor && learning.practiceCue && checkpoints.length
      ? learning
      : null;
  }

  function normalizeItem(input, index) {
    const item = input && typeof input === "object" ? input : {};
    const videoUrl = safeUrl(item.videoUrl || item.video, "video");
    const sourceEmbedUrl = safeUrl(item.embedUrl, "embed");
    if (!videoUrl && !sourceEmbedUrl) throw new Error(`media item ${index + 1} needs an approved video source`);
    const id = safeToken(item.id, `video-${index + 1}`);
    const title = clean(item.title);
    if (!title) throw new Error(`media item ${index + 1} needs a title`);
    const durationSeconds = Math.max(0, Number(item.durationSeconds) || 0);
    const startAtSeconds = normalizeStartSeconds(item.startAtSeconds, durationSeconds);
    const learning = normalizeLearning(item.learning, durationSeconds);
    const guidedPlayback = learning && learning.playback === "guided-excerpts";
    return {
      id,
      title,
      summary: clean(item.summary),
      eyebrow: clean(item.eyebrow || "Видео-разбор"),
      videoUrl,
      embedUrl: withStartTime(guidedPlayback ? guidedEmbedUrl(sourceEmbedUrl) : sourceEmbedUrl, startAtSeconds),
      audioUrl: safeUrl(item.audioUrl, "audio") || videoUrl,
      fallbackUrl: withStartTime(safeUrl(item.fallbackUrl, "fallback"), startAtSeconds),
      posterUrl: safeUrl(item.posterUrl, "asset"),
      captionsUrl: item.captionsStatus === "reviewed" ? safeUrl(item.captionsUrl, "asset") : "",
      transcriptUrl: item.transcriptStatus === "reviewed" ? safeUrl(item.transcriptUrl, "asset") : "",
      durationSeconds,
      startAtSeconds,
      learning,
      guidedPlayback,
      longForm: Boolean(item.longForm)
    };
  }

  function normalizeItems(value) {
    return asArray(value).map(normalizeItem);
  }

  function learningMarkup(item, options) {
    if (!item.learning) return "";
    const checkpoints = item.learning.checkpoints.map(function (checkpoint, index) {
      return `<li><button type="button" data-media-seek="${checkpoint.start}" aria-label="Перейти к ${escapeHtml(durationLabel(checkpoint.start))}"><span>${escapeHtml(durationLabel(checkpoint.start))}</span><small>момент ${index + 1}</small></button><div><strong>${escapeHtml(checkpoint.title)}</strong><p>${escapeHtml(checkpoint.body)}</p></div></li>`;
    }).join("");
    const practiceTarget = clean(options && options.practiceTarget);
    const exactPractice = asArray(options && options.practiceMediaIds).map(clean).includes(item.id);
    const hidePractice = asArray(options && options.hidePracticeForMediaIds).map(clean).includes(item.id);
    const practiceButton = practiceTarget && !hidePractice
      ? `<button type="button" class="ffstart-btn is-primary" data-go-step="${escapeHtml(practiceTarget)}" data-media-practice="${escapeHtml(item.id)}"${exactPractice ? ' data-media-practice-exact="true"' : ""}>${exactPractice ? "Начать с этого задания →" : "Перейти к практике →"}</button>`
      : "";
    const practice = `<div class="ffstart-media-learning__practice"><div><p class="ffstart-eyebrow">Фокус серии</p><strong>${escapeHtml(item.learning.practiceCue)}</strong></div>${practiceButton}</div>`;
    const boundary = item.learning.boundary
      ? `<p class="ffstart-media-learning__boundary"><span>Граница применения</span>${escapeHtml(item.learning.boundary)}</p>`
      : "";
    return `<section class="ffstart-media-learning" data-media-learning aria-label="Ключевые решения"><header><div><p class="ffstart-eyebrow">Смотри с задачей</p><h4>${escapeHtml(item.learning.watchFor)}</h4></div><p>${escapeHtml(item.learning.body)}</p></header><ol>${checkpoints}</ol><blockquote><span>Правило</span>${escapeHtml(item.learning.rule)}</blockquote>${boundary}${practice}</section>`;
  }

  function itemMarkup(item, options) {
    const guided = item.guidedPlayback;
    const captions = item.captionsUrl
      ? `<track kind="captions" src="${escapeHtml(item.captionsUrl)}" srclang="ru" label="Русский" default>`
      : "";
    const video = item.embedUrl
      ? `<iframe src="${escapeHtml(item.embedUrl)}" title="${escapeHtml(item.title)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"${guided ? ' tabindex="-1"' : ""} data-media-vimeo></iframe>`
      : `<video controls playsinline preload="none"${item.posterUrl ? ` poster="${escapeHtml(item.posterUrl)}"` : ""} data-media-video><source src="${escapeHtml(item.videoUrl)}" type="video/mp4">${captions}Ваш браузер не поддерживает видео.</video>`;
    const liveCaptions = item.transcriptUrl
      ? '<p class="ffstart-media-live-caption" data-media-live-caption hidden></p>'
      : "";
    const captionToggle = item.transcriptUrl
      ? '<button type="button" class="ffstart-media-caption-toggle is-active" data-media-captions aria-pressed="true">Субтитры</button>'
      : "";
    const fallback = !guided && item.fallbackUrl
      ? `<a class="ffstart-media-fallback" href="${escapeHtml(item.fallbackUrl)}" target="_blank" rel="noopener">Открыть отдельно ↗</a>`
      : "";
    const transcript = !guided && item.transcriptUrl
      ? `<details class="ffstart-media-transcript" data-media-transcript><summary>Текст видео <span>по времени</span></summary><div class="ffstart-media-transcript__body" data-media-transcript-body data-source="${escapeHtml(item.transcriptUrl)}" data-start-at="${escapeHtml(item.startAtSeconds)}"><p role="status">Текст загрузится при открытии.</p></div></details>`
      : "";
    const audioType = /\.m4a(?:[?#]|$)/i.test(item.audioUrl) ? "audio/mp4" : "video/mp4";
    const modeControls = guided
      ? '<p class="ffstart-media-guided-note">Включай только отмеченные фрагменты кнопками выше.</p>'
      : '<div class="ffstart-media-modes" role="group" aria-label="Формат воспроизведения"><button type="button" class="is-active" data-media-mode="video" aria-pressed="true">Смотреть</button><button type="button" data-media-mode="audio" aria-pressed="false">Только слушать</button></div>';
    const audio = guided
      ? ""
      : `<div class="ffstart-media-audio-wrap" data-media-audio-wrap hidden><audio controls preload="none" data-media-audio><source src="${escapeHtml(item.audioUrl)}" type="${audioType}">Ваш браузер не поддерживает аудио.</audio></div>`;
    return `<article class="ffstart-media-item${item.longForm ? " is-long-form" : ""}${guided ? " is-guided" : ""}" data-media-item="${escapeHtml(item.id)}" data-media-start-at="${escapeHtml(item.startAtSeconds)}"><div class="ffstart-media-copy"><div><p class="ffstart-eyebrow">${escapeHtml(item.eyebrow)}</p><h3>${escapeHtml(item.title)}</h3></div><span>${escapeHtml(durationLabel(item.durationSeconds))}</span>${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}</div>${learningMarkup(item, options)}<div class="ffstart-media-tools">${modeControls}${captionToggle}</div><div class="ffstart-media-video-wrap" data-media-video-wrap>${video}${liveCaptions}</div>${audio}<div class="ffstart-media-support"><p data-media-status aria-live="polite"></p>${fallback}</div>${transcript}</article>`;
  }

  function shellMarkup(items, options) {
    const requestedItemId = clean(options && options.initialItemId);
    const requestedIndex = requestedItemId ? items.findIndex(function (item) { return item.id === requestedItemId; }) : -1;
    const initialIndex = requestedIndex >= 0 ? requestedIndex : 0;
    const initialItem = items[initialIndex];
    const heading = clean(options && options.heading) || "Посмотри полный разбор";
    const body = options && options.body === false
      ? ""
      : clean(options && options.body) || "Видео сохраняет примеры и ход мысли. После разбора собери правило в короткий алгоритм и закрепи его в практике.";
    const tabs = items.length > 1
      ? `<div class="ffstart-media-tabs" role="tablist" aria-label="Видео этого урока">${items.map(function (item, index) {
          return `<button type="button" role="tab" class="${index === initialIndex ? "is-active" : ""}" aria-selected="${index === initialIndex ? "true" : "false"}" aria-controls="ffstart-media-stage" tabindex="${index === initialIndex ? "0" : "-1"}" data-media-select="${index}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(item.title)}<small>${escapeHtml(durationLabel(item.durationSeconds))}</small></button>`;
        }).join("")}</div>`
      : "";
    return `<section class="ffstart-media-library ffstart-panel" data-ffstart-media-player-version="${VERSION}" aria-label="Видео и аудио урока"><header class="ffstart-media-library__head${body ? "" : " is-copyless"}"><div><p class="ffstart-eyebrow">Видео-разбор</p><h2>${escapeHtml(heading)}</h2></div>${body ? `<p>${escapeHtml(body)}</p>` : ""}</header>${tabs}<div id="ffstart-media-stage" role="tabpanel" aria-label="${escapeHtml(initialItem.title)}" data-media-stage>${itemMarkup(initialItem, options)}</div></section>`;
  }

  function setStatus(controller, message) {
    const status = controller.root.querySelector("[data-media-status]");
    if (status) status.textContent = clean(message);
  }

  function postVimeoCommand(iframe, method, value) {
    if (!iframe || !iframe.contentWindow) return false;
    try {
      const message = { method };
      if (value !== undefined) message.value = value;
      iframe.contentWindow.postMessage(message, "https://player.vimeo.com");
      return true;
    } catch (_error) {
      return false;
    }
  }

  function loadVimeoApi() {
    if (rootScope.Vimeo && typeof rootScope.Vimeo.Player === "function") return Promise.resolve(rootScope.Vimeo);
    if (vimeoApiPromise) return vimeoApiPromise;
    const document = rootScope.document;
    if (!document) return Promise.reject(new Error("Vimeo API needs a browser document"));
    vimeoApiPromise = new Promise(function (resolve, reject) {
      let script = document.querySelector('script[data-ffstart-vimeo-api]');
      const discardScript = function () {
        if (script && script.dataset && script.dataset.ffstartVimeoApi === "true" && script.parentNode) script.remove();
      };
      const timeout = rootScope.setTimeout(function () {
        discardScript();
        reject(new Error("Vimeo API timeout"));
      }, 12_000);
      const finish = function () {
        rootScope.clearTimeout(timeout);
        if (rootScope.Vimeo && typeof rootScope.Vimeo.Player === "function") resolve(rootScope.Vimeo);
        else {
          discardScript();
          reject(new Error("Vimeo API did not initialize"));
        }
      };
      const fail = function () {
        rootScope.clearTimeout(timeout);
        discardScript();
        reject(new Error("Vimeo API failed to load"));
      };
      if (!script) {
        script = document.createElement("script");
        script.src = "https://player.vimeo.com/api/player.js";
        script.async = true;
        script.dataset.ffstartVimeoApi = "true";
        script.addEventListener("load", finish, { once: true });
        script.addEventListener("error", fail, { once: true });
        document.head.append(script);
      } else {
        script.addEventListener("load", finish, { once: true });
        script.addEventListener("error", fail, { once: true });
        rootScope.setTimeout(function () {
          if (rootScope.Vimeo && typeof rootScope.Vimeo.Player === "function") finish();
        }, 0);
      }
    }).catch(function (error) {
      vimeoApiPromise = null;
      throw error;
    });
    return vimeoApiPromise;
  }

  function fetchTranscript(source) {
    if (transcriptCache.has(source)) return transcriptCache.get(source);
    const request = fetch(source, { cache: "force-cache" }).then(function (response) {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then(function (payload) {
      if (!asArray(payload && payload.cues).length) throw new Error("Transcript has no cues");
      return payload;
    }).catch(function (error) {
      transcriptCache.delete(source);
      throw error;
    });
    transcriptCache.set(source, request);
    return request;
  }

  function cueAt(cues, seconds) {
    let low = 0;
    let high = cues.length - 1;
    let candidate = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (Number(cues[middle].start) <= seconds) {
        candidate = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (candidate < 0) return null;
    const cue = cues[candidate];
    return seconds <= Number(cue.end) + 0.08 ? cue : null;
  }

  function captionChunks(cue) {
    if (captionChunkCache.has(cue)) return captionChunkCache.get(cue);
    const words = clean(cue && cue.text).split(" ").filter(Boolean);
    const chunks = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= 132 || !current) {
        current = candidate;
      } else {
        chunks.push(current);
        current = word;
      }
    }
    if (current) chunks.push(current);
    const result = chunks.length ? chunks : [""];
    captionChunkCache.set(cue, result);
    return result;
  }

  function captionTextAt(cue, seconds) {
    const chunks = captionChunks(cue);
    if (chunks.length === 1) return chunks[0];
    const start = Number(cue.start) || 0;
    const span = Math.max(0.001, (Number(cue.end) || start) - start);
    const progress = Math.max(0, Math.min(0.999999, (Number(seconds) - start) / span));
    return chunks[Math.min(chunks.length - 1, Math.floor(progress * chunks.length))];
  }

  function updateCaption(controller, seconds) {
    const surface = controller.root.querySelector("[data-media-live-caption]");
    if (!surface) return;
    if (!controller.captionsEnabled) {
      surface.hidden = true;
      surface.textContent = "";
      return;
    }
    const cue = cueAt(controller.cues, Math.max(0, Number(seconds) || 0));
    if (!cue) {
      surface.hidden = true;
      surface.textContent = "";
      return;
    }
    surface.textContent = captionTextAt(cue, seconds);
    surface.hidden = false;
  }

  async function loadCues(controller) {
    const item = controller.items[controller.index];
    const token = controller.itemToken;
    if (!item || !item.transcriptUrl) {
      controller.cues = [];
      return [];
    }
    try {
      const payload = await fetchTranscript(item.transcriptUrl);
      if (controller.destroyed || token !== controller.itemToken) return [];
      controller.cues = asArray(payload.cues);
      return controller.cues;
    } catch (_error) {
      if (token === controller.itemToken) controller.cues = [];
      return [];
    }
  }

  function releaseVimeo(controller) {
    const player = controller.vimeoPlayer;
    const iframe = controller.vimeoIframe || controller.root.querySelector("[data-media-vimeo]");
    postVimeoCommand(iframe, "pause");
    if (controller.startGuardTimer) rootScope.clearInterval(controller.startGuardTimer);
    controller.startGuardTimer = null;
    controller.startChecking = false;
    controller.vimeoPlayer = null;
    controller.vimeoIframe = null;
    controller.vimeoPromise = null;
    controller.startSeeking = false;
    if (!player) return;
    try { player.off("timeupdate"); } catch (_error) { /* iframe may already be gone */ }
    try { player.off("error"); } catch (_error) { /* iframe may already be gone */ }
    try {
      const paused = player.pause();
      if (paused && typeof paused.catch === "function") paused.catch(function () {});
    } catch (_error) { /* iframe may already be gone */ }
  }

  function seekVimeoToStart(controller, player, startAt) {
    if (!player || !(startAt > 0) || controller.startSeeking) return;
    controller.startSeeking = true;
    Promise.resolve(player.setCurrentTime(startAt)).catch(function () {}).finally(function () {
      controller.startSeeking = false;
    });
  }

  function startVimeoGuard(controller, player, token, startAt) {
    if (controller.startGuardTimer) rootScope.clearInterval(controller.startGuardTimer);
    controller.startGuardTimer = null;
    if (!(startAt > 0)) return;
    controller.startGuardTimer = rootScope.setInterval(async function () {
      if (controller.destroyed || token !== controller.itemToken || controller.startChecking) return;
      controller.startChecking = true;
      try {
        const seconds = Number(await player.getCurrentTime()) || 0;
        if (seconds < startAt - 0.08) seekVimeoToStart(controller, player, startAt);
      } catch (_error) {
        /* The time fragment remains the fallback when Vimeo state is unavailable. */
      } finally {
        controller.startChecking = false;
      }
    }, 250);
  }

  async function ensureVimeo(controller) {
    const iframe = controller.root.querySelector("[data-media-vimeo]");
    if (!iframe || controller.destroyed) return null;
    if (controller.vimeoPlayer && controller.vimeoIframe === iframe) return controller.vimeoPlayer;
    if (controller.vimeoPromise && controller.vimeoIframe === iframe) return controller.vimeoPromise;
    controller.vimeoIframe = iframe;
    const token = controller.itemToken;
    controller.vimeoPromise = loadVimeoApi().then(async function (Vimeo) {
      if (controller.destroyed || token !== controller.itemToken || !iframe.isConnected) return null;
      const player = new Vimeo.Player(iframe);
      controller.vimeoPlayer = player;
      const activeItem = controller.items[controller.index];
      player.on("timeupdate", function (event) {
        if (token !== controller.itemToken) return;
        const seconds = Number(event && event.seconds) || 0;
        const startAt = Number(activeItem && activeItem.startAtSeconds) || 0;
        if (startAt > 0 && seconds < startAt - 0.08) {
          seekVimeoToStart(controller, player, startAt);
          return;
        }
        if (activeItem && activeItem.guidedPlayback) {
          const start = Number(controller.guidedStart);
          const end = Number(controller.guidedEnd);
          if (!Number.isFinite(start) || !Number.isFinite(end) || seconds < start - 0.15 || seconds >= end - 0.04) {
            try {
              const paused = player.pause();
              if (paused && typeof paused.catch === "function") paused.catch(function () {});
            } catch (_error) { /* guided iframe is already stopping */ }
            if (Number.isFinite(end) && seconds >= end - 0.04) setStatus(controller, "Фрагмент завершён. Выбери следующий момент или переходи к практике.");
            return;
          }
        }
        updateCaption(controller, seconds);
      });
      player.on("error", function () {
        if (token === controller.itemToken) setStatus(controller, activeItem && activeItem.guidedPlayback
          ? "Безопасный фрагмент не открылся. Обнови страницу и попробуй ещё раз."
          : "Видео не открылось здесь — открой его отдельно.");
      });
      await player.ready();
      const startAt = Number(activeItem && activeItem.startAtSeconds) || 0;
      if (startAt > 0) {
        try {
          const current = Number(await player.getCurrentTime()) || 0;
          if (current < startAt - 0.08) {
            await player.setCurrentTime(startAt);
            await player.pause();
          }
        } catch (_error) { /* the time fragment and timeupdate guard remain active */ }
      }
      startVimeoGuard(controller, player, token, startAt);
      return player;
    }).catch(function () {
      if (token === controller.itemToken) {
        const failedPlayer = controller.vimeoPlayer;
        if (failedPlayer) {
          try { failedPlayer.off("timeupdate"); } catch (_error) { /* failed player may never have become ready */ }
          try { failedPlayer.off("error"); } catch (_error) { /* failed player may never have become ready */ }
        }
        postVimeoCommand(iframe, "pause");
        controller.vimeoPlayer = null;
        controller.vimeoPromise = null;
        controller.vimeoIframe = null;
        setStatus(controller, controller.items[controller.index]?.guidedPlayback
          ? "Безопасные фрагменты не открылись. Обнови страницу и попробуй ещё раз."
          : "Видео работает во встроенном окне; синхронизация с текстом сейчас недоступна.");
      }
      return null;
    });
    return controller.vimeoPromise;
  }

  function nativeState(player) {
    return {
      seconds: Number.isFinite(player && player.currentTime) ? player.currentTime : 0,
      playing: Boolean(player && !player.paused && !player.ended),
      synchronized: true
    };
  }

  async function videoState(controller) {
    const native = controller.root.querySelector("[data-media-video]");
    if (native) return nativeState(native);
    const player = controller.vimeoPlayer || await Promise.race([
      ensureVimeo(controller),
      new Promise(function (resolve) { rootScope.setTimeout(function () { resolve(null); }, 1_200); })
    ]);
    if (!player) return { seconds: 0, playing: false, synchronized: false };
    try {
      const values = await Promise.all([player.getCurrentTime(), player.getPaused()]);
      return { seconds: Number(values[0]) || 0, playing: !values[1], synchronized: true };
    } catch (_error) {
      return { seconds: 0, playing: false, synchronized: false };
    }
  }

  function seekNative(player, seconds) {
    const start = Math.max(0, Number(seconds) || 0);
    try {
      player.currentTime = start;
    } catch (_error) {
      player.addEventListener("loadedmetadata", function () {
        try { player.currentTime = start; } catch (_syncError) { /* native controls remain usable */ }
      }, { once: true });
    }
  }

  function enforceNativeStart(player, seconds) {
    const start = Math.max(0, Number(seconds) || 0);
    if (!player || !start) return;
    const enforce = function () {
      if (!Number.isFinite(player.currentTime) || player.currentTime >= start - 0.08) return;
      seekNative(player, start);
    };
    seekNative(player, start);
    player.addEventListener("loadedmetadata", enforce);
    player.addEventListener("play", enforce);
    player.addEventListener("seeking", enforce);
    player.addEventListener("timeupdate", enforce);
  }

  function playNative(controller, player) {
    try {
      const played = player.play();
      if (played && typeof played.catch === "function") played.catch(function () {
        setStatus(controller, "Нажми воспроизведение, чтобы продолжить с выбранного места.");
      });
    } catch (_error) {
      setStatus(controller, "Нажми воспроизведение, чтобы продолжить с выбранного места.");
    }
  }

  function pauseNative(root) {
    Array.from(root.querySelectorAll("video,audio")).forEach(function (player) {
      try { player.pause(); } catch (_error) { /* media may not be ready yet */ }
    });
  }

  function pauseWithin(root) {
    pauseNative(root);
    const controller = instances.get(root);
    if (!controller) return;
    if (!controller.vimeoPlayer) {
      postVimeoCommand(controller.vimeoIframe || root.querySelector("[data-media-vimeo]"), "pause");
      return;
    }
    try {
      const paused = controller.vimeoPlayer.pause();
      if (paused && typeof paused.catch === "function") paused.catch(function () { postVimeoCommand(controller.vimeoIframe || root.querySelector("[data-media-vimeo]"), "pause"); });
    } catch (_error) {
      postVimeoCommand(controller.vimeoIframe || root.querySelector("[data-media-vimeo]"), "pause");
    }
  }

  async function setMode(controller, mode) {
    if (!['video', 'audio'].includes(mode) || controller.mode === mode) return;
    const request = ++controller.modeRequest;
    const audio = controller.root.querySelector("[data-media-audio]");
    const video = controller.root.querySelector("[data-media-video]");
    const videoWrap = controller.root.querySelector("[data-media-video-wrap]");
    const audioWrap = controller.root.querySelector("[data-media-audio-wrap]");
    if (!audio || !videoWrap || !audioWrap) return;
    const state = controller.mode === "audio" ? nativeState(audio) : await videoState(controller);
    if (request !== controller.modeRequest || controller.destroyed) return;
    if (controller.mode === "audio") audio.pause();
    else if (video) video.pause();
    else if (controller.vimeoPlayer) {
      try { await controller.vimeoPlayer.pause(); } catch (_error) { postVimeoCommand(controller.vimeoIframe || controller.root.querySelector("[data-media-vimeo]"), "pause"); }
    } else postVimeoCommand(controller.vimeoIframe || controller.root.querySelector("[data-media-vimeo]"), "pause");
    controller.mode = mode;
    const toAudio = mode === "audio";
    videoWrap.hidden = toAudio;
    audioWrap.hidden = !toAudio;
    Array.from(controller.root.querySelectorAll("[data-media-mode]")).forEach(function (button) {
      const active = button.dataset.mediaMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (!state.synchronized) {
      setStatus(controller, "Режим переключён. Позицию выбери в плеере вручную.");
      return;
    }
    const item = controller.items[controller.index];
    const targetSeconds = playbackFloor(item, state.seconds);
    if (toAudio) {
      seekNative(audio, targetSeconds);
      updateCaption(controller, targetSeconds);
      if (state.playing) playNative(controller, audio);
      return;
    }
    if (video) {
      seekNative(video, targetSeconds);
      updateCaption(controller, targetSeconds);
      if (state.playing) playNative(controller, video);
      return;
    }
    const player = await ensureVimeo(controller);
    if (!player || request !== controller.modeRequest || controller.mode !== "video") return;
    try {
      await player.setCurrentTime(targetSeconds);
      if (request !== controller.modeRequest || controller.mode !== "video") {
        await player.pause();
        return;
      }
      if (state.playing) await player.play();
      else await player.pause();
      updateCaption(controller, targetSeconds);
    } catch (_error) {
      setStatus(controller, "Нажми воспроизведение, чтобы продолжить с этого места.");
    }
  }

  async function playAt(controller, seconds) {
    const item = controller.items[controller.index];
    const start = playbackFloor(item, seconds);
    if (item && item.guidedPlayback) {
      const checkpoint = item.learning && item.learning.checkpoints.find(function (entry) { return Math.abs(entry.start - start) <= 0.06; });
      if (!checkpoint || !Number.isFinite(checkpoint.end)) {
        setStatus(controller, "Этот фрагмент недоступен. Выбери одну из отмеченных остановок.");
        return;
      }
      controller.guidedStart = checkpoint.start;
      controller.guidedEnd = checkpoint.end;
    }
    setStatus(controller, "");
    if (controller.mode === "audio") {
      const audio = controller.root.querySelector("[data-media-audio]");
      if (!audio) return;
      seekNative(audio, start);
      updateCaption(controller, start);
      playNative(controller, audio);
      return;
    }
    const native = controller.root.querySelector("[data-media-video]");
    if (native) {
      seekNative(native, start);
      updateCaption(controller, start);
      playNative(controller, native);
      return;
    }
    const player = await ensureVimeo(controller);
    if (!player) {
      const iframe = controller.root.querySelector("[data-media-vimeo]");
      if (!item?.guidedPlayback && postVimeoCommand(iframe, "setCurrentTime", start)) {
        postVimeoCommand(iframe, "play");
        setStatus(controller, "Открываем выбранный момент во встроенном плеере.");
      } else {
        setStatus(controller, item?.guidedPlayback
          ? "Безопасный фрагмент не открылся. Обнови страницу и попробуй ещё раз."
          : "Выбери этот таймкод в видеоплеере или включи режим «Только слушать».");
      }
      return;
    }
    try {
      await player.setCurrentTime(start);
      await player.play();
      updateCaption(controller, start);
    } catch (_error) {
      setStatus(controller, "Нажми воспроизведение, чтобы продолжить с выбранного места.");
    }
  }

  function renderTranscript(body, payload, startAtSeconds) {
    const floor = Math.max(0, Number(startAtSeconds) || 0);
    const cues = asArray(payload && payload.cues).filter(function (cue) {
      return Number(cue && cue.end) > floor;
    });
    if (!cues.length) {
      body.innerHTML = '<p role="status">Текст видео не загрузился — обнови страницу или продолжи просмотр с субтитрами.</p>';
      return;
    }
    body.innerHTML = `<ol>${cues.map(function (cue) {
      const start = Math.max(floor, Number(cue.start) || 0);
      return `<li><button type="button" data-media-seek="${start}" aria-label="Перейти к ${escapeHtml(durationLabel(start))}">${escapeHtml(durationLabel(start))}</button><p>${escapeHtml(cue.text)}</p></li>`;
    }).join("")}</ol>`;
  }

  async function loadTranscript(details) {
    const body = details.querySelector("[data-media-transcript-body]");
    if (!body || body.dataset.loaded === "true" || body.dataset.loading === "true") return;
    body.dataset.loading = "true";
    body.innerHTML = '<p role="status">Загружаем текст…</p>';
    try {
      const payload = await fetchTranscript(body.dataset.source);
      renderTranscript(body, payload, body.dataset.startAt);
      body.dataset.loaded = "true";
    } catch (_error) {
      body.innerHTML = '<p role="alert">Не удалось загрузить текст. Само видео продолжает работать.</p>';
    } finally {
      delete body.dataset.loading;
    }
  }

  async function toggleCaptions(controller) {
    controller.captionsEnabled = !controller.captionsEnabled;
    const button = controller.root.querySelector("[data-media-captions]");
    if (button) {
      button.classList.toggle("is-active", controller.captionsEnabled);
      button.setAttribute("aria-pressed", controller.captionsEnabled ? "true" : "false");
    }
    if (!controller.captionsEnabled) {
      updateCaption(controller, 0);
      return;
    }
    if (!controller.cues.length) await loadCues(controller);
    const state = controller.mode === "audio"
      ? nativeState(controller.root.querySelector("[data-media-audio]"))
      : await videoState(controller);
    updateCaption(controller, state.seconds);
  }

  function setupCurrentItem(controller) {
    const token = controller.itemToken;
    const item = controller.items[controller.index];
    const audio = controller.root.querySelector("[data-media-audio]");
    const video = controller.root.querySelector("[data-media-video]");
    enforceNativeStart(audio, item && item.startAtSeconds);
    enforceNativeStart(video, item && item.startAtSeconds);
    if (audio) audio.addEventListener("timeupdate", function () {
      if (token === controller.itemToken && controller.mode === "audio") updateCaption(controller, audio.currentTime);
    });
    if (video) video.addEventListener("timeupdate", function () {
      if (token === controller.itemToken && controller.mode === "video") updateCaption(controller, video.currentTime);
    });
    loadCues(controller);
    if (controller.root.querySelector("[data-media-vimeo]")) ensureVimeo(controller);
  }

  function notifySelected(controller) {
    const handler = controller.options && controller.options.onSelect;
    if (typeof handler !== "function") return;
    try {
      handler({ index: controller.index, item: controller.items[controller.index] });
    } catch (_error) {
      /* An optional lesson integration must never break media controls. */
    }
  }

  function renderSelected(controller, index) {
    pauseWithin(controller.root);
    releaseVimeo(controller);
    controller.index = Math.max(0, Math.min(controller.items.length - 1, Number(index) || 0));
    controller.itemToken += 1;
    controller.mode = "video";
    controller.modeRequest += 1;
    controller.captionsEnabled = true;
    controller.cues = [];
    controller.guidedStart = null;
    controller.guidedEnd = null;
    controller.startSeeking = false;
    controller.startChecking = false;
    const stage = controller.root.querySelector("[data-media-stage]");
    if (!stage) return;
    stage.innerHTML = itemMarkup(controller.items[controller.index], controller.options);
    stage.setAttribute("aria-label", controller.items[controller.index].title);
    Array.from(controller.root.querySelectorAll("[data-media-select]")).forEach(function (button, buttonIndex) {
      const active = buttonIndex === controller.index;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
    setupCurrentItem(controller);
    notifySelected(controller);
  }

  function destroy(controller) {
    controller.destroyed = true;
    pauseWithin(controller.root);
    releaseVimeo(controller);
    controller.root.removeEventListener("click", controller.click);
    controller.root.removeEventListener("toggle", controller.toggle, true);
    controller.root.removeEventListener("error", controller.error, true);
    controller.root.removeEventListener("keydown", controller.keydown);
    instances.delete(controller.root);
  }

  function mount(target, configuration) {
    const root = typeof target === "string" ? rootScope.document && rootScope.document.querySelector(target) : target;
    if (!root || !root.ownerDocument) throw new Error("FFStartCourseMedia root was not found");
    if (instances.has(root)) destroy(instances.get(root));
    const config = configuration && typeof configuration === "object" ? configuration : {};
    const items = normalizeItems(config.items);
    if (!items.length) {
      root.hidden = true;
      return { pause: function () {}, destroy: function () {} };
    }
    root.hidden = false;
    const requestedIndex = clean(config.initialItemId) ? items.findIndex(function (item) { return item.id === clean(config.initialItemId); }) : -1;
    const initialIndex = requestedIndex >= 0 ? requestedIndex : 0;
    root.innerHTML = shellMarkup(items, config);
    const controller = {
      root,
      items,
      index: initialIndex,
      itemToken: 1,
      mode: "video",
      modeRequest: 0,
      captionsEnabled: true,
      cues: [],
      vimeoPlayer: null,
      vimeoIframe: null,
      vimeoPromise: null,
      guidedStart: null,
      guidedEnd: null,
      startSeeking: false,
      startChecking: false,
      startGuardTimer: null,
      destroyed: false,
      options: config,
      click: null,
      toggle: null,
      error: null,
      keydown: null
    };
    controller.click = function (event) {
      const select = event.target.closest && event.target.closest("[data-media-select]");
      if (select && root.contains(select)) { renderSelected(controller, Number(select.dataset.mediaSelect)); return; }
      const mode = event.target.closest && event.target.closest("[data-media-mode]");
      if (mode && root.contains(mode)) { setMode(controller, mode.dataset.mediaMode); return; }
      const captions = event.target.closest && event.target.closest("[data-media-captions]");
      if (captions && root.contains(captions)) { toggleCaptions(controller); return; }
      const seek = event.target.closest && event.target.closest("[data-media-seek]");
      if (seek && root.contains(seek)) playAt(controller, seek.dataset.mediaSeek);
    };
    controller.toggle = function (event) {
      if (event.target.matches && event.target.matches("[data-media-transcript]") && event.target.open) loadTranscript(event.target);
    };
    controller.error = function (event) {
      if (!event.target.matches || !event.target.matches("video,audio")) return;
      setStatus(controller, event.target.matches("audio")
        ? "Аудиодорожка не загрузилась — видео остаётся доступно."
        : "Запись не загрузилась здесь — открой видео по отдельной ссылке.");
    };
    controller.keydown = function (event) {
      const selected = event.target.closest && event.target.closest("[data-media-select]");
      if (!selected || !root.contains(selected) || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = Array.from(root.querySelectorAll("[data-media-select]"));
      if (tabs.length < 2) return;
      event.preventDefault();
      const current = tabs.indexOf(selected);
      const next = event.key === "Home" ? 0
        : event.key === "End" ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      renderSelected(controller, next);
      tabs[next].focus();
    };
    root.addEventListener("click", controller.click);
    root.addEventListener("toggle", controller.toggle, true);
    root.addEventListener("error", controller.error, true);
    root.addEventListener("keydown", controller.keydown);
    instances.set(root, controller);
    setupCurrentItem(controller);
    notifySelected(controller);
    return {
      version: VERSION,
      pause: function () { pauseWithin(root); },
      destroy: function () { destroy(controller); }
    };
  }

  const api = {
    version: VERSION,
    mount,
    normalizeItems,
    durationLabel,
    pauseWithin,
    __test: { safeUrl, shellMarkup, itemMarkup, cueAt, captionChunks, captionTextAt, normalizeStartSeconds, withStartTime, playbackFloor, renderTranscript }
  };

  rootScope.FFStartCourseMedia = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
