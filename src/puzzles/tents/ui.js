const LONG_PRESS_MS = 350;
const TOUCH_MOVE_THRESHOLD_PX = 10;

const SETTINGS_KEY_DIM_CLUES = "thermogift:assist:tents:dimMatchedClues";
const SETTINGS_KEY_AUTO_X = "thermogift:assist:tents:autoXAroundTents";
const SETTINGS_KEY_AUTO_FLOOD_X = "thermogift:assist:tents:autoFloodXOnClueMet";
const SETTINGS_KEY_AUTO_ZERO_X = "thermogift:assist:tents:autoZeroX";
const SETTINGS_KEY_AUTO_NON_ADJ_X = "thermogift:assist:tents:autoNonAdjX";

function loadSettings() {
  return {
    dimMatchedClues: localStorage.getItem(SETTINGS_KEY_DIM_CLUES) !== "false",
    autoXAroundTents: localStorage.getItem(SETTINGS_KEY_AUTO_X) !== "false",
    autoFloodXOnClueMet: localStorage.getItem(SETTINGS_KEY_AUTO_FLOOD_X) === "true",
    autoZeroX: localStorage.getItem(SETTINGS_KEY_AUTO_ZERO_X) === "true",
    autoNonAdjX: localStorage.getItem(SETTINGS_KEY_AUTO_NON_ADJ_X) === "true",
  };
}

