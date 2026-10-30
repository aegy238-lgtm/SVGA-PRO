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
  assert.equal(shouldShowGuideBookButton('gold-designer'), false);
});

test('isQuickExportKeyEvent detects Tab, ArrowLeft, and ControlLeft when not typing in text inputs or open modals', () => {
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

  // Standalone Left Control triggers export
  const ctrlLeftOnBody = isQuickExportKeyEvent({
    key: 'Control',
    code: 'ControlLeft',
    ctrlKey: true,
    targetTagName: 'BODY',
  });
  assert.equal(ctrlLeftOnBody.shouldExport, true);
  assert.equal(ctrlLeftOnBody.triggerType, 'ctrl_left');

  // Pressing ANY regular key (letters, numbers, Space, Enter, Escape, Backspace, etc.) NEVER triggers export
  for (const k of ['a', 's', 'd', '1', ' ', 'Enter', 'Escape', 'Backspace', 'ArrowRight', 'Shift']) {
    const res = isQuickExportKeyEvent({
      key: k,
      targetTagName: 'BODY',
    });
    assert.equal(res.shouldExport, false, `Key "${k}" must not trigger export`);
  }
});

test('GUIDE_BOOK_CHAPTERS documents all platform features including Smart Duplicate Detection, ZIP Extraction, PRO Free Attempts, and 3D Gold Name Designer', () => {
  assert.equal(GUIDE_BOOK_CHAPTERS.length, 6);
  const chapterIds = GUIDE_BOOK_CHAPTERS.map((c) => c.id);
  assert.deepEqual(chapterIds, [
    'motion_converter',
    'gifts_studio',
    'gift_image_creator',
    'svga_ae_editor',
    'pro_and_system',
    'gold_name_designer',
  ]);

  for (const ch of GUIDE_BOOK_CHAPTERS) {
    assert.ok(ch.id);
    assert.ok(ch.titleAr.length > 5);
    assert.ok(ch.titleEn.length > 5);
    assert.ok(ch.callouts.length >= 3);
    assert.ok(ch.shortcuts.length >= 1);
  }

  // Verify Gifts Studio chapter explicitly documents the Blue Duplicate Toggle & 50-Frame Pagination
  const giftsChapter = GUIDE_BOOK_CHAPTERS.find((c) => c.id === 'gifts_studio')!;
  assert.equal(giftsChapter.callouts.length, 5);
  assert.ok(giftsChapter.callouts[0].titleAr.includes('فحص المكرر'));
  assert.ok(giftsChapter.callouts[0].titleAr.includes('الأزرق'));
  assert.ok(giftsChapter.callouts[0].descAr.includes('نسخة واحدة فقط'));
  assert.ok(giftsChapter.callouts[0].titleEn.toLowerCase().includes('duplicate'));
  assert.ok(giftsChapter.callouts[1].titleAr.includes('50 إطار'));
  assert.ok(giftsChapter.callouts[1].descAr.includes('عرض كل الملفات'));
});

