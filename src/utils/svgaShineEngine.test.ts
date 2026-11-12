import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRectMaskContours,
  generateRingFrameMaskContours,
  traceAlphaContourFromRgba,
  projectWorldContoursToLocalClipPath,
  buildShineKeyframesFromMotionPoints,
  buildClippedShineSvgaFrames,
  interpolateMotionPathPoint,
  computeFullLayerShineSweepAndSize,
  evaluateShineSweepAtFrame,
  buildSlantedSweepBandPolygon,
  clipPolygonWithConvexQuad,
  computeShineBandFeatherAlphaAt,
  buildFeatheredCloneShineSvgaFramesList,
  applyColorAdjustmentsToRgbaBytes,
  DEFAULT_CLONE_COLOR_ADJUSTMENTS,
  ShineLayerConfig,
} from './svgaShineEngine';
import {
  DEFAULT_TRANSFORM,
  computeAddedLayerFrameMatrix,
  serializeDecomposedSvga,
} from './svgaEditorLogic';
import { parseMovie } from './codecs';

test('projectWorldContoursToLocalClipPath: inverse-projects world mask points so world = shineMatrix * local', () => {
  const worldContours = [
    [
      { x: 100, y: 100 },
      { x: 400, y: 100 },
      { x: 400, y: 400 },
      { x: 100, y: 400 },
    ],
  ];

  // Shine layer moved to x = +80, y = -40 on a 500x500 canvas with 300x300 shine bitmap
  const shineLt = {
    ...DEFAULT_TRANSFORM,
    x: 80,
    y: -40,
    sx: 125,
    sy: 125,
    rotation: 0,
  };
  const shineMat = computeAddedLayerFrameMatrix(300, 300, 500, 500, shineLt, DEFAULT_TRANSFORM);
  const clipPath = projectWorldContoursToLocalClipPath(worldContours, shineMat);

  assert.ok(clipPath.startsWith('M '), 'clipPath must start with M');
  assert.ok(clipPath.endsWith('Z'), 'clipPath must end with Z');

  // Parse the 4 projected local coordinates from "M lx0 ly0 L lx1 ly1 L lx2 ly2 L lx3 ly3 Z"
  const matches = [...clipPath.matchAll(/[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)];
  assert.equal(matches.length, 4);

  for (let i = 0; i < 4; i++) {
    const lx = Number(matches[i][1]);
    const ly = Number(matches[i][2]);
    const reconstructedWx = shineMat[0] * lx + shineMat[2] * ly + shineMat[4];
    const reconstructedWy = shineMat[1] * lx + shineMat[3] * ly + shineMat[5];
    assert.ok(
      Math.abs(reconstructedWx - worldContours[0][i].x) < 0.1,
      `Reconstructed X (${reconstructedWx}) must match world X (${worldContours[0][i].x})`
    );
    assert.ok(
      Math.abs(reconstructedWy - worldContours[0][i].y) < 0.1,
      `Reconstructed Y (${reconstructedWy}) must match world Y (${worldContours[0][i].y})`
    );
  }
});

test('generateRingFrameMaskContours & traceAlphaContourFromRgba: detects outer boundary and inner hollow hole for Indian Frame style', () => {
  const ringContours = generateRingFrameMaskContours(250, 250, 180, 180, 0.3, 12);
  assert.equal(ringContours.length, 2, 'Ring mask must have outer contour and inner cutout hole');
  assert.equal(ringContours[0].length, 12);
  assert.equal(ringContours[1].length, 12);

  // Create synthetic 100x100 RGBA buffer with a hollow ring (outer radius 42, inner hole radius 22)
  const W = 100;
  const H = 100;
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dist = Math.hypot(x - 50, y - 50);
      if (dist >= 22 && dist <= 42) {
        const idx = (y * W + x) * 4;
        rgba[idx] = 255;
        rgba[idx + 1] = 215;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 255;
      }
    }
  }

  const traced = traceAlphaContourFromRgba(rgba, W, H, [1, 0, 0, 1, 0, 0], {
    radialRays: 16,
    detectInnerHole: true,
  });
  assert.equal(traced.length, 2, 'Auto-traced hollow frame must include both outer and inner contours');
  assert.equal(traced[0].length, 16);
  assert.ok(traced[1].length >= 12);

  // Verify that a solid badge with a tiny 2px transparent center dot does NOT produce a false inner hole cutout
  const solidBadgeRgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dist = Math.hypot(x - 50, y - 50);
      if (dist >= 2 && dist <= 44) {
        const idx = (y * W + x) * 4;
        solidBadgeRgba[idx] = 255;
        solidBadgeRgba[idx + 3] = 255;
      }
    }
  }
  const solidTraced = traceAlphaContourFromRgba(solidBadgeRgba, W, H, [1, 0, 0, 1, 0, 0], {
    radialRays: 24,
    detectInnerHole: true,
  });
  assert.equal(
    solidTraced.length,
    1,
    'Solid badge with tiny center artifact must NOT cut a false inner polygon hole'
  );
  assert.equal(solidTraced[0].length, 24);

  // Verify smooth Cubic Bezier clipPath output ('C' curves instead of jagged 'L' lines)
  const smoothClip = projectWorldContoursToLocalClipPath(solidTraced, [1, 0, 0, 1, 0, 0], null, {
    smoothCurve: true,
  });
  assert.ok(smoothClip.includes(' C '), 'Smooth contour clipPath must use Cubic Bezier C commands');
});

