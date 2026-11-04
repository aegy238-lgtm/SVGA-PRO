import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectVapYyevaSequentialSync,
  detectAlphaLayoutFromRgbaFrame,
  metaFromAnyObject,
  clampMetaToVideoBounds,
  resolveDynamicFramePlacements,
  applyLuminanceMaskToRgba,
  extractMaskPreviewRgba,
  computeSlotFitDrawRect,
} from './vapYyevaDetection';
import { boxes, readMeta } from './codecs';

const TE = new TextEncoder();

function makeMp4Box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

test('detectVapYyevaSequentialSync recognizes VAP dynamic masks (avatar image + id text) from MP4 vapc box', () => {
  const ftyp = makeMp4Box('ftyp', TE.encode('isom\x00\x00\x02\x00isomiso2avc1mp41'));
  const frameEntries = Array.from({ length: 150 }, (_, i) => ({
    i,
    obj: [
      { srcId: '0', z: 0, frame: [309, 826, 140, 145], mFrame: [754, 570, 140, 145], mt: 0 },
      { srcId: '1', z: 1, frame: [261, 1020, 234, 54], mFrame: [898, 570, 234, 54], mt: 0 },
    ],
  }));
  const vapcPayload = TE.encode(
    JSON.stringify({
      info: {
        v: 2,
        f: 150,
        w: 750,
        h: 1132,
        fps: 30,
        videoW: 1136,
        videoH: 1136,
        aFrame: [754, 0, 375, 566],
        rgbFrame: [0, 0, 750, 1132],
        isVapx: 1,
        orien: 0,
      },
      src: [
        {
          srcId: '0',
          srcType: 'img',
          srcTag: 'avatar',
          loadType: 'net',
          fitType: 'fitXY',
          w: 140,
          h: 145,
        },
        {
          srcId: '1',
          srcType: 'txt',
          srcTag: 'id',
          color: '#ffffff',
          style: '',
          loadType: 'local',
          fitType: 'fitXY',
          w: 234,
          h: 54,
        },
      ],
      frame: frameEntries,
    })
  );
  const bytes = concatBytes([ftyp, makeMp4Box('vapc', vapcPayload)]);

  const meta = detectVapYyevaSequentialSync(bytes);
  assert.ok(meta, 'Should detect VAP metadata from MP4 vapc box');
  assert.equal(meta.kind, 'VAP');
  assert.deepEqual(meta.c, [0, 0, 750, 1132]);
  assert.deepEqual(meta.a, [754, 0, 375, 566]);
  assert.equal(meta.fps, 30);
  assert.equal(meta.frames, 150);
  assert.equal(meta.isVapx, true);

  assert.ok(Array.isArray(meta.dynamicSlots), 'Should extract dynamicSlots');
  assert.equal(meta.dynamicSlots!.length, 2);

  const avatarSlot = meta.dynamicSlots![0];
  assert.equal(avatarSlot.srcId, '0');
  assert.equal(avatarSlot.srcTag, 'avatar');
  assert.equal(avatarSlot.srcType, 'img');
  assert.equal(avatarSlot.isTextSlot, false);
  assert.equal(avatarSlot.w, 140);
  assert.equal(avatarSlot.h, 145);
  assert.equal(avatarSlot.assetKey, 'mask_0_avatar');
  assert.deepEqual(avatarSlot.defaultFrame, [309, 826, 140, 145]);
  assert.deepEqual(avatarSlot.defaultMFrame, [754, 570, 140, 145]);

  const idSlot = meta.dynamicSlots![1];
  assert.equal(idSlot.srcId, '1');
  assert.equal(idSlot.srcTag, 'id');
  assert.equal(idSlot.srcType, 'txt');
  assert.equal(idSlot.isTextSlot, true);
  assert.equal(idSlot.color, '#ffffff');
  assert.equal(idSlot.w, 234);
  assert.equal(idSlot.h, 54);
  assert.equal(idSlot.assetKey, 'mask_1_id');
  assert.deepEqual(idSlot.defaultFrame, [261, 1020, 234, 54]);
  assert.deepEqual(idSlot.defaultMFrame, [898, 570, 234, 54]);

  // Verify frame placements across all 150 frames
  const clamped = clampMetaToVideoBounds(meta, 1136, 1136);
  for (let f = 0; f < 150; f++) {
    const placements = resolveDynamicFramePlacements(clamped, f);
    assert.equal(placements.length, 2, `Frame ${f} should have 2 dynamic mask placements`);
    assert.equal(placements[0].srcId, '0');
    assert.equal(placements[1].srcId, '1');
    assert.deepEqual(placements[0].frame, [309, 826, 140, 145]);
    assert.deepEqual(placements[0].mFrame, [754, 570, 140, 145]);
    assert.deepEqual(placements[1].frame, [261, 1020, 234, 54]);
    assert.deepEqual(placements[1].mFrame, [898, 570, 234, 54]);
  }
});

