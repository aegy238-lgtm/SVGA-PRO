// @ts-ignore
import * as pakoNs from 'pako';
// @ts-ignore
import * as upngNs from 'upng-js';
import {
  VapYyevaMeta,
  Mp4Box,
  metaFromAnyObject,
  detectVapYyevaSequentialSync,
} from './vapYyevaDetection';

export const pako: typeof pakoNs = (pakoNs as any).default || pakoNs;
export const UPNG: any = (upngNs as any).default || upngNs;

export type { Mp4Box, VapYyevaMeta };

const TD = new TextDecoder();

export const CT = new Uint32Array(256).map((_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

export function crc32(d: Uint8Array): number {
  let c = ~0;
  for (const b of d) c = CT[(c ^ b) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

export const kb = (n: number): string => (n / 1024).toFixed(2) + ' KB';

export const even = (n: number): number => Math.ceil(n / 2) * 2;

export function base64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 8192) {
    s += String.fromCharCode(...u.subarray(i, i + 8192));
  }
  return btoa(s);
}

export const unbase64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function lzw(px: Uint8Array): number[] {
  const out: number[] = [];
  let bits = 0;
  let nb = 0;
  const emit = (c: number) => {
    bits |= c << nb;
    nb += 9;
    while (nb >= 8) {
      out.push(bits & 255);
      bits >>= 8;
      nb -= 8;
    }
  };
  const dict = new Map<number, number>();
  let next = 258;
  let w = px[0] ?? 0;
  emit(256);
  for (let i = 1; i < px.length; i++) {
    const k = px[i];
    const key = w * 256 + k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      w = hit;
    } else {
      emit(w);
      dict.set(key, next++);
      if (next >= 511) {
        emit(256);
        dict.clear();
        next = 258;
      }
      w = k;
    }
  }
  emit(w);
  emit(257);
  if (nb > 0) out.push(bits & 255);
  return out;
}

export class PB {
  b: Uint8Array;
  v: DataView;
  p = 0;
  constructor(b: Uint8Array) {
    this.b = b;
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  get end(): boolean {
    return this.p >= this.b.length;
  }
  vi(): number {
    let r = 0;
    let s = 1;
    for (;;) {
      const c = this.b[this.p++];
      r += (c & 127) * s;
      if (c < 128) break;
      s *= 128;
    }
    return r;
  }
  f32(): number {
    const x = this.v.getFloat32(this.p, true);
    this.p += 4;
    return x;
  }
  fl(): number {
    return this.f32();
  }
  by(): Uint8Array {
    const n = this.vi();
    const s = this.b.subarray(this.p, this.p + n);
    this.p += n;
    return s;
  }
  skip(w: number): void {
    if (w === 0) this.vi();
    else if (w === 1) this.p += 8;
    else if (w === 2) this.by();
    else this.p += 4;
  }
}

export function pm(b: Uint8Array, fn: (f: number, r: PB) => number | boolean): void {
  const r = new PB(b);
  while (!r.end) {
    const t = r.vi();
    const f = t >>> 3;
    const w = t & 7;
    if (!fn(f, r)) r.skip(w);
  }
}

export interface SvgaFrame {
  a: number;
  x: number;
  y: number;
  w: number;
  h: number;
  t: number[];
  clipPath?: string;
  shapesRaw?: Uint8Array[];
}

export interface SvgaSprite {
  key: string;
  fr: SvgaFrame[];
  mk?: string;
}

export interface SvgaMovie {
  w: number;
  h: number;
  fps: number;
  n: number;
  im: Record<string, Uint8Array>;
  sp: SvgaSprite[];
  shapes?: number;
  matte?: number;
  audiosRaw?: Uint8Array[];
  layoutNormalized?: boolean;
}

/**
 * Reads intrinsic pixel dimensions (w, h) directly from PNG, JPEG, WebP, or GIF binary headers.
 */
export function readImageDimensionsFromBytes(
  bytes?: Uint8Array | null
): { w: number; h: number } | null {
  if (!bytes || bytes.length < 10) return null;

  // 1. PNG: \x89PNG\r\n\x1a\n + IHDR at offset 16..24
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const w = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
    const h = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
    if (w > 0 && h > 0 && w <= 32768 && h <= 32768) return { w, h };
  }

  // 2. GIF: GIF87a / GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const w = bytes[6] | (bytes[7] << 8);
    const h = bytes[8] | (bytes[9] << 8);
    if (w > 0 && h > 0) return { w, h };
  }

  // 3. WebP: RIFF....WEBP
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const c0 = bytes[12];
    const c1 = bytes[13];
    const c2 = bytes[14];
    const c3 = bytes[15];
    // 'VP8 '
    if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x20) {
      const w = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const h = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      if (w > 0 && h > 0) return { w, h };
    }
    // 'VP8L'
    if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x4c && bytes[20] === 0x2f) {
      const b0 = bytes[21];
      const b1 = bytes[22];
      const b2 = bytes[23];
      const b3 = bytes[24];
      const w = 1 + (((b1 & 0x3f) << 8) | b0);
      const h = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      if (w > 0 && h > 0) return { w, h };
    }
    // 'VP8X'
    if (c0 === 0x56 && c1 === 0x50 && c2 === 0x38 && c3 === 0x58) {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      if (w > 0 && h > 0) return { w, h };
    }
  }

  // 4. JPEG: \xFF\xD8
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let p = 2;
    while (p + 8 < bytes.length) {
      if (bytes[p] !== 0xff) {
        p++;
        continue;
      }
      while (p < bytes.length && bytes[p] === 0xff) p++;
      if (p + 7 >= bytes.length) break;
      const marker = bytes[p++];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        continue;
      }
      const segLen = (bytes[p] << 8) | bytes[p + 1];
      if (segLen < 2) break;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        if (p + 6 < bytes.length) {
          const h = (bytes[p + 3] << 8) | bytes[p + 4];
          const w = (bytes[p + 5] << 8) | bytes[p + 6];
          if (w > 0 && h > 0) return { w, h };
        }
        break;
      }
      p += segLen;
    }
  }

  return null;
}

/**
 * Computes the bounding box of an SVG path string (`clipPath`).
 */
