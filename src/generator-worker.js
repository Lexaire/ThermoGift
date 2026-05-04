import {
  PRESETS,
  availableShapesFor,
  countsByRow,
  countsByCol,
  encodeIdV2,
  solutionKeyBytes,
  checksumForBytes,
} from "./generator.js";
import { constructPuzzle } from "./constructive.js";

self.addEventListener("message", (event) => {
  try {
    const { presetId, shapeStyle, code } = event.data;
    if (typeof code !== "string") throw new Error("Bad code");
    const secretBytes = new TextEncoder().encode(code);
    if (secretBytes.length > 4096) throw new Error("Code too long (max 4096 UTF-8 bytes)");
    const puzzle = createPuzzle(presetId, shapeStyle);
    const key = solutionKeyBytes(puzzle.solution, puzzle.size, secretBytes.length);
    const cipherBytes = Array.from(secretBytes, (b, i) => b ^ key[i]);
    const checksum = checksumForBytes(secretBytes, puzzle.solution, puzzle.size);
    const rowClues = countsByRow(puzzle.solution, puzzle.size);
    const colClues = countsByCol(puzzle.solution, puzzle.size);
    const id = encodeIdV2({
      size: puzzle.size,
      shapeStyle: puzzle.shapeStyle,
      thermos: puzzle.thermos,
      rowClues,
      colClues,
      cipherBytes,
      checksum,
    });
    self.postMessage({ ok: true, id, solution: puzzle.solution, fillLengths: puzzle.fillLengths });
  } catch (error) {
    self.postMessage({ ok: false, error: error.message });
  }
});

function createPuzzle(presetId, shapeStyle = "") {
  const preset = PRESETS[presetId] ?? PRESETS.normal;
  const resolvedShape = shapeStyle || preset.shapeStyle;
  if (!availableShapesFor(presetId).includes(resolvedShape)) {
    throw new Error(`${preset.label} doesn't support ${resolvedShape} thermos`);
  }
  const result = constructPuzzle(preset.size, resolvedShape, {
    minLength: preset.minLength,
    maxLength: preset.maxLength,
    minThermos: preset.minThermos,
    layoutAttempts: Math.max(50, Math.floor((preset.deadlineMs ?? 5000) / 50)),
  });
  if (!result) throw new Error("Could not create a unique puzzle");
  return {
    size: preset.size,
    shapeStyle: resolvedShape,
    thermos: result.thermos,
    fillLengths: result.fills,
    solution: result.solution,
  };
}