test('detects VAP vapc box with FullBox flags, trailing null padding, and alpha side auto-detection', () => {
  const ftyp = makeMp4Box('ftyp', TE.encode('isom0000'));
  const jsonBytes = TE.encode(
    JSON.stringify({
      info: {
        v: 2,
        f: 45,
        w: 360,
        h: 640,
        fps: 25,
        aFrame: [0, 0, 180, 320],
        rgbFrame: [184, 0, 360, 640],
      },
    })
  );
  const paddedPayload = concatBytes([new Uint8Array([0, 0, 0, 0]), jsonBytes, new Uint8Array([0, 0, 0, 0])]);
  const vapc = makeMp4Box('vapc', paddedPayload);
  const mp4WithTrailingZeros = concatBytes([ftyp, vapc, new Uint8Array([0, 0, 0, 0, 0])]);

  const parsedBoxes = boxes(mp4WithTrailingZeros);
  assert.equal(parsedBoxes.length, 2);

  const meta = readMeta(mp4WithTrailingZeros);
  assert.ok(meta);
  assert.equal(meta.kind, 'VAP');
  assert.equal(meta.alphaLayout, 'l');
  assert.deepEqual(meta.a, [0, 0, 180, 320]);
  assert.deepEqual(meta.c, [184, 0, 360, 640]);

  // Also verify pixel-based alpha side detection
  const W = 96;
  const H = 64;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 64; x++) {
      const inside = x >= 12 && x < 52 && y >= 12 && y < 52;
      const idx = (y * W + x) * 4;
      if (inside) {
        rgba[idx] = 240;
        rgba[idx + 1] = 60;
        rgba[idx + 2] = 160;
        rgba[idx + 3] = 255;
      } else {
        rgba[idx + 3] = 255;
      }
    }
  }
  for (let y = 0; y < 32; y++) {
    for (let x = 64; x < 96; x++) {
      const inside = x - 64 >= 6 && x - 64 < 26 && y >= 6 && y < 26;
      const idx = (y * W + x) * 4;
      if (inside) {
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = 255;
      } else {
        rgba[idx + 3] = 255;
      }
    }
  }
  const pixelRes = detectAlphaLayoutFromRgbaFrame(rgba, W, H, 'vap');
  assert.equal(pixelRes.layout, 'r');
  assert.equal(pixelRes.kind, 'VAP');
});

test('metaFromAnyObject extracts YYEVA effect and datas dynamic mask slots', () => {
  const yyevaJson = {
    descript: {
      width: 1000,
      height: 500,
      rgbFrame: [0, 0, 500, 500],
      alphaFrame: [500, 0, 500, 500],
      fps: 25,
      totalFrame: 60,
    },
    effect: [
      { effectId: 10, effectTag: 'user_avatar', effectType: 'img', effectWidth: 120, effectHeight: 120 },
      { effectId: 11, effectTag: 'nick_name', effectType: 'txt', effectWidth: 200, effectHeight: 40, fontColor: '#ffcc00' },
    ],
    datas: [
      {
        frameIndex: 0,
        data: [
          { effectId: 10, renderFrame: [190, 100, 120, 120], outputFrame: [520, 200, 120, 120] },
          { effectId: 11, renderFrame: [150, 260, 200, 40], outputFrame: [650, 200, 200, 40] },
        ],
      },
    ],
  };

  const meta = metaFromAnyObject(yyevaJson, 'YYEVA');
  assert.ok(meta);
  assert.equal(meta.kind, 'YYEVA');
  assert.equal(meta.dynamicSlots?.length, 2);
  assert.equal(meta.dynamicSlots![0].srcTag, 'user_avatar');
  assert.equal(meta.dynamicSlots![0].isTextSlot, false);
  assert.equal(meta.dynamicSlots![1].srcTag, 'nick_name');
  assert.equal(meta.dynamicSlots![1].isTextSlot, true);
  assert.equal(meta.dynamicSlots![1].color, '#ffcc00');
});

test('applyLuminanceMaskToRgba and extractMaskPreviewRgba process mask luminance accurately', () => {
  const layer = new Uint8ClampedArray([
    255, 0, 0, 255, // pixel 0: opaque red
    0, 255, 0, 200, // pixel 1: semi-opaque green
  ]);
  const mask = new Uint8ClampedArray([
    255, 255, 255, 255, // pixel 0: white mask (keep 100% alpha)
    0, 0, 0, 255,       // pixel 1: black mask (clip to 0% alpha)
  ]);

  applyLuminanceMaskToRgba(layer, mask, 2, 1);
  assert.equal(layer[3], 255);
  assert.equal(layer[7], 0);

  const preview = extractMaskPreviewRgba(mask, 2, 1, [168, 85, 247]);
  assert.equal(preview[0], 168);
  assert.equal(preview[3], 255);
  assert.equal(preview[7], 0);
});

test('computeSlotFitDrawRect calculates cover, contain, and fitXY rectangles accurately', () => {
  const fitXY = computeSlotFitDrawRect(200, 100, 100, 100, 'fitXY');
  assert.equal(fitXY.dx, 0);
  assert.equal(fitXY.dy, 0);
  assert.equal(fitXY.dw, 100);
  assert.equal(fitXY.dh, 100);

  const contain = computeSlotFitDrawRect(200, 100, 100, 100, 'contain');
  assert.equal(contain.dx, 0);
  assert.equal(contain.dy, 25);
  assert.equal(contain.dw, 100);
  assert.equal(contain.dh, 50);

  const cover = computeSlotFitDrawRect(200, 100, 100, 100, 'cover');
  assert.equal(cover.dx, -50);
  assert.equal(cover.dy, 0);
  assert.equal(cover.dw, 200);
  assert.equal(cover.dh, 100);
});
