import { expect, test, describe } from "bun:test";
import {
  decodeId,
  decodeIdV2,
  encodeIdV2,
  decodeCode,
  solutionKey,
  solutionKeyBytes,
  checksumFor,
  checksumForBytes,
  countsByRow,
  countsByCol,
  solutionFromLengths,
} from "./generator.js";

// Each fixture pins a synthetic golden URL plus everything needed to prove the
// renderer would draw the right puzzle and the decoder would reveal the right
// secret. If any of these break, a previously-shared link of that vintage has
// silently stopped working.
//
// All goldens use a fixed 4x4 layout and obviously-fake plaintexts ("golden-
// fixture-*", "GoldenT1") so we never commit a real user's secret.

const FOUR_BY_FOUR_THERMOS = [[0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15]];
const FOUR_BY_FOUR_FILLS = [2, 3, 1, 4];
const FOUR_BY_FOUR_SOLUTION = solutionFromLengths(4, FOUR_BY_FOUR_THERMOS, FOUR_BY_FOUR_FILLS);
const FOUR_BY_FOUR_ROW_CLUES = [4, 3, 2, 1];
const FOUR_BY_FOUR_COL_CLUES = [2, 3, 1, 4];

// Curved layout — every thermo bends, and the three paths between them exercise
// all four direction bits (up/right/down/left). Catches regressions in the
// per-cell direction encoding that the straight-column fixture can't see.
//
// Original encode order has bulbs at cells [12, 3, 5]. The decoder always
// re-emits thermos in row-major bulb order, so decoded order is [3, 5, 12].
const CURVED_THERMOS_DECODED = [
  [3, 7, 11, 15, 14, 13],
  [5, 6, 10, 9],
  [12, 8, 4, 0, 1, 2],
];
const CURVED_FILLS_DECODED = [3, 2, 4];
const CURVED_SOLUTION = solutionFromLengths(4, CURVED_THERMOS_DECODED, CURVED_FILLS_DECODED);
const CURVED_ROW_CLUES = [2, 4, 2, 1];
const CURVED_COL_CLUES = [4, 1, 1, 3];

describe("t1 (legacy V1) URL", () => {
  const id = "t1-IBJJJJJImYhMw7_8eRtT9Q";
  const plaintext = "GoldenT1";

  test("decodes to the expected layout and clues", () => {
    const decoded = decodeId(id);
    expect(decoded.size).toBe(4);
    expect(decoded.shapeStyle).toBe("curved");
    expect(decoded.thermos).toEqual(FOUR_BY_FOUR_THERMOS);
    expect(decoded.rowClues).toEqual(FOUR_BY_FOUR_ROW_CLUES);
    expect(decoded.colClues).toEqual(FOUR_BY_FOUR_COL_CLUES);
    expect(decoded.solution).toEqual(FOUR_BY_FOUR_SOLUTION);
  });

  test("recovers the embedded plaintext using the solved grid", () => {
    const decoded = decodeId(id);
    const recovered = decodeCode(decoded.cipher, solutionKey(decoded.solution, decoded.size));
    expect(recovered).toBe(plaintext);
    expect(checksumFor(plaintext, decoded.solution, decoded.size)).toBe(decoded.checksum);
  });

  test("decodes a curved layout that exercises all four direction bits", () => {
    const curvedId = "t1-Ib9nmsi2NRCWYICQkrx31A";
    const curvedPlain = "CurvedT1";
    const decoded = decodeId(curvedId);
    expect(decoded.thermos).toEqual(CURVED_THERMOS_DECODED);
    expect(decoded.rowClues).toEqual(CURVED_ROW_CLUES);
    expect(decoded.colClues).toEqual(CURVED_COL_CLUES);
    expect(decoded.solution).toEqual(CURVED_SOLUTION);
    const recovered = decodeCode(decoded.cipher, solutionKey(decoded.solution, decoded.size));
    expect(recovered).toBe(curvedPlain);
  });
});

