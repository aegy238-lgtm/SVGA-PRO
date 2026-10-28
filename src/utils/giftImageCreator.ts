export type GiftShapeId =
  | 'circle'
  | 'rounded_square'
  | 'rounded_rect'
  | 'oval'
  | 'hexagon'
  | 'diamond'
  | 'octagon'
  | 'shield'
  | 'badge'
  | 'heart'
  | 'star'
  | 'arch';

export type GiftExportFormat = 'png' | 'webp' | 'jpg';
export type GiftSizeMode = 'unified' | 'original';
export type GiftImageFitMode = 'cover' | 'contain' | 'stretch';
export type GiftApplyScope = 'all' | 'selected';

export interface GiftShapeMetadata {
  id: GiftShapeId;
  nameAr: string;
  nameEn: string;
  category: 'basic' | 'polygon' | 'decorative';
  recommendedAspect: number; // width / height
  supportsCornerRadius: boolean;
  svgPreviewPath: string;
}

export interface GiftOverlayConfig {
  enabled: boolean;
  imageUrl: string;
  fileName: string;
  naturalWidth: number;
  naturalHeight: number;
  scale: number; // 10 to 300 (%)
  offsetX: number; // -100 to 100 (%)
  offsetY: number; // -100 to 100 (%)
  opacity: number; // 0 to 100 (%)
  scope: GiftApplyScope; // 'all' | 'selected'
  clipToShape: boolean; // false = frame sits on top of shape without being clipped; true = clipped inside shape mask
}

export interface GiftCreatorGlobalSettings {
  shapeId: GiftShapeId;
  sizeMode: GiftSizeMode;
  width: number;
  height: number;
  lockAspectToShape: boolean;
  cornerRadius: number; // 0 to 50 (% of min dimension)
  transparentPadding: number; // 0 to 35 (% of dimension)
  edgeSoftness: number; // 0 to 60 (px soft transparent edge feather)
  imageFit: GiftImageFitMode;
  imageScale: number; // 20 to 300 (%)
  imageOffsetX: number; // -100 to 100 (%)
  imageOffsetY: number; // -100 to 100 (%)
  exportFormat: GiftExportFormat;
  exportQuality: number; // 10 to 100 (%)
  jpgBackgroundColor: string;
  applyScope: GiftApplyScope;
}

export interface GiftItemAdjustment {
  shapeId?: GiftShapeId;
  cornerRadius?: number;
  transparentPadding?: number;
  edgeSoftness?: number;
  imageFit?: GiftImageFitMode;
  imageScale?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
}

