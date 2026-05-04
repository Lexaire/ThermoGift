import { bitsForRange } from "../../common/util.js";
import { encodeT2Envelope } from "../../common/t2-envelope.js";
import { SHAPE_STYLES } from "./presets.js";

export const T2_VARIANT = 1;

export const t2Variant = {
  decodeBody(reader, { size }) {
    const trees = new Set();
    for (let cell = 0; cell < size * size; cell++) {
      if (reader.readFixed(1)) trees.add(cell);
    }

    const clueBits = bitsForRange(size);
    const rowClues = Array.from({ length: size }, () => reader.readFixed(clueBits));
    const colClues = Array.from({ length: size }, () => reader.readFixed(clueBits));

    for (const clue of [...rowClues, ...colClues]) {
      if (clue > size) throw new Error("Bad clue value");
    }

    return { trees, rowClues, colClues };
  },
};

export function encodeT2({ puzzle, cipherBytes, checksum }) {
  const { size, trees, rowClues, colClues } = puzzle;
  if (rowClues.length !== size || colClues.length !== size) throw new Error("Bad clue length");

  return encodeT2Envelope({
    size,
    shapeIdx: 0,
    variant: T2_VARIANT,
    writeBody(w) {
      for (let cell = 0; cell < size * size; cell++) {
        w.writeFixed(trees.has(cell) ? 1 : 0, 1);
      }
      const clueBits = bitsForRange(size);
      for (const clue of rowClues) w.writeFixed(clue, clueBits);
      for (const clue of colClues) w.writeFixed(clue, clueBits);
    },
    cipherBytes,
    checksum,
  });
}
