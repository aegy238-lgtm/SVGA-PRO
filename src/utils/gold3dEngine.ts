export type DimensionPresetId =
  | '1920x1080'
  | '1536x1024'
  | '1024x1024'
  | '1080x1920'
  | 'custom';

export type ExportImageFormat = 'png-white' | 'png-transparent' | 'jpeg';

export interface DimensionPreset {
  id: DimensionPresetId;
  labelAr: string;
  labelEn: string;
  subLabelAr: string;
  subLabelEn: string;
  width: number;
  height: number;
}

export interface GoldFontOption {
  id: string;
  labelAr: string;
  labelEn: string;
  fontFamily: string;
  fontWeight: number;
}

export interface ReferenceGoldPalette {
  highlightHex: string;
  brightGoldHex: string;
  midGoldHex: string;
  warmAmberHex: string;
  deepBronzeHex: string;
  darkGrooveHex: string;
  shadowRgba: string;
  detectedBgHex: string;
}

export interface GoldMaterialPreset {
  id: string;
  labelAr: string;
  labelEn: string;
  previewHex: string;
  palette: ReferenceGoldPalette;
}

export interface Gold3DStyleConfig {
  text: string;
  fontId: string;
  goldIntensity: number; // 0 - 150 (default 100)
  brightness: number; // 50 - 150 (default 100)
  extrusionDepth: number; // 0 - 60 (default 28)
  bevelThickness: number; // 0 - 24 (default 10)
  shadowStrength: number; // 0 - 100 (default 65)
  textSizeScale: number; // 40 - 160 (default 100)
  letterSpacing: number; // -10 - 40 (default 0)
  offsetX: number; // -50 - 50 percent (default 0)
  offsetY: number; // -50 - 50 percent (default 0)
  backgroundColor: string; // default '#FFFFFF'
  transparentPreview: boolean;
  dimensionPreset: DimensionPresetId;
  canvasWidth: number;
  canvasHeight: number;
  exportFormat: ExportImageFormat;
  jpegQuality: number; // 1 - 100 (default 95)
  referenceImageUrl: string;
  referencePalette: ReferenceGoldPalette;
  addSparkleGlints: boolean;
  materialPresetId?: string;
  customBaseColorHex?: string;
  colorSourceImageUrl?: string;
  imageTextureBlend?: number; // 0 - 100 (0 = pure metallic gradient, >0 blends image color shape)
}

export interface TypographyLayoutResult {
  lines: string[];
  direction: 'rtl' | 'ltr';
  hasArabic: boolean;
  fontSizePx: number;
  lineHeightPx: number;
  scaledExtrusionPx: number;
  scaledBevelPx: number;
  scaledShadowBlurPx: number;
  scaledShadowOffsetY: number;
  centerX: number;
  centerY: number;
  maxAllowedWidth: number;
}

export const DEFAULT_REFERENCE_IMAGE_URL =
  '/assets/aistudio/file_000000008e9c821093078beaef9fdc60_8afaca5c.png';

export const DEFAULT_REFERENCE_PALETTE: ReferenceGoldPalette = {
  highlightHex: '#FFFBE0',
  brightGoldHex: '#FFE438',
  midGoldHex: '#FFB800',
  warmAmberHex: '#CC7000',
  deepBronzeHex: '#5C2A00',
  darkGrooveHex: '#381700',
  shadowRgba: 'rgba(58, 28, 2, 0.44)',
  detectedBgHex: '#FFFFFF',
};

export const GOLD_MATERIAL_PRESETS: GoldMaterialPreset[] = [
  {
    id: 'reference-gold',
    labelAr: 'ذهب ملكي 24K (المرجع الأصلي)',
    labelEn: '24K Royal Gold (Reference)',
    previewHex: '#FFB800',
    palette: { ...DEFAULT_REFERENCE_PALETTE },
  },
  {
    id: 'cyber-violet',
    labelAr: 'بنفسجي الموقع الملكي (Cyber Amethyst)',
    labelEn: 'Cyber Amethyst (Site Theme)',
    previewHex: '#7C5CFF',
    palette: {
      highlightHex: '#F3EEFF',
      brightGoldHex: '#B79CFF',
      midGoldHex: '#7C5CFF',
      warmAmberHex: '#4F32CC',
      deepBronzeHex: '#251266',
      darkGrooveHex: '#130738',
      shadowRgba: 'rgba(30, 12, 82, 0.48)',
      detectedBgHex: '#FFFFFF',
    },
  },
  {
    id: 'rose-gold',
    labelAr: 'ذهب وردي فاخر (Rose Gold)',
    labelEn: 'Luxury Rose Gold',
    previewHex: '#F472B6',
    palette: {
      highlightHex: '#FFF0F7',
      brightGoldHex: '#FBB6CE',
      midGoldHex: '#EC4899',
      warmAmberHex: '#BE185D',
      deepBronzeHex: '#6B0F36',
      darkGrooveHex: '#3D061D',
      shadowRgba: 'rgba(74, 12, 38, 0.44)',
      detectedBgHex: '#FFFFFF',
    },
  },
  {
    id: 'platinum-silver',
    labelAr: 'فضي بلاتيني كروم (Platinum Silver)',
    labelEn: 'Platinum Chrome Silver',
    previewHex: '#CBD5E1',
    palette: {
      highlightHex: '#FFFFFF',
      brightGoldHex: '#F1F5F9',
      midGoldHex: '#94A3B8',
      warmAmberHex: '#64748B',
      deepBronzeHex: '#1E293B',
      darkGrooveHex: '#0F172A',
      shadowRgba: 'rgba(15, 23, 42, 0.44)',
      detectedBgHex: '#FFFFFF',
    },
  },
  {
    id: 'royal-emerald',
    labelAr: 'زمردي ملكي (Royal Emerald)',
    labelEn: 'Royal Emerald',
    previewHex: '#10B981',
    palette: {
      highlightHex: '#ECFDF5',
      brightGoldHex: '#6EE7B7',
      midGoldHex: '#10B981',
      warmAmberHex: '#047857',
      deepBronzeHex: '#064E3B',
      darkGrooveHex: '#022C22',
      shadowRgba: 'rgba(4, 47, 36, 0.45)',
      detectedBgHex: '#FFFFFF',
    },
  },
  {
    id: 'ruby-crimson',
    labelAr: 'ياقوتي أحمر ملكي (Ruby Crimson)',
    labelEn: 'Ruby Crimson',
    previewHex: '#EF4444',
    palette: {
      highlightHex: '#FEF2F2',
      brightGoldHex: '#FCA5A5',
      midGoldHex: '#EF4444',
      warmAmberHex: '#B91C1C',
      deepBronzeHex: '#670B0B',
      darkGrooveHex: '#3B0404',
      shadowRgba: 'rgba(70, 8, 8, 0.46)',
      detectedBgHex: '#FFFFFF',
    },
  },
  {
    id: 'sapphire-blue',
    labelAr: 'أزرق ياقوتي ملكي (Sapphire Blue)',
    labelEn: 'Royal Sapphire Blue',
    previewHex: '#0EA5E9',
    palette: {
      highlightHex: '#F0F9FF',
      brightGoldHex: '#7DD3FC',
      midGoldHex: '#0EA5E9',
      warmAmberHex: '#0369A1',
      deepBronzeHex: '#0C4A6E',
      darkGrooveHex: '#082F49',
      shadowRgba: 'rgba(8, 47, 73, 0.46)',
      detectedBgHex: '#FFFFFF',
    },
  },
  {
    id: 'copper-bronze',
    labelAr: 'برونزي ملكي عتيق (Antique Bronze)',
    labelEn: 'Antique Copper Bronze',
    previewHex: '#D97706',
    palette: {
      highlightHex: '#FEF3C7',
      brightGoldHex: '#FBBF24',
      midGoldHex: '#D97706',
      warmAmberHex: '#92400E',
      deepBronzeHex: '#451A03',
      darkGrooveHex: '#270E01',
      shadowRgba: 'rgba(45, 18, 2, 0.46)',
      detectedBgHex: '#FFFFFF',
    },
  },
];

