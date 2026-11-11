import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPagBinary,
  encodePagFileBinary,
  decodePagBinaryToMovie,
  extractEmbeddedImagesFromPagBytes,
} from './pagEngine';
import { SvgaMovie } from './codecs';

function makeDummyPngBytes(seedByte: number): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
    0x08, 0x06, 0x00, 0x00, 0x00, seedByte, 0x01, 0x02, 0x03,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);
}

test('encodePagFileBinary and decodePagBinaryToMovie round-trip decomposed multi-layer SvgaMovie', async () => {
  const layer1Bytes = makeDummyPngBytes(0x11);
  const layer2Bytes = makeDummyPngBytes(0x22);

  const movie: SvgaMovie = {
    w: 750,
    h: 1334,
    fps: 30,
    n: 3,
    im: {
      crown_layer: layer1Bytes,
      wings_layer: layer2Bytes,
    },
    sp: [
      {
        key: 'crown_layer',
        fr: [
          { a: 1, x: 10, y: 20, w: 200, h: 150, t: [1, 0, 0, 1, 50, 60] },
          { a: 0.8, x: 10, y: 20, w: 200, h: 150, t: [1, 0, 0, 1, 55, 65] },
          { a: 0.5, x: 10, y: 20, w: 200, h: 150, t: [1, 0, 0, 1, 60, 70] },
        ],
      },
      {
        key: 'wings_layer',
        mk: 'matte_1',
        fr: [
          { a: 1, x: 0, y: 0, w: 400, h: 300, t: [1.2, 0, 0, 1.2, 100, 200], clipPath: 'M 0 0 L 100 0 L 100 100 Z' },
          { a: 1, x: 0, y: 0, w: 400, h: 300, t: [1.2, 0, 0, 1.2, 110, 210], clipPath: 'M 0 0 L 100 0 L 100 100 Z' },
          { a: 1, x: 0, y: 0, w: 400, h: 300, t: [1.2, 0, 0, 1.2, 120, 220], clipPath: 'M 0 0 L 100 0 L 100 100 Z' },
        ],
      },
    ],
  };

  const pagBytes = encodePagFileBinary({
    width: movie.w,
    height: movie.h,
    fps: movie.fps,
    svgaMovie: movie,
  });

  assert.equal(isPagBinary(pagBytes), true);
  assert.equal(pagBytes[0], 0x50); // 'P'
  assert.equal(pagBytes[1], 0x41); // 'A'
  assert.equal(pagBytes[2], 0x47); // 'G'
  assert.equal(pagBytes[3], 0x01); // Version = 1
  const bodyLen =
    (pagBytes[4] |
      (pagBytes[5] << 8) |
      (pagBytes[6] << 16) |
      (pagBytes[7] << 24)) >>>
    0;
  assert.equal(pagBytes[8], 0x55); // 'U' = CompressionAlgorithm::UNCOMPRESSED
  assert.equal(9 + bodyLen, pagBytes.byteLength);

  const decoded = await decodePagBinaryToMovie(pagBytes);
  assert.equal(decoded.isDecomposedPag, true);
  assert.equal(decoded.width, 750);
  assert.equal(decoded.height, 1334);
  assert.equal(decoded.fps, 30);
  assert.equal(decoded.totalFrames, 3);
  assert.equal(Object.keys(decoded.svgaMovie.im).length, 2);
  assert.deepEqual(Array.from(decoded.svgaMovie.im.crown_layer), Array.from(layer1Bytes));
  assert.deepEqual(Array.from(decoded.svgaMovie.im.wings_layer), Array.from(layer2Bytes));
  assert.equal(decoded.svgaMovie.sp.length, 2);
  assert.equal(decoded.svgaMovie.sp[0].key, 'crown_layer');
  assert.equal(decoded.svgaMovie.sp[1].key, 'wings_layer');
  assert.equal(decoded.svgaMovie.sp[1].fr[0].clipPath, 'M 0 0 L 100 0 L 100 100 Z');
});

