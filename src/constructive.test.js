import { expect, test, describe } from "bun:test";
import { constructPuzzle } from "./constructive.js";
import {
  PRESETS,
  buildSolverContext,
  countSolutionsCtx,
  mulberry32,
  countsByRow,
  countsByCol,
  solutionFromLengths,
} from "./generator.js";

// Across multiple presets and shape styles, every puzzle the constructive
// generator emits must be uniquely solvable. The backtracking solver is the
// trusted oracle; we run it without a node cap to avoid false "non-unique"
// reports on hard puzzles that just take a long time to fully enumerate.
function generateAndCheck(presetId, shapeStyle, count, seed) {
  const preset = PRESETS[presetId];
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i += 1) {
    const r = constructPuzzle(preset.size, shapeStyle, {
      minLength: preset.minLength,
      maxLength: preset.maxLength,
      minThermos: preset.minThermos,
      layoutAttempts: Math.max(50, Math.floor((preset.deadlineMs ?? 5000) / 50)),
      rng,
    });
    expect(r, `${presetId}/${shapeStyle} attempt ${i}`).not.toBeNull();
    const ctx = buildSolverContext(r.thermos, preset.size);
    const cnt = countSolutionsCtx(ctx, r.rowClues, r.colClues, 2, Infinity);
    expect(cnt, `${presetId}/${shapeStyle} attempt ${i}`).toBe(1);

    const sol = solutionFromLengths(preset.size, r.thermos, r.fills);
    expect(countsByRow(sol, preset.size)).toEqual(r.rowClues);
    expect(countsByCol(sol, preset.size)).toEqual(r.colClues);

    // Zero clues and full-row/col clues are aesthetically dead — a row that is
    // entirely empty or entirely filled gives the player nothing to deduce
    // from that line, and looks broken visually.
    for (const c of r.rowClues) {
      expect(c, `${presetId}/${shapeStyle} row clue`).toBeGreaterThan(0);
      expect(c, `${presetId}/${shapeStyle} row clue`).toBeLessThan(preset.size);
    }
    for (const c of r.colClues) {
      expect(c, `${presetId}/${shapeStyle} col clue`).toBeGreaterThan(0);
      expect(c, `${presetId}/${shapeStyle} col clue`).toBeLessThan(preset.size);
    }
  }
}

describe("constructive generator produces uniquely solvable puzzles", () => {
  test("tiny 4x4 curved",   () => generateAndCheck("tiny",   "curved",   5, 0xC0FFEE));
  test("easy 6x6 curved",   () => generateAndCheck("easy",   "curved",   5, 0xCAFEBABE));
  test("normal 8x8 curved", () => generateAndCheck("normal", "curved",   3, 0xDEADBEEF));
  test("hard 10x10 curved", () => generateAndCheck("hard",   "curved",   3, 0xFEEDFACE));
  test("normal 8x8 straight", () => generateAndCheck("normal", "straight", 3, 0xBADCAFE));
});
