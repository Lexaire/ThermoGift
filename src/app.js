import {
  PRESETS,
  availableShapesFor,
  decodeId,
  decodeCode,
  solutionKey,
  checksumFor,
  decodeIdV2,
  encodeIdV2,
  solutionKeyBytes,
  checksumForBytes,
} from "./generator.js";

/** @typedef {{ marks: number[], xMarks: number[] }} HistorySnapshot */
/** @typedef {{ kind: "mark" | "xMark", mode: string }} DragState */

/** @type {{ puzzle: any, marks: Set<number>, xMarks: Set<number>, history: HistorySnapshot[], dragging: DragState | null, touchPending: { index: number, meta: any, startX: number, startY: number, timer: number, fired: boolean } | null, lastCreatedId: string | null, lastCreatedTitle: string, generatingFresh: boolean, settings: { autoXAxis: boolean, cascadeThermoX: boolean, cascadeThermoFill: boolean, dimMatchedClues: boolean } }} */
const state = {
  puzzle: null,
  marks: new Set(),
  xMarks: new Set(),
  history: [],
  dragging: null,
  touchPending: null,
  lastCreatedId: null,
  lastCreatedTitle: "",
  generatingFresh: false,
  settings: {
    autoXAxis: false,
    cascadeThermoX: false,
    cascadeThermoFill: false,
    dimMatchedClues: false,
  },
};

const HISTORY_LIMIT = 50;

const SETTINGS_KEYS = /** @type {const} */ ({
  autoXAxis: "thermogift:assist:autoXAxis",
  cascadeThermoX: "thermogift:assist:cascadeThermoX",
  cascadeThermoFill: "thermogift:assist:cascadeThermoFill",
  dimMatchedClues: "thermogift:assist:dimMatchedClues",
});

const LONG_PRESS_MS = 350;
const TOUCH_MOVE_THRESHOLD_PX = 10;

const els = {
  creatorPanel: document.querySelector("#creatorPanel"),
  gamePanel: document.querySelector("#gamePanel"),
  rulesPanel: document.querySelector("#rulesPanel"),
  createMode: document.querySelector("#createMode"),
  creator: document.querySelector("#creator"),
  creatorMessage: document.querySelector("#creatorMessage"),
  giftCode: /** @type {HTMLInputElement} */ (document.querySelector("#giftCode")),
  giftTitle: /** @type {HTMLInputElement} */ (document.querySelector("#giftTitle")),
  linkPanel: document.querySelector("#linkPanel"),
  shareLink: document.querySelector("#shareLink"),
  copyLink: document.querySelector("#copyLink"),
  openPuzzle: document.querySelector("#openPuzzle"),
  puzzleName: document.querySelector("#puzzleName"),
  progressText: document.querySelector("#progressText"),
  colClues: document.querySelector("#colClues"),
  rowClues: document.querySelector("#rowClues"),
  rowCluesRight: /** @type {HTMLElement} */ (document.querySelector("#rowCluesRight")),
  board: document.querySelector("#board"),
  hintText: document.querySelector("#hintText"),
  undoMove: /** @type {HTMLButtonElement} */ (document.querySelector("#undoMove")),
  resetPuzzle: /** @type {HTMLButtonElement} */ (document.querySelector("#resetPuzzle")),
  newDifficulty: document.querySelector("#newDifficulty"),
  newShapeStyle: document.querySelector("#newShapeStyle"),
  newPuzzle: /** @type {HTMLButtonElement} */ (document.querySelector("#newPuzzle")),
  winDialog: document.querySelector("#winDialog"),
  winTitle: document.querySelector("#winTitle"),
  winMessage: document.querySelector("#winMessage"),
  giftLink: /** @type {HTMLAnchorElement} */ (document.querySelector("#giftLink")),
  giftSecret: /** @type {HTMLElement} */ (document.querySelector("#giftSecret")),
  themeToggle: /** @type {HTMLButtonElement} */ (document.querySelector("#themeToggle")),
  settingsToggle: /** @type {HTMLButtonElement} */ (document.querySelector("#settingsToggle")),
  settingsDialog: /** @type {HTMLDialogElement} */ (document.querySelector("#settingsDialog")),
  settingAutoXAxis: /** @type {HTMLInputElement} */ (document.querySelector("#settingAutoXAxis")),
  settingCascadeThermoX: /** @type {HTMLInputElement} */ (document.querySelector("#settingCascadeThermoX")),
  settingCascadeThermoFill: /** @type {HTMLInputElement} */ (document.querySelector("#settingCascadeThermoFill")),
  settingDimMatchedClues: /** @type {HTMLInputElement} */ (document.querySelector("#settingDimMatchedClues")),
};

