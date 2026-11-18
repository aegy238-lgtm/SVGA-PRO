import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attenuateMaskRgbaByForegroundAlpha,
  buildNextSlotId,
  buildPresetWhiteMaskRgba,
  buildSvgClipPathForMaskPreset,
  buildVapDynamicMetadataJson,
  composerLayerBoxToMaskFrame,
  computeDraggedOrResizedMaskFrame,
  createEmptySessionMaskVault,
  hitTestMaskSlotsOnStage,
  makeCustomVapSlot,
  parseHexColorRgb,
  planVapMaskAtlasLayout,
  reconcileSessionMasksOntoSource,
  reorderMaskSlotsWithBands,
  reorderMaskSlotsZ,
  resolveMaskDepthBand,
  rgbaToWhiteOnBlackMaskBuffer,
  setSlotDepthBand,
  sortSlotsByZ,
} from './vapDynamicMaskPacking';
import {
  detectVapYyevaSequentialSync,
  metaFromAnyObject,
} from './vapYyevaDetection';

function rectsOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  return (
    a[0] < b[0] + b[2] &&
    a[0] + a[2] > b[0] &&
    a[1] < b[1] + b[3] &&
    a[1] + a[3] > b[1]
  );
}

function makeMp4Box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  return out;
}

test('planVapMaskAtlasLayout packs multiple dynamic masks cleanly below aFrame with zero overlaps', () => {
  const slot1 = makeCustomVapSlot({
    srcId: '0',
    srcType: 'img',
    srcTag: 'avatar1',
    x: 468,
    y: 52,
    w: 187,
    h: 194,
    shapePreset: 'shield',
  });
  const slot2 = makeCustomVapSlot({
    srcId: '1',
    srcType: 'txt',
    srcTag: 'textName1',
    x: 335,
    y: 358,
    w: 454,
    h: 62,
    shapePreset: 'roundedRect',
  });

  const plan = planVapMaskAtlasLayout({
    format: 'vap',
    W: 1125,
    H: 2000,
    srcW: 1125,
    srcH: 2000,
    slots: [slot1, slot2],
  });

  assert.equal(plan.W, 1126); // evenCeil(1125)
  assert.equal(plan.H, 2000);
  assert.equal(plan.VW % 16, 0);
  assert.equal(plan.VH % 16, 0);
  assert.equal(plan.packedSlots.length, 2);

  const [m1, m2] = plan.packedSlots.map((p) => p.mFrame);
  assert.ok(!rectsOverlap(plan.rgbFrame, plan.aFrame), 'RGB and Alpha frames must not overlap');
  assert.ok(!rectsOverlap(plan.rgbFrame, m1), 'RGB and m1 must not overlap');
  assert.ok(!rectsOverlap(plan.aFrame, m1), 'Alpha and m1 must not overlap');
  assert.ok(!rectsOverlap(plan.rgbFrame, m2), 'RGB and m2 must not overlap');
  assert.ok(!rectsOverlap(plan.aFrame, m2), 'Alpha and m2 must not overlap');
  assert.ok(!rectsOverlap(m1, m2), 'm1 and m2 must not overlap');

  for (const m of [m1, m2]) {
    assert.ok(m[0] + m[2] <= plan.VW, 'mFrame X bounds within VW');
    assert.ok(m[1] + m[3] <= plan.VH, 'mFrame Y bounds within VH');
    assert.equal(m[0] % 2, 0, 'mx is even');
    assert.equal(m[1] % 2, 0, 'my is even');
    assert.equal(m[2] % 2, 0, 'mw is even');
    assert.equal(m[3] % 2, 0, 'mh is even');
  }
});

test('planVapMaskAtlasLayout expands VH safely when SVGA dimensions are compact (300x300)', () => {
  const slots = [
    makeCustomVapSlot({
      srcId: '0',
      srcType: 'img',
      srcTag: 'avatar1',
      x: 80,
      y: 60,
      w: 140,
      h: 140,
    }),
    makeCustomVapSlot({
      srcId: '1',
      srcType: 'txt',
      srcTag: 'textName1',
      x: 20,
      y: 220,
      w: 260,
      h: 50,
    }),
  ];

  const plan = planVapMaskAtlasLayout({
    format: 'vap',
    W: 300,
    H: 300,
    srcW: 300,
    srcH: 300,
    slots,
  });

  assert.equal(plan.packedSlots.length, 2);
  for (const p of plan.packedSlots) {
    assert.ok(p.mFrame[0] + p.mFrame[2] <= plan.VW);
    assert.ok(p.mFrame[1] + p.mFrame[3] <= plan.VH);
    assert.ok(!rectsOverlap(plan.aFrame, p.mFrame));
  }
});

