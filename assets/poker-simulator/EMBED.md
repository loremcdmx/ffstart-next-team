# Poker Simulator Embed

Reusable iframe wrapper for project pages that need the poker simulator without
copying simulator DOM or state.

## Files

- `embed.js` exposes `window.PokerSimulatorEmbed.mount` and the shared URL builder.
- `simulator-practice-packs.js` registers full-simulator practice scenarios.
- `../poker-trainer-shell/simulator-practice.js` is the lesson adapter for both
  compact snapshot decisions and full-simulator practice.
- `../../poker-simulator-embed-demo.html` is a local integration demo.
- `poker-simulator.html?embedded=1` activates compact iframe mode.

## Usage

```html
<script src="assets/poker-simulator/embed.js"></script>
<section id="sim"></section>
<script>
  const simulator = PokerSimulatorEmbed.mount("#sim", { tableCount: 2 });
  await simulator.ready;
  await simulator.setTableCount(4);
  await simulator.newHand();
  const hand = await simulator.latestHandHistory();
</script>
```

## Commands

The wrapper talks to the iframe through `postMessage`; callers should use the
controller methods instead of reading iframe DOM directly.

- `snapshot()`
- `settings()`
- `setTableCount(count, keepExisting)`
- `newHand()`
- `hotkey(key)`
- `latestHandHistory()`
- `openReplay()`
- `exportSession()`
- `exportSessionArchive()`
- `handLogJsonl()`
- `leaderboard()`
- `restartTournament(tableId)`

Embedded simulator state uses `sessionStorage`, so demo pages do not overwrite
the main simulator's local session.

## Lesson practice

Use `FFTrainerSimulator` from lesson pages. It deliberately has no seat/card/bet
coordinates: all geometry comes from `PokerSimulatorSeatSlots`.

```js
FFTrainerSimulator.renderDecision("#spot", spot, {
  answered: false,
  selectedKey: ""
});

FFTrainerSimulator.mountPractice("#practice-frame", {
  practice: "resteal",
  hands: 25,
  tables: 1,
  tempo: "fast",
  run: crypto.randomUUID()
});
```

`practice=` is canonical. Existing `lesson=` and `drill=` URLs remain supported
as aliases.

To add a full-simulator pack:

1. Add one allowlisted asset record to `simulator-practice-packs.js`.
2. In the pack script call `PokerSimulatorPracticePacks.register(...)` with its
   id, aliases, boot settings, scenario and optional UI hooks.
3. Launch it through `FFTrainerSimulator.mountPractice`.

The declarative scenario may set Hero position (for example always `BB`) and a
pre-Hero action plan. It must not patch `engine.createTable` or add geometry CSS.
