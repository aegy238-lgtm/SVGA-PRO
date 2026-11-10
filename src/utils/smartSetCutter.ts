export interface CutSetItemBounds {
  index: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
}

export interface CutSetItemResult extends CutSetItemBounds {
  id: string;
  name: string;
  dataUrl: string;
  rgba?: Uint8ClampedArray;
}

export interface SmartCutSetOptions {
  /** Whether to automatically remove background (white, checkerboard, green, black, or solid border color) */
  removeBackground?: boolean;
  /** Optional explicit hex color to remove in addition to smart border detection */
  explicitKeyColor?: string | null;
  /** Tolerance 1..100 (default 38) */
  similarity?: number;
  /** Edge feathering / anti-aliasing strength 0..20 (default 6) */
  smoothness?: number;
  /** Padding around each sliced item in pixels (default 6) */
  paddingPx?: number;
  /** Whether to slice multi-item sheets into individual items (default true) */
  sliceSet?: boolean;
}

interface ColorSample {
  r: number;
  g: number;
  b: number;
  count: number;
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

function maxChannelDiff(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/**
 * Analyzes border pixels of an image to detect the dominant background colors
 * (supports single solid color AND 2-color fake transparency checkerboards like white + light gray).
 */
export function detectBorderBackgroundPalette(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): {
  alreadyTransparent: boolean;
  isCheckerboard: boolean;
  isGreenScreen: boolean;
  primaryColors: { r: number; g: number; b: number }[];
} {
  const buckets = new Map<number, ColorSample>();
  let transparentCount = 0;
  let totalSampled = 0;

  const sampleAt = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = (y * width + x) * 4;
    const a = rgba[idx + 3];
    totalSampled++;
    if (a < 25) {
      transparentCount++;
      return;
    }
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    // Quantize to 8-step buckets
    const qr = r >> 3;
    const qg = g >> 3;
    const qb = b >> 3;
    const key = (qr << 10) | (qg << 5) | qb;
    const existing = buckets.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  };

  // Sample outer 2px border perimeter
  const stepX = Math.max(1, Math.floor(width / 120));
  const stepY = Math.max(1, Math.floor(height / 120));
  for (let x = 0; x < width; x += stepX) {
    sampleAt(x, 0);
    sampleAt(x, 1);
    sampleAt(x, height - 1);
    sampleAt(x, height - 2);
  }
  for (let y = 0; y < height; y += stepY) {
    sampleAt(0, y);
    sampleAt(1, y);
    sampleAt(width - 1, y);
    sampleAt(width - 2, y);
  }

  if (totalSampled > 0 && transparentCount / totalSampled > 0.65) {
    return {
      alreadyTransparent: true,
      isCheckerboard: false,
      isGreenScreen: false,
      primaryColors: [],
    };
  }

  const sorted = Array.from(buckets.values())
    .map((s) => ({
      r: Math.round(s.r / s.count),
      g: Math.round(s.g / s.count),
      b: Math.round(s.b / s.count),
      count: s.count,
    }))
    .sort((a, b) => b.count - a.count);

  // Merge nearby color clusters within distance 18
  const merged: { r: number; g: number; b: number; count: number }[] = [];
  for (const c of sorted) {
    const match = merged.find((m) => colorDist(c.r, c.g, c.b, m.r, m.g, m.b) < 18);
    if (match) {
      const tot = match.count + c.count;
      match.r = Math.round((match.r * match.count + c.r * c.count) / tot);
      match.g = Math.round((match.g * match.count + c.g * c.count) / tot);
      match.b = Math.round((match.b * match.count + c.b * c.count) / tot);
      match.count = tot;
    } else {
      merged.push({ ...c });
    }
  }
  merged.sort((a, b) => b.count - a.count);

  const topColors = merged.slice(0, 3).map(({ r, g, b }) => ({ r, g, b }));
  if (topColors.length === 0) {
    topColors.push({ r: 255, g: 255, b: 255 });
  }

  const c0 = topColors[0];
  const c1 = topColors[1];

  const isGreenScreen = c0.g > 95 && c0.g > c0.r * 1.3 && c0.g > c0.b * 1.3;

  // Detect 2-tone neutral checkerboard (e.g. white #fff + gray #ccc/#ddd/#eee or dark checkerboard)
  let isCheckerboard = false;
  if (c0 && c1) {
    const neutral0 = maxChannelDiff(c0.r, c0.g, c0.b) <= 22 && c0.r >= 145;
    const neutral1 = maxChannelDiff(c1.r, c1.g, c1.b) <= 22 && c1.r >= 145;
    const lumaDiff = Math.abs(c0.r - c1.r);
    if (neutral0 && neutral1 && lumaDiff >= 8 && lumaDiff <= 95) {
      isCheckerboard = true;
    }
  }
  // Even if border happens to hit mostly white or mostly gray, if c0 is neutral light gray/white (>= 185),
  // also include standard checkerboard gray/white partners so baked checkerboards always key cleanly
  if (!isCheckerboard && c0 && maxChannelDiff(c0.r, c0.g, c0.b) <= 16 && c0.r >= 185) {
    isCheckerboard = true;
    if (topColors.length < 2) {
      topColors.push({ r: 204, g: 204, b: 204 });
      topColors.push({ r: 255, g: 255, b: 255 });
    }
  }

  return {
    alreadyTransparent: false,
    isCheckerboard,
    isGreenScreen,
    primaryColors: topColors,
  };
}

/**
 * Removes background from an RGBA image buffer with studio precision using:
 * 1. Border & Gutter Corridor Flood-Fill (protects internal white clothes/eyes/crowns/text inside stickers).
 * 2. Fake Checkerboard & Solid Background detection.
 * 3. Smooth Anti-Aliased Edge Feathering & Spill/Halo Decontamination.
 */
export function detectAndRemoveBackgroundSmart(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: SmartCutSetOptions = {}
): {
  modifiedPixels: number;
  alreadyTransparent: boolean;
} {
  if (!rgba || width <= 0 || height <= 0) {
    return { modifiedPixels: 0, alreadyTransparent: true };
  }

  const det = detectBorderBackgroundPalette(rgba, width, height);
  if (det.alreadyTransparent) {
    return { modifiedPixels: 0, alreadyTransparent: true };
  }

  const similarity = Math.max(5, Math.min(100, options.similarity ?? 38));
  const baseTol = 14 + (similarity / 100) * 36; // default ~28
  const featherSpan = Math.max(4, (options.smoothness ?? 6) * 2.2);

  const primary = det.primaryColors;
  const isChk = det.isCheckerboard;
  const isGreen = det.isGreenScreen;

  // Helper: returns background match distance (0 = exact background match, > 1 = foreground)
  const bgMatchScore = (r: number, g: number, b: number): number => {
    if (isGreen) {
      const maxRB = Math.max(r, b);
      const greenDom = g - maxRB;
      // Protect warm yellows/golds/skin tones
      if (r >= g * 0.82 && r > 65) return 999;
      if (greenDom > 24 && g > 50) return 0;
    }

    if (isChk) {
      // Any neutral light gray-to-white pixel (low saturation, high brightness) is part of the checkerboard/white bg
      const sat = maxChannelDiff(r, g, b);
      const minCh = Math.min(r, g, b);
      if (sat <= 18 && minCh >= 172) {
        return sat / 24;
      }
      if (sat <= 26 && minCh >= 160) {
        return 0.75 + (sat - 18) / 20;
      }
    }

    let minDist = 999;
    for (let i = 0; i < primary.length; i++) {
      const p = primary[i];
      const d = colorDist(r, g, b, p.r, p.g, p.b);
      if (d < minDist) minDist = d;
    }
    return minDist / Math.max(8, baseTol);
  };

  const total = width * height;
  const visited = new Uint8Array(total);
  const bgMask = new Uint8Array(total); // 1 = background flood-filled
  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  const tryEnqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const pIdx = y * width + x;
    if (visited[pIdx]) return;
    visited[pIdx] = 1;
    const i4 = pIdx * 4;
    if (rgba[i4 + 3] < 20) {
      bgMask[pIdx] = 1;
      queue[qTail++] = pIdx;
      return;
    }
    const score = bgMatchScore(rgba[i4], rgba[i4 + 1], rgba[i4 + 2]);
    if (score <= 1.0) {
      bgMask[pIdx] = 1;
      queue[qTail++] = pIdx;
    }
  };

