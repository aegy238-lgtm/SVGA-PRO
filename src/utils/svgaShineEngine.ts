import { SvgaFrame } from './codecs.ts';
import {
  AffineMatrix,
  DEFAULT_TRANSFORM,
  LayerPropertyKeyframes,
  LayerTransform,
  buildPivotTransformMatrix,
  computeAddedLayerFrameMatrix,
  computeSpriteFrameMatrix,
  interpolateLayerTransform,
  invertAffine,
  multiplyAffine,
} from './svgaEditorLogic.ts';

export interface Point2D {
  x: number;
  y: number;
}

export type ShinePresetId =
  | 'royal_gold'
  | 'glass_white'
  | 'double_luxury'
  | 'diamond_star'
  | 'neon_cyber'
  | 'custom_image';

export type ShineMaskMode =
  | 'auto_layer_contour'
  | 'interactive_points'
  | 'ring_frame'
  | 'rect_box';

export type ShineCanvasEditSubmode = 'mask_points' | 'motion_points' | 'none';

export type ShineBlendMode = 'screen' | 'lighter' | 'source-over';

export interface ShineLayerConfig {
  enabled: boolean;
  targetLayerId: string; // 'DOCUMENT' | `sprite_${idx}` | `layer_${id}`
  followTargetLayerTransform: boolean;
  /**
   * When true (default), the shine is masked pixel-by-pixel (`destination-in`) against
   * the target layer's exact alpha channel so it conforms 100% to every curve, ornament,
   * anti-aliased edge, and inner hole of the original layer with zero cut marks (`بدون آثار قص`).
   */
  exactLayerAlphaMask?: boolean;
  /**
   * Blend mode used when compositing the shine over the target layer (`screen` | `lighter` | `source-over`).
   */
  blendMode?: ShineBlendMode;
  maskMode: ShineMaskMode;
  /**
   * Array of closed polygon contours in Canvas (World) coordinates at referenceFrame.
   * maskContours[0] is the primary outer contour; maskContours[1] (optional) is an inner cutout hole (for hollow frames).
   */
  maskContours: Point2D[][];
  /**
   * Interactive motion path waypoints in Canvas (World) coordinates [startPt, ...midPts, endPt].
   */
  motionPoints: Point2D[];
  presetId: ShinePresetId;
  colorPrimary: string;
  colorSecondary: string;
  beamAngleDeg: number;
  beamWidthRatio: number;
  beamSoftness: number;
  shineWidth: number;
  shineHeight: number;
  startFrame: number;
  endFrame: number;
  loopCount: number;
  pauseFrames: number;
  referenceFrame: number;
  referenceTargetMatrix?: AffineMatrix;
}

export interface ShinePresetMeta {
  id: ShinePresetId;
  labelAr: string;
  descAr: string;
  colorPrimary: string;
  colorSecondary: string;
  beamAngleDeg: number;
  beamWidthRatio: number;
}

export const SHINE_PRESETS: ShinePresetMeta[] = [
  {
    id: 'royal_gold',
    labelAr: 'شعاع ذهبي ملكي (إطار الهند)',
    descAr: 'لمعة ذهبية دافئة بمركز أبيض ساطع مثالية للإطارات الملكية والأوسمة',
    colorPrimary: '#fde047',
    colorSecondary: '#ffffff',
    beamAngleDeg: -32,
    beamWidthRatio: 0.28,
  },
  {
    id: 'glass_white',
    labelAr: 'لمعة زجاجية بيضاء حادة',
    descAr: 'انعكاس زجاجي أبيض نقي مزدوج الحواف للهدايا والشارات',
    colorPrimary: '#e2e8f0',
    colorSecondary: '#ffffff',
    beamAngleDeg: -35,
    beamWidthRatio: 0.22,
  },
  {
    id: 'double_luxury',
    labelAr: 'موجة بريق مزدوجة فاخرة',
    descAr: 'شعاع رئيسي عريض يتبعه خط بريق رفيع عالي الاحترافية',
    colorPrimary: '#fbbf24',
    colorSecondary: '#fef08a',
    beamAngleDeg: -28,
    beamWidthRatio: 0.34,
  },
  {
    id: 'diamond_star',
    labelAr: 'توهج ألماسي نجمي',
    descAr: 'لمعة متدرجة مع بريق نجوم متلألئة في المنتصف',
    colorPrimary: '#bae6fd',
    colorSecondary: '#ffffff',
    beamAngleDeg: -30,
    beamWidthRatio: 0.26,
  },
  {
    id: 'neon_cyber',
    labelAr: 'شعاع نيون بنفسجي / سيان',
    descAr: 'لمعة نيون حديثة متدرجة للإطارات العصرية',
    colorPrimary: '#c084fc',
    colorSecondary: '#67e8f9',
    beamAngleDeg: -35,
    beamWidthRatio: 0.3,
  },
];

/**
 * Generates a rectangular polygon contour in canvas coordinates (8 points around perimeter for easy point editing).
 */
export function generateRectMaskContours(
  x: number,
  y: number,
  w: number,
  h: number
): Point2D[][] {
  const mx = x + w / 2;
  const my = y + h / 2;
  return [
    [
      { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) },
      { x: Number(mx.toFixed(1)), y: Number(y.toFixed(1)) },
      { x: Number((x + w).toFixed(1)), y: Number(y.toFixed(1)) },
      { x: Number((x + w).toFixed(1)), y: Number(my.toFixed(1)) },
      { x: Number((x + w).toFixed(1)), y: Number((y + h).toFixed(1)) },
      { x: Number(mx.toFixed(1)), y: Number((y + h).toFixed(1)) },
      { x: Number(x.toFixed(1)), y: Number((y + h).toFixed(1)) },
      { x: Number(x.toFixed(1)), y: Number(my.toFixed(1)) },
    ],
  ];
}

/**
 * Generates a ring / hollow frame mask (outer contour clockwise + inner hole contour counter-clockwise)
 * so the shine sweeps strictly on the frame border (like "إطار الهند") and never covers the avatar center.
 */
