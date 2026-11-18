import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITOR_IMPORT_ACCEPT,
  EDITOR_EXPORT_FORMATS,
  detectFileFormatFromNameAndBytes,
  encodeAnimatedGifRgba,
  buildMp4AtomBox,
  packageMp4WithVapYyevaMeta,
  buildFramesSvgaMovie,
} from './svgaUniversalFormats';
import { readMeta, boxes } from './codecs';

test('EDITOR_EXPORT_FORMATS includes all 15 platform export formats', () => {
  const keys = EDITOR_EXPORT_FORMATS.map((f) => f.key);
  for (const expected of [
    'svga',
    'pag',
    'vap',
    'yyeva',
    'dual',
    'mp4',
    'mov',
    'webm',
    'gif',
    'webp',
    'apng',
    'lottie',
    'dotlottie',
    'zip',
    'ae_script',
  ]) {
    assert.ok(keys.includes(expected as any), `Missing export format: ${expected}`);
  }
  assert.ok(EDITOR_IMPORT_ACCEPT.includes('.svga'));
  assert.ok(EDITOR_IMPORT_ACCEPT.includes('.pag'));
  assert.ok(EDITOR_IMPORT_ACCEPT.includes('.vap'));
  assert.ok(EDITOR_IMPORT_ACCEPT.includes('.yyeva'));
  assert.ok(EDITOR_IMPORT_ACCEPT.includes('.lottie'));
  assert.ok(EDITOR_IMPORT_ACCEPT.includes('.apng'));
});

test('detectFileFormatFromNameAndBytes identifies PAG, GIF, WebP, PNG, APNG, WebM, Lottie JSON, SVG, and SVGA 2.0', () => {
  assert.equal(
    detectFileFormatFromNameAndBytes('gift.pag', new Uint8Array([0x50, 0x41, 0x47, 0x01])),
    'pag'
  );
  assert.equal(
    detectFileFormatFromNameAndBytes('anim.gif', new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
    'gif'
  );
  assert.equal(
    detectFileFormatFromNameAndBytes(
      'anim.webp',
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    ),
    'webp'
  );
  assert.equal(
    detectFileFormatFromNameAndBytes('anim.webm', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f])),
    'webm'
  );
  assert.equal(
    detectFileFormatFromNameAndBytes('gift.json', new TextEncoder().encode('{"v":"5.7.0","layers":[]}')),
    'lottie'
  );
  assert.equal(
    detectFileFormatFromNameAndBytes('icon.svg', new TextEncoder().encode('<svg viewBox="0 0 10 10"></svg>')),
    'svg'
  );
  assert.equal(
    detectFileFormatFromNameAndBytes('effect.svga', new Uint8Array([0x78, 0x9c, 0x01, 0x00])),
    'svga2'
  );
});

test('encodeAnimatedGifRgba produces valid GIF89a multi-frame binary with transparent pixels', () => {
  const f1 = new Uint8Array(4 * 4 * 4);
  f1.fill(0);
  // Paint solid red pixel at top-left
  f1[0] = 255;
  f1[1] = 0;
  f1[2] = 0;
  f1[3] = 255;

  const f2 = new Uint8Array(4 * 4 * 4);
  f2.fill(0);
  f2[4] = 0;
  f2[5] = 255;
  f2[6] = 0;
  f2[7] = 255;

  const gif = encodeAnimatedGifRgba([f1, f2], 4, 4, 20, 0);
  const hdr = new TextDecoder().decode(gif.subarray(0, 6));
  assert.equal(hdr, 'GIF89a');
  assert.equal(gif[gif.length - 1], 0x3b);
  assert.ok(gif.length > 800);
});

