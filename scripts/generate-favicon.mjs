// Regenerates src/app/favicon.ico from src/app/icon.svg.
//
// Two icon files exist on purpose. `icon.svg` is the real mark — crisp at every size, and what
// modern browsers use. `favicon.ico` exists because browsers request /favicon.ico regardless of
// what the document declares, and without a file there the request falls through to the app and
// burns a serverless invocation (see commit 1383258).
//
// Before 2026-09-06 that .ico was a solid teal square that had nothing to do with the kite, so the
// browser tab showed a colour block while the page showed a logo. This script derives the .ico from
// the SVG instead, which is why they can no longer disagree. Re-run it whenever icon.svg changes:
//
//   node scripts/generate-favicon.mjs
//
// The .ico carries 16/32/48px BMP entries. BMP rather than PNG-in-ICO because 16px PNG entries are
// still mishandled by some Windows shell surfaces, and at these sizes the size difference is noise.

import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const SVG = 'src/app/icon.svg';
const ICO = 'src/app/favicon.ico';
const SIZES = [16, 32, 48];

/** One BITMAPINFOHEADER + BGRA pixels (bottom-up) + a fully-opaque AND mask. */
function encodeBmp(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // header size
  header.writeInt32LE(size, 4); // width
  header.writeInt32LE(size * 2, 8); // height: image + AND mask, per the ICO spec
  header.writeUInt16LE(1, 12); // planes
  header.writeUInt16LE(32, 14); // bits per pixel
  header.writeUInt32LE(size * size * 4, 20); // image byte count

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = ((size - 1 - y) * size + x) * 4; // bottom-up
      pixels[dst] = rgba[src + 2]; // B
      pixels[dst + 1] = rgba[src + 1]; // G
      pixels[dst + 2] = rgba[src]; // R
      pixels[dst + 3] = rgba[src + 3]; // A
    }
  }

  // Zeroed AND mask: transparency comes from the alpha channel above, and every row is padded to a
  // 4-byte boundary — which for these sizes it already is.
  const mask = Buffer.alloc((size / 8) * size);
  return Buffer.concat([header, pixels, mask]);
}

const svg = await readFile(SVG);

const images = await Promise.all(
  SIZES.map(async (size) => {
    const { data } = await sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    return { size, bmp: encodeBmp(data, size) };
  }),
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);

const directory = Buffer.alloc(images.length * 16);
let offset = 6 + directory.length;

images.forEach((image, index) => {
  const at = index * 16;
  directory[at] = image.size === 256 ? 0 : image.size;
  directory[at + 1] = image.size === 256 ? 0 : image.size;
  directory.writeUInt16LE(1, at + 4); // planes
  directory.writeUInt16LE(32, at + 6); // bits per pixel
  directory.writeUInt32LE(image.bmp.length, at + 8);
  directory.writeUInt32LE(offset, at + 12);
  offset += image.bmp.length;
});

await writeFile(ICO, Buffer.concat([header, directory, ...images.map((i) => i.bmp)]));
console.log(`${ICO}: ${SIZES.join('/')}px written from ${SVG}`);