test('buildVapDynamicMetadataJson produces valid VAP vapc JSON that round-trips through binary detector', () => {
  const avatarSlot = makeCustomVapSlot({
    srcId: '0',
    srcType: 'img',
    srcTag: 'avatar1',
    x: 40,
    y: 40,
    w: 120,
    h: 120,
    fitType: 'cover',
  });
  const nameSlot = makeCustomVapSlot({
    srcId: '1',
    srcType: 'txt',
    srcTag: 'textName1',
    x: 20,
    y: 200,
    w: 260,
    h: 50,
    color: '#ffe0a4',
    fitType: 'contain',
  });

  // Output resized to 600x600 (2x scale) from 300x300
  const plan = planVapMaskAtlasLayout({
    format: 'vap',
    W: 600,
    H: 600,
    srcW: 300,
    srcH: 300,
    slots: [avatarSlot, nameSlot],
  });

  const { metaJson } = buildVapDynamicMetadataJson({
    plan,
    nk: 24,
    fps: 24,
    start: 0,
    end: 1,
    srcFps: 30,
    srcTotalFrames: 30,
    srcW: 300,
    srcH: 300,
  });

  assert.equal(metaJson.info.isVapx, 1);
  assert.equal(metaJson.src.length, 2);
  assert.equal(metaJson.frame.length, 24);
  assert.deepEqual(metaJson.frame[0].obj[0].frame, [80, 80, 240, 240]); // 2x scaled cleanly

  // Simulate packaging inside MP4 container (ftyp + vapc) and reading back with detectVapYyevaSequentialSync
  const ftyp = makeMp4Box('ftyp', new Uint8Array([105, 115, 111, 109, 0, 0, 2, 0]));
  const vapc = makeMp4Box('vapc', new TextEncoder().encode(JSON.stringify(metaJson)));
  const combined = new Uint8Array(ftyp.length + vapc.length);
  combined.set(ftyp, 0);
  combined.set(vapc, ftyp.length);

  const detected = detectVapYyevaSequentialSync(combined);
  assert.ok(detected, 'Exported VAP metadata must be detected');
  assert.equal(detected.kind, 'VAP');
  assert.equal(detected.isVapx, true);
  assert.equal(detected.dynamicSlots?.length, 2);
  assert.equal(detected.dynamicSlots?.[0].srcTag, 'avatar1');
  assert.equal(detected.dynamicSlots?.[0].isTextSlot, false);
  assert.equal(detected.dynamicSlots?.[1].srcTag, 'textName1');
  assert.equal(detected.dynamicSlots?.[1].isTextSlot, true);
  assert.deepEqual(detected.dynamicFrames?.[0]?.[0]?.mFrame, plan.packedSlots[0].mFrame);
});

test('buildVapDynamicMetadataJson exports YYEVA dynamic masks cleanly too', () => {
  const slot = makeCustomVapSlot({
    srcId: '0',
    srcType: 'img',
    srcTag: 'avatar1',
    x: 50,
    y: 50,
    w: 100,
    h: 100,
  });
  const plan = planVapMaskAtlasLayout({
    format: 'yyeva',
    W: 400,
    H: 400,
    srcW: 400,
    srcH: 400,
    slots: [slot],
  });
  const { metaJson } = buildVapDynamicMetadataJson({
    plan,
    nk: 10,
    fps: 15,
    start: 0,
    end: 10 / 15,
    srcFps: 15,
    srcTotalFrames: 10,
    srcW: 400,
    srcH: 400,
  });
  const parsed = metaFromAnyObject(metaJson, 'YYEVA');
  assert.ok(parsed);
  assert.equal(parsed.kind, 'YYEVA');
  assert.equal(parsed.dynamicSlots?.length, 1);
  assert.equal(parsed.dynamicSlots?.[0].srcTag, 'avatar1');
});

