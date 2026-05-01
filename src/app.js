import {
  PRESETS,
  decodeId,
  decodeCode,
  solutionKey,
  checksumFor,
} from "./generator.js";

/** @type {{ puzzle: any, marks: Set<number>, xMarks: Set<number>, dragging: string | null, touchPending: { index: number, meta: any, startX: number, startY: number, timer: number, fired: boolean } | null, lastCreatedId: string | null, creatingTimer: any }} */
const state = {
  puzzle: null,
  marks: new Set(),
  xMarks: new Set(),
  dragging: null,
  touchPending: null,
  lastCreatedId: null,
  creatingTimer: null,
};

const LONG_PRESS_MS = 350;
const TOUCH_MOVE_THRESHOLD_PX = 10;

const els = {
  creatorPanel: document.querySelector("#creatorPanel"),
  gamePanel: document.querySelector("#gamePanel"),
  rulesPanel: document.querySelector("#rulesPanel"),
  createMode: document.querySelector("#createMode"),
  backToPuzzle: document.querySelector("#backToPuzzle"),
  creator: document.querySelector("#creator"),
  creatorMessage: document.querySelector("#creatorMessage"),
  difficulty: document.querySelector("#difficulty"),
  shapeStyle: document.querySelector("#shapeStyle"),
  giftCode: document.querySelector("#giftCode"),
  linkPanel: document.querySelector("#linkPanel"),
  shareLink: document.querySelector("#shareLink"),
  copyLink: document.querySelector("#copyLink"),
  openPuzzle: document.querySelector("#openPuzzle"),
  puzzleName: document.querySelector("#puzzleName"),
  progressText: document.querySelector("#progressText"),
  colClues: document.querySelector("#colClues"),
  rowClues: document.querySelector("#rowClues"),
  rowCluesRight: document.querySelector("#rowCluesRight"),
  board: document.querySelector("#board"),
  hintText: document.querySelector("#hintText"),
  resetPuzzle: document.querySelector("#resetPuzzle"),
  winDialog: document.querySelector("#winDialog"),
  giftLink: document.querySelector("#giftLink"),
};

const savedDifficulty = localStorage.getItem("thermogift:difficulty");
if (savedDifficulty && [...els.difficulty.options].some((opt) => opt.value === savedDifficulty)) {
  els.difficulty.value = savedDifficulty;
}
const savedShape = localStorage.getItem("thermogift:shapeStyle");
if (savedShape && [...els.shapeStyle.options].some((opt) => opt.value === savedShape)) {
  els.shapeStyle.value = savedShape;
}
els.difficulty.addEventListener("change", () => localStorage.setItem("thermogift:difficulty", els.difficulty.value));
els.shapeStyle.addEventListener("change", () => localStorage.setItem("thermogift:shapeStyle", els.shapeStyle.value));

els.creator.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = els.giftCode.value.trim();
  const presetId = els.difficulty.value;
  const shapeStyle = els.shapeStyle.value;
  const submitButton = els.creator.querySelector("button[type='submit']");

  if (!/^[A-Za-z0-9]{5}$/.test(code)) {
    els.giftCode.focus();
    return;
  }

  submitButton.disabled = true;
  setCreatingState(submitButton, true);
  els.linkPanel.hidden = true;
  setCreatorMessage("Creating puzzle in the background...", false);

  try {
    const id = await generatePuzzleId(presetId, shapeStyle, code);
    const url = new URL(window.location.href);
    url.search = `?id=${id}`;
    history.replaceState(null, "", url);

    state.lastCreatedId = id;
    localStorage.setItem("thermogift:lastPuzzle", id);
    els.shareLink.value = url.href;
    els.openPuzzle.hidden = false;
    setCreatorMessage("Puzzle link ready.", false);
    loadFromId(id);
    els.creatorPanel.hidden = false;
    els.linkPanel.hidden = false;
    els.createMode.textContent = "Hide creator";
  } catch (error) {
    setCreatorMessage(error.message || "Could not create that puzzle. Try again or choose a smaller preset.", true);
  } finally {
    submitButton.disabled = false;
    setCreatingState(submitButton, false);
  }
});

els.createMode.addEventListener("click", () => {
  toggleCreatorPanel();
});

els.backToPuzzle.addEventListener("click", () => {
  const id = state.puzzle?.id ?? state.lastCreatedId ?? localStorage.getItem("thermogift:lastPuzzle");
  if (id) openPuzzle(id);
});

