export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const PRESETS = {
  tiny: { label: "Tiny 4x4", size: 4, minThermos: 5, attempts: 140, shapeStyle: "curved" },
  easy: { label: "Easy 6x6", size: 6, minThermos: 9, attempts: 180, shapeStyle: "curved" },
  normal: { label: "Normal 8x8", size: 8, minThermos: 17, attempts: 340, shapeStyle: "curved" },
  hard: { label: "Hard 10x10", size: 10, minThermos: 13, attempts: 180, fillAttempts: 12, minLength: 4, maxLength: 8, shapeStyle: "curved" },
  expert: { label: "Expert 12x12", size: 12, minThermos: 9, attempts: 180, fillAttempts: 10, minLength: 8, maxLength: 16, maxNodes: 160000, shapeStyle: "curved" },
  brutal: { label: "Brutal 15x15", size: 15, minThermos: 8, attempts: 100, fillAttempts: 6, minLength: 14, maxLength: 30, maxNodes: 50000, shapeStyle: "curved" },
};
export const SHAPE_STYLES = ["curved", "straight"];
export const MAX_CODE_LENGTH = 31;

export function buildThermometers(size, minThermos, rng, shapeStyle = "curved", config = {}) {
  if (shapeStyle === "straight") return buildStraightGridThermometers(size, rng, config);

  for (let pass = 0; pass < 80; pass += 1) {
    const unvisited = new Set(Array.from({ length: size * size }, (_, index) => index));
    const thermos = [];
    while (unvisited.size) {
      thermos.push(buildCurvedThermo(unvisited, size, rng, config));
    }
    const merged = mergeSingletons(thermos, size);
    if (merged.length >= minThermos && merged.every((thermo) => thermo.length >= 2 && thermo.length <= (config.maxLength ?? 6))) return merged;
  }
  throw new Error("Could not draw thermometers");
}

function buildCurvedThermo(unvisited, size, rng, config = {}) {
  const start = pick(Array.from(unvisited), rng);
  const path = [start];
  unvisited.delete(start);
  const minLength = config.minLength ?? 2;
  const maxLength = config.maxLength ?? 5;
  const targetLength = minLength + Math.floor(rng() * (maxLength - minLength + 1));
  while (path.length < targetLength) {
    const current = path.at(-1);
    let next;
    // 70% chance to keep going in the previous direction (reduces zigzag).
    if (path.length >= 2 && rng() < 0.7) {
      const dir = directionBetween(path[path.length - 2], current, size);
      const ahead = applyDir(current, dir, size);
      if (ahead >= 0 && unvisited.has(ahead)) next = ahead;
    }
    if (next === undefined) {
      next = shuffled(neighbors(current, size), rng).find((cell) => unvisited.has(cell));
    }
    if (next === undefined) break;
    path.push(next);
    unvisited.delete(next);
  }
  return path;
}

function buildStraightGridThermometers(size, rng, config = {}) {
  const minLength = 2;
  const maxLength = Math.max(minLength, Math.min(config.maxLength ?? 7, size));

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = tryStraightMixed(size, minLength, maxLength, rng);
    if (result) return shuffled(result, rng);
  }
  throw new Error("Could not draw straight thermometers");
}

function tryStraightMixed(size, minLength, maxLength, rng) {
  const claimed = new Array(size * size).fill(false);
  const thermos = [];
  let hCells = 0;
  let vCells = 0;

  while (true) {
    const unclaimed = [];
    for (let i = 0; i < claimed.length; i += 1) if (!claimed[i]) unclaimed.push(i);
    if (unclaimed.length === 0) break;

    let preferH = hCells === vCells ? rng() < 0.5 : hCells < vCells;
    if (rng() < 0.25) preferH = !preferH;
    const order = preferH ? ["h", "v"] : ["v", "h"];

    let placed = null;
    for (const start of shuffled(unclaimed, rng)) {
      for (const orient of order) {
        placed = tryPlaceLine(start, orient, claimed, size, minLength, maxLength, rng);
        if (placed) break;
      }
      if (placed) break;
    }
    if (!placed) return null;

    placed.cells.forEach((c) => { claimed[c] = true; });
    if (placed.orient === "h") hCells += placed.cells.length;
    else vCells += placed.cells.length;
    thermos.push(rng() < 0.5 ? placed.cells : [...placed.cells].reverse());
  }

  return thermos;
}

