import {
  pako,
  UPNG,
  crc32,
  base64,
  lotJson,
  encodeLosslessWebPFrame,
  muxAnimatedWebPFrames,
  encodeAnimatedApng,
  SvgaFrame,
} from './codecs';
import { serializeDecomposedSvga, DEFAULT_TRANSFORM } from './svgaEditorLogic';
import {
  deduplicateAndPlanFireAtlas,
  buildSingleLayerFireSvgaFrames,
} from './svgaFireEngine';

export type SmartSplitDetectionMode = 'auto_smart' | 'grid' | 'islands';

export type SmartElementExportFormat =
  | 'svga'
  | 'webp'
  | 'apng'
  | 'gif'
  | 'webm'
  | 'mp4'
  | 'lottie'
  | 'png'
  | 'png_seq_zip';

export interface SmartExportFormatMeta {
  id: SmartElementExportFormat;
  labelAr: string;
  labelEn: string;
  ext: string;
  mime: string;
  badge: string;
  isAnimated: boolean;
}

export const SMART_EXPORT_FORMATS: SmartExportFormatMeta[] = [
  {
    id: 'svga',
    labelAr: 'ملف SVGA 2.0 متحرك مستقل (.svga)',
    labelEn: 'Standalone Animated SVGA 2.0 (.svga)',
    ext: 'svga',
    mime: 'application/octet-stream',
    badge: 'SVGA 2.0',
    isAnimated: true,
  },
  {
    id: 'webp',
    labelAr: 'ملصق WebP متحرك شفاف (.webp)',
    labelEn: 'Transparent Animated WebP (.webp)',
    ext: 'webp',
    mime: 'image/webp',
    badge: 'Animated WebP',
    isAnimated: true,
  },
  {
    id: 'apng',
    labelAr: 'صورة APNG متحركة شفافة (.apng)',
    labelEn: 'Transparent Animated PNG (.apng)',
    ext: 'apng',
    mime: 'image/apng',
    badge: 'APNG',
    isAnimated: true,
  },
  {
    id: 'gif',
    labelAr: 'صورة GIF متحركة شفافة (.gif)',
    labelEn: 'Animated GIF (.gif)',
    ext: 'gif',
    mime: 'image/gif',
    badge: 'GIF',
    isAnimated: true,
  },
  {
    id: 'webm',
    labelAr: 'فيديو شفاف WebM لكل عنصر (.webm)',
    labelEn: 'Transparent WebM Video (.webm)',
    ext: 'webm',
    mime: 'video/webm',
    badge: 'WebM Alpha',
    isAnimated: true,
  },
  {
    id: 'mp4',
    labelAr: 'فيديو MP4 مستقل لكل عنصر (.mp4)',
    labelEn: 'Standalone MP4 Video (.mp4)',
    ext: 'mp4',
    mime: 'video/mp4',
    badge: 'MP4 Video',
    isAnimated: true,
  },
  {
    id: 'lottie',
    labelAr: 'ملف Lottie JSON متحرك (.json)',
    labelEn: 'Animated Lottie JSON (.json)',
    ext: 'json',
    mime: 'application/json',
    badge: 'Lottie JSON',
    isAnimated: true,
  },
  {
    id: 'png',
    labelAr: 'ملصق PNG شفاف عالي الدقة (.png)',
    labelEn: 'High-Res Transparent PNG Sticker (.png)',
    ext: 'png',
    mime: 'image/png',
    badge: 'PNG Sticker',
    isAnimated: false,
  },
  {
    id: 'png_seq_zip',
    labelAr: 'تسلسل إطارات PNG لكل عنصر (.zip)',
    labelEn: 'PNG Frame Sequence ZIP (.zip)',
    ext: 'zip',
    mime: 'application/zip',
    badge: 'PNG Seq ZIP',
    isAnimated: true,
  },
];

export interface DetectedBackgroundInfo {
  r: number;
  g: number;
  b: number;
  hex: string;
  isAlreadyTransparent: boolean;
  isGreenScreen: boolean;
  confidence: number;
}

export interface SmartChromaCleanupConfig {
  enabled: boolean;
  autoDetectColor: boolean;
  keyColorHex: string;
  similarity: number; // 5..100 (default 38)
  smoothness: number; // 0..60 (default 18)
  despill: number; // 0..100 (default 75)
  featherPx: number; // 0..10 (default 1)
}

export interface SmartSplitterConfig {
  detectionMode: SmartSplitDetectionMode;
  gridCols: number; // 0 = auto, or 1..12
  gridRows: number; // 0 = auto, or 1..12
  tightTrimCells: boolean; // Trim each grid cell tightly to actual sticker bounds across frames
  paddingPx: number; // Extra transparent margin around each cropped element (default 8)
  bridgeGapPx: number; // Morphological dilation radius to merge floating text/hearts with parent character (default 6)
  minElementAreaRatio: number; // Ignore tiny noise specks (default 0.0015)
  sizeMode: 'auto_tight' | 'square_512' | 'square_300' | 'custom_unified';
  unifiedWidth: number;
  unifiedHeight: number;
  sampleFps: number; // 8..30 (default 12)
  maxFrames: number; // 8..90 (default 36)
  chroma: SmartChromaCleanupConfig;
  exportFormat: SmartElementExportFormat;
}

export const DEFAULT_SMART_SPLITTER_CONFIG: SmartSplitterConfig = {
  detectionMode: 'auto_smart',
  gridCols: 0, // Auto-detect grid cols
  gridRows: 0, // Auto-detect grid rows
  tightTrimCells: true,
  paddingPx: 8,
  bridgeGapPx: 6,
  minElementAreaRatio: 0.0015,
  sizeMode: 'auto_tight',
  unifiedWidth: 512,
  unifiedHeight: 512,
  sampleFps: 12,
  maxFrames: 30,
  chroma: {
    enabled: true,
    autoDetectColor: true,
    keyColorHex: '#18b828',
    similarity: 40,
    smoothness: 18,
    despill: 80,
    featherPx: 1,
  },
  exportFormat: 'svga',
};

export interface DetectedElementRegion {
  id: string;
  index: number; // 1-based index
  row: number; // 0-based row
  col: number; // 0-based col
  nameAr: string;
  nameEn: string;
  /** Tight bounding box in source video pixel coordinates */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Original cell bounds before tight trimming */
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
  selected: boolean;
}