els.openPuzzle.addEventListener("click", () => {
  const id = state.lastCreatedId ?? localStorage.getItem("thermogift:lastPuzzle");
  if (id) openPuzzle(id);
});

els.copyLink.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.shareLink.value);
  els.copyLink.textContent = "Copied";
  setTimeout(() => {
    els.copyLink.textContent = "Copy";
  }, 1000);
});

els.resetPuzzle.addEventListener("click", () => {
  const confirmRow = document.createElement("div");
  confirmRow.className = "reset-confirm";
  const label = document.createElement("span");
  label.textContent = "Are you sure?";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.textContent = "Yes";
  const no = document.createElement("button");
  no.type = "button";
  no.textContent = "No";

  const restore = () => confirmRow.replaceWith(els.resetPuzzle);
  yes.addEventListener("click", () => {
    state.marks.clear();
    state.xMarks.clear();
    saveProgress();
    renderPuzzle();
    restore();
  });
  no.addEventListener("click", restore);

  confirmRow.append(label, yes, no);
  els.resetPuzzle.replaceWith(confirmRow);
});

window.addEventListener("pointerup", () => {
  state.dragging = null;
  cancelTouchPending();
});

window.addEventListener("pointercancel", () => {
  state.dragging = null;
  cancelTouchPending();
});

function cancelTouchPending() {
  if (state.touchPending?.timer) clearTimeout(state.touchPending.timer);
  state.touchPending = null;
}

function loadFromLocation() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (id) {
    loadFromId(id);
  } else {
    showCreateMode();
  }
}

function loadFromId(id) {
  try {
    const payload = decodeId(id);
    state.puzzle = {
      shapeStyle: payload.shapeStyle,
      size: payload.size,
      thermos: payload.thermos,
      rowClues: payload.rowClues,
      colClues: payload.colClues,
      cipher: payload.cipher,
      checksum: payload.checksum,
      id,
    };
    localStorage.setItem("thermogift:lastPuzzle", id);
    loadProgress();
    els.puzzleName.textContent = puzzleLabel(payload);
    els.hintText.textContent = "Click cells to fill them. A solved grid unlocks the giveaway code.";
    showSolverMode();
    renderPuzzle();
  } catch (error) {
    localStorage.removeItem("thermogift:lastPuzzle");
    showCreateMode();
    els.hintText.textContent = "That puzzle link could not be read. Create a fresh one above.";
  }
}

function showCreateMode() {
  els.creatorPanel.hidden = false;
  els.gamePanel.hidden = true;
  els.rulesPanel.hidden = true;
  els.linkPanel.hidden = !els.shareLink.value;
  els.createMode.hidden = true;
  els.backToPuzzle.hidden = !activePuzzleId();
  const url = new URL(window.location.href);
  url.search = "?create=1";
  history.replaceState(null, "", url);
}

function showSolverMode() {
  els.creatorPanel.hidden = true;
  els.linkPanel.hidden = true;
  els.gamePanel.hidden = false;
  els.rulesPanel.hidden = false;
  els.createMode.hidden = false;
  els.createMode.textContent = "Create your own";
  els.backToPuzzle.hidden = true;
}

function toggleCreatorPanel() {
  const opening = els.creatorPanel.hidden;
  els.creatorPanel.hidden = !opening;
  els.linkPanel.hidden = !opening || !els.shareLink.value;
  els.createMode.textContent = opening ? "Hide creator" : "Create your own";
}

function openPuzzle(id) {
  const url = new URL(window.location.href);
  url.search = `?id=${id}`;
  history.replaceState(null, "", url);
  loadFromId(id);
}

function activePuzzleId() {
  return state.puzzle?.id ?? state.lastCreatedId ?? localStorage.getItem("thermogift:lastPuzzle");
}

function puzzleLabel(payload) {
  const preset = Object.values(PRESETS).find((p) => p.size === payload.size);
  const base = preset?.label ?? `Custom ${payload.size}x${payload.size}`;
  return payload.shapeStyle === "straight" ? `${base} Straight` : base;
}

