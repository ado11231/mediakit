import { deflateSync } from 'node:zlib';

/**
 * Re-encodes raw RGBA pixels as a 24-bit (colour type 2) PNG.
 *
 * resvg always emits colour type 6, so its output carries an alpha channel even when the
 * `background` option has made every pixel opaque. Apple and Google reject screenshots on the
 * presence of the channel, not on whether any pixel uses it, so compositing alone is not
 * enough: the channel has to be gone from the file.
 *
 * Written against node:zlib rather than an encoder dependency, both for the install-size
 * budget and because the whole pipeline has to stay byte-reproducible. Filter type 0 on every
 * scanline and a pinned deflate level keep it so; an adaptive filter heuristic would be the
 * obvious size win and is exactly the kind of thing that varies between library versions.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of buffer) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
};

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const encodeRgbPng = (rgba: Buffer, width: number, height: number): Buffer => {
  // One filter byte per scanline, then three bytes per pixel with the alpha byte dropped.
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      const dst = rowStart + 1 + x * 3;
      raw[dst] = rgba[src] ?? 0;
      raw[dst + 1] = rgba[src + 1] ?? 0;
      raw[dst + 2] = rgba[src + 2] ?? 0;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