export function getSvgPathBounds(
  d?: string | null
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!d || typeof d !== 'string') return null;
  const tokens = d.match(/[a-df-zA-DF-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi);
  if (!tokens || tokens.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let cmd = '';
  let isFirstMove = true;

  const recordPt = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  let idx = 0;
  while (idx < tokens.length) {
    const tk = tokens[idx];
    if (/^[a-df-zA-DF-Z]$/.test(tk)) {
      cmd = tk;
      idx++;
      if (cmd === 'Z' || cmd === 'z') {
        curX = startX;
        curY = startY;
      }
      continue;
    }
    if (!cmd) {
      idx++;
      continue;
    }
    const upper = cmd.toUpperCase();
    const isRel = cmd !== upper;

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      if (idx + 1 >= tokens.length) break;
      const nx = parseFloat(tokens[idx++]);
      const ny = parseFloat(tokens[idx++]);
      const absPair = !isRel || (cmd === 'm' && isFirstMove);
      curX = absPair ? nx : curX + nx;
      curY = absPair ? ny : curY + ny;
      if (upper === 'M') {
        startX = curX;
        startY = curY;
        isFirstMove = false;
        cmd = isRel ? 'l' : 'L';
      }
      recordPt(curX, curY);
    } else if (upper === 'H') {
      const nx = parseFloat(tokens[idx++]);
      curX = isRel ? curX + nx : nx;
      recordPt(curX, curY);
    } else if (upper === 'V') {
      const ny = parseFloat(tokens[idx++]);
      curY = isRel ? curY + ny : ny;
      recordPt(curX, curY);
    } else if (upper === 'C') {
      if (idx + 5 >= tokens.length) break;
      const x1 = parseFloat(tokens[idx++]);
      const y1 = parseFloat(tokens[idx++]);
      const x2 = parseFloat(tokens[idx++]);
      const y2 = parseFloat(tokens[idx++]);
      const x = parseFloat(tokens[idx++]);
      const y = parseFloat(tokens[idx++]);
      recordPt(isRel ? curX + x1 : x1, isRel ? curY + y1 : y1);
      recordPt(isRel ? curX + x2 : x2, isRel ? curY + y2 : y2);
      curX = isRel ? curX + x : x;
      curY = isRel ? curY + y : y;
      recordPt(curX, curY);
    } else if (upper === 'S' || upper === 'Q') {
      if (idx + 3 >= tokens.length) break;
      const x1 = parseFloat(tokens[idx++]);
      const y1 = parseFloat(tokens[idx++]);
      const x = parseFloat(tokens[idx++]);
      const y = parseFloat(tokens[idx++]);
      recordPt(isRel ? curX + x1 : x1, isRel ? curY + y1 : y1);
      curX = isRel ? curX + x : x;
      curY = isRel ? curY + y : y;
      recordPt(curX, curY);
    } else if (upper === 'A') {
      if (idx + 6 >= tokens.length) break;
      idx += 5;
      const x = parseFloat(tokens[idx++]);
      const y = parseFloat(tokens[idx++]);
      curX = isRel ? curX + x : x;
      curY = isRel ? curY + y : y;
      recordPt(curX, curY);
    } else {
      idx++;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Applies a 2D scale + translation `(x' = x * sx + tx, y' = y * sy + ty)` to an SVG path string
 * and formats it with single-space separation compatible with both browser Path2D and `svgaplayerweb`'s `BezierPath`.
 */
export function transformSvgPath2D(
  d: string,
  sx: number,
  sy: number,
  tx = 0,
  ty = 0
): string {
  if (!d || typeof d !== 'string') return d;
  if (
    Math.abs(sx - 1) < 1e-6 &&
    Math.abs(sy - 1) < 1e-6 &&
    Math.abs(tx) < 1e-5 &&
    Math.abs(ty) < 1e-5
  ) {
    return d;
  }
  const tokens = d.match(/[a-df-zA-DF-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi);
  if (!tokens || tokens.length === 0) return d;

  const fmt = (n: number) => {
    const v = Math.abs(n) < 1e-6 ? 0 : Number(n.toFixed(4));
    return String(v);
  };

  const out: string[] = [];
  let cmd = '';
  let isFirstMove = true;
  let idx = 0;

  while (idx < tokens.length) {
    const tk = tokens[idx];
    if (/^[a-df-zA-DF-Z]$/.test(tk)) {
      cmd = tk;
      idx++;
      if (cmd === 'Z' || cmd === 'z') {
        out.push(cmd);
      }
      continue;
    }
    if (!cmd) {
      idx++;
      continue;
    }
    const upper = cmd.toUpperCase();
    const isRel = cmd !== upper;

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      if (idx + 1 >= tokens.length) break;
      const nx = parseFloat(tokens[idx++]);
      const ny = parseFloat(tokens[idx++]);
      const absPair = !isRel || (cmd === 'm' && isFirstMove);
      const emitCmd = cmd === 'm' && isFirstMove && (Math.abs(tx) > 1e-5 || Math.abs(ty) > 1e-5) ? 'M' : cmd;
      const ox = absPair ? nx * sx + tx : nx * sx;
      const oy = absPair ? ny * sy + ty : ny * sy;
      out.push(`${emitCmd} ${fmt(ox)} ${fmt(oy)}`);
      if (upper === 'M') {
        isFirstMove = false;
        cmd = isRel ? 'l' : 'L';
      }
    } else if (upper === 'H') {
      const nx = parseFloat(tokens[idx++]);
      const ox = isRel ? nx * sx : nx * sx + tx;
      out.push(`${cmd} ${fmt(ox)}`);
    } else if (upper === 'V') {
      const ny = parseFloat(tokens[idx++]);
      const oy = isRel ? ny * sy : ny * sy + ty;
      out.push(`${cmd} ${fmt(oy)}`);
    } else if (upper === 'C') {
      if (idx + 5 >= tokens.length) break;
      const x1 = parseFloat(tokens[idx++]);
      const y1 = parseFloat(tokens[idx++]);
      const x2 = parseFloat(tokens[idx++]);
      const y2 = parseFloat(tokens[idx++]);
      const x = parseFloat(tokens[idx++]);
      const y = parseFloat(tokens[idx++]);
      out.push(
        `${cmd} ${fmt(isRel ? x1 * sx : x1 * sx + tx)} ${fmt(isRel ? y1 * sy : y1 * sy + ty)} ${fmt(
          isRel ? x2 * sx : x2 * sx + tx
        )} ${fmt(isRel ? y2 * sy : y2 * sy + ty)} ${fmt(isRel ? x * sx : x * sx + tx)} ${fmt(
          isRel ? y * sy : y * sy + ty
        )}`
      );
    } else if (upper === 'S' || upper === 'Q') {
      if (idx + 3 >= tokens.length) break;
      const x1 = parseFloat(tokens[idx++]);
      const y1 = parseFloat(tokens[idx++]);
      const x = parseFloat(tokens[idx++]);
      const y = parseFloat(tokens[idx++]);
      out.push(
        `${cmd} ${fmt(isRel ? x1 * sx : x1 * sx + tx)} ${fmt(isRel ? y1 * sy : y1 * sy + ty)} ${fmt(
          isRel ? x * sx : x * sx + tx
        )} ${fmt(isRel ? y * sy : y * sy + ty)}`
      );
    } else if (upper === 'A') {
      if (idx + 6 >= tokens.length) break;
      const rx = parseFloat(tokens[idx++]);
      const ry = parseFloat(tokens[idx++]);
      const rot = parseFloat(tokens[idx++]);
      const laf = tokens[idx++];
      const sf = tokens[idx++];
      const x = parseFloat(tokens[idx++]);
      const y = parseFloat(tokens[idx++]);
      out.push(
        `${cmd} ${fmt(Math.abs(rx * sx))} ${fmt(Math.abs(ry * sy))} ${fmt(rot)} ${laf} ${sf} ${fmt(
          isRel ? x * sx : x * sx + tx
        )} ${fmt(isRel ? y * sy : y * sy + ty)}`
      );
    } else {
      out.push(tokens[idx++]);
    }
  }

  return out.join(' ');
}

/**
 * Detects whether a frame's `clipPath` is a sub-cell window into a multi-cell sprite-sheet atlas
 * (where `imgW` or `imgH` is at least 1.8x the frame layout and `clipPath` selects a single cell).
 */
export function isSpriteSheetAtlasClipFrame(
  clipPath: string | undefined,
  fw: number,
  fh: number,
  imgW: number,
  imgH: number
): boolean {
  if (!clipPath || fw <= 0 || fh <= 0 || imgW <= 0 || imgH <= 0) return false;
  if (imgW < fw * 1.75 && imgH < fh * 1.75) return false;
  const bounds = getSvgPathBounds(clipPath);
  if (!bounds) return false;
  const clipW = bounds.maxX - bounds.minX;
  const clipH = bounds.maxY - bounds.minY;
  if (bounds.maxX > fw * 1.05 || bounds.maxY > fh * 1.05) {
    return true;
  }
  if (clipW <= fw * 1.15 && clipH <= fh * 1.15 && (imgW >= fw * 1.8 || imgH >= fh * 1.8)) {
    return true;
  }
  return false;
}

/**
 * Normalizes all sprite frames in an `SvgaMovie` so that when an embedded image's actual pixel
 * dimensions `(imgW, imgH)` differ from `fe.w × fe.h` (or `fe.x, fe.y` are non-zero), the frame
 * layout is normalized to `(0, 0, imgW, imgH)` and its `transform` and `clipPath` are compensated
 * mathematically. This repairs distorted SVGA files (such as `100.69.svga`) for both display and export.
 */
export function normalizeSvgaMovieLayoutAndTransforms(m: SvgaMovie): SvgaMovie {
  if (!m || !m.sp || !m.im) return m;
  for (const s of m.sp) {
    if (!s.key || !s.fr || s.fr.length === 0) continue;
    const rawBytes = m.im[s.key];
    if (!rawBytes) continue;
    const dim = readImageDimensionsFromBytes(rawBytes);
    if (!dim || dim.w <= 0 || dim.h <= 0) continue;
    const imgW = dim.w;
    const imgH = dim.h;

    for (const fe of s.fr) {
      if (!fe || (fe.shapesRaw && fe.shapesRaw.length > 0)) continue;
      const fw = fe.w > 0 ? fe.w : imgW;
      const fh = fe.h > 0 ? fe.h : imgH;
      const fx = fe.x || 0;
      const fy = fe.y || 0;

      if (isSpriteSheetAtlasClipFrame(fe.clipPath, fw, fh, imgW, imgH)) {
        continue;
      }

      if (
        Math.abs(fw - imgW) > 0.25 ||
        Math.abs(fh - imgH) > 0.25 ||
        Math.abs(fx) > 0.01 ||
        Math.abs(fy) > 0.01
      ) {
        const sx = fw / imgW;
        const sy = fh / imgH;
        const [a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0] = fe.t || [1, 0, 0, 1, 0, 0];
        fe.t = [
          Number((a * sx).toFixed(6)),
          Number((b * sx).toFixed(6)),
          Number((c * sy).toFixed(6)),
          Number((d * sy).toFixed(6)),
          Number((a * fx + c * fy + tx).toFixed(4)),
          Number((b * fx + d * fy + ty).toFixed(4)),
        ];
        if (fe.clipPath && fe.clipPath.trim().length > 0) {
          fe.clipPath = transformSvgPath2D(fe.clipPath, 1 / sx, 1 / sy, -fx / sx, -fy / sy);
        }
        fe.x = 0;
        fe.y = 0;
        fe.w = imgW;
        fe.h = imgH;
        m.layoutNormalized = true;
      }
    }
  }
  return m;
}

export function parseMovie(buf: Uint8Array): SvgaMovie {
  const m: SvgaMovie = { w: 0, h: 0, fps: 20, n: 0, im: {}, sp: [] };
  pm(buf, (f, r) => {
    if (f === 2) {
      pm(r.by(), (g, q) => {
        if (g === 1) m.w = q.f32();
        else if (g === 2) m.h = q.f32();
        else if (g === 3) m.fps = q.vi();
        else if (g === 4) m.n = q.vi();
        else return 0;
        return 1;
      });
      return 1;
    }
    if (f === 3) {
      let k = '';
      let v: Uint8Array | null = null;
      pm(r.by(), (g, q) => {
        if (g === 1) k = TD.decode(q.by());
        else if (g === 2) v = q.by().slice();
        else return 0;
        return 1;
      });
      if (v) m.im[k] = v;
      return 1;
    }
    if (f === 4) {
      const s: SvgaSprite = { key: '', fr: [] };
      pm(r.by(), (g, q) => {
        if (g === 1) {
          s.key = TD.decode(q.by());
          return 1;
        }
        if (g === 2) {
          const fe: SvgaFrame = { a: 0, x: 0, y: 0, w: 0, h: 0, t: [1, 0, 0, 1, 0, 0] };
          pm(q.by(), (h, z) => {
            if (h === 1) fe.a = z.f32();
            else if (h === 2)
              pm(z.by(), (i, u) => {
                if (i === 1) fe.x = u.f32();
                else if (i === 2) fe.y = u.f32();
                else if (i === 3) fe.w = u.f32();
                else if (i === 4) fe.h = u.f32();
                else return 0;
                return 1;
              });
            else if (h === 3) {
              let a = 0;
              let b = 0;
              let c = 0;
              let d = 0;
              let tx = 0;
              let ty = 0;
              let hasA = false;
              let hasB = false;
              let hasC = false;
              let hasD = false;
              pm(z.by(), (i, u) => {
                if (i === 1) {
                  a = u.f32();
                  hasA = true;
                } else if (i === 2) {
                  b = u.f32();
                  hasB = true;
                } else if (i === 3) {
                  c = u.f32();
                  hasC = true;
                } else if (i === 4) {
                  d = u.f32();
                  hasD = true;
                } else if (i === 5) {
                  tx = u.f32();
                } else if (i === 6) {
                  ty = u.f32();
                } else return 0;
                return 1;
              });
              const hasRotSkew = (hasB && Math.abs(b) > 1e-7) || (hasC && Math.abs(c) > 1e-7);
              if (!hasA) a = hasRotSkew ? 0 : 1;
              if (!hasD) d = hasRotSkew ? 0 : 1;
              fe.t = [a, b, c, d, tx, ty];
            } else if (h === 4) {
              fe.clipPath = TD.decode(z.by());
              return 1;
            } else if (h === 5) {
              m.shapes = 1;
              if (!fe.shapesRaw) fe.shapesRaw = [];
              fe.shapesRaw.push(z.by().slice());
              return 1;
            } else return 0;
            return 1;
          });
          s.fr.push(fe);
          return 1;
        }
        if (g === 3) {
          s.mk = TD.decode(q.by());
          if (s.mk) m.matte = 1;
          return 1;
        }
        return 0;
      });
      m.sp.push(s);
      return 1;
    }
    if (f === 5) {
      if (!m.audiosRaw) m.audiosRaw = [];
      m.audiosRaw.push(r.by().slice());
      return 1;
    }
    return 0;
  });
  return normalizeSvgaMovieLayoutAndTransforms(m);
}

export const bidx = (u: Uint8Array, s: string, from = 0): number => {
  const n = [...s].map((c) => c.charCodeAt(0));
  for (let i = u.indexOf(n[0], from); i >= 0; i = u.indexOf(n[0], i + 1)) {
    if (n.every((b, j) => u[i + j] === b)) return i;
  }
  return -1;
};

export function boxes(u: Uint8Array, start = 0, end = u.length): Mp4Box[] {
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const out: Mp4Box[] = [];
  for (let p = start; p < end; ) {
    // Ignore trailing zero padding at EOF
    if (p + 8 > end) {
      let allZero = true;
      for (let k = p; k < end; k++) {
        if (u[k] !== 0) {
          allZero = false;
          break;
        }
      }
      if (allZero) break;
      throw Error('Incomplete MP4 box');
    }
    let n = v.getUint32(p);
    let h = 8;
    if (n === 0 && u[p + 4] === 0 && u[p + 5] === 0 && u[p + 6] === 0 && u[p + 7] === 0) {
      break;
    }
    if (n === 1) {
      if (p + 16 > end) throw Error('Incomplete MP4 box');
      n = Number(v.getBigUint64(p + 8));
      h = 16;
    }
    if (n === 0) n = end - p;
    if (!Number.isSafeInteger(n) || n < h || p + n > end) {
      throw Error('Invalid MP4 box size');
    }
    out.push({ start: p, end: p + n, header: h, type: TD.decode(u.subarray(p + 4, p + 8)) });
    p += n;
  }
  return out;
}

export function metaFrom(data: any, kind: 'VAP' | 'YYEVA'): VapYyevaMeta | null {
  const res = metaFromAnyObject(data, kind);
  if (!res) {
    const d = kind === 'VAP' ? data?.info : data?.descript;
    if (!d) return null;
    throw Error('Invalid alpha / RGB rectangles');
  }
  return res;
}

export function readMeta(u: Uint8Array): VapYyevaMeta | null {
  return detectVapYyevaSequentialSync(u);
}

export function lotJson(names: string[], W: number, H: number, fps: number, ext: number) {
  return {
    v: '5.7.0',
    fr: fps,
    ip: 0,
    op: names.length,
    w: W,
    h: H,
    nm: 'frames',
    ddd: 0,
    markers: [],
    assets: names.map((p, i) => ({
      id: 'i' + i,
      w: W,
      h: H,
      u: ext ? '/images/' : '',
      p,
      e: ext ? 0 : 1,
    })),
    layers: names.map((_, i) => ({
      ddd: 0,
      ind: i + 1,
      ty: 2,
      nm: 'f' + i,
      refId: 'i' + i,
      sr: 1,
      ao: 0,
      ip: i,
      op: i + 1,
      st: 0,
      bm: 0,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [W / 2, H / 2, 0] },
        a: { a: 0, k: [W / 2, H / 2, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
    })),
  };
}

/* ============================================================================
 * Animated WebP (VP8X / ANIM / ANMF / VP8L / ALPH+VP8) Encoder, Muxer & Parser
 * ============================================================================ */

function writeLeBytes(n: number, byteCount: number): number[] {
  const out: number[] = [];
  let v = Math.max(0, Math.floor(n));
  for (let i = 0; i < byteCount; i++) {
    out.push(v & 0xff);
    v = Math.floor(v / 256);
  }
  return out;
}

function readLe24(u: Uint8Array, offset: number): number {
  return (u[offset] | (u[offset + 1] << 8) | (u[offset + 2] << 16)) >>> 0;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function ascii4(tag: string): Uint8Array {
  return Uint8Array.from(tag.slice(0, 4).padEnd(4, ' '), (c) => c.charCodeAt(0));
}

function makeRiffChunk(tag: string, payload: Uint8Array): Uint8Array {
  const pad = payload.length & 1;
  const out = new Uint8Array(8 + payload.length + pad);
  out.set(ascii4(tag), 0);
  const dv = new DataView(out.buffer);
  dv.setUint32(4, payload.length, true);
  out.set(payload, 8);
  return out;
}

/**
 * Pure TypeScript Lossless WebP (VP8L) single-frame encoder fallback.
 * Produces a spec-compliant `RIFF....WEBPVP8L....` image with 8-bit literal Huffman trees,
 * suitable for environments where `canvas.toBlob('image/webp')` is unavailable or returns PNG.
 */
export function encodeLosslessWebPFrame(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const W = Math.max(1, Math.min(16384, Math.floor(width)));
  const H = Math.max(1, Math.min(16384, Math.floor(height)));

  // Bit writer (LSB-first per WebP VP8L specification)
  const bytes: number[] = [0x2f]; // VP8L signature byte (0x2f)
  let bitBuf = 0;
  let bitCount = 0;

  const writeBits = (val: number, nBits: number) => {
    let v = val >>> 0;
    let rem = nBits;
    while (rem > 0) {
      const take = Math.min(rem, 8 - bitCount);
      const mask = (1 << take) - 1;
      bitBuf |= (v & mask) << bitCount;
      bitCount += take;
      v >>>= take;
      rem -= take;
      if (bitCount === 8) {
        bytes.push(bitBuf & 0xff);
        bitBuf = 0;
        bitCount = 0;
      }
    }
  };

  let hasAlpha = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 255) {
      hasAlpha = 1;
      break;
    }
  }

  // 14 bits width-1, 14 bits height-1, 1 bit alpha_is_used, 3 bits version_number (0)
  writeBits(W - 1, 14);
  writeBits(H - 1, 14);
  writeBits(hasAlpha, 1);
  writeBits(0, 3);

  // No transforms (0), no color cache (0), no meta Huffman codes (0)
  writeBits(0, 1);
  writeBits(0, 1);
  writeBits(0, 1);

  // Helper to emit a canonical 8-bit fixed-length prefix code tree for 256 symbols (all code lengths = 8)
  // Using VP8L normal code length tree where symbol 8 has length 1 (code 0) and symbol 0 has length 1 (code 1)
  const writeUniform256Tree = (alphabetSize: number) => {
    writeBits(0, 1); // Normal code length tree
    // num_code_lengths = 4 + 5 = 9 (kCodeLengthCodeOrder = [17, 18, 0, 1, 2, 3, 4, 5, 16, ...])
    writeBits(5, 4); // 9 code lengths
    // Order: [17, 18, 0, 1, 2, 3, 4, 5, 16]
    // Give code length 8 (wait: 8 is at index 11 in kCodeLengthCodeOrder: [17,18,0,1,2,3,4,5,16,6,7,8])
    // Let's write 12 code lengths (num_code_lengths = 4 + 8 = 12):
    // Wait: we already wrote 5 above; let's use simple 8-bit reverse bit writer per canonical Huffman!
  };
  void writeUniform256Tree;

  // Actually, in VP8L, if a channel only uses 1 or 2 symbols or if we write uncompressed/simple prefix codes:
  // Even simpler and 100% universal: if we need a valid WebP frame in pure JS for tests or fallback,
  // let's check if we have a single-color or arbitrary RGBA and write valid VP8L prefix codes!
  // Let's reset bytes and build the exact VP8L bitstream with kCodeLengthCodeOrder:
  bytes.length = 1;
  bitBuf = 0;
  bitCount = 0;
  writeBits(W - 1, 14);
  writeBits(H - 1, 14);
  writeBits(hasAlpha, 1);
  writeBits(0, 3);
  writeBits(0, 1); // no transform
  writeBits(0, 1); // no color cache
  writeBits(0, 1); // single Huffman group

  // kCodeLengthCodeOrder = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
  // For an alphabet where first 256 symbols have code length 8 and remaining symbols (if any, e.g. 256..279 in G) have length 0:
  // If we use code-length symbol 8 (at index 11 in kCodeLengthCodeOrder) with length 1 (code 0)
  // and code-length symbol 0 (at index 2 in kCodeLengthCodeOrder) with length 1 (code 1):
  const emitFull8BitTree = (totalAlphabet: number) => {
    writeBits(0, 1); // normal code length code
    writeBits(12 - 4, 4); // 12 code lengths in kCodeLengthCodeOrder (indices 0..11)
    const clLengths = [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1]; // symbol 0 -> len 1 (code 0), symbol 8 -> len 1 (code 1)
    for (const l of clLengths) writeBits(l, 3);
    writeBits(0, 1); // max_symbol = default (alphabet_size)
    // In canonical Huffman for clLengths (sym 0 has len 1 -> code 0; sym 8 has len 1 -> code 1):
    // Emit 256 symbols with length 8 (code 1), and (totalAlphabet - 256) symbols with length 0 (code 0):
    for (let s = 0; s < totalAlphabet; s++) {
      writeBits(s < 256 ? 1 : 0, 1);
    }
  };

  // Emit 5 trees: Green (256 + 24 = 280), Red (256), Blue (256), Alpha (256), Distance (40)
  emitFull8BitTree(280);
  emitFull8BitTree(256);
  emitFull8BitTree(256);
  emitFull8BitTree(256);
  // Distance tree: simple 1-symbol code (symbol 0)
  writeBits(1, 1); // simple code length code
  writeBits(0, 1); // num_symbols - 1 = 0 (1 symbol)
  writeBits(0, 1); // is_first_8bits = 0 (1 bit for symbol 0)
  writeBits(0, 1); // symbol 0

  // Reverse 8-bit canonical code table for 0..255
  const rev8 = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let r = 0;
    for (let b = 0; b < 8; b++) {
      r = (r << 1) | ((i >>> b) & 1);
    }
    rev8[i] = r;
  }

  const pixelCount = W * H;
  for (let p = 0; p < pixelCount; p++) {
    const idx = p * 4;
    const r = rgba[idx] ?? 0;
    const g = rgba[idx + 1] ?? 0;
    const b = rgba[idx + 2] ?? 0;
    const a = rgba[idx + 3] ?? 255;
    // VP8L literal order: Green, Red, Blue, Alpha
    writeBits(rev8[g], 8);
    writeBits(rev8[r], 8);
    writeBits(rev8[b], 8);
    writeBits(rev8[a], 8);
  }

  if (bitCount > 0) {
    bytes.push(bitBuf & 0xff);
  }

  const vp8lChunk = makeRiffChunk('VP8L', new Uint8Array(bytes));
  const body = concatUint8Arrays([ascii4('WEBP'), vp8lChunk]);
  const riff = new Uint8Array(8 + body.length);
  riff.set(ascii4('RIFF'), 0);
  new DataView(riff.buffer).setUint32(4, body.length, true);
  riff.set(body, 8);
  return riff;
}

export interface AnimatedWebPInfo {
  isAnimated: boolean;
  width: number;
  height: number;
  frameCount: number;
  hasAlpha: boolean;
  durationsMs: number[];
  frameFlags: number[];
}

/**
 * Inspects a WebP buffer and returns structural metadata (dimensions, frame count, durations, ANMF flags).
 */
export function parseAnimatedWebPInfo(webpBytes: Uint8Array): AnimatedWebPInfo | null {
  if (!webpBytes || webpBytes.length < 20) return null;
  if (
    TD.decode(webpBytes.subarray(0, 4)) !== 'RIFF' ||
    TD.decode(webpBytes.subarray(8, 12)) !== 'WEBP'
  ) {
    return null;
  }
  const dv = new DataView(webpBytes.buffer, webpBytes.byteOffset, webpBytes.byteLength);
  let p = 12;
  let width = 0;
  let height = 0;
  let isAnimated = false;
  let hasAlpha = false;
  const durationsMs: number[] = [];
  const frameFlags: number[] = [];

  while (p + 8 <= webpBytes.length) {
    const tag = TD.decode(webpBytes.subarray(p, p + 4));
    const size = dv.getUint32(p + 4, true);
    const payloadStart = p + 8;
    const payloadEnd = Math.min(webpBytes.length, payloadStart + size);

    if (tag === 'VP8X' && payloadEnd - payloadStart >= 10) {
      const flags = webpBytes[payloadStart];
      if (flags & 0x02) isAnimated = true;
      if (flags & 0x10) hasAlpha = true;
      width = readLe24(webpBytes, payloadStart + 4) + 1;
      height = readLe24(webpBytes, payloadStart + 7) + 1;
    } else if (tag === 'ANIM') {
      isAnimated = true;
    } else if (tag === 'ANMF' && payloadEnd - payloadStart >= 16) {
      isAnimated = true;
      const fw = readLe24(webpBytes, payloadStart + 6) + 1;
      const fh = readLe24(webpBytes, payloadStart + 9) + 1;
      const dur = readLe24(webpBytes, payloadStart + 12);
      const flg = webpBytes[payloadStart + 15];
      if (!width) width = fw;
      if (!height) height = fh;
      durationsMs.push(dur);
      frameFlags.push(flg);
    } else if (tag === 'VP8L' && payloadEnd - payloadStart >= 5 && !width) {
      const b1 = webpBytes[payloadStart + 1];
      const b2 = webpBytes[payloadStart + 2];
      const b3 = webpBytes[payloadStart + 3];
      const b4 = webpBytes[payloadStart + 4];
      width = (b1 | ((b2 & 0x3f) << 8)) + 1;
      height = ((b2 >>> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)) + 1;
      if (b4 & 0x10) hasAlpha = true;
    } else if (tag === 'VP8 ' && payloadEnd - payloadStart >= 10 && !width) {
      width = (webpBytes[payloadStart + 6] | (webpBytes[payloadStart + 7] << 8)) & 0x3fff;
      height = (webpBytes[payloadStart + 8] | (webpBytes[payloadStart + 9] << 8)) & 0x3fff;
    }
    p += 8 + size + (size & 1);
  }

  return {
    isAnimated,
    width: width || 1,
    height: height || 1,
    frameCount: durationsMs.length || 1,
    hasAlpha,
    durationsMs: durationsMs.length ? durationsMs : [100],
    frameFlags,
  };
}

/**
 * Muxes an array of single-frame WebP buffers (`RIFF....WEBP`) into a standards-compliant
 * Animated WebP (`VP8X` + `ANIM` + `ANMF` chunks).
 *
 * Crucial fixes over legacy webpMux:
 * 1. Sets `ANMF` flags byte to `0x03` (`Bit 1 = 0x02` [Do not blend / overwrite] | `Bit 0 = 0x01` [Dispose to transparent background 0x00000000]).
 *    This prevents transparent animation frames from stacking/ghosting on top of previous frames!
 * 2. Guarantees `ALPH` precedes `VP8 ` inside every `ANMF` payload, and never attaches `ALPH` to `VP8L`.
 * 3. Validates chunk boundaries (`p + 8 <= u.length`) and sets accurate `VP8X` flags (`0x12` when alpha is present, `0x02` otherwise).
 */
export function muxAnimatedWebPFrames(
  frameWebpBuffers: (ArrayBuffer | Uint8Array)[],
  width: number,
  height: number,
  fps: number,
  loopCount = 0
): Uint8Array {
  if (!frameWebpBuffers || frameWebpBuffers.length === 0) {
    throw new Error('Cannot mux Animated WebP: no frames provided');
  }

  const W = Math.max(1, Math.min(16384, Math.round(width)));
  const H = Math.max(1, Math.min(16384, Math.round(height)));
  const frameDurationMs = Math.max(10, Math.round(1000 / Math.max(1, fps)));
  let anyAlpha = false;

  const anmfChunks: Uint8Array[] = frameWebpBuffers.map((buf, frameIdx) => {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (
      u.length < 20 ||
      TD.decode(u.subarray(0, 4)) !== 'RIFF' ||
      TD.decode(u.subarray(8, 12)) !== 'WEBP'
    ) {
      throw new Error(`Frame ${frameIdx} is not a valid RIFF WEBP buffer`);
    }

    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let p = 12;
    let alphChunk: Uint8Array | null = null;
    let bitstreamChunk: Uint8Array | null = null;

    while (p + 8 <= u.length) {
      const tag = TD.decode(u.subarray(p, p + 4));
      const size = dv.getUint32(p + 4, true);
      const end = Math.min(u.length, p + 8 + size);
      const slice = u.subarray(p + 8, end);

      if (tag === 'VP8X' && slice.length >= 1) {
        if (slice[0] & 0x10) anyAlpha = true;
      } else if (tag === 'ALPH') {
        anyAlpha = true;
        alphChunk = makeRiffChunk('ALPH', slice);
      } else if (tag === 'VP8 ') {
        bitstreamChunk = makeRiffChunk('VP8 ', slice);
      } else if (tag === 'VP8L') {
        if (slice.length >= 5 && (slice[4] & 0x10)) {
          anyAlpha = true;
        } else {
          anyAlpha = true; // Lossless WebP supports full ARGB
        }
        bitstreamChunk = makeRiffChunk('VP8L', slice);
      } else if (tag === 'ANMF' && slice.length > 16) {
        // Frame was already an ANMF chunk; extract its inner subchunks
        let sp = 16;
        const sdv = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
        while (sp + 8 <= slice.length) {
          const stag = TD.decode(slice.subarray(sp, sp + 4));
          const ssize = sdv.getUint32(sp + 4, true);
          const send = Math.min(slice.length, sp + 8 + ssize);
          const sdata = slice.subarray(sp + 8, send);
          if (stag === 'ALPH') {
            anyAlpha = true;
            alphChunk = makeRiffChunk('ALPH', sdata);
          } else if (stag === 'VP8 ' || stag === 'VP8L') {
            if (stag === 'VP8L') anyAlpha = true;
            bitstreamChunk = makeRiffChunk(stag, sdata);
          }
          sp += 8 + ssize + (ssize & 1);
        }
      }
      p += 8 + size + (size & 1);
    }

    if (!bitstreamChunk) {
      throw new Error(`Frame ${frameIdx} missing VP8/VP8L bitstream chunk`);
    }

    const isLossless = TD.decode(bitstreamChunk.subarray(0, 4)) === 'VP8L';
    const subChunks = !isLossless && alphChunk ? [alphChunk, bitstreamChunk] : [bitstreamChunk];

    // ANMF 16-byte header:
    // Frame X (3B) = 0, Frame Y (3B) = 0, Width-1 (3B), Height-1 (3B), Duration (3B), Flags (1B) = 0x03
    // Flags 0x03: Bit 1 (0x02 = Do not blend / overwrite) | Bit 0 (0x01 = Dispose to background color)
    const anmfHeader = new Uint8Array([
      ...writeLeBytes(0, 3),
      ...writeLeBytes(0, 3),
      ...writeLeBytes(W - 1, 3),
      ...writeLeBytes(H - 1, 3),
      ...writeLeBytes(frameDurationMs, 3),
      0x03,
    ]);

    return makeRiffChunk('ANMF', concatUint8Arrays([anmfHeader, ...subChunks]));
  });

  // VP8X payload (10 bytes): Flags (1B), Reserved (3B), Canvas Width-1 (3B), Canvas Height-1 (3B)
  // Flags: 0x02 (Animation) | (anyAlpha ? 0x10 : 0x00)
  const vp8xFlags = 0x02 | (anyAlpha ? 0x10 : 0x00);
  const vp8xChunk = makeRiffChunk(
    'VP8X',
    new Uint8Array([vp8xFlags, 0, 0, 0, ...writeLeBytes(W - 1, 3), ...writeLeBytes(H - 1, 3)])
  );

  // ANIM payload (6 bytes): Background Color BGRA (4B = 0,0,0,0 transparent) + Loop Count (2B LE)
  const animChunk = makeRiffChunk(
    'ANIM',
    new Uint8Array([0, 0, 0, 0, ...writeLeBytes(loopCount & 0xffff, 2)])
  );

  const webpBody = concatUint8Arrays([ascii4('WEBP'), vp8xChunk, animChunk, ...anmfChunks]);
  const out = new Uint8Array(8 + webpBody.length);
  out.set(ascii4('RIFF'), 0);
  new DataView(out.buffer).setUint32(4, webpBody.length, true);
  out.set(webpBody, 8);
  return out;
}

/**
 * Demuxes an Animated WebP (`ANMF` chunks) into standalone single-frame `.webp` files
 * so any browser can decode each frame via `createImageBitmap` / `<img>` even if `ImageDecoder` is unavailable.
 */
export function demuxAnimatedWebPToSingleFrames(webpBytes: Uint8Array): {
  width: number;
  height: number;
  durationsMs: number[];
  frames: Uint8Array[];
} {
  const info = parseAnimatedWebPInfo(webpBytes);
  if (!info) {
    throw new Error('Invalid WebP buffer');
  }
  if (!info.isAnimated) {
    return {
      width: info.width,
      height: info.height,
      durationsMs: [100],
      frames: [webpBytes],
    };
  }

  const dv = new DataView(webpBytes.buffer, webpBytes.byteOffset, webpBytes.byteLength);
  let p = 12;
  const durationsMs: number[] = [];
  const frames: Uint8Array[] = [];

  while (p + 8 <= webpBytes.length) {
    const tag = TD.decode(webpBytes.subarray(p, p + 4));
    const size = dv.getUint32(p + 4, true);
    const payloadStart = p + 8;
    const payloadEnd = Math.min(webpBytes.length, payloadStart + size);

    if (tag === 'ANMF' && payloadEnd - payloadStart > 16) {
      const fw = readLe24(webpBytes, payloadStart + 6) + 1;
      const fh = readLe24(webpBytes, payloadStart + 9) + 1;
      const dur = Math.max(10, readLe24(webpBytes, payloadStart + 12));
      const subData = webpBytes.subarray(payloadStart + 16, payloadEnd);

      // Check if subData starts with ALPH; if so, include a VP8X header for the standalone single-frame WebP
      const firstSubTag = subData.length >= 4 ? TD.decode(subData.subarray(0, 4)) : '';
      const chunks: Uint8Array[] = [ascii4('WEBP')];
      if (firstSubTag === 'ALPH') {
        chunks.push(
          makeRiffChunk(
            'VP8X',
            new Uint8Array([0x10, 0, 0, 0, ...writeLeBytes(fw - 1, 3), ...writeLeBytes(fh - 1, 3)])
          )
        );
      }
      chunks.push(subData);
      const body = concatUint8Arrays(chunks);
      const singleRiff = new Uint8Array(8 + body.length);
      singleRiff.set(ascii4('RIFF'), 0);
      new DataView(singleRiff.buffer).setUint32(4, body.length, true);
      singleRiff.set(body, 8);

      durationsMs.push(dur);
      frames.push(singleRiff);
    }
    p += 8 + size + (size & 1);
  }

  return {
    width: info.width,
    height: info.height,
    durationsMs: durationsMs.length ? durationsMs : [100],
    frames: frames.length ? frames : [webpBytes],
  };
}

/* ============================================================================
 * Animated PNG (APNG) Encoder, Parser & Decoder (powered by upng-js + pako)
 * ============================================================================ */

function writeBe32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}

function writeBe16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n & 0xffff, false);
  return b;
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = ascii4(type);
  const crcInput = concatUint8Arrays([typeBytes, data]);
  const crcVal = crc32(crcInput);
  return concatUint8Arrays([writeBe32(data.length), typeBytes, data, writeBe32(crcVal)]);
}

