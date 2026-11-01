import { PB, pm, pako, UPNG } from './codecs';

export type SvgaCompressionMode = 'auto_quality' | 'smart_300' | 'png8_only' | 'scale_proportional';

export interface PngCompressionAnalysis {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  hasPlte: boolean;
  plteCount: number;
  hasTrns: boolean;
  trnsCount: number;
  uniqueRgbaColors: number;
  semiTransparentColors: number;
  ditherRatio: number;
  isDithered: boolean;
  byteSize: number;
  compressionSystem: 'png8-dithered-alpha' | 'png8-indexed' | 'png32-quantized-256' | 'png32-raw';
  summaryAr: string;
}

export interface SpriteCompressionTarget {
  origW: number;
  origH: number;
  targetW: number;
  targetH: number;
  sx: number;
  sy: number;
  maxColors: number;
  ditherStrength: number;
}

export interface SpriteScaleEntry {
  origW: number;
  origH: number;
  targetW: number;
  targetH: number;
  sx: number;
  sy: number;
}

/**
 * Inspects a PNG binary buffer and returns its exact compression profile:
 * - IHDR dimensions, bitDepth, colorType (3 = Indexed PNG-8, 6 = RGBA PNG-32)
 * - PLTE palette size and tRNS alpha table count
 * - Decoded unique RGBA colors, semi-transparent palette entries, and error-diffusion dithering signature
 */
export function analyzePngBinary(pngBytes: Uint8Array): PngCompressionAnalysis {
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let hasPlte = false;
  let plteCount = 0;
  let hasTrns = false;
  let trnsCount = 0;

  if (
    pngBytes.byteLength >= 24 &&
    pngBytes[0] === 0x89 &&
    pngBytes[1] === 0x50 &&
    pngBytes[2] === 0x4e &&
    pngBytes[3] === 0x47
  ) {
    const dv = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
    let off = 8;
    while (off + 12 <= pngBytes.byteLength) {
      const len = dv.getUint32(off, false);
      const type = String.fromCharCode(
        pngBytes[off + 4],
        pngBytes[off + 5],
        pngBytes[off + 6],
        pngBytes[off + 7]
      );
      const dataOff = off + 8;
      if (dataOff + len > pngBytes.byteLength) break;
      if (type === 'IHDR' && len >= 13) {
        width = dv.getUint32(dataOff, false);
        height = dv.getUint32(dataOff + 4, false);
        bitDepth = pngBytes[dataOff + 8];
        colorType = pngBytes[dataOff + 9];
      } else if (type === 'PLTE') {
        hasPlte = true;
        plteCount = Math.floor(len / 3);
      } else if (type === 'tRNS') {
        hasTrns = true;
        trnsCount = len;
      } else if (type === 'IEND') {
        break;
      }
      off += 12 + len;
    }
  }

  let uniqueRgbaColors = 0;
  let semiTransparentColors = 0;
  let ditherRatio = 0;

  try {
    const decoded = UPNG.decode(pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength));
    if (decoded && decoded.width > 0 && decoded.height > 0) {
      width = decoded.width;
      height = decoded.height;
      const rgbaFrames = UPNG.toRGBA8(decoded);
      if (rgbaFrames && rgbaFrames[0]) {
        const rgba = new Uint8Array(rgbaFrames[0]);
        const colorSet = new Set<number>();
        const semiSet = new Set<number>();
        for (let i = 0; i < rgba.length; i += 4) {
          const a = rgba[i + 3];
          const r = a === 0 ? 0 : rgba[i];
          const g = a === 0 ? 0 : rgba[i + 1];
          const b = a === 0 ? 0 : rgba[i + 2];
          const key = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
          colorSet.add(key);
          if (a > 0 && a < 255) semiSet.add(key);
        }
        uniqueRgbaColors = colorSet.size;
        semiTransparentColors = semiSet.size;

        let altCount = 0;
        let totalTriples = 0;
        const yStart = Math.min(8, Math.floor(height / 4));
        const yEnd = Math.max(yStart + 1, height - yStart);
        const xStart = Math.min(8, Math.floor(width / 4));
        const xEnd = Math.max(xStart + 1, width - xStart - 2);
        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            const i0 = (y * width + x) * 4;
            const i1 = i0 + 4;
            const i2 = i0 + 8;
            if (rgba[i0 + 3] === 255 && rgba[i1 + 3] === 255 && rgba[i2 + 3] === 255) {
              totalTriples++;
              const c0 = (rgba[i0] << 16) | (rgba[i0 + 1] << 8) | rgba[i0 + 2];
              const c1 = (rgba[i1] << 16) | (rgba[i1 + 1] << 8) | rgba[i1 + 2];
              const c2 = (rgba[i2] << 16) | (rgba[i2 + 1] << 8) | rgba[i2 + 2];
              if (c0 === c2 && c0 !== c1) altCount++;
            }
          }
        }
        if (totalTriples > 0) {
          ditherRatio = Number((altCount / totalTriples).toFixed(4));
        }
      }
    }
  } catch (_) {}

  const isDithered = ditherRatio >= 0.025 && uniqueRgbaColors <= 256;
  let compressionSystem: PngCompressionAnalysis['compressionSystem'] = 'png32-raw';
  if (colorType === 3 && (isDithered || hasTrns)) {
    compressionSystem = 'png8-dithered-alpha';
  } else if (colorType === 3) {
    compressionSystem = 'png8-indexed';
  } else if (uniqueRgbaColors > 0 && uniqueRgbaColors <= 256) {
    compressionSystem = 'png32-quantized-256';
  }

  const sizeKb = (pngBytes.byteLength / 1024).toFixed(1);
  const summaryAr =
    compressionSystem === 'png8-dithered-alpha' || compressionSystem === 'png32-quantized-256'
      ? `ضغط PNG-8 مفهرس (${uniqueRgbaColors} لون RGBA + شفافية ألفا متدرجة ${semiTransparentColors} درجة + تنعيم Dithering · ${width}×${height}px · ${sizeKb} KB)`
      : compressionSystem === 'png8-indexed'
      ? `PNG-8 مفهرس (${plteCount || uniqueRgbaColors} لون · ${width}×${height}px · ${sizeKb} KB)`
      : `PNG-32 كامل (${uniqueRgbaColors} لون · ${width}×${height}px · ${sizeKb} KB)`;

  return {
    width,
    height,
    bitDepth,
    colorType,
    hasPlte,
    plteCount,
    hasTrns,
    trnsCount,
    uniqueRgbaColors,
    semiTransparentColors,
    ditherRatio,
    isDithered,
    byteSize: pngBytes.byteLength,
    compressionSystem,
    summaryAr,
  };
}

