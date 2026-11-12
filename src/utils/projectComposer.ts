export interface ProjectLayerTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipH: boolean;
  flipV: boolean;
  visible: boolean;
}

export type OverlayZOrder = 'above' | 'below';
export type OverlayFitMode = 'contain' | 'cover' | 'stretch' | 'original';
export type OverlayAlphaMode = 'auto' | 'none' | 'right' | 'left';

export interface SecondaryOverlayLayer {
  id: string;
  name: string;
  format: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  duration: number;
  zOrder: OverlayZOrder;
  fitMode: OverlayFitMode;
  alphaMode: OverlayAlphaMode;
  transform: ProjectLayerTransform;
}

export interface ProjectComposerState {
  primaryTransform: ProjectLayerTransform;
  overlays: SecondaryOverlayLayer[];
  activeTargetId: 'primary' | string;
  directDragEnabled: boolean;
}

export const DEFAULT_LAYER_TRANSFORM: ProjectLayerTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 100,
  rotation: 0,
  opacity: 100,
  flipH: false,
  flipV: false,
  visible: true,
};

export const INITIAL_PROJECT_COMPOSER_STATE: ProjectComposerState = {
  primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
  overlays: [],
  activeTargetId: 'primary',
  directDragEnabled: true,
};

export function createDefaultLayerTransform(
  overrides?: Partial<ProjectLayerTransform>
): ProjectLayerTransform {
  return {
    ...DEFAULT_LAYER_TRANSFORM,
    ...(overrides || {}),
  };
}

export function isDefaultLayerTransform(t: ProjectLayerTransform | null | undefined): boolean {
  if (!t) return true;
  return (
    Math.abs(Number(t.offsetX) || 0) < 0.01 &&
    Math.abs(Number(t.offsetY) || 0) < 0.01 &&
    Math.abs((Number(t.scale) || 100) - 100) < 0.01 &&
    Math.abs(Number(t.rotation) || 0) < 0.01 &&
    Math.abs((Number(t.opacity) ?? 100) - 100) < 0.01 &&
    !t.flipH &&
    !t.flipV &&
    t.visible !== false
  );
}

export function hasActiveComposerModifications(
  state: ProjectComposerState | null | undefined
): boolean {
  if (!state) return false;
  if (!isDefaultLayerTransform(state.primaryTransform)) return true;
  const visibleOverlays = (state.overlays || []).filter((o) => o && o.transform?.visible !== false);
  return visibleOverlays.length > 0;
}

export function clampTransformValues(
  t: Partial<ProjectLayerTransform>,
  baseW = 1000,
  baseH = 1000
): ProjectLayerTransform {
  const maxOffX = Math.max(2000, Math.round(baseW * 2));
  const maxOffY = Math.max(2000, Math.round(baseH * 2));
  const rawX = Number(t.offsetX);
  const rawY = Number(t.offsetY);
  const rawScale = Number(t.scale);
  const rawRot = Number(t.rotation);
  const rawOp = Number(t.opacity);

  return {
    offsetX: Number.isFinite(rawX) ? Math.max(-maxOffX, Math.min(maxOffX, Math.round(rawX))) : 0,
    offsetY: Number.isFinite(rawY) ? Math.max(-maxOffY, Math.min(maxOffY, Math.round(rawY))) : 0,
    scale: Number.isFinite(rawScale) ? Math.max(5, Math.min(500, Math.round(rawScale * 10) / 10)) : 100,
    rotation: Number.isFinite(rawRot) ? Math.max(-180, Math.min(180, Math.round(rawRot))) : 0,
    opacity: Number.isFinite(rawOp) ? Math.max(0, Math.min(100, Math.round(rawOp))) : 100,
    flipH: Boolean(t.flipH),
    flipV: Boolean(t.flipV),
    visible: t.visible !== undefined ? Boolean(t.visible) : true,
  };
}

