import { neighbors } from "../../common/util.js";

function orthogonalNeighbors(cell, size) {
  return neighbors(cell, size);
}

function neighbors8(cell, size) {
  const row = Math.floor(cell / size);
  const col = cell % size;
  const result = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
        result.push(nr * size + nc);
      }
    }
  }
  return result;
}

function is8AdjacentToAny(cell, set, size) {
  const row = Math.floor(cell / size);
  const col = cell % size;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && set.has(nr * size + nc)) {
        return true;
      }
    }
  }
  return false;
}

// Build per-attempt context once: tree index, empty orthogonal candidates,
// and 8-neighborhood lists as flat int arrays for fast iteration.
function buildSearchContext(trees, size) {
  const N = size * size;
  const treeMask = new Uint8Array(N);
  const treeList = [];
  for (const t of trees) {
    treeMask[t] = 1;
    treeList.push(t);
  }
  const T = treeList.length;

  const candidates = new Array(T);
  for (let i = 0; i < T; i++) {
    const tree = treeList[i];
    const row = (tree / size) | 0;
    const col = tree - row * size;
    const cands = [];
    if (row > 0 && !treeMask[tree - size]) cands.push(tree - size);
    if (col + 1 < size && !treeMask[tree + 1]) cands.push(tree + 1);
    if (row + 1 < size && !treeMask[tree + size]) cands.push(tree + size);
    if (col > 0 && !treeMask[tree - 1]) cands.push(tree - 1);
    candidates[i] = new Int32Array(cands);
  }

  // Precompute 8-neighborhood for each cell as Int32Array.
  const adj8 = new Array(N);
  for (let cell = 0; cell < N; cell++) {
    const row = (cell / size) | 0;
    const col = cell - row * size;
    const arr = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          arr.push(nr * size + nc);
        }
      }
    }
    adj8[cell] = new Int32Array(arr);
  }

  return { treeList, treeMask, candidates, adj8, N, T };
}

export function findFirstValidTentPlacement(trees, size, maxNodes = 200000) {
  const ctx = buildSearchContext(trees, size);
  const { candidates, adj8, N, T } = ctx;
  if (T === 0) return new Set();
  for (let i = 0; i < T; i++) {
    if (candidates[i].length === 0) return null;
  }

  const placed = new Uint8Array(N);
  const blocked8 = new Uint16Array(N); // count of placed tents in 8-neighborhood
  const treeDone = new Uint8Array(T);

  let nodes = 0;
  let aborted = false;

  // MCV: pick tree (not yet placed) with fewest live candidates.
  function pickNextTree() {
    let best = -1;
    let bestCount = Infinity;
    for (let i = 0; i < T; i++) {
      if (treeDone[i]) continue;
      const cands = candidates[i];
      let cnt = 0;
      for (let k = 0; k < cands.length; k++) {
        const c = cands[k];
        if (!placed[c] && blocked8[c] === 0) cnt++;
        if (cnt > 1 && cnt >= bestCount) break;
      }
      if (cnt === 0) return -2;
      if (cnt < bestCount) {
        bestCount = cnt;
        best = i;
        if (cnt === 1) return best;
      }
    }
    return best;
  }

  function place(c) {
    placed[c] = 1;
    const a = adj8[c];
    for (let k = 0; k < a.length; k++) blocked8[a[k]]++;
  }
  function unplace(c) {
    placed[c] = 0;
    const a = adj8[c];
    for (let k = 0; k < a.length; k++) blocked8[a[k]]--;
  }

  function search(depth) {
    if (depth === T) return true;
    if (nodes++ > maxNodes) { aborted = true; return false; }

    const treeIdx = pickNextTree();
    if (treeIdx < 0) return false;

    treeDone[treeIdx] = 1;
    const cands = candidates[treeIdx];
    for (let k = 0; k < cands.length; k++) {
      const c = cands[k];
      if (placed[c] || blocked8[c] !== 0) continue;
      place(c);
      if (search(depth + 1)) return true;
      unplace(c);
      if (aborted) { treeDone[treeIdx] = 0; return false; }
    }
    treeDone[treeIdx] = 0;
    return false;
  }

  if (!search(0)) return null;

  const out = new Set();
  for (let i = 0; i < N; i++) {
    if (placed[i]) out.add(i);
  }
  return out;
}