test('rgbaToWhiteOnBlackMaskBuffer converts transparent PNG and opaque grayscale to clean #fff/#000 mask', () => {
  // 2x1 PNG with transparent corner and solid purple center
  const transparentPng = new Uint8ClampedArray([
    180, 40, 220, 0, // transparent pixel -> black (0,0,0,255)
    180, 40, 220, 255, // opaque pixel -> white (255,255,255,255)
  ]);
  const outTransparent = rgbaToWhiteOnBlackMaskBuffer(transparentPng, 2, 1);
  assert.deepEqual(Array.from(outTransparent), [0, 0, 0, 255, 255, 255, 255, 255]);

  // 2x1 opaque grayscale mask (black background + white silhouette)
  const bwMask = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255,
  ]);
  const outBw = rgbaToWhiteOnBlackMaskBuffer(bwMask, 2, 1);
  assert.deepEqual(Array.from(outBw), [0, 0, 0, 255, 255, 255, 255, 255]);
});

test('buildPresetWhiteMaskRgba builds crisp circle and shield silhouettes', () => {
  const circle = buildPresetWhiteMaskRgba('circle', 32, 32);
  // Corner (0,0) should be black
  assert.equal(circle[0], 0);
  // Center (16,16) should be white
  const centerIdx = (16 * 32 + 16) * 4;
  assert.equal(circle[centerIdx], 255);
  assert.equal(circle[centerIdx + 3], 255);

  const shield = buildPresetWhiteMaskRgba('shield', 40, 40);
  const topCenter = (5 * 40 + 20) * 4;
  const bottomCorner = (39 * 40 + 39) * 4;
  assert.equal(shield[topCenter], 255);
  assert.equal(shield[bottomCorner], 0);
});

test('buildNextSlotId generates collision-free sequential numeric IDs', () => {
  assert.equal(buildNextSlotId([]), '0');
  assert.equal(buildNextSlotId([{ srcId: '0' }, { srcId: '1' }]), '2');
  assert.equal(buildNextSlotId([{ srcId: '5' }]), '6');
});

test('reorderMaskSlotsZ moves masks behind Mask 1 / Mask 2 and back up deterministically', () => {
  const slots = [
    { srcId: '0', z: 0 },
    { srcId: '1', z: 1 },
    { srcId: '2', z: 2 },
  ];
  // Move slot '2' down behind slot '1'
  const zMap1: Record<string, number> = reorderMaskSlotsZ(slots, '2', 'down');
  assert.deepEqual(zMap1, { '0': 0, '2': 1, '1': 2 });

  // Move slot '2' to bottom (behind slot '0' / Mask 1)
  const slotsAfter = sortSlotsByZ(slots.map((s) => ({ ...s, z: (zMap1 as Record<string, number>)[s.srcId] })));
  const zMap2 = reorderMaskSlotsZ(slotsAfter, '2', 'bottom');
  assert.deepEqual(zMap2, { '2': 0, '0': 1, '1': 2 });
});

test('hitTestMaskSlotsOnStage detects frontmost overlapping mask and corner resize handle', () => {
  const backMask = { srcId: '0', z: 0, defaultFrame: [50, 50, 200, 200] as [number, number, number, number] };
  const frontMask = { srcId: '1', z: 1, defaultFrame: [100, 100, 120, 120] as [number, number, number, number] };

  // Inside overlap region -> frontMask wins
  const hitMove = hitTestMaskSlotsOnStage([backMask, frontMask], 150, 150);
  assert.deepEqual(hitMove, { srcId: '1', mode: 'move' });

  // Bottom-right corner of frontMask (220, 220) -> resize mode
  const hitResize = hitTestMaskSlotsOnStage([backMask, frontMask], 218, 219);
  assert.deepEqual(hitResize, { srcId: '1', mode: 'resize' });

  // Inside backMask only (60, 60) -> backMask move
  const hitBack = hitTestMaskSlotsOnStage([backMask, frontMask], 60, 60);
  assert.deepEqual(hitBack, { srcId: '0', mode: 'move' });
});