/** @type {readonly ("auto" | "light" | "dark")[]} */
const THEME_CYCLE = ["auto", "light", "dark"];

/** @param {"auto" | "light" | "dark"} theme */
function applyTheme(theme) {
  if (theme === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
  els.themeToggle.setAttribute("aria-label", `Theme: ${theme} (click for ${next})`);
  els.themeToggle.title = `Theme: ${theme}`;
}

function currentTheme() {
  const t = localStorage.getItem("thermogift:theme");
  return t === "light" || t === "dark" || t === "auto" ? t : "auto";
}

applyTheme(currentTheme());

els.themeToggle.addEventListener("click", () => {
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(currentTheme()) + 1) % THEME_CYCLE.length];
  localStorage.setItem("thermogift:theme", next);
  applyTheme(next);
});

function loadSettings() {
  state.settings.autoXAxis = localStorage.getItem(SETTINGS_KEYS.autoXAxis) === "true";
  state.settings.cascadeThermoX = localStorage.getItem(SETTINGS_KEYS.cascadeThermoX) === "true";
  state.settings.cascadeThermoFill = localStorage.getItem(SETTINGS_KEYS.cascadeThermoFill) === "true";
  state.settings.dimMatchedClues = localStorage.getItem(SETTINGS_KEYS.dimMatchedClues) === "true";
  els.settingAutoXAxis.checked = state.settings.autoXAxis;
  els.settingCascadeThermoX.checked = state.settings.cascadeThermoX;
  els.settingCascadeThermoFill.checked = state.settings.cascadeThermoFill;
  els.settingDimMatchedClues.checked = state.settings.dimMatchedClues;
}

loadSettings();

els.settingsToggle.addEventListener("click", () => {
  els.settingsDialog.showModal();
});

els.settingAutoXAxis.addEventListener("change", () => {
  state.settings.autoXAxis = els.settingAutoXAxis.checked;
  localStorage.setItem(SETTINGS_KEYS.autoXAxis, String(state.settings.autoXAxis));
  if (state.puzzle) renderPuzzle();
});

els.settingCascadeThermoX.addEventListener("change", () => {
  state.settings.cascadeThermoX = els.settingCascadeThermoX.checked;
  localStorage.setItem(SETTINGS_KEYS.cascadeThermoX, String(state.settings.cascadeThermoX));
});

els.settingCascadeThermoFill.addEventListener("change", () => {
  state.settings.cascadeThermoFill = els.settingCascadeThermoFill.checked;
  localStorage.setItem(SETTINGS_KEYS.cascadeThermoFill, String(state.settings.cascadeThermoFill));
});

els.settingDimMatchedClues.addEventListener("change", () => {
  state.settings.dimMatchedClues = els.settingDimMatchedClues.checked;
  localStorage.setItem(SETTINGS_KEYS.dimMatchedClues, String(state.settings.dimMatchedClues));
  if (state.puzzle) renderPuzzle();
});

const savedNewDifficulty = localStorage.getItem("thermogift:newDifficulty");
if (savedNewDifficulty && [...els.newDifficulty.options].some((opt) => opt.value === savedNewDifficulty)) {
  els.newDifficulty.value = savedNewDifficulty;
}
const savedNewShape = localStorage.getItem("thermogift:newShapeStyle");
if (savedNewShape && [...els.newShapeStyle.options].some((opt) => opt.value === savedNewShape)) {
  els.newShapeStyle.value = savedNewShape;
}

