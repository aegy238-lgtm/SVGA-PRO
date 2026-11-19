import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  DEFAULT_NAME3D_CONFIG,
  NAME3D_ANIMATION_PRESETS,
  NAME3D_BG_PRESETS,
  NAME3D_FONT_OPTIONS,
  NAME3D_MATERIAL_PRESETS,
  NAME3D_SHAPE_STYLES,
  Name3DAnimDirection,
  Name3DAnimationId,
  Name3DConfig,
  Name3DMaterialPreset,
  detectTextIsRtl,
  sanitizeHexColor,
} from '../utils/name3dGeometry';
import { Name3DSceneEngine } from '../utils/name3dSceneEngine';
import {
  encodeName3DVideoMp4,
  encodeRgbaFramesToGifBlob,
  hexToRgba,
  triggerBlobDownload,
} from '../utils/name3dExporter';

interface Name3DStudioProps {
  isAr: boolean;
  isActive: boolean;
}

type StudioSectionId =
  | 'text'
  | 'shape'
  | 'animation'
  | 'colors'
  | 'background'
  | 'lighting';

const DECORATIVE_SYMBOLS = ['👑', '★', '✦', '❖', '♛', '💎', '⚡', '۝', '༺ ༻'];

const SAMPLE_NAMES = [
  'سلطان الذهب',
  'أحمد الملكي',
  'أسد العرب',
  'نجم الساحة ♛',
  'ROYAL KING',
  'SVGA PRO ★',
];

function ColorHexRow({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  id: string;
}) {
  const [hexDraft, setHexDraft] = useState(value);
  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  const commitHex = (raw: string) => {
    const valid = sanitizeHexColor(raw, value);
    setHexDraft(valid);
    onChange(valid);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        padding: '8px 10px',
        borderRadius: '8px',
        background: '#12121b',
        border: '1px solid #252536',
      }}
    >
      <label htmlFor={id} style={{ fontSize: '12px', fontWeight: 600, color: '#d4d4e2' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="color"
          aria-label={label}
          value={sanitizeHexColor(value, '#ffd966')}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '30px',
            height: '28px',
            padding: 0,
            border: '1px solid #3c3c52',
            borderRadius: '6px',
            background: 'transparent',
            cursor: 'pointer',
          }}
        />
        <input
          id={id}
          type="text"
          dir="ltr"
          value={hexDraft}
          onChange={(e) => {
            const v = e.target.value;
            setHexDraft(v);
            if (/^#?[0-9a-fA-F]{6}$/.test(v.trim())) {
              onChange(sanitizeHexColor(v, value));
            }
          }}
          onBlur={() => commitHex(hexDraft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitHex(hexDraft);
          }}
          style={{
            width: '84px',
            height: '28px',
            padding: '0 8px',
            borderRadius: '6px',
            background: '#1a1a27',
            border: '1px solid #323246',
            color: '#f4f4fa',
            fontSize: '12px',
            fontFamily: 'monospace',
            textAlign: 'center',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}

function SliderControl({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
        }}
      >
        <label htmlFor={id} style={{ color: '#cbd5e1', fontWeight: 600 }}>
          {label}
        </label>
        <span
          style={{
            fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums',
            color: '#fbbf24',
            fontWeight: 700,
            fontSize: '12px',
          }}
        >
          {step < 1 ? value.toFixed(2) : Math.round(value)}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          accentColor: '#f59e0b',
          cursor: 'pointer',
          height: '5px',
        }}
      />
    </div>
  );
}