function tryPlaceLine(start, orient, claimed, size, minLength, maxLength, rng) {
  const startRow = Math.floor(start / size);
  const startCol = start % size;
  const isH = orient === "h";

  const stepCell = (delta) => {
    if (isH) {
      const c = startCol + delta;
      if (c < 0 || c >= size) return -1;
      return startRow * size + c;
    }
    const r = startRow + delta;
    if (r < 0 || r >= size) return -1;
    return r * size + startCol;
  };

  let leftMax = 0;
  while (true) {
    const cell = stepCell(-(leftMax + 1));
    if (cell < 0 || claimed[cell]) break;
    leftMax += 1;
  }
  let rightMax = 0;
  while (true) {
    const cell = stepCell(rightMax + 1);
    if (cell < 0 || claimed[cell]) break;
    rightMax += 1;
  }

  const totalAvail = leftMax + 1 + rightMax;
  if (totalAvail < minLength) return null;

  const cap = Math.min(maxLength, totalAvail);
  const all = [];
  const safe = [];
  for (let length = minLength; length <= cap; length += 1) {
    const remaining = length - 1;
    const minLeft = Math.max(0, remaining - rightMax);
    const maxLeft = Math.min(leftMax, remaining);
    for (let left = minLeft; left <= maxLeft; left += 1) {
      const choice = { length, left };
      all.push(choice);
      const leftStrand = leftMax - left;
      const rightStrand = rightMax - (remaining - left);
      if ((leftStrand === 0 || leftStrand >= minLength) && (rightStrand === 0 || rightStrand >= minLength)) {
        safe.push(choice);
      }
    }
  }
  const pool = safe.length > 0 ? safe : all;
  // Larger boards need fewer (longer) thermos for solver uniqueness to be reachable;
  // smaller boards stay uniform for visual variety.
  const lengthBias = size <= 8 ? 1 : size <= 10 ? 1 : size <= 12 ? 1.2 : 1.7;
  let chosen;
  if (lengthBias === 1) {
    chosen = pool[Math.floor(rng() * pool.length)];
  } else {
    const weights = pool.map((c) => Math.pow(lengthBias, c.length - minLength));
    const total = weights.reduce((a, b) => a + b, 0);
    let pick = rng() * total;
    chosen = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i += 1) {
      pick -= weights[i];
      if (pick <= 0) { chosen = pool[i]; break; }
    }
  }

  const cells = [];
  for (let i = chosen.left; i >= 1; i -= 1) cells.push(stepCell(-i));
  cells.push(start);
  for (let i = 1; i <= chosen.length - 1 - chosen.left; i += 1) cells.push(stepCell(i));
  return { cells, orient };
}

function mergeSingletons(thermos, size) {
  const result = thermos.map((thermo) => [...thermo]);

  while (true) {
    const singletonIdx = result.findIndex((thermo) => thermo.length === 1);
    if (singletonIdx < 0) return result;
    if (!absorbSingleton(result, singletonIdx, size)) return result;
  }
}

