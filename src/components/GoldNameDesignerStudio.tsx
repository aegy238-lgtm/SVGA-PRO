import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  DEFAULT_GOLD_STYLE,
  DEFAULT_REFERENCE_IMAGE_URL,
  DEFAULT_REFERENCE_PALETTE,
  DimensionPresetId,
  ExportImageFormat,
  GOLD_DIMENSION_PRESETS,
  GOLD_FONT_OPTIONS,
  GOLD_MATERIAL_PRESETS,
  Gold3DStyleConfig,
  ReferenceGoldPalette,
  TypographyLayoutResult,
  detectTextDirectionAndScript,
  extractReferenceGoldPalette,
  generate3DPaletteFromBaseColor,
   renderGold3DTextToCanvas,
  rgbToHex,
} from '../utils/gold3dEngine';
import { FeatureFreeAttemptsStatus } from '../utils/platformStore';

interface GoldNameDesignerStudioProps {
  isAr: boolean;
  attemptStatus?: FeatureFreeAttemptsStatus;
  isPro?: boolean;
  onRequirePro?: (key?: string) => void;
  onConsumeAttempt?: () => { success: boolean; remainingAttempts?: number };
}

const SAMPLE_NAMES = [
  'وكيل شحن',
  'أحمد الملكي',
  'سلطان الذهب',
  'وكالة الشحن VIP',
  'صقر العرب',
  'ROYAL GOLD 777',
];