/**
 * Computes the target dimensions and PNG-8 quantization parameters for an SVGA sprite image
 * matching the reference `img_1646.png` compression system:
 * - `smart_300`: Caps large sprites (e.g. 750×750) to 300×300 at 80–100% quality (and scales down further below 80%),
 *   while preserving full 256 RGBA colors + Floyd-Steinberg dithering + SVGA transform matrix upscaling.
 * - `png8_only`: Preserves original pixel dimensions (100% scale) and applies 256-color dithered PNG-8 quantization.
 * - `scale_proportional`: Scales sprite dimensions directly by `qualityPercent / 100` + dithered PNG-8 quantization.
 */
export function computeSvgaSpriteCompressionTarget(
  origW: number,
  origH: number,
  qualityPercent: number,
  mode: SvgaCompressionMode = 'auto_quality'
): SpriteCompressionTarget {
  const safeW = Math.max(1, Math.round(origW));
  const safeH = Math.max(1, Math.round(origH));
  const q = Math.max(1, Math.min(100, Number.isFinite(qualityPercent) ? qualityPercent : 100));

  let targetW = safeW;
  let targetH = safeH;
  let maxColors = 256;
  const ditherStrength = q >= 85 ? 0.72 : q >= 50 ? 0.65 : 0.55;

  if (mode === 'png8_only') {
    targetW = safeW;
    targetH = safeH;
    maxColors = q >= 90 ? 256 : Math.max(24, Math.round(32 + (224 * q) / 90));
  } else if (mode === 'scale_proportional') {
    const scale = Math.max(0.15, Math.min(1, q / 100));
    targetW = Math.max(4, Math.round(safeW * scale));
    targetH = Math.max(4, Math.round(safeH * scale));
    maxColors = q >= 40 ? 256 : Math.max(32, Math.round(64 + (192 * q) / 40));
  } else if (mode === 'auto_quality') {
    // Unified automatic background compression curve driven solely by #qual (100% down to 1%):
    // - At 100%: keeps 100% original dimensions (sx = 1, sy = 1) and full 256 colors.
    // - Below 100%: progressively downscales sprites (targeting the 300×300 reference gift size around 80–90%
    //   for large >300px canvases and scaling down further below 80%) with 8-bit Indexed PNG-8 (PLTE+tRNS)
    //   and automatic FrameEntity 2.5× matrix compensation.
    const maxOrigDim = Math.max(safeW, safeH);
    let targetMaxDim = maxOrigDim;

    if (q < 100) {
      if (maxOrigDim > 300) {
        if (q > 90) {
          // 91%..99%: smooth transition from original dimension toward the 300px reference gift cap
          targetMaxDim = Math.round(300 + ((maxOrigDim - 300) * (q - 90)) / 10);
        } else if (q >= 80) {
          // 80%..90%: exact 300×300 reference gift dimension (e.g. 750×750 -> 300×300 with 2.5× matrix)
          targetMaxDim = 300;
        } else {
          // 1%..79%: progressively smaller than 300px down to 64px
          const subScale = 0.22 + 0.78 * (q / 80);
          targetMaxDim = Math.max(64, Math.round(300 * subScale));
        }
      } else {
        // Sprite is already <= 300px (e.g. re-compressing an already 300×300 SVGA at q < 100)
        const subScale = 0.3 + 0.7 * (q / 100);
        targetMaxDim = Math.max(32, Math.round(maxOrigDim * subScale));
      }

      if (targetMaxDim < maxOrigDim) {
        const ratio = targetMaxDim / maxOrigDim;
        targetW = Math.max(4, Math.round(safeW * ratio));
        targetH = Math.max(4, Math.round(safeH * ratio));
      }
    }

    maxColors = q >= 70 ? 256 : Math.max(32, Math.round(32 + (224 * q) / 70));
  } else {
    // 'smart_300' — Exact system used on img_1646.png (300×300 PNG-8 256 colors inside 750×750 SVGA)
    const maxOrigDim = Math.max(safeW, safeH);
    let targetMaxDim = maxOrigDim;

    if (maxOrigDim > 300) {
      // At q = 80..100, cap at 300px (just like 750x750 -> 300x300 in img_1646.png).
      // Below q = 80, scale smoothly down from 300px toward 120px.
      if (q >= 80) {
        targetMaxDim = 300;
      } else {
        const subScale = 0.4 + 0.6 * (q / 80);
        targetMaxDim = Math.max(64, Math.round(300 * subScale));
      }
    } else if (q < 100) {
      // Sprite is already <= 300px (e.g., re-compressing an already 300x300 SVGA at q < 100)
      const subScale = 0.35 + 0.65 * (q / 100);
      targetMaxDim = Math.max(32, Math.round(maxOrigDim * subScale));
    }

    if (targetMaxDim < maxOrigDim) {
      const ratio = targetMaxDim / maxOrigDim;
      targetW = Math.max(4, Math.round(safeW * ratio));
      targetH = Math.max(4, Math.round(safeH * ratio));
    }

    maxColors = q >= 65 ? 256 : Math.max(32, Math.round(48 + (208 * q) / 65));
  }

  return {
    origW: safeW,
    origH: safeH,
    targetW,
    targetH,
    sx: safeW / targetW,
    sy: safeH / targetH,
    maxColors: Math.max(16, Math.min(256, maxColors)),
    ditherStrength,
  };
}