export const GIFT_SHAPES: GiftShapeMetadata[] = [
  {
    id: 'circle',
    nameAr: 'دائرة كاملة',
    nameEn: 'Perfect Circle',
    category: 'basic',
    recommendedAspect: 1,
    supportsCornerRadius: false,
    svgPreviewPath: 'M 50 8 A 42 42 0 1 0 50 92 A 42 42 0 1 0 50 8 Z',
  },
  {
    id: 'rounded_square',
    nameAr: 'مربع بحواف دائرية',
    nameEn: 'Rounded Square',
    category: 'basic',
    recommendedAspect: 1,
    supportsCornerRadius: true,
    svgPreviewPath:
      'M 26 10 H 74 A 16 16 0 0 1 90 26 V 74 A 16 16 0 0 1 74 90 H 26 A 16 16 0 0 1 10 74 V 26 A 16 16 0 0 1 26 10 Z',
  },
  {
    id: 'rounded_rect',
    nameAr: 'مستطيل بحواف دائرية',
    nameEn: 'Rounded Rectangle',
    category: 'basic',
    recommendedAspect: 4 / 3,
    supportsCornerRadius: true,
    svgPreviewPath:
      'M 22 18 H 78 A 14 14 0 0 1 92 32 V 68 A 14 14 0 0 1 78 82 H 22 A 14 14 0 0 1 8 68 V 32 A 14 14 0 0 1 22 18 Z',
  },
  {
    id: 'oval',
    nameAr: 'شكل بيضاوي',
    nameEn: 'Oval Shape',
    category: 'basic',
    recommendedAspect: 4 / 3,
    supportsCornerRadius: false,
    svgPreviewPath: 'M 50 18 A 42 32 0 1 0 50 82 A 42 32 0 1 0 50 18 Z',
  },
  {
    id: 'hexagon',
    nameAr: 'شكل سداسي',
    nameEn: 'Regular Hexagon',
    category: 'polygon',
    recommendedAspect: 1,
    supportsCornerRadius: true,
    svgPreviewPath: 'M 50 7 L 88 28.5 L 88 71.5 L 50 93 L 12 71.5 L 12 28.5 Z',
  },
  {
    id: 'diamond',
    nameAr: 'شكل ماسي',
    nameEn: 'Diamond Shape',
    category: 'polygon',
    recommendedAspect: 1,
    supportsCornerRadius: true,
    svgPreviewPath: 'M 50 6 L 94 50 L 50 94 L 6 50 Z',
  },
  {
    id: 'octagon',
    nameAr: 'شكل مثمن',
    nameEn: 'Regular Octagon',
    category: 'polygon',
    recommendedAspect: 1,
    supportsCornerRadius: true,
    svgPreviewPath: 'M 32 8 H 68 L 92 32 V 68 L 68 92 H 32 L 8 68 V 32 Z',
  },
  {
    id: 'shield',
    nameAr: 'درع ملكي',
    nameEn: 'Royal Shield',
    category: 'decorative',
    recommendedAspect: 1,
    supportsCornerRadius: false,
    svgPreviewPath: 'M 50 8 L 86 20 V 48 C 86 72 69 86 50 94 C 31 86 14 72 14 48 V 20 Z',
  },
  {
    id: 'badge',
    nameAr: 'شارة هدايا مزخرفة',
    nameEn: 'Gift Rosette Badge',
    category: 'decorative',
    recommendedAspect: 1,
    supportsCornerRadius: false,
    svgPreviewPath:
      'M 50 6 L 61 13 L 75 11 L 80 24 L 91 31 L 88 45 L 94 57 L 84 68 L 83 82 L 70 85 L 62 95 L 50 89 L 38 95 L 30 85 L 17 82 L 16 68 L 6 57 L 12 45 L 9 31 L 20 24 L 25 11 L 39 13 Z',
  },
  {
    id: 'heart',
    nameAr: 'قلب متناسق',
    nameEn: 'Symmetric Heart',
    category: 'decorative',
    recommendedAspect: 1,
    supportsCornerRadius: false,
    svgPreviewPath:
      'M 50 88 C 50 88 10 62 10 34 C 10 19 22 10 35 10 C 43 10 48 15 50 21 C 52 15 57 10 65 10 C 78 10 90 19 90 34 C 90 62 50 88 50 88 Z',
  },
  {
    id: 'star',
    nameAr: 'نجمة ثمانية',
    nameEn: '8-Point Star',
    category: 'decorative',
    recommendedAspect: 1,
    supportsCornerRadius: false,
    svgPreviewPath:
      'M 50 5 L 61 23 L 82 18 L 77 39 L 95 50 L 77 61 L 82 82 L 61 77 L 50 95 L 39 77 L 18 82 L 23 61 L 5 50 L 23 39 L 18 18 L 39 23 Z',
  },
  {
    id: 'arch',
    nameAr: 'بوابة مقوسة',
    nameEn: 'Royal Arch',
    category: 'decorative',
    recommendedAspect: 3 / 4,
    supportsCornerRadius: true,
    svgPreviewPath: 'M 14 90 V 46 A 36 36 0 0 1 86 46 V 90 Z',
  },
];

export const DEFAULT_GIFT_CREATOR_SETTINGS: GiftCreatorGlobalSettings = {
  shapeId: 'circle',
  sizeMode: 'unified',
  width: 512,
  height: 512,
  lockAspectToShape: false,
  cornerRadius: 22,
  transparentPadding: 4,
  edgeSoftness: 0,
  imageFit: 'cover',
  imageScale: 100,
  imageOffsetX: 0,
  imageOffsetY: 0,
  exportFormat: 'png',
  exportQuality: 95,
  jpgBackgroundColor: '#0f172a',
  applyScope: 'all',
};

export const DEFAULT_GIFT_OVERLAY_CONFIG: GiftOverlayConfig = {
  enabled: false,
  imageUrl: '',
  fileName: '',
  naturalWidth: 0,
  naturalHeight: 0,
  scale: 100,
  offsetX: 0,
  offsetY: 0,
  opacity: 100,
  scope: 'all',
  clipToShape: false,
};

export function getGiftShapeMetadata(shapeId: GiftShapeId): GiftShapeMetadata {
  return GIFT_SHAPES.find((s) => s.id === shapeId) || GIFT_SHAPES[0];
}

/**
 * Resolves the effective parameters for a single image item by merging global settings with any item-specific overrides.
 */
