(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;

  const VIEWPORTS = Object.freeze(["FHD", "QHD"]);
  const TIERS = Object.freeze(["T1", "T2", "T4"]);
  const PHASES = Object.freeze(["preflop-blinds", "postflop-bets", "all-in", "finished-reveal"]);
  const UI_SCALES = Object.freeze(["auto", "compact", "standard", "large", "xl"]);

  const CENTER = Object.freeze({ x: 50, y: 50 });
  const BOUNDS = Object.freeze({ left: 0, top: 0, right: 100, bottom: 100 });

  const DIMENSION_SOURCE = [
    "CSS design-token fallback from simulator-table.css/simulator-polish.css plus live shell/felt DOM probe",
    "used when a live computed-style probe is unavailable in the worktree"
  ].join("; ");

  const BASE_DIMENSIONS = Object.freeze({
    // boxStraddle: fraction of the box half-projection that hangs OUTSIDE the
    // felt edge onto the table rail (real-client look: the nameplate sits ON
    // the rail, not at the bet line). 0 = fully inside (old G2 behavior),
    // 1 = box center exactly on the felt edge, >1 lets the box sit mostly
    // outside the felt on the physical rail. Cards now dock to the box like
    // real poker-room seats; slotStraddle keeps bet markers on the in-felt
    // betting lane while the box moves outward. railOverhang:
    // how far past the felt rect a BOX may extend (the rail ring width budget)
    // - boxes only; cards/markers stay strictly inside the felt.
    T1: freezeTier({
      // Rendered felt aspect (felt width / felt height). MEASURED render-truth from
      // scripts/simulator-scaling-reconcile-smoke.mjs (constant across every viewport
      // at this table count: felt ratio 1.903, dealerDotH/dealerDotW == 1.903). Used
      // ONLY in the dealer reveal-card keep-out path (FIX 2): the disc is square in PX
      // (one --dealer-dot-size on both axes) but the engine rect lives in percent
      // space, so its true rendered HEIGHT fraction = dealerDot.d * feltAspect. The
      // general collision core still treats the disc square-in-percent (documented in
      // the css-engine-size-contract gate); only the keep-out clearance/overlap math
      // is aspect-corrected, where a too-short disc would mis-clear a pushed card.
      feltAspect: 1.903,
      ellipse: { rx: 48.0, ry: 47.5 },
      // Felt is a rounded-rect (CSS border-radius 13% / 43%); seats project onto
      // this perimeter, not an ellipse, so corner seats reach the boxy rail.
      feltCorner: { rx: 13, ry: 43 },
      // Opponent bet marker sits this fraction of the way from box -> centre
      // (CoinPoker betting ring ~32-39% in from each seat).
      betRingFraction: 0.33,
      // Action dock (.client-controls) top edge in felt-% for the enlarged
      // single-table betbox: no opponent box may drop below this, so none sits
      // under the action controls. (2-/4-table docks render at/below the felt
      // bottom — their seats never reach them, so no keep-out.)
      dockKeepoutTopY: 84.5,
      // No stadium bias: it was tuned to fake boxiness on the OLD ellipse model by
      // pulling the mid-side seats up toward vertical centre. With the rounded-rect
      // projection the raw even-angle distribution already lands on the boxy rail,
      // and the bias only crowded the mid-side seats (Max/Lee) against the upper
      // seats. Even angles seat them at the midpoint of their rail segment.
      stadiumBias: null,
      edgePad: 0.5,
      boxStraddle: 1.18,
      slotStraddle: 1.0,
      slotClampInset: 0.5,
      railOverhang: 6.0,
      shellBounds: { left: -5.367, top: -8.985, right: 105.367, bottom: 109.576 },
      cardDockWeight: 1.0,
      heroCardDockWeight: 0,
      revealCardDockWeight: 0.45,
      cardBoxOverlap: 12.8,
      heroCardDistanceOverlap: 9.0,
      seatBox: { w: 15.2, h: 13.0 },
      heroSeatBox: { w: 16.6, h: 13.4 },
      cardPair: { w: 7.8, h: 10.8 },
      heroCardPair: { w: 12.2, h: 18.2 },
      heroCardDockOutset: 9.0,
      heroCardBoxOverlap: 28.0,
      revealCardPair: { w: 11.6, h: 16.4 },
      marker: { w: 10.0, h: 8.4 },
      // Disc diameter as %-of-felt (square in percent space -> non-square px on a
      // wide felt). Unified with the CSS --dealer-dot-size token (3.0cqw): both are
      // the render-truth measured at the fhd calibration viewport, killing the old
      // engine-vs-render decoupling (was 3.5 here while CSS rendered ~3.0%). The
      // scaling-reconcile + css-engine-size-contract gates pin CSS == this number.
      dealerDot: { d: 3.0 },
      // Half-width (% felt) of a dead opponent's RENDERED revealed card pair
      // — the dealer keep-out used only in reveal phases. The rendered card is
      // far larger than revealCardPair
      // (which is a collision proxy), so this is measured from the live render:
      // heads-up reveal card pair spans ~20.7% felt width (half ~10.35); +~2 margin
      // so the disc lands beside it with a visible gap. NOT a render size — only
      // the dealer-button avoidance footprint.
      revealDealerCardClearW: 12.4,
      // RENDERED revealed-card-pair footprint (%felt-w x %felt-h) at the CROWDED
      // worst case (8-max: cards are smallest per-seat but neighbours are closest,
      // so this is where the top<->side reveal cards can cross). Unlike
      // revealDealerCardClearW (a HU-calibrated dealer keep-out with margin), this is
      // the true rendered card size used for the card-vs-card neighbour-separation
      // model (see renderedRevealCardRects + the reveal-card-vs-card gate). MEASURED
      // from the live render at fhd/8-max after the compact 1.5x showdown scale
      // (T1 8-max villain reveal ~11.0% felt wide, ~14.7% felt tall). Cards grow
      // at lower player counts, so an 8-max footprint
      // is a conservative floor for the crowded case the gate targets.
      renderedRevealCard: { w: 11.0, h: 14.7 },
      // Face-up cards remain one visual component with their owner plate. The
      // card edge tucks under the plate by this fraction of its full inward
      // projection; the panel paints above the cards, so names/stacks stay clear.
      revealCardTuckFraction: 0.2,
      // Minimum visible gutter between two reveal-card PAIRS while their
      // vertical bands still overlap. This is a Gestalt/grouping invariant,
      // not only a collision pad: without it four cards can read as one hand.
      revealCardGroupingGap: 0.6,
      pot: { w: 9.0, h: 5.8, y: 27.5, preflopY: 41.0 },
      boardLane: { w: 28.0, h: 18.2, y: 45.2 },
      gaps: { boxToCards: 0.9, cardsToMarker: 1.6, boxToDealer: 1.5, collision: 0.5 }
    }),
    T2: freezeTier({
      // Measured render-truth felt aspect (constant across viewports): ratio 1.417,
      // dealerDotH/dealerDotW == 1.417. See T1 feltAspect note + FIX 2. The T2/QHD
      // ui-scale patches do not change the felt aspect (the reconcile probe reads
      // 1.417 at every ui-scale), so this base value covers them.
      feltAspect: 1.417,
      ellipse: { rx: 49.0, ry: 44.2 },
      // 2-table felt CSS border-radius 13% / 42%.
      feltCorner: { rx: 13, ry: 42 },
      betRingFraction: 0.33,
      // No stadium bias — same fix as T1 (see its note). The bias is an artefact
      // of the OLD ellipse-only model; with the rounded-rect projection the raw
      // even-angle distribution already lands on the boxy rail at the midpoint of
      // each segment. Keeping it here pulled the mid-side seats up toward vertical
      // centre and bunched them against the upper seats, leaving a large empty
      // stretch of lower-side rail — very visible once the 2-table felt renders
      // big (vertical/stacked layout). Nulling it spreads the nine seats evenly.
      stadiumBias: null,
      edgePad: 0.6,
      boxStraddle: 1.28,
      slotStraddle: 0.95,
      railOverhang: 7.0,
      shellBounds: { left: -3.419, top: -13.889, right: 103.419, bottom: 125.0 },
      cardDockWeight: 1.0,
      heroCardDockWeight: 1.0,
      revealCardDockWeight: 0.45,
      cardBoxOverlap: 12.0,
      heroCardDistanceOverlap: 6.6,
      seatBox: { w: 16.4, h: 9.8 },
      heroSeatBox: { w: 17.4, h: 10.4 },
      cardPair: { w: 7.2, h: 9.2 },
      heroCardPair: { w: 13.0, h: 16.6 },
      revealCardPair: { w: 10.0, h: 13.0 },
      marker: { w: 8.6, h: 4.8 },
      heroMarker: { w: 8.6, h: 4.8 },
      // 4.0 == render-truth == CSS --dealer-dot-size token (4.0cqw). See T1 note.
      dealerDot: { d: 4.0 },
      // See T1 revealDealerCardClearW. 2-table top boxes render ~15.9% felt wide
      // (half ~7.95) and the reveal card pair tracks the box width, so half ~8 + margin.
      revealDealerCardClearW: 10.0,
      // See T1 renderedRevealCard. MEASURED/scaled at fhd/8-max: 2-table villain
      // reveal pair ~12.25% felt wide, ~12.2% felt tall. This is the tier where the
      // top<->side corner reveal cards visibly cross (the trainer P3 finding), so
      // the reveal-card-vs-card gate leans on this footprint most.
      renderedRevealCard: { w: 12.25, h: 12.2 },
      revealCardTuckFraction: 0.2,
      revealCardGroupingGap: 0.6,
      pot: { w: 10.8, h: 4.8, y: 27.5, preflopY: 40.2 },
      boardLane: { w: 37.0, h: 17.0, y: 44.0 },
      postflopBoardLane: { w: 39.0, h: 17.2, y: 44.0 },
      markerBoardLane: { w: 39.0, h: 18.6, y: 44.0 },
      gaps: { boxToCards: 0.6, cardsToMarker: 2.5, boxToDealer: 1.5, collision: 0.5 }
    }),
    T4: freezeTier({
      // Measured render-truth felt aspect (constant across viewports): ratio 2.39,
      // dealerDotH/dealerDotW == 2.39. See T1 feltAspect note + FIX 2. This is the
      // widest tier, so the disc's square-in-percent model understates its rendered
      // height most here — exactly where the keep-out correction matters.
      feltAspect: 2.39,
      ellipse: { rx: 44.0, ry: 45.8 },
      // Project onto the rounded-rect rail (like T1/T2). The earlier ellipse-only
      // T4 undershot the diagonal/corner seats, floating them ~12% of felt-width
      // INSIDE the rail (measured & clearly visible at 4-up — not sub-perceptible
      // as once assumed). The dealer-dot/fold-badge overlay this projection was
      // once thought to trip no longer does: the ui-scale-overlay-clearance gate
      // (4:standard/xl:BB) and geometry-collisions dealer-attribution stay green
      // with the current rx=44 / dealerDot / boxToDealer values.
      feltCorner: { rx: 13, ry: 43 },
      betRingFraction: 0.33,
      stadiumBias: { sideYPower: 1.85, sideYLow: 0.34, sideYHigh: 0.72 },
      edgePad: 0.95,
      boxStraddle: 1.28,
      slotStraddle: 1.0,
      railOverhang: 5.5,
      shellBounds: { left: -5.92, top: -12.829, right: 105.92, bottom: 137.144 },
      cardDockWeight: 1.0,
      heroCardDockWeight: 0.85,
      revealCardDockWeight: 0.5,
      cardBoxOverlap: 5.8,
      // The screen-up reveal card (revealCardPair, larger) peeks ~7% of felt
      // height into its own nameplate. The old 2.4 allowance was below that, so
      // the resolver treated the intended nameplate peek as a blocking collision
      // and shoved the card ~9.85% felt width sideways on reveal (the R2-GEOM T4
      // --seat-cards-dx live jump). Own-box overlap is design intent, never a real
      // defect (cross-seat/board/out-of-bounds checks are unaffected), so the
      // allowance covers the docked peek with margin.
      revealCardBoxOverlap: 8.0,
      heroCardDistanceOverlap: 3.0,
      revealCardDistanceOverlap: 2.4,
      seatBox: { w: 10.6, h: 12.4 },
      // Live T4 panel footprint measured in the FHD 4-up DOM. The resolver keeps
      // the smaller collision box above, while reveal docking uses the rendered
      // plate so card faces are not hidden under its wider/taller artwork.
      renderedRevealSeatBox: { w: 12.8, h: 15.5 },
      heroSeatBox: { w: 11.8, h: 12.5 },
      cardPair: { w: 5.4, h: 6.6 },
      heroCardPair: { w: 12.4, h: 16.4 },
      revealCardPair: { w: 9.1, h: 12.0 },
      marker: { w: 9.2, h: 6.6 },
      // 2.8 == render-truth (24px / ~857px felt at cal) == CSS token (2.8cqw). See
      // T1 note. Was 2.9; the 0.1 shrink keeps the collision/attribution gates green.
      dealerDot: { d: 2.8 },
      // See T1 revealDealerCardClearW. 4-table top boxes render ~9.8% felt wide
      // (half ~4.9) and reveal cards track box width, so half ~5 + margin.
      revealDealerCardClearW: 6.5,
      // T4 uses a compact 1.28x reveal (the former generic 1.8x cards dominated the
      // table and forced detached global lanes). This is the measured footprint
      // scaled from the former 1.8x render truth: 12.9x21.4 -> 9.2x15.2.
      renderedRevealCard: { w: 9.2, h: 15.2 },
      // Approved card pocket: 20% of the revealed hand remains under its
      // owner's panel. Top seats still open inward (down the felt), and the
      // top-centre safety floor below handles the edge with no vertical room.
      revealCardTuckFraction: 0.2,
      // The top-centre owner shares a narrow lane with the live pot readout.
      // Preserve a minimum tuck for unusually small render footprints so the
      // card feet do not touch the pot amount in the real FHD four-table render.
      revealTopCenterExtraTuck: 1.1,
      // Ownership now comes from docking each hand to its player, not from
      // spreading hands across the felt. A small real gutter is sufficient.
      revealCardGroupingGap: 0.7,
      pot: { w: 7.4, h: 4.4, y: 28.0, preflopY: 41.0 },
      boardLane: { w: 27.0, h: 18.4, y: 44.0 },
      gaps: { boxToCards: 0.75, cardsToMarker: 4.0, boxToDealer: 1.5, collision: 0.5 }
    })
  });

  // MARKER CLEARANCE DERIVATION AUDIT (Batch 3.5). The task set out to kill the
  // "per-slot clearance-constant pendulum" the 12.06 marker-vs-pot cluster fix
  // created. Mapping the live consumers first (the mandate's task 1) found that
  // the pendulum no longer exists for MARKERS — the marker system was already
  // refactored off per-slot constants onto derived placement:
  //   * OPPONENT markers ignore gaps.cardsToMarker entirely. seatSlotRects places
  //     them at mixPoints(boxCenter, CENTER, betRingFraction) — a fixed 0.33 radial
  //     fraction of the box->centre span (the GOOD pattern that replaced the old
  //     per-slot pot offsets). So NO opponent-marker clearance literal is live.
  //   * The HERO marker is the ONLY consumer of gaps.cardsToMarker. Its placement
  //     is add(slotCenter, inward * markerDistance) where markerDistance is already
  //     a geometry-derived stack (box-half + boxToCards + card-halves + marker-half)
  //     plus this single cardsToMarker pad. The pad is NOT a per-slot pendulum: it
  //     is ONE hand-set visual gap per config between the hero hole-cards and the
  //     hero felt-bet chip. It resists derivation from pot/dock geometry — the
  //     T2/QHD ui-scales keep heroCardPair FIXED (13.0x16.6) yet want a larger 6.0
  //     pad purely so the enlarged QHD marker still reads clear of the cards, which
  //     is a taste call, not a function of the pot/board rect. A derivation attempt
  //     moved the hero marker up to ~12.9% felt (measured, dump-markers sweep) —
  //     far past the mandate's ~0.5% STOP tolerance — so per the stop condition the
  //     literals stay, documented here. What the audit DID kill is the dead weight:
  //   * markerClearance: 0.4 was declared on all five T2/QHD ui-scale patches and
  //     READ NOWHERE (repo-wide grep: 5 declarations, 0 consumers). Removed. Its
  //     absence is a no-op — mergeDimensionPatch only copies present keys, so
  //     dimensions.markerClearance was already undefined for every other config and
  //     stays undefined here, exactly as base T2 (which never carried it).
  // The real clearance guarantee for markers is now enforced by the collision smoke
  // (runMarkerClearanceGate), which asserts every rendered marker clears the pot,
  // board and its own cards across the full sweep incl. these ui-scales.
  const T2_QHD_UI_SCALE_DIMENSIONS = Object.freeze({
    compact: freezeTier({
      seatBox: { w: 15.8, h: 9.4 },
      heroSeatBox: { w: 16.8, h: 10.0 },
      marker: { w: 9.8, h: 5.6 },
      heroMarker: { w: 9.8, h: 5.6 },
      pot: { w: 9.8, h: 4.5, y: 27.5 },
      markerBoardLane: { w: 38.5, h: 22.0, y: 44.0 },
      gaps: { cardsToMarker: 6.0 }
    }),
    standard: freezeTier({
      seatBox: { w: 16.8, h: 9.9 },
      heroSeatBox: { w: 17.8, h: 10.5 },
      marker: { w: 10.6, h: 6.2 },
      heroMarker: { w: 10.6, h: 6.2 },
      pot: { w: 10.8, h: 4.8, y: 27.5 },
      markerBoardLane: { w: 41.0, h: 22.8, y: 44.0 },
      gaps: { cardsToMarker: 6.0 },
      // The enlarged box+marker pairs outgrow the base 0.33 betting ring at the
      // mid-side seats (box right edge + marker half-width passes the ring), so
      // the collision rescue flung those markers onto the box at the felt edge
      // (seat 2/6 "jump" at the FHD->QHD boundary). Push the ring inward just
      // past the enlarged geometry instead; grows with the per-scale patch.
      betRingFraction: 0.34
    }),
    auto: freezeTier({
      seatBox: { w: 18.8, h: 10.8 },
      heroSeatBox: { w: 19.8, h: 11.4 },
      marker: { w: 11.4, h: 6.9 },
      heroMarker: { w: 11.4, h: 6.9 },
      pot: { w: 11.6, h: 5.1, y: 27.5 },
      markerBoardLane: { w: 44.2, h: 23.8, y: 44.0 },
      gaps: { cardsToMarker: 6.0 },
      betRingFraction: 0.37
    }),
    large: freezeTier({
      seatBox: { w: 20.0, h: 11.2 },
      heroSeatBox: { w: 21.0, h: 11.8 },
      marker: { w: 12.0, h: 7.4 },
      heroMarker: { w: 12.0, h: 7.4 },
      pot: { w: 12.2, h: 5.4, y: 27.5 },
      markerBoardLane: { w: 47.0, h: 25.0, y: 44.0 },
      gaps: { cardsToMarker: 6.0 },
      betRingFraction: 0.39
    }),
    xl: freezeTier({
      seatBox: { w: 21.4, h: 11.8 },
      heroSeatBox: { w: 22.4, h: 12.4 },
      marker: { w: 12.6, h: 8.0 },
      heroMarker: { w: 12.6, h: 8.0 },
      // pot y 25.5 left the top-centre seat's all-in marker corridor 0.1 short
      // (cards bottom 12.7 vs pot top 22.65, marker h 8 + gaps) — the rescue
      // then flung that marker across the felt. The nearest rescue candidate
      // lands at y 18.4, so the pot must sit at y ≥ 26.4 for that candidate to
      // clear; 26.5 keeps 0.25 slack and still clears the marker board lane
      // below (pot bottom 29.35 + gap 1.0 < lane top 30.9).
      pot: { w: 12.8, h: 5.7, y: 26.5 },
      markerBoardLane: { w: 50.5, h: 26.2, y: 44.0 },
      gaps: { cardsToMarker: 6.0 },
      betRingFraction: 0.41
    })
  });

  // Heads-up CSS narrows the felt horizontally at T1/T4. Percent-of-felt card,
  // plate and marker footprints therefore differ materially from the same tier's
  // crowded-table calibration. These are live FHD DOM measurements, adjusted for
  // the compact T1 heads-up showdown scale (1.2x instead of the former 1.8x).
  const HEADS_UP_DIMENSION_PATCHES = Object.freeze({
    T1: freezeTier({
      feltAspect: 1.23,
      renderedRevealSeatBox: { w: 19.5, h: 7.9 },
      renderedRevealCard: { w: 13.8, h: 12.0 },
      marker: { w: 12.4, h: 5.3 },
      heroMarker: { w: 12.4, h: 5.3 },
      // The compact HU marker footprint is render-accurate, but the live hero
      // card cluster is taller than the collision proxy. Keep the marker in the
      // same betting lane with a real 4px+ visual gutter at FHD.
      gaps: { cardsToMarker: 1.9 }
    }),
    T4: freezeTier({
      feltAspect: 1.71,
      renderedRevealSeatBox: { w: 18.3, h: 15.0 },
      renderedRevealCard: { w: 12.9, h: 15.2 },
      marker: { w: 13.1, h: 7.9 },
      heroMarker: { w: 13.1, h: 7.9 }
    })
  });

  const IMMOVABILITY = Object.freeze({
    board: 100,
    pot: 90,
    box: 70,
    cards: 50,
    dealer: 40,
    marker: 30
  });

  function freezeTier(value) {
    const copy = {};
    Object.keys(value).forEach((key) => {
      copy[key] = value[key] && typeof value[key] === "object"
        ? Object.freeze({ ...value[key] })
        : value[key];
    });
    return Object.freeze(copy);
  }

  function clone(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(clone);
    const result = {};
    Object.keys(value).forEach((key) => {
      result[key] = clone(value[key]);
    });
    return result;
  }

  function round(value, places = 3) {
    const factor = 10 ** places;
    return Math.round(Number(value || 0) * factor) / factor;
  }

  function normalizeTier(tier) {
    const key = String(tier || "T1").toUpperCase();
    if (BASE_DIMENSIONS[key]) return key;
    if (key === "1" || key === "ONE") return "T1";
    if (key === "2" || key === "TWO") return "T2";
    if (key === "4" || key === "FOUR") return "T4";
    return "T1";
  }

  function normalizeViewport(viewport) {
    const key = String(viewport || "FHD").toUpperCase();
    return VIEWPORTS.includes(key) ? key : "FHD";
  }

  function normalizeUiScale(uiScale) {
    const key = String(uiScale || "standard").trim().toLowerCase();
    return UI_SCALES.includes(key) ? key : "standard";
  }

  function mergeDimensionPatch(dimensions, patch) {
    if (!patch || typeof patch !== "object") return dimensions;
    Object.keys(patch).forEach((key) => {
      const value = patch[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        dimensions[key] = { ...(dimensions[key] || {}), ...clone(value) };
      } else {
        dimensions[key] = value;
      }
    });
    return dimensions;
  }

  function dimensionsFor(options = {}) {
    const tier = normalizeTier(options.tier);
    const viewport = normalizeViewport(options.viewport);
    const uiScale = normalizeUiScale(options.uiScale);
    const playerCount = clamp(Math.floor(Number(options.playerCount || 9)), 2, 9);
    const dimensions = clone(BASE_DIMENSIONS[tier]);
    if (tier === "T2" && viewport === "QHD") {
      mergeDimensionPatch(dimensions, T2_QHD_UI_SCALE_DIMENSIONS[uiScale]);
    }
    if (playerCount === 2 && HEADS_UP_DIMENSION_PATCHES[tier]) {
      mergeDimensionPatch(dimensions, HEADS_UP_DIMENSION_PATCHES[tier]);
    }
    dimensions.tier = tier;
    dimensions.viewport = viewport;
    dimensions.uiScale = uiScale;
    dimensions.playerCount = playerCount;
    dimensions.source = DIMENSION_SOURCE;
    return dimensions;
  }

  function unit(vector) {
    const length = Math.hypot(Number(vector?.x || 0), Number(vector?.y || 0));
    if (!length) return { x: 0, y: -1 };
    return { x: vector.x / length, y: vector.y / length };
  }

  function scale(vector, amount) {
    return { x: vector.x * amount, y: vector.y * amount };
  }

  function add(point, vector) {
    return { x: point.x + vector.x, y: point.y + vector.y };
  }

  function mixPoints(from, to, amount) {
    const t = clamp(amount, 0, 1);
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t
    };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function projectionHalf(size, axis) {
    return Math.abs(axis.x) * Number(size.w || 0) / 2 + Math.abs(axis.y) * Number(size.h || 0) / 2;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value || 0)));
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function biasedSeatVector(angle, dimensions) {
    const rawX = Math.cos(angle);
    const rawY = Math.sin(angle);
    const bias = dimensions.stadiumBias || null;
    if (!bias) return { x: rawX, y: rawY };
    const absY = Math.abs(rawY);
    const low = Number(bias.sideYLow ?? 0.34);
    const high = Number(bias.sideYHigh ?? 0.72);
    const power = Number(bias.sideYPower ?? 1.85);
    const shapedY = Math.sign(rawY) * (absY ** power);
    const keepArc = smoothstep((absY - low) / Math.max(0.001, high - low));
    return unit({
      x: rawX,
      y: shapedY * (1 - keepArc) + rawY * keepArc
    });
  }

  // Project a unit `outward` ray from the felt centre onto a rounded-rectangle
  // perimeter (elliptical corners), returning the felt-% boundary point. The
  // rendered felt is a rounded-rect (border-radius 13% / 43%), NOT an ellipse —
  // projecting seats onto a matching rounded-rect makes the box land on the rail
  // at EVERY angle. An ellipse undershoots the diagonal/corner seats, so they
  // floated inside the felt while the cardinal seats sat correctly on the rim.
  function roundedRectEdge(outward, halfW, halfH, cornerRx, cornerRy) {
    const rx = clamp(cornerRx, 0, halfW);
    const ry = clamp(cornerRy, 0, halfH);
    const cornerX = halfW - rx;
    const cornerY = halfH - ry;
    const inside = (px, py) => {
      const ax = Math.abs(px);
      const ay = Math.abs(py);
      if (ax > halfW || ay > halfH) return false;
      const dx = Math.max(ax - cornerX, 0) / (rx || 1e-6);
      const dy = Math.max(ay - cornerY, 0) / (ry || 1e-6);
      return dx * dx + dy * dy <= 1;
    };
    let lo = 0;
    let hi = Math.hypot(halfW, halfH) * 1.5;
    for (let i = 0; i < 42; i += 1) {
      const mid = (lo + hi) / 2;
      if (inside(outward.x * mid, outward.y * mid)) lo = mid;
      else hi = mid;
    }
    return { x: CENTER.x + outward.x * lo, y: CENTER.y + outward.y * lo };
  }

  function rectFromCenter(center, size, meta = {}) {
    const w = Number(size?.w || size?.d || 0);
    const h = Number(size?.h || size?.d || 0);
    return {
      ...meta,
      center: { x: Number(center?.x || 0), y: Number(center?.y || 0) },
      size: { w, h },
      left: Number(center?.x || 0) - w / 2,
      right: Number(center?.x || 0) + w / 2,
      top: Number(center?.y || 0) - h / 2,
      bottom: Number(center?.y || 0) + h / 2
    };
  }

  function refreshRect(rect) {
    rect.left = rect.center.x - rect.size.w / 2;
    rect.right = rect.center.x + rect.size.w / 2;
    rect.top = rect.center.y - rect.size.h / 2;
    rect.bottom = rect.center.y + rect.size.h / 2;
    return rect;
  }

  function moveRect(rect, delta) {
    rect.center = add(rect.center, delta);
    return refreshRect(rect);
  }

  function expandBounds(bounds = BOUNDS, amount = 0) {
    const pad = Math.max(0, Number(amount || 0));
    return {
      left: Number(bounds.left ?? BOUNDS.left) - pad,
      top: Number(bounds.top ?? BOUNDS.top) - pad,
      right: Number(bounds.right ?? BOUNDS.right) + pad,
      bottom: Number(bounds.bottom ?? BOUNDS.bottom) + pad
    };
  }

  function boundsForRect(rect, options = {}) {
    const base = options.bounds || BOUNDS;
    if (rect?.boundsKind === "shell") {
      return options.shellBounds
        || options.dimensions?.shellBounds
        || expandBounds(base, rect.boundsAllowance || 0);
    }
    return base;
  }

  function seatAnchors(count, options = {}) {
    const safeCount = clamp(Math.floor(Number(count || 0)), 2, 9);
    const dimensions = options.dimensions || dimensionsFor(options);
    const anchors = [];
    for (let seatId = 0; seatId < safeCount; seatId += 1) {
      const angle = Math.PI / 2 + seatId * ((Math.PI * 2) / safeCount);
      const outward = biasedSeatVector(angle, dimensions);
      const inward = scale(outward, -1);
      const tangent = unit({ x: -outward.y, y: outward.x });
      const isHero = seatId === 0;
      const seatSize = isHero ? dimensions.heroSeatBox : dimensions.seatBox;
      const felt = dimensions.feltCorner;
      const edge = felt
        ? roundedRectEdge(outward, dimensions.ellipse.rx, dimensions.ellipse.ry, felt.rx, felt.ry)
        : {
            x: CENTER.x + outward.x * dimensions.ellipse.rx,
            y: CENTER.y + outward.y * dimensions.ellipse.ry
          };
      // Straddle the felt edge: only (1 - boxStraddle) of the half-projection
      // (+pad) stays inside, the rest hangs onto the rail like real clients.
      const straddle = clamp(Number(dimensions.boxStraddle || 0), 0, 1.4);
      const slotStraddle = clamp(
        Number(dimensions.slotStraddle ?? Math.min(straddle, 1)),
        0,
        1
      );
      const rail = Math.max(0, Number(dimensions.railOverhang || 0));
      const boxBounds = dimensions.shellBounds || expandBounds(BOUNDS, rail);
      const inwardOffset = (projectionHalf(seatSize, outward) + dimensions.edgePad) * (1 - straddle);
      const slotInwardOffset = (projectionHalf(seatSize, outward) + dimensions.edgePad) * (1 - slotStraddle);
      const boxCenter = add(edge, scale(outward, -inwardOffset));
      const slotCenter = add(edge, scale(outward, -slotInwardOffset));
      // Reserve the bottom strip for the hero + action dock: lift any non-hero
      // box (and its docked cards/marker slot) above the dock's top edge so no
      // opponent seat sits under the action controls (the "betbox"). Hero stays
      // alone at the very bottom-centre; the two flank seats rise onto the
      // lower-side rails. dockKeepoutTopY is the dock top in felt-% (measured).
      const dockTopY = Number(dimensions.dockKeepoutTopY || 0);
      if (dockTopY > 0 && !isHero) {
        const maxBoxY = dockTopY - seatSize.h / 2;
        if (boxCenter.y > maxBoxY) {
          const lift = maxBoxY - boxCenter.y;
          boxCenter.y = maxBoxY;
          slotCenter.y += lift;
        }
      }
      const slotClampInset = Number.isFinite(Number(dimensions.slotClampInset))
        ? Math.max(0, Number(dimensions.slotClampInset))
        : null;
      const slotClampX = slotClampInset === null ? seatSize.w / 2 : slotClampInset;
      const slotClampY = slotClampInset === null ? seatSize.h / 2 : slotClampInset;
      anchors.push({
        seatId,
        angleDeg: round((angle * 180) / Math.PI),
        isHero,
        outward,
        inward,
        tangent,
        edge: { x: round(edge.x), y: round(edge.y) },
        boxCenter: {
          x: round(clamp(boxCenter.x, boxBounds.left + seatSize.w / 2, boxBounds.right - seatSize.w / 2)),
          y: round(clamp(boxCenter.y, boxBounds.top + seatSize.h / 2, boxBounds.bottom - seatSize.h / 2))
        },
        slotCenter: {
          x: round(clamp(slotCenter.x, BOUNDS.left + slotClampX, BOUNDS.right - slotClampX)),
          y: round(clamp(slotCenter.y, BOUNDS.top + slotClampY, BOUNDS.bottom - slotClampY))
        }
      });
    }
    return anchors;
  }

  function phaseUsesRevealCards(phase) {
    return phase === "all-in" || phase === "finished-reveal";
  }

  function fixedRects(dimensions, phase) {
    const rects = [];
    if (phase !== "preflop-blinds") {
      const boardLane = phase === "postflop-bets" && dimensions.postflopBoardLane
        ? dimensions.postflopBoardLane
        : dimensions.boardLane;
      rects.push(rectFromCenter(
        { x: 50, y: boardLane.y },
        boardLane,
        rectMeta({ id: "board", kind: "board", immovability: IMMOVABILITY.board })
      ));
    }
    rects.push(rectFromCenter(
      { x: 50, y: phase === "preflop-blinds" ? dimensions.pot.preflopY : dimensions.pot.y },
      dimensions.pot,
      rectMeta({ id: "pot", kind: "pot", immovability: IMMOVABILITY.pot })
    ));
    return rects;
  }

  function rectMeta(meta = {}) {
    return {
      id: meta.id,
      kind: meta.kind,
      seatId: Number.isFinite(Number(meta.seatId)) ? Number(meta.seatId) : null,
      immovability: Number(meta.immovability || 0),
      // Extra out-of-bounds budget for this rect (boxes straddle the felt
      // edge onto the rail; everything else stays strictly inside).
      boundsAllowance: Math.max(0, Number(meta.boundsAllowance || 0)),
      boundsKind: meta.boundsKind || "felt",
      collisionExempt: Boolean(meta.collisionExempt),
      // Soft keep-out marker (e.g. reveal-card dealer footprint): the rect is
      // collision-exempt for the hard resolver/validate path but is surfaced
      // separately (layout.softKeepouts) for report-not-fail overlap checks.
      soft: Boolean(meta.soft),
      ownBoxOverlapAllowance: Math.max(0, Number(meta.ownBoxOverlapAllowance || 0)),
      axes: Array.isArray(meta.axes) && meta.axes.length ? meta.axes : [{ x: 0, y: -1 }]
    };
  }

  // Fraction of the box half-extent (along the downward tangent) that the opponent
  // disc steps off the straight-inward lane. The inward bet marker (betting ring)
  // owns the straight-inward lane; a pure-inward disc lands in it and the resolver
  // shoves the seat's own marker sideways. Stepping the disc onto the downward
  // tangent corner clears the bet lane while staying attributed + mirror-symmetric.
  const DEALER_LATERAL_STEP_FRACTION = 0.75;

  // Real-client dealer-button placement. The disc belongs to ONE seat, so it must
  // hug that seat and read as unambiguously closer to its owner than to any
  // neighbour. Two directions are mirror-symmetric across the table's vertical axis
  // (so the top-right seat's disc reflects the top-left seat's): the radial inward
  // axis, and the "downward tangent" (the seat's tangent flipped to point toward the
  // bottom of the screen, +y). A plain clockwise tangent is NOT mirror-symmetric.
  //
  // Opponents leave the box along inward (toward the felt centre, recedes from both
  // neighbours) PLUS a downward-tangent step that moves the disc off the straight-
  // inward betting-ring lane, so the seat's own bet marker keeps its in-front-of-
  // player slot instead of being shoved sideways. Both components are mirror-
  // symmetric, so the placement stays a clean left/right reflection.
  //
  // Hero is the exception: its large hole cards fill the straight-inward lane, so the
  // disc goes to the upper inner CORNER — tangent clears the centred cards, inward
  // raises it ABOVE the nameplate into the felt (the coach's "needs to be above the
  // box"). The chosen primary axis also drives the candidate ring + finalize fallback.
  function dealerSlotCenter(anchor, seatSize, dimensions) {
    const radius = Number(dimensions.dealerDot.d) / 2;
    const edgeGap = Number(dimensions.gaps.boxToDealer || 0);
    if (anchor.isHero) {
      const tangentDistance = projectionHalf(seatSize, anchor.tangent) + edgeGap + radius;
      const inwardRaise = projectionHalf(seatSize, anchor.inward) + radius;
      return add(
        add(anchor.boxCenter, scale(anchor.tangent, tangentDistance)),
        scale(anchor.inward, inwardRaise)
      );
    }
    // Downward tangent: the tangent flipped so it points toward the bottom of the
    // screen (+y). Mirror-symmetric across x=50, unlike the raw clockwise tangent.
    const downTangent = anchor.tangent.y >= 0 ? anchor.tangent : scale(anchor.tangent, -1);
    const inwardDistance = projectionHalf(seatSize, anchor.inward) + edgeGap + radius;
    const lateralStep = projectionHalf(seatSize, downTangent) * DEALER_LATERAL_STEP_FRACTION + radius;
    return add(
      add(anchor.boxCenter, scale(anchor.inward, inwardDistance)),
      scale(downTangent, lateralStep)
    );
  }

  function seatSlotRects(anchor, dimensions, phase, dealerSeatId) {
    const rects = [];
    const seatSize = anchor.isHero ? dimensions.heroSeatBox : dimensions.seatBox;
    const cardSize = anchor.isHero
      ? dimensions.heroCardPair
      : phaseUsesRevealCards(phase)
        ? dimensions.revealCardPair
        : dimensions.cardPair;
    // Phase-invariant dock reference: opponent cards dock by their FACE-DOWN size
    // in every phase so the dock centre never moves when the cards flip face-up;
    // the larger reveal card simply grows from that fixed point (own-box peek
    // covered by revealCardBoxOverlap). Hero already keeps one size across phases.
    const dockCardSize = anchor.isHero ? cardSize : (dimensions.cardPair || cardSize);
    const markerSize = anchor.isHero && dimensions.heroMarker ? dimensions.heroMarker : dimensions.marker;
    const dealerSize = { w: dimensions.dealerDot.d, h: dimensions.dealerDot.d };
    const gap = dimensions.gaps;
    const slotCenter = anchor.slotCenter || anchor.boxCenter;
    // Hero AND opponents dock at a phase-stable weight in EVERY phase so the
    // hole-card centre does not move when the cards flip face-up on showdown.
    // Hero originally drifted vertically ([15]/[33]) because it switched to
    // revealCardDockWeight on reveal; the same switch slid the inward-docked
    // opponent (top/dead-headroom) seats. The card still grows on reveal — only
    // its dock anchor is held fixed. revealCardDockWeight is therefore no longer
    // applied (kept in the dimension tables only as inert documentation of the
    // legacy reveal pull).
    const cardDockWeight = anchor.isHero
      ? Number(dimensions.heroCardDockWeight ?? dimensions.cardDockWeight ?? 0)
      : Number(dimensions.cardDockWeight ?? 0);
    const revealCards = phaseUsesRevealCards(phase);
    // cardBoxOverlap is the OWN-NAMEPLATE overlap ALLOWANCE (how far the cards may
    // peek into their own box before the resolver treats it as a collision). Hero
    // is phase-stable; opponents adopt the larger revealCardBoxOverlap on showdown
    // so the bigger face-up card may peek further into its nameplate without being
    // shoved sideways (the R2-GEOM T4 --seat-cards-dx jump). This is an allowance
    // only — it does not move the card.
    const cardBoxOverlap = anchor.isHero
      ? Number(dimensions.heroCardBoxOverlap ?? dimensions.cardBoxOverlap ?? 0)
      : revealCards
        ? Number(dimensions.revealCardBoxOverlap ?? dimensions.cardBoxOverlap ?? 0)
        : Number(dimensions.cardBoxOverlap ?? 0);
    // cardDistanceOverlap is the dock DISTANCE peek-back (it moves the card centre),
    // so it is held phase-stable for opponents too — anchored to the BASE box
    // overlap, NOT the inflated reveal allowance above — so the inward-docked
    // (dead-headroom) seats do not slide inward on reveal. revealCardDistanceOverlap
    // is no longer applied.
    const cardDistanceOverlap = anchor.isHero
      ? Number(dimensions.heroCardDistanceOverlap ?? dimensions.cardDistanceOverlap ?? cardBoxOverlap)
      : Number(dimensions.cardDistanceOverlap ?? dimensions.cardBoxOverlap ?? 0);

    const box = rectFromCenter(anchor.boxCenter, seatSize, rectMeta({
      id: `seat-${anchor.seatId}-box`,
      kind: "box",
      seatId: anchor.seatId,
      immovability: IMMOVABILITY.box,
      boundsAllowance: Math.max(0, Number(dimensions.railOverhang || 0)),
      boundsKind: "shell",
      axes: [anchor.inward, anchor.tangent]
    }));
    rects.push(box);

    const cardsDistance = projectionHalf(seatSize, anchor.inward)
      + gap.boxToCards
      + projectionHalf(dockCardSize, anchor.inward)
      - Math.max(0, cardDistanceOverlap);
    const markerLaneCardsDistance = projectionHalf(seatSize, anchor.inward)
      + gap.boxToCards
      + projectionHalf(dockCardSize, anchor.inward);
    const effectiveMarkerLaneCardsDistance = phaseUsesRevealCards(phase)
      ? cardsDistance
      : markerLaneCardsDistance;
    const dockedCardBase = mixPoints(slotCenter, anchor.boxCenter || slotCenter, cardDockWeight);
    let cardsCenter = add(dockedCardBase, scale(anchor.inward, cardsDistance));
    if (anchor.isHero && Number(dimensions.heroCardDockOutset || 0) > 0) {
      cardsCenter = add(cardsCenter, scale(anchor.outward, Number(dimensions.heroCardDockOutset || 0)));
    }
    let cardsAxes = [anchor.inward, anchor.tangent];
    if (!anchor.isHero) {
      // Opponents (hole cards): center the cards directly above the nameplate
      // (screen-up) instead of along the radial inward axis. For side/corner
      // seats "inward" points sideways toward the pot, which hangs the cards off
      // the box's inner edge rather than centered over it. Cards render upright,
      // so the collision rect is screen-axis aligned; the resolver clamps any
      // seat without headroom (a dead-top seat) onto the felt.
      //
      // This applies in EVERY phase (face-down AND showdown reveal) so the cards
      // flip + grow IN PLACE. Previously reveal abandoned the screen-up dock for
      // the radial inward dock, sliding opponent cards up to ~9.85% felt width and
      // ~22% felt height on showdown (the --seat-cards-dx/dy live jump,
      // R2-GEOM/G1/G2). The dock geometry is anchored to the FACE-DOWN card size
      // (cardPair) in both phases, so the card CENTRE is phase-stable and the
      // larger reveal card simply grows from the same point; any felt-top overflow
      // for a cramped seat is then handled by the bounds resolver, not a model swap.
      const screenUp = { x: 0, y: -1 };
      const dockRef = dimensions.cardPair || cardSize;
      // Dock the cards INTO the box top (the layout contract requires opponent
      // cards to overlap their nameplate >=52%, not float on the felt). They peek
      // above the box, centered, rather than hanging off the inner edge.
      const aboveDistance = Math.max(
        0,
        projectionHalf(seatSize, screenUp) - projectionHalf(dockRef, screenUp) * 0.3
      );
      const upCenter = add(anchor.boxCenter || dockedCardBase, scale(screenUp, aboveDistance));
      // Only lift the cards above the nameplate when the felt has headroom. A
      // dead-top seat has none, so it keeps the original inward dock — which is
      // already centered for a top-of-table seat (inward points straight down).
      // The headroom test uses the phase-invariant face-down size so face-down and
      // reveal make the SAME dock decision (no model swap between phases).
      if (upCenter.y - projectionHalf(dockRef, screenUp) > BOUNDS.top) {
        cardsCenter = upCenter;
        cardsAxes = [{ x: 1, y: 0 }, screenUp];
      }
    }
    const cards = rectFromCenter(cardsCenter, cardSize, rectMeta({
      id: `seat-${anchor.seatId}-cards`,
      kind: "cards",
      seatId: anchor.seatId,
      immovability: IMMOVABILITY.cards,
      ownBoxOverlapAllowance: Math.max(0, cardBoxOverlap),
      axes: cardsAxes
    }));
    rects.push(cards);

    // The hero bet marker uses the SAME inward distance in every phase, so it sits
    // in a fixed betting ring toward the pot like a real poker client (and like the
    // opponent markers and the T1/T4 hero). A preflop-only `preflopHeroMarkerGap`
    // here — together with the finalizeMarkerSlots override below — used to shove
    // the T2 hero marker down to hug the cards in preflop, then snap it back up on
    // the flop: an ~8.4% felt-height phase jump ([128]). Phase-invariant placement
    // removes that jump.
    const markerDistance = effectiveMarkerLaneCardsDistance
      + projectionHalf(cardSize, anchor.inward)
      + gap.cardsToMarker
      + projectionHalf(markerSize, anchor.inward);
    // Bet markers sit on a BETTING RING inside the felt: a fixed fraction of the
    // way from the box toward the pot/centre (betRingFraction ~1/3), radial like
    // a real poker client. Measured from CoinPoker's live client, opponent bets
    // land ~32-39% in from each seat (felt-r ~0.66-0.73) — clearly closer to the
    // box than to centre, which is the contract here. The old lane-distance
    // placement (box-half + cards + gap + marker-half) stacked to ~55-65% inward,
    // so markers read centre-biased; the resolver then shoved side seats sideways
    // (the marker-sideways gate). The fraction keeps them radial and box-side.
    // Hero keeps the lane-distance placement: its felt bet must clear the large
    // hero hole-cards and sit just under the board/pot (CoinPoker's bottom-centre
    // seat likewise sits ~76% in, deep under the pot — not on the shallow ring).
    const betRingFraction = clamp(Number(dimensions.betRingFraction || 0), 0, 0.9);
    const markerCenter = (!anchor.isHero && betRingFraction > 0)
      ? mixPoints(anchor.boxCenter, CENTER, betRingFraction)
      : add(slotCenter, scale(anchor.inward, markerDistance));
    const markerAxes = [anchor.inward, anchor.tangent];
    // The renderer needs a stable marker point in every phase. Closing-street
    // bets intentionally remain on the felt through the showdown hold, so reveal
    // markers are real visual geometry too — never exempt them from collision
    // packing merely because the engine has already closed the betting street.
    const marker = rectFromCenter(markerCenter, markerSize, rectMeta({
      id: `seat-${anchor.seatId}-marker`,
      kind: "marker",
      seatId: anchor.seatId,
      immovability: IMMOVABILITY.marker,
      collisionExempt: false,
      axes: markerAxes
    }));
    rects.push(marker);

    if (Number(dealerSeatId) === Number(anchor.seatId)) {
      rects.push(rectFromCenter(dealerSlotCenter(anchor, seatSize, dimensions), dealerSize, rectMeta({
        id: `seat-${anchor.seatId}-dealer`,
        kind: "dealer",
        seatId: anchor.seatId,
        immovability: IMMOVABILITY.dealer,
        // Opponents lead with inward (the disc nests in the nameplate->felt wedge);
        // hero leads with tangent (its big live cards own the inward lane). axes[0]
        // is the primary axis the candidate ring + finalize fallback sweep along.
        axes: anchor.isHero ? [anchor.tangent, anchor.inward] : [anchor.inward, anchor.tangent]
      })));
    }
    return rects;
  }

  function overlapMetrics(a, b, gap = 0) {
    const width = Math.min(a.right + gap, b.right + gap) - Math.max(a.left - gap, b.left - gap);
    const height = Math.min(a.bottom + gap, b.bottom + gap) - Math.max(a.top - gap, b.top - gap);
    if (width <= 0 || height <= 0) return null;
    return { width, height, area: width * height };
  }

  function allowedOwnBoxOverlap(a, b, overlap) {
    if (!overlap) return false;
    if (a.seatId === null || b.seatId === null || Number(a.seatId) !== Number(b.seatId)) return false;
    const kinds = new Set([a.kind, b.kind]);
    if (!kinds.has("box") || !kinds.has("cards")) return false;
    const allowance = Math.max(
      Number(a.ownBoxOverlapAllowance || 0),
      Number(b.ownBoxOverlapAllowance || 0)
    );
    return allowance > 0 && Math.min(overlap.width, overlap.height) <= allowance;
  }

  function blockingOverlapMetrics(a, b, gap = 0) {
    const overlap = overlapMetrics(a, b, gap);
    if (!overlap || overlap.area <= 0.0001) return null;
    return allowedOwnBoxOverlap(a, b, overlap) ? null : overlap;
  }

  function rectOutsideBounds(rect, bounds = BOUNDS, tolerance = 0) {
    const overflow = {
      left: bounds.left - tolerance - rect.left,
      top: bounds.top - tolerance - rect.top,
      right: rect.right - bounds.right - tolerance,
      bottom: rect.bottom - bounds.bottom - tolerance
    };
    return {
      left: Math.max(0, overflow.left),
      top: Math.max(0, overflow.top),
      right: Math.max(0, overflow.right),
      bottom: Math.max(0, overflow.bottom),
      amount: Math.max(0, overflow.left, overflow.top, overflow.right, overflow.bottom)
    };
  }

  function moveInsideBounds(rect, bounds, tolerance) {
    const outside = rectOutsideBounds(rect, bounds, tolerance);
    if (!outside.amount) return false;
    const dx = outside.left ? outside.left : outside.right ? -outside.right : 0;
    const dy = outside.top ? outside.top : outside.bottom ? -outside.bottom : 0;
    moveRect(rect, { x: dx, y: dy });
    return true;
  }

  function pairToMove(a, b) {
    if (a.immovability === b.immovability) return a.id > b.id ? a : b;
    return a.immovability < b.immovability ? a : b;
  }

  function moveForOverlap(target, other, overlap, gap) {
    const fromOther = unit({ x: target.center.x - other.center.x, y: target.center.y - other.center.y });
    const axes = target.axes && target.axes.length ? target.axes : [fromOther];
    const centralCollision = other.kind === "board" || other.kind === "pot";
    const crossSeatCollision = target.seatId !== null && other.seatId !== null && Number(target.seatId) !== Number(other.seatId);
    let axis = unit((centralCollision || crossSeatCollision) && axes[1] ? axes[1] : axes[0]);
    if (centralCollision) {
      const dx = target.center.x - other.center.x;
      if (Math.abs(dx) >= 0.75) {
        axis = { x: dx < 0 ? -1 : 1, y: 0 };
      } else if (axes[1]) {
        axis = unit(axes[1]);
      }
    }
    if (dot(axis, fromOther) < 0) axis = scale(axis, -1);
    if (Math.abs(axis.x) < 0.05 && Math.abs(axis.y) < 0.05) axis = fromOther;
    const useX = Math.abs(axis.x) >= Math.abs(axis.y);
    const denominator = Math.max(0.08, Math.abs(useX ? axis.x : axis.y));
    const centerDelta = useX
      ? Math.abs(target.center.x - other.center.x)
      : Math.abs(target.center.y - other.center.y);
    const requiredSeparation = useX
      ? (target.size.w + other.size.w) / 2 + gap
      : (target.size.h + other.size.h) / 2 + gap;
    const amount = Math.min(18, Math.max(0.35, (requiredSeparation - centerDelta + gap) / denominator));
    return scale(axis, amount);
  }

  function resolveCollisions(rects, options = {}) {
    const bounds = options.bounds || BOUNDS;
    const tolerance = Number(options.tolerance ?? 0.3);
    const gap = Number(options.gap ?? 0.35);
    const maxIterations = Math.max(1, Math.floor(Number(options.maxIterations || 192)));
    const moves = [];

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let changed = false;
      rects
        .filter((rect) => rect.immovability < IMMOVABILITY.box)
        .forEach((rect) => {
          if (moveInsideBounds(rect, boundsForRect(rect, options), tolerance)) {
            changed = true;
            moves.push({ iteration, id: rect.id, reason: "bounds", center: { ...rect.center } });
          }
        });

      for (let aIndex = 0; aIndex < rects.length; aIndex += 1) {
        for (let bIndex = aIndex + 1; bIndex < rects.length; bIndex += 1) {
          const a = rects[aIndex];
          const b = rects[bIndex];
          if (a.collisionExempt || b.collisionExempt) continue;
          const overlap = blockingOverlapMetrics(a, b, gap);
          if (!overlap || overlap.area <= 0.0001) continue;
          const target = pairToMove(a, b);
          if (target.immovability >= IMMOVABILITY.box) continue;
          const other = target === a ? b : a;
          if ((other.kind === "board" || other.kind === "pot") && target.immovability < IMMOVABILITY.box) {
            const sign = target.center.x < other.center.x
              ? -1
              : target.center.x > other.center.x
                ? 1
                : (Number(target.seatId || 0) % 2 === 0 ? -1 : 1);
            target.center.x = sign < 0
              ? other.left - gap - target.size.w / 2
              : other.right + gap + target.size.w / 2;
            refreshRect(target);
          } else {
            moveRect(target, moveForOverlap(target, other, overlap, gap));
          }
          moveInsideBounds(target, boundsForRect(target, options), tolerance);
          changed = true;
          moves.push({
            iteration,
            id: target.id,
            against: other.id,
            reason: "overlap",
            center: { x: round(target.center.x), y: round(target.center.y) }
          });
        }
      }
      if (!changed) {
        return { rects, iterations: iteration + 1, moves, converged: true };
      }
    }
    return { rects, iterations: maxIterations, moves, converged: false };
  }

  function collectCollisions(rects, options = {}) {
    const bounds = options.bounds || BOUNDS;
    const tolerance = Number(options.tolerance ?? 0.3);
    const gap = Number(options.gap ?? 0);
    const overlaps = [];
    const outOfBounds = [];
    rects.forEach((rect) => {
      if (rect.collisionExempt) return;
      const outside = rectOutsideBounds(rect, boundsForRect(rect, options), tolerance);
      if (outside.amount > 0.0001) outOfBounds.push({ id: rect.id, kind: rect.kind, seatId: rect.seatId, outside });
    });
    for (let aIndex = 0; aIndex < rects.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < rects.length; bIndex += 1) {
        const a = rects[aIndex];
        const b = rects[bIndex];
        if (a.collisionExempt || b.collisionExempt) continue;
        const overlap = blockingOverlapMetrics(a, b, gap);
        if (overlap && overlap.area > 0.0001) {
          overlaps.push({
            a: a.id,
            b: b.id,
            kinds: `${a.kind}/${b.kind}`,
            area: round(overlap.area),
            width: round(overlap.width),
            height: round(overlap.height)
          });
        }
      }
    }
    return { overlaps, outOfBounds };
  }

  function rectIsInsideBounds(rect, bounds, tolerance) {
    return rectOutsideBounds(rect, bounds, tolerance).amount <= 0.0001;
  }

  function rectIsClear(rect, obstacles, bounds, tolerance, gap = 0) {
    if (!rectIsInsideBounds(rect, bounds, tolerance)) return false;
    return obstacles.every((other) => !blockingOverlapMetrics(rect, other, gap));
  }

  function markerVisualObstacles(dimensions, phase) {
    const obstacles = [];
    if (phase !== "preflop-blinds" && dimensions.markerBoardLane) {
      obstacles.push(rectFromCenter(
        { x: 50, y: dimensions.markerBoardLane.y || dimensions.postflopBoardLane?.y || dimensions.boardLane?.y || 44 },
        dimensions.markerBoardLane,
        rectMeta({ id: "marker-board-visual", kind: "board", immovability: IMMOVABILITY.board, collisionExempt: false })
      ));
    }
    return obstacles;
  }

  function distanceBetween(a, b) {
    return Math.hypot(Number(a?.x || 0) - Number(b?.x || 0), Number(a?.y || 0) - Number(b?.y || 0));
  }

  function markerCandidateScore(candidate, marker, ownBox, ownCards) {
    const owner = ownCards || ownBox || marker;
    const ownerDistance = Math.min(
      owner ? distanceBetween(candidate.center, owner.center) : Number.POSITIVE_INFINITY,
      ownBox ? distanceBetween(candidate.center, ownBox.center) : Number.POSITIVE_INFINITY
    );
    const ringDistance = distanceBetween(candidate.center, marker.center);
    const inwardAxis = unit(Array.isArray(marker.axes) && marker.axes[0]
      ? marker.axes[0]
      : { x: CENTER.x - marker.center.x, y: CENTER.y - marker.center.y });
    const tangentAxis = unit(Array.isArray(marker.axes) && marker.axes[1] ? marker.axes[1] : { x: -inwardAxis.y, y: inwardAxis.x });
    const delta = { x: candidate.center.x - marker.center.x, y: candidate.center.y - marker.center.y };
    const inwardShift = dot(delta, inwardAxis);
    const tangentialShift = Math.abs(dot(delta, tangentAxis));
    const outwardShift = Math.max(0, -inwardShift);
    // Bets live on the POT side of their seat. Without the outward penalty a
    // rescued mid-side marker scored best directly above its box at the felt
    // edge (closest to owner wins), which read as "geometry drift" on the
    // T2/QHD scales whose box↔board-lane corridor cannot fit the marker on
    // the betting ring at all — the rescue must pick the inward diagonal.
    const anchor = ownBox || owner;
    const outward = distanceBetween(candidate.center, CENTER)
      > distanceBetween(anchor.center, CENTER) + 0.5;
    // The seed is the phase-invariant betting-ring position. Reveal cards may
    // require a radial move toward the pot, but a persistent bet must not jump
    // sideways to a different seat lane or outward over its owner. Preserve the
    // owner-to-centre ray first, then choose the smallest clear nudge on it.
    return tangentialShift * 36
      + outwardShift * 48
      + ringDistance * 8
      + ownerDistance * 0.08
      + (outward ? 48 : 0);
  }

  function markerCandidateCenters(marker, ownBox, ownCards, gap) {
    const base = ownCards || ownBox || marker;
    const backup = ownBox || ownCards || marker;
    const centers = [];
    const pushCenter = (center) => {
      if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return;
      const duplicate = centers.some((item) =>
        Math.abs(item.x - center.x) < 0.001 && Math.abs(item.y - center.y) < 0.001
      );
      if (!duplicate) centers.push(center);
    };
    // Try local ring-preserving nudges before owner/card-relative fallbacks.
    // Reveal cards grow around the same seat and can clip a previously-clear
    // marker by only a few percent; translating from the marker itself keeps a
    // closing-street bet visually continuous instead of teleporting it beside
    // the enlarged cards/nameplate.
    const localAxes = [
      ...(Array.isArray(marker.axes) ? marker.axes : []),
      { x: 1, y: 0 },
      { x: 0, y: 1 }
    ].map(unit).filter((axis, index, list) =>
      (Math.abs(axis.x) > 0.001 || Math.abs(axis.y) > 0.001)
      && list.findIndex((item) => Math.abs(item.x - axis.x) < 0.001 && Math.abs(item.y - axis.y) < 0.001) === index
    );
    const localSteps = [0.8, 1.5, 2.4, 3.5, 4.8, 6.5, 8.5, 11.5, 15, 20, 27];
    localAxes.forEach((axis) => {
      localSteps.forEach((step) => {
        pushCenter(add(marker.center, scale(axis, step)));
        pushCenter(add(marker.center, scale(axis, -step)));
      });
    });
    if (localAxes.length >= 2) {
      const primary = localAxes[0];
      const secondary = localAxes[1];
      [1.2, 2.2, 3.4, 4.8, 6.5, 9, 12.5, 17].forEach((step) => {
        [-1, 1].forEach((aSign) => [-1, 1].forEach((bSign) => {
          pushCenter(add(
            add(marker.center, scale(primary, aSign * step)),
            scale(secondary, bSign * step)
          ));
        }));
      });
    }
    // Dense T2/QHD 8-/9-max corners can require an unequal diagonal (the board,
    // revealed hand and owner plate close the cardinal corridors). Sample a
    // bounded polar ring so the finalizer can still find the nearest clear
    // pocket instead of leaving the marker on a rendered card.
    [2.5, 4, 5.5, 7, 9, 11.5, 13.5, 15.5, 18, 21, 26, 32].forEach((radius) => {
      for (let index = 0; index < 48; index += 1) {
        const angle = (Math.PI * 2 * index) / 48;
        pushCenter({
          x: marker.center.x + Math.cos(angle) * radius,
          y: marker.center.y + Math.sin(angle) * radius
        });
      }
    });
    const horizontal = Math.max(base.size.w, backup.size.w) / 2 + marker.size.w / 2 + gap;
    const vertical = Math.max(base.size.h, backup.size.h) / 2 + marker.size.h / 2 + gap;
    [
      { x: base.center.x + horizontal, y: base.center.y },
      { x: base.center.x - horizontal, y: base.center.y },
      { x: base.center.x, y: base.center.y - vertical },
      { x: base.center.x, y: base.center.y + vertical },
      { x: backup.center.x + horizontal, y: backup.center.y },
      { x: backup.center.x - horizontal, y: backup.center.y },
      { x: backup.center.x, y: backup.center.y - vertical },
      { x: backup.center.x, y: backup.center.y + vertical },
      { x: base.center.x + horizontal, y: base.center.y - vertical },
      { x: base.center.x - horizontal, y: base.center.y - vertical },
      { x: base.center.x + horizontal, y: base.center.y + vertical },
      { x: base.center.x - horizontal, y: base.center.y + vertical }
    ].forEach(pushCenter);

    const axisSources = [
      ...(Array.isArray(marker.axes) ? marker.axes : []),
      { x: 1, y: 0 },
      { x: 0, y: 1 }
    ];
    const axes = axisSources
      .map(unit)
      .filter((axis, index, list) =>
        Math.abs(axis.x) > 0.001 || Math.abs(axis.y) > 0.001
          ? list.findIndex((item) => Math.abs(item.x - axis.x) < 0.001 && Math.abs(item.y - axis.y) < 0.001) === index
          : false
      );
    const stepExtras = [0, 1.2, 2.8, 5, 8, 12, 17, 23];
    [base, backup].forEach((origin) => {
      axes.forEach((axis) => {
        const distance = projectionHalf(origin.size, axis) + projectionHalf(marker.size, axis) + gap;
        stepExtras.forEach((extra) => {
          pushCenter(add(origin.center, scale(axis, distance + extra)));
          pushCenter(add(origin.center, scale(axis, -(distance + extra))));
        });
      });
      if (axes.length >= 2) {
        const primary = axes[0];
        const secondary = axes[1];
        const primaryDistance = projectionHalf(origin.size, primary) + projectionHalf(marker.size, primary) + gap;
        const secondaryDistance = projectionHalf(origin.size, secondary) + projectionHalf(marker.size, secondary) + gap;
        [0, 2.5, 5.5, 9].forEach((extra) => {
          [-1, 1].forEach((primarySign) => {
            [-1, 1].forEach((secondarySign) => {
              pushCenter(add(
                add(origin.center, scale(primary, primarySign * (primaryDistance + extra))),
                scale(secondary, secondarySign * Math.max(secondaryDistance * 0.55, gap + marker.size.h / 2))
              ));
            });
          });
        });
        [12, 18, 26, 34, 44].forEach((primaryExtra) => {
          [4, 8, 13, 19, 26].forEach((secondaryExtra) => {
            [-1, 1].forEach((primarySign) => {
              [-1, 1].forEach((secondarySign) => {
                pushCenter(add(
                  add(origin.center, scale(primary, primarySign * (primaryDistance + primaryExtra))),
                  scale(secondary, secondarySign * (secondaryDistance + secondaryExtra))
                ));
              });
            });
          });
        });
      }
    });
    return centers;
  }

  function cardCandidateCenters(cards, ownBox, gap) {
    const axes = cards.axes && cards.axes.length ? cards.axes : [{ x: 1, y: 0 }, { x: 0, y: 1 }];
    const centers = [{ ...cards.center }];
    const steps = [0.75, 1.5, 2.75, 4.5, 7, 10, 13, 17, 22];
    axes.forEach((axis) => {
      const normalized = unit(axis);
      steps.forEach((step) => {
        centers.push(add(cards.center, scale(normalized, step + gap)));
        centers.push(add(cards.center, scale(normalized, -(step + gap))));
      });
    });
    if (axes.length >= 2) {
      const a = unit(axes[0]);
      const b = unit(axes[1]);
      [2.5, 5, 8].forEach((step) => {
        centers.push(add(add(cards.center, scale(a, step)), scale(b, step)));
        centers.push(add(add(cards.center, scale(a, step)), scale(b, -step)));
        centers.push(add(add(cards.center, scale(a, -step)), scale(b, step)));
        centers.push(add(add(cards.center, scale(a, -step)), scale(b, -step)));
      });
    }
    if (ownBox) {
      const horizontal = ownBox.size.w / 2 + cards.size.w / 2 + gap;
      const vertical = ownBox.size.h / 2 + cards.size.h / 2 + gap;
      centers.push({ x: ownBox.center.x + horizontal, y: ownBox.center.y });
      centers.push({ x: ownBox.center.x - horizontal, y: ownBox.center.y });
      centers.push({ x: ownBox.center.x, y: ownBox.center.y - vertical });
      centers.push({ x: ownBox.center.x, y: ownBox.center.y + vertical });
      centers.push({ x: ownBox.center.x + horizontal, y: ownBox.center.y - vertical * 0.45 });
      centers.push({ x: ownBox.center.x - horizontal, y: ownBox.center.y - vertical * 0.45 });
      centers.push({ x: ownBox.center.x + horizontal, y: ownBox.center.y + vertical * 0.45 });
      centers.push({ x: ownBox.center.x - horizontal, y: ownBox.center.y + vertical * 0.45 });
      centers.push({ x: ownBox.center.x + horizontal, y: ownBox.center.y - vertical });
      centers.push({ x: ownBox.center.x - horizontal, y: ownBox.center.y - vertical });
      centers.push({ x: ownBox.center.x + horizontal, y: ownBox.center.y + vertical });
      centers.push({ x: ownBox.center.x - horizontal, y: ownBox.center.y + vertical });
      centers.push({ x: ownBox.center.x + horizontal, y: ownBox.center.y - vertical * 1.35 });
      centers.push({ x: ownBox.center.x - horizontal, y: ownBox.center.y - vertical * 1.35 });
      centers.push({ x: ownBox.center.x + horizontal, y: ownBox.center.y + vertical * 1.35 });
      centers.push({ x: ownBox.center.x - horizontal, y: ownBox.center.y + vertical * 1.35 });
    }
    return centers;
  }

  function finalizeCardSlots(rects, options = {}) {
    const bounds = options.bounds || BOUNDS;
    const tolerance = Number(options.tolerance ?? 0.3);
    const gap = Number(options.gap ?? 0.3);
    const cards = rects
      .filter((rect) => rect.kind === "cards")
      .sort((a, b) => Number(a.seatId || 0) - Number(b.seatId || 0));
    let moveCount = 0;
    for (let pass = 0; pass < 5; pass += 1) {
      let changed = false;
      cards.forEach((cardRect) => {
        const ownBox = rects.find((rect) => rect.kind === "box" && Number(rect.seatId) === Number(cardRect.seatId));
        const obstacles = rects.filter((rect) =>
          rect !== cardRect
          && rect.kind !== "marker"
          && !(rect.kind === "dealer" && Number(rect.seatId) === Number(cardRect.seatId))
        );
        if (rectIsClear(cardRect, obstacles, bounds, tolerance)) return;
        const candidates = cardCandidateCenters(cardRect, ownBox, gap)
          .map((center) => rectFromCenter(center, cardRect.size, cardRect))
          .sort((a, b) => {
            const da = Math.hypot(a.center.x - cardRect.center.x, a.center.y - cardRect.center.y);
            const db = Math.hypot(b.center.x - cardRect.center.x, b.center.y - cardRect.center.y);
            return da - db;
          });
        const next = candidates.find((candidate) => rectIsClear(candidate, obstacles, bounds, tolerance));
        if (!next) return;
        cardRect.center = { ...next.center };
        refreshRect(cardRect);
        changed = true;
        moveCount += 1;
      });
      if (!changed) break;
    }
    return { moveCount };
  }

  function dealerCandidateCenters(dealer, ownBox, gap) {
    if (!ownBox) return markerCandidateCenters(dealer, null, null, gap);
    const horizontal = ownBox.size.w / 2 + dealer.size.w / 2 + gap;
    const vertical = ownBox.size.h / 2 + dealer.size.h / 2 + gap;
    const centers = [
      { x: ownBox.center.x + horizontal, y: ownBox.center.y },
      { x: ownBox.center.x - horizontal, y: ownBox.center.y },
      { x: ownBox.center.x, y: ownBox.center.y - vertical },
      { x: ownBox.center.x, y: ownBox.center.y + vertical },
      { x: ownBox.center.x + horizontal, y: ownBox.center.y - vertical },
      { x: ownBox.center.x - horizontal, y: ownBox.center.y - vertical },
      { x: ownBox.center.x + horizontal, y: ownBox.center.y + vertical },
      { x: ownBox.center.x - horizontal, y: ownBox.center.y + vertical }
    ];
    // Fine lateral offsets around the four cardinal docks. On an aspect-correct
    // reveal disc the obvious clear point can be only ~1% of felt away from the
    // cardinal centre; the older coarse diagonal ring skipped it and jumped the
    // button toward a neighbour instead (T1/P9 side seats).
    [0.6, 0.9, 1.2, 1.8].forEach((fine) => {
      [-1, 1].forEach((sign) => {
        centers.push({ x: ownBox.center.x + sign * fine, y: ownBox.center.y - vertical });
        centers.push({ x: ownBox.center.x + sign * fine, y: ownBox.center.y + vertical });
        centers.push({ x: ownBox.center.x - horizontal, y: ownBox.center.y + sign * fine });
        centers.push({ x: ownBox.center.x + horizontal, y: ownBox.center.y + sign * fine });
      });
    });
    const pushCenter = (center) => {
      if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return;
      const duplicate = centers.some((item) =>
        Math.abs(item.x - center.x) < 0.001 && Math.abs(item.y - center.y) < 0.001
      );
      if (!duplicate) centers.push(center);
    };
    const axes = (dealer.axes && dealer.axes.length ? dealer.axes : ownBox.axes || [])
      .map(unit)
      .filter((axis, index, list) =>
        (Math.abs(axis.x) > 0.001 || Math.abs(axis.y) > 0.001)
          && list.findIndex((item) => Math.abs(item.x - axis.x) < 0.001 && Math.abs(item.y - axis.y) < 0.001) === index
      );
    axes.forEach((axis) => {
      const distance = projectionHalf(ownBox.size, axis) + projectionHalf(dealer.size, axis) + gap;
      [0, 1.2, 2.8, 5, 8].forEach((extra) => {
        pushCenter(add(ownBox.center, scale(axis, distance + extra)));
        pushCenter(add(ownBox.center, scale(axis, -(distance + extra))));
      });
    });
    if (axes.length >= 2) {
      const primary = axes[0];
      const secondary = axes[1];
      const primaryDistance = projectionHalf(ownBox.size, primary) + projectionHalf(dealer.size, primary) + gap;
      const secondaryDistance = projectionHalf(ownBox.size, secondary) + projectionHalf(dealer.size, secondary) + gap;
      [0, 1.4, 3.2, 5.8].forEach((primaryExtra) => {
        [0, 1.8, 4.2, 7].forEach((secondaryExtra) => {
          [-1, 1].forEach((primarySign) => {
            [-1, 1].forEach((secondarySign) => {
              pushCenter(add(
                add(ownBox.center, scale(primary, primarySign * (primaryDistance + primaryExtra))),
                scale(secondary, secondarySign * (secondaryDistance + secondaryExtra))
              ));
            });
          });
        });
      });
    }
    return centers;
  }

  function nearestOtherBoxDistance(center, boxes, ownSeatId) {
    let nearest = Number.POSITIVE_INFINITY;
    boxes.forEach((box) => {
      if (Number(box.seatId) === Number(ownSeatId)) return;
      nearest = Math.min(nearest, distanceBetween(center, box.center));
    });
    return nearest;
  }

  // Attribution = how much closer the disc sits to its OWN seat box than to the
  // nearest other seat box. >1 means it belongs to the owner; ->1 is the
  // ambiguity line where it reads as either of two seats' buttons; <1 means it is
  // literally closer to a neighbour. The disc must clear a margin above 1.
  function dealerAttribution(center, ownBox, boxes, ownSeatId) {
    if (!ownBox) return Number.POSITIVE_INFINITY;
    const own = distanceBetween(center, ownBox.center);
    if (own <= 0.0001) return Number.POSITIVE_INFINITY;
    return nearestOtherBoxDistance(center, boxes, ownSeatId) / own;
  }

  // Mirrors simulator-geometry.seatZone(point) so diagnostics and browser probes
  // describe the same top/bottom/left/right ownership zones.
  function seatZoneOf(point) {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (y <= 14) return "top";
    if (y >= 86) return "bottom";
    if (x <= 12) return "left";
    if (x >= 88) return "right";
    if (y < 32) return "top";
    if (y > 72) return "bottom";
    return x < 50 ? "left" : "right";
  }

  // Reserve the exact owner-attached reveal face and the short connector back to
  // the owner as a dealer-only keep-out. The former square `halfW` proxy was tied
  // to detached global lanes and substantially over-reserved the felt.
  function revealDealerCardKeepout(ownBox, dimensions, finalCard) {
    const card = finalCard?.rect || finalCard;
    if (!ownBox || !card) return null;
    const pad = Math.max(0.25, Number(dimensions?.gaps?.collision || 0));
    const left = Math.min(ownBox.center.x, card.left) - pad;
    const right = Math.max(ownBox.center.x, card.right) + pad;
    const top = Math.min(ownBox.center.y, card.top) - pad;
    const bottom = Math.max(ownBox.center.y, card.bottom) + pad;
    return rectFromCenter(
      { x: (left + right) / 2, y: (top + bottom) / 2 },
      { w: right - left, h: bottom - top },
      rectMeta({
        id: `seat-${ownBox.seatId}-reveal-card-keepout`,
        kind: "card-keepout",
        seatId: ownBox.seatId,
        // SOFT: exempt from the hard resolver + collectCollisions/validateLayout
        // overlap sweep (the resolver may still park the disc here on a crowded
        // table where no well-attributed clear spot exists — never trade a P3 card
        // overlap for a mis-attributed button). The reveal-stability gate reads it
        // via layout.softKeepouts to assert zero overlap wherever a clear spot was
        // feasible.
        collisionExempt: true,
        soft: true
      })
    );
  }

  // One owner-attached reveal cluster per non-hero seat. Every hand leaves the
  // felt-facing edge of its own nameplate: top -> down, bottom -> up, side -> in,
  // corner -> radially in. A small controlled tuck keeps cards + plate visually
  // grouped while the plate's higher z-index preserves all text.
  function renderedRevealCardRects(boxes, dimensions) {
    const footprint = dimensions && dimensions.renderedRevealCard;
    if (!footprint || !(Number(footprint.w) > 0) || !(Number(footprint.h) > 0)) return [];
    const size = { w: Number(footprint.w), h: Number(footprint.h) };
    const out = [];
    boxes.forEach((box) => {
      if (Number(box.seatId) === 0) return;
      const zone = seatZoneOf(box.center);
      const inward = unit({ x: CENTER.x - box.center.x, y: CENTER.y - box.center.y });
      const tangent = unit({ x: -inward.y, y: inward.x });
      const renderedOwnerSize = dimensions?.renderedRevealSeatBox || box.size;
      const tuckFraction = clamp(Number(dimensions?.revealCardTuckFraction ?? 0.2), 0, 0.3);
      const projectedCardDepth = projectionHalf(size, inward) * 2;
      const tuck = projectedCardDepth * tuckFraction;
      // Axis-aligned DOM rectangles first touch at the smaller of the x/y edge
      // distances along this ray. Summed radial projections are larger at a
      // corner and produced a visible 2–4% felt gap despite "overlapping" in the
      // projected model. Use real AABB edge contact, then tuck slightly under it.
      const contactX = Math.abs(inward.x) > 0.001
        ? (Number(renderedOwnerSize.w) + size.w) / 2 / Math.abs(inward.x)
        : Number.POSITIVE_INFINITY;
      const contactY = Math.abs(inward.y) > 0.001
        ? (Number(renderedOwnerSize.h) + size.h) / 2 / Math.abs(inward.y)
        : Number.POSITIVE_INFINITY;
      const topCenterTuckFloor = zone === "top" && Math.abs(Number(box.center.x) - 50) < 6
        ? Math.max(0, Number(dimensions?.revealTopCenterExtraTuck || 0))
        : 0;
      // `revealTopCenterExtraTuck` predates the explicit pocket fraction. Keep
      // it as a safety floor for unusually small cards rather than adding it on
      // top of the requested fraction (which would make the top seat exceed the
      // promised 20% pocket).
      const distance = Math.max(0, Math.min(contactX, contactY) - Math.max(tuck, topCenterTuckFloor));
      const rawCenter = add(box.center, scale(inward, distance));
      // The owner may straddle the rail; the visible cards never do.
      const center = {
        x: clamp(rawCenter.x, size.w / 2, 100 - size.w / 2),
        y: clamp(rawCenter.y, size.h / 2, 100 - size.h / 2)
      };
      out.push({
        seatId: Number(box.seatId),
        zone,
        inward,
        tangent,
        rect: rectFromCenter(
          center,
          size,
          rectMeta({ id: `seat-${box.seatId}-rendered-reveal-card`, kind: "rendered-reveal-card", seatId: box.seatId, collisionExempt: true, soft: true })
        )
      });
    });
    return out;
  }

  // Resolve only the crowded P8/P9 edge cases, and only along each owner's local
  // tangent. Radial distance from the owner is therefore invariant: collision
  // correction cannot turn a docked hand back into a floating hand.
  function revealCardNeighbourSeparation(boxes, dimensions) {
    const cards = renderedRevealCardRects(boxes, dimensions);
    const boxById = new Map(boxes.map((box) => [Number(box.seatId), box]));
    const GROUPING_GAP = Math.max(0.4, Number(dimensions?.revealCardGroupingGap || 0));
    const MAX_TANGENT_DRIFT = 6.5;
    const STEP = 0.35;
    const nudgeBySeat = new Map(); // seatId -> { x, y } in %felt units

    function nudgeFor(seatId) {
      const id = Number(seatId);
      if (!nudgeBySeat.has(id)) nudgeBySeat.set(id, { x: 0, y: 0 });
      return nudgeBySeat.get(id);
    }

    function entryWithExtra(entry, extra = { x: 0, y: 0 }) {
      const nudge = nudgeFor(entry.seatId);
      return {
        seatId: entry.seatId,
        zone: entry.zone,
        inward: entry.inward,
        tangent: entry.tangent,
        rect: rectFromCenter(
          {
            x: entry.rect.center.x + nudge.x + Number(extra.x || 0),
            y: entry.rect.center.y + nudge.y + Number(extra.y || 0)
          },
          entry.rect.size,
          rectMeta({ id: entry.rect.id, kind: entry.rect.kind, seatId: entry.seatId, collisionExempt: true, soft: true })
        )
      };
    }

    function pairHit(a, b) {
      return overlapMetrics(a.rect, b.rect, GROUPING_GAP / 2);
    }

    function candidateIsSafe(entry) {
      if (rectOutsideBounds(entry.rect, BOUNDS, 0).amount > 0.0001) return false;
      for (const box of boxes) {
        if (Number(box.seatId) === Number(entry.seatId)) continue;
        const renderedBox = dimensions?.renderedRevealSeatBox
          ? rectFromCenter(box.center, dimensions.renderedRevealSeatBox, box)
          : box;
        const hit = overlapMetrics(entry.rect, renderedBox, 0);
        if (hit && hit.area > 0.0001) return false;
      }
      return true;
    }

    function driftAfter(entry, extra) {
      const nudge = nudgeFor(entry.seatId);
      return Math.hypot(nudge.x + Number(extra.x || 0), nudge.y + Number(extra.y || 0));
    }

    const pairs = [];
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i];
        const b = cards[j];
        const hit = pairHit(a, b);
        if (!hit || hit.area <= 0.0001) continue;
        const rawHit = overlapMetrics(a.rect, b.rect, 0);
        const dy = Math.abs(a.rect.center.y - b.rect.center.y);
        const dx = Math.abs(a.rect.center.x - b.rect.center.x);
        pairs.push({
          seatA: Math.min(a.seatId, b.seatId),
          seatB: Math.max(a.seatId, b.seatId),
          zoneA: a.seatId <= b.seatId ? a.zone : b.zone,
          zoneB: a.seatId <= b.seatId ? b.zone : a.zone,
          area: round(rawHit?.area || 0),
          paddedArea: round(hit.area),
          dx: round(dx),
          dy: round(dy),
          groupingGap: round(GROUPING_GAP),
          tangentialApplied: 0
        });
      }
    }

    // Stable repeated relaxation. Each accepted move must strictly reduce the
    // padded overlap, remain inside the felt and avoid every foreign nameplate.
    for (let pass = 0; pass < 28; pass += 1) {
      let changed = false;
      for (let i = 0; i < cards.length; i += 1) {
        for (let j = i + 1; j < cards.length; j += 1) {
          const baseA = cards[i];
          const baseB = cards[j];
          const a = entryWithExtra(baseA);
          const b = entryWithExtra(baseB);
          const hit = pairHit(a, b);
          if (!hit || hit.area <= 0.0001) continue;

          const awayA = unit({ x: a.rect.center.x - b.rect.center.x, y: a.rect.center.y - b.rect.center.y });
          const awayB = scale(awayA, -1);
          const signA = dot(baseA.tangent, awayA) >= 0 ? 1 : -1;
          const signB = dot(baseB.tangent, awayB) >= 0 ? 1 : -1;
          const moveA = scale(baseA.tangent, signA * STEP);
          const moveB = scale(baseB.tangent, signB * STEP);

          const options = [
            { a: moveA, b: moveB, moved: 2 },
            { a: moveA, b: { x: 0, y: 0 }, moved: 1 },
            { a: { x: 0, y: 0 }, b: moveB, moved: 1 }
          ].map((option) => {
            if (driftAfter(baseA, option.a) > MAX_TANGENT_DRIFT + 0.0001) return null;
            if (driftAfter(baseB, option.b) > MAX_TANGENT_DRIFT + 0.0001) return null;
            const nextA = entryWithExtra(baseA, option.a);
            const nextB = entryWithExtra(baseB, option.b);
            if (!candidateIsSafe(nextA) || !candidateIsSafe(nextB)) return null;
            return { ...option, score: pairHit(nextA, nextB)?.area || 0 };
          }).filter(Boolean).sort((left, right) => left.score - right.score || right.moved - left.moved);

          const best = options[0];
          if (!best || best.score >= hit.area - 0.0001) continue;
          nudgeFor(baseA.seatId).x += best.a.x;
          nudgeFor(baseA.seatId).y += best.a.y;
          nudgeFor(baseB.seatId).x += best.b.x;
          nudgeFor(baseB.seatId).y += best.b.y;
          changed = true;
        }
      }
      if (!changed) break;
    }

    const resolvedCards = cards.map((entry) => entryWithExtra(entry));
    pairs.forEach((pair) => {
      const a = nudgeFor(pair.seatA);
      const b = nudgeFor(pair.seatB);
      pair.tangentialApplied = round(Math.hypot(a.x, a.y) + Math.hypot(b.x, b.y));
    });
    const residualPairs = [];
    for (let i = 0; i < resolvedCards.length; i += 1) {
      for (let j = i + 1; j < resolvedCards.length; j += 1) {
        const hit = pairHit(resolvedCards[i], resolvedCards[j]);
        if (hit && hit.area > 0.0001) {
          const rawHit = overlapMetrics(resolvedCards[i].rect, resolvedCards[j].rect, 0);
          residualPairs.push({
            seatA: Math.min(resolvedCards[i].seatId, resolvedCards[j].seatId),
            seatB: Math.max(resolvedCards[i].seatId, resolvedCards[j].seatId),
            area: round(rawHit?.area || 0),
            paddedArea: round(hit.area),
            requiredGap: round(GROUPING_GAP),
            reason: "tangential separation exhausted"
          });
        }
      }
    }
    const nudges = [...nudgeBySeat.entries()]
      .filter(([, nudge]) => Math.abs(nudge.x) > 0.0001 || Math.abs(nudge.y) > 0.0001)
      .map(([seatId, nudge]) => ({ seatId, tx: round(nudge.x), ty: round(nudge.y) }));
    const placements = resolvedCards.map((entry) => {
      const box = boxById.get(Number(entry.seatId));
      return {
        seatId: entry.seatId,
        tx: round(entry.rect.center.x - Number(box?.center?.x || 0)),
        ty: round(entry.rect.center.y - Number(box?.center?.y || 0))
      };
    });
    return { cards, resolvedCards, pairs, nudges, placements, residualPairs };
  }

  function finalizeDealerSlots(rects, options = {}) {
    const bounds = options.bounds || BOUNDS;
    const tolerance = Number(options.tolerance ?? 0.3);
    const gap = Number(options.gap ?? 0.35);
    // Target a hair above the smoke gate's floor so the asserted invariant has
    // margin. Zero-overlap/convergence still wins over this target (tier 2 below).
    const attributionK = Number(options.attributionK ?? 1.35);
    const dimensions = options.dimensions || {};
    const revealPhase = phaseUsesRevealCards(options.phase);
    const exactRevealCardEntries = (Array.isArray(options.revealCardRects) ? options.revealCardRects : [])
      .map((entry) => ({
        seatId: Number(entry?.seatId ?? entry?.rect?.seatId),
        zone: entry?.zone || seatZoneOf(entry?.rect?.center || entry?.center),
        rect: entry?.rect || entry
      }))
      .filter((entry) => entry.rect && Number(entry.rect?.size?.w) > 0 && Number(entry.rect?.size?.h) > 0);
    const exactRevealCardRects = exactRevealCardEntries.map((entry) => entry.rect);
    const exactRevealCardBySeat = new Map(exactRevealCardEntries.map((entry) => [Number(entry.seatId), entry]));
    const boxes = rects.filter((rect) => rect.kind === "box");
    const dealers = rects.filter((rect) => rect.kind === "dealer");
    let moveCount = 0;

    // FIX 2 — aspect-corrected disc footprint for the keep-out path ONLY. The disc
    // is drawn square in PX (one --dealer-dot-size on both axes), but the engine's
    // dealer rect lives in percent space with h == w == d. On a wide felt (feltAspect
    // = feltW/feltH ~1.4-2.4) the disc's TRUE rendered height fraction is d*feltAspect
    // — much taller than d. The reveal keep-out is a mostly-vertical lane (box centre
    // -> pushed card centre), so a disc modelled only d tall UNDER-reserves vertical
    // clearance and the resolver can "clear" a disc that visibly overlaps the card.
    // We therefore measure keep-out clearance/overlap with a disc whose height is
    // d*feltAspect (width unchanged). The general collision core keeps the square-in-
    // percent disc (documented in the css-engine-size-contract gate) — only this path
    // is corrected, where the aspect error is load-bearing.
    const feltAspect = Number(dimensions.feltAspect) > 0 ? Number(dimensions.feltAspect) : 1;
    const discKeepoutSize = (dealer) => ({
      w: dealer.size.w,
      h: dealer.size.h * feltAspect
    });
    const discKeepoutRect = (center, dealer) => rectFromCenter(center, discKeepoutSize(dealer), dealer);

    // FIX 1 — cross-seat keep-outs. In a reveal phase EVERY non-hero seat shows its
    // owner-attached revealed card, so the ONE dealer disc must clear not just its
    // own seat's card but every other seat's rendered card too (the headline P3
    // regression: the disc landed on a NEIGHBOUR's reveal card). Build the
    // rendered footprint for every non-hero seat once; each dealer packs against the
    // whole set (soft: never forced past them if that breaks attribution).
    const allRevealKeepouts = [];
    if (revealPhase) {
      boxes.forEach((box) => {
        if (Number(box.seatId) === 0) return; // hero cards keep their normal live-card lane
        const zone = seatZoneOf(box.center);
        const ko = revealDealerCardKeepout(box, dimensions, exactRevealCardBySeat.get(Number(box.seatId)));
        if (ko) allRevealKeepouts.push({ seatId: Number(box.seatId), zone, keepout: ko });
      });
    }
    const revealKeepoutRects = allRevealKeepouts.map((entry) => entry.keepout);

    // Soft reveal-card keep-outs, one per dealer that got one, tagged with
    // whether a well-attributed clear spot beside the card was feasible
    // (satisfiable). Returned so layoutTable can EXPORT them into the layout for
    // the reveal-stability gate — which asserts zero dealer overlap wherever
    // satisfiable is true, and merely reports it where it is not (crowded 9-max).
    const softKeepouts = [];
    dealers.forEach((dealer) => {
      const ownBox = boxes.find((rect) => Number(rect.seatId) === Number(dealer.seatId));
      // Exact final reveal faces are hard obstacles even when the broader swept
      // reveal lane is too crowded to be satisfiable. This closes the former soft
      // fallback where the button could remain on the final card face.
      const baseObstacles = rects
        .filter((rect) => rect !== dealer && rect.kind !== "marker")
        .concat(exactRevealCardRects);
      const ownDistance = (center) => (ownBox ? distanceBetween(center, ownBox.center) : 0);
      const attribution = (center) => dealerAttribution(center, ownBox, boxes, dealer.seatId);
      // Candidate offsets must use the disc's rendered (aspect-correct) height.
      // Using the square percent-space proxy generated a point that still clipped
      // the owner panel, then skipped the obvious clear point directly beside it.
      const candidateDealer = revealPhase
        ? { ...dealer, size: discKeepoutSize(dealer), axes: dealer.axes }
        : dealer;
      // Exact rendered-disc collision checks already provide the safety margin;
      // a smaller search gap keeps crowded P9 buttons close enough to their owner.
      const candidateCenters = () => dealerCandidateCenters(candidateDealer, ownBox, revealPhase ? 0.1 : gap);
      // Reveal phase only: every face-up opponent hand is owner-attached on the
      // felt-facing edge of its nameplate. Build the exact final footprint for
      // every non-hero seat, so the candidate search parks the button beside the
      // rendered hands instead of on top of one. Hero keeps its normal live-card
      // lane and therefore needs no extra reveal footprint here.
      //
      // SOFT: only honour the keep-outs when they still leave a clear, well-attributed
      // spot. On a crowded table (e.g. 9-max single-table top seats) the rendered
      // card is small but the neighbours are close, so forcing the disc past the
      // card footprint would shove it toward a neighbour and break attribution. In
      // that case we keep the original placement — never trade a P3 card overlap for
      // a mis-attributed button. The bug this fixes is severe only where the reveal
      // card is large relative to the table (heads-up / few-handed), exactly where a
      // well-attributed clear spot does exist.
      let obstacles = baseObstacles;
      let keepout = null; // this dealer's OWN-seat keep-out (for the softKeepouts export)
      let keepoutSatisfiable = false;
      if (revealPhase && ownBox && Number(dealer.seatId) !== 0) {
        keepout = revealKeepoutRects.find((ko) => Number(ko.seatId) === Number(dealer.seatId)) || null;
      }
      // The disc must clear ALL reveal keep-outs (own + every neighbour's). Test
      // satisfiability against the whole set using the aspect-corrected disc; only
      // apply the set if a well-attributed clear spot beside every card is feasible.
      if (revealPhase && ownBox && Number(dealer.seatId) !== 0 && revealKeepoutRects.length) {
        const withKeepouts = baseObstacles.concat(revealKeepoutRects);
        keepoutSatisfiable = candidateCenters()
          .map((center) => discKeepoutRect(center, dealer))
          .some((candidate) =>
            rectIsClear(candidate, withKeepouts, bounds, tolerance)
            && attribution(candidate.center) >= attributionK
          );
        if (keepoutSatisfiable) obstacles = withKeepouts;
      }
      // Clearance test uses the aspect-corrected disc height within the keep-out
      // path (discKeepoutRect builds the taller disc from a CENTRE, so it is applied
      // exactly once). Against non-keepout obstacles the taller disc is at worst
      // slightly more conservative (never less), so it cannot manufacture a false clear.
      const centerIsClear = (center) => rectIsClear(discKeepoutRect(center, dealer), obstacles, bounds, tolerance);
      // Leave the disc alone only when it is BOTH collision-clear AND unambiguously
      // attributed. The old guard tested clearance only, so a disc the resolver
      // nudged toward a neighbour (or one seeded near-equidistant) was accepted even
      // though it read as the wrong seat's button (measured worst attribution 0.54).
      const startClear = centerIsClear(dealer.center);
      const placeDisc = () => {
        if (startClear && attribution(dealer.center) >= attributionK) return;
        const candidates = candidateCenters()
          .map((center) => rectFromCenter(center, dealer.size, dealer))
          .filter((candidate) => centerIsClear(candidate.center));
        if (!candidates.length) return;
        // Tier 1: clear AND well attributed -> pick the one that hugs the owner tightest.
        const attributed = candidates
          .filter((candidate) => attribution(candidate.center) >= attributionK)
          .sort((a, b) => ownDistance(a.center) - ownDistance(b.center));
        // Tier 2 (zero-overlap always wins): no clear+attributed spot, so take the
        // clear candidate that is at least the LEAST ambiguous (max attribution).
        const next = attributed.length
          ? attributed[0]
          : candidates.slice().sort((a, b) => attribution(b.center) - attribution(a.center))[0];
        if (!next) return;
        // If the disc is already clear, never relocate to a worse-attributed spot
        // (avoid churn that trades a clean-but-slightly-tight owner hug for ambiguity).
        if (startClear && attribution(next.center) <= attribution(dealer.center)) return;
        dealer.center = { ...next.center };
        refreshRect(dealer);
        moveCount += 1;
      };
      placeDisc();
      // Record the keep-out for export AFTER placement so its satisfiable flag and
      // the final disc position are both known. Attach the resolved dealer overlap
      // so the gate does not have to re-derive it.
      //
      // dealerOverlapArea is measured with the ASPECT-CORRECTED disc (the same one
      // the placement packed against) against EVERY reveal keep-out (own + all
      // neighbours, FIX 1), taking the MAX. The gate asserts this is 0 wherever
      // satisfiable — i.e. the disc sits on NO seat's rendered revealed card, not
      // merely off its own. worstKeepoutSeatId names which card, for diagnostics.
      if (keepout) {
        const correctedDisc = discKeepoutRect(dealer.center, dealer);
        let worstArea = 0;
        let worstKeepoutSeatId = null;
        allRevealKeepouts.forEach((entry) => {
          const hit = overlapMetrics(correctedDisc, entry.keepout, 0);
          const area = hit && hit.area > 0.0001 ? hit.area : 0;
          if (area > worstArea) { worstArea = area; worstKeepoutSeatId = entry.seatId; }
        });
        // How many OF the reveal keep-outs the disc had to avoid belong to OTHER
        // seats — proves the cross-seat obstacle set (FIX 1) was actually non-trivial
        // for this case, so the gate can assert the cross-seat path is exercised even
        // though a correctly-placed disc leaves worstArea == 0.
        const neighbourKeepoutCount = allRevealKeepouts
          .filter((entry) => Number(entry.seatId) !== Number(dealer.seatId)).length;
        softKeepouts.push({
          keepout,
          seatId: Number(dealer.seatId),
          zone: seatZoneOf(ownBox.center),
          satisfiable: keepoutSatisfiable,
          dealerOverlapArea: worstArea,
          worstKeepoutSeatId,
          neighbourKeepoutCount
        });
      }
    });
    return { moveCount, softKeepouts };
  }

  function finalizeMarkerSlots(rects, options = {}) {
    const bounds = options.bounds || BOUNDS;
    const tolerance = Number(options.tolerance ?? 0.3);
    const gap = Number(options.gap ?? 0.45);
    const extraObstacles = Array.isArray(options.extraObstacles) ? options.extraObstacles : [];
    const markers = rects
      .filter((rect) => rect.kind === "marker")
      .sort((a, b) => Number(a.seatId || 0) - Number(b.seatId || 0));
    let moveCount = 0;
    for (let pass = 0; pass < 4; pass += 1) {
      let changed = false;
      markers.forEach((marker) => {
        const ownBox = rects.find((rect) => rect.kind === "box" && Number(rect.seatId) === Number(marker.seatId));
        const ownCards = rects.find((rect) => rect.kind === "cards" && Number(rect.seatId) === Number(marker.seatId));
        // No preflop-hero special-case: the hero marker keeps the phase-invariant
        // betting-ring position from seatSlotRects and is only nudged by the shared
        // collision-avoid path below, so it never jumps between preflop and the flop.
        const obstacles = rects.filter((rect) => rect !== marker).concat(extraObstacles);
        if (rectIsClear(marker, obstacles, bounds, tolerance, gap)) return;
        const candidates = markerCandidateCenters(marker, ownBox, ownCards, gap)
          .map((center) => rectFromCenter(center, marker.size, marker))
          .sort((a, b) => {
            const da = markerCandidateScore(a, marker, ownBox, ownCards);
            const db = markerCandidateScore(b, marker, ownBox, ownCards);
            return da - db;
          });
        let next = candidates.find((candidate) => rectIsClear(candidate, obstacles, bounds, tolerance, gap));
        if (!next) {
          // Last-resort dense-corner search. T2/QHD XL 9-max can close every
          // analytic corridor with the board + two neighbouring reveals; a
          // bounded obstacle-edge intersections still expose a clear pocket. This branch is only
          // reached after the normal candidates fail, so common layouts keep
          // the cheap deterministic path above.
          const halfW = marker.size.w / 2;
          const halfH = marker.size.h / 2;
          const xs = [marker.center.x, bounds.left - tolerance + halfW, bounds.right + tolerance - halfW];
          const ys = [marker.center.y, bounds.top - tolerance + halfH, bounds.bottom + tolerance - halfH];
          obstacles.forEach((obstacle) => {
            const epsilon = 0.5;
            xs.push(obstacle.left - gap - halfW - epsilon, obstacle.right + gap + halfW + epsilon);
            ys.push(obstacle.top - gap - halfH - epsilon, obstacle.bottom + gap + halfH + epsilon);
          });
          const edgeCandidates = [];
          xs.forEach((x) => ys.forEach((y) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            edgeCandidates.push(rectFromCenter({ x, y }, marker.size, marker));
          }));
          edgeCandidates.sort((a, b) => markerCandidateScore(a, marker, ownBox, ownCards) - markerCandidateScore(b, marker, ownBox, ownCards));
          next = edgeCandidates.find((candidate) => rectIsClear(candidate, obstacles, bounds, tolerance, gap));
        }
        if (!next) return;
        marker.center = { ...next.center };
        refreshRect(marker);
        changed = true;
        moveCount += 1;
      });
      if (!changed) break;
    }
    return { moveCount };
  }

  function collectMarkerVisualCollisions(rects, obstacles, options = {}) {
    const tolerance = Number(options.tolerance ?? 0.3);
    const bounds = options.bounds || BOUNDS;
    const overlaps = [];
    if (!Array.isArray(obstacles) || !obstacles.length) return overlaps;
    rects
      .filter((rect) => rect.kind === "marker" && !rect.collisionExempt)
      .forEach((marker) => {
        obstacles.forEach((obstacle) => {
          if (!rectIsInsideBounds(marker, bounds, tolerance)) return;
          const overlap = overlapMetrics(marker, obstacle, 0);
          if (overlap && overlap.area > 0.0001) {
            overlaps.push({
              a: marker.id,
              b: obstacle.id,
              kinds: `${marker.kind}/${obstacle.kind}`,
              area: round(overlap.area),
              width: round(overlap.width),
              height: round(overlap.height)
            });
          }
        });
      });
    return overlaps;
  }

  function layoutTable(options = {}) {
    const playerCount = clamp(Math.floor(Number(options.playerCount || 9)), 2, 9);
    const phase = PHASES.includes(options.phase) ? options.phase : "preflop-blinds";
    const dimensions = options.dimensions || dimensionsFor(options);
    const dealerSeatId = Number.isFinite(Number(options.dealerSeatId)) ? Number(options.dealerSeatId) : 0;
    const anchors = seatAnchors(playerCount, { dimensions });
    const rects = fixedRects(dimensions, phase);
    const markerObstacles = markerVisualObstacles(dimensions, phase);
    anchors.forEach((anchor) => {
      rects.push(...seatSlotRects(anchor, dimensions, phase, dealerSeatId));
    });
    const resolved = resolveCollisions(rects, {
      bounds: options.bounds || BOUNDS,
      dimensions,
      tolerance: Number(options.tolerance ?? 0.3),
      gap: 0,
      maxIterations: options.maxIterations || 192
    });
    const cardFinalPass = finalizeCardSlots(resolved.rects, {
      bounds: options.bounds || BOUNDS,
      tolerance: Number(options.tolerance ?? 0.3),
      gap: dimensions.gaps.collision
    });
    // Compute final owner-attached reveal geometry before buttons and live bet
    // markers. Both must pack against the exact rendered hand, including any
    // bounded tangential correction used for a crowded corner.
    const revealBoxes = phaseUsesRevealCards(phase)
      ? resolved.rects.filter((rect) => rect.kind === "box")
      : [];
    const revealCardSeparation = revealBoxes.length
      ? revealCardNeighbourSeparation(revealBoxes, dimensions)
      : { cards: [], resolvedCards: [], pairs: [], nudges: [], placements: [], residualPairs: [] };
    const dealerFinalPass = finalizeDealerSlots(resolved.rects, {
      bounds: options.bounds || BOUNDS,
      tolerance: Number(options.tolerance ?? 0.3),
      gap: dimensions.gaps.collision,
      phase,
      dimensions,
      revealCardRects: revealCardSeparation.resolvedCards
    });
    const revealCardObstacles = (revealCardSeparation.resolvedCards || [])
      .map((entry) => entry?.rect || entry)
      .filter(Boolean);
    const markerFinalPass = finalizeMarkerSlots(resolved.rects, {
      bounds: options.bounds || BOUNDS,
      tolerance: Number(options.tolerance ?? 0.3),
      gap: dimensions.gaps.collision,
      extraObstacles: markerObstacles.concat(revealCardObstacles)
    });
    // Export the soft reveal-card keep-outs INTO the layout rects (after every
    // resolver/finalize pass, so they never perturb placement) so validateLayout
    // and the reveal-stability gate SEE them. They carry collisionExempt:true, so
    // the hard pairwise overlap sweep skips them (report-not-fail); the gate reads
    // them via layout.softKeepouts to assert zero dealer overlap where feasible.
    const softKeepouts = (dealerFinalPass.softKeepouts || []);
    softKeepouts.forEach((entry) => resolved.rects.push(entry.keepout));
    const finalCollisions = collectCollisions(resolved.rects, {
      bounds: options.bounds || BOUNDS,
      dimensions,
      tolerance: Number(options.tolerance ?? 0.3),
      gap: 0
    });
    finalCollisions.overlaps.push(...collectMarkerVisualCollisions(resolved.rects, markerObstacles.concat(revealCardObstacles), {
      bounds: options.bounds || BOUNDS,
      tolerance: Number(options.tolerance ?? 0.3)
    }));
    const finalClean = !finalCollisions.overlaps.length && !finalCollisions.outOfBounds.length;
    return {
      mode: "slot-model",
      tier: dimensions.tier,
      viewport: dimensions.viewport,
      playerCount,
      phase,
      dealerSeatId,
      dimensions,
      markerObstacles: markerObstacles.map((rect) => ({
        id: rect.id,
        kind: rect.kind,
        center: { x: round(rect.center.x), y: round(rect.center.y) },
        size: { w: round(rect.size.w), h: round(rect.size.h) },
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top),
        bottom: round(rect.bottom)
      })),
      anchors,
      rects: resolved.rects.map((rect) => ({
        id: rect.id,
        kind: rect.kind,
        seatId: rect.seatId,
        boundsAllowance: round(Number(rect.boundsAllowance || 0)),
        boundsKind: rect.boundsKind || "felt",
        collisionExempt: Boolean(rect.collisionExempt),
        soft: Boolean(rect.soft),
        ownBoxOverlapAllowance: round(Number(rect.ownBoxOverlapAllowance || 0)),
        center: { x: round(rect.center.x), y: round(rect.center.y) },
        size: { w: round(rect.size.w), h: round(rect.size.h) },
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top),
        bottom: round(rect.bottom)
      })),
      // Soft reveal-card dealer keep-outs (one per non-hero dealer in reveal
      // phases). satisfiable = a well-attributed clear spot beside the card was
      // feasible, so the disc MUST clear the card (asserted by the gate).
      // dealerOverlapArea = the final disc-vs-card overlap after placement.
      softKeepouts: softKeepouts.map((entry) => ({
        id: entry.keepout.id,
        seatId: entry.seatId,
        zone: entry.zone,
        satisfiable: entry.satisfiable,
        dealerOverlapArea: round(entry.dealerOverlapArea),
        // Which seat's rendered revealed card the disc overlaps most (null if none).
        // The disc must clear EVERY seat's card, not just its own (FIX 1 cross-seat).
        worstKeepoutSeatId: entry.worstKeepoutSeatId ?? null,
        // Count of OTHER seats' reveal keep-outs the disc packed against (FIX 1).
        neighbourKeepoutCount: Number(entry.neighbourKeepoutCount || 0),
        center: { x: round(entry.keepout.center.x), y: round(entry.keepout.center.y) },
        size: { w: round(entry.keepout.size.w), h: round(entry.keepout.size.h) },
        left: round(entry.keepout.left),
        right: round(entry.keepout.right),
        top: round(entry.keepout.top),
        bottom: round(entry.keepout.bottom)
      })),
      // Reveal-phase owner-attached card geometry. `cards` are the radial dock;
      // `resolvedCards` include any bounded tangential correction for P8/P9.
      revealCardSeparation: {
        cards: revealCardSeparation.cards.map((entry) => ({
          seatId: entry.seatId,
          zone: entry.zone,
          center: { x: round(entry.rect.center.x), y: round(entry.rect.center.y) },
          size: { w: round(entry.rect.size.w), h: round(entry.rect.size.h) }
        })),
        // Final render-truth after bounded tangential separation.
        resolvedCards: (revealCardSeparation.resolvedCards || []).map((entry) => ({
          seatId: entry.seatId,
          zone: entry.zone,
          center: { x: round(entry.rect.center.x), y: round(entry.rect.center.y) },
          size: { w: round(entry.rect.size.w), h: round(entry.rect.size.h) },
          left: round(entry.rect.left),
          right: round(entry.rect.right),
          top: round(entry.rect.top),
          bottom: round(entry.rect.bottom)
        })),
        pairs: revealCardSeparation.pairs,
        // Small correction relative to the radial dock, for diagnostics.
        nudges: revealCardSeparation.nudges || [],
        // Authoritative final offset from the owner box used by the renderer.
        placements: revealCardSeparation.placements || [],
        // Any pair that remains after the tangential correction. The
        // geometry smoke treats every residual as a hard failure in T1/T2/T4.
        residualPairs: revealCardSeparation.residualPairs || []
      },
      resolver: {
        converged: resolved.converged || finalClean,
        iterations: resolved.iterations,
        moveCount: resolved.moves.length + cardFinalPass.moveCount + dealerFinalPass.moveCount + markerFinalPass.moveCount
      }
    };
  }

  function validateLayout(layout, options = {}) {
    const collisions = collectCollisions(layout.rects, {
      bounds: options.bounds || BOUNDS,
      dimensions: options.dimensions || layout?.dimensions,
      tolerance: Number(options.tolerance ?? 0.3),
      gap: Number(options.gap ?? 0)
    });
    collisions.overlaps.push(...collectMarkerVisualCollisions(layout.rects, layout?.markerObstacles || [], {
      bounds: options.bounds || BOUNDS,
      tolerance: Number(options.tolerance ?? 0.3)
    }));
    return collisions;
  }

  const api = {
    VIEWPORTS,
    TIERS,
    PHASES,
    UI_SCALES,
    BOUNDS,
    DIMENSION_SOURCE,
    dimensionsFor,
    seatAnchors,
    rectFromCenter,
    rectOutsideBounds,
    overlapMetrics,
    collectCollisions,
    resolveCollisions,
    layoutTable,
    validateLayout,
    // Reveal-card-vs-card model (trainer P3): rendered reveal-card footprints +
    // neighbour-collision detection. Exposed for the reveal-card-vs-card gate.
    renderedRevealCardRects,
    revealCardNeighbourSeparation
  };

  root.PokerSimulatorSeatSlots = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