export const SAMPLE_24_STICKER_NAMES_AR: string[] = [
  'أحسنتم_نجمة',
  'هههه_ضحك',
  'أحبك_قلب',
  'كفو_إعجاب',
  'شششش_هدوء',
  'ما_يبكي_دموع',
  'غضب_نار',
  'ماذا_تفكير',
  'مرحبا_تحية',
  'قبلة_حب',
  'مبروك_احتفال',
  'بطل_كأس',
  'اللهم_آمين_دعاء',
  'واو_إعجاب',
  'فرحة_النصر',
  'تصبح_على_خير',
  'واو_عيون_نجوم',
  'واو_مفاجأة',
  'الملك_عرش',
  'سلام_تحية',
  'حريق_نار',
  'قهوة_عربية',
  'الملك_فخامة',
  'باي_وداع',
];

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#00ff00').replace(/^#/, '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) || 0,
      g: parseInt(clean[1] + clean[1], 16) || 0,
      b: parseInt(clean[2] + clean[2], 16) || 0,
    };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  };
}

/**
 * Automatically detects the dominant background / chroma-key color from the perimeter
 * and corners of an RGBA frame buffer.
 */
export function detectDominantBackgroundKeyColor(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): DetectedBackgroundInfo {
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  if (rgba.length < W * H * 4) {
    return {
      r: 24,
      g: 184,
      b: 40,
      hex: '#18b828',
      isAlreadyTransparent: false,
      isGreenScreen: true,
      confidence: 0.5,
    };
  }

  let transparentSamples = 0;
  let totalSamples = 0;
  // Quantize perimeter RGB into 16x16x16 buckets to find the dominant perimeter color
  const buckets = new Map<number, { count: number; rSum: number; gSum: number; bSum: number }>();

  const samplePixel = (x: number, y: number) => {
    const idx = (y * W + x) * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const a = rgba[idx + 3];
    totalSamples++;
    if (a < 25) {
      transparentSamples++;
      return;
    }
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const entry = buckets.get(key) || { count: 0, rSum: 0, gSum: 0, bSum: 0 };
    entry.count++;
    entry.rSum += r;
    entry.gSum += g;
    entry.bSum += b;
    buckets.set(key, entry);
  };

  const stepX = Math.max(1, Math.floor(W / 64));
  const stepY = Math.max(1, Math.floor(H / 64));
  for (let x = 0; x < W; x += stepX) {
    samplePixel(x, 0);
    samplePixel(x, Math.min(H - 1, 2));
    samplePixel(x, H - 1);
    samplePixel(x, Math.max(0, H - 3));
  }
  for (let y = 0; y < H; y += stepY) {
    samplePixel(0, y);
    samplePixel(Math.min(W - 1, 2), y);
    samplePixel(W - 1, y);
    samplePixel(Math.max(0, W - 3), y);
  }

  if (transparentSamples > totalSamples * 0.45) {
    return {
      r: 0,
      g: 0,
      b: 0,
      hex: '#000000',
      isAlreadyTransparent: true,
      isGreenScreen: false,
      confidence: transparentSamples / Math.max(1, totalSamples),
    };
  }

  let bestBucket: { count: number; rSum: number; gSum: number; bSum: number } | null = null;
  for (const b of buckets.values()) {
    if (!bestBucket || b.count > bestBucket.count) {
      bestBucket = b;
    }
  }

  if (!bestBucket || bestBucket.count === 0) {
    return {
      r: 24,
      g: 184,
      b: 40,
      hex: '#18b828',
      isAlreadyTransparent: false,
      isGreenScreen: true,
      confidence: 0.5,
    };
  }

  const r = Math.round(bestBucket.rSum / bestBucket.count);
  const g = Math.round(bestBucket.gSum / bestBucket.count);
  const b = Math.round(bestBucket.bSum / bestBucket.count);
  const isGreenScreen = g > 95 && g > r * 1.35 && g > b * 1.35;

  return {
    r,
    g,
    b,
    hex: rgbToHex(r, g, b),
    isAlreadyTransparent: false,
    isGreenScreen,
    confidence: bestBucket.count / Math.max(1, totalSamples),
  };
}

/**
 * Removes solid or chroma-key background (especially green screen `#18b828` / `#00ff00`)
 * in-place with smooth alpha ramps, green spill suppression on white/skin/gold edges,
 * and optional 1px alpha feathering so extracted stickers have crisp, halo-free edges.
 */
export function removeVideoBackgroundAndDespillInPlace(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  config: SmartChromaCleanupConfig,
  detectedBg?: DetectedBackgroundInfo
): void {
  if (!config.enabled) return;
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const pixelCount = W * H;
  if (rgba.length < pixelCount * 4) return;

  const bg =
    config.autoDetectColor && detectedBg
      ? detectedBg
      : {
          ...hexToRgb(config.keyColorHex),
          isAlreadyTransparent: false,
          isGreenScreen: false,
        };

  if (bg.isAlreadyTransparent) return;

  const keyR = bg.r;
  const keyG = bg.g;
  const keyB = bg.b;
  const isGreenKey = keyG > 90 && keyG > keyR * 1.3 && keyG > keyB * 1.3;

  // Map similarity (5..100) and smoothness (0..60) to Euclidean + Chroma thresholds
  const baseThresh = (Math.max(5, Math.min(100, config.similarity)) / 100) * 195;
  const smoothRange = Math.max(4, (Math.max(0, Math.min(60, config.smoothness)) / 100) * 135);
  const despillStrength = Math.max(0, Math.min(100, config.despill)) / 100;

  for (let i = 0; i < pixelCount * 4; i += 4) {
    const a = rgba[i + 3];
    if (a === 0) continue;

    let r = rgba[i];
    let g = rgba[i + 1];
    let b = rgba[i + 2];

    const dr = r - keyR;
    const dg = g - keyG;
    const db = b - keyB;
    let dist = Math.sqrt(dr * dr * 0.85 + dg * dg * 1.15 + db * db * 0.9);

    // Additional green dominance metric for green screen videos so bright/dark green variations vanish cleanly
    if (isGreenKey) {
      const greenExcess = g - Math.max(r, b);
      const keyGreenExcess = Math.max(1, keyG - Math.max(keyR, keyB));
      if (greenExcess > keyGreenExcess * 0.42 && r < 140 && b < 140) {
        dist *= 0.62;
      }
    }

    if (dist <= baseThresh) {
      rgba[i + 3] = 0;
      continue;
    }

    let nextAlpha = a;
    if (dist < baseThresh + smoothRange) {
      const t = (dist - baseThresh) / smoothRange;
      // Smooth hermite interpolation
      const smoothT = t * t * (3 - 2 * t);
      nextAlpha = Math.round(a * smoothT);
    }

    // Spill suppression for green screen edges (removes green tint on ghutra white cloth, skin, and outlines)
    if (isGreenKey && despillStrength > 0) {
      const maxRB = Math.max(r, b);
      const avgRB = (r + b) * 0.5;
      if (g > maxRB) {
        const spill = (g - maxRB) * despillStrength;
        g = Math.round(g - spill);
        // Restore luminance slightly to keep white cloth bright
        const lumaBoost = Math.round(spill * 0.25);
        r = Math.min(255, r + lumaBoost);
        b = Math.min(255, b + lumaBoost);
      } else if (nextAlpha < 245 && g > avgRB) {
        g = Math.round(g - (g - avgRB) * despillStrength * 0.65);
      }
    }

    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = nextAlpha;
  }

  // Optional 1px morphological boundary anti-aliasing & isolated 1px speck removal
  if (config.featherPx > 0 && W >= 8 && H >= 8) {
    const origAlpha = new Uint8Array(pixelCount);
    for (let p = 0; p < pixelCount; p++) {
      origAlpha[p] = rgba[p * 4 + 3];
    }

    for (let y = 1; y < H - 1; y++) {
      const rowOffset = y * W;
      for (let x = 1; x < W - 1; x++) {
        const p = rowOffset + x;
        const cA = origAlpha[p];
        if (cA === 0) continue;

        const nUp = origAlpha[p - W];
        const nDown = origAlpha[p + W];
        const nLeft = origAlpha[p - 1];
        const nRight = origAlpha[p + 1];

        // If completely isolated speck surrounded by transparent pixels, remove it
        if (nUp === 0 && nDown === 0 && nLeft === 0 && nRight === 0) {
          rgba[p * 4 + 3] = 0;
          continue;
        }

        // If on the outer edge next to transparency, soften slightly
        if (nUp === 0 || nDown === 0 || nLeft === 0 || nRight === 0) {
          const avgNeighbor = (cA * 4 + nUp + nDown + nLeft + nRight) >> 3;
          rgba[p * 4 + 3] = Math.min(cA, avgNeighbor);
        }
      }
    }
  }
}

