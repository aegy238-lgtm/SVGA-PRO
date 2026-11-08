import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRE_EFFECT_CATEGORIES,
  FIRE_SHAPE_CATEGORIES,
  TOTAL_FIRE_EFFECTS_COUNT,
  TOTAL_FIRE_SHAPES_COUNT,
  getFireEffectById,
  getFireShapeById,
  searchFireEffectsCatalog,
  searchFireShapesCatalog,
  generateFireShapeSvgMarkup,
  exportFireEffectToAnimatedSvgString,
  sortSequentialFireFiles,
  cleanFireFrameAlphaInPlace,
  extractBaseLayerFirePerimeterPoints,
  deduplicateAndPlanFireAtlas,
  buildSingleLayerFireSvgaFrames,
} from './svgaFireEngine';
import { parseSpriteSheetWindowFromClipPath, computeSpriteFrameMatrix, DEFAULT_TRANSFORM } from './svgaEditorLogic';

describe('SVGA Fire Effects Engine & Single-Layer Packing', () => {
  test('Catalog contains 50,000 Fire Effects across 15 categories and 5,000 Fire Shapes across 11 categories', () => {
    assert.equal(TOTAL_FIRE_EFFECTS_COUNT, 50000);
    assert.equal(TOTAL_FIRE_SHAPES_COUNT, 5000);
    assert.equal(FIRE_EFFECT_CATEGORIES.length, 15);
    assert.equal(FIRE_SHAPE_CATEGORIES.length, 11);

    const effect1 = getFireEffectById(1);
    const effect50000 = getFireEffectById(50000);
    assert.equal(effect1.id, 1);
    assert.equal(effect50000.id, 50000);
    assert.ok(effect1.nameAr.length > 3);
    assert.ok(effect50000.nameEn.length > 3);

    const shape1 = getFireShapeById(1);
    const shape5000 = getFireShapeById(5000);
    assert.equal(shape1.id, 1);
    assert.equal(shape5000.id, 5000);

    const svgMarkup = generateFireShapeSvgMarkup(shape1, { width: 128, height: 128 });
    assert.ok(svgMarkup.includes('<svg'));
    assert.ok(svgMarkup.includes('radialGradient') || svgMarkup.includes('linearGradient'));
  });

  test('Catalog search and category filtering paginate deterministically', () => {
    const allEffects = searchFireEffectsCatalog({ categoryId: 'ALL', query: '', page: 1, pageSize: 24 });
    assert.equal(allEffects.totalMatched, 50000);
    assert.equal(allEffects.items.length, 24);

    const dragonSearch = searchFireEffectsCatalog({ categoryId: 'dragon_fire', query: '', page: 1, pageSize: 20 });
    assert.ok(dragonSearch.totalMatched > 3000);
    assert.ok(dragonSearch.items.every((item) => item.categoryId === 'dragon_fire'));

    const allShapes = searchFireShapesCatalog({ categoryId: 'ALL', query: '', page: 1, pageSize: 20 });
    assert.equal(allShapes.totalMatched, 5000);
    assert.equal(allShapes.items.length, 20);
  });

  test('sortSequentialFireFiles sorts natural frame indices chronologically', () => {
    const items = [
      { name: 'fire_frame_100.png' },
      { name: 'fire_frame_2.png' },
      { name: 'fire_frame_1.png' },
      { name: 'fire_frame_10.png' },
      { name: 'fire_frame_25.png' },
    ];
    const sorted = sortSequentialFireFiles(items);
    assert.deepEqual(
      sorted.map((f) => f.name),
      [
        'fire_frame_1.png',
        'fire_frame_2.png',
        'fire_frame_10.png',
        'fire_frame_25.png',
        'fire_frame_100.png',
      ]
    );
  });

  test('cleanFireFrameAlphaInPlace removes solid black & purple checkerboards while preserving flame core alpha', () => {
    // 4 pixels (16 bytes): [0]=pure black, [1]=bright orange flame, [2]=dark warm glow (maxC=48), [3]=near-black background
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 160, 20, 255,
      48, 16, 0, 255,
      2, 2, 2, 255,
    ]);
    cleanFireFrameAlphaInPlace(rgba, 'black');
    assert.equal(rgba[3], 0, 'Pure black pixel should become transparent');
    assert.equal(rgba[7], 255, 'Bright orange flame pixel should stay opaque');
    assert.ok(rgba[11] > 0 && rgba[11] < 200, 'Dark warm glow pixel should have soft feathered alpha');
    assert.equal(rgba[15], 0, 'Near-black background should become transparent');
  });

  test('extractBaseLayerFirePerimeterPoints detects opaque silhouette contour accurately', () => {
    const w = 40;
    const h = 40;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 10; y <= 30; y += 1) {
      for (let x = 10; x <= 30; x += 1) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 255;
        rgba[idx + 1] = 200;
        rgba[idx + 2] = 50;
        rgba[idx + 3] = 255;
      }
    }
    const pts = extractBaseLayerFirePerimeterPoints(rgba, w, h, [1, 0, 0, 1, 0, 0], 32);
    assert.ok(pts.length >= 16, 'Should extract perimeter points along the square boundary');
    for (const pt of pts) {
      assert.ok(pt.x >= 9 && pt.x <= 31);
      assert.ok(pt.y >= 9 && pt.y <= 31);
    }
  });

  test('Single-Layer Atlas packing deduplicates 100+ sequential frames and maps them into 1 SVGA SpriteEntity', () => {
    const cellW = 16;
    const cellH = 16;
    const frames: Uint8ClampedArray[] = [];
    for (let f = 0; f < 100; f += 1) {
      const patternId = f % 25;
      const buf = new Uint8ClampedArray(cellW * cellH * 4);
      for (let i = 0; i < buf.length; i += 4) {
        buf[i] = (patternId * 10) & 255;
        buf[i + 1] = ((patternId * 23) + (i >> 2)) & 255;
        buf[i + 2] = (255 - patternId * 9) & 255;
        buf[i + 3] = 255;
      }
      frames.push(buf);
    }

    const plan = deduplicateAndPlanFireAtlas(frames, cellW, cellH, 2048);
    assert.equal(plan.frameToCellIndex.length, 100);
    assert.equal(plan.uniqueCellIndices.length, 25, '100 repeating frames of 25 patterns should deduplicate to 25 unique cells');
    assert.ok(plan.atlasWidth > 0 && plan.atlasHeight > 0);

    const compFrames = 120;
    const svgaFrames = buildSingleLayerFireSvgaFrames({
      compTotalFrames: compFrames,
      inFrame: 0,
      outFrame: compFrames - 1,
      cols: plan.cols,
      rows: plan.rows,
      cellWidth: plan.cellWidth,
      cellHeight: plan.cellHeight,
      frameToCellIndex: plan.frameToCellIndex,
      speed: 1.2,
      loopMode: 'loop',
      canvasW: 500,
      canvasH: 500,
      baseTransform: { ...DEFAULT_TRANSFORM, opacity: 90 },
    });

    assert.equal(svgaFrames.length, compFrames);
    const f0 = svgaFrames[0];
    assert.ok(f0.a > 0.85);
    assert.ok((f0.clipPath || '').includes(`L ${cellW} 0 L ${cellW} ${cellH}`));

    const parsedWindow = parseSpriteSheetWindowFromClipPath(f0.clipPath);
    assert.deepEqual(parsedWindow, { cellW, cellH });

    const matrix = computeSpriteFrameMatrix(
      f0,
      plan.atlasWidth,
      plan.atlasHeight,
      500,
      500,
      { ...DEFAULT_TRANSFORM, x: 10, y: -5, sx: 100, sy: 100 }
    );
    assert.equal(matrix.length, 6);
    assert.ok(Number.isFinite(matrix[4]) && Number.isFinite(matrix[5]));
  });

  test('Single-Layer Animated SVG export produces a unified <g id="FireUnifiedSingleLayer"> with embedded keyframes', () => {
    const preset = getFireEffectById(777);
    const svg = exportFireEffectToAnimatedSvgString({
      effect: preset,
      width: 600,
      height: 600,
      fps: 24,
      frameCount: 24,
      intensityScale: 125,
      densityScale: 110,
      spreadScale: 40,
      windAngleOffset: 12,
      placementMode: 'around_full',
    });
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('id="FireUnifiedSingleLayer"'));
    assert.ok(svg.includes('data-layer-count="1"'));
    assert.ok(svg.includes('@keyframes'));
  });
});
