// Thermometer board rendering, glyph SVG, pointer/touch interactions, and the
// thermo-specific assist settings (cascade fill/X, dim matched clues, auto-X
// on completed lines). The shell hands us the board element and a state API;
// we own everything inside.

const HISTORY_LIMIT = 50;
const LONG_PRESS_MS = 350;
const TOUCH_MOVE_THRESHOLD_PX = 10;

const SETTINGS_KEYS = /** @type {const} */ ({
  autoXAxis: "thermogift:assist:autoXAxis",
  cascadeThermoX: "thermogift:assist:cascadeThermoX",
  cascadeThermoFill: "thermogift:assist:cascadeThermoFill",
  dimMatchedClues: "thermogift:assist:dimMatchedClues",
});

const SETTING_INPUT_IDS = {
  autoXAxis: "settingAutoXAxis",
  cascadeThermoX: "settingCascadeThermoX",
  cascadeThermoFill: "settingCascadeThermoFill",
  dimMatchedClues: "settingDimMatchedClues",
};

/**
 * @param {{ boardEl: HTMLElement, rowCluesEl: HTMLElement, colCluesEl: HTMLElement, rowCluesRightEl: HTMLElement, puzzle: any, stateApi: any }} args
 * @returns {{ render: () => void, dispose: () => void, isSolved: () => boolean }}
 */
export function attachThermometerUI({ boardEl, rowCluesEl, colCluesEl, rowCluesRightEl, puzzle, stateApi }) {
  const settings = loadSettings();
  const settingsCleanup = wireSettingsInputs(settings, () => render());
  const windowHandlers = wireWindowHandlers(stateApi);

  function render() {
    const counts = currentCounts(puzzle, stateApi.marks);

    colCluesEl.replaceChildren(...puzzle.colClues.map((/** @type {number} */ clue, /** @type {number} */ index) => clueEl(clue, counts.col[index], "col", index)));
    rowCluesEl.replaceChildren(...puzzle.rowClues.map((/** @type {number} */ clue, /** @type {number} */ index) => clueEl(clue, counts.row[index], "row", index)));
    rowCluesRightEl.replaceChildren(...puzzle.rowClues.map((/** @type {number} */ clue, /** @type {number} */ index) => clueEl(clue, counts.row[index], "row", index)));

    const thermoByCell = puzzle.thermoByCell;
    const cells = Array.from({ length: puzzle.size * puzzle.size }, (_, index) => buildCell(index, thermoByCell.get(index)));
    boardEl.replaceChildren(...cells);

    stateApi.updateProgress(counts);
  }

  /** @param {number} clue @param {number} count @param {"row" | "col"} axis @param {number} index */
  function clueEl(clue, count, axis, index) {
    const element = document.createElement("div");
    const stateClass = count === clue ? (settings.dimMatchedClues ? "met" : "") : count > clue ? "over" : "";
    element.className = `col-clue ${stateClass}`;
    element.textContent = String(clue);
    if (settings.autoXAxis && count === clue && clue > 0 && !axisFullyResolved(axis, index)) {
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

  function buildCell(index, meta) {
    const button = document.createElement("button");
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
          if (!stateApi.touchPending) return;
          stateApi.touchPending.fired = true;
          setThermoXMark(stateApi.touchPending.meta, xMarkMode(stateApi.touchPending.meta));
        }, LONG_PRESS_MS);
        stateApi.touchPending = { index, meta, startX: event.clientX, startY: event.clientY, timer, fired: false };
        return;
      }
      if (event.button === 0) {
        stateApi.pushHistory();
        const mode = markMode(meta);
        stateApi.dragging = { kind: "mark", mode };
        setThermoMark(meta, mode);
      } else if (event.button === 2) {
        stateApi.pushHistory();
        const mode = xMarkMode(meta);
        stateApi.dragging = { kind: "xMark", mode };
        setThermoXMark(meta, mode);
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
      if (pending.index !== index || !pending.meta) return;
      const mode = markMode(pending.meta);
      setThermoMark(pending.meta, mode);
    });
    button.addEventListener("pointerenter", (event) => {
      if (!stateApi.dragging) return;
      if (stateApi.dragging.kind === "mark" && (event.buttons & 1)) {
        setThermoMark(meta, stateApi.dragging.mode);
      } else if (stateApi.dragging.kind === "xMark" && (event.buttons & 2)) {
        setThermoXMark(meta, stateApi.dragging.mode);
      }
    });
    renderThermoGlyph(button, index, meta, puzzle.size, stateApi.xMarks);
    return button;
  }

  function cellClass(index) {
    const classes = ["cell"];
    if (stateApi.marks.has(index)) classes.push("filled");
    if (stateApi.xMarks.has(index)) classes.push("x-marked");
    return classes.join(" ");
  }

  function cancelTouchPending() {
    if (stateApi.touchPending?.timer) clearTimeout(stateApi.touchPending.timer);
    stateApi.touchPending = null;
  }

  function markMode(meta) {
    return stateApi.marks.has(meta.thermo[meta.pathIndex]) ? "clear" : "fill";
  }

  function setThermoMark(meta, mode) {
    if (!meta) return;
    if (stateApi.dragging === null) stateApi.pushHistory();
    const cell = meta.thermo[meta.pathIndex];
    if (mode === "fill") {
      if (settings.cascadeThermoFill) {
        meta.thermo.slice(0, meta.pathIndex + 1).forEach((c) => {
          stateApi.marks.add(c);
          stateApi.xMarks.delete(c);
        });
      } else {
        stateApi.marks.add(cell);
        stateApi.xMarks.delete(cell);
      }
    } else {
      if (settings.cascadeThermoFill) {
        meta.thermo.slice(meta.pathIndex).forEach((c) => stateApi.marks.delete(c));
      } else {
        stateApi.marks.delete(cell);
      }
    }
    stateApi.scheduleSave();
    stateApi.scheduleRender();
    stateApi.maybeReveal();
  }

  function xMarkMode(meta) {
    return stateApi.xMarks.has(meta.thermo[meta.pathIndex]) ? "clear-x" : "x";
  }

  function setThermoXMark(meta, mode) {
    if (!meta) return;
    if (stateApi.dragging === null) stateApi.pushHistory();
    const cell = meta.thermo[meta.pathIndex];
    if (mode === "x") {
      if (settings.cascadeThermoX) {
        meta.thermo.slice(meta.pathIndex).forEach((/** @type {number} */ c) => {
          stateApi.xMarks.add(c);
          stateApi.marks.delete(c);
        });
      } else {
        stateApi.xMarks.add(cell);
        stateApi.marks.delete(cell);
      }
    } else {
      if (settings.cascadeThermoX) {
        meta.thermo.slice(0, meta.pathIndex + 1).forEach((/** @type {number} */ c) => stateApi.xMarks.delete(c));
      } else {
        stateApi.xMarks.delete(cell);
      }
    }
    stateApi.scheduleSave();
    stateApi.scheduleRender();
    stateApi.maybeReveal();
  }

  function fillAxisWithX(axis, index) {
    const size = puzzle.size;
    const targets = [];
    for (let i = 0; i < size; i += 1) {
      const cell = axis === "row" ? index * size + i : i * size + index;
      if (!stateApi.marks.has(cell) && !stateApi.xMarks.has(cell)) targets.push(cell);
    }
    if (targets.length === 0) return;
    stateApi.pushHistory();
    targets.forEach((cell) => stateApi.xMarks.add(cell));
    stateApi.scheduleSave();
    stateApi.scheduleRender();
    stateApi.maybeReveal();
  }

  function axisFullyResolved(axis, index) {
    const size = puzzle.size;
    for (let i = 0; i < size; i += 1) {
      const cell = axis === "row" ? index * size + i : i * size + index;
      if (!stateApi.marks.has(cell) && !stateApi.xMarks.has(cell)) return false;
    }
    return true;
  }

  function isSolved() {
    // Cheap precondition: total marks must equal the sum of all clues. If not,
    // we can't possibly be solved — skip the per-row, per-col, per-thermo work.
    if (stateApi.marks.size !== puzzle.expectedTotal) return false;
    const counts = currentCounts(puzzle, stateApi.marks);
    for (let i = 0; i < puzzle.size; i += 1) {
      if (counts.row[i] !== puzzle.rowClues[i]) return false;
      if (counts.col[i] !== puzzle.colClues[i]) return false;
    }
    return puzzle.thermos.every((/** @type {number[]} */ thermo) => {
      const marks = thermo.map((/** @type {number} */ cell) => stateApi.marks.has(cell));
      const firstGap = marks.indexOf(false);
      return firstGap === -1 || marks.slice(firstGap + 1).every((mark) => !mark);
    });
  }

  return {
    render,
    isSolved,
    dispose() {
      settingsCleanup();
      windowHandlers();
    },
  };
}