/**
 * High-quality premultiplied-alpha box/bilinear area downsampler for RGBA pixel buffers.
 * Prevents dark/black halos around semi-transparent vignette edges (like `img_1646.png`)
 * by weighting RGB channels by alpha during downscaling.
 */
export function resampleRgbaPremultiplied(
  src: Uint8Array | Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8Array {
  if (srcW === dstW && srcH === dstH) {
    return new Uint8Array(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength));
  }
  const out = new Uint8Array(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const sy0 = dy * scaleY;
    const sy1 = Math.min(srcH, (dy + 1) * scaleY);
    const iy0 = Math.floor(sy0);
    const iy1 = Math.min(srcH - 1, Math.ceil(sy1) - 1);

    for (let dx = 0; dx < dstW; dx++) {
      const sx0 = dx * scaleX;
      const sx1 = Math.min(srcW, (dx + 1) * scaleX);
      const ix0 = Math.floor(sx0);
      const ix1 = Math.min(srcW - 1, Math.ceil(sx1) - 1);

      let sumPr = 0;
      let sumPg = 0;
      let sumPb = 0;
      let sumA = 0;
      let sumW = 0;

      for (let sy = iy0; sy <= iy1; sy++) {
        const wy =
          iy0 === iy1
            ? 1
            : sy === iy0
            ? 1 - (sy0 - iy0)
            : sy === iy1
            ? sy1 - iy1
            : 1;
        for (let sx = ix0; sx <= ix1; sx++) {
          const wx =
            ix0 === ix1
              ? 1
              : sx === ix0
              ? 1 - (sx0 - ix0)
              : sx === ix1
              ? sx1 - ix1
              : 1;
          const w = wx * wy;
          const idx = (sy * srcW + sx) * 4;
          const a = src[idx + 3];
          sumA += a * w;
          if (a > 0) {
            sumPr += src[idx] * a * w;
            sumPg += src[idx + 1] * a * w;
            sumPb += src[idx + 2] * a * w;
          }
          sumW += w;
        }
      }

      const dstIdx = (dy * dstW + dx) * 4;
      const finalA = sumW > 0 ? Math.round(sumA / sumW) : 0;
      if (finalA <= 0 || sumA <= 0) {
        out[dstIdx] = 0;
        out[dstIdx + 1] = 0;
        out[dstIdx + 2] = 0;
        out[dstIdx + 3] = 0;
      } else {
        out[dstIdx] = Math.max(0, Math.min(255, Math.round(sumPr / sumA)));
        out[dstIdx + 1] = Math.max(0, Math.min(255, Math.round(sumPg / sumA)));
        out[dstIdx + 2] = Math.max(0, Math.min(255, Math.round(sumPb / sumA)));
        out[dstIdx + 3] = Math.max(0, Math.min(255, finalA));
      }
    }
  }

  return out;
}

