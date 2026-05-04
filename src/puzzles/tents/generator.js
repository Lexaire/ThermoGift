import { mulberry32, shuffled } from "../../common/util.js";
import {
  findFirstValidTentPlacement,
  isBCDeducible,
  countTentSolutions,
  countTentsPerRow,
  countTentsPerCol,
} from "./solver.js";
import { PRESETS } from "./presets.js";

function placeTreesRandomly(size, count, rng) {
  const cells = Array.from({ length: size * size }, (_, i) => i);
  return new Set(shuffled(cells, rng).slice(0, count));
}

export function constructTentsPuzzle(presetOrId, opts = {}) {
  const preset = typeof presetOrId === "string" ? PRESETS[presetOrId] : presetOrId;
  if (!preset) throw new Error(`Unknown preset: ${presetOrId}`);

  const rng = opts.rng ?? mulberry32(Date.now() ^ (Math.random() * 0x100000000));
  const deadlineMs = opts.deadlineMs ?? (Date.now() + preset.deadlineMs);
  const size = preset.size;
  const numTrees = Math.round(size * size * preset.treeDensity);
  const difficulty = opts.difficulty ?? "easy";
  // Hard tier requires the puzzle to fail easy-tier deduction, which is a
  // narrow filter: random layouts pass it ~1% as often as easy. Give the
  // attempt loop a much larger budget; the deadline still caps wall time.
  const layoutAttempts = preset.layoutAttempts * (difficulty === "hard" ? 50 : 1);

  for (let attempt = 0; attempt < layoutAttempts; attempt++) {
    if (Date.now() > deadlineMs) throw new Error("Generation took too long, try again");

    const trees = placeTreesRandomly(size, numTrees, rng);
    const tents = findFirstValidTentPlacement(trees, size);
    if (!tents) continue;

    const rowClues = countTentsPerRow(tents, size);
    const colClues = countTentsPerCol(tents, size);

    if (countTentSolutions(trees, rowClues, colClues, size, 2) !== 1) continue;

    if (!isBCDeducible(trees, tents, rowClues, colClues, size, difficulty)) continue;

    // Hard tier must be meaningfully harder than easy: if a puzzle is
    // already deducible at the easy tier, it doesn't qualify as hard.
    if (difficulty === "hard"
        && isBCDeducible(trees, tents, rowClues, colClues, size, "easy")) continue;

    return { size, trees, tents, rowClues, colClues };
  }
  return null;
}
