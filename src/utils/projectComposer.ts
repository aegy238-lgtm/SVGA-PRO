import { MaskDepthBand, resolveMaskDepthBand } from './vapDynamicMaskPacking';

export type AnimationPreset =
  | 'none'
  | 'flyInLeft'
  | 'flyInRight'
  | 'swayRightLeft'
  | 'windBreeze'
  | 'glideRightToLeft'
  | 'glideLeftToRight'
  | 'slideBounceRightLeft'
  | 'dropFromTop'
  | 'riseFromBottom'
  | 'royalEntrance'
  | 'zoomIn'
  | 'elasticBounce'
  | 'rubberSnap'
  | 'popPulse'
  | 'heartbeatPulse'
  | 'breathingAura'
  | 'floatingHover'
  | 'orbitFloat'
  | 'spinFade'
  | 'spiralZoom'
  | 'slideFade'
  | 'flip3DReveal'
  | 'swingPendulum'
  | 'shakeImpact'
  | 'glowFlashReveal'
  | 'neonStrobe';

export interface ProjectLayerTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipH: boolean;
  flipV: boolean;
  visible: boolean;
  animationPreset?: AnimationPreset;
  startFrame?: number;
  endFrame?: number;
  visibilityEnabled?: boolean;
  visibilityStartFrame?: number;
  visibilityEndFrame?: number;
  linkFrameAndLayer?: boolean;
  motionWaypoints?: Array<{
    frame: number;
    offsetX: number;
    offsetY: number;
    scale: number;
    rotation: number;
    opacity: number;
  }>;
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
  isVapMask?: boolean;
  linkedMaskSlotId?: string;
  maskTag?: string;
  thumbnailDataUrl?: string;
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

export function hasAnimatedMotion(t: ProjectLayerTransform | null | undefined): boolean {
  if (!t) return false;
  if (t.animationPreset && t.animationPreset !== 'none') return true;
  if (Array.isArray(t.motionWaypoints) && t.motionWaypoints.length > 0) return true;
  if (t.visibilityEnabled) return true;
  return false;
}