/**
 * Quantizes an RGBA pixel buffer into an 8-bit Indexed PNG-8 (`colorType = 3`, `PLTE` + `tRNS` alpha table)
 * using Premultiplied-Alpha Covariance Tree Quantization + Serpentine Floyd-Steinberg Dithering,
 * matching the exact compression system used on `img_1646.png`.
 */
export function quantizeAndEncodePng8Dithered(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options?: {
    maxColors?: number;
    ditherStrength?: number;
  }
): Uint8Array {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  const maxColors = Math.max(8, Math.min(256, Math.round(options?.maxColors ?? 256)));
  const ditherStrength = Math.max(0, Math.min(1, options?.ditherStrength ?? 0.68));

  // Normalize all alpha=0 pixels to (0,0,0,0) and check unique color count
  const cleanRgba = new Uint8Array(W * H * 4);
  const clean32 = new Uint32Array(cleanRgba.buffer);
  const uniqueColors = new Set<number>();
  let hasTransparent = false;

  for (let i = 0, p = 0; i < cleanRgba.length; i += 4, p++) {
    const a = rgba[i + 3];
    if (a === 0) {
      clean32[p] = 0;
      hasTransparent = true;
      uniqueColors.add(0);
    } else {
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const c = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
      clean32[p] = c;
      if (uniqueColors.size <= maxColors) {
        uniqueColors.add(c);
      }
    }
  }

  // Fast lossless path if image ALREADY has <= maxColors unique RGBA colors (like img_1646.png at 256 colors!)
  if (uniqueColors.size <= maxColors) {
    return new Uint8Array(UPNG.encode([cleanRgba.buffer], W, H, 0));
  }

  // Premultiplied-alpha covariance tree quantization via UPNG.quantize
  const qres = (UPNG as any).quantize([cleanRgba.buffer.slice(0)], maxColors, false);
  const rawPlte: Array<{
    c: number;
    r: number;
    g: number;
    b: number;
    a: number;
    pr: number;
    pg: number;
    pb: number;
  }> = [];
  const seenColor = new Set<number>();

  if (hasTransparent) {
    rawPlte.push({ c: 0, r: 0, g: 0, b: 0, a: 0, pr: 0, pg: 0, pb: 0 });
    seenColor.add(0);
  }

  for (let i = 0; i < qres.plte.length && rawPlte.length < maxColors; i++) {
    const c = (qres.plte[i].est.rgba >>> 0) as number;
    const a = (c >>> 24) & 255;
    if (a === 0) {
      if (!seenColor.has(0)) {
        rawPlte.unshift({ c: 0, r: 0, g: 0, b: 0, a: 0, pr: 0, pg: 0, pb: 0 });
        seenColor.add(0);
      }
      continue;
    }
    if (seenColor.has(c)) continue;
    seenColor.add(c);
    const r = c & 255;
    const g = (c >>> 8) & 255;
    const b = (c >>> 16) & 255;
    const af = a / 255;
    rawPlte.push({
      c,
      r,
      g,
      b,
      a,
      pr: r * af,
      pg: g * af,
      pb: b * af,
    });
  }

  if (rawPlte.length === 0) {
    rawPlte.push({ c: 0, r: 0, g: 0, b: 0, a: 0, pr: 0, pg: 0, pb: 0 });
  }

  // If dithering is disabled, qres.bufs[0] already contains the quantized pixels
  if (ditherStrength <= 0.01) {
    return new Uint8Array(UPNG.encode([qres.bufs[0]], W, H, 0));
  }

  // Serpentine Floyd-Steinberg error-diffusion dithering in premultiplied RGBA space
  const palLen = rawPlte.length;
  const cache = new Int16Array(65536).fill(-1);
  const findNearest = (pr: number, pg: number, pb: number, pa: number): number => {
    const key = ((pr >> 4) << 12) | ((pg >> 4) << 8) | ((pb >> 4) << 4) | (pa >> 4);
    const cached = cache[key];
    if (cached >= 0) return cached;
    let best = 0;
    let bestDist = 1e18;
    for (let i = 0; i < palLen; i++) {
      const p = rawPlte[i];
      if (pa >= 250 && p.a < 240 && palLen > 4) continue;
      const dr = pr - p.pr;
      const dg = pg - p.pg;
      const db = pb - p.pb;
      const da = (pa - p.a) * 1.5;
      const d = dr * dr + dg * dg + db * db + da * da;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    cache[key] = best;
    return best;
  };

  const out32 = new Uint32Array(W * H);
  const errCur = new Float32Array((W + 2) * 4);
  const errNxt = new Float32Array((W + 2) * 4);

  for (let y = 0; y < H; y++) {
    errNxt.fill(0);
    const rev = (y & 1) === 1;
    for (let step = 0; step < W; step++) {
      const x = rev ? W - 1 - step : step;
      const pIdx = y * W + x;
      const i4 = pIdx * 4;
      const oa = cleanRgba[i4 + 3];
      if (oa === 0) {
        out32[pIdx] = 0;
        continue;
      }

      const eOff = (x + 1) * 4;
      const af = oa / 255;
      const pr = Math.max(0, Math.min(255, Math.round(cleanRgba[i4] * af + errCur[eOff])));
      const pg = Math.max(0, Math.min(255, Math.round(cleanRgba[i4 + 1] * af + errCur[eOff + 1])));
      const pb = Math.max(0, Math.min(255, Math.round(cleanRgba[i4 + 2] * af + errCur[eOff + 2])));
      const pa =
        oa === 255 ? 255 : Math.max(1, Math.min(255, Math.round(oa + errCur[eOff + 3])));

      const bi = findNearest(pr, pg, pb, pa);
      const chosen = rawPlte[bi];
      out32[pIdx] = chosen.c;

      const er = Math.max(-22, Math.min(22, (pr - chosen.pr) * ditherStrength));
      const eg = Math.max(-22, Math.min(22, (pg - chosen.pg) * ditherStrength));
      const eb = Math.max(-22, Math.min(22, (pb - chosen.pb) * ditherStrength));
      const ea = oa === 255 ? 0 : Math.max(-14, Math.min(14, (pa - chosen.a) * ditherStrength));

      const dir = rev ? -1 : 1;
      const n1 = (x + 1 + dir) * 4;
      errCur[n1] += er * 0.4375;
      errCur[n1 + 1] += eg * 0.4375;
      errCur[n1 + 2] += eb * 0.4375;
      errCur[n1 + 3] += ea * 0.4375;

      const n2 = (x + 1 - dir) * 4;
      errNxt[n2] += er * 0.1875;
      errNxt[n2 + 1] += eg * 0.1875;
      errNxt[n2 + 2] += eb * 0.1875;
      errNxt[n2 + 3] += ea * 0.1875;

      const n3 = (x + 1) * 4;
      errNxt[n3] += er * 0.3125;
      errNxt[n3 + 1] += eg * 0.3125;
      errNxt[n3 + 2] += eb * 0.3125;
      errNxt[n3 + 3] += ea * 0.3125;

      const n4 = (x + 1 + dir) * 4;
      errNxt[n4] += er * 0.0625;
      errNxt[n4 + 1] += eg * 0.0625;
      errNxt[n4 + 2] += eb * 0.0625;
      errNxt[n4 + 3] += ea * 0.0625;
    }
    errCur.set(errNxt);
  }

  return new Uint8Array(UPNG.encode([out32.buffer], W, H, 0));
}

/**
 * Compresses a raw PNG image buffer using the `img_1646.png` compression system:
 * 1. Decodes the PNG to RGBA
 * 2. Downscales to `(targetW, targetH)` using premultiplied-alpha area resampling
 * 3. Quantizes to 8-bit Indexed PNG-8 (`PLTE` + `tRNS`) with serpentine Floyd-Steinberg dithering
 */
export function compressPngBufferLikeReference(
  pngBytes: Uint8Array,
  qualityPercent = 100,
  mode: SvgaCompressionMode = 'smart_300'
): {
  bytes: Uint8Array;
  origW: number;
  origH: number;
  targetW: number;
  targetH: number;
  sx: number;
  sy: number;
} {
  const decoded = UPNG.decode(
    pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength)
  );
  const origW = Math.max(1, decoded.width || 1);
  const origH = Math.max(1, decoded.height || 1);
  const rgbaFrames = UPNG.toRGBA8(decoded);
  const srcRgba = new Uint8Array(rgbaFrames[0]);

  const target = computeSvgaSpriteCompressionTarget(origW, origH, qualityPercent, mode);
  const resampledRgba =
    target.targetW !== origW || target.targetH !== origH
      ? resampleRgbaPremultiplied(srcRgba, origW, origH, target.targetW, target.targetH)
      : srcRgba;

  const encoded = quantizeAndEncodePng8Dithered(resampledRgba, target.targetW, target.targetH, {
    maxColors: target.maxColors,
    ditherStrength: target.ditherStrength,
  });

  // If dimensions did not change and original PNG-8 was already smaller, keep the smaller one
  if (
    target.targetW === origW &&
    target.targetH === origH &&
    pngBytes.byteLength < encoded.byteLength &&
    decoded.ctype === 3
  ) {
    return {
      bytes: pngBytes,
      origW,
      origH,
      targetW: origW,
      targetH: origH,
      sx: 1,
      sy: 1,
    };
  }

  return {
    bytes: encoded,
    origW,
    origH,
    targetW: target.targetW,
    targetH: target.targetH,
    sx: target.sx,
    sy: target.sy,
  };
}

