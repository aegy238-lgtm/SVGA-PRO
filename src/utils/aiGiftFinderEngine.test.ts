import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRgbaDHash,
  computeRgbaAHash,
  computeVisualFeaturesFromRgba,
  hammingDistanceHex,
  scoreLocalGiftCandidate,
  rankLocalGiftSearchResults,
  isPathInsideAuthorizedFolders,
  generateWindowsPowerShellAgentScript,
  generateWindowsBatchInstaller,
  IndexedGiftRecord,
} from './aiGiftFinderEngine';

function createGradientSprite(width: number, height: number, mode: 'gold_crown' | 'blue_shield'): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);

      if (mode === 'gold_crown') {
        // Warm bright golden crown concentrated in top/center, darker bottom
        const bright = ny < 0.6 && nx > 0.15 && nx < 0.85 ? 1 : 0.2;
        buf[idx] = Math.round(255 * bright * (0.7 + 0.3 * nx));
        buf[idx + 1] = Math.round(205 * bright * (0.6 + 0.4 * (1 - ny)));
        buf[idx + 2] = Math.round(40 * bright);
        buf[idx + 3] = 255;
      } else {
        // Cool deep blue/cyan shield concentrated in bottom-right diagonal
        const bright = ny > 0.35 && nx > 0.25 ? 1 : 0.15;
        buf[idx] = Math.round(30 * bright);
        buf[idx + 1] = Math.round(130 * bright * ny);
        buf[idx + 2] = Math.round(255 * bright * (0.5 + 0.5 * nx));
        buf[idx + 3] = 255;
      }
    }
  }
  return buf;
}

test('perceptual hashes and visual features match similar sprites with high score and reject unrelated ones', () => {
  const crownRef = createGradientSprite(64, 64, 'gold_crown');
  const crownScaled = createGradientSprite(96, 96, 'gold_crown');
  const shieldOther = createGradientSprite(64, 64, 'blue_shield');

  const qFeat = computeVisualFeaturesFromRgba(crownRef, 64, 64);
  const cCrown = computeVisualFeaturesFromRgba(crownScaled, 96, 96);
  const cShield = computeVisualFeaturesFromRgba(shieldOther, 64, 64);

  assert.equal(qFeat.dHash.length, 16);
  assert.equal(qFeat.aHash.length, 16);
  assert.equal(qFeat.colorGrid.length, 192);
  assert.equal(qFeat.colorHist.length, 24);

  const distSame = hammingDistanceHex(qFeat.dHash, cCrown.dHash);
  const distDiff = hammingDistanceHex(qFeat.dHash, cShield.dHash);
  assert.ok(distSame <= 4, `Expected very low dHash distance for matching crown, got ${distSame}`);
  assert.ok(distDiff > distSame + 6, `Expected larger dHash distance for shield (${distDiff}) vs crown (${distSame})`);

  const candidates: IndexedGiftRecord[] = [
    {
      id: '1',
      name: 'blue_royal_shield.svga',
      path: 'D:\\Gifts\\Shields\\blue_royal_shield.svga',
      folder: 'D:\\Gifts\\Shields',
      format: 'SVGA',
      sizeBytes: 120000,
      modifiedAt: '2026-11-01T10:00:00Z',
      width: 300,
      height: 300,
      frames: [cShield],
      thumbnailDataUrl: '',
      tokens: ['blue', 'royal', 'shield'],
    },
    {
      id: '2',
      name: 'golden_king_crown.svga',
      path: 'D:\\Gifts\\Crowns\\golden_king_crown.svga',
      folder: 'D:\\Gifts\\Crowns',
      format: 'SVGA',
      sizeBytes: 98000,
      modifiedAt: '2026-11-01T10:00:00Z',
      width: 300,
      height: 300,
      frames: [cCrown],
      thumbnailDataUrl: '',
      tokens: ['golden', 'king', 'crown'],
    },
  ];

  const ranked = rankLocalGiftSearchResults([qFeat], candidates);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].name, 'golden_king_crown.svga');
  assert.ok(ranked[0].score >= 92, `Expected top match score >= 92, got ${ranked[0].score}`);
  assert.ok(ranked[0].score > ranked[1].score + 20, `Expected clear margin between crown (${ranked[0].score}) and shield (${ranked[1].score})`);
});