export function attachTentsUI({ boardEl, rowCluesEl, colCluesEl, rowCluesRightEl, puzzle, stateApi }) {
  const windowHandlers = wireWindowHandlers(stateApi);
  const settings = loadSettings();
  const settingsCleanup = wireSettingsInputs(settings, () => render(), {
    onAutoZeroXEnabled: () => { applyZeroClueAutoX(); render(); },
    onAutoNonAdjXEnabled: () => { applyNonAdjacentAutoX(); render(); },
    onAutoZeroXDisabled: rebuildLakesFromActiveAssists,
    onAutoNonAdjXDisabled: rebuildLakesFromActiveAssists,
  });

  function rebuildLakesFromActiveAssists() {
    if (stateApi.lakeMarks.size === 0) return;
    stateApi.pushHistory();
    stateApi.lakeMarks.clear();
    if (settings.autoZeroX) applyZeroClueAutoX();
    if (settings.autoNonAdjX) applyNonAdjacentAutoX();
    stateApi.scheduleSave();
    render();
  }

  if (settings.autoZeroX) applyZeroClueAutoX();
  if (settings.autoNonAdjX) applyNonAdjacentAutoX();

  function render() {
    const counts = currentCounts(puzzle, stateApi.marks);
    const errorCells = computeErrorCells();

    colCluesEl.replaceChildren(...puzzle.colClues.map((clue, index) =>
      clueEl(clue, counts.col[index])));
    rowCluesEl.replaceChildren(...puzzle.rowClues.map((clue, index) =>
      clueEl(clue, counts.row[index])));
    rowCluesRightEl.replaceChildren(...puzzle.rowClues.map((clue, index) =>
      clueEl(clue, counts.row[index])));

    const cells = Array.from({ length: puzzle.size * puzzle.size }, (_, index) => buildCell(index, errorCells));
    boardEl.replaceChildren(...cells);

    stateApi.updateProgress(counts);
  }

  function clueEl(clue, count) {
    const element = document.createElement("div");
    const stateClass = count === clue ? (settings.dimMatchedClues ? "met" : "") : count > clue ? "over" : "";
    element.className = `col-clue ${stateClass}`;
    element.textContent = String(clue);
    return element;
  }

  function buildCell(index, errorCells) {
    const button = document.createElement("button");
    button.type = "button";
    const isTree = puzzle.trees.has(index);
    button.className = cellClass(index, isTree, errorCells);
    button.ariaLabel = `Row ${Math.floor(index / puzzle.size) + 1}, column ${(index % puzzle.size) + 1}`;

    if (isTree) {
      button.append(createTreeIcon());
      return button;
    }

    button.addEventListener("contextmenu", (event) => event.preventDefault());
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        if (event.button !== 0) return;
        if (event.target instanceof Element && event.target.hasPointerCapture(event.pointerId)) {
          event.target.releasePointerCapture(event.pointerId);
        }
        cancelTouchPending();
        const timer = window.setTimeout(() => {
          if (!stateApi.touchPending) return;
          stateApi.touchPending.fired = true;
          toggleXMark(stateApi.touchPending.index);
        }, LONG_PRESS_MS);
        stateApi.touchPending = { index, startX: event.clientX, startY: event.clientY, timer, fired: false };
        return;
      }
      if (event.button === 0) {
        stateApi.pushHistory();
        const mode = stateApi.marks.has(index) ? "clear" : "fill";
        stateApi.dragging = { kind: "mark", mode };
        toggleTent(index, mode);
      } else if (event.button === 2) {
        stateApi.pushHistory();
        const mode = stateApi.xMarks.has(index) ? "clear-x" : "x";
        stateApi.dragging = { kind: "xMark", mode };
        toggleXMarkDirect(index, mode);
      }
    });
    button.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "touch" || !stateApi.touchPending) return;
      const dx = event.clientX - stateApi.touchPending.startX;
      const dy = event.clientY - stateApi.touchPending.startY;
      if (dx * dx + dy * dy < TOUCH_MOVE_THRESHOLD_PX * TOUCH_MOVE_THRESHOLD_PX) return;
      cancelTouchPending();
    });
    button.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch") return;
      const pending = stateApi.touchPending;
      if (!pending || pending.fired) return;
      cancelTouchPending();
      if (pending.index !== index) return;
      stateApi.pushHistory();
      const mode = stateApi.marks.has(index) ? "clear" : "fill";
      toggleTent(index, mode);
    });
    button.addEventListener("pointerenter", (event) => {
      if (!stateApi.dragging) return;
      if (stateApi.dragging.kind === "mark" && (event.buttons & 1)) {
        toggleTent(index, stateApi.dragging.mode);
      } else if (stateApi.dragging.kind === "xMark" && (event.buttons & 2)) {
        toggleXMarkDirect(index, stateApi.dragging.mode);
      }
    });

    if (stateApi.marks.has(index)) {
      button.append(createTentIcon());
    }
    if (stateApi.xMarks.has(index)) {
      button.append(createGrassIcon());
    }
    if (stateApi.lakeMarks.has(index)) {
      button.append(createLakeIcon());
    }

    return button;
  }

  function cellClass(index, isTree, errorCells) {
    const classes = ["cell"];
    if (isTree) classes.push("tree-cell");
    else if (stateApi.marks.has(index)) {
      classes.push("filled", "tent-cell");
      if (errorCells.has(index)) classes.push("tent-error");
    }
    if (stateApi.xMarks.has(index) && !isTree) classes.push("grass-marked");
    if (stateApi.lakeMarks.has(index) && !isTree && !stateApi.marks.has(index)) classes.push("lake-marked");
    return classes.join(" ");
  }

  function cancelTouchPending() {
    if (stateApi.touchPending?.timer) clearTimeout(stateApi.touchPending.timer);
    stateApi.touchPending = null;
  }

  function toggleTent(index, mode) {
    if (puzzle.trees.has(index)) return;
    if (stateApi.lakeMarks.has(index)) return;
    if (mode === "fill") {
      stateApi.marks.add(index);
      stateApi.xMarks.delete(index);
      stateApi.lakeMarks.delete(index);
      if (settings.autoXAroundTents) {
        for (const n of getNeighbors8(index, puzzle.size)) {
          if (puzzle.trees.has(n) || stateApi.marks.has(n) || stateApi.lakeMarks.has(n)) continue;
          stateApi.xMarks.add(n);
        }
      }
      if (settings.autoFloodXOnClueMet) {
        floodXIfClueMet(Math.floor(index / puzzle.size), index % puzzle.size);
      }
    } else {
      stateApi.marks.delete(index);
    }
    stateApi.scheduleSave();
    stateApi.scheduleRender();
    stateApi.maybeReveal();
  }

  function applyNonAdjacentAutoX() {
    const size = puzzle.size;
    let changed = false;
    for (let idx = 0; idx < size * size; idx++) {
      if (puzzle.trees.has(idx) || stateApi.marks.has(idx) || stateApi.xMarks.has(idx) || stateApi.lakeMarks.has(idx)) continue;
      if (orthoNeighbors(idx, size).some(n => puzzle.trees.has(n))) continue;
      stateApi.lakeMarks.add(idx);
      changed = true;
    }
    if (changed) stateApi.scheduleSave();
  }

  function applyZeroClueAutoX() {
    const size = puzzle.size;
    let changed = false;
    const markEmpty = (idx) => {
      if (puzzle.trees.has(idx) || stateApi.marks.has(idx) || stateApi.xMarks.has(idx) || stateApi.lakeMarks.has(idx)) return;
      stateApi.lakeMarks.add(idx);
      changed = true;
    };
    for (let r = 0; r < size; r++) {
      if (puzzle.rowClues[r] !== 0) continue;
      for (let c = 0; c < size; c++) markEmpty(r * size + c);
    }
    for (let c = 0; c < size; c++) {
      if (puzzle.colClues[c] !== 0) continue;
      for (let r = 0; r < size; r++) markEmpty(r * size + c);
    }
    if (changed) stateApi.scheduleSave();
  }

  function floodXIfClueMet(row, col) {
    const size = puzzle.size;
    const counts = currentCounts(puzzle, stateApi.marks);
    if (counts.row[row] === puzzle.rowClues[row]) {
      for (let c = 0; c < size; c++) {
        const idx = row * size + c;
        if (puzzle.trees.has(idx) || stateApi.marks.has(idx) || stateApi.lakeMarks.has(idx)) continue;
        stateApi.xMarks.add(idx);
      }
    }
    if (counts.col[col] === puzzle.colClues[col]) {
      for (let r = 0; r < size; r++) {
        const idx = r * size + col;
        if (puzzle.trees.has(idx) || stateApi.marks.has(idx) || stateApi.lakeMarks.has(idx)) continue;
        stateApi.xMarks.add(idx);
      }
    }
  }

  function toggleXMark(index) {
    if (puzzle.trees.has(index)) return;
    if (stateApi.lakeMarks.has(index)) return;
    stateApi.pushHistory();
    const mode = stateApi.xMarks.has(index) ? "clear-x" : "x";
    toggleXMarkDirect(index, mode);
  }

  function toggleXMarkDirect(index, mode) {
    if (puzzle.trees.has(index)) return;
    if (stateApi.lakeMarks.has(index)) return;
    if (mode === "x") {
      stateApi.xMarks.add(index);
      stateApi.marks.delete(index);
    } else {
      stateApi.xMarks.delete(index);
    }
    stateApi.scheduleSave();
    stateApi.scheduleRender();
    stateApi.maybeReveal();
  }

  function isSolved() {
    const size = puzzle.size;
    if (stateApi.marks.size !== puzzle.expectedTotal) return false;

    const counts = currentCounts(puzzle, stateApi.marks);
    for (let i = 0; i < size; i++) {
      if (counts.row[i] !== puzzle.rowClues[i]) return false;
      if (counts.col[i] !== puzzle.colClues[i]) return false;
    }

    for (const tent of stateApi.marks) {
      const adj8 = getNeighbors8(tent, size);
      for (const n of adj8) {
        if (stateApi.marks.has(n)) return false;
      }
    }

    return hasValidPairing(puzzle.trees, stateApi.marks, size);
  }

  function computeErrorCells() {
    const errors = new Set();
    for (const tent of stateApi.marks) {
      const adj8 = getNeighbors8(tent, puzzle.size);
      for (const n of adj8) {
        if (stateApi.marks.has(n)) {
          errors.add(tent);
          errors.add(n);
        }
      }
      if (!orthoNeighbors(tent, puzzle.size).some(n => puzzle.trees.has(n))) {
        errors.add(tent);
      }
    }
    return errors;
  }

  return {
    render,
    isSolved,
    applyInitialAssists() {
      if (settings.autoZeroX) applyZeroClueAutoX();
      if (settings.autoNonAdjX) applyNonAdjacentAutoX();
    },
    dispose() {
      settingsCleanup();
      windowHandlers();
    },
  };
}