export function nudgeLayerTransform(
  t: ProjectLayerTransform,
  dx: number,
  dy: number,
  baseW = 1000,
  baseH = 1000
): ProjectLayerTransform {
  return clampTransformValues(
    {
      ...t,
      offsetX: (Number(t.offsetX) || 0) + dx,
      offsetY: (Number(t.offsetY) || 0) + dy,
    },
    baseW,
    baseH
  );
}

/**
 * Moves a secondary overlay layer up by 1 step in visual Z-order stack.
 * If moving past the top of 'below' layers, transitions seamlessly to 'above' layers!
 */
export function moveOverlayLayerUp(
  state: ProjectComposerState,
  targetId: string
): ProjectComposerState {
  if (!state || !Array.isArray(state.overlays) || state.overlays.length === 0) return state;
  const idx = state.overlays.findIndex((o) => o.id === targetId);
  if (idx === -1) return state;

  const overlays = [...state.overlays];
  const target = { ...overlays[idx] };
  const isBelow = target.zOrder === 'below';

  if (isBelow) {
    let nextBelowIdx = -1;
    for (let i = idx + 1; i < overlays.length; i++) {
      if (overlays[i].zOrder === 'below') {
        nextBelowIdx = i;
        break;
      }
    }

    if (nextBelowIdx !== -1) {
      const temp = overlays[idx];
      overlays[idx] = overlays[nextBelowIdx];
      overlays[nextBelowIdx] = temp;
    } else {
      // Top 'below' layer -> promote to 'above' (moves right above primary project)
      target.zOrder = 'above';
      overlays.splice(idx, 1);
      const firstAboveIdx = overlays.findIndex((o) => (o.zOrder || 'above') === 'above');
      if (firstAboveIdx !== -1) {
        overlays.splice(firstAboveIdx, 0, target);
      } else {
        overlays.push(target);
      }
    }
  } else {
    // 'above' layer
    let nextAboveIdx = -1;
    for (let i = idx + 1; i < overlays.length; i++) {
      if ((overlays[i].zOrder || 'above') === 'above') {
        nextAboveIdx = i;
        break;
      }
    }

    if (nextAboveIdx !== -1) {
      const temp = overlays[idx];
      overlays[idx] = overlays[nextAboveIdx];
      overlays[nextAboveIdx] = temp;
    }
  }

  return {
    ...state,
    activeTargetId: targetId,
    overlays,
  };
}

/**
 * Moves a secondary overlay layer down by 1 step in visual Z-order stack.
 * If moving below the bottom of 'above' layers, transitions seamlessly to 'below' layers!
 */
export function moveOverlayLayerDown(
  state: ProjectComposerState,
  targetId: string
): ProjectComposerState {
  if (!state || !Array.isArray(state.overlays) || state.overlays.length === 0) return state;
  const idx = state.overlays.findIndex((o) => o.id === targetId);
  if (idx === -1) return state;

  const overlays = [...state.overlays];
  const target = { ...overlays[idx] };
  const isAbove = (target.zOrder || 'above') === 'above';

  if (isAbove) {
    let prevAboveIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if ((overlays[i].zOrder || 'above') === 'above') {
        prevAboveIdx = i;
        break;
      }
    }

    if (prevAboveIdx !== -1) {
      const temp = overlays[idx];
      overlays[idx] = overlays[prevAboveIdx];
      overlays[prevAboveIdx] = temp;
    } else {
      // Lowest 'above' layer -> demote to 'below' (moves right below primary project)
      target.zOrder = 'below';
      overlays.splice(idx, 1);
      let lastBelowIdx = -1;
      for (let i = overlays.length - 1; i >= 0; i--) {
        if (overlays[i].zOrder === 'below') {
          lastBelowIdx = i;
          break;
        }
      }
      if (lastBelowIdx !== -1) {
        overlays.splice(lastBelowIdx + 1, 0, target);
      } else {
        overlays.unshift(target);
      }
    }
  } else {
    // 'below' layer
    let prevBelowIdx = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if (overlays[i].zOrder === 'below') {
        prevBelowIdx = i;
        break;
      }
    }

    if (prevBelowIdx !== -1) {
      const temp = overlays[idx];
      overlays[idx] = overlays[prevBelowIdx];
      overlays[prevBelowIdx] = temp;
    }
  }

  return {
    ...state,
    activeTargetId: targetId,
    overlays,
  };
}