// Both shape options stay selectable. When shape changes, grey out difficulty
// options the constructive generator can't reach in that shape and bump the
// selection to the largest still-allowed difficulty.
function syncDifficultyOptionsForShape() {
  const shape = els.newShapeStyle.value;
  let lastAllowed = null;
  for (const opt of els.newDifficulty.options) {
    const ok = availableShapesFor(opt.value).includes(shape);
    opt.disabled = !ok;
    if (ok) lastAllowed = opt.value;
  }
  const currentOpt = [...els.newDifficulty.options].find((o) => o.value === els.newDifficulty.value);
  if ((!currentOpt || currentOpt.disabled) && lastAllowed) {
    els.newDifficulty.value = lastAllowed;
  }
}
syncDifficultyOptionsForShape();

els.newDifficulty.addEventListener("change", () => localStorage.setItem("thermogift:newDifficulty", els.newDifficulty.value));
els.newShapeStyle.addEventListener("change", () => {
  localStorage.setItem("thermogift:newShapeStyle", els.newShapeStyle.value);
  syncDifficultyOptionsForShape();
});

els.newPuzzle.addEventListener("click", () => {
  generateFreshPuzzle(els.newDifficulty.value, els.newShapeStyle.value);
});

els.creator.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = els.giftCode.value;
  const solution = currentSolutionForEmbed();
  if (!solution) {
    setCreatorMessage("Solve this puzzle or create a new one to embed a code.", true);
    return;
  }
  try {
    const id = embedSecretIntoCurrent(state.puzzle, solution, code);
    const title = els.giftTitle.value.trim();
    const url = new URL(window.location.href);
    const params = new URLSearchParams();
    params.set("id", id);
    if (title) params.set("title", title);
    url.search = `?${params.toString()}`;
    state.lastCreatedId = id;
    state.lastCreatedTitle = title;
    localStorage.setItem("thermogift:lastPuzzle", id);
    if (title) localStorage.setItem("thermogift:lastPuzzleTitle", title);
    else localStorage.removeItem("thermogift:lastPuzzleTitle");
    els.shareLink.value = url.href;
    els.openPuzzle.hidden = false;
    els.linkPanel.hidden = false;
    setCreatorMessage("Puzzle link ready. Share it.", false);
  } catch (error) {
    setCreatorMessage(error.message || "Could not embed that code.", true);
  }
});

function currentSolutionForEmbed() {
  const puzzle = state.puzzle;
  if (!puzzle) return null;
  if (puzzle.solution) return puzzle.solution;
  if (!isSolved()) return null;
  return Array.from({ length: puzzle.size * puzzle.size }, (_, index) => state.marks.has(index));
}

function embedSecretIntoCurrent(puzzle, solution, code) {
  const secretBytes = new TextEncoder().encode(code);
  if (secretBytes.length > 4096) throw new Error("Code too long (max 4096 UTF-8 bytes).");
  const key = solutionKeyBytes(solution, puzzle.size, secretBytes.length);
  const cipherBytes = Array.from(secretBytes, (b, i) => b ^ key[i]);
  const checksum = checksumForBytes(secretBytes, solution, puzzle.size);
  return encodeIdV2({
    size: puzzle.size,
    shapeStyle: puzzle.shapeStyle,
    thermos: puzzle.thermos,
    rowClues: puzzle.rowClues,
    colClues: puzzle.colClues,
    cipherBytes,
    checksum,
  });
}

els.createMode.addEventListener("click", () => {
  setCreatorOpen(els.creatorPanel.hidden);
});

els.openPuzzle.addEventListener("click", () => {
  const id = state.lastCreatedId ?? localStorage.getItem("thermogift:lastPuzzle");
  const title = state.lastCreatedTitle || localStorage.getItem("thermogift:lastPuzzleTitle") || "";
  if (id) openPuzzle(id, title);
});