/**
 * Builds a temporal union foreground occupancy map (`Uint8Array` of 0 or 1, size `width * height`)
 * across all sampled frames of the video so moving parts of an animated sticker (waving hands,
 * flames, trophies, floating hearts) are all included in that sticker's bounding region.
 */
export function computeTemporalForegroundOccupancyMap(
  framesRgba: (Uint8Array | Uint8ClampedArray)[],
  width: number,
  height: number,
  alphaThreshold = 28
): Uint8Array {
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const pixelCount = W * H;
  const occupancy = new Uint8Array(pixelCount);

  for (let f = 0; f < framesRgba.length; f++) {
    const rgba = framesRgba[f];
    if (!rgba || rgba.length < pixelCount * 4) continue;
    for (let p = 0; p < pixelCount; p++) {
      if (occupancy[p] === 0 && rgba[p * 4 + 3] >= alphaThreshold) {
        occupancy[p] = 1;
      }
    }
  }
  return occupancy;
}

/**
 * Finds 1D intervals `(start, end)` from a 1D projection profile (`counts`),
 * automatically bridging small internal gaps and splitting wide merged intervals
 * when a periodic grid rhythm is present.
 */
export function findProjectionIntervals(
  profile: Float64Array | Uint32Array | number[],
  length: number,
  minSpanPx = 16,
  gapBridgePx = 5
): { start: number; end: number }[] {
  let maxVal = 0;
  for (let i = 0; i < length; i++) {
    if (profile[i] > maxVal) maxVal = profile[i];
  }
  if (maxVal === 0) return [];

  // Use a low threshold (1.5% of peak) so thin strokes/sparkles stay connected, while empty gutters become 0
  const threshold = Math.max(1, maxVal * 0.015);
  const raw: { start: number; end: number }[] = [];
  let inSeg = false;
  let segStart = 0;

  for (let i = 0; i < length; i++) {
    const active = profile[i] >= threshold;
    if (active && !inSeg) {
      inSeg = true;
      segStart = i;
    } else if (!active && inSeg) {
      inSeg = false;
      raw.push({ start: segStart, end: i - 1 });
    }
  }
  if (inSeg) {
    raw.push({ start: segStart, end: length - 1 });
  }

  // Merge segments separated by less than gapBridgePx
  const merged: { start: number; end: number }[] = [];
  for (const seg of raw) {
    if (merged.length > 0 && seg.start - merged[merged.length - 1].end <= gapBridgePx) {
      merged[merged.length - 1].end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  // Filter out tiny noise intervals at edges
  const filtered = merged.filter((s) => s.end - s.start + 1 >= minSpanPx);

  // Check if any interval is ~2x or ~3x the median interval width (e.g. two stickers touching slightly)
  // and split at the deepest local minimum valley inside that wide interval
  if (filtered.length >= 2) {
    const spans = filtered.map((s) => s.end - s.start + 1).sort((a, b) => a - b);
    const medianSpan = spans[Math.floor(spans.length / 2)];
    const refined: { start: number; end: number }[] = [];

    for (const seg of filtered) {
      const span = seg.end - seg.start + 1;
      const mult = Math.round(span / Math.max(1, medianSpan));
      if (mult >= 2 && mult <= 6 && span > medianSpan * 1.65) {
        let curStart = seg.start;
        for (let k = 1; k < mult; k++) {
          const expectedSplit = seg.start + Math.round((span * k) / mult);
          const searchRadius = Math.max(6, Math.round(medianSpan * 0.22));
          const sLo = Math.max(curStart + minSpanPx, expectedSplit - searchRadius);
          const sHi = Math.min(seg.end - minSpanPx, expectedSplit + searchRadius);
          let bestIdx = expectedSplit;
          let minVal = Infinity;
          for (let x = sLo; x <= sHi; x++) {
            if (profile[x] < minVal) {
              minVal = profile[x];
              bestIdx = x;
            }
          }
          refined.push({ start: curStart, end: Math.max(curStart, bestIdx - 1) });
          curStart = Math.min(seg.end, bestIdx + 1);
        }
        refined.push({ start: curStart, end: seg.end });
      } else {
        refined.push(seg);
      }
    }
    return refined;
  }

  return filtered;
}

/**
 * Tightens a candidate cell rectangle `(cellX, cellY, cellW, cellH)` to the exact foreground
 * bounding box inside `occupancyMap`, and adds `paddingPx` clamped to `(0, 0, width, height)`.
 */
export function tightenCellToForegroundBounds(
  occupancyMap: Uint8Array,
  width: number,
  height: number,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  paddingPx: number
): { x: number; y: number; width: number; height: number; fgPixels: number } {
  const x0 = Math.max(0, Math.floor(cellX));
  const y0 = Math.max(0, Math.floor(cellY));
  const x1 = Math.min(width - 1, Math.floor(cellX + cellW - 1));
  const y1 = Math.min(height - 1, Math.floor(cellY + cellH - 1));

  let minX = x1 + 1;
  let minY = y1 + 1;
  let maxX = x0 - 1;
  let maxY = y0 - 1;
  let fgPixels = 0;

  for (let y = y0; y <= y1; y++) {
    const rowOff = y * width;
    for (let x = x0; x <= x1; x++) {
      if (occupancyMap[rowOff + x]) {
        fgPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (fgPixels === 0 || minX > maxX || minY > maxY) {
    return {
      x: x0,
      y: y0,
      width: Math.max(1, x1 - x0 + 1),
      height: Math.max(1, y1 - y0 + 1),
      fgPixels: 0,
    };
  }

  const pad = Math.max(0, Math.round(paddingPx));
  const fx0 = Math.max(0, minX - pad);
  const fy0 = Math.max(0, minY - pad);
  const fx1 = Math.min(width - 1, maxX + pad);
  const fy1 = Math.min(height - 1, maxY + pad);

  return {
    x: fx0,
    y: fy0,
    width: Math.max(2, fx1 - fx0 + 1),
    height: Math.max(2, fy1 - fy0 + 1),
    fgPixels,
  };
}

/**
 * Connected-Components Island Detector with Morphological Bridge Dilation.
 * Isolates arbitrary scattered objects in a video frame (even when not arranged in a grid),
 * merging nearby sub-elements (floating text, hearts, crowns, sparkles) into their parent object!
 */
export function detectConnectedIslandsRegions(
  occupancyMap: Uint8Array,
  width: number,
  height: number,
  options: {
    bridgeGapPx?: number;
    paddingPx?: number;
    minElementAreaRatio?: number;
  } = {}
): DetectedElementRegion[] {
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const radius = Math.max(1, Math.min(24, Math.round(options.bridgeGapPx ?? 6)));
  const paddingPx = Math.max(0, Math.round(options.paddingPx ?? 8));
  const minArea = Math.max(
    16,
    Math.round(W * H * (options.minElementAreaRatio ?? 0.0015))
  );

  // Downsample by 2x for fast morphological dilation + BFS if resolution > 300px
  const scale = W > 320 || H > 320 ? 2 : 1;
  const sW = Math.max(1, Math.ceil(W / scale));
  const sH = Math.max(1, Math.ceil(H / scale));
  const sRad = Math.max(1, Math.round(radius / scale));

  const smallMask = new Uint8Array(sW * sH);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(y / scale);
    const rowOff = y * W;
    const sRowOff = sy * sW;
    for (let x = 0; x < W; x++) {
      if (occupancyMap[rowOff + x]) {
        smallMask[sRowOff + Math.floor(x / scale)] = 1;
      }
    }
  }

  // Horizontal then vertical box dilation to bridge gaps of size `sRad`
  const hDilated = new Uint8Array(sW * sH);
  for (let y = 0; y < sH; y++) {
    const rOff = y * sW;
    let run = 0;
    for (let x = 0; x < sW; x++) {
      if (smallMask[rOff + x]) run = sRad + 1;
      if (run > 0) {
        hDilated[rOff + x] = 1;
        run--;
      }
    }
    run = 0;
    for (let x = sW - 1; x >= 0; x--) {
      if (smallMask[rOff + x]) run = sRad + 1;
      if (run > 0) {
        hDilated[rOff + x] = 1;
        run--;
      }
    }
  }

  const dilated = new Uint8Array(sW * sH);
  for (let x = 0; x < sW; x++) {
    let run = 0;
    for (let y = 0; y < sH; y++) {
      if (hDilated[y * sW + x]) run = sRad + 1;
      if (run > 0) {
        dilated[y * sW + x] = 1;
        run--;
      }
    }
    run = 0;
    for (let y = sH - 1; y >= 0; y--) {
      if (hDilated[y * sW + x]) run = sRad + 1;
      if (run > 0) {
        dilated[y * sW + x] = 1;
        run--;
      }
    }
  }

  const visited = new Uint8Array(sW * sH);
  const queue = new Int32Array(sW * sH);
  const rawBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [];

  for (let sy = 0; sy < sH; sy++) {
    for (let sx = 0; sx < sW; sx++) {
      const startIdx = sy * sW + sx;
      if (!dilated[startIdx] || visited[startIdx]) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      visited[startIdx] = 1;

      let minSX = sx;
      let maxSX = sx;
      let minSY = sy;
      let maxSY = sy;

      while (head < tail) {
        const curr = queue[head++];
        const cy = Math.floor(curr / sW);
        const cx = curr - cy * sW;
        if (cx < minSX) minSX = cx;
        if (cx > maxSX) maxSX = cx;
        if (cy < minSY) minSY = cy;
        if (cy > maxSY) maxSY = cy;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < 0 || ny >= sH) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            if (nx < 0 || nx >= sW) continue;
            const nIdx = ny * sW + nx;
            if (dilated[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              queue[tail++] = nIdx;
            }
          }
        }
      }

      const cellX = minSX * scale;
      const cellY = minSY * scale;
      const cellW = Math.min(W - cellX, (maxSX - minSX + 1) * scale);
      const cellH = Math.min(H - cellY, (maxSY - minSY + 1) * scale);
      if (cellW * cellH >= minArea) {
        rawBoxes.push({
          x0: cellX,
          y0: cellY,
          x1: cellX + cellW - 1,
          y1: cellY + cellH - 1,
        });
      }
    }
  }

  // Sort detected islands in natural reading order (top-to-bottom rows, then left-to-right columns)
  rawBoxes.sort((a, b) => {
    const aCy = (a.y0 + a.y1) * 0.5;
    const bCy = (b.y0 + b.y1) * 0.5;
    const avgH = ((a.y1 - a.y0) + (b.y1 - b.y0)) * 0.5;
    if (Math.abs(aCy - bCy) > avgH * 0.45) {
      return aCy - bCy;
    }
    return a.x0 - b.x0;
  });

  const regions: DetectedElementRegion[] = [];
  rawBoxes.forEach((box, idx) => {
    const cW = box.x1 - box.x0 + 1;
    const cH = box.y1 - box.y0 + 1;
    const tight = tightenCellToForegroundBounds(
      occupancyMap,
      W,
      H,
      box.x0,
      box.y0,
      cW,
      cH,
      paddingPx
    );
    if (tight.fgPixels < Math.max(8, minArea * 0.1)) return;
    const index = regions.length + 1;
    const presetName =
      rawBoxes.length === 24 && SAMPLE_24_STICKER_NAMES_AR[index - 1]
        ? SAMPLE_24_STICKER_NAMES_AR[index - 1]
        : `عنصر_متحرك_${index}`;
    regions.push({
      id: `elem_${index}`,
      index,
      row: 0,
      col: index - 1,
      nameAr: presetName,
      nameEn: `Sticker_${String(index).padStart(2, '0')}`,
      x: tight.x,
      y: tight.y,
      width: tight.width,
      height: tight.height,
      cellX: box.x0,
      cellY: box.y0,
      cellWidth: cW,
      cellHeight: cH,
      selected: true,
    });
  });

  return regions;
}

/**
 * Main smart element detector that combines 2D projection valley detection, row-wise column
 * refinement, and connected-components island fallback so any multi-sticker video (like a 4×6
 * green-screen sticker pack or arbitrary separated items) is split into clean individual regions.
 */
export function detectSmartElementsRegions(
  occupancyMap: Uint8Array,
  width: number,
  height: number,
  config: Partial<SmartSplitterConfig> = {}
): DetectedElementRegion[] {
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const mode: SmartSplitDetectionMode = config.detectionMode || 'auto_smart';
  const paddingPx = Math.max(0, config.paddingPx ?? 8);
  const tightTrim = config.tightTrimCells !== false;
  const minArea = Math.max(
    16,
    Math.round(W * H * (config.minElementAreaRatio ?? 0.0015))
  );

  if (mode === 'islands') {
    return detectConnectedIslandsRegions(occupancyMap, W, H, {
      bridgeGapPx: config.bridgeGapPx,
      paddingPx,
      minElementAreaRatio: config.minElementAreaRatio,
    });
  }

  // If explicit gridCols & gridRows are provided (or mode === 'grid' with explicit values)
  if (
    mode === 'grid' &&
    (config.gridCols ?? 0) >= 1 &&
    (config.gridRows ?? 0) >= 1
  ) {
    const cols = Math.max(1, Math.min(16, Math.round(config.gridCols || 4)));
    const rows = Math.max(1, Math.min(16, Math.round(config.gridRows || 6)));
    const regions: DetectedElementRegion[] = [];
    const cellW = W / cols;
    const cellH = H / rows;

    let index = 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = Math.round(c * cellW);
        const cy = Math.round(r * cellH);
        const cw = Math.round((c + 1) * cellW) - cx;
        const ch = Math.round((r + 1) * cellH) - cy;
        const tight = tightTrim
          ? tightenCellToForegroundBounds(occupancyMap, W, H, cx, cy, cw, ch, paddingPx)
          : { x: cx, y: cy, width: cw, height: ch, fgPixels: cw * ch };

        const presetName =
          cols * rows === 24 && SAMPLE_24_STICKER_NAMES_AR[index - 1]
            ? SAMPLE_24_STICKER_NAMES_AR[index - 1]
            : `عنصر_${index}_صف${r + 1}_عمود${c + 1}`;

        regions.push({
          id: `elem_${index}`,
          index,
          row: r,
          col: c,
          nameAr: presetName,
          nameEn: `Sticker_${String(index).padStart(2, '0')}_R${r + 1}C${c + 1}`,
          x: tight.x,
          y: tight.y,
          width: tight.width,
          height: tight.height,
          cellX: cx,
          cellY: cy,
          cellWidth: cw,
          cellHeight: ch,
          selected: true,
        });
        index++;
      }
    }
    return regions;
  }

  // AUTO_SMART mode (or GRID with 0/auto cols & rows):
  // Step 1: Compute horizontal projection profile (Y-axis rows) and vertical projection profile (X-axis cols)
  const rowHist = new Uint32Array(H);
  const colHist = new Uint32Array(W);
  for (let y = 0; y < H; y++) {
    const rOff = y * W;
    let rSum = 0;
    for (let x = 0; x < W; x++) {
      if (occupancyMap[rOff + x]) {
        rSum++;
        colHist[x]++;
      }
    }
    rowHist[y] = rSum;
  }

  const rowIntervals = findProjectionIntervals(
    rowHist,
    H,
    Math.max(16, Math.round(H * 0.05)),
    Math.max(3, Math.round(H * 0.008))
  );
  const globalColIntervals = findProjectionIntervals(
    colHist,
    W,
    Math.max(16, Math.round(W * 0.06)),
    Math.max(3, Math.round(W * 0.008))
  );

  // If projection intervals found a structured multi-element layout (at least 2 rows or 2 cols)
  if (rowIntervals.length * Math.max(1, globalColIntervals.length) >= 2) {
    const regions: DetectedElementRegion[] = [];
    let index = 1;

    for (let rIdx = 0; rIdx < rowIntervals.length; rIdx++) {
      const rSeg = rowIntervals[rIdx];
      // Also compute per-row X-projection so if one row has slightly shifted columns, it adapts cleanly
      const perRowColHist = new Uint32Array(W);
      for (let y = rSeg.start; y <= rSeg.end; y++) {
        const rOff = y * W;
        for (let x = 0; x < W; x++) {
          if (occupancyMap[rOff + x]) perRowColHist[x]++;
        }
      }
      const rowColIntervals = findProjectionIntervals(
        perRowColHist,
        W,
        Math.max(16, Math.round(W * 0.06)),
        Math.max(3, Math.round(W * 0.008))
      );

      // Use whichever column segmentation is cleaner / consistent with global columns
      const activeCols =
        rowColIntervals.length >= globalColIntervals.length && rowColIntervals.length <= 10
          ? rowColIntervals
          : globalColIntervals.length > 0
            ? globalColIntervals
            : [{ start: 0, end: W - 1 }];

      for (let cIdx = 0; cIdx < activeCols.length; cIdx++) {
        const cSeg = activeCols[cIdx];
        const cellX = cSeg.start;
        const cellY = rSeg.start;
        const cellW = cSeg.end - cSeg.start + 1;
        const cellH = rSeg.end - rSeg.start + 1;

        const tight = tightTrim
          ? tightenCellToForegroundBounds(
              occupancyMap,
              W,
              H,
              cellX,
              cellY,
              cellW,
              cellH,
              paddingPx
            )
          : { x: cellX, y: cellY, width: cellW, height: cellH, fgPixels: cellW * cellH };

        if (tight.fgPixels < Math.max(8, minArea * 0.08)) continue;

        regions.push({
          id: `elem_${index}`,
          index,
          row: rIdx,
          col: cIdx,
          nameAr: `عنصر_${index}`,
          nameEn: `Sticker_${String(index).padStart(2, '0')}`,
          x: tight.x,
          y: tight.y,
          width: tight.width,
          height: tight.height,
          cellX,
          cellY,
          cellWidth: cellW,
          cellHeight: cellH,
          selected: true,
        });
        index++;
      }
    }

    if (regions.length === 24) {
      regions.forEach((reg, idx) => {
        if (SAMPLE_24_STICKER_NAMES_AR[idx]) {
          reg.nameAr = SAMPLE_24_STICKER_NAMES_AR[idx];
        }
      });
    }

    if (regions.length >= 2) {
      return regions;
    }
  }

  // Fallback to Connected-Components Islands detection
  const islands = detectConnectedIslandsRegions(occupancyMap, W, H, {
    bridgeGapPx: config.bridgeGapPx,
    paddingPx,
    minElementAreaRatio: config.minElementAreaRatio,
  });

  if (islands.length > 0) {
    return islands;
  }

  // Ultimate fallback: single full-frame element
  return [
    {
      id: 'elem_1',
      index: 1,
      row: 0,
      col: 0,
      nameAr: 'عنصر_1',
      nameEn: 'Sticker_01',
      x: 0,
      y: 0,
      width: W,
      height: H,
      cellX: 0,
      cellY: 0,
      cellWidth: W,
      cellHeight: H,
      selected: true,
    },
  ];
}