function generatePuzzleId(presetId, shapeStyle, code) {
  const workerCount = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 6));
  return new Promise((resolve, reject) => {
    const workerUrl = new URL("./generator-worker.js", import.meta.url);
    workerUrl.searchParams.set("v", Date.now().toString());
    const workers = [];
    let pending = workerCount;
    let settled = false;
    let lastError = null;

    const finishOk = (id) => {
      if (settled) return;
      settled = true;
      workers.forEach((w) => w.terminate());
      resolve(id);
    };
    const finishFail = () => {
      if (settled) return;
      settled = true;
      workers.forEach((w) => w.terminate());
      reject(lastError ?? new Error("Generation failed"));
    };

    for (let i = 0; i < workerCount; i += 1) {
      const worker = new Worker(workerUrl, { type: "module" });
      workers.push(worker);
      worker.addEventListener("message", (event) => {
        if (event.data?.ok) {
          finishOk(event.data.id);
        } else {
          lastError = new Error(event.data?.error ?? "Generation failed");
          pending -= 1;
          if (pending === 0) finishFail();
        }
      });
      worker.addEventListener("error", (event) => {
        lastError = event.error ?? new Error(event.message);
        pending -= 1;
        if (pending === 0) finishFail();
      });
      worker.postMessage({ presetId, shapeStyle, code });
    }
  });
}

function setCreatingState(button, creating) {
  if (!creating) {
    clearInterval(state.creatingTimer);
    state.creatingTimer = null;
    button.textContent = "Create link";
    return;
  }

  let dots = 0;
  button.textContent = "Creating";
  state.creatingTimer = setInterval(() => {
    dots = (dots + 1) % 4;
    button.textContent = `Creating${".".repeat(dots)}`;
  }, 350);
}

function setCreatorMessage(message, isError) {
  els.creatorMessage.textContent = message;
  els.creatorMessage.classList.toggle("error", isError);
}

function renderPuzzle() {
  const puzzle = state.puzzle;
  if (!puzzle) return;

  els.colClues.style.gridTemplateColumns = `repeat(${puzzle.size}, var(--cell))`;
  els.rowClues.style.gridTemplateRows = `repeat(${puzzle.size}, var(--cell))`;
  els.rowCluesRight.style.gridTemplateRows = `repeat(${puzzle.size}, var(--cell))`;
  els.board.style.gridTemplateColumns = `repeat(${puzzle.size}, var(--cell))`;
  els.board.style.gridTemplateRows = `repeat(${puzzle.size}, var(--cell))`;
  els.board.parentElement.parentElement.style.setProperty("--grid-size", puzzle.size);

  els.colClues.replaceChildren(...puzzle.colClues.map((clue, index) => clueEl(clue, columnCount(index))));
  els.rowClues.replaceChildren(...puzzle.rowClues.map((clue, index) => clueEl(clue, rowCount(index))));
  els.rowCluesRight.replaceChildren(...puzzle.rowClues.map((clue, index) => clueEl(clue, rowCount(index))));

  const thermoByCell = new Map();
  puzzle.thermos.forEach((thermo, thermoIndex) => thermo.forEach((cell, pathIndex) => thermoByCell.set(cell, { thermo, thermoIndex, pathIndex })));

  const cells = Array.from({ length: puzzle.size * puzzle.size }, (_, index) => {
    const button = document.createElement("button");
    const meta = thermoByCell.get(index);
    button.type = "button";
    button.className = cellClass(index);
    button.ariaLabel = `Row ${Math.floor(index / puzzle.size) + 1}, column ${(index % puzzle.size) + 1}`;
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (state.touchPending || event.pointerType === "touch") return;
      toggleXMark(index);
    });
    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.pointerType === "touch") {
        if (event.target instanceof Element && event.target.hasPointerCapture(event.pointerId)) {
          event.target.releasePointerCapture(event.pointerId);
        }
        cancelTouchPending();
        const timer = window.setTimeout(() => {
          if (!state.touchPending) return;
          state.touchPending.fired = true;
          toggleXMark(state.touchPending.index);
        }, LONG_PRESS_MS);
        state.touchPending = { index, meta, startX: event.clientX, startY: event.clientY, timer, fired: false };
        return;
      }
      state.dragging = markMode(meta);
      setThermoMark(meta, state.dragging);
    });
    button.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "touch" || !state.touchPending) return;
      const dx = event.clientX - state.touchPending.startX;
      const dy = event.clientY - state.touchPending.startY;
      if (dx * dx + dy * dy < TOUCH_MOVE_THRESHOLD_PX * TOUCH_MOVE_THRESHOLD_PX) return;
      cancelTouchPending();
    });
    button.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch") return;
      const pending = state.touchPending;
      if (!pending || pending.fired) return;
      cancelTouchPending();
      if (pending.index !== index || !pending.meta) return;
      const mode = markMode(pending.meta);
      setThermoMark(pending.meta, mode);
    });
    button.addEventListener("pointerenter", (event) => {
      if (event.buttons === 1 && state.dragging !== null) setThermoMark(meta, state.dragging);
    });
    renderThermoGlyph(button, index, meta);
    return button;
  });
  els.board.replaceChildren(...cells);

  updateProgress();
}

