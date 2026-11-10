import React, { useEffect, useRef, useState } from 'react';
import {
  CERTIFICATE_FIXED_FOOTER_AR,
  CERTIFICATE_IP_STATEMENT_AR,
  CERTIFICATE_TITLE_PHRASE_AR,
  CertificateVerificationResult,
  GiftCertificateAutoSettings,
  GiftCertificateRecord,
  PLATFORM_BRAND_NAME_AR,
  fetchRecentCertificatesFromFirestore,
  generateCertificatePdfBlob,
  generateCertificatePngBlob,
  issueGiftCertificate,
  loadCertificateAutoSettings,
  loadIssuedCertificatesRegistry,
  renderGiftCertificateToCanvas,
  saveCertificateAutoSettings,
  triggerCertificateBlobDownload,
  verifyGiftCertificateByIdAsync,
  verifyGiftCertificateByIdSync,
} from '../utils/giftCertificateEngine';

interface GiftCertificateStudioModalProps {
  open: boolean;
  onClose: () => void;
  initialCertificateId?: string;
  defaultDesignerName?: string;
}

export const GiftCertificateStudioModal: React.FC<GiftCertificateStudioModalProps> = ({
  open,
  onClose,
  initialCertificateId,
  defaultDesignerName,
}) => {
  const [activeTab, setActiveTab] = useState<'verify' | 'registry' | 'settings'>('verify');
  const [queryId, setQueryId] = useState<string>('');
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] =
    useState<CertificateVerificationResult | null>(null);
  const [certificates, setCertificates] = useState<GiftCertificateRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<GiftCertificateRecord | null>(null);
  const [autoSettings, setAutoSettings] = useState<GiftCertificateAutoSettings>(() =>
    loadCertificateAutoSettings()
  );
  const [customGiftName, setCustomGiftName] = useState<string>('هدية الأسد الملكي الذهبي');
  const [customFormat, setCustomFormat] = useState<string>('SVGA');
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [downloadingType, setDownloadingType] = useState<'png' | 'pdf' | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const showToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => {
      setStatusToast((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  useEffect(() => {
    if (!open) return;
    const localList = loadIssuedCertificatesRegistry();
    setCertificates(localList);
    setAutoSettings(loadCertificateAutoSettings());

    if (initialCertificateId && initialCertificateId.trim()) {
      setQueryId(initialCertificateId.trim());
      const res = verifyGiftCertificateByIdSync(initialCertificateId.trim());
      setVerificationResult(res);
      if (res.record) {
        setSelectedRecord(res.record);
      }
      setActiveTab('verify');
    } else if (localList.length > 0) {
      setSelectedRecord(localList[0]);
      setQueryId(localList[0].certificateId);
      setVerificationResult({
        valid: true,
        statusType: 'verified_registry',
        record: localList[0],
        messageAr: 'شهادة توثيق صحيحة ومعتمدة رسمياً في سجل منصة المصمم أحمد للهدايا.',
      });
    } else {
      // Create a sample preview record so the user immediately sees the 3D Royal Certificate design
      const demo = issueGiftCertificate({
        giftName: 'هدية القصر الملكي الفاخر VIP',
        fileFormat: 'SVGA',
        designerName: defaultDesignerName || PLATFORM_BRAND_NAME_AR,
        sourceStudio: 'منصة المصمم أحمد للهدايا',
      });
      const updated = loadIssuedCertificatesRegistry();
      setCertificates(updated);
      setSelectedRecord(demo);
      setQueryId(demo.certificateId);
      setVerificationResult({
        valid: true,
        statusType: 'verified_registry',
        record: demo,
        messageAr: 'شهادة توثيق صحيحة ومعتمدة رسمياً في سجل منصة المصمم أحمد للهدايا.',
      });
    }

    void fetchRecentCertificatesFromFirestore().then((merged) => {
      if (merged && merged.length > 0) {
        setCertificates(merged);
      }
    });
  }, [open, initialCertificateId, defaultDesignerName]);

  useEffect(() => {
    if (!open || !selectedRecord || !previewCanvasRef.current) return;
    renderGiftCertificateToCanvas(selectedRecord, previewCanvasRef.current);
  }, [open, selectedRecord, activeTab]);

  if (!open) return null;

  const handleVerifySubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = queryId.trim();
    if (!trimmed) {
      setVerificationResult({
        valid: false,
        statusType: 'invalid',
        messageAr: 'يرجى إدخال رقم التوثيق الفريد (Certificate ID) للتحقق من الشهادة.',
      });
      return;
    }
    setVerifying(true);
    try {
      const res = await verifyGiftCertificateByIdAsync(trimmed);
      setVerificationResult(res);
      if (res.record) {
        setSelectedRecord(res.record);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleDownloadPng = async (rec: GiftCertificateRecord) => {
    setDownloadingType('png');
    try {
      const blob = await generateCertificatePngBlob(rec);
      triggerCertificateBlobDownload(blob, `شهادة_توثيق_${rec.certificateId}.png`);
      showToast(`✅ تم تحميل شهادة التوثيق بصيغة PNG عالية الجودة (${rec.certificateId})`);
    } catch {
      showToast('⚠️ تعذر تصدير صورة الشهادة');
    } finally {
      setDownloadingType(null);
    }
  };

  const handleDownloadPdf = async (rec: GiftCertificateRecord) => {
    setDownloadingType('pdf');
    try {
      const blob = await generateCertificatePdfBlob(rec);
      triggerCertificateBlobDownload(blob, `شهادة_توثيق_${rec.certificateId}.pdf`);
      showToast(`✅ تم تحميل شهادة التوثيق بصيغة PDF الرسمية (${rec.certificateId})`);
    } catch {
      showToast('⚠️ تعذر تصدير ملف PDF للشهادة');
    } finally {
      setDownloadingType(null);
    }
  };

  const handleCopyCertificateId = (id: string) => {
    try {
      navigator.clipboard.writeText(id);
      showToast(`📋 تم نسخ رقم التوثيق: ${id}`);
    } catch {
      showToast(`رقم التوثيق: ${id}`);
    }
  };

  const handleIssueManualCertificate = () => {
    const rec = issueGiftCertificate({
      giftName: customGiftName.trim() || 'تصميم هدية ملكية',
      fileFormat: customFormat,
      designerName:
        autoSettings.customDesignerName.trim() ||
        defaultDesignerName ||
        PLATFORM_BRAND_NAME_AR,
      sourceStudio: 'إصدار توثيق مباشر – منصة المصمم أحمد للهدايا',
    });
    const updated = loadIssuedCertificatesRegistry();
    setCertificates(updated);
    setSelectedRecord(rec);
    setQueryId(rec.certificateId);
    setVerificationResult({
      valid: true,
      statusType: 'verified_registry',
      record: rec,
      messageAr: 'تم إصدار وتوثيق الشهادة الرقمية بنجاح في منصة المصمم أحمد للهدايا.',
    });
    setActiveTab('verify');
    showToast(`👑 تم إصدار شهادة التوثيق بنجاح برقم: ${rec.certificateId}`);
  };

  const updateSettings = (patch: Partial<GiftCertificateAutoSettings>) => {
    const next = { ...autoSettings, ...patch };
    setAutoSettings(next);
    saveCertificateAutoSettings(next);
    showToast('✅ تم حفظ إعدادات التوثيق التلقائي للشهادات');
  };

  return (
    <div
      id="giftCertificateStudioModal"
      role="dialog"
      aria-modal="true"
      dir="rtl"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-3 md:p-6 backdrop-blur-md overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-6xl rounded-2xl border border-amber-500/40 bg-[#070b18] text-slate-100 shadow-[0_25px_90px_rgba(0,0,0,0.95)] overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Top Royal Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-gradient-to-l from-[#0a1329] via-[#0f1d3d] to-[#070b18] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/60 bg-gradient-to-br from-amber-500/25 to-amber-900/30 text-2xl shadow-inner">
              👑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-black text-amber-300 tracking-wide">
                  نظام شهادة توثيق الهدايا — {PLATFORM_BRAND_NAME_AR}
                </h2>
                <span className="rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-extrabold text-amber-200">
                  3D ROYAL CERTIFICATE
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                إصدار تلقائي لشهادات التوثيق الرقمية ثلاثية الأبعاد (PNG & PDF) مع التحقق الفوري برقم التوثيق الفريد (Certificate ID)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('verify')}
              className={`rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
                activeTab === 'verify'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md'
                  : 'border border-slate-700 bg-slate-900/80 text-slate-200 hover:border-amber-500/50'
              }`}
            >
              🔍 التحقق من التوثيق ومعاينة الشهادة
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('registry')}
              className={`rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
                activeTab === 'registry'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md'
                  : 'border border-slate-700 bg-slate-900/80 text-slate-200 hover:border-amber-500/50'
              }`}
            >
              📜 سجل الشهادات ({certificates.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
                activeTab === 'settings'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md'
                  : 'border border-slate-700 bg-slate-900/80 text-slate-200 hover:border-amber-500/50'
              }`}
            >
              ⚙️ إعدادات الإرفاق التلقائي
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs font-extrabold text-rose-200 hover:bg-rose-900/70"
            >
              ✕ إغلاق
            </button>
          </div>
        </div>

        {statusToast && (
          <div className="bg-amber-500/20 border-b border-amber-400/40 px-5 py-2 text-center text-xs font-extrabold text-amber-200">
            {statusToast}
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
          {activeTab === 'verify' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Right Column: Verification Search & Official Certificate Details */}
              <div className="lg:col-span-5 space-y-4">
                <form
                  onSubmit={handleVerifySubmit}
                  className="rounded-xl border border-amber-500/35 bg-[#0b1328] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-amber-300 flex items-center gap-1.5">
                      <span>🛡️</span>
                      <span>التحقق من صحة شهادة التوثيق (Certificate ID)</span>
                    </h3>
                    <span className="text-[11px] font-mono text-blue-300">Instant Verify</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    أدخل رقم التوثيق الفريد المطبوع على الشهادة للتأكد من صحة صدورها واعتماد التصميم من منصة المصمم أحمد للهدايا:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="certificateVerifyInput"
                      dir="ltr"
                      value={queryId}
                      onChange={(e) => setQueryId(e.target.value)}
                      placeholder="AHM-20261109-XXXXXX-XXXX"
                      className="flex-1 rounded-lg border border-amber-500/40 bg-[#050914] px-3 py-2.5 font-mono text-xs md:text-sm font-bold text-amber-200 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      id="certificateVerifyBtn"
                      disabled={verifying}
                      className="rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:brightness-110 disabled:opacity-50 shrink-0"
                    >
                      {verifying ? 'جاري الفحص...' : 'تحقق الآن ✓'}
                    </button>
                  </div>

                  {/* Verification Result Status Banner */}
                  {verificationResult && (
                    <div
                      id="certificateVerifyStatusCard"
                      className={`rounded-lg border p-3 text-xs ${
                        verificationResult.valid
                          ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200'
                          : 'border-rose-500/50 bg-rose-950/40 text-rose-200'
                      }`}
                    >
                      <div className="font-black flex items-center gap-1.5 text-sm mb-1">
                        <span>{verificationResult.valid ? '✅' : '❌'}</span>
                        <span>
                          {verificationResult.valid
                            ? 'شهادة توثيق صحيحة ومعتمدة'
                            : 'تعذر التحقق من رقم الشهادة'}
                        </span>
                      </div>
                      <p className="leading-relaxed text-slate-200">
                        {verificationResult.messageAr}
                      </p>
                    </div>
                  )}
                </form>

                {/* Certificate Metadata Summary Card */}
                {selectedRecord && (
                  <div className="rounded-xl border border-amber-500/30 bg-[#0b1328] p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <span className="text-xs font-black text-amber-300">
                        📋 بيانات الشهادة المعتمدة
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyCertificateId(selectedRecord.certificateId)}
                        className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-500/20"
                      >
                        📋 نسخ رقم التوثيق
                      </button>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center rounded-lg bg-[#060b19] px-3 py-2 border border-slate-800/80">
                        <span className="text-slate-400">اسم المنصة:</span>
                        <span className="font-black text-amber-300">
                          {selectedRecord.platformName}
                        </span>
                      </div>
                      <div className="flex justify-between items-center rounded-lg bg-[#060b19] px-3 py-2 border border-slate-800/80">
                        <span className="text-slate-400">نوع الوثيقة:</span>
                        <span className="font-bold text-slate-100">
                          {selectedRecord.titlePhrase}
                        </span>
                      </div>
                      <div className="flex justify-between items-center rounded-lg bg-[#060b19] px-3 py-2 border border-slate-800/80">
                        <span className="text-slate-400">اسم الهدية:</span>
                        <span className="font-black text-white">{selectedRecord.giftName}</span>
                      </div>
                      <div className="flex justify-between items-center rounded-lg bg-[#060b19] px-3 py-2 border border-amber-500/30">
                        <span className="text-slate-400">رقم التوثيق الفريد:</span>
                        <span className="font-mono font-black text-amber-300" dir="ltr">
                          {selectedRecord.certificateId}
                        </span>
                      </div>
                      <div className="flex justify-between items-center rounded-lg bg-[#060b19] px-3 py-2 border border-slate-800/80">
                        <span className="text-slate-400">اسم المصمم / صاحب التصميم:</span>
                        <span className="font-bold text-slate-100">
                          {selectedRecord.designerName}
                        </span>
                      </div>
                      <div className="flex justify-between items-center rounded-lg bg-[#060b19] px-3 py-2 border border-slate-800/80">
                        <span className="text-slate-400">تاريخ إصدار الشهادة:</span>
                        <span className="font-mono font-bold text-slate-200" dir="ltr">
                          {selectedRecord.issueDateFormatted}
                        </span>
                      </div>
                      <div className="flex justify-between items-center rounded-lg bg-[#060b19] px-3 py-2 border border-slate-800/80">
                        <span className="text-slate-400">صيغة ملف الهدية:</span>
                        <span className="font-mono font-black text-blue-300">
                          {selectedRecord.fileFormat}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-amber-500/25 bg-[#060a17] p-2.5 text-[11px] text-slate-300 leading-relaxed">
                      <div className="font-bold text-amber-300 mb-0.5">⚖️ حقوق الملكية الفكرية:</div>
                      <div>{selectedRecord.ipStatement || CERTIFICATE_IP_STATEMENT_AR}</div>
                    </div>

                    <div className="rounded-lg border border-blue-500/25 bg-blue-950/20 p-2.5 text-[11px] text-amber-200 font-bold leading-relaxed text-center">
                      {CERTIFICATE_FIXED_FOOTER_AR}
                    </div>
                  </div>
                )}
              </div>

              {/* Left Column: Live 3D Royal Certificate Canvas & High-Res Export Buttons */}
              <div className="lg:col-span-7 space-y-4">
                <div className="rounded-xl border border-amber-500/40 bg-[#091022] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-amber-300">
                        👑 المعاينة الملكية ثلاثية الأبعاد (3D Royal Accreditation Certificate)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        تصميم ملكي فاخر باللون الأسود والذهبي والأزرق الداكن مع ختم توثيق ذهبي ثلاثي الأبعاد وشعار منصة المصمم أحمد للهدايا
                      </p>
                    </div>
                    {selectedRecord && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          id="downloadCertPngBtn"
                          disabled={downloadingType !== null}
                          onClick={() => handleDownloadPng(selectedRecord)}
                          className="rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 px-3.5 py-2 text-xs font-black text-slate-950 shadow hover:brightness-110 disabled:opacity-50"
                        >
                          {downloadingType === 'png' ? 'جاري التحميل...' : '🖼️ تحميل PNG عالي الجودة'}
                        </button>
                        <button
                          type="button"
                          id="downloadCertPdfBtn"
                          disabled={downloadingType !== null}
                          onClick={() => handleDownloadPdf(selectedRecord)}
                          className="rounded-lg border border-amber-400/60 bg-amber-500/15 px-3.5 py-2 text-xs font-black text-amber-200 hover:bg-amber-500/25 disabled:opacity-50"
                        >
                          {downloadingType === 'pdf' ? 'جاري التحميل...' : '📄 تحميل PDF رسمي'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* High-DPI Canvas Container */}
                  <div className="relative overflow-hidden rounded-xl border-2 border-amber-500/50 bg-black shadow-[0_15px_50px_rgba(0,0,0,0.85)]">
                    <canvas
                      ref={previewCanvasRef}
                      id="giftCertificatePreviewCanvas"
                      className="w-full h-auto block"
                    />
                  </div>

                  {/* Quick Test / Manual Certificate Issuance Bar */}
                  <div className="rounded-xl border border-slate-800 bg-[#060b18] p-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-300">
                      ✨ تجربة إصدار شهادة توثيق فورية لهدية جديدة:
                    </div>
                    <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
                      <input
                        type="text"
                        value={customGiftName}
                        onChange={(e) => setCustomGiftName(e.target.value)}
                        placeholder="اسم الهدية..."
                        className="flex-1 min-w-[160px] rounded-lg border border-slate-700 bg-[#0b1328] px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                      />
                      <select
                        value={customFormat}
                        onChange={(e) => setCustomFormat(e.target.value)}
                        className="rounded-lg border border-slate-700 bg-[#0b1328] px-2.5 py-1.5 text-xs font-mono font-bold text-amber-300"
                      >
                        <option value="SVGA">SVGA</option>
                        <option value="MP4">MP4</option>
                        <option value="GIF">GIF</option>
                        <option value="WEBP">WebP</option>
                        <option value="PNG">PNG</option>
                        <option value="SVG">SVG</option>
                        <option value="ZIP">ZIP Package</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleIssueManualCertificate}
                        className="rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-extrabold text-amber-200 hover:bg-amber-500/30"
                      >
                        + إصدار شهادة توثيق
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'registry' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-[#0b1328] p-4">
                <div>
                  <h3 className="text-sm font-black text-amber-300">
                    📜 سجل شهادات توثيق الهدايا الصادرة تلقائياً ({certificates.length})
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    يتم حفظ كل شهادة توثيق تصدر عند تصدير أي هدية بأي صيغة (SVGA, SVG, GIF, MP4, WebP, PNG, ZIP) مع إمكانية التحقق منها أو إعادة تحميلها في أي وقت.
                  </p>
                </div>
              </div>

              {certificates.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-[#0b1328] p-8 text-center text-slate-400">
                  لا توجد شهادات مصدرة بعد. قم بتصدير أي هدية من المنصة ليتم إنشاء وإرفاق شهادة التوثيق تلقائياً.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-amber-500/30 bg-[#091022]">
                  <table className="w-full text-right text-xs">
                    <thead className="border-b border-amber-500/25 bg-[#060b18] text-amber-300">
                      <tr>
                        <th className="px-4 py-3 font-black">رقم التوثيق (Certificate ID)</th>
                        <th className="px-4 py-3 font-black">اسم الهدية</th>
                        <th className="px-4 py-3 font-black">اسم المصمم</th>
                        <th className="px-4 py-3 font-black">الصيغة</th>
                        <th className="px-4 py-3 font-black">تاريخ الإصدار</th>
                        <th className="px-4 py-3 font-black text-center">إجراءات التحميل والتحقق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {certificates.map((cert) => (
                        <tr
                          key={cert.certificateId}
                          className="hover:bg-amber-500/5 transition"
                        >
                          <td className="px-4 py-3 font-mono font-black text-amber-300" dir="ltr">
                            {cert.certificateId}
                          </td>
                          <td className="px-4 py-3 font-bold text-white">{cert.giftName}</td>
                          <td className="px-4 py-3 text-slate-300">{cert.designerName}</td>
                          <td className="px-4 py-3 font-mono font-bold text-blue-300">
                            {cert.fileFormat}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-300" dir="ltr">
                            {cert.issueDateFormatted}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRecord(cert);
                                  setQueryId(cert.certificateId);
                                  setVerificationResult({
                                    valid: true,
                                    statusType: 'verified_registry',
                                    record: cert,
                                    messageAr:
                                      'شهادة توثيق صحيحة ومعتمدة رسمياً في سجل منصة المصمم أحمد للهدايا.',
                                  });
                                  setActiveTab('verify');
                                }}
                                className="rounded border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 font-bold text-amber-200 hover:bg-amber-500/25"
                              >
                                👁️ معاينة
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadPng(cert)}
                                className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-bold text-emerald-200 hover:bg-emerald-500/25"
                              >
                                PNG
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadPdf(cert)}
                                className="rounded border border-blue-500/40 bg-blue-500/15 px-2.5 py-1 font-bold text-blue-200 hover:bg-blue-500/25"
                              >
                                PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto rounded-xl border border-amber-500/35 bg-[#0b1328] p-5 space-y-4">
              <h3 className="text-base font-black text-amber-300 border-b border-slate-800 pb-3">
                ⚙️ إعدادات نظام التصدير والإرفاق التلقائي للشهادات
              </h3>

              <div className="space-y-3 text-xs">
                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#060b18] p-3.5 cursor-pointer">
                  <div>
                    <div className="font-black text-white text-sm">
                      تفعيل إصدار شهادة التوثيق تلقائياً عند تصدير أي هدية
                    </div>
                    <div className="text-slate-400 mt-0.5">
                      يتم إنشاء شهادة توثيق رقمية برقم فريد (Certificate ID) مع كل عملية تصدير دون أي تأثير على جودة أو حجم أو شفافية الهدية.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSettings.enabled}
                    onChange={(e) => updateSettings({ enabled: e.target.checked })}
                    className="h-5 w-5 accent-amber-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#060b18] p-3.5 cursor-pointer">
                  <div>
                    <div className="font-black text-white text-sm">
                      تضمين الشهادة (PNG + PDF) تلقائياً داخل ملفات التصدير المضغوطة (ZIP)
                    </div>
                    <div className="text-slate-400 mt-0.5">
                      عند تصدير حزمة ZIP (مثل حزم After Effects أو صور الهدايا المجمعة أو تسلسل PNG)، يتم وضع الشهادة داخل مجلد التصدير مع ملف الهدية.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSettings.embedInZipArchives}
                    onChange={(e) => updateSettings({ embedInZipArchives: e.target.checked })}
                    className="h-5 w-5 accent-amber-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#060b18] p-3.5 cursor-pointer">
                  <div>
                    <div className="font-black text-white text-sm">
                      إرفاق وتحميل الشهادة تلقائياً عند تصدير ملف هدية منفرد (SVGA, MP4, GIF, WebP, PNG)
                    </div>
                    <div className="text-slate-400 mt-0.5">
                      يقوم بتحميل ملف الشهادة تلقائياً بالتوازي مع تحميل ملف الهدية المنفرد دون الحاجة لأي خطوة إضافية.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSettings.autoDownloadWithSingleFile}
                    onChange={(e) =>
                      updateSettings({ autoDownloadWithSingleFile: e.target.checked })
                    }
                    className="h-5 w-5 accent-amber-500"
                  />
                </label>

                <div className="rounded-xl border border-slate-800 bg-[#060b18] p-3.5 space-y-2">
                  <div className="font-black text-white text-sm">
                    صيغة الشهادة المرفقة تلقائياً مع الملفات المنفردة:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: 'png', label: '🖼️ صورة PNG عالية الجودة (موصى به)' },
                        { id: 'pdf', label: '📄 ملف PDF رسمي للطباعة' },
                        { id: 'both', label: '👑 إرفاق الصيغتين معاً (PNG + PDF)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateSettings({ preferredSingleFormat: opt.id })}
                        className={`rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
                          autoSettings.preferredSingleFormat === opt.id
                            ? 'bg-amber-500 text-slate-950'
                            : 'border border-slate-700 bg-slate-900 text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#060b18] p-3.5 space-y-2">
                  <label className="font-black text-white text-sm block">
                    اسم المصمم أو صاحب التصميم الافتراضي على الشهادة:
                  </label>
                  <input
                    type="text"
                    value={autoSettings.customDesignerName}
                    onChange={(e) => updateSettings({ customDesignerName: e.target.value })}
                    placeholder={defaultDesignerName || PLATFORM_BRAND_NAME_AR}
                    className="w-full rounded-lg border border-slate-700 bg-[#0b1328] px-3.5 py-2 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400">
                    في حال تركه فارغاً يتم استخدام اسم حسابك الحالي أو &quot;{PLATFORM_BRAND_NAME_AR}&quot; تلقائياً.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Non-intrusive Floating Notification Banner shown whenever a gift is exported,
 * confirming automatic certificate creation and offering 1-click PNG/PDF download & verification.
 */
export const GiftCertificateFloatingNotice: React.FC<{
  onOpenCertificateModal: (certificateId: string) => void;
}> = ({ onOpenCertificateModal }) => {
  const [latestCert, setLatestCert] = useState<GiftCertificateRecord | null>(null);
  const [busyFmt, setBusyFmt] = useState<'png' | 'pdf' | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<GiftCertificateRecord>).detail;
      if (detail && detail.certificateId) {
        setLatestCert(detail);
      }
    };
    window.addEventListener('giftcertificateissued', handler);
    return () => window.removeEventListener('giftcertificateissued', handler);
  }, []);

  if (!latestCert) return null;

  const handleQuickDownload = async (fmt: 'png' | 'pdf') => {
    setBusyFmt(fmt);
    try {
      if (fmt === 'png') {
        const b = await generateCertificatePngBlob(latestCert);
        triggerCertificateBlobDownload(b, `شهادة_توثيق_${latestCert.certificateId}.png`);
      } else {
        const b = await generateCertificatePdfBlob(latestCert);
        triggerCertificateBlobDownload(b, `شهادة_توثيق_${latestCert.certificateId}.pdf`);
      }
    } finally {
      setBusyFmt(null);
    }
  };

  return (
    <div
      id="giftCertificateFloatingBanner"
      dir="rtl"
      className="fixed bottom-4 right-4 z-[9500] max-w-md rounded-2xl border border-amber-400/60 bg-gradient-to-br from-[#070b18] via-[#0d1936] to-[#060913] p-3.5 text-slate-100 shadow-[0_16px_45px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/60 bg-amber-500/20 text-xl">
            👑
          </div>
          <div>
            <div className="text-xs font-black text-amber-300">
              تم إصدار وإرفاق شهادة توثيق الهدية تلقائياً ✓
            </div>
            <div className="text-[11px] font-bold text-white truncate max-w-[230px]">
              {latestCert.giftName} ({latestCert.fileFormat})
            </div>
            <div className="font-mono text-[11px] font-extrabold text-amber-200 mt-0.5" dir="ltr">
              ID: {latestCert.certificateId}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLatestCert(null)}
          className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5"
          aria-label="إغلاق"
        >
          ✕
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-amber-500/25 pt-2.5">
        <button
          type="button"
          onClick={() => onOpenCertificateModal(latestCert.certificateId)}
          className="rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 px-2.5 py-1 text-[11px] font-black text-slate-950 hover:brightness-110"
        >
          🔍 عرض والتحقق من الشهادة
        </button>
        <button
          type="button"
          disabled={busyFmt !== null}
          onClick={() => handleQuickDownload('png')}
          className="rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-amber-200 hover:bg-amber-500/25"
        >
          {busyFmt === 'png' ? '...' : '🖼️ PNG'}
        </button>
        <button
          type="button"
          disabled={busyFmt !== null}
          onClick={() => handleQuickDownload('pdf')}
          className="rounded-lg border border-blue-400/50 bg-blue-500/15 px-2.5 py-1 text-[11px] font-extrabold text-blue-200 hover:bg-blue-500/25"
        >
          {busyFmt === 'pdf' ? '...' : '📄 PDF'}
        </button>
      </div>
    </div>
  );
};