export function generateRingFrameMaskContours(
  cx: number,
  cy: number,
  outerRadiusX: number,
  outerRadiusY: number,
  thicknessRatio = 0.28,
  segments = 24
): Point2D[][] {
  const rxOut = Math.max(10, outerRadiusX);
  const ryOut = Math.max(10, outerRadiusY);
  const clampedThickness = Math.max(0.08, Math.min(0.95, thicknessRatio));
  const rxIn = rxOut * (1 - clampedThickness);
  const ryIn = ryOut * (1 - clampedThickness);
  const n = Math.max(6, Math.min(64, Math.round(segments)));

  const outer: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    outer.push({
      x: Number((cx + Math.cos(ang) * rxOut).toFixed(1)),
      y: Number((cy + Math.sin(ang) * ryOut).toFixed(1)),
    });
  }

  // Inner contour wound in reverse (counter-clockwise) so nonzero/evenodd SVG winding cuts out the center hole
  const inner: Point2D[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    inner.push({
      x: Number((cx + Math.cos(ang) * rxIn).toFixed(1)),
      y: Number((cy + Math.sin(ang) * ryIn).toFixed(1)),
    });
  }

  return [outer, inner];
}

/**
 * Ramer-Douglas-Peucker (RDP) polygon simplification algorithm.
 * Reduces raw perimeter pixel sequences to clean, minimal polygon vertices with sub-pixel fidelity.
 */
export function rdpSimplify(points: Point2D[], epsilon = 1.1): Point2D[] {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const p1 = points[0];
  const p2 = points[points.length - 1];

  const ldx = p2.x - p1.x;
  const ldy = p2.y - p1.y;
  const lenSq = ldx * ldx + ldy * ldy;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    let d = 0;
    if (lenSq === 0) {
      d = Math.hypot(p.x - p1.x, p.y - p1.y);
    } else {
      const num = Math.abs(ldy * p.x - ldx * p.y + p2.x * p1.y - p2.y * p1.x);
      d = num / Math.sqrt(lenSq);
    }
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const rec1 = rdpSimplify(points.slice(0, index + 1), epsilon);
    const rec2 = rdpSimplify(points.slice(index), epsilon);
    return rec1.slice(0, rec1.length - 1).concat(rec2);
  }
  return [p1, p2];
}

/**
 * 8-connected Moore-Neighbor perimeter tracer.
 * Follows the clockwise outer perimeter of the primary opaque connected component.
 */
export function traceOuterContourMoore(
  rgba: Uint8Array | Uint8ClampedArray,
  W: number,
  H: number,
  threshold = 14
): Point2D[] {
  const isOpaque = (x: number, y: number): boolean => {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    return rgba[(y * W + x) * 4 + 3] >= threshold;
  };

  // Find first opaque pixel from top to bottom, left to right
  let startX = -1;
  let startY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (isOpaque(x, y)) {
        startX = x;
        startY = y;
        break;
      }
    }
    if (startX >= 0) break;
  }

  if (startX < 0) return [];

  const DIRS = [
    { dx: 1, dy: 0 },   // 0: East
    { dx: 1, dy: 1 },   // 1: South-East
    { dx: 0, dy: 1 },   // 2: South
    { dx: -1, dy: 1 },  // 3: South-West
    { dx: -1, dy: 0 },  // 4: West
    { dx: -1, dy: -1 }, // 5: North-West
    { dx: 0, dy: -1 },  // 6: North
    { dx: 1, dy: -1 },  // 7: North-East
  ];

  const points: Point2D[] = [{ x: startX, y: startY }];
  let cx = startX;
  let cy = startY;
  let enterDir = 0;
  let firstNextDir = -1;

  const maxSteps = Math.min(10000, W * H);
  for (let step = 0; step < maxSteps; step++) {
    const searchStart = (enterDir + 5) % 8;
    let foundDir = -1;
    for (let i = 0; i < 8; i++) {
      const d = (searchStart + i) % 8;
      const nx = cx + DIRS[d].dx;
      const ny = cy + DIRS[d].dy;
      if (isOpaque(nx, ny)) {
        foundDir = d;
        break;
      }
    }

    if (foundDir === -1) break;

    if (step === 0) {
      firstNextDir = foundDir;
    } else if (cx === startX && cy === startY && foundDir === firstNextDir) {
      break;
    }

    cx += DIRS[foundDir].dx;
    cy += DIRS[foundDir].dy;
    enterDir = foundDir;
    points.push({ x: cx, y: cy });
  }

  return points;
}

/**
 * Traces the inner hole boundary of a hollow frame starting from (cx, cy).
 */
export function traceInnerHoleContourMoore(
  rgba: Uint8Array | Uint8ClampedArray,
  W: number,
  H: number,
  cx: number,
  cy: number,
  threshold = 14
): Point2D[] {
  const isOpaque = (x: number, y: number): boolean => {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    return rgba[(y * W + x) * 4 + 3] >= threshold;
  };

  const startX = Math.max(0, Math.min(W - 1, Math.round(cx)));
  const startY = Math.max(0, Math.min(H - 1, Math.round(cy)));

  if (isOpaque(startX, startY)) return [];

  // Scan right from (startX, startY) until hitting the first opaque pixel of the inner frame wall
  let holeStartX = -1;
  for (let x = startX; x < W; x++) {
    if (isOpaque(x, startY)) {
      holeStartX = x;
      break;
    }
  }

  if (holeStartX < 0) return [];

  const DIRS = [
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
  ];

  const points: Point2D[] = [{ x: holeStartX, y: startY }];
  let curX = holeStartX;
  let curY = startY;
  let enterDir = 0;
  let firstNextDir = -1;

  const maxSteps = Math.min(8000, W * H);
  for (let step = 0; step < maxSteps; step++) {
    const searchStart = (enterDir + 5) % 8;
    let foundDir = -1;
    for (let i = 0; i < 8; i++) {
      const d = (searchStart + i) % 8;
      const nx = curX + DIRS[d].dx;
      const ny = curY + DIRS[d].dy;
      if (isOpaque(nx, ny)) {
        foundDir = d;
        break;
      }
    }

    if (foundDir === -1) break;

    if (step === 0) {
      firstNextDir = foundDir;
    } else if (curX === holeStartX && curY === startY && foundDir === firstNextDir) {
      break;
    }

    curX += DIRS[foundDir].dx;
    curY += DIRS[foundDir].dy;
    enterDir = foundDir;
    points.push({ x: curX, y: curY });
  }

  return points;
}

