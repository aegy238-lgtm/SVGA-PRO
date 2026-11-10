import {
  detectBorderBackgroundPalette,
  detectAndRemoveBackgroundSmart,
} from './smartSetCutter';

export interface ChromaKeyConfig {
  enabled: boolean;
  keyColor: string;         // Hex color e.g. '#00ff00'
  similarity: number;       // 1 - 100 (default 42)
  smoothness: number;       // 0 - 50  (default 14)
  spillSuppression: number; // 0 - 100 (default 65)
  edgeChoke: number;        // 0 - 10  (default 1)
  applyToLayers: boolean;   // Apply directly to SVGA/Lottie image layers as well as stage
}

export const INITIAL_CHROMA_KEY: ChromaKeyConfig = {
  enabled: false,
  keyColor: '#00ff00',
  similarity: 42,
  smoothness: 14,
  spillSuppression: 65,
  edgeChoke: 1,
  applyToLayers: true,
};

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Parses a hex color string (#RRGGBB or #RGB) into RGB (0..255).
 * Defaults to pure green (#00ff00) if invalid.
 */
export function parseHexColor(hex: string): RgbColor {
  const clean = (hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return { r: 0, g: 255, b: 0 };
}

/**
 * Converts RGB (0..255) to hex (#rrggbb).
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Converts RGB (0..255) to YCbCr components.
 */
export function rgbToYCbCr(r: number, g: number, b: number): { y: number; cb: number; cr: number } {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return { y, cb, cr };
}

/**
 * Smoothstep interpolation between edge0 and edge1.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Automatically detects the most likely green-screen or background key color
 * from an RGBA pixel buffer of dimensions (width, height).
 * Prioritizes green-dominant pixels along the border/corners, or returns '#00ff00'.
 */
export function autoDetectChromaKeyColor(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): string {
  if (!rgba || width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return '#00ff00';
  }

  let greenSumR = 0;
  let greenSumG = 0;
  let greenSumB = 0;
  let greenCount = 0;

  const samplePixel = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const a = rgba[idx + 3];
    if (a < 128) return;
    // Check if green-dominant
    if (g > 75 && g > r * 1.25 && g > b * 1.25) {
      greenSumR += r;
      greenSumG += g;
      greenSumB += b;
      greenCount++;
    }
  };

  // Sample border pixels first
  const stepX = Math.max(1, Math.floor(width / 32));
  const stepY = Math.max(1, Math.floor(height / 32));
  for (let x = 0; x < width; x += stepX) {
    samplePixel(x, 0);
    samplePixel(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    samplePixel(0, y);
    samplePixel(width - 1, y);
  }

  // If no green on borders, scan a sparse grid across the whole frame
  if (greenCount < 3) {
    for (let y = 0; y < height; y += stepY * 2) {
      for (let x = 0; x < width; x += stepX * 2) {
        samplePixel(x, y);
      }
    }
  }

  if (greenCount > 0) {
    return rgbToHex(greenSumR / greenCount, greenSumG / greenCount, greenSumB / greenCount);
  }

  const borderPal = detectBorderBackgroundPalette(rgba, width, height);
  if (borderPal.isCheckerboard) {
    return '#ffffff';
  }
  if (borderPal.primaryColors.length > 0) {
    const c0 = borderPal.primaryColors[0];
    return rgbToHex(c0.r, c0.g, c0.b);
  }

  return '#00ff00';
}

/**
 * Applies studio-grade Chroma Key removal + Spill Suppression in-place to an RGBA buffer.
 * Protects warm golden/yellow/orange tones when keying green screen so gift crowns and frames stay intact.
 * Returns the number of pixels modified.
 */
export function applyChromaKeyToRgbaBuffer(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  config: ChromaKeyConfig
): number {
  if (!config || !config.enabled || !rgba || width <= 0 || height <= 0) {
    return 0;
  }

  const keyRgb = parseHexColor(config.keyColor);
  const keyYCbCr = rgbToYCbCr(keyRgb.r, keyRgb.g, keyRgb.b);

  // Determine if the target key color is a Green Screen shade
  const isGreenKey = keyRgb.g > keyRgb.r + 35 && keyRgb.g > keyRgb.b + 35;
  const isBlueKey = keyRgb.b > keyRgb.r + 35 && keyRgb.b > keyRgb.g + 25;
  const isDarkKey = keyRgb.r < 28 && keyRgb.g < 28 && keyRgb.b < 28;
  const isLightNeutralKey =
    Math.max(keyRgb.r, keyRgb.g, keyRgb.b) - Math.min(keyRgb.r, keyRgb.g, keyRgb.b) <= 24 &&
    keyRgb.r >= 165;

  const borderPal = detectBorderBackgroundPalette(rgba, width, height);
  if (borderPal.isCheckerboard || isLightNeutralKey) {
    const smartRes = detectAndRemoveBackgroundSmart(rgba, width, height, {
      similarity: config.similarity,
      smoothness: config.smoothness,
    });
    if (smartRes.modifiedPixels > 0) {
      return smartRes.modifiedPixels;
    }
  }

  const similarity = Math.max(1, Math.min(100, Number(config.similarity) || 42));
  const smoothness = Math.max(0, Math.min(50, Number(config.smoothness) ?? 14));
  const spillRatio = Math.max(0, Math.min(100, Number(config.spillSuppression) ?? 65)) / 100;
  const choke = Math.max(0, Math.min(10, Number(config.edgeChoke) ?? 1));

  // Base threshold in chroma space (0..150)
  const baseThresh = (similarity / 100) * 112;
  const rampSpan = Math.max(1.5, (smoothness / 50) * 52);
  const cutoffInner = Math.max(2, baseThresh);
  const cutoffOuter = cutoffInner + rampSpan;

  // Minimum alpha floor from edgeChoke (0..10 maps to 0..55 alpha floor)
  const alphaFloor = Math.round(choke * 5.5);

  const totalPixels = width * height;
  let modifiedCount = 0;

  for (let i = 0; i < totalPixels * 4; i += 4) {
    const origA = rgba[i + 3];
    if (origA === 0) continue;

    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];

    let effectiveDist = 999;

    if (isGreenKey) {
      // Protect warm golds, yellows, oranges, and reds (where R is high and close to or greater than G)
      const maxRB = Math.max(r, b);
      const greenDominance = g - maxRB;

      // Chroma distance in CbCr plane
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const dCb = cb - keyYCbCr.cb;
      const dCr = cr - keyYCbCr.cr;
      const chromaDist = Math.hypot(dCb, dCr);

      // Normalized RGB distance to handle dark/bright green shades
      const rgbDist = Math.hypot((r - keyRgb.r) * 0.65, (g - keyRgb.g) * 0.45, (b - keyRgb.b) * 0.65);

      effectiveDist = chromaDist * 0.72 + rgbDist * 0.28;

      // If pixel is strongly green-dominant (e.g. shaded green or neon green screen), pull distance down
      // so all green-screen variations get keyed cleanly
      if (greenDominance > 22 && g > 45 && r < g * 0.78 && b < g * 0.78) {
        const dominanceBoost = Math.min(48, (greenDominance - 22) * 0.55);
        effectiveDist = Math.max(0, effectiveDist - dominanceBoost);
      }

      // Gold / Warm Yellow / Skin Protection: if R >= G * 0.80 and R > 70, this is yellow/gold/orange, NOT green screen
      if (r >= g * 0.8 && r > 65) {
        effectiveDist += 95;
      } else if (greenDominance <= 4) {
        // Non-green pixel (neutral white/gray/purple/blue)
        effectiveDist += 70;
      }
    } else if (isBlueKey) {
      const maxRG = Math.max(r, g);
      const blueDominance = b - maxRG;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const chromaDist = Math.hypot(cb - keyYCbCr.cb, cr - keyYCbCr.cr);
      const rgbDist = Math.hypot((r - keyRgb.r) * 0.65, (g - keyRgb.g) * 0.65, (b - keyRgb.b) * 0.45);
      effectiveDist = chromaDist * 0.72 + rgbDist * 0.28;
      if (blueDominance > 22 && b > 45 && r < b * 0.78 && g < b * 0.82) {
        effectiveDist = Math.max(0, effectiveDist - Math.min(45, (blueDominance - 22) * 0.5));
      }
      if (blueDominance <= 4) {
        effectiveDist += 65;
      }
    } else if (isDarkKey) {
      // Luma key for pure black backgrounds
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxCh = Math.max(r, g, b);
      effectiveDist = luma * 0.7 + maxCh * 0.5;
    } else {
      // Arbitrary custom color key
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const chromaDist = Math.hypot(cb - keyYCbCr.cb, cr - keyYCbCr.cr);
      const rgbDist = Math.hypot(r - keyRgb.r, g - keyRgb.g, b - keyRgb.b) * 0.55;
      effectiveDist = chromaDist * 0.65 + rgbDist * 0.35;
    }

    // Compute new alpha multiplier
    let alphaFactor = 1;
    if (effectiveDist <= cutoffInner) {
      alphaFactor = 0;
    } else if (effectiveDist < cutoffOuter) {
      alphaFactor = smoothstep(cutoffInner, cutoffOuter, effectiveDist);
    }

    let nextAlpha = Math.round(origA * alphaFactor);
    if (nextAlpha <= alphaFloor) {
      nextAlpha = 0;
    }

    if (nextAlpha !== origA) {
      rgba[i + 3] = nextAlpha;
      modifiedCount++;
    }

    // Apply Spill Suppression on visible / semi-transparent edge pixels
    if (nextAlpha > 0 && spillRatio > 0) {
      if (isGreenKey) {
        const refRB = Math.max(r, b);
        const avgRB = (r * 0.55 + b * 0.45);
        // Only suppress green spill if green exceeds red and blue (protects gold/yellow where R >= G)
        if (g > refRB + 6) {
          const excessG = g - (refRB * 0.7 + avgRB * 0.3);
          if (excessG > 0) {
            const suppressedG = Math.max(refRB, Math.round(g - excessG * spillRatio));
            const lumaLoss = (g - suppressedG) * 0.28;
            rgba[i] = Math.min(255, Math.round(r + lumaLoss));
            rgba[i + 1] = suppressedG;
            rgba[i + 2] = Math.min(255, Math.round(b + lumaLoss));
            if (nextAlpha === origA) modifiedCount++;
          }
        }
      } else if (isBlueKey) {
        const refRG = Math.max(r, g);
        if (b > refRG + 6) {
          const excessB = b - refRG;
          const suppressedB = Math.max(refRG, Math.round(b - excessB * spillRatio));
          rgba[i + 2] = suppressedB;
          if (nextAlpha === origA) modifiedCount++;
        }
      }
    }
  }

  return modifiedCount;
}

/**
 * Applies Chroma Key removal in-place to a 2D canvas context of dimensions (W, H).
 */
export function applyChromaKeyToContext(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  config: ChromaKeyConfig
): void {
  if (!ctx || !config || !config.enabled || W <= 0 || H <= 0) return;
  const w = Math.max(1, Math.round(W));
  const h = Math.max(1, Math.round(H));
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const changed = applyChromaKeyToRgbaBuffer(imgData.data, w, h, config);
    if (changed > 0) {
      ctx.putImageData(imgData, 0, 0);
    }
  } catch (_) {}
}