function absorbSingleton(result, singletonIdx, size) {
  const cell = result[singletonIdx][0];
  const adj = neighbors(cell, size);

  for (let tIdx = 0; tIdx < result.length; tIdx += 1) {
    if (tIdx === singletonIdx) continue;
    const thermo = result[tIdx];
    if (thermo.length < 2) continue;
    if (adj.includes(thermo[0])) {
      result[tIdx] = [cell, ...thermo];
      result.splice(singletonIdx, 1);
      return true;
    }
    if (adj.includes(thermo.at(-1))) {
      result[tIdx] = [...thermo, cell];
      result.splice(singletonIdx, 1);
      return true;
    }
  }

  for (let tIdx = 0; tIdx < result.length; tIdx += 1) {
    if (tIdx === singletonIdx || result[tIdx].length !== 1) continue;
    if (adj.includes(result[tIdx][0])) {
      result[tIdx] = [result[tIdx][0], cell];
      result.splice(singletonIdx, 1);
      return true;
    }
  }

  for (let tIdx = 0; tIdx < result.length; tIdx += 1) {
    if (tIdx === singletonIdx) continue;
    const thermo = result[tIdx];
    for (let p = 1; p < thermo.length - 1; p += 1) {
      if (!adj.includes(thermo[p])) continue;
      if (p >= 2) {
        const prefix = thermo.slice(0, p);
        const suffix = [cell, ...thermo.slice(p)];
        result[tIdx] = prefix;
        result[singletonIdx] = suffix;
        return true;
      }
      if (p <= thermo.length - 3) {
        const head = [cell, ...thermo.slice(0, p + 1).reverse()];
        const tail = thermo.slice(p + 1);
        result[tIdx] = tail;
        result[singletonIdx] = head;
        return true;
      }
    }
  }

  return false;
}

export function generateFillLengths(thermos, rng) {
  return thermos.map((thermo) => {
    if (thermo.length <= 1) return Math.floor(rng() * 2);
    const inner = 1 + Math.floor(rng() * (thermo.length - 1));
    if (rng() < 0.45) return 0;
    if (rng() < 0.45) return thermo.length;
    return inner;
  });
}

export function solutionFromLengths(size, thermos, fillLengths) {
  const filled = new Set();
  thermos.forEach((thermo, thermoIndex) => {
    for (let i = 0; i < fillLengths[thermoIndex]; i += 1) filled.add(thermo[i]);
  });
  return Array.from({ length: size * size }, (_, index) => filled.has(index));
}

export function isUsableClueSet(rowClues, colClues, size) {
  const all = [...rowClues, ...colClues];
  if (all.some((clue) => clue === 0 || clue === size)) return false;
  const total = rowClues.reduce((sum, clue) => sum + clue, 0);
  return total > size * 1.5 && total < size * (size - 1.5);
}

// Precomputes everything `countSolutions` needs that depends only on thermos+size,
// so multiple fill attempts against the same layout can reuse it.
export function buildSolverContext(thermos, size) {
  const rowRemainingInit = new Int32Array(size);
  const colRemainingInit = new Int32Array(size);
  const cellRows = thermos.map((thermo) => thermo.map((cell) => Math.floor(cell / size)));
  const cellCols = thermos.map((thermo) => thermo.map((cell) => cell % size));
  cellRows.forEach((rows, tIdx) => {
    rows.forEach((row) => { rowRemainingInit[row] += 1; });
    cellCols[tIdx].forEach((col) => { colRemainingInit[col] += 1; });
  });
  // options[tIdx][fill] = array of cell indices into thermos[tIdx] for that prefix.
  // We index *positions* (0..L-1) so the search uses cellRows[tIdx][p] / cellCols[tIdx][p].
  const optionPositions = thermos.map((thermo) => Array.from({ length: thermo.length + 1 }, (_, fill) => fill));
  const order = thermos.map((_, index) => index).sort((a, b) => thermos[b].length - thermos[a].length);
  return { size, thermos, cellRows, cellCols, optionPositions, order, rowRemainingInit, colRemainingInit };
}