test('encodePagFileBinary deduplicates frame sequences and decodes all frames accurately', async () => {
  const f1 = makeDummyPngBytes(0xaa);
  const f2 = makeDummyPngBytes(0xbb);

  const pagBytes = encodePagFileBinary({
    width: 600,
    height: 600,
    fps: 25,
    framesPng: [f1, f1, f2, f1],
  });

  assert.equal(isPagBinary(pagBytes), true);
  const decoded = await decodePagBinaryToMovie(pagBytes);
  assert.equal(decoded.width, 600);
  assert.equal(decoded.height, 600);
  assert.equal(decoded.fps, 25);
  assert.equal(decoded.totalFrames, 4);
  // Deduplicated: only 2 unique image assets for 4 frames
  assert.equal(Object.keys(decoded.svgaMovie.im).length, 2);
  assert.equal(decoded.svgaMovie.sp.length, 2);
});

test('extractEmbeddedImagesFromPagBytes extracts embedded PNG layers from third-party PAG binaries', async () => {
  const pngA = makeDummyPngBytes(0x33);
  const pngB = makeDummyPngBytes(0x44);
  const rawThirdPartyPag = new Uint8Array(32 + pngA.length + pngB.length);
  rawThirdPartyPag.set([0x50, 0x41, 0x47, 0x01, 0x01, 0x00, 0x00, 0x00], 0);
  rawThirdPartyPag.set(pngA, 12);
  rawThirdPartyPag.set(pngB, 16 + pngA.length);

  const extracted = extractEmbeddedImagesFromPagBytes(rawThirdPartyPag);
  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].mime, 'image/png');
  assert.deepEqual(Array.from(extracted[0].bytes), Array.from(pngA));
  assert.deepEqual(Array.from(extracted[1].bytes), Array.from(pngB));

  const decoded = await decodePagBinaryToMovie(rawThirdPartyPag);
  assert.equal(Object.keys(decoded.svgaMovie.im).length, 2);
  assert.equal(decoded.svgaMovie.sp.length, 2);
});

test('decodePagBinaryToMovie decodes native Tencent BitmapSequence (TagCode 46) frame-by-frame even without custom TagCode 42', async () => {
  const makeDummyWebp = (seed: number) =>
    new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
      0x04, 0x00, 0x00, 0x00, seed, 0x01, 0x02, 0x03,
    ]);
  const f1 = makeDummyWebp(0x51);
  const f2 = makeDummyWebp(0x52);
  const fullPag = encodePagFileBinary({
    width: 480,
    height: 480,
    fps: 24,
    webpFrames: [f1, f2],
    totalFrames: 2,
  });

  // Strip TagCode 42 block from fullPag to simulate a pure third-party Tencent BitmapComposition PAG file
  let pos = 9;
  const keptChunks: Uint8Array[] = [];
  while (pos + 2 <= fullPag.length) {
    const start = pos;
    const tagAndLen = fullPag[pos] | (fullPag[pos + 1] << 8);
    const tagCode = tagAndLen >>> 6;
    const lenField = tagAndLen & 0x3f;
    pos += 2;
    if (tagCode === 0) {
      keptChunks.push(new Uint8Array([0x00, 0x00]));
      break;
    }
    let blockLen = lenField;
    if (lenField === 63) {
      blockLen =
        (fullPag[pos] |
          (fullPag[pos + 1] << 8) |
          (fullPag[pos + 2] << 16) |
          (fullPag[pos + 3] << 24)) >>>
        0;
      pos += 4;
    }
    pos += blockLen;
    if (tagCode !== 42 && tagCode !== 15) {
      keptChunks.push(fullPag.subarray(start, pos));
    }
  }
  const bodyLen = keptChunks.reduce((acc, c) => acc + c.byteLength, 0);
  const pureBitmapPag = new Uint8Array(9 + bodyLen);
  pureBitmapPag.set([0x50, 0x41, 0x47, 0x01], 0);
  pureBitmapPag[4] = bodyLen & 0xff;
  pureBitmapPag[5] = (bodyLen >>> 8) & 0xff;
  pureBitmapPag[6] = (bodyLen >>> 16) & 0xff;
  pureBitmapPag[7] = (bodyLen >>> 24) & 0xff;
  pureBitmapPag[8] = 0x55;
  let off = 9;
  for (const c of keptChunks) {
    pureBitmapPag.set(c, off);
    off += c.byteLength;
  }

  const decoded = await decodePagBinaryToMovie(pureBitmapPag);
  assert.equal(decoded.isValidPag, true);
  assert.equal(decoded.isDecomposedPag, true);
  assert.equal(decoded.isCustomDecomposedManifest, false);
  assert.equal(decoded.width, 480);
  assert.equal(decoded.height, 480);
  assert.equal(decoded.fps, 24);
  assert.equal(decoded.totalFrames, 2);
  assert.equal(decoded.sprites.length, 2);
  assert.equal(decoded.sprites[0].fr[0].a, 1);
  assert.equal(decoded.sprites[0].fr[1].a, 0);
  assert.equal(decoded.sprites[1].fr[0].a, 0);
  assert.equal(decoded.sprites[1].fr[1].a, 1);
});

