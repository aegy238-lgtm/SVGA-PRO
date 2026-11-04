import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRANSFORM,
  copySpriteFramesToLayer,
  retargetCopiedFramesDimensions,
  cloneLayerPropertyKeyframes,
  computeSpriteFrameMatrix,
  computeAddedLayerFrameMatrix,
  mirrorSvgaFramesHorizontally,
  mirrorLayerTransformHorizontally,
  duplicateSvgaSprite,
  serializeDecomposedSvga,
  computeUnstretchedZoomPatch,
  interpolateLayerTransform,
} from './svgaEditorLogic';
import { parseMovie, SvgaMovie, SvgaSprite } from './codecs';

test('copySpriteFramesToLayer clones frame matrices, alpha, and active span accurately', () => {
  const srcSprite: SvgaSprite = {
    key: 'wing_left',
    fr: [
      { a: 0, x: 0, y: 0, w: 0, h: 0, t: [1, 0, 0, 1, 0, 0] },
      { a: 0.85, x: 4, y: 8, w: 0, h: 0, t: [1.2, 0.1, -0.1, 1.2, 25, 60], clipPath: 'M0,0L10,10Z' },
      { a: 1, x: 4, y: 8, w: 80, h: 90, t: [1.5, 0, 0, 1.5, 30, 65] },
      { a: 0, x: 0, y: 0, w: 0, h: 0, t: [1, 0, 0, 1, 0, 0] },
    ],
  };

  const result = copySpriteFramesToLayer(srcSprite, 64, 72, 4);
  assert.equal(result.inFrame, 1);
  assert.equal(result.outFrame, 2);
  assert.equal(result.frames.length, 4);

  // Frame 0 is hidden (a = 0)
  assert.equal(result.frames[0].a, 0);

  // Frame 1 inherits source asset dimensions when w/h are 0, plus exact matrix & clipPath
  assert.equal(result.frames[1].a, 0.85);
  assert.equal(result.frames[1].w, 64);
  assert.equal(result.frames[1].h, 72);
  assert.deepEqual(result.frames[1].t, [1.2, 0.1, -0.1, 1.2, 25, 60]);
  assert.equal(result.frames[1].clipPath, 'M0,0L10,10Z');

  // Frame 2 keeps explicit w=80, h=90
  assert.equal(result.frames[2].w, 80);
  assert.equal(result.frames[2].h, 90);
  assert.deepEqual(result.frames[2].t, [1.5, 0, 0, 1.5, 30, 65]);
});