export const GOLD_DIMENSION_PRESETS: DimensionPreset[] = [
  {
    id: '1920x1080',
    labelAr: '1920 × 1080 (أفقي عريض)',
    labelEn: '1920 × 1080 (Landscape)',
    subLabelAr: 'Full HD 16:9',
    subLabelEn: 'Full HD 16:9',
    width: 1920,
    height: 1080,
  },
  {
    id: '1536x1024',
    labelAr: '1536 × 1024 (قياسي مرجعي)',
    labelEn: '1536 × 1024 (Standard Landscape)',
    subLabelAr: 'أبعاد الصورة المرجعية 3:2',
    subLabelEn: 'Reference Aspect Ratio 3:2',
    width: 1536,
    height: 1024,
  },
  {
    id: '1024x1024',
    labelAr: '1024 × 1024 (مربع)',
    labelEn: '1024 × 1024 (Square)',
    subLabelAr: 'شعارات وصور شخصية 1:1',
    subLabelEn: 'Avatars & Logos 1:1',
    width: 1024,
    height: 1024,
  },
  {
    id: '1080x1920',
    labelAr: '1080 × 1920 (طولي / ستوري)',
    labelEn: '1080 × 1920 (Vertical)',
    subLabelAr: 'شاشة كاملة للموبايل 9:16',
    subLabelEn: 'Mobile Fullscreen 9:16',
    width: 1080,
    height: 1920,
  },
  {
    id: 'custom',
    labelAr: 'أبعاد مخصصة (Custom)',
    labelEn: 'Custom Dimensions',
    subLabelAr: 'تحديد العرض والارتفاع يدوياً',
    subLabelEn: 'Specify custom Width × Height',
    width: 1536,
    height: 1024,
  },
];

export const GOLD_FONT_OPTIONS: GoldFontOption[] = [
  {
    id: 'cairo-black',
    labelAr: 'المراعي الملكي الصافي (Almarai ExtraBold - صافي بدون مطبات)',
    labelEn: 'Almarai Royal Smooth (Pure & Bump-Free)',
    fontFamily: "'Almarai', 'Readex Pro', sans-serif",
    fontWeight: 800,
  },
  {
    id: 'readex-bold',
    labelAr: 'ريدكس برو هندسي نقي (Readex Pro Bold - حواف مستقيمة)',
    labelEn: 'Readex Pro Bold (Pure Geometric)',
    fontFamily: "'Readex Pro', 'Almarai', sans-serif",
    fontWeight: 700,
  },
  {
    id: 'changa-extrabold',
    labelAr: 'تشانجا الملكي السميك (Changa ExtraBold)',
    labelEn: 'Changa ExtraBold (Royal Block)',
    fontFamily: "'Changa', 'Almarai', sans-serif",
    fontWeight: 800,
  },
  {
    id: 'alexandria-black',
    labelAr: 'إسكندرية العريض الفاخر (Alexandria Black)',
    labelEn: 'Alexandria Black (Luxury Heavy)',
    fontFamily: "'Alexandria', 'Almarai', sans-serif",
    fontWeight: 900,
  },
  {
    id: 'lalezar-display',
    labelAr: 'لاليزار استعراضي سميك (Lalezar Display)',
    labelEn: 'Lalezar Display (Heavy Emblem)',
    fontFamily: "'Lalezar', 'Almarai', sans-serif",
    fontWeight: 400,
  },
  {
    id: 'tajawal-black',
    labelAr: 'تجول الفاخر (Tajawal ExtraBold)',
    labelEn: 'Tajawal ExtraBold (Modern)',
    fontFamily: "'Tajawal', 'Almarai', sans-serif",
    fontWeight: 800,
  },
  {
    id: 'amiri-bold',
    labelAr: 'أميري خط عربي أصيل (Amiri Bold)',
    labelEn: 'Amiri Bold (Classic Calligraphy)',
    fontFamily: "'Amiri', 'Almarai', serif",
    fontWeight: 700,
  },
];

export const DEFAULT_GOLD_STYLE: Gold3DStyleConfig = {
  text: 'وكيل شحن',
  fontId: 'cairo-black',
  goldIntensity: 100,
  brightness: 100,
  extrusionDepth: 20,
  bevelThickness: 10,
  shadowStrength: 65,
  textSizeScale: 100,
  letterSpacing: 0,
  offsetX: 0,
  offsetY: 0,
  backgroundColor: '#FFFFFF',
  transparentPreview: false,
  dimensionPreset: '1536x1024',
  canvasWidth: 1536,
  canvasHeight: 1024,
  exportFormat: 'png-white',
  jpegQuality: 95,
  referenceImageUrl: DEFAULT_REFERENCE_IMAGE_URL,
  referencePalette: { ...DEFAULT_REFERENCE_PALETTE },
  addSparkleGlints: true,
  materialPresetId: 'reference-gold',
  customBaseColorHex: '#FFB800',
  colorSourceImageUrl: '',
  imageTextureBlend: 0,
};

