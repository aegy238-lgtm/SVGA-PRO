export interface VapYyevaMeta {
  kind: 'VAP' | 'YYEVA';
  a: number[];
  c: number[];
  fps?: number;
  frames?: number;
  alphaLayout?: 'r' | 'l';
  data?: unknown;
}

export interface Mp4Box {
  start: number;
  end: number;
  header: number;
  type: string;
}

const TD = new TextDecoder();

export const bidx = (u: Uint8Array, s: string, from = 0): number => {
  const n = [...s].map((c) => c.charCodeAt(0));
  if (!n.length) return -1;
  for (let i = u.indexOf(n[0], from); i >= 0; i = u.indexOf(n[0], i + 1)) {
    if (i + n.length <= u.length && n.every((b, j) => u[i + j] === b)) return i;
  }
  return -1;
};

/**
 * Tolerant MP4 box parser that does not fail if there are trailing zero/padding bytes at EOF.
 */
export function parseMp4BoxesTolerant(u: Uint8Array, start = 0, end = u.length): Mp4Box[] {
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const out: Mp4Box[] = [];
  let p = start;
  while (p + 8 <= end) {
    let n = v.getUint32(p);
    let h = 8;
    const typeBytes = u.subarray(p + 4, p + 8);
    // Check if type consists of printable ASCII chars
    const validType =
      typeBytes[0] >= 0x20 &&
      typeBytes[0] <= 0x7e &&
      typeBytes[1] >= 0x20 &&
      typeBytes[1] <= 0x7e &&
      typeBytes[2] >= 0x20 &&
      typeBytes[2] <= 0x7e &&
      typeBytes[3] >= 0x20 &&
      typeBytes[3] <= 0x7e;
    if (!validType) break;

    if (n === 1) {
      if (p + 16 > end) break;
      n = Number(v.getBigUint64(p + 8));
      h = 16;
    } else if (n === 0) {
      n = end - p;
    }
    if (!Number.isSafeInteger(n) || n < h) break;
    const boxEnd = Math.min(end, p + n);
    out.push({
      start: p,
      end: boxEnd,
      header: h,
      type: TD.decode(typeBytes),
    });
    p += n;
  }
  return out;
}

function normalizeRect(r: any): number[] | null {
  if (Array.isArray(r) && r.length >= 4) {
    const nums = r.slice(0, 4).map(Number);
    if (nums.every(Number.isFinite) && nums[0] >= 0 && nums[1] >= 0 && nums[2] > 0 && nums[3] > 0) {
      return nums;
    }
  } else if (r && typeof r === 'object') {
    const x = Number(r.x ?? r.left ?? 0);
    const y = Number(r.y ?? r.top ?? 0);
    const w = Number(r.w ?? r.width ?? 0);
    const h = Number(r.h ?? r.height ?? 0);
    if ([x, y, w, h].every(Number.isFinite) && x >= 0 && y >= 0 && w > 0 && h > 0) {
      return [x, y, w, h];
    }
  }
  return null;
}

export function inferAlphaSideFromRects(a: number[], c: number[]): 'r' | 'l' {
  const alphaCenterX = a[0] + a[2] / 2;
  const rgbCenterX = c[0] + c[2] / 2;
  return alphaCenterX < rgbCenterX ? 'l' : 'r';
}

export function clampMetaToVideoBounds(
  meta: VapYyevaMeta,
  videoWidth: number,
  videoHeight: number
): VapYyevaMeta {
  if (!videoWidth || !videoHeight) return meta;
  const clampRect = (r: number[]) => {
    const x = Math.max(0, Math.min(r[0], videoWidth - 2));
    const y = Math.max(0, Math.min(r[1], videoHeight - 2));
    const w = Math.max(2, Math.min(r[2], videoWidth - x));
    const h = Math.max(2, Math.min(r[3], videoHeight - y));
    return [x, y, w, h];
  };
  const a = clampRect(meta.a);
  const c = clampRect(meta.c);
  return {
    ...meta,
    a,
    c,
    alphaLayout: inferAlphaSideFromRects(a, c),
  };
}

