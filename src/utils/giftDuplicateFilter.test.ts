import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGiftFileName,
  computeGiftBinarySignature,
  analyzeDuplicateGifts,
  evaluateIncomingGiftsWithToggle,
  computeGiftPagination,
} from './giftDuplicateFilter';

test('normalizeGiftFileName strips OS copy suffixes in Arabic and English', () => {
  assert.equal(normalizeGiftFileName('royal_lion (1).svga').normalizedFull, 'royal_lion.svga');
  assert.equal(normalizeGiftFileName('royal_lion (2).SVGA').normalizedFull, 'royal_lion.svga');
  assert.equal(normalizeGiftFileName('royal_lion - Copy.svga').normalizedFull, 'royal_lion.svga');
  assert.equal(normalizeGiftFileName('royal_lion - Copy (3).svga').normalizedFull, 'royal_lion.svga');
  assert.equal(normalizeGiftFileName('نسخة من royal_lion.svga').normalizedFull, 'royal_lion.svga');
  assert.equal(normalizeGiftFileName('royal_lion - نسخة.svga').normalizedFull, 'royal_lion.svga');
});

test('computeGiftBinarySignature produces identical hashes for identical gift bytes and distinct hashes for different bytes', () => {
  const svgaA = new Uint8Array([0x78, 0x9c, 10, 20, 30, 40, 50, 60]);
  const svgaB = new Uint8Array([0x78, 0x9c, 10, 20, 30, 40, 50, 60]);
  const svgaDiff = new Uint8Array([0x78, 0x9c, 10, 20, 30, 40, 50, 99]);

  const sigA = computeGiftBinarySignature(svgaA);
  const sigB = computeGiftBinarySignature(svgaB);
  const sigDiff = computeGiftBinarySignature(svgaDiff);

  assert.equal(sigA.magicFormat, 'svga');
  assert.equal(sigA.contentHash, sigB.contentHash);
  assert.notEqual(sigA.contentHash, sigDiff.contentHash);
});

test('analyzeDuplicateGifts detects multiple copies of a gift and keeps strictly one original copy', () => {
  const bytesLion = new Uint8Array([0x78, 0x9c, 1, 2, 3, 4, 5, 6, 7, 8]);
  const bytesCrown = new Uint8Array([0x78, 0x9c, 9, 9, 8, 7, 6, 5, 4, 3]);
  const sigLion = computeGiftBinarySignature(bytesLion);
  const sigCrown = computeGiftBinarySignature(bytesCrown);

  const items = [
    { id: 1, name: 'lion.svga', byteLength: sigLion.byteLength, contentHash: sigLion.contentHash, magicFormat: sigLion.magicFormat },
    { id: 2, name: 'lion (1).svga', byteLength: sigLion.byteLength, contentHash: sigLion.contentHash, magicFormat: sigLion.magicFormat },
    { id: 3, name: 'lion - Copy.svga', byteLength: sigLion.byteLength, contentHash: sigLion.contentHash, magicFormat: sigLion.magicFormat },
    { id: 4, name: 'crown.svga', byteLength: sigCrown.byteLength, contentHash: sigCrown.contentHash, magicFormat: sigCrown.magicFormat },
    { id: 5, name: 'crown_renamed.svga', byteLength: sigCrown.byteLength, contentHash: sigCrown.contentHash, magicFormat: sigCrown.magicFormat },
  ];

  const result = analyzeDuplicateGifts(items);
  assert.equal(result.hasDuplicates, true);
  assert.equal(result.totalDuplicateCount, 3);
  assert.equal(result.uniqueGroupCount, 2);
  assert.deepEqual(result.keepIds, [1, 4]);
  assert.deepEqual(result.removeIds, [2, 3, 5]);
  assert.equal(result.groups[0].totalCopies, 3);
  assert.equal(result.groups[0].extraCopies, 2);
  assert.equal(result.groups[1].totalCopies, 2);
});

test('evaluateIncomingGiftsWithToggle allows all files normally when toggle is OFF and filters duplicates when toggle is ON (blue)', () => {
  const bytesLion = new Uint8Array([0x78, 0x9c, 1, 2, 3, 4, 5, 6, 7, 8]);
  const sigLion = computeGiftBinarySignature(bytesLion);
  const items = [
    { id: 10, name: 'lion.svga', byteLength: sigLion.byteLength, contentHash: sigLion.contentHash, magicFormat: sigLion.magicFormat },
    { id: 11, name: 'lion (1).svga', byteLength: sigLion.byteLength, contentHash: sigLion.contentHash, magicFormat: sigLion.magicFormat },
  ];

  const normalMode = evaluateIncomingGiftsWithToggle(items, false);
  assert.equal(normalMode.filterEnabled, false);
  assert.equal(normalMode.hasDuplicates, false);
  assert.deepEqual(normalMode.keepIds, [10, 11]);
  assert.deepEqual(normalMode.removeIds, []);

  const activeFilterMode = evaluateIncomingGiftsWithToggle(items, true);
  assert.equal(activeFilterMode.filterEnabled, true);
  assert.equal(activeFilterMode.hasDuplicates, true);
  assert.deepEqual(activeFilterMode.keepIds, [10]);
  assert.deepEqual(activeFilterMode.removeIds, [11]);
});

test('computeGiftPagination splits large uploads into 50-item pages and supports showAll mode', () => {
  const mockItems = Array.from({ length: 125 }, (_, idx) => ({ id: idx + 1, name: `gift_${idx + 1}.svga` }));

  // Page 1: items 1..50
  const p1 = computeGiftPagination(mockItems, 1, 50, false);
  assert.equal(p1.totalItems, 125);
  assert.equal(p1.totalPages, 3);
  assert.equal(p1.currentPage, 1);
  assert.equal(p1.displayFrom, 1);
  assert.equal(p1.displayTo, 50);
  assert.equal(p1.visibleItems.length, 50);
  assert.equal(p1.visibleItems[0].id, 1);
  assert.equal(p1.visibleItems[49].id, 50);
  assert.equal(p1.isPaginated, true);

  // Page 2: items 51..100
  const p2 = computeGiftPagination(mockItems, 2, 50, false);
  assert.equal(p2.currentPage, 2);
  assert.equal(p2.displayFrom, 51);
  assert.equal(p2.displayTo, 100);
  assert.equal(p2.visibleItems.length, 50);
  assert.equal(p2.visibleItems[0].id, 51);
  assert.equal(p2.visibleItems[49].id, 100);

  // Page 3: items 101..125 (25 items)
  const p3 = computeGiftPagination(mockItems, 3, 50, false);
  assert.equal(p3.currentPage, 3);
  assert.equal(p3.displayFrom, 101);
  assert.equal(p3.displayTo, 125);
  assert.equal(p3.visibleItems.length, 25);
  assert.equal(p3.visibleItems[0].id, 101);
  assert.equal(p3.visibleItems[24].id, 125);

  // Show All mode: all 125 items on 1 view
  const allMode = computeGiftPagination(mockItems, 2, 50, true);
  assert.equal(allMode.totalPages, 1);
  assert.equal(allMode.currentPage, 1);
  assert.equal(allMode.visibleItems.length, 125);
  assert.equal(allMode.showAll, true);
  assert.equal(allMode.isPaginated, false);
});