/**
 * Extracts and optionally resizes/centers the RGBA frame sequence for a single detected element region.
 */
export function extractElementSequenceRgba(
  framesRgba: (Uint8Array | Uint8ClampedArray)[],
  sourceW: number,
  sourceH: number,
  region: Pick<DetectedElementRegion, 'x' | 'y' | 'width' | 'height'>,
  options: {
    sizeMode?: 'auto_tight' | 'square_512' | 'square_300' | 'custom_unified';
    unifiedWidth?: number;
    unifiedHeight?: number;
  } = {}
): {
  width: number;
  height: number;
  frames: Uint8Array[];
} {
  const rx = Math.max(0, Math.min(sourceW - 1, Math.round(region.x)));
  const ry = Math.max(0, Math.min(sourceH - 1, Math.round(region.y)));
  const rw = Math.max(2, Math.min(sourceW - rx, Math.round(region.width)));
  const rh = Math.max(2, Math.min(sourceH - ry, Math.round(region.height)));

  let outW = rw;
  let outH = rh;
  const sizeMode = options.sizeMode || 'auto_tight';
  if (sizeMode === 'square_512') {
    outW = 512;
    outH = 512;
  } else if (sizeMode === 'square_300') {
    outW = 300;
    outH = 300;
  } else if (sizeMode === 'custom_unified') {
    outW = Math.max(16, Math.min(2048, Math.round(options.unifiedWidth || 512)));
    outH = Math.max(16, Math.min(2048, Math.round(options.unifiedHeight || 512)));
  } else {
    // Ensure even dimensions for video/SVGA codec friendliness
    outW = rw + (rw & 1);
    outH = rh + (rh & 1);
  }

  // If no scaling is needed (exact crop or 1px even pad), copy scanlines directly for maximum speed and sharpness
  if (sizeMode === 'auto_tight') {
    const padX = Math.floor((outW - rw) / 2);
    const padY = Math.floor((outH - rh) / 2);
    const outFrames: Uint8Array[] = framesRgba.map((src) => {
      const dst = new Uint8Array(outW * outH * 4);
      for (let y = 0; y < rh; y++) {
        const srcRowStart = ((ry + y) * sourceW + rx) * 4;
        const srcRowEnd = srcRowStart + rw * 4;
        const dstRowStart = ((padY + y) * outW + padX) * 4;
        dst.set(src.subarray(srcRowStart, srcRowEnd), dstRowStart);
      }
      return dst;
    });
    return { width: outW, height: outH, frames: outFrames };
  }

  // Aspect-preserving contain scale inside (outW x outH) using bilinear interpolation
  const scale = Math.min((outW * 0.92) / rw, (outH * 0.92) / rh);
  const drawW = Math.max(1, Math.round(rw * scale));
  const drawH = Math.max(1, Math.round(rh * scale));
  const offsetX = Math.floor((outW - drawW) / 2);
  const offsetY = Math.floor((outH - drawH) / 2);

  const outFrames: Uint8Array[] = framesRgba.map((src) => {
    const dst = new Uint8Array(outW * outH * 4);
    for (let dy = 0; dy < drawH; dy++) {
      const sy = ry + Math.min(rh - 1, Math.floor((dy / drawH) * rh));
      const dstRowOff = (offsetY + dy) * outW;
      const srcRowOff = sy * sourceW;
      for (let dx = 0; dx < drawW; dx++) {
        const sx = rx + Math.min(rw - 1, Math.floor((dx / drawW) * rw));
        const sIdx = (srcRowOff + sx) * 4;
        const dIdx = (dstRowOff + offsetX + dx) * 4;
        dst[dIdx] = src[sIdx];
        dst[dIdx + 1] = src[sIdx + 1];
        dst[dIdx + 2] = src[sIdx + 2];
        dst[dIdx + 3] = src[sIdx + 3];
      }
    }
    return dst;
  });

  return { width: outW, height: outH, frames: outFrames };
}

