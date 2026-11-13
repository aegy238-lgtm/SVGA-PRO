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
  isPagGiftItem,
  isVapOrYyevaGiftItem,
  classifyExtractedGiftFolder,
  buildExtractedGiftAndImagePaths,
  resolveItemsForExportMode,
  buildUniqueExtractedFileNames,
  computeSideBySideVideoLayout,
  computeSideBySideSlotRenderPlan,
  computeTightAlphaBounds,
  computeAutoCropDrawRect,
  resolveEffectiveGiftDuration,
  computeCustomPlaybackRate,
  mapExportFrameToNativeTime,
  classifyZipContainer,
  filterExtractableArchiveEntries,
  deriveCleanGiftNameFromArchivePath,
  unwrapLockedGiftPayload,
  getGiftStudioTranslations,
  resolveGiftFormatLabel,
  sanitizeCustomGiftName,
  buildFormatRenamedFileName,
  buildFormatRenamedBatch,
  computeMobilePreviewDimensions,
  stepMobilePreviewItemIndex,
  getOptimalAudioFrameSize,
  computeAudioChunkSampleOffset,
  interleaveTimestampedMediaChunks,
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

test('classifyExtractedGiftFolder and resolveItemsForExportMode sort PAG, SVGA, and VAP+YYEVA into separate folders', () => {
  const sampleItems: GiftStudioExportItemLike[] = [
    { id: 1, name: 'crown.svga', fmt: 'svga', kind: 'SVGA', sel: false },
    { id: 2, name: 'dragon.svga', fmt: 'svga', kind: 'SVGA', sel: false },
    { id: 3, name: 'car_vap.mp4', fmt: 'mp4', kind: 'VAP', vapi: {}, alpha: 'V', sel: false },
    { id: 4, name: 'castle_yyeva.mp4', fmt: 'mp4', kind: 'YYEVA', yy: true, alpha: 'L', sel: false },
    { id: 5, name: 'phoenix.pag', fmt: 'pag', kind: 'PAG', sel: false },
    { id: 6, name: 'plain.lottie.json', fmt: 'lottie', kind: 'Lottie', sel: true },
  ];

  assert.equal(isSvgaGiftItem(sampleItems[0]), true);
  assert.equal(isSvgaGiftItem(sampleItems[2]), false);
  assert.equal(isPagGiftItem(sampleItems[4]), true);
  assert.equal(isPagGiftItem(sampleItems[0]), false);

  assert.equal(classifyExtractedGiftFolder(sampleItems[0]), 'SVGA_Files');
  assert.equal(classifyExtractedGiftFolder(sampleItems[2]), 'VAP_YYEVA_Files');
  assert.equal(classifyExtractedGiftFolder(sampleItems[3]), 'VAP_YYEVA_Files');
  assert.equal(classifyExtractedGiftFolder(sampleItems[4]), 'PAG_Files');

  assert.equal(isVapOrYyevaGiftItem(sampleItems[2]), true);
  assert.equal(isVapOrYyevaGiftItem(sampleItems[3]), true);
  assert.equal(isVapOrYyevaGiftItem(sampleItems[0]), false);
  assert.equal(isVapOrYyevaGiftItem(sampleItems[4]), false);

  // Single combined video ('one') merges all displayed valid items when <= 1 item is checked
  const oneVideoList = resolveItemsForExportMode(sampleItems, 'one');
  assert.equal(oneVideoList.length, 6);

  // Extract mode returns selected items if any, otherwise all valid items
  const extractSelected = resolveItemsForExportMode(sampleItems, 'extract');
  assert.equal(extractSelected.length, 1);
  sampleItems[5].sel = false;
  const extractAll = resolveItemsForExportMode(sampleItems, 'extract');
  assert.equal(extractAll.length, 6);

  // Verify each gift file and its PNG image are placed together in the respective folder
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
  assert.deepEqual(paths[4], {
    folder: 'PAG_Files',
    filePath: 'PAG_Files/phoenix.pag',
    imagePath: 'PAG_Files/phoenix.png',
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

  // 46 gifts side-by-side produces a balanced multi-column grid with near-square cells
  const fortySixLayout = computeSideBySideVideoLayout(46, 720);
  assert.equal(fortySixLayout.cells.length, 46);
  assert.ok(fortySixLayout.cols >= 8 && fortySixLayout.cols <= 10);
  assert.ok(fortySixLayout.rows >= 5 && fortySixLayout.rows <= 6);
  assert.ok(fortySixLayout.cells[0].height >= 160);
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

  // 3. Live preview playback rate stays at 1.0x native fluid rate for short looping gifts, and scales down/up when fitting long gifts
  assert.equal(computeCustomPlaybackRate(2.1, { enabled: true, seconds: 4.2, mode: 'loop' }), 1);
  assert.equal(computeCustomPlaybackRate(10, { enabled: true, seconds: 5, mode: 'loop' }), 2);
  assert.equal(computeCustomPlaybackRate(4.0, { enabled: true, seconds: 10, mode: 'fit' }), 1.2);

  // 4. Export frame-to-native time mapping loops short gifts fluidly at 30fps without slowdown or stuttering
  // Suppose a 2.1s SVGA gift is exported over 6.0s at 30fps (180 frames total)
  const tStart = mapExportFrameToNativeTime(0, 30, 6.0, 2.1, false, true, 'loop');
  const tFrame30 = mapExportFrameToNativeTime(30, 30, 6.0, 2.1, false, true, 'loop'); // 1.0s into export
  const tLoopStart = mapExportFrameToNativeTime(63, 30, 6.0, 2.1, false, true, 'loop'); // 2.1s -> 0.0s loop
  assert.equal(tStart, 0);
  assert.ok(Math.abs(tFrame30 - 1.0) < 0.01);
  assert.ok(Math.abs(tLoopStart - 0.0) < 0.01);

  // Long gift (12s native) exported into a 6s custom duration fits full 12s animation into 6s instead of cutting off at 50%
  const tLongMid = mapExportFrameToNativeTime(90, 30, 6.0, 12.0, false, true, 'loop');
  assert.ok(Math.abs(tLongMid - 6.0) < 0.05);
  const tLongEnd = mapExportFrameToNativeTime(179, 30, 6.0, 12.0, false, true, 'loop');
  assert.ok(tLongEnd > 11.8);

  // Fit mode completes exact integer cycles (e.g. 4.0s gift in 10.0s -> 3 complete cycles)
  const tFitEnd = mapExportFrameToNativeTime(299, 30, 10.0, 4.0, false, true, 'fit');
  assert.ok(tFitEnd > 3.9);

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

test('getGiftStudioTranslations provides complete coordinated Arabic and English UI strings', () => {
  const ar = getGiftStudioTranslations('ar');
  const en = getGiftStudioTranslations('en');

  // Direction and branding
  assert.equal(ar.dir, 'rtl');
  assert.equal(en.dir, 'ltr');
  assert.equal(ar.brandTitle, 'استوديو الهدايا');
  assert.equal(en.brandTitle, 'Gift Files Studio');

  // Top action buttons
  assert.equal(ar.btnUpload, '➕ رفع هدايا');
  assert.equal(en.btnUpload, '➕ Upload Gifts');
  assert.equal(ar.btnDurationNative, '⏱️ مدة الفيديو: الأصلية');
  assert.equal(en.btnDurationNative, '⏱️ Video Duration: Native');
  assert.equal(ar.btnDurationActive(8), '⏱️ مدة الفيديو: 8ث ✓');
  assert.equal(en.btnDurationActive(8), '⏱️ Video Duration: 8s ✓');

  // All 5 coordinated export modes
  const modes = ['gi', 'pack', 'sep', 'one', 'extract'] as const;
  for (const m of modes) {
    assert.ok(ar.exportModes[m].option && ar.exportModes[m].button);
    assert.ok(en.exportModes[m].option && en.exportModes[m].button);
  }

  // Popover hints & unit
  assert.equal(ar.popDurUnit, 'ث');
  assert.equal(en.popDurUnit, 's');
  assert.ok(ar.popDurHintActive(5).includes('مفعّل'));
  assert.ok(en.popDurHintActive(5).includes('Active'));
});

test('resolveGiftFormatLabel and buildFormatRenamedBatch completely delete old names and join new name and format with a dot "."', () => {
  const sampleItems = [
    { id: 1, name: '[1360] response_res.echoliveapp.com_h0.svga', fmt: 'svga', kind: 'SVGA' },
    { id: 2, name: 'old_luxury_car_effect_99.mp4', fmt: 'mp4', kind: 'VAP', isVap: true },
    { id: 3, name: 'effect.pag', fmt: 'pag', kind: 'PAG' },
    { id: 4, name: 'badge.json', fmt: 'lottie', kind: 'Lottie' },
  ];

  assert.equal(resolveGiftFormatLabel(sampleItems[0]), 'SVGA');
  assert.equal(resolveGiftFormatLabel(sampleItems[1]), 'VAP');
  assert.equal(resolveGiftFormatLabel(sampleItems[2]), 'PAG');
  assert.equal(resolveGiftFormatLabel(sampleItems[3]), 'Lottie');

  assert.equal(sanitizeCustomGiftName('  .Ahmed / VIP*.  '), 'Ahmed VIP');

  // 1. Default mode ('ext_only', separator '.'): completely deletes old name and builds <NewName>.<formatExt>
  const renamedDefaultDot = buildFormatRenamedBatch(sampleItems, {
    customName: 'Ahmed',
    order: 'ext_only',
    separator: '.',
    alwaysNumber: false,
  });

  assert.deepEqual(renamedDefaultDot, [
    'Ahmed.svga',
    'Ahmed.mp4',
    'Ahmed.pag',
    'Ahmed.json',
  ]);

  // 2. Format + Name mode ('fmt_first', separator '.'): builds <Format>.<NewName>.<formatExt>
  const renamedFmtFirstDot = buildFormatRenamedBatch(sampleItems, {
    customName: 'Ahmed',
    order: 'fmt_first',
    separator: '.',
    alwaysNumber: false,
  });

  assert.deepEqual(renamedFmtFirstDot, [
    'SVGA.Ahmed.svga',
    'VAP.Ahmed.mp4',
    'PAG.Ahmed.pag',
    'Lottie.Ahmed.json',
  ]);

  // 3. When multiple files share the same format (e.g. 2 SVGA files), automatic numbering uses '.'
  const multiSvga = [
    { id: 1, name: '[1360] response_res.echoliveapp.com_h0.svga', fmt: 'svga', kind: 'SVGA' },
    { id: 2, name: 'second_old_file_name.svga', fmt: 'svga', kind: 'SVGA' },
    { id: 3, name: 'car_old_name.mp4', fmt: 'mp4', kind: 'VAP', isVap: true },
  ];
  const renamedMultiExtOnly = buildFormatRenamedBatch(multiSvga, {
    customName: 'King',
    order: 'ext_only',
    separator: '.',
    alwaysNumber: false,
  });
  assert.deepEqual(renamedMultiExtOnly, [
    'King.1.svga',
    'King.2.svga',
    'King.mp4',
  ]);

  const renamedMultiFmtFirst = buildFormatRenamedBatch(multiSvga, {
    customName: 'King',
    order: 'fmt_first',
    separator: '.',
    alwaysNumber: false,
  });
  assert.deepEqual(renamedMultiFmtFirst, [
    'SVGA.King.1.svga',
    'SVGA.King.2.svga',
    'VAP.King.mp4',
  ]);

  // 4. Support name_first order with '.' and prevent duplicate extensions if user typed 'VIP.svga'
  const nameFirst = buildFormatRenamedFileName(sampleItems[0], 'VIP', {
    order: 'name_first',
    separator: '.',
  });
  assert.equal(nameFirst, 'VIP.SVGA.svga');

  const noDoubleExt = buildFormatRenamedFileName(sampleItems[0], 'Ahmed.svga', {
    order: 'ext_only',
    separator: '.',
  });
  assert.equal(noDoubleExt, 'Ahmed.svga');
});

test('computeMobilePreviewDimensions and stepMobilePreviewItemIndex size mobile phone frame and navigate gifts cleanly', () => {
  const phoneDims = computeMobilePreviewDimensions(1440, 900, 'phone', 120);
  assert.equal(phoneDims.aspectLabel, '9:16');
  assert.ok(phoneDims.frameHeight >= 600 && phoneDims.frameHeight <= 740);
  assert.ok(phoneDims.frameWidth >= 320 && phoneDims.frameWidth < phoneDims.frameHeight);
  assert.equal(phoneDims.giftScale, 1.2);

  const tabletDims = computeMobilePreviewDimensions(1440, 900, 'tablet', 100);
  assert.equal(tabletDims.aspectLabel, '3:4');
  assert.ok(tabletDims.frameWidth > phoneDims.frameWidth);

  const fullDims = computeMobilePreviewDimensions(1440, 900, 'full', 150);
  assert.equal(fullDims.aspectLabel, '16:10');
  assert.ok(fullDims.frameWidth > tabletDims.frameWidth);
  assert.equal(fullDims.giftScale, 1.5);

  const ids = [10, 20, 30];
  assert.equal(stepMobilePreviewItemIndex(10, ids, 1), 20);
  assert.equal(stepMobilePreviewItemIndex(30, ids, 1), 10);
  assert.equal(stepMobilePreviewItemIndex(10, ids, -1), 30);
  assert.equal(stepMobilePreviewItemIndex(99, ids, 1), 10);
  assert.equal(stepMobilePreviewItemIndex(10, [], 1), null);
});

test('resampleChannelFloat32 never produces NaN or silent dropouts when passed IEEE-754 non-integer float offsets (VAP/YYEVA audio stutter regression)', () => {
  const sr = 48000;
  const totalSamples = sr * 2; // 2 seconds of 440Hz sine wave
  const src = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    src[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.8 + 0.1; // strictly non-zero offset sine
  }

  // Specifically test off = 6720 where (6720 / 48000) * 48000 === 6720.000000000001 in IEEE-754 float64
  const floatOffset = (6720 / sr) * sr;
  const chunk = resampleChannelFloat32(src, sr, sr, 960, 1.0, floatOffset);
  assert.equal(chunk.length, 960);

  let nonZeroCount = 0;
  for (let i = 0; i < chunk.length; i++) {
    assert.equal(Number.isNaN(chunk[i]), false, `Sample ${i} must not be NaN`);
    if (Math.abs(chunk[i]) > 1e-4) nonZeroCount++;
  }
  assert.ok(nonZeroCount > 950, 'Audio chunk at float offset 6720.000000000001 must retain full waveform without dropout');

  // Also test across all 100 chunks of 960 samples using computeAudioChunkSampleOffset
  for (let off = 0; off + 960 <= totalSamples; off += 960) {
    const exactOffset = computeAudioChunkSampleOffset(0, off, sr, sr);
    assert.equal(Number.isInteger(exactOffset), true);
    const c = resampleChannelFloat32(src, sr, sr, 960, 1.0, exactOffset);
    assert.ok(Math.abs(c[0] - src[off]) < 1e-5);
  }
});

test('getOptimalAudioFrameSize and interleaveTimestampedMediaChunks align audio/video muxing for glitch-free VAP/YYEVA playback', () => {
  assert.equal(getOptimalAudioFrameSize('aac'), 1024);
  assert.equal(getOptimalAudioFrameSize('opus'), 960);

  const vChunks = [
    { chunk: 'v0', meta: {}, timestamp: 0 },
    { chunk: 'v1', meta: {}, timestamp: 33333 },
    { chunk: 'v2', meta: {}, timestamp: 66667 },
  ];
  const aChunks = [
    { chunk: 'a0', meta: {}, timestamp: 0 },
    { chunk: 'a1', meta: {}, timestamp: 21333 },
    { chunk: 'a2', meta: {}, timestamp: 42667 },
    { chunk: 'a3', meta: {}, timestamp: 64000 },
  ];

  const interleaved = interleaveTimestampedMediaChunks(vChunks, aChunks);
  assert.equal(interleaved.length, 7);

  // Verify timestamps are monotonically non-decreasing
  for (let i = 1; i < interleaved.length; i++) {
    assert.ok(
      interleaved[i].timestamp >= interleaved[i - 1].timestamp,
      `Chunk ${i} timestamp (${interleaved[i].timestamp}) should be >= previous (${interleaved[i - 1].timestamp})`
    );
  }
  // At timestamp 0, video comes before audio
  assert.equal(interleaved[0].kind, 'video');
  assert.equal(interleaved[1].kind, 'audio');
});

test('computeSideBySideSlotRenderPlan places uploaded background image inside each individual gift frame slot', () => {
  const layout = computeSideBySideVideoLayout(24, 720);
  assert.equal(layout.cells.length, 24);

  // Verify each cell in the 24-gift layout gets its own isolated stageRect and background image draw rect
  const cell0 = layout.cells[0];
  const cell5 = layout.cells[5];

  const plan0 = computeSideBySideSlotRenderPlan(cell0, 300, 300, {
    width: 600,
    height: 800,
    fit: 'cover',
  });
  const plan5 = computeSideBySideSlotRenderPlan(cell5, 300, 300, {
    width: 600,
    height: 800,
    fit: 'cover',
  });

  // Gift draw rect matches stageRect inside its own cell
  assert.deepEqual(plan0.giftDrawRect, {
    x: plan0.stageRect.x,
    y: plan0.stageRect.y,
    width: plan0.stageRect.width,
    height: plan0.stageRect.height,
  });
  assert.ok(plan0.stageRect.x >= cell0.x && plan0.stageRect.x + plan0.stageRect.width <= cell0.x + cell0.width);
  assert.ok(plan0.stageRect.y >= cell0.y && plan0.stageRect.y + plan0.stageRect.height <= cell0.y + cell0.height);

  // Uploaded background image is centered inside cell0's stageRect and covers it
  assert.ok(plan0.bgImageDrawRect);
  assert.ok(plan0.bgImageDrawRect.width >= plan0.stageRect.width);
  assert.ok(plan0.bgImageDrawRect.height >= plan0.stageRect.height);

  const stageCenterX0 = plan0.stageRect.x + plan0.stageRect.width / 2;
  const bgCenterX0 = plan0.bgImageDrawRect.x + plan0.bgImageDrawRect.width / 2;
  assert.ok(Math.abs(stageCenterX0 - bgCenterX0) < 0.5);

  // Cell 5 has its own distinct background image position centered inside cell 5
  assert.ok(plan5.bgImageDrawRect);
  assert.notEqual(plan5.bgImageDrawRect.x, plan0.bgImageDrawRect.x);
  const stageCenterX5 = plan5.stageRect.x + plan5.stageRect.width / 2;
  const bgCenterX5 = plan5.bgImageDrawRect.x + plan5.bgImageDrawRect.width / 2;
  assert.ok(Math.abs(stageCenterX5 - bgCenterX5) < 0.5);
});