export const thermoSettings = {
  HISTORY_LIMIT,
};

// One pass over the marks Set to derive per-row and per-col fill counts.
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

function loadSettings() {
  return {
    autoXAxis: localStorage.getItem(SETTINGS_KEYS.autoXAxis) === "true",
    cascadeThermoX: localStorage.getItem(SETTINGS_KEYS.cascadeThermoX) === "true",
    cascadeThermoFill: localStorage.getItem(SETTINGS_KEYS.cascadeThermoFill) !== "false",
    dimMatchedClues: localStorage.getItem(SETTINGS_KEYS.dimMatchedClues) !== "false",
  };
}

function wireSettingsInputs(settings, onChange) {
  /** @type {Array<() => void>} */
  const cleanups = [];
  for (const key of /** @type {(keyof typeof SETTING_INPUT_IDS)[]} */ (Object.keys(SETTING_INPUT_IDS))) {
    const input = /** @type {HTMLInputElement | null} */ (document.querySelector(`#${SETTING_INPUT_IDS[key]}`));
    if (!input) continue;
    input.checked = settings[key];
    const handler = () => {
      settings[key] = input.checked;
      localStorage.setItem(SETTINGS_KEYS[key], String(settings[key]));
      onChange();
    };
    input.addEventListener("change", handler);
    cleanups.push(() => input.removeEventListener("change", handler));
  }
  return () => cleanups.forEach((fn) => fn());
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

function renderThermoGlyph(button, index, meta, size, xMarks) {
  if (!meta) return;
  const directions = new Set();
  [meta.thermo[meta.pathIndex - 1], meta.thermo[meta.pathIndex + 1]].forEach((cell) => {
    if (cell === undefined) return;
    const diff = cell - index;
    if (diff === -1) directions.add("left");
    if (diff === 1) directions.add("right");
    if (diff === -size) directions.add("up");
    if (diff === size) directions.add("down");
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

  if (xMarks.has(index)) {
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