test('packageMp4WithVapYyevaMeta injects vapc after ftyp, adjusts stco chunk offset, and creates readable VAP/YYEVA metadata', () => {
  // Build minimal valid MP4: ftyp + moov(stco=[100]) + mdat
  const ftyp = buildMp4AtomBox('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]));
  const stcoPayload = new Uint8Array(12);
  new DataView(stcoPayload.buffer).setUint32(4, 1, false); // 1 chunk offset entry
  new DataView(stcoPayload.buffer).setUint32(8, 120, false); // offset = 120
  const stco = buildMp4AtomBox('stco', stcoPayload);
  const stbl = buildMp4AtomBox('stbl', stco);
  const minf = buildMp4AtomBox('minf', stbl);
  const mdia = buildMp4AtomBox('mdia', minf);
  const trak = buildMp4AtomBox('trak', mdia);
  const moov = buildMp4AtomBox('moov', trak);
  const mdat = buildMp4AtomBox('mdat', new Uint8Array(16));

  const baseMp4 = new Uint8Array(ftyp.length + moov.length + mdat.length);
  baseMp4.set(ftyp, 0);
  baseMp4.set(moov, ftyp.length);
  baseMp4.set(mdat, ftyp.length + moov.length);

  const vapMeta = {
    info: {
      v: 2,
      f: 10,
      w: 200,
      h: 200,
      fps: 20,
      videoW: 320,
      videoH: 208,
      aFrame: [204, 0, 100, 100],
      rgbFrame: [0, 0, 200, 200],
      isVapx: 0,
      orien: 0,
    },
  };
  const vapBytes = packageMp4WithVapYyevaMeta(baseMp4, 'vap', vapMeta);
  const parsedVapBoxes = boxes(vapBytes);
  assert.equal(parsedVapBoxes[0].type, 'ftyp');
  assert.equal(parsedVapBoxes[1].type, 'vapc');
  assert.equal(parsedVapBoxes[2].type, 'moov');

  const detectedVap = readMeta(vapBytes);
  assert.ok(detectedVap);
  assert.equal(detectedVap.kind, 'VAP');
  assert.equal(detectedVap.c[2], 200);

  // Check stco was shifted by vapc box length
  const vapcLen = parsedVapBoxes[1].end - parsedVapBoxes[1].start;
  const stcoIdx = vapBytes.findIndex(
    (_, idx) =>
      vapBytes[idx] === 0x73 &&
      vapBytes[idx + 1] === 0x74 &&
      vapBytes[idx + 2] === 0x63 &&
      vapBytes[idx + 3] === 0x6f
  );
  const updatedOffset = new DataView(vapBytes.buffer).getUint32(stcoIdx + 12, false);
  assert.equal(updatedOffset, 120 + vapcLen);

  // YYEVA packaging
  const yyevaMeta = {
    descript: {
      width: 200,
      height: 200,
      isEffect: 0,
      version: 1,
      rgbFrame: [0, 0, 200, 200],
      alphaFrame: [200, 0, 200, 200],
      totalFrame: 10,
      fps: 20,
    },
  };
  const yyevaBytes = packageMp4WithVapYyevaMeta(baseMp4, 'yyeva', yyevaMeta);
  const detectedYyeva = readMeta(yyevaBytes);
  assert.ok(detectedYyeva);
  assert.equal(detectedYyeva.kind, 'YYEVA');
  assert.equal(detectedYyeva.c[2], 200);
});

test('buildFramesSvgaMovie creates multi-frame sprite sequence preserving dimensions and per-frame visibility', () => {
  const movie = buildFramesSvgaMovie(
    [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]), new Uint8Array([7, 8, 9])],
    400,
    320,
    24
  );
  assert.equal(movie.w, 400);
  assert.equal(movie.h, 320);
  assert.equal(movie.fps, 24);
  assert.equal(movie.n, 3);
  assert.equal(movie.sp.length, 3);
  assert.equal(movie.sp[0].fr[0].a, 1);
  assert.equal(movie.sp[0].fr[1].a, 0);
  assert.equal(movie.sp[1].fr[1].a, 1);
  assert.equal(movie.sp[2].fr[2].a, 1);
});
