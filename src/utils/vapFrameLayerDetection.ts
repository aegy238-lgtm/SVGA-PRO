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

export interface VapDetectedDummyMask {
  id: string;
  kind: 'hole' | 'chroma_dummy';
  labelAr: string;
  labelEn: string;
  frame: [number, number, number, number];
  shapePreset: 'circle' | 'roundedRect' | 'rect';
  fillRgb?: [number, number, number];
  pixelCount: number;
  silhouetteRgba: Uint8ClampedArray;
}

export interface VapDummyErasureRegion {
  id?: string;
  kind?: 'hole' | 'chroma_dummy';
  frame: [number, number, number, number];
  fillRgb?: [number, number, number];
  silhouetteRgba?: Uint8ClampedArray;
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

function hasSlotCenterInRowBand(
  dynamicSlots: VapDynamicMaskSlot[],
  y0: number,
  y1: number
): boolean {
  for (const slot of dynamicSlots || []) {
    const sf = slot.defaultFrame;
    if (!sf) continue;
    const scy = sf[1] + sf[3] / 2;
    if (scy >= y0 - 4 && scy <= y1 + 4) return true;
  }
  return false;
}

/**
 * Automatically detects embedded visual frames and layers placed inside a VAP / YYEVA video frame
 * (such as the Winged Avatar Frame `إطار الصورة`, Name Banner Frame `إطار الاسم`, decorative badges,
 * and Main Scene `المشهد الأساسي`) using the combined RGBA buffer (`rgbFrame` + `aFrame`) and optional
 * `dynamicSlots` metadata — without slicing curved top edges off the main artwork.
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

  for (let y = Math.round(ch * 0.10); y < ch; y++) {
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

  // Refine sceneStartY upward across contiguous wide top edges/curves of the main scene so curved artwork never gets sliced off
  if (sceneStartY > 0) {
    while (
      sceneStartY > 0 &&
      rowSpan[sceneStartY - 1] >= cw * 0.72 &&
      !hasSlotCenterInRowBand(dynamicSlots, sceneStartY - 1, sceneStartY - 1)
    ) {
      sceneStartY--;
    }
  }

  let floatingLimitY = sceneStartY > 0 ? sceneStartY - 1 : ch - 1;

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

  // Merge any contiguous/adjacent bottom band above sceneStartY whose horizontal span covers >=82% width
  // and has no dynamic slot (prevents slicing curved/tapered gift tops into fake "banner" strips!)
  if (sceneStartY > 0) {
    const maxMergeGap = Math.max(8, Math.round(ch * 0.018));
    while (rawBands.length > 0) {
      const last = rawBands[rawBands.length - 1];
      const vGap = sceneStartY - last[1];
      if (vGap > maxMergeGap) break;
      let maxBandSpan = 0;
      for (let ry = last[0]; ry <= last[1]; ry++) {
        if (rowSpan[ry] > maxBandSpan) maxBandSpan = rowSpan[ry];
      }
      const hasSlot = hasSlotCenterInRowBand(dynamicSlots, last[0], last[1]);
      if (maxBandSpan >= cw * 0.82 && !hasSlot) {
        sceneStartY = last[0];
        floatingLimitY = sceneStartY - 1;
        rawBands.pop();
      } else {
        break;
      }
    }
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
    } else if (!linkedSlot && bw >= cw * 0.90 && bh <= ch * 0.14 && coverageRatio < 0.65) {
      // Wide, thin semi-empty sliver near top of a wide gift artwork — skip instead of slicing the gift
      continue;
    } else if (linkedSlot?.isTextSlot || (!linkedSlot && aspectRatio >= 2.05 && bh <= ch * 0.25 && bw < cw * 0.90)) {
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

function overlapsExistingSlot(
  box: [number, number, number, number],
  existingSlots: VapDynamicMaskSlot[]
): boolean {
  const [bx, by, bw, bh] = box;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  for (const s of existingSlots || []) {
    const sf = s.defaultFrame;
    if (!sf) continue;
    if (cx >= sf[0] && cx <= sf[0] + sf[2] && cy >= sf[1] && cy <= sf[1] + sf[3]) {
      return true;
    }
    const ix0 = Math.max(bx, sf[0]);
    const iy0 = Math.max(by, sf[1]);
    const ix1 = Math.min(bx + bw, sf[0] + sf[2]);
    const iy1 = Math.min(by + bh, sf[1] + sf[3]);
    if (ix1 > ix0 && iy1 > iy0) {
      const interArea = (ix1 - ix0) * (iy1 - iy0);
      if (interArea >= Math.min(bw * bh, sf[2] * sf[3]) * 0.45) return true;
    }
  }
  return false;
}

function inferShapePreset(
  bw: number,
  bh: number,
  fillRatio: number
): 'circle' | 'roundedRect' | 'rect' {
  const ar = bw / Math.max(1, bh);
  if (ar >= 0.72 && ar <= 1.38 && fillRatio >= 0.62 && fillRatio <= 0.87) {
    return 'circle';
  }
  if (fillRatio >= 0.85 && fillRatio <= 0.96) {
    return 'roundedRect';
  }
  return 'rect';
}

function isChromaDummyPixel(r: number, g: number, b: number, a: number): number {
  if (a < 180) return 0;
  // 1: Pink / Magenta dummy (#ec4899, #ff00ff, #e91e63, etc.)
  if (r >= 165 && b >= 100 && g <= Math.min(r, b) * 0.65 && Math.max(r, b) - g >= 65) return 1;
  // 2: Chroma green dummy (#00ff00, #22c55e, #10b981, etc.)
  if (g >= 165 && r <= g * 0.55 && b <= g * 0.68 && g - Math.max(r, b) >= 60) return 2;
  // 3: Bright cyan/aqua dummy (#00ffff, #06b6d4, #38bdf8)
  if (g >= 170 && b >= 190 && r <= 75 && Math.min(g, b) - r >= 110) return 3;
  return 0;
}

/**
 * Automatically detects dummy placeholder shapes inside rendered RGBA frames:
 * 1) Enclosed transparent cutout holes surrounded by gift frame artwork (`kind: 'hole'`)
 * 2) Flat solid chroma dummy shapes such as pink/magenta/green/cyan avatar placeholders (`kind: 'chroma_dummy'`)
 * Guarded strictly by compactness and color uniformity so gradient/textured artwork causes zero false positives.
 */
export function detectDummyMasksFromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  cw: number,
  ch: number,
  existingSlots: VapDynamicMaskSlot[] = []
): VapDetectedDummyMask[] {
  if (!rgba || cw < 24 || ch < 24 || rgba.length < cw * ch * 4) return [];

  const results: VapDetectedDummyMask[] = [];
  const step = Math.max(1, Math.ceil(Math.max(cw, ch) / 320));
  const gw = Math.max(8, Math.floor(cw / step));
  const gh = Math.max(8, Math.floor(ch / step));
  const cellArea = step * step;

  // --- 1. Detect Enclosed Transparent Cutout Holes (BFS from canvas borders) ---
  const transMask = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    const sy = Math.min(ch - 1, gy * step + (step >> 1));
    for (let gx = 0; gx < gw; gx++) {
      const sx = Math.min(cw - 1, gx * step + (step >> 1));
      const a = rgba[(sy * cw + sx) * 4 + 3];
      if (a < 32) transMask[gy * gw + gx] = 1;
    }
  }

  const visited = new Uint8Array(gw * gh);
  const queue = new Int32Array(gw * gh);
  let qHead = 0;
  let qTail = 0;

  const pushBorder = (gx: number, gy: number) => {
    const idx = gy * gw + gx;
    if (transMask[idx] && !visited[idx]) {
      visited[idx] = 1;
      queue[qTail++] = idx;
    }
  };
  for (let gx = 0; gx < gw; gx++) {
    pushBorder(gx, 0);
    pushBorder(gx, gh - 1);
  }
  for (let gy = 0; gy < gh; gy++) {
    pushBorder(0, gy);
    pushBorder(gw - 1, gy);
  }
  while (qHead < qTail) {
    const cur = queue[qHead++];
    const cx = cur % gw;
    const cy = (cur / gw) | 0;
    if (cx > 0 && transMask[cur - 1] && !visited[cur - 1]) {
      visited[cur - 1] = 1;
      queue[qTail++] = cur - 1;
    }
    if (cx + 1 < gw && transMask[cur + 1] && !visited[cur + 1]) {
      visited[cur + 1] = 1;
      queue[qTail++] = cur + 1;
    }
    if (cy > 0 && transMask[cur - gw] && !visited[cur - gw]) {
      visited[cur - gw] = 1;
      queue[qTail++] = cur - gw;
    }
    if (cy + 1 < gh && transMask[cur + gw] && !visited[cur + gw]) {
      visited[cur + gw] = 1;
      queue[qTail++] = cur + gw;
    }
  }

  const minDimPx = Math.max(24, Math.round(Math.min(cw, ch) * 0.06));
  const minAreaPx = Math.max(400, Math.round(cw * ch * 0.004));
  const maxAreaPx = Math.round(cw * ch * 0.55);

  let holeIdx = 0;
  for (let start = 0; start < gw * gh; start++) {
    if (!transMask[start] || visited[start]) continue;
    let h = 0;
    let t = 0;
    visited[start] = 1;
    queue[t++] = start;
    let minGx = gw;
    let maxGx = -1;
    let minGy = gh;
    let maxGy = -1;

    while (h < t) {
      const cur = queue[h++];
      const gx = cur % gw;
      const gy = (cur / gw) | 0;
      if (gx < minGx) minGx = gx;
      if (gx > maxGx) maxGx = gx;
      if (gy < minGy) minGy = gy;
      if (gy > maxGy) maxGy = gy;

      const neighbors = [
        gx > 0 ? cur - 1 : -1,
        gx + 1 < gw ? cur + 1 : -1,
        gy > 0 ? cur - gw : -1,
        gy + 1 < gh ? cur + gw : -1,
      ];
      for (const nb of neighbors) {
        if (nb >= 0 && transMask[nb] && !visited[nb]) {
          visited[nb] = 1;
          queue[t++] = nb;
        }
      }
    }

    const bx = Math.max(0, minGx * step);
    const by = Math.max(0, minGy * step);
    const bw = Math.min(cw - bx, (maxGx - minGx + 1) * step);
    const bh = Math.min(ch - by, (maxGy - minGy + 1) * step);
    const approxArea = t * cellArea;
    if (bw < minDimPx || bh < minDimPx || approxArea < minAreaPx || approxArea > maxAreaPx) continue;
    const ar = Math.max(bw / Math.max(1, bh), bh / Math.max(1, bw));
    if (ar > 4.5) continue;
    const fillRatio = t / Math.max(1, (maxGx - minGx + 1) * (maxGy - minGy + 1));
    if (fillRatio < 0.45) continue;

    const frame: [number, number, number, number] = [bx, by, bw, bh];
    if (overlapsExistingSlot(frame, existingSlots)) continue;

    // Build exact full-res white-on-black silhouette of the transparent cutout
    const sil = new Uint8ClampedArray(bw * bh * 4);
    let exactPx = 0;
    for (let y = 0; y < bh; y++) {
      const rowOff = (by + y) * cw * 4;
      for (let x = 0; x < bw; x++) {
        const a = rgba[rowOff + (bx + x) * 4 + 3];
        const sIdx = (y * bw + x) * 4;
        const inside = a < 48;
        const v = inside ? 255 : 0;
        if (inside) exactPx++;
        sil[sIdx] = v;
        sil[sIdx + 1] = v;
        sil[sIdx + 2] = v;
        sil[sIdx + 3] = 255;
      }
    }

    holeIdx++;
    results.push({
      id: `dummy_hole_${holeIdx}`,
      kind: 'hole',
      labelAr: holeIdx === 1 ? 'فراغ قناع مكتشف تلقائياً' : `فراغ قناع مكتشف (${holeIdx})`,
      labelEn: holeIdx === 1 ? 'Detected Cutout Hole' : `Detected Cutout Hole (${holeIdx})`,
      frame,
      shapePreset: inferShapePreset(bw, bh, exactPx / Math.max(1, bw * bh)),
      pixelCount: exactPx,
      silhouetteRgba: sil,
    });
  }

  // --- 2. Detect Compact Flat Chroma Dummy Shapes (Pink/Magenta/Green/Cyan) ---
  const chromaCat = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    const sy = Math.min(ch - 1, gy * step + (step >> 1));
    for (let gx = 0; gx < gw; gx++) {
      const sx = Math.min(cw - 1, gx * step + (step >> 1));
      const idx = (sy * cw + sx) * 4;
      chromaCat[gy * gw + gx] = isChromaDummyPixel(rgba[idx], rgba[idx + 1], rgba[idx + 2], rgba[idx + 3]);
    }
  }

  const cVisited = new Uint8Array(gw * gh);
  let chromaIdx = 0;
  for (let start = 0; start < gw * gh; start++) {
    const cat = chromaCat[start];
    if (!cat || cVisited[start]) continue;

    const sGx = start % gw;
    const sGy = (start / gw) | 0;
    const sPx = (Math.min(ch - 1, sGy * step + (step >> 1)) * cw + Math.min(cw - 1, sGx * step + (step >> 1))) * 4;
    const sr = rgba[sPx];
    const sg = rgba[sPx + 1];
    const sb = rgba[sPx + 2];

    let h = 0;
    let t = 0;
    cVisited[start] = 1;
    queue[t++] = start;
    let minGx = gw;
    let maxGx = -1;
    let minGy = gh;
    let maxGy = -1;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    while (h < t) {
      const cur = queue[h++];
      const gx = cur % gw;
      const gy = (cur / gw) | 0;
      const pIdx = (Math.min(ch - 1, gy * step + (step >> 1)) * cw + Math.min(cw - 1, gx * step + (step >> 1))) * 4;
      sumR += rgba[pIdx];
      sumG += rgba[pIdx + 1];
      sumB += rgba[pIdx + 2];

      if (gx < minGx) minGx = gx;
      if (gx > maxGx) maxGx = gx;
      if (gy < minGy) minGy = gy;
      if (gy > maxGy) maxGy = gy;

      const neighbors = [
        gx > 0 ? cur - 1 : -1,
        gx + 1 < gw ? cur + 1 : -1,
        gy > 0 ? cur - gw : -1,
        gy + 1 < gh ? cur + gw : -1,
      ];
      for (const nb of neighbors) {
        if (nb >= 0 && !cVisited[nb] && chromaCat[nb] === cat) {
          const nGx = nb % gw;
          const nGy = (nb / gw) | 0;
          const nIdx = (Math.min(ch - 1, nGy * step + (step >> 1)) * cw + Math.min(cw - 1, nGx * step + (step >> 1))) * 4;
          const diff = Math.abs(rgba[nIdx] - sr) + Math.abs(rgba[nIdx + 1] - sg) + Math.abs(rgba[nIdx + 2] - sb);
          if (diff <= 54) {
            cVisited[nb] = 1;
            queue[t++] = nb;
          }
        }
      }
    }

    const bx = Math.max(0, minGx * step);
    const by = Math.max(0, minGy * step);
    const bw = Math.min(cw - bx, (maxGx - minGx + 1) * step);
    const bh = Math.min(ch - by, (maxGy - minGy + 1) * step);
    const approxArea = t * cellArea;
    if (bw < minDimPx || bh < minDimPx || approxArea < minAreaPx || approxArea > maxAreaPx) continue;
    const ar = Math.max(bw / Math.max(1, bh), bh / Math.max(1, bw));
    if (ar > 4.5) continue;
    const fillRatio = t / Math.max(1, (maxGx - minGx + 1) * (maxGy - minGy + 1));
    if (fillRatio < 0.55) continue;

    // Flatness check: reject rich gradients / glowing textures (requires >= 78% of cells within +/-40 Manhattan distance of component mean)
    const meanR = Math.round(sumR / t);
    const meanG = Math.round(sumG / t);
    const meanB = Math.round(sumB / t);
    let uniformCells = 0;
    for (let k = 0; k < t; k++) {
      const cur = queue[k];
      const gx = cur % gw;
      const gy = (cur / gw) | 0;
      const pIdx = (Math.min(ch - 1, gy * step + (step >> 1)) * cw + Math.min(cw - 1, gx * step + (step >> 1))) * 4;
      const diff = Math.abs(rgba[pIdx] - meanR) + Math.abs(rgba[pIdx + 1] - meanG) + Math.abs(rgba[pIdx + 2] - meanB);
      if (diff <= 40) uniformCells++;
    }
    if (uniformCells / t < 0.78) continue;

    const frame: [number, number, number, number] = [bx, by, bw, bh];
    if (overlapsExistingSlot(frame, existingSlots)) continue;

    const sil = new Uint8ClampedArray(bw * bh * 4);
    let exactPx = 0;
    for (let y = 0; y < bh; y++) {
      const rowOff = (by + y) * cw * 4;
      for (let x = 0; x < bw; x++) {
        const pIdx = rowOff + (bx + x) * 4;
        const a = rgba[pIdx + 3];
        const diff = Math.abs(rgba[pIdx] - meanR) + Math.abs(rgba[pIdx + 1] - meanG) + Math.abs(rgba[pIdx + 2] - meanB);
        const inside = a >= 140 && diff <= 65;
        const v = inside ? 255 : 0;
        if (inside) exactPx++;
        const sIdx = (y * bw + x) * 4;
        sil[sIdx] = v;
        sil[sIdx + 1] = v;
        sil[sIdx + 2] = v;
        sil[sIdx + 3] = 255;
      }
    }

    chromaIdx++;
    results.push({
      id: `dummy_chroma_${chromaIdx}`,
      kind: 'chroma_dummy',
      labelAr: chromaIdx === 1 ? 'قناع وهمي ملون مكتشف' : `قناع وهمي ملون (${chromaIdx})`,
      labelEn: chromaIdx === 1 ? 'Detected Dummy Mask' : `Detected Dummy Mask (${chromaIdx})`,
      frame,
      shapePreset: inferShapePreset(bw, bh, exactPx / Math.max(1, bw * bh)),
      fillRgb: [meanR, meanG, meanB],
      pixelCount: exactPx,
      silhouetteRgba: sil,
    });
  }

  return results;
}

