import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBorderBackgroundPalette,
  detectAndRemoveBackgroundSmart,
  detectSetItemsBoundsFromRgba,
} from './smartSetCutter';
import { autoDetectChromaKeyColor, applyChromaKeyToRgbaBuffer } from './chromaKey';

describe('Smart Set & Sticker Sheet Precision Cutter Engine', () => {
  test('detectAndRemoveBackgroundSmart removes baked white/gray checkerboard background while protecting internal white clothes & eyes', () => {
    const W = 120;
    const H = 120;
    const rgba = new Uint8ClampedArray(W * H * 4);

    // Fill with a baked 8x8 white (#FFFFFF) and gray (#D4D4D8) fake checkerboard
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const isWhite = ((Math.floor(x / 8) + Math.floor(y / 8)) & 1) === 0;
        const c = isWhite ? 255 : 212;
        const idx = (y * W + x) * 4;
        rgba[idx] = c;
        rgba[idx + 1] = c;
        rgba[idx + 2] = isWhite ? 255 : 216;
        rgba[idx + 3] = 255;
      }
    }

    // Draw a sticker in the center [30..90, 30..90]:
    // Outer dark brown/red outline [30..90, 30..90]
    for (let y = 30; y <= 90; y++) {
      for (let x = 30; x <= 90; x++) {
        const idx = (y * W + x) * 4;
        rgba[idx] = 140;
        rgba[idx + 1] = 35;
        rgba[idx + 2] = 25;
        rgba[idx + 3] = 255;
      }
    }
    // Inner pure white thobe/eyes [42..78, 42..78] enclosed inside the character outline
    for (let y = 42; y <= 78; y++) {
      for (let x = 42; x <= 78; x++) {
        const idx = (y * W + x) * 4;
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = 255;
      }
    }

    const palette = detectBorderBackgroundPalette(rgba, W, H);
    assert.equal(palette.isCheckerboard, true, 'Should detect baked checkerboard border');

    const detectedHex = autoDetectChromaKeyColor(rgba, W, H);
    assert.equal(detectedHex, '#ffffff');

    const res = detectAndRemoveBackgroundSmart(rgba, W, H);
    assert.ok(res.modifiedPixels > 5000);

    // Corner checkerboard pixel (2, 2) must be 100% transparent
    assert.equal(rgba[(2 * W + 2) * 4 + 3], 0, 'Outer checkerboard must become transparent');
    assert.equal(rgba[(10 * W + 10) * 4 + 3], 0, 'Gray checkerboard square must become transparent');

    // Internal white pixel (60, 60) inside the character MUST remain 100% opaque (255)!
    assert.equal(
      rgba[(60 * W + 60) * 4 + 3],
      255,
      'Enclosed white clothes/eyes inside sticker must stay 100% opaque'
    );
  });

  test('detectSetItemsBoundsFromRgba slices a 4x6 (24-item) sticker sheet with floating accessories into 24 exact items', () => {
    const cols = 4;
    const rows = 6;
    const cellW = 80;
    const cellH = 90;
    const W = cols * cellW; // 320
    const H = rows * cellH; // 540
    const rgba = new Uint8ClampedArray(W * H * 4);

    // Fill with white background first
    for (let i = 0; i < W * H * 4; i += 4) {
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = 255;
    }

    // Draw 24 stickers (4 cols x 6 rows), each with a main body + a floating heart 2px above the head + a text badge at the bottom
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ox = c * cellW;
        const oy = r * cellH;

        // Floating small heart/accessory near top of cell [oy+10..oy+15]
        for (let y = oy + 10; y <= oy + 15; y++) {
          for (let x = ox + 35; x <= ox + 45; x++) {
            const idx = (y * W + x) * 4;
            rgba[idx] = 230;
            rgba[idx + 1] = 30;
            rgba[idx + 2] = 60;
            rgba[idx + 3] = 255;
          }
        }

        // Main character body [oy+18..oy+64, ox+14..ox+66]
        for (let y = oy + 18; y <= oy + 64; y++) {
          for (let x = ox + 14; x <= ox + 66; x++) {
            const idx = (y * W + x) * 4;
            rgba[idx] = 180;
            rgba[idx + 1] = 110;
            rgba[idx + 2] = 65;
            rgba[idx + 3] = 255;
          }
        }

        // Bottom Arabic text banner [oy+66..oy+76, ox+18..ox+62]
        for (let y = oy + 66; y <= oy + 76; y++) {
          for (let x = ox + 18; x <= ox + 62; x++) {
            const idx = (y * W + x) * 4;
            rgba[idx] = 245;
            rgba[idx + 1] = 190;
            rgba[idx + 2] = 20;
            rgba[idx + 3] = 255;
          }
        }
      }
    }

    // Step 1: Smart background cutout
    detectAndRemoveBackgroundSmart(rgba, W, H);

    // Step 2: Slice set into individual items
    const items = detectSetItemsBoundsFromRgba(rgba, W, H, 4);
    assert.equal(items.length, 24, 'Should detect and slice all 24 stickers in the 4x6 set without fragmenting accessories');

    // Verify reading order and tight bounds for first and last sticker
    assert.equal(items[0].row, 0);
    assert.equal(items[0].col, 0);
    assert.ok(items[0].contentWidth >= 48 && items[0].contentWidth <= 60);
    assert.ok(items[0].contentHeight >= 60 && items[0].contentHeight <= 72);

    assert.equal(items[23].row, 5);
    assert.equal(items[23].col, 3);
  });

  test('applyChromaKeyToRgbaBuffer automatically uses smart flood-fill on checkerboard sticker sheets even if green key is selected', () => {
    const W = 64;
    const H = 64;
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const isWhite = ((Math.floor(x / 8) + Math.floor(y / 8)) & 1) === 0;
        const c = isWhite ? 255 : 208;
        const idx = (y * W + x) * 4;
        rgba[idx] = c;
        rgba[idx + 1] = c;
        rgba[idx + 2] = c;
        rgba[idx + 3] = 255;
      }
    }
    // Center red badge [20..44, 20..44]
    for (let y = 20; y <= 44; y++) {
      for (let x = 20; x <= 44; x++) {
        const idx = (y * W + x) * 4;
        rgba[idx] = 220;
        rgba[idx + 1] = 40;
        rgba[idx + 2] = 50;
        rgba[idx + 3] = 255;
      }
    }

    const changed = applyChromaKeyToRgbaBuffer(rgba, W, H, {
      enabled: true,
      keyColor: '#00ff00',
      similarity: 100,
      smoothness: 14,
      spillSuppression: 65,
      edgeChoke: 1,
      applyToLayers: true,
    });
    assert.ok(changed > 1000);
    assert.equal(rgba[3], 0, 'Border checkerboard pixel should be keyed out');
    assert.equal(rgba[(32 * W + 32) * 4 + 3], 255, 'Center badge should remain opaque');
  });
});
