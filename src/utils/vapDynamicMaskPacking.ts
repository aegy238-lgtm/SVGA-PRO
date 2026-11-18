import {
  VapDynamicMaskSlot,
  VapFrameObjPlacement,
  VapYyevaMeta,
  resolveDynamicFramePlacements,
} from './vapYyevaDetection';

export type VapMaskShapePreset = 'rect' | 'roundedRect' | 'circle' | 'shield' | 'customImage';

export type MaskDepthBand =
  | 'belowOverlays'
  | 'behindPrimary'
  | 'abovePrimary'
  | 'aboveOverlays';

export interface CustomEditableVapSlot extends VapDynamicMaskSlot {
  shapePreset?: VapMaskShapePreset;
  maskSilhouetteDataUrl?: string;
  isCustomAdded?: boolean;
  /** True when user moved or resized this slot relative to source metadata */
  hasCustomFrame?: boolean;
  /** True when user chose a shape preset or custom PNG silhouette overriding source mFrame */
  hasCustomShape?: boolean;
  /** 4-tier depth band relative to Main Gift & Added Composer Frames/Images */
  zLayer?: MaskDepthBand;
  linkedComposerLayerId?: string;
  /** Optional mask layer fill color ('transparent' or '#rrggbb') */
  fillColor?: string;
  /** Optional motion/animation & visibility window transform for this mask slot */
  motionTransform?: Record<string, any>;
  /** Optional percentage/pixel bounds preserved across edits */
  mt: number;
}

export interface PackedSlotLayoutItem {
  slot: CustomEditableVapSlot;
  mFrame: [number, number, number, number];
  targetFrame: [number, number, number, number];
}

export interface VapMaskAtlasPlan {
  format: 'vap' | 'yyeva';
  W: number;
  H: number;
  aw: number;
  ah: number;
  VW: number;
  VH: number;
  rgbFrame: [number, number, number, number];
  aFrame: [number, number, number, number];
  packedSlots: PackedSlotLayoutItem[];
}

export function evenCeil(n: number, minVal = 2): number {
  const safe = Number.isFinite(n) ? Math.max(minVal, Math.ceil(n)) : minVal;
  return safe + (safe % 2);
}

export function evenRound(n: number, minVal = 0): number {
  const safe = Number.isFinite(n) ? Math.max(minVal, Math.round(n)) : minVal;
  return safe - (safe % 2);
}

export function scaleRectForOutput(
  rect: [number, number, number, number],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): [number, number, number, number] {
  const safeSrcW = Math.max(1, srcW);
  const safeSrcH = Math.max(1, srcH);
  const sx = dstW / safeSrcW;
  const sy = dstH / safeSrcH;

  const x = Math.max(0, Math.min(dstW - 2, Math.round(rect[0] * sx)));
  const y = Math.max(0, Math.min(dstH - 2, Math.round(rect[1] * sy)));
  const w = Math.max(2, Math.min(dstW - x, Math.round(rect[2] * sx)));
  const h = Math.max(2, Math.min(dstH - y, Math.round(rect[3] * sy)));
  return [x, y, w, h];
}

/**
 * Computes deterministic, non-overlapping packed positions for main RGB, Alpha (`aFrame`),
 * and all dynamic mask silhouettes (`mFrame`) inside the VAP or YYEVA video canvas.
 */
export function planVapMaskAtlasLayout(opts: {
  format: 'vap' | 'yyeva';
  W: number;
  H: number;
  srcW: number;
  srcH: number;
  slots: CustomEditableVapSlot[];
}): VapMaskAtlasPlan {
  const format = opts.format;
  const W = evenCeil(opts.W);
  const H = evenCeil(opts.H);
  const srcW = Math.max(1, opts.srcW || W);
  const srcH = Math.max(1, opts.srcH || H);
  const Y = format === 'yyeva';

  const aw = Y ? W : evenCeil(Math.ceil(W / 2));
  const ah = Y ? H : evenCeil(Math.ceil(H / 2));
  const rgbFrame: [number, number, number, number] = [0, 0, W, H];
  const aFrame: [number, number, number, number] = Y ? [W, 0, W, H] : [W + 4, 0, aw, ah];

  const slots = sortSlotsByZ(Array.isArray(opts.slots) ? opts.slots : []);
  if (slots.length === 0) {
    const VW = Y ? W * 2 : Math.ceil((W + 4 + aw) / 16) * 16;
    const VH = Y ? H : Math.ceil(Math.max(H, ah) / 16) * 16;
    return {
      format,
      W,
      H,
      aw,
      ah,
      VW,
      VH,
      rgbFrame,
      aFrame,
      packedSlots: [],
    };
  }

  // Pack dynamic `mFrame` white-on-black silhouettes in the clean area below `aFrame`
  // (for VAP: `[W + 4, ah + 6]` row-packed within `aw` width; for YYEVA: `[0, H + 6]` within `W * 2`)
  const gap = 4;
  const atlasOriginX = Y ? 0 : W + 4;
  const atlasMaxRowW = Y ? W * 2 : Math.max(aw, 64);
  const atlasOriginY = evenCeil((Y ? H : ah) + 6);

  let curX = atlasOriginX;
  let curY = atlasOriginY;
  let rowH = 0;
  let maxRightX = atlasOriginX + aw;
  let maxBottomY = Y ? H : Math.max(H, ah);

  const packedSlots: PackedSlotLayoutItem[] = [];

  for (const slot of slots) {
    const targetFrame = scaleRectForOutput(
      slot.defaultFrame || [0, 0, Math.max(2, slot.w || 100), Math.max(2, slot.h || 100)],
      srcW,
      srcH,
      W,
      H
    );

    // Choose compact yet crisp even dimensions for `mFrame` (typically half-resolution of targetFrame,
    // guaranteed <= atlasMaxRowW so it always fits inside a row).
    const origM = slot.defaultMFrame;
    const basisW =
      origM && origM[2] > 0 && origM[3] > 0
        ? Math.max(16, Math.round(origM[2] * (W / srcW)))
        : Math.max(16, Math.round(targetFrame[2] * 0.5));
    const basisH =
      origM && origM[2] > 0 && origM[3] > 0
        ? Math.max(16, Math.round(origM[3] * (H / srcH)))
        : Math.max(16, Math.round(targetFrame[3] * 0.5));

    let mw = evenCeil(Math.min(atlasMaxRowW, basisW), 8);
    let mh = evenCeil(
      Math.max(8, Math.round(basisH * (mw / Math.max(1, evenCeil(basisW, 8))))),
      8
    );

    if (curX > atlasOriginX && curX + mw > atlasOriginX + atlasMaxRowW) {
      curX = atlasOriginX;
      curY = evenCeil(curY + rowH + gap);
      rowH = 0;
    }

    const mFrame: [number, number, number, number] = [curX, curY, mw, mh];
    packedSlots.push({ slot, mFrame, targetFrame });

    maxRightX = Math.max(maxRightX, curX + mw);
    maxBottomY = Math.max(maxBottomY, curY + mh);

    curX = evenCeil(curX + mw + gap);
    rowH = Math.max(rowH, mh);
  }

  const VW = Y ? W * 2 : Math.ceil(Math.max(W + 4 + aw, maxRightX) / 16) * 16;
  const VH = Math.ceil(maxBottomY / 16) * 16;

  return {
    format,
    W,
    H,
    aw,
    ah,
    VW,
    VH,
    rgbFrame,
    aFrame,
    packedSlots,
  };
}

