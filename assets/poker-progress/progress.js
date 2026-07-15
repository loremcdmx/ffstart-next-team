(function () {
  "use strict";

  const STORAGE_KEY = "ff-player-progress-v1";
  const DEFAULT_PROFILE_ID = "guest";
  const AUTH_SESSION_ENDPOINT = "/api/auth/session";
  const AUTH_GOOGLE_START_ENDPOINT = "/api/auth/google/start";
  const AUTH_LOGOUT_ENDPOINT = "/api/auth/logout";
  const GOOGLE_AUTH_UI_VISIBLE = false;
  const TRAINER_EVENTS_ENDPOINT = "/api/trainer-events";
  const TRAINER_EVENTS_SCHEMA = "ff-trainer-event-v1";
  const TRAINER_EVENTS_STORAGE_KEY = "ff-trainer-events-v1";
  const TRAINER_EVENTS_ARCHIVE_LIMIT = 200;
  const TRAINER_EVENTS_BATCH_LIMIT = 25;
  const TRAINER_EVENTS_MAX_ATTEMPTS = 5;
  const TRAINER_EVENTS_STALE_SENDING_MS = 30_000;
  const TRAINER_EVENT_CLIENT_SESSION_ID = `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let trainerEventAutoFlushTimer = 0;
  const VALID_STATUSES = new Set(["locked", "open", "in_progress", "passed", "repeat"]);
  const authState = {
    loaded: false,
    loading: false,
    configured: false,
    authenticated: false,
    user: null,
    message: ""
  };
  const SKILL_CONFIG = {
    start: { threshold: 75, next: "combos", title: "Первая раздача" },
    combos: { threshold: 90, next: "positions", title: "Комбинации" },
    positions: { threshold: 85, next: "hands", title: "Позиции" },
    hands: { threshold: 85, next: "tournament", title: "Стартовые руки" },
    chart: { threshold: 85, next: "open_first", title: "Чарт рук" },
    tournament: { threshold: 75, next: "range_call", title: "Турнирный навигатор" },
    range_call: { threshold: 75, next: "open_first", title: "Range Lab" },
    opens: { threshold: 80, next: "isolation", title: "Префлоп-решения" },
    open_first: { threshold: 80, next: "isolation", title: "Первое открытие" },
    isolation: { threshold: 75, next: "vs_3bet", title: "Изолейты" },
    vs_3bet: { threshold: 75, next: "math", title: "3-беты" },
    squeeze: { threshold: 80, next: "flop", title: "Squeeze Lab" },
    // ABI6 roadmap order: math (цена/ауты) is a prerequisite for bb_defense
    // (taught as a price decision) and for short (shove odds). Short stack and
    // ICM come before postflop because turbo/PKO fields live under 20bb.
    math: { threshold: 75, next: "bb_defense", title: "Цена колла и ауты" },
    bb_defense: { threshold: 78, next: "short", title: "Защита большого блайнда" },
    short: { threshold: 75, next: "icm_short", title: "Короткий стек" },
    icm_short: { threshold: 75, next: "flop", title: "ICM и пузырь" },
    flop: { threshold: 75, next: "review", title: "Флоп" },
    river_cbet: { threshold: 75, next: "review", title: "Ривер c-bet" },
    table_decision: { threshold: 75, next: "review", title: "Стол + решение" },
    simulator: { threshold: 75, next: "review", title: "Симулятор" },
    review: { threshold: 75, next: "exam", title: "Разбор ошибок" },
    exam: { threshold: 80, next: null, title: "Зачет ABI6" }
  };
  const SKILL_ALIASES = {
    first_hand: "start",
    combinations: "combos",
    chartLesson: "chart",
    hand_chart: "chart",
    starting_hands: "hands",
    preflop: "opens",
    bb: "bb_defense",
    riverCbet: "river_cbet",
    tableDecision: "table_decision"
  };

  // Default linear roadmap derived from the SKILL_CONFIG `next` spine (start -> exam)
  // so getNextRecommendation() without an explicit order can never silently drift
  // out of sync with SKILL_CONFIG. Branch-only skills (chart, open_first, river_cbet,
  // table_decision, simulator) fold back into this spine via their own `next`, so the
  // walk reproduces the current ABI6 Player Path default. Computed once at module init.
  const DEFAULT_PATH_ORDER = (() => {
    const order = [];
    const seen = new Set();
    let key = "start";
    while (key && SKILL_CONFIG[key] && !seen.has(key)) {
      order.push(key);
      seen.add(key);
      key = SKILL_CONFIG[key].next;
    }
    return order;
  })();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function skillKeyFor(skillKey) {
    const raw = String(skillKey || "").trim();
    return SKILL_ALIASES[raw] || raw;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeProfileName(name, fallback = "Гость") {
    const normalized = String(name || "").replace(/\s+/g, " ").trim().slice(0, 32);
    return normalized || fallback;
  }

  function normalizeEmail(email) {
    return String(email || "").replace(/\s+/g, "").trim().toLowerCase().slice(0, 120);
  }

  function normalizeAvatarUrl(url) {
    const normalized = String(url || "").trim().slice(0, 520);
    return /^https:\/\/[a-z0-9.-]+\//i.test(normalized) ? normalized : "";
  }

  function createProfileId() {
    return `player_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function profileShell(id = DEFAULT_PROFILE_ID, name = "Гость", skills = {}) {
    const timestamp = nowIso();
    return {
      id,
      name: normalizeProfileName(name),
      authProvider: null,
      email: "",
      avatarUrl: "",
      authenticated: false,
      createdAt: timestamp,
      updatedAt: null,
      skills: skills && typeof skills === "object" ? skills : {}
    };
  }

  function normalizeProfile(raw, fallbackId, fallbackSkills = {}) {
    const id = String(raw?.id || fallbackId || createProfileId());
    const profile = profileShell(id, raw?.name || (id === DEFAULT_PROFILE_ID ? "Гость" : "Игрок"));
    profile.authProvider = raw?.authProvider === "google" ? "google" : null;
    profile.email = normalizeEmail(raw?.email);
    profile.avatarUrl = normalizeAvatarUrl(raw?.avatarUrl || raw?.picture);
    profile.authenticated = profile.authProvider === "google" && Boolean(profile.email);
    profile.createdAt = typeof raw?.createdAt === "string" ? raw.createdAt : profile.createdAt;
    profile.updatedAt = typeof raw?.updatedAt === "string" ? raw.updatedAt : null;
    profile.skills = raw?.skills && typeof raw.skills === "object"
      ? cloneSkills(raw.skills)
      : fallbackSkills && typeof fallbackSkills === "object"
        ? cloneSkills(fallbackSkills)
        : {};
    return profile;
  }

  function activeProfile(store) {
    const activeId = store?.activeProfileId || DEFAULT_PROFILE_ID;
    return store?.profiles?.[activeId] || store?.profiles?.[DEFAULT_PROFILE_ID] || profileShell();
  }

  function normalizeStore(parsed) {
    const legacySkills = parsed?.skills && typeof parsed.skills === "object" ? parsed.skills : {};
    const profiles = {};

    if (parsed?.profiles && typeof parsed.profiles === "object") {
      Object.entries(parsed.profiles).forEach(([id, profile]) => {
        const normalized = normalizeProfile(profile, id);
        profiles[normalized.id] = normalized;
      });
    }

    if (!Object.keys(profiles).length) {
      const guest = profileShell(DEFAULT_PROFILE_ID, "Гость", cloneSkills(legacySkills));
      profiles[guest.id] = guest;
    }

    const activeId = profiles[parsed?.activeProfileId] ? parsed.activeProfileId : Object.keys(profiles)[0] || DEFAULT_PROFILE_ID;
    if (!profiles[activeId]) profiles[activeId] = profileShell(activeId);
    // NOTE: the top-level `skills` field is only a legacy v1 carrier and, once a
    // v2 `profiles` map exists, a redundant mirror of the *active* profile. It is
    // migrated into the guest above (when there were no profiles at all); we must
    // NOT re-apply it to whatever profile is active here, or a named profile's
    // progress would leak into the guest (and vice versa) on profile switches.

    return {
      version: 2,
      activeProfileId: activeId,
      updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : null,
      // Legacy compatibility mirror of the active profile's skills. Cloned so
      // callers mutating store.skills cannot accidentally mutate the profile.
      skills: cloneSkills(profiles[activeId].skills),
      profiles
    };
  }

  function emptyStore() {
    return normalizeStore(null);
  }

  function readStore() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return emptyStore();
      return normalizeStore(parsed);
    } catch (error) {
      return emptyStore();
    }
  }

  function writeStore(store) {
    try {
      const normalized = normalizeStore(store);
      const profile = activeProfile(normalized);
      normalized.skills = profile.skills || {};
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return true;
    } catch (error) {
      return false;
    }
  }

  function readNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function readStoredNumber(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function readStoredJson(key) {
    try {
      return JSON.parse(window.localStorage.getItem(key) || "null");
    } catch (error) {
      return null;
    }
  }

  function normalizeErrorCounts(previousCounts, tags) {
    const counts = { ...(previousCounts && typeof previousCounts === "object" ? previousCounts : {}) };
    const list = Array.isArray(tags)
      ? tags
      : typeof tags === "string" && tags
        ? [tags]
        : [];

    list.forEach((tag) => {
      const normalized = String(tag || "").trim();
      if (!normalized) return;
      counts[normalized] = Math.max(0, Number(counts[normalized]) || 0) + 1;
    });

    return counts;
  }

  function weakTagsFromCounts(counts) {
    return Object.entries(counts || {})
      .filter(([, count]) => Number(count) > 0)
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .map(([tag]) => tag);
  }

  function deriveStatus(skillKey, bestScore, attempts, weakTags, explicitStatus) {
    const config = SKILL_CONFIG[skillKey] || {};
    const threshold = Number(config.threshold) || 75;
    if (VALID_STATUSES.has(explicitStatus)) return explicitStatus;
    if (bestScore >= threshold) return "passed";
    if (attempts > 0 && weakTags.length > 0) return "repeat";
    if (attempts > 0 || bestScore > 0) return "in_progress";
    return "open";
  }

  function deriveNextRecommendation(skillKey, status) {
    const config = SKILL_CONFIG[skillKey] || {};
    if (status === "passed") return config.next || null;
    if (status === "repeat") return `${skillKey}.repeat`;
    return skillKey;
  }

  function normalizeResult(skillKey, input, previous) {
    const now = new Date().toISOString();
    const attempts = Math.max(0, Math.round(readNumber(input?.attempts, previous?.attempts || 0)));
    if (input?.evaluated === false) {
      const errorCounts = normalizeErrorCounts(previous?.errorCounts, input?.errorTags);
      const weakErrorTags = weakTagsFromCounts(errorCounts);
      const status = deriveStatus(skillKey, 0, attempts, weakErrorTags, input?.status);
      return {
        skillKey,
        evaluated: false,
        completed: input?.completed === true || status === "passed",
        completedHands: Math.max(0, Math.round(readNumber(input?.completedHands, attempts))),
        targetHands: Math.max(0, Math.round(readNumber(input?.targetHands ?? input?.total, attempts))),
        attempts,
        correct: null,
        score: null,
        bestScore: null,
        status,
        streak: 0,
        errorCounts,
        weakErrorTags,
        nextRecommendation: input?.nextRecommendation || input?.nextDrill || deriveNextRecommendation(skillKey, status),
        lastSeenAt: now
      };
    }
    const correct = clamp(Math.round(readNumber(input?.correct, previous?.correct || 0)), 0, attempts || 9999);
    const sessionScore = Number.isFinite(Number(input?.bestScore))
      ? clamp(Math.round(Number(input.bestScore)), 0, 100)
      : attempts > 0
        ? clamp(Math.round((correct / attempts) * 100), 0, 100)
        : clamp(Math.round(readNumber(input?.score, previous?.score || 0)), 0, 100);
    const previousBest = clamp(Math.round(readNumber(previous?.bestScore, 0)), 0, 100);
    const bestScore = Math.max(previousBest, sessionScore);
    const errorCounts = normalizeErrorCounts(previous?.errorCounts, input?.errorTags);
    const weakErrorTags = weakTagsFromCounts(errorCounts);
    const status = deriveStatus(skillKey, bestScore, attempts, weakErrorTags, input?.status);
    const nextRecommendation = input?.nextRecommendation || input?.nextDrill || deriveNextRecommendation(skillKey, status);

    return {
      skillKey,
      attempts,
      correct,
      score: sessionScore,
      bestScore,
      status,
      streak: Math.max(0, Math.round(readNumber(input?.streak, previous?.streak || 0))),
      errorCounts,
      weakErrorTags,
      nextRecommendation,
      lastSeenAt: now
    };
  }

  function legacyResult(skillKey, data) {
    const result = normalizeResult(skillKey, data, null);
    return {
      ...result,
      source: "legacy"
    };
  }

  const legacyReaders = {
    start() {
      const progress = readStoredJson("ff-first-hand-story-v1");
      if (!progress || typeof progress.percent !== "number") return null;
      return legacyResult("start", {
        attempts: readNumber(progress.total, 4),
        correct: readNumber(progress.good, 0),
        bestScore: progress.percent,
        status: progress.percent >= SKILL_CONFIG.start.threshold ? "passed" : "repeat",
        nextRecommendation: progress.percent >= SKILL_CONFIG.start.threshold ? "combos" : "start.repeat"
      });
    },

    combos() {
      const best = readStoredNumber("pokerHandsExamBest");
      if (!best || best <= 0) return null;
      const score = clamp(Math.round((best / 10) * 100), 0, 100);
      return legacyResult("combos", {
        attempts: 10,
        correct: clamp(best, 0, 10),
        bestScore: score,
        status: score >= SKILL_CONFIG.combos.threshold ? "passed" : "repeat",
        nextRecommendation: score >= SKILL_CONFIG.combos.threshold ? "positions" : "combos.repeat"
      });
    },

    positions() {
      const mistakes = readStoredNumber("positionTrainerBestMistakes");
      if (mistakes === null || mistakes < 0) return null;
      const total = 5;
      const correct = clamp(total - mistakes, 0, total);
      const score = clamp(100 - mistakes * 16, 20, 100);
      return legacyResult("positions", {
        attempts: total,
        correct,
        bestScore: score,
        errorTags: mistakes > 0 ? Array.from({ length: Math.ceil(mistakes) }, () => "button_order") : [],
        status: score >= SKILL_CONFIG.positions.threshold ? "passed" : "repeat",
        nextRecommendation: score >= SKILL_CONFIG.positions.threshold ? "hands" : "positions.repeat"
      });
    },

    hands() {
      const best = readStoredNumber("preflopTrainerBest");
      if (!best || best <= 0) return null;
      const score = clamp(Math.round((best / 90) * 100), 0, 100);
      return legacyResult("hands", {
        attempts: 90,
        correct: clamp(best, 0, 90),
        bestScore: score,
        status: score >= SKILL_CONFIG.hands.threshold ? "passed" : "repeat",
        nextRecommendation: score >= SKILL_CONFIG.hands.threshold ? "tournament" : "hands.repeat"
      });
    },

    math() {
      let unlocked = false;
      try {
        unlocked = window.localStorage.getItem("expected-value-variance-achievement") === "1";
      } catch (error) {
        unlocked = false;
      }
      if (!unlocked) return null;
      return legacyResult("math", {
        attempts: 1,
        correct: 1,
        bestScore: 50,
        status: "in_progress",
        nextRecommendation: "math"
      });
    }
  };

  function readSkill(skillKey) {
    const canonical = skillKeyFor(skillKey);
    const store = readStore();
    const profile = activeProfile(store);
    const stored = profile.skills?.[canonical] || store.skills[canonical];
    if (stored && typeof stored === "object") {
      return {
        ...stored,
        skillKey: canonical,
        source: "store"
      };
    }

    if (profile.id !== DEFAULT_PROFILE_ID) return null;

    const legacyReader = legacyReaders[canonical];
    return typeof legacyReader === "function" ? legacyReader() : null;
  }

  function dispatchProgressEvent(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (error) {
      // Event delivery is optional; localStorage remains the source of truth.
    }

    try {
      if (window.parent && window.parent !== window) {
        window.parent.dispatchEvent(new CustomEvent(name, { detail }));
      }
    } catch (error) {
      // Cross-origin parent frames are expected for external embeds.
    }
  }

  function safeClone(value, fallback = {}) {
    try {
      return JSON.parse(JSON.stringify(value ?? fallback));
    } catch (error) {
      return fallback;
    }
  }

  function compactEvent(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => compactEvent(item))
        .filter((item) => item !== undefined);
    }
    if (!value || typeof value !== "object") return value;
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      const compact = compactEvent(item);
      if (compact === undefined) return;
      output[key] = compact;
    });
    return output;
  }

  function normalizeTrainerEventKind(value) {
    const kind = String(value || "").trim().toLowerCase();
    if (kind === "decision" || kind === "trainer_decision") return "trainer_decision";
    if (kind === "session" || kind === "trainer_session") return "trainer_session";
    if (kind === "delete" || kind === "delete_player" || kind === "remove_player") return "delete_player";
    return "progress_result";
  }

  function trainerTitle(skillKey) {
    return SKILL_CONFIG[skillKeyFor(skillKey)]?.title || String(skillKey || "trainer");
  }

  function trainerEventProfile(input) {
    const source = input && typeof input === "object" ? input : getActiveProfile();
    return {
      id: String(source.id || DEFAULT_PROFILE_ID).slice(0, 100),
      name: normalizeProfileName(source.name, "Guest"),
      room: String(source.room || source.roomName || "").replace(/\s+/g, " ").trim().slice(0, 100),
      authProvider: source.authProvider || null,
      authenticated: Boolean(source.authenticated)
    };
  }

  function trainerEventClient(input = {}) {
    const location = typeof window !== "undefined" ? window.location : null;
    const navigatorRef = typeof window !== "undefined" ? window.navigator : null;
    return {
      sessionId: String(input.sessionId || input.session || TRAINER_EVENT_CLIENT_SESSION_ID).slice(0, 120),
      path: String(input.path || location?.pathname || "").slice(0, 400),
      href: String(input.href || location?.href || "").slice(0, 800),
      source: String(input.source || "ff-progress").slice(0, 80),
      ua: String(input.ua || navigatorRef?.userAgent || "").slice(0, 300)
    };
  }

  function normalizeTrainerEventResult(result, skillKey) {
    const source = result && typeof result === "object" ? result : {};
    if (source.evaluated === false) {
      return compactEvent({
        skillKey: skillKeyFor(source.skillKey || skillKey),
        evaluated: false,
        completed: Boolean(source.completed || source.status === "passed"),
        completedHands: Math.max(0, Math.round(readNumber(source.completedHands, source.attempts || 0))),
        targetHands: Math.max(0, Math.round(readNumber(source.targetHands, source.attempts || 0))),
        attempts: Math.max(0, Math.round(readNumber(source.attempts, 0))),
        correct: null,
        score: null,
        bestScore: null,
        status: String(source.status || "").slice(0, 40),
        streak: 0,
        weakErrorTags: Array.isArray(source.weakErrorTags) ? source.weakErrorTags.slice(0, 40).map(String) : [],
        errorCounts: source.errorCounts && typeof source.errorCounts === "object" ? safeClone(source.errorCounts, {}) : {},
        nextRecommendation: source.nextRecommendation || null,
        lastSeenAt: source.lastSeenAt || nowIso()
      });
    }
    return compactEvent({
      skillKey: skillKeyFor(source.skillKey || skillKey),
      attempts: Math.max(0, Math.round(readNumber(source.attempts, 0))),
      correct: Math.max(0, Math.round(readNumber(source.correct, 0))),
      score: clamp(Math.round(readNumber(source.score, 0)), 0, 100),
      bestScore: clamp(Math.round(readNumber(source.bestScore, source.score || 0)), 0, 100),
      status: String(source.status || "").slice(0, 40),
      streak: Math.max(0, Math.round(readNumber(source.streak, 0))),
      weakErrorTags: Array.isArray(source.weakErrorTags) ? source.weakErrorTags.slice(0, 40).map(String) : [],
      errorCounts: source.errorCounts && typeof source.errorCounts === "object" ? safeClone(source.errorCounts, {}) : {},
      nextRecommendation: source.nextRecommendation || null,
      lastSeenAt: source.lastSeenAt || nowIso()
    });
  }

  function buildTrainerEvent(kindOrPayload, payload = {}) {
    const input = typeof kindOrPayload === "string" ? payload : (kindOrPayload || {});
    const kind = normalizeTrainerEventKind(typeof kindOrPayload === "string" ? kindOrPayload : (input.kind || input.type));
    const trainerInput = input.trainer && typeof input.trainer === "object" ? input.trainer : {};
    const trainerKey = skillKeyFor(trainerInput.key || input.trainerKey || input.skillKey || input.result?.skillKey || "unknown");
    const event = {
      schema: TRAINER_EVENTS_SCHEMA,
      kind,
      eventId: String(input.eventId || `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`).slice(0, 160),
      occurredAt: input.occurredAt || nowIso(),
      trainer: {
        key: trainerKey,
        title: trainerInput.title || input.trainerTitle || trainerTitle(trainerKey),
        version: trainerInput.version || input.trainerVersion || "progress-v1"
      },
      profile: trainerEventProfile(input.profile),
      client: trainerEventClient(input.client || input)
    };

    if (kind === "progress_result") {
      event.result = normalizeTrainerEventResult(input.result || input.progress || input, trainerKey);
    }
    if (input.session) event.session = safeClone(input.session, {});
    if (kind === "trainer_decision") {
      event.decision = safeClone(input.decision || {
        choice: input.choice,
        expected: input.expected || input.expectedAnswer || input.spot?.expectedAnswer,
        correct: Boolean(input.correct),
        elapsedMs: input.elapsedMs,
        occurredAt: input.occurredAt || nowIso(),
        showAnalysis: Boolean(input.showAnalysis)
      }, {});
    }
    if (kind === "trainer_decision" && input.spot) event.spot = safeClone(input.spot, {});
    if (Array.isArray(input.decisions)) event.decisions = safeClone(input.decisions.slice(0, 500), []);
    if (input.metadata && typeof input.metadata === "object") event.metadata = safeClone(input.metadata, {});
    if (input.player && typeof input.player === "object") event.player = trainerEventProfile(input.player);
    if (input.reason) event.reason = String(input.reason).slice(0, 160);

    return compactEvent(event);
  }

  function readTrainerEventArchive() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(TRAINER_EVENTS_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeTrainerEventArchive(events) {
    try {
      window.localStorage.setItem(TRAINER_EVENTS_STORAGE_KEY, JSON.stringify(trimTrainerEventArchive(events)));
      return true;
    } catch (error) {
      return false;
    }
  }

  function trimTrainerEventArchive(events) {
    const list = Array.isArray(events) ? events.filter(Boolean) : [];
    if (list.length <= TRAINER_EVENTS_ARCHIVE_LIMIT) return list;
    const pending = list.filter(trainerEventNeedsDelivery);
    const terminal = list.filter((event) => !trainerEventNeedsDelivery(event));
    const terminalRoom = Math.max(0, TRAINER_EVENTS_ARCHIVE_LIMIT - pending.length);
    const keep = new Set([
      ...pending.slice(-TRAINER_EVENTS_ARCHIVE_LIMIT),
      ...(terminalRoom ? terminal.slice(-terminalRoom) : [])
    ].map((event) => event?.eventId || event?.archivedAt).filter(Boolean));
    return list.filter((event) => keep.has(event?.eventId || event?.archivedAt)).slice(-TRAINER_EVENTS_ARCHIVE_LIMIT);
  }

  function archiveTrainerEvent(event) {
    const archive = readTrainerEventArchive();
    const previous = archive.find((item) => item?.eventId && item.eventId === event?.eventId) || null;
    const compact = compactEvent({
      ...event,
      archivedAt: event.archivedAt || previous?.archivedAt || nowIso(),
      delivery: {
        status: event.delivery?.status || previous?.delivery?.status || "queued",
        attempts: Math.max(0, Math.round(readNumber(event.delivery?.attempts, previous?.delivery?.attempts || 0))),
        lastAttemptAt: event.delivery?.lastAttemptAt || previous?.delivery?.lastAttemptAt || null,
        acceptedAt: event.delivery?.acceptedAt || previous?.delivery?.acceptedAt || null,
        error: event.delivery?.error || previous?.delivery?.error || null
      }
    });
    const nextArchive = compact.eventId
      ? [...archive.filter((item) => item?.eventId !== compact.eventId), compact]
      : [...archive, compact];
    writeTrainerEventArchive(nextArchive);
    return compact;
  }

  function updateTrainerEventDelivery(eventId, patch = {}) {
    if (!eventId) return null;
    const archive = readTrainerEventArchive();
    let updated = null;
    const nextArchive = archive.map((event) => {
      if (event?.eventId !== eventId) return event;
      updated = compactEvent({
        ...event,
        delivery: {
          ...(event.delivery && typeof event.delivery === "object" ? event.delivery : {}),
          ...patch
        }
      });
      return updated;
    });
    if (updated) writeTrainerEventArchive(nextArchive);
    return updated;
  }

  function updateTrainerEventsDelivery(eventIds, patch = {}) {
    const ids = new Set((Array.isArray(eventIds) ? eventIds : [eventIds]).filter(Boolean));
    if (!ids.size) return [];
    const archive = readTrainerEventArchive();
    const updated = [];
    const nextArchive = archive.map((event) => {
      if (!ids.has(event?.eventId)) return event;
      const nextEvent = compactEvent({
        ...event,
        delivery: {
          ...(event.delivery && typeof event.delivery === "object" ? event.delivery : {}),
          ...patch
        }
      });
      updated.push(nextEvent);
      return nextEvent;
    });
    if (updated.length) writeTrainerEventArchive(nextArchive);
    return updated;
  }

  function updateTrainerEventsDeliveryWith(events, patchForEvent) {
    const eventMap = new Map((Array.isArray(events) ? events : [events])
      .filter((event) => event?.eventId)
      .map((event) => [event.eventId, event]));
    if (!eventMap.size) return [];
    const archive = readTrainerEventArchive();
    const updated = [];
    const nextArchive = archive.map((event) => {
      const source = eventMap.get(event?.eventId);
      if (!source) return event;
      const patch = typeof patchForEvent === "function" ? patchForEvent(source, event) : {};
      const nextEvent = compactEvent({
        ...event,
        delivery: {
          ...(event.delivery && typeof event.delivery === "object" ? event.delivery : {}),
          ...patch
        }
      });
      updated.push(nextEvent);
      return nextEvent;
    });
    if (updated.length) writeTrainerEventArchive(nextArchive);
    return updated;
  }

  function trainerEventNeedsDelivery(event) {
    const delivery = event?.delivery && typeof event.delivery === "object" ? event.delivery : {};
    const status = delivery.status || "queued";
    // A "beacon" send is best-effort: the browser accepted the payload but the
    // server never confirmed it, so it is NOT terminal — keep it pending and
    // re-send it via fetch on the next load/flush (the server dedupes by eventId).
    if (status === "accepted" || status === "blocked") return false;
    if (event?.kind === "delete_player") return false;
    const attempts = Math.max(0, Math.round(readNumber(delivery.attempts, 0)));
    if (attempts >= TRAINER_EVENTS_MAX_ATTEMPTS && status !== "queued") return false;
    if (status === "sending") {
      const lastAttemptAt = Date.parse(delivery.lastAttemptAt || "");
      if (Number.isFinite(lastAttemptAt) && Date.now() - lastAttemptAt < TRAINER_EVENTS_STALE_SENDING_MS) return false;
    }
    return Boolean(event?.eventId);
  }

  function pendingTrainerEvents(limit = TRAINER_EVENTS_BATCH_LIMIT) {
    const pending = readTrainerEventArchive().filter(trainerEventNeedsDelivery);
    if (limit === null || limit === Infinity) return pending;
    const max = Math.max(1, Math.min(TRAINER_EVENTS_BATCH_LIMIT, Math.round(readNumber(limit, TRAINER_EVENTS_BATCH_LIMIT))));
    return pending.slice(0, max);
  }

  function trainerEventDeliverySummary() {
    const archive = readTrainerEventArchive();
    const counts = archive.reduce((summary, event) => {
      const status = event?.delivery?.status || "queued";
      summary[status] = (summary[status] || 0) + 1;
      return summary;
    }, {});
    return {
      total: archive.length,
      queued: counts.queued || 0,
      sending: counts.sending || 0,
      accepted: counts.accepted || 0,
      failed: counts.failed || 0,
      blocked: counts.blocked || 0,
      beacon: counts.beacon || 0,
      pending: pendingTrainerEvents(null).length
    };
  }

  function canSendTrainerEvent() {
    if (typeof window === "undefined") return false;
    if (window.FF_STATIC_LEARNING_HUB) return false;
    const protocol = window.location?.protocol || "";
    if (protocol && protocol !== "https:" && protocol !== "http:") return false;
    return Boolean(typeof window.fetch === "function" || window.navigator?.sendBeacon);
  }

  function dispatchTrainerEventDelivery(detail) {
    dispatchProgressEvent("ff-trainer-events:delivery", {
      ...detail,
      summary: trainerEventDeliverySummary()
    });
  }

  function postTrainerEventsBeacon(events) {
    if (!canSendTrainerEvent() || !window.navigator?.sendBeacon) {
      return { ok: false, sent: 0, error: "beacon_unavailable" };
    }
    try {
      const batch = events.length === 1 ? events[0] : { schema: TRAINER_EVENTS_SCHEMA, events };
      const body = JSON.stringify(batch);
      const BlobCtor = window.Blob || (typeof Blob !== "undefined" ? Blob : null);
      if (!BlobCtor) return { ok: false, sent: 0, error: "blob_unavailable" };
      const accepted = window.navigator.sendBeacon(TRAINER_EVENTS_ENDPOINT, new BlobCtor([body], { type: "application/json" }));
      const attemptAt = nowIso();
      updateTrainerEventsDeliveryWith(events, (_source, archived) => ({
        status: accepted ? "beacon" : "failed",
        attempts: Math.round(readNumber(archived.delivery?.attempts, 0)) + 1,
        lastAttemptAt: attemptAt,
        error: accepted ? null : "beacon_rejected"
      }));
      dispatchTrainerEventDelivery({ transport: "beacon", events, ok: accepted });
      return { ok: accepted, sent: accepted ? events.length : 0, error: accepted ? "" : "beacon_rejected" };
    } catch (error) {
      return { ok: false, sent: 0, error: error.message || "beacon_failed" };
    }
  }

  async function postTrainerEventsFetch(events, options = {}) {
    if (!canSendTrainerEvent() || typeof window.fetch !== "function") {
      return { ok: false, sent: 0, error: "fetch_unavailable" };
    }
    const attemptAt = nowIso();
    const eventIds = events.map((event) => event.eventId).filter(Boolean);
    updateTrainerEventsDeliveryWith(events, (_source, archived) => ({
      status: "sending",
      attempts: Math.round(readNumber(archived.delivery?.attempts, 0)) + 1,
      lastAttemptAt: attemptAt,
      error: null
    }));
    try {
      const body = JSON.stringify(events.length === 1 ? events[0] : { schema: TRAINER_EVENTS_SCHEMA, events });
      const response = await window.fetch(TRAINER_EVENTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: Boolean(options.keepalive)
      });
      const data = await response.json().catch(() => ({}));
      const acceptedAt = nowIso();
      if (data?.batch && Array.isArray(data.results)) {
        const reported = new Set();
        const resultByEventId = new Map();
        data.results.forEach((result) => {
          const status = result.ok ? "accepted" : result.error === "moderation_blocked" ? "blocked" : "failed";
          if (result.eventId) reported.add(result.eventId);
          if (result.eventId) resultByEventId.set(result.eventId, {
            status,
            acceptedAt: result.ok ? acceptedAt : null,
            error: result.ok ? null : result.error || `http_${response.status}`
          });
        });
        updateTrainerEventsDeliveryWith(
          events.filter((event) => resultByEventId.has(event.eventId)),
          (source) => resultByEventId.get(source.eventId)
        );
        // Events we marked 'sending' but the server did not report on would
        // otherwise stay stuck in 'sending' for the stale window. Fail them now
        // so they re-enter pending immediately instead of being silently delayed.
        const missing = events.filter((event) => event.eventId && !reported.has(event.eventId));
        if (missing.length) {
          updateTrainerEventsDelivery(missing.map((event) => event.eventId), {
            status: "failed",
            error: "missing_in_batch_result"
          });
        }
        dispatchTrainerEventDelivery({ transport: "fetch", events, ok: response.ok, response: data });
        return {
          ok: response.ok && missing.length === 0 && Number(data.failed || 0) === 0,
          sent: Number(data.accepted || 0),
          failed: Number(data.failed || 0) + missing.length,
          response: data
        };
      }
      const status = response.ok && data?.ok !== false
        ? "accepted"
        : data?.error === "moderation_blocked"
          ? "blocked"
          : "failed";
      updateTrainerEventsDelivery(eventIds, {
        status,
        acceptedAt: status === "accepted" ? acceptedAt : null,
        error: status === "accepted" ? null : data?.error || `http_${response.status}`
      });
      dispatchTrainerEventDelivery({ transport: "fetch", events, ok: status === "accepted", response: data });
      return {
        ok: status === "accepted",
        sent: status === "accepted" ? events.length : 0,
        failed: status === "accepted" ? 0 : events.length,
        response: data
      };
    } catch (error) {
      updateTrainerEventsDelivery(events.map((event) => event.eventId), {
        status: "failed",
        error: error.message || "trainer_event_send_failed"
      });
      dispatchTrainerEventDelivery({ transport: "fetch", events, ok: false, error: error.message || "trainer_event_send_failed" });
      return { ok: false, sent: 0, failed: events.length, error: error.message || "trainer_event_send_failed" };
    }
  }

  function postTrainerEvent(event) {
    if (!canSendTrainerEvent()) return false;
    try {
      if (typeof window.fetch === "function") {
        scheduleTrainerEventAutoFlush();
        return true;
      }
      return postTrainerEventsBeacon([event]).ok;
    } catch (error) {
      return false;
    }
  }

  function scheduleTrainerEventAutoFlush() {
    if (trainerEventAutoFlushTimer || typeof window.setTimeout !== "function") return true;
    trainerEventAutoFlushTimer = window.setTimeout(() => {
      trainerEventAutoFlushTimer = 0;
      const pending = pendingTrainerEvents(TRAINER_EVENTS_BATCH_LIMIT);
      if (!pending.length) return;
      postTrainerEventsFetch(pending, { keepalive: true });
    }, 0);
    return true;
  }

  async function flushTrainerEvents(options = {}) {
    const pending = pendingTrainerEvents(options.limit || TRAINER_EVENTS_BATCH_LIMIT);
    if (!pending.length) {
      return { ok: true, sent: 0, failed: 0, pending: 0, summary: trainerEventDeliverySummary() };
    }
    const result = options.transport === "beacon"
      ? postTrainerEventsBeacon(pending)
      : await postTrainerEventsFetch(pending, { keepalive: Boolean(options.keepalive) });
    return {
      ...result,
      pending: pendingTrainerEvents(null).length,
      summary: trainerEventDeliverySummary()
    };
  }

  async function deleteTrainerPlayer(input = {}) {
    const event = archiveTrainerEvent(buildTrainerEvent("delete_player", {
      kind: "delete_player",
      trainer: input.trainer || { key: input.trainerKey || "unknown" },
      profile: input.profile || getActiveProfile(),
      player: {
        id: input.playerId || input.id || input.player?.id,
        name: input.playerName || input.name || input.player?.name,
        room: input.room || input.player?.room
      },
      reason: input.reason || "trainer_admin_delete",
      client: input.client || { source: "FFTrainerEvents.deletePlayer" }
    }));
    if (!canSendTrainerEvent() || typeof window.fetch !== "function") {
      updateTrainerEventDelivery(event.eventId, { status: "failed", error: "fetch_unavailable" });
      return { ok: false, event, error: "fetch_unavailable" };
    }
    const headers = { "Content-Type": "application/json" };
    if (input.adminToken) headers["X-Trainer-Admin-Token"] = String(input.adminToken);
    updateTrainerEventDelivery(event.eventId, {
      status: "sending",
      attempts: Math.round(readNumber(event.delivery?.attempts, 0)) + 1,
      lastAttemptAt: nowIso(),
      error: null
    });
    try {
      const response = await window.fetch(TRAINER_EVENTS_ENDPOINT, {
        method: "DELETE",
        headers,
        body: JSON.stringify(event)
      });
      const data = await response.json().catch(() => ({}));
      const status = response.ok && data?.ok !== false ? "accepted" : "failed";
      updateTrainerEventDelivery(event.eventId, {
        status,
        acceptedAt: status === "accepted" ? nowIso() : null,
        error: status === "accepted" ? null : data?.error || `http_${response.status}`
      });
      return { ...data, ok: status === "accepted", eventId: event.eventId };
    } catch (error) {
      updateTrainerEventDelivery(event.eventId, { status: "failed", error: error.message || "delete_failed" });
      return { ok: false, eventId: event.eventId, error: error.message || "delete_failed" };
    }
  }

  function sendTrainerEvent(kindOrPayload, payload = {}) {
    const event = buildTrainerEvent(kindOrPayload, payload);
    const archived = archiveTrainerEvent(event);
    postTrainerEvent(archived);
    return archived;
  }

  function recordTrainerProgressEvent(skillKey, normalized, input = {}, options = {}) {
    const payload = {
      kind: "progress_result",
      trainer: {
        key: skillKey,
        title: trainerTitle(skillKey),
        version: "progress-v1"
      },
      profile: getActiveProfile(),
      result: normalized,
      session: options.session || input.session || null,
      decisions: options.decisions || input.decisions || null,
      client: options.client || input.client || { source: "FFPlayerProgress.setResult" },
      metadata: options.metadata || input.metadata || null
    };
    return sendTrainerEvent("progress_result", payload);
  }

  function setResult(skillKey, result, options = {}) {
    const canonical = skillKeyFor(skillKey);
    if (!canonical) return null;
    const store = readStore();
    const profile = activeProfile(store);
    const previous = profile.skills?.[canonical] || store.skills[canonical] || null;
    const normalized = normalizeResult(canonical, result || {}, previous);
    profile.skills = profile.skills && typeof profile.skills === "object" ? profile.skills : {};
    profile.skills[canonical] = normalized;
    profile.updatedAt = normalized.lastSeenAt;
    store.profiles[profile.id] = profile;
    store.skills = profile.skills;
    store.updatedAt = normalized.lastSeenAt;
    writeStore(store);

    dispatchProgressEvent("ff-player-progress:update", {
      profile: { id: profile.id, name: profile.name },
      skillKey: canonical,
      progress: normalized
    });

    if (options.telemetry !== false) {
      recordTrainerProgressEvent(canonical, normalized, result || {}, options || {});
    }

    return normalized;
  }

  function clearSkill(skillKey) {
    const canonical = skillKeyFor(skillKey);
    const store = readStore();
    const profile = activeProfile(store);
    profile.skills = profile.skills && typeof profile.skills === "object" ? profile.skills : {};
    delete profile.skills[canonical];
    profile.updatedAt = nowIso();
    store.profiles[profile.id] = profile;
    store.skills = profile.skills;
    store.updatedAt = profile.updatedAt;
    writeStore(store);
    dispatchProgressEvent("ff-player-progress:update", {
      profile: { id: profile.id, name: profile.name },
      skillKey: canonical,
      progress: null
    });
  }

  function statusLabel(status) {
    if (status === "passed") return "сдано";
    if (status === "repeat") return "повторить";
    if (status === "in_progress") return "идёт";
    if (status === "locked") return "закрыто";
    return "не начато";
  }

  function getSkillProgress(skillKey) {
    const canonical = skillKeyFor(skillKey);
    const progress = readSkill(canonical);
    if (!progress) {
      return {
        skillKey: canonical,
        percent: null,
        status: "open",
        label: statusLabel("open"),
        nextRecommendation: canonical,
        weakErrorTags: []
      };
    }

    const percent = progress.evaluated === false
      ? null
      : clamp(Math.round(readNumber(progress.bestScore, progress.score || 0)), 0, 100);
    return {
      ...progress,
      percent,
      label: statusLabel(progress.status),
      weakErrorTags: Array.isArray(progress.weakErrorTags) ? progress.weakErrorTags : []
    };
  }

  function getNextRecommendation(order) {
    const pathOrder = Array.isArray(order) && order.length
      ? order.map(skillKeyFor)
      : DEFAULT_PATH_ORDER.length
        ? DEFAULT_PATH_ORDER
        : ["start", "combos", "positions", "hands", "tournament", "range_call", "open_first", "isolation", "vs_3bet", "math", "bb_defense", "short", "icm_short", "flop", "review", "exam"];

    for (const skillKey of pathOrder) {
      const progress = getSkillProgress(skillKey);
      if (progress.status !== "passed") {
        return {
          skillKey,
          status: progress.status,
          percent: progress.percent,
          label: progress.label,
          progress
        };
      }
    }

    const last = pathOrder[pathOrder.length - 1] || "exam";
    return {
      skillKey: last,
      status: "passed",
      percent: 100,
      label: statusLabel("passed"),
      progress: getSkillProgress(last)
    };
  }

  function publicProfile(profile) {
    const skills = profile?.skills && typeof profile.skills === "object" ? profile.skills : {};
    return {
      id: profile?.id || DEFAULT_PROFILE_ID,
      name: normalizeProfileName(profile?.name),
      authProvider: profile?.authProvider || null,
      email: normalizeEmail(profile?.email),
      avatarUrl: normalizeAvatarUrl(profile?.avatarUrl),
      authenticated: profile?.authProvider === "google" && Boolean(profile?.email),
      createdAt: profile?.createdAt || null,
      updatedAt: profile?.updatedAt || null,
      skillCount: Object.keys(skills).length
    };
  }

  function getActiveProfile() {
    return publicProfile(activeProfile(readStore()));
  }

  function listProfiles() {
    const store = readStore();
    return Object.values(store.profiles || {})
      .map(publicProfile)
      .sort((left, right) => {
        if (left.id === store.activeProfileId) return -1;
        if (right.id === store.activeProfileId) return 1;
        return left.name.localeCompare(right.name, "ru");
      });
  }

  function switchProfile(profileId) {
    const store = readStore();
    const id = String(profileId || "");
    if (!store.profiles[id]) return getActiveProfile();
    store.activeProfileId = id;
    store.skills = store.profiles[id].skills || {};
    store.updatedAt = nowIso();
    writeStore(store);
    const profile = publicProfile(store.profiles[id]);
    dispatchProgressEvent("ff-player-progress:profile", { profile });
    dispatchProgressEvent("ff-player-progress:update", { profile });
    return profile;
  }

  function cloneSkills(skills) {
    try {
      return JSON.parse(JSON.stringify(skills && typeof skills === "object" ? skills : {}));
    } catch (error) {
      return {};
    }
  }

  function loginAuthenticatedUser(user) {
    const id = String(user?.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (!id) return getActiveProfile();
    const store = readStore();
    const previousActive = activeProfile(store);
    const existing = store.profiles?.[id] || null;
    const profile = existing || profileShell(id, user?.name || "Google player", {});
    const previousSkillCount = Object.keys(profile.skills || {}).length;
    profile.name = normalizeProfileName(user?.name, normalizeEmail(user?.email).split("@")[0] || "Игрок");
    profile.authProvider = "google";
    profile.email = normalizeEmail(user?.email);
    profile.avatarUrl = normalizeAvatarUrl(user?.picture || user?.avatarUrl);
    profile.authenticated = Boolean(profile.email);
    profile.updatedAt = nowIso();

    if (!existing && previousActive.id === DEFAULT_PROFILE_ID && !previousSkillCount && Object.keys(previousActive.skills || {}).length) {
      profile.skills = cloneSkills(previousActive.skills);
    }

    store.profiles[id] = profile;
    store.activeProfileId = id;
    store.skills = profile.skills || {};
    store.updatedAt = profile.updatedAt;
    writeStore(store);
    const publicData = publicProfile(profile);
    dispatchProgressEvent("ff-player-progress:profile", { profile: publicData, auth: authState });
    dispatchProgressEvent("ff-player-progress:update", { profile: publicData, auth: authState });
    return publicData;
  }

  function login(name) {
    const store = readStore();
    const normalizedName = normalizeProfileName(name, "Игрок");
    const existing = Object.values(store.profiles || {}).find((profile) => (
      !profile.authProvider && normalizeProfileName(profile.name).toLowerCase() === normalizedName.toLowerCase()
    ));
    const profile = existing || profileShell(createProfileId(), normalizedName, {});
    profile.name = normalizedName;
    profile.authProvider = null;
    profile.email = "";
    profile.avatarUrl = "";
    profile.authenticated = false;
    profile.updatedAt = nowIso();
    store.profiles[profile.id] = profile;
    store.activeProfileId = profile.id;
    store.skills = profile.skills || {};
    store.updatedAt = profile.updatedAt;
    writeStore(store);
    const publicData = publicProfile(profile);
    dispatchProgressEvent("ff-player-progress:profile", { profile: publicData });
    dispatchProgressEvent("ff-player-progress:update", { profile: publicData });
    return publicData;
  }

  function renameActiveProfile(name) {
    const store = readStore();
    const profile = activeProfile(store);
    profile.name = normalizeProfileName(name, profile.name);
    profile.updatedAt = nowIso();
    store.profiles[profile.id] = profile;
    store.updatedAt = profile.updatedAt;
    writeStore(store);
    const publicData = publicProfile(profile);
    dispatchProgressEvent("ff-player-progress:profile", { profile: publicData });
    return publicData;
  }

  function getProgressSummary(order) {
    const keys = Array.isArray(order) && order.length ? order : Object.keys(SKILL_CONFIG);
    const items = keys.map((key) => getSkillProgress(key));
    const passed = items.filter((item) => item.status === "passed").length;
    const started = items.filter((item) => item.percent !== null || item.status !== "open").length;
    const totalPercent = items.reduce((sum, item) => sum + (item.percent || 0), 0);
    return {
      total: items.length,
      started,
      passed,
      averagePercent: items.length ? Math.round(totalPercent / items.length) : 0,
      items
    };
  }

  function canRequestAuthSession() {
    return typeof window !== "undefined" &&
      !window.FF_STATIC_LEARNING_HUB &&
      typeof window.fetch === "function" &&
      typeof window.location === "object" &&
      (window.location.protocol === "https:" || window.location.protocol === "http:");
  }

  function authStatusLabel() {
    if (!GOOGLE_AUTH_UI_VISIBLE) return authState.authenticated ? "Профиль подключен" : "Локальный профиль";
    if (authState.loading && !authState.loaded) return "проверяю Google вход";
    if (authState.authenticated) return "Google подключен";
    if (authState.configured) return "Google вход доступен";
    if (authState.loaded) return authState.message || "Google вход не настроен";
    return "Google вход";
  }

  function publishAuthState(container) {
    if (container) renderProfileWidget(container);
    try {
      window.dispatchEvent(new CustomEvent("ff-player-progress:auth", { detail: { auth: { ...authState } } }));
    } catch (error) {
      // The auth state is UI-only; failing to notify listeners should not block progress.
    }
  }

  async function refreshAuthSession(options = {}) {
    if (!canRequestAuthSession()) {
      authState.loaded = true;
      authState.loading = false;
      authState.configured = false;
      authState.authenticated = false;
      authState.user = null;
      authState.message = "Google вход доступен на Vercel";
      return authState;
    }
    if (authState.loading) return authState;
    if (authState.loaded && !options.force) return authState;

    authState.loading = true;
    authState.message = "";
    try {
      const response = await window.fetch(AUTH_SESSION_ENDPOINT, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("auth_session_unavailable");
      const data = await response.json().catch(() => ({}));
      authState.loaded = true;
      authState.loading = false;
      authState.configured = Boolean(data.configured);
      authState.authenticated = Boolean(data.authenticated && data.user);
      authState.user = data.user || null;
      authState.message = data.configured
        ? ""
        : data.missing?.length
          ? `Нужны env: ${data.missing.join(", ")}`
          : "Google вход не настроен на сервере";
      if (authState.authenticated) loginAuthenticatedUser(authState.user);
    } catch (error) {
      authState.loaded = true;
      authState.loading = false;
      authState.configured = false;
      authState.authenticated = false;
      authState.user = null;
      authState.message = "Локальный запуск: Google вход доступен только на Vercel";
    }
    return authState;
  }

  function startGoogleLogin() {
    if (!GOOGLE_AUTH_UI_VISIBLE) return;
    if (!authState.configured) return;
    const returnTo = window.location.href;
    window.location.href = `${AUTH_GOOGLE_START_ENDPOINT}?returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function logoutGoogle(container) {
    if (!GOOGLE_AUTH_UI_VISIBLE) return;
    if (!canRequestAuthSession()) return;
    try {
      await window.fetch(AUTH_LOGOUT_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
    } catch (error) {
      // A failed logout request should still return the UI to the local guest profile.
    }
    authState.loaded = true;
    authState.loading = false;
    authState.configured = true;
    authState.authenticated = false;
    authState.user = null;
    authState.message = "";
    switchProfile(DEFAULT_PROFILE_ID);
    publishAuthState(container);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderProfileWidget(container) {
    if (!container) return;
    const profile = getActiveProfile();
    const profiles = listProfiles();
    const summary = getProgressSummary(["start", "combos", "positions", "hands", "chart", "open_first", "isolation", "vs_3bet", "squeeze", "math", "bb_defense", "short", "icm_short", "flop", "river_cbet", "table_decision", "simulator", "review", "exam"]);
    const isGoogleProfile = authState.authenticated && profile.authProvider === "google" && profile.email;
    const showGoogleAuth = GOOGLE_AUTH_UI_VISIBLE && (authState.configured || authState.authenticated);
    const initials = normalizeProfileName(profile.name, "FF")
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "FF";
    const googleButtonDisabled = authState.loading;
    const authCopy = authStatusLabel();
    const avatar = isGoogleProfile && profile.avatarUrl
      ? `<img src="${escapeHtml(profile.avatarUrl)}" alt="" referrerpolicy="no-referrer">`
      : `<span>${escapeHtml(initials)}</span>`;
    const authCardHtml = showGoogleAuth ? `
          <div class="ff-profile-auth-card" data-auth-status="${escapeHtml(authState.authenticated ? "authenticated" : "ready")}">
            <div class="ff-profile-auth-head">
              <span class="ff-profile-avatar">${avatar}</span>
              <div>
                <strong>${escapeHtml(isGoogleProfile ? profile.name : "Google аккаунт")}</strong>
                <small>${escapeHtml(isGoogleProfile ? profile.email : authCopy)}</small>
              </div>
            </div>
            <div class="ff-profile-auth-actions">
              ${authState.authenticated
                ? `<button class="ff-profile-auth-button" type="button" data-ff-google-logout>Выйти</button>`
                : `<button class="ff-profile-google-button" type="button" data-ff-google-login ${googleButtonDisabled ? "disabled" : ""}>
                    <span aria-hidden="true">G</span>
                    <strong>${authState.loading ? "Проверяю..." : "Войти через Google"}</strong>
                  </button>`}
            </div>
            <p>${escapeHtml(authState.authenticated ? "Сессия хранится в защищенной cookie. Прогресс привязан к этому Google-профилю в текущем браузере." : "После входа имя и email подтянутся из Google.")}</p>
          </div>` : "";
    const localModeCopy = showGoogleAuth
      ? "Гостевой режим остается локальным. Google вход дает реальную сессию и стабильный профиль для этого аккаунта."
      : "Гостевой режим хранится локально в этом браузере.";
    container.innerHTML = `
      <div class="ff-profile-widget">
        <button class="ff-profile-trigger${isGoogleProfile ? " is-authenticated" : ""}" type="button" aria-expanded="false">
          <span>игрок</span>
          <strong>${escapeHtml(profile.name)}</strong>
          <small>${summary.passed}/${summary.total} сдано</small>
        </button>
        <form class="ff-profile-panel" hidden>
          ${authCardHtml}
          <label>
            <span>Локальное имя</span>
            <input class="ff-profile-input" name="playerName" type="text" value="${escapeHtml(profile.name === "Гость" ? "" : profile.name)}" placeholder="Имя игрока" autocomplete="nickname" maxlength="32">
          </label>
          <div class="ff-profile-row">
            <button class="ff-profile-submit" type="submit">Сохранить</button>
            <select class="ff-profile-select" aria-label="Профили игроков">
              ${profiles.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === profile.id ? " selected" : ""}>${escapeHtml(item.name)} · ${item.skillCount}</option>`).join("")}
            </select>
          </div>
          <p>${escapeHtml(localModeCopy)}</p>
        </form>
      </div>
    `;
  }

  function mountProfileWidget(target) {
    if (typeof document === "undefined") return null;
    const container = typeof target === "string" ? document.querySelector(target) : target || document.querySelector("[data-ff-profile-widget]");
    if (!container) return null;
    if (!container.__ffProfileWidgetBound) {
      container.__ffProfileWidgetBound = true;
      container.addEventListener("click", (event) => {
        const googleLogin = event.target.closest("[data-ff-google-login]");
        if (googleLogin && container.contains(googleLogin)) {
          event.preventDefault();
          startGoogleLogin();
          return;
        }
        const googleLogout = event.target.closest("[data-ff-google-logout]");
        if (googleLogout && container.contains(googleLogout)) {
          event.preventDefault();
          logoutGoogle(container);
          return;
        }
        const trigger = event.target.closest(".ff-profile-trigger");
        if (!trigger || !container.contains(trigger)) return;
        const panel = container.querySelector(".ff-profile-panel");
        if (!panel) return;
        const nextHidden = !panel.hidden ? true : false;
        panel.hidden = nextHidden;
        trigger.setAttribute("aria-expanded", String(!nextHidden));
        if (!nextHidden) container.querySelector(".ff-profile-input")?.focus();
      });
      container.addEventListener("submit", (event) => {
        const form = event.target.closest(".ff-profile-panel");
        if (!form || !container.contains(form)) return;
        event.preventDefault();
        const formData = new FormData(form);
        login(formData.get("playerName"));
        renderProfileWidget(container);
      });
      container.addEventListener("change", (event) => {
        const select = event.target.closest(".ff-profile-select");
        if (!select || !container.contains(select)) return;
        switchProfile(select.value);
        renderProfileWidget(container);
      });
    }
    const needsAuthRefresh = GOOGLE_AUTH_UI_VISIBLE && !authState.loaded && !authState.loading;
    renderProfileWidget(container);
    if (needsAuthRefresh) {
      refreshAuthSession().then(() => renderProfileWidget(container));
    }
    return container;
  }

  function mountProfileWidgets() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("[data-ff-profile-widget]").forEach((container) => mountProfileWidget(container));
  }

  const trainerEventsApi = Object.freeze({
    schema: TRAINER_EVENTS_SCHEMA,
    endpoint: TRAINER_EVENTS_ENDPOINT,
    storageKey: TRAINER_EVENTS_STORAGE_KEY,
    build: buildTrainerEvent,
    send: sendTrainerEvent,
    flush: flushTrainerEvents,
    pending: pendingTrainerEvents,
    deliverySummary: trainerEventDeliverySummary,
    deletePlayer: deleteTrainerPlayer,
    archive: archiveTrainerEvent,
    readArchive: readTrainerEventArchive
  });

  const api = Object.freeze({
    storageKey: STORAGE_KEY,
    trainerEvents: trainerEventsApi,
    setResult,
    sendTrainerEvent,
    readSkill,
    getSkillProgress,
    getNextRecommendation,
    getProgressSummary,
    getActiveProfile,
    listProfiles,
    login,
    loginAuthenticatedUser,
    renameActiveProfile,
    switchProfile,
    refreshAuthSession,
    mountProfileWidget,
    clearSkill,
    readStore,
    authState
  });

  window.FFPlayerProgress = api;
  window.FFTrainerEvents = trainerEventsApi;
  if (!window.progress) {
    window.progress = api;
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountProfileWidgets, { once: true });
    } else {
      mountProfileWidgets();
    }
    window.setTimeout(() => {
      flushTrainerEvents({ limit: TRAINER_EVENTS_BATCH_LIMIT }).catch(() => {});
    }, 0);
    window.addEventListener("online", () => {
      flushTrainerEvents({ limit: TRAINER_EVENTS_BATCH_LIMIT }).catch(() => {});
    });
    window.addEventListener("pagehide", () => {
      flushTrainerEvents({ limit: TRAINER_EVENTS_BATCH_LIMIT, transport: "beacon" }).catch(() => {});
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushTrainerEvents({ limit: TRAINER_EVENTS_BATCH_LIMIT, transport: "beacon" }).catch(() => {});
      } else {
        flushTrainerEvents({ limit: TRAINER_EVENTS_BATCH_LIMIT }).catch(() => {});
      }
    });
    window.addEventListener("ff-player-progress:update", mountProfileWidgets);
    window.addEventListener("ff-player-progress:profile", mountProfileWidgets);
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY || event.key === null) mountProfileWidgets();
    });
  }
})();
