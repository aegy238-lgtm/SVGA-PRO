import { SvgaFrame, SvgaMovie, SvgaSprite, kb, pm } from './codecs.ts';

export type AffineMatrix = [number, number, number, number, number, number];

export interface LayerTransform {
  x: number;
  y: number;
  sx: number; // percentage, e.g. 100
  sy: number; // percentage, e.g. 100
  rotation: number; // degrees, e.g. 0
  opacity: number; // percentage, e.g. 100
}

export type AnimatableProperty = 'position' | 'scale' | 'rotation' | 'opacity';

export interface LayerPropertyKeyframes {
  position?: Record<number, { x: number; y: number }>;
  scale?: Record<number, { sx: number; sy: number }>;
  rotation?: Record<number, number>;
  opacity?: Record<number, number>;
}

export interface SpriteFrameRange {
  inFrame: number;
  outFrame: number;
  offsetFrames: number;
}

export const DEFAULT_TRANSFORM: LayerTransform = {
  x: 0,
  y: 0,
  sx: 100,
  sy: 100,
  rotation: 0,
  opacity: 100,
};

export function composeAffineTransform(
  x: number,
  y: number,
  sxPct: number,
  syPct: number,
  rotationDeg: number
): AffineMatrix {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = sxPct / 100;
  const sy = syPct / 100;
  const a = Number((cos * sx).toFixed(6));
  const b = Number((sin * sx).toFixed(6));
  const c = Number((-sin * sy).toFixed(6));
  const d = Number((cos * sy).toFixed(6));
  return [a, b, c, d, x, y];
}

export function decomposeAffineTransform(
  t: number[] = [1, 0, 0, 1, 0, 0],
  alpha = 1
): LayerTransform {
  const [a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0] = t;
  const sx = Math.hypot(a, b);
  const sy = Math.hypot(c, d);
  const rotation = (Math.atan2(b, a) * 180) / Math.PI;
  return {
    x: Number(tx.toFixed(2)),
    y: Number(ty.toFixed(2)),
    sx: Number((sx * 100).toFixed(1)),
    sy: Number((sy * 100).toFixed(1)),
    rotation: Number(rotation.toFixed(1)),
    opacity: Math.round(Math.max(0, Math.min(1, alpha)) * 100),
  };
}

export function multiplyAffine(m1: AffineMatrix, m2: AffineMatrix): AffineMatrix {
  const [a1, b1, c1, d1, tx1, ty1] = m1;
  const [a2, b2, c2, d2, tx2, ty2] = m2;
  return [
    Number((a1 * a2 + c1 * b2).toFixed(6)),
    Number((b1 * a2 + d1 * b2).toFixed(6)),
    Number((a1 * c2 + c1 * d2).toFixed(6)),
    Number((b1 * c2 + d1 * d2).toFixed(6)),
    Number((a1 * tx2 + c1 * ty2 + tx1).toFixed(4)),
    Number((b1 * tx2 + d1 * ty2 + ty1).toFixed(4)),
  ];
}

export function invertAffine(m: AffineMatrix): AffineMatrix | null {
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-8) return null;
  const invDet = 1 / det;
  const na = d * invDet;
  const nb = -b * invDet;
  const nc = -c * invDet;
  const nd = a * invDet;
  const ntx = -(na * tx + nc * ty);
  const nty = -(nb * tx + nd * ty);
  return [na, nb, nc, nd, ntx, nty];
}

