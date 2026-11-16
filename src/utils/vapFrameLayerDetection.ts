import { VapDynamicMaskSlot } from './vapYyevaDetection';

export type VapEmbeddedFrameKind = 'avatar_frame' | 'banner_frame' | 'decor_frame' | 'main_scene';

export interface VapDetectedEmbeddedFrame {
  id: string;
  kind: VapEmbeddedFrameKind;
  labelAr: string;
  labelEn: string;
  /** Bounding box [x, y, w, h] in the logical RGB canvas (cw x ch) */
  frame: [number, number, number, number];
  /** Coverage ratio (0..1) of visible pixels inside the bounding box */
  coverageRatio: number;
  /** Aspect ratio (w / h) */
  aspectRatio: number;
  /** Whether this frame is an isolated overlay/frame (true) vs the full-bleed background scene (false) */
  isIsolatedFrame: boolean;
  /** Optional linked dynamic mask slot srcId if a mask slot sits inside this frame */
  linkedSlotId?: string;
  /** Asset key in the MotionTools assets dictionary (`A[assetKey]`) */
  assetKey: string;
}

export interface VapEmbeddedFrameOverride {
  id: string;
  hidden?: boolean;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  /** Optional custom bounding box override [x, y, w, h] on the logical stage */
  customFrame?: [number, number, number, number];
  /** Optional replacement image DataURL */
  replacementDataUrl?: string;
  /** Optional replacement HTMLImageElement / HTMLCanvasElement */
  replacementSource?: any;
}

/**
 * Computes tight RGBA bounding box [x, y, w, h] and visible pixel count within a sub-rectangle
 * `[rx0, ry0, rx1, ry1]` (inclusive) of an RGBA buffer (`cw x ch`).
 */
function computeSubRectTightBounds(
  rgba: Uint8Array | Uint8ClampedArray,
  cw: number,
  ch: number,
  rx0: number,
  ry0: number,
  rx1: number,
  ry1: number,
  alphaThreshold = 28
): { box: [number, number, number, number]; visiblePixels: number } | null {
  const xStart = Math.max(0, Math.min(cw - 1, Math.floor(rx0)));
  const yStart = Math.max(0, Math.min(ch - 1, Math.floor(ry0)));
  const xEnd = Math.max(xStart, Math.min(cw - 1, Math.floor(rx1)));
  const yEnd = Math.max(yStart, Math.min(ch - 1, Math.floor(ry1)));

  let minX = cw;
  let minY = ch;
  let maxX = -1;
  let maxY = -1;
  let visiblePixels = 0;

  for (let y = yStart; y <= yEnd; y++) {
    const rowOff = y * cw * 4;
    for (let x = xStart; x <= xEnd; x++) {
      const i = rowOff + x * 4;
      const a = rgba[i + 3];
      if (a >= alphaThreshold) {
        const maxRgb = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
        if (maxRgb >= 10 || a >= 60) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          visiblePixels++;
        }
      }
    }
  }

  if (maxX < minX || maxY < minY || visiblePixels === 0) return null;
  return {
    box: [minX, minY, maxX - minX + 1, maxY - minY + 1],
    visiblePixels,
  };
}

/**
 * Recursively splits a vertical band `[y0 .. y1]` at deep horizontal pinch points (necks)
 * where two distinct visual frames touch vertically (e.g., a Winged Avatar Frame touching
 * the top crown of a Name Banner Frame).
 */
