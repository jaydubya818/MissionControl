import { sha256Hex } from "@mission-control/shared";

/** Git object identity, not an authorization signature. SHA-1 remains required
 * for existing Git repositories; SHA-256 repositories use their own format. */
export function gitBlobDigest(content: string, objectIdLength: number): string {
  const bytes = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const object = new Uint8Array(header.length + bytes.length);
  object.set(header); object.set(bytes, header.length);
  if (objectIdLength === 64) return sha256Hex(object);
  if (objectIdLength !== 40) throw new Error("Unsupported Git object format.");
  const padded = new Uint8Array(Math.ceil((object.length + 9) / 64) * 64);
  padded.set(object); padded[object.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(object.length / 0x20000000));
  view.setUint32(padded.length - 4, (object.length * 8) >>> 0);
  const hash = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const rotate = (word: number, bits: number) => (word << bits) | (word >>> (32 - bits));
  const words = new Uint32Array(80);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) words[i] = rotate(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
    let [a, b, c, d, e] = hash;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (b & c) | (~b & d) : i < 40 ? b ^ c ^ d : i < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const next = (rotate(a, 5) + f + e + k + words[i]) >>> 0;
      e = d; d = c; c = rotate(b, 30); b = a; a = next;
    }
    for (const [i, word] of [a, b, c, d, e].entries()) hash[i] = (hash[i] + word) >>> 0;
  }
  return hash.map(word => word.toString(16).padStart(8, "0")).join("");
}