function markMode(meta) {
  return state.marks.has(meta.thermo[meta.pathIndex]) ? "clear" : "fill";
}

function setThermoMark(meta, mode) {
  if (!meta) return;
  if (mode === "fill") {
    meta.thermo.slice(0, meta.pathIndex + 1).forEach((cell) => {
      state.marks.add(cell);
      state.xMarks.delete(cell);
    });
  } else {
    meta.thermo.slice(meta.pathIndex).forEach((cell) => state.marks.delete(cell));
  }
  saveProgress();
  renderPuzzle();
  maybeReveal();
}

function toggleXMark(index) {
  state.marks.delete(index);
  if (state.xMarks.has(index)) state.xMarks.delete(index);
  else state.xMarks.add(index);
  saveProgress();
  renderPuzzle();
}

function cellClass(index) {
  const classes = ["cell"];
  if (state.marks.has(index)) classes.push("filled");
  if (state.xMarks.has(index)) classes.push("x-marked");
  return classes.join(" ");
}

function renderThermoGlyph(button, index, meta) {
  if (!meta) return;
  const directions = new Set();
  [meta.thermo[meta.pathIndex - 1], meta.thermo[meta.pathIndex + 1]].forEach((cell) => {
    if (cell === undefined) return;
    const diff = cell - index;
    if (diff === -1) directions.add("left");
    if (diff === 1) directions.add("right");
    if (diff === -state.puzzle.size) directions.add("up");
    if (diff === state.puzzle.size) directions.add("down");
  });

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "thermo-svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("aria-hidden", "true");

  const paths = pathsForDirections([...directions]);
  paths.forEach(({ d, end }) => {
    const endClass = end ? " tube-end" : "";
    svg.append(svgPath(d, `tube-outer${endClass}`));
    svg.append(svgPath(d, `tube-inner${endClass}`));
  });

  if (meta.pathIndex === 0) {
    const bulbDirection = [...directions][0];
    const neck = bulbNeckForDirection(bulbDirection);
    if (neck) svg.append(svgPath(neck, "bulb-neck"));

    const bulbFill = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bulbFill.setAttribute("class", "bulb-fill");
    bulbFill.setAttribute("cx", "24");
    bulbFill.setAttribute("cy", "24");
    bulbFill.setAttribute("r", "12");
    const bulbOutline = svgPath(bulbOutlinePath(bulbDirection), "bulb-outline");
    svg.append(bulbFill, bulbOutline);
  }

  button.append(svg);

  if (state.xMarks.has(index)) {
    const x = document.createElement("span");
    x.className = "x-mark";
    x.textContent = "X";
    button.append(x);
  }
}

function svgPath(d, className) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", className);
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  return path;
}

function pathsForDirections(directions) {
  const points = {
    up: [24, -4],
    right: [52, 24],
    down: [24, 52],
    left: [-4, 24],
    center: [24, 24],
  };

  if (directions.length === 0) return [];
  if (directions.length === 1) {
    const point = points[directions[0]];
    return [{ d: `M ${point[0]} ${point[1]} L 24 24`, end: true }];
  }

  const [first, second] = directions;
  const a = points[first];
  const b = points[second];
  return [{ d: `M ${a[0]} ${a[1]} L 24 24 L ${b[0]} ${b[1]}`, end: false }];
}

function bulbNeckForDirection(direction) {
  if (direction === "up") return "M 24 24 L 24 6";
  if (direction === "right") return "M 24 24 L 42 24";
  if (direction === "down") return "M 24 24 L 24 42";
  if (direction === "left") return "M 24 24 L 6 24";
  return "";
}

