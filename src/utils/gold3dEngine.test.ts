import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GOLD_STYLE,
  GOLD_DIMENSION_PRESETS,
  GOLD_MATERIAL_PRESETS,
  detectTextDirectionAndScript,
  computeAutoFitTypography,
  modulateGoldColor,
  generate3DPaletteFromBaseColor,
  extractReferenceGoldPalette,
  removeWhiteBackgroundPreserveShadow,
  hexToRgb,
} from './gold3dEngine';

describe('AI 3D Gold Arabic Name Designer Engine — Pure Logic Tests', () => {
  it('detects Arabic RTL, English LTR, numbers, and mixed text accurately', () => {
    const ar = detectTextDirectionAndScript('وكيل شحن');
    assert.equal(ar.direction, 'rtl');
    assert.equal(ar.hasArabic, true);
    assert.equal(ar.hasLatin, false);
    assert.equal(ar.cleanText, 'وكيل شحن');

    const en = detectTextDirectionAndScript('ROYAL GOLD 777');
    assert.equal(en.direction, 'ltr');
    assert.equal(en.hasArabic, false);
    assert.equal(en.hasLatin, true);
    assert.equal(en.hasNumbers, true);

    const mixed = detectTextDirectionAndScript('وكيل VIP 2026');
    assert.equal(mixed.direction, 'rtl');
    assert.equal(mixed.hasArabic, true);
    assert.equal(mixed.hasLatin, true);
    assert.equal(mixed.hasNumbers, true);
  });

  it('computes auto-fit typography proportions consistently across all preset dimensions without clipping', () => {
    const shortLayout = computeAutoFitTypography({
      text: 'وكيل شحن',
      canvasWidth: 1536,
      canvasHeight: 1024,
    });
    assert.equal(shortLayout.lines.length, 1);
    assert.equal(shortLayout.lines[0], 'وكيل شحن');
    assert.ok(shortLayout.fontSizePx >= 180 && shortLayout.fontSizePx <= 320);

    const longLayout = computeAutoFitTypography({
      text: 'سمو الأمير محمد بن سلطان الملكي',
      canvasWidth: 1536,
      canvasHeight: 1024,
    });
    assert.ok(longLayout.fontSizePx < shortLayout.fontSizePx, 'Long names must scale down to prevent clipping');

    // Verify all standard presets produce valid centered layouts
    for (const preset of GOLD_DIMENSION_PRESETS) {
      const res = computeAutoFitTypography({
        text: 'وكيل شحن',
        canvasWidth: preset.width,
        canvasHeight: preset.height,
        extrusionDepth: DEFAULT_GOLD_STYLE.extrusionDepth,
        bevelThickness: DEFAULT_GOLD_STYLE.bevelThickness,
      });
      assert.equal(res.centerX, Math.round(preset.width * 0.5));
      assert.ok(res.fontSizePx >= 28);
      assert.ok(res.scaledExtrusionPx > 0);
      assert.ok(res.scaledBevelPx > 0);
    }
  });

  it('extracts 3D palette from both warm gold and non-gold (e.g. cyber violet / blue) images', () => {
    // 1. Gold reference pixels
    const goldPixels = new Uint8ClampedArray(64 * 4);
    for (let i = 0; i < 64; i++) {
      const idx = i * 4;
      if (i < 16) {
        goldPixels[idx] = 255;
        goldPixels[idx + 1] = 255;
        goldPixels[idx + 2] = 255;
        goldPixels[idx + 3] = 255;
      } else if (i < 32) {
        goldPixels[idx] = 255;
        goldPixels[idx + 1] = 245;
        goldPixels[idx + 2] = 150;
        goldPixels[idx + 3] = 255;
      } else if (i < 48) {
        goldPixels[idx] = 255;
        goldPixels[idx + 1] = 195;
        goldPixels[idx + 2] = 20;
        goldPixels[idx + 3] = 255;
      } else {
        goldPixels[idx] = 110;
        goldPixels[idx + 1] = 55;
        goldPixels[idx + 2] = 5;
        goldPixels[idx + 3] = 255;
      }
    }

    const goldPalette = extractReferenceGoldPalette(goldPixels, 8, 8);
    assert.ok(goldPalette.highlightHex.startsWith('#'));
    assert.ok(goldPalette.midGoldHex.startsWith('#'));
    assert.ok(goldPalette.deepBronzeHex.startsWith('#'));

    // 2. Blue / Violet image pixels (verifies universal image color extraction)
    const bluePixels = new Uint8ClampedArray(64 * 4);
    for (let i = 0; i < 64; i++) {
      const idx = i * 4;
      if (i < 16) {
        // Dark background
        bluePixels[idx] = 8;
        bluePixels[idx + 1] = 8;
        bluePixels[idx + 2] = 10;
        bluePixels[idx + 3] = 255;
      } else if (i < 36) {
        // Bright cyan-blue highlight
        bluePixels[idx] = 80;
        bluePixels[idx + 1] = 200;
        bluePixels[idx + 2] = 255;
        bluePixels[idx + 3] = 255;
      } else {
        // Deep royal blue
        bluePixels[idx] = 20;
        bluePixels[idx + 1] = 80;
        bluePixels[idx + 2] = 210;
        bluePixels[idx + 3] = 255;
      }
    }
    const bluePalette = extractReferenceGoldPalette(bluePixels, 8, 8);
    const midRgb = hexToRgb(bluePalette.midGoldHex);
    assert.ok(midRgb.b > midRgb.r, 'Extracted palette from blue image should have dominant blue channel');
  });

  it('generates a complete 6-stop 3D metallic palette from any custom base color and provides presets', () => {
    assert.ok(GOLD_MATERIAL_PRESETS.length >= 6);
    const customPal = generate3DPaletteFromBaseColor('#7C5CFF');
    assert.equal(customPal.midGoldHex, '#7C5CFF');
    const hi = hexToRgb(customPal.highlightHex);
    const mid = hexToRgb(customPal.midGoldHex);
    const deep = hexToRgb(customPal.deepBronzeHex);
    assert.ok(hi.r > mid.r && hi.g > mid.g, 'Highlight should be brighter than midtone');
    assert.ok(deep.b < mid.b, '3D extrusion tone should be darker than midtone');
  });

  it('removes white background while preserving gold pixels and converting soft shadows to alpha', () => {
    const input = new Uint8ClampedArray([
      255, 255, 255, 255, // pure white
      220, 218, 215, 255, // soft shadow on white
      255, 200, 15, 255,  // rich metallic gold
    ]);

    const out = removeWhiteBackgroundPreserveShadow(input, 3, 1, '#FFFFFF');
    assert.equal(out[3], 0);
    assert.ok(out[7] > 0 && out[7] < 200);
    assert.equal(out[8], 255);
    assert.equal(out[9], 200);
    assert.equal(out[10], 15);
    assert.equal(out[11], 255);
  });

  it('modulates gold and custom color saturation and brightness smoothly', () => {
    const base = '#FFC107';
    const brighter = modulateGoldColor(base, 120, 115);
    assert.ok(brighter.startsWith('#') && brighter.length === 7);

    const violet = modulateGoldColor('#7C5CFF', 110, 105);
    const vRgb = hexToRgb(violet);
    assert.ok(vRgb.b > vRgb.g, 'Violet hue should remain violet after modulation');
  });
});

