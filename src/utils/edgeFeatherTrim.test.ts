import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTrimRange, formatDurationSec, INITIAL_EDGE_FEATHER } from './edgeFeather';

describe('EdgeFeather Duration Trimming Suite', () => {
  it('has initial trim disabled and zero boundaries by default', () => {
    assert.equal(INITIAL_EDGE_FEATHER.trimEnabled, false);
    assert.equal(INITIAL_EDGE_FEATHER.trimStartTime, 0);
    assert.equal(INITIAL_EDGE_FEATHER.trimEndTime, 0);
  });

  it('formats duration in seconds and minutes cleanly', () => {
    assert.equal(formatDurationSec(0), '0.00s');
    assert.equal(formatDurationSec(2.5), '2.50s');
    assert.equal(formatDurationSec(4.004), '4.00s');
    assert.equal(formatDurationSec(65.5), '1m 5.50s');
    assert.equal(formatDurationSec(120), '2m 0.00s');
  });

  it('calculates trim range accurately with FPS and frames clamp', () => {
    const range = calculateTrimRange({
      totalDuration: 4.0,
      totalFrames: 60,
      fps: 15,
      startTime: 1.0,
      endTime: 3.0,
    });

    assert.equal(range.startTime, 1.0);
    assert.equal(range.endTime, 3.0);
    assert.equal(range.duration, 2.0);
    assert.equal(range.startFrame, 15);
    assert.equal(range.endFrame, 45);
    assert.equal(range.frameCount, 30);
  });

  it('clamps invalid or out-of-bound start and end times safely', () => {
    const clamped = calculateTrimRange({
      totalDuration: 5.0,
      totalFrames: 100,
      fps: 20,
      startTime: -2.0,
      endTime: 10.0,
    });

    assert.equal(clamped.startTime, 0);
    assert.equal(clamped.endTime, 5.0);
    assert.equal(clamped.startFrame, 0);
    assert.equal(clamped.endFrame, 100);
    assert.equal(clamped.duration, 5.0);
    assert.equal(clamped.frameCount, 100);
  });

  it('preserves minimal non-zero duration when start equals end', () => {
    const minimal = calculateTrimRange({
      totalDuration: 6.0,
      totalFrames: 90,
      fps: 15,
      startTime: 2.5,
      endTime: 2.5,
    });

    assert(minimal.duration > 0, 'Duration must be positive');
    assert(minimal.endTime > minimal.startTime, 'End time must be greater than start time');
    assert(minimal.endFrame > minimal.startFrame, 'End frame must be greater than start frame');
  });
});