  // Seed flood-fill from all 4 outer borders
  for (let x = 0; x < width; x++) {
    tryEnqueue(x, 0);
    tryEnqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryEnqueue(0, y);
    tryEnqueue(width - 1, y);
  }

  // Also seed from full-width/full-height gutter corridors (rows/cols where >= 80% of pixels match background)
  // This ensures that even if a sticker touches the outer border, interior grid corridors still flood-fill cleanly
  for (let y = 0; y < height; y += 4) {
    let bgHits = 0;
    const samples = Math.max(1, Math.floor(width / 4));
    for (let x = 0; x < width; x += 4) {
      const i4 = (y * width + x) * 4;
      if (rgba[i4 + 3] < 20 || bgMatchScore(rgba[i4], rgba[i4 + 1], rgba[i4 + 2]) <= 0.9) {
        bgHits++;
      }
    }
    if (bgHits / samples >= 0.82) {
      for (let x = 0; x < width; x += 2) tryEnqueue(x, y);
    }
  }

  for (let x = 0; x < width; x += 4) {
    let bgHits = 0;
    const samples = Math.max(1, Math.floor(height / 4));
    for (let y = 0; y < height; y += 4) {
      const i4 = (y * width + x) * 4;
      if (rgba[i4 + 3] < 20 || bgMatchScore(rgba[i4], rgba[i4 + 1], rgba[i4 + 2]) <= 0.9) {
        bgHits++;
      }
    }
    if (bgHits / samples >= 0.82) {
      for (let y = 0; y < height; y += 2) tryEnqueue(x, y);
    }
  }

