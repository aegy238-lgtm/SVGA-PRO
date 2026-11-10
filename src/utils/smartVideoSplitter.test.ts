import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SMART_SPLITTER_CONFIG,
  detectDominantBackgroundKeyColor,
  removeVideoBackgroundAndDespillInPlace,
  computeTemporalForegroundOccupancyMap,
  detectSmartElementsRegions,
  extractElementSequenceRgba,
  encodeExtractedElementSync,
  buildZipArchiveSync,
} from './smartVideoSplitter';
import { pako, parseMovie, parseAnimatedWebPInfo, parseApngInfo } from './codecs';

describe('Smart Video Elements Splitter & Multi-Format Exporter Engine', () => {
  test('detectDominantBackgroundKeyColor detects green screen perimeter accurately', () => {
    const w = 80;
    const h = 80;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 24;
      rgba[i + 1] = 185;
      rgba[i + 2] = 40;
      rgba[i + 3] = 255;
    }
    const info = detectDominantBackgroundKeyColor(rgba, w, h);
    assert.equal(info.isAlreadyTransparent, false);
    assert.equal(info.isGreenScreen, true);
    assert.ok(info.g > 160 && info.r < 50 && info.b < 60);
    assert.ok(info.confidence > 0.8);
  });

  test('removeVideoBackgroundAndDespillInPlace removes green screen while preserving character colors & despilling edges', () => {
    const w = 10;
    const h = 10;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Fill with green screen background
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 24;
      rgba[i + 1] = 185;
      rgba[i + 2] = 40;
      rgba[i + 3] = 255;
    }
    // Center pixel (5,5): bright red heart
    const heartIdx = (5 * w + 5) * 4;
    rgba[heartIdx] = 235;
    rgba[heartIdx + 1] = 30;
    rgba[heartIdx + 2] = 45;
    rgba[heartIdx + 3] = 255;

    // Neighbor pixel (5,6): white ghutra cloth with slight green spill
    const clothIdx = (5 * w + 6) * 4;
    rgba[clothIdx] = 215;
    rgba[clothIdx + 1] = 245;
    rgba[clothIdx + 2] = 215;
    rgba[clothIdx + 3] = 255;

    const bgInfo = detectDominantBackgroundKeyColor(rgba, w, h);
    removeVideoBackgroundAndDespillInPlace(
      rgba,
      w,
      h,
      {
        ...DEFAULT_SMART_SPLITTER_CONFIG.chroma,
        featherPx: 0,
      },
      bgInfo
    );

    assert.equal(rgba[3], 0, 'Corner green screen pixel should become 100% transparent');
    assert.equal(rgba[heartIdx + 3], 255, 'Red heart pixel should stay 100% opaque');
    assert.ok(rgba[clothIdx + 3] > 200, 'White ghutra cloth pixel should stay opaque');
    assert.ok(
      rgba[clothIdx + 1] <= rgba[clothIdx] + 5,
      'Green spill on white cloth should be suppressed'
    );
  });

  test('detectSmartElementsRegions automatically isolates all 24 stickers in a 4x6 green-screen video grid', () => {
    const W = 240;
    const H = 360;
    const cols = 4;
    const rows = 6;
    const cellW = W / cols; // 60
    const cellH = H / rows; // 60

    // Create 2 frames where stickers move slightly within their 4x6 cells on a green screen
    const frame1 = new Uint8ClampedArray(W * H * 4);
    const frame2 = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < frame1.length; i += 4) {
      frame1[i] = 20;
      frame1[i + 1] = 185;
      frame1[i + 2] = 35;
      frame1[i + 3] = 255;
      frame2[i] = 20;
      frame2[i + 1] = 185;
      frame2[i + 2] = 35;
      frame2[i + 3] = 255;
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = c * cellW + 12;
        const y0 = r * cellH + 10;
        const x1 = c * cellW + 48;
        const y1 = r * cellH + 50;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const idx1 = (y * W + x) * 4;
            frame1[idx1] = 240;
            frame1[idx1 + 1] = 180;
            frame1[idx1 + 2] = 120;
            frame1[idx1 + 3] = 255;

            // Frame 2 shifted by +2px horizontally (e.g. waving hand)
            const idx2 = (y * W + Math.min(W - 1, x + 2)) * 4;
            frame2[idx2] = 240;
            frame2[idx2 + 1] = 180;
            frame2[idx2 + 2] = 120;
            frame2[idx2 + 3] = 255;
          }
        }
      }
    }

    const bgInfo = detectDominantBackgroundKeyColor(frame1, W, H);
    removeVideoBackgroundAndDespillInPlace(frame1, W, H, DEFAULT_SMART_SPLITTER_CONFIG.chroma, bgInfo);
    removeVideoBackgroundAndDespillInPlace(frame2, W, H, DEFAULT_SMART_SPLITTER_CONFIG.chroma, bgInfo);

    const occupancy = computeTemporalForegroundOccupancyMap([frame1, frame2], W, H, 28);

    // 1. Test auto_smart detection
    const autoRegions = detectSmartElementsRegions(occupancy, W, H, {
      detectionMode: 'auto_smart',
      paddingPx: 2,
      tightTrimCells: true,
    });
    assert.equal(autoRegions.length, 24, 'Should automatically detect all 24 stickers (4x6)');
    assert.equal(autoRegions[0].nameAr, 'أحسنتم_نجمة');
    assert.equal(autoRegions[23].nameAr, 'باي_وداع');
    // Check that first sticker's bounding box covers both frame1 (x=12..48) and frame2 (x=14..50) + 2px padding
    assert.ok(autoRegions[0].x <= 12 && autoRegions[0].x >= 8);
    assert.ok(autoRegions[0].width >= 38 && autoRegions[0].width <= 46);

    // 2. Test connected islands mode
    const islandRegions = detectSmartElementsRegions(occupancy, W, H, {
      detectionMode: 'islands',
      bridgeGapPx: 4,
      paddingPx: 2,
    });
    assert.equal(islandRegions.length, 24, 'Connected islands mode should also isolate all 24 stickers');
  });

  test('extractElementSequenceRgba and encodeExtractedElementSync export valid SVGA, WebP, APNG, GIF, Lottie, PNG, and ZIP', () => {
    const srcW = 64;
    const srcH = 64;
    const f1 = new Uint8ClampedArray(srcW * srcH * 4);
    const f2 = new Uint8ClampedArray(srcW * srcH * 4);

    for (let y = 16; y < 48; y++) {
      for (let x = 16; x < 48; x++) {
        const idx = (y * srcW + x) * 4;
        f1[idx] = 255;
        f1[idx + 1] = 190;
        f1[idx + 2] = 40;
        f1[idx + 3] = 255;

        f2[idx] = 40;
        f2[idx + 1] = 200;
        f2[idx + 2] = 255;
        f2[idx + 3] = 255;
      }
    }

    const extracted = extractElementSequenceRgba(
      [f1, f2],
      srcW,
      srcH,
      { x: 14, y: 14, width: 36, height: 36 },
      { sizeMode: 'auto_tight' }
    );
    assert.equal(extracted.width, 36);
    assert.equal(extracted.height, 36);
    assert.equal(extracted.frames.length, 2);

    // 1. SVGA 2.0 export
    const svgaOut = encodeExtractedElementSync(
      extracted.frames,
      extracted.width,
      extracted.height,
      12,
      'svga',
      'sticker_01'
    );
    assert.equal(svgaOut.ext, 'svga');
    const inflated = pako.inflate(svgaOut.bytes);
    const parsedMovie = parseMovie(inflated);
    assert.equal(parsedMovie.n, 2);
    assert.equal(parsedMovie.sp.length, 1, 'Each exported SVGA sticker should be a clean 1-layer SVGA');

    // 2. Animated WebP export
    const webpOut = encodeExtractedElementSync(
      extracted.frames,
      extracted.width,
      extracted.height,
      12,
      'webp',
      'sticker_01'
    );
    const webpInfo = parseAnimatedWebPInfo(webpOut.bytes);
    assert.ok(webpInfo);
    assert.equal(webpInfo.isAnimated, true);
    assert.equal(webpInfo.frameCount, 2);

    // 3. Animated APNG export
    const apngOut = encodeExtractedElementSync(
      extracted.frames,
      extracted.width,
      extracted.height,
      12,
      'apng',
      'sticker_01'
    );
    const apngInfo = parseApngInfo(apngOut.bytes);
    assert.ok(apngInfo);
    assert.equal(apngInfo.isApng, true);
    assert.equal(apngInfo.numFrames, 2);

    // 4. Animated GIF89a export
    const gifOut = encodeExtractedElementSync(
      extracted.frames,
      extracted.width,
      extracted.height,
      12,
      'gif',
      'sticker_01'
    );
    const gifHeader = new TextDecoder().decode(gifOut.bytes.subarray(0, 6));
    assert.equal(gifHeader, 'GIF89a');

    // 5. Lottie JSON export
    const lottieOut = encodeExtractedElementSync(
      extracted.frames,
      extracted.width,
      extracted.height,
      12,
      'lottie',
      'sticker_01'
    );
    const lottieJson = JSON.parse(new TextDecoder().decode(lottieOut.bytes));
    assert.equal(lottieJson.layers.length, 2);

    // 6. Bulk ZIP packaging
    const zipBytes = buildZipArchiveSync([
      { name: 'sticker_01.svga', data: svgaOut.bytes },
      { name: 'sticker_01.webp', data: webpOut.bytes },
    ]);
    assert.equal(zipBytes[0], 0x50);
    assert.equal(zipBytes[1], 0x4b);
  });
});
