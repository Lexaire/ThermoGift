// Constructive thermometer puzzle generator.
//
// Builds a no-guess-solvable puzzle by simulating a player's deduction chain
// forward. At each step we pick (line L, clue value w) such that committing
// L = w would force at least one new thermo into a singleton fill via
// bounds-consistency propagation. Each commit is the next "deduction" in the
// chain; the resulting clue values are the puzzle's clues.
//
// See constructive-design.md for the high-level approach.

import {
  buildThermometers,
  solutionFromLengths,
  countsByRow,
  countsByCol,
  buildSolverContext,
  countSolutionsCtx,
} from "./generator.js";

export function buildLineIndex(thermos, size) {
  const N = thermos.length;
  const rowPositions = Array.from({ length: N }, () => new Map());
  const colPositions = Array.from({ length: N }, () => new Map());
  const thermosByRow = Array.from({ length: size }, () => []);
  const thermosByCol = Array.from({ length: size }, () => []);
  for (let i = 0; i < N; i += 1) {
    const seenR = new Set(), seenC = new Set();
    for (let pos = 0; pos < thermos[i].length; pos += 1) {
      const cell = thermos[i][pos];
      const r = (cell / size) | 0;
      const c = cell % size;
      if (!rowPositions[i].has(r)) rowPositions[i].set(r, []);
      rowPositions[i].get(r).push(pos);
      if (!seenR.has(r)) { thermosByRow[r].push(i); seenR.add(r); }
      if (!colPositions[i].has(c)) colPositions[i].set(c, []);
      colPositions[i].get(c).push(pos);
      if (!seenC.has(c)) { thermosByCol[c].push(i); seenC.add(c); }
    }
  }
  const lines = [];
  for (let r = 0; r < size; r += 1) {
    const idxs = thermosByRow[r];
    lines.push({
      kind: "row", index: r, idxs,
      positionsByThermo: idxs.map((i) => Int32Array.from(rowPositions[i].get(r))),
    });
  }
  for (let c = 0; c < size; c += 1) {
    const idxs = thermosByCol[c];
    lines.push({
      kind: "col", index: c, idxs,
      positionsByThermo: idxs.map((i) => Int32Array.from(colPositions[i].get(c))),
    });
  }
  return { N, size, thermos, lines };
}

// Bounds-consistency propagator for one line, given a fixed clue.
// Returns 1 if any domain shrank, 0 if no change, -1 on contradiction.
function applyLine(domain, idxs, positionsByThermo, clue) {
  const K = idxs.length;
  if (K === 0) return clue === 0 ? 0 : -1;
  const losArr = new Int32Array(K), hisArr = new Int32Array(K);
  let totalLo = 0, totalHi = 0;
  for (let k = 0; k < K; k += 1) {
    const dom = domain[idxs[k]];
    const positions = positionsByThermo[k];
    let lo = 0x7fffffff, hi = -1;
    for (let f = 0; f < dom.length; f += 1) {
      if (!dom[f]) continue;
      let count = 0;
      for (let p = 0; p < positions.length; p += 1) if (positions[p] < f) count += 1;
      if (count < lo) lo = count;
      if (count > hi) hi = count;
    }
    if (hi < 0) return -1;
    losArr[k] = lo; hisArr[k] = hi;
    totalLo += lo; totalHi += hi;
  }
  if (totalLo > clue || totalHi < clue) return -1;
  let changed = 0;
  for (let k = 0; k < K; k += 1) {
    const dom = domain[idxs[k]];
    const positions = positionsByThermo[k];
    const reqLo = clue - (totalHi - hisArr[k]);
    const reqHi = clue - (totalLo - losArr[k]);
    let any = false, removed = false;
    for (let f = 0; f < dom.length; f += 1) {
      if (!dom[f]) continue;
      let count = 0;
      for (let p = 0; p < positions.length; p += 1) if (positions[p] < f) count += 1;
      if (count < reqLo || count > reqHi) { dom[f] = 0; removed = true; }
      else any = true;
    }
    if (!any) return -1;
    if (removed) changed = 1;
  }
  return changed;
}