export function isDefaultLayerTransform(t: ProjectLayerTransform | null | undefined): boolean {
  if (!t) return true;
  if (hasAnimatedMotion(t)) return false;
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

  const clampedWaypoints = Array.isArray(t.motionWaypoints)
    ? t.motionWaypoints.map((wp) => ({
        frame: Math.max(0, Math.round(Number(wp.frame) || 0)),
        offsetX: Number.isFinite(Number(wp.offsetX)) ? Math.max(-maxOffX, Math.min(maxOffX, Math.round(Number(wp.offsetX)))) : 0,
        offsetY: Number.isFinite(Number(wp.offsetY)) ? Math.max(-maxOffY, Math.min(maxOffY, Math.round(Number(wp.offsetY)))) : 0,
        scale: Number.isFinite(Number(wp.scale)) ? Math.max(5, Math.min(500, Math.round(Number(wp.scale) * 10) / 10)) : 100,
        rotation: Number.isFinite(Number(wp.rotation)) ? Math.max(-3600, Math.min(3600, Math.round(Number(wp.rotation)))) : 0,
        opacity: Number.isFinite(Number(wp.opacity)) ? Math.max(0, Math.min(100, Math.round(Number(wp.opacity)))) : 100,
      }))
    : undefined;

  return {
    offsetX: Number.isFinite(rawX) ? Math.max(-maxOffX, Math.min(maxOffX, Math.round(rawX))) : 0,
    offsetY: Number.isFinite(rawY) ? Math.max(-maxOffY, Math.min(maxOffY, Math.round(rawY))) : 0,
    scale: Number.isFinite(rawScale) ? Math.max(5, Math.min(500, Math.round(rawScale * 10) / 10)) : 100,
    rotation: Number.isFinite(rawRot) ? Math.max(-180, Math.min(180, Math.round(rawRot))) : 0,
    opacity: Number.isFinite(rawOp) ? Math.max(0, Math.min(100, Math.round(rawOp))) : 100,
    flipH: Boolean(t.flipH),
    flipV: Boolean(t.flipV),
    visible: t.visible !== undefined ? Boolean(t.visible) : true,
    ...(t.animationPreset !== undefined ? { animationPreset: t.animationPreset } : {}),
    ...(t.startFrame !== undefined ? { startFrame: Math.max(0, Math.round(Number(t.startFrame) || 0)) } : {}),
    ...(t.endFrame !== undefined ? { endFrame: Math.max(1, Number.isFinite(Number(t.endFrame)) ? Math.round(Number(t.endFrame)) : 30) } : {}),
    ...(t.visibilityEnabled !== undefined ? { visibilityEnabled: Boolean(t.visibilityEnabled) } : {}),
    ...(t.visibilityStartFrame !== undefined
      ? { visibilityStartFrame: Math.max(0, Math.round(Number(t.visibilityStartFrame) || 0)) }
      : {}),
    ...(t.visibilityEndFrame !== undefined
      ? {
          visibilityEndFrame: Math.max(
            0,
            Number.isFinite(Number(t.visibilityEndFrame)) ? Math.round(Number(t.visibilityEndFrame)) : 30
          ),
        }
      : {}),
    ...(t.linkFrameAndLayer !== undefined ? { linkFrameAndLayer: Boolean(t.linkFrameAndLayer) } : {}),
    ...(clampedWaypoints !== undefined ? { motionWaypoints: clampedWaypoints } : {}),
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
  maskSprites?: Array<{
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    z: number;
    zLayer?: MaskDepthBand;
    clipPath?: string;
    motionTransform?: ProjectLayerTransform;
    pngBytes: Uint8Array;
  }>;
  watermarkSprites?: Array<{
    imageKey: string;
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    rotation: number;
    opacity: number;
    animWidth?: number;
    animHeight?: number;
    pngBytes: Uint8Array;
  }>;
}

/**
 * Composes a full decomposed SvgaMovie retaining 100% of the original separated images
 * and sprite tracks, applying affine transforms mathematically without canvas rasterization,
 * and embedding any added second files (overlays) as independent animated sprite tracks.
 */
export function resolveLinkedTransformAtFrame(
  layerTransform: ProjectLayerTransform | undefined,
  primaryBase: ProjectLayerTransform | undefined,
  primaryAtFrame: ProjectLayerTransform | undefined,
  currentFrame: number,
  totalFrames: number,
  baseW = 500,
  baseH = 500
): ProjectLayerTransform {
  const own = interpolateTransformAtFrame(layerTransform, currentFrame, totalFrames, baseW, baseH);
  if (
    primaryBase &&
    primaryAtFrame &&
    primaryBase.linkFrameAndLayer !== false &&
    own.linkFrameAndLayer !== false &&
    hasAnimatedMotion(primaryBase) &&
    !hasAnimatedMotion(layerTransform)
  ) {
    const dx = (Number(primaryAtFrame.offsetX) || 0) - (Number(primaryBase.offsetX) || 0);
    const dy = (Number(primaryAtFrame.offsetY) || 0) - (Number(primaryBase.offsetY) || 0);
    const scaleRatio = (Number(primaryAtFrame.scale) || 100) / Math.max(1, Number(primaryBase.scale) || 100);
    const dRot = (Number(primaryAtFrame.rotation) || 0) - (Number(primaryBase.rotation) || 0);
    const opRatio = (Number(primaryAtFrame.opacity ?? 100)) / Math.max(1, Number(primaryBase.opacity ?? 100));
    return {
      ...own,
      offsetX: (Number(own.offsetX) || 0) + dx,
      offsetY: (Number(own.offsetY) || 0) + dy,
      scale: Math.max(0.5, (Number(own.scale) || 100) * scaleRatio),
      rotation: (Number(own.rotation) || 0) + dRot,
      opacity: Math.max(0, Math.min(100, (Number(own.opacity ?? 100)) * opRatio)),
    };
  }
  return own;
}

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
  const primaryFramesCount = Math.max(1, Math.round(primaryMovie.n || 1));
  const pTrans = composerState?.primaryTransform || DEFAULT_LAYER_TRANSFORM;
  const overlays = composerState?.overlays || [];

  let maxOverlayFrames = primaryFramesCount;
  if (primaryFramesCount === 1) {
    options.overlayMovies?.forEach((mv) => {
      if (mv && Number(mv.n) > maxOverlayFrames) maxOverlayFrames = Math.round(mv.n);
    });
    options.overlayRenderedFrames?.forEach((rf) => {
      if (rf && rf.frames.length > maxOverlayFrames) maxOverlayFrames = rf.frames.length;
    });
    const collectAnimMaxFrames = (t?: ProjectLayerTransform) => {
      if (!t || !hasAnimatedMotion(t)) return 0;
      let m = Number(t.endFrame ?? 30) + 1;
      if (t.visibilityEnabled && Number.isFinite(Number(t.visibilityEndFrame))) {
        m = Math.max(m, Number(t.visibilityEndFrame) + 1);
      }
      if (Array.isArray(t.motionWaypoints)) {
        for (const wp of t.motionWaypoints) {
          m = Math.max(m, (Number(wp.frame) || 0) + 1);
        }
      }
      return Math.max(30, m);
    };
    maxOverlayFrames = Math.max(maxOverlayFrames, collectAnimMaxFrames(pTrans));
    for (const ov of overlays) {
      maxOverlayFrames = Math.max(maxOverlayFrames, collectAnimMaxFrames(ov.transform));
    }
    for (const ms of options.maskSprites || []) {
      maxOverlayFrames = Math.max(maxOverlayFrames, collectAnimMaxFrames(ms.motionTransform));
    }
  }
  const totalFrames = maxOverlayFrames;

  const pTransFrames: ProjectLayerTransform[] = [];
  const pMatrixFrames: AffineMatrix[] = [];
  const pAlphaFrames: number[] = [];
  const pVisibleFrames: boolean[] = [];

  for (let fi = 0; fi < totalFrames; fi++) {
    const pt = interpolateTransformAtFrame(pTrans, fi, totalFrames, baseW, baseH);
    pTransFrames.push(pt);
    pMatrixFrames.push(
      buildPrimaryProjectAffineMatrix(
        baseW,
        baseH,
        targetW,
        targetH,
        pt,
        options.globalScalePercent || 100,
        options.globalMirror || 'none'
      )
    );
    const pa = Math.max(0, Math.min(1, (Number(pt.opacity ?? 100) || 0) / 100));
    pAlphaFrames.push(pa);
    pVisibleFrames.push(pt.visible !== false && pa > 0.001);
  }

  // 1. Clone all original decomposed images (preserving img_20, img_105, etc.) and apply edits
  const composedImages: Record<string, Uint8Array> = { ...(primaryMovie.im || {}) };
  if (options.imageReplacements) {
    for (const [k, v] of Object.entries(options.imageReplacements)) {
      if (v && v.length > 0) composedImages[k] = v;
    }
  }

  // 2. Transform primary sprites purely via per-frame matrix multiplication (Zero rasterization!)
  const transformedPrimarySprites = (primaryMovie.sp || []).map((sp: any) => {
    const srcFrames = sp.fr || [];
    const srcLen = Math.max(1, srcFrames.length);
    const transformedFrames: any[] = [];
    for (let fi = 0; fi < totalFrames; fi++) {
      const origFr = srcFrames[primaryFramesCount === 1 ? fi % srcLen : fi] || {
        a: 0,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        t: [1, 0, 0, 1, 0, 0],
      };
      const origT: AffineMatrix = origFr.t && origFr.t.length === 6 ? origFr.t : [1, 0, 0, 1, 0, 0];
      const newT = multiplyAffine(pMatrixFrames[fi], origT);
      const newAlpha = pVisibleFrames[fi] ? (origFr.a ?? 1) * pAlphaFrames[fi] : 0;
      transformedFrames.push({
        ...origFr,
        t: newT,
        a: Number(newAlpha.toFixed(4)),
      });
    }

    return {
      ...sp,
      fr: transformedFrames,
    };
  });

  // 3. Process secondary overlay files (underlay or overlay tracks)
  const underlaySprites: any[] = [];
  const overlaySprites: any[] = [];

  for (const layer of overlays) {
    if (layer.transform?.visible === false) continue;
    if (layer.isVapMask && layer.linkedMaskSlotId) continue;
    const isBelow = (layer.zOrder || 'above') === 'below';
    const targetBucket = isBelow ? underlaySprites : overlaySprites;

    // Case A: Overlay is a decomposed SVGA movie
    const secondarySvga = options.overlayMovies?.get(layer.id);
    if (secondarySvga && secondarySvga.im && secondarySvga.sp) {
      const ovW = Math.max(1, Math.round(secondarySvga.w || baseW));
      const ovH = Math.max(1, Math.round(secondarySvga.h || baseH));

      const ovFrameMats: AffineMatrix[] = [];
      const ovFrameOps: number[] = [];
      const ovFrameVis: boolean[] = [];
      for (let fi = 0; fi < totalFrames; fi++) {
        const effT = resolveLinkedTransformAtFrame(
          layer.transform || DEFAULT_LAYER_TRANSFORM,
          pTrans,
          pTransFrames[fi],
          fi,
          totalFrames,
          baseW,
          baseH
        );
        const res = buildOverlayLayerAffineMatrix(
          ovW,
          ovH,
          baseW,
          baseH,
          targetW,
          targetH,
          layer.fitMode || 'contain',
          effT
        );
        ovFrameMats.push(res.matrix);
        ovFrameOps.push(res.opacity);
        ovFrameVis.push(res.visible);
      }

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
          const newT = multiplyAffine(ovFrameMats[fi], origT);
          const newAlpha = ovFrameVis[fi] ? (origFr.a ?? 1) * ovFrameOps[fi] : 0;
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
      const ovFrameMats: AffineMatrix[] = [];
      const ovFrameOps: number[] = [];
      const ovFrameVis: boolean[] = [];

      for (let fi = 0; fi < totalFrames; fi++) {
        const effT = resolveLinkedTransformAtFrame(
          layer.transform || DEFAULT_LAYER_TRANSFORM,
          pTrans,
          pTransFrames[fi],
          fi,
          totalFrames,
          baseW,
          baseH
        );
        const res = buildOverlayLayerAffineMatrix(
          ovW,
          ovH,
          baseW,
          baseH,
          targetW,
          targetH,
          layer.fitMode || 'contain',
          effT
        );
        ovFrameMats.push(res.matrix);
        ovFrameOps.push(res.opacity);
        ovFrameVis.push(res.visible);
      }

      const framesCount = renderedLayer.frames.length;
      const spriteFrames: any[] = [];

      for (let fi = 0; fi < totalFrames; fi++) {
        const frameIdx = framesCount === 1 ? 0 : fi % framesCount;
        const frameKey = `ov_${layer.id}_f${frameIdx}`;
        if (!composedImages[frameKey]) {
          composedImages[frameKey] = renderedLayer.frames[frameIdx];
        }

        spriteFrames.push({
          a: ovFrameVis[fi] ? Number(ovFrameOps[fi].toFixed(4)) : 0,
          x: 0,
          y: 0,
          w: ovW,
          h: ovH,
          t: ovFrameMats[fi],
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
              a: active && ovFrameVis[k] ? Number(ovFrameOps[k].toFixed(4)) : 0,
              x: 0,
              y: 0,
              w: ovW,
              h: ovH,
              t: ovFrameMats[k],
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

  // 4. Process active replaced/colored mask sprites cleanly across the 4 depth bands
  const maskSprites = [...(options.maskSprites || [])].sort((a, b) => a.z - b.z);
  const scaleX = targetW / baseW;
  const scaleY = targetH / baseH;
  const belowOverlaysMaskSprites: any[] = [];
  const behindPrimaryMaskSprites: any[] = [];
  const abovePrimaryMaskSprites: any[] = [];
  const aboveOverlaysMaskSprites: any[] = [];

  for (const ms of maskSprites) {
    if (!ms.pngBytes || ms.pngBytes.length === 0) continue;
    const key = `vapmask_${ms.id}`;
    composedImages[key] = ms.pngBytes;
    const lw = Math.max(2, Math.round(ms.w));
    const lh = Math.max(2, Math.round(ms.h));
    const baseMat: AffineMatrix = [scaleX, 0, 0, scaleY, ms.x * scaleX, ms.y * scaleY];
    const mcx = (ms.x + lw / 2) * scaleX;
    const mcy = (ms.y + lh / 2) * scaleY;
    const spriteFrames: any[] = [];
    for (let fi = 0; fi < totalFrames; fi++) {
      const effT = resolveLinkedTransformAtFrame(
        ms.motionTransform || DEFAULT_LAYER_TRANSFORM,
        pTrans,
        pTransFrames[fi],
        fi,
        totalFrames,
        baseW,
        baseH
      );
      const isVis = effT.visible !== false && (Number(effT.opacity ?? 100) || 0) > 0.001;
      const alpha = isVis ? Math.max(0, Math.min(1, (Number(effT.opacity ?? 100) || 0) / 100)) : 0;

      let mat = baseMat;
      if (!isDefaultLayerTransform(effT)) {
        const dx = (Number(effT.offsetX) || 0) * scaleX;
        const dy = (Number(effT.offsetY) || 0) * scaleY;
        const sRatio = Math.max(0.05, Math.min(5, (Number(effT.scale) || 100) / 100));
        const rotRad = ((Number(effT.rotation) || 0) * Math.PI) / 180;
        const fx = effT.flipH ? -1 : 1;
        const fy = effT.flipV ? -1 : 1;
        const cos = Math.cos(rotRad);
        const sin = Math.sin(rotRad);
        const a = cos * sRatio * fx;
        const b = sin * sRatio * fx;
        const c = -sin * sRatio * fy;
        const d = cos * sRatio * fy;
        const tx = mcx + dx - (a * mcx + c * mcy);
        const ty = mcy + dy - (b * mcx + d * mcy);
        mat = multiplyAffine([a, b, c, d, tx, ty], baseMat);
      }

      spriteFrames.push({
        a: Number(alpha.toFixed(4)),
        x: 0,
        y: 0,
        w: lw,
        h: lh,
        t: mat,
        ...(ms.clipPath ? { clipPath: ms.clipPath } : {}),
      });
    }
    const band = resolveMaskDepthBand(ms);
    const entry = { key, fr: spriteFrames };
    if (band === 'belowOverlays') belowOverlaysMaskSprites.push(entry);
    else if (band === 'behindPrimary') behindPrimaryMaskSprites.push(entry);
    else if (band === 'aboveOverlays') aboveOverlaysMaskSprites.push(entry);
    else abovePrimaryMaskSprites.push(entry);
  }

  // 5. Process active watermark layers as top-level SVGA sprites
  const watermarkFinalSprites: any[] = [];
  for (const wm of options.watermarkSprites || []) {
    if (!wm || !wm.imageKey || !wm.pngBytes || wm.pngBytes.length === 0) continue;
    composedImages[wm.imageKey] = wm.pngBytes;
    const wmBaseW = Math.max(1, wm.animWidth || baseW);
    const wmBaseH = Math.max(1, wm.animHeight || baseH);
    const sx = targetW / wmBaseW;
    const sy = targetH / wmBaseH;
    const w = Math.max(1, Math.round(wm.width * sx));
    const h = Math.max(1, Math.round(wm.height * sy));
    const cx = wm.x * sx;
    const cy = wm.y * sy;
    const s = Math.max(0.01, (Number(wm.scale) || 100) / 100);
    const rad = ((Number(wm.rotation) || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const a = Number((s * cos).toFixed(6));
    const b = Number((s * sin).toFixed(6));
    const c = Number((-s * sin).toFixed(6));
    const d = Number((s * cos).toFixed(6));
    const hw = w / 2;
    const hh = h / 2;
    const tx = Number((cx - a * hw - c * hh).toFixed(4));
    const ty = Number((cy - b * hw - d * hh).toFixed(4));
    const alpha = Number(Math.max(0, Math.min(1, (Number(wm.opacity ?? 100) || 0) / 100)).toFixed(4));
    const mat: AffineMatrix = [a, b, c, d, tx, ty];
    const wmFrames: any[] = [];
    for (let fi = 0; fi < totalFrames; fi++) {
      wmFrames.push({
        a: alpha,
        x: 0,
        y: 0,
        w,
        h,
        t: mat,
      });
    }
    watermarkFinalSprites.push({
      key: wm.imageKey,
      fr: wmFrames,
    });
  }

  // Combine in exact visual order:
  // Below-All Masks -> Underlay Added Layers -> Behind-Gift Masks -> Primary Sprites -> Above-Gift (Behind-Frame) Masks -> Overlay Added Layers -> Above-All Masks -> Watermarks
  const finalSprites = [
    ...belowOverlaysMaskSprites,
    ...underlaySprites,
    ...behindPrimaryMaskSprites,
    ...transformedPrimarySprites,
    ...abovePrimaryMaskSprites,
    ...overlaySprites,
    ...aboveOverlaysMaskSprites,
    ...watermarkFinalSprites,
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

export function interpolateTransformAtFrame(
  transform: ProjectLayerTransform | undefined,
  currentFrame: number,
  totalFrames: number,
  baseW = 500,
  baseH = 500
): ProjectLayerTransform {
  if (!transform) return DEFAULT_LAYER_TRANSFORM;
  if (transform.visible === false) {
    return { ...transform, visible: false, opacity: 0 };
  }

  // Respect explicit visibility duration window inside the gift (e.g. show from frame 15 to 60)
  let visStart = 0;
  if (transform.visibilityEnabled) {
    visStart = Math.max(0, Math.round(Number(transform.visibilityStartFrame ?? 0)));
    const rawVisEnd = transform.visibilityEndFrame;
    const visEnd =
      rawVisEnd !== undefined && Number.isFinite(Number(rawVisEnd))
        ? Math.max(visStart, Math.round(Number(rawVisEnd)))
        : Math.max(visStart, Math.max(1, totalFrames) - 1);
    if (currentFrame < visStart || currentFrame > visEnd) {
      return { ...transform, visible: false, opacity: 0 };
    }
  }

  const rawStartF = Number(transform.startFrame ?? 0);
  const rawEndF = Number(transform.endFrame ?? 30);
  const span = Math.max(1, rawEndF - rawStartF);
  const effStartF = transform.visibilityEnabled ? Math.max(visStart, rawStartF) : rawStartF;
  const effEndF = effStartF + span;
  const rawProgress = Math.max(0, Math.min(1, (currentFrame - effStartF) / span));

  if (Array.isArray(transform.motionWaypoints) && transform.motionWaypoints.length > 0) {
    const wps = [...transform.motionWaypoints].sort((a, b) => a.frame - b.frame);
    if (currentFrame <= wps[0].frame) {
      return { ...transform, offsetX: wps[0].offsetX, offsetY: wps[0].offsetY, scale: wps[0].scale, rotation: wps[0].rotation, opacity: wps[0].opacity };
    }
    if (currentFrame >= wps[wps.length - 1].frame) {
      const last = wps[wps.length - 1];
      return { ...transform, offsetX: last.offsetX, offsetY: last.offsetY, scale: last.scale, rotation: last.rotation, opacity: last.opacity };
    }
    let prev = wps[0];
    let next = wps[1];
    for (let i = 0; i < wps.length - 1; i++) {
      if (currentFrame >= wps[i].frame && currentFrame <= wps[i + 1].frame) {
        prev = wps[i];
        next = wps[i + 1];
        break;
      }
    }
    const segSpan = Math.max(1, next.frame - prev.frame);
    const p = Math.max(0, Math.min(1, (currentFrame - prev.frame) / segSpan));
    const easeP = p * p * (3 - 2 * p);
    return {
      ...transform,
      offsetX: prev.offsetX + (next.offsetX - prev.offsetX) * easeP,
      offsetY: prev.offsetY + (next.offsetY - prev.offsetY) * easeP,
      scale: prev.scale + (next.scale - prev.scale) * easeP,
      rotation: prev.rotation + (next.rotation - prev.rotation) * easeP,
      opacity: prev.opacity + (next.opacity - prev.opacity) * easeP,
    };
  }

  const preset = transform.animationPreset || 'none';
  const targetX = Number(transform.offsetX) || 0;
  const targetY = Number(transform.offsetY) || 0;
  const targetScale = Number(transform.scale) || 100;
  const targetOpacity = Number(transform.opacity ?? 100);
  const targetRot = Number(transform.rotation) || 0;

  if (preset === 'none') {
    return transform;
  }

  // Continuous loop presets remain alive throughout the visible window after smooth fade-in
  const loopAge = Math.max(0, currentFrame - effStartF);
  const entranceFade = Math.min(1, loopAge / Math.max(3, Math.min(8, Math.round(span * 0.35))));

  if (preset === 'heartbeatPulse') {
    const phase = (loopAge % 20) / 20;
    let boost = 0;
    if (phase < 0.16) boost = Math.sin((phase / 0.16) * Math.PI) * 0.14;
    else if (phase >= 0.22 && phase < 0.4) boost = Math.sin(((phase - 0.22) / 0.18) * Math.PI) * 0.08;
    return {
      ...transform,
      scale: targetScale * (1 + boost),
      opacity: targetOpacity * (loopAge < 3 ? 0.3 + 0.7 * entranceFade : 1),
    };
  }

  if (preset === 'breathingAura') {
    const wave = Math.sin((loopAge / 28) * Math.PI * 2);
    return {
      ...transform,
      scale: targetScale * (1 + wave * 0.065),
      opacity: targetOpacity * (0.88 + wave * 0.12) * (loopAge < 4 ? entranceFade : 1),
    };
  }

  if (preset === 'floatingHover') {
    const wave = Math.sin((loopAge / 24) * Math.PI * 2);
    const sway = Math.cos((loopAge / 30) * Math.PI * 2);
    return {
      ...transform,
      offsetY: targetY + wave * (baseH * 0.032),
      offsetX: targetX + sway * (baseW * 0.014),
      rotation: targetRot + wave * 3.5,
      opacity: targetOpacity * (loopAge < 4 ? entranceFade : 1),
    };
  }

  if (preset === 'swayRightLeft') {
    // Smooth continuous right <-> left horizontal sway with gentle banking angle
    const cycle = Math.sin((loopAge / 26) * Math.PI * 2);
    const tilt = Math.cos((loopAge / 26) * Math.PI * 2);
    return {
      ...transform,
      offsetX: targetX + cycle * (baseW * 0.16),
      offsetY: targetY,
      rotation: targetRot + tilt * 3.5,
      opacity: targetOpacity * (loopAge < 4 ? entranceFade : 1),
    };
  }

  if (preset === 'windBreeze') {
    // Multi-harmonic organic wind gust drifting left & right with subtle lift and tilt
    const gustMain = Math.sin((loopAge / 28) * Math.PI * 2);
    const gustSub = Math.sin((loopAge / 13) * Math.PI * 2) * 0.32;
    const combined = (gustMain + gustSub) / 1.32;
    const lift = Math.cos((loopAge / 20) * Math.PI * 2);
    return {
      ...transform,
      offsetX: targetX + combined * (baseW * 0.2),
      offsetY: targetY + lift * (baseH * 0.028),
      rotation: targetRot + combined * 7.5,
      scale: targetScale * (1 + Math.abs(combined) * 0.03),
      opacity: targetOpacity * (loopAge < 4 ? entranceFade : 1),
    };
  }

  if (preset === 'orbitFloat') {
    const ang = (loopAge / 32) * Math.PI * 2;
    const orbitX = Math.cos(ang) * (baseW * 0.085);
    const orbitY = Math.sin(ang) * (baseH * 0.048);
    const depth = Math.sin(ang);
    return {
      ...transform,
      offsetX: targetX + orbitX,
      offsetY: targetY + orbitY,
      scale: targetScale * (1 + depth * 0.055),
      rotation: targetRot + Math.cos(ang) * 2.5,
      opacity: targetOpacity * (loopAge < 4 ? entranceFade : 1),
    };
  }

  if (preset === 'neonStrobe') {
    const pulse = 0.5 + 0.5 * Math.sin((loopAge / 14) * Math.PI * 2);
    return {
      ...transform,
      scale: targetScale * (0.98 + pulse * 0.065),
      opacity: targetOpacity * (0.68 + pulse * 0.32) * (loopAge < 3 ? entranceFade : 1),
    };
  }

  if (rawProgress >= 1 || currentFrame >= effEndF) {
    if (preset === 'glideRightToLeft') {
      return { ...transform, offsetX: targetX - baseW * 1.05, opacity: 0, visible: false };
    }
    if (preset === 'glideLeftToRight') {
      return { ...transform, offsetX: targetX + baseW * 1.05, opacity: 0, visible: false };
    }
    return transform;
  }

  // Smooth cubic / quartic ease-out & smoothstep helpers
  const p = rawProgress * rawProgress * (3 - 2 * rawProgress);
  const easeOutCubic = 1 - Math.pow(1 - rawProgress, 3);
  const easeOutQuart = 1 - Math.pow(1 - rawProgress, 4);
  const easeOutBack = (t: number, s = 1.70158) => {
    const inv = t - 1;
    return 1 + (s + 1) * Math.pow(inv, 3) + s * Math.pow(inv, 2);
  };
  const easeOutElastic = (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  };

  if (preset === 'flyInLeft') {
    // Enters from left side (-offset) gliding smoothly rightward to center
    const e = easeOutQuart;
    return {
      ...transform,
      offsetX: targetX - baseW * 0.88 * (1 - e),
      offsetY: targetY,
      scale: targetScale * (0.72 + 0.28 * e),
      opacity: targetOpacity * Math.min(1, rawProgress * 2.4),
      rotation: targetRot - 8 * (1 - e),
    };
  } else if (preset === 'flyInRight') {
    // Enters from right side (+offset) gliding smoothly leftward to center
    const e = easeOutQuart;
    return {
      ...transform,
      offsetX: targetX + baseW * 0.88 * (1 - e),
      offsetY: targetY,
      scale: targetScale * (0.72 + 0.28 * e),
      opacity: targetOpacity * Math.min(1, rawProgress * 2.4),
      rotation: targetRot + 8 * (1 - e),
    };
  } else if (preset === 'glideRightToLeft') {
    // Full smooth horizontal pass from far right edge across to far left edge
    const edgeFade =
      rawProgress < 0.14
        ? rawProgress / 0.14
        : rawProgress > 0.86
        ? (1 - rawProgress) / 0.14
        : 1;
    return {
      ...transform,
      offsetX: targetX + baseW * 1.05 * (1 - 2 * p),
      offsetY: targetY - Math.sin(rawProgress * Math.PI) * (baseH * 0.04),
      scale: targetScale * (0.94 + 0.08 * Math.sin(rawProgress * Math.PI)),
      opacity: targetOpacity * Math.max(0, Math.min(1, edgeFade)),
      rotation: targetRot - Math.sin(rawProgress * Math.PI) * 4,
    };
  } else if (preset === 'glideLeftToRight') {
    // Full smooth horizontal pass from far left edge across to far right edge
    const edgeFade =
      rawProgress < 0.14
        ? rawProgress / 0.14
        : rawProgress > 0.86
        ? (1 - rawProgress) / 0.14
        : 1;
    return {
      ...transform,
      offsetX: targetX - baseW * 1.05 * (1 - 2 * p),
      offsetY: targetY - Math.sin(rawProgress * Math.PI) * (baseH * 0.04),
      scale: targetScale * (0.94 + 0.08 * Math.sin(rawProgress * Math.PI)),
      opacity: targetOpacity * Math.max(0, Math.min(1, edgeFade)),
      rotation: targetRot + Math.sin(rawProgress * Math.PI) * 4,
    };
  } else if (preset === 'slideBounceRightLeft') {
    // Damped springy horizontal left-right settle onto target center
    const decay = Math.pow(1 - rawProgress, 1.8);
    const dampSwing = Math.cos(rawProgress * Math.PI * 3.5) * (baseW * 0.34) * decay;
    return {
      ...transform,
      offsetX: targetX + dampSwing,
      offsetY: targetY,
      scale: targetScale * (0.85 + 0.15 * easeOutCubic),
      rotation: targetRot + Math.cos(rawProgress * Math.PI * 3.5) * 8 * decay,
      opacity: targetOpacity * Math.min(1, rawProgress * 3),
    };
  } else if (preset === 'dropFromTop') {
    const e = easeOutBack(rawProgress, 1.45);
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY - baseH * 0.65 * (1 - e),
      scale: targetScale * (1.16 - 0.16 * Math.min(1, easeOutCubic)),
      opacity: targetOpacity * Math.min(1, rawProgress * 2.5),
      rotation: targetRot,
    };
  } else if (preset === 'riseFromBottom') {
    const e = easeOutBack(rawProgress, 1.35);
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY + baseH * 0.68 * (1 - e),
      scale: targetScale * (0.82 + 0.18 * Math.min(1, easeOutCubic)),
      opacity: targetOpacity * Math.min(1, rawProgress * 2.4),
      rotation: targetRot,
    };
  } else if (preset === 'royalEntrance') {
    const e = easeOutQuart;
    const settleScale = 1 + (1 - e) * 0.35 + Math.sin(e * Math.PI) * 0.06;
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY - baseH * 0.16 * (1 - e),
      scale: targetScale * settleScale,
      opacity: targetOpacity * Math.min(1, rawProgress * 2.6),
      rotation: targetRot + (1 - e) * 6,
    };
  } else if (preset === 'zoomIn') {
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY,
      scale: targetScale * (0.1 + 0.9 * easeOutCubic),
      opacity: targetOpacity * p,
      rotation: targetRot,
    };
  } else if (preset === 'elasticBounce') {
    const el = Math.max(0.05, easeOutElastic(rawProgress));
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY,
      scale: targetScale * el,
      opacity: targetOpacity * Math.min(1, rawProgress * 3),
      rotation: targetRot,
    };
  } else if (preset === 'rubberSnap') {
    const el = Math.max(0.2, easeOutElastic(rawProgress));
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY,
      scale: targetScale * (1.28 - 0.28 * el),
      opacity: targetOpacity * Math.min(1, rawProgress * 3.2),
      rotation: targetRot + (1 - Math.min(1, easeOutCubic)) * -10,
    };
  } else if (preset === 'popPulse') {
    const popScale =
      p < 0.7
        ? targetScale * (p / 0.7) * 1.18
        : targetScale * (1.18 - 0.18 * ((p - 0.7) / 0.3));
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY,
      scale: popScale,
      opacity: targetOpacity * Math.min(1, p * 1.6),
      rotation: targetRot,
    };
  } else if (preset === 'spinFade') {
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY,
      scale: targetScale * Math.max(0.05, easeOutCubic),
      opacity: targetOpacity * p,
      rotation: targetRot + (1 - easeOutCubic) * -180,
    };
  } else if (preset === 'spiralZoom') {
    const arcY = Math.sin(rawProgress * Math.PI) * (-baseH * 0.12) * (1 - rawProgress);
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY + arcY,
      scale: targetScale * (0.12 + 0.88 * easeOutCubic),
      opacity: targetOpacity * Math.min(1, rawProgress * 1.8),
      rotation: targetRot + (1 - easeOutCubic) * -360,
    };
  } else if (preset === 'slideFade') {
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY + baseH * 0.4 * (1 - easeOutCubic),
      scale: targetScale,
      opacity: targetOpacity * p,
      rotation: targetRot,
    };
  } else if (preset === 'flip3DReveal') {
    const flipWave = Math.cos((1 - easeOutCubic) * Math.PI * 1.5);
    const sc = targetScale * Math.max(0.08, Math.abs(flipWave) * 0.45 + 0.55 * easeOutCubic);
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY - Math.sin(rawProgress * Math.PI) * (baseH * 0.08),
      scale: sc,
      rotation: targetRot + (1 - easeOutCubic) * 28,
      opacity: targetOpacity * Math.min(1, rawProgress * 2.2),
    };
  } else if (preset === 'swingPendulum') {
    const decay = Math.pow(1 - rawProgress, 1.5);
    const swing = Math.sin(rawProgress * Math.PI * 3.5) * 24 * decay;
    return {
      ...transform,
      offsetX: targetX + Math.sin(rawProgress * Math.PI * 3.5) * (baseW * 0.06) * decay,
      offsetY: targetY - (1 - easeOutCubic) * (baseH * 0.18),
      scale: targetScale * (0.75 + 0.25 * easeOutCubic),
      rotation: targetRot + swing,
      opacity: targetOpacity * Math.min(1, rawProgress * 2.5),
    };
  } else if (preset === 'shakeImpact') {
    if (rawProgress < 0.3) {
      const k = rawProgress / 0.3;
      return {
        ...transform,
        offsetX: targetX,
        offsetY: targetY,
        scale: targetScale * (1.42 - 0.42 * k),
        opacity: targetOpacity * k,
        rotation: targetRot,
      };
    }
    const tShake = (rawProgress - 0.3) / 0.7;
    const damp = (1 - tShake) * (1 - tShake);
    return {
      ...transform,
      offsetX: targetX + Math.sin(tShake * Math.PI * 6) * (baseW * 0.045) * damp,
      offsetY: targetY + Math.cos(tShake * Math.PI * 5) * (baseH * 0.025) * damp,
      scale: targetScale * (1 + 0.05 * damp),
      rotation: targetRot + Math.sin(tShake * Math.PI * 6) * 5 * damp,
      opacity: targetOpacity,
    };
  } else if (preset === 'glowFlashReveal') {
    const flash =
      rawProgress < 0.2
        ? rawProgress / 0.2
        : 0.55 + 0.45 * Math.abs(Math.sin(rawProgress * Math.PI * 3.5));
    return {
      ...transform,
      offsetX: targetX,
      offsetY: targetY,
      scale: targetScale * (1.28 - 0.28 * easeOutCubic),
      opacity: targetOpacity * (rawProgress > 0.85 ? 1 : flash),
      rotation: targetRot,
    };
  }

  return transform;
}

