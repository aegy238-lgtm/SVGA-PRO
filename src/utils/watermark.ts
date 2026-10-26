export type WatermarkContentType = 'image' | 'text';

export type WatermarkFontWeight = 'Regular' | 'Medium' | 'Semibold' | 'Bold' | 'ExtraBold';

export interface WatermarkConfig {
  contentType: WatermarkContentType;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: WatermarkFontWeight;
  imageDataUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  x: number;
  y: number;
  scale: number; // 10 to 300 (%)
  rotation: number; // -180 to 180 (deg)
  opacity: number; // 0 to 100 (%)
  imageKey: string;
}

export interface AppliedWatermarkLayer {
  imageKey: string;
  dataUrl: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  animWidth: number;
  animHeight: number;
}

export const WATERMARK_FONTS: { label: string; value: string }[] = [
  { label: 'PingFang / Microsoft YaHei', value: '"PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: 'Inter / System UI', value: 'Inter, system-ui, -apple-system, sans-serif' },
  { label: 'Cairo / Tajawal (Arabic)', value: '"Cairo", "Tajawal", sans-serif' },
  { label: 'Arial / Helvetica', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Impact / Bold Display', value: 'Impact, "Arial Black", sans-serif' },
  { label: 'Georgia / Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Courier / Monospace', value: '"Courier New", monospace' },
];

export const WATERMARK_WEIGHT_MAP: Record<WatermarkFontWeight, number> = {
  Regular: 400,
  Medium: 500,
  Semibold: 600,
  Bold: 700,
  ExtraBold: 800,
};

export function createDefaultWatermarkConfig(
  animWidth = 413,
  animHeight = 413,
  existingAssets: Record<string, string> = {}
): WatermarkConfig {
  let baseKey = 'watermark';
  let idx = 1;
  while (existingAssets[baseKey]) {
    baseKey = `watermark_${idx++}`;
  }

  return {
    contentType: 'text',
    text: 'Watermark',
    fontFamily: WATERMARK_FONTS[0].value,
    fontSize: 32,
    color: '#ffffff',
    fontWeight: 'Semibold',
    imageDataUrl: null,
    imageWidth: 180,
    imageHeight: 60,
    x: Math.round(animWidth * 0.5),
    y: Math.round(animHeight * 0.85),
    scale: 69,
    rotation: 0,
    opacity: 80,
    imageKey: baseKey,
  };
}

export function normalizeHexColor(input: string, fallback = '#ffffff'): string {
  const trimmed = (input || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function estimateTextDimensions(
  text: string,
  fontSize: number,
  fontWeight: WatermarkFontWeight = 'Semibold'
): { width: number; height: number } {
  const content = (text || ' ').trim() || ' ';
  const clampedSize = Math.max(8, Math.min(240, Number(fontSize) || 32));
  const weightFactor =
    fontWeight === 'ExtraBold'
      ? 1.08
      : fontWeight === 'Bold'
        ? 1.05
        : fontWeight === 'Semibold'
          ? 1.02
          : 1.0;

  let charUnits = 0;
  for (const ch of content) {
    const code = ch.charCodeAt(0);
    // CJK or wide glyphs vs Latin/Arabic
    if (code > 0x2e80) {
      charUnits += 1.0;
    } else if (ch === ' ') {
      charUnits += 0.35;
    } else {
      charUnits += 0.58;
    }
  }

  const width = Math.max(24, Math.round(charUnits * clampedSize * weightFactor + clampedSize * 0.4));
  const height = Math.max(16, Math.round(clampedSize * 1.22));
  return { width, height };
}

export function getWatermarkBaseDimensions(config: WatermarkConfig): {
  width: number;
  height: number;
} {
  if (config.contentType === 'image') {
    return {
      width: Math.max(1, Math.round(config.imageWidth || 180)),
      height: Math.max(1, Math.round(config.imageHeight || 60)),
    };
  }
  return estimateTextDimensions(config.text, config.fontSize, config.fontWeight);
}

export function computeSnapPosition(
  gridRow: 0 | 1 | 2,
  gridCol: 0 | 1 | 2,
  animWidth: number,
  animHeight: number,
  wmWidth: number,
  wmHeight: number,
  scalePct: number
): { x: number; y: number } {
  const W = Math.max(1, animWidth);
  const H = Math.max(1, animHeight);
  const s = Math.max(0.1, (Number(scalePct) || 100) / 100);
  const halfW = Math.min(W * 0.45, (wmWidth * s) / 2);
  const halfH = Math.min(H * 0.45, (wmHeight * s) / 2);
  const padX = Math.max(12, Math.round(W * 0.04));
  const padY = Math.max(12, Math.round(H * 0.04));

  const xPositions: [number, number, number] = [
    Math.round(padX + halfW),
    Math.round(W / 2),
    Math.round(W - padX - halfW),
  ];
  const yPositions: [number, number, number] = [
    Math.round(padY + halfH),
    Math.round(H / 2),
    Math.round(H - padY - halfH),
  ];

  return {
    x: Math.max(0, Math.min(W, xPositions[gridCol])),
    y: Math.max(0, Math.min(H, yPositions[gridRow])),
  };
}

export function computeAffineMatrix2D(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  scalePct: number,
  rotationDeg: number
): [number, number, number, number, number, number] {
  const s = Math.max(0.05, (Number(scalePct) || 100) / 100);
  const rad = ((Number(rotationDeg) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const a = s * cos;
  const b = s * sin;
  const c = -s * sin;
  const d = s * cos;

  const halfW = width / 2;
  const halfH = height / 2;

  const tx = centerX - (a * halfW + c * halfH);
  const ty = centerY - (b * halfW + d * halfH);

  return [a, b, c, d, tx, ty];
}

export function validateWatermarkImageKey(
  imageKey: string,
  existingAssets: Record<string, string> = {}
): {
  valid: boolean;
  available: boolean;
  normalizedKey: string;
  status: 'available' | 'exists' | 'empty' | 'invalid';
} {
  const trimmed = (imageKey || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      available: false,
      normalizedKey: '',
      status: 'empty',
    };
  }
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    return {
      valid: false,
      available: false,
      normalizedKey: trimmed,
      status: 'invalid',
    };
  }
  if (Object.prototype.hasOwnProperty.call(existingAssets, trimmed)) {
    return {
      valid: true,
      available: false,
      normalizedKey: trimmed,
      status: 'exists',
    };
  }
  return {
    valid: true,
    available: true,
    normalizedKey: trimmed,
    status: 'available',
  };
}
