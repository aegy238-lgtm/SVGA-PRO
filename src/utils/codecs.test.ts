import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  crc32,
  kb,
  even,
  base64,
  unbase64,
  lzw,
  parseMovie,
  boxes,
  metaFrom,
  readMeta,
  lotJson,
  SvgaMovie,
} from './codecs.ts';
import {
  composeAffineTransform,
  decomposeAffineTransform,
  computeAssetUsage,
  generateTimeRulerMarks,
  generateAfterEffectsJsxScript,
  serializeDecomposedSvga,
  interpolateLayerTransform,
  computeSpriteFrameSpan,
} from './svgaEditorLogic.ts';

describe('MotionTools Core Codecs & Binary Helpers', () => {
  it('computes standard CRC32 checksums accurately', () => {
    const input = new TextEncoder().encode('123456789');
    assert.equal(crc32(input), 0xcbf43926);
  });

  it('formats kilobytes and even dimensions', () => {
    assert.equal(kb(2048), '2.00 KB');
    assert.equal(even(413), 414);
    assert.equal(even(400), 400);
  });

  it('roundtrips base64 and unbase64', () => {
    const raw = new Uint8Array([1, 2, 3, 250, 255, 0, 128]);
    const b64 = base64(raw);
    assert.deepEqual(unbase64(b64), raw);
  });

  it('compresses indexed pixel data with 9-bit GIF LZW', () => {
    const pixels = new Uint8Array(64).fill(5);
    const compressed = lzw(pixels);
    assert.ok(compressed.length > 0 && compressed.length < pixels.length);
  });

  it('parses MP4 boxes and rejects truncated boxes', () => {
    const box = new Uint8Array(16);
    const dv = new DataView(box.buffer);
    dv.setUint32(0, 16);
    box.set([102, 116, 121, 112], 4); // 'ftyp'
    const parsed = boxes(box);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].type, 'ftyp');
    assert.equal(parsed[0].header, 8);
    assert.equal(parsed[0].end, 16);

    assert.throws(() => boxes(new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112])));
  });

  it('validates VAP and YYEVA metadata via metaFrom and readMeta', () => {
    const vapMeta = metaFrom(
      { info: { aFrame: [400, 0, 200, 200], rgbFrame: [0, 0, 400, 400], fps: 24, f: 48 } },
      'VAP'
    );
    assert.ok(vapMeta);
    assert.equal(vapMeta.kind, 'VAP');
    assert.equal(vapMeta.fps, 24);
    assert.equal(vapMeta.frames, 48);

    assert.throws(() =>
      metaFrom({ info: { aFrame: [-1, 0, 200, 200], rgbFrame: [0, 0, 400, 400] } }, 'VAP')
    );

    const json = JSON.stringify({
      info: { aFrame: [200, 0, 100, 100], rgbFrame: [0, 0, 200, 200], fps: 30 },
    });
    const payload = new TextEncoder().encode(json);
    const buf = new Uint8Array(8 + payload.length);
    new DataView(buf.buffer).setUint32(0, buf.length);
    buf.set([118, 97, 112, 99], 4); // 'vapc'
    buf.set(payload, 8);

    const detected = readMeta(buf);
    assert.ok(detected);
    assert.equal(detected.kind, 'VAP');
    assert.deepEqual(detected.c, [0, 0, 200, 200]);
  });

  it('parses SVGA 2.0 protobuf movie header', () => {
    const f32Bytes = (v: number) => Array.from(new Uint8Array(new Float32Array([v]).buffer));
    const sub = new Uint8Array([
      (1 << 3) | 5,
      ...f32Bytes(300),
      (2 << 3) | 5,
      ...f32Bytes(200),
      (3 << 3) | 0,
      25,
      (4 << 3) | 0,
      50,
    ]);
    const buf = new Uint8Array([18, sub.length, ...sub]);
    const movie = parseMovie(buf);
    assert.equal(movie.w, 300);
    assert.equal(movie.h, 200);
    assert.equal(movie.fps, 25);
    assert.equal(movie.n, 50);
  });

  it('constructs valid Lottie JSON structures', () => {
    const lot = lotJson(['f0.png', 'f1.png'], 512, 512, 30, 1);
    assert.equal(lot.w, 512);
    assert.equal(lot.h, 512);
    assert.equal(lot.fr, 30);
    assert.equal(lot.op, 2);
    assert.equal(lot.assets[0].u, '/images/');
    assert.equal(lot.layers.length, 2);
  });

  it('composes and decomposes SVGA / AE 2D affine transforms', () => {
    const mat = composeAffineTransform(-1.07, 12.5, 100, 100, 0);
    assert.deepEqual(mat, [1, 0, 0, 1, -1.07, 12.5]);
    const dec = decomposeAffineTransform(mat, 0.85);
    assert.equal(dec.x, -1.07);
    assert.equal(dec.y, 12.5);
    assert.equal(dec.sx, 100);
    assert.equal(dec.sy, 100);
    assert.equal(dec.rotation, 0);
    assert.equal(dec.opacity, 85);
  });

  it('computes SVGA asset usage and timeline ruler marks accurately', () => {
    const movie = {
      w: 300,
      h: 300,
      fps: 20,
      n: 40,
      im: {
        img_826: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        img_unused: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      },
      sp: [
        {
          key: 'img_826',
          fr: [{ a: 1, x: 0, y: 0, w: 300, h: 300, t: [1, 0, 0, 1, 0, 0] }],
        },
      ],
    };
    const stats = computeAssetUsage(movie);
    assert.equal(stats.usedCount, 1);
    assert.equal(stats.unusedCount, 1);
    assert.equal(stats.assets[0].key, 'img_826');
    assert.equal(stats.assets[0].usageCount, 1);

    const marks = generateTimeRulerMarks(2.0, 40, 20);
    assert.equal(marks[0], '0.00s');
    assert.equal(marks[marks.length - 1], '1.95s');

    const jsx = generateAfterEffectsJsxScript('test.svga', 300, 300, 20, 40, [
      { name: 'img_826', x: 0, y: 0, sx: 100, sy: 100, rotation: 0, opacity: 100 },
    ]);
    assert.ok(jsx.includes('MotionTools SVGA AE Plugin'));
    assert.ok(jsx.includes('test.svga'));
  });

  it('serializes and round-trips decomposed SVGA 2.0 layers without flattening to rendered frames', () => {
    const wingPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const crownPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 5, 6, 7, 8]);
    const addedBadgePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 10, 11, 12]);

    const sourceMovie = {
      w: 300,
      h: 300,
      fps: 20,
      n: 3,
      im: {
        img_wing: wingPng,
        img_crown: crownPng,
      },
      sp: [
        {
          key: 'img_wing',
          fr: [
            { a: 1, x: 0, y: 0, w: 120, h: 60, t: [1, 0, 0, 1, 10, 20] },
            { a: 1, x: 0, y: 0, w: 120, h: 60, t: [1, 0, 0, 1, 12, 20] },
            { a: 0, x: 0, y: 0, w: 120, h: 60, t: [1, 0, 0, 1, 12, 20] },
          ],
        },
        {
          key: 'img_crown',
          mk: 'mask_1',
          fr: [
            { a: 0.8, x: 0, y: 0, w: 80, h: 50, t: [1, 0, 0, 1, 110, 15], clipPath: 'M0,0L80,0L80,50Z' },
            { a: 0.8, x: 0, y: 0, w: 80, h: 50, t: [1, 0, 0, 1, 110, 15], clipPath: 'M0,0L80,0L80,50Z' },
            { a: 0.8, x: 0, y: 0, w: 80, h: 50, t: [1, 0, 0, 1, 110, 15], clipPath: 'M0,0L80,0L80,50Z' },
          ],
        },
      ],
    };

    const rawProto = serializeDecomposedSvga(sourceMovie, {
      spriteTransforms: {
        sprite_0: { x: 25, y: -10, sx: 100, sy: 100, rotation: 0, opacity: 50 },
      },
      extraLayers: [
        {
          id: 'layer_1',
          assetKey: 'added_badge',
          name: 'Badge',
          pngBytes: addedBadgePng,
          width: 64,
          height: 64,
          transform: { x: 15, y: 30, sx: 100, sy: 100, rotation: 0, opacity: 100 },
        },
      ],
    });

    const parsed = parseMovie(rawProto);
    assert.equal(parsed.w, 300);
    assert.equal(parsed.h, 300);
    assert.equal(parsed.fps, 20);
    assert.equal(parsed.n, 3);

    // Verify all 3 decomposed assets exist independently in parsed.im
    assert.deepEqual(Object.keys(parsed.im).sort(), ['added_badge', 'img_crown', 'img_wing']);
    assert.deepEqual(parsed.im['img_wing'], wingPng);
    assert.deepEqual(parsed.im['img_crown'], crownPng);
    assert.deepEqual(parsed.im['added_badge'], addedBadgePng);

    // Verify all 3 decomposed sprites exist independently in parsed.sp
    assert.equal(parsed.sp.length, 3);
    assert.equal(parsed.sp[0].key, 'img_wing');
    assert.equal(parsed.sp[1].key, 'img_crown');
    assert.equal(parsed.sp[1].mk, 'mask_1');
    assert.equal(parsed.sp[1].fr[0].clipPath, 'M0,0L80,0L80,50Z');
    assert.equal(parsed.sp[2].key, 'added_badge');

    // Verify sprite_0 ('img_wing') moved by (+25, -10) -> tx: 10+25=35, ty: 20-10=10 and alpha: 1 * 0.5 = 0.5
    assert.ok(Math.abs(parsed.sp[0].fr[0].t[4] - 35) < 0.01);
    assert.ok(Math.abs(parsed.sp[0].fr[0].t[5] - 10) < 0.01);
    assert.ok(Math.abs(parsed.sp[0].fr[0].a - 0.5) < 0.01);

    // Verify added_badge layer is centered at (300/2 + 15 - 64/2, 300/2 + 30 - 64/2) = (133, 148)
    assert.equal(parsed.sp[2].fr[0].w, 64);
    assert.equal(parsed.sp[2].fr[0].h, 64);
    assert.ok(Math.abs(parsed.sp[2].fr[0].t[4] - 133) < 0.01);
    assert.ok(Math.abs(parsed.sp[2].fr[0].t[5] - 148) < 0.01);
  });

  it('interpolates keyframes and computes sprite frame spans', () => {
    const base = { x: 0, y: 0, sx: 100, sy: 100, rotation: 0, opacity: 100 };
    const kfs = {
      0: { x: 0, y: 0, sx: 100, sy: 100, rotation: 0, opacity: 100 },
      10: { x: 100, y: -50, sx: 200, sy: 200, rotation: 90, opacity: 50 },
    };
    const mid = interpolateLayerTransform(base, kfs, 5);
    assert.equal(mid.x, 50);
    assert.equal(mid.y, -25);
    assert.equal(mid.sx, 150);
    assert.equal(mid.rotation, 45);
    assert.equal(mid.opacity, 75);

    const span = computeSpriteFrameSpan(
      {
        key: 'img_1',
        fr: [
          { a: 0, x: 0, y: 0, w: 10, h: 10, t: [1, 0, 0, 1, 0, 0] },
          { a: 1, x: 0, y: 0, w: 10, h: 10, t: [1, 0, 0, 1, 5, 5] },
          { a: 1, x: 0, y: 0, w: 10, h: 10, t: [1, 0, 0, 1, 10, 5] },
          { a: 0, x: 0, y: 0, w: 10, h: 10, t: [1, 0, 0, 1, 0, 0] },
        ],
      },
      4
    );
    assert.equal(span.firstFrame, 1);
    assert.equal(span.lastFrame, 2);
    assert.equal(span.activeCount, 2);
    assert.equal(span.isStatic, false);
  });

  it('interpolates independent per-property keyframes (Position, Scale, Rotation, Opacity) and trims sprite timeline bars', () => {
    const base = { x: 0, y: 0, sx: 100, sy: 100, rotation: 0, opacity: 100 };
    const propKfs = {
      position: {
        0: { x: 0, y: 0 },
        10: { x: 50, y: -20 },
      },
      scale: {
        0: { sx: 50, sy: 50 },
        20: { sx: 150, sy: 150 },
      },
      rotation: {
        0: 0,
        10: 180,
      },
      opacity: {
        0: 100,
        10: 20,
      },
    };
    const at5 = interpolateLayerTransform(base, propKfs, 5);
    assert.equal(at5.x, 25);
    assert.equal(at5.y, -10);
    assert.equal(at5.sx, 75);
    assert.equal(at5.sy, 75);
    assert.equal(at5.rotation, 90);
    assert.equal(at5.opacity, 60);

    // Verify timeline trimming via spriteFrameRanges in serializeDecomposedSvga
    const raw = serializeDecomposedSvga(
      {
        w: 200,
        h: 200,
        fps: 20,
        n: 6,
        im: { img_a: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
        sp: [
          {
            key: 'img_a',
            fr: Array.from({ length: 6 }, () => ({
              a: 1,
              x: 0,
              y: 0,
              w: 50,
              h: 50,
              t: [1, 0, 0, 1, 0, 0],
            })),
          },
        ],
      },
      {
        spriteFrameRanges: {
          sprite_0: { inFrame: 2, outFrame: 4, offsetFrames: 0 },
        },
      }
    );
    const parsed = parseMovie(raw);
    assert.equal(parsed.sp[0].fr[0].a, 0);
    assert.equal(parsed.sp[0].fr[1].a, 0);
    assert.equal(parsed.sp[0].fr[2].a, 1);
    assert.equal(parsed.sp[0].fr[4].a, 1);
    assert.equal(parsed.sp[0].fr[5].a, 0);
  });

  it('virtual group all layers: exports clean native decomposed SVGA without raster baking', () => {
    const rawAsset = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const audioTrack = new Uint8Array([10, 20, 30, 40]);
    const sourceMovie: SvgaMovie = {
      w: 400,
      h: 400,
      fps: 30,
      n: 5,
      im: { img_head: rawAsset },
      sp: [
        {
          key: 'img_head',
          fr: Array.from({ length: 5 }, () => ({
            a: 1,
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            t: [1, 0, 0, 1, 50, 50],
          })),
        },
      ],
      audiosRaw: [audioTrack],
    };

    // Virtual Group All Layers applies docTransform { x: 30, y: -20, sx: 120, sy: 120 }
    const exportedRaw = serializeDecomposedSvga(sourceMovie, {
      docTransform: { x: 30, y: -20, sx: 120, sy: 120, rotation: 0, opacity: 100 },
    });

    const parsed = parseMovie(exportedRaw);
    // Preserves native format:
    assert.equal(parsed.w, 400);
    assert.equal(parsed.h, 400);
    assert.equal(parsed.sp.length, 1);
    assert.equal(parsed.sp[0].key, 'img_head');
    assert.deepEqual(parsed.im['img_head'], rawAsset);
    assert.equal(parsed.audiosRaw?.length, 1);
    assert.deepEqual(parsed.audiosRaw?.[0], audioTrack);

    // Sprite affine matrix has group scale (1.2) and group translation applied
    assert.ok(Math.abs(parsed.sp[0].fr[0].t[0] - 1.2) < 0.01);
    assert.ok(Math.abs(parsed.sp[0].fr[0].t[3] - 1.2) < 0.01);
  });
});