test('interpolateMotionPathPoint & buildClippedShineSvgaFrames: exports valid SVGA 2.0 clipPath frames', () => {
  const mid = interpolateMotionPathPoint(
    [
      { x: 50, y: 100 },
      { x: 250, y: 100 },
      { x: 450, y: 300 },
    ],
    0.5
  );
  assert.ok(mid.x > 150 && mid.x < 350);

  const config: ShineLayerConfig = {
    enabled: true,
    targetLayerId: 'sprite_0',
    followTargetLayerTransform: true,
    maskMode: 'interactive_points',
    maskContours: generateRectMaskContours(100, 100, 300, 300),
    motionPoints: [
      { x: 60, y: 60 },
      { x: 440, y: 440 },
    ],
    presetId: 'royal_gold',
    colorPrimary: '#fde047',
    colorSecondary: '#ffffff',
    beamAngleDeg: -32,
    beamWidthRatio: 0.28,
    beamSoftness: 0.75,
    shineWidth: 320,
    shineHeight: 320,
    startFrame: 0,
    endFrame: 19,
    loopCount: 1,
    pauseFrames: 0,
    referenceFrame: 0,
  };

  const kfs = buildShineKeyframesFromMotionPoints(config, 20, 500, 500, 100);
  assert.ok(kfs.position);
  assert.deepEqual(kfs.position![0], { x: -190, y: -190 });
  assert.deepEqual(kfs.position![19], { x: 190, y: 190 });

  const shineFrames = buildClippedShineSvgaFrames({
    totalFrames: 20,
    shineWidth: 320,
    shineHeight: 320,
    canvasW: 500,
    canvasH: 500,
    inFrame: 0,
    outFrame: 19,
    baseTransform: DEFAULT_TRANSFORM,
    keyframes: kfs,
    docTransformAtFrame: () => DEFAULT_TRANSFORM,
    config,
  });

  assert.equal(shineFrames.length, 20);
  assert.ok(shineFrames[0].clipPath && shineFrames[0].clipPath.includes('M '));
  assert.ok(shineFrames[10].clipPath && shineFrames[10].clipPath.includes('M '));
  assert.notEqual(
    shineFrames[0].clipPath,
    shineFrames[19].clipPath,
    'Local clipPath must counter-shift as the shine layer moves across the canvas'
  );

  // Round-trip through serializeDecomposedSvga + parseMovie to verify native SVGA 2.0 persistence
  const dummyPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const protoBytes = serializeDecomposedSvga(
    {
      w: 500,
      h: 500,
      fps: 20,
      n: 20,
      im: {},
      sp: [],
    },
    {
      layerKeyframes: { shine_layer_1: kfs },
      extraLayers: [
        {
          id: 'shine_layer_1',
          assetKey: 'shine_royal_gold_1',
          name: '✨ لمعة احترافية',
          pngBytes: dummyPng,
          width: 320,
          height: 320,
          transform: DEFAULT_TRANSFORM,
          inFrame: 0,
          outFrame: 19,
          copiedFrames: shineFrames,
        },
      ],
    }
  );

  const parsed = parseMovie(protoBytes);
  assert.equal(parsed.sp.length, 1);
  assert.equal(parsed.sp[0].key, 'shine_royal_gold_1');
  assert.equal(parsed.sp[0].fr.length, 20);
  assert.equal(parsed.sp[0].fr[0].clipPath, shineFrames[0].clipPath);
  assert.equal(parsed.sp[0].fr[19].clipPath, shineFrames[19].clipPath);

  // Verify that on frame 0, frame 10, and frame 19, applying the exported SVGA frame.t matrix
  // to the exported frame.clipPath vertices reconstructs the exact world contour (100,100)..(400,400)
  for (const fIdx of [0, 10, 19]) {
    const exportedFrame = parsed.sp[0].fr[fIdx];
    const t = exportedFrame.t;
    const matches = [...(exportedFrame.clipPath || '').matchAll(/[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)];
    assert.equal(matches.length, 8);
    const lx0 = Number(matches[0][1]);
    const ly0 = Number(matches[0][2]);
    const wx0 = t[0] * lx0 + t[2] * ly0 + t[4];
    const wy0 = t[1] * lx0 + t[3] * ly0 + t[5];
    assert.ok(Math.abs(wx0 - 100) < 0.25, `Frame ${fIdx} reconstructed wx0=${wx0} should be 100`);
    assert.ok(Math.abs(wy0 - 100) < 0.25, `Frame ${fIdx} reconstructed wy0=${wy0} should be 100`);
  }
});

test('traceAlphaContourFromRgba with Moore-Neighbor: tightly hugs concave banner with top diamond and 100% excludes transparent empty space', () => {
  const W = 250;
  const H = 150;
  const rgba = new Uint8Array(W * H * 4);

  // Horizontal banner ("سيد الثروة") from y=50..90, x=30..220
  for (let y = 50; y <= 90; y++) {
    for (let x = 30; x <= 220; x++) {
      const idx = (y * W + x) * 4;
      rgba[idx] = 218;
      rgba[idx + 1] = 165;
      rgba[idx + 2] = 32;
      rgba[idx + 3] = 255;
    }
  }

  // Top crystal diamond: peak at (125, 20), base resting on the banner top (y=50, x: 105..145)
  for (let y = 20; y <= 50; y++) {
    const span = Math.round((y - 20) * (20 / 30));
    for (let x = 125 - span; x <= 125 + span; x++) {
      const idx = (y * W + x) * 4;
      rgba[idx] = 255;
      rgba[idx + 1] = 255;
      rgba[idx + 2] = 255;
      rgba[idx + 3] = 255;
    }
  }

  // Trace with default Moore-Neighbor algorithm
  const contours = traceAlphaContourFromRgba(rgba, W, H, [1, 0, 0, 1, 0, 0]);
  assert.equal(contours.length, 1, 'Banner must produce a single closed outer contour');
  const poly = contours[0];
  assert.ok(poly.length >= 6, 'Polygon must have sufficient vertices to describe banner + diamond');

  // Point in polygon test helper
  const isInside = (px: number, py: number): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // 1. Transparent empty space above the banner to the left and right of the diamond MUST BE EXCLUDED!
  // In radial ray-marching, (70, 30) and (180, 30) were falsely included because the ray bridged the diamond peak to the banner corner.
  assert.equal(isInside(70, 30), false, 'Empty space (70, 30) above left banner shoulder must NOT be inside mask');
  assert.equal(isInside(180, 30), false, 'Empty space (180, 30) above right banner shoulder must NOT be inside mask');
  assert.equal(isInside(125, 10), false, 'Empty space (125, 10) above diamond peak must NOT be inside mask');

  // 2. Opaque parts of the diamond and banner MUST BE INCLUDED!
  assert.equal(isInside(125, 25), true, 'Inside diamond near peak must be inside mask');
  assert.equal(isInside(125, 70), true, 'Inside banner center ("سيد الثروة") must be inside mask');
  assert.equal(isInside(45, 70), true, 'Inside banner left edge must be inside mask');
  assert.equal(isInside(205, 70), true, 'Inside banner right edge must be inside mask');

  // 3. Test that serializeDecomposedSvga serializes matteKey into the SVGA SpriteEntity message
  const dummyPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const protoBytes = serializeDecomposedSvga(
    {
      w: W,
      h: H,
      fps: 20,
      n: 5,
      im: { banner_asset: dummyPng },
      sp: [
        {
          key: 'banner_asset',
          fr: [{ a: 1, x: 0, y: 0, w: W, h: H, t: [1, 0, 0, 1, 0, 0] }],
        },
      ],
    },
    {
      extraLayers: [
        {
          id: 'shine_layer_1',
          assetKey: 'shine_sweep',
          name: 'Shine',
          pngBytes: dummyPng,
          width: 100,
          height: 100,
          transform: DEFAULT_TRANSFORM,
          inFrame: 0,
          outFrame: 4,
          matteKey: 'banner_asset',
        },
      ],
    }
  );

  const parsed = parseMovie(protoBytes);
  assert.equal(parsed.sp.length, 2);
  assert.equal(parsed.sp[1].key, 'shine_sweep');
  assert.equal(parsed.sp[1].mk, 'banner_asset', 'SVGA exported shine layer must preserve matteKey');
});

test('traceAlphaContourFromRgba: ignores top-left dust specks and cuts out dark-tinted center hole in avatar frames', () => {
  const W = 120;
  const H = 120;
  const rgba = new Uint8Array(W * H * 4);

  // 1. Add an isolated 2x2 dust speck at y=0, x=5 (previously caused Moore tracer to stop on 2x2 speck)
  for (let y = 0; y < 2; y++) {
    for (let x = 5; x < 7; x++) {
      const idx = (y * W + x) * 4;
      rgba[idx] = 255;
      rgba[idx + 1] = 220;
      rgba[idx + 2] = 100;
      rgba[idx + 3] = 255;
    }
  }

  // 2. Draw a golden ring frame centered at (60, 60), outer R = 48, inner hole R = 24,
  // with a dark green radar tint inside the center hole (r=12, g=42, b=24, a=170)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dist = Math.hypot(x - 60, y - 60);
      const idx = (y * W + x) * 4;
      if (dist >= 24 && dist <= 48) {
        rgba[idx] = 255;
        rgba[idx + 1] = 205;
        rgba[idx + 2] = 45;
        rgba[idx + 3] = 255;
      } else if (dist < 24) {
        rgba[idx] = 12;
        rgba[idx + 1] = 42;
        rgba[idx + 2] = 24;
        rgba[idx + 3] = 170;
      }
    }
  }

  const contours = traceAlphaContourFromRgba(rgba, W, H, [1, 0, 0, 1, 0, 0], {
    alphaThreshold: 45,
    detectInnerHole: true,
    contourMethod: 'moore',
  });

  assert.equal(
    contours.length,
    2,
    'Must trace the main golden ring outer contour AND cut out the dark-tinted inner hole'
  );
  assert.ok(contours[0].length >= 8, 'Outer contour must be the main ring, not the 2x2 dust speck');
  assert.ok(contours[1].length >= 8, 'Inner hole contour must be smooth and well-sampled');
});