export function buildPivotTransformMatrix(
  pivotX: number,
  pivotY: number,
  originX: number,
  originY: number,
  lt: LayerTransform
): AffineMatrix {
  const rad = (lt.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = lt.sx / 100;
  const sy = lt.sy / 100;
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  const tx = a * -originX + c * -originY + pivotX + lt.x;
  const ty = b * -originX + d * -originY + pivotY + lt.y;
  return [
    Number(a.toFixed(6)),
    Number(b.toFixed(6)),
    Number(c.toFixed(6)),
    Number(d.toFixed(6)),
    Number(tx.toFixed(4)),
    Number(ty.toFixed(4)),
  ];
}

export function isIdentityLayerTransform(lt?: LayerTransform): boolean {
  if (!lt) return true;
  return (
    Math.abs(lt.x) < 1e-4 &&
    Math.abs(lt.y) < 1e-4 &&
    Math.abs(lt.sx - 100) < 1e-4 &&
    Math.abs(lt.sy - 100) < 1e-4 &&
    Math.abs(lt.rotation) < 1e-4 &&
    Math.abs(lt.opacity - 100) < 1e-4
  );
}

export function computeSpriteFrameMatrix(
  f: SvgaFrame,
  assetW: number,
  assetH: number,
  canvasW: number,
  canvasH: number,
  lt: LayerTransform = DEFAULT_TRANSFORM,
  docT: LayerTransform = DEFAULT_TRANSFORM
): AffineMatrix {
  const mOrig: AffineMatrix = [
    f.t?.[0] ?? 1,
    f.t?.[1] ?? 0,
    f.t?.[2] ?? 0,
    f.t?.[3] ?? 1,
    f.t?.[4] ?? 0,
    f.t?.[5] ?? 0,
  ];
  let m = mOrig;
  if (!isIdentityLayerTransform(lt)) {
    const fw = f.w > 0 ? f.w : assetW;
    const fh = f.h > 0 ? f.h : assetH;
    const lx = (f.x || 0) + fw / 2;
    const ly = (f.y || 0) + fh / 2;
    const cx = mOrig[0] * lx + mOrig[2] * ly + mOrig[4];
    const cy = mOrig[1] * lx + mOrig[3] * ly + mOrig[5];
    const mLayer = buildPivotTransformMatrix(cx, cy, cx, cy, lt);
    m = multiplyAffine(mLayer, mOrig);
  }
  if (!isIdentityLayerTransform(docT)) {
    const mDoc = buildPivotTransformMatrix(
      canvasW / 2,
      canvasH / 2,
      canvasW / 2,
      canvasH / 2,
      docT
    );
    m = multiplyAffine(mDoc, m);
  }
  return m;
}

export function computeAddedLayerFrameMatrix(
  width: number,
  height: number,
  canvasW: number,
  canvasH: number,
  lt: LayerTransform = DEFAULT_TRANSFORM,
  docT: LayerTransform = DEFAULT_TRANSFORM
): AffineMatrix {
  const mLayer = buildPivotTransformMatrix(
    canvasW / 2,
    canvasH / 2,
    width / 2,
    height / 2,
    lt
  );
  if (isIdentityLayerTransform(docT)) return mLayer;
  const mDoc = buildPivotTransformMatrix(
    canvasW / 2,
    canvasH / 2,
    canvasW / 2,
    canvasH / 2,
    docT
  );
  return multiplyAffine(mDoc, mLayer);
}

function interpolateScalarMap(
  map: Record<number, number> | undefined,
  fallback: number,
  frame: number
): number {
  if (!map) return fallback;
  const keys = Object.keys(map)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (keys.length === 0) return fallback;
  if (map[frame] !== undefined) return map[frame];
  if (frame <= keys[0]) return map[keys[0]];
  if (frame >= keys[keys.length - 1]) return map[keys[keys.length - 1]];
  let p = keys[0];
  let n = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (frame >= keys[i] && frame <= keys[i + 1]) {
      p = keys[i];
      n = keys[i + 1];
      break;
    }
  }
  const t = (frame - p) / Math.max(1, n - p);
  return Number((map[p] + (map[n] - map[p]) * t).toFixed(2));
}

