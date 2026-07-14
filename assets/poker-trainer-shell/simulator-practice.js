(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;

  function resolveElement(target) {
    const element = typeof target === "string" ? root.document?.querySelector(target) : target;
    if (!element) throw new Error("FFTrainerSimulator target was not found");
    return element;
  }

  function transformVisibleText(host, transform) {
    if (typeof transform !== "function" || !root.document?.createTreeWalker) return;
    const walker = root.document.createTreeWalker(host, root.NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => { node.nodeValue = transform(node.nodeValue || ""); });
  }

  function replaceVisibleText(host, replacements = {}) {
    const entries = Object.entries(replacements || {}).filter(([from]) => from);
    if (!entries.length) return;
    transformVisibleText(host, (source) => {
      let value = source;
      entries.forEach(([from, to]) => {
        value = value.replace(new RegExp(`\\b${String(from).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), String(to));
      });
      return value;
    });
  }

  function renderDecision(target, spot, state = {}, options = {}) {
    const host = resolveElement(target);
    const snapshot = root.FFTrainerSimulatorSnapshot;
    if (!snapshot?.renderTable) {
      host.innerHTML = '<p class="table-load-error">Стол не загрузился: проверь simulator snapshot.</p>';
      return null;
    }
    host.innerHTML = snapshot.renderTable(spot, state);
    replaceVisibleText(host, options.positionLabels);
    if (options.decimalComma) transformVisibleText(host, (value) => value.replace(/(\d)\.(\d)(?=\s*BB)/g, "$1,$2"));
    if (options.hideActionStatus) host.querySelector(".action-status")?.remove();
    if (options.nextLabel) {
      const controls = host.querySelector(".client-controls");
      if (controls) {
        const row = root.document.createElement("div");
        row.className = "practice-next-row";
        const button = root.document.createElement("button");
        button.className = "practice-next-button";
        button.type = "button";
        button.dataset.practiceNext = "";
        const label = root.document.createElement("span");
        label.textContent = String(options.nextLabel);
        button.appendChild(label);
        row.appendChild(button);
        controls.appendChild(row);
      }
    }
    return host;
  }

  function simulatorBaseUrl() {
    const local = /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(root.location?.hostname || "");
    return local ? "poker-simulator.html" : "poker-simulator";
  }

  function practiceUrl(options = {}) {
    const embed = root.PokerSimulatorEmbed;
    if (!embed?.buildSimulatorUrl) throw new Error("PokerSimulatorEmbed is not loaded");
    return embed.buildSimulatorUrl({
      url: options.url || simulatorBaseUrl(),
      practice: options.practice,
      hands: options.hands,
      tables: options.tables || 1,
      tempo: options.tempo || "fast",
      run: options.run
    }).toString();
  }

  function mountPractice(target, options = {}) {
    const element = resolveElement(target);
    const embed = root.PokerSimulatorEmbed;
    if (!embed) throw new Error("PokerSimulatorEmbed is not loaded");
    const safeOptions = {
      url: options.url || simulatorBaseUrl(),
      practice: options.practice,
      hands: options.hands,
      tables: options.tables || 1,
      tempo: options.tempo || "fast",
      run: options.run,
      title: options.title,
      timeoutMs: options.timeoutMs
    };
    if (element.tagName === "IFRAME") {
      const url = embed.buildSimulatorUrl(safeOptions).toString();
      element.src = url;
      return { iframe: element, url };
    }
    return embed.mount(element, safeOptions);
  }

  const api = { renderDecision, practiceUrl, mountPractice };
  root.FFTrainerSimulator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