els.copyLink.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.shareLink.value);
  els.copyLink.textContent = "Copied";
  setTimeout(() => {
    els.copyLink.textContent = "Copy";
  }, 1000);
});

els.resetPuzzle.addEventListener("click", () => {
  if (els.resetPuzzle.dataset.confirming === "true") return;
  els.resetPuzzle.dataset.confirming = "true";
  els.resetPuzzle.classList.add("is-confirming");

  const popover = document.createElement("div");
  popover.className = "reset-confirm";
  const label = document.createElement("span");
  label.textContent = "Are you sure?";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.textContent = "Yes";
  const no = document.createElement("button");
  no.type = "button";
  no.textContent = "No";

  const dismiss = () => {
    popover.remove();
    delete els.resetPuzzle.dataset.confirming;
    els.resetPuzzle.classList.remove("is-confirming");
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey);
  };
  /** @param {PointerEvent} e */
  const onOutside = (e) => {
    const target = /** @type {Node} */ (e.target);
    if (!popover.contains(target) && target !== els.resetPuzzle) dismiss();
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === "Escape") dismiss();
  };

  yes.addEventListener("click", () => {
    if (state.marks.size > 0 || state.xMarks.size > 0) pushHistory();
    state.marks.clear();
    state.xMarks.clear();
    saveProgress();
    renderPuzzle();
    dismiss();
  });
  no.addEventListener("click", dismiss);

  popover.append(label, yes, no);
  els.resetPuzzle.insertAdjacentElement("afterend", popover);
  const btnTop = els.resetPuzzle.offsetTop;
  const btnLeft = els.resetPuzzle.offsetLeft;
  const btnWidth = els.resetPuzzle.offsetWidth;
  popover.style.left = `${btnLeft + btnWidth}px`;
  popover.style.top = `${btnTop}px`;
  popover.style.transform = "translate(-100%, calc(-100% - 6px))";
  setTimeout(() => {
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey);
  }, 0);
});

els.undoMove.addEventListener("click", undo);

function pushHistory() {
  state.history.push({ marks: [...state.marks], xMarks: [...state.xMarks] });
  if (state.history.length > HISTORY_LIMIT) state.history.shift();
}

function undo() {
  const previous = state.history.pop();
  if (!previous) return;
  state.marks = new Set(previous.marks);
  state.xMarks = new Set(previous.xMarks);
  saveProgress();
  renderPuzzle();
}

function clearHistory() {
  state.history.length = 0;
}

function updateUndoButton() {
  const empty = state.history.length === 0;
  els.undoMove.disabled = empty;
  els.undoMove.title = empty ? "Nothing to undo" : "Undo last move";
}

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
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id) {
    setCreatorOpen(false);
    loadFromId(id, { isSecret: true, title: params.get("title") || "" });
    return;
  }
  if (params.get("create") === "1") setCreatorOpen(true);
  generateFreshPuzzle(els.newDifficulty.value, els.newShapeStyle.value);
}

/** @param {string} id @param {{ isSecret?: boolean, title?: string }} [opts] */
function loadFromId(id, opts = { isSecret: true }) {
  try {
    const payload = /** @type {any} */ (id.startsWith("t2-") ? decodeIdV2(id) : decodeId(id));
    const title = opts.title ?? "";
    state.puzzle = {
      shapeStyle: payload.shapeStyle,
      size: payload.size,
      thermos: payload.thermos,
      fillLengths: payload.fillLengths,
      solution: payload.solution,
      rowClues: payload.rowClues,
      colClues: payload.colClues,
      cipher: payload.cipher,
      cipherBytes: payload.cipherBytes,
      checksum: payload.checksum,
      format: payload.format ?? "t1",
      id,
      title,
      isSecret: opts.isSecret !== false,
    };
    if (state.puzzle.isSecret) localStorage.setItem("thermogift:lastPuzzle", id);
    loadProgress();
    clearCreatorLink();
    els.puzzleName.textContent = title || puzzleLabel(payload);
    els.hintText.hidden = true;
    els.hintText.textContent = "";
    revealGamePanel();
    renderPuzzle();
  } catch (error) {
    if (opts.isSecret) localStorage.removeItem("thermogift:lastPuzzle");
    if (/newer format/i.test(error?.message ?? "")) {
      localStorage.removeItem("thermogift:lastPuzzleTitle");
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith("thermogift:progress:")) localStorage.removeItem(key);
      }
    }
    revealGamePanel();
    els.hintText.hidden = false;
    els.hintText.textContent = "That puzzle link could not be read. Generate a new one below.";
  }
}