/**
 * Cleanly erases converted dummy placeholder mask pixels (and any 1-2px color fringe halo)
 * from an RGBA buffer without harming surrounding gift artwork.
 */
export function eraseDummyMaskPixelsFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  cw: number,
  ch: number,
  erasures: VapDummyErasureRegion[] | undefined
): void {
  if (!rgba || !erasures || erasures.length === 0 || cw < 1 || ch < 1) return;

  for (const er of erasures) {
    if (!er || !Array.isArray(er.frame)) continue;
    const fx = Math.round(er.frame[0]);
    const fy = Math.round(er.frame[1]);
    const fw = Math.max(1, Math.round(er.frame[2]));
    const fh = Math.max(1, Math.round(er.frame[3]));

    const pad = 2;
    const x0 = Math.max(0, fx - pad);
    const y0 = Math.max(0, fy - pad);
    const x1 = Math.min(cw - 1, fx + fw - 1 + pad);
    const y1 = Math.min(ch - 1, fy + fh - 1 + pad);
    const sil = er.silhouetteRgba;
    const rgb = er.fillRgb;

    for (let y = y0; y <= y1; y++) {
      const rowOff = y * cw * 4;
      for (let x = x0; x <= x1; x++) {
        const i = rowOff + x * 4;
        if (rgba[i + 3] === 0) continue;

        let eraseStrength = 0;
        const lx = x - fx;
        const ly = y - fy;
        if (sil && lx >= 0 && lx < fw && ly >= 0 && ly < fh) {
          const sv = sil[(ly * fw + lx) * 4];
          if (sv >= 200) eraseStrength = 255;
          else if (sv > 12) eraseStrength = sv;
        } else if (!sil && !rgb) {
          eraseStrength = 255;
        }

        if (rgb) {
          const diff = Math.abs(rgba[i] - rgb[0]) + Math.abs(rgba[i + 1] - rgb[1]) + Math.abs(rgba[i + 2] - rgb[2]);
          if (diff <= 75) {
            eraseStrength = 255;
          } else if (diff <= 135 && sil) {
            // Check 1-2px neighborhood inside silhouette for anti-aliased fringe halo
            let nearSil = false;
            for (let ny = -2; ny <= 2 && !nearSil; ny++) {
              for (let nx = -2; nx <= 2; nx++) {
                const slx = lx + nx;
                const sly = ly + ny;
                if (slx >= 0 && slx < fw && sly >= 0 && sly < fh && sil[(sly * fw + slx) * 4] >= 128) {
                  nearSil = true;
                  break;
                }
              }
            }
            if (nearSil) {
              eraseStrength = Math.max(eraseStrength, 255);
            }
          }
        }

        if (eraseStrength >= 250) {
          rgba[i] = 0;
          rgba[i + 1] = 0;
          rgba[i + 2] = 0;
          rgba[i + 3] = 0;
        } else if (eraseStrength > 0) {
          const remainFactor = (255 - eraseStrength) / 255;
          rgba[i + 3] = Math.round(rgba[i + 3] * remainFactor);
        }
      }
    }
  }
}