/**
 * Brings a layer to the absolute top of the stack (front-most of all layers).
 */
export function moveOverlayLayerToTop(
  state: ProjectComposerState,
  targetId: string
): ProjectComposerState {
  if (!state || !Array.isArray(state.overlays) || state.overlays.length === 0) return state;
  const idx = state.overlays.findIndex((o) => o.id === targetId);
  if (idx === -1) return state;

  const overlays = [...state.overlays];
  const [target] = overlays.splice(idx, 1);
  target.zOrder = 'above';
  overlays.push(target);

  return {
    ...state,
    activeTargetId: targetId,
    overlays,
  };
}

/**
 * Sends a layer to the absolute bottom of the stack (back-most of all layers).
 */
export function moveOverlayLayerToBottom(
  state: ProjectComposerState,
  targetId: string
): ProjectComposerState {
  if (!state || !Array.isArray(state.overlays) || state.overlays.length === 0) return state;
  const idx = state.overlays.findIndex((o) => o.id === targetId);
  if (idx === -1) return state;

  const overlays = [...state.overlays];
  const [target] = overlays.splice(idx, 1);
  target.zOrder = 'below';
  overlays.unshift(target);

  return {
    ...state,
    activeTargetId: targetId,
    overlays,
  };
}

export interface UnifiedStackItem {
  id: string;
  name: string;
  type: 'primary' | 'overlay';
  zOrder: 'above' | 'primary' | 'below';
  format?: string;
  visible: boolean;
  overlay?: SecondaryOverlayLayer;
}

export function getUnifiedVisualLayerStack(
  state: ProjectComposerState,
  primaryName = 'المشروع الأساسي الرئيسي'
): UnifiedStackItem[] {
  if (!state) return [];
  const overlays = state.overlays || [];

  const aboveItems: UnifiedStackItem[] = overlays
    .filter((o) => (o.zOrder || 'above') === 'above')
    .map((o) => ({
      id: o.id,
      name: o.name,
      type: 'overlay' as const,
      zOrder: 'above' as const,
      format: o.format,
      visible: o.transform?.visible !== false,
      overlay: o,
    }))
    .reverse();

  const primaryItem: UnifiedStackItem = {
    id: 'primary',
    name: primaryName,
    type: 'primary' as const,
    zOrder: 'primary' as const,
    visible: state.primaryTransform?.visible !== false,
  };

  const belowItems: UnifiedStackItem[] = overlays
    .filter((o) => o.zOrder === 'below')
    .map((o) => ({
      id: o.id,
      name: o.name,
      type: 'overlay' as const,
      zOrder: 'below' as const,
      format: o.format,
      visible: o.transform?.visible !== false,
      overlay: o,
    }))
    .reverse();

  return [...aboveItems, primaryItem, ...belowItems];
}

export interface ComputedLayerBox {
  centerX: number;
  centerY: number;
  drawWidth: number;
  drawHeight: number;
  scaleX: number;
  scaleY: number;
  rotationRad: number;
  opacity: number;
  visible: boolean;
}

/**
 * Computes the exact placement geometry on a target canvas of size (targetW x targetH)
 * given the base project dimensions (baseW x baseH) and the layer's intrinsic size (sourceW x sourceH).
 */