/**
 * Pure TypeScript Animated GIF89a Encoder with transparency index (255) and 256-color quantization.
 * Encodes an array of RGBA frames into a standalone `.gif` binary.
 */
export function encodeAnimatedGif89a(
  framesRgba: (Uint8Array | Uint8ClampedArray)[],
  width: number,
  height: number,
  fps: number
): Uint8Array {
  const W = Math.max(1, Math.min(4096, Math.round(width)));
  const H = Math.max(1, Math.min(4096, Math.round(height)));
  const delayCs = Math.max(2, Math.round(100 / Math.max(1, fps)));
  const out: number[] = [];

  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  const writeU16 = (v: number) => {
    out.push(v & 0xff, (v >>> 8) & 0xff);
  };

  // Build a fixed 6x6x6 web-safe + warm skin/gold 255-color global palette + index 255 for transparent
  const palette = new Uint8Array(256 * 3);
  let pIdx = 0;
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette[pIdx * 3] = Math.round((r * 255) / 5);
        palette[pIdx * 3 + 1] = Math.round((g * 255) / 5);
        palette[pIdx * 3 + 2] = Math.round((b * 255) / 5);
        pIdx++;
      }
    }
  }
  while (pIdx < 256) {
    const gray = Math.round(((pIdx - 216) * 255) / 39);
    palette[pIdx * 3] = gray;
    palette[pIdx * 3 + 1] = gray;
    palette[pIdx * 3 + 2] = gray;
    pIdx++;
  }

  // Header: GIF89a + Logical Screen Descriptor (Global Color Table Flag = 1, 256 colors -> 0xF7)
  writeStr('GIF89a');
  writeU16(W);
  writeU16(H);
  out.push(0xf7, 255, 0);
  for (let i = 0; i < palette.length; i++) out.push(palette[i]);

  // Netscape 2.0 Infinite Loop Application Extension
  out.push(0x21, 0xff, 0x0b);
  writeStr('NETSCAPE2.0');
  out.push(0x03, 0x01, 0x00, 0x00, 0x00);

  // LZW minimum code size 8 encoder
  const encodeGifLzw = (indexedPixels: Uint8Array): number[] => {
    const minCodeSize = 8;
    const clearCode = 256;
    const eoiCode = 257;
    const bytes: number[] = [];
    let bitBuf = 0;
    let bitCount = 0;
    let codeSize = minCodeSize + 1;
    let nextCode = 258;
    const dict = new Map<number, number>();

    const emitCode = (code: number) => {
      bitBuf |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        bytes.push(bitBuf & 0xff);
        bitBuf >>>= 8;
        bitCount -= 8;
      }
    };

    emitCode(clearCode);
    if (indexedPixels.length === 0) {
      emitCode(eoiCode);
      if (bitCount > 0) bytes.push(bitBuf & 0xff);
      return bytes;
    }

    let prefix = indexedPixels[0];
    for (let i = 1; i < indexedPixels.length; i++) {
      const k = indexedPixels[i];
      const key = (prefix << 8) | k;
      const hit = dict.get(key);
      if (hit !== undefined) {
        prefix = hit;
      } else {
        emitCode(prefix);
        dict.set(key, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
        if (nextCode >= 4095) {
          emitCode(clearCode);
          dict.clear();
          codeSize = minCodeSize + 1;
          nextCode = 258;
        }
        prefix = k;
      }
    }
    emitCode(prefix);
    emitCode(eoiCode);
    if (bitCount > 0) bytes.push(bitBuf & 0xff);
    return bytes;
  };

  const pixelCount = W * H;
  for (let f = 0; f < framesRgba.length; f++) {
    const rgba = framesRgba[f];
    const indexed = new Uint8Array(pixelCount);
    for (let p = 0; p < pixelCount; p++) {
      const off = p * 4;
      if (rgba[off + 3] < 96) {
        indexed[p] = 255; // Transparent index
      } else {
        const r6 = Math.round((rgba[off] * 5) / 255);
        const g6 = Math.round((rgba[off + 1] * 5) / 255);
        const b6 = Math.round((rgba[off + 2] * 5) / 255);
        indexed[p] = Math.min(254, r6 * 36 + g6 * 6 + b6);
      }
    }

    // Graphic Control Extension: Disposal = 2 (Restore to background), Transparent Color Flag = 1 (0x09)
    out.push(0x21, 0xf9, 0x04, 0x09);
    writeU16(delayCs);
    out.push(255, 0x00);

    // Image Descriptor
    out.push(0x2c);
    writeU16(0);
    writeU16(0);
    writeU16(W);
    writeU16(H);
    out.push(0x00);

    // LZW Image Data
    out.push(8); // LZW minimum code size = 8
    const lzwBytes = encodeGifLzw(indexed);
    let pos = 0;
    while (pos < lzwBytes.length) {
      const chunkLen = Math.min(255, lzwBytes.length - pos);
      out.push(chunkLen);
      for (let k = 0; k < chunkLen; k++) out.push(lzwBytes[pos + k]);
      pos += chunkLen;
    }
    out.push(0x00); // Block terminator
  }

  out.push(0x3b); // GIF Trailer
  return new Uint8Array(out);
}

