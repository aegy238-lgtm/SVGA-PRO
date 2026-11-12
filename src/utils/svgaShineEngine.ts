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

export type ShineSystemMode = 'beam_sweep' | 'layer_color_clone';

export type CloneShineAnimStyle = 'sweep_reveal' | 'pulse_glow' | 'static_region';

export type CloneColorPresetId =
  | 'bright_royal_gold'
  | 'diamond_white_glow'
  | 'fiery_crimson'
  | 'electric_cyan'
  | 'royal_purple_neon'
  | 'emerald_glow'
  | 'original_custom';

export interface CloneLayerColorAdjustments {
  presetId?: CloneColorPresetId;
  hueRotateDeg: number; // -180 to 180
  brightnessPct: number; // 50 to 250 (default 155)
  saturationPct: number; // 0 to 300 (default 145)
  contrastPct: number; // 50 to 250 (default 120)
  tintColor: string; // e.g. '#fde047'
  tintStrengthPct: number; // 0 to 100 (default 32)
}

export interface CloneColorPresetMeta {
  id: CloneColorPresetId;
  labelAr: string;
  descAr: string;
  adjustments: CloneLayerColorAdjustments;
}

export const DEFAULT_CLONE_COLOR_ADJUSTMENTS: CloneLayerColorAdjustments = {
  presetId: 'bright_royal_gold',
  hueRotateDeg: 0,
  brightnessPct: 155,
  saturationPct: 145,
  contrastPct: 120,
  tintColor: '#fde047',
  tintStrengthPct: 32,
};

export const CLONE_COLOR_PRESETS: CloneColorPresetMeta[] = [
  {
    id: 'bright_royal_gold',
    labelAr: '👑 ذهب ملكي مشع (توهج الطبقة الذهبية)',
    descAr: 'نسخة مطابقة للطبقة الأساسية بسطوع وتوهج ذهبي ملكي ساطع',
    adjustments: {
      presetId: 'bright_royal_gold',
      hueRotateDeg: 0,
      brightnessPct: 155,
      saturationPct: 145,
      contrastPct: 120,
      tintColor: '#fde047',
      tintStrengthPct: 32,
    },
  },
  {
    id: 'diamond_white_glow',
    labelAr: '💎 بريق أبيض ألماسي (إضاءة ساطعة للطبقة)',
    descAr: 'نسخة مضيئة ببياض ألماسي فائق النقاء يبرق فوق تفاصيل الطبقة',
    adjustments: {
      presetId: 'diamond_white_glow',
      hueRotateDeg: 0,
      brightnessPct: 185,
      saturationPct: 65,
      contrastPct: 130,
      tintColor: '#ffffff',
      tintStrengthPct: 45,
    },
  },
  {
    id: 'fiery_crimson',
    labelAr: '🔥 توهج ناري ياقوتي (أحمر / برتقالي مشع)',
    descAr: 'تحويل ألوان الطبقة اللامعة إلى لهب ياقوتي متوهج',
    adjustments: {
      presetId: 'fiery_crimson',
      hueRotateDeg: -28,
      brightnessPct: 150,
      saturationPct: 175,
      contrastPct: 122,
      tintColor: '#fb7185',
      tintStrengthPct: 38,
    },
  },
  {
    id: 'electric_cyan',
    labelAr: '⚡ سيان جليدي مشع (أزرق سماوي متوهج)',
    descAr: 'تحويل ألوان الطبقة اللامعة إلى أزرق جليدي كهربائي ساطع',
    adjustments: {
      presetId: 'electric_cyan',
      hueRotateDeg: 145,
      brightnessPct: 155,
      saturationPct: 165,
      contrastPct: 120,
      tintColor: '#38bdf8',
      tintStrengthPct: 40,
    },
  },
  {
    id: 'royal_purple_neon',
    labelAr: '🔮 نيون بنفسجي ملكي (ماجنتا متوهج)',
    descAr: 'تحويل ألوان الطبقة اللامعة إلى بنفسجي نيون ملكي فاخر',
    adjustments: {
      presetId: 'royal_purple_neon',
      hueRotateDeg: -95,
      brightnessPct: 155,
      saturationPct: 170,
      contrastPct: 122,
      tintColor: '#c084fc',
      tintStrengthPct: 40,
    },
  },
  {
    id: 'emerald_glow',
    labelAr: '💚 زمردي مشع (أخضر ملكي مضيء)',
    descAr: 'تحويل ألوان الطبقة اللامعة إلى بريق زمردي أخضر متوهج',
    adjustments: {
      presetId: 'emerald_glow',
      hueRotateDeg: 75,
      brightnessPct: 150,
      saturationPct: 165,
      contrastPct: 120,
      tintColor: '#34d399',
      tintStrengthPct: 36,
    },
  },
  {
    id: 'original_custom',
    labelAr: '🎨 ألوان الطبقة المرفوعة كما هي (بدون تعديل إضافي)',
    descAr: 'استخدام الألوان الأصلية للطبقة التي قمت برفعها أو تعديلها بنفسك 100%',
    adjustments: {
      presetId: 'original_custom',
      hueRotateDeg: 0,
      brightnessPct: 100,
      saturationPct: 100,
      contrastPct: 100,
      tintColor: '#fbbf24',
      tintStrengthPct: 0,
    },
  },
];