export function metaFromAnyObject(
  data: any,
  preferredKind?: 'VAP' | 'YYEVA'
): VapYyevaMeta | null {
  if (!data || typeof data !== 'object') return null;

  // Check standard VAP `info`, YYEVA `descript`, or flat root properties
  const vapInfo = data.info && typeof data.info === 'object' ? data.info : null;
  const yyDescript = data.descript && typeof data.descript === 'object' ? data.descript : null;
  const candidate = vapInfo || yyDescript || data;

  const a = normalizeRect(candidate.alphaFrame ?? candidate.aFrame ?? candidate.alpha);
  const c = normalizeRect(candidate.rgbFrame ?? candidate.cFrame ?? candidate.rgb);
  if (!a || !c) return null;

  const kind: 'VAP' | 'YYEVA' =
    preferredKind ||
    (vapInfo || candidate.aFrame || candidate.isVapx !== undefined ? 'VAP' : 'YYEVA');

  return {
    kind,
    a,
    c,
    fps: Number(candidate.fps || candidate.frameRate) || undefined,
    frames: Number(candidate.f || candidate.totalFrame || candidate.frames) || undefined,
    alphaLayout: inferAlphaSideFromRects(a, c),
    data,
  };
}

/**
 * Extracts the first valid JSON object `{ ... }` from a byte slice, ignoring leading flags or trailing null bytes.
 */
export function parseJsonSlice(bytes: Uint8Array): any | null {
  const text = TD.decode(bytes);
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  const sub = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(sub);
  } catch {
    // Try finding balanced braces from firstBrace
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = firstBrace; i <= lastBrace; i++) {
      const ch = text[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\' && inStr) {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (!inStr) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(text.slice(firstBrace, i + 1));
            } catch {
              break;
            }
          }
        }
      }
    }
    return null;
  }
}

/**
 * Synchronous binary metadata detector for VAP and YYEVA MP4 containers.
 */
export function detectVapYyevaSequentialSync(u: Uint8Array): VapYyevaMeta | null {
  // 1. Check top-level and nested boxes via tolerant box parser
  const scanBoxes = (start: number, end: number, depth = 0): VapYyevaMeta | null => {
    if (depth > 4) return null;
    const list = parseMp4BoxesTolerant(u, start, end);
    for (const b of list) {
      if (b.type === 'vapc' || b.type === 'yyev' || b.type === 'yyeva') {
        const parsed = parseJsonSlice(u.subarray(b.start + b.header, b.end));
        const meta = metaFromAnyObject(parsed, b.type === 'vapc' ? 'VAP' : 'YYEVA');
        if (meta) return meta;
      }
      if (['moov', 'udta', 'meta', 'trak', 'mdia', 'minf', 'free', 'skip', 'uuid'].includes(b.type)) {
        const parsed = parseJsonSlice(u.subarray(b.start + b.header, b.end));
        const directMeta = metaFromAnyObject(parsed);
        if (directMeta) return directMeta;
        const nested = scanBoxes(b.start + b.header, b.end, depth + 1);
        if (nested) return nested;
      }
    }
    return null;
  };

  const boxHit = scanBoxes(0, u.length);
  if (boxHit) return boxHit;

  // 2. Fallback: raw byte signature search for `vapc`
  let idx = bidx(u, 'vapc', 0);
  while (idx >= 0) {
    let sliceEnd = Math.min(u.length, idx + 65536);
    if (idx >= 4) {
      const sz = new DataView(u.buffer, u.byteOffset, u.byteLength).getUint32(idx - 4);
      if (sz > 8 && idx - 4 + sz <= u.length) {
        sliceEnd = idx - 4 + sz;
      }
    }
    const parsed = parseJsonSlice(u.subarray(idx + 4, sliceEnd));
    const meta = metaFromAnyObject(parsed, 'VAP');
    if (meta) return meta;
    idx = bidx(u, 'vapc', idx + 4);
  }

  // 3. Fallback: raw byte signature search for `yyev`
  idx = bidx(u, 'yyev', 0);
  while (idx >= 0) {
    let sliceEnd = Math.min(u.length, idx + 65536);
    if (idx >= 4) {
      const sz = new DataView(u.buffer, u.byteOffset, u.byteLength).getUint32(idx - 4);
      if (sz > 8 && idx - 4 + sz <= u.length) {
        sliceEnd = idx - 4 + sz;
      }
    }
    const parsed = parseJsonSlice(u.subarray(idx + 4, sliceEnd));
    const meta = metaFromAnyObject(parsed, 'YYEVA');
    if (meta) return meta;
    idx = bidx(u, 'yyev', idx + 4);
  }

  // 4. Fallback: `yyeffectmp4json[[...]]yyeffectmp4json` (uncompressed JSON case)
  const beginTag = 'yyeffectmp4json[[';
  const endTag = ']]yyeffectmp4json';
  const yIdx = bidx(u, beginTag, 0);
  if (yIdx >= 0) {
    const eIdx = bidx(u, endTag, yIdx + beginTag.length);
    if (eIdx > yIdx) {
      const parsed = parseJsonSlice(u.subarray(yIdx + beginTag.length, eIdx));
      const meta = metaFromAnyObject(parsed, 'YYEVA');
      if (meta) return meta;
    }
  }

  // 5. Fallback: search for `"aFrame"` or `"alphaFrame"` anywhere in non-mdat regions
  for (const key of ['"aFrame"', '"alphaFrame"']) {
    const kIdx = bidx(u, key, 0);
    if (kIdx >= 0) {
      const searchStart = Math.max(0, kIdx - 2048);
      const searchEnd = Math.min(u.length, kIdx + 16384);
      const parsed = parseJsonSlice(u.subarray(searchStart, searchEnd));
      const meta = metaFromAnyObject(parsed, key === '"aFrame"' ? 'VAP' : 'YYEVA');
      if (meta) return meta;
    }
  }

  return null;
}