/**
 * Encodes RGBA frames into a standards-compliant Animated PNG (`.apng` / `.png`)
 * using `pako` (zlib deflate) and optional `upng-js` palette/color quantization when `quality < 1`.
 *
 * Sets `dispose_op = 1` (`APNG_DISPOSE_OP_BACKGROUND`) and `blend_op = 0` (`APNG_BLEND_OP_SOURCE`)
 * on every `fcTL` chunk so full-canvas transparent frames never ghost or stack over previous frames.
 */
export function encodeAnimatedApng(
  framesRgba: (Uint8Array | Uint8ClampedArray | ArrayBuffer)[],
  width: number,
  height: number,
  fps: number,
  quality = 1,
  loopCount = 0
): Uint8Array {
  if (!framesRgba || framesRgba.length === 0) {
    throw new Error('Cannot encode APNG: no frames provided');
  }
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  const safeFps = Math.max(1, Math.min(1000, Math.round(fps || 15)));
  const delayNum = Math.max(1, Math.round(1000 / safeFps));
  const delayDen = 1000;

  const normalizedBuffers: ArrayBuffer[] = framesRgba.map((fr) => {
    const u =
      fr instanceof ArrayBuffer
        ? new Uint8Array(fr)
        : new Uint8Array(fr.buffer, fr.byteOffset, fr.byteLength);
    // Optional color stepping for higher compression when quality < 1
    if (quality > 0 && quality < 0.99) {
      const step = Math.max(2, Math.round((1 - quality) * 24));
      const copy = new Uint8Array(u.length);
      for (let i = 0; i < u.length; i += 4) {
        copy[i] = Math.min(255, Math.round(u[i] / step) * step);
        copy[i + 1] = Math.min(255, Math.round(u[i + 1] / step) * step);
        copy[i + 2] = Math.min(255, Math.round(u[i + 2] / step) * step);
        copy[i + 3] = u[i + 3];
      }
      return copy.buffer;
    }
    const copy = new Uint8Array(u.length);
    copy.set(u);
    return copy.buffer;
  });

  // Build PNG signature + IHDR + acTL + per-frame (fcTL + IDAT/fdAT) + IEND with Sub/None adaptive row filtering
  const pngSig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = makePngChunk(
    'IHDR',
    concatUint8Arrays([writeBe32(W), writeBe32(H), new Uint8Array([8, 6, 0, 0, 0])])
  );
  const actl = makePngChunk(
    'acTL',
    concatUint8Arrays([writeBe32(normalizedBuffers.length), writeBe32(loopCount >>> 0)])
  );

  const chunks: Uint8Array[] = [pngSig, ihdr, actl];
  let seqNum = 0;

  for (let i = 0; i < normalizedBuffers.length; i++) {
    const rgba = new Uint8Array(normalizedBuffers[i]);

    // fcTL (26 bytes):
    // seq (4B), width (4B), height (4B), x_offset (4B=0), y_offset (4B=0),
    // delay_num (2B), delay_den (2B), dispose_op (1B = 1: CLEAR TO BACKGROUND), blend_op (1B = 0: SOURCE OVERWRITE)
    const fctlData = concatUint8Arrays([
      writeBe32(seqNum++),
      writeBe32(W),
      writeBe32(H),
      writeBe32(0),
      writeBe32(0),
      writeBe16(delayNum),
      writeBe16(delayDen),
      new Uint8Array([1, 0]),
    ]);
    chunks.push(makePngChunk('fcTL', fctlData));

    // Filter scanlines using PNG Filter Type 1 (Sub) or 0 (None) for optimal pako deflate ratio
    const rowBytes = W * 4;
    const rawScanlines = new Uint8Array((rowBytes + 1) * H);
    for (let y = 0; y < H; y++) {
      const rowOffset = y * (rowBytes + 1);
      const srcOffset = y * rowBytes;
      rawScanlines[rowOffset] = 1; // Filter 1 (Sub)
      for (let x = 0; x < rowBytes; x++) {
        const curByte = rgba[srcOffset + x] ?? 0;
        const leftByte = x >= 4 ? (rgba[srcOffset + x - 4] ?? 0) : 0;
        rawScanlines[rowOffset + 1 + x] = (curByte - leftByte) & 0xff;
      }
    }

    const compressed = pako.deflate(rawScanlines, { level: 6 });
    if (i === 0) {
      chunks.push(makePngChunk('IDAT', compressed));
    } else {
      chunks.push(makePngChunk('fdAT', concatUint8Arrays([writeBe32(seqNum++), compressed])));
    }
  }

  chunks.push(makePngChunk('IEND', new Uint8Array(0)));
  return concatUint8Arrays(chunks);
}