test('computeDraggedOrResizedMaskFrame clamps drags and aspect-locked resizes inside canvas', () => {
  const moved = computeDraggedOrResizedMaskFrame([50, 60, 100, 100], 'move', 400, -100, 300, 300);
  assert.deepEqual(moved, [200, 0, 100, 100]);

  const resized = computeDraggedOrResizedMaskFrame([50, 50, 100, 100], 'resize', 60, 20, 300, 300, true);
  assert.deepEqual(resized, [50, 50, 160, 160]);
});

test('composerLayerBoxToMaskFrame converts layer center/size to clamped mask frame rect', () => {
  const frame = composerLayerBoxToMaskFrame(
    { centerX: 150, centerY: 200, drawWidth: 120, drawHeight: 80 },
    300,
    400
  );
  assert.deepEqual(frame, [90, 160, 120, 80]);
});

test('parseHexColorRgb parses transparent vs pink/custom hex colors accurately', () => {
  assert.equal(parseHexColorRgb(undefined), null);
  assert.equal(parseHexColorRgb('transparent'), null);
  assert.equal(parseHexColorRgb('none'), null);
  assert.deepEqual(parseHexColorRgb('#ec4899'), [236, 72, 153]);
  assert.deepEqual(parseHexColorRgb('#f0a'), [255, 0, 170]);
});

test('reorderMaskSlotsZ preserves behind-gift (z<0) and front-of-gift (z>=0) partitions on toBack/toFront/up/down', () => {
  const slots = [
    { srcId: '0', z: -1 },
    { srcId: '1', z: 0 },
    { srcId: '2', z: 1 },
  ];

  // Move '2' behind the gift -> goes into below partition at [-1], keeping '0' at [-2] and '1' in front at [0]
  const toBack = reorderMaskSlotsZ(slots, '2', 'toBack');
  assert.equal(toBack['1'], 0, 'Sibling front mask 1 must stay in front of gift (z >= 0)');
  assert.ok(toBack['0'] < 0 && toBack['2'] < 0, '0 and 2 must both be behind gift (z < 0)');
  assert.equal(toBack['0'], -2);
  assert.equal(toBack['2'], -1);

  // Move '0' from behind gift to front
  const slots2 = sortSlotsByZ(slots.map((s) => ({ ...s, z: toBack[s.srcId] })));
  const toFront = reorderMaskSlotsZ(slots2, '0', 'toFront');
  assert.equal(toFront['2'], -1);
  assert.equal(toFront['1'], 0);
  assert.equal(toFront['0'], 1);
});

test('buildVapDynamicMetadataJson honors slot.hasCustomFrame over sourceMeta and emits objs sorted ascending by z', () => {
  const frontSlot = makeCustomVapSlot({
    srcId: '0',
    srcType: 'img',
    srcTag: 'avatar1',
    x: 120,
    y: 80,
    w: 90,
    h: 90,
    z: 0,
  });
  frontSlot.isCustomAdded = false;
  frontSlot.hasCustomFrame = true; // User moved it from [10,10,50,50] to [120,80,90,90]

  const backSlot = makeCustomVapSlot({
    srcId: '1',
    srcType: 'img',
    srcTag: 'avatar2',
    x: 40,
    y: 40,
    w: 70,
    h: 70,
    z: -1,
  });

  const sourceMeta = metaFromAnyObject(
    {
      info: { v: 2, f: 2, w: 300, h: 300, fps: 24, aFrame: [304, 0, 150, 150], rgbFrame: [0, 0, 300, 300], isVapx: 1 },
      src: [{ srcId: '0', srcType: 'img', srcTag: 'avatar1', w: 50, h: 50 }],
      frame: [{ i: 0, obj: [{ srcId: '0', z: 0, frame: [10, 10, 50, 50], mFrame: [304, 160, 50, 50], mt: 0 }] }],
    },
    'VAP'
  );

  const plan = planVapMaskAtlasLayout({
    format: 'vap',
    W: 300,
    H: 300,
    srcW: 300,
    srcH: 300,
    slots: [frontSlot, backSlot],
  });

  const { metaJson } = buildVapDynamicMetadataJson({
    plan,
    nk: 2,
    fps: 24,
    start: 0,
    end: 2 / 24,
    srcFps: 24,
    srcTotalFrames: 2,
    srcW: 300,
    srcH: 300,
    sourceMeta,
  });

  const objs = metaJson.frame[0].obj;
  assert.equal(objs[0].srcId, '1', 'Behind-gift z=-1 must come first in exported VAP obj array');
  assert.equal(objs[0].z, -1);
  assert.equal(objs[1].srcId, '0');
  assert.deepEqual(objs[1].frame, [120, 80, 90, 90], 'Edited custom frame must override original sourceMeta frame');
});

