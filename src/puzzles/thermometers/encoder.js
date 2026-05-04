// Thermometer-specific URL encoding. Owns t1 (legacy, all-in-one) and the
// variant=0 body inside the t2 envelope (per-cell bulb flag + 2-bit direction
// for non-bulb cells, then row/col clues).

import { applyDir, bitsForRange, directionBetween } from "../../common/util.js";
import { ID_ALPHABET, bitsToId, idToBits, writeBits } from "../../common/bits.js";
import { encodeT2Envelope } from "../../common/t2-envelope.js";
import { MAX_CODE_LENGTH, countsByRow, countsByCol } from "../../common/cipher.js";
import { SHAPE_STYLES } from "./presets.js";
import { solutionFromLengths } from "./solver.js";

export const T2_VARIANT = 0;

// === t1 format (legacy, thermometer-only) ===
// Encodes a complete puzzle into a URL id by walking cells row-major and
// emitting per-cell bits for thermo membership/path direction. The puzzle is
// fully self-contained — no deterministic generator is needed at decode time.
export function encodeT1(payload) {
  const { z: size, y: shapeStyle, thermos, fillLengths, c: cipher, k: checksum } = payload;
  const cellInfo = new Map();
  thermos.forEach((thermo, tIdx) => {
    thermo.forEach((cell, pos) => cellInfo.set(cell, { tIdx, pos }));
  });

  let bits = "";
  bits += writeBits(size, 5);
  bits += writeBits(SHAPE_STYLES.indexOf(shapeStyle), 2);

  const bulbOrder = [];
  for (let cell = 0; cell < size * size; cell += 1) {
    const info = cellInfo.get(cell);
    if (!info) throw new Error(`Cell ${cell} not in any thermo`);
    if (info.pos === 0) {
      bits += "0";
      bulbOrder.push(info.tIdx);
    } else {
      bits += "1";
      const predecessor = thermos[info.tIdx][info.pos - 1];
      bits += writeBits(directionBetween(cell, predecessor, size), 2);
    }
  }
  for (const tIdx of bulbOrder) {
    bits += writeBits(fillLengths[tIdx], bitsForRange(thermos[tIdx].length));
  }
  bits += writeBits(cipher.length, 5);
  for (const v of cipher) bits += writeBits(v, 6);
  bits += writeBits(checksum, 16);
  return `t1-${bitsToId(bits)}`;
}

export function decodeT1(id) {
  if (!id.startsWith("t1-")) throw new Error("Bad id");
  const bits = idToBits(id.slice(3));
  let cursor = 0;
  const read = (length) => {
    if (cursor + length > bits.length) throw new Error("Truncated id");
    const value = parseInt(bits.slice(cursor, cursor + length), 2);
    cursor += length;
    return value;
  };

  const size = read(5);
  if (size < 4 || size > 31) throw new Error("Bad size");
  const shapeStyle = SHAPE_STYLES[read(2)];
  if (!shapeStyle) throw new Error("Bad shape style");

  const flags = [];
  for (let cell = 0; cell < size * size; cell += 1) {
    const f = read(1);
    if (f === 0) flags.push({ bulb: true });
    else flags.push({ bulb: false, dir: read(2) });
  }

  const thermos = thermosFromFlags(flags, size);

  const fillLengths = thermos.map((thermo) => read(bitsForRange(thermo.length)));
  const codeLength = read(5);
  if (codeLength < 1 || codeLength > MAX_CODE_LENGTH) throw new Error("Bad code length");
  const cipher = Array.from({ length: codeLength }, () => read(6));
  const checksum = read(16);

  const solution = solutionFromLengths(size, thermos, fillLengths);
  return {
    size,
    shapeStyle,
    thermos,
    fillLengths,
    solution,
    rowClues: countsByRow(solution, size),
    colClues: countsByCol(solution, size),
    cipher,
    checksum,
    format: "t1",
  };
}

