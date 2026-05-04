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

  for (let attempt = 0; attempt < preset.layoutAttempts; attempt++) {
    if (Date.now() > deadlineMs) throw new Error("Generation took too long, try again");

    const trees = placeTreesRandomly(size, numTrees, rng);
    const tents = findFirstValidTentPlacement(trees, size);
    if (!tents) continue;

    const rowClues = countTentsPerRow(tents, size);
    const colClues = countTentsPerCol(tents, size);

    if (countTentSolutions(trees, rowClues, colClues, size, 2) !== 1) continue;

    if (!isBCDeducible(trees, tents, rowClues, colClues, size)) continue;

    return { size, trees, tents, rowClues, colClues };
  }
  return null;
}