function revealGamePanel() {
  els.gamePanel.hidden = false;
  els.rulesPanel.hidden = false;
}

function setCreatorOpen(open) {
  els.creatorPanel.hidden = !open;
  els.linkPanel.hidden = !open || !els.shareLink.value;
  els.createMode.textContent = open ? "Close" : "Share this puzzle";
}

function clearCreatorLink() {
  state.lastCreatedId = null;
  els.shareLink.value = "";
  els.linkPanel.hidden = true;
  els.openPuzzle.hidden = true;
  setCreatorMessage("", false);
}

/** @param {string} id @param {string} [title] */
function openPuzzle(id, title = "") {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  params.set("id", id);
  if (title) params.set("title", title);
  url.search = `?${params.toString()}`;
  history.replaceState(null, "", url);
  setCreatorOpen(false);
  loadFromId(id, { isSecret: true, title });
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

    const finishOk = (payload) => {
      if (settled) return;
      settled = true;
      workers.forEach((w) => w.terminate());
      resolve(payload);
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
          finishOk({ id: event.data.id, solution: event.data.solution, fillLengths: event.data.fillLengths });
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

async function generateFreshPuzzle(presetId, shapeStyle) {
  if (state.generatingFresh) return;
  state.generatingFresh = true;
  const wasLabel = els.newPuzzle.textContent;
  els.newPuzzle.disabled = true;
  els.newPuzzle.textContent = "Generating…";
  els.hintText.hidden = true;
  els.hintText.textContent = "";
  try {
    const { id, solution, fillLengths } = await generatePuzzleId(presetId, shapeStyle, randomFreshCode());
    loadFromId(id, { isSecret: false });
    if (state.puzzle?.id === id) {
      state.puzzle.solution = solution;
      state.puzzle.fillLengths = fillLengths;
    }
  } catch (error) {
    revealGamePanel();
    els.hintText.hidden = false;
    els.hintText.textContent = error?.message || "Could not generate that puzzle. Try a smaller size.";
  } finally {
    state.generatingFresh = false;
    els.newPuzzle.disabled = false;
    els.newPuzzle.textContent = wasLabel;
  }
}

function randomFreshCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 5; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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

  els.colClues.replaceChildren(...puzzle.colClues.map((clue, index) => clueEl(clue, columnCount(index), "col", index)));
  els.rowClues.replaceChildren(...puzzle.rowClues.map((clue, index) => clueEl(clue, rowCount(index), "row", index)));
  els.rowCluesRight.replaceChildren(...puzzle.rowClues.map((clue, index) => clueEl(clue, rowCount(index), "row", index)));

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
    });
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        if (event.button !== 0) return;
        if (event.target instanceof Element && event.target.hasPointerCapture(event.pointerId)) {
          event.target.releasePointerCapture(event.pointerId);
        }
        cancelTouchPending();
        const timer = window.setTimeout(() => {
          if (!state.touchPending) return;
          state.touchPending.fired = true;
          setThermoXMark(state.touchPending.meta, xMarkMode(state.touchPending.meta));
        }, LONG_PRESS_MS);
        state.touchPending = { index, meta, startX: event.clientX, startY: event.clientY, timer, fired: false };
        return;
      }
      if (event.button === 0) {
        pushHistory();
        const mode = markMode(meta);
        state.dragging = { kind: "mark", mode };
        setThermoMark(meta, mode);
      } else if (event.button === 2) {
        pushHistory();
        const mode = xMarkMode(meta);
        state.dragging = { kind: "xMark", mode };
        setThermoXMark(meta, mode);
      }
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
      if (!state.dragging) return;
      if (state.dragging.kind === "mark" && (event.buttons & 1)) {
        setThermoMark(meta, state.dragging.mode);
      } else if (state.dragging.kind === "xMark" && (event.buttons & 2)) {
        setThermoXMark(meta, state.dragging.mode);
      }
    });
    renderThermoGlyph(button, index, meta);
    return button;
  });
  els.board.replaceChildren(...cells);

  updateProgress();
  updateUndoButton();
}