export function resolveEffectiveItemSettings(
  globalSettings: GiftCreatorGlobalSettings,
  itemOverride?: GiftItemAdjustment
) {
  return {
    shapeId: itemOverride?.shapeId ?? globalSettings.shapeId,
    cornerRadius: itemOverride?.cornerRadius ?? globalSettings.cornerRadius,
    transparentPadding: itemOverride?.transparentPadding ?? globalSettings.transparentPadding,
    edgeSoftness: itemOverride?.edgeSoftness ?? globalSettings.edgeSoftness,
    imageFit: itemOverride?.imageFit ?? globalSettings.imageFit,
    imageScale: itemOverride?.imageScale ?? globalSettings.imageScale,
    imageOffsetX: itemOverride?.imageOffsetX ?? globalSettings.imageOffsetX,
    imageOffsetY: itemOverride?.imageOffsetY ?? globalSettings.imageOffsetY,
  };
}

/**
 * Computes the final output pixel dimensions (width, height) for a given source image and settings.
 */
export function computeOutputDimensions(
  sourceW: number,
  sourceH: number,
  settings: Pick<
    GiftCreatorGlobalSettings,
    'sizeMode' | 'width' | 'height' | 'lockAspectToShape' | 'shapeId'
  >,
  overrideShapeId?: GiftShapeId
): { width: number; height: number } {
  const safeSrcW = Math.max(16, Math.round(sourceW || 512));
  const safeSrcH = Math.max(16, Math.round(sourceH || 512));
  const activeShape = getGiftShapeMetadata(overrideShapeId || settings.shapeId);

  if (settings.sizeMode === 'original') {
    if (settings.lockAspectToShape) {
      const base = Math.max(safeSrcW, safeSrcH);
      if (activeShape.recommendedAspect >= 1) {
        return {
          width: Math.round(base),
          height: Math.max(16, Math.round(base / activeShape.recommendedAspect)),
        };
      }
      return {
        width: Math.max(16, Math.round(base * activeShape.recommendedAspect)),
        height: Math.round(base),
      };
    }
    // For strict 1:1 shapes like circle or rounded_square in original mode, keep square if source is rectangular?
    // No, if user chose 'original', we respect sourceW/sourceH unless shape is 'circle' or 'rounded_square' where we use min/max or exact dimensions.
    return { width: safeSrcW, height: safeSrcH };
  }

  const targetW = Math.min(4096, Math.max(32, Math.round(settings.width || 512)));
  let targetH = Math.min(4096, Math.max(32, Math.round(settings.height || 512)));

  if (settings.lockAspectToShape) {
    targetH = Math.min(4096, Math.max(32, Math.round(targetW / activeShape.recommendedAspect)));
  }

  return { width: targetW, height: targetH };
}

/**
 * Computes the active shape bounding box inside the output canvas after applying transparent outer padding.
 */
