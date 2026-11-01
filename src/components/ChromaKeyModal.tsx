import { useEffect, useRef, useState } from 'react';
import {
  ChromaKeyConfig,
  INITIAL_CHROMA_KEY,
  applyChromaKeyToContext,
  autoDetectChromaKeyColor,
  rgbToHex,
} from '../utils/chromaKey';

interface ChromaKeyModalProps {
  open: boolean;
  config: ChromaKeyConfig;
  isAr?: boolean;
  onClose: () => void;
  onApply: (nextConfig: ChromaKeyConfig) => void;
}

export default function ChromaKeyModal({
  open,
  config,
  isAr = true,
  onClose,
  onApply,
}: ChromaKeyModalProps) {
  const [keyColor, setKeyColor] = useState<string>(config.keyColor || '#00ff00');
  const [similarity, setSimilarity] = useState<number>(config.similarity ?? 42);
  const [smoothness, setSmoothness] = useState<number>(config.smoothness ?? 14);
  const [spillSuppression, setSpillSuppression] = useState<number>(config.spillSuppression ?? 65);
  const [edgeChoke, setEdgeChoke] = useState<number>(config.edgeChoke ?? 1);
  const [applyToLayers, setApplyToLayers] = useState<boolean>(config.applyToLayers ?? true);
  const [eyedropperActive, setEyedropperActive] = useState<boolean>(false);
  const [compareOriginal, setCompareOriginal] = useState<boolean>(false);
  const [aspectSize, setAspectSize] = useState<{ w: number; h: number }>({ w: 350, h: 350 });
  const [bgState, setBgState] = useState<{ type: 'chk' | 'color'; val: string }>({
    type: 'chk',
    val: 'chk',
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setKeyColor(config.keyColor || '#00ff00');
    setSimilarity(config.similarity ?? 42);
    setSmoothness(config.smoothness ?? 14);
    setSpillSuppression(config.spillSuppression ?? 65);
    setEdgeChoke(config.edgeChoke ?? 1);
    setApplyToLayers(config.applyToLayers ?? true);
    setEyedropperActive(false);
    setCompareOriginal(false);
  }, [open, config]);

  // Live preview render loop
  useEffect(() => {
    if (!open) return;
    let rafId = 0;

    if (!rawCanvasRef.current) {
      rawCanvasRef.current = document.createElement('canvas');
    }

    const draftCfg: ChromaKeyConfig = {
      enabled: !compareOriginal,
      keyColor,
      similarity,
      smoothness,
      spillSuppression,
      edgeChoke,
      applyToLayers,
    };

    const findStageSource = (): HTMLCanvasElement | HTMLVideoElement | HTMLImageElement | null => {
      const viewEl = document.getElementById('view');
      if (!viewEl) return null;
      const vid = viewEl.querySelector('video');
      if (vid && vid.videoWidth > 0 && vid.videoHeight > 0 && !(window as any).SV) {
        return vid;
      }
      const canvases = Array.from(viewEl.querySelectorAll('canvas')).filter(
        (c) => c.id !== 'chromaLiveCanvas'
      );
      const visibleCanvas =
        canvases.find((c) => c.width > 0 && c.height > 0 && c.style.display !== 'none') ||
        canvases[0];
      if (visibleCanvas && visibleCanvas.width > 0 && visibleCanvas.height > 0) {
        return visibleCanvas;
      }
      if (vid && vid.videoWidth > 0 && vid.videoHeight > 0) {
        return vid;
      }
      const img = viewEl.querySelector('img');
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        return img;
      }
      return null;
    };

    const drawDemoGreenScreenEmblem = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      // Green screen demo background
      ctx.fillStyle = '#00d828';
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const r = Math.min(W, H) * 0.34;

      // Golden royal crown emblem in center
      const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      grad.addColorStop(0, '#fef08a');
      grad.addColorStop(0.55, '#f59e0b');
      grad.addColorStop(1, '#b45309');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fde047';
      ctx.stroke();
    };

    const renderLoop = () => {
      const cv = canvasRef.current;
      const rawCv = rawCanvasRef.current;
      if (cv && rawCv) {
        const src = findStageSource();
        let srcW = 350;
        let srcH = 350;
        if (src instanceof HTMLCanvasElement) {
          srcW = src.width || 350;
          srcH = src.height || 350;
        } else if (src instanceof HTMLVideoElement) {
          srcW = src.videoWidth || 350;
          srcH = src.videoHeight || 350;
        } else if (src instanceof HTMLImageElement) {
          srcW = src.naturalWidth || 350;
          srcH = src.naturalHeight || 350;
        }

        const maxBox = 350;
        const scale = Math.min(maxBox / srcW, maxBox / srcH);
        const dispW = Math.max(140, Math.round(srcW * scale));
        const dispH = Math.max(140, Math.round(srcH * scale));

        if (cv.width !== dispW || cv.height !== dispH) {
          cv.width = dispW;
          cv.height = dispH;
          setAspectSize({ w: dispW, h: dispH });
        }
        if (rawCv.width !== dispW || rawCv.height !== dispH) {
          rawCv.width = dispW;
          rawCv.height = dispH;
        }

        const ctx = cv.getContext('2d', { willReadFrequently: true });
        const rawCtx = rawCv.getContext('2d', { willReadFrequently: true });
        if (ctx && rawCtx) {
          rawCtx.clearRect(0, 0, dispW, dispH);
          if (src) {
            try {
              rawCtx.drawImage(src, 0, 0, dispW, dispH);
            } catch {
              drawDemoGreenScreenEmblem(rawCtx, dispW, dispH);
            }
          } else {
            drawDemoGreenScreenEmblem(rawCtx, dispW, dispH);
          }

          ctx.clearRect(0, 0, dispW, dispH);
          ctx.drawImage(rawCv, 0, 0, dispW, dispH);
          if (!compareOriginal) {
            applyChromaKeyToContext(ctx, dispW, dispH, draftCfg);
          }
        }
      }
      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [
    open,
    keyColor,
    similarity,
    smoothness,
    spillSuppression,
    edgeChoke,
    applyToLayers,
    compareOriginal,
  ]);

  if (!open) return null;

  const handleCanvasPickColor = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!eyedropperActive || !rawCanvasRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(
      0,
      Math.min(
        rawCanvasRef.current.width - 1,
        Math.floor(((e.clientX - rect.left) / rect.width) * rawCanvasRef.current.width)
      )
    );
    const y = Math.max(
      0,
      Math.min(
        rawCanvasRef.current.height - 1,
        Math.floor(((e.clientY - rect.top) / rect.height) * rawCanvasRef.current.height)
      )
    );
    const rawCtx = rawCanvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!rawCtx) return;
    const px = rawCtx.getImageData(x, y, 1, 1).data;
    if (px[3] > 10) {
      setKeyColor(rgbToHex(px[0], px[1], px[2]));
      setEyedropperActive(false);
    }
  };

  const handleAutoDetect = () => {
    const rawCv = rawCanvasRef.current;
    if (!rawCv) return;
    const rawCtx = rawCv.getContext('2d', { willReadFrequently: true });
    if (!rawCtx) return;
    const imgData = rawCtx.getImageData(0, 0, rawCv.width, rawCv.height);
    const detected = autoDetectChromaKeyColor(imgData.data, rawCv.width, rawCv.height);
    setKeyColor(detected);
  };

  const handleApplyClick = () => {
    onApply({
      enabled: true,
      keyColor,
      similarity,
      smoothness,
      spillSuppression,
      edgeChoke,
      applyToLayers,
    });
    onClose();
  };

  const handleDisableClick = () => {
    onApply({
      ...INITIAL_CHROMA_KEY,
      enabled: false,
      keyColor,
      similarity,
      smoothness,
      spillSuppression,
      edgeChoke,
      applyToLayers,
    });
    onClose();
  };

  const colorPresets = [
    { hex: '#00ff00', labelAr: 'أخضر كروما', labelEn: 'Pure Green' },
    { hex: '#00b140', labelAr: 'أخضر استوديو', labelEn: 'Studio Green' },
    { hex: '#14d438', labelAr: 'أخضر ناعم', labelEn: 'Soft Green' },
    { hex: '#0047bb', labelAr: 'أزرق كروما', labelEn: 'Chroma Blue' },
    { hex: '#000000', labelAr: 'خلفية سوداء', labelEn: 'Black Key' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Chroma Key Studio"
        dir={isAr ? 'rtl' : 'ltr'}
        style={{
          background: '#141418',
          border: '1px solid #282832',
          borderRadius: '12px',
          width: 'min(920px, 97vw)',
          maxHeight: '94vh',
          overflow: 'auto',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.9)',
          color: '#f4f4f6',
          padding: '22px 26px 26px',
          position: 'relative',
          fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
        }}
      >
        {/* Top-Right Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '18px',
            insetInlineEnd: '18px',
            width: '36px',
            height: '28px',
            borderRadius: '5px',
            background: '#1e1e24',
            border: '1px solid #2c2c35',
            color: '#ef4444',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ marginBottom: '20px', paddingInlineEnd: '44px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9a7cff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
            </svg>
            <h2
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.01em',
              }}
            >
              {isAr
                ? 'إزالة الكروما الخضراء (Chroma Key)'
                : 'Chroma Key & Green Screen Removal'}
            </h2>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#b79cff',
                background: 'rgba(124, 92, 255, 0.14)',
                padding: '2px 9px',
                borderRadius: '6px',
                border: '1px solid rgba(124, 92, 255, 0.32)',
              }}
            >
              {isAr ? 'حماية الألوان الذهبية + تنعيم الحواف' : 'Gold Protection + Smooth Edges'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#80808f' }}>
            {isAr
              ? 'إزالة الخلفية الخضراء أو الزرقاء بدقة عالية مع الحفاظ الكامل على الإطارات والتيجان الذهبية في المعاينة والتصدير.'
              : 'Remove green or blue backgrounds with precision while preserving golden frames and crowns in preview and export.'}
          </p>
        </div>

        {/* Main 2-Column Layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(300px, 1.15fr) minmax(320px, 1.4fr)',
            gap: '22px',
            alignItems: 'start',
          }}
        >
          {/* Preview Column */}
          <div
            style={{
              background: '#1b1b20',
              border: '1px solid #2d2d37',
              borderRadius: '8px',
              padding: '18px 18px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              minHeight: '420px',
            }}
          >
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                color: '#80808f',
              }}
            >
              <span>
                {eyedropperActive
                  ? isAr
                    ? 'اضغط على أي نقطة داخل المعاينة لالتقاط لون الكروما'
                    : 'Click anywhere on the preview to sample key color'
                  : isAr
                  ? 'المعاينة الحية'
                  : 'Live Preview'}
              </span>
              <button
                type="button"
                onMouseDown={() => setCompareOriginal(true)}
                onMouseUp={() => setCompareOriginal(false)}
                onMouseLeave={() => setCompareOriginal(false)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: compareOriginal ? '#7c5cff' : '#13131c',
                  color: compareOriginal ? '#ffffff' : '#e8e8ee',
                  border: compareOriginal ? '1px solid #9a7cff' : '1px solid #282835',
                  cursor: 'pointer',
                }}
              >
                {isAr ? 'اضغط مطولاً للمقارنة بالأصل' : 'Hold to Compare'}
              </button>
            </div>

            <div
              style={{
                flex: 1,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: `${aspectSize.w}px`,
                  height: `${aspectSize.h}px`,
                  position: 'relative',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: eyedropperActive
                    ? '2px dashed #9a7cff'
                    : '1px solid rgba(255, 255, 255, 0.14)',
                  boxShadow: '0 8px 28px rgba(0, 0, 0, 0.45)',
                  background:
                    bgState.type === 'color'
                      ? bgState.val
                      : 'repeating-conic-gradient(#d4d4d8 0 25%, #ffffff 0 50%) 0 0 / 16px 16px',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={350}
                  height={350}
                  onClick={handleCanvasPickColor}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    cursor: eyedropperActive ? 'crosshair' : 'default',
                  }}
                />
              </div>
            </div>

            {/* Background Preview Switcher (identical to EdgeFeatherModal) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'rgba(16, 16, 22, 0.9)',
                border: '1px solid #2e2e3a',
                borderRadius: '99px',
                padding: '5px 12px',
              }}
            >
              <span style={{ fontSize: '11px', color: '#80808f' }}>
                {isAr ? 'خلفية المعاينة:' : 'Preview BG:'}
              </span>
              <button
                type="button"
                title="Transparency Checkerboard"
                onClick={() => setBgState({ type: 'chk', val: 'chk' })}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: 'repeating-conic-gradient(#888 0 25%, #ddd 0 50%) 0 0 / 6px 6px',
                  border: '1px solid rgba(255,255,255,0.4)',
                  outline: bgState.type === 'chk' ? '2px solid #9a7cff' : 'none',
                  outlineOffset: '1px',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
              {['#000000', '#ffffff', '#1e1b4b', '#7c5cff', '#ef4444'].map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setBgState({ type: 'color', val: col })}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: col,
                    border: '1px solid rgba(255,255,255,0.35)',
                    outline:
                      bgState.type === 'color' && bgState.val === col
                        ? '2px solid #9a7cff'
                        : 'none',
                    outlineOffset: '1px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Controls Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 1. Key Color Selection & Auto-Detect */}
            <div
              style={{
                background: '#1b1b20',
                border: '1px solid #2d2d37',
                borderRadius: '8px',
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#d4d4dc' }}>
                  {isAr ? 'لون الكروما المراد إزالته:' : 'Target Chroma Key Color:'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    id="chromaEyedropperBtn"
                    onClick={() => setEyedropperActive((v) => !v)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: eyedropperActive
                        ? 'rgba(124, 92, 255, 0.22)'
                        : '#13131c',
                      color: eyedropperActive ? '#b79cff' : '#e8e8ee',
                      border: eyedropperActive
                        ? '1px solid #7c5cff'
                        : '1px solid #282835',
                    }}
                  >
                    {isAr ? 'التقاط من العرض' : 'Pick from Stage'}
                  </button>
                  <button
                    type="button"
                    id="chromaAutoDetectBtn"
                    onClick={handleAutoDetect}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: 'rgba(124, 92, 255, 0.14)',
                      color: '#b79cff',
                      border: '1px solid rgba(124, 92, 255, 0.38)',
                    }}
                  >
                    {isAr ? 'تحديد تلقائي ذكي' : 'Auto-Detect'}
                  </button>
                </div>
              </div>

              {/* Color Swatches + Custom Color Input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                {colorPresets.map((p) => {
                  const active = keyColor.toLowerCase() === p.hex.toLowerCase();
                  return (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => setKeyColor(p.hex)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: active ? 'rgba(124, 92, 255, 0.18)' : '#13131c',
                        color: active ? '#b79cff' : '#d4d4dc',
                        border: active ? '1px solid #7c5cff' : '1px solid #282835',
                      }}
                    >
                      <span
                        style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '3px',
                          background: p.hex,
                          border: '1px solid rgba(255,255,255,0.35)',
                          display: 'inline-block',
                        }}
                      />
                      <span>{isAr ? p.labelAr : p.labelEn}</span>
                    </button>
                  );
                })}

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: '#13131c',
                    border: '1px solid #282835',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="color"
                    value={keyColor}
                    onChange={(e) => setKeyColor(e.target.value)}
                    style={{
                      width: '18px',
                      height: '18px',
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  />
                  <span style={{ fontFamily: 'monospace', color: '#b79cff' }}>
                    {keyColor.toUpperCase()}
                  </span>
                </label>
              </div>
            </div>

            {/* 2. Precision Keying Sliders */}
            <div
              style={{
                background: '#1b1b20',
                border: '1px solid #2d2d37',
                borderRadius: '8px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Similarity / Tolerance */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    marginBottom: '5px',
                  }}
                >
                  <span style={{ fontWeight: 500, color: '#d4d4dc' }}>
                    {isAr
                      ? 'درجة حساسية إزالة الكروما (Similarity):'
                      : 'Color Similarity / Tolerance:'}
                  </span>
                  <b style={{ color: '#b79cff', fontFamily: 'monospace' }}>{similarity}%</b>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={similarity}
                    onChange={(e) =>
                      setSimilarity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
                    }
                    style={{
                      width: '60px',
                      height: '30px',
                      background: '#1c1c22',
                      border: '1px solid #353542',
                      borderRadius: '5px',
                      color: '#e5e5ea',
                      fontSize: '12px',
                      padding: '0 8px',
                      outline: 'none',
                    }}
                  />
                  <input
                    type="range"
                    id="chromaSimilarityRange"
                    min={1}
                    max={100}
                    value={similarity}
                    onChange={(e) => setSimilarity(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Edge Smoothness */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    marginBottom: '5px',
                  }}
                >
                  <span style={{ fontWeight: 500, color: '#d4d4dc' }}>
                    {isAr
                      ? 'نعومة الحواف وتدرج الشفافية (Smoothness):'
                      : 'Edge Smoothness & Feather:'}
                  </span>
                  <b style={{ color: '#b79cff', fontFamily: 'monospace' }}>{smoothness}%</b>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={smoothness}
                    onChange={(e) =>
                      setSmoothness(Math.max(0, Math.min(50, Number(e.target.value) || 0)))
                    }
                    style={{
                      width: '60px',
                      height: '30px',
                      background: '#1c1c22',
                      border: '1px solid #353542',
                      borderRadius: '5px',
                      color: '#e5e5ea',
                      fontSize: '12px',
                      padding: '0 8px',
                      outline: 'none',
                    }}
                  />
                  <input
                    type="range"
                    id="chromaSmoothnessRange"
                    min={0}
                    max={50}
                    value={smoothness}
                    onChange={(e) => setSmoothness(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Spill Suppression */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    marginBottom: '5px',
                  }}
                >
                  <span style={{ fontWeight: 500, color: '#d4d4dc' }}>
                    {isAr
                      ? 'إزالة انعكاس اللون الأخضر على الحواف (Spill Suppression):'
                      : 'Green Spill Suppression:'}
                  </span>
                  <b style={{ color: '#b79cff', fontFamily: 'monospace' }}>{spillSuppression}%</b>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={spillSuppression}
                    onChange={(e) =>
                      setSpillSuppression(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                    }
                    style={{
                      width: '60px',
                      height: '30px',
                      background: '#1c1c22',
                      border: '1px solid #353542',
                      borderRadius: '5px',
                      color: '#e5e5ea',
                      fontSize: '12px',
                      padding: '0 8px',
                      outline: 'none',
                    }}
                  />
                  <input
                    type="range"
                    id="chromaSpillRange"
                    min={0}
                    max={100}
                    value={spillSuppression}
                    onChange={(e) => setSpillSuppression(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Edge Choke */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    marginBottom: '5px',
                  }}
                >
                  <span style={{ fontWeight: 500, color: '#d4d4dc' }}>
                    {isAr
                      ? 'تنظيف الشوائب حول الحواف (Edge Clean):'
                      : 'Edge Alpha Choke / Clean:'}
                  </span>
                  <b style={{ color: '#b79cff', fontFamily: 'monospace' }}>{edgeChoke}px</b>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={edgeChoke}
                    onChange={(e) =>
                      setEdgeChoke(Math.max(0, Math.min(10, Number(e.target.value) || 0)))
                    }
                    style={{
                      width: '60px',
                      height: '30px',
                      background: '#1c1c22',
                      border: '1px solid #353542',
                      borderRadius: '5px',
                      color: '#e5e5ea',
                      fontSize: '12px',
                      padding: '0 8px',
                      outline: 'none',
                    }}
                  />
                  <input
                    type="range"
                    id="chromaChokeRange"
                    min={0}
                    max={10}
                    value={edgeChoke}
                    onChange={(e) => setEdgeChoke(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>

            {/* 3. Studio Quick Presets & Layer Sync */}
            <div
              style={{
                background: '#1b1b20',
                border: '1px solid #2d2d37',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11.5px', color: '#80808f', fontWeight: 600 }}>
                  {isAr ? 'أوضاع جاهزة:' : 'Presets:'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setKeyColor('#00ff00');
                    setSimilarity(42);
                    setSmoothness(14);
                    setSpillSuppression(65);
                    setEdgeChoke(1);
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'rgba(124, 92, 255, 0.14)',
                    color: '#b79cff',
                    border: '1px solid rgba(124, 92, 255, 0.35)',
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'احترافي متوازن (موصى به)' : 'Balanced Studio'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKeyColor('#00ff00');
                    setSimilarity(58);
                    setSmoothness(18);
                    setSpillSuppression(85);
                    setEdgeChoke(2);
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: '#13131c',
                    color: '#d4d4dc',
                    border: '1px solid #282835',
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'إزالة كروما قوية' : 'Deep Chroma Key'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKeyColor('#00ff00');
                    setSimilarity(32);
                    setSmoothness(20);
                    setSpillSuppression(50);
                    setEdgeChoke(0);
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: '#13131c',
                    color: '#d4d4dc',
                    border: '1px solid #282835',
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'حماية قصوى للذهب والتفاصيل' : 'Max Gold Preservation'}
                </button>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  fontSize: '12px',
                  color: '#d4d4dc',
                  cursor: 'pointer',
                  paddingTop: '8px',
                  borderTop: '1px solid #262630',
                }}
              >
                <span>
                  {isAr
                    ? 'تطبيق إزالة الكروما مباشرة على صور وطبقات الملف (SVGA / Lottie)'
                    : 'Apply chroma removal directly to SVGA / Lottie sprite layers'}
                </span>
                <input
                  type="checkbox"
                  checked={applyToLayers}
                  onChange={(e) => setApplyToLayers(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#7c5cff', cursor: 'pointer' }}
                />
              </label>
            </div>

            {/* Footer Action Buttons (matching EdgeFeatherModal & site buttons) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                marginTop: '2px',
              }}
            >
              {config.enabled ? (
                <button
                  type="button"
                  id="chromaDisableModalBtn"
                  onClick={handleDisableClick}
                  style={{
                    height: '38px',
                    padding: '0 16px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.14)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#fca5a5',
                    fontWeight: 600,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'إلغاء الكروما واستعادة الأصل' : 'Disable & Restore'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    height: '38px',
                    padding: '0 18px',
                    borderRadius: '6px',
                    background: '#13131c',
                    border: '1px solid #282835',
                    color: '#d4d4dc',
                    fontWeight: 600,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              )}

              <button
                type="button"
                id="chromaApplyModalBtn"
                onClick={handleApplyClick}
                style={{
                  flex: 1,
                  height: '38px',
                  padding: '0 20px',
                  borderRadius: '6px',
                  background: '#7c5cff',
                  border: '1px solid #9a7cff',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                  boxShadow: '0 4px 14px rgba(124, 92, 255, 0.35)',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{isAr ? 'حفظ وتطبيق إزالة الكروما' : 'Save & Apply Chroma Key'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