export interface AlphaDetectionResult {
  layout: 'n' | 'r' | 'l';
  kind: 'VAP' | 'YYEVA' | 'Dual Channel' | null;
  meta: VapYyevaMeta | null;
}

interface RegionStats {
  totalPixels: number;
  nonBlackCount: number;
  blackCount: number;
  grayscaleCount: number;
  brightWhiteCount: number;
  colorCount: number;
  avgChroma: number;
  avgLuma: number;
  grayscaleRatio: number;
  blackRatio: number;
}

function analyzeRegion(
  rgba: Uint8ClampedArray | Uint8Array,
  fullWidth: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): RegionStats {
  const stepX = Math.max(1, Math.floor(rw / 64));
  const stepY = Math.max(1, Math.floor(rh / 64));
  let totalPixels = 0;
  let nonBlackCount = 0;
  let blackCount = 0;
  let grayscaleCount = 0;
  let brightWhiteCount = 0;
  let colorCount = 0;
  let sumChroma = 0;
  let sumLuma = 0;

  for (let y = ry; y < ry + rh; y += stepY) {
    for (let x = rx; x < rx + rw; x += stepX) {
      const i = (y * fullWidth + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = maxC - minC;
      const luma = (r * 77 + g * 150 + b * 29) >> 8;

      totalPixels++;
      sumLuma += luma;

      if (maxC <= 16) {
        blackCount++;
      } else {
        nonBlackCount++;
        sumChroma += chroma;
        if (chroma <= 14) {
          grayscaleCount++;
          if (luma >= 135) {
            brightWhiteCount++;
          }
        } else if (chroma >= 18) {
          colorCount++;
        }
      }
    }
  }

  return {
    totalPixels: Math.max(1, totalPixels),
    nonBlackCount,
    blackCount,
    grayscaleCount,
    brightWhiteCount,
    colorCount,
    avgChroma: nonBlackCount > 0 ? sumChroma / nonBlackCount : 0,
    avgLuma: totalPixels > 0 ? sumLuma / totalPixels : 0,
    grayscaleRatio: nonBlackCount > 0 ? grayscaleCount / nonBlackCount : 0,
    blackRatio: totalPixels > 0 ? blackCount / totalPixels : 0,
  };
}

function computeSilhouetteCorrelation(
  rgba: Uint8ClampedArray | Uint8Array,
  fullWidth: number,
  maskRect: [number, number, number, number],
  rgbRect: [number, number, number, number]
): number {
  const [mx, my, mw, mh] = maskRect;
  const [cx, cy, cw, ch] = rgbRect;
  const steps = 32;
  let matches = 0;
  let activePairs = 0;
  let activeMatches = 0;

  for (let sy = 0; sy < steps; sy++) {
    const uY = (sy + 0.5) / steps;
    const yM = Math.min(my + mh - 1, Math.floor(my + uY * mh));
    const yC = Math.min(cy + ch - 1, Math.floor(cy + uY * ch));
    for (let sx = 0; sx < steps; sx++) {
      const uX = (sx + 0.5) / steps;
      const xM = Math.min(mx + mw - 1, Math.floor(mx + uX * mw));
      const xC = Math.min(cx + cw - 1, Math.floor(cx + uX * cw));

      const iM = (yM * fullWidth + xM) * 4;
      const iC = (yC * fullWidth + xC) * 4;

      const lumaM = (rgba[iM] * 77 + rgba[iM + 1] * 150 + rgba[iM + 2] * 29) >> 8;
      const maxC = Math.max(rgba[iC], rgba[iC + 1], rgba[iC + 2]);

      const maskOn = lumaM > 20;
      const rgbOn = maxC > 16;

      if (maskOn === rgbOn) matches++;
      if (maskOn || rgbOn) {
        activePairs++;
        if (maskOn && rgbOn) activeMatches++;
      }
    }
  }

  const globalAgreement = matches / (steps * steps);
  const jaccard = activePairs > 0 ? activeMatches / activePairs : 0;
  return globalAgreement * 0.5 + jaccard * 0.5;
}

/**
 * Automatically detects if a decoded video frame has a grayscale/white alpha channel
 * on the right ('r') or on the left ('l'), supporting both symmetric side-by-side
 * (YYEVA / Dual Channel / VAP 1:1) and asymmetric packed VAP (2:1 RGB + half-size Alpha).
 */
export function detectAlphaLayoutFromRgbaFrame(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  fileExt = ''
): AlphaDetectionResult {
  const ext = fileExt.toLowerCase().replace(/^\./, '');
  const isExplicitVapYyeva = ext === 'vap' || ext === 'yyeva';
  if (width < 4 || height < 4 || rgba.length < width * height * 4) {
    return { layout: 'n', kind: null, meta: null };
  }

  // 1. Check asymmetric Tencent VAP layout (RGB = W x H, Alpha = W/2 x H/2 on right or left)
  // In VAP, total video width VW is approx 1.5 * W (so W is approx 2/3 of width, aw is approx 1/3 of width)
  const thirdW = Math.floor(width / 3) & ~1;
  const twoThirdW = width - thirdW;
  const halfH = Math.floor(height / 2) & ~1;

  if (thirdW >= 16 && halfH >= 16 && width >= height * 1.15) {
    // Check Right-side asymmetric VAP: RGB = [0, 0, twoThirdW, height], Alpha = [twoThirdW, 0, thirdW, halfH]
    const topRightAlpha = analyzeRegion(rgba, width, twoThirdW, 0, thirdW, halfH);
    const botRightEmpty = analyzeRegion(rgba, width, twoThirdW, halfH, thirdW, height - halfH);
    const leftRgb = analyzeRegion(rgba, width, 0, 0, twoThirdW, height);

    const rightIsHalfAlpha =
      topRightAlpha.nonBlackCount > topRightAlpha.totalPixels * 0.02 &&
      topRightAlpha.grayscaleRatio >= 0.9 &&
      topRightAlpha.brightWhiteCount > 0 &&
      botRightEmpty.blackRatio >= 0.96 &&
      leftRgb.nonBlackCount > leftRgb.totalPixels * 0.02 &&
      (leftRgb.avgChroma > topRightAlpha.avgChroma + 6 ||
        computeSilhouetteCorrelation(
          rgba,
          width,
          [twoThirdW, 0, thirdW, halfH],
          [0, 0, twoThirdW, height]
        ) >= 0.55);

    if (rightIsHalfAlpha) {
      const meta: VapYyevaMeta = {
        kind: 'VAP',
        c: [0, 0, twoThirdW, height],
        a: [twoThirdW, 0, thirdW, halfH],
        alphaLayout: 'r',
      };
      return { layout: 'r', kind: 'VAP', meta };
    }

    // Check Left-side asymmetric VAP: Alpha = [0, 0, thirdW, halfH], RGB = [thirdW, 0, twoThirdW, height]
    const topLeftAlpha = analyzeRegion(rgba, width, 0, 0, thirdW, halfH);
    const botLeftEmpty = analyzeRegion(rgba, width, 0, halfH, thirdW, height - halfH);
    const rightRgb = analyzeRegion(rgba, width, thirdW, 0, twoThirdW, height);

    const leftIsHalfAlpha =
      topLeftAlpha.nonBlackCount > topLeftAlpha.totalPixels * 0.02 &&
      topLeftAlpha.grayscaleRatio >= 0.9 &&
      topLeftAlpha.brightWhiteCount > 0 &&
      botLeftEmpty.blackRatio >= 0.96 &&
      rightRgb.nonBlackCount > rightRgb.totalPixels * 0.02 &&
      (rightRgb.avgChroma > topLeftAlpha.avgChroma + 6 ||
        computeSilhouetteCorrelation(
          rgba,
          width,
          [0, 0, thirdW, halfH],
          [thirdW, 0, twoThirdW, height]
        ) >= 0.55);

    if (leftIsHalfAlpha) {
      const meta: VapYyevaMeta = {
        kind: 'VAP',
        c: [thirdW, 0, twoThirdW, height],
        a: [0, 0, thirdW, halfH],
        alphaLayout: 'l',
      };
      return { layout: 'l', kind: 'VAP', meta };
    }
  }

  // 2. Check Symmetric Side-by-Side (Left half vs Right half)
  const halfW = Math.floor(width / 2);
  const left = analyzeRegion(rgba, width, 0, 0, halfW, height);
  const right = analyzeRegion(rgba, width, halfW, 0, halfW, height);

  const minActivePixels = Math.max(4, Math.floor(left.totalPixels * 0.01));
  if (left.nonBlackCount < minActivePixels && right.nonBlackCount < minActivePixels) {
    return { layout: 'n', kind: null, meta: null };
  }

  const corrRightMask = computeSilhouetteCorrelation(
    rgba,
    width,
    [halfW, 0, halfW, height],
    [0, 0, halfW, height]
  );
  const corrLeftMask = computeSilhouetteCorrelation(
    rgba,
    width,
    [0, 0, halfW, height],
    [halfW, 0, halfW, height]
  );

  const isMaskCandidate = (mask: RegionStats, rgb: RegionStats, corr: number) => {
    if (mask.nonBlackCount < minActivePixels) return false;
    // Mask must be overwhelmingly grayscale (white/gray on black)
    if (mask.grayscaleRatio < 0.88) return false;
    if (mask.brightWhiteCount < Math.max(2, Math.floor(mask.nonBlackCount * 0.1))) return false;
    if (mask.avgChroma > 10) return false;

    // Either RGB side has distinct color, OR silhouette correlation is strong with black background
    const hasDistinctColor =
      rgb.avgChroma > mask.avgChroma + 8 || rgb.colorCount > Math.max(3, rgb.nonBlackCount * 0.08);
    const hasStrongSilhouette =
      corr >= 0.58 &&
      mask.blackRatio >= 0.05 &&
      (isExplicitVapYyeva || width >= height * 1.15 || mask.avgLuma > rgb.avgLuma * 1.1);

    return hasDistinctColor || hasStrongSilhouette;
  };

  const rightCandidate = isMaskCandidate(right, left, corrRightMask);
  const leftCandidate = isMaskCandidate(left, right, corrLeftMask);

  const resolvedKind: 'VAP' | 'YYEVA' = ext === 'vap' ? 'VAP' : 'YYEVA';

  if (rightCandidate && !leftCandidate) {
    return {
      layout: 'r',
      kind: resolvedKind,
      meta: {
        kind: resolvedKind,
        c: [0, 0, halfW, height],
        a: [halfW, 0, halfW, height],
        alphaLayout: 'r',
      },
    };
  }

  if (leftCandidate && !rightCandidate) {
    return {
      layout: 'l',
      kind: resolvedKind,
      meta: {
        kind: resolvedKind,
        c: [halfW, 0, halfW, height],
        a: [0, 0, halfW, height],
        alphaLayout: 'l',
      },
    };
  }

  if (rightCandidate && leftCandidate) {
    // Pick the side that is more purely grayscale + brighter white mask (lower chroma, higher luma)
    const rightScore = right.avgLuma - right.avgChroma * 4;
    const leftScore = left.avgLuma - left.avgChroma * 4;
    const side: 'r' | 'l' = rightScore >= leftScore ? 'r' : 'l';
    return {
      layout: side,
      kind: resolvedKind,
      meta: {
        kind: resolvedKind,
        c: side === 'r' ? [0, 0, halfW, height] : [halfW, 0, halfW, height],
        a: side === 'r' ? [halfW, 0, halfW, height] : [0, 0, halfW, height],
        alphaLayout: side,
      },
    };
  }

  // Fallback for explicit .vap / .yyeva files where both sides have content:
  if (isExplicitVapYyeva && left.nonBlackCount > 0 && right.nonBlackCount > 0) {
    const side: 'r' | 'l' =
      right.grayscaleRatio > left.grayscaleRatio ||
      (right.grayscaleRatio === left.grayscaleRatio && right.avgChroma <= left.avgChroma)
        ? 'r'
        : 'l';
    return {
      layout: side,
      kind: resolvedKind,
      meta: {
        kind: resolvedKind,
        c: side === 'r' ? [0, 0, halfW, height] : [halfW, 0, halfW, height],
        a: side === 'r' ? [halfW, 0, halfW, height] : [0, 0, halfW, height],
        alphaLayout: side,
      },
    };
  }

  return { layout: 'n', kind: null, meta: null };
}