export function computePolygonSignedArea(pts: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a * 0.5;
}

/**
 * Traces the opaque contour (and optional inner transparent hole for genuinely hollow avatar frames)
 * from an RGBA pixel buffer, transforming the resulting control points to Canvas (World) coordinates.
 *
 * Uses Moore-Neighbor 8-connected perimeter contour tracing + Ramer-Douglas-Peucker (RDP) polygon
 * simplification by default so non-convex shapes, decorative cutouts, diamonds, and banners
 * (like the "سيد الثروة" banner) are hugged with 100% boundary fidelity with ZERO cut marks leaking outside!
 */
export function traceAlphaContourFromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  toWorldMatrix: AffineMatrix,
  optionsOrRays?:
    | {
        alphaThreshold?: number;
        radialRays?: number;
        detectInnerHole?: boolean;
        contourMethod?: 'moore' | 'radial';
        rdpEpsilon?: number;
      }
    | number,
  legacyAlphaThreshold?: number,
  legacyDetectInnerHole?: boolean
): Point2D[][] {
  const W = Math.max(1, Math.floor(width));
  const H = Math.max(1, Math.floor(height));
  const opts =
    typeof optionsOrRays === 'number'
      ? {
          radialRays: optionsOrRays,
          alphaThreshold: legacyAlphaThreshold ?? 16,
          detectInnerHole: legacyDetectInnerHole ?? true,
          contourMethod: 'radial' as const,
        }
      : optionsOrRays || {};

  const threshold = opts.alphaThreshold ?? 14;
  const numRays = Math.max(8, Math.min(96, opts.radialRays ?? 28));
  const detectHole = opts.detectInnerHole ?? true;
  const contourMethod = opts.contourMethod || (opts.radialRays ? 'radial' : 'moore');
  const rdpEps = Math.max(0.5, Math.min(4, opts.rdpEpsilon ?? 1.1));

  const getAlpha = (x: number, y: number): number => {
    const ix = Math.max(0, Math.min(W - 1, Math.round(x)));
    const iy = Math.max(0, Math.min(H - 1, Math.round(y)));
    return rgba[(iy * W + ix) * 4 + 3] || 0;
  };

  // Find bounding box of opaque pixels
  let minX = W;
  let minY = H;
  let maxX = 0;
  let maxY = 0;
  let opaqueCount = 0;
  const step = Math.max(1, Math.floor(Math.min(W, H) / 120));

  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (getAlpha(x, y) >= threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        opaqueCount++;
      }
    }
  }

  const toWorld = (lx: number, ly: number): Point2D => ({
    x: Number((toWorldMatrix[0] * lx + toWorldMatrix[2] * ly + toWorldMatrix[4]).toFixed(1)),
    y: Number((toWorldMatrix[1] * lx + toWorldMatrix[3] * ly + toWorldMatrix[5]).toFixed(1)),
  });

  if (opaqueCount === 0 || minX >= maxX || minY >= maxY) {
    return [
      [
        toWorld(0, 0),
        toWorld(W / 2, 0),
        toWorld(W, 0),
        toWorld(W, H / 2),
        toWorld(W, H),
        toWorld(W / 2, H),
        toWorld(0, H),
        toWorld(0, H / 2),
      ],
    ];
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spanW = Math.max(4, maxX - minX);
  const spanH = Math.max(4, maxY - minY);
  const minSpan = Math.min(spanW, spanH);

  // Check if center core is genuinely hollow (like an avatar circular frame)
  const minHoleCoreR = Math.max(3, minSpan * 0.16);
  let isCenterCoreTrulyHollow = detectHole;
  if (isCenterCoreTrulyHollow) {
    if (getAlpha(cx, cy) >= threshold) {
      isCenterCoreTrulyHollow = false;
    } else {
      const checkRings = [minHoleCoreR * 0.45, minHoleCoreR * 0.85];
      for (const cr of checkRings) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          if (getAlpha(cx + Math.cos(a) * cr, cy + Math.sin(a) * cr) >= threshold) {
            isCenterCoreTrulyHollow = false;
            break;
          }
        }
        if (!isCenterCoreTrulyHollow) break;
      }
    }
  }

  // -------------------------------------------------------------
  // PATH A: Moore-Neighbor 8-connected perimeter contour tracing (DEFAULT)
  // Guarantees zero leakage into concave / transparent empty space
  // -------------------------------------------------------------
  if (contourMethod === 'moore') {
    const rawPerimeter = traceOuterContourMoore(rgba, W, H, threshold);
    if (rawPerimeter.length >= 6) {
      const simplified = rdpSimplify(rawPerimeter, rdpEps);
      if (simplified.length >= 4) {
        const outerWorld = simplified.map((p) => toWorld(p.x, p.y));
        const contours: Point2D[][] = [outerWorld];

        if (isCenterCoreTrulyHollow) {
          const rawHole = traceInnerHoleContourMoore(rgba, W, H, cx, cy, threshold);
          if (rawHole.length >= 6) {
            let simplifiedHole = rdpSimplify(rawHole, rdpEps);
            if (simplifiedHole.length >= 4) {
              const outerArea = computePolygonSignedArea(simplified);
              const innerArea = computePolygonSignedArea(simplifiedHole);
              // Ensure inner hole has opposite winding to outer contour for SVG evenodd / nonzero hole cutout
              if ((outerArea > 0 && innerArea > 0) || (outerArea < 0 && innerArea < 0)) {
                simplifiedHole = [...simplifiedHole].reverse();
              }
              contours.push(simplifiedHole.map((p) => toWorld(p.x, p.y)));
            }
          }
        }

        return contours;
      }
    }
  }

  // -------------------------------------------------------------
  // PATH B: Radial Ray-Marching (for backward compatibility when explicitly requested)
  // -------------------------------------------------------------
  const maxRadius = Math.hypot(spanW, spanH) * 0.65;
  const marchStep = Math.max(0.5, maxRadius / 200);

  const rawOuterRadii: number[] = new Array(numRays).fill(0);
  const rawInnerRadii: number[] = new Array(numRays).fill(0);
  let innerHoleHits = 0;

  for (let i = 0; i < numRays; i++) {
    const ang = (i / numRays) * Math.PI * 2 - Math.PI / 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);

    // March inward from maxRadius to center to find outermost opaque pixel
    let outerR = 0;
    for (let r = maxRadius; r >= 0; r -= marchStep) {
      const px = cx + dx * r;
      const py = cy + dy * r;
      if (px >= 0 && px < W && py >= 0 && py < H && getAlpha(px, py) >= threshold) {
        outerR = r;
        break;
      }
    }
    rawOuterRadii[i] = outerR;

    if (isCenterCoreTrulyHollow && outerR > minHoleCoreR) {
      let innerR = 0;
      for (let r = minHoleCoreR; r < outerR * 0.92; r += marchStep) {
        const px = cx + dx * r;
        const py = cy + dy * r;
        if (px >= 0 && px < W && py >= 0 && py < H && getAlpha(px, py) >= threshold) {
          innerR = r;
          innerHoleHits++;
          break;
        }
      }
      rawInnerRadii[i] = innerR;
    }
  }

  // Fill any missed rays (0) from nearest valid angular neighbors
  const fallbackOuterR = Math.hypot(spanW / 2, spanH / 2) * 0.72;
  for (let i = 0; i < numRays; i++) {
    if (rawOuterRadii[i] <= 1) {
      let prevR = 0;
      let nextR = 0;
      for (let d = 1; d < numRays; d++) {
        const v = rawOuterRadii[(i - d + numRays) % numRays];
        if (v > 1) {
          prevR = v;
          break;
        }
      }
      for (let d = 1; d < numRays; d++) {
        const v = rawOuterRadii[(i + d) % numRays];
        if (v > 1) {
          nextR = v;
          break;
        }
      }
      rawOuterRadii[i] =
        prevR > 1 && nextR > 1 ? (prevR + nextR) / 2 : prevR || nextR || fallbackOuterR;
    }
  }

  const outerLocal: Point2D[] = [];
  for (let i = 0; i < numRays; i++) {
    const rPrev = rawOuterRadii[(i - 1 + numRays) % numRays];
    const rCur = rawOuterRadii[i];
    const rNext = rawOuterRadii[(i + 1) % numRays];
    const smoothedR = rCur * 0.64 + (rPrev + rNext) * 0.18 + 1.2;
    const ang = (i / numRays) * Math.PI * 2 - Math.PI / 2;
    outerLocal.push({
      x: cx + Math.cos(ang) * smoothedR,
      y: cy + Math.sin(ang) * smoothedR,
    });
  }

  const contours: Point2D[][] = [outerLocal.map((p) => toWorld(p.x, p.y))];

  // Only include inner cutout hole if the core is truly hollow and >= 75% of rays hit the inner ring wall
  if (isCenterCoreTrulyHollow && innerHoleHits >= numRays * 0.75) {
    const validInner = rawInnerRadii.filter((v) => v > minHoleCoreR);
    const avgInner =
      validInner.length > 0
        ? validInner.reduce((a, b) => a + b, 0) / validInner.length
        : minHoleCoreR;
    for (let i = 0; i < numRays; i++) {
      if (rawInnerRadii[i] <= minHoleCoreR) {
        rawInnerRadii[i] = avgInner;
      }
    }
    const innerLocal: Point2D[] = [];
    for (let i = 0; i < numRays; i++) {
      const rPrev = rawInnerRadii[(i - 1 + numRays) % numRays];
      const rCur = rawInnerRadii[i];
      const rNext = rawInnerRadii[(i + 1) % numRays];
      const smoothedInR = Math.max(2, rCur * 0.64 + (rPrev + rNext) * 0.18 - 1.0);
      const ang = (i / numRays) * Math.PI * 2 - Math.PI / 2;
      innerLocal.push({
        x: cx + Math.cos(ang) * smoothedInR,
        y: cy + Math.sin(ang) * smoothedInR,
      });
    }
    const reversedInner = [...innerLocal].reverse().map((p) => toWorld(p.x, p.y));
    contours.push(reversedInner);
  }

  return contours;
}

