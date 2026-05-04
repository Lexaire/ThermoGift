// Generic helpers shared by all puzzle types.

export function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pick(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

export function shuffled(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function neighbors(cell, size) {
  const row = Math.floor(cell / size);
  const col = cell % size;
  return [
    row > 0 ? cell - size : null,
    col < size - 1 ? cell + 1 : null,
    row < size - 1 ? cell + size : null,
    col > 0 ? cell - 1 : null,
  ].filter((value) => value !== null);
}

export function directionBetween(from, to, size) {
  const dRow = Math.floor(to / size) - Math.floor(from / size);
  const dCol = (to % size) - (from % size);
  if (dRow === -1 && dCol === 0) return 0;
  if (dRow === 0 && dCol === 1) return 1;
  if (dRow === 1 && dCol === 0) return 2;
  if (dRow === 0 && dCol === -1) return 3;
  throw new Error("Cells not orthogonally adjacent");
}

export function applyDir(cell, dir, size) {
  const row = Math.floor(cell / size);
  const col = cell % size;
  if (dir === 0 && row > 0) return cell - size;
  if (dir === 1 && col < size - 1) return cell + 1;
  if (dir === 2 && row < size - 1) return cell + size;
  if (dir === 3 && col > 0) return cell - 1;
  return -1;
}

export function bitsForRange(maxValue) {
  return Math.max(1, Math.ceil(Math.log2(maxValue + 1)));
}
