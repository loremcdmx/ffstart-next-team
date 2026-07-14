#!/usr/bin/env python3
"""Transcribe the 15 source PNG ranges into a compact 13x13 action map.

The source crops use solid pink (3-bet), green (cold-call), and white (fold)
fills. Split cells are 50/50. Pale yellow and grey overlays are author notes;
when they cover the whole cell, the underlying decision is fold, matching the
lesson's existing source-boundary copy.

Run from the repository root:
  python3 assets/poker-bb-call-defense-lesson/tools/extract-range-data.py
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"
OUTPUT = ROOT / "range-data.js"
GRID = 13
SIZE = 470
SIZES = ("2_0", "2_5", "3_0")
POSITIONS = ("EP", "MP", "HJ", "CO", "BTN")


def pixel_class(rgb: tuple[int, int, int]) -> str:
    red, green, blue = rgb
    if red > green + 22 and red > blue + 22 and red > 180:
        return "raise"
    if green > red + 12 and green > blue + 12 and green > 150:
        return "call"
    if min(rgb) > 235 and max(rgb) - min(rgb) < 14:
        return "fold"
    if red > blue + 18 and green > blue + 8 and red > 170 and green > 140:
        return "note"
    return "other"


def action_code(counts: Counter[str]) -> str:
    denominator = sum(counts[key] for key in ("raise", "call", "fold"))
    shares = {
        key: counts[key] / denominator if denominator else 0
        for key in ("raise", "call", "fold")
    }
    if shares["raise"] > 0.2 and shares["call"] > 0.2:
        return "B"  # 50% 3-bet, 50% cold-call
    if shares["call"] > 0.2 and shares["fold"] > 0.2:
        return "M"  # 50% cold-call, 50% fold
    if shares["raise"] > 0.75:
        return "R"
    if shares["call"] > 0.55:
        return "C"
    if shares["fold"] > 0.55:
        return "F"
    return "F"  # fully covered yellow/grey author note


def extract(path: Path) -> str:
    image = Image.open(path).convert("RGB")
    if image.size != (SIZE, SIZE):
        raise ValueError(f"{path.name}: expected {SIZE}x{SIZE}, got {image.size}")
    cells: list[str] = []
    for row in range(GRID):
        for column in range(GRID):
            left = round(column * SIZE / GRID) + 2
            right = round((column + 1) * SIZE / GRID) - 2
            top = round(row * SIZE / GRID) + 2
            bottom = round((row + 1) * SIZE / GRID) - 2
            counts = Counter(pixel_class(pixel) for pixel in image.crop((left, top, right, bottom)).getdata())
            cells.append(action_code(counts))
    if len(cells) != 169:
        raise AssertionError(f"{path.name}: expected 169 cells")
    return "".join(cells)


def main() -> None:
    scenarios: dict[str, str] = {}
    for size in SIZES:
        for position in POSITIONS:
            filename = f"range-{size}-vs-{position.lower()}.png"
            scenarios[f"{size}:{position}"] = extract(SOURCE / filename)

    payload = {
        "version": "source-png-pages-10-11-20260713-v1",
        "order": "row-major-AKQJT98765432",
        "codes": {
            "R": {"raisePct": 100, "callPct": 0, "foldPct": 0},
            "C": {"raisePct": 0, "callPct": 100, "foldPct": 0},
            "F": {"raisePct": 0, "callPct": 0, "foldPct": 100},
            "B": {"raisePct": 50, "callPct": 50, "foldPct": 0},
            "M": {"raisePct": 0, "callPct": 50, "foldPct": 50},
        },
        "scenarios": scenarios,
    }
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(
        "(function(root){\n"
        "  \"use strict\";\n"
        f"  root.PokerBbCallRangeData = Object.freeze({serialized});\n"
        "})(typeof window !== \"undefined\" ? window : globalThis);\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT} ({len(scenarios)} scenarios, 169 cells each)")


if __name__ == "__main__":
    main()