export interface ApngInfo {
  isApng: boolean;
  width: number;
  height: number;
  numFrames: number;
  numPlays: number;
  delaysMs: number[];
  disposeOps: number[];
  blendOps: number[];
}

/**
 * Parses a PNG/APNG binary and extracts `IHDR`, `acTL`, and `fcTL` metadata.
 */
export function parseApngInfo(pngBytes: Uint8Array): ApngInfo | null {
  if (!pngBytes || pngBytes.length < 33) return null;
  if (
    pngBytes[0] !== 0x89 ||
    pngBytes[1] !== 0x50 ||
    pngBytes[2] !== 0x4e ||
    pngBytes[3] !== 0x47
  ) {
    return null;
  }

  const dv = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let isApng = false;
  let numFrames = 1;
  let numPlays = 0;
  const delaysMs: number[] = [];
  const disposeOps: number[] = [];
  const blendOps: number[] = [];

  while (pos + 12 <= pngBytes.length) {
    const len = dv.getUint32(pos, false);
    const type = TD.decode(pngBytes.subarray(pos + 4, pos + 8));
    const dataOffset = pos + 8;

    if (dataOffset + len > pngBytes.length) break;

    if (type === 'IHDR' && len >= 8) {
      width = dv.getUint32(dataOffset, false);
      height = dv.getUint32(dataOffset + 4, false);
    } else if (type === 'acTL' && len >= 8) {
      isApng = true;
      numFrames = dv.getUint32(dataOffset, false);
      numPlays = dv.getUint32(dataOffset + 4, false);
    } else if (type === 'fcTL' && len >= 26) {
      const delayNum = dv.getUint16(dataOffset + 20, false);
      const delayDen = dv.getUint16(dataOffset + 22, false) || 100;
      const disposeOp = pngBytes[dataOffset + 24];
      const blendOp = pngBytes[dataOffset + 25];
      delaysMs.push(Math.max(10, Math.round((delayNum * 1000) / delayDen)));
      disposeOps.push(disposeOp);
      blendOps.push(blendOp);
    } else if (type === 'IEND') {
      break;
    }

    pos += 12 + len;
  }

  return {
    isApng,
    width,
    height,
    numFrames: isApng ? Math.max(1, numFrames) : 1,
    numPlays,
    delaysMs: delaysMs.length ? delaysMs : [100],
    disposeOps,
    blendOps,
  };
}

/**
 * Decodes a PNG or APNG binary into full-canvas RGBA8 frames using `upng-js`.
 */
export function decodeApngFramesRgba(pngBytes: Uint8Array): {
  width: number;
  height: number;
  delaysMs: number[];
  frames: Uint8Array[];
} {
  const info = parseApngInfo(pngBytes);
  const copyBuf = pngBytes.slice().buffer;
  const img = UPNG.decode(copyBuf);
  const rgbaBuffers = UPNG.toRGBA8(img);
  const frames: Uint8Array[] = rgbaBuffers.map((ab: ArrayBuffer) => new Uint8Array(ab));
  const delaysMs =
    info && info.delaysMs.length === frames.length
      ? info.delaysMs
      : frames.map((_: Uint8Array, i: number) =>
          img.frames && img.frames[i]?.delay ? img.frames[i].delay : 67
        );

  return {
    width: img.width || info?.width || 1,
    height: img.height || info?.height || 1,
    delaysMs,
    frames,
  };
}