export function countTentSolutions(trees, rowClues, colClues, size, limit, maxNodes = 200000) {
  const ctx = buildSearchContext(trees, size);
  const { candidates, adj8, N, T } = ctx;
  if (T === 0) {
    for (let i = 0; i < size; i++) if (rowClues[i] !== 0 || colClues[i] !== 0) return 0;
    return 1;
  }
  for (let i = 0; i < T; i++) {
    if (candidates[i].length === 0) return 0;
  }

  const placed = new Uint8Array(N);
  const blocked8 = new Uint16Array(N);
  const rowCounts = new Int8Array(size);
  const colCounts = new Int8Array(size);
  const treeDone = new Uint8Array(T);

  let solutions = 0;
  let nodes = 0;
  let aborted = false;

  function pickNextTree() {
    let best = -1;
    let bestCount = Infinity;
    for (let i = 0; i < T; i++) {
      if (treeDone[i]) continue;
      const cands = candidates[i];
      let cnt = 0;
      for (let k = 0; k < cands.length; k++) {
        const c = cands[k];
        if (placed[c] || blocked8[c] !== 0) continue;
        const row = (c / size) | 0;
        const col = c - row * size;
        if (rowCounts[row] >= rowClues[row]) continue;
        if (colCounts[col] >= colClues[col]) continue;
        cnt++;
      }
      if (cnt === 0) return -2;
      if (cnt < bestCount) {
        bestCount = cnt;
        best = i;
        if (cnt === 1) return best;
      }
    }
    return best;
  }

  function search() {
    if (solutions >= limit) return;
    if (nodes++ > maxNodes) { solutions = limit; aborted = true; return; }

    let allDone = true;
    for (let i = 0; i < T; i++) {
      if (!treeDone[i]) { allDone = false; break; }
    }
    if (allDone) {
      for (let i = 0; i < size; i++) {
        if (rowCounts[i] !== rowClues[i] || colCounts[i] !== colClues[i]) return;
      }
      solutions++;
      return;
    }

    const treeIdx = pickNextTree();
    if (treeIdx < 0) return;

    treeDone[treeIdx] = 1;
    const cands = candidates[treeIdx];
    for (let k = 0; k < cands.length; k++) {
      const c = cands[k];
      if (placed[c] || blocked8[c] !== 0) continue;
      const row = (c / size) | 0;
      const col = c - row * size;
      if (rowCounts[row] >= rowClues[row]) continue;
      if (colCounts[col] >= colClues[col]) continue;

      placed[c] = 1;
      const a = adj8[c];
      for (let j = 0; j < a.length; j++) blocked8[a[j]]++;
      rowCounts[row]++;
      colCounts[col]++;

      search();

      placed[c] = 0;
      for (let j = 0; j < a.length; j++) blocked8[a[j]]--;
      rowCounts[row]--;
      colCounts[col]--;

      if (solutions >= limit) { treeDone[treeIdx] = 0; return; }
      if (aborted) { treeDone[treeIdx] = 0; return; }
    }
    treeDone[treeIdx] = 0;
  }

  search();
  return solutions;
}

function are8Adjacent(a, b, size) {
  const ar = (a / size) | 0;
  const ac = a - ar * size;
  const br = (b / size) | 0;
  const bc = b - br * size;
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1 && a !== b;
}

const UNKNOWN = 0;
const TENT = 1;
const EMPTY = 2;