function interpolatePairMap<T extends Record<string, number>>(
  map: Record<number, T> | undefined,
  fallback: T,
  frame: number,
  k1: keyof T,
  k2: keyof T
): T {
  if (!map) return fallback;
  const keys = Object.keys(map)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (keys.length === 0) return fallback;
  if (map[frame] !== undefined) return map[frame];
  if (frame <= keys[0]) return map[keys[0]];
  if (frame >= keys[keys.length - 1]) return map[keys[keys.length - 1]];
  let p = keys[0];
  let n = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (frame >= keys[i] && frame <= keys[i + 1]) {
      p = keys[i];
      n = keys[i + 1];
      break;
    }
  }
  const t = (frame - p) / Math.max(1, n - p);
  const a = map[p];
  const b = map[n];
  return {
    ...fallback,
    [k1]: Number((a[k1] + (b[k1] - a[k1]) * t).toFixed(2)),
    [k2]: Number((a[k2] + (b[k2] - a[k2]) * t).toFixed(2)),
  };
}

/**
 * Interpolates a LayerTransform at `frame` from either per-property keyframes (`LayerPropertyKeyframes`)
 * or legacy full-transform keyframes (`Record<number, LayerTransform>`).
 */
export function interpolateLayerTransform(
  base: LayerTransform,
  keyframesOrProps:
    | Record<number, LayerTransform>
    | LayerPropertyKeyframes
    | undefined,
  frame: number
): LayerTransform {
  if (!keyframesOrProps) return base;

  // Check if it is a LayerPropertyKeyframes object
  if (
    'position' in keyframesOrProps ||
    'scale' in keyframesOrProps ||
    'rotation' in keyframesOrProps ||
    'opacity' in keyframesOrProps
  ) {
    const pkf = keyframesOrProps as LayerPropertyKeyframes;
    const pos = interpolatePairMap(
      pkf.position,
      { x: base.x, y: base.y },
      frame,
      'x',
      'y'
    );
    const scl = interpolatePairMap(
      pkf.scale,
      { sx: base.sx, sy: base.sy },
      frame,
      'sx',
      'sy'
    );
    const rot = interpolateScalarMap(pkf.rotation, base.rotation, frame);
    const opa = Math.round(interpolateScalarMap(pkf.opacity, base.opacity, frame));
    return {
      x: pos.x,
      y: pos.y,
      sx: scl.sx,
      sy: scl.sy,
      rotation: rot,
      opacity: opa,
    };
  }

  const keyframesByFrame = keyframesOrProps as Record<number, LayerTransform>;
  const frames = Object.keys(keyframesByFrame)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (frames.length === 0) return base;
  if (keyframesByFrame[frame]) return keyframesByFrame[frame];
  if (frame <= frames[0]) return keyframesByFrame[frames[0]];
  if (frame >= frames[frames.length - 1]) return keyframesByFrame[frames[frames.length - 1]];

  let prevF = frames[0];
  let nextF = frames[frames.length - 1];
  for (let i = 0; i < frames.length - 1; i++) {
    if (frame >= frames[i] && frame <= frames[i + 1]) {
      prevF = frames[i];
      nextF = frames[i + 1];
      break;
    }
  }
  const span = Math.max(1, nextF - prevF);
  const t = (frame - prevF) / span;
  const a = keyframesByFrame[prevF];
  const b = keyframesByFrame[nextF];
  const lerp = (v1: number, v2: number) => Number((v1 + (v2 - v1) * t).toFixed(2));
  return {
    x: lerp(a.x, b.x),
    y: lerp(a.y, b.y),
    sx: lerp(a.sx, b.sx),
    sy: lerp(a.sy, b.sy),
    rotation: lerp(a.rotation, b.rotation),
    opacity: Math.round(lerp(a.opacity, b.opacity)),
  };
}

export interface SpriteFrameSpan {
  firstFrame: number;
  lastFrame: number;
  activeCount: number;
  isStatic: boolean;
}