export interface BuildVapMetadataOptions {
  plan: VapMaskAtlasPlan;
  nk: number;
  fps: number;
  start: number;
  end: number;
  srcFps: number;
  srcTotalFrames: number;
  srcW: number;
  srcH: number;
  sourceMeta?: VapYyevaMeta | null;
  resolveSlotTransformAtFrame?: (
    slot: CustomEditableVapSlot,
    frameIdx: number,
    totalFrames: number
  ) => {
    offsetX: number;
    offsetY: number;
    scale: number;
    rotation: number;
    opacity: number;
    visible: boolean;
  } | null;
}

/**
 * Generates compliant Tencent VAP (`vapc`) or YYEVA (`yyev`/`yyeffectmp4json`) JSON
 * preserving dynamic mask declarations (`src`/`effect`) and per-frame placements (`frame`/`datas`).
 */
export function buildVapDynamicMetadataJson(opts: BuildVapMetadataOptions): {
  metaJson: Record<string, any>;
  srcMFrameAtFrame: Array<Record<string, [number, number, number, number]>>;
  resolvedFrameAtFrame: Array<Record<string, [number, number, number, number]>>;
  opacityAtFrame: Array<Record<string, number>>;
} {
  const { plan, nk, fps, start, end, srcFps, srcTotalFrames, srcW, srcH, sourceMeta } = opts;
  const { W, H, VW, VH, aFrame, rgbFrame, packedSlots, format } = plan;
  const hasMasks = packedSlots.length > 0;
  const isYyeva = format === 'yyeva';

  const srcMFrameAtFrame: Array<Record<string, [number, number, number, number]>> = [];
  const resolvedFrameAtFrame: Array<Record<string, [number, number, number, number]>> = [];
  const opacityAtFrame: Array<Record<string, number>> = [];
  const frameEntries: any[] = [];

  for (let k = 0; k < nk; k++) {
    const t = Math.min(start + (k + 0.5) / fps, end - 0.0001);
    const srcIdx = Math.max(0, Math.min(Math.max(0, srcTotalFrames - 1), Math.floor(t * srcFps)));
    const sourcePlacements = sourceMeta ? resolveDynamicFramePlacements(sourceMeta, srcIdx) : [];
    const byId = new Map<string, VapFrameObjPlacement>();
    for (const p of sourcePlacements) byId.set(p.srcId, p);

    const frameMMap: Record<string, [number, number, number, number]> = {};
    const frameRectMap: Record<string, [number, number, number, number]> = {};
    const frameOpMap: Record<string, number> = {};
    const objs: any[] = [];

    for (const packed of packedSlots) {
      const { slot, mFrame, targetFrame } = packed;
      const srcPlacement = byId.get(slot.srcId);
      const isOrigSourceFrame =
        Boolean(srcPlacement) && !slot.isCustomAdded && !slot.hasCustomFrame;

      let resolvedFrame: [number, number, number, number] = isOrigSourceFrame && srcPlacement
        ? scaleRectForOutput(srcPlacement.frame, srcW, srcH, W, H)
        : targetFrame;

      const slotTr = opts.resolveSlotTransformAtFrame
        ? opts.resolveSlotTransformAtFrame(slot, k, nk)
        : null;
      if (slotTr) {
        if (!slotTr.visible || slotTr.opacity <= 0.001) {
          frameOpMap[slot.srcId] = 0;
          continue;
        }
        const scaleRatio = Math.max(0.05, Math.min(5, (Number(slotTr.scale) || 100) / 100));
        const dx = (Number(slotTr.offsetX) || 0) * (W / Math.max(1, srcW));
        const dy = (Number(slotTr.offsetY) || 0) * (H / Math.max(1, srcH));
        const cx = resolvedFrame[0] + resolvedFrame[2] / 2 + dx;
        const cy = resolvedFrame[1] + resolvedFrame[3] / 2 + dy;
        const rw = Math.max(2, Math.min(W, Math.round(resolvedFrame[2] * scaleRatio)));
        const rh = Math.max(2, Math.min(H, Math.round(resolvedFrame[3] * scaleRatio)));
        const rx = Math.max(0, Math.min(W - rw, Math.round(cx - rw / 2)));
        const ry = Math.max(0, Math.min(H - rh, Math.round(cy - rh / 2)));
        resolvedFrame = [rx, ry, rw, rh];
        frameOpMap[slot.srcId] = Math.max(0, Math.min(1, Number(slotTr.opacity) / 100));
      } else {
        frameOpMap[slot.srcId] = 1;
      }

      frameRectMap[slot.srcId] = resolvedFrame;

      if (
        srcPlacement &&
        srcPlacement.hasExplicitMFrame !== false &&
        srcPlacement.mFrame[2] > 0 &&
        srcPlacement.mFrame[3] > 0
      ) {
        frameMMap[slot.srcId] = srcPlacement.mFrame;
      }

      if (isYyeva) {
        objs.push({
          effectId: slot.srcId,
          renderFrame: resolvedFrame,
          outputFrame: mFrame,
          z: slot.z,
        });
      } else {
        objs.push({
          srcId: slot.srcId,
          z: slot.z,
          frame: resolvedFrame,
          mFrame,
          mt: slot.mt || 0,
        });
      }
    }

    objs.sort((a, b) => Number(a.z ?? 0) - Number(b.z ?? 0));
    srcMFrameAtFrame.push(frameMMap);
    resolvedFrameAtFrame.push(frameRectMap);
    opacityAtFrame.push(frameOpMap);

    if (hasMasks) {
      if (isYyeva) {
        frameEntries.push({ frameIndex: k, data: objs });
      } else {
        frameEntries.push({ i: k, obj: objs });
      }
    }
  }

  if (isYyeva) {
    const effectList = packedSlots.map(({ slot }) => ({
      effectId: slot.srcId,
      effectType: slot.isTextSlot ? 'txt' : 'img',
      effectTag: slot.srcTag,
      effectWidth: Math.max(2, Math.round(slot.w)),
      effectHeight: Math.max(2, Math.round(slot.h)),
      scaleMode: slot.fitType || 'fitXY',
      ...(slot.color ? { fontColor: slot.color } : {}),
    }));

    return {
      metaJson: {
        descript: {
          width: VW,
          height: VH,
          isEffect: hasMasks ? 1 : 0,
          version: 1,
          rgbFrame,
          alphaFrame: aFrame,
          totalFrame: nk,
          fps,
        },
        effect: effectList,
        datas: frameEntries,
      },
      srcMFrameAtFrame,
      resolvedFrameAtFrame,
      opacityAtFrame,
    };
  }

  const srcList = packedSlots.map(({ slot }) => {
    const scaled = scaleRectForOutput(
      slot.defaultFrame || [0, 0, slot.w, slot.h],
      srcW,
      srcH,
      W,
      H
    );
    const entry: Record<string, any> = {
      srcId: slot.srcId,
      srcType: slot.isTextSlot ? 'txt' : 'img',
      srcTag: slot.srcTag,
      w: Math.max(2, scaled[2]),
      h: Math.max(2, scaled[3]),
      fitType: slot.fitType || 'fitXY',
      loadType: slot.loadType || 'local',
    };
    if (slot.isTextSlot || slot.color) {
      entry.color = slot.color || '#ffffff';
    }
    if (slot.style) {
      entry.style = slot.style;
    }
    return entry;
  });

  const metaJson: Record<string, any> = {
    info: {
      v: 2,
      f: nk,
      w: W,
      h: H,
      fps,
      videoW: VW,
      videoH: VH,
      aFrame,
      rgbFrame,
      isVapx: hasMasks ? 1 : 0,
      orien: 0,
    },
  };
  if (hasMasks) {
    metaJson.src = srcList;
    metaJson.frame = frameEntries;
  }

  return { metaJson, srcMFrameAtFrame, resolvedFrameAtFrame, opacityAtFrame };
}