function buildInitialDomain(trees, size) {
  const domain = new Uint8Array(size * size);
  for (const tree of trees) domain[tree] = EMPTY;
  for (let cell = 0; cell < size * size; cell++) {
    if (domain[cell] !== UNKNOWN) continue;
    const adj = orthogonalNeighbors(cell, size);
    let hasTree = false;
    for (const n of adj) {
      if (trees.has(n)) { hasTree = true; break; }
    }
    if (!hasTree) domain[cell] = EMPTY;
  }
  return domain;
}

// Run all "easy" propagation rules to fixed point on `domain`.
// Returns true if the propagation reached a consistent fixed point;
// false if it detected a contradiction (or didn't converge).
//
// The contradiction-detecting tree-pair rule (two trees both reduced to
// {X, Y} with X, Y 8-adjacent → no matching exists) is included here
// unconditionally. On a uniquely-solvable puzzle this rule never fires
// at the puzzle's true state, but it does fire on hypothetical states
// during 1-step lookahead, which is what makes the lookahead useful.
function easyPropagate(domain, trees, treeList, treeAdj, rowClues, colClues, size) {
  let iterations = 0;
  const maxIterations = 200;
  let changed = true;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (let row = 0; row < size; row++) {
      const clue = rowClues[row];
      let tentCount = 0;
      let possibleCount = 0;
      const cells = [];
      for (let col = 0; col < size; col++) {
        const cell = row * size + col;
        if (domain[cell] === TENT) tentCount++;
        else if (domain[cell] === UNKNOWN) { possibleCount++; cells.push(cell); }
      }
      if (tentCount > clue) return false;
      if (tentCount === clue && cells.length > 0) {
        for (const cell of cells) domain[cell] = EMPTY;
        changed = true;
      } else if (tentCount + possibleCount === clue && cells.length > 0) {
        for (const cell of cells) domain[cell] = TENT;
        changed = true;
      } else if (tentCount + possibleCount < clue) return false;
    }

    for (let col = 0; col < size; col++) {
      const clue = colClues[col];
      let tentCount = 0;
      let possibleCount = 0;
      const cells = [];
      for (let row = 0; row < size; row++) {
        const cell = row * size + col;
        if (domain[cell] === TENT) tentCount++;
        else if (domain[cell] === UNKNOWN) { possibleCount++; cells.push(cell); }
      }
      if (tentCount > clue) return false;
      if (tentCount === clue && cells.length > 0) {
        for (const cell of cells) domain[cell] = EMPTY;
        changed = true;
      } else if (tentCount + possibleCount === clue && cells.length > 0) {
        for (const cell of cells) domain[cell] = TENT;
        changed = true;
      } else if (tentCount + possibleCount < clue) return false;
    }

    const treeCands = new Array(treeList.length);
    for (let ti = 0; ti < treeList.length; ti++) {
      const cands = [];
      for (const n of treeAdj[ti]) {
        if (domain[n] === UNKNOWN || domain[n] === TENT) cands.push(n);
      }
      if (cands.length === 0) return false;
      treeCands[ti] = cands;
      if (cands.length === 1 && domain[cands[0]] === UNKNOWN) {
        domain[cands[0]] = TENT;
        changed = true;
      }
    }

    for (let cell = 0; cell < size * size; cell++) {
      if (domain[cell] !== TENT) continue;
      const adj8 = neighbors8(cell, size);
      for (const n of adj8) {
        if (domain[n] === UNKNOWN) {
          domain[n] = EMPTY;
          changed = true;
        }
      }
      const adjOrtho = orthogonalNeighbors(cell, size);
      let hasTree = false;
      for (const n of adjOrtho) {
        if (trees.has(n)) { hasTree = true; break; }
      }
      if (!hasTree) return false;
    }

    for (let ti = 0; ti < treeList.length; ti++) {
      const a = treeCands[ti];
      if (a.length !== 1) continue;
      for (let tj = ti + 1; tj < treeList.length; tj++) {
        const b = treeCands[tj];
        if (b.length === 1 && a[0] === b[0]) return false;
      }
    }

    for (let ti = 0; ti < treeList.length; ti++) {
      const a = treeCands[ti];
      if (a.length !== 2) continue;
      for (let tj = ti + 1; tj < treeList.length; tj++) {
        const b = treeCands[tj];
        if (b.length !== 2) continue;
        const samePair = (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
        if (samePair && are8Adjacent(a[0], a[1], size)) return false;
      }
    }
  }

  return iterations < maxIterations;
}

