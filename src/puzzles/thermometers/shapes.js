// Layout builders for thermometer paths on a row-major grid. Both the curved
// (random-walk) and straight (axis-aligned) variants emit thermos as cell-index
// arrays from bulb to tip.

import { neighbors, directionBetween, applyDir, pick, shuffled } from "../../common/util.js";

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