/**
 * Pure helper: Detects whether text contains Arabic script and determines natural text direction.
 */
export function detectTextDirectionAndScript(text: string): {
  direction: 'rtl' | 'ltr';
  hasArabic: boolean;
  hasLatin: boolean;
  hasNumbers: boolean;
  cleanText: string;
} {
  const cleanText = (text || '').replace(/\r\n/g, '\n').trim();
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const latinRegex = /[A-Za-z]/;
  const numberRegex = /[0-9\u0660-\u0669]/;

  const hasArabic = arabicRegex.test(cleanText);
  const hasLatin = latinRegex.test(cleanText);
  const hasNumbers = numberRegex.test(cleanText);

  return {
    direction: hasArabic ? 'rtl' : 'ltr',
    hasArabic,
    hasLatin,
    hasNumbers,
    cleanText,
  };
}

/**
 * Pure helper: Computes automatic font size, multi-line wrapping if needed, and proportional 3D metrics
 * so that changing canvas dimensions maintains identical relative proportions and never clips text.
 */
export function computeAutoFitTypography(params: {
  text: string;
  canvasWidth: number;
  canvasHeight: number;
  textSizeScale?: number;
  extrusionDepth?: number;
  bevelThickness?: number;
  shadowStrength?: number;
  offsetX?: number;
  offsetY?: number;
  letterSpacing?: number;
  measureTextWidth?: (line: string, fontSizePx: number) => number;
}): TypographyLayoutResult {
  const safeW = Math.max(256, Math.min(4096, Math.round(params.canvasWidth || 1536)));
  const safeH = Math.max(256, Math.min(4096, Math.round(params.canvasHeight || 1024)));
  const userScale = Math.max(30, Math.min(200, params.textSizeScale ?? 100)) / 100;
  const rawExtrusion = Math.max(0, Math.min(80, params.extrusionDepth ?? 28));
  const rawBevel = Math.max(0, Math.min(36, params.bevelThickness ?? 10));
  const rawShadow = Math.max(0, Math.min(100, params.shadowStrength ?? 65));
  const offsetXPercent = Math.max(-50, Math.min(50, params.offsetX ?? 0));
  const offsetYPercent = Math.max(-50, Math.min(50, params.offsetY ?? 0));
  const letterSpacing = Math.max(-15, Math.min(50, params.letterSpacing ?? 0));

  const { direction, hasArabic, cleanText } = detectTextDirectionAndScript(params.text || 'وكيل شحن');
  const effectiveText = cleanText || 'وكيل شحن';

  // Split explicit newlines first
  const explicitLines = effectiveText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Reference baseline is 1024px min-dimension
  const minDim = Math.min(safeW, safeH);
  const propScale = minDim / 1024;

  // Determine lines: if single line is very long (> 22 chars) and has spaces, optionally wrap into 2 balanced lines
  let lines = explicitLines.length > 0 ? explicitLines : [effectiveText];
  if (lines.length === 1 && lines[0].length > 24 && lines[0].includes(' ')) {
    const words = lines[0].split(/\s+/);
    if (words.length >= 4) {
      const mid = Math.ceil(words.length / 2);
      lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    }
  }

  // Safe horizontal & vertical margins so 3D extrusion, bevels, Arabic dots/diacritics, and shadows never clip
  const maxAllowedWidth = safeW * 0.82;
  const maxAllowedHeight = safeH * 0.68;

  // Heuristic or exact measurement function
  const estimateLineWidth = (line: string, fontPx: number): number => {
    if (params.measureTextWidth) {
      return params.measureTextWidth(line, fontPx) + Math.max(0, line.length - 1) * letterSpacing;
    }
    // Accurate character width heuristic for bold Arabic & Latin typography
    const charFactor = hasArabic ? 0.56 : 0.64;
    const baseLen = Math.max(2, [...line].length);
    return baseLen * fontPx * charFactor + Math.max(0, baseLen - 1) * letterSpacing;
  };

  // Start with a generous base font size for short names (like "وكيل شحن" = 8 chars -> ~235px on 1536x1024)
  let baseFontPx = Math.round(minDim * (lines.length === 1 ? 0.255 : 0.175));

  // Scale down automatically so longest line fits inside maxAllowedWidth
  const longestLine = lines.reduce((a, b) => (a.length >= b.length ? a : b), lines[0]);
  const estimatedAtBase = estimateLineWidth(longestLine, baseFontPx);
  if (estimatedAtBase > maxAllowedWidth && estimatedAtBase > 0) {
    baseFontPx = Math.floor(baseFontPx * (maxAllowedWidth / estimatedAtBase));
  }

  // Apply user scale while keeping within safe vertical/horizontal bounds
  let finalFontPx = Math.round(baseFontPx * userScale);
  const maxVerticalFontPx = Math.floor(maxAllowedHeight / (lines.length * 1.32));
  finalFontPx = Math.max(28, Math.min(finalFontPx, maxVerticalFontPx));

  // Re-verify width at finalFontPx if userScale == 1 (auto-fit mode)
  if (userScale <= 1.02) {
    const wCheck = estimateLineWidth(longestLine, finalFontPx);
    if (wCheck > maxAllowedWidth && wCheck > 0) {
      finalFontPx = Math.max(28, Math.floor(finalFontPx * (maxAllowedWidth / wCheck)));
    }
  }

  const fontScaleRatio = finalFontPx / 230;
  const scaledExtrusionPx = Math.max(
    0,
    Math.round(rawExtrusion * Math.max(0.45, fontScaleRatio * 0.92))
  );
  const scaledBevelPx = Math.max(
    0,
    Math.round(rawBevel * Math.max(0.45, fontScaleRatio * 0.9))
  );
  const scaledShadowBlurPx = Math.round((16 + rawShadow * 0.36) * propScale);
  const scaledShadowOffsetY = Math.round(scaledExtrusionPx * 0.72 + 10 * propScale);

  const centerX = Math.round(safeW * 0.5 + (offsetXPercent / 100) * (safeW * 0.38));
  const centerY = Math.round(
    safeH * 0.485 - scaledExtrusionPx * 0.28 + (offsetYPercent / 100) * (safeH * 0.38)
  );

  return {
    lines,
    direction,
    hasArabic,
    fontSizePx: finalFontPx,
    lineHeightPx: Math.round(finalFontPx * 1.28),
    scaledExtrusionPx,
    scaledBevelPx,
    scaledShadowBlurPx,
    scaledShadowOffsetY,
    centerX,
    centerY,
    maxAllowedWidth,
  };
}

