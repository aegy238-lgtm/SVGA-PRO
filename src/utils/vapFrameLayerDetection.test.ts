import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectVapEmbeddedFramesFromRgba,
  extractEmbeddedFrameRgbaCrop,
  applyEmbeddedFrameOverridesToRgba,
} from './vapFrameLayerDetection';
import { VapDynamicMaskSlot } from './vapYyevaDetection';

/**
 * Helper to paint a rectangle of RGBA pixels onto a canvas buffer (cw x ch)
 */
function paintRect(
  rgba: Uint8ClampedArray,
  cw: number,
  ch: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const xEnd = Math.min(cw, x0 + w);
  const yEnd = Math.min(ch, y0 + h);
  for (let y = Math.max(0, y0); y < yEnd; y++) {
    for (let x = Math.max(0, x0); x < xEnd; x++) {
      const i = (y * cw + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
}

test('detectVapEmbeddedFramesFromRgba detects Winged Avatar Frame, Name Banner Frame (even when touching at a pinch point), and Main Scene', () => {
  const cw = 300;
  const ch = 500;
  const rgba = new Uint8ClampedArray(cw * ch * 4);

  // 1. Winged Avatar Frame at top: [45, 25, 210, 110] (y = 25..134)
  paintRect(rgba, cw, ch, 45, 25, 210, 110, 140, 190, 255, 255);

  // 2. Thin touching neck / crown between Avatar Frame and Name Banner Frame: [135, 135, 30, 8] (y = 135..142)
  paintRect(rgba, cw, ch, 135, 135, 30, 8, 255, 220, 110, 220);

  // 3. Name Banner Frame ("manager"): [50, 143, 200, 48] (y = 143..190)
  paintRect(rgba, cw, ch, 50, 143, 200, 48, 190, 130, 255, 255);

  // 4. Full-bleed Main Video Scene: [0, 195, 300, 305] (y = 195..499)
  paintRect(rgba, cw, ch, 0, 195, 300, 305, 255, 200, 150, 255);

  const slots: VapDynamicMaskSlot[] = [
    {
      srcId: '1',
      srcTag: 'avatar1',
      srcType: 'img',
      isTextSlot: false,
      w: 80,
      h: 80,
      fitType: 'fitXY',
      z: 0,
      mt: 0,
      defaultFrame: [110, 45, 80, 80],
      defaultMFrame: [320, 260, 80, 80],
      assetKey: 'mask_avatar1_1',
      labelAr: 'قناع الصورة (avatar1)',
      labelEn: 'Image Mask (avatar1)',
    },
    {
      srcId: '2',
      srcTag: 'textName1',
      srcType: 'txt',
      isTextSlot: true,
      w: 150,
      h: 30,
      fitType: 'fitXY',
      z: 1,
      mt: 0,
      defaultFrame: [75, 152, 150, 30],
      defaultMFrame: [320, 350, 150, 30],
      assetKey: 'mask_textName1_2',
      labelAr: 'قناع الاسم (textName1)',
      labelEn: 'Name Mask (textName1)',
    },
  ];

  const detected = detectVapEmbeddedFramesFromRgba(rgba, cw, ch, slots);

  assert.equal(detected.length, 3, 'Should detect 3 distinct visual regions: avatar_frame, banner_frame, main_scene');

  const avatarFrame = detected.find((d) => d.kind === 'avatar_frame');
  const bannerFrame = detected.find((d) => d.kind === 'banner_frame');
  const mainScene = detected.find((d) => d.kind === 'main_scene');

  assert.ok(avatarFrame, 'Should detect avatar_frame');
  assert.ok(bannerFrame, 'Should detect banner_frame');
  assert.ok(mainScene, 'Should detect main_scene');

  assert.equal(avatarFrame!.isIsolatedFrame, true);
  assert.equal(avatarFrame!.linkedSlotId, '1');
  assert.equal(avatarFrame!.frame[0], 45);
  assert.equal(avatarFrame!.frame[1], 25);
  assert.equal(avatarFrame!.frame[2], 210);

  assert.equal(bannerFrame!.isIsolatedFrame, true);
  assert.equal(bannerFrame!.linkedSlotId, '2');
  assert.equal(bannerFrame!.frame[0], 50);
  assert.equal(bannerFrame!.frame[2], 200);

  assert.equal(mainScene!.isIsolatedFrame, false);
  assert.equal(mainScene!.frame[1], 195);
  assert.equal(mainScene!.frame[2], 300);
});

test('extractEmbeddedFrameRgbaCrop extracts accurate transparent sub-crop', () => {
  const cw = 100;
  const ch = 100;
  const rgba = new Uint8ClampedArray(cw * ch * 4);
  paintRect(rgba, cw, ch, 20, 30, 40, 25, 12, 34, 56, 200);

  const crop = extractEmbeddedFrameRgbaCrop(rgba, cw, ch, [20, 30, 40, 25]);
  assert.equal(crop.width, 40);
  assert.equal(crop.height, 25);
  assert.equal(crop.rgba[0], 12);
  assert.equal(crop.rgba[1], 34);
  assert.equal(crop.rgba[2], 56);
  assert.equal(crop.rgba[3], 200);
});

test('applyEmbeddedFrameOverridesToRgba supports hiding and moving detected frames', () => {
  const cw = 120;
  const ch = 120;
  const rgba = new Uint8ClampedArray(cw * ch * 4);
  paintRect(rgba, cw, ch, 10, 10, 30, 30, 255, 50, 80, 255);
  paintRect(rgba, cw, ch, 10, 60, 40, 20, 50, 200, 120, 255);

  const frames = [
    {
      id: 'vap_frame_avatar_1',
      kind: 'avatar_frame' as const,
      labelAr: 'إطار الصورة في الفيديو',
      labelEn: 'Video Avatar Frame',
      frame: [10, 10, 30, 30] as [number, number, number, number],
      coverageRatio: 1,
      aspectRatio: 1,
      isIsolatedFrame: true,
      assetKey: 'vap_frame_avatar_1',
    },
    {
      id: 'vap_frame_banner_1',
      kind: 'banner_frame' as const,
      labelAr: 'إطار الاسم / الشريط في الفيديو',
      labelEn: 'Video Name Banner Frame',
      frame: [10, 60, 40, 20] as [number, number, number, number],
      coverageRatio: 1,
      aspectRatio: 2,
      isIsolatedFrame: true,
      assetKey: 'vap_frame_banner_1',
    },
  ];

  // Hide avatar frame, move banner frame +20px X, +10px Y
  applyEmbeddedFrameOverridesToRgba(rgba, cw, ch, frames, {
    vap_frame_avatar_1: { id: 'vap_frame_avatar_1', hidden: true },
    vap_frame_banner_1: { id: 'vap_frame_banner_1', offsetX: 20, offsetY: 10 },
  });

  // Avatar frame region (15, 15) should now be cleared (alpha = 0)
  const avatarCheckIdx = (15 * cw + 15) * 4;
  assert.equal(rgba[avatarCheckIdx + 3], 0);

  // Original banner top-left (15, 65) should be cleared (alpha = 0)
  const oldBannerIdx = (65 * cw + 15) * 4;
  assert.equal(rgba[oldBannerIdx + 3], 0);

  // Moved banner pixel at (35, 75) should have green=200, alpha=255
  const newBannerIdx = (75 * cw + 35) * 4;
  assert.equal(rgba[newBannerIdx + 1], 200);
  assert.equal(rgba[newBannerIdx + 3], 255);
});