const TE = new TextEncoder();
const TD = new TextDecoder();

function catBytes(arr: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const x of arr) total += x.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const x of arr) {
    out.set(x, p);
    p += x.length;
  }
  return out;
}

function pvVarint(n: number): Uint8Array {
  const o: number[] = [];
  let v = Math.max(0, Math.floor(n));
  while (v > 127) {
    o.push((v & 127) | 128);
    v = Math.floor(v / 128);
  }
  o.push(v);
  return Uint8Array.from(o);
}

function pfFloat(field: number, val: number): Uint8Array {
  return catBytes([pvVarint((field << 3) | 5), new Uint8Array(new Float32Array([val]).buffer)]);
}

function pbBytes(field: number, data: Uint8Array): Uint8Array {
  return catBytes([pvVarint((field << 3) | 2), pvVarint(data.length), data]);
}

function psString(field: number, s: string): Uint8Array {
  return pbBytes(field, TE.encode(s));
}

/**
 * Rescales a single SVGA 2.0 `FrameEntity` protobuf message when its sprite bitmap
 * has been downscaled from `(origW, origH)` to `(targetW, targetH)` (`sx = origW / targetW, sy = origH / targetH`).
 *
 * - For standard bitmap frames (no `clipPath` or `shapes`), sets `layout` to `(fx / sx, fy / sy, fw / sx, fh / sy)`
 *   (e.g., `300 × 300` for `img_1646.png`) and multiplies `transform` `(a, b)` by `sx` and `(c, d)` by `sy`
 *   (e.g., `a = 2.5, d = 2.5` to fill `750 × 750`).
 * - For frames with `clipPath` or `shapes`, preserves `transform` and explicitly sets `layout` to `(fx, fy, fw, fh)`.
 */