test('decodePagBinaryToMovie parses Tencent VideoCompositionBlock (TagCode 50) with 1-byte hasAlpha boolean accurately', async () => {
  // Construct a valid Tencent PAG with TagCode = 50 (VideoCompositionBlock):
  // Inner payload: composition->id = 1 (0x01), hasAlpha = true (0x01), followed by TagCode = 3 (CompositionAttributes: 720x1280, 90 frames, 30fps)
  const attrPayload = new Uint8Array([
    0xa0, 0x0b, // 720 encodedInt32 ((720 << 1) = 1440 = 0x5A0 -> [0xA0, 0x0B])
    0x80, 0x14, // 1280 encodedInt32 ((1280 << 1) = 2560 = 0xA00 -> [0x80, 0x14])
    90,         // duration = 90 frames
    0x00, 0x00, 0xf0, 0x41, // 30.0f float32LE
    0x00, 0x00, 0x00,       // backgroundColor RGB
  ]);
  const tag3Header = (3 << 6) | attrPayload.length;
  const innerComp = new Uint8Array(2 + 2 + attrPayload.length + 2);
  innerComp[0] = 0x01; // composition->id = 1
  innerComp[1] = 0x01; // composition->hasAlpha = true
  innerComp[2] = tag3Header & 0xff;
  innerComp[3] = (tag3Header >>> 8) & 0xff;
  innerComp.set(attrPayload, 4);
  // End tag (0) at the end of innerComp

  const tag50Header = (50 << 6) | innerComp.length;
  const bodyLen = 2 + innerComp.length + 2;
  const videoCompPag = new Uint8Array(9 + bodyLen);
  videoCompPag.set([0x50, 0x41, 0x47, 0x01], 0);
  videoCompPag[4] = bodyLen & 0xff;
  videoCompPag[5] = (bodyLen >>> 8) & 0xff;
  videoCompPag[6] = (bodyLen >>> 16) & 0xff;
  videoCompPag[7] = (bodyLen >>> 24) & 0xff;
  videoCompPag[8] = 0x55;
  videoCompPag[9] = tag50Header & 0xff;
  videoCompPag[10] = (tag50Header >>> 8) & 0xff;
  videoCompPag.set(innerComp, 11);

  const decoded = await decodePagBinaryToMovie(videoCompPag);
  assert.equal(decoded.isValidPag, true);
  assert.equal(decoded.width, 720);
  assert.equal(decoded.height, 1280);
  assert.equal(decoded.fps, 30);
  assert.equal(decoded.totalFrames, 90);
});


