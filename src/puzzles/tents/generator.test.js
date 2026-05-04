import { expect, test, describe } from "bun:test";
import { mulberry32 } from "../../common/util.js";
import { constructTentsPuzzle } from "./generator.js";
import { PRESETS } from "./presets.js";
import {
  countTentSolutions,
  findFirstValidTentPlacement,
  isBCDeducible,
  rulesSatisfied,
} from "./solver.js";
import { encodeT2, t2Variant } from "./encoder.js";
import { decodeT2Envelope } from "../../common/t2-envelope.js";

function generateAndCheck(presetId, count, seed) {
  const preset = PRESETS[presetId];
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i += 1) {
    const puzzle = constructTentsPuzzle(preset, { rng });
    expect(puzzle, `${presetId} attempt ${i}`).not.toBeNull();

    expect(
      rulesSatisfied(puzzle.trees, puzzle.tents, puzzle.rowClues, puzzle.colClues, puzzle.size),
      `${presetId} attempt ${i} rules`
    ).toBe(true);

    expect(
      countTentSolutions(puzzle.trees, puzzle.rowClues, puzzle.colClues, puzzle.size, 2),
      `${presetId} attempt ${i} unique`
    ).toBe(1);

    expect(
      isBCDeducible(puzzle.trees, puzzle.tents, puzzle.rowClues, puzzle.colClues, puzzle.size),
      `${presetId} attempt ${i} no-guess`
    ).toBe(true);
  }
}

describe("tents generator produces uniquely solvable puzzles", () => {
  test("5x5", () => generateAndCheck("5x5", 5, 0xC0FFEE));
  test("6x6", () => generateAndCheck("6x6", 5, 0xCAFEBABE));
  test("8x8", () => generateAndCheck("8x8", 3, 0xDEADBEEF));
  test("10x10", () => generateAndCheck("10x10", 3, 0xFEEDFACE));
  test("15x15", () => generateAndCheck("15x15", 2, 0xBADCAFE));
});

test("encode + decode round-trips", () => {
  const puzzle = constructTentsPuzzle(PRESETS["5x5"], { rng: mulberry32(7) });
  expect(puzzle).not.toBeNull();

  const id = encodeT2({ puzzle, cipherBytes: [], checksum: 0 });
  const VARIANT_HANDLERS = { 1: t2Variant };
  const decoded = decodeT2Envelope(id, VARIANT_HANDLERS);

  expect(decoded.size).toBe(puzzle.size);

  const decodedTrees = decoded.body.trees;
  expect(decodedTrees.size).toBe(puzzle.trees.size);
  for (const t of puzzle.trees) {
    expect(decodedTrees.has(t)).toBe(true);
  }

  expect(decoded.body.rowClues).toEqual(puzzle.rowClues);
  expect(decoded.body.colClues).toEqual(puzzle.colClues);
});

describe("solver unit tests", () => {
  test("findFirstValidTentPlacement returns a placement when one exists", () => {
    const cornerTrees = new Set([0, 3, 12, 15]);
    const result = findFirstValidTentPlacement(cornerTrees, 4);
    expect(result).not.toBeNull();
    expect(result.size).toBe(cornerTrees.size);
  });

  test("findFirstValidTentPlacement returns null for no valid placement", () => {
    const allTrees = new Set([0, 1, 2, 3]);
    const result = findFirstValidTentPlacement(allTrees, 2);
    expect(result).toBeNull();
  });

  test("rulesSatisfied rejects tent on tree", () => {
    const trees = new Set([0]);
    const tents = new Set([0]);
    expect(rulesSatisfied(trees, tents, [0], [1], 2)).toBe(false);
  });

  test("rulesSatisfied rejects adjacent tents", () => {
    const trees = new Set([0, 3]);
    const tents = new Set([1, 2]);
    expect(rulesSatisfied(trees, tents, [2, 0], [0, 2], 2)).toBe(false);
  });
});