export function computeSpriteFrameSpan(s: SvgaSprite, totalFrames: number): SpriteFrameSpan {
  let first = -1;
  let last = -1;
  let activeCount = 0;
  let firstMat: number[] | null = null;
  let hasMotion = false;

  const len = Math.min(totalFrames, s.fr.length);
  for (let i = 0; i < len; i++) {
    const f = s.fr[i];
    if (!f) continue;
    const visible = f.a > 0.001 || (f.shapesRaw && f.shapesRaw.length > 0);
    if (visible) {
      if (first === -1) first = i;
      last = i;
      activeCount++;
      if (!firstMat) {
        firstMat = [...(f.t || [1, 0, 0, 1, 0, 0]), f.a];
      } else if (!hasMotion) {
        const curMat = [...(f.t || [1, 0, 0, 1, 0, 0]), f.a];
        if (curMat.some((v, idx) => Math.abs(v - firstMat![idx]) > 0.005)) {
          hasMotion = true;
        }
      }
    }
  }
  return {
    firstFrame: first === -1 ? 0 : first,
    lastFrame: last === -1 ? Math.max(0, totalFrames - 1) : last,
    activeCount,
    isStatic: activeCount > 0 && !hasMotion,
  };
}

/**
 * Resolves the source SvgaFrame for a sprite at timeline frame `frame`
 * accounting for user timeline trimming (`inFrame`, `outFrame`) and time shifting (`offsetFrames`).
 */
export function resolveSpriteFrameAt(
  sp: SvgaSprite,
  frame: number,
  totalFrames: number,
  customRange?: SpriteFrameRange,
  origSpan?: SpriteFrameSpan
): { frameObj: SvgaFrame | null; visible: boolean } {
  if (!customRange) {
    const f = sp.fr[frame] || null;
    if (!f) return { frameObj: null, visible: false };
    const vis = f.a > 0.001 || Boolean(f.shapesRaw && f.shapesRaw.length > 0);
    return { frameObj: f, visible: vis };
  }

  if (frame < customRange.inFrame || frame > customRange.outFrame) {
    return { frameObj: null, visible: false };
  }

  const span = origSpan || computeSpriteFrameSpan(sp, totalFrames);
  let srcIdx = frame - (customRange.offsetFrames || 0);
  if (srcIdx < span.firstFrame) srcIdx = span.firstFrame;
  if (srcIdx > span.lastFrame) srcIdx = span.lastFrame;
  srcIdx = Math.max(0, Math.min(sp.fr.length - 1, srcIdx));

  const f = sp.fr[srcIdx] || sp.fr[span.firstFrame] || null;
  if (!f) return { frameObj: null, visible: false };
  const vis = f.a > 0.001 || Boolean(f.shapesRaw && f.shapesRaw.length > 0);
  return { frameObj: f, visible: vis };
}

export interface AssetStat {
  key: string;
  bytes: number;
  sizeLabel: string;
  format: string;
  usedByIndices: number[];
  usedBySpriteIndices: number[];
  usedByLabel: string;
  usageCount: number;
}

export function computeAssetUsage(movie: SvgaMovie): {
  assets: AssetStat[];
  totalBytes: number;
  usedCount: number;
  unusedCount: number;
} {
  const keys = Object.keys(movie.im);
  let totalBytes = 0;

  const usageMap = new Map<string, { display: number[]; raw: number[] }>();
  movie.sp.forEach((sp, idx) => {
    if (!sp.key) return;
    const hasVisibleFrame = sp.fr.some((f) => f.a > 0.001);
    if (hasVisibleFrame || sp.fr.length > 0) {
      const entry = usageMap.get(sp.key) || { display: [], raw: [] };
      const displayIdx = Math.max(1, movie.sp.length - idx);
      entry.display.push(displayIdx);
      entry.raw.push(idx);
      usageMap.set(sp.key, entry);
    }
  });

  const assets: AssetStat[] = keys.map((key) => {
    const raw = movie.im[key];
    const bytes = raw ? raw.byteLength : 0;
    totalBytes += bytes;
    const fmt =
      raw && raw[0] === 0xff
        ? 'JPG'
        : raw && raw[0] === 0x52
          ? 'WEBP'
          : raw && raw[0] === 0x47
            ? 'GIF'
            : 'PNG';
    const entry = usageMap.get(key) || { display: [], raw: [] };
    return {
      key,
      bytes,
      sizeLabel: (bytes / 1024).toFixed(1) + ' KB',
      format: fmt,
      usedByIndices: entry.display,
      usedBySpriteIndices: entry.raw,
      usedByLabel:
        entry.display.length > 0 ? `used by #${entry.display.join(', #')}` : 'unused',
      usageCount: entry.display.length,
    };
  });

  const usedCount = assets.filter((a) => a.usageCount > 0).length;
  const unusedCount = assets.length - usedCount;
  return { assets, totalBytes, usedCount, unusedCount };
}

