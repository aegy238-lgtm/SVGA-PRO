import test from 'node:test';
import assert from 'node:assert/strict';
import { compute1DFeatherProfile } from './edgeFeather';

test('compute1DFeatherProfile feathers top/start margin while keeping center opaque', () => {
  const prof = compute1DFeatherProfile(100, 20, 0, 100, false);
  assert.equal(prof.length, 100);
  // Start edge should be 0 (transparent)
  assert.equal(prof[0], 0);
  // Center and end edge should be 1 (opaque)
  assert.equal(prof[60], 1);
  assert.equal(prof[99], 1);
});

test('compute1DFeatherProfile applies symmetric edge feather when all margins are 0 and radius > 0', () => {
  const prof = compute1DFeatherProfile(100, 0, 0, 60, true);
  assert.equal(prof[0], 0);
  assert.ok(prof[50] > 0.99);
  assert.equal(prof[99], 0);
});