export function isBCDeducible(trees, tents, rowClues, colClues, size, difficulty = "easy") {
  const domain = buildInitialDomain(trees, size);
  const treeList = [...trees];
  const treeAdj = treeList.map(tree => orthogonalNeighbors(tree, size).filter(c => !trees.has(c)));

  if (!easyPropagate(domain, trees, treeList, treeAdj, rowClues, colClues, size)) return false;

  if (difficulty === "hard") {
    // 1-step lookahead (trial elimination): for each UNKNOWN cell, hypothesize
    // TENT and EMPTY and run easy propagation. If a hypothesis leads to a
    // contradiction (including via the tree-pair contradiction rule above),
    // commit the opposite value. Loop until no progress.
    const N = size * size;
    let progress = true;
    while (progress) {
      progress = false;
      for (let cell = 0; cell < N; cell++) {
        if (domain[cell] !== UNKNOWN) continue;

        const tryT = new Uint8Array(domain);
        tryT[cell] = TENT;
        const tentOk = easyPropagate(tryT, trees, treeList, treeAdj, rowClues, colClues, size);
        if (!tentOk) {
          domain[cell] = EMPTY;
          if (!easyPropagate(domain, trees, treeList, treeAdj, rowClues, colClues, size)) return false;
          progress = true;
          continue;
        }

        const tryE = new Uint8Array(domain);
        tryE[cell] = EMPTY;
        const emptyOk = easyPropagate(tryE, trees, treeList, treeAdj, rowClues, colClues, size);
        if (!emptyOk) {
          domain[cell] = TENT;
          if (!easyPropagate(domain, trees, treeList, treeAdj, rowClues, colClues, size)) return false;
          progress = true;
        }
      }
    }
  }

  for (let cell = 0; cell < size * size; cell++) {
    if (trees.has(cell)) continue;
    const expected = tents.has(cell) ? TENT : EMPTY;
    if (domain[cell] !== expected) return false;
  }
  return true;
}

export function rulesSatisfied(trees, tents, rowClues, colClues, size) {
  if (trees.size !== tents.size) return false;

  const rowCounts = new Array(size).fill(0);
  const colCounts = new Array(size).fill(0);
  for (const tent of tents) {
    if (trees.has(tent)) return false;
    rowCounts[Math.floor(tent / size)]++;
    colCounts[tent % size]++;
  }
  for (let i = 0; i < size; i++) {
    if (rowCounts[i] !== rowClues[i]) return false;
    if (colCounts[i] !== colClues[i]) return false;
  }

  for (const tent of tents) {
    const adj8 = neighbors8(tent, size);
    for (const n of adj8) {
      if (tents.has(n)) return false;
    }
  }

  return hasValidPairing(trees, tents, size);
}

function hasValidPairing(trees, tents, size) {
  const treeList = [...trees];
  const tentSet = new Set(tents);
  const candidates = treeList.map(tree =>
    orthogonalNeighbors(tree, size).filter(c => tentSet.has(c))
  );
  if (candidates.some(c => c.length === 0)) return false;

  const used = new Set();
  function search(depth) {
    if (depth === treeList.length) return true;
    for (const candidate of candidates[depth]) {
      if (used.has(candidate)) continue;
      used.add(candidate);
      if (search(depth + 1)) return true;
      used.delete(candidate);
    }
    return false;
  }
  return search(0);
}

export function countTentsPerRow(tents, size) {
  const counts = new Array(size).fill(0);
  for (const tent of tents) counts[Math.floor(tent / size)]++;
  return counts;
}

export function countTentsPerCol(tents, size) {
  const counts = new Array(size).fill(0);
  for (const tent of tents) counts[tent % size]++;
  return counts;
}