export function computeLayerDrawGeometry(
  sourceW: number,
  sourceH: number,
  baseW: number,
  baseH: number,
  targetW: number,
  targetH: number,
  fitMode: OverlayFitMode,
  transform: ProjectLayerTransform
): ComputedLayerBox {
  const safeBaseW = Math.max(1, baseW || targetW || 1);
  const safeBaseH = Math.max(1, baseH || targetH || 1);
  const safeSrcW = Math.max(1, sourceW || safeBaseW);
  const safeSrcH = Math.max(1, sourceH || safeBaseH);
  const safeTargetW = Math.max(1, targetW || safeBaseW);
  const safeTargetH = Math.max(1, targetH || safeBaseH);

  let fittedW = safeTargetW;
  let fittedH = safeTargetH;

  if (fitMode === 'contain') {
    const r = Math.min(safeTargetW / safeSrcW, safeTargetH / safeSrcH);
    fittedW = safeSrcW * r;
    fittedH = safeSrcH * r;
  } else if (fitMode === 'cover') {
    const r = Math.max(safeTargetW / safeSrcW, safeTargetH / safeSrcH);
    fittedW = safeSrcW * r;
    fittedH = safeSrcH * r;
  } else if (fitMode === 'original') {
    fittedW = safeSrcW * (safeTargetW / safeBaseW);
    fittedH = safeSrcH * (safeTargetH / safeBaseH);
  }

  const scaleRatio = Math.max(0.05, Math.min(5, (Number(transform?.scale) || 100) / 100));
  const drawWidth = fittedW * scaleRatio;
  const drawHeight = fittedH * scaleRatio;

  const dx = (Number(transform?.offsetX) || 0) * (safeTargetW / safeBaseW);
  const dy = (Number(transform?.offsetY) || 0) * (safeTargetH / safeBaseH);

  const centerX = safeTargetW / 2 + dx;
  const centerY = safeTargetH / 2 + dy;

  const scaleX = transform?.flipH ? -1 : 1;
  const scaleY = transform?.flipV ? -1 : 1;
  const rotationRad = ((Number(transform?.rotation) || 0) * Math.PI) / 180;
  const opacity = Math.max(0, Math.min(1, (Number(transform?.opacity ?? 100) || 0) / 100));
  const visible = transform?.visible !== false && opacity > 0.001;

  return {
    centerX,
    centerY,
    drawWidth,
    drawHeight,
    scaleX,
    scaleY,
    rotationRad,
    opacity,
    visible,
  };
}

