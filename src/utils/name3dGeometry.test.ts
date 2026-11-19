import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NAME3D_CONFIG,
  NAME3D_ANIMATION_PRESETS,
  NAME3D_FONT_OPTIONS,
  NAME3D_MATERIAL_PRESETS,
  NAME3D_SHAPE_STYLES,
  computePolygonSignedArea,
  detectTextIsRtl,
  evaluateName3DAnimation,
  evaluatePiece3DTransform,
  extractContoursFromMask,
  pointInPolygon,
  sanitizeHexColor,
} from './name3dGeometry';

describe('3D Name Designer — Pure Geometry, Presets & Animation Kinematics Suite', () => {
  it('provides all 12 requested 3D animation presets plus static showcase', () => {
    assert.ok(NAME3D_ANIMATION_PRESETS.length >= 13);
    const ids = new Set(NAME3D_ANIMATION_PRESETS.map((a) => a.id));
    for (const required of [
      'spin3d',
      'slowOrbit',
      'fadeReveal',
      'frontBackZoom',
      'goldShimmer',
      'lightReflection',
      'haloGlow',
      'proShake',
      'flyAssemble',
      'individualSpin',
      'pulseGlow',
      'metallicReflections',
    ] as const) {
      assert.ok(ids.has(required), `Missing required 3D animation preset: ${required}`);
    }
  });

  it('includes luxury gold, silver, platinum, copper, chrome presets and 3D shape styles', () => {
    const matIds = new Set(NAME3D_MATERIAL_PRESETS.map((m) => m.id));
    for (const id of [
      'gold-shiny',
      'gold-metallic',
      'gold-dark',
      'silver-mirror',
      'platinum',
      'copper-bronze',
      'chrome-liquid',
    ]) {
      assert.ok(matIds.has(id), `Missing material preset: ${id}`);
    }
    assert.ok(NAME3D_SHAPE_STYLES.length >= 6);
    assert.ok(NAME3D_FONT_OPTIONS.length >= 8);
  });

  it('extracts closed outer contour and inner hole from a hollow glyph mask (like O / و / م)', () => {
    // 20x20 grid with a 14x14 solid square [3..16] and a 6x6 hollow hole [7..12]
    const w = 20;
    const h = 20;
    const mask = new Uint8Array(w * h);
    for (let y = 3; y <= 16; y++) {
      for (let x = 3; x <= 16; x++) {
        const inHole = x >= 7 && x <= 12 && y >= 7 && y <= 12;
        mask[y * w + x] = inHole ? 0 : 1;
      }
    }

    const contours = extractContoursFromMask(mask, w, h, {
      smoothPasses: 1,
      simplifyEpsilon: 0.35,
      minArea: 4,
    });

    assert.equal(contours.length, 1, 'Hollow glyph must yield 1 outer contour');
    assert.equal(contours[0].holes.length, 1, 'Hollow glyph must contain 1 inner hole');
    assert.ok(contours[0].outer.length >= 4);
    assert.ok(contours[0].holes[0].length >= 4);
    assert.ok(computePolygonSignedArea(contours[0].outer) > 0);
    assert.ok(pointInPolygon({ x: 10, y: 10 }, contours[0].outer));
  });

  it('extracts multiple disconnected pieces separately for piece-level 3D animations', () => {
    const w = 40;
    const h = 20;
    const mask = new Uint8Array(w * h);
    // Piece 1: x in [2..10], y in [4..15]
    for (let y = 4; y <= 15; y++) {
      for (let x = 2; x <= 10; x++) mask[y * w + x] = 1;
    }
    // Piece 2: x in [24..34], y in [4..15]
    for (let y = 4; y <= 15; y++) {
      for (let x = 24; x <= 34; x++) mask[y * w + x] = 1;
    }

    const contours = extractContoursFromMask(mask, w, h);
    assert.equal(contours.length, 2, 'Two separated glyphs must produce 2 independent 3D pieces');
    assert.ok(contours[0].centerX < contours[1].centerX, 'Pieces should be ordered left-to-right');
  });

  it('evaluates deterministic 3D master and per-piece animation kinematics cleanly', () => {
    const base = { x: 0, y: 0, z: 0 };

    const spinHalf = evaluateName3DAnimation('spin3d', 0.5, 'normal', base);
    assert.ok(Math.abs(spinHalf.rotY - Math.PI) < 0.01);

    const revSpin = evaluateName3DAnimation('spin3d', 0.25, 'reverse', base);
    assert.ok(Math.abs(revSpin.rotY - Math.PI * 1.5) < 0.01);

    // Fly assemble starts scattered at phase 0 and snaps to exact zero offset at phase 0.65
    const flyStart = evaluatePiece3DTransform('flyAssemble', 0.0, 'normal', 1, 5);
    const flyHold = evaluatePiece3DTransform('flyAssemble', 0.65, 'normal', 1, 5);
    assert.ok(Math.hypot(flyStart.offsetX, flyStart.offsetY, flyStart.offsetZ) > 1.0);
    assert.equal(flyHold.offsetX, 0);
    assert.equal(flyHold.offsetY, 0);
    assert.equal(flyHold.offsetZ, 0);

    // Individual spin rotates piece smoothly
    const indMid = evaluatePiece3DTransform('individualSpin', 0.35, 'normal', 0, 4);
    assert.ok(indMid.rotY > 0.2);
  });

  it('detects Arabic RTL text and sanitizes manual HEX inputs safely', () => {
    assert.equal(detectTextIsRtl(DEFAULT_NAME3D_CONFIG.text), true);
    assert.equal(detectTextIsRtl('ROYAL KING'), false);
    assert.equal(sanitizeHexColor('FFD700'), '#ffd700');
    assert.equal(sanitizeHexColor('#abc'), '#aabbcc');
    assert.equal(sanitizeHexColor('invalid', '#123456'), '#123456');
  });
});