test('computeRgbaDHash and computeRgbaAHash produce deterministic 64-bit hex strings', () => {
  const rgba = createGradientSprite(32, 32, 'gold_crown');
  const d1 = computeRgbaDHash(rgba, 32, 32);
  const d2 = computeRgbaDHash(rgba, 32, 32);
  const a1 = computeRgbaAHash(rgba, 32, 32);
  assert.equal(d1, d2);
  assert.match(d1, /^[0-9a-f]{16}$/);
  assert.match(a1, /^[0-9a-f]{16}$/);
});

test('text query boosts matching gift candidates', () => {
  const dummyFrame = computeVisualFeaturesFromRgba(createGradientSprite(32, 32, 'blue_shield'), 32, 32);
  const itemA: IndexedGiftRecord = {
    id: 'a',
    name: 'dragon_wings_luxury.svga',
    path: 'D:\\Gifts\\dragon_wings_luxury.svga',
    folder: 'D:\\Gifts',
    format: 'SVGA',
    sizeBytes: 50000,
    modifiedAt: '2026-11-01T00:00:00Z',
    width: 300,
    height: 300,
    frames: [dummyFrame],
    thumbnailDataUrl: '',
    tokens: ['dragon', 'wings', 'luxury'],
  };
  const itemB: IndexedGiftRecord = {
    ...itemA,
    id: 'b',
    name: 'simple_rose.svga',
    path: 'D:\\Gifts\\simple_rose.svga',
    tokens: ['simple', 'rose'],
  };

  const resA = scoreLocalGiftCandidate([], itemA, 'dragon luxury');
  const resB = scoreLocalGiftCandidate([], itemB, 'dragon luxury');
  assert.equal(resA.score, 100);
  assert.equal(resB.score, 0);
});

test('isPathInsideAuthorizedFolders blocks traversal and outside paths strictly', () => {
  const allowed = ['D:\\MyGifts\\VIP', 'C:\\Users\\Ahmed\\Desktop\\SVGA'];

  assert.equal(isPathInsideAuthorizedFolders('D:\\MyGifts\\VIP\\crown.svga', allowed), true);
  assert.equal(isPathInsideAuthorizedFolders('d:\\mygifts\\vip\\sub\\gift.mp4', allowed), true);
  assert.equal(isPathInsideAuthorizedFolders('C:\\Users\\Ahmed\\Desktop\\SVGA\\a.pag', allowed), true);

  // Prefix spoofing attempt
  assert.equal(isPathInsideAuthorizedFolders('D:\\MyGifts\\VIPExtra\\secret.svga', allowed), false);
  // Directory traversal attempt
  assert.equal(isPathInsideAuthorizedFolders('D:\\MyGifts\\VIP\\..\\..\\secret.txt', allowed), false);
  // Outside drive / system files
  assert.equal(isPathInsideAuthorizedFolders('C:\\Windows\\System32\\cmd.exe', allowed), false);
  assert.equal(isPathInsideAuthorizedFolders('D:\\MyGifts\\VIP\\crown.svga', []), false);
});

test('Windows 10/11 agent script and batch installer generate cleanly with required endpoints and security', () => {
  const ps1 = generateWindowsPowerShellAgentScript();
  assert.ok(ps1.includes('http://127.0.0.1:45200'));
  assert.ok(ps1.includes('Access-Control-Allow-Private-Network'));
  assert.ok(ps1.includes('X-SVGA520-Token'));
  assert.ok(ps1.includes('explorer.exe'));
  assert.ok(ps1.includes('FolderBrowserDialog'));
  assert.ok(ps1.includes('IsPathAuthorized'));

  const bat = generateWindowsBatchInstaller();
  assert.ok(bat.startsWith('@echo off'));
  assert.ok(bat.includes('SVGA520LocalAgent'));
  assert.ok(bat.includes('SVGA520Agent.ps1'));
  assert.ok(bat.includes('::___PAYLOAD_BEGIN___'));
  assert.ok(bat.includes('FromBase64String'));
});