test('copySpriteFramesToLayer with preserveTargetBounds keeps added layer fixed dimensions and placement while applying relative motion', () => {
  // Source sprite has a 60x60 asset scaled 2x at (70, 100) on frame 0, then scales 1.5x (to 3x) and moves (+10, +5) on frame 1
  const srcSprite: SvgaSprite = {
    key: 'wing_src',
    fr: [
      { a: 1, x: 0, y: 0, w: 60, h: 60, t: [2, 0, 0, 2, 10, 40] },
      { a: 0.8, x: 0, y: 0, w: 60, h: 60, t: [3, 0, 0, 3, -10, 15] },
    ],
  };

  // User added an image layer of 100x80 and fixed its transform to sx=50% (50px wide), sy=50% (40px high), x=30, y=-20 on a 300x300 canvas
  const userFixedTransform = {
    x: 30,
    y: -20,
    sx: 50,
    sy: 50,
    rotation: 0,
    opacity: 100,
  };

  const copied = copySpriteFramesToLayer(srcSprite, 60, 60, 2, undefined, {
    targetWidth: 100,
    targetHeight: 80,
    canvasW: 300,
    canvasH: 300,
    referenceFrame: 0,
    preserveTargetBounds: true,
  });

  // Both frames keep the added layer's exact local dimensions (100x80) instead of source sprite's 60x60
  assert.equal(copied.frames[0].w, 100);
  assert.equal(copied.frames[0].h, 80);
  assert.equal(copied.frames[1].w, 100);
  assert.equal(copied.frames[1].h, 80);

  // At reference frame 0, the rendered matrix of the added layer with copiedFrames must match its static user-fixed matrix 100%
  const staticMat = computeAddedLayerFrameMatrix(100, 80, 300, 300, userFixedTransform, DEFAULT_TRANSFORM);
  const copiedMatF0 = computeSpriteFrameMatrix(
    copied.frames[0],
    100,
    80,
    300,
    300,
    userFixedTransform,
    DEFAULT_TRANSFORM
  );
  assert.deepEqual(copiedMatF0, staticMat);

  // At frame 1, the source sprite scaled by 1.5x and moved (+10, +5), so the added layer scales 1.5x from its fixed 50x40 (to 75x60) and moves (+10, +5) from (180, 130) to (190, 135)
  const copiedMatF1 = computeSpriteFrameMatrix(
    copied.frames[1],
    100,
    80,
    300,
    300,
    userFixedTransform,
    DEFAULT_TRANSFORM
  );
  const renderedWidthF1 = 100 * copiedMatF1[0];
  const renderedHeightF1 = 80 * copiedMatF1[3];
  const centerXF1 = copiedMatF1[0] * 50 + copiedMatF1[2] * 40 + copiedMatF1[4];
  const centerYF1 = copiedMatF1[1] * 50 + copiedMatF1[3] * 40 + copiedMatF1[5];

  assert.equal(Number(renderedWidthF1.toFixed(2)), 75);
  assert.equal(Number(renderedHeightF1.toFixed(2)), 60);
  assert.equal(Number(centerXF1.toFixed(2)), 190);
  assert.equal(Number(centerYF1.toFixed(2)), 135);

  // Retargeting dimensions to baked 50x40 preserves the exact canvas center
  const retargeted = retargetCopiedFramesDimensions(copied.frames, 50, 40);
  assert.equal(retargeted[0].w, 50);
  assert.equal(retargeted[0].h, 40);
  const bakedTransform = { ...userFixedTransform, sx: 100, sy: 100 };
  const bakedMatF1 = computeSpriteFrameMatrix(
    retargeted[1],
    50,
    40,
    300,
    300,
    bakedTransform,
    DEFAULT_TRANSFORM
  );
  const bakedCenterXF1 = bakedMatF1[0] * 25 + bakedMatF1[2] * 20 + bakedMatF1[4];
  const bakedCenterYF1 = bakedMatF1[1] * 25 + bakedMatF1[3] * 20 + bakedMatF1[5];
  assert.equal(Number(bakedCenterXF1.toFixed(2)), 190);
  assert.equal(Number(bakedCenterYF1.toFixed(2)), 135);
});

test('cloneLayerPropertyKeyframes clones and mirrors per-property keyframe maps accurately', () => {
  const pkf = {
    position: { 0: { x: 25, y: -10 } },
    scale: { 0: { sx: 60, sy: 80 } },
    rotation: { 0: 15 },
    opacity: { 0: 90 },
  };
  const mirrored = cloneLayerPropertyKeyframes(pkf, 'canvas', false);
  assert.deepEqual(mirrored?.position?.[0], { x: -25, y: -10 });
  assert.deepEqual(mirrored?.scale?.[0], { sx: -60, sy: 80 });
  assert.equal(mirrored?.rotation?.[0], -15);
  assert.equal(mirrored?.opacity?.[0], 90);
});

test('mirrorSvgaFramesHorizontally reflects left-to-right across canvasW (canvas mode) and in-place (local mode)', () => {
  const frames = [
    {
      a: 1,
      x: 0,
      y: 0,
      w: 50,
      h: 40,
      t: [1, 0.2, -0.2, 1, 30, 100] as [number, number, number, number, number, number],
    },
  ];

  // Canvas mode: W = 300 -> tx' = 300 - 30 = 270, a' = -1, c' = 0.2
  const canvasMirrored = mirrorSvgaFramesHorizontally(frames, 300, 50, 40, 'canvas');
  assert.deepEqual(canvasMirrored[0].t, [-1, 0.2, 0.2, 1, 270, 100]);

  // Verify that the local point (0, 0) maps to 300 - 30 = 270 and (50, 0) maps to 270 - 50 = 220
  const m = canvasMirrored[0].t;
  const xLeftEdge = m[0] * 0 + m[2] * 0 + m[4];
  const xRightEdge = m[0] * 50 + m[2] * 0 + m[4];
  assert.equal(xLeftEdge, 270);
  assert.equal(xRightEdge, 220);

  // Local mode: center (lx=25, ly=20) stays at same canvas X
  const origCx = 1 * 25 + -0.2 * 20 + 30; // 51
  const localMirrored = mirrorSvgaFramesHorizontally(frames, 300, 50, 40, 'local');
  const lm = localMirrored[0].t;
  const newCx = lm[0] * 25 + lm[2] * 20 + lm[4];
  assert.equal(Number(newCx.toFixed(4)), Number(origCx.toFixed(4)));
});

