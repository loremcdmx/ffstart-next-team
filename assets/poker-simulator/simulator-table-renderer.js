(function () {
  const root = typeof window !== "undefined" ? window : globalThis;

  function model(options = {}) {
    const getActiveTableId = typeof options.getActiveTableId === "function" ? options.getActiveTableId : () => null;
    const dealAnimationActive = typeof options.dealAnimationActive === "function" ? options.dealAnimationActive : () => false;
    const isVisualActive = typeof options.isVisualActive === "function" ? options.isVisualActive : () => false;
    const potAnimationState = typeof options.potAnimationState === "function" ? options.potAnimationState : () => ({ visibleAmount: 0, hasPending: false });
    const tournamentFinishScreenVisible = typeof options.tournamentFinishScreenVisible === "function" ? options.tournamentFinishScreenVisible : () => false;
    const showdownWinnerVisible = typeof options.showdownWinnerVisible === "function" ? options.showdownWinnerVisible : () => false;
    const showdownAwardVisible = typeof options.showdownAwardVisible === "function" ? options.showdownAwardVisible : () => false;
    const renderSimulationBadge = typeof options.renderSimulationBadge === "function" ? options.renderSimulationBadge : () => "";
    const renderBlindLevelAnnouncement = typeof options.renderBlindLevelAnnouncement === "function" ? options.renderBlindLevelAnnouncement : () => "";
    const usesBoardLayout = typeof options.usesBoardLayout === "function" ? options.usesBoardLayout : () => false;
    const renderPotStacks = typeof options.renderPotStacks === "function" ? options.renderPotStacks : () => "";
    const isActionSequenceActive = typeof options.isActionSequenceActive === "function" ? options.isActionSequenceActive : () => false;
    const winnerSeat = typeof options.winnerSeat === "function" ? options.winnerSeat : () => null;
    const formatAmount = typeof options.formatAmount === "function" ? options.formatAmount : (value) => String(value ?? 0);
    const renderDeckShoe = typeof options.renderDeckShoe === "function" ? options.renderDeckShoe : () => "";
    const renderDealCards = typeof options.renderDealCards === "function" ? options.renderDealCards : () => "";
    const renderBoard = typeof options.renderBoard === "function" ? options.renderBoard : () => "";
    const renderSeat = typeof options.renderSeat === "function" ? options.renderSeat : () => "";
    const renderSeatBets = typeof options.renderSeatBets === "function" ? options.renderSeatBets : () => "";
    const renderFoldedCardMucks = typeof options.renderFoldedCardMucks === "function" ? options.renderFoldedCardMucks : () => "";
    const renderBetFlights = typeof options.renderBetFlights === "function" ? options.renderBetFlights : () => "";
    const renderActionBubbles = typeof options.renderActionBubbles === "function" ? options.renderActionBubbles : () => "";
    const renderRiverResolutionCue = typeof options.renderRiverResolutionCue === "function" ? options.renderRiverResolutionCue : () => "";
    const renderPotAward = typeof options.renderPotAward === "function" ? options.renderPotAward : () => "";
    const renderResultBanner = typeof options.renderResultBanner === "function" ? options.renderResultBanner : () => "";
    const renderTournamentFinishScreen = typeof options.renderTournamentFinishScreen === "function" ? options.renderTournamentFinishScreen : () => "";
    const actionBarClass = typeof options.actionBarClass === "function" ? options.actionBarClass : () => "";
    const renderActionStatus = typeof options.renderActionStatus === "function" ? options.renderActionStatus : () => "";
    const renderActions = typeof options.renderActions === "function" ? options.renderActions : () => "";
    const renderHeroTimebank = typeof options.renderHeroTimebank === "function" ? options.renderHeroTimebank : () => "";
    const potTotalLabel = String(options.potTotalLabel || "ВСЕГО");

      function renderTable(table) {
        const isActive = table.id === getActiveTableId();
        // is-over styling (dimmed felt, post-hand chrome) must not flip while
        // the terminal action cascade is still playing — that spoils the
        // result seconds before the fold bubbles reach their seats.
        const over = table.status !== "playing" && !isActionSequenceActive(table);
        const showdown = table.status === "showdown";
        const dealing = dealAnimationActive(table);
        const boardDealing = isVisualActive(table, "boardRevealUntil");
        const potState = potAnimationState(table);
        const tournamentFinished = tournamentFinishScreenVisible(table);
        const headsUp = Array.isArray(table.seats) && table.seats.length === 2;
        // Split the readout only once there is a board to straddle: the chip
        // pile above shows the CARRIED pot (settled, without this street's bets)
        // and a "ВСЕГО" pill below the board shows the TOTAL (with bets).
        // Preflop there is no board — keep a single pile showing the full pot.
        const hasBoard = usesBoardLayout(table);
        const pileAmount = hasBoard ? potState.carriedAmount : potState.totalAmount;
        const pileState = hasBoard ? potState : { ...potState, carriedAmount: pileAmount };
        const heroTimebankHtml = table?.serverMode ? "" : renderHeroTimebank(table);
        const tableClasses = [
          isActive ? "is-active" : "",
          over ? "is-over" : "",
          headsUp ? "is-heads-up" : "",
          tournamentFinished ? "is-tournament-finished" : "",
          dealing ? "is-dealing" : "",
          boardDealing ? "is-board-dealing" : "",
          showdown ? "is-showdown-sequence" : "",
          showdown && table.allInRunout ? "is-all-in-runout" : "",
          showdown && showdownWinnerVisible(table) ? "is-showdown-winner-visible" : "",
          showdown && showdownAwardVisible(table) ? "is-showdown-award" : ""
        ].filter(Boolean).join(" ");
        return `
          <article class="table-shell ${tableClasses}" data-table-id="${table.id}">
            ${renderSimulationBadge(table)}
            <button class="table-replay-button" type="button" data-action="replay-table-hand" aria-label="Повтор раздач стола ${table.id}" title="Повтор раздач этого стола">⟲ Повтор</button>
            ${renderBlindLevelAnnouncement(table)}
            <section class="felt ${usesBoardLayout(table) ? "has-board" : "is-preflop"}" aria-label="Покерный стол ${table.id}">
              <div class="pot ${isActionSequenceActive(table) && (table.betAnimations || []).length ? "is-pulsing" : ""} ${potState.hasPending ? "has-pending" : ""} ${!isActionSequenceActive(table) && winnerSeat(table) ? "is-awarding" : ""}">
                ${renderPotStacks(pileState)}
                <span class="pot-text">
                  <span class="pot-label">БАНК</span>
                  <span class="pot-values">
                    <span class="pot-value pot-value-current">${formatAmount(pileAmount)}</span>
                  </span>
                </span>
              </div>
              ${renderDeckShoe(table)}
              ${renderDealCards(table)}
              <div class="board-row ${boardDealing ? "is-dealing-board" : ""}">${renderBoard(table)}</div>
              ${hasBoard ? `<div class="pot-total ${!isActionSequenceActive(table) && winnerSeat(table) ? "is-awarding" : ""}" aria-label="банк с учётом ставок">
                <span class="pot-text">
                  <span class="pot-label">${potTotalLabel}</span>
                  <span class="pot-values">
                    <span class="pot-value pot-value-current">${formatAmount(potState.totalAmount)}</span>
                  </span>
                </span>
              </div>` : ""}
              ${table.seats.map((seat) => renderSeat(table, seat)).join("")}
              ${renderSeatBets(table)}
              ${renderFoldedCardMucks(table)}
              ${renderBetFlights(table)}
              ${renderActionBubbles(table)}
              ${renderRiverResolutionCue(table)}
              ${renderPotAward(table)}
              ${renderResultBanner(table)}
            </section>
            ${renderTournamentFinishScreen(table)}

            <footer class="action-bar ${actionBarClass(table)}">
              ${heroTimebankHtml || renderActionStatus(table)}
              <div class="action-buttons">${renderActions(table)}</div>
            </footer>
          </article>
        `;
      }

    return { renderTable };
  }

  root.PokerSimulatorTableRenderer = { model };
  if (typeof module !== "undefined" && module.exports) module.exports = { model };
})();