export function computeShapeInnerBox(
  canvasW: number,
  canvasH: number,
  shapeId: GiftShapeId,
  transparentPaddingPercent: number
): { x: number; y: number; width: number; height: number } {
  const clampedPad = Math.max(0, Math.min(40, Number(transparentPaddingPercent) || 0)) / 100;
  const padX = canvasW * clampedPad;
  const padY = canvasH * clampedPad;

  let availW = Math.max(8, canvasW - padX * 2);
  let availH = Math.max(8, canvasH - padY * 2);

  // For geometric 1:1 shapes (circle, rounded_square, hexagon, diamond, octagon, shield, badge, heart, star),
  // keep the shape centered and proportional inside the available box so a circle is always a true circle!
  if (
    shapeId === 'circle' ||
    shapeId === 'rounded_square' ||
    shapeId === 'hexagon' ||
    shapeId === 'diamond' ||
    shapeId === 'octagon' ||
    shapeId === 'shield' ||
    shapeId === 'badge' ||
    shapeId === 'heart' ||
    shapeId === 'star'
  ) {
    const side = Math.min(availW, availH);
    return {
      x: (canvasW - side) / 2,
      y: (canvasH - side) / 2,
      width: side,
      height: side,
    };
  }

  if (shapeId === 'rounded_rect' || shapeId === 'oval') {
    // If canvas is square, make rounded_rect / oval visually distinct (4:3 aspect inside the square)
    const ratio = availW / availH;
    if (Math.abs(ratio - 1) < 0.06) {
      const targetH = availH * 0.76;
      return {
        x: (canvasW - availW) / 2,
        y: (canvasH - targetH) / 2,
        width: availW,
        height: targetH,
      };
    }
  }

  return {
    x: (canvasW - availW) / 2,
    y: (canvasH - availH) / 2,
    width: availW,
    height: availH,
  };
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Generates polygon vertices for polygon-based shapes inside the given bounding box.
 */
export function getPolygonShapeVertices(
  shapeId: GiftShapeId,
  box: { x: number; y: number; width: number; height: number }
): Point2D[] {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rx = box.width / 2;
  const ry = box.height / 2;

  if (shapeId === 'diamond') {
    return [
      { x: cx, y: box.y },
      { x: box.x + box.width, y: cy },
      { x: cx, y: box.y + box.height },
      { x: box.x, y: cy },
    ];
  }

  if (shapeId === 'hexagon') {
    const pts: Point2D[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 3;
      pts.push({
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
      });
    }
    return pts;
  }

  if (shapeId === 'octagon') {
    const pts: Point2D[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI / 2 + Math.PI / 8 + (i * Math.PI) / 4;
      // Normalize so octagon touches the bounding box edges cleanly
      const scale = 1 / Math.cos(Math.PI / 8);
      pts.push({
        x: cx + rx * scale * Math.cos(angle),
        y: cy + ry * scale * Math.sin(angle),
      });
    }
    return pts;
  }

  if (shapeId === 'star') {
    const pts: Point2D[] = [];
    const spikes = 8;
    const innerRatio = 0.62;
    for (let i = 0; i < spikes * 2; i++) {
      const rFactor = i % 2 === 0 ? 1 : innerRatio;
      const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
      pts.push({
        x: cx + rx * rFactor * Math.cos(angle),
        y: cy + ry * rFactor * Math.sin(angle),
      });
    }
    return pts;
  }

  if (shapeId === 'badge') {
    const pts: Point2D[] = [];
    const lobes = 12;
    const innerRatio = 0.86;
    for (let i = 0; i < lobes * 2; i++) {
      const rFactor = i % 2 === 0 ? 1 : innerRatio;
      const angle = -Math.PI / 2 + (i * Math.PI) / lobes;
      pts.push({
        x: cx + rx * rFactor * Math.cos(angle),
        y: cy + ry * rFactor * Math.sin(angle),
      });
    }
    return pts;
  }

  return [];
}

/**
 * Helper to trace a rounded polygon path onto a CanvasRenderingContext2D.
 */
function traceRoundedPolygon(
  ctx: CanvasRenderingContext2D,
  pts: Point2D[],
  cornerRadiusPx: number
) {
  const n = pts.length;
  if (n < 3) return;
  if (cornerRadiusPx <= 0.5) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    return;
  }

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];

    const v1x = p0.x - p1.x;
    const v1y = p0.y - p1.y;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;

    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    const maxR = Math.min(len1, len2) * 0.38;
    const r = Math.min(cornerRadiusPx, maxR);

    const startX = p1.x + (v1x / (len1 || 1)) * r;
    const startY = p1.y + (v1y / (len1 || 1)) * r;
    const endX = p1.x + (v2x / (len2 || 1)) * r;
    const endY = p1.y + (v2y / (len2 || 1)) * r;

    if (i === 0) {
      ctx.moveTo(startX, startY);
    } else {
      ctx.lineTo(startX, startY);
    }
    ctx.quadraticCurveTo(p1.x, p1.y, endX, endY);
  }
  ctx.closePath();
}

/**
 * Traces the exact geometric path of a GiftShapeId onto a CanvasRenderingContext2D.
 */