test('mirrorLayerTransformHorizontally flips X position, SX scale, and rotation', () => {
  const lt = {
    x: -45,
    y: 20,
    sx: 100,
    sy: 100,
    rotation: 15,
    opacity: 90,
  };
  const canvasFlipped = mirrorLayerTransformHorizontally(lt, 'canvas');
  assert.deepEqual(canvasFlipped, {
    x: 45,
    y: 20,
    sx: -100,
    sy: 100,
    rotation: -15,
    opacity: 90,
  });

  const localFlipped = mirrorLayerTransformHorizontally(lt, 'local');
  assert.deepEqual(localFlipped, {
    x: -45,
    y: 20,
    sx: -100,
    sy: 100,
    rotation: -15,
    opacity: 90,
  });
});

test('duplicateSvgaSprite and serializeDecomposedSvga preserve copiedFrames and user dimensions on added layers', () => {
  const movie: SvgaMovie = {
    w: 300,
    h: 300,
    fps: 20,
    n: 2,
    im: {
      wing: new Uint8Array([137, 80, 78, 71]),
    },
    sp: [
      {
        key: 'wing',
        fr: [
          { a: 1, x: 0, y: 0, w: 60, h: 60, t: [1, 0, 0, 1, 20, 100] },
          { a: 0.5, x: 0, y: 0, w: 60, h: 60, t: [1.1, 0, 0, 1.1, 25, 105] },
        ],
      },
    ],
  };

  const dup = duplicateSvgaSprite(movie, 0, { mirrorMode: 'canvas', assetW: 60, assetH: 60 });
  assert.ok(dup);
  assert.equal(dup.newIndex, 1);
  assert.deepEqual(dup.sprite.fr[0].t, [-1, 0, 0, 1, 280, 100]);

  const copied = copySpriteFramesToLayer(movie.sp[0], 60, 60, 2, undefined, {
    targetWidth: 48,
    targetHeight: 48,
    canvasW: 300,
    canvasH: 300,
    referenceFrame: 0,
    preserveTargetBounds: true,
  });
  const bytes = serializeDecomposedSvga(movie, {
    extraLayers: [
      {
        id: 'layer_1',
        assetKey: 'added_star',
        name: 'Star',
        pngBytes: new Uint8Array([137, 80, 78, 71]),
        width: 48,
        height: 48,
        transform: { ...DEFAULT_TRANSFORM, sx: 50, sy: 50, x: 10, y: -10 },
        inFrame: copied.inFrame,
        outFrame: copied.outFrame,
        copiedFrames: copied.frames,
        copiedFromKey: 'wing',
      },
    ],
  });

  const reparsed = parseMovie(bytes);
  assert.equal(reparsed.sp.length, 2);
  const exportedAdded = reparsed.sp.find((s) => s.key === 'added_star');
  assert.ok(exportedAdded);
  assert.equal(exportedAdded.fr.length, 2);
  assert.equal(exportedAdded.fr[0].w, 48);
  assert.equal(exportedAdded.fr[0].h, 48);
  assert.ok(Math.abs(exportedAdded.fr[0].a - 1) < 1e-4);
  assert.ok(Math.abs(exportedAdded.fr[1].a - 0.5) < 1e-4);
  // Scale on frame 0 is 50% (0.5), and on frame 1 is 0.5 * 1.1 = 0.55
  assert.ok(Math.abs(exportedAdded.fr[0].t[0] - 0.5) < 1e-3);
  assert.ok(Math.abs(exportedAdded.fr[1].t[0] - 0.55) < 1e-3);
});

