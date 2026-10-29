import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldShowGuideBookButton,
  isQuickExportKeyEvent,
  GUIDE_BOOK_CHAPTERS,
} from './guideBookData';

test('shouldShowGuideBookButton returns true only on home view and hides on all feature views', () => {
  assert.equal(shouldShowGuideBookButton('home'), true);
  assert.equal(shouldShowGuideBookButton(''), true);
  assert.equal(shouldShowGuideBookButton(null), true);

  // Entering any feature hides the book button immediately
  assert.equal(shouldShowGuideBookButton('convert'), false);
  assert.equal(shouldShowGuideBookButton('editor'), false);
  assert.equal(shouldShowGuideBookButton('gifts'), false);
  assert.equal(shouldShowGuideBookButton('gift-image'), false);
});

test('isQuickExportKeyEvent detects Tab and ArrowLeft when not typing in text inputs or open modals', () => {
  // Pressing Tab on body or button triggers export
  const tabOnBody = isQuickExportKeyEvent({
    key: 'Tab',
    targetTagName: 'BODY',
  });
  assert.equal(tabOnBody.shouldExport, true);
  assert.equal(tabOnBody.triggerType, 'tab');

  // Pressing ArrowLeft on stage triggers export
  const leftOnDiv = isQuickExportKeyEvent({
    key: 'ArrowLeft',
    targetTagName: 'DIV',
  });
  assert.equal(leftOnDiv.shouldExport, true);
  assert.equal(leftOnDiv.triggerType, 'arrow_left');

  // Pressing Tab or ArrowLeft inside a text input does NOT hijack typing
  const tabInInput = isQuickExportKeyEvent({
    key: 'Tab',
    targetTagName: 'INPUT',
    targetType: 'text',
  });
  assert.equal(tabInInput.shouldExport, false);

  const leftInNumberInput = isQuickExportKeyEvent({
    key: 'ArrowLeft',
    targetTagName: 'INPUT',
    targetType: 'number',
  });
  assert.equal(leftInNumberInput.shouldExport, false);

  // Pressing Tab when a modal is open does NOT trigger background export
  const tabWithModal = isQuickExportKeyEvent({
    key: 'Tab',
    targetTagName: 'BODY',
    hasOpenModal: true,
  });
  assert.equal(tabWithModal.shouldExport, false);
});

test('GUIDE_BOOK_CHAPTERS contains complete bilingual visual chapters and callouts for all platform features', () => {
  assert.ok(GUIDE_BOOK_CHAPTERS.length >= 4);
  for (const ch of GUIDE_BOOK_CHAPTERS) {
    assert.ok(ch.id);
    assert.ok(ch.titleAr.length > 5);
    assert.ok(ch.titleEn.length > 5);
    assert.ok(ch.callouts.length >= 3);
    assert.ok(ch.shortcuts.length >= 1);
  }
});
