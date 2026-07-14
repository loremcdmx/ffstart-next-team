(function () {
  "use strict";

  const root = window;
  const doc = document;
  const serverModeRe = /[?&]rooms?=/;
  const assets = Object.freeze({
    onlineCss: "assets/poker-simulator/simulator-online-lobby.css?v=5ffb4fd8cdc1",
    multiplayerTransport: "assets/poker-simulator/simulator-multiplayer.js?v=f8c2f23aba0c",
    multiplayerAdapter: "assets/poker-simulator/simulator-multiplayer-adapter.js?v=c5915af6350a",
    multiplayerStepInterp: "assets/poker-simulator/simulator-mp-step-interp.js?v=df2187468438",
    multiplayerRuntime: "assets/poker-simulator/simulator-multiplayer-runtime.js?v=1263c98a8545",
    onlineLobby: "assets/poker-simulator/simulator-online-lobby.js?v=dd5a27d8d540"
  });
  const serverScripts = [
    assets.multiplayerTransport,
    assets.multiplayerAdapter,
    assets.multiplayerStepInterp,
    assets.multiplayerRuntime
  ];
  const onlineScripts = [
    assets.multiplayerTransport,
    assets.onlineLobby
  ];

  let onlinePromise = null;
  let onlineLoaded = false;
  let serverPromise = null;
  let practicePromise = null;
  let replayingOnlineIntent = false;

  function ready(fn) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  function isServerMode() {
    return serverModeRe.test(root.location?.search || "");
  }

  function refWithoutQuery(ref) {
    return String(ref || "").split("#")[0].split("?")[0];
  }

  function absoluteUrl(ref) {
    try {
      return new URL(ref, doc.baseURI).href;
    } catch {
      return String(ref || "");
    }
  }

  function sameAsset(a, b) {
    return refWithoutQuery(absoluteUrl(a)) === refWithoutQuery(absoluteUrl(b));
  }

  function existingStyle(href) {
    return [...doc.querySelectorAll('link[rel~="stylesheet"][href]')]
      .some((link) => sameAsset(link.getAttribute("href"), href));
  }

  function existingScript(src) {
    return [...doc.scripts].some((script) => sameAsset(script.getAttribute("src"), src));
  }

  function loadStyle(href, feature = "online-lobby") {
    if (existingStyle(href)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.simulatorFeature = feature;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load ${refWithoutQuery(href)}`));
      doc.head.appendChild(link);
    });
  }

  function loadScript(src, feature = "deferred-runtime") {
    if (existingScript(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = doc.createElement("script");
      script.async = false;
      script.defer = false;
      script.src = src;
      script.dataset.simulatorFeature = feature;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${refWithoutQuery(src)}`));
      doc.head.appendChild(script);
    });
  }

  function loadScripts(scripts, feature) {
    return scripts.reduce((chain, src) => chain.then(() => loadScript(src, feature)), Promise.resolve());
  }

  function loadPracticePack() {
    const registry = root.PokerSimulatorPracticePacks;
    const entry = registry?.catalogEntry?.();
    if (!entry) return Promise.resolve(null);
    if (!practicePromise) {
      practicePromise = Promise.all((entry.styles || []).map((href) => loadStyle(href, `practice:${entry.id}`)))
        .then(() => loadScripts(entry.scripts || [], `practice:${entry.id}`))
        .then(() => {
          const descriptor = registry.active?.();
          if (!descriptor) throw new Error(`Practice pack did not register itself: ${entry.id}`);
          registry.installForEngine?.(descriptor, root.PokerSimulatorEngine);
          return descriptor;
        });
    }
    return practicePromise;
  }

  function suppressServerStartShell() {
    doc.documentElement.dataset.simulatorServerMode = "true";
    ready(() => {
      doc.getElementById("sim-start-tabs")?.remove();
      doc.getElementById("online-lobby")?.remove();
    });
  }

  function loadServerMode() {
    if (!serverPromise) {
      suppressServerStartShell();
      serverPromise = loadStyle(assets.onlineCss)
        .then(() => loadScripts(serverScripts));
    }
    return serverPromise;
  }

  function loadOnlineLobby() {
    if (isServerMode()) return loadServerMode();
    if (!onlinePromise) {
      onlinePromise = loadStyle(assets.onlineCss)
        .then(() => loadScripts(onlineScripts))
        .then(() => {
          onlineLoaded = true;
        });
    }
    return onlinePromise;
  }

  function onlineTabFromEvent(event) {
    const target = event.target;
    if (!target?.closest) return null;
    return target.closest('.sim-start-tab[data-start-view="online"]');
  }

  function replayOnlineClick(button) {
    replayingOnlineIntent = true;
    try {
      button.click();
    } finally {
      root.setTimeout(() => {
        replayingOnlineIntent = false;
      }, 0);
    }
  }

  function warmOnlineLobby(event) {
    if (isServerMode() || onlineLoaded || replayingOnlineIntent || !onlineTabFromEvent(event)) return;
    loadOnlineLobby().catch((error) => {
      console.warn("[simulator-feature-loader] online lobby warmup failed", error);
    });
  }

  function handleOnlineActivation(event) {
    if (isServerMode() || onlineLoaded || replayingOnlineIntent) return;
    const button = onlineTabFromEvent(event);
    if (!button) return;
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loadOnlineLobby()
      .then(() => replayOnlineClick(button))
      .catch((error) => {
        console.error("[simulator-feature-loader] online lobby load failed", error);
      });
  }

  function readyForBoot() {
    return Promise.all([
      isServerMode() ? loadServerMode() : Promise.resolve(),
      loadPracticePack()
    ]);
  }

  if (isServerMode()) suppressServerStartShell();
  doc.addEventListener("pointerover", warmOnlineLobby, true);
  doc.addEventListener("focusin", warmOnlineLobby, true);
  doc.addEventListener("click", handleOnlineActivation, true);
  doc.addEventListener("keydown", handleOnlineActivation, true);

  root.PokerSimulatorFeatureLoader = {
    assets,
    isServerMode,
    readyForBoot,
    loadPracticePack,
    loadOnlineLobby,
    loadServerMode
  };
})();