export default function Name3DStudio({ isAr, isActive }: Name3DStudioProps) {
  const [config, setConfig] = useState<Name3DConfig>(() => ({ ...DEFAULT_NAME3D_CONFIG }));
  const [activeSection, setActiveSection] = useState<StudioSectionId>('text');
  const [previewAnimOverride, setPreviewAnimOverride] = useState<Name3DAnimationId | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [toastMsg, setToastMsg] = useState<string>('');
  const [webglError, setWebglError] = useState<string>('');

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Name3DSceneEngine | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveConfig: Name3DConfig = previewAnimOverride
    ? { ...config, animationId: previewAnimOverride, isPlaying: true }
    : config;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? '' : prev));
    }, 3400);
  }, []);

  const updateConfig = useCallback(
    <K extends keyof Name3DConfig>(key: K, val: Name3DConfig[K]) => {
      setConfig((prev) => ({ ...prev, [key]: val }));
    },
    []
  );

  // Initialize Three.js WebGL Engine once the view becomes active
  useEffect(() => {
    if (!isActive) {
      engineRef.current?.stop();
      return;
    }

    const mount = canvasMountRef.current;
    if (!mount) return;

    if (!engineRef.current) {
      try {
        const engine = new Name3DSceneEngine(mount, effectiveConfig);
        engineRef.current = engine;
        engine.start();
        setWebglError('');
      } catch (err: any) {
        console.error('3D Name Designer WebGL init failed:', err);
        setWebglError(
          isAr
            ? 'تعذر تهيئة محرك WebGL ثلاثي الأبعاد على هذا الجهاز.'
            : 'Unable to initialize WebGL 3D engine on this device.'
        );
        return;
      }
    } else {
      engineRef.current.handleResize();
      engineRef.current.start();
    }

    // Ensure Google Fonts are loaded then trigger a clean mesh rebuild
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(() => {
        engineRef.current?.rebuildTextMeshes();
        engineRef.current?.renderSingleFrame();
      });
    }
  }, [isActive]);

  // Dispose WebGL cleanly on component unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, []);

  // Push live config updates into the 3D scene immediately without recreating WebGL context
  useEffect(() => {
    if (engineRef.current && isActive) {
      engineRef.current.applyConfig(effectiveConfig, false);
    }
  }, [effectiveConfig, isActive]);

  // Preload specific font whenever user changes font family
  useEffect(() => {
    const fontOpt = NAME3D_FONT_OPTIONS.find((f) => f.id === config.fontId);
    if (!fontOpt || typeof document === 'undefined' || !(document as any).fonts?.load) return;
    const sample = (config.text || 'سلطان الذهب ROYAL').slice(0, 24);
    (document as any).fonts
      .load(`${fontOpt.weight} 64px ${fontOpt.cssFamily}`, sample)
      .then(() => {
        engineRef.current?.rebuildTextMeshes();
        engineRef.current?.renderSingleFrame();
      })
      .catch(() => {});
  }, [config.fontId, config.text]);

  const applyMaterialPreset = (preset: Name3DMaterialPreset) => {
    setConfig((prev) => ({
      ...prev,
      materialPresetId: preset.id,
      faceColor: preset.faceColor,
      faceGradientEnabled: preset.faceGradientEnabled,
      faceColors: [...preset.faceColors],
      sideColor: preset.sideColor,
      depthColor: preset.depthColor,
      metalness: preset.metalness,
      shininess: preset.shininess,
      reflectionStrength: preset.reflectionStrength,
      glowColor: preset.glowColor,
    }));
  };

  const insertSymbol = (sym: string) => {
    const input = textInputRef.current;
    if (!input) {
      updateConfig('text', `${config.text} ${sym}`);
      return;
    }
    const start = input.selectionStart ?? config.text.length;
    const end = input.selectionEnd ?? config.text.length;
    const next = config.text.slice(0, start) + sym + config.text.slice(end);
    updateConfig('text', next);
    setTimeout(() => {
      input.focus();
      const pos = start + sym.length;
      input.setSelectionRange(pos, pos);
    }, 0);
  };

  const makeSafeFilename = (ext: string, suffix = '') => {
    const clean = (config.text || 'name3d')
      .trim()
      .replace(/[^\p{L}\p{N}_-]+/gu, '_')
      .slice(0, 32) || 'name3d';
    return `${clean}_3D${suffix}.${ext}`;
  };

  const handleExportPng = async (transparent: boolean) => {
    const engine = engineRef.current;
    if (!engine || isExporting) return;
    setIsExporting(true);
    setExportProgress(35);
    setExportStatus(
      transparent
        ? isAr
          ? 'جارٍ تصدير صورة PNG بخلفية شفافة...'
          : 'Exporting transparent PNG...'
        : isAr
          ? 'جارٍ تصدير صورة PNG عالية الجودة...'
          : 'Exporting colored PNG...'
    );

    try {
      await new Promise((r) => setTimeout(r, 20));
      const exportW = 1600;
      const exportH = 900;
      const cv = document.createElement('canvas');
      cv.width = exportW;
      cv.height = exportH;
      const ctx = cv.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      engine.renderExportFrameToContext(ctx, exportW, exportH, engine.getCurrentPhase(), transparent);
      setExportProgress(85);

      const blob = await new Promise<Blob>((resolve, reject) => {
        cv.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))),
          'image/png'
        );
      });
      triggerBlobDownload(blob, makeSafeFilename('png', transparent ? '_transparent' : '_colored'));
      setExportProgress(100);
      showToast(
        transparent
          ? isAr
            ? 'تم تنزيل التصميم بصيغة PNG بخلفية شفافة بنجاح'
            : 'Transparent PNG downloaded successfully'
          : isAr
            ? 'تم تنزيل التصميم بصيغة PNG عالية الجودة بنجاح'
            : 'High-res PNG downloaded successfully'
      );
    } catch (err) {
      console.error('PNG Export error:', err);
      showToast(isAr ? 'حدث خطأ أثناء تصدير PNG' : 'Failed to export PNG');
    } finally {
      setIsExporting(false);
      setExportStatus('');
      setExportProgress(0);
    }
  };

  const handleExportGif = async () => {
    const engine = engineRef.current;
    if (!engine || isExporting) return;
    setIsExporting(true);
    setExportProgress(5);
    setExportStatus(isAr ? 'جارٍ تسجيل إطارات GIF ثلاثية الأبعاد...' : 'Rendering 3D GIF frames...');

    const wasRunning = config.isPlaying;
    engine.stop();

    try {
      const gifW = 640;
      const gifH = 360;
      const fps = 16;
      const loopDurationSec = Math.max(1.5, Math.min(5.0, config.animationDuration / Math.max(0.4, config.animationSpeed)));
      const totalFrames = Math.max(18, Math.min(64, Math.round(loopDurationSec * fps)));
      const isTransparent = config.bgMode === 'transparent';

      const cv = document.createElement('canvas');
      cv.width = gifW;
      cv.height = gifH;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable');

      const frames: Uint8ClampedArray[] = [];
      for (let k = 0; k < totalFrames; k++) {
        const phase = k / totalFrames;
        engine.renderExportFrameToContext(ctx, gifW, gifH, phase, isTransparent);
        frames.push(new Uint8ClampedArray(ctx.getImageData(0, 0, gifW, gifH).data));
        if (k % 3 === 0) {
          setExportProgress(Math.round(5 + ((k + 1) / totalFrames) * 70));
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      setExportStatus(isAr ? 'جارٍ ضغط وتجميع ملف GIF...' : 'Encoding animated GIF...');
      setExportProgress(85);
      await new Promise((r) => setTimeout(r, 15));

      const blob = encodeRgbaFramesToGifBlob(frames, gifW, gifH, fps, isTransparent);
      triggerBlobDownload(blob, makeSafeFilename('gif', '_animated'));
      setExportProgress(100);
      showToast(
        isAr
          ? `تم تصدير الاسم المتحرك بصيغة GIF (${totalFrames} إطار) بنجاح`
          : `Animated GIF (${totalFrames} frames) exported successfully`
      );
    } catch (err) {
      console.error('GIF Export error:', err);
      showToast(isAr ? 'حدث خطأ أثناء تصدير GIF' : 'Failed to export GIF');
    } finally {
      if (wasRunning && isActive) engine.start();
      else engine.renderSingleFrame();
      setIsExporting(false);
      setExportStatus('');
      setExportProgress(0);
    }
  };

  const handleExportMp4 = async () => {
    const engine = engineRef.current;
    if (!engine || isExporting) return;
    setIsExporting(true);
    setExportProgress(5);
    setExportStatus(isAr ? 'جارٍ تصدير الفيديو ثلاثي الأبعاد بصيغة MP4...' : 'Encoding 3D MP4 video...');

    const wasRunning = config.isPlaying;
    engine.stop();

    try {
      const vidW = 1280;
      const vidH = 720;
      const fps = 30;
      const loopDurationSec = Math.max(2.0, Math.min(6.0, config.animationDuration / Math.max(0.4, config.animationSpeed)));
      const totalFrames = Math.max(45, Math.min(180, Math.round(loopDurationSec * fps)));

      const result = await encodeName3DVideoMp4({
        width: vidW,
        height: vidH,
        fps,
        totalFrames,
        renderFrame: (ctx, frameIdx, count) => {
          const phase = frameIdx / count;
          // MP4 does not support alpha transparency, so render with configured bg (or obsidian black if transparent)
          engine.renderExportFrameToContext(ctx, vidW, vidH, phase, false);
          if (config.bgMode === 'transparent') {
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = '#07070c';
            ctx.fillRect(0, 0, vidW, vidH);
            ctx.globalCompositeOperation = 'source-over';
          }
        },
        onProgress: (pct) => setExportProgress(pct),
      });

      triggerBlobDownload(result.blob, makeSafeFilename(result.ext, '_video'));
      showToast(
        isAr
          ? `تم تصدير الفيديو المتحرك بصيغة ${result.ext.toUpperCase()} بنجاح`
          : `Animated ${result.ext.toUpperCase()} video exported successfully`
      );
    } catch (err) {
      console.error('MP4 Export error:', err);
      showToast(isAr ? 'تعذر تصدير الفيديو على هذا المتصفح' : 'Failed to export MP4 video');
    } finally {
      if (wasRunning && isActive) engine.start();
      else engine.renderSingleFrame();
      setIsExporting(false);
      setExportStatus('');
      setExportProgress(0);
    }
  };

  // Compute CSS stage background matching exact export backdrop
  const stageBackdropStyle: React.CSSProperties =
    config.bgMode === 'transparent'
      ? {
          backgroundImage:
            'linear-gradient(45deg, #1b1b26 25%, transparent 25%), linear-gradient(-45deg, #1b1b26 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1b1b26 75%), linear-gradient(-45deg, transparent 75%, #1b1b26 75%)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
          backgroundColor: '#12121a',
        }
      : config.bgMode === 'solid'
        ? { background: config.bgColor }
        : {
            background: `linear-gradient(${config.bgGradientAngle}deg, ${config.bgGradientColors[0]}, ${config.bgGradientColors[1]}, ${config.bgGradientColors[2]})`,
          };

  const sectionTabs: Array<{ id: StudioSectionId; num: string; labelAr: string; labelEn: string }> = [
    { id: 'text', num: '1', labelAr: 'الاسم والخط', labelEn: 'Name & Font' },
    { id: 'shape', num: '2', labelAr: 'شكل 3D', labelEn: '3D Shape' },
    { id: 'animation', num: '3', labelAr: 'الحركات', labelEn: 'Animation' },
    { id: 'colors', num: '4', labelAr: 'الألوان', labelEn: 'Colors' },
    { id: 'background', num: '5', labelAr: 'الخلفية', labelEn: 'Background' },
    { id: 'lighting', num: '6', labelAr: 'الإضاءة', labelEn: 'Lighting' },
  ];

  const isTextRtl = detectTextIsRtl(config.text);

  return (
    <div
      id="name3dStudioRoot"
      dir={isAr ? 'rtl' : 'ltr'}
      className="h-full w-full flex flex-col overflow-y-auto lg:overflow-hidden"
      style={{
        background: '#09090f',
        color: '#f4f4fa',
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
      }}
    >
      {/* Top Studio Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 20px',
          background: '#0e0e16',
          borderBottom: '1px solid #1f1f2e',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #fde047 0%, #d97706 60%, #78350f 100%)',
              color: '#09090f',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 900,
              fontSize: '14px',
              letterSpacing: '-0.5px',
              flexShrink: 0,
            }}
          >
            3D
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.25,
              }}
            >
              {isAr ? 'مصمم الأسماء ثلاثي الأبعاد — 3D Name Designer' : '3D Name Designer Studio'}
            </h1>
            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
              {isAr
                ? 'استوديو WebGL حقيقي لتصميم الأسماء العربية والإنجليزية ثلاثية الأبعاد بالذهب والمعادن والأنيميشن'
                : 'Real-time WebGL 3D studio for Arabic & English metallic typography, animations & export'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            id="name3dTogglePlayBtn"
            onClick={() => updateConfig('isPlaying', !config.isPlaying)}
            style={{
              padding: '7px 14px',
              borderRadius: '7px',
              background: config.isPlaying ? '#1b1b29' : '#f59e0b',
              border: '1px solid #323248',
              color: config.isPlaying ? '#f8fafc' : '#09090f',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {config.isPlaying
              ? isAr
                ? 'إيقاف الحركة'
                : 'Pause Motion'
              : isAr
                ? 'تشغيل الحركة'
                : 'Play Motion'}
          </button>

          <button
            type="button"
            id="name3dResetCamBtn"
            onClick={() => engineRef.current?.resetCamera()}
            style={{
              padding: '7px 14px',
              borderRadius: '7px',
              background: '#161622',
              border: '1px solid #2b2b3e',
              color: '#cbd5e1',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isAr ? 'إعادة ضبط الكاميرا' : 'Reset Camera'}
          </button>

          <button
            type="button"
            id="name3dResetAllBtn"
            onClick={() => {
              setConfig({ ...DEFAULT_NAME3D_CONFIG });
              engineRef.current?.resetCamera();
              showToast(isAr ? 'تمت استعادة الإعدادات الافتراضية' : 'Reset to studio defaults');
            }}
            style={{
              padding: '7px 14px',
              borderRadius: '7px',
              background: '#161622',
              border: '1px solid #2b2b3e',
              color: '#cbd5e1',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isAr ? 'إعادة ضبط الكل' : 'Reset All'}
          </button>
        </div>
      </div>

      {/* Main Responsive Workspace Grid: Sidebar Controls (6 Sections) + Large Live 3D Stage & Export (Section 7) */}
      <div
        className="flex flex-col lg:grid lg:grid-cols-[410px_1fr] lg:flex-1 lg:min-h-0 lg:overflow-hidden"
        style={{ background: '#09090f' }}
      >
        {/* Control Panel Column */}
        <aside
          className="order-2 lg:order-1 flex flex-col lg:min-h-0 lg:overflow-hidden"
          style={{
            background: '#0d0d15',
            borderInlineEnd: '1px solid #1e1e2d',
          }}
        >
          {/* 6-Section Segmented Navigation Strip */}
          <div
            role="tablist"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '6px',
              padding: '12px 14px',
              background: '#0b0b12',
              borderBottom: '1px solid #1d1d2b',
              flexShrink: 0,
            }}
          >
            {sectionTabs.map((tab) => {
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-section={tab.id}
                  onClick={() => setActiveSection(tab.id)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '7px',
                    border: active ? '1px solid rgba(245, 158, 11, 0.7)' : '1px solid #222232',
                    background: active ? 'rgba(245, 158, 11, 0.14)' : '#13131d',
                    color: active ? '#fde047' : '#a8a8be',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.num}. {isAr ? tab.labelAr : tab.labelEn}
                </button>
              );
            })}
          </div>

          {/* Active Section Scrollable Controls Body */}
          <div
            className="lg:flex-1 lg:overflow-y-auto"
            style={{
              padding: '16px 16px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* SECTION 1: Name & Typography */}
            {activeSection === 'text' && (
              <>
                <div>
                  <label
                    htmlFor="name3dTextInput"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: '#ffffff',
                      marginBottom: '8px',
                    }}
                  >
                    {isAr ? '1. اكتب الاسم أو اللقب (عربي / إنجليزي / رموز)' : '1. Enter Name or Title'}
                  </label>
                  <input
                    ref={textInputRef}
                    id="name3dTextInput"
                    type="text"
                    dir={isTextRtl ? 'rtl' : 'ltr'}
                    value={config.text}
                    maxLength={42}
                    placeholder={isAr ? 'اكتب اسمك هنا...' : 'Type your 3D name...'}
                    onChange={(e) => updateConfig('text', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '9px',
                      background: '#151522',
                      border: '1px solid #383854',
                      color: '#ffffff',
                      fontSize: '18px',
                      fontWeight: 800,
                      outline: 'none',
                    }}
                  />
                  <div style={{ fontSize: '11px', color: '#8e8ea8', marginTop: '6px' }}>
                    {isAr
                      ? 'يدعم اللغة العربية المتصلة بالتشكيل، والإنجليزية، والأرقام، والرموز المزخرفة فورياً.'
                      : 'Supports full Arabic RTL shaping, diacritics, English, numbers & symbols instantly.'}
                  </div>
                </div>

                {/* Decorative Symbols Quick Insert */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '7px' }}>
                    {isAr ? 'إدراج رموز وزخارف ملكية' : 'Insert Royal Symbols'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {DECORATIVE_SYMBOLS.map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => insertSymbol(sym)}
                        style={{
                          minWidth: '38px',
                          height: '32px',
                          padding: '0 8px',
                          borderRadius: '6px',
                          background: '#161624',
                          border: '1px solid #2b2b40',
                          color: '#fde047',
                          fontSize: '14px',
                          cursor: 'pointer',
                        }}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sample Names */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '7px' }}>
                    {isAr ? 'نماذج سريعة للتجربة' : 'Quick Sample Names'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {SAMPLE_NAMES.map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => updateConfig('text', sample)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          background: config.text === sample ? 'rgba(245, 158, 11, 0.16)' : '#141420',
                          border:
                            config.text === sample
                              ? '1px solid rgba(245, 158, 11, 0.65)'
                              : '1px solid #262638',
                          color: config.text === sample ? '#fde047' : '#cbd5e1',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3D Font Family Picker */}
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                    {isAr ? 'أشكال الخطوط ثلاثية الأبعاد' : '3D Typography Font Family'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {NAME3D_FONT_OPTIONS.map((font) => {
                      const active = config.fontId === font.id;
                      return (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => updateConfig('fontId', font.id)}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            textAlign: isAr ? 'right' : 'left',
                            background: active ? 'rgba(245, 158, 11, 0.12)' : '#13131e',
                            border: active
                              ? '1px solid rgba(245, 158, 11, 0.7)'
                              : '1px solid #242436',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              fontFamily: font.cssFamily,
                              fontWeight: font.weight as any,
                              fontSize: '15px',
                              color: active ? '#fde047' : '#ffffff',
                              marginBottom: '2px',
                            }}
                          >
                            {font.sample}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                            {isAr ? font.labelAr : font.labelEn}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* SECTION 2: 3D Shape & Dimensions */}
            {activeSection === 'shape' && (
              <>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                    {isAr ? '2. اختيار شكل وبروز المجسم 3D' : '2. 3D Sculptural Bevel Style'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {NAME3D_SHAPE_STYLES.map((styleOpt) => {
                      const active = config.shapeStyleId === styleOpt.id;
                      return (
                        <button
                          key={styleOpt.id}
                          type="button"
                          onClick={() => updateConfig('shapeStyleId', styleOpt.id)}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            textAlign: isAr ? 'right' : 'left',
                            background: active ? 'rgba(245, 158, 11, 0.14)' : '#13131e',
                            border: active
                              ? '1px solid rgba(245, 158, 11, 0.72)'
                              : '1px solid #242436',
                            cursor: 'pointer',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '12.5px',
                              fontWeight: 700,
                              color: active ? '#fde047' : '#ffffff',
                              marginBottom: '3px',
                            }}
                          >
                            {isAr ? styleOpt.labelAr : styleOpt.labelEn}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#94a3b8', lineHeight: 1.35 }}>
                            {isAr ? styleOpt.descAr : styleOpt.descEn}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ height: '1px', background: '#1e1e2e' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <SliderControl
                    id="name3dFontSize"
                    label={isAr ? 'حجم الاسم' : 'Name Size'}
                    value={config.fontSize}
                    min={48}
                    max={150}
                    unit="%"
                    onChange={(v) => updateConfig('fontSize', v)}
                  />
                  <SliderControl
                    id="name3dThickness"
                    label={isAr ? 'سُمك الحروف' : 'Letter Thickness'}
                    value={config.letterThickness}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(v) => updateConfig('letterThickness', v)}
                  />
                  <SliderControl
                    id="name3dDepth"
                    label={isAr ? 'عمق المجسم ثلاثي الأبعاد' : '3D Extrusion Depth'}
                    value={config.extrudeDepth}
                    min={6}
                    max={120}
                    unit="px"
                    onChange={(v) => updateConfig('extrudeDepth', v)}
                  />
                  <SliderControl
                    id="name3dSpacing"
                    label={isAr ? 'المسافة بين الحروف' : 'Letter Spacing'}
                    value={config.letterSpacing}
                    min={-8}
                    max={36}
                    unit="px"
                    onChange={(v) => updateConfig('letterSpacing', v)}
                  />
                </div>

                <div style={{ height: '1px', background: '#1e1e2e' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#ffffff' }}>
                      {isAr ? 'زاوية عرض ودوران المجسم' : '3D Viewing Rotation Angles'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfig((prev) => ({
                          ...prev,
                          viewAngleX: -8,
                          viewAngleY: 16,
                          viewAngleZ: 0,
                        }));
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        background: '#191926',
                        border: '1px solid #2d2d42',
                        color: '#cbd5e1',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {isAr ? 'تصفير الزوايا' : 'Reset'}
                    </button>
                  </div>
                  <SliderControl
                    id="name3dAngleY"
                    label={isAr ? 'زاوية الدوران الأفقية (Y)' : 'Horizontal Angle (Y)'}
                    value={config.viewAngleY}
                    min={-75}
                    max={75}
                    unit="°"
                    onChange={(v) => updateConfig('viewAngleY', v)}
                  />
                  <SliderControl
                    id="name3dAngleX"
                    label={isAr ? 'زاوية الميل الرأسي (X)' : 'Vertical Tilt (X)'}
                    value={config.viewAngleX}
                    min={-55}
                    max={55}
                    unit="°"
                    onChange={(v) => updateConfig('viewAngleX', v)}
                  />
                  <SliderControl
                    id="name3dAngleZ"
                    label={isAr ? 'زاوية الإمالة الجانبية (Z)' : 'Roll Angle (Z)'}
                    value={config.viewAngleZ}
                    min={-45}
                    max={45}
                    unit="°"
                    onChange={(v) => updateConfig('viewAngleZ', v)}
                  />
                </div>
              </>
            )}

            {/* SECTION 3: 3D Animation Library (12 Presets + Speed/Direction/Duration) */}
            {activeSection === 'animation' && (
              <>
                {/* Immediate Speed, Duration & Direction Controls */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '12px',
                    borderRadius: '9px',
                    background: '#12121c',
                    border: '1px solid #242436',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                    {isAr ? '3. التحكم في الحركة والأنيميشن' : '3. Motion Controls'}
                  </div>
                  <SliderControl
                    id="name3dAnimSpeed"
                    label={isAr ? 'سرعة الحركة' : 'Animation Speed'}
                    value={config.animationSpeed}
                    min={0.25}
                    max={3.0}
                    step={0.05}
                    unit="x"
                    onChange={(v) => updateConfig('animationSpeed', v)}
                  />
                  <SliderControl
                    id="name3dAnimDuration"
                    label={isAr ? 'مدة الدورة الزمنية' : 'Cycle Duration'}
                    value={config.animationDuration}
                    min={1.5}
                    max={8.0}
                    step={0.5}
                    unit="s"
                    onChange={(v) => updateConfig('animationDuration', v)}
                  />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                      {isAr ? 'اتجاه الحركة' : 'Motion Direction'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                      {(
                        [
                          { id: 'normal', ar: 'عادي', en: 'Normal' },
                          { id: 'reverse', ar: 'عكسي', en: 'Reverse' },
                          { id: 'alternate', ar: 'ذهاب وإياب', en: 'Alternate' },
                        ] as Array<{ id: Name3DAnimDirection; ar: string; en: string }>
                      ).map((dir) => {
                        const active = config.animationDirection === dir.id;
                        return (
                          <button
                            key={dir.id}
                            type="button"
                            onClick={() => updateConfig('animationDirection', dir.id)}
                            style={{
                              padding: '7px 6px',
                              borderRadius: '7px',
                              background: active ? 'rgba(245, 158, 11, 0.16)' : '#171726',
                              border: active
                                ? '1px solid rgba(245, 158, 11, 0.7)'
                                : '1px solid #2b2b40',
                              color: active ? '#fde047' : '#cbd5e1',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {isAr ? dir.ar : dir.en}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
                    {isAr ? 'مكتبة حركات وتأثيرات 3D Animation (12 حركة)' : '3D Animation Presets (12 Effects)'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>
                    {isAr
                      ? 'مرر الماوس على أي حركة لمعاينتها مباشرة على المجسم، واضغط عليها لاختيارها.'
                      : 'Hover any preset for an instant live preview on stage, click to apply.'}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {NAME3D_ANIMATION_PRESETS.map((anim) => {
                      const active = config.animationId === anim.id;
                      const previewing = previewAnimOverride === anim.id;
                      return (
                        <button
                          key={anim.id}
                          type="button"
                          data-anim-id={anim.id}
                          onMouseEnter={() => setPreviewAnimOverride(anim.id)}
                          onMouseLeave={() => setPreviewAnimOverride(null)}
                          onClick={() => {
                            setPreviewAnimOverride(null);
                            setConfig((prev) => ({
                              ...prev,
                              animationId: anim.id,
                              isPlaying: anim.id !== 'none',
                            }));
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            textAlign: isAr ? 'right' : 'left',
                            background: active
                              ? 'rgba(245, 158, 11, 0.16)'
                              : previewing
                                ? 'rgba(124, 92, 255, 0.12)'
                                : '#13131e',
                            border: active
                              ? '1px solid rgba(245, 158, 11, 0.78)'
                              : previewing
                                ? '1px solid rgba(124, 92, 255, 0.55)'
                                : '1px solid #242436',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              marginBottom: '2px',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '12.5px',
                                fontWeight: 700,
                                color: active ? '#fde047' : '#ffffff',
                              }}
                            >
                              {isAr ? anim.labelAr : anim.labelEn}
                            </span>
                            {active && (
                              <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#34d399' }}>
                                {isAr ? 'مُفعّلة' : 'Active'}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {isAr ? anim.shortDescAr : anim.shortDescEn}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* SECTION 4: Colors, Gradients & Luxury Metals */}
            {activeSection === 'colors' && (
              <>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                    {isAr ? '4. المعادن الفاخرة والذهب والكروم' : '4. Luxury Metals, Gold & Chrome'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {NAME3D_MATERIAL_PRESETS.map((preset) => {
                      const active = config.materialPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyMaterialPreset(preset)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '9px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: active ? 'rgba(245, 158, 11, 0.14)' : '#13131e',
                            border: active
                              ? '1px solid rgba(245, 158, 11, 0.75)'
                              : '1px solid #252538',
                            cursor: 'pointer',
                            textAlign: isAr ? 'right' : 'left',
                          }}
                        >
                          <span
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '6px',
                              background: preset.swatchGradient,
                              border: '1px solid rgba(255,255,255,0.25)',
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: '11.5px',
                              fontWeight: 700,
                              color: active ? '#fde047' : '#e2e8f0',
                              lineHeight: 1.25,
                            }}
                          >
                            {isAr ? preset.labelAr : preset.labelEn}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ height: '1px', background: '#1e1e2e' }} />

                {/* Front Face Gradient & Multi-Color Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#ffffff' }}>
                      {isAr ? 'ألوان وتدرج واجهة الحروف (Front Face)' : 'Front Face Colors & Gradient'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          materialPresetId: 'custom',
                          faceGradientEnabled: !prev.faceGradientEnabled,
                        }))
                      }
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: config.faceGradientEnabled
                          ? 'rgba(245, 158, 11, 0.18)'
                          : '#181826',
                        border: config.faceGradientEnabled
                          ? '1px solid rgba(245, 158, 11, 0.65)'
                          : '1px solid #2e2e44',
                        color: config.faceGradientEnabled ? '#fde047' : '#94a3b8',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {config.faceGradientEnabled
                        ? isAr
                          ? 'تدرج متعدد: مُفعّل'
                          : 'Gradient: ON'
                        : isAr
                          ? 'لون واحد'
                          : 'Solid Color'}
                    </button>
                  </div>

                  {!config.faceGradientEnabled ? (
                    <ColorHexRow
                      id="name3dFaceSolidHex"
                      label={isAr ? 'لون الواجهة الأساسي' : 'Front Face Color'}
                      value={config.faceColor}
                      onChange={(hex) =>
                        setConfig((prev) => ({
                          ...prev,
                          materialPresetId: 'custom',
                          faceColor: hex,
                        }))
                      }
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {config.faceColors.map((col, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ flex: 1 }}>
                            <ColorHexRow
                              id={`name3dGradStop_${idx}`}
                              label={isAr ? `لون التدرج ${idx + 1}` : `Gradient Stop ${idx + 1}`}
                              value={col}
                              onChange={(hex) => {
                                const next = [...config.faceColors];
                                next[idx] = hex;
                                setConfig((prev) => ({
                                  ...prev,
                                  materialPresetId: 'custom',
                                  faceColors: next,
                                  faceColor: next[0],
                                }));
                              }}
                            />
                          </div>
                          {config.faceColors.length > 2 && (
                            <button
                              type="button"
                              title={isAr ? 'حذف اللون' : 'Remove color'}
                              onClick={() => {
                                const next = config.faceColors.filter((_, i) => i !== idx);
                                setConfig((prev) => ({
                                  ...prev,
                                  materialPresetId: 'custom',
                                  faceColors: next,
                                }));
                              }}
                              style={{
                                width: '32px',
                                height: '42px',
                                borderRadius: '7px',
                                background: '#1c1218',
                                border: '1px solid #4c1d2e',
                                color: '#fca5a5',
                                fontSize: '15px',
                                cursor: 'pointer',
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}

                      {config.faceColors.length < 4 && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfig((prev) => ({
                              ...prev,
                              materialPresetId: 'custom',
                              faceColors: [...prev.faceColors, '#ffffff'],
                            }));
                          }}
                          style={{
                            padding: '7px 12px',
                            borderRadius: '7px',
                            background: '#151523',
                            border: '1px dashed #3e3e5e',
                            color: '#cbd5e1',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {isAr ? '+ إضافة لون إضافي للتصميم' : '+ Add Gradient Color Stop'}
                        </button>
                      )}

                      <SliderControl
                        id="name3dFaceGradAngle"
                        label={isAr ? 'زاوية التدرج اللوني' : 'Gradient Angle'}
                        value={config.faceGradientAngle}
                        min={0}
                        max={360}
                        unit="°"
                        onChange={(v) => updateConfig('faceGradientAngle', v)}
                      />
                    </div>
                  )}
                </div>

                <div style={{ height: '1px', background: '#1e1e2e' }} />

                {/* Independent Side & Extrusion Depth Colors */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#ffffff' }}>
                    {isAr ? 'ألوان الجوانب وعمق المجسم بشكل منفصل' : 'Independent Side & 3D Depth Colors'}
                  </div>
                  <ColorHexRow
                    id="name3dSideColorHex"
                    label={isAr ? 'لون جوانب وحواف الحروف (Sides)' : 'Side / Bevel Color'}
                    value={config.sideColor}
                    onChange={(hex) =>
                      setConfig((prev) => ({
                        ...prev,
                        materialPresetId: 'custom',
                        sideColor: hex,
                      }))
                    }
                  />
                  <ColorHexRow
                    id="name3dDepthColorHex"
                    label={isAr ? 'لون عمق المجسم الخلفي (Depth)' : '3D Extrusion Depth Color'}
                    value={config.depthColor}
                    onChange={(hex) =>
                      setConfig((prev) => ({
                        ...prev,
                        materialPresetId: 'custom',
                        depthColor: hex,
                      }))
                    }
                  />

                  {/* Moving reflection shimmer toggle */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: '#13131f',
                      border: '1px solid #26263a',
                      cursor: 'pointer',
                      marginTop: '4px',
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
                      {isAr ? 'انعكاس ولمعان متحرك للألوان' : 'Animated Color Shimmer Sweep'}
                    </span>
                    <input
                      type="checkbox"
                      checked={config.animatedColorShimmer}
                      onChange={(e) => updateConfig('animatedColorShimmer', e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#f59e0b' }}
                    />
                  </label>
                </div>
              </>
            )}

            {/* SECTION 5: Background Studio */}
            {activeSection === 'background' && (
              <>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                    {isAr ? '5. تخصيص الخلفية والمؤثرات المحيطة' : '5. Background & Atmosphere'}
                  </div>

                  {/* Background Mode Switch */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '12px' }}>
                    {(
                      [
                        { id: 'solid', ar: 'لون ثابت', en: 'Solid' },
                        { id: 'gradient', ar: 'تدرج لوني', en: 'Gradient' },
                        { id: 'transparent', ar: 'شفافة بالكامل', en: 'Transparent' },
                      ] as const
                    ).map((m) => {
                      const active = config.bgMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => updateConfig('bgMode', m.id)}
                          style={{
                            padding: '8px 6px',
                            borderRadius: '7px',
                            background: active ? 'rgba(245, 158, 11, 0.16)' : '#141420',
                            border: active
                              ? '1px solid rgba(245, 158, 11, 0.7)'
                              : '1px solid #262638',
                            color: active ? '#fde047' : '#cbd5e1',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {isAr ? m.ar : m.en}
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick Background Presets */}
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '7px' }}>
                    {isAr ? 'خلفيات جاهزة (سوداء / ذهبية / بيضاء / شفافة)' : 'Quick Studio Backdrops'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                    {NAME3D_BG_PRESETS.map((bp) => {
                      const active = config.bgPresetId === bp.id && config.bgMode === bp.bgMode;
                      const swatchBg =
                        bp.bgMode === 'transparent'
                          ? 'repeating-conic-gradient(#52525b 0% 25%, #27272a 0% 50%) 50% / 10px 10px'
                          : bp.bgMode === 'solid'
                            ? bp.bgColor
                            : `linear-gradient(${bp.bgGradientAngle}deg, ${bp.bgGradientColors[0]}, ${bp.bgGradientColors[2]})`;
                      return (
                        <button
                          key={bp.id}
                          type="button"
                          onClick={() => {
                            setConfig((prev) => ({
                              ...prev,
                              bgPresetId: bp.id,
                              bgMode: bp.bgMode,
                              bgColor: bp.bgColor,
                              bgGradientColors: [...bp.bgGradientColors] as [string, string, string],
                              bgGradientAngle: bp.bgGradientAngle,
                              bgGlowColor: bp.bgGlowColor,
                              bgGlowIntensity: bp.bgGlowIntensity,
                            }));
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: active ? 'rgba(245, 158, 11, 0.14)' : '#13131e',
                            border: active
                              ? '1px solid rgba(245, 158, 11, 0.72)'
                              : '1px solid #242436',
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '5px',
                              background: swatchBg,
                              border: '1px solid rgba(255,255,255,0.22)',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: '11.5px', fontWeight: 700, color: active ? '#fde047' : '#e2e8f0' }}>
                            {isAr ? bp.labelAr : bp.labelEn}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {config.bgMode === 'solid' && (
                  <ColorHexRow
                    id="name3dBgSolidHex"
                    label={isAr ? 'لون الخلفية' : 'Background Color'}
                    value={config.bgColor}
                    onChange={(hex) =>
                      setConfig((prev) => ({ ...prev, bgPresetId: 'custom', bgColor: hex }))
                    }
                  />
                )}

                {config.bgMode === 'gradient' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {config.bgGradientColors.map((col, idx) => (
                      <ColorHexRow
                        key={idx}
                        id={`name3dBgGrad_${idx}`}
                        label={isAr ? `لون تدرج الخلفية ${idx + 1}` : `BG Gradient ${idx + 1}`}
                        value={col}
                        onChange={(hex) => {
                          const next = [...config.bgGradientColors] as [string, string, string];
                          next[idx] = hex;
                          setConfig((prev) => ({
                            ...prev,
                            bgPresetId: 'custom',
                            bgGradientColors: next,
                          }));
                        }}
                      />
                    ))}
                    <SliderControl
                      id="name3dBgAngle"
                      label={isAr ? 'زاوية تدرج الخلفية' : 'BG Gradient Angle'}
                      value={config.bgGradientAngle}
                      min={0}
                      max={360}
                      unit="°"
                      onChange={(v) => updateConfig('bgGradientAngle', v)}
                    />
                  </div>
                )}

                {config.bgMode !== 'transparent' && (
                  <>
                    <div style={{ height: '1px', background: '#1e1e2e' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <SliderControl
                        id="name3dBgGlow"
                        label={isAr ? 'إضاءة الخلفية المحيطة' : 'Background Ambient Spotlight'}
                        value={config.bgGlowIntensity}
                        min={0}
                        max={100}
                        unit="%"
                        onChange={(v) => updateConfig('bgGlowIntensity', v)}
                      />
                      <ColorHexRow
                        id="name3dBgGlowColor"
                        label={isAr ? 'لون إضاءة الخلفية' : 'Spotlight Glow Color'}
                        value={config.bgGlowColor}
                        onChange={(hex) => updateConfig('bgGlowColor', hex)}
                      />
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: '#13131f',
                          border: '1px solid #26263a',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
                          {isAr ? 'مؤثرات الجزيئات اللامعة حول الاسم' : '3D Floating Bokeh Particles'}
                        </span>
                        <input
                          type="checkbox"
                          checked={config.bgParticlesEnabled}
                          onChange={(e) => updateConfig('bgParticlesEnabled', e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: '#f59e0b' }}
                        />
                      </label>
                    </div>
                  </>
                )}
              </>
            )}

            {/* SECTION 6: Lighting, Reflections, Shadows & Glow */}
            {activeSection === 'lighting' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                  {isAr ? '6. إعدادات الإضاءة والانعكاسات والظلال والتوهج' : '6. Studio Lighting & Surface Effects'}
                </div>

                <SliderControl
                  id="name3dLightInt"
                  label={isAr ? 'مستوى الإضاءة' : 'Lighting Intensity'}
                  value={config.lightingIntensity}
                  min={20}
                  max={200}
                  unit="%"
                  onChange={(v) => updateConfig('lightingIntensity', v)}
                />
                <SliderControl
                  id="name3dReflect"
                  label={isAr ? 'قوة الانعكاسات المعدنية' : 'Environment Reflections'}
                  value={config.reflectionStrength}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => updateConfig('reflectionStrength', v)}
                />
                <SliderControl
                  id="name3dShadow"
                  label={isAr ? 'شدة الظلال' : 'Shadow Intensity'}
                  value={config.shadowIntensity}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => updateConfig('shadowIntensity', v)}
                />
                <SliderControl
                  id="name3dShininess"
                  label={isAr ? 'درجة اللمعان والصقل' : 'Surface Shininess'}
                  value={config.shininess}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => updateConfig('shininess', v)}
                />
                <SliderControl
                  id="name3dMetalness"
                  label={isAr ? 'التأثير المعدني (Metalness)' : 'Metallic Finish'}
                  value={config.metalness}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => updateConfig('metalness', v)}
                />
                <SliderControl
                  id="name3dGlow"
                  label={isAr ? 'قوة التوهج حول الاسم' : 'Aura Glow Strength'}
                  value={config.glowStrength}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => updateConfig('glowStrength', v)}
                />
                <ColorHexRow
                  id="name3dGlowColorHex"
                  label={isAr ? 'لون التوهج والبريق' : 'Glow & Shimmer Color'}
                  value={config.glowColor}
                  onChange={(hex) => updateConfig('glowColor', hex)}
                />
              </div>
            )}
          </div>
        </aside>

        {/* SECTION 7: Large Live 3D Preview Stage & Multi-Format Export Studio */}
        <section
          className="order-1 lg:order-2 flex flex-col lg:h-full lg:min-h-0 overflow-hidden shrink-0 lg:shrink"
          style={{
            background: '#08080e',
          }}
        >
          {/* Live 3D WebGL Viewport */}
          <div
            className="relative flex-1 min-h-[290px] sm:min-h-[360px] lg:min-h-0 overflow-hidden"
            style={{
              ...stageBackdropStyle,
            }}
          >
            {/* Background Ambient Spotlight Overlay (matches export 1:1) */}
            {config.bgMode !== 'transparent' && config.bgGlowIntensity > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  background: `radial-gradient(circle at 50% 50%, ${hexToRgba(
                    config.bgGlowColor,
                    Math.min(0.65, (config.bgGlowIntensity / 100) * 0.55)
                  )} 0%, ${hexToRgba(
                    config.bgGlowColor,
                    Math.min(0.2, (config.bgGlowIntensity / 100) * 0.16)
                  )} 48%, rgba(0,0,0,0) 74%)`,
                }}
              />
            )}

            {/* Dedicated WebGL Mount Container */}
            <div
              ref={canvasMountRef}
              id="name3dWebglStage"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                cursor: 'grab',
              }}
            />

            {webglError && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  padding: '24px',
                  background: 'rgba(10,10,16,0.9)',
                  color: '#fca5a5',
                  fontSize: '14px',
                  fontWeight: 700,
                }}
              >
                {webglError}
              </div>
            )}

            {/* Minimal Top-Corner Quiet Interaction Hint (no backdrop-filter over WebGL!) */}
            <div
              style={{
                position: 'absolute',
                top: '14px',
                insetInlineStart: '16px',
                pointerEvents: 'none',
                fontSize: '11.5px',
                color: config.bgMode === 'solid' && config.bgColor.toLowerCase() === '#ffffff' ? '#334155' : '#cbd5e1',
                background: config.bgMode === 'solid' && config.bgColor.toLowerCase() === '#ffffff' ? 'rgba(255,255,255,0.85)' : 'rgba(11,11,18,0.78)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '7px',
                padding: '5px 10px',
              }}
            >
              {isAr
                ? 'اسحب بالماوس لتدوير الاسم 360° · عجلة الماوس للتكبير والتصغير'
                : 'Drag to orbit 360° · Scroll to zoom'}
            </div>

            {previewAnimOverride && (
              <div
                style={{
                  position: 'absolute',
                  top: '14px',
                  insetInlineEnd: '16px',
                  pointerEvents: 'none',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#fde047',
                  background: 'rgba(12, 12, 22, 0.88)',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  borderRadius: '7px',
                  padding: '5px 10px',
                }}
              >
                {isAr ? 'معاينة مباشرة للحركة...' : 'Live Animation Preview...'}
              </div>
            )}

            {/* Export Progress Bar Overlay */}
            {isExporting && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(7, 7, 12, 0.82)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  padding: '24px',
                  zIndex: 20,
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                  {exportStatus}
                </div>
                <div
                  style={{
                    width: 'min(360px, 85%)',
                    height: '8px',
                    borderRadius: '99px',
                    background: '#1e1e2e',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${exportProgress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #f59e0b, #fde047)',
                      transition: 'width 0.12s linear',
                    }}
                  />
                </div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#fde047' }}>
                  {exportProgress}%
                </div>
              </div>
            )}

            {/* Toast Notification */}
            {toastMsg && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#111827',
                  border: '1px solid rgba(245, 158, 11, 0.65)',
                  color: '#fef08a',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  zIndex: 25,
                  whiteSpace: 'nowrap',
                }}
              >
                {toastMsg}
              </div>
            )}
          </div>

          {/* Section 7 Export Bar */}
          <div
            style={{
              padding: '14px 20px',
              background: '#0d0d16',
              borderTop: '1px solid #1f1f30',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              flexShrink: 0,
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff' }}>
                {isAr ? '7. تصدير التصميم ثلاثي الأبعاد بجودة عالية' : '7. High-Resolution 3D Export'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                {isAr
                  ? 'يحافظ التصدير على الإضاءة والانعكاسات المعدنية والحركة الكاملة بدقة عالية'
                  : 'Preserves PBR reflections, lighting, shadows, and smooth 3D motion'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                id="name3dExportPngTransparentBtn"
                disabled={isExporting}
                onClick={() => handleExportPng(true)}
                style={{
                  padding: '9px 15px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
                  border: '1px solid #fbbf24',
                  color: '#09090f',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: isExporting ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isAr ? 'تنزيل PNG شفاف' : 'Download Transparent PNG'}
              </button>

              <button
                type="button"
                id="name3dExportPngColoredBtn"
                disabled={isExporting}
                onClick={() => handleExportPng(false)}
                style={{
                  padding: '9px 15px',
                  borderRadius: '8px',
                  background: '#171726',
                  border: '1px solid #353552',
                  color: '#f8fafc',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: isExporting ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isAr ? 'تنزيل PNG بخلفية ملونة' : 'Download Colored PNG'}
              </button>

              <button
                type="button"
                id="name3dExportGifBtn"
                disabled={isExporting}
                onClick={handleExportGif}
                style={{
                  padding: '9px 15px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                  border: '1px solid #a78bfa',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: isExporting ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isAr ? 'تصدير GIF متحرك' : 'Export Animated GIF'}
              </button>

              <button
                type="button"
                id="name3dExportMp4Btn"
                disabled={isExporting}
                onClick={handleExportMp4}
                style={{
                  padding: '9px 15px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  border: '1px solid #34d399',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: isExporting ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isAr ? 'تصدير فيديو MP4' : 'Export MP4 Video'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
