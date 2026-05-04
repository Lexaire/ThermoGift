// Thermometers puzzle module — the registered implementation behind variant=0
// in the t2 URL envelope and behind the legacy t1- prefix.
//
// Surface used by the shell:
//   - id, variant, presets, shapeStyles, availableShapesFor   (registry/UI)
//   - decodeId(id)            — accepts t1- or t2- ids, returns hydrated puzzle
//   - encode({puzzle, ...})   — writes a t2 id (current format) for sharing
//   - generate({presetId, shape, deadlineMs}) — runs the constructive generator
//   - solutionCells(puzzle)   — boolean[size*size] for cipher keying
//   - serializeForCache(puzzle) — extra data the worker sends back for the shell
//   - attachUI({...})         — owns board rendering + interactions
//   - puzzleLabel(puzzle)     — human-readable name shown above the board
//   - t2Variant               — { decodeBody } used by the t2 envelope dispatch

import { decodeT2Envelope } from "../../common/t2-envelope.js";
import { availableShapesFor, PRESETS, SHAPE_STYLES } from "./presets.js";
import { decodeT1, encodeT2, t2Variant, T2_VARIANT } from "./encoder.js";
import { constructPuzzle } from "./generator.js";
import { attachThermometerUI } from "./ui.js";

const VARIANT_HANDLERS = { [T2_VARIANT]: t2Variant };

/** @param {string} id */
function decodeId(id) {
  if (id.startsWith("t1-")) return hydrate(decodeT1(id), id);
  if (id.startsWith("t2-")) {
    const decoded = decodeT2Envelope(id, VARIANT_HANDLERS);
    return hydrate({
      size: decoded.size,
      shapeStyle: decoded.body.shapeStyle,
      thermos: decoded.body.thermos,
      rowClues: decoded.body.rowClues,
      colClues: decoded.body.colClues,
      cipherBytes: decoded.cipherBytes,
      checksum: decoded.checksum,
      format: "t2",
      ...(decoded.body.solution ? { solution: decoded.body.solution, fillLengths: decoded.body.fillLengths } : {}),
    }, id);
  }
  throw new Error("Unknown id prefix");
}

function hydrate(payload, id) {
  // Cache derived structures that don't change during play. Building these
  // once at puzzle load avoids rebuilding them inside the renderer, which
  // can fire many times per second during drag.
  const thermoByCell = new Map();
  payload.thermos.forEach((/** @type {number[]} */ thermo, /** @type {number} */ thermoIndex) => {
    thermo.forEach((/** @type {number} */ cell, /** @type {number} */ pathIndex) =>
      thermoByCell.set(cell, { thermo, thermoIndex, pathIndex }));
  });
  const expectedTotal = payload.rowClues.reduce(
    (/** @type {number} */ sum, /** @type {number} */ clue) => sum + clue, 0);
  return {
    ...payload,
    id,
    thermoByCell,
    expectedTotal,
  };
}

/** @param {{ presetId: string, shape: string, deadlineMs: number }} args */
function generate({ presetId, shape, deadlineMs }) {
  const preset = PRESETS[presetId] ?? PRESETS.normal;
  const resolvedShape = shape || preset.shapeStyle;
  if (!availableShapesFor(presetId).includes(resolvedShape)) {
    throw new Error(`${preset.label} doesn't support ${resolvedShape} thermos`);
  }
  const result = constructPuzzle(preset.size, resolvedShape, {
    minLength: preset.minLength,
    maxLength: preset.maxLength,
    minThermos: preset.minThermos,
    layoutAttempts: Math.max(50, Math.floor((preset.deadlineMs ?? 5000) / 50)),
    deadlineMs,
  });
  if (!result) throw new Error("Could not create a unique puzzle");
  return {
    size: preset.size,
    shapeStyle: resolvedShape,
    thermos: result.thermos,
    rowClues: result.rowClues,
    colClues: result.colClues,
    fillLengths: result.fills,
    solution: result.solution,
  };
}

function solutionCells(puzzle) {
  return puzzle.solution;
}

function serializeForCache(puzzle) {
  return { solution: puzzle.solution, fillLengths: puzzle.fillLengths };
}

function applyCachedFromWorker(puzzle, cache) {
  if (cache?.solution) puzzle.solution = cache.solution;
  if (cache?.fillLengths) puzzle.fillLengths = cache.fillLengths;
}

function puzzleLabel(puzzle) {
  const preset = Object.values(PRESETS).find((p) => p.size === puzzle.size);
  const base = preset?.label ?? `Custom ${puzzle.size}x${puzzle.size}`;
  return puzzle.shapeStyle === "straight" ? `${base} Straight` : base;
}

const thermometers = {
  id: "thermometers",
  variant: T2_VARIANT,
  rulesText: "Fill thermometers from the round bulb toward the rounded tip. A later segment cannot be filled unless every segment before it is filled. The numbers above and beside the grid tell how many red cells belong in that column or row. Right-click a cell to mark an X. The puzzle is solved when every count matches and each thermometer is filled bulb-first.",
  settingsSchema: [
    { id: "settingAutoXAxis", key: "thermogift:assist:autoXAxis", label: "Auto-X completed rows and columns", desc: "When a clue is met, click it to mark the rest of that row or column with X.", defaultOn: false },
    { id: "settingCascadeThermoX", key: "thermogift:assist:cascadeThermoX", label: "Flood X's", desc: "Marking an X also floods X's up to the tip.", defaultOn: false },
    { id: "settingCascadeThermoFill", key: "thermogift:assist:cascadeThermoFill", label: "Flood mercury to the bulb", desc: "Filling a cell also floods mercury back to the bulb.", defaultOn: true },
    { id: "settingDimMatchedClues", key: "thermogift:assist:dimMatchedClues", label: "Dim row and column clues when met", desc: "Greys out a clue once its row or column count matches.", defaultOn: true },
  ],
  presets: PRESETS,
  shapeStyles: SHAPE_STYLES,
  availableShapesFor,
  decodeId,
  encode: encodeT2,
  generate,
  solutionCells,
  serializeForCache,
  applyCachedFromWorker,
  attachUI: attachThermometerUI,
  puzzleLabel,
  t2Variant,
};

export default thermometers;