export function rescaleSvgaFrameEntityProtobuf(
  frameBytes: Uint8Array,
  scale: SpriteScaleEntry
): Uint8Array {
  if (Math.abs(scale.sx - 1) < 1e-5 && Math.abs(scale.sy - 1) < 1e-5) {
    return frameBytes;
  }

  let alpha = 0;
  let fx = 0;
  let fy = 0;
  let fw = 0;
  let fh = 0;
  const t = [1, 0, 0, 1, 0, 0];
  let clipPath = '';
  const shapesRaw: Uint8Array[] = [];

  pm(frameBytes, (field, r) => {
    if (field === 1) {
      alpha = r.f32();
      return 1;
    }
    if (field === 2) {
      pm(r.by(), (lf, lr) => {
        if (lf === 1) fx = lr.f32();
        else if (lf === 2) fy = lr.f32();
        else if (lf === 3) fw = lr.f32();
        else if (lf === 4) fh = lr.f32();
        else return 0;
        return 1;
      });
      return 1;
    }
    if (field === 3) {
      pm(r.by(), (tf, tr) => {
        if (tf >= 1 && tf <= 6) {
          t[tf - 1] = tr.f32();
          return 1;
        }
        return 0;
      });
      return 1;
    }
    if (field === 4) {
      clipPath = TD.decode(r.by());
      return 1;
    }
    if (field === 5) {
      shapesRaw.push(r.by().slice());
      return 1;
    }
    return 0;
  });

  const resolvedFw = fw > 0 ? fw : scale.origW;
  const resolvedFh = fh > 0 ? fh : scale.origH;
  const hasClipOrShapes = Boolean((clipPath && clipPath.length > 0) || shapesRaw.length > 0);

  let newFx = fx;
  let newFy = fy;
  let newFw = resolvedFw;
  let newFh = resolvedFh;
  let newT = t;

  if (!hasClipOrShapes) {
    newFx = fx / scale.sx;
    newFy = fy / scale.sy;
    newFw = resolvedFw / scale.sx;
    newFh = resolvedFh / scale.sy;
    newT = [
      t[0] * scale.sx,
      t[1] * scale.sx,
      t[2] * scale.sy,
      t[3] * scale.sy,
      t[4],
      t[5],
    ];
  }

  const outFields: Uint8Array[] = [
    pfFloat(1, alpha),
    pbBytes(2, catBytes([pfFloat(1, newFx), pfFloat(2, newFy), pfFloat(3, newFw), pfFloat(4, newFh)])),
    pbBytes(
      3,
      catBytes([
        pfFloat(1, newT[0]),
        pfFloat(2, newT[1]),
        pfFloat(3, newT[2]),
        pfFloat(4, newT[3]),
        pfFloat(5, newT[4]),
        pfFloat(6, newT[5]),
      ])
    ),
  ];

  if (clipPath.length > 0) {
    outFields.push(psString(4, clipPath));
  }
  for (const sh of shapesRaw) {
    outFields.push(pbBytes(5, sh));
  }

  return catBytes(outFields);
}

