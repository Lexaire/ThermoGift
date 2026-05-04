// Generic Web Worker entry point. Dispatches generation requests to the
// registered puzzle module by `puzzleType`. Each module owns its own
// `generate` (which returns a puzzle), `solutionCells` (which projects
// the puzzle into a boolean[size*size] for cipher keying), and `encode`
// (which writes the URL).

import { solutionKeyBytes, checksumForBytes } from "./cipher.js";

const DEFAULT_DEADLINE_MS = 15000;
const MAX_CIPHER_BYTES = 4096;

/**
 * @param {Record<string, {
 *   generate: (args: { presetId: string, shape: string, deadlineMs: number, code?: string }) => any,
 *   solutionCells: (puzzle: any) => boolean[],
 *   encode: (args: { puzzle: any, cipherBytes: number[], checksum: number }) => string,
 *   serializeForCache?: (puzzle: any) => any,
 * }>} modules
 */
export function registerWorker(modules) {
  self.addEventListener("message", (event) => {
    try {
      const data = event.data ?? {};
      const { puzzleType, code } = data;
      const module = modules[puzzleType];
      if (!module) throw new Error(`Unknown puzzle type: ${puzzleType}`);
      if (typeof code !== "string") throw new Error("Bad code");
      const secretBytes = new TextEncoder().encode(code);
      if (secretBytes.length > MAX_CIPHER_BYTES) throw new Error(`Code too long (max ${MAX_CIPHER_BYTES} UTF-8 bytes)`);

      const deadlineMs = Date.now() + DEFAULT_DEADLINE_MS;
      const puzzle = module.generate({ ...data, deadlineMs });
      const solution = module.solutionCells(puzzle);
      const key = solutionKeyBytes(solution, puzzle.size, secretBytes.length);
      const cipherBytes = Array.from(secretBytes, (b, i) => b ^ key[i]);
      const checksum = checksumForBytes(secretBytes, solution, puzzle.size);
      const id = module.encode({ puzzle, cipherBytes, checksum });
      const cache = module.serializeForCache?.(puzzle) ?? {};
      self.postMessage({ ok: true, id, ...cache });
    } catch (error) {
      self.postMessage({ ok: false, error: error.message });
    }
  });
}