function currentCounts(puzzle, marks) {
  const size = puzzle.size;
  const row = new Array(size).fill(0);
  const col = new Array(size).fill(0);
  for (const cell of marks) {
    row[(cell / size) | 0] += 1;
    col[cell % size] += 1;
  }
  return { row, col };
}

function wireWindowHandlers(stateApi) {
  const onUp = () => {
    stateApi.dragging = null;
    if (stateApi.touchPending?.timer) clearTimeout(stateApi.touchPending.timer);
    stateApi.touchPending = null;
  };
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}

/**
 * @param {{onAutoZeroXEnabled?: () => void, onAutoNonAdjXEnabled?: () => void, onAutoZeroXDisabled?: () => void, onAutoNonAdjXDisabled?: () => void}} [lakeHandlers]
 */
function wireSettingsInputs(settings, onChange, lakeHandlers = {}) {
  const cleanups = [];
  const { onAutoZeroXEnabled, onAutoNonAdjXEnabled, onAutoZeroXDisabled, onAutoNonAdjXDisabled } = lakeHandlers;

  const dim = document.querySelector("#settingTentsDimClues");
  if (dim) {
    dim.checked = settings.dimMatchedClues;
    const handler = () => {
      settings.dimMatchedClues = dim.checked;
      localStorage.setItem(SETTINGS_KEY_DIM_CLUES, String(settings.dimMatchedClues));
      onChange();
    };
    dim.addEventListener("change", handler);
    cleanups.push(() => dim.removeEventListener("change", handler));
  }

  const autoX = document.querySelector("#settingTentsAutoX");
  if (autoX) {
    autoX.checked = settings.autoXAroundTents;
    const handler = () => {
      settings.autoXAroundTents = autoX.checked;
      localStorage.setItem(SETTINGS_KEY_AUTO_X, String(settings.autoXAroundTents));
    };
    autoX.addEventListener("change", handler);
    cleanups.push(() => autoX.removeEventListener("change", handler));
  }

  const autoFlood = document.querySelector("#settingTentsAutoFloodX");
  if (autoFlood) {
    autoFlood.checked = settings.autoFloodXOnClueMet;
    const handler = () => {
      settings.autoFloodXOnClueMet = autoFlood.checked;
      localStorage.setItem(SETTINGS_KEY_AUTO_FLOOD_X, String(settings.autoFloodXOnClueMet));
    };
    autoFlood.addEventListener("change", handler);
    cleanups.push(() => autoFlood.removeEventListener("change", handler));
  }

  const autoZero = /** @type {HTMLInputElement | null} */ (document.querySelector("#settingTentsAutoZeroX"));
  if (autoZero) {
    autoZero.checked = settings.autoZeroX;
    const handler = () => {
      const wasOn = settings.autoZeroX;
      settings.autoZeroX = autoZero.checked;
      localStorage.setItem(SETTINGS_KEY_AUTO_ZERO_X, String(settings.autoZeroX));
      if (!wasOn && settings.autoZeroX && onAutoZeroXEnabled) onAutoZeroXEnabled();
      if (wasOn && !settings.autoZeroX && onAutoZeroXDisabled) onAutoZeroXDisabled();
    };
    autoZero.addEventListener("change", handler);
    cleanups.push(() => autoZero.removeEventListener("change", handler));
  }

  const autoNonAdj = /** @type {HTMLInputElement | null} */ (document.querySelector("#settingTentsAutoNonAdjX"));
  if (autoNonAdj) {
    autoNonAdj.checked = settings.autoNonAdjX;
    const handler = () => {
      const wasOn = settings.autoNonAdjX;
      settings.autoNonAdjX = autoNonAdj.checked;
      localStorage.setItem(SETTINGS_KEY_AUTO_NON_ADJ_X, String(settings.autoNonAdjX));
      if (!wasOn && settings.autoNonAdjX && onAutoNonAdjXEnabled) onAutoNonAdjXEnabled();
      if (wasOn && !settings.autoNonAdjX && onAutoNonAdjXDisabled) onAutoNonAdjXDisabled();
    };
    autoNonAdj.addEventListener("change", handler);
    cleanups.push(() => autoNonAdj.removeEventListener("change", handler));
  }

  return () => cleanups.forEach(fn => fn());
}