/**
 * Rescales all `FrameEntity` entries inside a serialized `SpriteEntity` protobuf payload
 * if its `imageKey` is present in `scaleMap`.
 */
export function rescaleSvgaSpriteEntityProtobuf(
  spriteBytes: Uint8Array,
  scaleMap: Record<string, SpriteScaleEntry>
): Uint8Array {
  let imageKey = '';
  pm(spriteBytes, (f, r) => {
    if (f === 1) {
      imageKey = TD.decode(r.by());
      return 1;
    }
    return 0;
  });

  const scale = imageKey ? scaleMap[imageKey] : undefined;
  if (!scale || (Math.abs(scale.sx - 1) < 1e-5 && Math.abs(scale.sy - 1) < 1e-5)) {
    return spriteBytes;
  }

  const r = new PB(spriteBytes);
  const outParts: Uint8Array[] = [];
  while (!r.end) {
    const st = r.p;
    const tag = r.vi();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 2 && wire === 2) {
      const frameRaw = r.by();
      const rescaledFrame = rescaleSvgaFrameEntityProtobuf(frameRaw, scale);
      outParts.push(pbBytes(2, rescaledFrame));
    } else {
      r.skip(wire);
      outParts.push(spriteBytes.subarray(st, r.p));
    }
  }

  return catBytes(outParts);
}

/**
 * Full end-to-end SVGA 2.0 binary compressor using the `img_1646.png` compression system:
 * - Inflates outer SVGA binary
 * - Downscales and quantizes each embedded PNG sprite to 8-bit Indexed PNG-8 (PLTE + tRNS + Floyd-Steinberg dithering)
 * - Compensates each SpriteEntity's FrameEntity layout and transform matrices so canvas resolution (e.g. 750×750) is preserved
 * - Re-deflates at maximum Zlib level 9
 */