/**
 * Converts a closed loop of 2D points into a smooth closed Catmull-Rom Cubic Bezier SVG path (`M ... C ... Z`),
 * eliminating sharp polygonal corners (`آثار القص المضلعة`) along curved layer edges.
 */
export function buildSmoothClosedBezierSubpath(
  pts: Point2D[],
  tension = 0.24
): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n < 3) {
    return (
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') +
      ' Z'
    );
  }
  const cmds: string[] = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const c1x = Number((p1.x + (p2.x - p0.x) * tension).toFixed(2));
    const c1y = Number((p1.y + (p2.y - p0.y) * tension).toFixed(2));
    const c2x = Number((p2.x - (p3.x - p1.x) * tension).toFixed(2));
    const c2y = Number((p2.y - (p3.y - p1.y) * tension).toFixed(2));
    const ex = Number(p2.x.toFixed(2));
    const ey = Number(p2.y.toFixed(2));

    cmds.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}

/**
 * Projects one or more closed polygon contours from Canvas (World) coordinates into the
 * Shine Layer's local image space using the inverse of the shine layer's current frame matrix,
 * returning an SVG `clipPath` string (`M x y L x y ... Z` or smooth Cubic Bezier `M ... C ... Z`).
 *
 * When `targetDeltaMatrix` is provided (because the target layer itself moved/scaled on frame `f`
 * relative to `referenceFrame`), the world contours are first transformed by `targetDeltaMatrix`.
 */
