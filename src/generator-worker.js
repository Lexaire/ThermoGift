import {
  PRESETS,
  buildThermometers,
  generateFillLengths,
  solutionFromLengths,
  buildSolverContext,
  countSolutionsCtx,
  countsByRow,
  countsByCol,
  isUsableClueSet,
  encodeIdV2,
  solutionKeyBytes,
  checksumForBytes,
} from "./generator.js";

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
    const id = encodeIdV2({
      size: puzzle.size,
      shapeStyle: puzzle.shapeStyle,
      thermos: puzzle.thermos,
      fillLengths: puzzle.fillLengths,
      cipherBytes,
      checksum,
    });
    self.postMessage({ ok: true, id });
  } catch (error) {
    self.postMessage({ ok: false, error: error.message });
  }
});

function createPuzzle(presetId, shapeStyle = "") {
  const preset = PRESETS[presetId] ?? PRESETS.normal;
  const config = { ...preset, shapeStyle: shapeStyle || preset.shapeStyle };
  const fillAttempts = config.fillAttempts ?? 4;

  for (let attempt = 0; attempt < config.attempts; attempt += 1) {
    const thermos = buildThermometers(config.size, config.minThermos, Math.random, config.shapeStyle, config);
    const ctx = buildSolverContext(thermos, config.size);

    for (let fillAttempt = 0; fillAttempt < fillAttempts; fillAttempt += 1) {
      const fillLengths = generateFillLengths(thermos, Math.random);
      const solution = solutionFromLengths(config.size, thermos, fillLengths);
      const rowClues = countsByRow(solution, config.size);
      const colClues = countsByCol(solution, config.size);

      if (isUsableClueSet(rowClues, colClues, config.size) && countSolutionsCtx(ctx, rowClues, colClues, 2, config.maxNodes) === 1) {
        return {
          size: config.size,
          shapeStyle: config.shapeStyle,
          thermos,
          fillLengths,
          solution,
        };
      }
    }
  }
  throw new Error("Could not create a unique puzzle");
}
