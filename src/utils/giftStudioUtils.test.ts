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
  GIFT_STUDIO_EXPORT_MODES,
  getExportModeMeta,
  isSvgaGiftItem,
  isVapOrYyevaGiftItem,
  classifyExtractedGiftFolder,
  buildExtractedGiftAndImagePaths,
  resolveItemsForExportMode,
  buildUniqueExtractedFileNames,
  computeSideBySideVideoLayout,
  computeTightAlphaBounds,
  computeAutoCropDrawRect,
  resolveEffectiveGiftDuration,
  computeCustomPlaybackRate,
  mapExportFrameToNativeTime,
  classifyZipContainer,
  filterExtractableArchiveEntries,
  deriveCleanGiftNameFromArchivePath,
  unwrapLockedGiftPayload,
  type GiftStudioExportItemLike,
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

test('GIFT_STUDIO_EXPORT_MODES defines all 5 coordinated export modes with unified extract option', () => {
  assert.equal(GIFT_STUDIO_EXPORT_MODES.length, 5);
  const modes = GIFT_STUDIO_EXPORT_MODES.map((m) => m.value);
  assert.deepEqual(modes, ['gi', 'pack', 'sep', 'one', 'extract']);

  assert.equal(getExportModeMeta('one').requiresVideoEncoder, true);
  assert.equal(getExportModeMeta('extract').requiresVideoEncoder, false);
  assert.equal(getExportModeMeta('extract').usesResolutionSelect, true);
});

test('classifyExtractedGiftFolder and resolveItemsForExportMode sort SVGA and VAP+YYEVA into separate folders', () => {
  const sampleItems: GiftStudioExportItemLike[] = [
    { id: 1, name: 'crown.svga', fmt: 'svga', kind: 'SVGA', sel: false },
    { id: 2, name: 'dragon.svga', fmt: 'svga', kind: 'SVGA', sel: false },
    { id: 3, name: 'car_vap.mp4', fmt: 'mp4', kind: 'VAP', vapi: {}, alpha: 'V', sel: false },
    { id: 4, name: 'castle_yyeva.mp4', fmt: 'mp4', kind: 'YYEVA', yy: true, alpha: 'L', sel: false },
    { id: 5, name: 'plain.lottie.json', fmt: 'lottie', kind: 'Lottie', sel: true },
  ];

  assert.equal(isSvgaGiftItem(sampleItems[0]), true);
  assert.equal(isSvgaGiftItem(sampleItems[2]), false);
  assert.equal(classifyExtractedGiftFolder(sampleItems[0]), 'SVGA_Files');
  assert.equal(classifyExtractedGiftFolder(sampleItems[2]), 'VAP_YYEVA_Files');
  assert.equal(classifyExtractedGiftFolder(sampleItems[3]), 'VAP_YYEVA_Files');

  assert.equal(isVapOrYyevaGiftItem(sampleItems[2]), true);
  assert.equal(isVapOrYyevaGiftItem(sampleItems[3]), true);
  assert.equal(isVapOrYyevaGiftItem(sampleItems[0]), false);

  // Single combined video ('one') merges all displayed valid items when <= 1 item is checked
  const oneVideoList = resolveItemsForExportMode(sampleItems, 'one');
  assert.equal(oneVideoList.length, 5);

  // Extract mode returns selected items if any, otherwise all valid items
  const extractSelected = resolveItemsForExportMode(sampleItems, 'extract');
  assert.equal(extractSelected.length, 1);
  sampleItems[4].sel = false;
  const extractAll = resolveItemsForExportMode(sampleItems, 'extract');
  assert.equal(extractAll.length, 5);

  // Verify each gift file and its PNG image are placed together in the same folder
  const paths = buildExtractedGiftAndImagePaths(sampleItems);
  assert.deepEqual(paths[0], {
    folder: 'SVGA_Files',
    filePath: 'SVGA_Files/crown.svga',
    imagePath: 'SVGA_Files/crown.png',
  });
  assert.deepEqual(paths[2], {
    folder: 'VAP_YYEVA_Files',
    filePath: 'VAP_YYEVA_Files/car_vap.mp4',
    imagePath: 'VAP_YYEVA_Files/car_vap.png',
  });
});