export function traceGiftShapePath(
  ctx: CanvasRenderingContext2D,
  shapeId: GiftShapeId,
  box: { x: number; y: number; width: number; height: number },
  cornerRadiusPercent: number
): void {
  const { x, y, width: w, height: h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const minDim = Math.min(w, h);
  const clampedCornerRatio = Math.max(0, Math.min(50, Number(cornerRadiusPercent) || 0)) / 100;
  const cornerPx = minDim * clampedCornerRatio;

  ctx.beginPath();

  if (shapeId === 'circle') {
    const r = minDim / 2;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }

  if (shapeId === 'oval') {
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }

  if (shapeId === 'rounded_square' || shapeId === 'rounded_rect') {
    const r = Math.min(w / 2, h / 2, Math.max(2, cornerPx));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    return;
  }

  if (
    shapeId === 'hexagon' ||
    shapeId === 'diamond' ||
    shapeId === 'octagon' ||
    shapeId === 'star' ||
    shapeId === 'badge'
  ) {
    const pts = getPolygonShapeVertices(shapeId, box);
    const polyCorner =
      shapeId === 'star' || shapeId === 'badge' ? minDim * 0.03 : cornerPx * 0.55;
    traceRoundedPolygon(ctx, pts, polyCorner);
    return;
  }

  if (shapeId === 'shield') {
    const topY = y + h * 0.03;
    const shoulderY = y + h * 0.16;
    const midY = y + h * 0.52;
    const bottomY = y + h * 0.97;
    const leftX = x + w * 0.08;
    const rightX = x + w * 0.92;
    ctx.moveTo(cx, topY);
    ctx.lineTo(rightX, shoulderY);
    ctx.lineTo(rightX, midY);
    ctx.bezierCurveTo(rightX, y + h * 0.77, cx + w * 0.18, y + h * 0.89, cx, bottomY);
    ctx.bezierCurveTo(cx - w * 0.18, y + h * 0.89, leftX, y + h * 0.77, leftX, midY);
    ctx.lineTo(leftX, shoulderY);
    ctx.closePath();
    return;
  }

  if (shapeId === 'heart') {
    const topCurveY = y + h * 0.24;
    const bottomTipY = y + h * 0.92;
    ctx.moveTo(cx, bottomTipY);
    ctx.bezierCurveTo(x - w * 0.02, y + h * 0.62, x + w * 0.02, y + h * 0.08, x + w * 0.28, y + h * 0.08);
    ctx.bezierCurveTo(x + w * 0.42, y + h * 0.08, cx, y + h * 0.18, cx, topCurveY);
    ctx.bezierCurveTo(cx, y + h * 0.18, x + w * 0.58, y + h * 0.08, x + w * 0.72, y + h * 0.08);
    ctx.bezierCurveTo(x + w * 0.98, y + h * 0.08, x + w * 1.02, y + h * 0.62, cx, bottomTipY);
    ctx.closePath();
    return;
  }

  if (shapeId === 'arch') {
    const archRadius = w / 2;
    const archCenterY = y + archRadius;
    const bottomR = Math.min(w * 0.18, cornerPx * 0.5);
    ctx.moveTo(x, archCenterY);
    ctx.arc(cx, archCenterY, archRadius, Math.PI, 0, false);
    ctx.lineTo(x + w, y + h - bottomR);
    if (bottomR > 0) {
      ctx.quadraticCurveTo(x + w, y + h, x + w - bottomR, y + h);
      ctx.lineTo(x + bottomR, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - bottomR);
    } else {
      ctx.lineTo(x, y + h);
    }
    ctx.closePath();
    return;
  }
}

/**
 * Pure mathematical point-in-shape tester used for unit tests & mask verification.
 */
export function isPointInsideGiftShape(
  px: number,
  py: number,
  shapeId: GiftShapeId,
  box: { x: number; y: number; width: number; height: number },
  cornerRadiusPercent = 20
): boolean {
  const { x, y, width: w, height: h } = box;
  if (px < x || px > x + w || py < y || py > y + h) return false;

  const cx = x + w / 2;
  const cy = y + h / 2;

  if (shapeId === 'circle') {
    const r = Math.min(w, h) / 2;
    return Math.hypot(px - cx, py - cy) <= r;
  }

  if (shapeId === 'oval') {
    const rx = w / 2;
    const ry = h / 2;
    return (px - cx) ** 2 / rx ** 2 + (py - cy) ** 2 / ry ** 2 <= 1;
  }

  if (shapeId === 'rounded_square' || shapeId === 'rounded_rect') {
    const minDim = Math.min(w, h);
    const r = Math.min(
      w / 2,
      h / 2,
      Math.max(2, minDim * (Math.max(0, Math.min(50, cornerRadiusPercent)) / 100))
    );
    const dx = Math.max(Math.abs(px - cx) - (w / 2 - r), 0);
    const dy = Math.max(Math.abs(py - cy) - (h / 2 - r), 0);
    return dx * dx + dy * dy <= r * r;
  }

  if (
    shapeId === 'hexagon' ||
    shapeId === 'diamond' ||
    shapeId === 'octagon' ||
    shapeId === 'star' ||
    shapeId === 'badge'
  ) {
    const pts = getPolygonShapeVertices(shapeId, box);
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x,
        yi = pts[i].y;
      const xj = pts[j].x,
        yj = pts[j].y;
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  if (shapeId === 'arch') {
    const archRadius = w / 2;
    const archCenterY = y + archRadius;
    if (py < archCenterY) {
      return Math.hypot(px - cx, py - archCenterY) <= archRadius;
    }
    return px >= x && px <= x + w && py <= y + h;
  }

  // For shield and heart, check normalized bounds around center
  const nx = (px - cx) / (w / 2);
  const ny = (py - cy) / (h / 2);
  if (shapeId === 'shield') {
    if (Math.abs(nx) > 0.84) return false;
    if (ny > 0) {
      return Math.abs(nx) <= 0.84 * (1 - ny * 0.85);
    }
    return ny >= -0.94 + Math.abs(nx) * 0.25;
  }
  if (shapeId === 'heart') {
    // Standard heart implicit curve approximation
    const hx = nx * 1.15;
    const hy = -ny * 1.1 + 0.15;
    return (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy * hy * hy <= 0;
  }

  return true;
}

/**
 * Calculates the destination rectangle (dx, dy, dw, dh) for drawing the source image inside the shape box.
 */
export function computeImageTransformRect(
  srcW: number,
  srcH: number,
  box: { x: number; y: number; width: number; height: number },
  fitMode: GiftImageFitMode,
  scalePercent: number,
  offsetXPercent: number,
  offsetYPercent: number
): { dx: number; dy: number; dw: number; dh: number } {
  const safeSrcW = Math.max(1, srcW);
  const safeSrcH = Math.max(1, srcH);
  const zoom = Math.max(0.1, Math.min(5, (Number(scalePercent) || 100) / 100));

  let baseW = box.width;
  let baseH = box.height;

  if (fitMode === 'cover') {
    const s = Math.max(box.width / safeSrcW, box.height / safeSrcH);
    baseW = safeSrcW * s;
    baseH = safeSrcH * s;
  } else if (fitMode === 'contain') {
    const s = Math.min(box.width / safeSrcW, box.height / safeSrcH);
    baseW = safeSrcW * s;
    baseH = safeSrcH * s;
  }

  const dw = baseW * zoom;
  const dh = baseH * zoom;

  const shiftX = ((Number(offsetXPercent) || 0) / 100) * box.width * 0.65;
  const shiftY = ((Number(offsetYPercent) || 0) / 100) * box.height * 0.65;

  const dx = box.x + (box.width - dw) / 2 + shiftX;
  const dy = box.y + (box.height - dh) / 2 + shiftY;

  return { dx, dy, dw, dh };
}

/**
 * Calculates the destination rectangle and opacity for drawing the independent shared overlay layer.
 */
export function computeOverlayTransformRect(
  overlayW: number,
  overlayH: number,
  canvasW: number,
  canvasH: number,
  overlayConfig: Pick<GiftOverlayConfig, 'scale' | 'offsetX' | 'offsetY' | 'opacity'>
): { dx: number; dy: number; dw: number; dh: number; alpha: number } {
  const safeOvW = Math.max(1, overlayW || canvasW);
  const safeOvH = Math.max(1, overlayH || canvasH);
  const zoom = Math.max(0.05, Math.min(4, (Number(overlayConfig.scale) || 100) / 100));

  // Fit overlay proportionally within canvas at 100% scale
  const baseScale = Math.min(canvasW / safeOvW, canvasH / safeOvH);
  const dw = safeOvW * baseScale * zoom;
  const dh = safeOvH * baseScale * zoom;

  const shiftX = ((Number(overlayConfig.offsetX) || 0) / 100) * canvasW * 0.5;
  const shiftY = ((Number(overlayConfig.offsetY) || 0) / 100) * canvasH * 0.5;

  const dx = (canvasW - dw) / 2 + shiftX;
  const dy = (canvasH - dh) / 2 + shiftY;
  const alpha = Math.max(0, Math.min(1, (Number(overlayConfig.opacity) ?? 100) / 100));

  return { dx, dy, dw, dh, alpha };
}

/**
 * Renders a gift image with a true Alpha Mask (100% transparent exterior) and optional shared overlay onto a Canvas.
 */
export function renderGiftImageToCanvas(
  canvas: HTMLCanvasElement,
  sourceImg: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  globalSettings: GiftCreatorGlobalSettings,
  options?: {
    itemOverride?: GiftItemAdjustment;
    isItemSelected?: boolean;
    overlayConfig?: GiftOverlayConfig;
    overlayImg?: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null;
    forExportFormat?: GiftExportFormat;
    maxPreviewDimension?: number;
  }
): void {
  const srcW =
    (sourceImg as HTMLImageElement).naturalWidth ||
    (sourceImg as HTMLCanvasElement).width ||
    512;
  const srcH =
    (sourceImg as HTMLImageElement).naturalHeight ||
    (sourceImg as HTMLCanvasElement).height ||
    512;

  const eff = resolveEffectiveItemSettings(globalSettings, options?.itemOverride);
  let { width: outW, height: outH } = computeOutputDimensions(
    srcW,
    srcH,
    globalSettings,
    eff.shapeId
  );

  // If rendering for a live grid thumbnail, scale down proportionally for fast GPU rendering while keeping exact aspect ratio
  if (options?.maxPreviewDimension && Math.max(outW, outH) > options.maxPreviewDimension) {
    const ratio = options.maxPreviewDimension / Math.max(outW, outH);
    outW = Math.max(64, Math.round(outW * ratio));
    outH = Math.max(64, Math.round(outH * ratio));
  }

  if (canvas.width !== outW) canvas.width = outW;
  if (canvas.height !== outH) canvas.height = outH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. Clear entire canvas to 100% transparent (RGBA 0,0,0,0)
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, outW, outH);

  // Only fill solid background if explicitly exporting to JPG (which does not support alpha)
  const targetFormat = options?.forExportFormat || 'png';
  if (targetFormat === 'jpg') {
    ctx.fillStyle = globalSettings.jpgBackgroundColor || '#0f172a';
    ctx.fillRect(0, 0, outW, outH);
  }

  const innerBox = computeShapeInnerBox(outW, outH, eff.shapeId, eff.transparentPadding);
  const imgRect = computeImageTransformRect(
    srcW,
    srcH,
    innerBox,
    eff.imageFit,
    eff.imageScale,
    eff.imageOffsetX,
    eff.imageOffsetY
  );

  // 2. Render the shaped base image on an offscreen layer using true Alpha Masking (destination-in)
  // Using destination-in guarantees smooth anti-aliased alpha edges and zero halo or bleed outside the shape
  const maskCv = document.createElement('canvas');
  maskCv.width = outW;
  maskCv.height = outH;
  const maskCx = maskCv.getContext('2d');

  if (maskCx) {
    maskCx.clearRect(0, 0, outW, outH);
    maskCx.imageSmoothingEnabled = true;
    maskCx.imageSmoothingQuality = 'high';

    // Draw the transformed source image first
    maskCx.drawImage(sourceImg, imgRect.dx, imgRect.dy, imgRect.dw, imgRect.dh);

    // If overlay is configured to clip INSIDE the shape mask, draw it before applying the alpha mask
    const ovCfg = options?.overlayConfig;
    const ovImg = options?.overlayImg;
    const shouldApplyOverlay =
      ovCfg &&
      ovCfg.enabled &&
      ovImg &&
      (ovCfg.scope === 'all' || Boolean(options?.isItemSelected));

    if (shouldApplyOverlay && ovCfg.clipToShape) {
      const ovW =
        (ovImg as HTMLImageElement).naturalWidth || (ovImg as HTMLCanvasElement).width || outW;
      const ovH =
        (ovImg as HTMLImageElement).naturalHeight || (ovImg as HTMLCanvasElement).height || outH;
      const ovRect = computeOverlayTransformRect(ovW, ovH, outW, outH, ovCfg);
      maskCx.save();
      maskCx.globalAlpha = ovRect.alpha;
      maskCx.drawImage(ovImg, ovRect.dx, ovRect.dy, ovRect.dw, ovRect.dh);
      maskCx.restore();
    }

    // Apply true Alpha Mask using destination-in with optional Soft Transparent Edge Feathering (تنعيم الحواف الشفافة)
    const shapeMaskCv = document.createElement('canvas');
    shapeMaskCv.width = outW;
    shapeMaskCv.height = outH;
    const shapeMaskCx = shapeMaskCv.getContext('2d');
    if (shapeMaskCx) {
      shapeMaskCx.clearRect(0, 0, outW, outH);
      const rawSoftness = Math.max(0, Math.min(60, Number(eff.edgeSoftness) || 0));

      if (rawSoftness <= 0) {
        shapeMaskCx.fillStyle = '#ffffff';
        traceGiftShapePath(shapeMaskCx, eff.shapeId, innerBox, eff.cornerRadius);
        shapeMaskCx.fill();
      } else {
        // Compute inward feather band width in pixels (up to 42% of half the shape's smallest dimension)
        const minShapeDim = Math.min(innerBox.width, innerBox.height);
        const maxFeatherPx = minShapeDim * 0.42;
        const featherBandPx = Math.min(
          maxFeatherPx,
          Math.max(2, (rawSoftness / 60) * maxFeatherPx)
        );

        // Draw 28 concentric inward-shrinking shape layers with smooth Hermite alpha curve
        // This guarantees 100% transparency outside innerBox and a silky-smooth non-sharp transparent edge fade inside the border across all browsers!
        const steps = 28;
        shapeMaskCx.fillStyle = '#ffffff';
        for (let s = 0; s < steps; s++) {
          const t = s / (steps - 1); // 0 = outer boundary of shape, 1 = inner solid core boundary
          const inset = t * featherBandPx;
          const ringBox = {
            x: innerBox.x + inset,
            y: innerBox.y + inset,
            width: Math.max(2, innerBox.width - inset * 2),
            height: Math.max(2, innerBox.height - inset * 2),
          };
          // Each concentric layer adds incremental alpha so cumulative alpha reaches 1.0 at t=1
          // Target cumulative alpha: smoothstep(t) = t * t * (3 - 2 * t)
          const prevT = s === 0 ? 0 : (s - 1) / (steps - 1);
          const targetAlpha = t === 1 ? 1 : t * t * (3 - 2 * t);
          const prevAlpha = s === 0 ? 0 : prevT * prevT * (3 - 2 * prevT);
          // For source-over compositing of white onto white: newA = prevA + stepA * (1 - prevA) => stepA = (targetA - prevA) / (1 - prevA)
          const stepAlpha =
            prevAlpha >= 0.999 ? 1 : Math.max(0.01, Math.min(1, (targetAlpha - prevAlpha) / (1 - prevAlpha)));

          shapeMaskCx.save();
          shapeMaskCx.globalAlpha = stepAlpha;
          traceGiftShapePath(shapeMaskCx, eff.shapeId, ringBox, eff.cornerRadius);
          shapeMaskCx.fill();
          shapeMaskCx.restore();
        }
      }

      maskCx.globalCompositeOperation = 'destination-in';
      maskCx.drawImage(shapeMaskCv, 0, 0);
    }

    // Composite masked base image onto final canvas
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(maskCv, 0, 0);

    // 3. If shared overlay is unclipped (e.g. a decorative PNG frame sitting over the shaped image), draw it on top preserving its own PNG transparency
    if (shouldApplyOverlay && !ovCfg.clipToShape) {
      const ovW =
        (ovImg as HTMLImageElement).naturalWidth || (ovImg as HTMLCanvasElement).width || outW;
      const ovH =
        (ovImg as HTMLImageElement).naturalHeight || (ovImg as HTMLCanvasElement).height || outH;
      const ovRect = computeOverlayTransformRect(ovW, ovH, outW, outH, ovCfg);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = ovRect.alpha;
      ctx.drawImage(ovImg, ovRect.dx, ovRect.dy, ovRect.dw, ovRect.dh);
      ctx.restore();
    }
  }

  ctx.restore();
}

/**
 * Generates a built-in decorative transparent PNG frame data URL so users can also test or use instant frames.
 */
export function generatePresetOverlayFrameDataUrl(
  preset: 'gold_ring' | 'neon_hex' | 'crystal_corner',
  size = 512
): string {
  if (typeof document === 'undefined') return '';
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;

  if (preset === 'gold_ring') {
    const r = size * 0.455;
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.3, '#f59e0b');
    grad.addColorStop(0.5, '#fffbeb');
    grad.addColorStop(0.75, '#d97706');
    grad.addColorStop(1, '#fde047');

    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = size * 0.036;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = size * 0.008;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(cx, cy, r - size * 0.022, 0, Math.PI * 2);
    ctx.stroke();

    // Top crown gem accent
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(cx, size * 0.012);
    ctx.lineTo(cx + size * 0.035, size * 0.045);
    ctx.lineTo(cx, size * 0.078);
    ctx.lineTo(cx - size * 0.035, size * 0.045);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = size * 0.006;
    ctx.stroke();
    ctx.restore();
  } else if (preset === 'neon_hex') {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(0.5, '#a855f7');
    grad.addColorStop(1, '#ec4899');
    const box = { x: size * 0.04, y: size * 0.04, width: size * 0.92, height: size * 0.92 };
    const pts = getPolygonShapeVertices('hexagon', box);

    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = size * 0.03;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  } else if (preset === 'crystal_corner') {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#34d399');
    grad.addColorStop(0.5, '#60a5fa');
    grad.addColorStop(1, '#c084fc');
    const pad = size * 0.045;
    const w = size - pad * 2;
    const r = size * 0.18;

    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = size * 0.032;
    traceGiftShapePath(ctx, 'rounded_square', { x: pad, y: pad, width: w, height: w }, (r / w) * 100);
    ctx.stroke();
    ctx.restore();
  }

  return cv.toDataURL('image/png');
}

/**
 * Sanitizes and deduplicates export filenames while preserving the original file name.
 */
export function buildExportFileName(
  originalFileName: string,
  format: GiftExportFormat,
  usedNamesLower: Set<string>,
  shapeSuffix?: string
): string {
  const ext = format === 'jpg' ? '.jpg' : format === 'webp' ? '.webp' : '.png';
  const rawBase = (originalFileName || 'gift_image')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim();
  const cleanBase = rawBase || 'gift_image';
  const baseWithSuffix = shapeSuffix ? `${cleanBase}_${shapeSuffix}` : cleanBase;

  let candidate = baseWithSuffix;
  let counter = 1;
  while (usedNamesLower.has(`${candidate.toLowerCase()}${ext}`)) {
    counter++;
    candidate = `${baseWithSuffix}_${counter}`;
  }
  usedNamesLower.add(`${candidate.toLowerCase()}${ext}`);
  return `${candidate}${ext}`;
}
