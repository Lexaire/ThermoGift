import { decodeT2Envelope } from "../../common/t2-envelope.js";
import { availableShapesFor, PRESETS, SHAPE_STYLES } from "./presets.js";
import { T2_VARIANT, encodeT2, t2Variant } from "./encoder.js";
import { constructTentsPuzzle } from "./generator.js";
import { attachTentsUI } from "./ui.js";

const VARIANT_HANDLERS = { [T2_VARIANT]: t2Variant };

function decodeId(id) {
  if (!id.startsWith("t2-")) throw new Error("Unknown id prefix");
  const decoded = decodeT2Envelope(id, VARIANT_HANDLERS);
  return hydrate({
    size: decoded.size,
    trees: decoded.body.trees,
    rowClues: decoded.body.rowClues,
    colClues: decoded.body.colClues,
    cipherBytes: decoded.cipherBytes,
    checksum: decoded.checksum,
    format: "t2",
  }, id);
}

function hydrate(payload, id) {
  const expectedTotal = payload.rowClues.reduce((sum, clue) => sum + clue, 0);
  return { ...payload, id, expectedTotal };
}

function generate({ presetId, difficulty, deadlineMs }) {
  const preset = PRESETS[presetId] ?? PRESETS["6x6"];
  const result = constructTentsPuzzle(preset, { deadlineMs, difficulty });
  if (!result) throw new Error("Could not create a unique puzzle");
  const solution = Array.from({ length: result.size * result.size }, (_, i) => result.tents.has(i));
  return {
    size: result.size,
    trees: result.trees,
    tents: result.tents,
    rowClues: result.rowClues,
    colClues: result.colClues,
    solution,
  };
}

function solutionCells(puzzle) {
  if (puzzle.solution) return puzzle.solution;
  if (puzzle.tents) return Array.from({ length: puzzle.size * puzzle.size }, (_, i) => puzzle.tents.has(i));
  return undefined;
}

function serializeForCache(puzzle) {
  return { tents: puzzle.tents ? [...puzzle.tents] : null };
}

function applyCachedFromWorker(puzzle, cache) {
  if (cache?.tents) {
    puzzle.tents = new Set(cache.tents);
    if (!puzzle.solution) {
      puzzle.solution = Array.from({ length: puzzle.size * puzzle.size }, (_, i) => puzzle.tents.has(i));
    }
  }
}

function puzzleLabel(puzzle) {
  const preset = Object.values(PRESETS).find(p => p.size === puzzle.size);
  return preset?.label ?? `Custom ${puzzle.size}x${puzzle.size}`;
}

const tents = {
  id: "tents",
  variant: T2_VARIANT,
  rulesText: "Place a tent next to each tree. Each tent must be orthogonally adjacent (up, down, left, right) to its tree. Tents cannot touch each other, even diagonally. The numbers above and beside the grid tell how many tents belong in that column or row. Left-click to place or clear a tent. Right-click to mark an X.",
  settingsSchema: [
    { id: "settingTentsDimClues", key: "thermogift:assist:tents:dimMatchedClues", label: "Dim row and column clues when met", desc: "Greys out a clue once its row or column count matches.", defaultOn: true },
    { id: "settingTentsAutoX", key: "thermogift:assist:tents:autoXAroundTents", label: "Auto-fill X around tents", desc: "When you place a tent, mark X on the eight surrounding cells.", defaultOn: true },
    { id: "settingTentsAutoFloodX", key: "thermogift:assist:tents:autoFloodXOnClueMet", label: "Auto-flood X when clue is met", desc: "When a row or column has all its tents placed, fill the remaining empty cells with X.", defaultOn: false },
  ],
  presets: PRESETS,
  shapeStyles: SHAPE_STYLES,
  availableShapesFor,
  secondaryAxis: {
    paramName: "difficulty",
    label: "Difficulty",
    storageKey: "thermogift:newTentsDifficulty",
    defaultValue: "easy",
    options: [
      { value: "easy", label: "Easy" },
      { value: "hard", label: "Hard" },
    ],
    availableForPreset: () => ["easy", "hard"],
  },
  decodeId,
  encode: encodeT2,
  generate,
  solutionCells,
  serializeForCache,
  applyCachedFromWorker,
  attachUI: attachTentsUI,
  puzzleLabel,
  t2Variant,
};

export default tents;