function orthoNeighbors(cell, size) {
  const row = Math.floor(cell / size);
  const col = cell % size;
  const result = [];
  if (row > 0) result.push(cell - size);
  if (row < size - 1) result.push(cell + size);
  if (col > 0) result.push(cell - 1);
  if (col < size - 1) result.push(cell + 1);
  return result;
}

function hasValidPairing(trees, marks, size) {
  const treeList = [...trees];
  const candidates = treeList.map(tree =>
    orthoNeighbors(tree, size).filter(c => marks.has(c))
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

function getNeighbors8(cell, size) {
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

function createTreeIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "cell-icon");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("aria-hidden", "true");

  // Ground shadow
  const shadow = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  shadow.setAttribute("class", "tree-shadow");
  shadow.setAttribute("cx", "24");
  shadow.setAttribute("cy", "42");
  shadow.setAttribute("rx", "10");
  shadow.setAttribute("ry", "3");

  // Trunk
  const trunk = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  trunk.setAttribute("class", "tree-trunk");
  trunk.setAttribute("x", "21");
  trunk.setAttribute("y", "26");
  trunk.setAttribute("width", "6");
  trunk.setAttribute("height", "14");
  trunk.setAttribute("rx", "2");

  // Bottom foliage layer (widest)
  const foliage1 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  foliage1.setAttribute("class", "tree-foliage tree-foliage-dark");
  foliage1.setAttribute("points", "24,18 38,32 10,32");

  // Middle foliage layer
  const foliage2 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  foliage2.setAttribute("class", "tree-foliage tree-foliage-mid");
  foliage2.setAttribute("points", "24,10 34,24 14,24");

  // Top foliage layer (narrowest)
  const foliage3 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  foliage3.setAttribute("class", "tree-foliage tree-foliage-light");
  foliage3.setAttribute("points", "24,3 30,16 18,16");

  svg.append(shadow, trunk, foliage1, foliage2, foliage3);
  return svg;
}

function createTentIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "cell-icon");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("aria-hidden", "true");

  // Ground line
  const ground = document.createElementNS("http://www.w3.org/2000/svg", "line");
  ground.setAttribute("class", "tent-ground");
  ground.setAttribute("x1", "4");
  ground.setAttribute("y1", "38");
  ground.setAttribute("x2", "44");
  ground.setAttribute("y2", "38");

  // Left side of tent
  const leftSide = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  leftSide.setAttribute("class", "tent-left");
  leftSide.setAttribute("points", "24,5 24,38 6,38");

  // Right side of tent
  const rightSide = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  rightSide.setAttribute("class", "tent-right");
  rightSide.setAttribute("points", "24,5 24,38 42,38");

  // Tent outline
  const outline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  outline.setAttribute("class", "tent-outline");
  outline.setAttribute("points", "24,5 42,38 6,38");

  // Entrance flap
  const entrance = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  entrance.setAttribute("class", "tent-entrance");
  entrance.setAttribute("points", "24,18 32,38 16,38");

  // Ridge line at top
  const ridge = document.createElementNS("http://www.w3.org/2000/svg", "line");
  ridge.setAttribute("class", "tent-ridge");
  ridge.setAttribute("x1", "24");
  ridge.setAttribute("y1", "5");
  ridge.setAttribute("x2", "24");
  ridge.setAttribute("y2", "38");

  svg.append(ground, leftSide, rightSide, entrance, outline, ridge);
  return svg;
}

function createGrassIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "grass-icon");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("aria-hidden", "true");

  // Small ground mound
  svg.append(svgPath("M10 42 Q24 38 38 42 Z", "grass-mound"));

  // Five little blades — filled leaf shapes curving gently
  svg.append(svgPath("M12 42 Q10 32 14 22 Q16 32 14 42 Z", "grass-blade-foliage grass-foliage-dark"));
  svg.append(svgPath("M18 42 Q17 30 21 18 Q23 30 21 42 Z", "grass-blade-foliage grass-foliage-mid"));
  svg.append(svgPath("M24 42 Q24 28 23 14 Q26 28 26 42 Z", "grass-blade-foliage grass-foliage-dark"));
  svg.append(svgPath("M30 42 Q31 30 28 20 Q31 30 33 42 Z", "grass-blade-foliage grass-foliage-mid"));
  svg.append(svgPath("M36 42 Q38 32 35 24 Q37 32 38 42 Z", "grass-blade-foliage grass-foliage-light"));

  return svg;
}

function svgPath(d, className) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", className);
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  return path;
}

function createLakeIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "lake-icon");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("aria-hidden", "true");

  const ns = "http://www.w3.org/2000/svg";

  // Organic pond — top-down view, gently irregular
  const puddle = document.createElementNS(ns, "path");
  puddle.setAttribute("class", "lake-puddle");
  puddle.setAttribute("d", "M6 24 C5 16 14 9 22 10 C30 9 41 13 43 22 C45 30 39 38 30 39 C22 40 13 38 8 33 C5 30 6 27 6 24 Z");
  svg.append(puddle);

  // Wave ripples on the surface
  svg.append(svgPath("M14 22 Q19 19 24 22 T34 22", "lake-wave"));
  svg.append(svgPath("M16 30 Q21 27 26 30 T34 30", "lake-wave"));

  return svg;
}