export function buildPrimaryPreviewCssTransform(
  transform: ProjectLayerTransform,
  baseW: number,
  baseH: number,
  globalScalePercent = 100,
  globalMirror: 'none' | 'horizontal' | 'vertical' = 'none'
): { transform: string; opacity: string; visibility: string } {
  const safeBaseW = Math.max(1, baseW || 1);
  const safeBaseH = Math.max(1, baseH || 1);
  const pctX = ((Number(transform?.offsetX) || 0) / safeBaseW) * 100;
  const pctY = ((Number(transform?.offsetY) || 0) / safeBaseH) * 100;

  const userScale = Math.max(0.05, Math.min(5, (Number(transform?.scale) || 100) / 100));
  const globalScale = Math.max(0.01, (Number(globalScalePercent) || 100) / 100);
  const totalScale = userScale * globalScale;

  let flipSignX = transform?.flipH ? -1 : 1;
  let flipSignY = transform?.flipV ? -1 : 1;
  if (globalMirror === 'horizontal') flipSignX *= -1;
  if (globalMirror === 'vertical') flipSignY *= -1;

  const scaleX = totalScale * flipSignX;
  const scaleY = totalScale * flipSignY;
  const rot = Number(transform?.rotation) || 0;
  const opacityVal = Math.max(0, Math.min(1, (Number(transform?.opacity ?? 100) || 0) / 100));

  const parts: string[] = [];
  if (pctX !== 0 || pctY !== 0) {
    parts.push(`translate(${pctX.toFixed(3)}%, ${pctY.toFixed(3)}%)`);
  }
  if (rot !== 0) {
    parts.push(`rotate(${rot}deg)`);
  }
  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`);
  }

  return {
    transform: parts.length > 0 ? parts.join(' ') : 'none',
    opacity: String(opacityVal),
    visibility: transform?.visible !== false && opacityVal > 0.001 ? 'visible' : 'hidden',
  };
}

export type AffineMatrix = [number, number, number, number, number, number];

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

/**
 * Computes the 2D affine matrix [a, b, c, d, tx, ty] for the primary project transform
 * mapping from original movie coordinates (0..baseW, 0..baseH) to target canvas (0..targetW, 0..targetH).
 */
export function buildPrimaryProjectAffineMatrix(
  baseW: number,
  baseH: number,
  targetW: number,
  targetH: number,
  primaryTransform: ProjectLayerTransform = DEFAULT_LAYER_TRANSFORM,
  globalScalePercent = 100,
  globalMirror: 'none' | 'horizontal' | 'vertical' = 'none'
): AffineMatrix {
  const safeBaseW = Math.max(1, baseW || targetW || 1);
  const safeBaseH = Math.max(1, baseH || targetH || 1);
  const safeTargetW = Math.max(1, targetW || safeBaseW);
  const safeTargetH = Math.max(1, targetH || safeBaseH);

  const scaleRatioX = safeTargetW / safeBaseW;
  const scaleRatioY = safeTargetH / safeBaseH;

  const userScale = Math.max(0.05, Math.min(5, (Number(primaryTransform?.scale) || 100) / 100));
  const globalScale = Math.max(0.01, (Number(globalScalePercent) || 100) / 100);
  const totalScale = userScale * globalScale;

  let flipSignX = (primaryTransform?.flipH ? -1 : 1);
  let flipSignY = (primaryTransform?.flipV ? -1 : 1);
  if (globalMirror === 'horizontal') flipSignX *= -1;
  if (globalMirror === 'vertical') flipSignY *= -1;

  const sx = totalScale * flipSignX * scaleRatioX;
  const sy = totalScale * flipSignY * scaleRatioY;

  const rotRad = ((Number(primaryTransform?.rotation) || 0) * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);

  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;

  const dx = (Number(primaryTransform?.offsetX) || 0) * scaleRatioX;
  const dy = (Number(primaryTransform?.offsetY) || 0) * scaleRatioY;

  const originX = safeBaseW / 2;
  const originY = safeBaseH / 2;
  const pivotX = safeTargetW / 2 + dx;
  const pivotY = safeTargetH / 2 + dy;

  const tx = a * -originX + c * -originY + pivotX;
  const ty = b * -originX + d * -originY + pivotY;

  return [
    Number(a.toFixed(6)),
    Number(b.toFixed(6)),
    Number(c.toFixed(6)),
    Number(d.toFixed(6)),
    Number(tx.toFixed(4)),
    Number(ty.toFixed(4)),
  ];
}

/**
 * Computes the 2D affine matrix mapping an overlay layer of size (sourceW x sourceH)
 * onto a target canvas of size (targetW x targetH) based on fit mode and layer transform.
 */
export function buildOverlayLayerAffineMatrix(
  sourceW: number,
  sourceH: number,
  baseW: number,
  baseH: number,
  targetW: number,
  targetH: number,
  fitMode: OverlayFitMode,
  transform: ProjectLayerTransform = DEFAULT_LAYER_TRANSFORM
): {
  matrix: AffineMatrix;
  opacity: number;
  visible: boolean;
} {
  const geom = computeLayerDrawGeometry(
    sourceW,
    sourceH,
    baseW,
    baseH,
    targetW,
    targetH,
    fitMode,
    transform
  );

  const safeSrcW = Math.max(1, sourceW);
  const safeSrcH = Math.max(1, sourceH);

  const sx = (geom.drawWidth / safeSrcW) * geom.scaleX;
  const sy = (geom.drawHeight / safeSrcH) * geom.scaleY;

  const cos = Math.cos(geom.rotationRad);
  const sin = Math.sin(geom.rotationRad);

  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;

  const originX = safeSrcW / 2;
  const originY = safeSrcH / 2;

  const tx = a * -originX + c * -originY + geom.centerX;
  const ty = b * -originX + d * -originY + geom.centerY;

  return {
    matrix: [
      Number(a.toFixed(6)),
      Number(b.toFixed(6)),
      Number(c.toFixed(6)),
      Number(d.toFixed(6)),
      Number(tx.toFixed(4)),
      Number(ty.toFixed(4)),
    ],
    opacity: geom.opacity,
    visible: geom.visible,
  };
}

export interface ComposeDecomposedSvgaOptions {
  targetW?: number;
  targetH?: number;
  targetFps?: number;
  globalScalePercent?: number;
  globalMirror?: 'none' | 'horizontal' | 'vertical';
  imageReplacements?: Record<string, Uint8Array>;
  overlayMovies?: Map<string, any>;
  overlayRenderedFrames?: Map<
    string,
    { width: number; height: number; frames: Uint8Array[] }
  >;
}

/**
 * Composes a full decomposed SvgaMovie retaining 100% of the original separated images
 * and sprite tracks, applying affine transforms mathematically without canvas rasterization,
 * and embedding any added second files (overlays) as independent animated sprite tracks.
 */
export function composeDecomposedSvgaMovie(
  primaryMovie: any,
  composerState: ProjectComposerState,
  options: ComposeDecomposedSvgaOptions = {}
): any {
  const baseW = Math.max(1, Math.round(primaryMovie.w || 300));
  const baseH = Math.max(1, Math.round(primaryMovie.h || 300));
  const targetW = Math.max(1, Math.round(options.targetW || baseW));
  const targetH = Math.max(1, Math.round(options.targetH || baseH));
  const targetFps = Math.max(1, Math.round(options.targetFps || primaryMovie.fps || 20));
  const totalFrames = Math.max(1, Math.round(primaryMovie.n || 1));

  const pTrans = composerState?.primaryTransform || DEFAULT_LAYER_TRANSFORM;
  const M_proj = buildPrimaryProjectAffineMatrix(
    baseW,
    baseH,
    targetW,
    targetH,
    pTrans,
    options.globalScalePercent || 100,
    options.globalMirror || 'none'
  );
  const pAlpha = Math.max(0, Math.min(1, (Number(pTrans.opacity ?? 100) || 0) / 100));
  const pVisible = pTrans.visible !== false && pAlpha > 0.001;

  // 1. Clone all original decomposed images (preserving img_20, img_105, etc.) and apply edits
  const composedImages: Record<string, Uint8Array> = { ...(primaryMovie.im || {}) };
  if (options.imageReplacements) {
    for (const [k, v] of Object.entries(options.imageReplacements)) {
      if (v && v.length > 0) composedImages[k] = v;
    }
  }

  // 2. Transform primary sprites purely via matrix multiplication (Zero rasterization!)
  const transformedPrimarySprites = (primaryMovie.sp || []).map((sp: any) => {
    const transformedFrames = (sp.fr || []).map((origFr: any) => {
      const origT: AffineMatrix = origFr.t && origFr.t.length === 6 ? origFr.t : [1, 0, 0, 1, 0, 0];
      const newT = multiplyAffine(M_proj, origT);
      const newAlpha = pVisible ? (origFr.a ?? 1) * pAlpha : 0;
      return {
        ...origFr,
        t: newT,
        a: Number(newAlpha.toFixed(4)),
      };
    });

    return {
      ...sp,
      fr: transformedFrames,
    };
  });

  // 3. Process secondary overlay files (underlay or overlay tracks)
  const underlaySprites: any[] = [];
  const overlaySprites: any[] = [];

  const overlays = composerState?.overlays || [];
  for (const layer of overlays) {
    if (layer.transform?.visible === false) continue;
    const isBelow = (layer.zOrder || 'above') === 'below';
    const targetBucket = isBelow ? underlaySprites : overlaySprites;

    // Case A: Overlay is a decomposed SVGA movie
    const secondarySvga = options.overlayMovies?.get(layer.id);
    if (secondarySvga && secondarySvga.im && secondarySvga.sp) {
      const ovW = Math.max(1, Math.round(secondarySvga.w || baseW));
      const ovH = Math.max(1, Math.round(secondarySvga.h || baseH));
      const { matrix: M_ov, opacity: ovOpacity, visible: ovVis } = buildOverlayLayerAffineMatrix(
        ovW,
        ovH,
        baseW,
        baseH,
        targetW,
        targetH,
        layer.fitMode || 'contain',
        layer.transform || DEFAULT_LAYER_TRANSFORM
      );

      // Prefix images to prevent key collisions
      for (const [k, v] of Object.entries(secondarySvga.im as Record<string, Uint8Array>)) {
        composedImages[`ov_${layer.id}_${k}`] = v;
      }

      // Add transformed secondary sprites
      for (const osp of secondarySvga.sp || []) {
        const ospFrames = osp.fr || [];
        const ospCount = Math.max(1, ospFrames.length);
        const transformedFrames: any[] = [];
        for (let fi = 0; fi < totalFrames; fi++) {
          const origFr = ospFrames[fi % ospCount] || { a: 0, x: 0, y: 0, w: 0, h: 0, t: [1, 0, 0, 1, 0, 0] };
          const origT: AffineMatrix = origFr.t && origFr.t.length === 6 ? origFr.t : [1, 0, 0, 1, 0, 0];
          const newT = multiplyAffine(M_ov, origT);
          const newAlpha = ovVis ? (origFr.a ?? 1) * ovOpacity : 0;
          transformedFrames.push({
            ...origFr,
            t: newT,
            a: Number(newAlpha.toFixed(4)),
          });
        }

        targetBucket.push({
          key: `ov_${layer.id}_${osp.key}`,
          fr: transformedFrames,
          mk: osp.mk ? `ov_${layer.id}_${osp.mk}` : undefined,
        });
      }
      continue;
    }

    // Case B: Overlay is an animated/static image sequence (PAG, GIF, WebP, APNG, VAP, MP4, PNG)
    const renderedLayer = options.overlayRenderedFrames?.get(layer.id);
    if (renderedLayer && renderedLayer.frames.length > 0) {
      const ovW = Math.max(1, renderedLayer.width || layer.width || 300);
      const ovH = Math.max(1, renderedLayer.height || layer.height || 300);
      const { matrix: M_ov, opacity: ovOpacity, visible: ovVis } = buildOverlayLayerAffineMatrix(
        ovW,
        ovH,
        baseW,
        baseH,
        targetW,
        targetH,
        layer.fitMode || 'contain',
        layer.transform || DEFAULT_LAYER_TRANSFORM
      );

      const framesCount = renderedLayer.frames.length;
      const spriteFrames: any[] = [];

      for (let fi = 0; fi < totalFrames; fi++) {
        const frameIdx = framesCount === 1 ? 0 : fi % framesCount;
        const frameKey = `ov_${layer.id}_f${frameIdx}`;
        if (!composedImages[frameKey]) {
          composedImages[frameKey] = renderedLayer.frames[frameIdx];
        }

        spriteFrames.push({
          a: ovVis ? Number(ovOpacity.toFixed(4)) : 0,
          x: 0,
          y: 0,
          w: ovW,
          h: ovH,
          t: M_ov,
        });
      }

      // If static 1 frame, can use single sprite with that key
      if (framesCount === 1) {
        targetBucket.push({
          key: `ov_${layer.id}_f0`,
          fr: spriteFrames,
        });
      } else {
        // Multi-frame animated sprite: each frame points to its corresponding image
        for (let fi = 0; fi < framesCount; fi++) {
          const frameKey = `ov_${layer.id}_f${fi}`;
          const trackFrames: any[] = [];
          for (let k = 0; k < totalFrames; k++) {
            const active = k % framesCount === fi;
            trackFrames.push({
              a: active && ovVis ? Number(ovOpacity.toFixed(4)) : 0,
              x: 0,
              y: 0,
              w: ovW,
              h: ovH,
              t: M_ov,
            });
          }
          targetBucket.push({
            key: frameKey,
            fr: trackFrames,
          });
        }
      }
    }
  }

  // Combine in exact visual order: Underlays -> Decomposed Primary Sprites -> Overlays
  const finalSprites = [
    ...underlaySprites,
    ...transformedPrimarySprites,
    ...overlaySprites,
  ];

  return {
    w: targetW,
    h: targetH,
    fps: targetFps,
    n: totalFrames,
    im: composedImages,
    sp: finalSprites,
    audiosRaw: primaryMovie.audiosRaw,
    shapes: primaryMovie.shapes,
    matte: primaryMovie.matte,
  };
}