function markMode(meta) {
  return state.marks.has(meta.thermo[meta.pathIndex]) ? "clear" : "fill";
}

function setThermoMark(meta, mode) {
  if (!meta) return;
  if (state.dragging === null) pushHistory();
  const cell = meta.thermo[meta.pathIndex];
  if (mode === "fill") {
    if (state.settings.cascadeThermoFill) {
      meta.thermo.slice(0, meta.pathIndex + 1).forEach((c) => {
        state.marks.add(c);
        state.xMarks.delete(c);
      });
    } else {
      state.marks.add(cell);
      state.xMarks.delete(cell);
    }
  } else {
    if (state.settings.cascadeThermoFill) {
      meta.thermo.slice(meta.pathIndex).forEach((c) => state.marks.delete(c));
    } else {
      state.marks.delete(cell);
    }
  }
  scheduleSave();
  scheduleRender();
  maybeReveal();
}

function xMarkMode(meta) {
  return state.xMarks.has(meta.thermo[meta.pathIndex]) ? "clear-x" : "x";
}

function setThermoXMark(meta, mode) {
  if (!meta) return;
  if (state.dragging === null) pushHistory();
  const cell = meta.thermo[meta.pathIndex];
  if (mode === "x") {
    if (state.settings.cascadeThermoX) {
      meta.thermo.slice(meta.pathIndex).forEach((/** @type {number} */ c) => {
        state.xMarks.add(c);
        state.marks.delete(c);
      });
    } else {
      state.xMarks.add(cell);
      state.marks.delete(cell);
    }
  } else {
    if (state.settings.cascadeThermoX) {
      meta.thermo.slice(0, meta.pathIndex + 1).forEach((/** @type {number} */ c) => state.xMarks.delete(c));
    } else {
      state.xMarks.delete(cell);
    }
  }
  scheduleSave();
  scheduleRender();
  maybeReveal();
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
    const x = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    x.setAttribute("class", "x-mark");
    x.setAttribute("viewBox", "0 0 24 24");
    x.setAttribute("aria-hidden", "true");
    x.append(svgPath("M6 6 L18 18", "x-mark-outline"));
    x.append(svgPath("M18 6 L6 18", "x-mark-outline"));
    x.append(svgPath("M6 6 L18 18", "x-mark-line"));
    x.append(svgPath("M18 6 L6 18", "x-mark-line"));
    button.append(x);

    const xText = document.createElement("span");
    xText.className = "x-mark-text";
    xText.textContent = "X";
    button.append(xText);
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
  if (!puzzle.isSecret) {
    showWin("Solved!", "Nice work — generate another with “New puzzle” below.", null);
    return;
  }
  const current = Array.from({ length: puzzle.size * puzzle.size }, (_, index) => state.marks.has(index));
  const secret = decodeSecret(puzzle, current);
  if (secret === null) {
    els.progressText.textContent = "Check mistakes";
    return;
  }
  if (secret === "") {
    showWin("Solved!", "No secret was embedded in this puzzle.", null);
    return;
  }
  showWin("Secret unlocked!", "Your solved grid decodes to:", secret);
}

