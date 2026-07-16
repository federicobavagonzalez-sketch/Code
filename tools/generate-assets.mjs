// Genera icon.png y splash.png (sin dependencias externas; usa node:zlib).
// Marca: octagono ambar (la jaula) sobre fondo casi negro. Estilo cartel.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [10, 10, 11];        // #0a0a0b
const AMBER = [234, 88, 12];    // #ea580c
const INK = [237, 237, 234];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function pngFromRGBA(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // filtro 0 por scanline
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function makeCanvas(w, h, bg) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { buf[i*4]=bg[0]; buf[i*4+1]=bg[1]; buf[i*4+2]=bg[2]; buf[i*4+3]=255; }
  return buf;
}
function px(buf, w, x, y, col, a = 1) {
  if (x < 0 || y < 0 || x >= w || y * w * 4 >= buf.length) return;
  const i = (y * w + x) * 4;
  buf[i] = buf[i]*(1-a) + col[0]*a;
  buf[i+1] = buf[i+1]*(1-a) + col[1]*a;
  buf[i+2] = buf[i+2]*(1-a) + col[2]*a;
  buf[i+3] = 255;
}
// dibuja un octagono (contorno grueso) centrado
function octagon(buf, w, h, cx, cy, r, thick, col) {
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const ang = Math.PI / 8 + k * Math.PI / 4;
    pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  for (let k = 0; k < 8; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[(k + 1) % 8];
    const steps = Math.hypot(x1 - x0, y1 - y0) * 1.5;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      for (let dx = -thick; dx <= thick; dx++) for (let dy = -thick; dy <= thick; dy++)
        px(buf, w, Math.round(x + dx), Math.round(y + dy), col);
    }
  }
}
// barras verticales de la jaula dentro del octagono
function bars(buf, w, h, cx, cy, r, col) {
  const n = 5, spacing = (r * 1.2) / (n + 1);
  for (let b = 1; b <= n; b++) {
    const x = Math.round(cx - r * 0.6 + b * spacing);
    for (let y = cy - r * 0.55; y <= cy + r * 0.55; y++)
      for (let t = -2; t <= 2; t++) px(buf, w, x + t, Math.round(y), col, 0.55);
  }
}

function buildIcon(size) {
  const buf = makeCanvas(size, size, BG);
  const cx = size / 2, cy = size / 2, r = size * 0.36;
  bars(buf, size, size, cx, cy, r, AMBER);
  octagon(buf, size, size, cx, cy, r, Math.max(2, size * 0.012), AMBER);
  octagon(buf, size, size, cx, cy, r * 1.02, Math.max(1, size * 0.004), INK);
  return pngFromRGBA(size, size, buf);
}
function buildSplash(size) {
  const buf = makeCanvas(size, size, BG);
  const cx = size / 2, cy = size / 2, r = size * 0.16;
  bars(buf, size, size, cx, cy, r, AMBER);
  octagon(buf, size, size, cx, cy, r, Math.max(2, size * 0.006), AMBER);
  return pngFromRGBA(size, size, buf);
}

mkdirSync('resources', { recursive: true });
writeFileSync('resources/icon.png', buildIcon(1024));
writeFileSync('resources/splash.png', buildSplash(2732));
mkdirSync('www/assets', { recursive: true });
writeFileSync('www/assets/icon-512.png', buildIcon(512));
writeFileSync('www/assets/favicon.png', buildIcon(64));
console.log('assets generados: resources/icon.png, resources/splash.png, www/assets/icon-512.png, favicon.png');