/**
 * Pure helper: Converts hex color to RGB tuple
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#FFFFFF').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return { r, g, b };
  }
  const num = parseInt(clean.substring(0, 6), 16);
  if (Number.isNaN(num)) return { r: 255, g: 255, b: 255 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Pure helper: Generates a complete 6-stop 3D metallic palette from ANY user-chosen base color.
 * Preserves authentic 3D specular highlights, bright face, midtone body, bevel depth, and 3D extrusion sidewalls.
 */
export function generate3DPaletteFromBaseColor(baseHex: string): ReferenceGoldPalette {
  const { r, g, b } = hexToRgb(baseHex);
  const mix = (c1: number, c2: number, t: number) => Math.round(c1 + (c2 - c1) * t);

  // Specular top highlight (mixed 78% toward pure white)
  const highlightHex = rgbToHex(mix(r, 255, 0.78), mix(g, 255, 0.78), mix(b, 255, 0.76));
  // Bright upper face (mixed 38% toward luminous white/warm light)
  const brightGoldHex = rgbToHex(mix(r, 255, 0.38), mix(g, 255, 0.38), mix(b, 255, 0.34));
  // Core midtone color
  const midGoldHex = rgbToHex(r, g, b);
  // Lower bevel & warm reflection tone (68% brightness)
  const warmAmberHex = rgbToHex(r * 0.68, g * 0.66, b * 0.66);
  // Deep 3D extrusion sidewall (32% brightness)
  const deepBronzeHex = rgbToHex(r * 0.32, g * 0.3, b * 0.32);
  // Deepest recessed groove (17% brightness)
  const darkGrooveHex = rgbToHex(r * 0.17, g * 0.15, b * 0.18);

  return {
    highlightHex,
    brightGoldHex,
    midGoldHex,
    warmAmberHex,
    deepBronzeHex,
    darkGrooveHex,
    shadowRgba: `rgba(${Math.round(r * 0.22)}, ${Math.round(g * 0.2)}, ${Math.round(b * 0.22)}, 0.45)`,
    detectedBgHex: '#FFFFFF',
  };
}

/**
 * Pure helper: Adjusts any 3D palette hex color by intensity & brightness multipliers.
 * Works accurately for both warm gold and any custom color (violet, blue, emerald, ruby, silver).
 */
export function modulateGoldColor(
  hex: string,
  goldIntensityPercent: number,
  brightnessPercent: number
): string {
  const { r, g, b } = hexToRgb(hex);
  const intensity = Math.max(0, Math.min(160, goldIntensityPercent)) / 100;
  const bright = Math.max(40, Math.min(160, brightnessPercent)) / 100;

  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const satMult = 0.55 + 0.45 * intensity;
  const satR = lum + (r - lum) * satMult;
  const satG = lum + (g - lum) * satMult;
  // For warm gold colors (R > B and G > B), slightly deepen saturation when intensity > 1
  const isWarmGold = r > b + 25 && g > b + 10;
  const satB = isWarmGold
    ? lum + (b - lum) * Math.max(0.2, 1 - 0.35 * (intensity - 1))
    : lum + (b - lum) * satMult;

  return rgbToHex(satR * bright, satG * bright, satB * bright);
}

/**
 * Pure helper: Extracts a universal 6-stop 3D color & shading palette from ANY image's RGBA pixel buffer.
 * Whether the user uploads a gold reference, a purple/blue/red/green emblem, a sunset, or a custom logo,
 * it extracts the image's actual highlights, bright face, dominant midtone, bevel shade, and 3D extrusion tones.
 */
export function extractReferenceGoldPalette(
  rgbaData: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): ReferenceGoldPalette {
  if (!rgbaData || rgbaData.length < 16 || width <= 0 || height <= 0) {
    return { ...DEFAULT_REFERENCE_PALETTE };
  }

  const totalPixels = Math.min(width * height, Math.floor(rgbaData.length / 4));
  const step = Math.max(1, Math.floor(totalPixels / 8000));

  // Detect corner background color to exclude uniform background pixels
  const bgR = rgbaData[0] ?? 255;
  const bgG = rgbaData[1] ?? 255;
  const bgB = rgbaData[2] ?? 255;
  const bgA = rgbaData[3] ?? 255;

  interface SamplePixel {
    r: number;
    g: number;
    b: number;
    lum: number;
    sat: number;
  }

  const foreground: SamplePixel[] = [];

  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    const r = rgbaData[idx];
    const g = rgbaData[idx + 1];
    const b = rgbaData[idx + 2];
    const a = rgbaData[idx + 3];

    if (a < 60) continue;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // Skip near-white or near-black neutral background pixels
    if (r > 235 && g > 235 && b > 232 && sat < 24) continue;
    if (r < 36 && g < 36 && b < 42 && sat < 20) continue;

    // Skip pixels matching corner background if background is opaque
    if (bgA > 200) {
      const distBg = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (distBg < 32 && sat < 32) continue;
    }

    foreground.push({ r, g, b, lum, sat });
  }

  // Prefer vibrant/chromatic pixels if the image has colored content (ignores gray UI frames)
  const chromatic = foreground.filter((px) => px.sat >= 24);
  const activePool = chromatic.length >= 8 ? chromatic : foreground;

  if (activePool.length < 6) {
    return { ...DEFAULT_REFERENCE_PALETTE };
  }

  // Sort active pixels from brightest to darkest luminance
  activePool.sort((a, b) => b.lum - a.lum);
  const poolLen = activePool.length;

  const avgSlice = (startRatio: number, endRatio: number) => {
    const s = Math.max(0, Math.floor(poolLen * startRatio));
    const e = Math.max(s + 1, Math.min(poolLen, Math.ceil(poolLen * endRatio)));
    let sr = 0,
      sg = 0,
      sb = 0,
      wSum = 0;
    for (let i = s; i < e; i++) {
      const px = activePool[i];
      // Weight by saturation so vibrant colors dominate over dull gray edges
      const w = 1 + (px.sat / 255) * 2.2;
      sr += px.r * w;
      sg += px.g * w;
      sb += px.b * w;
      wSum += w;
    }
    return {
      r: sr / (wSum || 1),
      g: sg / (wSum || 1),
      b: sb / (wSum || 1),
    };
  };

  const hiAvg = avgSlice(0.0, 0.18);
  const brightAvg = avgSlice(0.15, 0.42);
  const midAvg = avgSlice(0.32, 0.65);
  const warmAvg = avgSlice(0.6, 0.85);
  const deepAvg = avgSlice(0.82, 1.0);

  // Check if the image has sufficient tonal dynamic range; if flat, synthesize 3D stops from midAvg
  const lumSpan = activePool[0].lum - activePool[poolLen - 1].lum;
  if (lumSpan < 35) {
    return generate3DPaletteFromBaseColor(rgbToHex(midAvg.r, midAvg.g, midAvg.b));
  }

  const mixToward = (c: { r: number; g: number; b: number }, target: number, t: number) =>
    rgbToHex(
      c.r + (target - c.r) * t,
      c.g + (target - c.g) * t,
      c.b + (target - c.b) * t
    );

  return {
    highlightHex: mixToward(hiAvg, 255, 0.42),
    brightGoldHex: rgbToHex(
      Math.min(255, brightAvg.r * 1.06),
      Math.min(255, brightAvg.g * 1.06),
      Math.min(255, brightAvg.b * 1.04)
    ),
    midGoldHex: rgbToHex(midAvg.r, midAvg.g, midAvg.b),
    warmAmberHex: rgbToHex(warmAvg.r * 0.92, warmAvg.g * 0.9, warmAvg.b * 0.92),
    deepBronzeHex: rgbToHex(deepAvg.r * 0.65, deepAvg.g * 0.62, deepAvg.b * 0.65),
    darkGrooveHex: rgbToHex(deepAvg.r * 0.35, deepAvg.g * 0.32, deepAvg.b * 0.36),
    shadowRgba: `rgba(${Math.round(deepAvg.r * 0.4)}, ${Math.round(deepAvg.g * 0.38)}, ${Math.round(deepAvg.b * 0.4)}, 0.45)`,
    detectedBgHex: '#FFFFFF',
  };
}