export function compressSvga2Binary(
  svgaBytes: Uint8Array,
  qualityPercent = 100,
  mode: SvgaCompressionMode = 'smart_300'
): {
  bytes: Uint8Array;
  compressedImageCount: number;
  scaleMap: Record<string, SpriteScaleEntry>;
} {
  if (svgaBytes[0] === 0x50 && svgaBytes[1] === 0x4b) {
    throw new Error('SVGA 1.x (ZIP) cannot be recompressed with SVGA 2.0 binary pipeline');
  }
  const inflated = pako.inflate(svgaBytes);

  // First pass: collect audio keys so we never touch audio entries stored in field 3
  const audioKeys = new Set<string>();
  pm(inflated, (f, r) => {
    if (f === 5) {
      pm(r.by(), (af, ar) => {
        if (af === 1) {
          audioKeys.add(TD.decode(ar.by()));
          return 1;
        }
        return 0;
      });
      return 1;
    }
    return 0;
  });

  const scaleMap: Record<string, SpriteScaleEntry> = {};
  let compressedImageCount = 0;

  // Second pass: compress all PNG images in field 3 so scaleMap is populated before field 4 sprites
  const r1 = new PB(inflated);
  const compressedImages = new Map<string, Uint8Array>();

  while (!r1.end) {
    const tag = r1.vi();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 3 && wire === 2) {
      const ent = r1.by();
      let keyBytes: Uint8Array = new Uint8Array(0);
      let valBytes: Uint8Array = new Uint8Array(0);
      pm(ent, (g, q) => {
        if (g === 1) {
          keyBytes = q.by();
          return 1;
        }
        if (g === 2) {
          valBytes = q.by();
          return 1;
        }
        return 0;
      });
      if (keyBytes.length > 0 && valBytes.length > 0) {
        const keyStr = TD.decode(keyBytes);
        if (!audioKeys.has(keyStr) && valBytes.length > 8 && valBytes[0] === 0x89 && valBytes[1] === 0x50) {
          try {
            const res = compressPngBufferLikeReference(valBytes, qualityPercent, mode);
            compressedImages.set(keyStr, res.bytes);
            scaleMap[keyStr] = {
              origW: res.origW,
              origH: res.origH,
              targetW: res.targetW,
              targetH: res.targetH,
              sx: res.sx,
              sy: res.sy,
            };
            compressedImageCount++;
          } catch (_) {
            compressedImages.set(keyStr, valBytes);
          }
        }
      }
    } else {
      r1.skip(wire);
    }
  }

  // Third pass: rebuild MovieEntity with compressed images (field 3) and matrix-compensated sprites (field 4)
  const r2 = new PB(inflated);
  const outChunks: Uint8Array[] = [];

  while (!r2.end) {
    const st = r2.p;
    const tag = r2.vi();
    const field = tag >>> 3;
    const wire = tag & 7;

    if (field === 3 && wire === 2) {
      const ent = r2.by();
      let keyBytes: Uint8Array | null = null;
      let valBytes: Uint8Array | null = null;
      pm(ent, (g, q) => {
        if (g === 1) {
          keyBytes = q.by();
          return 1;
        }
        if (g === 2) {
          valBytes = q.by();
          return 1;
        }
        return 0;
      });
      if (keyBytes && valBytes) {
        const keyStr = TD.decode(keyBytes);
        const newVal = compressedImages.get(keyStr) || valBytes;
        const entryMsg = catBytes([pbBytes(1, keyBytes), pbBytes(2, newVal)]);
        outChunks.push(pbBytes(3, entryMsg));
      } else {
        outChunks.push(inflated.subarray(st, r2.p));
      }
    } else if (field === 4 && wire === 2) {
      const spriteRaw = r2.by();
      const updatedSprite = rescaleSvgaSpriteEntityProtobuf(spriteRaw, scaleMap);
      outChunks.push(pbBytes(4, updatedSprite));
    } else {
      r2.skip(wire);
      outChunks.push(inflated.subarray(st, r2.p));
    }
  }

  const deflated = pako.deflate(catBytes(outChunks), { level: 9 });
  return {
    bytes: deflated,
    compressedImageCount,
    scaleMap,
  };
}
