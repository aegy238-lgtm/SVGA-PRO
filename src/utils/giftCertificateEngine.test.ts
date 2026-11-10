import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CERTIFICATE_FIXED_FOOTER_AR,
  CERTIFICATE_TITLE_PHRASE_AR,
  PLATFORM_BRAND_NAME_AR,
  buildPdfBinaryFromJpegBytes,
  computeCertificateChecksum,
  generateUniqueCertificateId,
  isGlobalAdminCertificateEnabled,
  issueAndAutoAttachGiftCertificate,
  issueGiftCertificate,
  loadCertificateAutoSettings,
  setGlobalAdminCertificateEnabled,
  validateCertificateIdSignature,
  verifyGiftCertificateByIdSync,
} from './giftCertificateEngine';

test('Admin Dashboard Master Switch closes Gift Certificate completely by default and only enables when opened', async () => {
  // Default state is closed (false) so no certificate downloads for any user (even Super Admin) until opened
  setGlobalAdminCertificateEnabled(false);
  assert.equal(isGlobalAdminCertificateEnabled(), false);
  assert.equal(loadCertificateAutoSettings().enabled, false);

  const blockedCert = await issueAndAutoAttachGiftCertificate({
    giftFileName: 'Blocked_When_Closed.svga',
    fileFormat: 'SVGA',
    skipAutoDownload: true,
  });
  assert.equal(blockedCert, null);

  // When Admin opens the certificate from the Admin Dashboard
  setGlobalAdminCertificateEnabled(true);
  assert.equal(isGlobalAdminCertificateEnabled(), true);
  assert.equal(loadCertificateAutoSettings().enabled, true);

  const issuedCert = await issueAndAutoAttachGiftCertificate({
    giftFileName: 'Allowed_When_Open.svga',
    fileFormat: 'SVGA',
    skipAutoDownload: true,
  });
  assert.ok(issuedCert);
  assert.equal(issuedCert?.giftName, 'Allowed When Open');

  // Reset back to closed default
  setGlobalAdminCertificateEnabled(false);
});

test('generateUniqueCertificateId produces valid self-verifying Certificate IDs for all supported gift formats', () => {
  const formats = ['SVGA', 'SVG', 'GIF', 'MP4', 'WebP', 'PNG', 'ZIP', 'PAG'];
  const fixedDate = new Date('2026-11-09T15:00:00Z');
  const seen = new Set<string>();

  for (const fmt of formats) {
    const { certificateId, checksumCode } = generateUniqueCertificateId(fmt, fixedDate);
    assert.ok(certificateId.startsWith('AHM-20261109-'));
    assert.equal(checksumCode.length, 4);
    assert.ok(!seen.has(certificateId), 'Certificate ID should be unique');
    seen.add(certificateId);

    const validation = validateCertificateIdSignature(certificateId);
    assert.equal(validation.isValidSignature, true);
    assert.equal(validation.checksumCode, checksumCode);
  }
});

test('validateCertificateIdSignature rejects tampered Certificate IDs', () => {
  const { certificateId } = generateUniqueCertificateId('SVGA');
  const tampered =
    certificateId.slice(0, -1) + (certificateId.endsWith('A') ? 'B' : 'A');
  const check = validateCertificateIdSignature(tampered);
  assert.equal(check.isValidSignature, false);
});

test('issueGiftCertificate includes all required fields and exact mandatory footer legal statement', () => {
  const rec = issueGiftCertificate({
    giftName: 'Royal_Lion_King.svga',
    fileFormat: 'SVGA',
    designerName: 'المصمم أحمد',
  });

  assert.equal(rec.platformName, PLATFORM_BRAND_NAME_AR);
  assert.equal(rec.titlePhrase, CERTIFICATE_TITLE_PHRASE_AR);
  assert.equal(rec.giftName, 'Royal Lion King');
  assert.equal(rec.designerName, 'المصمم أحمد');
  assert.equal(rec.fileFormat, 'SVGA');
  assert.equal(
    rec.footerLegalStatement,
    'تم توثيق هذا التصميم من خلال منصة المصمم أحمد للهدايا، ويُستخدم رقم التوثيق للتعرف على مصدر التصميم والتحقق من بيانات الشهادة.'
  );
  assert.equal(rec.footerLegalStatement, CERTIFICATE_FIXED_FOOTER_AR);
  assert.ok(rec.ipStatement.includes('المصمم أحمد للهدايا'));

  const verification = verifyGiftCertificateByIdSync(rec.certificateId);
  assert.equal(verification.valid, true);
  assert.ok(verification.record);
  assert.equal(verification.record?.certificateId, rec.certificateId);
});

test('buildPdfBinaryFromJpegBytes generates a standards-compliant PDF 1.4 document', () => {
  const rec = issueGiftCertificate({
    giftName: 'Golden_Castle.mp4',
    fileFormat: 'MP4',
  });
  const dummyJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const pdfBytes = buildPdfBinaryFromJpegBytes(dummyJpeg, 2000, 1414, rec);
  const text = new TextDecoder().decode(pdfBytes);

  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes('/Subtype /Image'));
  assert.ok(text.includes('/Filter /DCTDecode'));
  assert.ok(text.includes(rec.certificateId));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.equal(computeCertificateChecksum('AHM-20261109-SV1234').length, 4);
});