/**
 * Encodes a single RGBA frame into a standard PNG binary using `UPNG.encode` or `pako.deflate`.
 */
export function encodeSinglePngRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  try {
    if (UPNG && typeof UPNG.encode === 'function') {
      const copy = new Uint8Array(W * H * 4);
      copy.set(rgba.subarray(0, W * H * 4));
      const ab = UPNG.encode([copy.buffer], W, H, 0);
      return new Uint8Array(ab);
    }
  } catch {}
  // Fallback via single-frame encodeAnimatedApng
  return encodeAnimatedApng([rgba], W, H, 15, 1, 0);
}

/**
 * Packs an array of RGBA frames for a single extracted element into a standalone SVGA 2.0 (`.svga`) binary!
 * Uses our Single-Layer Deduplicated Sprite Sheet Atlas so each cropped sticker is a genuine,
 * lightweight 1-layer SVGA 2.0 file that plays in any SVGA player or our SVGA Editor.
 */
export function encodeElementFramesToSvga2Binary(
  framesRgba: (Uint8Array | Uint8ClampedArray)[],
  width: number,
  height: number,
  fps: number,
  elementName = 'sticker'
): Uint8Array {
  const W = Math.max(2, Math.round(width));
  const H = Math.max(2, Math.round(height));
  const safeFps = Math.max(1, Math.min(60, Math.round(fps || 15)));

  const plan = deduplicateAndPlanFireAtlas(framesRgba, W, H, 2048);
  const atlasW = plan.atlasWidth;
  const atlasH = plan.atlasHeight;
  const cellW = plan.cellWidth;
  const cellH = plan.cellHeight;
  const atlasRgba = new Uint8Array(atlasW * atlasH * 4);

  for (let uIdx = 0; uIdx < plan.uniqueCellIndices.length; uIdx++) {
    const srcFrameIdx = plan.uniqueCellIndices[uIdx];
    const srcRgba = framesRgba[srcFrameIdx];
    const col = uIdx % plan.cols;
    const row = Math.floor(uIdx / plan.cols);
    const destX0 = col * cellW;
    const destY0 = row * cellH;

    for (let dy = 0; dy < cellH; dy++) {
      const sy = Math.min(H - 1, Math.floor((dy / cellH) * H));
      const dstRowOff = (destY0 + dy) * atlasW + destX0;
      const srcRowOff = sy * W;
      for (let dx = 0; dx < cellW; dx++) {
        const sx = Math.min(W - 1, Math.floor((dx / cellW) * W));
        const sOff = (srcRowOff + sx) * 4;
        const dOff = (dstRowOff + dx) * 4;
        atlasRgba[dOff] = srcRgba[sOff];
        atlasRgba[dOff + 1] = srcRgba[sOff + 1];
        atlasRgba[dOff + 2] = srcRgba[sOff + 2];
        atlasRgba[dOff + 3] = srcRgba[sOff + 3];
      }
    }
  }

  const atlasPngBytes = encodeSinglePngRgba(atlasRgba, atlasW, atlasH);
  const svgaFrames: SvgaFrame[] = buildSingleLayerFireSvgaFrames({
    compTotalFrames: framesRgba.length,
    inFrame: 0,
    outFrame: framesRgba.length - 1,
    cols: plan.cols,
    rows: plan.rows,
    cellWidth: cellW,
    cellHeight: cellH,
    frameToCellIndex: plan.frameToCellIndex,
    speed: 1,
    loopMode: 'loop',
    canvasW: cellW,
    canvasH: cellH,
    baseTransform: { ...DEFAULT_TRANSFORM, opacity: 100 },
  });

  const cleanKey =
    (elementName || 'sticker').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 28) || 'sticker_atlas';
  const rawProtobuf = serializeDecomposedSvga(
    {
      w: cellW,
      h: cellH,
      fps: safeFps,
      n: framesRgba.length,
      im: { [cleanKey]: atlasPngBytes },
      sp: [{ key: cleanKey, fr: svgaFrames }],
    },
    {
      docTransform: DEFAULT_TRANSFORM,
    }
  );

  return pako.deflate(rawProtobuf, { level: 6 });
}