/**
 * Converts any uploaded PNG/grayscale image buffer into a clean white-on-black
 * luminance mask (`#ffffff` visible area on `#000000` background) ready for VAP `mFrame`.
 */
export function rgbaToWhiteOnBlackMaskBuffer(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8ClampedArray {
  const len = Math.min(rgba.length, Math.max(1, width * height * 4));
  const out = new Uint8ClampedArray(len);

  // Detect whether the image carries meaningful alpha cutout (transparent PNG) vs opaque grayscale
  let hasAlphaTransparency = false;
  for (let i = 3; i < len; i += 4) {
    if (rgba[i] < 245) {
      hasAlphaTransparency = true;
      break;
    }
  }

  for (let i = 0; i < len; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    const val = hasAlphaTransparency ? a : (r * 77 + g * 150 + b * 29) >> 8;
    const clamped = val <= 8 ? 0 : val >= 248 ? 255 : val;
    out[i] = clamped;
    out[i + 1] = clamped;
    out[i + 2] = clamped;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Generates an RGBA pixel buffer containing a pure white (`#fff`) silhouette on pure black (`#000`)
 * for built-in mask presets (`rect`, `roundedRect`, `circle`, `shield`).
 */
export function buildPresetWhiteMaskRgba(
  shape: Exclude<VapMaskShapePreset, 'customImage'>,
  width: number,
  height: number
): Uint8ClampedArray {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const out = new Uint8ClampedArray(w * h * 4);

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rx = Math.max(1, w / 2 - 1);
  const ry = Math.max(1, h / 2 - 1);
  const cornerR = Math.max(2, Math.round(Math.min(w, h) * 0.22));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = false;
      if (shape === 'rect') {
        inside = true;
      } else if (shape === 'circle') {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        inside = dx * dx + dy * dy <= 1.0;
      } else if (shape === 'roundedRect') {
        const ix = Math.max(0, Math.abs(x - cx) - (w / 2 - cornerR));
        const iy = Math.max(0, Math.abs(y - cy) - (h / 2 - cornerR));
        inside = ix * ix + iy * iy <= cornerR * cornerR;
      } else if (shape === 'shield') {
        const nx = (x - cx) / rx;
        const ny = (y / Math.max(1, h - 1)) * 2 - 1; // -1 top .. +1 bottom
        if (ny < 0) {
          inside = Math.abs(nx) <= 0.92;
        } else {
          const halfW = 0.92 * Math.max(0, 1 - ny * ny * 0.95);
          inside = Math.abs(nx) <= halfW && ny <= 0.96;
        }
      }

      const idx = (y * w + x) * 4;
      const v = inside ? 255 : 0;
      out[idx] = v;
      out[idx + 1] = v;
      out[idx + 2] = v;
      out[idx + 3] = 255;
    }
  }
  return out;
}

export interface PersistedSlotReplacementData {
  active?: boolean;
  hidden?: boolean;
  customImg?: boolean;
  dataUrl?: string;
  text?: string;
  textColor?: string;
  fitMode?: string;
  useMask?: boolean;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface PersistedVapMasksProjectState {
  guidesEnabled?: boolean;
  bakeReplacedSlots?: boolean;
  preserveMasksOnExport?: boolean;
  editedSlots?: CustomEditableVapSlot[];
  customSlots?: CustomEditableVapSlot[];
  replacements?: Record<string, PersistedSlotReplacementData>;
  customSilhouettes?: Record<string, string>;
}

export function buildNextSlotId(existingSlots: Array<{ srcId: string }>): string {
  let maxId = 0;
  for (const s of existingSlots) {
    const n = Number(s.srcId);
    if (Number.isFinite(n) && n >= maxId) maxId = Math.floor(n) + 1;
  }
  const existingSet = new Set(existingSlots.map((s) => String(s.srcId)));
  while (existingSet.has(String(maxId))) maxId++;
  return String(maxId);
}

export function makeCustomVapSlot(params: {
  srcId: string;
  srcType: 'img' | 'txt';
  srcTag: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fitType?: string;
  color?: string;
  shapePreset?: VapMaskShapePreset;
  maskSilhouetteDataUrl?: string;
  z?: number;
  linkedComposerLayerId?: string;
}): CustomEditableVapSlot {
  const isTxt = params.srcType === 'txt';
  const w = Math.max(8, Math.round(params.w || (isTxt ? 320 : 160)));
  const h = Math.max(8, Math.round(params.h || (isTxt ? 54 : 160)));
  const x = Math.max(0, Math.round(params.x || 0));
  const y = Math.max(0, Math.round(params.y || 0));
  const tag = (params.srcTag || (isTxt ? 'textName1' : 'avatar1')).trim();
  const safeTagSlug = tag.replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_') || params.srcId;
  const defaultShape: VapMaskShapePreset = params.maskSilhouetteDataUrl
    ? 'customImage'
    : params.shapePreset || (isTxt ? 'roundedRect' : 'circle');

  return {
    srcId: String(params.srcId),
    srcType: isTxt ? 'txt' : 'img',
    srcTag: tag,
    isTextSlot: isTxt,
    w,
    h,
    fitType: params.fitType || (isTxt ? 'contain' : 'fitXY'),
    loadType: 'local',
    color: isTxt ? params.color || '#ffffff' : undefined,
    z: Number.isFinite(Number(params.z)) ? Number(params.z) : 0,
    defaultFrame: [x, y, w, h],
    defaultMFrame: [0, 0, evenCeil(Math.round(w * 0.5), 8), evenCeil(Math.round(h * 0.5), 8)],
    mt: 0,
    assetKey: `mask_${params.srcId}_${safeTagSlug}`,
    labelAr: isTxt ? `قناع الاسم (${tag})` : `قناع الصورة (${tag})`,
    labelEn: isTxt ? `Name Mask (${tag})` : `Image Mask (${tag})`,
    shapePreset: defaultShape,
    maskSilhouetteDataUrl: params.maskSilhouetteDataUrl,
    linkedComposerLayerId: params.linkedComposerLayerId,
    isCustomAdded: true,
  };
}

const DEPTH_BAND_RANK: Record<MaskDepthBand, number> = {
  belowOverlays: 0,
  behindPrimary: 1,
  abovePrimary: 2,
  aboveOverlays: 3,
};

/**
 * Resolves the canonical 4-tier depth band for a mask slot while preserving
 * the `z < 0` (behind gift) vs `z >= 0` (in front of gift) invariant.
 */
export function resolveMaskDepthBand(slot: {
  z?: number;
  zLayer?: MaskDepthBand;
}): MaskDepthBand {
  const zVal = Number(slot?.z ?? 0);
  if (zVal < 0) {
    return slot?.zLayer === 'belowOverlays' ? 'belowOverlays' : 'behindPrimary';
  }
  return slot?.zLayer === 'aboveOverlays' ? 'aboveOverlays' : 'abovePrimary';
}

/**
 * Sorts dynamic slots in ascending painter's Z-order (lowest band & Z drawn first / behind, highest Z drawn last / on top).
 */
export function sortSlotsByZ<T extends { srcId: string; z?: number; zLayer?: MaskDepthBand }>(
  slots: T[]
): T[] {
  return [...slots]
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => {
      const ra = DEPTH_BAND_RANK[resolveMaskDepthBand(a.s)];
      const rb = DEPTH_BAND_RANK[resolveMaskDepthBand(b.s)];
      if (ra !== rb) return ra - rb;
      const za = Number.isFinite(Number(a.s.z)) ? Number(a.s.z) : a.idx;
      const zb = Number.isFinite(Number(b.s.z)) ? Number(b.s.z) : b.idx;
      if (za !== zb) return za - zb;
      return a.idx - b.idx;
    })
    .map((x) => x.s);
}

/**
 * Assigns a slot to an explicit depth band (`belowOverlays`, `behindPrimary`, `abovePrimary`, or `aboveOverlays`)
 * and returns clean contiguous `{ z, zLayer }` assignments for all slots.
 */
export function setSlotDepthBand(
  slots: Array<{ srcId: string; z?: number; zLayer?: MaskDepthBand }>,
  targetSrcId: string,
  targetBand: MaskDepthBand
): Record<string, { z: number; zLayer: MaskDepthBand }> {
  const sorted = sortSlotsByZ(slots);
  const buckets: Record<MaskDepthBand, Array<{ srcId: string; z?: number; zLayer?: MaskDepthBand }>> = {
    belowOverlays: [],
    behindPrimary: [],
    abovePrimary: [],
    aboveOverlays: [],
  };

  let targetItem: { srcId: string; z?: number; zLayer?: MaskDepthBand } | null = null;
  for (const s of sorted) {
    if (String(s.srcId) === String(targetSrcId)) {
      targetItem = s;
    } else {
      buckets[resolveMaskDepthBand(s)].push(s);
    }
  }
  if (targetItem) {
    buckets[targetBand].push({ ...targetItem, zLayer: targetBand });
  }

  const belowAll = [...buckets.belowOverlays, ...buckets.behindPrimary];
  const aboveAll = [...buckets.abovePrimary, ...buckets.aboveOverlays];
  const out: Record<string, { z: number; zLayer: MaskDepthBand }> = {};
  buckets.belowOverlays.forEach((s) => {
    const idx = belowAll.indexOf(s);
    out[s.srcId] = { z: -(belowAll.length - idx), zLayer: 'belowOverlays' };
  });
  buckets.behindPrimary.forEach((s) => {
    const idx = belowAll.indexOf(s);
    out[s.srcId] = { z: -(belowAll.length - idx), zLayer: 'behindPrimary' };
  });
  buckets.abovePrimary.forEach((s) => {
    const idx = aboveAll.indexOf(s);
    out[s.srcId] = { z: idx, zLayer: 'abovePrimary' };
  });
  buckets.aboveOverlays.forEach((s) => {
    const idx = aboveAll.indexOf(s);
    out[s.srcId] = { z: idx, zLayer: 'aboveOverlays' };
  });
  return out;
}

/**
 * Reorders a slot up (towards front/higher Z), down (towards back/behind gift/lower Z),
 * or explicitly across the gift boundary ('toFront' | 'toBack').
 * Partition between Behind-Gift (`z < 0`) and In-Front-Of-Gift (`z >= 0`) is strictly preserved
 * for all sibling masks so moving two front masks never flips another mask behind the gift.
 */
export function reorderMaskSlotsZ(
  slots: Array<{ srcId: string; z?: number }>,
  targetSrcId: string,
  direction: 'up' | 'down' | 'top' | 'bottom' | 'toFront' | 'toBack'
): Record<string, number> {
  const sorted = sortSlotsByZ(slots);
  const out: Record<string, number> = {};
  const below = sorted.filter((s) => Number(s.z ?? 0) < 0);
  const above = sorted.filter((s) => Number(s.z ?? 0) >= 0);

  const idxB = below.findIndex((s) => String(s.srcId) === String(targetSrcId));
  const idxA = above.findIndex((s) => String(s.srcId) === String(targetSrcId));

  if (idxB === -1 && idxA === -1) {
    below.forEach((s, i) => {
      out[s.srcId] = -(below.length - i);
    });
    above.forEach((s, i) => {
      out[s.srcId] = i;
    });
    return out;
  }

  if (idxB >= 0) {
    if (direction === 'up') {
      if (idxB < below.length - 1) {
        const tmp = below[idxB];
        below[idxB] = below[idxB + 1];
        below[idxB + 1] = tmp;
      } else {
        const [item] = below.splice(idxB, 1);
        above.unshift(item);
      }
    } else if (direction === 'down') {
      if (idxB > 0) {
        const tmp = below[idxB];
        below[idxB] = below[idxB - 1];
        below[idxB - 1] = tmp;
      }
    } else if (direction === 'top' || direction === 'toFront') {
      const [item] = below.splice(idxB, 1);
      above.push(item);
    } else if (direction === 'bottom') {
      const [item] = below.splice(idxB, 1);
      below.unshift(item);
    }
  } else if (idxA >= 0) {
    if (direction === 'up') {
      if (idxA < above.length - 1) {
        const tmp = above[idxA];
        above[idxA] = above[idxA + 1];
        above[idxA + 1] = tmp;
      }
    } else if (direction === 'down') {
      if (idxA > 0) {
        const tmp = above[idxA];
        above[idxA] = above[idxA - 1];
        above[idxA - 1] = tmp;
      } else {
        const [item] = above.splice(idxA, 1);
        below.push(item);
      }
    } else if (direction === 'top') {
      const [item] = above.splice(idxA, 1);
      above.push(item);
    } else if (direction === 'bottom') {
      const [item] = above.splice(idxA, 1);
      if (below.length === 0) {
        above.unshift(item);
      } else {
        below.unshift(item);
      }
    } else if (direction === 'toBack') {
      const [item] = above.splice(idxA, 1);
      below.push(item);
    }
  }

  below.forEach((s, i) => {
    out[s.srcId] = -(below.length - i);
  });
  above.forEach((s, i) => {
    out[s.srcId] = i;
  });
  return out;
}

const BAND_ORDER: MaskDepthBand[] = [
  'belowOverlays',
  'behindPrimary',
  'abovePrimary',
  'aboveOverlays',
];

export function reorderMaskSlotsWithBands(
  slots: Array<{ srcId: string; z?: number; zLayer?: MaskDepthBand }>,
  targetSrcId: string,
  direction:
    | 'up'
    | 'down'
    | 'top'
    | 'bottom'
    | 'toFront'
    | 'toBack'
    | 'belowAll'
    | 'aboveAll'
): Record<string, { z: number; zLayer: MaskDepthBand }> {
  const sorted = sortSlotsByZ(slots);
  const out: Record<string, { z: number; zLayer: MaskDepthBand }> = {};
  const buckets: Record<MaskDepthBand, Array<{ srcId: string; z?: number; zLayer?: MaskDepthBand }>> = {
    belowOverlays: [],
    behindPrimary: [],
    abovePrimary: [],
    aboveOverlays: [],
  };
  let targetBand: MaskDepthBand = 'abovePrimary';
  let found = false;
  for (const s of sorted) {
    const b = resolveMaskDepthBand(s);
    buckets[b].push({ ...s, zLayer: b });
    if (String(s.srcId) === String(targetSrcId)) {
      targetBand = b;
      found = true;
    }
  }
  if (!found) {
    return setSlotDepthBand(sorted, targetSrcId, 'abovePrimary');
  }

  if (direction === 'belowAll') return setSlotDepthBand(sorted, targetSrcId, 'belowOverlays');
  if (direction === 'aboveAll') return setSlotDepthBand(sorted, targetSrcId, 'aboveOverlays');
  if (direction === 'toBack') return setSlotDepthBand(sorted, targetSrcId, 'behindPrimary');
  if (direction === 'toFront') return setSlotDepthBand(sorted, targetSrcId, 'abovePrimary');
  if (direction === 'top') {
    const arr = buckets[targetBand];
    const idx = arr.findIndex((s) => String(s.srcId) === String(targetSrcId));
    if (idx >= 0) {
      const [item] = arr.splice(idx, 1);
      buckets.aboveOverlays.push({ ...item, zLayer: 'aboveOverlays' });
    }
  } else if (direction === 'bottom') {
    const arr = buckets[targetBand];
    const idx = arr.findIndex((s) => String(s.srcId) === String(targetSrcId));
    if (idx >= 0) {
      const [item] = arr.splice(idx, 1);
      buckets.belowOverlays.unshift({ ...item, zLayer: 'belowOverlays' });
    }
  } else if (direction === 'up') {
    const arr = buckets[targetBand];
    const idx = arr.findIndex((s) => String(s.srcId) === String(targetSrcId));
    if (idx < arr.length - 1) {
      const tmp = arr[idx];
      arr[idx] = arr[idx + 1];
      arr[idx + 1] = tmp;
    } else {
      const bandIdx = BAND_ORDER.indexOf(targetBand);
      if (bandIdx < BAND_ORDER.length - 1) {
        const nextBand = BAND_ORDER[bandIdx + 1];
        const [item] = arr.splice(idx, 1);
        buckets[nextBand].unshift({ ...item, zLayer: nextBand });
      }
    }
  } else if (direction === 'down') {
    const arr = buckets[targetBand];
    const idx = arr.findIndex((s) => String(s.srcId) === String(targetSrcId));
    if (idx > 0) {
      const tmp = arr[idx];
      arr[idx] = arr[idx - 1];
      arr[idx - 1] = tmp;
    } else {
      const bandIdx = BAND_ORDER.indexOf(targetBand);
      if (bandIdx > 0) {
        const prevBand = BAND_ORDER[bandIdx - 1];
        const [item] = arr.splice(idx, 1);
        buckets[prevBand].push({ ...item, zLayer: prevBand });
      }
    }
  }

  const belowAll = [...buckets.belowOverlays, ...buckets.behindPrimary];
  const aboveAll = [...buckets.abovePrimary, ...buckets.aboveOverlays];
  buckets.belowOverlays.forEach((s) => {
    const i = belowAll.indexOf(s);
    out[s.srcId] = { z: -(belowAll.length - i), zLayer: 'belowOverlays' };
  });
  buckets.behindPrimary.forEach((s) => {
    const i = belowAll.indexOf(s);
    out[s.srcId] = { z: -(belowAll.length - i), zLayer: 'behindPrimary' };
  });
  buckets.abovePrimary.forEach((s) => {
    const i = aboveAll.indexOf(s);
    out[s.srcId] = { z: i, zLayer: 'abovePrimary' };
  });
  buckets.aboveOverlays.forEach((s) => {
    const i = aboveAll.indexOf(s);
    out[s.srcId] = { z: i, zLayer: 'aboveOverlays' };
  });
  return out;
}

export interface StageMaskHitResult {
  srcId: string;
  mode: 'move' | 'resize';
}

/**
 * Hit-tests VAP mask boxes in stage coordinates from front-most Z to back-most Z.
 * Detects bottom-right corner resize grip or interior drag move.
 */
export function hitTestMaskSlotsOnStage(
  slots: Array<{
    srcId: string;
    z?: number;
    defaultFrame?: [number, number, number, number];
    w?: number;
    h?: number;
  }>,
  stageX: number,
  stageY: number,
  opts?: { selectedSrcId?: string | null; handleRadius?: number }
): StageMaskHitResult | null {
  const frontToBack = sortSlotsByZ(slots).reverse();
  const baseRadius = Math.max(10, opts?.handleRadius ?? 18);

  // First check selected slot's corner resize handle even if slightly outside box edge
  if (opts?.selectedSrcId) {
    const sel = frontToBack.find((s) => String(s.srcId) === String(opts.selectedSrcId));
    if (sel) {
      const f = sel.defaultFrame || [0, 0, Math.max(8, sel.w || 100), Math.max(8, sel.h || 100)];
      const hx = f[0] + f[2];
      const hy = f[1] + f[3];
      if (Math.hypot(stageX - hx, stageY - hy) <= baseRadius * 1.25) {
        return { srcId: sel.srcId, mode: 'resize' };
      }
    }
  }

  for (const s of frontToBack) {
    const f = s.defaultFrame || [0, 0, Math.max(8, s.w || 100), Math.max(8, s.h || 100)];
    const [x, y, w, h] = f;
    const hx = x + w;
    const hy = y + h;
    if (Math.hypot(stageX - hx, stageY - hy) <= baseRadius) {
      return { srcId: s.srcId, mode: 'resize' };
    }
    if (stageX >= x && stageX <= x + w && stageY >= y && stageY <= y + h) {
      return { srcId: s.srcId, mode: 'move' };
    }
  }
  return null;
}

/**
 * Computes clamped [x, y, w, h] rect during mouse drag or corner resize on the stage.
 */
export function computeDraggedOrResizedMaskFrame(
  startFrame: [number, number, number, number],
  mode: 'move' | 'resize',
  dxStage: number,
  dyStage: number,
  stageW: number,
  stageH: number,
  keepAspectRatio = false
): [number, number, number, number] {
  const safeW = Math.max(16, Math.round(stageW));
  const safeH = Math.max(16, Math.round(stageH));
  const [sx, sy, sw, sh] = startFrame;

  if (mode === 'resize') {
    const maxW = Math.max(16, safeW - sx);
    const maxH = Math.max(16, safeH - sy);
    let nw = Math.max(16, Math.min(maxW, Math.round(sw + dxStage)));
    let nh = Math.max(16, Math.min(maxH, Math.round(sh + dyStage)));
    if (keepAspectRatio && sw > 0 && sh > 0) {
      const ratio = sw / sh;
      nh = Math.max(16, Math.min(maxH, Math.round(nw / ratio)));
      nw = Math.max(16, Math.min(maxW, Math.round(nh * ratio)));
    }
    return [sx, sy, nw, nh];
  }

  const nw = Math.max(16, Math.min(safeW, Math.round(sw)));
  const nh = Math.max(16, Math.min(safeH, Math.round(sh)));
  const nx = Math.max(0, Math.min(safeW - nw, Math.round(sx + dxStage)));
  const ny = Math.max(0, Math.min(safeH - nh, Math.round(sy + dyStage)));
  return [nx, ny, nw, nh];
}

/**
 * Converts a Project Composer layer bounding box (centerX/Y, drawWidth/Height)
 * into a clamped [x, y, w, h] rectangle in base project coordinates for VAP masks.
 */
export function composerLayerBoxToMaskFrame(
  box: { centerX: number; centerY: number; drawWidth: number; drawHeight: number },
  baseW: number,
  baseH: number
): [number, number, number, number] {
  const safeW = Math.max(16, Math.round(baseW));
  const safeH = Math.max(16, Math.round(baseH));
  const w = Math.max(16, Math.min(safeW, Math.round(box.drawWidth || 100)));
  const h = Math.max(16, Math.min(safeH, Math.round(box.drawHeight || 100)));
  const rawX = Math.round((box.centerX || safeW / 2) - w / 2);
  const rawY = Math.round((box.centerY || safeH / 2) - h / 2);
  const x = Math.max(0, Math.min(safeW - w, rawX));
  const y = Math.max(0, Math.min(safeH - h, rawY));
  return [x, y, w, h];
}

/**
 * Parses a hex fill color ('#rrggbb' or '#rgb') into RGB tuple, or returns null when transparent/unset.
 */
export function parseHexColorRgb(color?: string): [number, number, number] | null {
  const c = String(color || '').trim().toLowerCase();
  if (!c || c === 'transparent' || c === 'none') return null;
  if (/^#[0-9a-f]{6}$/.test(c)) {
    return [
      parseInt(c.slice(1, 3), 16),
      parseInt(c.slice(3, 5), 16),
      parseInt(c.slice(5, 7), 16),
    ];
  }
  if (/^#[0-9a-f]{3}$/.test(c)) {
    return [
      parseInt(c[1] + c[1], 16),
      parseInt(c[2] + c[2], 16),
      parseInt(c[3] + c[3], 16),
    ];
  }
  return null;
}

/**
 * Attenuates a white-on-black `mFrame` luminance RGBA buffer in-place by subtracting the opacity
 * of any foreground layers sitting in front of the mask (e.g., foreground flowers/crown or added SVGA frames).
 * Ensures replaced mask photos NEVER render on top of opaque foreground elements in any VAP/YYEVA player.
 */
export function attenuateMaskRgbaByForegroundAlpha(
  maskRgba: Uint8ClampedArray | Uint8Array,
  foregroundRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): void {
  const totalBytes = Math.min(maskRgba.length, foregroundRgba.length, width * height * 4);
  for (let i = 0; i < totalBytes; i += 4) {
    const fgAlpha = foregroundRgba[i + 3];
    if (fgAlpha <= 4) continue;
    const keepRatio = fgAlpha >= 250 ? 0 : (255 - fgAlpha) / 255;
    const r = Math.round(maskRgba[i] * keepRatio);
    const g = Math.round(maskRgba[i + 1] * keepRatio);
    const b = Math.round(maskRgba[i + 2] * keepRatio);
    maskRgba[i] = r;
    maskRgba[i + 1] = g;
    maskRgba[i + 2] = b;
    maskRgba[i + 3] = 255;
  }
}

/**
 * Builds an SVG Bezier `clipPath` string (`M ... C ... Z` / `M ... L ... Z`) in mask-local
 * coordinates (`0..width`, `0..height`) compatible with both browser `Path2D` and SVGA 2.0 `BezierPath`.
 * Preserves circular / rounded-rect / shield clipping when mask images are replaced later in SVGA players.
 */
export function buildSvgClipPathForMaskPreset(
  shape: VapMaskShapePreset | undefined,
  width: number,
  height: number,
  isTextSlot = false
): string | undefined {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const resolved =
    shape && shape !== 'customImage' ? shape : isTextSlot ? 'roundedRect' : 'circle';
  if (resolved === 'rect') {
    return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
  }
  const fmt = (n: number) => Number(n.toFixed(2));
  const kappa = 0.5522847498;
  if (resolved === 'circle') {
    const cx = w / 2;
    const cy = h / 2;
    const rx = Math.max(1, w / 2 - 1);
    const ry = Math.max(1, h / 2 - 1);
    const kx = rx * kappa;
    const ky = ry * kappa;
    return [
      `M ${fmt(cx)} ${fmt(cy - ry)}`,
      `C ${fmt(cx + kx)} ${fmt(cy - ry)} ${fmt(cx + rx)} ${fmt(cy - ky)} ${fmt(cx + rx)} ${fmt(cy)}`,
      `C ${fmt(cx + rx)} ${fmt(cy + ky)} ${fmt(cx + kx)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)}`,
      `C ${fmt(cx - kx)} ${fmt(cy + ry)} ${fmt(cx - rx)} ${fmt(cy + ky)} ${fmt(cx - rx)} ${fmt(cy)}`,
      `C ${fmt(cx - rx)} ${fmt(cy - ky)} ${fmt(cx - kx)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)}`,
      'Z',
    ].join(' ');
  }
  if (resolved === 'roundedRect') {
    const r = Math.min(w / 2, h / 2, Math.max(2, Math.round(Math.min(w, h) * 0.22)));
    const kr = r * kappa;
    return [
      `M ${fmt(r)} 0`,
      `L ${fmt(w - r)} 0`,
      `C ${fmt(w - r + kr)} 0 ${fmt(w)} ${fmt(r - kr)} ${fmt(w)} ${fmt(r)}`,
      `L ${fmt(w)} ${fmt(h - r)}`,
      `C ${fmt(w)} ${fmt(h - r + kr)} ${fmt(w - r + kr)} ${fmt(h)} ${fmt(w - r)} ${fmt(h)}`,
      `L ${fmt(r)} ${fmt(h)}`,
      `C ${fmt(r - kr)} ${fmt(h)} 0 ${fmt(h - r + kr)} 0 ${fmt(h - r)}`,
      `L 0 ${fmt(r)}`,
      `C 0 ${fmt(r - kr)} ${fmt(r - kr)} 0 ${fmt(r)} 0`,
      'Z',
    ].join(' ');
  }
  if (resolved === 'shield') {
    const cx = w / 2;
    const hw = Math.max(1, (w / 2 - 1) * 0.92);
    const left = cx - hw;
    const right = cx + hw;
    const midY = h * 0.5;
    const botY = h * 0.96;
    return [
      `M ${fmt(left)} 0`,
      `L ${fmt(right)} 0`,
      `L ${fmt(right)} ${fmt(midY)}`,
      `C ${fmt(right)} ${fmt(midY + (botY - midY) * 0.55)} ${fmt(cx + hw * 0.45)} ${fmt(botY * 0.9)} ${fmt(cx)} ${fmt(botY)}`,
      `C ${fmt(cx - hw * 0.45)} ${fmt(botY * 0.9)} ${fmt(left)} ${fmt(midY + (botY - midY) * 0.55)} ${fmt(left)} ${fmt(midY)}`,
      'Z',
    ].join(' ');
  }
  return undefined;
}

export interface SessionEditedSlotSnapshot {
  slot: CustomEditableVapSlot;
  replacement?: PersistedSlotReplacementData;
  geometryOverride?: Record<string, any>;
  customMaskDataUrl?: string;
}

export interface SessionMaskVaultState {
  guidesEnabled?: boolean;
  bakeReplacedSlots?: boolean;
  preserveMasksOnExport?: boolean;
  customSlots: CustomEditableVapSlot[];
  editedNativeSlotsByTag: Record<string, SessionEditedSlotSnapshot>;
  customMaskDataUrls: Record<string, string>;
  replacements: Record<string, PersistedSlotReplacementData>;
  slotGeometryOverrides: Record<string, Record<string, any>>;
}

export interface ReconciledSessionMasksResult {
  customSlots: CustomEditableVapSlot[];
  replacements: Record<string, PersistedSlotReplacementData>;
  customMaskDataUrls: Record<string, string>;
  slotGeometryOverrides: Record<string, Record<string, any>>;
  composerLinkRemaps: Record<string, string>;
  hasAnyRestoredEdits: boolean;
}

export function createEmptySessionMaskVault(): SessionMaskVaultState {
  return {
    guidesEnabled: false,
    bakeReplacedSlots: true,
    preserveMasksOnExport: true,
    customSlots: [],
    editedNativeSlotsByTag: {},
    customMaskDataUrls: {},
    replacements: {},
    slotGeometryOverrides: {},
  };
}

function normalizeTagKey(tag?: string): string {
  return String(tag || '').trim().toLowerCase();
}

function makeAssetKeyForSlot(srcId: string, srcTag: string): string {
  const safeTagSlug = String(srcTag || srcId).replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_') || srcId;
  return `mask_${srcId}_${safeTagSlug}`;
}

/**
 * Reconciles saved session mask edits (custom added masks, uploaded photos/texts,
 * custom PNG silhouettes, fill colors, shapes, positions, and depth bands) onto
 * a newly loaded primary source's native dynamic slots without colliding IDs or duplicating slots.
 */
export function reconcileSessionMasksOntoSource(
  vault: SessionMaskVaultState | null | undefined,
  nativeSlots: VapDynamicMaskSlot[]
): ReconciledSessionMasksResult {
  const outCustomSlots: CustomEditableVapSlot[] = [];
  const outReplacements: Record<string, PersistedSlotReplacementData> = {};
  const outCustomMaskDataUrls: Record<string, string> = {};
  const outGeometryOverrides: Record<string, Record<string, any>> = {};
  const composerLinkRemaps: Record<string, string> = {};

  if (!vault) {
    return {
      customSlots: outCustomSlots,
      replacements: outReplacements,
      customMaskDataUrls: outCustomMaskDataUrls,
      slotGeometryOverrides: outGeometryOverrides,
      composerLinkRemaps,
      hasAnyRestoredEdits: false,
    };
  }

  const nativeList = Array.isArray(nativeSlots) ? nativeSlots : [];
  const usedIds = new Set<string>(nativeList.map((s) => String(s.srcId)));
  const allocatedForIdGen: Array<{ srcId: string }> = nativeList.map((s) => ({ srcId: String(s.srcId) }));
  const matchedNativeIds = new Set<string>();
  let touched = false;

  const allocId = (preferredId: string): string => {
    const cleanPref = String(preferredId || '').trim();
    if (cleanPref && !usedIds.has(cleanPref)) {
      usedIds.add(cleanPref);
      allocatedForIdGen.push({ srcId: cleanPref });
      return cleanPref;
    }
    const nextId = buildNextSlotId(allocatedForIdGen);
    usedIds.add(nextId);
    allocatedForIdGen.push({ srcId: nextId });
    return nextId;
  };

  // 1. Reconcile edited native slots from previous primary files
  for (const snap of Object.values(vault.editedNativeSlotsByTag || {})) {
    if (!snap || !snap.slot) continue;
    const tagKey = normalizeTagKey(snap.slot.srcTag);
    const matchingNative = nativeList.find(
      (ns) => !matchedNativeIds.has(String(ns.srcId)) && normalizeTagKey(ns.srcTag) === tagKey
    );

    if (matchingNative) {
      matchedNativeIds.add(String(matchingNative.srcId));
      const nid = String(matchingNative.srcId);
      if (snap.replacement && (snap.replacement.active || snap.replacement.text || snap.replacement.fitMode || snap.replacement.useMask === false)) {
        outReplacements[nid] = { ...snap.replacement };
        touched = true;
      }
      if (snap.customMaskDataUrl) {
        outCustomMaskDataUrls[nid] = snap.customMaskDataUrl;
        touched = true;
      }
      if (snap.geometryOverride) {
        const nextOv: Record<string, any> = { ...snap.geometryOverride };
        // Keep new native file's defaultFrame unless user explicitly resized/moved the mask frame
        if (!nextOv.hasCustomFrame && Array.isArray(matchingNative.defaultFrame)) {
          nextOv.defaultFrame = [...matchingNative.defaultFrame];
          nextOv.w = matchingNative.w;
          nextOv.h = matchingNative.h;
        }
        outGeometryOverrides[nid] = nextOv;
        touched = true;
      }
      continue;
    }

    // No matching native slot on new primary file -> carry edited slot over as custom added mask
    const oldId = String(snap.slot.srcId);
    const finalId = allocId(oldId);
    if (finalId !== oldId && snap.slot.linkedComposerLayerId) {
      composerLinkRemaps[oldId] = finalId;
    }
    const cloned: CustomEditableVapSlot = {
      ...snap.slot,
      srcId: finalId,
      assetKey: makeAssetKeyForSlot(finalId, snap.slot.srcTag),
      isCustomAdded: true,
      hasCustomFrame: true,
    };
    outCustomSlots.push(cloned);
    if (snap.replacement) outReplacements[finalId] = { ...snap.replacement };
    if (snap.customMaskDataUrl) outCustomMaskDataUrls[finalId] = snap.customMaskDataUrl;
    if (snap.geometryOverride) outGeometryOverrides[finalId] = { ...snap.geometryOverride };
    touched = true;
  }

  // 2. Reconcile user-added custom mask slots
  for (const cs of vault.customSlots || []) {
    if (!cs) continue;
    const oldId = String(cs.srcId);
    const finalId = allocId(oldId);
    if (finalId !== oldId) {
      composerLinkRemaps[oldId] = finalId;
    }
    const cloned: CustomEditableVapSlot = {
      ...cs,
      srcId: finalId,
      assetKey: makeAssetKeyForSlot(finalId, cs.srcTag),
      isCustomAdded: true,
    };
    outCustomSlots.push(cloned);
    if (vault.replacements?.[oldId]) {
      outReplacements[finalId] = { ...vault.replacements[oldId] };
    }
    if (vault.customMaskDataUrls?.[oldId]) {
      outCustomMaskDataUrls[finalId] = vault.customMaskDataUrls[oldId];
    }
    if (vault.slotGeometryOverrides?.[oldId]) {
      outGeometryOverrides[finalId] = { ...vault.slotGeometryOverrides[oldId] };
    }
    touched = true;
  }

  return {
    customSlots: outCustomSlots,
    replacements: outReplacements,
    customMaskDataUrls: outCustomMaskDataUrls,
    slotGeometryOverrides: outGeometryOverrides,
    composerLinkRemaps,
    hasAnyRestoredEdits: touched,
  };
}




