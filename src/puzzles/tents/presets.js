export const PRESETS = {
  "5x5":   { label: "5x5", size: 5, treeDensity: 0.20, layoutAttempts: 100, deadlineMs: 5000 },
  "6x6":   { label: "6x6", size: 6, treeDensity: 0.22, layoutAttempts: 200, deadlineMs: 5000 },
  "8x8":   { label: "8x8", size: 8, treeDensity: 0.20, layoutAttempts: 500, deadlineMs: 8000 },
  "10x10": { label: "10x10", size: 10, treeDensity: 0.18, layoutAttempts: 800, deadlineMs: 15000 },
  "15x15": { label: "15x15", size: 15, treeDensity: 0.15, layoutAttempts: 1500, deadlineMs: 15000 },
};

export const SHAPE_STYLES = ["default"];

export function availableShapesFor() {
  return ["default"];
}
