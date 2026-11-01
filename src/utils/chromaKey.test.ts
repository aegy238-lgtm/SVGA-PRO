import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_CHROMA_KEY,
  ChromaKeyConfig,
  parseHexColor,
  rgbToHex,
  autoDetectChromaKeyColor,
  applyChromaKeyToRgbaBuffer,
} from './chromaKey';

describe('Chroma Key (Green Screen) Removal Engine', () => {
  it('parses and formats hex colors accurately', () => {
    assert.deepEqual(parseHexColor('#00ff00'), { r: 0, g: 255, b: 0 });
    assert.deepEqual(parseHexColor('#0f0'), { r: 0, g: 255, b: 0 });
    assert.equal(rgbToHex(0, 255, 0), '#00ff00');
    assert.equal(rgbToHex(0, 177, 64), '#00b140');
  });

  it('removes pure green, studio green, and shaded green while preserving gold, white, and purple gift pixels', () => {
    // 6 pixels:
    // 0: Pure Green (#00ff00) -> should become transparent (alpha = 0)
    // 1: Studio Green (#00b140) -> should become transparent (alpha = 0)
    // 2: Shaded Dark Green (#0c7a1e) -> should become transparent (alpha = 0)
    // 3: Royal Gold (#fbbf24 -> 251, 191, 36) -> must remain 100% opaque (alpha = 255)
    // 4: Bright Yellow-Gold (#eab308 -> 234, 179, 8) -> must remain 100% opaque (alpha = 255)
    // 5: Royal Purple (#7c3aed -> 124, 58, 237) -> must remain 100% opaque (alpha = 255)
    const rgba = new Uint8ClampedArray([
      0, 255, 0, 255,
      0, 177, 64, 255,
      12, 122, 30, 255,
      251, 191, 36, 255,
      234, 179, 8, 255,
      124, 58, 237, 255,
    ]);

    const cfg: ChromaKeyConfig = {
      ...INITIAL_CHROMA_KEY,
      enabled: true,
      keyColor: '#00ff00',
      similarity: 44,
      smoothness: 14,
      spillSuppression: 65,
      edgeChoke: 1,
    };

    const modified = applyChromaKeyToRgbaBuffer(rgba, 6, 1, cfg);
    assert.ok(modified >= 3);

    // Green pixels should be keyed out
    assert.equal(rgba[3], 0, 'Pure green alpha should be 0');
    assert.equal(rgba[7], 0, 'Studio green alpha should be 0');
    assert.equal(rgba[11], 0, 'Shaded green alpha should be 0');

    // Gold, yellow, and purple gift pixels must stay 100% opaque and uncorrupted
    assert.equal(rgba[15], 255, 'Royal gold alpha must remain 255');
    assert.equal(rgba[12], 251, 'Royal gold R must remain intact');
    assert.equal(rgba[13], 191, 'Royal gold G must remain intact');
    assert.equal(rgba[19], 255, 'Bright yellow-gold alpha must remain 255');
    assert.equal(rgba[23], 255, 'Royal purple alpha must remain 255');
  });

  it('suppresses green spill on semi-transparent edge pixels', () => {
    // A pixel on the edge of a silver/white wing with green reflection: R=150, G=210, B=150
    const rgba = new Uint8ClampedArray([150, 210, 150, 255]);
    const cfg: ChromaKeyConfig = {
      ...INITIAL_CHROMA_KEY,
      enabled: true,
      keyColor: '#00ff00',
      similarity: 28,
      smoothness: 25,
      spillSuppression: 85,
      edgeChoke: 0,
    };

    applyChromaKeyToRgbaBuffer(rgba, 1, 1, cfg);
    // Green channel should be suppressed closer to R/B (below 175)
    assert.ok(rgba[1] < 175, `Expected suppressed G < 175, got ${rgba[1]}`);
  });

  it('auto-detects green screen color from frame border pixels', () => {
    const w = 4;
    const h = 4;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 10;
      rgba[i * 4 + 1] = 215;
      rgba[i * 4 + 2] = 35;
      rgba[i * 4 + 3] = 255;
    }
    const detected = autoDetectChromaKeyColor(rgba, w, h);
    assert.equal(detected, '#0ad723');
  });

  it('is a no-op when enabled is false', () => {
    const rgba = new Uint8ClampedArray([0, 255, 0, 255]);
    const count = applyChromaKeyToRgbaBuffer(rgba, 1, 1, {
      ...INITIAL_CHROMA_KEY,
      enabled: false,
    });
    assert.equal(count, 0);
    assert.equal(rgba[3], 255);
  });
});
