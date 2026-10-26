import test from 'node:test';
import assert from 'node:assert/strict';
import { countBatchOperations, removeImageBackgroundData } from './batchImageOps';

test('countBatchOperations counts delete, rename, replace, and removeBackground accurately', () => {
  const count = countBatchOperations({
    removeBackground: true,
    items: {
      img_0: {
        key: 'img_0',
        src: 'data:image/png;base64,AAA',
        markedForDelete: true,
        newName: 'ignored_when_deleted',
        replacementDataUrl: 'data:image/png;base64,BBB',
      },
      img_1: {
        key: 'img_1',
        src: 'data:image/png;base64,AAA',
        markedForDelete: false,
        newName: 'hero_badge',
        replacementDataUrl: 'data:image/png;base64,CCC',
      },
      img_2: {
        key: 'img_2',
        src: 'data:image/png;base64,AAA',
        markedForDelete: false,
        newName: 'img_2',
        replacementDataUrl: null,
      },
    },
  });
  // 1 (removeBackground) + 1 (img_0 delete) + 2 (img_1 rename + replace) + 0 (img_2 unchanged) = 4
  assert.equal(count, 4);
});

test('removeImageBackgroundData makes solid border background transparent while keeping foreground opaque', () => {
  // 2x2 image: 3 black border pixels (0,0,0,255) and 1 bright gold pixel (255,215,0,255)
  const buf = new Uint8ClampedArray([
    0, 0, 0, 255,
    0, 0, 0, 255,
    0, 0, 0, 255,
    255, 215, 0, 255,
  ]);
  const changed = removeImageBackgroundData(buf, 2, 2, 30);
  assert.equal(changed, true);
  assert.equal(buf[3], 0);
  assert.equal(buf[7], 0);
  assert.equal(buf[11], 0);
  assert.equal(buf[15], 255);
});
