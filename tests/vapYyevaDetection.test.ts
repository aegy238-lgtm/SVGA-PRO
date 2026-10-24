import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectVapYyevaSequentialSync,
  detectAlphaLayoutFromRgbaFrame,
  clampMetaToVideoBounds,
  parseMp4BoxesTolerant,
} from '../src/utils/vapYyevaDetection';
import { boxes, readMeta } from '../src/utils/codecs';

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

describe('VAP & YYEVA Binary Container & Alpha Side Auto-Detection', () => {
  it('detects standard VAP vapc box and infers alphaLayout right or left', () => {
    const ftyp = makeMp4Box('ftyp', TE.encode('isom\x00\x00\x02\x00isomiso2avc1mp41'));
    const vapJson = JSON.stringify({
      info: {
        v: 2,
        f: 60,
        w: 400,
        h: 400,
        fps: 30,
        videoW: 608,
        videoH: 400,
        aFrame: [404, 0, 200, 200],
        rgbFrame: [0, 0, 400, 400],
      },
    });
    const vapc = makeMp4Box('vapc', TE.encode(vapJson));
    const mp4 = concatBytes([ftyp, vapc]);

    const meta = detectVapYyevaSequentialSync(mp4);
    assert.ok(meta);
    assert.equal(meta.kind, 'VAP');
    assert.deepEqual(meta.c, [0, 0, 400, 400]);
    assert.deepEqual(meta.a, [404, 0, 200, 200]);
    assert.equal(meta.alphaLayout, 'r');
  });

  it('detects VAP vapc box even when FullBox flags and trailing null padding exist or trailing EOF zeros exist', () => {
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
    // Add 4-byte FullBox header (0,0,0,0) before JSON and 4 null bytes after JSON
    const paddedPayload = concatBytes([new Uint8Array([0, 0, 0, 0]), jsonBytes, new Uint8Array([0, 0, 0, 0])]);
    const vapc = makeMp4Box('vapc', paddedPayload);
    // Add 5 trailing zero bytes at EOF that would break strict MP4 box parsers
    const mp4WithTrailingZeros = concatBytes([ftyp, vapc, new Uint8Array([0, 0, 0, 0, 0])]);

    const parsedBoxes = boxes(mp4WithTrailingZeros);
    assert.equal(parsedBoxes.length, 2);

    const meta = readMeta(mp4WithTrailingZeros);
    assert.ok(meta);
    assert.equal(meta.kind, 'VAP');
    assert.equal(meta.alphaLayout, 'l');
    assert.deepEqual(meta.a, [0, 0, 180, 320]);
    assert.deepEqual(meta.c, [184, 0, 360, 640]);
  });

  it('detects YYEVA metadata nested inside udta/free or with yyeffectmp4json tags', () => {
    const ftyp = makeMp4Box('ftyp', TE.encode('isom0000'));
    const yyJson = JSON.stringify({
      descript: {
        width: 800,
        height: 400,
        rgbFrame: [0, 0, 400, 400],
        alphaFrame: [400, 0, 400, 400],
        fps: 24,
        totalFrame: 72,
      },
    });
    const freeBox = makeMp4Box('free', TE.encode('yyeffectmp4json[[' + yyJson + ']]yyeffectmp4json'));
    const mp4 = concatBytes([ftyp, freeBox]);

    const meta = detectVapYyevaSequentialSync(mp4);
    assert.ok(meta);
    assert.equal(meta.kind, 'YYEVA');
    assert.equal(meta.alphaLayout, 'r');
    assert.equal(meta.fps, 24);
    assert.equal(meta.frames, 72);
  });

  it('auto-detects Alpha on Right (r) from pixel data when white grayscale mask is on the right half', () => {
    const W = 128;
    const H = 64;
    const halfW = 64;
    const rgba = new Uint8ClampedArray(W * H * 4);

    // Draw a colored circle on the Left half [0..64] and a white alpha mask circle on the Right half [64..128]
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < halfW; x++) {
        const dx = x - 32;
        const dy = y - 32;
        const inside = dx * dx + dy * dy <= 18 * 18;
        const idxL = (y * W + x) * 4;
        const idxR = (y * W + (x + halfW)) * 4;
        if (inside) {
          // Left half: vibrant orange/pink RGB content
          rgba[idxL] = 255;
          rgba[idxL + 1] = 90;
          rgba[idxL + 2] = 40;
          rgba[idxL + 3] = 255;
          // Right half: pure white alpha mask (255, 255, 255)
          rgba[idxR] = 255;
          rgba[idxR + 1] = 255;
          rgba[idxR + 2] = 255;
          rgba[idxR + 3] = 255;
        } else {
          rgba[idxL + 3] = 255;
          rgba[idxR + 3] = 255;
        }
      }
    }

    const res = detectAlphaLayoutFromRgbaFrame(rgba, W, H, 'mp4');
    assert.equal(res.layout, 'r');
    assert.ok(res.meta);
    assert.deepEqual(res.meta.c, [0, 0, halfW, H]);
    assert.deepEqual(res.meta.a, [halfW, 0, halfW, H]);
  });

  it('auto-detects Alpha on Left (l) from pixel data when white grayscale mask is on the left half', () => {
    const W = 128;
    const H = 64;
    const halfW = 64;
    const rgba = new Uint8ClampedArray(W * H * 4);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < halfW; x++) {
        const dx = x - 32;
        const dy = y - 32;
        const inside = dx * dx + dy * dy <= 18 * 18;
        const idxL = (y * W + x) * 4;
        const idxR = (y * W + (x + halfW)) * 4;
        if (inside) {
          // Left half: pure white alpha mask (250, 250, 250)
          rgba[idxL] = 250;
          rgba[idxL + 1] = 250;
          rgba[idxL + 2] = 250;
          rgba[idxL + 3] = 255;
          // Right half: colored RGB content (40, 180, 255)
          rgba[idxR] = 40;
          rgba[idxR + 1] = 180;
          rgba[idxR + 2] = 255;
          rgba[idxR + 3] = 255;
        } else {
          rgba[idxL + 3] = 255;
          rgba[idxR + 3] = 255;
        }
      }
    }

    const res = detectAlphaLayoutFromRgbaFrame(rgba, W, H, 'yyeva');
    assert.equal(res.layout, 'l');
    assert.ok(res.meta);
    assert.deepEqual(res.meta.a, [0, 0, halfW, H]);
    assert.deepEqual(res.meta.c, [halfW, 0, halfW, H]);
  });

  it('auto-detects asymmetric 2:1 packed VAP frame when vapc box is missing', () => {
    const W = 96; // 64px RGB + 32px half-size Alpha
    const H = 64;
    const rgba = new Uint8ClampedArray(W * H * 4);

    // Fill RGB in [0..64, 0..64] and half-scale white mask in [64..96, 0..32]
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

    const res = detectAlphaLayoutFromRgbaFrame(rgba, W, H, 'vap');
    assert.equal(res.layout, 'r');
    assert.equal(res.kind, 'VAP');
    assert.ok(res.meta);
    assert.deepEqual(res.meta.c, [0, 0, 64, 64]);
    assert.deepEqual(res.meta.a, [64, 0, 32, 32]);
  });

  it('clamps slightly oversized VAP/YYEVA rects to actual video dimensions instead of throwing', () => {
    const clamped = clampMetaToVideoBounds(
      {
        kind: 'VAP',
        c: [0, 0, 404, 404],
        a: [408, 0, 204, 204],
      },
      608,
      400
    );
    assert.equal(clamped.c[2], 404);
    assert.equal(clamped.c[3], 400);
    assert.equal(clamped.a[0] + clamped.a[2], 608);
    assert.equal(clamped.alphaLayout, 'r');
  });
});
