import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compute1DFeatherProfile,
  applyFeatherToRgbaPixels,
  type EdgeFeatherConfig,
} from './edgeFeather';

test('compute1DFeatherProfile feathers top/start margin while keeping center opaque', () => {
  const prof = compute1DFeatherProfile(100, 20, 0, 100, false);
  assert.equal(prof.length, 100);
  // Start edge should be 0 (transparent)
  assert.equal(prof[0], 0);
  // Center and end edge should be 1 (opaque)
  assert.equal(prof[60], 1);
  assert.equal(prof[99], 1);
});

test('compute1DFeatherProfile applies symmetric edge feather when all margins are 0 and radius > 0', () => {
  const prof = compute1DFeatherProfile(100, 0, 0, 60, true);
  assert.equal(prof[0], 0);
  assert.ok(prof[50] > 0.99);
  assert.equal(prof[99], 0);
});

test('applyFeatherToRgbaPixels bakes bottom/top margin transparency directly into image layer pixels', () => {
  // Mock a 10x10 image placed on a 100x100 canvas at y=0
  const imgW = 10;
  const imgH = 10;
  const canvasW = 100;
  const canvasH = 100;
  const rgba = new Uint8ClampedArray(imgW * imgH * 4);
  rgba.fill(255); // completely opaque white

  const cfg: EdgeFeatherConfig = {
    enabled: true,
    topMargin: 0,
    bottomMargin: 50, // 50% bottom margin like user's settings
    leftMargin: 0,
    rightMargin: 0,
    featherRadius: 20,
  };

  // Case 1: Image is placed at bottom of canvas (y: 60..100)
  // Scale 10x10 up to 40x40 at position (10, 60)
  const transform: [number, number, number, number, number, number] = [4, 0, 0, 4, 10, 60];
  const modified = applyFeatherToRgbaPixels(
    rgba,
    imgW,
    imgH,
    canvasW,
    canvasH,
    transform,
    { x: 0, y: 0, w: 40, h: 40 },
    cfg
  );

  assert.equal(modified, true);
  // Since the image is located in the bottom 50% of the canvas (y >= 60), its lower pixels must be faded
  const lastPixelAlpha = rgba[(imgH - 1) * imgW * 4 + 3];
  assert.equal(lastPixelAlpha, 0); // Completely transparent at bottom
});