  // Run 4-connected BFS flood-fill
  while (qHead < qTail) {
    const cur = queue[qHead++];
    const cx = cur % width;
    const cy = (cur - cx) / width;

    if (cx > 0) tryEnqueue(cx - 1, cy);
    if (cx + 1 < width) tryEnqueue(cx + 1, cy);
    if (cy > 0) tryEnqueue(cx, cy - 1);
    if (cy + 1 < height) tryEnqueue(cx, cy + 1);
  }

  // Also detect enclosed checkerboard pockets (e.g. between arm and body where alternating white/gray squares exist)
  if (isChk && width >= 16 && height >= 16) {
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const pIdx = y * width + x;
        if (bgMask[pIdx]) continue;
        const i4 = pIdx * 4;
        const r = rgba[i4];
        const g = rgba[i4 + 1];
        const b = rgba[i4 + 2];
        // Only check neutral gray checkerboard squares (not pure white, to protect white clothes!)
        if (maxChannelDiff(r, g, b) <= 10 && r >= 188 && r <= 228) {
          // If it's a neutral light-gray square (e.g. #CCCCCC / #D4D4D8) next to already-masked background
          if (
            bgMask[pIdx - 1] ||
            bgMask[pIdx + 1] ||
            bgMask[pIdx - width] ||
            bgMask[pIdx + width]
          ) {
            bgMask[pIdx] = 1;
          }
        }
      }
    }
  }

  let modifiedPixels = 0;

  // Apply background removal and 1-2px anti-aliased edge feathering where foreground meets bgMask
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      const i4 = pIdx * 4;
      if (bgMask[pIdx]) {
        if (rgba[i4 + 3] !== 0) {
          rgba[i4 + 3] = 0;
          modifiedPixels++;
        }
        continue;
      }

      // Check if this foreground pixel borders a background pixel (1px or 2px ring)
      let bgNeighbors1 = 0;
      let bgNeighbors2 = 0;
      if (x > 0 && bgMask[pIdx - 1]) bgNeighbors1++;
      if (x + 1 < width && bgMask[pIdx + 1]) bgNeighbors1++;
      if (y > 0 && bgMask[pIdx - width]) bgNeighbors1++;
      if (y + 1 < height && bgMask[pIdx + width]) bgNeighbors1++;

      if (bgNeighbors1 > 0) {
        const r = rgba[i4];
        const g = rgba[i4 + 1];
        const b = rgba[i4 + 2];
        const score = bgMatchScore(r, g, b);
        // Smooth sub-pixel ramp based on how close the edge pixel color is to the background
        const maxScore = 1.0 + featherSpan / 18;
        if (score < maxScore) {
          const t = Math.max(0.08, Math.min(1, (score - 0.55) / Math.max(0.25, maxScore - 0.55)));
          const neighborFactor = 1 - bgNeighbors1 * 0.14;
          const nextA = Math.round(rgba[i4 + 3] * t * Math.max(0.25, neighborFactor));
          rgba[i4 + 3] = nextA < 18 ? 0 : nextA;
          modifiedPixels++;
        } else if (bgNeighbors1 >= 2) {
          // Gentle anti-aliasing on sharp corners
          rgba[i4 + 3] = Math.round(rgba[i4 + 3] * 0.82);
          modifiedPixels++;
        }
      } else {
        // Check diagonal / 2px distance for ultra-smooth outer contour
        if (x > 0 && y > 0 && bgMask[pIdx - width - 1]) bgNeighbors2++;
        if (x + 1 < width && y > 0 && bgMask[pIdx - width + 1]) bgNeighbors2++;
        if (x > 0 && y + 1 < height && bgMask[pIdx + width - 1]) bgNeighbors2++;
        if (x + 1 < width && y + 1 < height && bgMask[pIdx + width + 1]) bgNeighbors2++;
        if (bgNeighbors2 >= 2) {
          const score = bgMatchScore(rgba[i4], rgba[i4 + 1], rgba[i4 + 2]);
          if (score < 1.35) {
            rgba[i4 + 3] = Math.round(rgba[i4 + 3] * 0.78);
            modifiedPixels++;
          }
        }
      }
    }
  }

  return { modifiedPixels, alreadyTransparent: false };
}