test('resolveMaskDepthBand, setSlotDepthBand & reorderMaskSlotsWithBands maintain 4 distinct depth bands cleanly', () => {
  const slots = [
    { srcId: 'm0', z: -2 },
    { srcId: 'm1', z: 0 },
    { srcId: 'm2', z: 1 },
  ];

  // Legacy z values map cleanly to behindPrimary (z<0) or abovePrimary (z>=0)
  assert.equal(resolveMaskDepthBand(slots[0]), 'behindPrimary');
  assert.equal(resolveMaskDepthBand(slots[1]), 'abovePrimary');

  // Move m2 into belowOverlays -> z must become negative and zLayer preserved
  const b1 = setSlotDepthBand(slots, 'm2', 'belowOverlays');
  assert.equal(b1['m2'].zLayer, 'belowOverlays');
  assert.ok(b1['m2'].z < b1['m0'].z, 'belowOverlays must have lower z than behindPrimary m0');
  assert.equal(b1['m1'].zLayer, 'abovePrimary');
  assert.ok(b1['m1'].z >= 0);

  // Move m1 into aboveOverlays -> z >= abovePrimary max
  const nextSlots = [
    { srcId: 'm2', z: b1['m2'].z, zLayer: b1['m2'].zLayer },
    { srcId: 'm0', z: b1['m0'].z, zLayer: b1['m0'].zLayer },
    { srcId: 'm1', z: b1['m1'].z, zLayer: b1['m1'].zLayer },
  ];
  const b2 = setSlotDepthBand(nextSlots, 'm1', 'aboveOverlays');
  assert.equal(b2['m1'].zLayer, 'aboveOverlays');
  assert.equal(b2['m2'].zLayer, 'belowOverlays');
  assert.equal(b2['m0'].zLayer, 'behindPrimary');

  // Stepped up/down across bands via reorderMaskSlotsWithBands
  const stepDown = reorderMaskSlotsWithBands(
    [
      { srcId: 'a', z: 0, zLayer: 'abovePrimary' },
      { srcId: 'b', z: 1, zLayer: 'aboveOverlays' },
    ],
    'b',
    'down'
  );
  assert.equal(stepDown['b'].zLayer, 'abovePrimary');
  assert.ok(stepDown['b'].z > stepDown['a'].z);
});

test('attenuateMaskRgbaByForegroundAlpha zeroes mFrame luminance behind opaque foreground pixels and preserves holes', () => {
  // 3 pixels: (0) transparent fg (alpha=0), (1) semi-transparent fg (alpha=128), (2) opaque fg (alpha=255)
  const maskRgba = new Uint8ClampedArray([
    255, 255, 255, 255,
    255, 255, 255, 255,
    255, 255, 255, 255,
  ]);
  const fgRgba = new Uint8ClampedArray([
    255, 0, 0, 0,
    255, 0, 0, 128,
    255, 0, 0, 255,
  ]);

  attenuateMaskRgbaByForegroundAlpha(maskRgba, fgRgba, 3, 1);

  assert.equal(maskRgba[0], 255, 'Transparent foreground hole keeps full mask brightness');
  assert.ok(maskRgba[4] > 110 && maskRgba[4] < 140, 'Semi-transparent foreground blends proportionally');
  assert.equal(maskRgba[8], 0, 'Opaque foreground flowers/frame completely punch out mask');
  assert.equal(maskRgba[11], 255, 'Mask frame alpha remains opaque for video encoding');
});

