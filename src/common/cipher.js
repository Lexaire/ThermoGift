// Cipher and checksum keyed off the solved grid. Puzzle-type-agnostic: each
// puzzle module supplies a boolean[size*size] projection of its solution
// (filled cells for thermos, tent positions for tents, etc.) and the bytes
// here are derived purely from those bits + row/col counts.

import { ALPHABET } from "./bits.js";
import { hashString } from "./util.js";

export const MAX_CODE_LENGTH = 31;

export function countsByRow(solution, size) {
  return Array.from({ length: size }, (_, row) =>
    solution.slice(row * size, row * size + size).filter(Boolean).length
  );
}

export function countsByCol(solution, size) {
  return Array.from({ length: size }, (_, col) => {
    let count = 0;
    for (let row = 0; row < size; row += 1) if (solution[row * size + col]) count += 1;
    return count;
  });
}

export function encodeCode(code, key) {
  return code.split("").map((char, index) => ALPHABET.indexOf(char) ^ (key[index] % 64));
}

export function decodeCode(cipher, key) {
  return cipher.map((value, index) => ALPHABET[value ^ (key[index] % 64)] ?? "?").join("");
}

export function solutionKey(solution, size) {
  const rows = countsByRow(solution, size).join(",");
  const cols = countsByCol(solution, size).join(",");
  const bits = solution.map((cell) => cell ? "1" : "0").join("");
  return Array.from({ length: MAX_CODE_LENGTH }, (_, index) => hashString(`${index}:${rows}:${cols}:${bits}`) % 64);
}

export function checksumFor(code, solution, size) {
  const bits = solution.map((cell) => cell ? "1" : "0").join("");
  return hashString(`check:${code}:${size}:${bits}`) & 0xffff;
}

export function solutionKeyBytes(solution, size, byteCount) {
  if (byteCount === 0) return [];
  const rows = countsByRow(solution, size).join(",");
  const cols = countsByCol(solution, size).join(",");
  const bits = solution.map((cell) => cell ? "1" : "0").join("");
  return Array.from({ length: byteCount }, (_, index) =>
    hashString(`v2:${index}:${rows}:${cols}:${bits}`) & 0xff
  );
}

export function checksumForBytes(secretBytes, solution, size) {
  const bits = solution.map((cell) => cell ? "1" : "0").join("");
  let hex = "";
  for (const b of secretBytes) hex += (b & 0xff).toString(16).padStart(2, "0");
  return hashString(`v2:check:${hex}:${size}:${bits}`) & 0xffff;
}