// === t2 variant=0 body (thermometers) ===
// Body layout (reads after envelope's variant byte, before envelope's cipher):
//   per cell:    1-bit bulb flag, 2-bit dir if !bulb
//   minor 0:     per thermo: varint fillLength    (legacy, leaks solution)
//   minor 1:     per row clue (clueBits each), per col clue (clueBits each)

export const t2Variant = {
  decodeBody(reader, { size, shapeIdx, minor }) {
    const shapeStyle = SHAPE_STYLES[shapeIdx];
    if (!shapeStyle) throw new Error("Bad shape style");

    const flags = [];
    for (let cell = 0; cell < size * size; cell += 1) {
      const f = reader.readFixed(1);
      flags.push(f === 0 ? { bulb: true } : { bulb: false, dir: reader.readFixed(2) });
    }
    const thermos = thermosFromFlags(flags, size);

    let rowClues;
    let colClues;
    let legacySolution;
    let legacyFillLengths;
    if (minor === 0) {
      legacyFillLengths = thermos.map((thermo) => {
        const value = reader.readVarint();
        if (value > thermo.length) throw new Error("Bad fillLength");
        return value;
      });
      legacySolution = solutionFromLengths(size, thermos, legacyFillLengths);
      rowClues = countsByRow(legacySolution, size);
      colClues = countsByCol(legacySolution, size);
    } else {
      const clueBits = bitsForRange(size);
      rowClues = Array.from({ length: size }, () => reader.readFixed(clueBits));
      colClues = Array.from({ length: size }, () => reader.readFixed(clueBits));
      for (const clue of [...rowClues, ...colClues]) {
        if (clue > size) throw new Error("Bad clue value");
      }
    }

    return {
      shapeStyle,
      thermos,
      rowClues,
      colClues,
      ...(legacySolution ? { solution: legacySolution, fillLengths: legacyFillLengths } : {}),
    };
  },
};

export function encodeT2({ puzzle, cipherBytes, checksum }) {
  const { size, shapeStyle, thermos, rowClues, colClues } = puzzle;
  const shapeIdx = SHAPE_STYLES.indexOf(shapeStyle);
  if (shapeIdx < 0) throw new Error("Bad shape style");
  if (rowClues.length !== size || colClues.length !== size) throw new Error("Bad clue length");

  const cellInfo = new Map();
  thermos.forEach((thermo, tIdx) => {
    thermo.forEach((cell, pos) => cellInfo.set(cell, { tIdx, pos }));
  });

  return encodeT2Envelope({
    size,
    shapeIdx,
    variant: T2_VARIANT,
    writeBody(w) {
      for (let cell = 0; cell < size * size; cell += 1) {
        const info = cellInfo.get(cell);
        if (!info) throw new Error(`Cell ${cell} not in any thermo`);
        if (info.pos === 0) {
          w.writeFixed(0, 1);
        } else {
          w.writeFixed(1, 1);
          const predecessor = thermos[info.tIdx][info.pos - 1];
          w.writeFixed(directionBetween(cell, predecessor, size), 2);
        }
      }
      const clueBits = bitsForRange(size);
      for (const clue of rowClues) w.writeFixed(clue, clueBits);
      for (const clue of colClues) w.writeFixed(clue, clueBits);
    },
    cipherBytes,
    checksum,
  });
}

function thermosFromFlags(flags, size) {
  const nextMap = new Map();
  for (let cell = 0; cell < size * size; cell += 1) {
    if (flags[cell].bulb) continue;
    const pred = applyDir(cell, flags[cell].dir, size);
    if (pred < 0) throw new Error("Bad direction");
    if (nextMap.has(pred)) throw new Error("Branching path");
    nextMap.set(pred, cell);
  }

  const thermos = [];
  for (let cell = 0; cell < size * size; cell += 1) {
    if (!flags[cell].bulb) continue;
    const path = [cell];
    let next = nextMap.get(cell);
    while (next !== undefined) {
      path.push(next);
      next = nextMap.get(next);
    }
    if (path.length < 2) throw new Error("Length-1 thermo");
    thermos.push(path);
  }
  return thermos;
}
