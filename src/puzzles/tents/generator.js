import { mulberry32, shuffled } from "../../common/util.js";
import {
  findFirstValidTentPlacement,
  isBCDeducible,
  bcAnalyze,
  countTentSolutions,
  countTentsPerRow,
  countTentsPerCol,
} from "./solver.js";
import { PRESETS } from "./presets.js";

// Hard puzzles feel "hard" when meaningful chunks of the board can only be
// settled by 1-step lookahead, not just a single corner. Without this gate
// most accepted Hard puzzles only need lookahead on ~10% of their unknown
// cells (the rest cascades from BC), so they feel exactly like Easy.
// The natural distribution caps at ~0.33 across every size; 0.25 picks
// roughly the top 10–20% (around q90) and is feasible at every size with
// the existing attempt multiplier. (Tree density is the wrong knob: above
// ~0.24 valid tent placements become too rare to find without changing
// the distribution shape.)
const HARD_LOOKAHEAD_RATIO_MIN = 0.25;

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
  // Hard tier passes a stack of filters (fail easy + ratio ≥ 0.25 + min
  // unknownAfterEasy), so the natural hit rate is well under 0.1% of
  // random layouts at most sizes. The deadline still caps wall time.
  const layoutAttempts = preset.layoutAttempts * (difficulty === "hard" ? 300 : 1);

  for (let attempt = 0; attempt < layoutAttempts; attempt++) {
    if (Date.now() > deadlineMs) throw new Error("Generation took too long, try again");

    const trees = placeTreesRandomly(size, numTrees, rng);
    const tents = findFirstValidTentPlacement(trees, size);
    if (!tents) continue;

    const rowClues = countTentsPerRow(tents, size);
    const colClues = countTentsPerCol(tents, size);

    if (countTentSolutions(trees, rowClues, colClues, size, 2) !== 1) continue;

    if (difficulty === "hard") {
      const result = bcAnalyze(trees, tents, rowClues, colClues, size, "hard");
      if (!result.ok) continue;
      // Easy-tier deduction must FAIL — otherwise the puzzle isn't hard at
      // all, just hard-deducible.
      if (isBCDeducible(trees, tents, rowClues, colClues, size, "easy")) continue;
      // The board has to start "fat": enough cells must remain UNKNOWN
      // after easy propagation that the player can't just fill grass and
      // see the answer fall out.
      if (result.unknownAfterEasy < (preset.hardMinUnknownAfterEasy ?? 0)) continue;
      // And the lookahead has to handle a meaningful share of the unknowns,
      // not just one corner.
      if (result.unknownAfterEasy === 0
          || result.lookaheadCommits / result.unknownAfterEasy < HARD_LOOKAHEAD_RATIO_MIN) continue;
    } else {
      if (!isBCDeducible(trees, tents, rowClues, colClues, size, difficulty)) continue;
    }

    return { size, trees, tents, rowClues, colClues };
  }
  return null;
}