export function countSolutionsCtx(ctx, rowClues, colClues, limit, maxNodes = 120000) {
  const { size, cellRows, cellCols, optionPositions, order, rowRemainingInit, colRemainingInit } = ctx;
  const rowCounts = new Int32Array(size);
  const colCounts = new Int32Array(size);
  const rowRemaining = new Int32Array(rowRemainingInit);
  const colRemaining = new Int32Array(colRemainingInit);
  let found = 0;
  let nodes = 0;

  function search(depth) {
    if (found >= limit) return;
    nodes += 1;
    if (nodes > maxNodes) {
      found = limit;
      return;
    }
    if (depth === order.length) {
      let ok = true;
      for (let i = 0; i < size; i += 1) {
        if (rowCounts[i] !== rowClues[i] || colCounts[i] !== colClues[i]) { ok = false; break; }
      }
      if (ok) found += 1;
      return;
    }

    const thermoIndex = order[depth];
    const rows = cellRows[thermoIndex];
    const cols = cellCols[thermoIndex];
    for (let p = 0; p < rows.length; p += 1) {
      rowRemaining[rows[p]] -= 1;
      colRemaining[cols[p]] -= 1;
    }

    const fillCount = optionPositions[thermoIndex].length;
    let prevFill = 0;
    for (let fillIdx = 0; fillIdx < fillCount; fillIdx += 1) {
      const fill = optionPositions[thermoIndex][fillIdx];
      for (let p = prevFill; p < fill; p += 1) {
        rowCounts[rows[p]] += 1;
        colCounts[cols[p]] += 1;
      }
      prevFill = fill;

      let possible = true;
      for (let i = 0; i < size; i += 1) {
        const rc = rowCounts[i];
        const cc = colCounts[i];
        if (rc > rowClues[i] || rc + rowRemaining[i] < rowClues[i] ||
            cc > colClues[i] || cc + colRemaining[i] < colClues[i]) { possible = false; break; }
      }
      if (possible) search(depth + 1);
    }
    // Unwind the fill we accumulated through fillIdx loop
    for (let p = 0; p < prevFill; p += 1) {
      rowCounts[rows[p]] -= 1;
      colCounts[cols[p]] -= 1;
    }

    for (let p = 0; p < rows.length; p += 1) {
      rowRemaining[rows[p]] += 1;
      colRemaining[cols[p]] += 1;
    }
  }

  search(0);
  return found;
}

export function countSolutions(thermos, rowClues, colClues, size, limit, maxNodes = 120000) {
  return countSolutionsCtx(buildSolverContext(thermos, size), rowClues, colClues, limit, maxNodes);
}

export function countsByRow(solution, size) {
  return Array.from({ length: size }, (_, row) => solution.slice(row * size, row * size + size).filter(Boolean).length);
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

// Encodes a complete puzzle into a URL id by walking cells row-major and
// emitting per-cell bits for thermo membership/path direction. The puzzle is
// fully self-contained — no deterministic generator is needed at decode time.
export function encodeId(payload) {
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

export function decodeId(id) {
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
  };
}

function bitsForRange(maxValue) {
  return Math.max(1, Math.ceil(Math.log2(maxValue + 1)));
}

function directionBetween(from, to, size) {
  const dRow = Math.floor(to / size) - Math.floor(from / size);
  const dCol = (to % size) - (from % size);
  if (dRow === -1 && dCol === 0) return 0;
  if (dRow === 0 && dCol === 1) return 1;
  if (dRow === 1 && dCol === 0) return 2;
  if (dRow === 0 && dCol === -1) return 3;
  throw new Error("Cells not orthogonally adjacent");
}

function applyDir(cell, dir, size) {
  const row = Math.floor(cell / size);
  const col = cell % size;
  if (dir === 0 && row > 0) return cell - size;
  if (dir === 1 && col < size - 1) return cell + 1;
  if (dir === 2 && row < size - 1) return cell + size;
  if (dir === 3 && col > 0) return cell - 1;
  return -1;
}

function writeBits(value, length) {
  return (value >>> 0).toString(2).padStart(length, "0").slice(-length);
}

function bitsToId(bits) {
  let padded = bits;
  while (padded.length % 6) padded += "0";
  return padded.match(/.{6}/g).map((chunk) => ID_ALPHABET[parseInt(chunk, 2)]).join("");
}

function idToBits(id) {
  return id.split("").map((char) => {
    const value = ID_ALPHABET.indexOf(char);
    if (value < 0) throw new Error("Bad id character");
    return value.toString(2).padStart(6, "0");
  }).join("");
}

export function neighbors(cell, size) {
  const row = Math.floor(cell / size);
  const col = cell % size;
  return [
    row > 0 ? cell - size : null,
    col < size - 1 ? cell + 1 : null,
    row < size - 1 ? cell + size : null,
    col > 0 ? cell - 1 : null,
  ].filter((value) => value !== null);
}

function pick(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function shuffled(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