function lineRange(domain, idxs, positionsByThermo) {
  let lo = 0, hi = 0;
  for (let k = 0; k < idxs.length; k += 1) {
    const dom = domain[idxs[k]];
    const positions = positionsByThermo[k];
    let mn = 0x7fffffff, mx = -1;
    for (let f = 0; f < dom.length; f += 1) {
      if (!dom[f]) continue;
      let count = 0;
      for (let p = 0; p < positions.length; p += 1) if (positions[p] < f) count += 1;
      if (count < mn) mn = count;
      if (count > mx) mx = count;
    }
    if (mx < 0) return null;
    lo += mn;
    hi += mx;
  }
  return [lo, hi];
}

function cloneDomain(domain) { return domain.map((d) => new Uint8Array(d)); }

// Counts the size of each domain. Returns -1 on dead domain.
function domainSizes(domain) {
  const sizes = new Int32Array(domain.length);
  for (let i = 0; i < domain.length; i += 1) {
    let c = 0;
    for (let f = 0; f < domain[i].length; f += 1) if (domain[i][f]) c += 1;
    if (c === 0) return null;
    sizes[i] = c;
  }
  return sizes;
}

// Run propagation to fixpoint over committed lines.
function propagate(domain, lines, committed) {
  for (let pass = 0; pass < 200; pass += 1) {
    let any = 0;
    for (let li = 0; li < lines.length; li += 1) {
      if (committed[li] < 0) continue;
      const code = applyLine(domain, lines[li].idxs, lines[li].positionsByThermo, committed[li]);
      if (code < 0) return -1;
      if (code === 1) any = 1;
    }
    if (!any) break;
  }
  return 0;
}

function initialDomains(thermos) {
  return thermos.map((t) => {
    const d = new Uint8Array(t.length + 1);
    d.fill(1);
    return d;
  });
}

function extractFills(domain) {
  const fills = new Array(domain.length);
  for (let i = 0; i < domain.length; i += 1) {
    let count = 0, val = -1;
    for (let f = 0; f < domain[i].length; f += 1) {
      if (domain[i][f]) { count += 1; val = f; if (count > 1) return null; }
    }
    if (count !== 1) return null;
    fills[i] = val;
  }
  return fills;
}

// Singleton arc consistency pass. For each (thermo t, value v) currently in
// dom[t], pin t = v in a clone, propagate to fixpoint over committed lines;
// if it contradicts, v is globally infeasible given the current commits and we
// remove v from the real domain[t]. Strictly stronger than BC: this is what
// breaks "swap pair" stalls where two length-2 thermos can swap fills under BC.
//
// Stops at the first prune within a pass (cheap exits beat full fixpoint here).
// Returns 1 if any prune, -1 on contradiction (some real domain wiped out),
// 0 if no prune found.
function sacPass(domain, lines, committed, options = {}) {
  const { length2Only = false } = options;
  for (let t = 0; t < domain.length; t += 1) {
    if (length2Only && domain[t].length !== 3) continue;
    const dom = domain[t];
    let count = 0;
    for (let f = 0; f < dom.length; f += 1) if (dom[f]) count += 1;
    if (count <= 1) continue;
    for (let v = 0; v < dom.length; v += 1) {
      if (!dom[v]) continue;
      const clone = cloneDomain(domain);
      const c = clone[t];
      for (let f = 0; f < c.length; f += 1) c[f] = (f === v) ? 1 : 0;
      const code = propagate(clone, lines, committed);
      if (code < 0) {
        domain[t][v] = 0;
        let any = false;
        for (let f = 0; f < domain[t].length; f += 1) if (domain[t][f]) { any = true; break; }
        if (!any) return -1;
        return 1;
      }
    }
  }
  return 0;
}

// BC-only solve from initial domains given the full clue set. Returns
// `{ solved, fills }`: `solved` is true iff BC alone reaches all singletons.
// This is the no-guess contract — the player must be able to deduce the
// solution by BC alone, even if the generator used SAC during construction.
// Exported so tests can assert it on every produced puzzle.
export function inferSolveBC(thermos, size, rowClues, colClues) {
  const { lines } = buildLineIndex(thermos, size);
  const committed = new Int32Array(lines.length);
  for (let i = 0; i < size; i += 1) {
    committed[i] = rowClues[i];
    committed[size + i] = colClues[i];
  }
  const domain = initialDomains(thermos);
  if (propagate(domain, lines, committed) < 0) return { solved: false, fills: null };
  const fills = extractFills(domain);
  return { solved: fills !== null, fills };
}