function splitVerticalBandAtPinchPoints(
  rowActive: Int32Array,
  rowSpan: Int32Array,
  y0: number,
  y1: number,
  cw: number,
  ch: number,
  depth = 0
): Array<[number, number]> {
  const bandH = y1 - y0 + 1;
  const minSubBandH = Math.max(12, Math.round(ch * 0.045));
  if (depth >= 3 || bandH < minSubBandH * 2.2) {
    return [[y0, y1]];
  }

  // Smooth rowActive and rowSpan with a 5-row window to suppress single-row noise
  const smoothActive = new Float32Array(ch);
  const smoothSpan = new Float32Array(ch);
  for (let y = y0; y <= y1; y++) {
    let sumA = 0;
    let sumS = 0;
    let cnt = 0;
    for (let dy = -2; dy <= 2; dy++) {
      const ny = y + dy;
      if (ny >= y0 && ny <= y1) {
        sumA += rowActive[ny];
        sumS += rowSpan[ny];
        cnt++;
      }
    }
    smoothActive[y] = sumA / Math.max(1, cnt);
    smoothSpan[y] = sumS / Math.max(1, cnt);
  }

  let bestSplitY = -1;
  let bestPinchRatio = 1.0;

  for (let y = y0 + minSubBandH; y <= y1 - minSubBandH; y++) {
    // Find peak active count and span in upper sub-band and lower sub-band
    let maxAboveA = 0;
    let maxAboveS = 0;
    for (let uy = y0; uy <= y - Math.max(4, Math.floor(minSubBandH * 0.4)); uy++) {
      if (smoothActive[uy] > maxAboveA) maxAboveA = smoothActive[uy];
      if (smoothSpan[uy] > maxAboveS) maxAboveS = smoothSpan[uy];
    }

    let maxBelowA = 0;
    let maxBelowS = 0;
    for (let ly = y + Math.max(4, Math.floor(minSubBandH * 0.4)); ly <= y1; ly++) {
      if (smoothActive[ly] > maxBelowA) maxBelowA = smoothActive[ly];
      if (smoothSpan[ly] > maxBelowS) maxBelowS = smoothSpan[ly];
    }

    const refPeakA = Math.min(maxAboveA, maxBelowA);
    const refPeakS = Math.min(maxAboveS, maxBelowS);
    if (refPeakA < cw * 0.08 || refPeakS < cw * 0.15) continue;

    const activeRatio = smoothActive[y] / refPeakA;
    const spanRatio = smoothSpan[y] / refPeakS;
    const combinedScore = Math.min(activeRatio, spanRatio * 0.95);

    // A genuine pinch point between two frames drops active pixels or width below 58% of both peaks
    if (combinedScore < 0.58 && combinedScore < bestPinchRatio) {
      bestPinchRatio = combinedScore;
      bestSplitY = y;
    }
  }

  if (bestSplitY === -1) {
    return [[y0, y1]];
  }

  return [
    ...splitVerticalBandAtPinchPoints(rowActive, rowSpan, y0, bestSplitY, cw, ch, depth + 1),
    ...splitVerticalBandAtPinchPoints(rowActive, rowSpan, bestSplitY + 1, y1, cw, ch, depth + 1),
  ];
}

/**
 * Automatically detects embedded visual frames and layers placed inside a VAP / YYEVA video frame
 * (such as the Winged Avatar Frame `إطار الصورة`, Name Banner Frame `إطار الاسم`, decorative badges,
 * and Main Scene `المشهد الأساسي`) using the combined RGBA buffer (`rgbFrame` + `aFrame`) and optional
 * `dynamicSlots` metadata.
 */
export function detectVapEmbeddedFramesFromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  cw: number,
  ch: number,
  dynamicSlots: VapDynamicMaskSlot[] = []
): VapDetectedEmbeddedFrame[] {
  if (!rgba || cw < 16 || ch < 16 || rgba.length < cw * ch * 4) return [];

  const rowActive = new Int32Array(ch);
  const rowLeft = new Int32Array(ch);
  const rowRight = new Int32Array(ch);
  const rowSpan = new Int32Array(ch);
  const rowFullBleed = new Uint8Array(ch);

  const minRowPixels = Math.max(3, Math.round(cw * 0.012));

  for (let y = 0; y < ch; y++) {
    const rowOff = y * cw * 4;
    let active = 0;
    let minX = cw;
    let maxX = -1;
    for (let x = 0; x < cw; x++) {
      const i = rowOff + x * 4;
      const a = rgba[i + 3];
      if (a >= 28) {
        const maxRgb = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
        if (maxRgb >= 10 || a >= 60) {
          active++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    rowActive[y] = active;
    if (active >= minRowPixels && maxX >= minX) {
      rowLeft[y] = minX;
      rowRight[y] = maxX;
      rowSpan[y] = maxX - minX + 1;
      if (rowSpan[y] >= cw * 0.93 && active >= cw * 0.82) {
        rowFullBleed[y] = 1;
      }
    } else {
      rowLeft[y] = cw;
      rowRight[y] = -1;
      rowSpan[y] = 0;
    }
  }

  // 1. Detect if there is a sustained full-bleed Main Scene region in the lower/middle portion of the video
  let sceneStartY = -1;
  const minSceneRun = Math.max(14, Math.round(ch * 0.12));
  let currentRunStart = -1;
  let currentRunLen = 0;

  for (let y = Math.round(ch * 0.15); y < ch; y++) {
    if (rowFullBleed[y]) {
      if (currentRunStart === -1) currentRunStart = y;
      currentRunLen++;
      if (currentRunLen >= minSceneRun) {
        sceneStartY = currentRunStart;
        break;
      }
    } else {
      currentRunStart = -1;
      currentRunLen = 0;
    }
  }

  // Refine sceneStartY: if rows just above sceneStartY are the full-width top edge of the scene (span >= 90% cw), include them in the scene
  if (sceneStartY > 0) {
    while (sceneStartY > Math.round(ch * 0.12) && rowSpan[sceneStartY - 1] >= cw * 0.90 && rowActive[sceneStartY - 1] >= cw * 0.72) {
      sceneStartY--;
    }
  }

  const floatingLimitY = sceneStartY > 0 ? sceneStartY - 1 : ch - 1;

  // 2. Find contiguous vertical non-empty bands in the Floating Frames Zone [0 .. floatingLimitY]
  const rawBands: Array<[number, number]> = [];
  let inBand = false;
  let bandStart = 0;
  let gapCount = 0;
  const maxAllowedGap = Math.max(2, Math.round(ch * 0.006));

  for (let y = 0; y <= floatingLimitY; y++) {
    if (rowSpan[y] > 0) {
      if (!inBand) {
        inBand = true;
        bandStart = y;
      }
      gapCount = 0;
    } else if (inBand) {
      gapCount++;
      if (gapCount > maxAllowedGap) {
        rawBands.push([bandStart, y - gapCount]);
        inBand = false;
        gapCount = 0;
      }
    }
  }
  if (inBand) {
    rawBands.push([bandStart, floatingLimitY - gapCount]);
  }

  // 3. Split any touching vertical bands at pinch points (e.g., Winged Avatar Frame touching Name Banner Frame)
  const splitBands: Array<[number, number]> = [];
  for (const [b0, b1] of rawBands) {
    if (b1 - b0 + 1 < Math.max(8, Math.round(ch * 0.025))) continue;
    const subBands = splitVerticalBandAtPinchPoints(rowActive, rowSpan, b0, b1, cw, ch, 0);
    for (const sb of subBands) {
      if (sb[1] - sb[0] + 1 >= Math.max(8, Math.round(ch * 0.025))) {
        splitBands.push(sb);
      }
    }
  }

  // 4. Within each vertical band, also check for horizontally separated islands
  const candidateBoxes: Array<{
    box: [number, number, number, number];
    visiblePixels: number;
    isIsolatedFrame: boolean;
  }> = [];

  for (const [by0, by1] of splitBands) {
    const colActive = new Int32Array(cw);
    for (let y = by0; y <= by1; y++) {
      const rowOff = y * cw * 4;
      for (let x = 0; x < cw; x++) {
        const i = rowOff + x * 4;
        if (rgba[i + 3] >= 28 && (Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) >= 10 || rgba[i + 3] >= 60)) {
          colActive[x]++;
        }
      }
    }

    const hSegments: Array<[number, number]> = [];
    let inH = false;
    let hx0 = 0;
    let hGap = 0;
    const maxHGap = Math.max(4, Math.round(cw * 0.02));
    for (let x = 0; x < cw; x++) {
      if (colActive[x] > 0) {
        if (!inH) {
          inH = true;
          hx0 = x;
        }
        hGap = 0;
      } else if (inH) {
        hGap++;
        if (hGap > maxHGap) {
          hSegments.push([hx0, x - hGap]);
          inH = false;
          hGap = 0;
        }
      }
    }
    if (inH) {
      hSegments.push([hx0, cw - 1 - hGap]);
    }

    for (const [hxStart, hxEnd] of hSegments) {
      if (hxEnd - hxStart + 1 < Math.max(12, Math.round(cw * 0.04))) continue;
      const tight = computeSubRectTightBounds(rgba, cw, ch, hxStart, by0, hxEnd, by1, 28);
      if (!tight) continue;
      const [tx, ty, tw, th] = tight.box;
      if (tw < Math.max(16, cw * 0.05) || th < Math.max(12, ch * 0.025)) continue;
      if (tight.visiblePixels < Math.max(64, cw * ch * 0.002)) continue;
      candidateBoxes.push({
        box: [tx, ty, tw, th],
        visiblePixels: tight.visiblePixels,
        isIsolatedFrame: true,
      });
    }
  }

  // 5. Add the Main Scene region [sceneStartY .. ch - 1] if detected
  if (sceneStartY >= 0 && ch - sceneStartY >= Math.max(24, ch * 0.10)) {
    const sceneTight = computeSubRectTightBounds(rgba, cw, ch, 0, sceneStartY, cw - 1, ch - 1, 28);
    if (sceneTight && sceneTight.visiblePixels >= cw * ch * 0.04) {
      candidateBoxes.push({
        box: sceneTight.box,
        visiblePixels: sceneTight.visiblePixels,
        isIsolatedFrame: false,
      });
    }
  }

  // 6. Classify each detected frame and link with any overlapping dynamicSlots
  const detected: VapDetectedEmbeddedFrame[] = [];
  let avatarCount = 0;
  let bannerCount = 0;
  let decorCount = 0;

  for (let idx = 0; idx < candidateBoxes.length; idx++) {
    const cand = candidateBoxes[idx];
    const [bx, by, bw, bh] = cand.box;
    const area = Math.max(1, bw * bh);
    const coverageRatio = Number(Math.min(1, cand.visiblePixels / area).toFixed(3));
    const aspectRatio = Number((bw / Math.max(1, bh)).toFixed(2));

    // Check if a dynamic slot's center lies inside this detected frame box
    let linkedSlot: VapDynamicMaskSlot | undefined;
    for (const slot of dynamicSlots || []) {
      const sf = slot.defaultFrame;
      if (!sf) continue;
      const scx = sf[0] + sf[2] / 2;
      const scy = sf[1] + sf[3] / 2;
      if (scx >= bx - bw * 0.1 && scx <= bx + bw * 1.1 && scy >= by - bh * 0.1 && scy <= by + bh * 1.1) {
        linkedSlot = slot;
        break;
      }
    }

    let kind: VapEmbeddedFrameKind;
    let labelAr: string;
    let labelEn: string;
    let idSlug: string;

    if (!cand.isIsolatedFrame) {
      kind = 'main_scene';
      idSlug = 'vap_frame_main_scene';
      labelAr = 'مشهد الفيديو الأساسي';
      labelEn = 'Main Video Scene';
    } else if (linkedSlot?.isTextSlot || (!linkedSlot && aspectRatio >= 2.05 && bh <= ch * 0.25)) {
      bannerCount++;
      kind = 'banner_frame';
      idSlug = `vap_frame_banner_${bannerCount}`;
      labelAr = bannerCount === 1 ? 'إطار الاسم / الشريط في الفيديو' : `إطار الاسم / الشريط (${bannerCount})`;
      labelEn = bannerCount === 1 ? 'Video Name Banner Frame' : `Video Name Banner (${bannerCount})`;
    } else if (
      (linkedSlot && !linkedSlot.isTextSlot) ||
      (aspectRatio >= 0.55 && aspectRatio <= 2.15 && bh >= ch * 0.09)
    ) {
      avatarCount++;
      kind = 'avatar_frame';
      idSlug = `vap_frame_avatar_${avatarCount}`;
      labelAr = avatarCount === 1 ? 'إطار الصورة في الفيديو' : `إطار الصورة في الفيديو (${avatarCount})`;
      labelEn = avatarCount === 1 ? 'Video Avatar Frame' : `Video Avatar Frame (${avatarCount})`;
    } else {
      decorCount++;
      kind = 'decor_frame';
      idSlug = `vap_frame_decor_${decorCount}`;
      labelAr = `طبقة / إطار الفيديو (${decorCount})`;
      labelEn = `Video Frame Layer (${decorCount})`;
    }

    detected.push({
      id: idSlug,
      kind,
      labelAr,
      labelEn,
      frame: [bx, by, bw, bh],
      coverageRatio,
      aspectRatio,
      isIsolatedFrame: cand.isIsolatedFrame,
      linkedSlotId: linkedSlot?.srcId,
      assetKey: idSlug,
    });
  }

  return detected;
}

/**
 * Extracts a clean RGBA buffer (`w x h`) for a single detected video frame `[bx, by, bw, bh]`
 * from the full logical RGBA canvas (`cw x ch`).
 */
export function extractEmbeddedFrameRgbaCrop(
  fullRgba: Uint8Array | Uint8ClampedArray,
  cw: number,
  ch: number,
  frameRect: [number, number, number, number]
): { rgba: Uint8ClampedArray; width: number; height: number } {
  const bx = Math.max(0, Math.min(cw - 1, Math.round(frameRect[0])));
  const by = Math.max(0, Math.min(ch - 1, Math.round(frameRect[1])));
  const bw = Math.max(1, Math.min(cw - bx, Math.round(frameRect[2])));
  const bh = Math.max(1, Math.min(ch - by, Math.round(frameRect[3])));

  const out = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    const srcOff = ((by + y) * cw + bx) * 4;
    const dstOff = y * bw * 4;
    out.set(fullRgba.subarray(srcOff, srcOff + bw * 4), dstOff);
  }
  return { rgba: out, width: bw, height: bh };
}

/**
 * Applies any user modifications (hide/erase, move/scale, or replace with uploaded image)
 * on the detected embedded video frames directly to the logical RGBA buffer (`cw x ch`).
 */
export function applyEmbeddedFrameOverridesToRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  cw: number,
  ch: number,
  detectedFrames: VapDetectedEmbeddedFrame[],
  overrides: Record<string, VapEmbeddedFrameOverride> | undefined
): void {
  if (!overrides || !detectedFrames || detectedFrames.length === 0) return;

  // First pass: for any frame that is hidden, moved, scaled, or replaced, copy its original pixels (if moved/scaled) and clear its original bounding box
  const movedSnapshots: Array<{
    frame: VapDetectedEmbeddedFrame;
    ov: VapEmbeddedFrameOverride;
    crop: { rgba: Uint8ClampedArray; width: number; height: number } | null;
  }> = [];

  for (const df of detectedFrames) {
    const ov = overrides[df.id];
    if (!ov) continue;
    const isHidden = Boolean(ov.hidden);
    const isReplaced = Boolean(ov.replacementDataUrl || ov.replacementSource);
    const hasCustomBox =
      Array.isArray(ov.customFrame) &&
      (ov.customFrame[0] !== df.frame[0] ||
        ov.customFrame[1] !== df.frame[1] ||
        ov.customFrame[2] !== df.frame[2] ||
        ov.customFrame[3] !== df.frame[3]);
    const hasOffsetOrScale =
      Math.abs(Number(ov.offsetX) || 0) > 0.5 ||
      Math.abs(Number(ov.offsetY) || 0) > 0.5 ||
      (Number(ov.scale) > 0 && Math.abs(Number(ov.scale) - 1) > 0.01);

    if (!isHidden && !isReplaced && !hasCustomBox && !hasOffsetOrScale) continue;

    const needOriginalPixels = !isHidden && !isReplaced && (hasCustomBox || hasOffsetOrScale);
    const crop = needOriginalPixels ? extractEmbeddedFrameRgbaCrop(rgba, cw, ch, df.frame) : null;
    movedSnapshots.push({ frame: df, ov, crop });

    // Clear original bounding box in `rgba`
    const [bx, by, bw, bh] = df.frame;
    const x0 = Math.max(0, Math.min(cw - 1, Math.round(bx)));
    const y0 = Math.max(0, Math.min(ch - 1, Math.round(by)));
    const x1 = Math.max(x0, Math.min(cw, Math.round(bx + bw)));
    const y1 = Math.max(y0, Math.min(ch, Math.round(by + bh)));
    for (let y = y0; y < y1; y++) {
      const rowOff = y * cw * 4;
      for (let x = x0; x < x1; x++) {
        const i = rowOff + x * 4;
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
      }
    }
  }

  // Second pass: composite moved/scaled original frame pixels back into `rgba` at their new destination box
  for (const item of movedSnapshots) {
    if (!item.crop) continue;
    const { frame: df, ov, crop } = item;
    const targetBox: [number, number, number, number] = Array.isArray(ov.customFrame)
      ? ov.customFrame
      : [
          Math.round(df.frame[0] + (Number(ov.offsetX) || 0)),
          Math.round(df.frame[1] + (Number(ov.offsetY) || 0)),
          Math.max(4, Math.round(df.frame[2] * (Number(ov.scale) > 0 ? Number(ov.scale) : 1))),
          Math.max(4, Math.round(df.frame[3] * (Number(ov.scale) > 0 ? Number(ov.scale) : 1))),
        ];

    const [dx, dy, dw, dh] = targetBox;
    for (let y = 0; y < dh; y++) {
      const dstY = dy + y;
      if (dstY < 0 || dstY >= ch) continue;
      const srcY = Math.min(crop.height - 1, Math.floor((y * crop.height) / dh));
      for (let x = 0; x < dw; x++) {
        const dstX = dx + x;
        if (dstX < 0 || dstX >= cw) continue;
        const srcX = Math.min(crop.width - 1, Math.floor((x * crop.width) / dw));
        const sIdx = (srcY * crop.width + srcX) * 4;
        const sa = crop.rgba[sIdx + 3];
        if (sa === 0) continue;
        const dIdx = (dstY * cw + dstX) * 4;
        const da = rgba[dIdx + 3];
        if (da === 0 || sa === 255) {
          rgba[dIdx] = crop.rgba[sIdx];
          rgba[dIdx + 1] = crop.rgba[sIdx + 1];
          rgba[dIdx + 2] = crop.rgba[sIdx + 2];
          rgba[dIdx + 3] = sa;
        } else {
          const sAlpha = sa / 255;
          const invS = 1 - sAlpha;
          rgba[dIdx] = Math.round(crop.rgba[sIdx] * sAlpha + rgba[dIdx] * invS);
          rgba[dIdx + 1] = Math.round(crop.rgba[sIdx + 1] * sAlpha + rgba[dIdx + 1] * invS);
          rgba[dIdx + 2] = Math.round(crop.rgba[sIdx + 2] * sAlpha + rgba[dIdx + 2] * invS);
          rgba[dIdx + 3] = Math.min(255, Math.round(sa + da * invS));
        }
      }
    }
  }
}