/** @param {any} puzzle @param {boolean[]} current @returns {string | null} */
function decodeSecret(puzzle, current) {
  if (puzzle.format === "t2") {
    const cipherBytes = puzzle.cipherBytes;
    const key = solutionKeyBytes(current, puzzle.size, cipherBytes.length);
    const plain = new Uint8Array(cipherBytes.length);
    for (let i = 0; i < cipherBytes.length; i += 1) plain[i] = cipherBytes[i] ^ key[i];
    if (checksumForBytes(plain, current, puzzle.size) !== puzzle.checksum) return null;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(plain);
    } catch {
      return null;
    }
  }
  const code = decodeCode(puzzle.cipher, solutionKey(current, puzzle.size));
  if (code.length !== puzzle.cipher.length) return null;
  if (!/^[A-Za-z0-9]+$/.test(code)) return null;
  if (checksumFor(code, current, puzzle.size) !== puzzle.checksum) return null;
  return code;
}

/** @param {string} title @param {string} message @param {string | null} secret */
function showWin(title, message, secret) {
  els.winTitle.textContent = title;
  els.winMessage.textContent = message;
  if (!secret) {
    els.giftSecret.textContent = "";
    els.giftLink.hidden = true;
    els.giftLink.removeAttribute("href");
    els.giftLink.textContent = "";
  } else {
    els.giftSecret.textContent = secret;
    const href = sniffSecretHref(secret);
    if (href) {
      els.giftLink.href = href;
      els.giftLink.textContent = href;
      els.giftLink.hidden = false;
    } else {
      els.giftLink.hidden = true;
      els.giftLink.removeAttribute("href");
      els.giftLink.textContent = "";
    }
  }
  els.winDialog.showModal();
}

/** @param {string} secret @returns {string | null} */
function sniffSecretHref(secret) {
  if (/^https?:\/\/\S+$/.test(secret)) return secret;
  if (/^[A-Za-z0-9]{5}$/.test(secret)) return `https://www.steamgifts.com/giveaway/${secret}/`;
  return null;
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

// Coalesce renders and progress saves to once per animation frame.
// Drag fires pointerenter on every cell crossed; without this, every cell
// triggers a full grid rebuild + localStorage write, which gets noticeably
// laggy at 17×17 and brutal at 26×26.
let pendingRender = false;
function scheduleRender() {
  if (pendingRender) return;
  pendingRender = true;
  requestAnimationFrame(() => { pendingRender = false; renderPuzzle(); });
}

let pendingSave = false;
function scheduleSave() {
  if (pendingSave) return;
  pendingSave = true;
  requestAnimationFrame(() => { pendingSave = false; saveProgress(); });
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
  clearHistory();
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

/**
 * @param {number} clue
 * @param {number} count
 * @param {"row" | "col"} axis
 * @param {number} index
 */
function clueEl(clue, count, axis, index) {
  const element = document.createElement("div");
  const stateClass = count === clue ? (state.settings.dimMatchedClues ? "met" : "") : count > clue ? "over" : "";
  element.className = `col-clue ${stateClass}`;
  element.textContent = String(clue);
  if (state.settings.autoXAxis && count === clue && clue > 0 && !axisFullyResolved(axis, index)) {
    element.classList.add("clickable");
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", `Fill remaining ${axis === "row" ? `row ${index + 1}` : `column ${index + 1}`} cells with X`);
    element.addEventListener("click", () => fillAxisWithX(axis, index));
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fillAxisWithX(axis, index);
      }
    });
  }
  return element;
}

function fillAxisWithX(axis, index) {
  const size = state.puzzle.size;
  const targets = [];
  for (let i = 0; i < size; i += 1) {
    const cell = axis === "row" ? index * size + i : i * size + index;
    if (!state.marks.has(cell) && !state.xMarks.has(cell)) targets.push(cell);
  }
  if (targets.length === 0) return;
  pushHistory();
  targets.forEach((cell) => state.xMarks.add(cell));
  scheduleSave();
  scheduleRender();
  maybeReveal();
}

/**
 * @param {"row" | "col"} axis
 * @param {number} index
 */
function axisFullyResolved(axis, index) {
  const size = state.puzzle.size;
  for (let i = 0; i < size; i += 1) {
    const cell = axis === "row" ? index * size + i : i * size + index;
    if (!state.marks.has(cell) && !state.xMarks.has(cell)) return false;
  }
  return true;
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
