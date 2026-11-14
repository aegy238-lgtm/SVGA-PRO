import {
  VapDynamicMaskSlot,
  VapFrameObjPlacement,
  VapYyevaMeta,
  resolveDynamicFramePlacements,
} from './vapYyevaDetection';

export type VapMaskShapePreset = 'rect' | 'roundedRect' | 'circle' | 'shield' | 'customImage';

export interface CustomEditableVapSlot extends VapDynamicMaskSlot {
  shapePreset?: VapMaskShapePreset;
  maskSilhouetteDataUrl?: string;
  isCustomAdded?: boolean;
  linkedComposerLayerId?: string;
  /** Optional mask layer fill color ('transparent' or '#rrggbb') */
  fillColor?: string;
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

  const slots = Array.isArray(opts.slots) ? opts.slots : [];
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
}

/**
 * Generates compliant Tencent VAP (`vapc`) or YYEVA (`yyev`/`yyeffectmp4json`) JSON
 * preserving dynamic mask declarations (`src`/`effect`) and per-frame placements (`frame`/`datas`).
 */
export function buildVapDynamicMetadataJson(opts: BuildVapMetadataOptions): {
  metaJson: Record<string, any>;
  srcMFrameAtFrame: Array<Record<string, [number, number, number, number]>>;
} {
  const { plan, nk, fps, start, end, srcFps, srcTotalFrames, srcW, srcH, sourceMeta } = opts;
  const { W, H, VW, VH, aFrame, rgbFrame, packedSlots, format } = plan;
  const hasMasks = packedSlots.length > 0;
  const isYyeva = format === 'yyeva';

  const srcMFrameAtFrame: Array<Record<string, [number, number, number, number]>> = [];
  const frameEntries: any[] = [];

  for (let k = 0; k < nk; k++) {
    const t = Math.min(start + (k + 0.5) / fps, end - 0.0001);
    const srcIdx = Math.max(0, Math.min(Math.max(0, srcTotalFrames - 1), Math.floor(t * srcFps)));
    const sourcePlacements = sourceMeta ? resolveDynamicFramePlacements(sourceMeta, srcIdx) : [];
    const byId = new Map<string, VapFrameObjPlacement>();
    for (const p of sourcePlacements) byId.set(p.srcId, p);

    const frameMMap: Record<string, [number, number, number, number]> = {};
    const objs: any[] = [];

    for (const packed of packedSlots) {
      const { slot, mFrame, targetFrame } = packed;
      const srcPlacement = byId.get(slot.srcId);
      const isOrigSourceFrame = Boolean(srcPlacement) && !slot.isCustomAdded;

      const resolvedFrame = isOrigSourceFrame && srcPlacement
        ? scaleRectForOutput(srcPlacement.frame, srcW, srcH, W, H)
        : targetFrame;

      if (srcPlacement && srcPlacement.mFrame[2] > 0 && srcPlacement.mFrame[3] > 0) {
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

    srcMFrameAtFrame.push(frameMMap);

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

  return { metaJson, srcMFrameAtFrame };
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

/**
 * Sorts dynamic slots in ascending painter's Z-order (lowest Z drawn first / behind, highest Z drawn last / on top).
 */
export function sortSlotsByZ<T extends { srcId: string; z?: number }>(slots: T[]): T[] {
  return [...slots]
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => {
      const za = Number.isFinite(Number(a.s.z)) ? Number(a.s.z) : a.idx;
      const zb = Number.isFinite(Number(b.s.z)) ? Number(b.s.z) : b.idx;
      if (za !== zb) return za - zb;
      return a.idx - b.idx;
    })
    .map((x) => x.s);
}

/**
 * Reorders a slot up (towards front/higher Z) or down (towards back/behind lower-Z masks).
 * Returns a clean `srcId -> z` integer map preserving contiguous Z indices starting from the lowest Z (e.g. -1 or 0).
 */
export function reorderMaskSlotsZ(
  slots: Array<{ srcId: string; z?: number }>,
  targetSrcId: string,
  direction: 'up' | 'down' | 'top' | 'bottom'
): Record<string, number> {
  const sorted = sortSlotsByZ(slots);
  const idx = sorted.findIndex((s) => String(s.srcId) === String(targetSrcId));
  const out: Record<string, number> = {};
  if (idx === -1) {
    sorted.forEach((s, i) => {
      out[s.srcId] = Number.isFinite(Number(s.z)) ? Number(s.z) : i;
    });
    return out;
  }

  const nextOrder = [...sorted];
  if (direction === 'up' && idx < nextOrder.length - 1) {
    const tmp = nextOrder[idx];
    nextOrder[idx] = nextOrder[idx + 1];
    nextOrder[idx + 1] = tmp;
  } else if (direction === 'down' && idx > 0) {
    const tmp = nextOrder[idx];
    nextOrder[idx] = nextOrder[idx - 1];
    nextOrder[idx - 1] = tmp;
  } else if (direction === 'top') {
    const [item] = nextOrder.splice(idx, 1);
    nextOrder.push(item);
  } else if (direction === 'bottom') {
    const [item] = nextOrder.splice(idx, 1);
    nextOrder.unshift(item);
  }

  // Assign contiguous integers (preserving any negative base if any slot had z < 0, otherwise 0..N-1)
  const hadNegative = sorted.some((s) => (s.z ?? 0) < 0);
  const minBase = hadNegative
    ? Math.min(...sorted.map((s) => (Number.isFinite(Number(s.z)) ? Number(s.z) : 0)))
    : 0;
  nextOrder.forEach((s, i) => {
    out[s.srcId] = minBase + i;
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