/**
 * Pure helper: Removes white/solid background from an RGBA buffer while preserving
 * 100% of the 3D gold pixels and converting soft floor shadows into smooth alpha transparency.
 */
export function removeWhiteBackgroundPreserveShadow(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number,
  bgHex = '#FFFFFF'
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgbaData);
  const bg = hexToRgb(bgHex);
  const total = Math.min(width * height, Math.floor(out.length / 4));

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const r = out[idx];
    const g = out[idx + 1];
    const b = out[idx + 2];
    const a = out[idx + 3];
    if (a === 0) continue;

    // Color saturation (gold has high R-B difference; white/gray shadow has low R-B difference)
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;

    const dr = Math.abs(r - bg.r);
    const dg = Math.abs(g - bg.g);
    const db = Math.abs(b - bg.b);
    const distFromBg = Math.sqrt(dr * dr + dg * dg + db * db);

    // Pure background pixel -> fully transparent
    if (distFromBg < 14 && chroma < 14) {
      out[idx + 3] = 0;
      continue;
    }

    // Soft neutral/warm shadow region near white background (low chroma, high luminance)
    if (chroma < 28 && r > 150 && g > 140 && b > 130) {
      const darkness = Math.max(0, (255 - (r * 0.3 + g * 0.59 + b * 0.11)) / 255);
      const shadowAlpha = Math.min(1, Math.max(0, darkness * 2.4));
      out[idx] = 42;
      out[idx + 1] = 22;
      out[idx + 2] = 4;
      out[idx + 3] = Math.round(shadowAlpha * 255);
    }
  }

  return out;
}

/**
 * Draws a sparkle star glint at (x, y) for jewelry-like specular highlights.
 */
