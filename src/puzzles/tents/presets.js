// `hardMinUnknownAfterEasy` is the floor on how many cells must remain
// UNKNOWN after easy propagation finishes. Together with the ratio gate
// in the generator, this is what makes Hard feel hard: the player faces
// a board still mostly grass-undecided after the obvious row/col/tree
// passes, *and* a meaningful share of those undecided cells need
// lookahead. At 5×5 the floor is 0 because ratio≥0.25 already filters
// strongly enough at that scale.
export const PRESETS = {
  "5x5":   { label: "5x5",   size: 5,  treeDensity: 0.20, hardMinUnknownAfterEasy: 0,  layoutAttempts: 100,  deadlineMs: 5000 },
  "6x6":   { label: "6x6",   size: 6,  treeDensity: 0.22, hardMinUnknownAfterEasy: 10, layoutAttempts: 200,  deadlineMs: 5000 },
  "8x8":   { label: "8x8",   size: 8,  treeDensity: 0.20, hardMinUnknownAfterEasy: 12, layoutAttempts: 500,  deadlineMs: 8000 },
  "10x10": { label: "10x10", size: 10, treeDensity: 0.18, hardMinUnknownAfterEasy: 16, layoutAttempts: 800,  deadlineMs: 15000 },
  "15x15": { label: "15x15", size: 15, treeDensity: 0.15, hardMinUnknownAfterEasy: 40, layoutAttempts: 1500, deadlineMs: 15000 },
};

export const SHAPE_STYLES = ["default"];

export function availableShapesFor() {
  return ["default"];
}