/**
 * Finds 1D active intervals (peaks separated by low-density valleys) along a projection profile.
 */
function findProjectionIntervals(
  profile: Float32Array,
  length: number,
  minSpan: number,
  valleyThreshold: number
): { start: number; end: number }[] {
  const intervals: { start: number; end: number }[] = [];
  let inPeak = false;
  let start = 0;

  for (let i = 0; i < length; i++) {
    const active = profile[i] > valleyThreshold;
    if (active && !inPeak) {
      inPeak = true;
      start = i;
    } else if (!active && inPeak) {
      inPeak = false;
      intervals.push({ start, end: i - 1 });
    }
  }
  if (inPeak) {
    intervals.push({ start, end: length - 1 });
  }

  if (intervals.length <= 1) return intervals;

  // Merge tiny intervals (e.g. a floating heart or crown slightly above a head) into the nearest major interval
  // if the gap between them is small, or if the interval itself is narrower than minSpan * 0.55
  const merged: { start: number; end: number }[] = [];
  for (const iv of intervals) {
    if (merged.length === 0) {
      merged.push({ ...iv });
      continue;
    }
    const prev = merged[merged.length - 1];
    const prevSpan = prev.end - prev.start + 1;
    const curSpan = iv.end - iv.start + 1;
    const gap = iv.start - prev.end - 1;

    if (gap <= Math.max(3, Math.floor(minSpan * 0.14)) || prevSpan < minSpan * 0.5 || curSpan < minSpan * 0.5) {
      prev.end = iv.end;
    } else {
      merged.push({ ...iv });
    }
  }

  return merged;
}

/**
 * Automatically detects all individual items/stickers (`الطاقم`) in an RGBA image buffer
 * and returns their exact, non-overlapping bounding boxes in reading order.
 *
 * Combines:
 * 1. 2D Valley Projection Grid Detection (ideal for 4x6, 3x3, 4x4, 5x5 sticker/emoji/badge sheets).
 * 2. Morphological Connected-Component Clustering (keeps floating hearts, crowns, "zzz", and text banners attached to their character).
 */
export function detectSetItemsBoundsFromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  paddingPx = 6
): CutSetItemBounds[] {
  if (!rgba || width <= 0 || height <= 0) return [];

  const alphaThreshold = 28;
  const rowCounts = new Float32Array(height);
  const colCounts = new Float32Array(width);
  let totalOpaque = 0;
  let globalMinX = width;
  let globalMinY = height;
  let globalMaxX = -1;
  let globalMaxY = -1;

  for (let y = 0; y < height; y++) {
    let rSum = 0;
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3];
      if (a >= alphaThreshold) {
        rSum++;
        colCounts[x]++;
        totalOpaque++;
        if (x < globalMinX) globalMinX = x;
        if (x > globalMaxX) globalMaxX = x;
        if (y < globalMinY) globalMinY = y;
        if (y > globalMaxY) globalMaxY = y;
      }
    }
    rowCounts[y] = rSum;
  }

  if (totalOpaque === 0 || globalMaxX < globalMinX || globalMaxY < globalMinY) {
    return [
      {
        index: 0,
        row: 0,
        col: 0,
        x: 0,
        y: 0,
        width,
        height,
        contentX: 0,
        contentY: 0,
        contentWidth: width,
        contentHeight: height,
      },
    ];
  }

  // Smooth 1D profiles (radius 2) to bridge 1-2px gaps inside a single item
  const smoothProfile = (arr: Float32Array, len: number): Float32Array => {
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      let s = 0;
      let c = 0;
      for (let d = -2; d <= 2; d++) {
        const j = i + d;
        if (j >= 0 && j < len) {
          s += arr[j];
          c++;
        }
      }
      out[i] = s / c;
    }
    return out;
  };

  const smoothRows = smoothProfile(rowCounts, height);
  const smoothCols = smoothProfile(colCounts, width);

  const minRowSpan = Math.max(24, Math.floor(height * 0.065));
  const minColSpan = Math.max(24, Math.floor(width * 0.065));

  // Try valley thresholds from strict (0.5% of span) to tolerant (2.5% of span)
  let rowBands = findProjectionIntervals(smoothRows, height, minRowSpan, Math.max(1.5, width * 0.008));
  if (rowBands.length <= 1) {
    rowBands = findProjectionIntervals(smoothRows, height, minRowSpan, Math.max(2.5, width * 0.022));
  }

  let colBands = findProjectionIntervals(smoothCols, width, minColSpan, Math.max(1.5, height * 0.008));
  if (colBands.length <= 1) {
    colBands = findProjectionIntervals(smoothCols, width, minColSpan, Math.max(2.5, height * 0.022));
  }

  const results: CutSetItemBounds[] = [];

  // Case 1: Multi-row or Multi-column Grid Sheet detected (e.g. 4x6 = 24 stickers)
  if (rowBands.length * colBands.length >= 2) {
    let idx = 0;
    for (let r = 0; r < rowBands.length; r++) {
      const rb = rowBands[r];
      // Within this row band, also check local column projection so staggered rows still slice accurately
      const localColCounts = new Float32Array(width);
      for (let y = rb.start; y <= rb.end; y++) {
        for (let x = 0; x < width; x++) {
          if (rgba[(y * width + x) * 4 + 3] >= alphaThreshold) {
            localColCounts[x]++;
          }
        }
      }
      const rbHeight = rb.end - rb.start + 1;
      const smoothLocalCols = smoothProfile(localColCounts, width);
      let activeCols = findProjectionIntervals(
        smoothLocalCols,
        width,
        minColSpan,
        Math.max(1, rbHeight * 0.015)
      );
      if (activeCols.length < colBands.length) {
        activeCols = colBands;
      }

      for (let c = 0; c < activeCols.length; c++) {
        const cb = activeCols[c];
        // Compute tight bounding box of opaque pixels inside [cb.start..cb.end, rb.start..rb.end]
        let cMinX = cb.end + 1;
        let cMinY = rb.end + 1;
        let cMaxX = cb.start - 1;
        let cMaxY = rb.start - 1;
        let cellOpaque = 0;

        for (let y = rb.start; y <= rb.end; y++) {
          for (let x = cb.start; x <= cb.end; x++) {
            if (rgba[(y * width + x) * 4 + 3] >= alphaThreshold) {
              cellOpaque++;
              if (x < cMinX) cMinX = x;
              if (x > cMaxX) cMaxX = x;
              if (y < cMinY) cMinY = y;
              if (y > cMaxY) cMaxY = y;
            }
          }
        }

        const contentW = cMaxX - cMinX + 1;
        const contentH = cMaxY - cMinY + 1;
        if (cellOpaque < 25 || contentW < 12 || contentH < 12) continue;

        const padX0 = Math.max(0, cMinX - paddingPx);
        const padY0 = Math.max(0, cMinY - paddingPx);
        const padX1 = Math.min(width - 1, cMaxX + paddingPx);
        const padY1 = Math.min(height - 1, cMaxY + paddingPx);

        results.push({
          index: idx++,
          row: r,
          col: c,
          x: padX0,
          y: padY0,
          width: padX1 - padX0 + 1,
          height: padY1 - padY0 + 1,
          contentX: cMinX,
          contentY: cMinY,
          contentWidth: contentW,
          contentHeight: contentH,
        });
      }
    }

    if (results.length >= 2) {
      return results;
    }
  }

  // Case 2: Connected-Component Clustering on coarse grid (handles freeform sets or single item)
  const cellStep = Math.max(2, Math.floor(Math.min(width, height) / 160));
  const gw = Math.ceil(width / cellStep);
  const gh = Math.ceil(height / cellStep);
  const mask = new Uint8Array(gw * gh);

  for (let gy = 0; gy < gh; gy++) {
    const y0 = gy * cellStep;
    const y1 = Math.min(height, y0 + cellStep);
    for (let gx = 0; gx < gw; gx++) {
      const x0 = gx * cellStep;
      const x1 = Math.min(width, x0 + cellStep);
      let active = 0;
      for (let y = y0; y < y1 && !active; y++) {
        for (let x = x0; x < x1; x++) {
          if (rgba[(y * width + x) * 4 + 3] >= alphaThreshold) {
            active = 1;
            break;
          }
        }
      }
      mask[gy * gw + gx] = active;
    }
  }

  // Dilate mask by 2 coarse cells so floating hearts/text stay connected to their character
  const dilated = new Uint8Array(gw * gh);
  const dilateR = 2;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (!mask[gy * gw + gx]) continue;
      for (let dy = -dilateR; dy <= dilateR; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= gh) continue;
        for (let dx = -dilateR; dx <= dilateR; dx++) {
          const nx = gx + dx;
          if (nx >= 0 && nx < gw) {
            dilated[ny * gw + nx] = 1;
          }
        }
      }
    }
  }

  const visited = new Uint8Array(gw * gh);
  const rawBoxes: { minX: number; minY: number; maxX: number; maxY: number; area: number }[] = [];
  const q = new Int32Array(gw * gh);

  for (let i = 0; i < gw * gh; i++) {
    if (!dilated[i] || visited[i]) continue;
    visited[i] = 1;
    let head = 0;
    let tail = 0;
    q[tail++] = i;

    let minGX = gw;
    let minGY = gh;
    let maxGX = -1;
    let maxGY = -1;
    let area = 0;

    while (head < tail) {
      const cur = q[head++];
      const cx = cur % gw;
      const cy = (cur - cx) / gw;
      if (mask[cur]) {
        area++;
        if (cx < minGX) minGX = cx;
        if (cx > maxGX) maxGX = cx;
        if (cy < minGY) minGY = cy;
        if (cy > maxGY) maxGY = cy;
      }
      const neighbors = [
        cx > 0 ? cur - 1 : -1,
        cx + 1 < gw ? cur + 1 : -1,
        cy > 0 ? cur - gw : -1,
        cy + 1 < gh ? cur + gw : -1,
      ];
      for (const nb of neighbors) {
        if (nb >= 0 && dilated[nb] && !visited[nb]) {
          visited[nb] = 1;
          q[tail++] = nb;
        }
      }
    }

    if (area >= 4 && maxGX >= minGX && maxGY >= minGY) {
      rawBoxes.push({
        minX: minGX * cellStep,
        minY: minGY * cellStep,
        maxX: Math.min(width - 1, (maxGX + 1) * cellStep - 1),
        maxY: Math.min(height - 1, (maxGY + 1) * cellStep - 1),
        area,
      });
    }
  }

  if (rawBoxes.length <= 1) {
    const padX0 = Math.max(0, globalMinX - paddingPx);
    const padY0 = Math.max(0, globalMinY - paddingPx);
    const padX1 = Math.min(width - 1, globalMaxX + paddingPx);
    const padY1 = Math.min(height - 1, globalMaxY + paddingPx);
    return [
      {
        index: 0,
        row: 0,
        col: 0,
        x: padX0,
        y: padY0,
        width: padX1 - padX0 + 1,
        height: padY1 - padY0 + 1,
        contentX: globalMinX,
        contentY: globalMinY,
        contentWidth: globalMaxX - globalMinX + 1,
        contentHeight: globalMaxY - globalMinY + 1,
      },
    ];
  }

  // Sort boxes top-to-bottom, then left-to-right
  const rowGroupingTol = Math.max(24, height * 0.08);
  rawBoxes.sort((a, b) => {
    const cyA = (a.minY + a.maxY) / 2;
    const cyB = (b.minY + b.maxY) / 2;
    if (Math.abs(cyA - cyB) > rowGroupingTol) return cyA - cyB;
    return a.minX - b.minX;
  });

  return rawBoxes.map((b, idx) => {
    const padX0 = Math.max(0, b.minX - paddingPx);
    const padY0 = Math.max(0, b.minY - paddingPx);
    const padX1 = Math.min(width - 1, b.maxX + paddingPx);
    const padY1 = Math.min(height - 1, b.maxY + paddingPx);
    return {
      index: idx,
      row: Math.floor(idx / 4),
      col: idx % 4,
      x: padX0,
      y: padY0,
      width: padX1 - padX0 + 1,
      height: padY1 - padY0 + 1,
      contentX: b.minX,
      contentY: b.minY,
      contentWidth: b.maxX - b.minX + 1,
      contentHeight: b.maxY - b.minY + 1,
    };
  });
}

