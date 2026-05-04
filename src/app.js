// Shell: navigation, theme, settings dialog, URL routing, worker plumbing,
// progress save/load, history (undo), win-dialog, secret decoding. Knows
// about marks/xMarks at a generic-grid level; the puzzle module owns the
// board itself (rendering, glyphs, pointer handlers, cascade rules).

import {
  solutionKey,
  decodeCode,
  checksumFor,
  solutionKeyBytes,
  checksumForBytes,
} from "./common/cipher.js";
import { BitReader, idToBits } from "./common/bits.js";
import thermometers from "./puzzles/thermometers/index.js";
import tents from "./puzzles/tents/index.js";

const MODULES = { thermometers, tents };
const VARIANT_TO_MODULE = { [thermometers.variant]: thermometers, [tents.variant]: tents };
const DEFAULT_MODULE = thermometers;

/** @typedef {{ marks: number[], xMarks: number[] }} HistorySnapshot */
/** @typedef {{ kind: "mark" | "xMark", mode: string }} DragState */

/** @type {{ puzzle: any, module: any, ui: any, marks: Set<number>, xMarks: Set<number>, history: HistorySnapshot[], dragging: DragState | null, touchPending: any, lastCreatedId: string | null, lastCreatedTitle: string, generatingFresh: boolean }} */
const state = {
  puzzle: null,
  module: null,
  ui: null,
  marks: new Set(),
  xMarks: new Set(),
  history: [],
  dragging: null,
  touchPending: null,
  lastCreatedId: null,
  lastCreatedTitle: "",
  generatingFresh: false,
};

const HISTORY_LIMIT = 50;