function drawGoldSparkleGlint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha = 0.85,
  tintHex = '#FFE438'
) {
  if (radius <= 1) return;
  const tint = hexToRgb(tintHex);
  ctx.save();
  ctx.globalAlpha = alpha;

  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  grad.addColorStop(0.25, `rgba(${Math.min(255, tint.r + 40)}, ${Math.min(255, tint.g + 40)}, ${Math.min(255, tint.b + 40)}, 0.78)`);
  grad.addColorStop(0.6, `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.24)`);
  grad.addColorStop(1, `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Four-point crisp star flare
  ctx.strokeStyle = 'rgba(255, 253, 240, 0.88)';
  ctx.lineWidth = Math.max(1, radius * 0.08);
  ctx.beginPath();
  ctx.moveTo(x - radius * 1.15, y);
  ctx.lineTo(x + radius * 1.15, y);
  ctx.moveTo(x, y - radius * 1.15);
  ctx.lineTo(x, y + radius * 1.15);
  ctx.stroke();

  ctx.restore();
}

/**
 * Renders the 3D Gold / Metallic Arabic/English Typography onto the given HTMLCanvasElement,
 * reproducing the exact visual identity of the "وكيل شحن" reference image or any chosen color/image style:
 * - Clean white background (or custom color / transparent alpha background when requested)
 * - Soft natural contact shadow & ambient floor shadow beneath the 3D extrusion
 * - Thick extruded 3D metallic sidewalls with vertical & directional shading
 * - Stepped, faceted outer rim + chamfered groove + bright top-left specular bevel
 * - Rich metallic inner face + optional Image Color-Shape / Pattern Texture overlay
 */
export function renderGold3DTextToCanvas(
  canvas: HTMLCanvasElement,
  config: Gold3DStyleConfig,
  options?: { forceTransparentBg?: boolean; colorSourceImage?: HTMLImageElement | null }
): TypographyLayoutResult {
  const width = Math.max(256, Math.min(4096, Math.round(config.canvasWidth || 1536)));
  const height = Math.max(256, Math.min(4096, Math.round(config.canvasHeight || 1024)));

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return computeAutoFitTypography({
      text: config.text,
      canvasWidth: width,
      canvasHeight: height,
    });
  }

  const fontOpt =
    GOLD_FONT_OPTIONS.find((f) => f.id === config.fontId) || GOLD_FONT_OPTIONS[0];

  const layout = computeAutoFitTypography({
    text: config.text,
    canvasWidth: width,
    canvasHeight: height,
    textSizeScale: config.textSizeScale,
    extrusionDepth: config.extrusionDepth,
    bevelThickness: config.bevelThickness,
    shadowStrength: config.shadowStrength,
    offsetX: config.offsetX,
    offsetY: config.offsetY,
    letterSpacing: config.letterSpacing,
    measureTextWidth: (line, fontPx) => {
      ctx.save();
      ctx.font = `${fontOpt.fontWeight} ${fontPx}px ${fontOpt.fontFamily}`;
      const m = ctx.measureText(line).width;
      ctx.restore();
      return m;
    },
  });

  const isTransparent = Boolean(options?.forceTransparentBg || config.transparentPreview);

  // 1. Clear and fill background
  ctx.clearRect(0, 0, width, height);
  if (!isTransparent) {
    ctx.fillStyle = config.backgroundColor || '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
  }

  const pal = config.referencePalette || DEFAULT_REFERENCE_PALETTE;
  const hiColor = modulateGoldColor(pal.highlightHex, config.goldIntensity, config.brightness);
  const brightGold = modulateGoldColor(pal.brightGoldHex, config.goldIntensity, config.brightness);
  const midGold = modulateGoldColor(pal.midGoldHex, config.goldIntensity, config.brightness);
  const warmAmber = modulateGoldColor(pal.warmAmberHex, config.goldIntensity, config.brightness);
  const deepBronze = modulateGoldColor(pal.deepBronzeHex, config.goldIntensity, config.brightness);
  const darkGroove = modulateGoldColor(pal.darkGrooveHex, config.goldIntensity, config.brightness);

  const shadowRgb = hexToRgb(deepBronze);

  const {
    lines,
    direction,
    hasArabic,
    fontSizePx,
    lineHeightPx,
    scaledExtrusionPx,
    scaledBevelPx,
    scaledShadowBlurPx,
    centerX,
    centerY,
  } = layout;

  const configureTextContext = (targetCtx: CanvasRenderingContext2D) => {
    targetCtx.direction = direction;
    targetCtx.textAlign = 'center';
    targetCtx.textBaseline = 'middle';
    targetCtx.lineJoin = 'round';
    targetCtx.lineCap = 'round';
    targetCtx.miterLimit = 2;
    targetCtx.font = `${fontOpt.fontWeight} ${fontSizePx}px ${fontOpt.fontFamily}`;
    if ('letterSpacing' in targetCtx) {
      // Never apply positive letter-spacing to connected Arabic script as it breaks cursive joints
      const effectiveSpacing = hasArabic ? 0 : config.letterSpacing || 0;
      (targetCtx as any).letterSpacing = `${effectiveSpacing}px`;
    }
  };

  ctx.save();
  configureTextContext(ctx);

  const totalBlockHeight = (lines.length - 1) * lineHeightPx;
  const startY = centerY - totalBlockHeight / 2;

  const drawFilledLinesOn = (
    targetCtx: CanvasRenderingContext2D,
    dx = 0,
    dy = 0
  ) => {
    for (let i = 0; i < lines.length; i++) {
      const ly = startY + i * lineHeightPx + dy;
      const lx = centerX + dx;
      targetCtx.fillText(lines[i], lx, ly);
    }
  };

  const faceTop = startY - fontSizePx * 0.56;
  const faceBottom = startY + totalBlockHeight + fontSizePx * 0.56;

  const canCreateOffscreen = typeof document !== 'undefined';
  const makeCanvas = (): HTMLCanvasElement | null => {
    if (!canCreateOffscreen) return null;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  };

  // Fallback for non-DOM test environments
  const baseMask = makeCanvas();
  if (!baseMask) {
    const fallbackGrad = ctx.createLinearGradient(centerX, faceTop, centerX, faceBottom);
    fallbackGrad.addColorStop(0, hiColor);
    fallbackGrad.addColorStop(0.5, brightGold);
    fallbackGrad.addColorStop(1, warmAmber);
    ctx.fillStyle = fallbackGrad;
    drawFilledLinesOn(ctx, 0, 0);
    ctx.restore();
    return layout;
  }

  // ============================================================================
  // STEP 0: Pure Native Vector Silhouette (Zero Outward Dilation / Zero Bumps)
  // Uses native fillText with zero strokeText and zero outward dilation so letter
  // teeth (ش), dots (ن ي ش), and connected baselines (وكيل) stay 100% razor-sharp
  // and never blob or bridge together. All 3D bevels are sculpted strictly INWARD.
  // ============================================================================
  const bctx = baseMask.getContext('2d')!;
  configureTextContext(bctx);
  bctx.fillStyle = '#FFFFFF';
  drawFilledLinesOn(bctx, 0, 0);

  // Compute tight active bounding box around the text + 3D extrusion
  const padX = Math.ceil(scaledExtrusionPx + 48);
  const padYTop = Math.ceil(fontSizePx * 0.75 + 36);
  const padYBottom = Math.ceil(
    totalBlockHeight + fontSizePx * 0.75 + scaledExtrusionPx * 1.35 + 48
  );
  const roiMinX = Math.max(0, Math.floor(centerX - layout.maxAllowedWidth * 0.58 - padX));
  const roiMaxX = Math.min(width, Math.ceil(centerX + layout.maxAllowedWidth * 0.58 + padX));
  const roiMinY = Math.max(0, Math.floor(startY - padYTop));
  const roiMaxY = Math.min(height, Math.ceil(startY + padYBottom));
  const roiW = Math.max(1, roiMaxX - roiMinX);
  const roiH = Math.max(1, roiMaxY - roiMinY);

  // Helper: Creates a colorized/gradient-filled canvas from a silhouette mask
  const createTintedSilhouette = (
    mask: HTMLCanvasElement,
    paintFill: (targetCtx: CanvasRenderingContext2D) => void
  ): HTMLCanvasElement => {
    const layer = makeCanvas()!;
    const lctx = layer.getContext('2d')!;
    lctx.drawImage(mask, 0, 0);
    lctx.globalCompositeOperation = 'source-in';
    paintFill(lctx);
    lctx.fillRect(0, 0, width, height);
    return layer;
  };

  // ============================================================================
  // STAGE 1: Soft Natural Studio Floor & Contact Shadows (Beneath 3D Extrusion)
  // ============================================================================
  const shadowRatio = Math.max(0, Math.min(100, config.shadowStrength)) / 100;
  if (shadowRatio > 0.01) {
    const shadowCaster = createTintedSilhouette(baseMask, (sctx) => {
      sctx.fillStyle = `rgb(${shadowRgb.r}, ${shadowRgb.g}, ${shadowRgb.b})`;
    });

    // 1A. Wide diffused studio floor shadow
    ctx.save();
    ctx.globalAlpha = 0.25 * shadowRatio;
    ctx.shadowColor = `rgba(${shadowRgb.r}, ${shadowRgb.g}, ${shadowRgb.b}, ${(0.5 * shadowRatio).toFixed(3)})`;
    ctx.shadowBlur = Math.max(18, scaledShadowBlurPx * 1.6);
    ctx.shadowOffsetX = Math.round(scaledExtrusionPx * 0.12);
    ctx.shadowOffsetY = Math.round(scaledExtrusionPx * 0.88 + fontSizePx * 0.04);
    ctx.drawImage(shadowCaster, 0, scaledExtrusionPx * 0.5);
    ctx.restore();

    // 1B. Soft ambient occlusion contact shadow directly beneath the 3D base
    ctx.save();
    ctx.globalAlpha = 0.38 * shadowRatio;
    ctx.shadowColor = `rgba(${Math.round(shadowRgb.r * 0.4)}, ${Math.round(shadowRgb.g * 0.4)}, ${Math.round(shadowRgb.b * 0.4)}, ${(0.6 * shadowRatio).toFixed(3)})`;
    ctx.shadowBlur = Math.max(7, scaledShadowBlurPx * 0.45);
    ctx.shadowOffsetX = Math.round(scaledExtrusionPx * 0.06);
    ctx.shadowOffsetY = Math.round(scaledExtrusionPx * 0.24 + 3);
    ctx.drawImage(shadowCaster, 0, scaledExtrusionPx * 0.72);
    ctx.restore();
  }

  // ============================================================================
  // STAGE 2: Smooth Solid 3D Extruded Sidewalls (Directly From Pure Native Mask)
  // ============================================================================
  if (scaledExtrusionPx > 0.5) {
    const makeExtrudeSlice = (
      c0: string,
      c1: string,
      c2: string,
      c3: string,
      c4: string
    ) =>
      createTintedSilhouette(baseMask, (sctx) => {
        const g = sctx.createLinearGradient(
          centerX - layout.maxAllowedWidth * 0.46,
          faceTop,
          centerX + layout.maxAllowedWidth * 0.46,
          faceBottom
        );
        g.addColorStop(0.0, c0);
        g.addColorStop(0.28, c1);
        g.addColorStop(0.52, c2);
        g.addColorStop(0.78, c3);
        g.addColorStop(1.0, c4);
        sctx.fillStyle = g;
      });

    const deepBaseSlice = makeExtrudeSlice(
      darkGroove,
      deepBronze,
      darkGroove,
      deepBronze,
      darkGroove
    );
    const lowerMidSlice = makeExtrudeSlice(
      deepBronze,
      warmAmber,
      deepBronze,
      warmAmber,
      darkGroove
    );
    const upperMidSlice = makeExtrudeSlice(
      warmAmber,
      midGold,
      warmAmber,
      midGold,
      deepBronze
    );
    const frontNeckSlice = makeExtrudeSlice(
       deepBronze,
      warmAmber,
      deepBronze,
      warmAmber,
      darkGroove
    );

    const extrudeSteps = Math.max(2, Math.min(120, Math.round(scaledExtrusionPx * 2.0)));
    for (let s = extrudeSteps; s >= 1; s--) {
      const t = s / extrudeSteps;
      const exX = t * scaledExtrusionPx * 0.12;
      const exY = t * scaledExtrusionPx * 0.76;

      if (t > 0.85) {
        ctx.drawImage(deepBaseSlice, exX, exY);
      } else if (t > 0.45) {
        ctx.drawImage(lowerMidSlice, exX, exY);
      } else if (t > 0.12) {
        ctx.drawImage(upperMidSlice, exX, exY);
      } else {
        ctx.drawImage(frontNeckSlice, exX, exY);
      }
    }
  }

  // ============================================================================
  // STAGE 3: Pure Inward-Sculpted 3D Bevel + Mirror-Polished Metallic Face
  // All bevels are sculpted strictly INSIDE `baseMask` so outer contours stay
  // 100% razor-sharp with zero outward bumps or bridged dots.
  // ============================================================================
  const faceCanvas = makeCanvas();
  if (faceCanvas) {
    const fctx = faceCanvas.getContext('2d')!;

    // 3A. Fill pure native word mask with the primary mirror-polished metallic gradient
    fctx.drawImage(baseMask, 0, 0);
    fctx.globalCompositeOperation = 'source-in';

    const mainFaceGrad = fctx.createLinearGradient(centerX, faceTop, centerX, faceBottom);
    mainFaceGrad.addColorStop(0.0, hiColor);
    mainFaceGrad.addColorStop(0.20, brightGold);
    mainFaceGrad.addColorStop(0.46, midGold);
    mainFaceGrad.addColorStop(0.56, brightGold); // Crisp studio horizon reflection
    mainFaceGrad.addColorStop(0.82, midGold);
    mainFaceGrad.addColorStop(0.95, warmAmber);
    mainFaceGrad.addColorStop(1.0, brightGold);
    fctx.fillStyle = mainFaceGrad;
    fctx.fillRect(0, 0, width, height);

    // 3B. Optional Image Color-Shape / Pattern Texture blend
    fctx.globalCompositeOperation = 'source-atop';
    const texBlend = Math.max(0, Math.min(100, config.imageTextureBlend ?? 0)) / 100;
    if (options?.colorSourceImage && texBlend > 0.01) {
      const boxW = Math.max(200, layout.maxAllowedWidth);
      const boxH = Math.max(120, faceBottom - faceTop + fontSizePx * 0.3);
      const boxX = centerX - boxW / 2;
      const boxY = faceTop - fontSizePx * 0.15;
      fctx.save();
      fctx.globalAlpha = texBlend;
      fctx.drawImage(options.colorSourceImage, boxX, boxY, boxW, boxH);
      fctx.restore();
    }

    // 3C. Smooth Inward 3D Chamfered Bevel & Specular Rim (Per-Pixel Continuous Heightfield)
    if (scaledBevelPx > 0.2) {
      const bevelBlurPx = Math.max(2.0, Math.min(8.5, scaledBevelPx * 0.48));
      const heightCanvas = makeCanvas()!;
      const hctx = heightCanvas.getContext('2d')!;
      hctx.filter = `blur(${bevelBlurPx.toFixed(2)}px)`;
      hctx.drawImage(baseMask, 0, 0);
      hctx.filter = 'none';

      const targetImg = fctx.getImageData(roiMinX, roiMinY, roiW, roiH);
      const heightImg = hctx.getImageData(roiMinX, roiMinY, roiW, roiH);
      const tData = targetImg.data;
      const hData = heightImg.data;

      const hiRgb = hexToRgb(hiColor);
      const brightRgb = hexToRgb(brightGold);
      const amberRgb = hexToRgb(warmAmber);
      const bronzeRgb = hexToRgb(deepBronze);

      // Studio light from top-left (-0.58, -0.81)
      const lx = 0.58;
      const ly = 0.81;
      const gain = Math.max(1.8, Math.min(4.0, bevelBlurPx * 0.52));

      for (let y = 1; y < roiH - 1; y++) {
        const rowOffset = y * roiW;
        for (let x = 1; x < roiW - 1; x++) {
          const idx = (rowOffset + x) << 2;
          const alpha = tData[idx + 3];
          if (alpha === 0) continue;

          // Height value h in [0..1]: ~0.5 at outer edge, rising to 1.0 on flat inner plateau
          const h = hData[idx + 3] / 255;

          const idxL = idx - 4;
          const idxR = idx + 4;
          const idxU = idx - (roiW << 2);
          const idxD = idx + (roiW << 2);

          const gx = (hData[idxR + 3] - hData[idxL + 3]) / 255;
          const gy = (hData[idxD + 3] - hData[idxU + 3]) / 255;
          const mag = Math.hypot(gx, gy);

          if (mag > 0.003) {
            // Smooth bevel weight that tapers cleanly to 0 on the flat interior plateau (h -> 1)
            const bevelMask = Math.min(1, mag * gain);
            const dot = (gx * lx + gy * ly) / (mag + 0.0001);

            if (dot > 0) {
              // Top-left lit bevel facet: smooth metallic gold-to-white specular highlight
              const spec = Math.min(1, dot * bevelMask * 1.15);
              const specPow = spec * spec;
              const targetR = brightRgb.r + (hiRgb.r - brightRgb.r) * spec + (255 - hiRgb.r) * specPow * 0.65;
              const targetG = brightRgb.g + (hiRgb.g - brightRgb.g) * spec + (255 - hiRgb.g) * specPow * 0.65;
              const targetB = brightRgb.b + (hiRgb.b - brightRgb.b) * spec + (255 - hiRgb.b) * specPow * 0.65;

              tData[idx] = Math.min(255, Math.round(tData[idx] + (targetR - tData[idx]) * spec));
              tData[idx + 1] = Math.min(255, Math.round(tData[idx + 1] + (targetG - tData[idx + 1]) * spec));
              tData[idx + 2] = Math.min(255, Math.round(tData[idx + 2] + (targetB - tData[idx + 2]) * spec));
            } else {
              // Bottom-right shaded bevel facet: smooth warm amber-to-bronze interpolation (no hard step!)
              const sh = Math.min(1, -dot * bevelMask * 0.92);
              const shSmooth = sh * sh * (3 - 2 * sh);
              const targetR = amberRgb.r + (bronzeRgb.r - amberRgb.r) * shSmooth;
              const targetG = amberRgb.g + (bronzeRgb.g - amberRgb.g) * shSmooth;
              const targetB = amberRgb.b + (bronzeRgb.b - amberRgb.b) * shSmooth;

              tData[idx] = Math.round(tData[idx] + (targetR - tData[idx]) * sh);
              tData[idx + 1] = Math.round(tData[idx + 1] + (targetG - tData[idx + 1]) * sh);
              tData[idx + 2] = Math.round(tData[idx + 2] + (targetB - tData[idx + 2]) * sh);
            }

            // Subtle luxury chiseled inner ridge where the bevel slope meets the flat inner plateau (h ≈ 0.86)
            const ridgeDist = Math.abs(h - 0.86);
            if (ridgeDist < 0.06) {
              const ridgeFactor = (1 - ridgeDist / 0.06) * 0.22;
              if (dot > 0) {
                tData[idx] = Math.min(255, Math.round(tData[idx] + (255 - tData[idx]) * ridgeFactor));
                tData[idx + 1] = Math.min(255, Math.round(tData[idx + 1] + (255 - tData[idx + 1]) * ridgeFactor));
                tData[idx + 2] = Math.min(255, Math.round(tData[idx + 2] + (240 - tData[idx + 2]) * ridgeFactor));
              } else {
                tData[idx] = Math.round(tData[idx] + (amberRgb.r - tData[idx]) * ridgeFactor);
                tData[idx + 1] = Math.round(tData[idx + 1] + (amberRgb.g - tData[idx + 1]) * ridgeFactor);
                tData[idx + 2] = Math.round(tData[idx + 2] + (amberRgb.b - tData[idx + 2]) * ridgeFactor);
              }
            }
          }
        }
      }

      fctx.putImageData(targetImg, roiMinX, roiMinY);
    }

    // 3D. Soft diagonal studio specular light sheen across the polished face
    fctx.globalCompositeOperation = 'source-atop';
    const sheenGrad = fctx.createLinearGradient(
      centerX - layout.maxAllowedWidth * 0.42,
      faceTop,
      centerX + layout.maxAllowedWidth * 0.38,
      faceBottom
    );
    sheenGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.28)');
    sheenGrad.addColorStop(0.24, 'rgba(255, 255, 255, 0.08)');
    sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
    sheenGrad.addColorStop(0.74, 'rgba(255, 255, 255, 0.10)');
    sheenGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.06)');
    fctx.fillStyle = sheenGrad;
    fctx.fillRect(0, 0, width, height);

    // 3E. Crisp 1.4px metallic bezel rim separating the front face & dots from the 3D extrusion
    const bezelRimLayer = createTintedSilhouette(baseMask, (lctx) => {
      const g = lctx.createLinearGradient(centerX, faceTop, centerX, faceBottom);
      g.addColorStop(0.0, warmAmber);
      g.addColorStop(0.5, deepBronze);
      g.addColorStop(1.0, darkGroove);
      lctx.fillStyle = g;
    });
    for (let a = 0; a < 12; a++) {
      const theta = (a * Math.PI * 2) / 12;
      ctx.drawImage(bezelRimLayer, Math.cos(theta) * 1.35, Math.sin(theta) * 1.35);
    }

    ctx.drawImage(faceCanvas, 0, 0);
  }

  // ============================================================================
  // STAGE 4: Crisp Jewelry Specular Glints (Matching Reference Corner Sparkles)
  // ============================================================================
  if (config.addSparkleGlints) {
    const glintRadius = Math.max(9, Math.round(fontSizePx * 0.12));
    const approxHalfW = Math.min(layout.maxAllowedWidth * 0.42, fontSizePx * 1.45);
    drawGoldSparkleGlint(
      ctx,
      centerX - approxHalfW * 0.78,
      startY + totalBlockHeight + fontSizePx * 0.22,
      glintRadius,
      0.8,
      brightGold
    );
    drawGoldSparkleGlint(
      ctx,
      centerX - approxHalfW * 0.1,
      startY - fontSizePx * 0.34,
      glintRadius * 0.74,
      0.66,
      brightGold
    );
    drawGoldSparkleGlint(
      ctx,
      centerX + approxHalfW * 0.68,
      startY - fontSizePx * 0.18,
      glintRadius * 0.68,
      0.62,
      brightGold
    );
  }

  ctx.restore();
  return layout;
}