/**
 * Minimal pure-TS ZIP builder (STORE / DEFLATE) for packaging multiple files into a `.zip`
 * without async dependencies in pure logic tests.
 */
export function buildZipArchiveSync(
  entries: { name: string; data: Uint8Array }[]
): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const te = new TextEncoder();
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = te.encode(entry.name);
    const raw = entry.data;
    const crc = crc32(raw);

    // Local file header (30 bytes + name + data)
    const lh = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(lh.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);
    ldv.setUint16(6, 0x0800, true); // UTF-8 flag
    ldv.setUint16(8, 0, true); // STORE (0) since inner files are already compressed
    ldv.setUint16(10, 0, true);
    ldv.setUint16(12, 0, true);
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, raw.length, true);
    ldv.setUint32(22, raw.length, true);
    ldv.setUint16(26, nameBytes.length, true);
    ldv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    localParts.push(lh, raw);

    // Central directory header (46 bytes + name)
    const ch = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(ch.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, raw.length, true);
    cdv.setUint32(24, raw.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);

    centralParts.push(ch);
    offset += lh.length + raw.length;
  }

  let centralSize = 0;
  for (const c of centralParts) centralSize += c.length;

  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);
  edv.setUint16(20, 0, true);

  const totalLen = offset + centralSize + 22;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of localParts) {
    out.set(p, pos);
    pos += p.length;
  }
  for (const p of centralParts) {
    out.set(p, pos);
    pos += p.length;
  }
  out.set(eocd, pos);
  return out;
}