const els = {
  creatorPanel: /** @type {HTMLElement} */ (document.querySelector("#creatorPanel")),
  gamePanel: /** @type {HTMLElement} */ (document.querySelector("#gamePanel")),
  rulesPanel: /** @type {HTMLElement} */ (document.querySelector("#rulesPanel")),
  createMode: /** @type {HTMLButtonElement} */ (document.querySelector("#createMode")),
  creator: /** @type {HTMLFormElement} */ (document.querySelector("#creator")),
  creatorMessage: /** @type {HTMLElement} */ (document.querySelector("#creatorMessage")),
  giftCode: /** @type {HTMLInputElement} */ (document.querySelector("#giftCode")),
  giftTitle: /** @type {HTMLInputElement} */ (document.querySelector("#giftTitle")),
  linkPanel: /** @type {HTMLElement} */ (document.querySelector("#linkPanel")),
  shareLink: /** @type {HTMLInputElement} */ (document.querySelector("#shareLink")),
  copyLink: /** @type {HTMLButtonElement} */ (document.querySelector("#copyLink")),
  openPuzzle: /** @type {HTMLButtonElement} */ (document.querySelector("#openPuzzle")),
  puzzleName: /** @type {HTMLElement} */ (document.querySelector("#puzzleName")),
  progressText: /** @type {HTMLElement} */ (document.querySelector("#progressText")),
  colClues: /** @type {HTMLElement} */ (document.querySelector("#colClues")),
  rowClues: /** @type {HTMLElement} */ (document.querySelector("#rowClues")),
  rowCluesRight: /** @type {HTMLElement} */ (document.querySelector("#rowCluesRight")),
  board: /** @type {HTMLElement} */ (document.querySelector("#board")),
  hintText: /** @type {HTMLElement} */ (document.querySelector("#hintText")),
  undoMove: /** @type {HTMLButtonElement} */ (document.querySelector("#undoMove")),
  resetPuzzle: /** @type {HTMLButtonElement} */ (document.querySelector("#resetPuzzle")),
  newSize: /** @type {HTMLSelectElement} */ (document.querySelector("#newSize")),
  newPuzzleType: /** @type {HTMLSelectElement} */ (document.querySelector("#newPuzzleType")),
  newShapeStyle: /** @type {HTMLSelectElement} */ (document.querySelector("#newShapeStyle")),
  shapeLabel: /** @type {HTMLElement} */ (document.querySelector("#shapeLabel")),
  newPuzzle: /** @type {HTMLButtonElement} */ (document.querySelector("#newPuzzle")),
  winDialog: /** @type {HTMLDialogElement} */ (document.querySelector("#winDialog")),
  winTitle: /** @type {HTMLElement} */ (document.querySelector("#winTitle")),
  winMessage: /** @type {HTMLElement} */ (document.querySelector("#winMessage")),
  giftLink: /** @type {HTMLAnchorElement} */ (document.querySelector("#giftLink")),
  giftSecret: /** @type {HTMLElement} */ (document.querySelector("#giftSecret")),
  themeToggle: /** @type {HTMLButtonElement} */ (document.querySelector("#themeToggle")),
  settingsToggle: /** @type {HTMLButtonElement} */ (document.querySelector("#settingsToggle")),
  settingsDialog: /** @type {HTMLDialogElement} */ (document.querySelector("#settingsDialog")),
  settingsForm: /** @type {HTMLElement} */ (document.querySelector("#settingsDialog .settings-form")),
  settingsIntro: /** @type {HTMLElement} */ (document.querySelector("#settingsDialog .settings-intro")),
  sunsetOverlay: /** @type {HTMLElement} */ (document.querySelector("#sunsetOverlay")),
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

els.settingsToggle.addEventListener("click", () => {
  els.settingsDialog.showModal();
});

function activeModule() {
  return MODULES[els.newPuzzleType.value] ?? DEFAULT_MODULE;
}

function populateControlsForModule() {
  const mod = activeModule();

  if (mod.rulesText && els.rulesPanel) {
    const p = els.rulesPanel.querySelector("p");
    if (p) p.textContent = mod.rulesText;
  }

  els.newSize.innerHTML = "";
  for (const [key, preset] of Object.entries(mod.presets)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = preset.label;
    els.newSize.append(opt);
  }
  const savedSize = localStorage.getItem("thermogift:newSize");
  if (savedSize && [...els.newSize.options].some((o) => o.value === savedSize)) {
    els.newSize.value = savedSize;
  }

  const shapes = mod.shapeStyles ?? [];
  els.newShapeStyle.innerHTML = "";
  for (const shape of shapes) {
    const opt = document.createElement("option");
    opt.value = shape;
    opt.textContent = shape === "curved" ? "Curved" : shape === "straight" ? "Straight only" : shape;
    els.newShapeStyle.append(opt);
  }
  if (shapes.length <= 1 && els.shapeLabel) {
    els.shapeLabel.hidden = true;
  } else if (els.shapeLabel) {
    els.shapeLabel.hidden = false;
  }
  const savedShape = localStorage.getItem("thermogift:newShapeStyle");
  if (savedShape && [...els.newShapeStyle.options].some((o) => o.value === savedShape)) {
    els.newShapeStyle.value = savedShape;
  }

  populateSettings(mod);
}

function populateSettings(mod) {
  if (!els.settingsForm) return;
  const schema = mod.settingsSchema ?? [];
  els.settingsForm.innerHTML = "";

  if (schema.length === 0) {
    if (els.settingsIntro) els.settingsIntro.textContent = "No assists available for this puzzle type.";
    const done = document.createElement("button");
    done.className = "settings-done";
    done.textContent = "Done";
    done.type = "button";
    done.addEventListener("click", () => els.settingsDialog.close());
    els.settingsForm.append(done);
    return;
  }

  if (els.settingsIntro) els.settingsIntro.textContent = "Optional shortcuts.";

  for (const s of schema) {
    const label = document.createElement("label");
    label.className = "setting-row";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = s.id;
    const stored = localStorage.getItem(s.key);
    input.checked = stored === null ? (s.defaultOn ?? false) : stored !== "false";

    const name = document.createElement("span");
    name.className = "setting-label";
    name.textContent = s.label;

    const desc = document.createElement("span");
    desc.className = "setting-desc";
    desc.textContent = s.desc;

    input.addEventListener("change", () => {
      localStorage.setItem(s.key, String(input.checked));
    });

    label.append(input, name, desc);
    els.settingsForm.append(label);
  }

  const done = document.createElement("button");
  done.className = "settings-done";
  done.textContent = "Done";
  done.type = "button";
  done.addEventListener("click", () => els.settingsDialog.close());
  els.settingsForm.append(done);
}

const savedType = localStorage.getItem("thermogift:newPuzzleType");
if (savedType && els.newPuzzleType && [...els.newPuzzleType.options].some((o) => o.value === savedType)) {
  els.newPuzzleType.value = savedType;
}
populateControlsForModule();

els.newPuzzleType?.addEventListener("change", () => {
  localStorage.setItem("thermogift:newPuzzleType", els.newPuzzleType.value);
  populateControlsForModule();
});

els.newSize.addEventListener("change", () => localStorage.setItem("thermogift:newSize", els.newSize.value));
els.newShapeStyle.addEventListener("change", () => {
  localStorage.setItem("thermogift:newShapeStyle", els.newShapeStyle.value);
});

els.newPuzzle.addEventListener("click", () => {
  generateFreshPuzzle(els.newSize.value, els.newShapeStyle.value);
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
  if (!stateIsSolved()) return null;
  return Array.from({ length: puzzle.size * puzzle.size }, (_, index) => state.marks.has(index));
}

function embedSecretIntoCurrent(puzzle, solution, code) {
  const secretBytes = new TextEncoder().encode(code);
  if (secretBytes.length > 4096) throw new Error("Code too long (max 4096 UTF-8 bytes).");
  const key = solutionKeyBytes(solution, puzzle.size, secretBytes.length);
  const cipherBytes = Array.from(secretBytes, (b, i) => b ^ key[i]);
  const checksum = checksumForBytes(secretBytes, solution, puzzle.size);
  return state.module.encode({
    puzzle: { ...puzzle, solution },
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

function loadFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (id) {
    setCreatorOpen(false);
    loadFromId(id, { isSecret: true, title: params.get("title") || "" });
    return;
  }
  if (params.get("create") === "1") setCreatorOpen(true);
  const lastPlayed = localStorage.getItem("thermogift:lastPlayed");
  if (lastPlayed) {
    loadFromId(lastPlayed, { isSecret: false });
    if (state.puzzle) return;
  }
  generateFreshPuzzle(els.newSize.value, els.newShapeStyle.value);
}

/** @param {string} id @param {{ isSecret?: boolean, title?: string }} [opts] */
function loadFromId(id, opts = { isSecret: true }) {
  try {
    const module = pickModuleForId(id);
    const puzzle = module.decodeId(id);
    const title = opts.title ?? "";
    state.module = module;
    state.puzzle = { ...puzzle, title, isSecret: opts.isSecret !== false };

    // Grid template CSS only depends on size — set it once per puzzle load.
    const sizeRepeat = `repeat(${puzzle.size}, var(--cell))`;
    els.colClues.style.gridTemplateColumns = sizeRepeat;
    els.rowClues.style.gridTemplateRows = sizeRepeat;
    els.rowCluesRight.style.gridTemplateRows = sizeRepeat;
    els.board.style.gridTemplateColumns = sizeRepeat;
    els.board.style.gridTemplateRows = sizeRepeat;
    els.board.parentElement.parentElement.style.setProperty("--grid-size", puzzle.size);
    if (state.puzzle.isSecret) localStorage.setItem("thermogift:lastPuzzle", id);
    loadProgress();
    clearCreatorLink();
    els.puzzleName.textContent = title || module.puzzleLabel(state.puzzle);
    els.hintText.hidden = true;
    els.hintText.textContent = "";
    revealGamePanel();

    state.ui?.dispose?.();
    state.ui = module.attachUI({
      boardEl: els.board,
      rowCluesEl: els.rowClues,
      colCluesEl: els.colClues,
      rowCluesRightEl: els.rowCluesRight,
      puzzle: state.puzzle,
      stateApi: makeStateApi(),
    });
    state.ui.render();
    updateUndoButton();
  } catch (error) {
    if (opts.isSecret) localStorage.removeItem("thermogift:lastPuzzle");
    localStorage.removeItem("thermogift:lastPlayed");
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

function pickModuleForId(/** @type {string} */ id) {
  if (id.startsWith("t1-")) return thermometers;
  if (id.startsWith("t2-")) {
    const r = new BitReader(idToBits(id.slice(3)));
    r.readFixed(4); // minor
    r.readVarint(); // size
    r.readVarint(); // shapeIdx
    const variant = r.readVarint();
    return VARIANT_TO_MODULE[variant] ?? DEFAULT_MODULE;
  }
  return DEFAULT_MODULE;
}

function makeStateApi() {
  return {
    get marks() { return state.marks; },
    get xMarks() { return state.xMarks; },
    get dragging() { return state.dragging; },
    set dragging(value) { state.dragging = value; },
    get touchPending() { return state.touchPending; },
    set touchPending(value) { state.touchPending = value; },
    pushHistory,
    scheduleRender,
    scheduleSave,
    maybeReveal,
    updateProgress,
  };
}

function renderPuzzle() {
  state.ui?.render();
  updateUndoButton();
}

function stateIsSolved() {
  return state.ui?.isSolved() ?? false;
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

function generatePuzzleId(puzzleType, presetId, shape, code) {
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
          finishOk(event.data);
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
      worker.postMessage({ puzzleType, presetId, shape, code });
    }
  });
}

async function generateFreshPuzzle(presetId, shape) {
  if (state.generatingFresh) return;
  state.generatingFresh = true;
  const wasLabel = els.newPuzzle.textContent;
  els.hintText.hidden = true;
  els.hintText.textContent = "";

  // Delayed spinner: only show "Loading…" if generation takes long enough
  // that the user actually needs feedback. For fast presets (tents 15×15 is
  // ~1ms now, thermos 8×8 is ~3ms) the spinner would flash and feel laggier
  // than no feedback at all.
  const SPINNER_DELAY_MS = 150;
  const spinnerTimer = window.setTimeout(() => {
    els.newPuzzle.disabled = true;
    els.newPuzzle.textContent = "Loading…";
  }, SPINNER_DELAY_MS);

  try {
    const mod = activeModule();
    const result = await generatePuzzleId(mod.id, presetId, shape, randomFreshCode());
    localStorage.removeItem("thermogift:lastPlayed");
    loadFromId(result.id, { isSecret: false });
    if (state.puzzle?.id === result.id) {
      mod.applyCachedFromWorker?.(state.puzzle, result);
    }
  } catch (error) {
    revealGamePanel();
    els.hintText.hidden = false;
    els.hintText.textContent = error?.message || "Could not generate that puzzle. Try a smaller size.";
  } finally {
    clearTimeout(spinnerTimer);
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

function maybeReveal() {
  const puzzle = state.puzzle;
  if (!puzzle || !stateIsSolved()) return;
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
  els.sunsetOverlay.classList.remove("active", "fade-out");
  els.sunsetOverlay.hidden = false;
  void els.sunsetOverlay.offsetWidth;
  els.sunsetOverlay.classList.add("active");
}

/** @param {string} secret @returns {string | null} */
function sniffSecretHref(secret) {
  if (/^https?:\/\/\S+$/.test(secret)) return secret;
  if (/^[A-Za-z0-9]{5}$/.test(secret)) return `https://www.steamgifts.com/giveaway/${secret}/`;
  return null;
}

function updateProgress(/** @type {{row: number[], col: number[]} | undefined} */ precomputed) {
  const puzzle = state.puzzle;
  if (!puzzle) return;
  const counts = precomputed ?? rowColCounts();
  const target = puzzle.expectedTotal;
  const filled = state.marks.size;
  let anyOver = false;
  let countsMatched = true;
  for (let i = 0; i < puzzle.size; i += 1) {
    if (counts.row[i] > puzzle.rowClues[i]) anyOver = true;
    if (counts.col[i] > puzzle.colClues[i]) anyOver = true;
    if (counts.row[i] !== puzzle.rowClues[i]) countsMatched = false;
    if (counts.col[i] !== puzzle.colClues[i]) countsMatched = false;
  }

  if (anyOver) {
    els.progressText.textContent = "Check mistakes";
  } else if (countsMatched) {
    els.progressText.textContent = "Counts matched";
  } else {
    els.progressText.textContent = target ? `${Math.round((filled / target) * 100)}%` : "0%";
  }
}

function rowColCounts() {
  const size = state.puzzle.size;
  const row = new Array(size).fill(0);
  const col = new Array(size).fill(0);
  for (const cell of state.marks) {
    row[(cell / size) | 0] += 1;
    col[cell % size] += 1;
  }
  return { row, col };
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
  localStorage.setItem("thermogift:lastPlayed", state.puzzle.id);
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

els.winDialog.addEventListener("close", () => {
  els.sunsetOverlay.classList.add("fade-out");
  setTimeout(() => {
    els.sunsetOverlay.hidden = true;
    els.sunsetOverlay.classList.remove("active", "fade-out");
  }, 1200);
});

loadFromLocation();
