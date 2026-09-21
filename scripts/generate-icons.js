// Script to generate PWA icons
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, drawFn) {
  // RGBA buffer
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }

  // PNG chunks
  // Header: 8 bytes
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // color type 6: RGBA
  ihdrData.writeUInt8(0, 10); // compression method 0
  ihdrData.writeUInt8(0, 11); // filter method 0
  ihdrData.writeUInt8(0, 12); // interlace method 0
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT chunk: filter byte (0) before each scanline
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let scanlineOffset = 0;
  for (let y = 0; y < height; y++) {
    scanlines[scanlineOffset++] = 0; // Filter None
    const rowStart = y * width * 4;
    buffer.copy(scanlines, scanlineOffset, rowStart, rowStart + width * 4);
    scanlineOffset += width * 4;
  }

  const compressed = zlib.deflateSync(scanlines);
  const idat = makeChunk('IDAT', compressed);

  // IEND chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crcTarget = chunk.subarray(4, 8 + len);
  const crcVal = crc32(crcTarget);
  chunk.writeInt32BE(crcVal, 8 + len);
  return chunk;
}

// standard CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) | 0;
}

// Icon drawer: Modern playful smartphone with star & coins / clock badge
function drawAppIcon(isMaskable) {
  return (x, y, w, h) => {
    const nx = x / w;
    const ny = y / h;
    const cx = 0.5;
    const cy = 0.5;

    // Background: rich indigo-to-blue gradient
    // #2563eb (37, 99, 235) to #1d4ed8 (29, 78, 216)
    const t = (nx + ny) / 2;
    let bgR = Math.round(37 * (1 - t) + 29 * t);
    let bgG = Math.round(99 * (1 - t) + 78 * t);
    let bgB = Math.round(235 * (1 - t) + 216 * t);

    // Rounded rectangle check for non-maskable
    if (!isMaskable) {
      const radius = 0.22;
      const dx = Math.max(Math.abs(nx - cx) - (0.46 - radius), 0);
      const dy = Math.max(Math.abs(ny - cy) - (0.46 - radius), 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) {
        return [0, 0, 0, 0]; // transparent outside
      }
    }

    // Smartphone silhouette
    // center bounds: x in [0.28, 0.72], y in [0.20, 0.80]
    const phoneWidth = 0.44;
    const phoneHeight = 0.60;
    const phoneRadius = 0.08;
    const pMinX = cx - phoneWidth / 2;
    const pMaxX = cx + phoneWidth / 2;
    const pMinY = cy - phoneHeight / 2;
    const pMaxY = cy + phoneHeight / 2;

    const pdx = Math.max(Math.abs(nx - cx) - (phoneWidth / 2 - phoneRadius), 0);
    const pdy = Math.max(Math.abs(ny - cy) - (phoneHeight / 2 - phoneRadius), 0);
    const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

    if (pDist <= phoneRadius) {
      // Inside phone
      // Check phone screen vs phone body
      const sInsetX = 0.035;
      const sInsetTop = 0.06;
      const sInsetBottom = 0.06;
      const sMinX = pMinX + sInsetX;
      const sMaxX = pMaxX - sInsetX;
      const sMinY = pMinY + sInsetTop;
      const sMaxY = pMaxY - sInsetBottom;

      if (nx >= sMinX && nx <= sMaxX && ny >= sMinY && ny <= sMaxY) {
        // Screen background: dark sleek navy (#0f172a)
        // Center star / reward badge: yellow gold (#fbbf24)
        const scx = (sMinX + sMaxX) / 2;
        const scy = (sMinY + sMaxY) / 2;
        const sDist = Math.hypot(nx - scx, ny - scy);

        // Gold coin in the center
        if (sDist < 0.12) {
          // Inside coin
          if (sDist > 0.10) {
            // coin rim: amber #d97706
            return [217, 119, 6, 255];
          }
          // coin face: star or P for points
          // simple star check
          const angle = Math.atan2(ny - scy, nx - scx);
          const rStar = 0.06 + 0.03 * Math.cos(5 * angle);
          if (sDist < rStar) {
            // center star highlight: #ffffff
            return [255, 255, 255, 255];
          }
          return [251, 191, 36, 255]; // #fbbf24
        }

        // Screen lines or timer bar
        if (ny > scy + 0.14 && ny < scy + 0.17 && nx > sMinX + 0.04 && nx < sMaxX - 0.04) {
          // Emerald progress bar (#10b981)
          return [16, 185, 129, 255];
        }

        return [15, 23, 42, 255]; // screen #0f172a
      }

      // Phone body: pure clean white / light slate
      return [241, 245, 249, 255];
    }

    // Outer background
    return [bgR, bgG, bgB, 255];
  };
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. 192x192
const pwa192 = createPng(192, 192, drawAppIcon(false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), pwa192);

// 2. 512x512
const pwa512 = createPng(512, 512, drawAppIcon(false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), pwa512);

// 3. 512x512 Maskable
const pwaMaskable = createPng(512, 512, drawAppIcon(true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pwaMaskable);

// 4. apple-touch-icon.png (180x180)
const appleIcon = createPng(180, 180, drawAppIcon(false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIcon);

console.log('Successfully generated all PWA PNG icons!');
