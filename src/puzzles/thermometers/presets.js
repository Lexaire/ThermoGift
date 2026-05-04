export const PRESETS = {
  tiny: { label: "Beginner 4x4", size: 4, minThermos: 5, shapeStyle: "curved" },
  easy: { label: "Easy 6x6", size: 6, minThermos: 9, shapeStyle: "curved" },
  normal: { label: "Normal 8x8", size: 8, minThermos: 17, shapeStyle: "curved" },
  hard: { label: "Hard 10x10", size: 10, minThermos: 13, minLength: 4, maxLength: 8, shapeStyle: "curved" },
  expert: { label: "Veteran 12x12", size: 12, minThermos: 9, minLength: 8, maxLength: 16, shapeStyle: "curved" },
  brutal: { label: "Nightmare 15x15", size: 15, minThermos: 8, minLength: 14, maxLength: 30, shapeStyle: "curved" },
  huge: { label: "Hell 17x17", size: 17, minThermos: 8, minLength: 16, maxLength: 34, deadlineMs: 15000, shapeStyle: "curved" },
  enormous: { label: "Inferno 20x20", size: 20, minThermos: 8, minLength: 18, maxLength: 40, deadlineMs: 20000, shapeStyle: "curved" },
  giant: { label: "Apocalypse 22x22", size: 22, minThermos: 8, minLength: 20, maxLength: 44, deadlineMs: 30000, shapeStyle: "curved" },
  colossal: { label: "Ultra-Nightmare 24x24", size: 24, minThermos: 8, minLength: 22, maxLength: 48, deadlineMs: 45000, shapeStyle: "curved" },
  massive: { label: "Lunatic 26x26", size: 26, minThermos: 8, minLength: 24, maxLength: 52, deadlineMs: 60000, shapeStyle: "curved" },
};

export const SHAPE_STYLES = ["curved", "straight"];

// Some preset/shape combinations are disabled because the constructive
// generator can't reliably hit them within a reasonable budget:
//   - straight thermos at 20x20+ produce ~2x more (shorter) thermos than
//     curved, blowing up the constructive search space.
//   - 30x30+ has been pulled until the curved generator is faster at that
//     size.
export function availableShapesFor(presetId) {
  const preset = PRESETS[presetId];
  if (!preset) return [];
  return SHAPE_STYLES.filter((shape) => {
    if (shape === "straight" && preset.size >= 20) return false;
    if (shape === "curved" && preset.size >= 30) return false;
    return true;
  });
}