function bulbOutlinePath(direction) {
  const center = { x: 24, y: 24 };
  const radius = 14;
  const gap = 72;
  const directionAngles = { right: 0, down: 90, left: 180, up: 270 };
  const middle = directionAngles[direction] ?? 0;
  const start = polarPoint(center, radius, middle + gap / 2);
  const end = polarPoint(center, radius, middle - gap / 2);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;
}

function polarPoint(center, radius, degrees) {
  const radians = degrees * Math.PI / 180;
  return {
    x: Number((center.x + radius * Math.cos(radians)).toFixed(3)),
    y: Number((center.y + radius * Math.sin(radians)).toFixed(3)),
  };
}

function maybeReveal() {
  const puzzle = state.puzzle;
  if (!puzzle || !isSolved()) return;
  const current = Array.from({ length: puzzle.size * puzzle.size }, (_, index) => state.marks.has(index));
  const code = decodeCode(puzzle.cipher, solutionKey(current, puzzle.size));
  if (!/^[A-Za-z0-9]{5}$/.test(code) || checksumFor(code, current, puzzle.size) !== puzzle.checksum) {
    els.progressText.textContent = "Check mistakes";
    return;
  }
  const href = `https://www.steamgifts.com/giveaway/${code}/`;
  els.giftLink.href = href;
  els.giftLink.textContent = href;
  els.winDialog.showModal();
}

function isSolved() {
  const puzzle = state.puzzle;
  const rowsOk = puzzle.rowClues.every((clue, row) => rowCount(row) === clue);
  const colsOk = puzzle.colClues.every((clue, col) => columnCount(col) === clue);
  const thermosOk = puzzle.thermos.every((thermo) => {
    const marks = thermo.map((cell) => state.marks.has(cell));
    const firstGap = marks.indexOf(false);
    return firstGap === -1 || marks.slice(firstGap + 1).every((mark) => !mark);
  });
  return rowsOk && colsOk && thermosOk;
}

function updateProgress() {
  const puzzle = state.puzzle;
  const target = puzzle.rowClues.reduce((sum, clue) => sum + clue, 0);
  const filled = state.marks.size;
  const anyOver = puzzle.rowClues.some((clue, row) => rowCount(row) > clue) ||
    puzzle.colClues.some((clue, col) => columnCount(col) > clue);
  const countsMatched = puzzle.rowClues.every((clue, row) => rowCount(row) === clue) &&
    puzzle.colClues.every((clue, col) => columnCount(col) === clue);

  if (anyOver) {
    els.progressText.textContent = "Check mistakes";
  } else if (countsMatched) {
    els.progressText.textContent = "Counts matched";
  } else {
    els.progressText.textContent = target ? `${Math.round((filled / target) * 100)}%` : "0%";
  }
}

function progressKey() {
  return state.puzzle?.id ? `thermogift:progress:${state.puzzle.id}` : "";
}

function saveProgress() {
  const key = progressKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify({
    marks: [...state.marks],
    xMarks: [...state.xMarks],
  }));
}

function loadProgress() {
  state.marks.clear();
  state.xMarks.clear();
  const key = progressKey();
  if (!key) return;

  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
    const max = state.puzzle.size * state.puzzle.size;
    if (Array.isArray(saved.marks)) {
      saved.marks.forEach((cell) => {
        if (Number.isInteger(cell) && cell >= 0 && cell < max) state.marks.add(cell);
      });
    }
    if (Array.isArray(saved.xMarks)) {
      saved.xMarks.forEach((cell) => {
        if (Number.isInteger(cell) && cell >= 0 && cell < max && !state.marks.has(cell)) state.xMarks.add(cell);
      });
    }
  } catch (error) {
    localStorage.removeItem(key);
  }
}

function clueEl(clue, count) {
  const element = document.createElement("div");
  const stateClass = count === clue ? "met" : count > clue ? "over" : "";
  element.className = `col-clue ${stateClass}`;
  element.textContent = clue;
  return element;
}

function rowCount(row) {
  let count = 0;
  for (let col = 0; col < state.puzzle.size; col += 1) {
    if (state.marks.has(row * state.puzzle.size + col)) count += 1;
  }
  return count;
}

function columnCount(col) {
  let count = 0;
  for (let row = 0; row < state.puzzle.size; row += 1) {
    if (state.marks.has(row * state.puzzle.size + col)) count += 1;
  }
  return count;
}


loadFromLocation();