export function projectWorldContoursToLocalClipPath(
  worldContours: Point2D[][],
  shineMatrix: AffineMatrix,
  targetDeltaMatrix?: AffineMatrix | null,
  options?: { smoothCurve?: boolean }
): string {
  if (!worldContours || worldContours.length === 0) return '';
  const invShine = invertAffine(shineMatrix);
  if (!invShine) return '';

  const subpaths: string[] = [];
  for (const contour of worldContours) {
    if (!contour || contour.length < 3) continue;
    const localPts: Point2D[] = [];
    for (let i = 0; i < contour.length; i++) {
      let wx = contour[i].x;
      let wy = contour[i].y;
      if (targetDeltaMatrix) {
        const nx = targetDeltaMatrix[0] * wx + targetDeltaMatrix[2] * wy + targetDeltaMatrix[4];
        const ny = targetDeltaMatrix[1] * wx + targetDeltaMatrix[3] * wy + targetDeltaMatrix[5];
        wx = nx;
        wy = ny;
      }
      const lx = Number((invShine[0] * wx + invShine[2] * wy + invShine[4]).toFixed(2));
      const ly = Number((invShine[1] * wx + invShine[3] * wy + invShine[5]).toFixed(2));
      localPts.push({ x: lx, y: ly });
    }

    if (options?.smoothCurve && localPts.length >= 6) {
      // Use tight tension (0.05 for detailed polygons, 0.12 for low-point loops) so curves never bulge into empty space!
      const tension = localPts.length >= 24 ? 0.05 : 0.12;
      subpaths.push(buildSmoothClosedBezierSubpath(localPts, tension));
    } else {
      const cmds = localPts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`);
      cmds.push('Z');
      subpaths.push(cmds.join(' '));
    }
  }
  return subpaths.join(' ');
}

/**
 * Computes the relative world-space delta matrix `M_target(f) * inv(M_target(ref))`
 * so a mask contour defined on a target layer at `referenceFrame` automatically follows
 * the target layer if the target layer moves, scales, or rotates across frames.
 */
export function computeTargetDeltaMatrix(
  currentTargetMatrix: AffineMatrix,
  referenceTargetMatrix?: AffineMatrix | null
): AffineMatrix | null {
  if (!referenceTargetMatrix) return null;
  const invRef = invertAffine(referenceTargetMatrix);
  if (!invRef) return null;
  return multiplyAffine(currentTargetMatrix, invRef);
}

/**
 * Evaluates a multi-point piecewise linear motion path (`motionPoints`) at normalized progress `t` in `[0, 1]`.
 */
export function interpolateMotionPathPoint(points: Point2D[], t: number): Point2D {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  const clamped = Math.max(0, Math.min(1, t));

  // Compute segment lengths
  const segLens: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segLens.push(len);
    totalLen += len;
  }

  if (totalLen < 1e-4) {
    return { x: points[0].x, y: points[0].y };
  }

  const targetDist = clamped * totalLen;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const seg = segLens[i];
    if (acc + seg >= targetDist || i === segLens.length - 1) {
      const localT = seg > 1e-5 ? (targetDist - acc) / seg : 0;
      return {
        x: Number((points[i].x + (points[i + 1].x - points[i].x) * localT).toFixed(2)),
        y: Number((points[i].y + (points[i + 1].y - points[i].y) * localT).toFixed(2)),
      };
    }
    acc += seg;
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

/**
 * Generates Timeline `LayerPropertyKeyframes` (`position` and `opacity`) from the Shine Layer's
 * interactive `motionPoints`, `startFrame`, `endFrame`, `loopCount`, and `pauseFrames`.
 */
export function buildShineKeyframesFromMotionPoints(
  config: ShineLayerConfig,
  totalFrames: number,
  canvasW: number,
  canvasH: number,
  baseOpacity = 100
): LayerPropertyKeyframes {
  const n = Math.max(1, totalFrames);
  const startF = Math.max(0, Math.min(n - 1, Math.round(config.startFrame)));
  const endF = Math.max(startF, Math.min(n - 1, Math.round(config.endFrame)));
  const pts =
    config.motionPoints && config.motionPoints.length >= 2
      ? config.motionPoints
      : [
          { x: canvasW * 0.15, y: canvasH * 0.15 },
          { x: canvasW * 0.85, y: canvasH * 0.85 },
        ];

  const posMap: Record<number, { x: number; y: number }> = {};
  const opaMap: Record<number, number> = {};

  const loops = Math.max(1, Math.min(20, Math.round(config.loopCount || 1)));
  const pause = Math.max(0, Math.round(config.pauseFrames || 0));
  const totalSpan = Math.max(1, endF - startF);
  const cycleSpan = Math.max(2, Math.floor((totalSpan + pause) / loops));
  const activeSweepSpan = Math.max(1, cycleSpan - pause);

  for (let loopIdx = 0; loopIdx < loops; loopIdx++) {
    const cycleStart = startF + loopIdx * cycleSpan;
    const sweepEnd = Math.min(endF, cycleStart + activeSweepSpan);
    if (cycleStart > endF) break;

    // Place keyframes at each waypoint along the sweep
    const waypointCount = pts.length;
    for (let wIdx = 0; wIdx < waypointCount; wIdx++) {
      const ratio = waypointCount > 1 ? wIdx / (waypointCount - 1) : 0;
      const f = Math.round(cycleStart + ratio * Math.max(1, sweepEnd - cycleStart));
      posMap[f] = {
        x: Number((pts[wIdx].x - canvasW / 2).toFixed(2)),
        y: Number((pts[wIdx].y - canvasH / 2).toFixed(2)),
      };
    }

    // Smooth fade-in at start of sweep and fade-out at end if pause > 0
    if (pause > 0 && sweepEnd < endF) {
      opaMap[cycleStart] = baseOpacity;
      opaMap[sweepEnd] = baseOpacity;
      if (sweepEnd + 1 <= endF) {
        opaMap[sweepEnd + 1] = 0;
      }
      const nextCycleStart = cycleStart + cycleSpan;
      if (nextCycleStart - 1 > sweepEnd && nextCycleStart - 1 <= endF) {
        opaMap[nextCycleStart - 1] = 0;
      }
    }
  }

  const out: LayerPropertyKeyframes = { position: posMap };
  if (Object.keys(opaMap).length > 0) {
    out.opacity = opaMap;
  }
  return out;
}

/**
 * Recomputes per-frame `SvgaFrame[]` for a Shine Layer across `0 .. totalFrames - 1`,
 * dynamically projecting `config.maskContours` into the Shine Layer's local coordinate space
 * (`FrameEntity.clipPath`) at every frame so that BOTH motion-point animation AND manual
 * mouse/keyframe movement stay 100% clipped inside the mask in the live Canvas and exported SVGA!
 */
export function buildClippedShineSvgaFrames(options: {
  totalFrames: number;
  shineWidth: number;
  shineHeight: number;
  canvasW: number;
  canvasH: number;
  inFrame: number;
  outFrame: number;
  baseTransform: LayerTransform;
  keyframes?: LayerPropertyKeyframes;
  copiedFrames?: SvgaFrame[];
  docTransformAtFrame: (frame: number) => LayerTransform;
  config: ShineLayerConfig;
  targetMatrixAtFrame?: (frame: number) => AffineMatrix | null;
  smoothCurve?: boolean;
}): SvgaFrame[] {
  const {
    totalFrames,
    shineWidth,
    shineHeight,
    canvasW,
    canvasH,
    inFrame,
    outFrame,
    baseTransform,
    keyframes,
    copiedFrames,
    docTransformAtFrame,
    config,
    targetMatrixAtFrame,
    smoothCurve,
  } = options;

  const n = Math.max(1, Math.round(totalFrames));
  const W = Math.max(1, canvasW);
  const H = Math.max(1, canvasH);
  const sw = Math.max(1, shineWidth);
  const sh = Math.max(1, shineHeight);
  const hasCopied = Boolean(copiedFrames && copiedFrames.length > 0);
  const shouldSmooth =
    smoothCurve !== undefined
      ? smoothCurve
      : config.maskMode === 'auto_layer_contour' || config.maskMode === 'ring_frame';

  const frames: SvgaFrame[] = [];

  for (let i = 0; i < n; i++) {
    const inRange = i >= inFrame && i <= outFrame;
    const lt = interpolateLayerTransform(baseTransform, keyframes, i);
    const docT = docTransformAtFrame(i);

    let localFrameMat: AffineMatrix;
    let frameAlpha: number;
    let fx = 0;
    let fy = 0;
    let fw = sw;
    let fh = sh;

    if (hasCopied) {
      const cf = copiedFrames![Math.min(i, copiedFrames!.length - 1)];
      fx = cf?.x || 0;
      fy = cf?.y || 0;
      fw = cf && cf.w > 0 ? cf.w : sw;
      fh = cf && cf.h > 0 ? cf.h : sh;
      // Matrix without docT because serializeDecomposedSvga / Canvas applies lt & docT
      localFrameMat = [
        cf?.t?.[0] ?? 1,
        cf?.t?.[1] ?? 0,
        cf?.t?.[2] ?? 0,
        cf?.t?.[3] ?? 1,
        cf?.t?.[4] ?? 0,
        cf?.t?.[5] ?? 0,
      ];
      frameAlpha = inRange ? Math.max(0, Math.min(1, cf?.a ?? 1)) : 0;
    } else {
      // Standard added layer: build local frame matrix as identity at center, while full world matrix is used for clipPath
      localFrameMat = buildPivotTransformMatrix(W / 2, H / 2, sw / 2, sh / 2, DEFAULT_TRANSFORM);
      frameAlpha = inRange ? 1 : 0;
    }

    // Compute the exact world matrix of the shine layer at frame i (including lt and docT)
    const worldShineMat = hasCopied
      ? computeSpriteFrameMatrix(
          { a: frameAlpha, x: fx, y: fy, w: fw, h: fh, t: localFrameMat },
          fw,
          fh,
          W,
          H,
          lt,
          docT
        )
      : computeAddedLayerFrameMatrix(sw, sh, W, H, lt, docT);

    // Optional target layer delta matrix if the target layer moved/scaled at frame i
    let targetDelta: AffineMatrix | null = null;
    if (
      config.followTargetLayerTransform &&
      targetMatrixAtFrame &&
      config.referenceTargetMatrix
    ) {
      const curTargetMat = targetMatrixAtFrame(i);
      if (curTargetMat) {
        targetDelta = computeTargetDeltaMatrix(curTargetMat, config.referenceTargetMatrix);
      }
    }

    const clipPath = projectWorldContoursToLocalClipPath(
      config.maskContours,
      worldShineMat,
      targetDelta,
      { smoothCurve: shouldSmooth }
    );

    frames.push({
      a: frameAlpha,
      x: fx,
      y: fy,
      w: fw,
      h: fh,
      t: localFrameMat,
      clipPath: clipPath || undefined,
    });
  }

  return frames;
}

/**
 * Feathers the outer perimeter of any custom shine bitmap so its 4 rectangular borders
 * fade smoothly to `alpha = 0` and never show hard cut marks (`آثار القص`) when sweeping across a layer.
 */
export async function featherCustomShineBitmap(sourceBitmap: ImageBitmap): Promise<{
  bitmap: ImageBitmap;
  pngBytes: Uint8Array;
  dataUrl: string;
  width: number;
  height: number;
}> {
  const W = Math.max(16, sourceBitmap.width);
  const H = Math.max(16, sourceBitmap.height);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(sourceBitmap, 0, 0, W, H);

  // Apply elliptical radial feathering so all 4 edges of the bitmap have 0% alpha
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, H / Math.max(1, W));
  const maxR = W * 0.49;
  const rGrad = ctx.createRadialGradient(0, 0, maxR * 0.55, 0, 0, maxR);
  rGrad.addColorStop(0, 'rgba(255,255,255,1)');
  rGrad.addColorStop(0.68, 'rgba(255,255,255,0.88)');
  rGrad.addColorStop(0.88, 'rgba(255,255,255,0.32)');
  rGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rGrad;
  ctx.fillRect(-W, -W, W * 2, W * 2);
  ctx.restore();

  const dataUrl = c.toDataURL('image/png');
  const blob: Blob = await new Promise((resolve) =>
    c.toBlob((b) => resolve(b || new Blob()), 'image/png')
  );
  const pngBytes = new Uint8Array(await blob.arrayBuffer());
  const bitmap = await createImageBitmap(blob);
  return { bitmap, pngBytes, dataUrl, width: W, height: H };
}

/**
 * Procedurally renders a high-craft Shine / Shimmer PNG image on an HTML5 Canvas
 * for the selected preset, angle, beam width, softness, and colors.
 * Guarantees 100% zero-alpha falloff before reaching any of the 4 bitmap edges (`بدون أي حواف قص مستطيلة`).
 */
export async function renderProceduralShineBitmapAndBytes(options: {
  presetId: ShinePresetId;
  width: number;
  height: number;
  colorPrimary: string;
  colorSecondary: string;
  beamAngleDeg: number;
  beamWidthRatio: number;
  beamSoftness: number;
}): Promise<{
  bitmap: ImageBitmap;
  pngBytes: Uint8Array;
  dataUrl: string;
  width: number;
  height: number;
}> {
  const W = Math.max(32, Math.min(1024, Math.round(options.width || 320)));
  const H = Math.max(32, Math.min(1024, Math.round(options.height || 320)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  ctx.clearRect(0, 0, W, H);

  const angleRad = ((options.beamAngleDeg ?? -32) * Math.PI) / 180;
  const bw = Math.max(0.06, Math.min(0.85, options.beamWidthRatio ?? 0.28));
  const soft = Math.max(0.1, Math.min(1, options.beamSoftness ?? 0.85));
  const c1 = options.colorPrimary || '#fde047';
  const c2 = options.colorSecondary || '#ffffff';

  const hexToRgba = (hex: string, alpha: number): string => {
    const clean = hex.replace('#', '').trim();
    const full =
      clean.length === 3
        ? clean
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : clean.padEnd(6, 'f');
    const r = parseInt(full.slice(0, 2), 16) || 255;
    const g = parseInt(full.slice(2, 4), 16) || 224;
    const b = parseInt(full.slice(4, 6), 16) || 71;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  };

  const minDim = Math.min(W, H);
  const safeRadius = minDim * 0.475;

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angleRad);

  const halfSpan = Math.max(12, safeRadius * bw * 1.15);
  const grad = ctx.createLinearGradient(-halfSpan, 0, halfSpan, 0);

  if (options.presetId === 'glass_white') {
    grad.addColorStop(0, hexToRgba(c1, 0));
    grad.addColorStop(0.18, hexToRgba(c1, 0.08 * soft));
    grad.addColorStop(0.36, hexToRgba(c1, 0.32 * soft));
    grad.addColorStop(0.45, hexToRgba(c2, 0.92));
    grad.addColorStop(0.51, hexToRgba(c2, 0.96));
    grad.addColorStop(0.57, hexToRgba(c1, 0.14));
    grad.addColorStop(0.69, hexToRgba(c2, 0.72));
    grad.addColorStop(0.82, hexToRgba(c1, 0.12 * soft));
    grad.addColorStop(1, hexToRgba(c1, 0));
  } else if (options.presetId === 'double_luxury') {
    grad.addColorStop(0, hexToRgba(c1, 0));
    grad.addColorStop(0.15, hexToRgba(c1, 0.18 * soft));
    grad.addColorStop(0.32, hexToRgba(c1, 0.55 * soft));
    grad.addColorStop(0.42, hexToRgba(c2, 0.95));
    grad.addColorStop(0.54, hexToRgba(c1, 0.25 * soft));
    grad.addColorStop(0.66, hexToRgba(c1, 0.06));
    grad.addColorStop(0.77, hexToRgba(c2, 0.82));
    grad.addColorStop(0.89, hexToRgba(c1, 0.18 * soft));
    grad.addColorStop(1, hexToRgba(c1, 0));
  } else {
    // royal_gold, diamond_star, neon_cyber — smooth Gaussian-like falloff
    grad.addColorStop(0, hexToRgba(c1, 0));
    grad.addColorStop(0.14, hexToRgba(c1, 0.12 * soft));
    grad.addColorStop(0.28, hexToRgba(c1, 0.42 * soft));
    grad.addColorStop(0.42, hexToRgba(c1, 0.84));
    grad.addColorStop(0.5, hexToRgba(c2, 0.98));
    grad.addColorStop(0.58, hexToRgba(c1, 0.84));
    grad.addColorStop(0.72, hexToRgba(c1, 0.42 * soft));
    grad.addColorStop(0.86, hexToRgba(c1, 0.12 * soft));
    grad.addColorStop(1, hexToRgba(c1, 0));
  }

  ctx.fillStyle = grad;
  ctx.fillRect(-halfSpan, -safeRadius, halfSpan * 2, safeRadius * 2);

  // Longitudinal fade inside safeRadius so beam tips fade to 0 well before the bitmap border
  ctx.globalCompositeOperation = 'destination-in';
  const vGrad = ctx.createLinearGradient(0, -safeRadius, 0, safeRadius);
  vGrad.addColorStop(0, 'rgba(255,255,255,0)');
  vGrad.addColorStop(0.16, 'rgba(255,255,255,0.65)');
  vGrad.addColorStop(0.32, 'rgba(255,255,255,1)');
  vGrad.addColorStop(0.68, 'rgba(255,255,255,1)');
  vGrad.addColorStop(0.84, 'rgba(255,255,255,0.65)');
  vGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(- safeRadius, -safeRadius, safeRadius * 2, safeRadius * 2);
  ctx.globalCompositeOperation = 'source-over';

  // If diamond_star preset, draw crisp 4-point sparkle glints along the beam core
  if (options.presetId === 'diamond_star') {
    const drawSparkle = (sx: number, sy: number, r: number) => {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = c2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? r : r * 0.22;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    drawSparkle(0, 0, minDim * 0.13);
    drawSparkle(halfSpan * 0.16, -minDim * 0.17, minDim * 0.085);
    drawSparkle(-halfSpan * 0.14, minDim * 0.19, minDim * 0.095);
  }

  ctx.restore();

  // Unrotated elliptical radial feathering in [0..W, 0..H] space:
  // Guarantees 0% alpha at the outer border of the bitmap regardless of beam rotation angle!
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, H / Math.max(1, W));
  const outerR = W * 0.485;
  const radMask = ctx.createRadialGradient(0, 0, outerR * 0.35, 0, 0, outerR);
  radMask.addColorStop(0, 'rgba(255,255,255,1)');
  radMask.addColorStop(0.65, 'rgba(255,255,255,0.92)');
  radMask.addColorStop(0.88, 'rgba(255,255,255,0.35)');
  radMask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = radMask;
  ctx.fillRect(-W, -W, W * 2, W * 2);
  ctx.restore();

  const dataUrl = c.toDataURL('image/png');
  const blob: Blob = await new Promise((resolve) =>
    c.toBlob((b) => resolve(b || new Blob()), 'image/png')
  );
  const pngBytes = new Uint8Array(await blob.arrayBuffer());
  const bitmap = await createImageBitmap(blob);

  return {
    bitmap,
    pngBytes,
    dataUrl,
    width: W,
    height: H,
  };
}

/**
 * Inspects an existing SVGA sprite (e.g. from an imported SVGA file like "إطار الهند")
 * that uses `FrameEntity.clipPath`, and extracts its stationary World-Space Mask Contours
 * (`maskContours`) plus its Canvas Motion Path Waypoints (`motionPoints`).
 */
export function extractShineConfigFromExistingSprite(
  frames: SvgaFrame[],
  assetW: number,
  assetH: number,
  canvasW: number,
  canvasH: number
): {
  maskContours: Point2D[][];
  motionPoints: Point2D[];
  startFrame: number;
  endFrame: number;
} | null {
  if (!frames || frames.length === 0) return null;
  const activeIndices: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f && (f.a ?? 0) > 0.005 && f.clipPath && f.clipPath.trim().length > 0) {
      activeIndices.push(i);
    }
  }
  if (activeIndices.length === 0) return null;

  const startFrame = activeIndices[0];
  const endFrame = activeIndices[activeIndices.length - 1];
  const midFrame = activeIndices[Math.floor(activeIndices.length / 2)];

  const refF = frames[startFrame];
  const [a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0] = refF.t || [1, 0, 0, 1, 0, 0];

  // Parse subpaths from refF.clipPath and transform each local point by refF.t into Canvas space
  const rawClip = refF.clipPath || '';
  const subpathStrings = rawClip.split(/(?=[Mm])/).filter((s) => s.trim().length > 0);
  const maskContours: Point2D[][] = [];

  for (const sub of subpathStrings) {
    const pts: Point2D[] = [];
    const tokens = [...sub.matchAll(/([MLHVmlhv])\s*([^MLHVZmlhvz]*)/g)];
    let curX = 0;
    let curY = 0;
    for (const tk of tokens) {
      const cmd = tk[1];
      const nums = (tk[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      if ((cmd === 'M' || cmd === 'L') && nums.length >= 2) {
        for (let k = 0; k + 1 < nums.length; k += 2) {
          curX = nums[k];
          curY = nums[k + 1];
          pts.push({
            x: Number((a * curX + c * curY + tx).toFixed(1)),
            y: Number((b * curX + d * curY + ty).toFixed(1)),
          });
        }
      } else if (cmd === 'H' && nums.length >= 1) {
        curX = nums[0];
        pts.push({
          x: Number((a * curX + c * curY + tx).toFixed(1)),
          y: Number((b * curX + d * curY + ty).toFixed(1)),
        });
      } else if (cmd === 'V' && nums.length >= 1) {
        curY = nums[0];
        pts.push({
          x: Number((a * curX + c * curY + tx).toFixed(1)),
          y: Number((b * curX + d * curY + ty).toFixed(1)),
        });
      }
    }
    if (pts.length >= 3) {
      maskContours.push(pts);
    }
  }

  if (maskContours.length === 0) {
    maskContours.push(
      generateRectMaskContours(canvasW * 0.15, canvasH * 0.15, canvasW * 0.7, canvasH * 0.7)[0]
    );
  }

  const centerAtFrame = (fIdx: number): Point2D => {
    const f = frames[fIdx] || refF;
    const [fa = 1, fb = 0, fc = 0, fd = 1, ftx = 0, fty = 0] = f.t || [1, 0, 0, 1, 0, 0];
    const fw = f.w > 0 ? f.w : assetW;
    const fh = f.h > 0 ? f.h : assetH;
    const lx = (f.x || 0) + fw / 2;
    const ly = (f.y || 0) + fh / 2;
    return {
      x: Number((fa * lx + fc * ly + ftx).toFixed(1)),
      y: Number((fb * lx + fd * ly + fty).toFixed(1)),
    };
  };

  const pStart = centerAtFrame(startFrame);
  const pMid = centerAtFrame(midFrame);
  const pEnd = centerAtFrame(endFrame);

  const motionPoints: Point2D[] = [pStart];
  if (
    midFrame !== startFrame &&
    midFrame !== endFrame &&
    Math.hypot(pMid.x - pStart.x, pMid.y - pStart.y) > 8 &&
    Math.hypot(pEnd.x - pMid.x, pEnd.y - pMid.y) > 8
  ) {
    motionPoints.push(pMid);
  }
  if (Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y) > 4) {
    motionPoints.push(pEnd);
  } else {
    motionPoints.push({
      x: Number((pStart.x + canvasW * 0.4).toFixed(1)),
      y: Number((pStart.y + canvasH * 0.4).toFixed(1)),
    });
  }

  return {
    maskContours,
    motionPoints,
    startFrame,
    endFrame,
  };
}

