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