/**
 * Synchronous / Pure-Logic Multi-Format Encoder for an extracted element's RGBA frames.
 * Supports `svga`, `webp`, `apng`, `gif`, `lottie`, `png`, and `png_seq_zip` directly in pure TS,
 * and falls back cleanly for `webm` / `mp4` when called outside browser `MediaRecorder`.
 */
export function encodeExtractedElementSync(
  framesRgba: (Uint8Array | Uint8ClampedArray)[],
  width: number,
  height: number,
  fps: number,
  format: SmartElementExportFormat,
  elementName = 'sticker'
): { bytes: Uint8Array; ext: string; mime: string } {
  const W = Math.max(2, Math.round(width));
  const H = Math.max(2, Math.round(height));
  const safeFps = Math.max(1, Math.min(60, Math.round(fps || 12)));

  if (format === 'svga') {
    return {
      bytes: encodeElementFramesToSvga2Binary(framesRgba, W, H, safeFps, elementName),
      ext: 'svga',
      mime: 'application/octet-stream',
    };
  }

  if (format === 'webp') {
    const singleWebps = framesRgba.map((rgba) => encodeLosslessWebPFrame(rgba, W, H));
    const muxed =
      singleWebps.length > 1
        ? muxAnimatedWebPFrames(singleWebps, W, H, safeFps, 0)
        : singleWebps[0];
    return {
      bytes: muxed,
      ext: 'webp',
      mime: 'image/webp',
    };
  }

  if (format === 'apng') {
    return {
      bytes: encodeAnimatedApng(framesRgba, W, H, safeFps, 1, 0),
      ext: 'apng',
      mime: 'image/apng',
    };
  }

  if (format === 'gif') {
    return {
      bytes: encodeAnimatedGif89a(framesRgba, W, H, safeFps),
      ext: 'gif',
      mime: 'image/gif',
    };
  }

  if (format === 'lottie') {
    const dataUrls = framesRgba.map((rgba) => {
      const png = encodeSinglePngRgba(rgba, W, H);
      return 'data:image/png;base64,' + base64(png);
    });
    const lottieObj = lotJson(dataUrls, W, H, safeFps, 0);
    const jsonBytes = new TextEncoder().encode(JSON.stringify(lottieObj));
    return {
      bytes: jsonBytes,
      ext: 'json',
      mime: 'application/json',
    };
  }

  if (format === 'png') {
    const midIdx = Math.floor(framesRgba.length / 2);
    return {
      bytes: encodeSinglePngRgba(framesRgba[midIdx] || framesRgba[0], W, H),
      ext: 'png',
      mime: 'image/png',
    };
  }

  if (format === 'png_seq_zip') {
    const entries = framesRgba.map((rgba, idx) => ({
      name: `${elementName}_frame_${String(idx + 1).padStart(3, '0')}.png`,
      data: encodeSinglePngRgba(rgba, W, H),
    }));
    return {
      bytes: buildZipArchiveSync(entries),
      ext: 'zip',
      mime: 'application/zip',
    };
  }

  // Fallback for webm/mp4 in non-DOM/sync environments: return Animated WebP or SVGA
  const singleWebps = framesRgba.map((rgba) => encodeLosslessWebPFrame(rgba, W, H));
  return {
    bytes: muxAnimatedWebPFrames(singleWebps, W, H, safeFps, 0),
    ext: format === 'mp4' ? 'mp4' : 'webm',
    mime: format === 'mp4' ? 'video/mp4' : 'video/webm',
  };
}
