import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProjectComposerState,
  DEFAULT_LAYER_TRANSFORM,
  moveOverlayLayerUp,
  moveOverlayLayerDown,
  moveOverlayLayerToTop,
  moveOverlayLayerToBottom,
  getUnifiedVisualLayerStack,
  composeDecomposedSvgaMovie,
  hasAnimatedMotion,
  isDefaultLayerTransform,
  clampTransformValues,
  interpolateTransformAtFrame,
} from './projectComposer.ts';

test('moveOverlayLayerUp promotes top below layer to above main project', () => {
  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'layer1',
    directDragEnabled: true,
    overlays: [
      {
        id: 'layer1',
        name: 'Layer 1',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'below',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const next = moveOverlayLayerUp(state, 'layer1');
  assert.equal(next.overlays[0].zOrder, 'above');
});

test('moveOverlayLayerDown demotes lowest above layer to below main project', () => {
  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'layer1',
    directDragEnabled: true,
    overlays: [
      {
        id: 'layer1',
        name: 'Layer 1',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'above',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const next = moveOverlayLayerDown(state, 'layer1');
  assert.equal(next.overlays[0].zOrder, 'below');
});

test('moveOverlayLayerToTop & moveOverlayLayerToBottom reorders stack correctly', () => {
  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'layer1',
    directDragEnabled: true,
    overlays: [
      {
        id: 'l1',
        name: 'L1',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'below',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
      {
        id: 'l2',
        name: 'L2',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'above',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const topState = moveOverlayLayerToTop(state, 'l1');
  assert.equal(topState.overlays[1].id, 'l1');
  assert.equal(topState.overlays[1].zOrder, 'above');

  const bottomState = moveOverlayLayerToBottom(state, 'l2');
  assert.equal(bottomState.overlays[0].id, 'l2');
  assert.equal(bottomState.overlays[0].zOrder, 'below');
});

test('getUnifiedVisualLayerStack lists items in visual rendering sequence from top to bottom', () => {
  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'primary',
    directDragEnabled: true,
    overlays: [
      {
        id: 'under',
        name: 'Underlay Layer',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'below',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
      {
        id: 'over',
        name: 'Overlay Layer',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'above',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const stack = getUnifiedVisualLayerStack(state, 'Primary Movie');
  assert.equal(stack.length, 3);
  assert.equal(stack[0].id, 'over'); // Topmost layer
  assert.equal(stack[1].id, 'primary'); // Middle primary project
  assert.equal(stack[2].id, 'under'); // Bottommost layer
});

test('composeDecomposedSvgaMovie orders 4-tier maskSprites cleanly around underlay, primary gift, and added above frame overlays', () => {
  const primaryMovie = {
    w: 400,
    h: 400,
    fps: 24,
    n: 2,
    im: { main_gift: new Uint8Array([1, 2, 3]) },
    sp: [
      {
        key: 'main_gift',
        fr: [
          { a: 1, x: 0, y: 0, w: 400, h: 400, t: [1, 0, 0, 1, 0, 0] },
          { a: 1, x: 0, y: 0, w: 400, h: 400, t: [1, 0, 0, 1, 0, 0] },
        ],
      },
    ],
  };

  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'frame_top',
    directDragEnabled: true,
    overlays: [
      {
        id: 'under_bg',
        name: 'Underlay Frame',
        format: 'PNG',
        width: 400,
        height: 400,
        fps: 24,
        frames: 1,
        duration: 1,
        zOrder: 'below',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
      {
        id: 'frame_top',
        name: 'Top Added Frame',
        format: 'PNG',
        width: 400,
        height: 400,
        fps: 24,
        frames: 1,
        duration: 1,
        zOrder: 'above',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const overlayRenderedFrames = new Map<string, { width: number; height: number; frames: Uint8Array[] }>([
    ['under_bg', { width: 400, height: 400, frames: [new Uint8Array([10])] }],
    ['frame_top', { width: 400, height: 400, frames: [new Uint8Array([11])] }],
  ]);

  const out = composeDecomposedSvgaMovie(primaryMovie, state, {
    targetW: 400,
    targetH: 400,
    targetFps: 24,
    globalScalePercent: 100,
    globalMirror: 'none',
    overlayRenderedFrames,
    maskSprites: [
      { id: 'all_back', x: 10, y: 10, w: 50, h: 50, z: -2, zLayer: 'belowOverlays', pngBytes: new Uint8Array([20]) },
      { id: 'behind_gift', x: 10, y: 10, w: 50, h: 50, z: -1, zLayer: 'behindPrimary', pngBytes: new Uint8Array([21]) },
      { id: 'behind_frame', x: 10, y: 10, w: 50, h: 50, z: 0, zLayer: 'abovePrimary', pngBytes: new Uint8Array([22]) },
      { id: 'all_front', x: 10, y: 10, w: 50, h: 50, z: 1, zLayer: 'aboveOverlays', pngBytes: new Uint8Array([23]) },
    ],
  });

  const keys = out.sp.map((s: any) => s.key);
  assert.deepEqual(keys, [
    'vapmask_all_back',
    'ov_under_bg_f0',
    'vapmask_behind_gift',
    'main_gift',
    'vapmask_behind_frame',
    'ov_frame_top_f0',
    'vapmask_all_front',
  ]);
});

test('composeDecomposedSvgaMovie preserves clipPath on maskSprites and expands static primary to match animated SVGA overlay length', () => {
  const staticPrimaryMovie = {
    w: 400,
    h: 400,
    fps: 24,
    n: 1,
    im: { bg_img: new Uint8Array([1, 2, 3]) },
    sp: [
      {
        key: 'bg_img',
        fr: [{ a: 1, x: 0, y: 0, w: 400, h: 400, t: [1, 0, 0, 1, 0, 0] }],
      },
    ],
  };

  const animOverlayMovie = {
    w: 400,
    h: 400,
    fps: 24,
    n: 5,
    im: { rose_frame: new Uint8Array([9, 9, 9]) },
    sp: [
      {
        key: 'rose_frame',
        fr: Array.from({ length: 5 }, (_, idx) => ({
          a: 1,
          x: idx,
          y: 0,
          w: 400,
          h: 400,
          t: [1, 0, 0, 1, 0, 0],
        })),
      },
    ],
  };

  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'svga_frame',
    directDragEnabled: true,
    overlays: [
      {
        id: 'svga_frame',
        name: 'Rose Frame SVGA',
        format: 'SVGA',
        width: 400,
        height: 400,
        fps: 24,
        frames: 5,
        duration: 5 / 24,
        zOrder: 'above',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const clipPath = 'M 50 0 C 77.61 0 100 22.39 100 50 Z';
  const out = composeDecomposedSvgaMovie(staticPrimaryMovie, state, {
    targetW: 400,
    targetH: 400,
    targetFps: 24,
    globalScalePercent: 100,
    globalMirror: 'none',
    overlayMovies: new Map([['svga_frame', animOverlayMovie]]),
    maskSprites: [
      {
        id: '0_avatar1',
        x: 150,
        y: 150,
        w: 100,
        h: 100,
        z: -1,
        zLayer: 'behindPrimary',
        clipPath,
        pngBytes: new Uint8Array([7]),
      },
    ],
  });

  assert.equal(out.n, 5, 'Static primary should expand to animated overlay frame count (5)');
  const maskIdx = out.sp.findIndex((s: any) => s.key === 'vapmask_0_avatar1');
  const frameIdx = out.sp.findIndex((s: any) => String(s.key).includes('rose_frame'));
  assert.ok(maskIdx >= 0 && frameIdx > maskIdx, 'Mask sprite must stay strictly behind added SVGA frame');
  assert.equal(out.sp[maskIdx].fr.length, 5);
  assert.equal(out.sp[maskIdx].fr[0].clipPath, clipPath, 'clipPath must persist on mask frames for SVGA replacement');
});

test('hasAnimatedMotion, isDefaultLayerTransform, and clampTransformValues preserve presets and waypoints', () => {
  const withPreset = clampTransformValues(
    {
      ...DEFAULT_LAYER_TRANSFORM,
      animationPreset: 'flyInLeft',
      startFrame: 2,
      endFrame: 20,
      linkFrameAndLayer: true,
    },
    420,
    420
  );
  assert.equal(hasAnimatedMotion(withPreset), true);
  assert.equal(isDefaultLayerTransform(withPreset), false);
  assert.equal(withPreset.animationPreset, 'flyInLeft');
  assert.equal(withPreset.startFrame, 2);
  assert.equal(withPreset.endFrame, 20);
  assert.equal(withPreset.linkFrameAndLayer, true);

  const withWaypoints = clampTransformValues(
    {
      ...DEFAULT_LAYER_TRANSFORM,
      motionWaypoints: [
        { frame: 0, offsetX: -100, offsetY: 0, scale: 50, rotation: -30, opacity: 20 },
        { frame: 10, offsetX: 80, offsetY: -40, scale: 120, rotation: 360, opacity: 100 },
      ],
    },
    420,
    420
  );
  assert.equal(hasAnimatedMotion(withWaypoints), true);
  assert.equal(isDefaultLayerTransform(withWaypoints), false);
  assert.equal(withWaypoints.motionWaypoints?.length, 2);
  assert.equal(withWaypoints.motionWaypoints?.[1].rotation, 360);

  const mid = interpolateTransformAtFrame(withWaypoints, 5, 15, 420, 420);
  assert.equal(Math.round(mid.offsetX), -10);
  assert.equal(Math.round(mid.offsetY), -20);
  assert.equal(Math.round(mid.opacity), 60);
});

test('composeDecomposedSvgaMovie animates primary and linked overlay per frame when preset or waypoints are set', () => {
  const primaryMovie = {
    w: 400,
    h: 400,
    fps: 15,
    n: 11,
    im: { main_gift: new Uint8Array([1, 2, 3]) },
    sp: [
      {
        key: 'main_gift',
        fr: Array.from({ length: 11 }, () => ({
          a: 1,
          x: 0,
          y: 0,
          w: 400,
          h: 400,
          t: [1, 0, 0, 1, 0, 0],
        })),
      },
    ],
  };

  const state: ProjectComposerState = {
    primaryTransform: {
      ...DEFAULT_LAYER_TRANSFORM,
      animationPreset: 'zoomIn',
      startFrame: 0,
      endFrame: 10,
      linkFrameAndLayer: true,
    },
    activeTargetId: 'primary',
    directDragEnabled: true,
    overlays: [
      {
        id: 'badge',
        name: 'Badge',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 15,
        frames: 1,
        duration: 1,
        zOrder: 'above',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const out = composeDecomposedSvgaMovie(primaryMovie, state, {
    targetW: 400,
    targetH: 400,
    targetFps: 15,
    overlayRenderedFrames: new Map([['badge', { width: 100, height: 100, frames: [new Uint8Array([8])] }]]),
  });

  const mainSp = out.sp.find((s: any) => s.key === 'main_gift');
  const badgeSp = out.sp.find((s: any) => s.key === 'ov_badge_f0');
  assert.ok(mainSp && badgeSp);
  assert.equal(mainSp.fr[0].a, 0, 'At frame 0 zoomIn starts at opacity 0');
  assert.ok(mainSp.fr[5].a > 0.3 && mainSp.fr[5].a < 0.7, 'At midpoint frame 5 opacity interpolates smoothly');
  assert.equal(mainSp.fr[10].a, 1, 'At endFrame 10 opacity reaches 1');
  assert.ok(mainSp.fr[5].t[0] < mainSp.fr[10].t[0], 'Scale increases over frames');
  assert.equal(badgeSp.fr[0].a, 0, 'Linked overlay follows primary animation opacity at frame 0');
  assert.equal(badgeSp.fr[10].a, 1, 'Linked overlay reaches full opacity at frame 10');
});

test('visibilityEnabled hides layers outside [visibilityStartFrame, visibilityEndFrame] and aligns entrance timing', () => {
  const winTransform = clampTransformValues(
    {
      ...DEFAULT_LAYER_TRANSFORM,
      animationPreset: 'flyInRight',
      startFrame: 0,
      endFrame: 10,
      visibilityEnabled: true,
      visibilityStartFrame: 5,
      visibilityEndFrame: 20,
    },
    400,
    400
  );
  assert.equal(hasAnimatedMotion(winTransform), true);

  const f2 = interpolateTransformAtFrame(winTransform, 2, 30, 400, 400);
  assert.equal(f2.visible, false, 'Must be hidden before visibilityStartFrame');
  assert.equal(f2.opacity, 0);

  const f5 = interpolateTransformAtFrame(winTransform, 5, 30, 400, 400);
  assert.equal(f5.visible, true, 'Appears at visibilityStartFrame');
  assert.equal(f5.opacity, 0, 'flyInRight begins at frame 5 (effStartF = 5) with opacity 0');
  assert.ok(f5.offsetX > 300, 'flyInRight starts off-screen right');

  const f15 = interpolateTransformAtFrame(winTransform, 15, 30, 400, 400);
  assert.equal(f15.visible, true);
  assert.equal(f15.opacity, 100);
  assert.equal(Math.round(f15.offsetX), 0);

  const f22 = interpolateTransformAtFrame(winTransform, 22, 30, 400, 400);
  assert.equal(f22.visible, false, 'Hidden after visibilityEndFrame');
  assert.equal(f22.opacity, 0);
});

test('new professional animation presets produce expected spatial/scale/rotation motion curves', () => {
  const bounce = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: 'elasticBounce' as const, startFrame: 0, endFrame: 20 };
  assert.equal(interpolateTransformAtFrame(bounce, 0, 30, 400, 400).opacity, 0);
  assert.ok(interpolateTransformAtFrame(bounce, 20, 30, 400, 400).scale >= 99);

  const drop = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: 'dropFromTop' as const, startFrame: 0, endFrame: 15 };
  assert.ok(interpolateTransformAtFrame(drop, 0, 30, 400, 400).offsetY < -200);
  assert.equal(Math.round(interpolateTransformAtFrame(drop, 15, 30, 400, 400).offsetY), 0);

  const hb = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: 'heartbeatPulse' as const, startFrame: 0, endFrame: 20 };
  assert.ok(interpolateTransformAtFrame(hb, 5, 30, 400, 400).scale > 100);

  const hover = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: 'floatingHover' as const, startFrame: 0, endFrame: 20 };
  const h1 = interpolateTransformAtFrame(hover, 6, 30, 400, 400).offsetY;
  const h2 = interpolateTransformAtFrame(hover, 18, 30, 400, 400).offsetY;
  assert.notEqual(Math.round(h1 * 10), Math.round(h2 * 10));

  for (const preset of ['spiralZoom', 'flip3DReveal', 'swingPendulum', 'shakeImpact', 'glowFlashReveal'] as const) {
    const tr = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: preset, startFrame: 0, endFrame: 20 };
    const endRes = interpolateTransformAtFrame(tr, 20, 30, 400, 400);
    assert.equal(endRes.opacity, 100, `${preset} settles to opacity 100 at endFrame`);
    assert.equal(Math.round(endRes.scale), 100, `${preset} settles to scale 100 at endFrame`);
  }
});

test('composeDecomposedSvgaMovie animates maskSprites with motionTransform and visibilityEnabled window', () => {
  const primaryMovie = {
    w: 400,
    h: 400,
    fps: 15,
    n: 12,
    im: { bg: new Uint8Array([1, 2]) },
    sp: [
      {
        key: 'bg',
        fr: Array.from({ length: 12 }, () => ({ a: 1, x: 0, y: 0, w: 400, h: 400, t: [1, 0, 0, 1, 0, 0] })),
      },
    ],
  };

  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'primary',
    directDragEnabled: true,
    overlays: [],
  };

  const out = composeDecomposedSvgaMovie(primaryMovie, state, {
    targetW: 400,
    targetH: 400,
    targetFps: 15,
    maskSprites: [
      {
        id: '0_avatar1',
        x: 150,
        y: 150,
        w: 100,
        h: 100,
        z: 1,
        zLayer: 'abovePrimary',
        pngBytes: new Uint8Array([7]),
        motionTransform: {
          ...DEFAULT_LAYER_TRANSFORM,
          animationPreset: 'zoomIn',
          startFrame: 0,
          endFrame: 8,
          visibilityEnabled: true,
          visibilityStartFrame: 3,
          visibilityEndFrame: 9,
        },
      },
    ],
  });

  const maskSp = out.sp.find((s: any) => s.key === 'vapmask_0_avatar1');
  assert.ok(maskSp);
  assert.equal(maskSp.fr.length, 12);
  assert.equal(maskSp.fr[1].a, 0, 'Mask hidden before visibilityStartFrame');
  assert.ok(maskSp.fr[6].a > 0.2, 'Mask visible and animating mid-window');
  assert.equal(maskSp.fr[11].a, 0, 'Mask hidden after visibilityEndFrame');
});

test('directional left/right sway, wind breeze, glide passes, and new professional presets animate smoothly', () => {
  const flyL = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: 'flyInLeft' as const, startFrame: 0, endFrame: 20 };
  const flyR = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: 'flyInRight' as const, startFrame: 0, endFrame: 20 };
  assert.ok(interpolateTransformAtFrame(flyL, 0, 30, 400, 400).offsetX < -300, 'flyInLeft begins off-screen left');
  assert.ok(interpolateTransformAtFrame(flyR, 0, 30, 400, 400).offsetX > 300, 'flyInRight begins off-screen right');
  assert.equal(Math.round(interpolateTransformAtFrame(flyL, 20, 30, 400, 400).offsetX), 0);
  assert.equal(Math.round(interpolateTransformAtFrame(flyR, 20, 30, 400, 400).offsetX), 0);

  const sway = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: 'swayRightLeft' as const, startFrame: 0, endFrame: 30 };
  const swayPos = interpolateTransformAtFrame(sway, 6, 40, 400, 400).offsetX;
  const swayNeg = interpolateTransformAtFrame(sway, 19, 40, 400, 400).offsetX;
  assert.ok(swayPos > 15 && swayNeg < -15, 'swayRightLeft oscillates smoothly both right and left');

  const wind = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: 'windBreeze' as const, startFrame: 0, endFrame: 30 };
  const windF6 = interpolateTransformAtFrame(wind, 6, 40, 400, 400);
  const windF20 = interpolateTransformAtFrame(wind, 20, 40, 400, 400);
  assert.notEqual(Math.round(windF6.offsetX), Math.round(windF20.offsetX));
  assert.notEqual(Math.round(windF6.rotation * 10), Math.round(windF20.rotation * 10));

  const passRL = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: 'glideRightToLeft' as const, startFrame: 0, endFrame: 20 };
  assert.ok(interpolateTransformAtFrame(passRL, 2, 30, 400, 400).offsetX > 0);
  assert.ok(interpolateTransformAtFrame(passRL, 18, 30, 400, 400).offsetX < 0);
  assert.equal(interpolateTransformAtFrame(passRL, 20, 30, 400, 400).visible, false);

  const passLR = { ...DEFAULT_LAYER_TRANSFORM, animationPreset: 'glideLeftToRight' as const, startFrame: 0, endFrame: 20 };
  assert.ok(interpolateTransformAtFrame(passLR, 2, 30, 400, 400).offsetX < 0);
  assert.ok(interpolateTransformAtFrame(passLR, 18, 30, 400, 400).offsetX > 0);

  for (const preset of ['slideBounceRightLeft', 'riseFromBottom', 'royalEntrance', 'rubberSnap'] as const) {
    const res = interpolateTransformAtFrame(
      { ...DEFAULT_LAYER_TRANSFORM, animationPreset: preset, startFrame: 0, endFrame: 20 },
      20,
      30,
      400,
      400
    );
    assert.equal(res.opacity, 100);
    assert.equal(Math.round(res.scale), 100);
    assert.equal(Math.round(res.offsetX), 0);
    assert.equal(Math.round(res.offsetY), 0);
  }

  for (const loopPreset of ['breathingAura', 'orbitFloat', 'neonStrobe'] as const) {
    const a = interpolateTransformAtFrame(
      { ...DEFAULT_LAYER_TRANSFORM, animationPreset: loopPreset, startFrame: 0, endFrame: 30 },
      4,
      40,
      400,
      400
    );
    const b = interpolateTransformAtFrame(
      { ...DEFAULT_LAYER_TRANSFORM, animationPreset: loopPreset, startFrame: 0, endFrame: 30 },
      11,
      40,
      400,
      400
    );
    assert.ok(a.opacity > 0 && b.opacity > 0);
    assert.notEqual(
      `${a.offsetX.toFixed(1)},${a.scale.toFixed(1)},${a.opacity.toFixed(1)}`,
      `${b.offsetX.toFixed(1)},${b.scale.toFixed(1)},${b.opacity.toFixed(1)}`
    );
  }
});





