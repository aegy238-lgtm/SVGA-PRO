import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultWatermarkConfig,
  normalizeHexColor,
  estimateTextDimensions,
  computeSnapPosition,
  computeAffineMatrix2D,
  validateWatermarkImageKey,
} from './watermark';

test('createDefaultWatermarkConfig picks an available key and defaults', () => {
  const cfg1 = createDefaultWatermarkConfig(400, 400, {});
  assert.equal(cfg1.imageKey, 'watermark');
  assert.equal(cfg1.contentType, 'text');
  assert.equal(cfg1.text, 'Watermark');
  assert.equal(cfg1.x, 200);

  const cfg2 = createDefaultWatermarkConfig(400, 400, { watermark: 'data:image/png;base64,AAA' });
  assert.equal(cfg2.imageKey, 'watermark_1');
});

test('normalizeHexColor normalizes 3-digit and 6-digit hex strings', () => {
  assert.equal(normalizeHexColor('#FFF'), '#ffffff');
  assert.equal(normalizeHexColor('10B981'), '#10b981');
  assert.equal(normalizeHexColor('invalid', '#000000'), '#000000');
});

test('estimateTextDimensions returns positive width and height proportional to font size', () => {
  const d1 = estimateTextDimensions('Watermark', 32, 'Semibold');
  const d2 = estimateTextDimensions('Watermark', 64, 'Semibold');
  assert.ok(d1.width > 100);
  assert.ok(d1.height >= 32);
  assert.ok(d2.width > d1.width);
  assert.ok(d2.height > d1.height);
});

test('computeSnapPosition snaps accurately to 3x3 grid points', () => {
  const center = computeSnapPosition(1, 1, 400, 400, 100, 40, 100);
  assert.equal(center.x, 200);
  assert.equal(center.y, 200);

  const topLeft = computeSnapPosition(0, 0, 400, 400, 100, 40, 100);
  const bottomRight = computeSnapPosition(2, 2, 400, 400, 100, 40, 100);
  assert.ok(topLeft.x < center.x);
  assert.ok(topLeft.y < center.y);
  assert.ok(bottomRight.x > center.x);
  assert.ok(bottomRight.y > center.y);
});

test('computeAffineMatrix2D maps local center (w/2, h/2) to (centerX, centerY)', () => {
  const w = 180;
  const h = 40;
  const cx = 207;
  const cy = 354;
  const [a, b, c, d, tx, ty] = computeAffineMatrix2D(cx, cy, w, h, 69, -161);

  const mappedX = a * (w / 2) + c * (h / 2) + tx;
  const mappedY = b * (w / 2) + d * (h / 2) + ty;

  assert.ok(Math.abs(mappedX - cx) < 1e-6);
  assert.ok(Math.abs(mappedY - cy) < 1e-6);
});

test('validateWatermarkImageKey checks key availability and validity', () => {
  const assets = { existing_key: 'data:image/png;base64,AAA' };
  assert.deepEqual(validateWatermarkImageKey('watermark', assets), {
    valid: true,
    available: true,
    normalizedKey: 'watermark',
    status: 'available',
  });
  assert.deepEqual(validateWatermarkImageKey('existing_key', assets), {
    valid: true,
    available: false,
    normalizedKey: 'existing_key',
    status: 'exists',
  });
  assert.equal(validateWatermarkImageKey('   ', assets).status, 'empty');
  assert.equal(validateWatermarkImageKey('bad/key', assets).status, 'invalid');
});
