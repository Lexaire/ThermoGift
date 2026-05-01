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
  encodeCode,
  encodeId,
  solutionKey,
  checksumFor,
} from "./generator.js";

self.addEventListener("message", (event) => {
  try {
    const { presetId, shapeStyle, code } = event.data;
    if (!/^[A-Za-z0-9]{1,31}$/.test(code)) throw new Error("Bad code");
    const puzzle = createPuzzle(presetId, shapeStyle);
    const cipher = encodeCode(code, solutionKey(puzzle.solution, puzzle.size));
    const checksum = checksumFor(code, puzzle.solution, puzzle.size);
    const id = encodeId({
      z: puzzle.size,
      y: puzzle.shapeStyle,
      thermos: puzzle.thermos,
      fillLengths: puzzle.fillLengths,
      c: cipher,
      k: checksum,
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