test('buildUniqueExtractedFileNames deduplicates colliding names and enforces extensions', () => {
  const svgaNames = buildUniqueExtractedFileNames(['lion.svga', 'lion.svga', 'tiger'], '.svga');
  assert.deepEqual(svgaNames, ['lion.svga', 'lion_2.svga', 'tiger.svga']);

  const vapYyNames = buildUniqueExtractedFileNames(['effect.mp4', 'effect.mp4', 'magic.yyeva'], '.mp4');
  assert.deepEqual(vapYyNames, ['effect.mp4', 'effect_2.mp4', 'magic.yyeva']);
});

test('computeSideBySideVideoLayout arranges multiple gifts side-by-side in one video frame', () => {
  const twoLayout = computeSideBySideVideoLayout(2, 720);
  assert.equal(twoLayout.cols, 2);
  assert.equal(twoLayout.rows, 1);
  assert.equal(twoLayout.cells.length, 2);
  assert.equal(twoLayout.canvasWidth % 2, 0);
  assert.equal(twoLayout.canvasHeight % 2, 0);
  assert.equal(twoLayout.cells[0].y, twoLayout.cells[1].y);
  assert.ok(twoLayout.cells[1].x >= twoLayout.cells[0].x + twoLayout.cells[0].width);

  const threeLayout = computeSideBySideVideoLayout(3, 720);
  assert.equal(threeLayout.cols, 3);
  assert.equal(threeLayout.rows, 1);
  assert.equal(threeLayout.cells.length, 3);

  const sixLayout = computeSideBySideVideoLayout(6, 720);
  assert.equal(sixLayout.cells.length, 6);
  assert.ok(sixLayout.cols >= 3);
  assert.ok(sixLayout.rows >= 2);
});

test('computeTightAlphaBounds and computeAutoCropDrawRect tightly frame gift graphics for high-clarity snapshots', () => {
  // 10x10 RGBA buffer with a 4x4 bright opaque gift centered at (3..6, 3..6)
  const w = 10;
  const h = 10;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 3; y <= 6; y++) {
    for (let x = 3; x <= 6; x++) {
      const idx = (y * w + x) * 4;
      rgba[idx] = 255;
      rgba[idx + 1] = 200;
      rgba[idx + 2] = 100;
      rgba[idx + 3] = 255;
    }
  }

  const bounds = computeTightAlphaBounds(rgba, w, h, 16);
  assert.ok(bounds);
  assert.equal(bounds.minX, 3);
  assert.equal(bounds.minY, 3);
  assert.equal(bounds.maxX, 6);
  assert.equal(bounds.maxY, 6);
  assert.equal(bounds.width, 4);
  assert.equal(bounds.height, 4);
  assert.equal(bounds.visiblePixels, 16);
  assert.ok(bounds.clarityScore > 10);

  const rect = computeAutoCropDrawRect(bounds, 720, 720, 0.03);
  assert.equal(rect.sx, 3);
  assert.equal(rect.sy, 3);
  assert.equal(rect.sw, 4);
  assert.equal(rect.sh, 4);
  // Gift should be scaled up to fill ~94% of the 720x720 output canvas
  assert.ok(rect.dw >= 660 && rect.dw <= 720);
  assert.equal(rect.dw, rect.dh);
  assert.equal(rect.dx, Math.round((720 - rect.dw) / 2));
});