test('buildSvgClipPathForMaskPreset emits SVGA-compatible pure M/L/C/Z Bezier paths without arc commands', () => {
  for (const preset of ['circle', 'roundedRect', 'shield', 'rect'] as const) {
    const path = buildSvgClipPathForMaskPreset(preset, 200, 160, false);
    assert.ok(path && path.startsWith('M '), `${preset} must return SVG path`);
    assert.ok(path.endsWith('Z'), `${preset} must be closed path`);
    assert.ok(!/\bA\s/i.test(path), `${preset} must not use A arc commands unsupported by SVGA BezierPath`);
  }
});

test('buildVapDynamicMetadataJson also exposes resolvedFrameAtFrame matching exported frame coordinates', () => {
  const slot = makeCustomVapSlot({
    srcId: '0',
    srcType: 'img',
    srcTag: 'avatar1',
    x: 60,
    y: 90,
    w: 120,
    h: 120,
    z: -1,
  });
  const plan = planVapMaskAtlasLayout({
    format: 'vap',
    W: 300,
    H: 300,
    srcW: 300,
    srcH: 300,
    slots: [slot],
  });
  const { resolvedFrameAtFrame } = buildVapDynamicMetadataJson({
    plan,
    nk: 2,
    fps: 24,
    start: 0,
    end: 2 / 24,
    srcFps: 24,
    srcTotalFrames: 2,
    srcW: 300,
    srcH: 300,
  });
  assert.equal(resolvedFrameAtFrame.length, 2);
  assert.deepEqual(resolvedFrameAtFrame[0]['0'], [60, 90, 120, 120]);
});

test('reconcileSessionMasksOntoSource preserves custom slots, remaps colliding srcIds, and emits composerLinkRemaps', () => {
  const vault = createEmptySessionMaskVault();
  const customSlot = makeCustomVapSlot({
    srcId: '0',
    srcType: 'img',
    srcTag: 'customBadge1',
    x: 40,
    y: 50,
    w: 140,
    h: 140,
    z: -2,
    shapePreset: 'shield',
    linkedComposerLayerId: 'comp_layer_1',
  });
  vault.customSlots = [customSlot];
  vault.replacements = {
    '0': { active: true, customImg: true, dataUrl: 'data:image/png;base64,AAA', fitMode: 'cover' },
  };
  vault.customMaskDataUrls = {
    '0': 'data:image/png;base64,SIL',
  };
  vault.slotGeometryOverrides = {
    '0': { fillColor: '#ec4899', hasCustomFrame: true, defaultFrame: [40, 50, 140, 140] },
  };

  // New primary file ALREADY has native slot srcId '0' ('avatar1') and '1' ('text1')
  const newNativeSlots = [
    makeCustomVapSlot({ srcId: '0', srcType: 'img', srcTag: 'avatar1', x: 10, y: 20, w: 120, h: 120, z: 0 }),
    makeCustomVapSlot({ srcId: '1', srcType: 'txt', srcTag: 'text1', x: 50, y: 200, w: 200, h: 50, z: 1 }),
  ];

  const rec = reconcileSessionMasksOntoSource(vault, newNativeSlots);
  assert.equal(rec.hasAnyRestoredEdits, true);
  assert.equal(rec.customSlots.length, 1);
  // Colliding srcId '0' must be remapped to '2' cleanly
  assert.equal(rec.customSlots[0].srcId, '2');
  assert.equal(rec.customSlots[0].assetKey, 'mask_2_customBadge1');
  assert.equal(rec.replacements['2']?.dataUrl, 'data:image/png;base64,AAA');
  assert.equal(rec.customMaskDataUrls['2'], 'data:image/png;base64,SIL');
  assert.equal(rec.slotGeometryOverrides['2']?.fillColor, '#ec4899');
  assert.deepEqual(rec.composerLinkRemaps, { '0': '2' });
});