export interface DecomposedExtraLayer {
  id: string;
  assetKey: string;
  name: string;
  pngBytes: Uint8Array;
  width: number;
  height: number;
  transform: LayerTransform;
  inFrame?: number;
  outFrame?: number;
}

export interface SerializeDecomposedOptions {
  docTransform?: LayerTransform;
  spriteTransforms?: Record<string, LayerTransform>;
  layerKeyframes?: Record<
    string,
    Record<number, LayerTransform> | LayerPropertyKeyframes
  >;
  spriteFrameRanges?: Record<string, SpriteFrameRange>;
  hiddenLayerIds?: Set<string>;
  deletedSpriteIndices?: Set<number>;
  assetDimensions?: Record<string, { w: number; h: number }>;
  extraLayers?: DecomposedExtraLayer[];
}

export function serializeDecomposedSvga(
  movie: SvgaMovie,
  options: SerializeDecomposedOptions = {}
): Uint8Array {
  const W = Math.max(1, Math.round(movie.w || 300));
  const H = Math.max(1, Math.round(movie.h || 300));
  const fps = Math.max(1, Math.round(movie.fps || 20));
  const n = Math.max(1, Math.round(movie.n || 1));

  const docBase = options.docTransform || DEFAULT_TRANSFORM;
  const spriteTransforms = options.spriteTransforms || {};
  const layerKeyframes = options.layerKeyframes || {};
  const spriteFrameRanges = options.spriteFrameRanges || {};
  const hiddenIds = options.hiddenLayerIds || new Set<string>();
  const deletedSprites = options.deletedSpriteIndices || new Set<number>();
  const assetDims = options.assetDimensions || {};
  const extraLayers = options.extraLayers || [];

  const TE = new TextEncoder();
  const cat = (arr: Uint8Array[]): Uint8Array => {
    let total = 0;
    for (const x of arr) total += x.length;
    const out = new Uint8Array(total);
    let p = 0;
    for (const x of arr) {
      out.set(x, p);
      p += x.length;
    }
    return out;
  };
  const pv = (num: number): Uint8Array => {
    const o: number[] = [];
    let v = Math.max(0, Math.floor(num));
    while (v > 127) {
      o.push((v & 127) | 128);
      v = Math.floor(v / 128);
    }
    o.push(v);
    return Uint8Array.from(o);
  };
  const pf = (field: number, val: number): Uint8Array =>
    cat([pv((field << 3) | 5), new Uint8Array(new Float32Array([val]).buffer)]);
  const pi = (field: number, val: number): Uint8Array => cat([pv(field << 3), pv(val)]);
  const pb = (field: number, data: Uint8Array): Uint8Array =>
    cat([pv((field << 3) | 2), pv(data.length), data]);
  const ps = (field: number, str: string): Uint8Array => pb(field, TE.encode(str));

  const parts: Uint8Array[] = [
    ps(1, '2.0.0'),
    pb(2, cat([pf(1, W), pf(2, H), pi(3, fps), pi(4, n)])),
  ];

  // 1. Decomposed Images map (field 3)
  const finalImages: Record<string, Uint8Array> = { ...movie.im };
  for (const ex of extraLayers) {
    if (hiddenIds.has(ex.id)) continue;
    finalImages[ex.assetKey] = ex.pngBytes;
  }
  for (const [key, bytes] of Object.entries(finalImages)) {
    if (!bytes || bytes.length === 0) continue;
    parts.push(pb(3, cat([ps(1, key), pb(2, bytes)])));
  }

  // 2. Original Decomposed SpriteEntity tracks (field 4)
  movie.sp.forEach((sp, idx) => {
    if (deletedSprites.has(idx)) return;
    const spriteId = `sprite_${idx}`;
    const isHidden = hiddenIds.has(spriteId);
    const baseLt =
      spriteTransforms[spriteId] ||
      (sp.key && spriteTransforms[sp.key]) ||
      DEFAULT_TRANSFORM;
    const dim = (sp.key && assetDims[sp.key]) || { w: W, h: H };
    const customRange = spriteFrameRanges[spriteId];
    const origSpan = computeSpriteFrameSpan(sp, n);

    const frameMsgs: Uint8Array[] = [];
    for (let i = 0; i < n; i++) {
      const resolved = resolveSpriteFrameAt(sp, i, n, customRange, origSpan);
      const origF: SvgaFrame = resolved.frameObj || {
        a: 0,
        x: 0,
        y: 0,
        w: dim.w,
        h: dim.h,
        t: [1, 0, 0, 1, 0, 0],
      };
      const docT = interpolateLayerTransform(docBase, layerKeyframes['DOCUMENT'], i);
      const lt = interpolateLayerTransform(
        baseLt,
        layerKeyframes[spriteId] || (sp.key ? layerKeyframes[sp.key] : undefined),
        i
      );

      const finalAlpha =
        isHidden || !resolved.visible
          ? 0
          : Math.max(0, Math.min(1, (origF.a ?? 0) * (docT.opacity / 100) * (lt.opacity / 100)));

      const fw = origF.w > 0 ? origF.w : dim.w;
      const fh = origF.h > 0 ? origF.h : dim.h;
      const fx = origF.x || 0;
      const fy = origF.y || 0;

      const mat = computeSpriteFrameMatrix(origF, dim.w, dim.h, W, H, lt, docT);

      const frameFields: Uint8Array[] = [
        pf(1, finalAlpha),
        pb(2, cat([pf(1, fx), pf(2, fy), pf(3, fw), pf(4, fh)])),
        pb(
          3,
          cat([
            pf(1, mat[0]),
            pf(2, mat[1]),
            pf(3, mat[2]),
            pf(4, mat[3]),
            pf(5, mat[4]),
            pf(6, mat[5]),
          ])
        ),
      ];
      if (origF.clipPath) {
        frameFields.push(ps(4, origF.clipPath));
      }
      if (origF.shapesRaw && origF.shapesRaw.length > 0 && resolved.visible && !isHidden) {
        for (const rawShape of origF.shapesRaw) {
          frameFields.push(pb(5, rawShape));
        }
      }
      frameMsgs.push(pb(2, cat(frameFields)));
    }

    const spriteFields: Uint8Array[] = [];
    if (sp.key) spriteFields.push(ps(1, sp.key));
    spriteFields.push(...frameMsgs);
    if (sp.mk) spriteFields.push(ps(3, sp.mk));
    parts.push(pb(4, cat(spriteFields)));
  });

  // 3. Added Decomposed SpriteEntity tracks
  for (const ex of extraLayers) {
    if (hiddenIds.has(ex.id)) continue;
    const inF = ex.inFrame ?? 0;
    const outF = ex.outFrame ?? n - 1;
    const frameMsgs: Uint8Array[] = [];

    for (let i = 0; i < n; i++) {
      const docT = interpolateLayerTransform(docBase, layerKeyframes['DOCUMENT'], i);
      const lt = interpolateLayerTransform(ex.transform, layerKeyframes[ex.id], i);
      const inRange = i >= inF && i <= outF;
      const finalAlpha = inRange
        ? Math.max(0, Math.min(1, (lt.opacity / 100) * (docT.opacity / 100)))
        : 0;
      const mat = computeAddedLayerFrameMatrix(ex.width, ex.height, W, H, lt, docT);
      const layMsg = pb(2, cat([pf(1, 0), pf(2, 0), pf(3, ex.width), pf(4, ex.height)]));
      const trMsg = pb(
        3,
        cat([
          pf(1, mat[0]),
          pf(2, mat[1]),
          pf(3, mat[2]),
          pf(4, mat[3]),
          pf(5, mat[4]),
          pf(6, mat[5]),
        ])
      );
      frameMsgs.push(pb(2, cat([pf(1, finalAlpha), layMsg, trMsg])));
    }
    parts.push(pb(4, cat([ps(1, ex.assetKey), ...frameMsgs])));
  }

  // 4. Preserve original AudioEntity messages (field 5)
  if (movie.audiosRaw && movie.audiosRaw.length > 0) {
    for (const rawAudio of movie.audiosRaw) {
      parts.push(pb(5, rawAudio));
    }
  }

  return cat(parts);
}

