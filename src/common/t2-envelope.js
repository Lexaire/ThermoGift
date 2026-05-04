// t2 URL envelope. Owns the version/size/shape/variant header and the
// cipher/checksum/trailer footer; the body in between is owned by the
// puzzle-variant handler passed in.
//
// Layout (bit stream, base64 alphabet = ID_ALPHABET):
//   4 bits         minor version
//   varint         size                     // board side, 4..64
//   varint         shapeIdx                 // puzzle-defined
//   varint         variant                  // 0 = thermometers
//   <body>         puzzle-variant payload   // owned by handler
//   varint         cipherByteLen            // 0..4096
//   N × 8 bits     cipher bytes
//   16 bits        checksum
//   varint         trailerBitCount          // 0 at minor=0
//   trailerBitCount bits  trailer payload (skipped at minor=0)
//
// Future-proofing:
//   - Presentation extensions go in the trailer with a must-understand bit.
//     Old decoders skip them.
//   - Structural changes bump `minor` or `variant` so old decoders refuse
//     instead of misrendering.

import { BitReader, BitWriter, bitsToId, idToBits } from "./bits.js";

export const T2_VERSION_MINOR = 1;
export const T2_MAX_SIZE = 64;
export const T2_MAX_CIPHER_BYTES = 4096;
export const T2_MAX_TRAILER_BITS = 4096;

/**
 * @param {string} id
 * @param {Record<number, { decodeBody: (reader: BitReader, meta: { size: number, shapeIdx: number, minor: number }) => any }>} variantHandlers
 */
export function decodeT2Envelope(id, variantHandlers) {
  if (!id.startsWith("t2-")) throw new Error("Not a t2 id");
  const r = new BitReader(idToBits(id.slice(3)));

  const minor = r.readFixed(4);
  if (minor !== 0 && minor !== 1) {
    throw new Error(`Puzzle uses a newer format (t2 minor=${minor}). Update the app.`);
  }
  const size = r.readVarint();
  if (size < 4 || size > T2_MAX_SIZE) throw new Error("Bad size");
  const shapeIdx = r.readVarint();
  const variant = r.readVarint();

  const handler = variantHandlers[variant];
  if (!handler) throw new Error(`Unsupported puzzle variant: ${variant}`);
  const body = handler.decodeBody(r, { size, shapeIdx, minor });

  const cipherByteLen = r.readVarint();
  if (cipherByteLen > T2_MAX_CIPHER_BYTES) throw new Error("Cipher too long");
  const cipherBytes = new Array(cipherByteLen);
  for (let i = 0; i < cipherByteLen; i += 1) cipherBytes[i] = r.readFixed(8);

  const checksum = r.readFixed(16);

  const trailerBitCount = r.readVarint();
  if (trailerBitCount > T2_MAX_TRAILER_BITS) throw new Error("Trailer too long");
  for (let i = 0; i < trailerBitCount; i += 1) r.readFixed(1);

  return { variant, size, shapeIdx, minor, body, cipherBytes, checksum, format: "t2" };
}

/**
 * @param {{ size: number, shapeIdx: number, variant: number, writeBody: (writer: BitWriter) => void, cipherBytes: number[], checksum: number }} args
 */
export function encodeT2Envelope({ size, shapeIdx, variant, writeBody, cipherBytes, checksum }) {
  if (size < 4 || size > T2_MAX_SIZE) throw new Error("Bad size");
  if (cipherBytes.length > T2_MAX_CIPHER_BYTES) throw new Error("Cipher too long");

  const w = new BitWriter();
  w.writeFixed(T2_VERSION_MINOR, 4);
  w.writeVarint(size);
  w.writeVarint(shapeIdx);
  w.writeVarint(variant);

  writeBody(w);

  w.writeVarint(cipherBytes.length);
  for (const b of cipherBytes) w.writeFixed(b & 0xff, 8);
  w.writeFixed(checksum & 0xffff, 16);
  w.writeVarint(0);

  return `t2-${bitsToId(w.bits)}`;
}