test('computeUnstretchedZoomPatch normalizes uneven sx/sy and applies uniform non-stretching zoom', () => {
  // When sx and sy are uneven (stretched), computeUnstretchedZoomPatch resets sx/sy to 100% (preserving flip sign)
  const stretched = {
    x: 10,
    y: -5,
    sx: -140,
    sy: 85,
    rotation: 0,
    opacity: 100,
  };
  const patch = computeUnstretchedZoomPatch(stretched, 150);
  assert.deepEqual(patch, {
    sx: -100,
    sy: 100,
    zoom: 150,
  });

  // When sx and sy are already equal, only zoom is updated
  const uniform = {
    x: 0,
    y: 0,
    sx: 100,
    sy: 100,
    rotation: 0,
    opacity: 100,
  };
  assert.deepEqual(computeUnstretchedZoomPatch(uniform, 75), { zoom: 75 });
});

test('interpolateLayerTransform and matrix builders apply uniform zoom keyframes without stretching or shifting center', () => {
  const base = {
    x: 20,
    y: -10,
    sx: 100,
    sy: 100,
    zoom: 50,
    rotation: 0,
    opacity: 100,
  };
  const pkf = {
    zoom: {
      0: 50,
      10: 150,
    },
  };

  const t0 = interpolateLayerTransform(base, pkf, 0);
  const t5 = interpolateLayerTransform(base, pkf, 5);
  const t10 = interpolateLayerTransform(base, pkf, 10);

  assert.equal(t0.zoom, 50);
  assert.equal(t5.zoom, 100);
  assert.equal(t10.zoom, 150);

  // Verify matrix at frame 0 (50% zoom) and frame 10 (150% zoom) keeps exact same center and 1:1 aspect ratio
  const mat0 = computeAddedLayerFrameMatrix(120, 80, 500, 500, t0, DEFAULT_TRANSFORM);
  const mat10 = computeAddedLayerFrameMatrix(120, 80, 500, 500, t10, DEFAULT_TRANSFORM);

  assert.equal(mat0[0], 0.5);
  assert.equal(mat0[3], 0.5);
  assert.equal(mat10[0], 1.5);
  assert.equal(mat10[3], 1.5);

  const cx0 = mat0[0] * 60 + mat0[2] * 40 + mat0[4];
  const cy0 = mat0[1] * 60 + mat0[3] * 40 + mat0[5];
  const cx10 = mat10[0] * 60 + mat10[2] * 40 + mat10[4];
  const cy10 = mat10[1] * 60 + mat10[3] * 40 + mat10[5];

  assert.equal(cx0, 270);
  assert.equal(cy0, 240);
  assert.equal(cx10, 270);
  assert.equal(cy10, 240);
});test('serializeDecomposedSvga: serializes extra layers and sprites in exact sequence defined by layerOrder', () => {
  const dummyMovie: SvgaMovie = {
    w: 400,
    h: 400,
    fps: 20,
    n: 5,
    im: {
      img_a: new Uint8Array([1, 2, 3]),
      img_b: new Uint8Array([4, 5, 6]),
    },
    sp: [
      { key: 'img_a', fr: [{ a: 1, x: 0, y: 0, w: 100, h: 100, t: [1, 0, 0, 1, 0, 0] }] },
      { key: 'img_b', fr: [{ a: 1, x: 0, y: 0, w: 100, h: 100, t: [1, 0, 0, 1, 0, 0] }] },
    ],
  };

  const extraShineLayer = {
    id: 'layer_shine_1',
    assetKey: 'shine_asset_1',
    name: 'Shine Layer',
    pngBytes: new Uint8Array([7, 8, 9]),
    width: 100,
    height: 100,
    transform: DEFAULT_TRANSFORM,
    inFrame: 0,
    outFrame: 4,
  };

  // Place shine layer directly above sprite_0 (so order is: sprite_0, layer_shine_1, sprite_1)
  const layerOrder = ['sprite_0', 'layer_shine_1', 'sprite_1'];
  const serialized = serializeDecomposedSvga(dummyMovie, {
    extraLayers: [extraShineLayer],
    layerOrder,
  });

  const parsed = parseMovie(serialized);
  assert.equal(parsed.sp.length, 3);
  assert.equal(parsed.sp[0].key, 'img_a'); // sprite_0
  assert.equal(parsed.sp[1].key, 'shine_asset_1'); // extraShineLayer directly above sprite_0!
  assert.equal(parsed.sp[2].key, 'img_b'); // sprite_1
});
