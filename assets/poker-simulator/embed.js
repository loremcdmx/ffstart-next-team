(function () {
  const root = typeof window !== "undefined" ? window : globalThis;
  const scriptUrl = new URL(
    document.currentScript?.src || "assets/poker-simulator/embed.js",
    document.baseURI
  );
  const defaultSimulatorUrl = new URL("../../poker-simulator.html", scriptUrl);
  let styleInjected = false;

  function injectStyle() {
    if (styleInjected || document.querySelector("style[data-poker-simulator-embed]")) {
      styleInjected = true;
      return;
    }
    const style = document.createElement("style");
    style.dataset.pokerSimulatorEmbed = "true";
    style.textContent = `
      .poker-simulator-embed {
        display: block;
        width: 100%;
        min-height: min(720px, calc(100vh - 24px));
        overflow: hidden;
        border: 1px solid rgba(125, 95, 201, 0.28);
        border-radius: 10px;
        background: #050807;
        box-shadow: 0 16px 42px rgba(0, 0, 0, 0.32);
      }

      .poker-simulator-embed iframe {
        display: block;
        width: 100%;
        height: 100%;
        min-height: inherit;
        border: 0;
        background: #050807;
      }
    `;
    document.head.appendChild(style);
    styleInjected = true;
  }

  function resolveTarget(target) {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    if (!element) throw new Error("PokerSimulatorEmbed.mount target was not found");
    return element;
  }

  function buildSimulatorUrl(options = {}) {
    const url = new URL(options.url || defaultSimulatorUrl, document.baseURI);
    url.searchParams.set("embedded", "1");
    const practice = options.practice || options.lesson || options.drill;
    if (practice) url.searchParams.set("practice", String(practice));
    if (options.hands || options.handCount) {
      url.searchParams.set("hands", String(options.hands || options.handCount));
    }
    if (options.tableCount || options.tables) {
      url.searchParams.set("tables", String(options.tableCount || options.tables));
    }
    if (options.handTempo || options.tempo) {
      url.searchParams.set("tempo", String(options.handTempo || options.tempo));
    }
    if (options.run || options.runKey) url.searchParams.set("run", String(options.run || options.runKey));
    if (options.cacheKey) url.searchParams.set("embed", String(options.cacheKey));
    return url;
  }

  function targetOriginFor(url) {
    return url.origin && url.origin !== "null" ? url.origin : "*";
  }

  function mount(target, options = {}) {
    const element = resolveTarget(target);
    injectStyle();

    const simulatorUrl = buildSimulatorUrl(options);
    const targetOrigin = targetOriginFor(simulatorUrl);
    const timeoutMs = Number(options.timeoutMs || 4500);
    const pending = new Map();
    let destroyed = false;

    element.classList.add("poker-simulator-embed");
    const iframe = document.createElement("iframe");
    iframe.title = options.title || "Poker Simulator";
    iframe.loading = options.loading || "eager";

    let readyResolve;
    let readyReject;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const readyTimer = window.setTimeout(() => {
      readyReject(new Error("Poker simulator embed did not become ready in time"));
    }, timeoutMs);

    function finishReady(payload) {
      window.clearTimeout(readyTimer);
      readyResolve(payload || {});
      element.dispatchEvent(new CustomEvent("poker-simulator-ready", { detail: payload || {} }));
    }

    function handleMessage(event) {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data && typeof event.data === "object" ? event.data : null;
      if (data?.type === "poker-simulator:event" && data.name === "ready") {
        finishReady(data.payload || {});
        return;
      }
      if (data?.type !== "poker-simulator:response") return;
      const record = pending.get(data.id);
      if (!record) return;
      pending.delete(data.id);
      window.clearTimeout(record.timer);
      if (data.ok) record.resolve(data.result);
      else record.reject(new Error(data.error || "Poker simulator command failed"));
    }

    function secureRandomInt(maxExclusive) {
      const max = Math.floor(Number(maxExclusive));
      if (!(max > 0)) return 0;
      if (!window.crypto?.getRandomValues) return Math.floor(Math.random() * max);
      const range = 0x100000000;
      const limit = Math.floor(range / max) * max;
      const buffer = new Uint32Array(1);
      let value = 0;
      do {
        window.crypto.getRandomValues(buffer);
        value = buffer[0] >>> 0;
      } while (value >= limit);
      return value % max;
    }

    function secureToken(length = 8) {
      if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, "").slice(0, length);
      const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
      return Array.from({ length }, () => alphabet[secureRandomInt(alphabet.length)]).join("");
    }

    function send(command, payload = {}) {
      if (destroyed) {
        return Promise.reject(new Error("Poker simulator embed destroyed"));
      }
      const id = `sim-embed-${Date.now().toString(36)}-${secureToken(8)}`;
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Poker simulator command timed out: ${command}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        iframe.contentWindow?.postMessage({
          type: "poker-simulator:command",
          id,
          command,
          payload
        }, targetOrigin);
      });
    }

    function destroy() {
      destroyed = true;
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(readyTimer);
      readyReject(new Error("Poker simulator embed destroyed"));
      pending.forEach((record) => {
        window.clearTimeout(record.timer);
        record.reject(new Error("Poker simulator embed destroyed"));
      });
      pending.clear();
      element.replaceChildren();
      element.classList.remove("poker-simulator-embed");
    }

    window.addEventListener("message", handleMessage);
    iframe.src = simulatorUrl.toString();
    element.replaceChildren(iframe);

    return {
      iframe,
      url: simulatorUrl.toString(),
      ready,
      send,
      snapshot: () => send("snapshot"),
      settings: () => send("settings"),
      exportSession: () => send("exportSession"),
      exportSessionArchive: () => send("exportSessionArchive"),
      handLogJsonl: () => send("handLogJsonl"),
      leaderboard: () => send("leaderboard"),
      restartTournament: (tableId) => send("restartTournament", { tableId }),
      latestHandHistory: () => send("latestHandHistory"),
      openReplay: () => send("openReplay"),
      newHand: () => send("newHand"),
      hotkey: (key) => send("hotkey", { key }),
      setTableCount: (count, keepExisting = true) => send("setTableCount", { count, keepExisting }),
      destroy
    };
  }

  class PokerSimulatorEmbedElement extends HTMLElement {
    connectedCallback() {
      if (this.controller) return;
      this.controller = mount(this, {
        tableCount: this.getAttribute("tables") || this.getAttribute("table-count") || "",
        practice: this.getAttribute("practice") || "",
        hands: this.getAttribute("hands") || "",
        tempo: this.getAttribute("tempo") || "",
        title: this.getAttribute("title") || "Poker Simulator"
      });
      this.controller.ready.catch((err) => {
        this.dispatchEvent(new CustomEvent("poker-simulator-error", { detail: err }));
      });
    }

    disconnectedCallback() {
      this.controller?.destroy?.();
      this.controller = null;
    }
  }

  if (root.customElements && !root.customElements.get("poker-simulator-embed")) {
    root.customElements.define("poker-simulator-embed", PokerSimulatorEmbedElement);
  }

  root.PokerSimulatorEmbed = {
    mount,
    buildSimulatorUrl,
    url: (options = {}) => buildSimulatorUrl(options).toString()
  };
})();
