import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNextSlotId,
  buildPresetWhiteMaskRgba,
  buildVapDynamicMetadataJson,
  composerLayerBoxToMaskFrame,
  computeDraggedOrResizedMaskFrame,
  hitTestMaskSlotsOnStage,
  makeCustomVapSlot,
  parseHexColorRgb,
  planVapMaskAtlasLayout,
  reorderMaskSlotsZ,
  rgbaToWhiteOnBlackMaskBuffer,
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