export interface ParsedSvgaShape {
  type: number;
  pathD?: string;
  rect?: { x: number; y: number; w: number; h: number; cr: number };
  ellipse?: { x: number; y: number; rx: number; ry: number };
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  transform?: AffineMatrix;
}

export function parseSvgaShapeEntity(raw: Uint8Array): ParsedSvgaShape {
  const TD = new TextDecoder();
  const out: ParsedSvgaShape = { type: 0 };
  const rgbaToCss = (buf: Uint8Array): string => {
    let r = 0,
      g = 0,
      b = 0,
      a = 1;
    pm(buf, (f, q) => {
      if (f === 1) r = q.f32();
      else if (f === 2) g = q.f32();
      else if (f === 3) b = q.f32();
      else if (f === 4) a = q.f32();
      else return 0;
      return 1;
    });
    const to255 = (v: number) =>
      Math.max(0, Math.min(255, Math.round(v <= 1.001 ? v * 255 : v)));
    const alpha = Math.max(0, Math.min(1, a <= 1.001 ? a : a / 255));
    return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${alpha.toFixed(3)})`;
  };

  pm(raw, (f, r) => {
    if (f === 1) {
      out.type = r.vi();
      return 1;
    }
    if (f === 2) {
      pm(r.by(), (g, q) => {
        if (g === 1) {
          out.pathD = TD.decode(q.by());
          return 1;
        }
        return 0;
      });
      return 1;
    }
    if (f === 3) {
      const rect = { x: 0, y: 0, w: 0, h: 0, cr: 0 };
      pm(r.by(), (g, q) => {
        if (g === 1) rect.x = q.f32();
        else if (g === 2) rect.y = q.f32();
        else if (g === 3) rect.w = q.f32();
        else if (g === 4) rect.h = q.f32();
        else if (g === 5) rect.cr = q.f32();
        else return 0;
        return 1;
      });
      out.rect = rect;
      return 1;
    }
    if (f === 4) {
      const el = { x: 0, y: 0, rx: 0, ry: 0 };
      pm(r.by(), (g, q) => {
        if (g === 1) el.x = q.f32();
        else if (g === 2) el.y = q.f32();
        else if (g === 3) el.rx = q.f32();
        else if (g === 4) el.ry = q.f32();
        else return 0;
        return 1;
      });
      out.ellipse = el;
      return 1;
    }
    if (f === 5) {
      pm(r.by(), (g, q) => {
        if (g === 1) out.fill = rgbaToCss(q.by());
        else if (g === 2) out.stroke = rgbaToCss(q.by());
        else if (f === 5 && g === 3) out.strokeWidth = q.f32();
        else return 0;
        return 1;
      });
      return 1;
    }
    if (f === 6) {
      const t: AffineMatrix = [0, 0, 0, 0, 0, 0];
      pm(r.by(), (g, q) => {
        if (g >= 1 && g <= 6) t[g - 1] = q.f32();
        else return 0;
        return 1;
      });
      out.transform = t;
      return 1;
    }
    return 0;
  });
  return out;
}

export function generateTimeRulerMarks(durationSec: number, frames: number, fps: number): string[] {
  if (durationSec <= 0 || fps <= 0) return ['0.00s'];
  const marks: string[] = [];
  // Choose a clean step so long animations (e.g., 10s) don't overcrowd the ruler
  const step = durationSec > 6 ? 0.5 : 0.25;
  for (let t = 0; t < durationSec - 0.01; t += step) {
    marks.push(t.toFixed(2) + 's');
  }
  const lastFrameTime = Math.max(0, (frames - 1) / fps);
  const lastLabel = lastFrameTime.toFixed(2) + 's';
  if (marks[marks.length - 1] !== lastLabel) {
    marks.push(lastLabel);
  }
  return marks;
}

export function formatBytesMb(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
  return kb(bytes);
}

export function generateAfterEffectsJsxScript(
  docName: string,
  w: number,
  h: number,
  fps: number,
  frames: number,
  layers: {
    name: string;
    x: number;
    y: number;
    sx: number;
    sy: number;
    rotation: number;
    opacity: number;
  }[]
): string {
  const dur = (frames / Math.max(1, fps)).toFixed(3);
  const layerLines = layers
    .slice(0, 150)
    .map(
      (l, idx) =>
        `  // Layer ${idx + 1}: ${l.name}\n` +
        `  var solid_${idx} = comp.layers.addSolid([0.48, 0.36, 1.0], ${JSON.stringify(l.name)}, ${w}, ${h}, 1.0, ${dur});\n` +
        `  solid_${idx}.property("ADBE Transform Group").property("ADBE Position").setValue([${w / 2 + l.x}, ${h / 2 + l.y}]);\n` +
        `  solid_${idx}.property("ADBE Transform Group").property("ADBE Scale").setValue([${l.sx}, ${l.sy}]);\n` +
        `  solid_${idx}.property("ADBE Transform Group").property("ADBE Rotate Z").setValue(${l.rotation});\n` +
        `  solid_${idx}.property("ADBE Transform Group").property("ADBE Opacity").setValue(${l.opacity});`
    )
    .join('\n\n');

  return `/**
 * MotionTools SVGA AE Plugin & Decomposed Layer Bridge (ExtendScript .jsx)
 * Document: ${docName}
 * Canvas: ${w}x${h} @ ${fps} fps (${frames} frames, ${dur}s)
 * Decomposed Layers: ${layers.length}
 *
 * Run in Adobe After Effects via: File > Scripts > Run Script File...
 */
(function(thisObj) {
  function buildUI(thisObj) {
    var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", "MotionTools SVGA AE Plugin", undefined, {resizeable: true});
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 8;
    win.margins = 14;

    var hdr = win.add("statictext", undefined, "MotionTools · SVGA 2.0 Decomposed After Effects Exporter");
    var info = win.add("statictext", undefined, "Target: ${docName} (${w}x${h} · ${fps} fps · ${frames} frames · ${layers.length} layers)");

    var btnCreate = win.add("button", undefined, "1. Build Decomposed SVGA Composition in After Effects");
    var btnExport = win.add("button", undefined, "2. Export Active Comp to MotionTools SVGA");

    btnCreate.onClick = function() {
      app.beginUndoGroup("MotionTools Build SVGA Comp");
      var comp = app.project.items.addComp(${JSON.stringify(docName)}, ${w}, ${h}, 1.0, ${dur}, ${fps});
${layerLines}
      comp.openInViewer();
      app.endUndoGroup();
      alert("SVGA Composition '" + comp.name + "' created with ${layers.length} decomposed layer(s).");
    };

    btnExport.onClick = function() {
      var comp = app.project.activeItem;
      if (!comp || !(comp instanceof CompItem)) {
        alert("Please select an active Composition first.");
        return;
      }
      var out = File.saveDialog("Save MotionTools AE Keyframe JSON", "*.json");
      if (!out) return;
      out.open("w");
      out.write('{"generator":"MotionTools-AE-Plugin","name":"' + comp.name + '","w":' + comp.width + ',"h":' + comp.height + ',"fps":' + comp.frameRate + ',"frames":' + Math.round(comp.duration * comp.frameRate) + '}');
      out.close();
      alert("Exported composition metadata to " + out.fsName);
    };

    win.layout.layout(true);
    return win;
  }

  var palette = buildUI(thisObj);
  if (palette instanceof Window) {
    palette.center();
    palette.show();
  }
})(this);
`;
}