// For each (uncommitted line L, value w in current lineRange(L)), compute the
// number of NEW singleton thermos that propagation would yield. Return the
// top moves sorted by score (best first). Set `requireForcing` to false to
// also include moves that produce zero new singletons (fallback).
function findMoves(domain, lines, committed, currentSizes, size, opts) {
  const { preferLength2, requireForcing = true, topK = 6 } = opts;
  const candidates = [];
  for (let li = 0; li < lines.length; li += 1) {
    if (committed[li] >= 0) continue;
    const range = lineRange(domain, lines[li].idxs, lines[li].positionsByThermo);
    if (!range) return { contradiction: true };
    const [lo, hi] = range;
    for (let v = lo; v <= hi; v += 1) {
      // Skip clue values that would make a row/col empty or completely full —
      // those are aesthetically dead clues (and isUsableClueSet rejects them).
      if (v === 0 || v === size) continue;
      const clone = cloneDomain(domain);
      const tmpCommitted = committed.slice();
      tmpCommitted[li] = v;
      const code = applyLine(clone, lines[li].idxs, lines[li].positionsByThermo, v);
      if (code < 0) continue;
      if (propagate(clone, lines, tmpCommitted) < 0) continue;
      const sizes = domainSizes(clone);
      if (!sizes) continue;
      let newSingletons = 0;
      let newLen2Singletons = 0;
      let totalSize = 0;
      for (let i = 0; i < sizes.length; i += 1) {
        totalSize += sizes[i];
        if (sizes[i] === 1 && currentSizes[i] > 1) {
          newSingletons += 1;
          if (clone[i].length === 3) newLen2Singletons += 1;
        }
      }
      if (requireForcing && newSingletons === 0) continue;
      const score = newSingletons * 1000
        + (preferLength2 ? newLen2Singletons * 10 : 0)
        - totalSize;
      candidates.push({ lineIdx: li, value: v, score, newSingletons, totalSize });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return { moves: candidates.slice(0, topK) };
}

// Auto-commit any uncommitted line whose feasible range has collapsed to a
// single value. These don't count as "decisions" — they're forced by prior
// commits. Returns 1 if any committed, -1 on contradiction, 0 otherwise.
function autoCommitForced(domain, lines, committed, size) {
  let any = 0;
  for (let li = 0; li < lines.length; li += 1) {
    if (committed[li] >= 0) continue;
    const range = lineRange(domain, lines[li].idxs, lines[li].positionsByThermo);
    if (!range) return -1;
    if (range[0] === range[1]) {
      // A forced 0 or full clue is dead — treat as contradiction so we backtrack.
      if (range[0] === 0 || range[0] === size) return -1;
      committed[li] = range[0];
      any = 1;
    }
  }
  return any;
}

export function constructForLayout(thermos, size, opts = {}) {
  const {
    backtrackBudget = thermos.length * 4,
    preferLength2 = true,
    rng = Math.random,
    useSac = true,
  } = opts;
  const idx = buildLineIndex(thermos, size);
  const { lines } = idx;
  const ctx = buildSolverContext(thermos, size);
  const domain = initialDomains(thermos);
  const committed = new Int32Array(lines.length).fill(-1);

  // Decision stack: each frame can replay alternative values for its line.
  // Frame: { lineIdx, alternatives:[{value, score}], snapshotDomain, snapshotCommitted }
  const stack = [];
  let backtracks = 0;

  const pushDecision = (lineIdx, value, alternatives) => {
    stack.push({
      lineIdx, value, alternatives,
      snapshotDomain: cloneDomain(domain),
      snapshotCommitted: new Int32Array(committed),
    });
  };
  const tryBacktrack = () => {
    while (stack.length > 0) {
      backtracks += 1;
      if (backtracks > backtrackBudget) return false;
      const top = stack[stack.length - 1];
      // Restore to before this decision.
      for (let i = 0; i < domain.length; i += 1) domain[i].set(top.snapshotDomain[i]);
      committed.set(top.snapshotCommitted);
      if (top.alternatives.length > 0) {
        const next = top.alternatives.shift();
        committed[top.lineIdx] = next.value;
        top.value = next.value;
        return true;
      }
      stack.pop();
    }
    return false;
  };

  while (true) {
    if (propagate(domain, lines, committed) < 0) {
      if (!tryBacktrack()) return null;
      continue;
    }
    const ac = autoCommitForced(domain, lines, committed, size);
    if (ac < 0) {
      if (!tryBacktrack()) return null;
      continue;
    }
    if (ac > 0) continue;

    const sizes = domainSizes(domain);
    if (!sizes) {
      if (!tryBacktrack()) return null;
      continue;
    }

    let allSingleton = true;
    for (let i = 0; i < sizes.length; i += 1) if (sizes[i] !== 1) { allSingleton = false; break; }
    if (allSingleton) {
      const fills = extractFills(domain);
      const sol = solutionFromLengths(size, thermos, fills);
      const rowClues = countsByRow(sol, size);
      const colClues = countsByCol(sol, size);
      const hasDead = rowClues.some((c) => c === 0 || c === size) ||
        colClues.some((c) => c === 0 || c === size);
      if (hasDead) { if (!tryBacktrack()) return null; continue; }
      // No-guess contract: BC alone (no SAC) on the full clue set must reach
      // the same singleton state. SAC during construction can prune values
      // BC wouldn't have, so verify the player can still solve by BC alone.
      const inferred = inferSolveBC(thermos, size, rowClues, colClues);
      if (!inferred.solved) { if (!tryBacktrack()) return null; continue; }
      const cnt = countSolutionsCtx(ctx, rowClues, colClues, 2, 100_000);
      if (cnt === 1) return { thermos, fills, rowClues, colClues, solution: sol };
      if (!tryBacktrack()) return null;
      continue;
    }

    let result = findMoves(domain, lines, committed, sizes, size, { preferLength2, requireForcing: true, topK: 4 });
    if (result && result.contradiction) { if (!tryBacktrack()) return null; continue; }
    if (!result || result.moves.length === 0) {
      // SAC fallback: BC stalled but SAC may prune globally infeasible values
      // (notably swap-pair length-2 thermos that BC alone can't disambiguate).
      // Length-2 first since those are usually the offenders and the pass is
      // far cheaper. Stop on first prune and re-enter the main loop so
      // propagation can cascade the new info before paying for another pass.
      if (useSac) {
        let sacCode = sacPass(domain, lines, committed, { length2Only: true });
        if (sacCode === 0) sacCode = sacPass(domain, lines, committed, { length2Only: false });
        if (sacCode < 0) { if (!tryBacktrack()) return null; continue; }
        if (sacCode > 0) continue;
      }
      result = findMoves(domain, lines, committed, sizes, size, { preferLength2, requireForcing: false, topK: 4 });
      if (!result || result.contradiction || result.moves.length === 0) {
        if (!tryBacktrack()) return null;
        continue;
      }
    }
    const top = result.moves[0];
    pushDecision(top.lineIdx, top.value, result.moves.slice(1));
    committed[top.lineIdx] = top.value;
  }
}

export function constructPuzzle(size, shapeStyle, opts = {}) {
  const {
    minLength = 2,
    maxLength,
    minThermos = Math.max(8, Math.floor(size * size / 5)),
    layoutAttempts = 30,
    rng = Math.random,
    useSac = true,
  } = opts;
  const layoutConfig = { minLength };
  if (maxLength !== undefined) layoutConfig.maxLength = maxLength;
  for (let attempt = 0; attempt < layoutAttempts; attempt += 1) {
    let thermos;
    try { thermos = buildThermometers(size, minThermos, rng, shapeStyle, layoutConfig); }
    catch { continue; }
    const result = constructForLayout(thermos, size, { rng, useSac });
    if (result) return result;
  }
  return null;
}
