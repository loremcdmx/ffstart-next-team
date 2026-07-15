(function () {
  "use strict";

  var Data = window.PokerRestealRankData;
  var root = document.getElementById("rankEvidenceSlide");
  if (!root) return;

  if (!Data) {
    var missing = document.getElementById("rankGrowthStrip");
    if (missing) missing.innerHTML = '<p class="rank-data-missing">Срез по лигам пока не загрузился.</p>';
    return;
  }

  var state = {
    position: "BTN",
    size: "2.0",
    depth: "25-40",
    league: "league3",
    hand: "QJo"
  };
  var cohortLabels = {
    novice: "Совсем новички",
    league3: "3 лига",
    league2: "2 лига",
    league1: "1 лига"
  };
  var sizeLabels = { "2.0": "2 BB", "2.5": "2,5 BB", "3.0": "3 BB" };
  var depthLabels = { "25-40": "25–40", "25-30": "25–30", "30-35": "30–35", "35-40": "35–40" };
  var integer = new Intl.NumberFormat("ru-RU");

  function byId(id) { return document.getElementById(id); }

  function percent(value, digits) {
    if (!Number.isFinite(Number(value))) return "—";
    return Number(value).toFixed(digits == null ? 1 : digits).replace(".", ",") + "%";
  }

  function money(value) {
    if (!Number.isFinite(Number(value))) return "—";
    return "$" + Number(value).toFixed(2).replace(".", ",");
  }

  function signed(value) {
    if (!Number.isFinite(Number(value))) return "—";
    return (value > 0 ? "+" : "") + percent(value, 1);
  }

  function chartFor(cohort, position, size, depth) {
    var cohortCharts = Data.charts && Data.charts[cohort];
    var positionCharts = cohortCharts && cohortCharts[position || state.position];
    var sizeCharts = positionCharts && positionCharts[size || state.size];
    return sizeCharts && sizeCharts[depth || state.depth] || null;
  }

  function totalFor(chart, key) {
    return Number(chart && chart.totals && chart.totals[key] || 0);
  }

  function jamRate(chart) {
    var opportunities = totalFor(chart, "opportunities");
    return opportunities ? totalFor(chart, "jams") / opportunities * 100 : 0;
  }

  function cellFor(cohort, hand) {
    var chart = chartFor(cohort);
    var index = Data.meta.handOrder.indexOf(hand);
    return chart && index >= 0 ? chart.cells[index] : null;
  }

  function cellRate(cell) {
    return cell && cell[0] ? Number(cell[4] || 0) / Number(cell[0]) * 100 : 0;
  }

  function createTabs(rootNode, items, selected, controls, onSelect) {
    if (!rootNode) return;
    rootNode.innerHTML = "";
    items.forEach(function (item, index) {
      var button = document.createElement("button");
      var active = item.key === selected;
      button.type = "button";
      button.className = active ? "is-active" : "";
      button.textContent = item.label;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.setAttribute("aria-controls", controls);
      button.tabIndex = active ? 0 : -1;
      button.addEventListener("click", function () { onSelect(item.key); });
      button.addEventListener("keydown", function (event) {
        var next = index;
        if (event.key === "ArrowRight") next = (index + 1) % items.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = items.length - 1;
        else return;
        event.preventDefault();
        onSelect(items[next].key);
        var buttons = rootNode.querySelectorAll("button");
        if (buttons[next]) buttons[next].focus();
      });
      rootNode.appendChild(button);
    });
  }

  function renderControls() {
    var positions = (Data.meta.positionOrder || ["CO", "BTN"]).map(function (key) {
      return { key: key, label: key };
    });
    var sizes = (Data.meta.sizeOrder || ["2.0", "2.5", "3.0"]).map(function (key) {
      return { key: key, label: sizeLabels[key] || String(key).replace(".", ",") + " BB" };
    });
    var depths = (Data.meta.depthOrder || ["25-40", "25-30", "30-35", "35-40"]).map(function (key) {
      return { key: key, label: (depthLabels[key] || key.replace("-", "–")) + " BB" };
    });

    createTabs(byId("rankPositionTabs"), positions, state.position, "rankNoviceMatrix rankLeagueMatrix", function (key) {
      state.position = key;
      render();
    });
    createTabs(byId("rankSizeTabs"), sizes, state.size, "rankNoviceMatrix rankLeagueMatrix", function (key) {
      state.size = key;
      render();
    });
    createTabs(byId("rankDepthTabs"), depths, state.depth, "rankNoviceMatrix rankLeagueMatrix", function (key) {
      state.depth = key;
      render();
    });
    createTabs(byId("rankLeagueTabs"), [
      { key: "league3", label: "3 лига" },
      { key: "league2", label: "2 лига" },
      { key: "league1", label: "1 лига" }
    ], state.league, "rankLeagueMatrix", function (key) {
      state.league = key;
      render();
    });
  }

  function actionBarMarkup(chart) {
    var opportunities = totalFor(chart, "opportunities");
    if (!opportunities) return "";
    return [
      ["folds", "Пас", "is-fold"],
      ["calls", "Колл", "is-call"],
      ["small3bets", "3-бет", "is-small-raise"],
      ["jams", "Олл-ин", "is-jam"]
    ].map(function (action) {
      var count = totalFor(chart, action[0]);
      var rate = count / opportunities * 100;
      return '<span class="' + action[2] + '" style="width:' + rate.toFixed(3) + '%" title="' + action[1] + ': ' + percent(rate, 1) + '"></span>';
    }).join("");
  }

  function statsMarkup(chart, delta) {
    var opportunities = totalFor(chart, "opportunities");
    var known = Number(chart && (chart.knownOpportunities != null ? chart.knownOpportunities : chart.totals && chart.totals.knownOpportunities) || 0);
    var coverage = opportunities ? known / opportunities * 100 : 0;
    return '<small>Рестил-пуш</small><strong>' + percent(jamRate(chart), 1) + '</strong>' +
      '<span>N ' + integer.format(opportunities) + ' · карты ' + percent(coverage, 0) + '</span>' +
      (delta == null ? '' : '<em class="' + (delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat') + '">' + signed(delta) + ' п.п.</em>');
  }

  function focusCell(rootNode, index) {
    var cells = rootNode.querySelectorAll("button");
    if (cells[index]) cells[index].focus();
  }

  function renderMatrix(rootNode, cohort) {
    var chart = chartFor(cohort);
    rootNode.innerHTML = "";
    if (!chart) {
      rootNode.innerHTML = '<p class="rank-chart-empty">Для этого среза нет данных.</p>';
      return;
    }
    Data.meta.handOrder.forEach(function (hand, index) {
      var cell = chart.cells[index] || [0, 0, 0, 0, 0];
      var rate = cellRate(cell);
      var button = document.createElement("button");
      var alpha = cell[0] ? Math.min(.94, .06 + Math.sqrt(rate / 100) * .88) : .025;
      button.type = "button";
      button.className = "rank-cell" +
        (cell[0] < 5 ? " is-empty" : cell[0] < 20 ? " is-thin" : "") +
        (cell[0] >= 50 ? " is-reliable" : "") +
        (hand === state.hand ? " is-selected" : "");
      button.style.setProperty("--jam-alpha", alpha.toFixed(3));
      button.dataset.hand = hand;
      button.dataset.index = String(index);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", hand + ": рестил-пуш " + percent(rate, 1) + ", выборка " + integer.format(cell[0]));
      button.title = hand + " · пуш " + percent(rate, 1) + " · N " + integer.format(cell[0]);
      button.innerHTML = "<b>" + hand + "</b><small>" + (cell[0] < 5 ? "—" : percent(rate, 0)) + "</small>";
      button.addEventListener("click", function () {
        state.hand = hand;
        render();
      });
      button.addEventListener("keydown", function (event) {
        var row = Math.floor(index / 13);
        var col = index % 13;
        var next = index;
        if (event.key === "ArrowRight") next = row * 13 + (col + 1) % 13;
        else if (event.key === "ArrowLeft") next = row * 13 + (col + 12) % 13;
        else if (event.key === "ArrowDown") next = ((row + 1) % 13) * 13 + col;
        else if (event.key === "ArrowUp") next = ((row + 12) % 13) * 13 + col;
        else return;
        event.preventDefault();
        focusCell(rootNode, next);
      });
      rootNode.appendChild(button);
    });
  }

  function renderReadout() {
    var novice = cellFor("novice", state.hand) || [0, 0, 0, 0, 0];
    var league = cellFor(state.league, state.hand) || [0, 0, 0, 0, 0];
    var noviceRate = cellRate(novice);
    var leagueRate = cellRate(league);
    var delta = leagueRate - noviceRate;
    byId("rankHandReadout").innerHTML =
      '<div><span>Выбранная рука</span><strong>' + state.hand + '</strong><small>' + state.position + ' · ' + sizeLabels[state.size] + ' · ' + depthLabels[state.depth] + ' BB</small></div>' +
      '<div><span>Совсем новички</span><strong>' + percent(noviceRate, 1) + '</strong><small>N ' + integer.format(novice[0]) + '</small></div>' +
      '<div><span>' + cohortLabels[state.league] + '</span><strong>' + percent(leagueRate, 1) + '</strong><small>N ' + integer.format(league[0]) + '</small></div>' +
      '<div class="' + (delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat') + '"><span>Разница</span><strong>' + signed(delta) + '</strong><small>процентных пункта</small></div>';
  }

  function summaryJamRate(cohort) {
    var summary = Data.summaries[cohort] || {};
    if (Number.isFinite(Number(summary.standardizedJamPct))) return Number(summary.standardizedJamPct);
    if (Number.isFinite(Number(summary.defaultJamPct))) return Number(summary.defaultJamPct);
    return jamRate(chartFor(cohort, "BTN", "2.0", "25-40"));
  }

  function renderGrowth() {
    var order = Data.meta.cohortOrder || ["novice", "league3", "league2", "league1"];
    var topRate = Math.max.apply(null, order.map(summaryJamRate).concat([1]));
    var rows = order.map(function (cohort) {
      var summary = Data.summaries[cohort] || {};
      var rate = summaryJamRate(cohort);
      return '<div class="rank-growth-item">' +
        '<span><strong>' + (summary.label || cohortLabels[cohort]) + '</strong><small>ABI ' + money(summary.abiUsd) + '</small></span>' +
        '<b>' + percent(rate, 1) + '<small>пуш</small></b>' +
        '<i><em style="width:' + Math.max(3, rate / topRate * 100).toFixed(1) + '%"></em></i>' +
      '</div>';
    }).join("");
    var correlation = Data.correlation || Data.correlations || {};
    var r = Number(correlation.abiVsStandardizedJamPearson != null ? correlation.abiVsStandardizedJamPearson : correlation.pearsonR);
    var association = Number.isFinite(r)
      ? (r >= .7 ? 'Сильная положительная связь: r = ' : r >= .2 ? 'Положительная связь: r = ' : 'Устойчивой положительной связи нет: r = ') + r.toFixed(2).replace(".", ",")
      : "Сравнение одинаковых спотов";
    byId("rankGrowthStrip").innerHTML = rows + '<p><strong>' + association + '.</strong> BTN 2 BB · стек 25–40 BB, глубина выровнена. Это связь четырёх когорт, а не доказательство причинности.</p>';
  }

  function renderSource(noviceChart, leagueChart) {
    var meta = Data.meta || {};
    var start = String(meta.windowStartInclusive || "2026-01-01").slice(0, 10);
    var end = String(meta.windowEndExclusive || "2026-07-14").slice(0, 10);
    byId("rankEvidenceSource").innerHTML = '<strong>Как читать:</strong> ярче клетка — чаще прямой рестил-пуш; штриховка — N меньше 20, тире — N меньше 5. ' +
      'Текущий срез: BB против одного ' + state.position + ', опен ' + sizeLabels[state.size] + ', стек ' + depthLabels[state.depth] + ' BB; ' +
      'N ' + integer.format(totalFor(noviceChart, "opportunities")) + ' против N ' + integer.format(totalFor(leagueChart, "opportunities")) + '. ' +
      '<span>FF, ' + start + '—' + end + '; лига присвоена на момент раздачи.</span>';
  }

  function render() {
    var noviceChart = chartFor("novice");
    var leagueChart = chartFor(state.league);
    if (!noviceChart || !leagueChart) return;
    renderControls();
    byId("rankLeagueTitle").textContent = cohortLabels[state.league];
    byId("rankNoviceStats").innerHTML = statsMarkup(noviceChart, null);
    byId("rankLeagueStats").innerHTML = statsMarkup(leagueChart, jamRate(leagueChart) - jamRate(noviceChart));
    byId("rankNoviceActionBar").innerHTML = actionBarMarkup(noviceChart);
    byId("rankLeagueActionBar").innerHTML = actionBarMarkup(leagueChart);
    renderMatrix(byId("rankNoviceMatrix"), "novice");
    renderMatrix(byId("rankLeagueMatrix"), state.league);
    renderReadout();
    renderSource(noviceChart, leagueChart);
  }

  renderGrowth();
  render();
  window.PokerRestealRankView = Object.freeze({ state: state, render: render });
})();
