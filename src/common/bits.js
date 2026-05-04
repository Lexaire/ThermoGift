// Bit-level URL serialization. Generic across puzzle types.

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function writeBits(value, length) {
  return (value >>> 0).toString(2).padStart(length, "0").slice(-length);
}

export function bitsToId(bits) {
  let padded = bits;
  while (padded.length % 6) padded += "0";
  return padded.match(/.{6}/g).map((chunk) => ID_ALPHABET[parseInt(chunk, 2)]).join("");
}

export function idToBits(id) {
  return id.split("").map((char) => {
    const value = ID_ALPHABET.indexOf(char);
    if (value < 0) throw new Error("Bad id character");
    return value.toString(2).padStart(6, "0");
  }).join("");
}

export class BitWriter {
  constructor() {
    this.bits = "";
  }
  writeFixed(value, length) {
    this.bits += (value >>> 0).toString(2).padStart(length, "0").slice(-length);
  }
  writeVarint(value) {
    if (!Number.isInteger(value) || value < 0) throw new Error("varint must be a non-negative integer");
    for (let k = 0; k <= 7; k += 1) {
      const cap = 2 ** ((k + 1) * 4) - 1;
      if (value <= cap) {
        this.bits += "1".repeat(k) + "0";
        this.writeFixed(value, (k + 1) * 4);
        return;
      }
    }
    throw new Error("varint value too large");
  }
}

export class BitReader {
  constructor(bits) {
    this.bits = bits;
    this.pos = 0;
  }
  readFixed(length) {
    if (length === 0) return 0;
    if (this.pos + length > this.bits.length) throw new Error("Truncated id");
    const value = parseInt(this.bits.slice(this.pos, this.pos + length), 2);
    this.pos += length;
    return value;
  }
  readVarint() {
    let k = 0;
    while (this.readFixed(1) === 1) {
      k += 1;
      if (k > 7) throw new Error("varint too large");
    }
    return this.readFixed((k + 1) * 4);
  }
}