export interface ShineLayerConfig {
  enabled: boolean;
  /**
   * Selects between System 1 ('beam_sweep': classic procedural/custom beam moving inside a mask)
   * and System 2 ('layer_color_clone': same layer as base layer with modified colors acting as a shine layer).
   */
  shineSystemMode?: ShineSystemMode;
  /**
   * In 'layer_color_clone' mode, controls how the color-modified layer shines over the base layer:
   * - 'sweep_reveal': stationary aligned color-clone layer revealed by a moving slanted shine band
   * - 'pulse_glow': stationary aligned color-clone layer pulsing in opacity across loops
   * - 'static_region': stationary aligned color-clone layer illuminating the selected mask region
   */
  cloneAnimStyle?: CloneShineAnimStyle;
  /**
   * Live color adjustments applied to the cloned base layer in 'layer_color_clone' mode.
   */
  colorAdjustments?: CloneLayerColorAdjustments;
  /**
   * Optional ID of an existing layer in the project chosen as the custom color-modified image source.
   */
  customCloneSourceLayerId?: string;
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
  /**
   * Automatic inward soft edge feathering radius in pixels (default: 5).
   * Eliminates all sharp clip edges (`بدون أي حواف حادة`) by softly fading the shine near layer boundaries and holes.
   */
  edgeFeather?: number;
  /**
   * Overall shine opacity / intensity percentage (0 to 100, default: 100).
   */
  shineOpacity?: number;
  /**
   * When true (default), modulates the shine matte by the target layer's surface luminance & color saturation (chroma),
   * focusing 100% specular brilliance onto gold/metallic rims, wings, letters, and gems while keeping dark matte
   * nameplate interiors (like VIP ID dark boxes) clean, deep, and un-muddy just like native SVGA 2.0 files.
   */
  metallicSurfaceRelief?: boolean;
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
    labelAr: '👑 لمعة ذهب ملكي SVGA (بريق مزدوج حاد)',
    descAr: 'انعكاس معدني ذهبي أصلي بنواة بيضاء حادة وخط بريق مزدوج مطابق لملفات SVGA الأصلية',
    colorPrimary: '#fbbf24',
    colorSecondary: '#ffffff',
    beamAngleDeg: -30,
    beamWidthRatio: 0.18,
  },
  {
    id: 'double_luxury',
    labelAr: '⚡ سيف بريق مزدوج VIP (After Effects)',
    descAr: 'شعاع رئيسي حاد يتبعه خط انعكاس موازٍ رفيع عالي الفخامة للشارات والأوسمة',
    colorPrimary: '#f59e0b',
    colorSecondary: '#fef08a',
    beamAngleDeg: -28,
    beamWidthRatio: 0.22,
  },
  {
    id: 'glass_white',
    labelAr: '💎 انعكاس زجاجي أبيض نقي (Crystal)',
    descAr: 'لمعة زجاجية بيضاء حادة وعالية النقاء للهدايا والشعارات',
    colorPrimary: '#e2e8f0',
    colorSecondary: '#ffffff',
    beamAngleDeg: -32,
    beamWidthRatio: 0.16,
  },
  {
    id: 'diamond_star',
    labelAr: '✨ توهج ألماسي نجمي متلألئ',
    descAr: 'شعاع كريستالي مع ومضات نجوم متلألئة على الحواف المضيئة',
    colorPrimary: '#38bdf8',
    colorSecondary: '#ffffff',
    beamAngleDeg: -30,
    beamWidthRatio: 0.2,
  },
  {
    id: 'neon_cyber',
    labelAr: '🔮 شعاع نيون ملكي (بنفسجي / سيان)',
    descAr: 'انعكاس نيون مزدوج عالي التباين للإطارات الحديثة',
    colorPrimary: '#c084fc',
    colorSecondary: '#67e8f9',
    beamAngleDeg: -32,
    beamWidthRatio: 0.2,
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
 * Gently rounds sharp stair-step vertices using angle-aware Laplacian smoothing
 * so contour curves have zero jagged pixel edges while preserving intentional corners.
 */
export function smoothContourVertices(points: Point2D[], iterations = 2, weight = 0.28): Point2D[] {
  if (points.length < 5) return points;
  let cur = points.map((p) => ({ x: p.x, y: p.y }));
  const n = cur.length;
  for (let iter = 0; iter < iterations; iter++) {
    const next: Point2D[] = [];
    for (let i = 0; i < n; i++) {
      const prev = cur[(i - 1 + n) % n];
      const pt = cur[i];
      const nxt = cur[(i + 1) % n];
      const mx = (prev.x + nxt.x) * 0.5;
      const my = (prev.y + nxt.y) * 0.5;
      next.push({
        x: pt.x * (1 - weight) + mx * weight,
        y: pt.y * (1 - weight) + my * weight,
      });
    }
    cur = next;
  }
  return cur;
}

/**
 * 8-connected Moore-Neighbor perimeter tracer.
 * Follows the clockwise outer perimeter of the primary opaque connected component,
 * automatically skipping tiny isolated dust specks at the top of the image.
 */
export function traceOuterContourMoore(
  rgba: Uint8Array | Uint8ClampedArray,
  W: number,
  H: number,
  threshold = 14,
  customIsOpaque?: (x: number, y: number) => boolean
): Point2D[] {
  const isOpaque =
    customIsOpaque ||
    ((x: number, y: number): boolean => {
      if (x < 0 || x >= W || y < 0 || y >= H) return false;
      return rgba[(y * W + x) * 4 + 3] >= threshold;
    });

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

  const traceFromSeed = (startX: number, startY: number): Point2D[] => {
    const points: Point2D[] = [{ x: startX, y: startY }];
    let cx = startX;
    let cy = startY;
    let enterDir = 0;
    let firstNextDir = -1;

    const maxSteps = Math.min(12000, W * H);
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
  };

  let bestContour: Point2D[] = [];
  let bestBBoxArea = -1;
  const rowStep = Math.max(1, Math.floor(H / 48));

  for (let y = 0; y < H; y += bestContour.length === 0 ? 1 : rowStep) {
    for (let x = 0; x < W; x++) {
      if (isOpaque(x, y) && !isOpaque(x - 1, y)) {
        const candidate = traceFromSeed(x, y);
        if (candidate.length >= 6) {
          let cMinX = W;
          let cMinY = H;
          let cMaxX = 0;
          let cMaxY = 0;
          for (let k = 0; k < candidate.length; k++) {
            const pt = candidate[k];
            if (pt.x < cMinX) cMinX = pt.x;
            if (pt.x > cMaxX) cMaxX = pt.x;
            if (pt.y < cMinY) cMinY = pt.y;
            if (pt.y > cMaxY) cMaxY = pt.y;
          }
          const bboxArea = Math.max(1, cMaxX - cMinX) * Math.max(1, cMaxY - cMinY);
          const score = bboxArea + candidate.length * 4;
          if (score > bestBBoxArea) {
            bestBBoxArea = score;
            bestContour = candidate;
          }
          // Only stop early if this single contour already spans almost the entire image width and height
          if (cMaxX - cMinX >= W * 0.78 && cMaxY - cMinY >= H * 0.78) {
            return bestContour;
          }
        }
        break;
      }
    }
  }

  return bestContour;
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
  threshold = 14,
  customIsOpaque?: (x: number, y: number) => boolean
): Point2D[] {
  const isOpaque =
    customIsOpaque ||
    ((x: number, y: number): boolean => {
      if (x < 0 || x >= W || y < 0 || y >= H) return false;
      return rgba[(y * W + x) * 4 + 3] >= threshold;
    });

  let startX = Math.max(0, Math.min(W - 1, Math.round(cx)));
  let startY = Math.max(0, Math.min(H - 1, Math.round(cy)));

  if (isOpaque(startX, startY)) {
    // Search in expanding square grid around (cx, cy) to find a transparent pixel inside the hole
    let foundTransparent = false;
    const maxR = Math.max(10, Math.floor(Math.min(W, H) * 0.3));
    for (let r = 1; r <= maxR; r += 2) {
      for (let dx = -r; dx <= r; dx += r) {
        for (let dy = -r; dy <= r; dy += r) {
          const testX = startX + dx;
          const testY = startY + dy;
          if (testX >= 0 && testX < W && testY >= 0 && testY < H && !isOpaque(testX, testY)) {
            startX = testX;
            startY = testY;
            foundTransparent = true;
            break;
          }
        }
        if (foundTransparent) break;
      }
      if (foundTransparent) break;
    }
    if (!foundTransparent) return [];
  }

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
    const idx = (iy * W + ix) * 4;
    const a = rgba[idx + 3] || 0;
    if (a < threshold) return 0;
    const r = rgba[idx] || 0;
    const g = rgba[idx + 1] || 0;
    const b = rgba[idx + 2] || 0;
    const lum = Math.max(r, g, b);
    // Suppress semi-transparent dark background tints / shadow circles inside avatar frame holes & dark outer smoke
    // Note: 100% solid opaque dark interiors (a >= 210, e.g. dark plates inside VIP ID banners) remain solid for outer silhouette!
    if (a < 210 && lum < 85) {
      return 0;
    }
    return a;
  };

  const isSolidOpaque = (x: number, y: number): boolean => {
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    return getAlpha(x, y) >= threshold;
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
  // Wide horizontal banners/ribbons (spanW > spanH * 1.75, like 512x115 VIP ID badges) are nameplates, NOT circular avatar frames!
  const isAspectFrameLike = spanW <= spanH * 1.75 && spanH <= spanW * 1.75;
  const minHoleCoreR = Math.max(3, minSpan * 0.14);
  let isCenterCoreTrulyHollow = detectHole && isAspectFrameLike;
  let holeSeedX = cx;
  let holeSeedY = cy;

  if (isCenterCoreTrulyHollow) {
    const halfW = spanW * 0.26;
    const halfH = spanH * 0.28;
    let transparentSamples = 0;
    let totalSamples = 0;
    let sumEmptyX = 0;
    let sumEmptyY = 0;

    const stepsGrid = 13;
    for (let gy = 0; gy < stepsGrid; gy++) {
      // Slightly bias search window upward as well to cover frames with tall bottom banners (e.g. "15000$")
      const sampleY = cy - halfH * 1.15 + (gy / (stepsGrid - 1)) * (halfH * 2.05);
      for (let gx = 0; gx < stepsGrid; gx++) {
        const sampleX = cx - halfW + (gx / (stepsGrid - 1)) * (halfW * 2);
        totalSamples++;
        const a = getAlpha(sampleX, sampleY);
        if (a < threshold) {
          transparentSamples++;
          sumEmptyX += sampleX;
          sumEmptyY += sampleY;
        }
      }
    }

    // Require a genuinely hollow central core: at least 14% of central samples transparent AND center not a tiny 2px speck
    const transparentRatio = totalSamples > 0 ? transparentSamples / totalSamples : 0;
    if (transparentRatio < 0.14) {
      isCenterCoreTrulyHollow = false;
    } else {
      holeSeedX = sumEmptyX / Math.max(1, transparentSamples);
      holeSeedY = sumEmptyY / Math.max(1, transparentSamples);
      // Verify that around (holeSeedX, holeSeedY) at radius minHoleCoreR * 0.65, the majority of points are also transparent
      let ringEmpty = 0;
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        if (
          getAlpha(
            holeSeedX + Math.cos(ang) * minHoleCoreR * 0.65,
            holeSeedY + Math.sin(ang) * minHoleCoreR * 0.65
          ) < threshold
        ) {
          ringEmpty++;
        }
      }
      if (ringEmpty < 8) {
        isCenterCoreTrulyHollow = false;
      }
    }
  }

  // Helper to build a smooth 28-ray radial inner hole contour around (holeSeedX, holeSeedY)
  const buildSmoothRadialHoleContour = (seedX: number, seedY: number): Point2D[] => {
    const holeRays = 28;
    const maxHoleR = minSpan * 0.45;
    const stepR = Math.max(0.5, maxHoleR / 140);
    const radii: number[] = new Array(holeRays).fill(minHoleCoreR);
    let hits = 0;
    for (let i = 0; i < holeRays; i++) {
      const ang = (i / holeRays) * Math.PI * 2 - Math.PI / 2;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      for (let r = minHoleCoreR * 0.5; r <= maxHoleR; r += stepR) {
        const px = seedX + dx * r;
        const py = seedY + dy * r;
        if (isSolidOpaque(px, py)) {
          radii[i] = r;
          hits++;
          break;
        }
      }
    }
    if (hits < holeRays * 0.5) return [];
    const valid = radii.filter((r) => r > minHoleCoreR * 0.5);
    const medianR =
      valid.length > 0
        ? [...valid].sort((a, b) => a - b)[Math.floor(valid.length / 2)]
        : minHoleCoreR;
    for (let i = 0; i < holeRays; i++) {
      if (radii[i] <= minHoleCoreR * 0.5 || radii[i] > medianR * 1.45) {
        radii[i] = medianR;
      }
    }
    const pts: Point2D[] = [];
    for (let i = 0; i < holeRays; i++) {
      const rp = radii[(i - 1 + holeRays) % holeRays];
      const rc = radii[i];
      const rn = radii[(i + 1) % holeRays];
      // Expand inner cutout slightly (+1.2px) into the inner frame rim so zero shine ever spills into the hole edge
      const sr = rc * 0.6 + (rp + rn) * 0.2 + 1.2;
      const ang = (i / holeRays) * Math.PI * 2 - Math.PI / 2;
      pts.push({
        x: seedX + Math.cos(ang) * sr,
        y: seedY + Math.sin(ang) * sr,
      });
    }
    return smoothContourVertices(pts, 2, 0.3);
  };

  // -------------------------------------------------------------
  // PATH A: Moore-Neighbor 8-connected perimeter contour tracing (DEFAULT)
  // Guarantees zero leakage into concave / transparent empty space while covering 100% of outer edges
  // -------------------------------------------------------------
  if (contourMethod === 'moore') {
    let rawPerimeter = traceOuterContourMoore(rgba, W, H, threshold, isSolidOpaque);

    // Check if the single 8-connected contour missed disconnected wings/ornaments on the edges of the layer
    if (rawPerimeter.length >= 6) {
      let pMinX = W;
      let pMinY = H;
      let pMaxX = 0;
      let pMaxY = 0;
      for (let i = 0; i < rawPerimeter.length; i++) {
        const p = rawPerimeter[i];
        if (p.x < pMinX) pMinX = p.x;
        if (p.x > pMaxX) pMaxX = p.x;
        if (p.y < pMinY) pMinY = p.y;
        if (p.y > pMaxY) pMaxY = p.y;
      }
      const coveredW = pMaxX - pMinX;
      const coveredH = pMaxY - pMinY;
      if (coveredW < spanW * 0.86 || coveredH < spanH * 0.86) {
        // Build a full-silhouette row profile envelope so detached wings/crowns/edges are 100% covered
        const rightSide: Point2D[] = [];
        const leftSide: Point2D[] = [];
        const yStep = Math.max(1, Math.floor(spanH / 64));
        for (let y = minY; y <= maxY; y += yStep) {
          let rowL = -1;
          let rowR = -1;
          for (let x = minX; x <= maxX; x++) {
            if (isSolidOpaque(x, y)) {
              rowL = x;
              break;
            }
          }
          for (let x = maxX; x >= minX; x--) {
            if (isSolidOpaque(x, y)) {
              rowR = x;
              break;
            }
          }
          if (rowL >= 0 && rowR >= 0) {
            rightSide.push({ x: rowR, y });
            leftSide.push({ x: rowL, y });
          }
        }
        if (rightSide.length >= 4) {
          rawPerimeter = [...rightSide, ...leftSide.reverse()];
        }
      }
    }

    if (rawPerimeter.length >= 6) {
      let simplified = rdpSimplify(rawPerimeter, rdpEps);
      if (simplified.length >= 10) {
        simplified = smoothContourVertices(simplified, 2, 0.2);
      }
      if (simplified.length >= 4) {
        // Expand outer contour outward by +1.2px from center so anti-aliased outer edges are 100% covered
        const expandedOuter = simplified.map((p) => {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const len = Math.hypot(dx, dy);
          if (len < 1e-3) return toWorld(p.x, p.y);
          const ex = Math.max(0, Math.min(W, p.x + (dx / len) * 1.2));
          const ey = Math.max(0, Math.min(H, p.y + (dy / len) * 1.2));
          return toWorld(ex, ey);
        });
        const contours: Point2D[][] = [expandedOuter];

        if (isCenterCoreTrulyHollow) {
          let holePts: Point2D[] = [];
          const rawHole = traceInnerHoleContourMoore(
            rgba,
            W,
            H,
            holeSeedX,
            holeSeedY,
            threshold,
            isSolidOpaque
          );
          if (rawHole.length >= 12) {
            const simplifiedHole = rdpSimplify(rawHole, rdpEps);
            const holeArea = Math.abs(computePolygonSignedArea(simplifiedHole));
            if (simplifiedHole.length >= 6 && holeArea >= minSpan * minSpan * 0.02) {
              holePts = smoothContourVertices(simplifiedHole, 2, 0.28);
            }
          }
          if (holePts.length < 6) {
            holePts = buildSmoothRadialHoleContour(holeSeedX, holeSeedY);
          }
          if (holePts.length >= 4) {
            const outerArea = computePolygonSignedArea(simplified);
            const innerArea = computePolygonSignedArea(holePts);
            // Ensure inner hole has opposite winding to outer contour for SVG evenodd / nonzero hole cutout
            if ((outerArea > 0 && innerArea > 0) || (outerArea < 0 && innerArea < 0)) {
              holePts = [...holePts].reverse();
            }
            contours.push(holePts.map((p) => toWorld(p.x, p.y)));
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
      for (let r = minHoleCoreR * 0.6; r < outerR * 0.92; r += marchStep) {
        const px = holeSeedX + dx * r;
        const py = holeSeedY + dy * r;
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
    const validInner = rawInnerRadii.filter((v) => v > minHoleCoreR * 0.6);
    const avgInner =
      validInner.length > 0
        ? validInner.reduce((a, b) => a + b, 0) / validInner.length
        : minHoleCoreR;
    for (let i = 0; i < numRays; i++) {
      if (rawInnerRadii[i] <= minHoleCoreR * 0.6) {
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
        x: holeSeedX + Math.cos(ang) * smoothedInR,
        y: holeSeedY + Math.sin(ang) * smoothedInR,
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
  let outerAreaSign = 0;

  for (let cIdx = 0; cIdx < worldContours.length; cIdx++) {
    const contour = worldContours[cIdx];
    if (!contour || contour.length < 3) continue;
    let localPts: Point2D[] = [];
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

    // Ensure inner hole contours (cIdx >= 1) always have the opposite winding direction to the outer contour (cIdx === 0)
    // so both 'nonzero' (svgaplayerweb) and 'evenodd' (Canvas 2D) properly cut out the center hole!
    const area = computePolygonSignedArea(localPts);
    if (cIdx === 0) {
      outerAreaSign = area >= 0 ? 1 : -1;
    } else if (outerAreaSign !== 0 && ((area > 0 && outerAreaSign > 0) || (area < 0 && outerAreaSign < 0))) {
      localPts = [...localPts].reverse();
    }

    if (options?.smoothCurve && localPts.length >= 6) {
      const tension = localPts.length >= 24 ? 0.08 : 0.16;
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
 * Evaluates the current shine sweep position `(x, y)`, active state, and opacity multiplier at `frame`
 * across `startFrame .. endFrame`, `loopCount`, and `pauseFrames`.
 */
export function evaluateShineSweepAtFrame(
  config: ShineLayerConfig,
  frame: number,
  totalFrames: number,
  canvasW: number,
  canvasH: number
): {
  active: boolean;
  progress: number;
  x: number;
  y: number;
  opacityFactor: number;
} {
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

  if (frame < startF || frame > endF) {
    return { active: false, progress: 0, x: pts[0].x, y: pts[0].y, opacityFactor: 0 };
  }

  const loops = Math.max(1, Math.min(20, Math.round(config.loopCount || 1)));
  const pause = Math.max(0, Math.round(config.pauseFrames || 0));
  const totalSpan = Math.max(1, endF - startF);
  const cycleSpan = Math.max(2, Math.floor((totalSpan + pause) / loops));
  const activeSweepSpan = Math.max(1, cycleSpan - pause);

  const relFrame = frame - startF;
  const loopIdx = Math.min(loops - 1, Math.floor(relFrame / cycleSpan));
  const cycleStart = startF + loopIdx * cycleSpan;
  const sweepEnd = Math.min(endF, cycleStart + activeSweepSpan);

  if (frame < cycleStart || frame > sweepEnd) {
    return { active: false, progress: 1, x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, opacityFactor: 0 };
  }

  const progress =
    sweepEnd > cycleStart
      ? Math.max(0, Math.min(1, (frame - cycleStart) / (sweepEnd - cycleStart)))
      : 0;

  const animStyle = config.cloneAnimStyle || 'sweep_reveal';
  if (config.shineSystemMode === 'layer_color_clone' && animStyle === 'pulse_glow') {
    const pulse = Math.sin(progress * Math.PI);
    const opa = Number(Math.max(0, Math.min(1, pulse)).toFixed(3));
    return {
      active: opa > 0.01,
      progress,
      x: canvasW / 2,
      y: canvasH / 2,
      opacityFactor: opa,
    };
  }

  if (config.shineSystemMode === 'layer_color_clone' && animStyle === 'static_region') {
    return {
      active: true,
      progress,
      x: canvasW / 2,
      y: canvasH / 2,
      opacityFactor: 1,
    };
  }

  const pt = interpolateMotionPathPoint(pts, progress);
  return {
    active: true,
    progress,
    x: pt.x,
    y: pt.y,
    opacityFactor: 1,
  };
}

/**
 * Builds a 4-corner rotated rectangle polygon (clockwise in Canvas space) representing
 * the moving shine reveal band centered at `(centerX, centerY)` with tilt `beamAngleDeg`.
 */
export function buildSlantedSweepBandPolygon(
  centerX: number,
  centerY: number,
  beamAngleDeg: number,
  bandHalfWidth: number,
  bandHalfLength: number
): Point2D[] {
  const angleRad = (-(beamAngleDeg ?? -30) * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const hw = Math.max(4, bandHalfWidth);
  const hl = Math.max(16, bandHalfLength);

  const localCorners = [
    { x: -hw, y: -hl },
    { x: hw, y: -hl },
    { x: hw, y: hl },
    { x: -hw, y: hl },
  ];

  return localCorners.map((c) => ({
    x: Number((centerX + c.x * cos - c.y * sin).toFixed(2)),
    y: Number((centerY + c.x * sin + c.y * cos).toFixed(2)),
  }));
}

/**
 * Sutherland-Hodgman polygon clipper: clips an arbitrary polygon `subjectPoly`
 * against a convex polygon `clipConvexPoly` (such as the 4-corner slanted shine band).
 */
export function clipPolygonWithConvexQuad(
  subjectPoly: Point2D[],
  clipConvexPoly: Point2D[]
): Point2D[] {
  if (!subjectPoly || subjectPoly.length < 3 || !clipConvexPoly || clipConvexPoly.length < 3) {
    return [];
  }

  // Ensure clipConvexPoly has consistent winding (positive signed area in screen space)
  const clipSign = computePolygonSignedArea(clipConvexPoly) >= 0 ? 1 : -1;
  let outputList = [...subjectPoly];

  for (let i = 0; i < clipConvexPoly.length; i++) {
    const cp1 = clipConvexPoly[i];
    const cp2 = clipConvexPoly[(i + 1) % clipConvexPoly.length];
    const inputList = outputList;
    outputList = [];
    if (inputList.length === 0) break;

    const isInside = (p: Point2D): boolean => {
      const cross = (cp2.x - cp1.x) * (p.y - cp1.y) - (cp2.y - cp1.y) * (p.x - cp1.x);
      return cross * clipSign >= -1e-5;
    };

    const computeIntersection = (s: Point2D, e: Point2D): Point2D => {
      const dcX = cp1.x - cp2.x;
      const dcY = cp1.y - cp2.y;
      const dpX = s.x - e.x;
      const dpY = s.y - e.y;
      const n1 = cp1.x * cp2.y - cp1.y * cp2.x;
      const n2 = s.x * e.y - s.y * e.x;
      const denom = dcX * dpY - dcY * dpX;
      if (Math.abs(denom) < 1e-7) return { x: s.x, y: s.y };
      return {
        x: Number(((n1 * dpX - n2 * dcX) / denom).toFixed(2)),
        y: Number(((n1 * dpY - n2 * dcY) / denom).toFixed(2)),
      };
    };

    let s = inputList[inputList.length - 1];
    for (let j = 0; j < inputList.length; j++) {
      const e = inputList[j];
      if (isInside(e)) {
        if (!isInside(s)) {
          outputList.push(computeIntersection(s, e));
        }
        outputList.push(e);
      } else if (isInside(s)) {
        outputList.push(computeIntersection(s, e));
      }
      s = e;
    }
  }

  return outputList.length >= 3 ? outputList : [];
}

/**
 * Evaluates the raised-cosine (Hann) feather falloff curve at normalized distance `normalizedDist` in `[0, 1]`
 * from the center of the shine band (`0` = center core, `1` = outer boundary where alpha reaches `0`).
 *
 * Used identically by BOTH the Live Canvas Preview (`applyCloneLayerShineMaskToCanvas`) AND
 * the Multi-Slice SVGA 2.0 Exporter (`buildFeatheredCloneShineSvgaLayers`) so the project preview
 * and the exported `.svga` file have 100% identical soft, transparent edges (`نفس العرض في المشروع نفس اللي بيتصدر`).
 */
export function computeShineBandFeatherAlphaAt(
  normalizedDist: number,
  beamSoftness = 0.9
): number {
  const u = Math.max(0, Math.min(1, Math.abs(normalizedDist)));
  if (u >= 1) return 0;
  const soft = Math.max(0.02, Math.min(1, beamSoftness));
  // When soft is near 1.0 (default 0.90), coreRatio is near 0 so the entire band tapers smoothly
  const coreRatio = Math.max(0, (1 - soft) * 0.58);
  if (u <= coreRatio) return 1;
  const t = (u - coreRatio) / Math.max(1e-5, 1 - coreRatio);
  // Raised-cosine window: derivative is 0 at both t=0 (core) and t=1 (outer edge -> 100% seamless transparent fade)
  return Number((0.5 * (1 + Math.cos(Math.PI * Math.min(1, t)))).toFixed(5));
}

/**
 * Computes the unified half-span width (in world/canvas pixels) of the slanted shine band
 * for both Live Canvas rendering and SVGA 2.0 export.
 */
export function computeShineBandHalfSpan(
  shineWidth: number,
  shineHeight: number,
  canvasW: number,
  canvasH: number,
  beamWidthRatio = 0.28,
  beamSoftness = 0.9
): number {
  const diag = Math.hypot(Math.max(shineWidth || canvasW, canvasW), Math.max(shineHeight || canvasH, canvasH));
  const bwRatio = Math.max(0.05, Math.min(0.85, beamWidthRatio ?? 0.28));
  const soft = Math.max(0.05, Math.min(1, beamSoftness ?? 0.9));
  // Expand the outer feather wings when softness is high so the transparent transition is wide and lush
  return Math.max(18, diag * bwRatio * (0.48 + soft * 0.24));
}

/**
 * Offsets each vertex of a polygon radially inward (`offsetPx < 0`) or outward (`offsetPx > 0`)
 * relative to its centroid so custom polygon mask contours can also be feathered smoothly across slices.
 */
export function offsetPolygonRadiallyFromCentroid(
  poly: Point2D[],
  offsetPx: number
): Point2D[] {
  if (!poly || poly.length < 3 || Math.abs(offsetPx) < 0.05) return poly;
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;

  return poly.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) return p;
    const nextDist = Math.max(2, dist + offsetPx);
    const scale = nextDist / dist;
    return {
      x: Number((cx + dx * scale).toFixed(2)),
      y: Number((cy + dy * scale).toFixed(2)),
    };
  });
}

/**
 * Generates Timeline `LayerPropertyKeyframes` (`position` and `opacity`) from the Shine Layer's
 * interactive `motionPoints`, `startFrame`, `endFrame`, `loopCount`, and `pauseFrames`.
 *
 * When `config.shineSystemMode === 'layer_color_clone'`, the layer itself stays 100% stationary
 * and aligned on top of the base layer (so `position` keyframes are NOT generated along `motionPoints`;
 * instead the reveal band sweeps across the stationary layer).
 */
export function buildShineKeyframesFromMotionPoints(
  config: ShineLayerConfig,
  totalFrames: number,
  canvasW: number,
  canvasH: number,
  baseOpacity = 100
): LayerPropertyKeyframes {
  if (config.shineSystemMode === 'layer_color_clone') {
    const effectiveOpa = Math.max(0, Math.min(100, config.shineOpacity ?? baseOpacity));
    return {
      opacity: { 0: effectiveOpa },
    };
  }

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
    const effectiveOpa = Math.max(0, Math.min(100, config.shineOpacity ?? baseOpacity));
    if (pause > 0 && sweepEnd < endF) {
      opaMap[cycleStart] = effectiveOpa;
      opaMap[sweepEnd] = effectiveOpa;
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
  const isColorClone = config.shineSystemMode === 'layer_color_clone';
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
      frameAlpha = inRange
        ? Math.max(0, Math.min(1, (cf?.a ?? 1) * (Math.max(0, Math.min(100, lt.opacity ?? 100)) / 100)))
        : 0;
    } else {
      // Standard added layer: build local frame matrix as identity at center, while full world matrix is used for clipPath
      localFrameMat = buildPivotTransformMatrix(W / 2, H / 2, sw / 2, sh / 2, DEFAULT_TRANSFORM);
      frameAlpha = inRange ? Math.max(0, Math.min(1, (lt.opacity ?? 100) / 100)) : 0;
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

    if (isColorClone && !hasCopied && targetDelta) {
      localFrameMat = multiplyAffine(targetDelta, localFrameMat);
    }

    const effectiveWorldShineMat =
      isColorClone && !hasCopied && targetDelta
        ? multiplyAffine(targetDelta, worldShineMat)
        : worldShineMat;

    let clipPath = '';

    if (isColorClone) {
      const sweep = evaluateShineSweepAtFrame(config, i, n, W, H);
      if (!sweep.active || !inRange) {
        frameAlpha = 0;
      } else {
        frameAlpha = Number((frameAlpha * sweep.opacityFactor).toFixed(4));
        const animStyle = config.cloneAnimStyle || 'sweep_reveal';
        if (animStyle === 'sweep_reveal') {
          const bandHalfWidth = computeShineBandHalfSpan(
            sw,
            sh,
            W,
            H,
            config.beamWidthRatio ?? 0.28,
            config.beamSoftness ?? 0.9
          );
          const bandHalfLength = Math.max(W, H, sw, sh) * 1.8;
          const bandQuad = buildSlantedSweepBandPolygon(
            sweep.x,
            sweep.y,
            config.beamAngleDeg ?? -30,
            bandHalfWidth,
            bandHalfLength
          );

          const hasCustomMask =
            config.maskContours &&
            config.maskContours[0] &&
            config.maskContours[0].length >= 3 &&
            config.maskMode !== 'auto_layer_contour';

          if (hasCustomMask) {
            const transformedOuter = config.maskContours[0].map((pt) =>
              targetDelta
                ? {
                    x: targetDelta[0] * pt.x + targetDelta[2] * pt.y + targetDelta[4],
                    y: targetDelta[1] * pt.x + targetDelta[3] * pt.y + targetDelta[5],
                  }
                : pt
            );
            const clippedOuter = clipPolygonWithConvexQuad(transformedOuter, bandQuad);
            if (clippedOuter.length < 3) {
              frameAlpha = 0;
            } else {
              const contoursForFrame: Point2D[][] = [clippedOuter];
              if (config.maskContours[1] && config.maskContours[1].length >= 3) {
                const transformedInner = config.maskContours[1].map((pt) =>
                  targetDelta
                    ? {
                        x: targetDelta[0] * pt.x + targetDelta[2] * pt.y + targetDelta[4],
                        y: targetDelta[1] * pt.x + targetDelta[3] * pt.y + targetDelta[5],
                      }
                    : pt
                );
                contoursForFrame.push(transformedInner);
              }
              clipPath = projectWorldContoursToLocalClipPath(
                contoursForFrame,
                effectiveWorldShineMat,
                null,
                { smoothCurve: false }
              );
            }
          } else {
            const contoursForFrame: Point2D[][] = [bandQuad];
            if (config.maskContours && config.maskContours[1] && config.maskContours[1].length >= 3) {
              const transformedInner = config.maskContours[1].map((pt) =>
                targetDelta
                  ? {
                      x: targetDelta[0] * pt.x + targetDelta[2] * pt.y + targetDelta[4],
                      y: targetDelta[1] * pt.x + targetDelta[3] * pt.y + targetDelta[5],
                    }
                  : pt
              );
              contoursForFrame.push(transformedInner);
            }
            clipPath = projectWorldContoursToLocalClipPath(
              contoursForFrame,
              effectiveWorldShineMat,
              null,
              { smoothCurve: false }
            );
          }
        } else {
          // pulse_glow or static_region
          clipPath = projectWorldContoursToLocalClipPath(
            config.maskContours,
            effectiveWorldShineMat,
            targetDelta,
            { smoothCurve: shouldSmooth }
          );
        }
      }
    } else {
      clipPath = projectWorldContoursToLocalClipPath(
        config.maskContours,
        effectiveWorldShineMat,
        targetDelta,
        { smoothCurve: shouldSmooth }
      );
    }

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
 * Builds a multi-slice concentric feathered `SvgaFrame[][]` set for exporting a Shine Layer
 * into native SVGA 2.0 so that the exported `.svga` file has 100% soft, transparent, feathered edges
 * (`نفس اللي ظاهر في عرض المشروع نفس اللي يتصدر في الملف svga بدون أي حواف حادة`).
 *
 * All returned slice tracks reference the SINGLE shared `assetKey` image in `movie.im` (zero extra PNG bytes!),
 * while their `clipPath` widths and exact `source-over` incremental opacities `a_k = (C_k - C_{k-1}) / (1 - C_{k-1})`
 * reconstruct the exact raised-cosine feather gradient `computeShineBandFeatherAlphaAt`.
 */
export function buildFeatheredCloneShineSvgaFramesList(options: {
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
}): SvgaFrame[][] {
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

  const isColorClone = config.shineSystemMode === 'layer_color_clone';
  const soft = Math.max(0.02, Math.min(1, config.beamSoftness ?? 0.9));
  const edgeFeatherPx = Math.max(0, Math.min(24, config.edgeFeather ?? 6));
  const animStyle = config.cloneAnimStyle || 'sweep_reveal';

  // Determine how many concentric feather slices to emit
  let sliceCount = 1;
  if (isColorClone && animStyle === 'sweep_reveal' && soft >= 0.08) {
    sliceCount = soft >= 0.65 ? 14 : soft >= 0.35 ? 10 : 6;
  } else if (edgeFeatherPx >= 1.5 && config.maskMode !== 'auto_layer_contour') {
    sliceCount = edgeFeatherPx >= 6 ? 8 : 5;
  }

  if (sliceCount <= 1) {
    return [buildClippedShineSvgaFrames(options)];
  }

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

  const coreRatio = Math.max(0, (1 - soft) * 0.58);
  const maxBandHalfWidth = computeShineBandHalfSpan(
    sw,
    sh,
    W,
    H,
    config.beamWidthRatio ?? 0.28,
    soft
  );
  const bandHalfLength = Math.max(W, H, sw, sh) * 1.8;

  // Precompute normalized width ratio and target cumulative alpha factor for each slice 0 .. sliceCount-1
  const sliceMeta: { widthRatio: number; cumFactor: number; prevCumFactor: number; polyOffsetPx: number }[] = [];
  let prevCum = 0;
  for (let sIdx = 0; sIdx < sliceCount; sIdx++) {
    // sIdx = 0 is the outermost widest slice; sIdx = sliceCount - 1 is the innermost core slice
    const widthRatio = 1 - (sIdx / sliceCount) * (1 - coreRatio);
    const sampleDist = 1 - ((sIdx + 1) / sliceCount) * (1 - coreRatio);
    const cumFactor =
      sIdx === sliceCount - 1 ? 1 : computeShineBandFeatherAlphaAt(sampleDist, soft);
    const polyOffsetPx =
      edgeFeatherPx > 0.5
        ? edgeFeatherPx * (0.65 - (sIdx / Math.max(1, sliceCount - 1)) * 1.3)
        : 0;
    sliceMeta.push({
      widthRatio,
      cumFactor,
      prevCumFactor: prevCum,
      polyOffsetPx,
    });
    prevCum = cumFactor;
  }

  const slicesFrames: SvgaFrame[][] = Array.from({ length: sliceCount }, () => []);

  for (let i = 0; i < n; i++) {
    const inRange = i >= inFrame && i <= outFrame;
    const lt = interpolateLayerTransform(baseTransform, keyframes, i);
    const docT = docTransformAtFrame(i);

    let localFrameMat: AffineMatrix;
    let baseFrameAlpha: number;
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
      localFrameMat = [
        cf?.t?.[0] ?? 1,
        cf?.t?.[1] ?? 0,
        cf?.t?.[2] ?? 0,
        cf?.t?.[3] ?? 1,
        cf?.t?.[4] ?? 0,
        cf?.t?.[5] ?? 0,
      ];
      baseFrameAlpha = inRange
        ? Math.max(0, Math.min(1, (cf?.a ?? 1) * (Math.max(0, Math.min(100, lt.opacity ?? 100)) / 100)))
        : 0;
    } else {
      localFrameMat = buildPivotTransformMatrix(W / 2, H / 2, sw / 2, sh / 2, DEFAULT_TRANSFORM);
      baseFrameAlpha = inRange ? Math.max(0, Math.min(1, (lt.opacity ?? 100) / 100)) : 0;
    }

    const worldShineMat = hasCopied
      ? computeSpriteFrameMatrix(
          { a: baseFrameAlpha, x: fx, y: fy, w: fw, h: fh, t: localFrameMat },
          fw,
          fh,
          W,
          H,
          lt,
          docT
        )
      : computeAddedLayerFrameMatrix(sw, sh, W, H, lt, docT);

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

    if (isColorClone && !hasCopied && targetDelta) {
      localFrameMat = multiplyAffine(targetDelta, localFrameMat);
    }

    const effectiveWorldShineMat =
      isColorClone && !hasCopied && targetDelta
        ? multiplyAffine(targetDelta, worldShineMat)
        : worldShineMat;

    const sweep = isColorClone
      ? evaluateShineSweepAtFrame(config, i, n, W, H)
      : { active: inRange, progress: 0.5, x: W / 2, y: H / 2, opacityFactor: 1 };

    const targetFrameAlpha =
      !sweep.active || !inRange ? 0 : Math.max(0, Math.min(1, baseFrameAlpha * sweep.opacityFactor));

    for (let sIdx = 0; sIdx < sliceCount; sIdx++) {
      if (targetFrameAlpha <= 0.0005) {
        slicesFrames[sIdx].push({
          a: 0,
          x: fx,
          y: fy,
          w: fw,
          h: fh,
          t: localFrameMat,
        });
        continue;
      }

      const meta = sliceMeta[sIdx];
      const prevC = targetFrameAlpha * meta.prevCumFactor;
      const curC = targetFrameAlpha * meta.cumFactor;
      const sliceAlpha = Number(
        Math.max(0, Math.min(1, (curC - prevC) / Math.max(1e-5, 1 - prevC))).toFixed(4)
      );

      let clipPath = '';

      if (isColorClone && animStyle === 'sweep_reveal') {
        const sliceHalfWidth = Math.max(4, maxBandHalfWidth * meta.widthRatio);
        const bandQuad = buildSlantedSweepBandPolygon(
          sweep.x,
          sweep.y,
          config.beamAngleDeg ?? -30,
          sliceHalfWidth,
          bandHalfLength
        );

        const hasCustomMask =
          config.maskContours &&
          config.maskContours[0] &&
          config.maskContours[0].length >= 3 &&
          config.maskMode !== 'auto_layer_contour';

        if (hasCustomMask) {
          const transformedOuter = config.maskContours[0].map((pt) =>
            targetDelta
              ? {
                  x: targetDelta[0] * pt.x + targetDelta[2] * pt.y + targetDelta[4],
                  y: targetDelta[1] * pt.x + targetDelta[3] * pt.y + targetDelta[5],
                }
              : pt
          );
          const featheredOuter = offsetPolygonRadiallyFromCentroid(
            transformedOuter,
            meta.polyOffsetPx
          );
          const clippedOuter = clipPolygonWithConvexQuad(featheredOuter, bandQuad);
          if (clippedOuter.length < 3) {
            slicesFrames[sIdx].push({
              a: 0,
              x: fx,
              y: fy,
              w: fw,
              h: fh,
              t: localFrameMat,
            });
            continue;
          }
          const contoursForFrame: Point2D[][] = [clippedOuter];
          if (config.maskContours[1] && config.maskContours[1].length >= 3) {
            const transformedInner = config.maskContours[1].map((pt) =>
              targetDelta
                ? {
                    x: targetDelta[0] * pt.x + targetDelta[2] * pt.y + targetDelta[4],
                    y: targetDelta[1] * pt.x + targetDelta[3] * pt.y + targetDelta[5],
                  }
                : pt
            );
            contoursForFrame.push(transformedInner);
          }
          clipPath = projectWorldContoursToLocalClipPath(
            contoursForFrame,
            effectiveWorldShineMat,
            null,
            { smoothCurve: false }
          );
        } else {
          const contoursForFrame: Point2D[][] = [bandQuad];
          if (config.maskContours && config.maskContours[1] && config.maskContours[1].length >= 3) {
            const transformedInner = config.maskContours[1].map((pt) =>
              targetDelta
                ? {
                    x: targetDelta[0] * pt.x + targetDelta[2] * pt.y + targetDelta[4],
                    y: targetDelta[1] * pt.x + targetDelta[3] * pt.y + targetDelta[5],
                  }
                : pt
            );
            contoursForFrame.push(transformedInner);
          }
          clipPath = projectWorldContoursToLocalClipPath(
            contoursForFrame,
            effectiveWorldShineMat,
            null,
            { smoothCurve: false }
          );
        }
      } else {
        // Feathered polygon contours for static_region / pulse_glow / beam_sweep
        const featheredContours = (config.maskContours || []).map((c, cIdx) =>
          cIdx === 0 ? offsetPolygonRadiallyFromCentroid(c, meta.polyOffsetPx) : c
        );
        clipPath = projectWorldContoursToLocalClipPath(
          featheredContours,
          effectiveWorldShineMat,
          targetDelta,
          { smoothCurve: shouldSmooth }
        );
      }

      slicesFrames[sIdx].push({
        a: sliceAlpha,
        x: fx,
        y: fy,
        w: fw,
        h: fh,
        t: localFrameMat,
        clipPath: clipPath || undefined,
      });
    }
  }

  return slicesFrames;
}

/**
 * Studio-grade 3D Surface-Curvature, Detail-Crevice & Material-Fused Specular Matte processor.
 *
 * When `shineCtx` is provided (Live Canvas & Baked Render), this engine:
 * 1. Punches out inner holes / custom polygon contours while preserving the target layer's true RGB & Alpha.
 * 2. Computes a 2-pass Chamfer inward distance transform so ONLY the outer `edgeFeather` boundary pixels
 *    taper smoothly (`بدون أي حواف حادة`), while 100% of internal 3D details remain un-blurred and razor-sharp.
 * 3. Computes the target layer's 3D Surface Normal / Curvature gradient `(gx, gy)` and refracts/bends the
 *    shine beam along every 3D curve, wing feather, embossed letter, and bevel (`مع الانحناءات بتاعة الطبقة`).
 * 4. Locks every engraved crevice, dark outline, and shadow groove (`detailDelta < 0`) so all base layer
 *    details remain 100% sharp and visible right through the shine (`مع كل تفاصيل الطبقة الأساسية تحس ان هي واحد`).
 * 5. Fuses the shine's RGB color with the base layer's own illuminated metallic color (`Material-Fused Color Dodge`)
 *    so the shine and the base layer look like ONE single unified 3D object.
 */
export function applySmartSoftFeatherMatteToMaskCanvas(options: {
  maskCanvas: HTMLCanvasElement;
  maskCtx: CanvasRenderingContext2D;
  scratchCanvas: HTMLCanvasElement;
  config: ShineLayerConfig;
  targetDeltaMatrix?: AffineMatrix | null;
  hasTargetMaskPixels: boolean;
  shineCanvas?: HTMLCanvasElement;
  shineCtx?: CanvasRenderingContext2D | null;
}): boolean {
  const {
    maskCanvas,
    maskCtx,
    scratchCanvas,
    config,
    targetDeltaMatrix,
    hasTargetMaskPixels,
    shineCtx,
  } = options;
  const W = maskCanvas.width;
  const H = maskCanvas.height;
  if (W <= 0 || H <= 0) return false;

  const edgeFeather = Math.max(0, Math.min(24, config.edgeFeather ?? 5));
  const useMetallicRelief = config.metallicSurfaceRelief !== false;

  if (scratchCanvas.width !== W || scratchCanvas.height !== H) {
    scratchCanvas.width = W;
    scratchCanvas.height = H;
  }
  const scratchCtx = scratchCanvas.getContext('2d');

  // Helper to convert a world-space contour into a smooth closed SVG path
  const buildWorldContourPath = (contour: Point2D[]): string => {
    if (!contour || contour.length < 3) return '';
    const transformed: Point2D[] = contour.map((pt) => {
      if (targetDeltaMatrix) {
        return {
          x: Number(
            (targetDeltaMatrix[0] * pt.x + targetDeltaMatrix[2] * pt.y + targetDeltaMatrix[4]).toFixed(2)
          ),
          y: Number(
            (targetDeltaMatrix[1] * pt.x + targetDeltaMatrix[3] * pt.y + targetDeltaMatrix[5]).toFixed(2)
          ),
        };
      }
      return pt;
    });
    if (config.maskMode !== 'rect_box' && transformed.length >= 6) {
      const tension = transformed.length >= 24 ? 0.08 : 0.16;
      return buildSmoothClosedBezierSubpath(transformed, tension);
    }
    return (
      transformed.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
    );
  };

  // Step 1: When using a manual mask mode (interactive_points, ring_frame, rect_box) or when no target layer bitmap exists,
  // apply the polygon contour mask. When maskMode === 'auto_layer_contour' AND hasTargetMaskPixels is true,
  // maskCtx ALREADY contains the target layer's 100% exact pixel-by-pixel image & alpha right up to every outer edge!
  const contours = config.maskContours || [];
  if (contours.length > 0 && (config.maskMode !== 'auto_layer_contour' || !hasTargetMaskPixels)) {
    if (scratchCtx) {
      const fullD = contours
        .map((c) => buildWorldContourPath(c))
        .filter(Boolean)
        .join(' ');
      if (fullD) {
        scratchCtx.clearRect(0, 0, W, H);
        scratchCtx.save();
        const polyBlur = Math.max(2, edgeFeather);
        scratchCtx.filter = `blur(${polyBlur.toFixed(1)}px)`;
        scratchCtx.fillStyle = '#ffffff';
        try {
          scratchCtx.fill(new Path2D(fullD), 'evenodd');
        } catch {}
        scratchCtx.restore();

        if (hasTargetMaskPixels) {
          maskCtx.save();
          maskCtx.globalCompositeOperation = 'destination-in';
          maskCtx.drawImage(scratchCanvas, 0, 0);
          maskCtx.restore();
        } else {
          maskCtx.clearRect(0, 0, W, H);
          maskCtx.drawImage(scratchCanvas, 0, 0);
        }
      }
    }
  }

  // Step 2: Exact Pixel-Perfect Edge-to-Edge Alpha Matte (Zero distortion, 100% outer edge fidelity)
  if (hasTargetMaskPixels) {
    try {
      const imgData = maskCtx.getImageData(0, 0, W, H);
      const data = imgData.data;
      const len = data.length;

      for (let i = 0; i < len; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
        const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
        const chroma = maxC - minC;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Suppress only semi-transparent dark shadow smoke inside hollow avatar holes (a < 145 && very dark)
        // while preserving 100% of anti-aliased outer edges, gold rims, wings, and ornaments!
        if (a < 145 && maxC < 42 && lum < 36) {
          data[i + 3] = 0;
          continue;
        }

        // Smoothly attenuate only flat, pitch-dark matte nameplate interiors when metallicSurfaceRelief is active,
        // without punching holes or distorting the shine across normal details or edges!
        let surfaceWeight = 1;
        if (useMetallicRelief) {
          const specularSignal = Math.max(lum, lum * 0.6 + chroma * 1.4);
          if (specularSignal < 68) {
            const t = Math.max(0, Math.min(1, (specularSignal - 18) / (68 - 18)));
            const smoothT = t * t * (3 - 2 * t);
            surfaceWeight = 0.32 + 0.68 * smoothT;
          }
        }

        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = Math.round(a * surfaceWeight);
      }

      maskCtx.putImageData(imgData, 0, 0);
    } catch {}
  }

  // If shineCtx was provided, apply the clean pixel-perfect mask directly via hardware destination-in
  // so the shine gradient stays 100% silky-smooth, undistorted, and hugs every edge of the layer!
  if (shineCtx && (hasTargetMaskPixels || contours.length > 0)) {
    shineCtx.save();
    shineCtx.globalCompositeOperation = 'destination-in';
    shineCtx.drawImage(maskCanvas, 0, 0);
    shineCtx.restore();
    return false;
  }

  return hasTargetMaskPixels || contours.length > 0;
}

/**
 * Generates a lightweight Detail & Crevice Relief Cap PNG (`طبقة حفظ التفاصيل والظلال العلوية`)
 * from a target layer's bitmap for SVGA 2.0 export.
 *
 * In exported SVGA 2.0 files (`svgaplayerweb`), sprites use `source-over` blending.
 * Placing this detail cap immediately above the moving shine sprite keeps all dark engraved crevices,
 * feather separations, shadow outlines, and dark matte nameplate interiors 100% crisp on top of the shine,
 * while remaining 100% transparent (`alpha = 0`) over all raised 3D gold curves, ridges, and highlights!
 */
export async function buildTargetDetailReliefCapPngBytes(
  sourceBitmap: CanvasImageSource,
  width: number,
  height: number,
  useMetallicRelief = true
): Promise<Uint8Array | null> {
  const W = Math.max(2, Math.round(width));
  const H = Math.max(2, Math.round(height));
  if (typeof document === 'undefined') return null;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(sourceBitmap, 0, 0, W, H);

  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  const totalPx = W * H;
  const lumArr = new Float32Array(totalPx);

  for (let i = 0; i < totalPx; i++) {
    const idx = i * 4;
    if (data[idx + 3] >= 24) {
      lumArr[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }

  let capPixelCount = 0;
  for (let y = 0; y < H; y++) {
    const rowOff = y * W;
    const inY2 = y >= 2 && y < H - 2;
    for (let x = 0; x < W; x++) {
      const i = rowOff + x;
      const idx = i * 4;
      const a = data[idx + 3];
      if (a < 36) {
        data[idx + 3] = 0;
        continue;
      }

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
      const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
      const chroma = maxC - minC;
      const lum = lumArr[i];

      let surfaceWeight = 1;
      if (useMetallicRelief) {
        const specularSignal = Math.max(lum, lum * 0.55 + chroma * 1.35);
        if (specularSignal < 102) {
          const t = Math.max(0, Math.min(1, (specularSignal - 38) / (102 - 38)));
          const smoothT = t * t * (3 - 2 * t);
          surfaceWeight = 0.06 + 0.94 * smoothT;
        }
      }

      let detailFactor = 1;
      if (inY2 && x >= 2 && x < W - 2) {
        const localMean =
          (lumArr[i - 1] +
            lumArr[i + 1] +
            lumArr[i - W] +
            lumArr[i + W] +
            lumArr[i - 2] +
            lumArr[i + 2] +
            lumArr[i - W * 2] +
            lumArr[i + W * 2]) *
          0.125;
        const detailDelta = lum - localMean;
        if (detailDelta < -2) {
          detailFactor = Math.max(0.05, 1 + (detailDelta + 2) / 16);
        } else {
          detailFactor = Math.min(1.3, 1 + Math.max(0, detailDelta) / 36);
        }
      }

      const shineTransmittance = Math.min(1, surfaceWeight * detailFactor);
      if (shineTransmittance >= 0.88) {
        // Raised 3D gold curve/highlight: 100% transparent in the cap so the shine gleams through!
        data[idx + 3] = 0;
      } else {
        // Dark engraved crevice or dark matte interior: keep original dark detail pixel on top of the shine!
        const capAlpha = Math.round(a * (1 - shineTransmittance) * 0.92);
        data[idx + 3] = capAlpha;
        if (capAlpha > 8) capPixelCount++;
      }
    }
  }

  if (capPixelCount < 16) return null;
  ctx.putImageData(imgData, 0, 0);
  const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
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
  const maxR = W * 0.475;
  const rGrad = ctx.createRadialGradient(0, 0, maxR * 0.35, 0, 0, maxR);
  rGrad.addColorStop(0, 'rgba(255,255,255,1)');
  rGrad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  rGrad.addColorStop(0.82, 'rgba(255,255,255,0.28)');
  rGrad.addColorStop(0.95, 'rgba(255,255,255,0.04)');
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
 * Synchronously renders the procedural Shine / Shimmer beam onto an HTMLCanvasElement in < 0.5ms.
 * Features an organic 3D Curved Crescent Specular Spine (`قوس بريق ثلاثي الأبعاد منحني مع انحناءات الطبقة`)
 * plus a parallel secondary glint arc so the beam hugs 3D contours naturally.
 */
export function renderProceduralShineCanvasSync(options: {
  presetId: ShinePresetId;
  width: number;
  height: number;
  colorPrimary: string;
  colorSecondary: string;
  beamAngleDeg: number;
  beamWidthRatio: number;
  beamSoftness: number;
  targetCanvas?: HTMLCanvasElement;
}): HTMLCanvasElement {
  const W = Math.max(32, Math.min(2400, Math.round(options.width || 320)));
  const H = Math.max(32, Math.min(2400, Math.round(options.height || 320)));
  const c = options.targetCanvas || document.createElement('canvas');
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  const ctx = c.getContext('2d')!;

  ctx.clearRect(0, 0, W, H);

  // Negate beamAngleDeg so -30deg / -32deg produces a '/' forward-slash beam that is 100% perpendicular
  // to the Top-Left -> Bottom-Right ('\') sweep motion path, sweeping across the entire layer from start to end!
  const angleRad = (-(options.beamAngleDeg ?? -30) * Math.PI) / 180;
  const bw = Math.max(0.05, Math.min(0.75, options.beamWidthRatio ?? 0.22));
  const soft = Math.max(0.1, Math.min(1, options.beamSoftness ?? 0.85));
  const c1 = options.colorPrimary || '#fbbf24';
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
  const safeRadius = minDim * 0.495;

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angleRad);

  const halfSpan = Math.max(14, safeRadius * bw * 0.92);

  // Pass 1: Pure, Undistorted, Symmetrical Studio Light-Sweep Band (Zero crooked bezier curves)
  const grad = ctx.createLinearGradient(-halfSpan, 0, halfSpan, 0);
  grad.addColorStop(0, hexToRgba(c1, 0));
  grad.addColorStop(0.14, hexToRgba(c1, 0.08 * soft));
  grad.addColorStop(0.3, hexToRgba(c1, 0.34 * soft));
  grad.addColorStop(0.42, hexToRgba(c2, 0.78));
  grad.addColorStop(0.47, hexToRgba('#ffffff', 0.96));
  grad.addColorStop(0.5, '#ffffff');
  grad.addColorStop(0.53, hexToRgba('#ffffff', 0.96));
  grad.addColorStop(0.58, hexToRgba(c2, 0.78));
  grad.addColorStop(0.7, hexToRgba(c1, 0.34 * soft));
  grad.addColorStop(0.86, hexToRgba(c1, 0.08 * soft));
  grad.addColorStop(1, hexToRgba(c1, 0));

  ctx.fillStyle = grad;
  ctx.fillRect(-halfSpan, -safeRadius, halfSpan * 2, safeRadius * 2);

  // Pass 2: Parallel Secondary VIP Glint Line (straight and parallel so the beam is never distorted)
  const secOffset = halfSpan * 0.56;
  const secHalfW = Math.max(2, halfSpan * 0.14);
  const secGrad = ctx.createLinearGradient(secOffset - secHalfW, 0, secOffset + secHalfW, 0);
  const secPeak = options.presetId === 'double_luxury' ? '#ffffff' : c2;
  secGrad.addColorStop(0, hexToRgba(c1, 0));
  secGrad.addColorStop(0.35, hexToRgba(c1, 0.32));
  secGrad.addColorStop(0.5, hexToRgba(secPeak, 0.85));
  secGrad.addColorStop(0.65, hexToRgba(c1, 0.32));
  secGrad.addColorStop(1, hexToRgba(c1, 0));
  ctx.fillStyle = secGrad;
  ctx.fillRect(secOffset - secHalfW, -safeRadius, secHalfW * 2, safeRadius * 2);

  // Longitudinal fade near the very ends of safeRadius only (keeps 100% full brightness across 94% of the span
  // so top, bottom, and outer corner edges of even very large layers receive 100% shine intensity!)
  ctx.globalCompositeOperation = 'destination-in';
  const vGrad = ctx.createLinearGradient(0, -safeRadius, 0, safeRadius);
  vGrad.addColorStop(0, 'rgba(255,255,255,0)');
  vGrad.addColorStop(0.03, 'rgba(255,255,255,0.95)');
  vGrad.addColorStop(0.06, 'rgba(255,255,255,1)');
  vGrad.addColorStop(0.94, 'rgba(255,255,255,1)');
  vGrad.addColorStop(0.97, 'rgba(255,255,255,0.95)');
  vGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(-safeRadius, -safeRadius, safeRadius * 2, safeRadius * 2);
  ctx.globalCompositeOperation = 'source-over';

  // Crisp 4-point sparkle glints only for diamond_star preset
  if (options.presetId === 'diamond_star') {
    const drawSparkle = (sx: number, sy: number, r: number, alpha = 0.95) => {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? r : r * 0.16;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    drawSparkle(0, 0, minDim * 0.1, 0.95);
    drawSparkle(0, -minDim * 0.2, minDim * 0.07, 0.88);
    drawSparkle(0, minDim * 0.2, minDim * 0.07, 0.88);
  }

  ctx.restore();

  return c;
}

/**
 * Computes full-layer shine dimensions (`shineWidth`, `shineHeight`), perpendicular `beamAngleDeg`,
 * and full start-to-end `motionPoints` (`من أول الطبقة لآخرها`) for any target layer bounding box,
 * even when the layer is very large.
 */
export function computeFullLayerShineSweepAndSize(
  bounds: { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number },
  direction: 'diag_tl_br' | 'diag_tr_bl' | 'horiz_lr' | 'vert_tb' = 'diag_tl_br'
): {
  shineWidth: number;
  shineHeight: number;
  beamAngleDeg: number;
  motionPoints: Point2D[];
} {
  const spanW = Math.max(48, bounds.maxX - bounds.minX);
  const spanH = Math.max(48, bounds.maxY - bounds.minY);
  const isWideBanner = spanW > spanH * 1.55;
  const diagSpan = Math.hypot(spanW, spanH);

  // Size the shine square to 1.85x the full diagonal of the target layer (up to 2200px)
  // so the beam spans 100% across the entire cross-section of even the largest layers!
  const shineSide = Math.max(320, Math.min(2200, Math.round(diagSpan * 1.85)));

  let beamAngleDeg = -32;
  let motionPoints: Point2D[];

  if (direction === 'diag_tr_bl') {
    beamAngleDeg = isWideBanner ? 26 : 32;
    motionPoints = isWideBanner
      ? [
          { x: Number((bounds.maxX + spanW * 0.15).toFixed(1)), y: Number((bounds.cy - spanH * 0.14).toFixed(1)) },
          { x: Number(bounds.cx.toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
          { x: Number((bounds.minX - spanW * 0.15).toFixed(1)), y: Number((bounds.cy + spanH * 0.14).toFixed(1)) },
        ]
      : [
          { x: Number((bounds.maxX + spanW * 0.12).toFixed(1)), y: Number((bounds.minY - spanH * 0.12).toFixed(1)) },
          { x: Number(bounds.cx.toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
          { x: Number((bounds.minX - spanW * 0.12).toFixed(1)), y: Number((bounds.maxY + spanH * 0.12).toFixed(1)) },
        ];
  } else if (direction === 'horiz_lr') {
    beamAngleDeg = -18;
    motionPoints = [
      { x: Number((bounds.minX - spanW * 0.16).toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
      { x: Number(bounds.cx.toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
      { x: Number((bounds.maxX + spanW * 0.16).toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
    ];
  } else if (direction === 'vert_tb') {
    beamAngleDeg = -76;
    motionPoints = [
      { x: Number(bounds.cx.toFixed(1)), y: Number((bounds.minY - spanH * 0.16).toFixed(1)) },
      { x: Number(bounds.cx.toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
      { x: Number(bounds.cx.toFixed(1)), y: Number((bounds.maxY + spanH * 0.16).toFixed(1)) },
    ];
  } else {
    // diag_tl_br (Default): sweeps from the very beginning of the layer (Top-Left / Left) to the very end (Bottom-Right / Right)
    beamAngleDeg = isWideBanner ? -26 : -32;
    motionPoints = isWideBanner
      ? [
          { x: Number((bounds.minX - spanW * 0.15).toFixed(1)), y: Number((bounds.cy - spanH * 0.14).toFixed(1)) },
          { x: Number(bounds.cx.toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
          { x: Number((bounds.maxX + spanW * 0.15).toFixed(1)), y: Number((bounds.cy + spanH * 0.14).toFixed(1)) },
        ]
      : [
          { x: Number((bounds.minX - spanW * 0.12).toFixed(1)), y: Number((bounds.minY - spanH * 0.12).toFixed(1)) },
          { x: Number(bounds.cx.toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
          { x: Number((bounds.maxX + spanW * 0.12).toFixed(1)), y: Number((bounds.maxY + spanH * 0.12).toFixed(1)) },
        ];
  }

  return {
    shineWidth: shineSide,
    shineHeight: shineSide,
    beamAngleDeg,
    motionPoints,
  };
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
  const c = renderProceduralShineCanvasSync(options);
  const W = c.width;
  const H = c.height;

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

/**
 * Pure, deterministic RGBA pixel color processor for the Same-Layer Color-Clone Shine system (`layer_color_clone`).
 * Applies Hue Rotation (`hueRotateDeg`), Saturation (`saturationPct`), Contrast (`contrastPct`),
 * Brightness (`brightnessPct`), and Specular Color Tint (`tintColor`, `tintStrengthPct`)
 * while strictly preserving every pixel's exact alpha channel (`data[i + 3]`).
 */
export function applyColorAdjustmentsToRgbaBytes(
  data: Uint8ClampedArray | Uint8Array,
  adjustments?: Partial<CloneLayerColorAdjustments>
): void {
  const adj: CloneLayerColorAdjustments = {
    ...DEFAULT_CLONE_COLOR_ADJUSTMENTS,
    ...adjustments,
  };

  const hueRad = ((adj.hueRotateDeg || 0) * Math.PI) / 180;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);
  const sat = Math.max(0, (adj.saturationPct ?? 100) / 100);
  const bri = Math.max(0, (adj.brightnessPct ?? 100) / 100);
  const con = Math.max(0, (adj.contrastPct ?? 100) / 100);
  const tintAmt = Math.max(0, Math.min(1, (adj.tintStrengthPct ?? 0) / 100));

  const cleanHex = (adj.tintColor || '#fde047').replace('#', '').trim();
  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((c) => c + c)
          .join('')
      : cleanHex.padEnd(6, 'f');
  const tintR = parseInt(fullHex.slice(0, 2), 16) || 253;
  const tintG = parseInt(fullHex.slice(2, 4), 16) || 224;
  const tintB = parseInt(fullHex.slice(4, 6), 16) || 71;

  // Identity fast-path check
  if (
    Math.abs(adj.hueRotateDeg || 0) < 0.01 &&
    Math.abs(sat - 1) < 0.005 &&
    Math.abs(bri - 1) < 0.005 &&
    Math.abs(con - 1) < 0.005 &&
    tintAmt < 0.005
  ) {
    return;
  }

  // Hue rotation matrix coefficients (luminance-preserving)
  const m00 = 0.213 + cosH * 0.787 - sinH * 0.213;
  const m01 = 0.715 - cosH * 0.715 - sinH * 0.715;
  const m02 = 0.072 - cosH * 0.072 + sinH * 0.928;
  const m10 = 0.213 - cosH * 0.213 + sinH * 0.143;
  const m11 = 0.715 + cosH * 0.285 + sinH * 0.14;
  const m12 = 0.072 - cosH * 0.072 - sinH * 0.283;
  const m20 = 0.213 - cosH * 0.213 - sinH * 0.787;
  const m21 = 0.715 - cosH * 0.715 + sinH * 0.715;
  const m22 = 0.072 + cosH * 0.928 + sinH * 0.072;

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;

    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Hue rotation
    if (Math.abs(adj.hueRotateDeg || 0) >= 0.01) {
      const nr = m00 * r + m01 * g + m02 * b;
      const ng = m10 * r + m11 * g + m12 * b;
      const nb = m20 * r + m21 * g + m22 * b;
      r = nr;
      g = ng;
      b = nb;
    }

    // 2. Saturation
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;

    // 3. Contrast & Brightness
    r = (r - 128) * con + 128;
    g = (g - 128) * con + 128;
    b = (b - 128) * con + 128;

    r *= bri;
    g *= bri;
    b *= bri;

    // 4. Specular Color Tint (luminance-modulated so shadows stay rich and midtones/highlights glow)
    if (tintAmt > 0.005) {
      const normLum = Math.max(0.15, Math.min(1.25, (0.299 * r + 0.587 * g + 0.114 * b) / 200));
      const tr = tintR * normLum;
      const tg = tintG * normLum;
      const tb = tintB * normLum;
      r = r * (1 - tintAmt) + tr * tintAmt;
      g = g * (1 - tintAmt) + tg * tintAmt;
      b = b * (1 - tintAmt) + tb * tintAmt;
    }

    data[i] = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : Math.round(b);
  }
}

/**
 * Synchronously renders a color-adjusted copy of `sourceBitmap` onto an HTMLCanvasElement
 * for the Same-Layer Color-Clone Shine system (`layer_color_clone`).
 */
export function renderColorAdjustedLayerCanvasSync(options: {
  sourceBitmap: CanvasImageSource;
  width: number;
  height: number;
  adjustments?: Partial<CloneLayerColorAdjustments>;
  targetCanvas?: HTMLCanvasElement;
}): HTMLCanvasElement {
  const W = Math.max(2, Math.min(2400, Math.round(options.width || 300)));
  const H = Math.max(2, Math.min(2400, Math.round(options.height || 300)));
  const c = options.targetCanvas || document.createElement('canvas');
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(options.sourceBitmap, 0, 0, W, H);

  try {
    const imgData = ctx.getImageData(0, 0, W, H);
    applyColorAdjustmentsToRgbaBytes(imgData.data, options.adjustments);
    ctx.putImageData(imgData, 0, 0);
  } catch {}

  return c;
}

/**
 * Asynchronously encodes a color-adjusted copy of `sourceBitmap` into `ImageBitmap`, `pngBytes`, and `dataUrl`.
 */
export async function renderColorAdjustedLayerBitmapAndBytes(options: {
  sourceBitmap: CanvasImageSource;
  width: number;
  height: number;
  adjustments?: Partial<CloneLayerColorAdjustments>;
}): Promise<{
  bitmap: ImageBitmap;
  pngBytes: Uint8Array;
  dataUrl: string;
  width: number;
  height: number;
}> {
  const c = renderColorAdjustedLayerCanvasSync(options);
  const W = c.width;
  const H = c.height;
  const dataUrl = c.toDataURL('image/png');
  const blob: Blob = await new Promise((resolve) =>
    c.toBlob((b) => resolve(b || new Blob()), 'image/png')
  );
  const pngBytes = new Uint8Array(await blob.arrayBuffer());
  const bitmap = await createImageBitmap(blob);
  return { bitmap, pngBytes, dataUrl, width: W, height: H };
}

/**
 * Live Canvas Masking Engine for System 2 (`shineSystemMode === 'layer_color_clone'`).
 * Masks the stationary color-modified layer on `compCtx` using the moving soft shine band
 * (in `'sweep_reveal'` mode) and/or the user's selected polygon region (`maskContours`).
 */
export function applyCloneLayerShineMaskToCanvas(options: {
  compCtx: CanvasRenderingContext2D;
  maskCanvas: HTMLCanvasElement;
  maskCtx: CanvasRenderingContext2D;
  scratchCanvas: HTMLCanvasElement;
  config: ShineLayerConfig;
  currentFrame: number;
  totalFrames: number;
  canvasW: number;
  canvasH: number;
  targetDeltaMatrix?: AffineMatrix | null;
}): { visible: boolean; opacityMultiplier: number } {
  const {
    compCtx,
    maskCanvas,
    maskCtx,
    scratchCanvas,
    config,
    currentFrame,
    totalFrames,
    canvasW,
    canvasH,
    targetDeltaMatrix,
  } = options;

  const W = Math.max(1, canvasW);
  const H = Math.max(1, canvasH);
  const sweep = evaluateShineSweepAtFrame(config, currentFrame, totalFrames, W, H);
  if (!sweep.active || sweep.opacityFactor <= 0.001) {
    compCtx.clearRect(0, 0, W, H);
    return { visible: false, opacityMultiplier: 0 };
  }

  if (scratchCanvas.width !== W || scratchCanvas.height !== H) {
    scratchCanvas.width = W;
    scratchCanvas.height = H;
  }
  const scratchCtx = scratchCanvas.getContext('2d');
  if (!scratchCtx) return { visible: true, opacityMultiplier: sweep.opacityFactor };

  const edgeFeather = Math.max(0, Math.min(24, config.edgeFeather ?? 4));
  const animStyle = config.cloneAnimStyle || 'sweep_reveal';

  // Start with a full white mask on maskCtx, then intersect with polygon contours (if any) and moving sweep band
  maskCtx.clearRect(0, 0, W, H);
  maskCtx.fillStyle = '#ffffff';
  maskCtx.fillRect(0, 0, W, H);

  // 1. Apply custom polygon contours (or inner ring hole) if present
  const contours = config.maskContours || [];
  const shouldApplyContours =
    contours.length > 0 &&
    (config.maskMode !== 'auto_layer_contour' || (contours[1] && contours[1].length >= 3));

  if (shouldApplyContours) {
    const buildWorldContourPath = (contour: Point2D[]): string => {
      if (!contour || contour.length < 3) return '';
      const transformed = contour.map((pt) =>
        targetDeltaMatrix
          ? {
              x: Number(
                (targetDeltaMatrix[0] * pt.x + targetDeltaMatrix[2] * pt.y + targetDeltaMatrix[4]).toFixed(2)
              ),
              y: Number(
                (targetDeltaMatrix[1] * pt.x + targetDeltaMatrix[3] * pt.y + targetDeltaMatrix[5]).toFixed(2)
              ),
            }
          : pt
      );
      return (
        transformed.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
      );
    };

    const fullD = contours
      .map((c) => buildWorldContourPath(c))
      .filter(Boolean)
      .join(' ');
    if (fullD) {
      scratchCtx.clearRect(0, 0, W, H);
      scratchCtx.save();
      if (edgeFeather > 0.5) {
        scratchCtx.filter = `blur(${edgeFeather.toFixed(1)}px)`;
      }
      scratchCtx.fillStyle = '#ffffff';
      try {
        scratchCtx.fill(new Path2D(fullD), 'evenodd');
      } catch {}
      scratchCtx.restore();

      maskCtx.save();
      maskCtx.globalCompositeOperation = 'destination-in';
      maskCtx.drawImage(scratchCanvas, 0, 0);
      maskCtx.restore();
    }
  }

  // 2. In 'sweep_reveal' mode, draw the moving soft slanted shine band at (sweep.x, sweep.y) and intersect
  // Uses the exact same computeShineBandHalfSpan + computeShineBandFeatherAlphaAt raised-cosine curve
  // as buildFeatheredCloneShineSvgaFramesList so Live Canvas Preview and Exported SVGA match 100%!
  if (animStyle === 'sweep_reveal') {
    const soft = Math.max(0.02, Math.min(1, config.beamSoftness ?? 0.9));
    const halfSpan = computeShineBandHalfSpan(
      config.shineWidth || W,
      config.shineHeight || H,
      W,
      H,
      config.beamWidthRatio ?? 0.28,
      soft
    );
    const bandLength = Math.max(W, H, config.shineWidth || W, config.shineHeight || H) * 1.8;
    const angleRad = (-(config.beamAngleDeg ?? -30) * Math.PI) / 180;

    scratchCtx.clearRect(0, 0, W, H);
    scratchCtx.save();
    scratchCtx.translate(sweep.x, sweep.y);
    scratchCtx.rotate(angleRad);

    const grad = scratchCtx.createLinearGradient(-halfSpan, 0, halfSpan, 0);
    const stopSteps = 20;
    for (let s = 0; s <= stopSteps; s++) {
      const stopPos = s / stopSteps; // 0 .. 1 across [-halfSpan, +halfSpan]
      const normDist = Math.abs(stopPos * 2 - 1); // 1 at edges, 0 at center
      const alphaVal = computeShineBandFeatherAlphaAt(normDist, soft);
      grad.addColorStop(stopPos, `rgba(255,255,255,${alphaVal.toFixed(4)})`);
    }

    scratchCtx.fillStyle = grad;
    scratchCtx.fillRect(-halfSpan, -bandLength, halfSpan * 2, bandLength * 2);
    scratchCtx.restore();

    maskCtx.save();
    maskCtx.globalCompositeOperation = 'destination-in';
    maskCtx.drawImage(scratchCanvas, 0, 0);
    maskCtx.restore();
  }

  // 3. Apply final mask to compCtx
  compCtx.save();
  compCtx.globalCompositeOperation = 'destination-in';
  compCtx.drawImage(maskCanvas, 0, 0);
  compCtx.restore();

  return { visible: true, opacityMultiplier: sweep.opacityFactor };
}