test('traceAlphaContourFromRgba: wide horizontal VIP ID banner (512x115) with opaque dark charcoal interior does NOT get a false circular hole', () => {
  const W = 512;
  const H = 115;
  const rgba = new Uint8Array(W * H * 4);

  // Draw ornate gold border (outer 12px) and opaque dark charcoal center plate (r=42, g=40, b=38, a=255)
  for (let y = 8; y < H - 8; y++) {
    for (let x = 10; x < W - 10; x++) {
      const idx = (y * W + x) * 4;
      const isBorder = y < 22 || y > H - 22 || x < 140 || x > W - 50;
      if (isBorder) {
        rgba[idx] = 250;
        rgba[idx + 1] = 204;
        rgba[idx + 2] = 21;
        rgba[idx + 3] = 255;
      } else {
        rgba[idx] = 42;
        rgba[idx + 1] = 40;
        rgba[idx + 2] = 38;
        rgba[idx + 3] = 255;
      }
    }
  }

  const contours = traceAlphaContourFromRgba(rgba, W, H, [1, 0, 0, 1, 0, 0], {
    detectInnerHole: true,
    contourMethod: 'moore',
  });

  assert.equal(
    contours.length,
    1,
    'Wide horizontal VIP ID banner with dark interior must produce 1 outer contour and 0 false inner holes'
  );
  assert.ok(contours[0].length >= 4 && contours[0].length <= 48);
});