/**
 * Full browser helper: takes a canvas/image/video source, performs smart background cutout
 * AND slices the set (`قص الطاقم`) into high-resolution individual PNG dataUrls ready to display on the main page.
 */
export function processAndSliceSetFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  baseName = 'طاقم',
  options: SmartCutSetOptions = {}
): {
  fullCutoutDataUrl: string;
  fullCutoutCanvas: HTMLCanvasElement;
  items: CutSetItemResult[];
} {
  const W = Math.max(1, sourceCanvas.width);
  const H = Math.max(1, sourceCanvas.height);

  const workCanvas = document.createElement('canvas');
  workCanvas.width = W;
  workCanvas.height = H;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      fullCutoutDataUrl: sourceCanvas.toDataURL('image/png'),
      fullCutoutCanvas: sourceCanvas,
      items: [],
    };
  }

  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(sourceCanvas, 0, 0, W, H);

  const imgData = ctx.getImageData(0, 0, W, H);
  if (options.removeBackground !== false) {
    detectAndRemoveBackgroundSmart(imgData.data, W, H, options);
    ctx.putImageData(imgData, 0, 0);
  }

  const fullCutoutDataUrl = workCanvas.toDataURL('image/png');
  const boundsList =
    options.sliceSet === false
      ? [
          {
            index: 0,
            row: 0,
            col: 0,
            x: 0,
            y: 0,
            width: W,
            height: H,
            contentX: 0,
            contentY: 0,
            contentWidth: W,
            contentHeight: H,
          },
        ]
      : detectSetItemsBoundsFromRgba(imgData.data, W, H, options.paddingPx ?? 6);

  const cleanBase = (baseName || 'ملصق').replace(/\.[^.]+$/, '');
  const items: CutSetItemResult[] = boundsList.map((b, idx) => {
    const itemCanvas = document.createElement('canvas');
    itemCanvas.width = b.width;
    itemCanvas.height = b.height;
    const itemCtx = itemCanvas.getContext('2d');
    if (itemCtx) {
      itemCtx.clearRect(0, 0, b.width, b.height);
      itemCtx.drawImage(workCanvas, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
    }
    const numStr = String(idx + 1).padStart(2, '0');
    return {
      ...b,
      id: `cut_item_${idx + 1}_${Date.now()}`,
      name: boundsList.length > 1 ? `${cleanBase}_${numStr}` : `${cleanBase}_مفرغ`,
      dataUrl: itemCanvas.toDataURL('image/png'),
    };
  });

  return {
    fullCutoutDataUrl,
    fullCutoutCanvas: workCanvas,
    items,
  };
}
