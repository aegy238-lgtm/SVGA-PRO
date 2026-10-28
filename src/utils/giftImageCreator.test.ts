import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GIFT_SHAPES,
  DEFAULT_GIFT_CREATOR_SETTINGS,
  DEFAULT_GIFT_OVERLAY_CONFIG,
  computeOutputDimensions,
  computeShapeInnerBox,
  getPolygonShapeVertices,
  isPointInsideGiftShape,
  computeImageTransformRect,
  computeOverlayTransformRect,
  resolveEffectiveItemSettings,
  buildExportFileName,
} from './giftImageCreator';

test('GIFT_SHAPES includes all required core shapes plus decorative shapes', () => {
  const ids = GIFT_SHAPES.map((s) => s.id);
  const required = [
    'circle',
    'rounded_square',
    'rounded_rect',
    'oval',
    'hexagon',
    'diamond',
    'octagon',
    'shield',
    'badge',
    'heart',
    'star',
    'arch',
  ];
  for (const r of required) {
    assert.ok(ids.includes(r as any), `Missing shape ${r}`);
  }
  for (const s of GIFT_SHAPES) {
    assert.ok(s.nameAr.length > 0);
    assert.ok(s.nameEn.length > 0);
    assert.ok(s.svgPreviewPath.startsWith('M '));
  }
});

test('computeOutputDimensions handles unified and original size modes accurately', () => {
  const unified = computeOutputDimensions(1200, 800, {
    ...DEFAULT_GIFT_CREATOR_SETTINGS,
    sizeMode: 'unified',
    width: 600,
    height: 600,
    lockAspectToShape: false,
  });
  assert.deepEqual(unified, { width: 600, height: 600 });

  const original = computeOutputDimensions(1024, 768, {
    ...DEFAULT_GIFT_CREATOR_SETTINGS,
    sizeMode: 'original',
    lockAspectToShape: false,
  });
  assert.deepEqual(original, { width: 1024, height: 768 });

  const lockedRect = computeOutputDimensions(1000, 1000, {
    ...DEFAULT_GIFT_CREATOR_SETTINGS,
    shapeId: 'rounded_rect',
    sizeMode: 'unified',
    width: 800,
    height: 800,
    lockAspectToShape: true,
  });
  assert.equal(lockedRect.width, 800);
  assert.equal(lockedRect.height, 600);
});

test('computeShapeInnerBox enforces transparent outer padding and proportional 1:1 shapes', () => {
  const circleBox = computeShapeInnerBox(500, 400, 'circle', 10);
  // 10% padding on 500x400 leaves 400x320; circle takes min(400,320) = 320 centered
  assert.equal(circleBox.width, 320);
  assert.equal(circleBox.height, 320);
  assert.equal(circleBox.x, 90);
  assert.equal(circleBox.y, 40);

  const rectBox = computeShapeInnerBox(500, 500, 'rounded_rect', 0);
  assert.equal(rectBox.width, 500);
  assert.ok(rectBox.height < 500); // 4:3 distinct rectangle inside square canvas
});

test('isPointInsideGiftShape accurately masks exterior corners as transparent and center as opaque across all shapes', () => {
  const box = { x: 20, y: 20, width: 460, height: 460 };
  const shapesToVerify = [
    'circle',
    'rounded_square',
    'rounded_rect',
    'oval',
    'hexagon',
    'diamond',
    'octagon',
    'shield',
    'badge',
    'heart',
    'star',
    'arch',
  ] as const;

  for (const shapeId of shapesToVerify) {
    // Center point (250, 250) must be strictly inside every shape
    assert.equal(
      isPointInsideGiftShape(250, 250, shapeId, box, 25),
      true,
      `Center (250,250) should be inside ${shapeId}`
    );

    // Top-left canvas corner (2, 2) and top-left box corner (21, 21) must be outside (transparent)
    assert.equal(
      isPointInsideGiftShape(2, 2, shapeId, box, 25),
      false,
      `Canvas corner (2,2) should be outside ${shapeId}`
    );
    assert.equal(
      isPointInsideGiftShape(21, 21, shapeId, box, 25),
      false,
      `Box extreme corner (21,21) should be outside ${shapeId}`
    );
  }
});

test('getPolygonShapeVertices generates exact vertex counts for hexagon, diamond, octagon, star, and badge', () => {
  const box = { x: 0, y: 0, width: 200, height: 200 };
  assert.equal(getPolygonShapeVertices('diamond', box).length, 4);
  assert.equal(getPolygonShapeVertices('hexagon', box).length, 6);
  assert.equal(getPolygonShapeVertices('octagon', box).length, 8);
  assert.equal(getPolygonShapeVertices('star', box).length, 16);
  assert.equal(getPolygonShapeVertices('badge', box).length, 24);
});

test('computeImageTransformRect and computeOverlayTransformRect apply zoom and X/Y pan accurately', () => {
  const box = { x: 0, y: 0, width: 500, height: 500 };
  const baseRect = computeImageTransformRect(1000, 500, box, 'cover', 100, 0, 0);
  // Cover on 2:1 image inside 500x500 -> dw=1000, dh=500, centered at dx=-250, dy=0
  assert.equal(baseRect.dw, 1000);
  assert.equal(baseRect.dh, 500);
  assert.equal(baseRect.dx, -250);
  assert.equal(baseRect.dy, 0);

  const zoomedPanned = computeImageTransformRect(500, 500, box, 'contain', 150, 20, -10);
  assert.equal(zoomedPanned.dw, 750);
  assert.equal(zoomedPanned.dh, 750);
  assert.ok(zoomedPanned.dx > (500 - 750) / 2);
  assert.ok(zoomedPanned.dy < (500 - 750) / 2);

  const ovRect = computeOverlayTransformRect(500, 500, 500, 500, {
    ...DEFAULT_GIFT_OVERLAY_CONFIG,
    scale: 110,
    offsetX: 10,
    offsetY: -10,
    opacity: 80,
  });
  assert.equal(ovRect.dw, 550);
  assert.equal(ovRect.dh, 550);
  assert.equal(ovRect.alpha, 0.8);
});

test('resolveEffectiveItemSettings merges item overrides cleanly over global settings including edgeSoftness', () => {
  const eff = resolveEffectiveItemSettings(
    { ...DEFAULT_GIFT_CREATOR_SETTINGS, edgeSoftness: 18 },
    {
      shapeId: 'hexagon',
      imageScale: 135,
      edgeSoftness: 32,
    }
  );
  assert.equal(eff.shapeId, 'hexagon');
  assert.equal(eff.imageScale, 135);
  assert.equal(eff.edgeSoftness, 32);
  assert.equal(eff.cornerRadius, DEFAULT_GIFT_CREATOR_SETTINGS.cornerRadius);

  const effGlobal = resolveEffectiveItemSettings({
    ...DEFAULT_GIFT_CREATOR_SETTINGS,
    edgeSoftness: 22,
  });
  assert.equal(effGlobal.edgeSoftness, 22);
});

test('buildExportFileName preserves original names and deduplicates collisions', () => {
  const used = new Set<string>();
  const f1 = buildExportFileName('lion_king.jpg', 'png', used);
  const f2 = buildExportFileName('lion_king.png', 'png', used);
  const f3 = buildExportFileName('dragon_gift.webp', 'webp', used);

  assert.equal(f1, 'lion_king.png');
  assert.equal(f2, 'lion_king_2.png');
  assert.equal(f3, 'dragon_gift.webp');
});
