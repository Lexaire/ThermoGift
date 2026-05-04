// Thermometer-specific solver and clue helpers. The backtracking solver here
// is the trusted oracle for uniqueness — countSolutionsCtx returns how many
// distinct fill assignments satisfy the row/col clues for a given thermo
// layout, capped at `limit`.

import { countsByRow, countsByCol } from "../../common/cipher.js";

export { countsByRow, countsByCol };

export function solutionFromLengths(size, thermos, fillLengths) {
  const filled = new Set();
  thermos.forEach((thermo, thermoIndex) => {
    for (let i = 0; i < fillLengths[thermoIndex]; i += 1) filled.add(thermo[i]);
  });
  return Array.from({ length: size * size }, (_, index) => filled.has(index));
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
        const rr = rowRemaining[i];
        const cr = colRemaining[i];
        if (rc > rowClues[i] || rc + rr < rowClues[i] ||
            cc > colClues[i] || cc + cr < colClues[i]) { possible = false; break; }
        // Exact checks: when all cells in a row/col are assigned, it must match the clue
        if (rr === 0 && rc !== rowClues[i]) { possible = false; break; }
        if (cr === 0 && cc !== colClues[i]) { possible = false; break; }
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
