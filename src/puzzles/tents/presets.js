// `{hard,expert}MinUnknownAfterEasy` is the floor on how many cells must
// remain UNKNOWN after easy propagation finishes. Together with the
// ratio gate in the generator, this is what makes a tier feel hard: the
// player faces a board still mostly grass-undecided after the obvious
// row/col/tree passes, *and* a meaningful share of those undecided cells
// need lookahead. Expert raises both knobs (floor + ratio) above Hard.
// `expertMinUnknownAfterEasy: null` disables Expert at that size — 5×5
// is too constrained for a meaningful step beyond Hard.
export const PRESETS = {
  "5x5":   { label: "5x5",   size: 5,  treeDensity: 0.20, hardMinUnknownAfterEasy: 0,  expertMinUnknownAfterEasy: null, layoutAttempts: 100,  deadlineMs: 5000 },
  "6x6":   { label: "6x6",   size: 6,  treeDensity: 0.22, hardMinUnknownAfterEasy: 10, expertMinUnknownAfterEasy: 16,   layoutAttempts: 200,  deadlineMs: 8000 },
  "8x8":   { label: "8x8",   size: 8,  treeDensity: 0.20, hardMinUnknownAfterEasy: 12, expertMinUnknownAfterEasy: 25,   layoutAttempts: 500,  deadlineMs: 12000 },
  "10x10": { label: "10x10", size: 10, treeDensity: 0.18, hardMinUnknownAfterEasy: 16, expertMinUnknownAfterEasy: 35,   layoutAttempts: 800,  deadlineMs: 15000 },
  "15x15": { label: "15x15", size: 15, treeDensity: 0.15, hardMinUnknownAfterEasy: 40, expertMinUnknownAfterEasy: 75,   layoutAttempts: 1500, deadlineMs: 20000 },
};

export const SHAPE_STYLES = ["default"];

export function availableShapesFor() {
  return ["default"];
}