describe("t2 v0 (legacy URL with embedded fillLengths)", () => {
  const id = "t2-AgABJJJJJIIYSQjjB82lWCVjIlggIgImMUyJ4UAmA";
  const plaintext = "golden-fixture-v0";

  test("decodes layout and exposes legacy solution for back-compat", () => {
    const decoded = decodeIdV2(id);
    expect(decoded.size).toBe(4);
    expect(decoded.shapeStyle).toBe("curved");
    expect(decoded.thermos).toEqual(FOUR_BY_FOUR_THERMOS);
    expect(decoded.rowClues).toEqual(FOUR_BY_FOUR_ROW_CLUES);
    expect(decoded.colClues).toEqual(FOUR_BY_FOUR_COL_CLUES);
    expect(decoded.solution).toEqual(FOUR_BY_FOUR_SOLUTION);
    expect(decoded.fillLengths).toEqual(FOUR_BY_FOUR_FILLS);
    expect(countsByRow(decoded.solution, decoded.size)).toEqual(FOUR_BY_FOUR_ROW_CLUES);
    expect(countsByCol(decoded.solution, decoded.size)).toEqual(FOUR_BY_FOUR_COL_CLUES);
  });

  test("recovers the embedded plaintext using the legacy solution", () => {
    const decoded = decodeIdV2(id);
    const key = solutionKeyBytes(decoded.solution, decoded.size, decoded.cipherBytes.length);
    const plain = new Uint8Array(decoded.cipherBytes.map((b, i) => b ^ key[i]));
    expect(new TextDecoder().decode(plain)).toBe(plaintext);
    expect(checksumForBytes(plain, decoded.solution, decoded.size)).toBe(decoded.checksum);
  });

  test("decodes a curved layout that exercises all four direction bits", () => {
    const curvedId = "t2-AgAb9nmsi2DESEW_sxJ21eQeJLUkdaYkjAFZP8skA";
    const curvedPlain = "curved-fixture-v0";
    const decoded = decodeIdV2(curvedId);
    expect(decoded.thermos).toEqual(CURVED_THERMOS_DECODED);
    expect(decoded.fillLengths).toEqual(CURVED_FILLS_DECODED);
    expect(decoded.rowClues).toEqual(CURVED_ROW_CLUES);
    expect(decoded.colClues).toEqual(CURVED_COL_CLUES);
    expect(decoded.solution).toEqual(CURVED_SOLUTION);
    const key = solutionKeyBytes(decoded.solution, decoded.size, decoded.cipherBytes.length);
    const plain = new Uint8Array(decoded.cipherBytes.map((b, i) => b ^ key[i]));
    expect(new TextDecoder().decode(plain)).toBe(curvedPlain);
  });
});

describe("t2 v1 (current format, clues only)", () => {
  const id = "t2-EgABJJJJJJGimZCOMHzaVYJWMiWCAiAiYxTInhyWiA";
  const plaintext = "golden-fixture-v1";

  test("decodes layout and clues without leaking the solution", () => {
    const decoded = decodeIdV2(id);
    expect(decoded.size).toBe(4);
    expect(decoded.shapeStyle).toBe("curved");
    expect(decoded.thermos).toEqual(FOUR_BY_FOUR_THERMOS);
    expect(decoded.rowClues).toEqual(FOUR_BY_FOUR_ROW_CLUES);
    expect(decoded.colClues).toEqual(FOUR_BY_FOUR_COL_CLUES);
    expect(decoded.solution).toBeUndefined();
    expect(decoded.fillLengths).toBeUndefined();
  });

  test("recovers the embedded plaintext when the solver supplies the grid", () => {
    const decoded = decodeIdV2(id);
    const key = solutionKeyBytes(FOUR_BY_FOUR_SOLUTION, decoded.size, decoded.cipherBytes.length);
    const plain = new Uint8Array(decoded.cipherBytes.map((b, i) => b ^ key[i]));
    expect(new TextDecoder().decode(plain)).toBe(plaintext);
    expect(checksumForBytes(plain, FOUR_BY_FOUR_SOLUTION, decoded.size)).toBe(decoded.checksum);
  });

  test("re-encoding the decoded payload (with the known solution) reproduces the same id", () => {
    const decoded = decodeIdV2(id);
    const secretBytes = new TextEncoder().encode(plaintext);
    const key = solutionKeyBytes(FOUR_BY_FOUR_SOLUTION, decoded.size, secretBytes.length);
    const cipherBytes = Array.from(secretBytes, (b, i) => b ^ key[i]);
    const checksum = checksumForBytes(secretBytes, FOUR_BY_FOUR_SOLUTION, decoded.size);
    const reencoded = encodeIdV2({
      size: decoded.size,
      shapeStyle: decoded.shapeStyle,
      thermos: decoded.thermos,
      rowClues: decoded.rowClues,
      colClues: decoded.colClues,
      cipherBytes,
      checksum,
    });
    expect(reencoded).toBe(id);
  });

  test("decodes a curved layout that exercises all four direction bits", () => {
    const curvedId = "t2-EgAb9nmsi2KIwlwi39mJO2ryDxJakjrTEkYArJ19AA";
    const curvedPlain = "curved-fixture-v1";
    const decoded = decodeIdV2(curvedId);
    expect(decoded.thermos).toEqual(CURVED_THERMOS_DECODED);
    expect(decoded.rowClues).toEqual(CURVED_ROW_CLUES);
    expect(decoded.colClues).toEqual(CURVED_COL_CLUES);
    expect(decoded.solution).toBeUndefined();
    const key = solutionKeyBytes(CURVED_SOLUTION, decoded.size, decoded.cipherBytes.length);
    const plain = new Uint8Array(decoded.cipherBytes.map((b, i) => b ^ key[i]));
    expect(new TextDecoder().decode(plain)).toBe(curvedPlain);
  });
});
