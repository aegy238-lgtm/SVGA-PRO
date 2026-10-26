import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTiledWatermarkGrid,
  computeExportFramePlan,
  computeOptimalVideoBitrate,
  isScreenCaptureShortcut,
  selectOptimalH264CodecCandidates,
  computeEffectiveExportFps,
  computeFrameSeekTime,
  buildAudioEncoderCandidates,
  resampleChannelFloat32,
} from './giftStudioUtils.ts';

test('computeTiledWatermarkGrid generates full-coverage cells across entire gift dimensions', () => {
  const cells = computeTiledWatermarkGrid(720, 720, {
    enabled: true,
    text: 'SVGA PRO Ahmed',
    columns: 3,
  });

  // 3x3 grid for square 720x720 gift
  assert.equal(cells.length, 9);
  assert.equal(cells[0].x, 0);
  assert.equal(cells[0].y, 0);
  assert.equal(cells[0].width, 240);
  assert.equal(cells[0].height, 240);

  const last = cells[cells.length - 1];
  assert.equal(Math.round(last.x + last.width), 720);
  assert.equal(Math.round(last.y + last.height), 720);
  assert.ok(last.fontSize >= 10 && last.fontSize <= 64);
});

test('computeExportFramePlan produces even dimensions and exact frame counts for high-quality batch export', () => {
  const plan = computeExportFramePlan(1081, 1919, 30, 4.5);
  assert.equal(plan.width % 2, 0);
  assert.equal(plan.height % 2, 0);
  assert.equal(plan.fps, 30);
  assert.equal(plan.totalFrames, 135);
  assert.equal(plan.frameDurationMicros, 33333);
  assert.ok(plan.targetBitrate >= 2_500_000 && plan.targetBitrate <= 32_000_000);
});

test('computeOptimalVideoBitrate scales cleanly from 480p to 4K without overflowing', () => {
  const b480 = computeOptimalVideoBitrate(480, 480, 30);
  const b1080 = computeOptimalVideoBitrate(1080, 1080, 30);
  const b4k = computeOptimalVideoBitrate(3840, 2160, 60);

  assert.ok(b1080 > b480);
  assert.ok(b4k <= 32_000_000);
  assert.ok(b480 >= 2_500_000);
});

test('isScreenCaptureShortcut detects PrintScreen, Win+Shift+S, Cmd+Shift+4, and ignores normal typing', () => {
  assert.equal(isScreenCaptureShortcut({ key: 'PrintScreen', code: 'PrintScreen' }), true);
  assert.equal(isScreenCaptureShortcut({ key: 's', metaKey: true, shiftKey: true }), true);
  assert.equal(isScreenCaptureShortcut({ key: '4', metaKey: true, shiftKey: true }), true);
  assert.equal(isScreenCaptureShortcut({ key: 'r', metaKey: true, altKey: true }), true);
  assert.equal(isScreenCaptureShortcut({ key: 's', ctrlKey: true, shiftKey: false }), false);
  assert.equal(isScreenCaptureShortcut({ key: 'a' }), false);
});

test('selectOptimalH264CodecCandidates selects Level 4.0 for 720p and Level 5.1+ for 4K', () => {
  const c720 = selectOptimalH264CodecCandidates(720, 720);
  const c1080 = selectOptimalH264CodecCandidates(1080, 1920);
  const c4k = selectOptimalH264CodecCandidates(3840, 2160);

  assert.equal(c720[0], 'avc1.640028');
  assert.equal(c1080[0], 'avc1.64002A');
  assert.equal(c4k[0], 'avc1.640033');
});

test('computeEffectiveExportFps avoids 20fps-in-30fps pulldown judder for discrete SVGA animations', () => {
  assert.equal(computeEffectiveExportFps(30, 20, true), 20);
  assert.equal(computeEffectiveExportFps(60, 20, true), 60);
  assert.equal(computeEffectiveExportFps(0, 25, true), 25);
  assert.equal(computeEffectiveExportFps(30, 30, false), 30);
});

test('computeFrameSeekTime lands strictly inside each frame interval without exceeding duration', () => {
  const t0 = computeFrameSeekTime(0, 30, 3.0);
  const t1 = computeFrameSeekTime(1, 30, 3.0);
  const tLast = computeFrameSeekTime(89, 30, 3.0);

  assert.ok(t0 > 0 && t0 < 1 / 30);
  assert.ok(t1 > 1 / 30 && t1 < 2 / 30);
  assert.ok(tLast < 3.0);
});

test('buildAudioEncoderCandidates includes AAC and Opus @ 48kHz fallback for Mp4Muxer', () => {
  const cands = buildAudioEncoderCandidates(44100, 2);
  assert.equal(cands[0].codec, 'mp4a.40.2');
  assert.equal(cands[0].muxCodec, 'aac');
  const opus = cands.find((c) => c.codec === 'opus');
  assert.ok(opus);
  assert.equal(opus.muxCodec, 'opus');
  assert.equal(opus.sampleRate, 48000);
});

test('resampleChannelFloat32 resamples between sample rates and applies gain accurately', () => {
  const src = new Float32Array([0, 0.5, 1.0, 0.5, 0]);
  const same = resampleChannelFloat32(src, 48000, 48000, 5, 0.5, 0);
  assert.equal(same.length, 5);
  assert.ok(Math.abs(same[2] - 0.5) < 1e-5);

  const upsampled = resampleChannelFloat32(src, 24000, 48000, 9, 1.0, 0);
  assert.equal(upsampled.length, 9);
  assert.ok(Math.abs(upsampled[4] - 1.0) < 1e-5);
});