test('custom video duration mode preserves original duration when OFF and overrides & maps timeline when ON across all gift formats', () => {
  // 1. Toggle OFF: returns original native duration (e.g. 2.1s SVGA or 11.1s VAP)
  assert.equal(resolveEffectiveGiftDuration(2.1, { enabled: false, seconds: 8 }, 3), 2.1);
  assert.equal(resolveEffectiveGiftDuration(11.1, { enabled: false, seconds: 5 }, 3), 11.1);
  assert.equal(resolveEffectiveGiftDuration(0, { enabled: false, seconds: 5 }, 3), 3);
  assert.equal(computeCustomPlaybackRate(2.1, { enabled: false, seconds: 8 }), 1);

  // 2. Toggle ON: returns chosen custom duration for ANY gift format
  assert.equal(resolveEffectiveGiftDuration(2.1, { enabled: true, seconds: 6 }, 3), 6);
  assert.equal(resolveEffectiveGiftDuration(11.1, { enabled: true, seconds: 4 }, 3), 4);

  // 3. Live preview playback rate scales proportionally so the gift effect displays over the chosen duration
  // 2.1s gift stretched over 4.2s plays at 0.5x speed
  assert.equal(computeCustomPlaybackRate(2.1, { enabled: true, seconds: 4.2 }), 0.5);
  // 10s gift compressed into 5s plays at 2.0x speed
  assert.equal(computeCustomPlaybackRate(10, { enabled: true, seconds: 5 }), 2);

  // 4. Export frame-to-native time mapping stretches/compresses the full gift effect across the custom duration
  // Suppose a 2.1s SVGA gift is exported over 6.0s at 30fps (180 frames total)
  const tStart = mapExportFrameToNativeTime(0, 30, 6.0, 2.1, false, true);
  const tMid = mapExportFrameToNativeTime(90, 30, 6.0, 2.1, false, true);
  const tEnd = mapExportFrameToNativeTime(179, 30, 6.0, 2.1, false, true);
  assert.equal(tStart, 0);
  assert.ok(Math.abs(tMid - 1.05) < 0.02);
  assert.ok(tEnd > 2.05 && tEnd < 2.1);

  // When custom duration is OFF, frame time maps 1:1 with native time
  const tNativeMid = mapExportFrameToNativeTime(30, 30, 2.1, 2.1, false, false);
  assert.ok(Math.abs(tNativeMid - 1.0) < 0.001);
});

test('classifyZipContainer and filterExtractableArchiveEntries extract internal gifts from closed project archives', () => {
  // 1. SVGA 1.0 ZIP container (has movie.binary at root) is classified as 'svga1'
  assert.equal(classifyZipContainer(['movie.binary', 'image_0.png'], 'lion.svga'), 'svga1');
  assert.equal(classifyZipContainer(['movie.spec', 'img.png'], 'effect.svga'), 'svga1');

  // 2. Closed project archive (e.g. Gifts_Folders_And_Images.zip) is classified as 'archive'
  const archiveEntries = [
    'SVGA_Files/',
    'SVGA_Files/top_settle.svga',
    'SVGA_Files/top_settle.png',
    'VAP_YYEVA_Files/',
    'VAP_YYEVA_Files/dragon_effect.mp4',
    'VAP_YYEVA_Files/dragon_effect.png',
    'VAP_YYEVA_Files/magic_castle.vap',
    'nested_pack.zip',
    '__MACOSX/._top_settle.svga',
    '.DS_Store',
  ];
  assert.equal(classifyZipContainer(archiveEntries, 'Gifts_Folders_And_Images.zip'), 'archive');

  // 3. Filter extracts all inner gifts, nested ZIPs, and separates candidate images from junk
  const filtered = filterExtractableArchiveEntries(archiveEntries);
  assert.deepEqual(filtered.giftPaths, [
    'SVGA_Files/top_settle.svga',
    'VAP_YYEVA_Files/dragon_effect.mp4',
    'VAP_YYEVA_Files/magic_castle.vap',
  ]);
  assert.deepEqual(filtered.nestedZipPaths, ['nested_pack.zip']);
  assert.deepEqual(filtered.candidateImagePaths, [
    'SVGA_Files/top_settle.png',
    'VAP_YYEVA_Files/dragon_effect.png',
  ]);
  assert.equal(deriveCleanGiftNameFromArchivePath('SVGA_Files/top_settle.svga'), 'top_settle.svga');
});

test('unwrapLockedGiftPayload detects and extracts embedded gift bytes from header-wrapped files', () => {
  // 12-byte custom lock prefix followed by zlib SVGA 2.0 header (0x78 0x9c)
  const lockedSvga = new Uint8Array([
    0x4c, 0x4f, 0x43, 0x4b, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x78, 0x9c, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60,
  ]);
  const res = unwrapLockedGiftPayload(lockedSvga);
  assert.equal(res.unwrapped, true);
  assert.equal(res.detectedSignature, 'svga_zlib');
  assert.equal(res.bytes[0], 0x78);
  assert.equal(res.bytes[1], 0x9c);
});