test('reconcileSessionMasksOntoSource merges edited native edits by srcTag onto matching new native slot and carries unmatched slots to non-VAP files', () => {
  const vault = createEmptySessionMaskVault();
  const editedSlot = makeCustomVapSlot({
    srcId: '0',
    srcType: 'img',
    srcTag: 'avatar1',
    x: 30,
    y: 30,
    w: 110,
    h: 110,
    z: -1,
  });
  editedSlot.zLayer = 'behindPrimary';
  vault.editedNativeSlotsByTag = {
    avatar1: {
      slot: editedSlot,
      replacement: { active: true, customImg: true, dataUrl: 'data:image/png;base64,USER_FACE', fitMode: 'cover' },
      geometryOverride: { z: -1, zLayer: 'behindPrimary', fillColor: '#22c55e' },
    },
  };

  // 1) Switching to a non-VAP file (SVGA/MP4 with 0 native slots) -> carries avatar1 as custom slot
  const recNonVap = reconcileSessionMasksOntoSource(vault, []);
  assert.equal(recNonVap.customSlots.length, 1);
  assert.equal(recNonVap.customSlots[0].srcTag, 'avatar1');
  assert.equal(recNonVap.replacements['0']?.dataUrl, 'data:image/png;base64,USER_FACE');
  assert.equal(recNonVap.slotGeometryOverrides['0']?.fillColor, '#22c55e');

  // 2) Switching to another VAP file that HAS native slot srcId='7', srcTag='avatar1' -> merges without duplicating
  const nextNative = makeCustomVapSlot({ srcId: '7', srcType: 'img', srcTag: 'avatar1', x: 90, y: 90, w: 180, h: 180, z: 0 });
  const recNextVap = reconcileSessionMasksOntoSource(vault, [nextNative]);
  assert.equal(recNextVap.customSlots.length, 0, 'Must merge into matching native slot without creating a duplicate custom slot');
  assert.equal(recNextVap.replacements['7']?.dataUrl, 'data:image/png;base64,USER_FACE');
  assert.equal(recNextVap.slotGeometryOverrides['7']?.zLayer, 'behindPrimary');
  assert.equal(recNextVap.slotGeometryOverrides['7']?.fillColor, '#22c55e');
  // Since hasCustomFrame was not set, new file's native frame should remain intact!
  assert.equal(recNextVap.slotGeometryOverrides['7']?.hasCustomFrame, undefined);
});

test('buildVapDynamicMetadataJson omits slots when invisible and outputs animated frame rects and opacityAtFrame', () => {
  const slot = makeCustomVapSlot({
    srcId: '0',
    srcType: 'img',
    srcTag: 'avatar1',
    x: 100,
    y: 100,
    w: 80,
    h: 80,
    z: 0,
  });
  const plan = planVapMaskAtlasLayout({
    format: 'vap',
    W: 400,
    H: 400,
    srcW: 400,
    srcH: 400,
    slots: [slot],
  });

  const { metaJson, resolvedFrameAtFrame, opacityAtFrame } = buildVapDynamicMetadataJson({
    plan,
    nk: 4,
    fps: 24,
    start: 0,
    end: 4 / 24,
    srcFps: 24,
    srcTotalFrames: 4,
    srcW: 400,
    srcH: 400,
    resolveSlotTransformAtFrame: (_sl, fIdx) => {
      if (fIdx === 0 || fIdx === 3) {
        return { offsetX: 0, offsetY: 0, scale: 100, rotation: 0, opacity: 0, visible: false };
      }
      if (fIdx === 1) {
        return { offsetX: 20, offsetY: -10, scale: 50, rotation: 0, opacity: 50, visible: true };
      }
      return { offsetX: 0, offsetY: 0, scale: 100, rotation: 0, opacity: 100, visible: true };
    },
  });

  assert.equal(metaJson.frame[0].obj.length, 0, 'Hidden slot at frame 0 omitted from VAP obj');
  assert.equal(resolvedFrameAtFrame[0]['0'], undefined);
  assert.equal(opacityAtFrame[0]['0'], 0);

  assert.equal(metaJson.frame[1].obj.length, 1);
  // Centered at (100+40+20=160, 100+40-10=130) with scale 0.5 -> size 40x40 -> top-left [140, 110, 40, 40]
  assert.deepEqual(metaJson.frame[1].obj[0].frame, [140, 110, 40, 40]);
  assert.equal(opacityAtFrame[1]['0'], 0.5);

  assert.equal(metaJson.frame[2].obj.length, 1);
  assert.deepEqual(metaJson.frame[2].obj[0].frame, [100, 100, 80, 80]);
  assert.equal(opacityAtFrame[2]['0'], 1);

  assert.equal(metaJson.frame[3].obj.length, 0, 'Hidden slot at frame 3 omitted from VAP obj');
});