export default function GoldNameDesignerStudio({
  isAr,
  attemptStatus,
  isPro = false,
  onRequirePro,
  onConsumeAttempt,
}: GoldNameDesignerStudioProps) {
  const [config, setConfig] = useState<Gold3DStyleConfig>(() => ({
    ...DEFAULT_GOLD_STYLE,
    referencePalette: { ...DEFAULT_REFERENCE_PALETTE },
  }));
  const [inputText, setInputText] = useState<string>(DEFAULT_GOLD_STYLE.text);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<number>(100);
  const [generationStatusText, setGenerationStatusText] = useState<string>('');
  const [showReferenceComparison, setShowReferenceComparison] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [lastLayout, setLastLayout] = useState<TypographyLayoutResult | null>(null);
  const [customReferenceName, setCustomReferenceName] = useState<string>('');
  const [colorSourceImageName, setColorSourceImageName] = useState<string>('');
  const [colorSourceImgEl, setColorSourceImgEl] = useState<HTMLImageElement | null>(null);
  const [exportToast, setExportToast] = useState<string>('');

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const refFileInputRef = useRef<HTMLInputElement | null>(null);
  const colorImageInputRef = useRef<HTMLInputElement | null>(null);

  const showToastMessage = useCallback((msg: string) => {
    setExportToast(msg);
    setTimeout(() => {
      setExportToast((prev) => (prev === msg ? '' : prev));
    }, 3400);
  }, []);

  // Load & extract palette from reference or color-source image
  const analyzeImageUrlForPalette = useCallback(
    (imgUrl: string, options?: { isColorShapeSource?: boolean; fileName?: string }) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const sampleCanvas = document.createElement('canvas');
          const sw = Math.min(256, img.naturalWidth || 256);
          const sh = Math.min(256, img.naturalHeight || 256);
          sampleCanvas.width = sw;
          sampleCanvas.height = sh;
          const sctx = sampleCanvas.getContext('2d');
          if (!sctx) return;
          sctx.drawImage(img, 0, 0, sw, sh);
          const imgData = sctx.getImageData(0, 0, sw, sh);
          const extracted = extractReferenceGoldPalette(imgData.data, sw, sh);

          if (options?.isColorShapeSource) {
            setColorSourceImgEl(img);
            if (options.fileName) {
              setColorSourceImageName(options.fileName);
            }
          }

          setConfig((prev) => ({
            ...prev,
            referenceImageUrl: options?.isColorShapeSource ? prev.referenceImageUrl : imgUrl,
            colorSourceImageUrl: options?.isColorShapeSource ? imgUrl : prev.colorSourceImageUrl,
            imageTextureBlend: options?.isColorShapeSource
              ? prev.imageTextureBlend && prev.imageTextureBlend > 0
                ? prev.imageTextureBlend
                : 52
              : prev.imageTextureBlend,
            referencePalette: extracted,
            customBaseColorHex: extracted.midGoldHex,
            materialPresetId: options?.isColorShapeSource ? 'image-extracted' : prev.materialPresetId,
          }));
        } catch {
          // Fallback to calibrated reference palette
        }
      };
      img.src = imgUrl;
    },
    []
  );

  // Explicitly preload Arabic & Latin Google Font subsets via FontFaceSet.load()
  // so Canvas 2D never falls back to an unloaded font.
  useEffect(() => {
    if (typeof document !== 'undefined' && (document as any).fonts?.load) {
      const fontsApi = (document as any).fonts;
      const sampleGlyphs = 'وكيل شحن ROYAL 777';
      const preloadPromises = [
        fontsApi.load("800 64px 'Tajawal'", sampleGlyphs),
        fontsApi.load("800 64px 'Almarai'", sampleGlyphs),
        fontsApi.load("900 64px 'Alexandria'", sampleGlyphs),
        fontsApi.load("800 64px 'Changa'", sampleGlyphs),
        fontsApi.load("800 64px 'Cairo'", sampleGlyphs),
        fontsApi.load("700 64px 'Readex Pro'", sampleGlyphs),
        fontsApi.load("400 64px 'Lalezar'", sampleGlyphs),
        fontsApi.load("700 64px 'Amiri'", sampleGlyphs),
      ];
      Promise.allSettled(preloadPromises).then(() => {
        if (previewCanvasRef.current) {
          const layout = renderGold3DTextToCanvas(previewCanvasRef.current, config, {
            colorSourceImage: colorSourceImgEl,
          });
          setLastLayout(layout);
        }
      });
    }
  }, [config.fontId]);

  // Live render whenever config or colorSourceImgEl changes
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const layout = renderGold3DTextToCanvas(canvas, config, {
      colorSourceImage: colorSourceImgEl,
    });
    setLastLayout(layout);
  }, [config, colorSourceImgEl]);

  // Trigger AI-Guided 3D Design Generation with visual progress feedback
  const handleGenerateDesign = useCallback(
    (overrideText?: string, isRegenerate = false) => {
      const targetText = (overrideText !== undefined ? overrideText : inputText).trim() || 'وكيل شحن';
      setIsGenerating(true);
      setGenerationProgress(15);
      setGenerationStatusText(
        isAr
          ? 'جاري تحليل الحروف العربية والاتصالات وضبط النسب المرجعية...'
          : 'Analyzing Arabic typography connections & reference proportions...'
      );

      setTimeout(() => {
        setGenerationProgress(52);
        setGenerationStatusText(
          isAr
            ? 'جاري بناء المجسم ثلاثي الأبعاد (3D Extrusion) والحواف المشطوفة (Bevel)...'
            : 'Building 3D extrusion depth and chamfered bevels...'
        );
      }, 140);

      setTimeout(() => {
        setGenerationProgress(86);
        setGenerationStatusText(
          isAr
            ? 'جاري تطبيق الانعكاسات المعدنية والظل الطبيعي على الخلفية...'
            : 'Applying polished metallic reflections and studio floor shadow...'
        );
      }, 290);

      setTimeout(() => {
        setConfig((prev) => ({
          ...prev,
          text: targetText,
          brightness: isRegenerate
            ? prev.brightness === 100
              ? 104
              : 100
            : prev.brightness,
        }));
        setGenerationProgress(100);
        setIsGenerating(false);
        setGenerationStatusText(
          isAr
            ? '✨ تم توليد التصميم ثلاثي الأبعاد بنجاح!'
            : '✨ 3D Metallic Typography generated successfully!'
        );
      }, 430);
    },
    [inputText, isAr]
  );

  // Handle Reference Image Upload (Top Bar)
  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCustomReferenceName(file.name);
    analyzeImageUrlForPalette(url, { isColorShapeSource: true, fileName: file.name });
    showToastMessage(
      isAr
        ? `✅ تم استخراج الألوان والشكل اللوني والإضاءة من الصورة: ${file.name}`
        : `✅ Extracted color palette & lighting style from: ${file.name}`
    );
    e.target.value = '';
  };

  // Handle Color & Style Shape Image Import (In Color Changer Section)
  const handleColorSourceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    analyzeImageUrlForPalette(url, { isColorShapeSource: true, fileName: file.name });
    showToastMessage(
      isAr
        ? `🎨 تم استدعاء الصورة (${file.name}) وتطبيق لونها وشكلها اللوني على النص ثلاثي الأبعاد!`
        : `🎨 Imported (${file.name}) and applied its color & shading style to the 3D text!`
    );
    e.target.value = '';
  };

  // Interactive Eyedropper: Click anywhere on the imported color-source image thumbnail to sample a specific spot's color
  const handleSampleSpotFromColorImage = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!colorSourceImgEl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / (rect.width || 1)));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / (rect.height || 1)));

    const c = document.createElement('canvas');
    const w = Math.max(1, colorSourceImgEl.naturalWidth || 128);
    const h = Math.max(1, colorSourceImgEl.naturalHeight || 128);
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(colorSourceImgEl, 0, 0, w, h);
    const px = Math.min(w - 1, Math.max(0, Math.floor(relX * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor(relY * h)));
    const data = ctx.getImageData(px, py, 1, 1).data;
    const sampledHex = rgbToHex(data[0], data[1], data[2]);
    const generatedPalette = generate3DPaletteFromBaseColor(sampledHex);

    setConfig((prev) => ({
      ...prev,
      customBaseColorHex: sampledHex,
      referencePalette: generatedPalette,
      materialPresetId: 'custom-color',
    }));
    showToastMessage(
      isAr
        ? `🎯 تم التقاط اللون (${sampledHex}) من الصورة وتحويله لتدرج ثلاثي الأبعاد!`
        : `🎯 Sampled (${sampledHex}) from image and applied 3D metallic shading!`
    );
  };

  // Handle Single Base Color Picker Change -> Auto-generates 6-stop 3D palette
  const handleBaseTextColorChange = (hexColor: string) => {
    const newPal = generate3DPaletteFromBaseColor(hexColor);
    setConfig((prev) => ({
      ...prev,
      customBaseColorHex: hexColor,
      referencePalette: newPal,
      materialPresetId: 'custom-color',
    }));
  };

  // Handle Individual 3D Stop Color Change
  const handlePaletteStopChange = (key: keyof ReferenceGoldPalette, hexValue: string) => {
    setConfig((prev) => ({
      ...prev,
      materialPresetId: 'custom-color',
      referencePalette: {
        ...prev.referencePalette,
        [key]: hexValue,
      },
    }));
  };

  // Handle Material Preset Selection
  const handleSelectMaterialPreset = (presetId: string) => {
    const preset = GOLD_MATERIAL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      materialPresetId: preset.id,
      customBaseColorHex: preset.previewHex,
      referencePalette: { ...preset.palette },
      imageTextureBlend: preset.id === 'reference-gold' ? 0 : prev.imageTextureBlend,
    }));
  };

  // Reset all parameters to exact Reference Image Style
  const handleResetToReferenceStyle = () => {
    const currentText = inputText.trim() || DEFAULT_GOLD_STYLE.text;
    setColorSourceImgEl(null);
    setColorSourceImageName('');
    setCustomReferenceName('');
    setConfig({
      ...DEFAULT_GOLD_STYLE,
      text: currentText,
      referencePalette: { ...DEFAULT_REFERENCE_PALETTE },
    });
    setPreviewZoom(100);
    showToastMessage(
      isAr
        ? '🔄 تمت إعادة ضبط جميع الإعدادات والألوان والأبعاد إلى النمط الذهبي المرجعي الأصلي'
        : '🔄 Reset all style parameters, colors, and dimensions to original Reference Gold Style'
    );
  };

  // Switch Dimension Preset while maintaining identical relative proportions
  const handleSelectDimensionPreset = (presetId: DimensionPresetId) => {
    const found = GOLD_DIMENSION_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setConfig((prev) => ({
      ...prev,
      dimensionPreset: presetId,
      canvasWidth: presetId === 'custom' ? prev.canvasWidth : found.width,
      canvasHeight: presetId === 'custom' ? prev.canvasHeight : found.height,
    }));
  };

  // Pro Access Permission Check for 3D Gold Designer
  const checkExportPermission = useCallback((): boolean => {
    if (attemptStatus && attemptStatus.rule.isPro) {
      if (isPro) return true;
      if (attemptStatus.remainingAttempts > 0) return true;
      if (typeof onRequirePro === 'function') {
        onRequirePro('gold_designer');
      }
      return false;
    }
    return true;
  }, [attemptStatus, isPro, onRequirePro]);

  const consumeAttemptIfApplicable = useCallback(() => {
    try {
      let consumeRes: any = null;
      if (typeof onConsumeAttempt === 'function') {
        consumeRes = onConsumeAttempt();
      } else if (typeof (window as any).__consumeFeatureAttempt === 'function') {
        consumeRes = (window as any).__consumeFeatureAttempt('gold_designer');
      }
      if (consumeRes && consumeRes.success && consumeRes.remainingAttempts !== undefined) {
        showToastMessage(
          isAr
            ? `🎉 تم استخدام محاولة مجانية لمصمم 3D (المتبقي لديك: ${consumeRes.remainingAttempts} محاولة)`
            : `🎉 Free trial attempt used for 3D Designer (${consumeRes.remainingAttempts} left)`
        );
      }
    } catch (e) {}
  }, [onConsumeAttempt, showToastMessage, isAr]);

  // Export High-Resolution Image in Selected Format (PNG White/Color, PNG Transparent, or JPEG)
  const handleExportDesign = useCallback(
    (formatOverride?: ExportImageFormat) => {
      if (!checkExportPermission()) return;
      const fmt = formatOverride || config.exportFormat;
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = config.canvasWidth;
      exportCanvas.height = config.canvasHeight;

      const isTransparentExport = fmt === 'png-transparent';
      const exportCfg: Gold3DStyleConfig = {
        ...config,
        text: inputText.trim() || config.text || 'وكيل شحن',
        backgroundColor:
          fmt === 'png-white' ? config.backgroundColor || '#FFFFFF' : config.backgroundColor,
      };

      renderGold3DTextToCanvas(exportCanvas, exportCfg, {
        forceTransparentBg: isTransparentExport,
        colorSourceImage: colorSourceImgEl,
      });

      const mimeType = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality =
        fmt === 'jpeg' ? Math.max(0.05, Math.min(1, (config.jpegQuality || 95) / 100)) : undefined;

      const safeFileSlug =
        (exportCfg.text || 'gold-design')
          .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 40) || 'gold_3d_name';

      const suffix =
        fmt === 'png-transparent'
          ? 'transparent'
          : fmt === 'png-white'
            ? 'solid_bg'
            : `q${config.jpegQuality}`;
      const ext = fmt === 'jpeg' ? 'jpg' : 'png';
      const fileName = `${safeFileSlug}_3D_${config.canvasWidth}x${config.canvasHeight}_${suffix}.${ext}`;

      exportCanvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);

          consumeAttemptIfApplicable();

          showToastMessage(
            isAr
              ? `📥 تم تصدير وتحميل التصميم بدقة ${config.canvasWidth}×${config.canvasHeight} (${fileName})`
              : `📥 Exported ${config.canvasWidth}×${config.canvasHeight} design (${fileName})`
          );
        },
        mimeType,
        quality
      );
    },
    [config, inputText, isAr, showToastMessage, colorSourceImgEl, checkExportPermission, consumeAttemptIfApplicable]
  );

  const scriptInfo = detectTextDirectionAndScript(inputText);

  // Dark Studio Theme tokens matching App.tsx & GiftImageCreator.tsx
  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, #151724 0%, #0e1019 100%)',
    borderRadius: '16px',
    border: '1px solid rgba(124, 92, 255, 0.22)',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  };

  return (
    <div
      id="goldDesignerStudioRoot"
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        height: '100%',
        overflowY: 'auto',
        background:
          'radial-gradient(ellipse at 20% 0%, rgba(124, 92, 255, 0.10), transparent 50%), radial-gradient(ellipse at 85% 10%, rgba(245, 158, 11, 0.08), transparent 45%), #07070a',
        color: '#e8e8ee',
        fontFamily: "'Cairo', 'Inter', sans-serif",
        padding: '16px 20px 48px',
      }}
    >
      {/* Top Studio Header Bar (Harmonized with Dark Site Theme) */}
      <div
        style={{
          ...cardStyle,
          maxWidth: '1460px',
          margin: '0 auto 12px',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #7c5cff 0%, #f59e0b 100%)',
              display: 'grid',
              placeItems: 'center',
              fontSize: '20px',
              boxShadow: '0 4px 16px rgba(124, 92, 255, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              flexShrink: 0,
            }}
          >
            👑
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: '16.5px',
                  fontWeight: 900,
                  background: 'linear-gradient(90deg, #ffffff 0%, #c4b5fd 50%, #fbbf24 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {isAr
                  ? 'مصمم الأسماء ثلاثية الأبعاد بالذكاء الاصطناعي (AI 3D Gold & Color Name Designer)'
                  : 'AI 3D Gold & Custom Color Arabic Name Designer'}
              </h2>
              {attemptStatus?.rule?.isPro && (
                <span
                  id="goldDesignerProBadge"
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '99px',
                    background: isPro
                      ? 'rgba(124, 92, 255, 0.22)'
                      : attemptStatus.remainingAttempts > 0
                        ? 'rgba(124, 92, 255, 0.2)'
                        : '#14141c',
                    border: isPro
                      ? '1px solid rgba(124, 92, 255, 0.55)'
                      : attemptStatus.remainingAttempts > 0
                        ? '1px solid #7c5cff'
                        : '1px solid #2b2b3d',
                    color: isPro
                      ? '#c4b5fd'
                      : attemptStatus.remainingAttempts > 0
                        ? '#ece3ff'
                        : '#80808f',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isPro
                    ? '👑 PRO'
                    : attemptStatus.remainingAttempts > 0
                      ? isAr
                        ? `👑 PRO (${attemptStatus.remainingAttempts} مجاناً)`
                        : `👑 PRO (${attemptStatus.remainingAttempts} Free)`
                      : '🔒 PRO'}
                </span>
              )}
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  padding: '2px 9px',
                  borderRadius: '6px',
                  background: 'rgba(124, 92, 255, 0.18)',
                  color: '#c4b5fd',
                  border: '1px solid rgba(124, 92, 255, 0.4)',
                }}
              >
                {isAr ? 'تغيير الألوان + استخلاص شكل ولون أي صورة' : 'Custom Colors + Image Style Extractor'}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>
              {isAr
                ? 'حوّل أي اسم إلى مجسم 3D احترافي، غيّر لونه لأي لون، أو استدعِ أي صورة ليأخذ النص لونها وشكلها اللوني تلقائياً.'
                : 'Convert any name into 3D metallic typography, change its color, or import any image to apply its exact color & visual shading style.'}
            </p>
          </div>
        </div>

        {/* Reference Style Thumbnail & Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <img
              src={config.colorSourceImageUrl || config.referenceImageUrl}
              alt="Active Style Reference"
              style={{
                width: '52px',
                height: '34px',
                objectFit: 'contain',
                background: '#FFFFFF',
                borderRadius: '6px',
                border: '1px solid rgba(245, 158, 11, 0.5)',
              }}
            />
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#e2e8f0' }}>
                {isAr ? 'النمط اللوني النشط' : 'Active Style Source'}
              </div>
              <div style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 700 }}>
                {colorSourceImageName ||
                  customReferenceName ||
                  (isAr ? 'الذهب المرجعي الأصلي' : 'Original Reference Gold')}
              </div>
            </div>
          </div>

          <input
            ref={refFileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleReferenceUpload}
          />
          <button
            type="button"
            id="goldDesignerUploadRefBtn"
            onClick={() => refFileInputRef.current?.click()}
            style={{
              padding: '7px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(124, 92, 255, 0.45)',
              background: 'rgba(124, 92, 255, 0.16)',
              color: '#e2e8f0',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>🖼️</span>
            <span>{isAr ? 'استدعاء صورة للألوان والنمط' : 'Import Style Image'}</span>
          </button>

          <button
            type="button"
            id="goldDesignerResetBtn"
            onClick={handleResetToReferenceStyle}
            style={{
              padding: '7px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#cbd5e1',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>🔄</span>
            <span>{isAr ? 'إعادة للنمط المرجعي' : 'Reset to Reference'}</span>
          </button>
        </div>
      </div>

      {/* Prominent Text Input & Generate Bar */}
      <div
        style={{
          ...cardStyle,
          maxWidth: '1460px',
          margin: '0 auto 14px',
          padding: '12px 18px',
          border: '1px solid rgba(124, 92, 255, 0.35)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          {/* 1. Large Text Input Field */}
          <div style={{ flex: '1 1 300px', minWidth: '260px', position: 'relative' }}>
            <input
              ref={textInputRef}
              id="goldDesignerTextInput"
              type="text"
              dir={scriptInfo.hasArabic ? 'rtl' : 'ltr'}
              value={inputText}
              onChange={(e) => {
                const val = e.target.value;
                setInputText(val);
                setConfig((prev) => ({
                  ...prev,
                  text: val || 'وكيل شحن',
                }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleGenerateDesign(inputText, false);
                }
              }}
              placeholder={
                isAr
                  ? 'اكتب أي اسم أو عبارة هنا (عربي، إنجليزي، أرقام)... مثل: 66666 أو وكيل شحن'
                  : 'Enter any name or phrase (Arabic, English, numbers)...'
              }
              style={{
                width: '100%',
                height: '48px',
                paddingRight: scriptInfo.hasArabic ? '16px' : '142px',
                paddingLeft: scriptInfo.hasArabic ? '142px' : '16px',
                borderRadius: '12px',
                border: '1px solid rgba(124, 92, 255, 0.45)',
                background: '#090a10',
                color: '#ffffff',
                fontSize: '18px',
                fontWeight: 800,
                fontFamily: "'Cairo', sans-serif",
                outline: 'none',
                boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.6)',
              }}
            />
            <span
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                left: scriptInfo.hasArabic ? '12px' : 'auto',
                right: scriptInfo.hasArabic ? 'auto' : '12px',
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(124, 92, 255, 0.18)',
                color: '#c4b5fd',
                border: '1px solid rgba(124, 92, 255, 0.35)',
                pointerEvents: 'none',
              }}
            >
              {scriptInfo.hasArabic
                ? isAr
                  ? 'عربي متصل RTL ✓'
                  : 'Arabic RTL ✓'
                : isAr
                  ? 'إنجليزي / أرقام LTR ✓'
                  : 'Latin / Numbers ✓'}
            </span>
          </div>

          {/* 2. Embedded Color Changer with Live Swatches & Native Color Picker (Right Next to Button) */}
          <div
            id="goldTopColorCluster"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(124, 92, 255, 0.14) 100%)',
              border: '1px solid rgba(124, 92, 255, 0.4)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
              height: '48px',
              flexShrink: 0,
            }}
          >
            {/* Color Picker Label & Trigger */}
            <label
              id="goldTopColorPickerBtn"
              title={isAr ? 'اضغط لتغيير لون النص ثلاثي الأبعاد واختيار أي لون تريده' : 'Click to change 3D text color'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '8px',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <input
                type="color"
                value={config.customBaseColorHex || config.referencePalette.midGoldHex}
                onChange={(e) => handleBaseTextColorChange(e.target.value)}
                style={{
                  width: '24px',
                  height: '24px',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  padding: 0,
                  background: 'transparent',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                <span style={{ fontSize: '11px', fontWeight: 900, color: '#f8fafc', whiteSpace: 'nowrap' }}>
                  🎨 {isAr ? 'تغيير اللون' : 'Change Color'}
                </span>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 800,
                    color: config.customBaseColorHex || config.referencePalette.midGoldHex,
                    fontFamily: 'monospace',
                  }}
                >
                  {config.customBaseColorHex || config.referencePalette.midGoldHex}
                </span>
              </div>
            </label>

            {/* Quick 1-Click Metallic Color Preset Swatches */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginInlineStart: '2px' }}>
              {[
                { id: 'reference-gold', hex: '#f59e0b', tip: isAr ? 'ذهب 24K' : '24K Gold' },
                { id: 'cyber-violet', hex: '#7c5cff', tip: isAr ? 'بنفسجي سايبر' : 'Cyber Violet' },
                { id: 'royal-emerald', hex: '#10b981', tip: isAr ? 'زمرد إمبراطوري' : 'Emerald' },
                { id: 'sapphire-blue', hex: '#0284c7', tip: isAr ? 'ياقوت أزرق' : 'Sapphire' },
                { id: 'rose-gold', hex: '#fb7185', tip: isAr ? 'ذهب وردي' : 'Rose Gold' },
                { id: 'silver-platinum', hex: '#e2e8f0', tip: isAr ? 'بلاتين فضي' : 'Silver' },
                { id: 'ruby-crimson', hex: '#f43f5e', tip: isAr ? 'ياقوت أحمر' : 'Ruby Red' },
              ].map((sw) => {
                const isSelected =
                  config.materialPresetId === sw.id ||
                  (config.customBaseColorHex && config.customBaseColorHex.toLowerCase() === sw.hex.toLowerCase());
                return (
                  <button
                    key={sw.id}
                    type="button"
                    title={sw.tip}
                    onClick={() => handleSelectMaterialPreset(sw.id)}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: sw.hex,
                      border: isSelected ? '2px solid #ffffff' : '1px solid rgba(0, 0, 0, 0.4)',
                      boxShadow: isSelected
                        ? `0 0 10px ${sw.hex}, 0 0 2px #fff`
                        : '0 2px 5px rgba(0, 0, 0, 0.35)',
                      cursor: 'pointer',
                      transform: isSelected ? 'scale(1.18)' : 'scale(1)',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* 3. Embedded Image Caller Button (Extract Color & Shape Texture right next to button) */}
          <input
            ref={colorImageInputRef}
            id="goldTopColorImageInput"
            type="file"
            accept="image/*"
            hidden
            onChange={handleColorSourceImageUpload}
          />
          <button
            type="button"
            id="goldTopImportImgBtn"
            onClick={() => colorImageInputRef.current?.click()}
            title={
              isAr
                ? 'استدعاء أي صورة من جهازك ليأخذ النص ثلاثي الأبعاد لونها وتدرجها وشكلها تلقائياً'
                : 'Import any image to extract its exact metallic color & shading style'
            }
            style={{
              height: '48px',
              padding: '0 14px',
              borderRadius: '12px',
              border: colorSourceImgEl
                ? '1px solid rgba(16, 185, 129, 0.8)'
                : '1px solid rgba(16, 185, 129, 0.45)',
              background: colorSourceImgEl
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.28) 0%, rgba(5, 150, 105, 0.4) 100%)'
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.7) 100%)',
              color: '#ecfdf5',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: colorSourceImgEl
                ? '0 0 14px rgba(16, 185, 129, 0.3)'
                : '0 4px 12px rgba(0, 0, 0, 0.3)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {colorSourceImgEl ? (
              <img
                src={config.colorSourceImageUrl || ''}
                alt="Source"
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '6px',
                  objectFit: 'cover',
                  border: '1px solid #10b981',
                }}
              />
            ) : (
              <span style={{ fontSize: '16px' }}>🖼️</span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
              <span>{isAr ? 'استدعاء صورة' : 'Import Image'}</span>
              <span style={{ fontSize: '9.5px', color: colorSourceImgEl ? '#34d399' : '#a7f3d0', fontWeight: 700 }}>
                {colorSourceImgEl
                  ? isAr
                    ? '✓ تم أخذ اللون والنمط'
                    : '✓ Style Extracted'
                  : isAr
                    ? 'أخذ اللون والشكل'
                    : 'Extract Color & Style'}
              </span>
            </div>
            {colorSourceImgEl && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setColorSourceImgEl(null);
                  setColorSourceImageName('');
                  handleSelectMaterialPreset('reference-gold');
                }}
                title={isAr ? 'إلغاء صورة اللون' : 'Clear image'}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: 'rgba(0, 0, 0, 0.4)',
                  color: '#ffffff',
                  fontSize: '10px',
                  marginInlineStart: '2px',
                }}
              >
                ✕
              </span>
            )}
          </button>

          {/* 4. The Main Generate 3D Design Button (Dynamically Glows with Chosen Color) */}
          <button
            type="button"
            id="goldDesignerGenerateBtn"
            onClick={() => handleGenerateDesign(inputText, false)}
            disabled={isGenerating}
            style={{
              padding: '0 24px',
              height: '48px',
              borderRadius: '12px',
              border: `1px solid ${config.customBaseColorHex || '#f59e0b'}`,
              background: `linear-gradient(135deg, #7c5cff 0%, #6d28d9 40%, ${config.customBaseColorHex || '#d97706'} 100%)`,
              color: '#ffffff',
              fontSize: '14.5px',
              fontWeight: 900,
              cursor: isGenerating ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: `0 6px 22px rgba(124, 92, 255, 0.35), 0 0 16px ${config.customBaseColorHex || '#f59e0b'}44`,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '18px' }}>✨</span>
            <span>
              {isGenerating
                ? isAr
                  ? 'جاري توليد التصميم...'
                  : 'Generating...'
                : isAr
                  ? 'توليد التصميم ثلاثي الأبعاد 3D'
                  : 'Generate 3D Design'}
            </span>
          </button>
        </div>

        {/* Quick Sample Name Chips & Status Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: '9px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>
              {isAr ? 'نماذج سريعة:' : 'Quick Samples:'}
            </span>
            {SAMPLE_NAMES.map((sample) => {
              const active = inputText.trim() === sample;
              return (
                <button
                  key={sample}
                  type="button"
                  onClick={() => {
                    setInputText(sample);
                    handleGenerateDesign(sample, false);
                  }}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '8px',
                    border: active
                      ? '1px solid #7c5cff'
                      : '1px solid rgba(255, 255, 255, 0.09)',
                    background: active
                      ? 'rgba(124, 92, 255, 0.24)'
                      : 'rgba(255, 255, 255, 0.04)',
                    color: active ? '#ffffff' : '#cbd5e1',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {sample}
                </button>
              );
            })}
          </div>

          {/* Progress Indicator */}
          {(isGenerating || generationStatusText) && (
            <div
              id="goldDesignerProgress"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#fbbf24',
              }}
            >
              {isGenerating && (
                <div
                  style={{
                    width: '80px',
                    height: '6px',
                    borderRadius: '99px',
                    background: 'rgba(255, 255, 255, 0.12)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${generationProgress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #7c5cff, #f59e0b)',
                      transition: 'width 0.15s ease',
                    }}
                  />
                </div>
              )}
              <span>{generationStatusText}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Workspace Grid: Live Preview Stage + Right Customization & Color/Image Extractor */}
      <div
        style={{
          maxWidth: '1460px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 420px',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* Left/Center Column: Live High-Resolution 3D Preview Stage + Direct Color & Image Style Bar */}
        <div
          style={{
            ...cardStyle,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Preview Top Toolbar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              paddingBottom: '8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 900,
                  color: '#f8fafc',
                }}
              >
                {isAr ? '🎨 المعاينة الحية ثلاثية الأبعاد' : '🎨 Live High-Resolution 3D Preview'}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 9px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                {config.canvasWidth} × {config.canvasHeight} px
              </span>
              {lastLayout && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 9px',
                    borderRadius: '6px',
                    background: 'rgba(245, 158, 11, 0.14)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                  }}
                >
                  {isAr
                    ? `حجم الخط: ${lastLayout.fontSizePx}px • بروز 3D: ${lastLayout.scaledExtrusionPx}px`
                    : `Font: ${lastLayout.fontSizePx}px • 3D Depth: ${lastLayout.scaledExtrusionPx}px`}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Transparent Checkerboard Preview Toggle */}
              <button
                type="button"
                id="goldToggleTransparentPreviewBtn"
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    transparentPreview: !prev.transparentPreview,
                  }))
                }
                style={{
                  padding: '5px 11px',
                  borderRadius: '8px',
                  border: config.transparentPreview
                    ? '1px solid #7c5cff'
                    : '1px solid rgba(255, 255, 255, 0.12)',
                  background: config.transparentPreview
                    ? 'rgba(124, 92, 255, 0.24)'
                    : 'rgba(255, 255, 255, 0.05)',
                  color: config.transparentPreview ? '#ffffff' : '#cbd5e1',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {config.transparentPreview
                  ? isAr
                    ? '🏁 معاينة شفافة: مفعلة'
                    : '🏁 Transparent View: ON'
                  : isAr
                    ? '⬜ معاينة بالخلفية'
                    : '⬜ Solid BG View'}
              </button>

              {/* Compare with Reference Image Toggle */}
              <button
                type="button"
                id="goldCompareRefBtn"
                onClick={() => setShowReferenceComparison((p) => !p)}
                style={{
                  padding: '5px 11px',
                  borderRadius: '8px',
                  border: showReferenceComparison
                    ? '1px solid #f59e0b'
                    : '1px solid rgba(255, 255, 255, 0.12)',
                  background: showReferenceComparison
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                  color: showReferenceComparison ? '#fbbf24' : '#cbd5e1',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {isAr ? '👁️ مقارنة بالمرجع' : '👁️ Compare Reference'}
              </button>

              {/* Zoom Controls */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setPreviewZoom((z) => Math.max(50, z - 15))}
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: '4px 9px',
                    cursor: 'pointer',
                    fontWeight: 900,
                    color: '#cbd5e1',
                  }}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(100)}
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: '4px 6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#c4b5fd',
                  }}
                >
                  {previewZoom}%
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((z) => Math.min(200, z + 15))}
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: '4px 9px',
                    cursor: 'pointer',
                    fontWeight: 900,
                    color: '#cbd5e1',
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Canvas Stage Container */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: showReferenceComparison ? '1fr 1fr' : '1fr',
              gap: '12px',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '390px',
                borderRadius: '14px',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                background: config.transparentPreview
                  ? 'repeating-conic-gradient(#181824 0 25%, #232334 0 50%) 0 0 / 20px 20px'
                  : config.backgroundColor || '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'auto',
                boxShadow: 'inset 0 2px 16px rgba(0, 0, 0, 0.25)',
                padding: '10px',
              }}
            >
              <canvas
                ref={previewCanvasRef}
                id="goldDesignerPreviewCanvas"
                onClick={() => handleExportDesign()}
                title={
                  isAr
                    ? 'اضغط كليك شمال على التصميم لتحميله فوراً بالصيغة المحددة'
                    : 'Left-click on the design to download immediately in selected format'
                }
                style={{
                  maxHeight: previewZoom === 100 ? '366px' : 'none',
                  maxWidth: '100%',
                  height: previewZoom === 100 ? '100%' : `${previewZoom}%`,
                  width: 'auto',
                  objectFit: 'contain',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease',
                }}
              />
            </div>

            {showReferenceComparison && (
              <div
                style={{
                  borderRadius: '14px',
                  border: '2px dashed rgba(245, 158, 11, 0.6)',
                  background: '#0c0d14',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '390px',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#fbbf24',
                    marginBottom: '8px',
                  }}
                >
                  {isAr ? 'الصورة المرجعية / صورة اللون المختارة' : 'Reference / Imported Style Image'}
                </div>
                <img
                  src={config.colorSourceImageUrl || config.referenceImageUrl}
                  alt="Reference Style"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '320px',
                    objectFit: 'contain',
                    borderRadius: '10px',
                    background: '#FFFFFF',
                  }}
                />
              </div>
            )}
          </div>

          {/* Direct Quick Bar Under Canvas: Change Text Color + Import Image for Color & Shape + Change Background */}
          <div
            id="goldQuickColorAndImageBar"
            style={{
              background: 'linear-gradient(180deg, rgba(124, 92, 255, 0.12), rgba(15, 17, 28, 0.9))',
              border: '1px solid rgba(124, 92, 255, 0.32)',
              borderRadius: '13px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            {/* 1. Direct 3D Text Color Picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 900, color: '#e2e8f0' }}>
                🎨 {isAr ? 'تغيير لون النص 3D:' : '3D Text Color:'}
              </span>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '9px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  cursor: 'pointer',
                }}
              >
                <input
                  id="goldTextColorPicker"
                  type="color"
                  value={config.customBaseColorHex || config.referencePalette.midGoldHex}
                  onChange={(e) => handleBaseTextColorChange(e.target.value)}
                  style={{
                    width: '26px',
                    height: '24px',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    padding: 0,
                    background: 'transparent',
                  }}
                />
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#fbbf24' }}>
                  {config.customBaseColorHex || config.referencePalette.midGoldHex}
                </span>
              </label>

              {/* 2. Import Image to Extract Color & Shape right next to Color Picker */}
              <input
                ref={colorImageInputRef}
                id="goldColorImageInput"
                type="file"
                accept="image/*"
                hidden
                onChange={handleColorSourceImageUpload}
              />
              <button
                type="button"
                id="goldImportColorImageBtn"
                onClick={() => colorImageInputRef.current?.click()}
                style={{
                  padding: '6px 13px',
                  borderRadius: '9px',
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(5, 150, 105, 0.35))',
                  color: '#ecfdf5',
                  fontSize: '11.5px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                }}
              >
                <span>🖼️</span>
                <span>
                  {isAr
                    ? 'استدعاء صورة لأخذ لونها وشكلها اللوني'
                    : 'Import Image to Extract Color & Style'}
                </span>
              </button>
            </div>

            {/* 3. Background Color Picker right beside it */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#94a3b8' }}>
                {isAr ? 'لون الخلفية:' : 'BG Color:'}
              </span>
              <input
                type="color"
                value={config.backgroundColor}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    backgroundColor: e.target.value,
                    transparentPreview: false,
                  }))
                }
                style={{
                  width: '28px',
                  height: '26px',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  padding: 0,
                  background: 'transparent',
                }}
              />
              {[
                { label: isAr ? 'أبيض' : 'White', hex: '#FFFFFF' },
                { label: isAr ? 'داكن الموقع' : 'Site Dark', hex: '#07070A' },
                { label: isAr ? 'أسود' : 'Black', hex: '#000000' },
              ].map((bgOpt) => (
                <button
                  key={bgOpt.hex}
                  type="button"
                  onClick={() =>
                    setConfig((prev) => ({
                      ...prev,
                      backgroundColor: bgOpt.hex,
                      transparentPreview: false,
                    }))
                  }
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border:
                      !config.transparentPreview &&
                      config.backgroundColor.toUpperCase() === bgOpt.hex
                        ? '1px solid #7c5cff'
                        : '1px solid rgba(255, 255, 255, 0.12)',
                    background:
                      !config.transparentPreview &&
                      config.backgroundColor.toUpperCase() === bgOpt.hex
                        ? 'rgba(124, 92, 255, 0.25)'
                        : 'rgba(255, 255, 255, 0.04)',
                    color: '#e2e8f0',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {bgOpt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toast Feedback Banner */}
          {exportToast && (
            <div
              role="status"
              style={{
                padding: '10px 16px',
                borderRadius: '11px',
                background: 'rgba(124, 92, 255, 0.18)',
                border: '1px solid rgba(124, 92, 255, 0.45)',
                color: '#e2e8f0',
                fontSize: '12.5px',
                fontWeight: 800,
                textAlign: 'center',
              }}
            >
              {exportToast}
            </div>
          )}

          {/* Action Buttons Under Preview: Download Formats, Regenerate, Edit */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              paddingTop: '6px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Export Buttons */}
              {(() => {
                const isLocked = !!(attemptStatus?.rule?.isPro && !isPro && attemptStatus.remainingAttempts <= 0);
                const lockSuffix = isLocked ? ' 🔒 PRO' : '';
                return (
                  <>
                    <button
                      type="button"
                      id="exportGoldPngWhiteBtn"
                      onClick={() => handleExportDesign('png-white')}
                      style={{
                        padding: '9px 16px',
                        borderRadius: '10px',
                        border: '1px solid rgba(245, 158, 11, 0.6)',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: '#09090b',
                        fontSize: '12.5px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '7px',
                        boxShadow: '0 4px 14px rgba(245, 158, 11, 0.25)',
                      }}
                    >
                      <span>📥</span>
                      <span>{isAr ? `تحميل PNG (مع الخلفية)${lockSuffix}` : `Download PNG (With BG)${lockSuffix}`}</span>
                    </button>

                    <button
                      type="button"
                      id="exportGoldPngTransparentBtn"
                      onClick={() => handleExportDesign('png-transparent')}
                      style={{
                        padding: '9px 15px',
                        borderRadius: '10px',
                        border: '1px solid rgba(124, 92, 255, 0.5)',
                        background: 'rgba(124, 92, 255, 0.2)',
                        color: '#e2e8f0',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '7px',
                      }}
                    >
                      <span>✨</span>
                      <span>
                        {isAr
                          ? `تحميل PNG شفاف (مع الظل واللمعة)${lockSuffix}`
                          : `Download PNG (Transparent + Shadow)${lockSuffix}`}
                      </span>
                    </button>

                    <button
                      type="button"
                      id="exportGoldJpegBtn"
                      onClick={() => handleExportDesign('jpeg')}
                      style={{
                        padding: '9px 14px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: '#cbd5e1',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>🖼️</span>
                      <span>
                        {isAr
                          ? `تحميل JPEG (${config.jpegQuality}%)${lockSuffix}`
                          : `Download JPEG (${config.jpegQuality}%)${lockSuffix}`}
                      </span>
                    </button>
                  </>
                );
              })()}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                id="goldDesignerRegenerateBtn"
                onClick={() => handleGenerateDesign(inputText, true)}
                style={{
                  padding: '8px 13px',
                  borderRadius: '10px',
                  border: '1px solid rgba(124, 92, 255, 0.4)',
                  background: 'rgba(124, 92, 255, 0.12)',
                  color: '#c4b5fd',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>🔁</span>
                <span>{isAr ? 'إعادة التوليد' : 'Regenerate'}</span>
              </button>

              <button
                type="button"
                id="goldDesignerEditFocusBtn"
                onClick={() => {
                  textInputRef.current?.focus();
                  textInputRef.current?.select();
                }}
                style={{
                  padding: '8px 13px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#cbd5e1',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>✏️</span>
                <span>{isAr ? 'تعديل النص' : 'Edit Text'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Color & Image Style Studio + Dimensions + 3D Typography Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* PANEL A: 3D Color Changer & Image Color/Shape Extractor */}
          <div
            id="goldColorAndImageStudioPanel"
            style={{
              ...cardStyle,
              padding: '15px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '11px',
              border: '1px solid rgba(124, 92, 255, 0.35)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 900, color: '#f8fafc' }}>
                🎨 {isAr ? 'تغيير اللون واستدعاء لون وشكل صورة' : 'Color Changer & Image Style Extractor'}
              </h3>
              <button
                type="button"
                onClick={() => handleSelectMaterialPreset('reference-gold')}
                style={{
                  padding: '3px 9px',
                  borderRadius: '6px',
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  background: 'rgba(245, 158, 11, 0.14)',
                  color: '#fbbf24',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {isAr ? 'الذهب المرجعي' : 'Reference Gold'}
              </button>
            </div>

            {/* Row 1: Custom Color Picker + Import Image for Color & Shape */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.25fr',
                gap: '8px',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  background: '#0b0c14',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#e2e8f0' }}>
                  {isAr ? 'اختر أي لون:' : 'Pick Color:'}
                </span>
                <input
                  type="color"
                  value={config.customBaseColorHex || config.referencePalette.midGoldHex}
                  onChange={(e) => handleBaseTextColorChange(e.target.value)}
                  style={{
                    width: '32px',
                    height: '26px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    padding: 0,
                    background: 'transparent',
                  }}
                />
              </label>

              <button
                type="button"
                onClick={() => colorImageInputRef.current?.click()}
                style={{
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(124, 92, 255, 0.25))',
                  color: '#ffffff',
                  fontSize: '11.5px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>🖼️</span>
                <span>{isAr ? 'استدعاء صورة لأخذ لونها' : 'Import Image Color'}</span>
              </button>
            </div>

            {/* Imported Image Color & Shape Inspector (Shown when user imports an image or clicks) */}
            {colorSourceImgEl && (
              <div
                style={{
                  padding: '10px',
                  borderRadius: '11px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src={config.colorSourceImageUrl}
                    alt="Imported Color Source"
                    onClick={handleSampleSpotFromColorImage}
                    title={
                      isAr
                        ? 'اضغط على أي مكان في الصورة لاقتباس لونه بدقة'
                        : 'Click anywhere on the image to sample that exact spot color'
                    }
                    style={{
                      width: '68px',
                      height: '52px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '2px solid #10b981',
                      cursor: 'crosshair',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 900,
                        color: '#6ee7b7',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {isAr ? `الصورة المستدعاة: ${colorSourceImageName}` : `Source: ${colorSourceImageName}`}
                    </div>
                    <div style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '2px' }}>
                      {isAr
                        ? '💡 اضغط على أي جزء في الصورة المصغرة لأخذ لونه، أو تحكم في قوة دمج شكل ألوان الصورة بالأسفل:'
                        : '💡 Click thumbnail to sample a spot, or adjust image color-shape blend below:'}
                    </div>
                  </div>
                </div>

                {/* Slider: Image Color-Shape Texture Blend */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      fontWeight: 800,
                      color: '#e2e8f0',
                    }}
                  >
                    <span>
                      {isAr
                        ? 'قوة أخذ الشكل اللوني للصورة داخل الحروف:'
                        : 'Image Color-Shape Blend inside Text:'}
                    </span>
                    <b style={{ color: '#6ee7b7' }}>{config.imageTextureBlend ?? 0}%</b>
                  </div>
                  <input
                    id="goldImageTextureBlendSlider"
                    type="range"
                    min={0}
                    max={100}
                    value={config.imageTextureBlend ?? 0}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        imageTextureBlend: Number(e.target.value),
                      }))
                    }
                    style={{ width: '100%', accentColor: '#10b981' }}
                  />
                </div>
              </div>
            )}

            {/* Quick 3D Metallic Presets Grid */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#94a3b8',
                  marginBottom: '6px',
                }}
              >
                {isAr ? 'ألوان وخامات 3D جاهزة متناسقة مع الموقع:' : '3D Metallic Color Presets:'}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '6px',
                }}
              >
                {GOLD_MATERIAL_PRESETS.map((preset) => {
                  const active = config.materialPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      id={`goldMaterialPreset_${preset.id}`}
                      onClick={() => handleSelectMaterialPreset(preset.id)}
                      style={{
                        padding: '6px 6px',
                        borderRadius: '8px',
                        border: active
                          ? '1px solid #7c5cff'
                          : '1px solid rgba(255, 255, 255, 0.09)',
                        background: active
                          ? 'rgba(124, 92, 255, 0.24)'
                          : 'rgba(255, 255, 255, 0.03)',
                        color: active ? '#ffffff' : '#cbd5e1',
                        fontSize: '10px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        textAlign: 'start',
                      }}
                    >
                      <span
                        style={{
                          width: '13px',
                          height: '13px',
                          borderRadius: '50%',
                          background: `radial-gradient(circle at 30% 30%, ${preset.palette.highlightHex}, ${preset.previewHex}, ${preset.palette.deepBronzeHex})`,
                          border: '1px solid rgba(255,255,255,0.4)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {isAr ? preset.labelAr.split(' (')[0] : preset.labelEn.split(' (')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5 Editable 3D Layer Color Swatches (Shows exact extracted or active colors) */}
            <div>
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  color: '#94a3b8',
                  marginBottom: '5px',
                }}
              >
                {isAr
                  ? 'درجات تدرج الـ 3D المستخلصة (اضغط لتخصيص أي طبقة):'
                  : 'Extracted 3D Shading Stops (Click to customize):'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '5px' }}>
                {(
                  [
                    {
                      key: 'highlightHex',
                      labelAr: 'اللمعة',
                      labelEn: 'Highlight',
                    },
                    {
                      key: 'brightGoldHex',
                      labelAr: 'الوجه',
                      labelEn: 'Bright',
                    },
                    {
                      key: 'midGoldHex',
                      labelAr: 'الأساسي',
                      labelEn: 'Core',
                    },
                    {
                      key: 'warmAmberHex',
                      labelAr: 'الشطف',
                      labelEn: 'Bevel',
                    },
                    {
                      key: 'deepBronzeHex',
                      labelAr: 'عمق 3D',
                      labelEn: '3D Depth',
                    },
                  ] as const
                ).map((stop) => (
                  <label
                    key={stop.key}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '4px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="color"
                      value={config.referencePalette[stop.key]}
                      onChange={(e) => handlePaletteStopChange(stop.key, e.target.value)}
                      style={{
                        width: '100%',
                        height: '20px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        padding: 0,
                        background: 'transparent',
                      }}
                    />
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#cbd5e1' }}>
                      {isAr ? stop.labelAr : stop.labelEn}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* PANEL B: Image Dimensions & Export Options */}
          <div
            style={{
              ...cardStyle,
              padding: '15px 16px',
            }}
          >
            <h3
              style={{
                margin: '0 0 10px',
                fontSize: '13.5px',
                fontWeight: 900,
                color: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>📐 {isAr ? 'أبعاد الصورة وخيارات التصدير' : 'Dimensions & Export Options'}</span>
              <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 800 }}>
                {config.canvasWidth}×{config.canvasHeight}
              </span>
            </h3>

            {/* Preset Dimension Buttons */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '7px',
                marginBottom: '10px',
              }}
            >
              {GOLD_DIMENSION_PRESETS.map((preset) => {
                const isSelected = config.dimensionPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-preset-id={preset.id}
                    onClick={() => handleSelectDimensionPreset(preset.id)}
                    style={{
                      gridColumn: preset.id === 'custom' ? '1 / -1' : undefined,
                      padding: '7px 10px',
                      borderRadius: '10px',
                      border: isSelected
                        ? '1px solid #7c5cff'
                        : '1px solid rgba(255, 255, 255, 0.09)',
                      background: isSelected
                        ? 'rgba(124, 92, 255, 0.22)'
                        : 'rgba(255, 255, 255, 0.03)',
                      color: isSelected ? '#ffffff' : '#cbd5e1',
                      textAlign: 'start',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    <span style={{ fontSize: '11.5px', fontWeight: 800 }}>
                      {isAr ? preset.labelAr : preset.labelEn}
                    </span>
                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>
                      {isAr ? preset.subLabelAr : preset.subLabelEn}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Width x Height Inputs */}
            {config.dimensionPreset === 'custom' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  marginBottom: '10px',
                  padding: '10px',
                  borderRadius: '10px',
                  background: 'rgba(124, 92, 255, 0.08)',
                  border: '1px solid rgba(124, 92, 255, 0.3)',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      color: '#cbd5e1',
                      marginBottom: '4px',
                    }}
                  >
                    {isAr ? 'العرض (Width px)' : 'Width (px)'}
                  </label>
                  <input
                    type="number"
                    min={256}
                    max={4096}
                    value={config.canvasWidth}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        canvasWidth: Math.max(256, Math.min(4096, Number(e.target.value) || 1536)),
                      }))
                    }
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(124, 92, 255, 0.45)',
                      background: '#090a10',
                      color: '#ffffff',
                      fontWeight: 800,
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      color: '#cbd5e1',
                      marginBottom: '4px',
                    }}
                  >
                    {isAr ? 'الارتفاع (Height px)' : 'Height (px)'}
                  </label>
                  <input
                    type="number"
                    min={256}
                    max={4096}
                    value={config.canvasHeight}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        canvasHeight: Math.max(256, Math.min(4096, Number(e.target.value) || 1024)),
                      }))
                    }
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(124, 92, 255, 0.45)',
                      background: '#090a10',
                      color: '#ffffff',
                      fontWeight: 800,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Default Export Format & JPEG Quality */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#cbd5e1' }}>
                {isAr ? 'صيغة التصدير الافتراضية:' : 'Default Export Format:'}
              </label>
              <select
                id="goldExportFormatSelect"
                value={config.exportFormat}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    exportFormat: e.target.value as ExportImageFormat,
                  }))
                }
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '9px',
                  border: '1px solid rgba(124, 92, 255, 0.4)',
                  background: '#090a10',
                  color: '#f8fafc',
                  fontSize: '11.5px',
                  fontWeight: 800,
                }}
              >
                <option value="png-white">
                  {isAr
                    ? 'PNG — مع لون الخلفية المحدد'
                    : 'PNG — With Selected Solid Background'}
                </option>
                <option value="png-transparent">
                  {isAr
                    ? 'PNG — خلفية شفافة (مع الحفاظ على المجسم والظل)'
                    : 'PNG — Transparent Background (Preserves 3D & Shadow)'}
                </option>
                <option value="jpeg">
                  {isAr
                    ? 'JPEG — جودة ضغط قابلة للتعديل'
                    : 'JPEG — Adjustable Compression Quality'}
                </option>
              </select>

              {config.exportFormat === 'jpeg' && (
                <div style={{ marginTop: '4px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      fontWeight: 800,
                      color: '#cbd5e1',
                    }}
                  >
                    <span>{isAr ? 'جودة صورة JPEG:' : 'JPEG Quality:'}</span>
                    <span style={{ color: '#fbbf24' }}>{config.jpegQuality}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={config.jpegQuality}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        jpegQuality: Number(e.target.value),
                      }))
                    }
                    style={{ width: '100%', accentColor: '#7c5cff' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* PANEL C: 3D Material & Typography Customization Controls */}
          <div
            style={{
              ...cardStyle,
              padding: '15px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 900, color: '#f8fafc' }}>
                ✨ {isAr ? 'خصائص البروز ثلاثي الأبعاد والخط' : '3D Depth & Typography Controls'}
              </h3>
              <button
                type="button"
                onClick={handleResetToReferenceStyle}
                style={{
                  padding: '3px 9px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#cbd5e1',
                  fontSize: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {isAr ? 'إعادة ضبط الكل' : 'Reset All'}
              </button>
            </div>

            {/* Font Selector */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#cbd5e1',
                  marginBottom: '4px',
                }}
              >
                {isAr ? 'نمط الخط العريض (Typography Style):' : 'Arabic/Latin Font Style:'}
              </label>
              <select
                id="goldFontSelect"
                value={config.fontId}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    fontId: e.target.value,
                  }))
                }
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '9px',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  background: '#090a10',
                  color: '#f8fafc',
                  fontSize: '11.5px',
                  fontWeight: 800,
                }}
              >
                {GOLD_FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {isAr ? f.labelAr : f.labelEn}
                  </option>
                ))}
              </select>
            </div>

            {/* 1. Color / Gold Intensity */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#cbd5e1',
                }}
              >
                <span>{isAr ? '1. تشبع وكثافة اللون المعدني' : '1. Metallic Color Intensity'}</span>
                <span style={{ color: '#a78bfa' }}>{config.goldIntensity}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={150}
                value={config.goldIntensity}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, goldIntensity: Number(e.target.value) }))
                }
                style={{ width: '100%', accentColor: '#7c5cff' }}
              />
            </div>

            {/* 2. Brightness & Reflections */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#cbd5e1',
                }}
              >
                <span>
                  {isAr ? '2. السطوع ولمعة الانعكاسات (Brightness)' : '2. Brightness & Reflections'}
                </span>
                <span style={{ color: '#a78bfa' }}>{config.brightness}%</span>
              </div>
              <input
                type="range"
                min={60}
                max={140}
                value={config.brightness}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, brightness: Number(e.target.value) }))
                }
                style={{ width: '100%', accentColor: '#7c5cff' }}
              />
            </div>

            {/* 3. 3D Extrusion Depth */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#cbd5e1',
                }}
              >
                <span>{isAr ? '3. العمق ثلاثي الأبعاد (3D Depth)' : '3. 3D Extrusion Depth'}</span>
                <span style={{ color: '#fbbf24' }}>{config.extrusionDepth}</span>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                value={config.extrusionDepth}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, extrusionDepth: Number(e.target.value) }))
                }
                style={{ width: '100%', accentColor: '#f59e0b' }}
              />
            </div>

            {/* 4. Bevel Thickness */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#cbd5e1',
                }}
              >
                <span>
                  {isAr ? '4. سُمك الحواف المشطوفة (Bevel Thickness)' : '4. Bevel Thickness'}
                </span>
                <span style={{ color: '#fbbf24' }}>{config.bevelThickness}</span>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                value={config.bevelThickness}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, bevelThickness: Number(e.target.value) }))
                }
                style={{ width: '100%', accentColor: '#f59e0b' }}
              />
            </div>

            {/* 5. Shadow Strength */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#cbd5e1',
                }}
              >
                <span>{isAr ? '5. قوة الظل الطبيعي (Shadow Strength)' : '5. Shadow Strength'}</span>
                <span style={{ color: '#a78bfa' }}>{config.shadowStrength}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={config.shadowStrength}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, shadowStrength: Number(e.target.value) }))
                }
                style={{ width: '100%', accentColor: '#7c5cff' }}
              />
            </div>

            {/* 6. Text Size Scale & 7. Letter Spacing */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    color: '#cbd5e1',
                  }}
                >
                  <span>{isAr ? '6. حجم النص' : '6. Text Size'}</span>
                  <span style={{ color: '#38bdf8' }}>{config.textSizeScale}%</span>
                </div>
                <input
                  type="range"
                  min={45}
                  max={150}
                  value={config.textSizeScale}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, textSizeScale: Number(e.target.value) }))
                  }
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    color: '#cbd5e1',
                  }}
                >
                  <span>{isAr ? '7. تباعد الحروف' : '7. Spacing'}</span>
                  <span style={{ color: '#38bdf8' }}>{config.letterSpacing}px</span>
                </div>
                <input
                  type="range"
                  min={-5}
                  max={30}
                  value={config.letterSpacing}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, letterSpacing: Number(e.target.value) }))
                  }
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
              </div>
            </div>

            {/* 8. Horizontal & Vertical Positioning */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    color: '#cbd5e1',
                  }}
                >
                  <span>{isAr ? 'موضع أفقي (X)' : 'Position X'}</span>
                  <span style={{ color: '#a78bfa' }}>{config.offsetX}%</span>
                </div>
                <input
                  type="range"
                  min={-35}
                  max={35}
                  value={config.offsetX}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, offsetX: Number(e.target.value) }))
                  }
                  style={{ width: '100%', accentColor: '#7c5cff' }}
                />
              </div>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    color: '#cbd5e1',
                  }}
                >
                  <span>{isAr ? 'موضع عمودي (Y)' : 'Position Y'}</span>
                  <span style={{ color: '#a78bfa' }}>{config.offsetY}%</span>
                </div>
                <input
                  type="range"
                  min={-35}
                  max={35}
                  value={config.offsetY}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, offsetY: Number(e.target.value) }))
                  }
                  style={{ width: '100%', accentColor: '#7c5cff' }}
                />
              </div>
            </div>

            {/* 9. Sparkle Glints Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '6px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  color: '#fbbf24',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={config.addSparkleGlints}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      addSparkleGlints: e.target.checked,
                    }))
                  }
                  style={{ accentColor: '#f59e0b' }}
                />
                <span>{isAr ? 'إظهار لمعات النجوم البراقة ✨' : 'Show Jewelry Sparkle Glints ✨'}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
