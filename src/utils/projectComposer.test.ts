import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProjectComposerState,
  DEFAULT_LAYER_TRANSFORM,
  moveOverlayLayerUp,
  moveOverlayLayerDown,
  moveOverlayLayerToTop,
  moveOverlayLayerToBottom,
  getUnifiedVisualLayerStack,
} from './projectComposer.ts';

test('moveOverlayLayerUp promotes top below layer to above main project', () => {
  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'layer1',
    directDragEnabled: true,
    overlays: [
      {
        id: 'layer1',
        name: 'Layer 1',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'below',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const next = moveOverlayLayerUp(state, 'layer1');
  assert.equal(next.overlays[0].zOrder, 'above');
});

test('moveOverlayLayerDown demotes lowest above layer to below main project', () => {
  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'layer1',
    directDragEnabled: true,
    overlays: [
      {
        id: 'layer1',
        name: 'Layer 1',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'above',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const next = moveOverlayLayerDown(state, 'layer1');
  assert.equal(next.overlays[0].zOrder, 'below');
});

test('moveOverlayLayerToTop & moveOverlayLayerToBottom reorders stack correctly', () => {
  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'layer1',
    directDragEnabled: true,
    overlays: [
      {
        id: 'l1',
        name: 'L1',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'below',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
      {
        id: 'l2',
        name: 'L2',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'above',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const topState = moveOverlayLayerToTop(state, 'l1');
  assert.equal(topState.overlays[1].id, 'l1');
  assert.equal(topState.overlays[1].zOrder, 'above');

  const bottomState = moveOverlayLayerToBottom(state, 'l2');
  assert.equal(bottomState.overlays[0].id, 'l2');
  assert.equal(bottomState.overlays[0].zOrder, 'below');
});

test('getUnifiedVisualLayerStack lists items in visual rendering sequence from top to bottom', () => {
  const state: ProjectComposerState = {
    primaryTransform: { ...DEFAULT_LAYER_TRANSFORM },
    activeTargetId: 'primary',
    directDragEnabled: true,
    overlays: [
      {
        id: 'under',
        name: 'Underlay Layer',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'below',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
      {
        id: 'over',
        name: 'Overlay Layer',
        format: 'PNG',
        width: 100,
        height: 100,
        fps: 30,
        frames: 1,
        duration: 1,
        zOrder: 'above',
        fitMode: 'contain',
        alphaMode: 'auto',
        transform: { ...DEFAULT_LAYER_TRANSFORM },
      },
    ],
  };

  const stack = getUnifiedVisualLayerStack(state, 'Primary Movie');
  assert.equal(stack.length, 3);
  assert.equal(stack[0].id, 'over'); // Topmost layer
  assert.equal(stack[1].id, 'primary'); // Middle primary project
  assert.equal(stack[2].id, 'under'); // Bottommost layer
});