test('computeFullLayerShineSweepAndSize: scales shine dimensions and sweep path from start to end even on large layers', () => {
  // Large 1000x1000 layer
  const largeBounds = {
    minX: 100,
    minY: 50,
    maxX: 1100,
    maxY: 1050,
    cx: 600,
    cy: 550,
  };
  const res = computeFullLayerShineSweepAndSize(largeBounds, 'diag_tl_br');
  const diag = Math.hypot(1000, 1000);
  assert.ok(
    res.shineWidth >= diag * 1.5 && res.shineWidth <= 2200,
    `Expected shineWidth (${res.shineWidth}) to exceed 1.5x layer diagonal (${diag.toFixed(1)})`
  );
  assert.equal(res.shineWidth, res.shineHeight);
  assert.ok(
    res.motionPoints[0].x < largeBounds.minX && res.motionPoints[0].y < largeBounds.minY,
    'Sweep start point must begin before the top-left corner of the large layer'
  );
  assert.ok(
    res.motionPoints[res.motionPoints.length - 1].x > largeBounds.maxX &&
      res.motionPoints[res.motionPoints.length - 1].y > largeBounds.maxY,
    'Sweep end point must finish past the bottom-right corner of the large layer'
  );
});

test('System 2 (layer_color_clone): applyColorAdjustmentsToRgbaBytes, polygon clipping, and SVGA 2.0 clipPath export', () => {
  // 1. Test applyColorAdjustmentsToRgbaBytes (mutates RGBA buffer in-place)
  const origRgba = new Uint8ClampedArray([
    160, 110, 40, 255, // warm bronze pixel
    0, 0, 0, 0,        // transparent pixel
  ]);

  const adjustedGold = new Uint8ClampedArray(origRgba);
  applyColorAdjustmentsToRgbaBytes(adjustedGold, DEFAULT_CLONE_COLOR_ADJUSTMENTS);
  assert.ok(adjustedGold[0] > origRgba[0], 'Bright royal gold preset must increase R luminance');
  assert.ok(adjustedGold[1] > origRgba[1], 'Bright royal gold preset must increase G luminance');
  assert.equal(adjustedGold[3], 255, 'Opaque alpha must remain 255');
  assert.equal(adjustedGold[7], 0, 'Transparent pixel alpha must remain 0');

  // Preset: original_custom with neutral sliders preserves original RGB 100%
  const preserved = new Uint8ClampedArray(origRgba);
  applyColorAdjustmentsToRgbaBytes(preserved, {
    presetId: 'original_custom',
    hueRotateDeg: 0,
    brightnessPct: 100,
    saturationPct: 100,
    contrastPct: 100,
    tintColor: '#ffffff',
    tintStrengthPct: 0,
  });
  assert.deepEqual([...preserved], [...origRgba], 'original_custom with neutral sliders must preserve original pixels');

  // 2. Test buildSlantedSweepBandPolygon & clipPolygonWithConvexQuad (halfWidth = 60 -> band 190..310)
  const bandQuad = buildSlantedSweepBandPolygon(250, 250, 0, 60, 600);
  assert.equal(bandQuad.length, 4);
  const maskBox = [
    { x: 100, y: 100 },
    { x: 400, y: 100 },
    { x: 400, y: 400 },
    { x: 100, y: 400 },
  ];
  const clipped = clipPolygonWithConvexQuad(maskBox, bandQuad);
  assert.equal(clipped.length, 4);
  for (const pt of clipped) {
    assert.ok(pt.x >= 189.9 && pt.x <= 310.1, `Clipped X (${pt.x}) must lie inside vertical band 190..310`);
    assert.ok(pt.y >= 99.9 && pt.y <= 400.1, `Clipped Y (${pt.y}) must lie inside maskBox 100..400`);
  }

  // 3. Test buildShineKeyframesFromMotionPoints & buildClippedShineSvgaFrames in layer_color_clone mode
  const cloneConfig: ShineLayerConfig = {
    enabled: true,
    shineSystemMode: 'layer_color_clone',
    cloneAnimStyle: 'sweep_reveal',
    colorAdjustments: DEFAULT_CLONE_COLOR_ADJUSTMENTS,
    targetLayerId: 'sprite_0',
    followTargetLayerTransform: true,
    maskMode: 'interactive_points',
    maskContours: [maskBox],
    motionPoints: [
      { x: 120, y: 250 },
      { x: 380, y: 250 },
    ],
    presetId: 'royal_gold',
    colorPrimary: '#fde047',
    colorSecondary: '#ffffff',
    beamAngleDeg: 0,
    beamWidthRatio: 0.3,
    beamSoftness: 0.75,
    shineWidth: 300,
    shineHeight: 300,
    startFrame: 0,
    endFrame: 19,
    loopCount: 1,
    pauseFrames: 0,
    referenceFrame: 0,
  };

  const sweepMid = evaluateShineSweepAtFrame(cloneConfig, 10, 20, 500, 500);
  assert.equal(sweepMid.active, true);
  assert.ok(sweepMid.x > 200 && sweepMid.x < 300);

  const cloneKfs = buildShineKeyframesFromMotionPoints(cloneConfig, 20, 500, 500, 100);
  assert.equal(
    cloneKfs.position,
    undefined,
    'In layer_color_clone mode, the cloned layer stays aligned with the base layer (no position keyframes)'
  );
  assert.ok(cloneKfs.opacity, 'Opacity keyframes must be generated for clone shine');

  const cloneSvgaFrames = buildClippedShineSvgaFrames({
    totalFrames: 20,
    shineWidth: 300,
    shineHeight: 300,
    canvasW: 500,
    canvasH: 500,
    inFrame: 0,
    outFrame: 19,
    baseTransform: DEFAULT_TRANSFORM,
    keyframes: cloneKfs,
    docTransformAtFrame: () => DEFAULT_TRANSFORM,
    config: cloneConfig,
  });

  assert.equal(cloneSvgaFrames.length, 20);
  assert.ok(cloneSvgaFrames[5].clipPath && cloneSvgaFrames[5].clipPath.includes('M '));
  assert.ok(cloneSvgaFrames[14].clipPath && cloneSvgaFrames[14].clipPath.includes('M '));
  assert.notEqual(
    cloneSvgaFrames[5].clipPath,
    cloneSvgaFrames[14].clipPath,
    'In sweep_reveal mode, the exported SVGA clipPath must sweep across the stationary color-cloned layer'
  );

  // 4. Test computeShineBandFeatherAlphaAt & buildFeatheredCloneShineSvgaFramesList (Soft Feathered Edges in SVGA Export)
  assert.equal(computeShineBandFeatherAlphaAt(0, 0.92), 1);
  assert.equal(computeShineBandFeatherAlphaAt(1, 0.92), 0);
  const midFeather = computeShineBandFeatherAlphaAt(0.5, 0.92);
  assert.ok(midFeather > 0.3 && midFeather < 0.7, `Mid feather alpha (${midFeather}) must smoothly taper`);

  const featheredSlices = buildFeatheredCloneShineSvgaFramesList({
    totalFrames: 20,
    shineWidth: 300,
    shineHeight: 300,
    canvasW: 500,
    canvasH: 500,
    inFrame: 0,
    outFrame: 19,
    baseTransform: { ...DEFAULT_TRANSFORM, opacity: 90 },
    keyframes: { opacity: { 0: 90 } },
    docTransformAtFrame: () => DEFAULT_TRANSFORM,
    config: {
      ...cloneConfig,
      beamSoftness: 0.92,
      shineOpacity: 90,
    },
  });

  assert.equal(featheredSlices.length, 14, 'High softness (0.92) must generate 14 concentric feathered slices');
  assert.ok(
    featheredSlices[0][10].a > 0 && featheredSlices[0][10].a < 0.05,
    `Outermost slice alpha (${featheredSlices[0][10].a}) must start very transparent (no sharp edge)`
  );

  // Verify source-over composition of all 14 slices at frame 10 equals exact target opacity (0.90)
  let compAlpha = 0;
  for (let s = 0; s < featheredSlices.length; s++) {
    const a = featheredSlices[s][10].a;
    compAlpha = compAlpha + a * (1 - compAlpha);
  }
  assert.ok(
    Math.abs(compAlpha - 0.9) < 0.005,
    `Combined source-over alpha of all 14 slices (${compAlpha}) must equal 0.90`
  );

  // Verify serializeDecomposedSvga stores the PNG only once in movie.im while emitting all 14 feathered sprites in order
  const dummyPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const protoBytes = serializeDecomposedSvga(
    {
      w: 500,
      h: 500,
      fps: 20,
      n: 20,
      im: {},
      sp: [],
    },
    {
      layerOrder: ['clone_shine_1'],
      extraLayers: featheredSlices.map((sliceFrames, sIdx) => ({
        id: sIdx === 0 ? 'clone_shine_1' : `clone_shine_1__feather_${sIdx}`,
        parentLayerId: 'clone_shine_1',
        assetKey: 'shared_clone_asset',
        name: 'Clone Shine',
        pngBytes: dummyPng,
        width: 300,
        height: 300,
        transform: { ...DEFAULT_TRANSFORM, opacity: 90 },
        inFrame: 0,
        outFrame: 19,
        copiedFrames: sliceFrames,
        ignoreLayerOpacity: true,
      })),
    }
  );

  const parsed = parseMovie(protoBytes);
  assert.equal(Object.keys(parsed.im).length, 1, 'All 14 feathered slices must share a single PNG in movie.im');
  assert.equal(parsed.sp.length, 14, 'All 14 feathered slices must be emitted into movie.sp');
  assert.ok(Math.abs(parsed.sp[0].fr[10].a - featheredSlices[0][10].a) < 0.001);
});





