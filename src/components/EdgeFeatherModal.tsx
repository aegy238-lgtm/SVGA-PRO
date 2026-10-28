import { useEffect, useRef, useState } from 'react';
import {
  EdgeFeatherConfig,
  applyEdgeFeatherToContext,
} from '../utils/edgeFeather';

interface EdgeFeatherModalProps {
  open: boolean;
  config: EdgeFeatherConfig;
  isAr?: boolean;
  onClose: () => void;
  onApply: (nextConfig: EdgeFeatherConfig) => void;
}

type DragSide = 'top' | 'bottom' | 'left' | 'right' | null;

export default function EdgeFeatherModal({
  open,
  config,
  isAr,
  onClose,
  onApply,
}: EdgeFeatherModalProps) {
  const [topMargin, setTopMargin] = useState<number>(config.topMargin);
  const [bottomMargin, setBottomMargin] = useState<number>(config.bottomMargin);
  const [leftMargin, setLeftMargin] = useState<number>(config.leftMargin);
  const [rightMargin, setRightMargin] = useState<number>(config.rightMargin);
  const [featherRadius, setFeatherRadius] = useState<number>(config.featherRadius);
  const [draggingSide, setDraggingSide] = useState<DragSide>(null);
  const [aspectSize, setAspectSize] = useState<{ w: number; h: number }>({ w: 360, h: 360 });
  const [bgState, setBgState] = useState<{ type: 'chk' | 'color' | 'image'; val: string }>({
    type: 'chk',
    val: 'chk',
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);

  const selectPreviewBg = (val: string, isImage = false) => {
    if (isImage) {
      setBgState({ type: 'image', val });
      (window as any).__applyGiftBg?.(val, true);
    } else if (val === 'chk') {
      setBgState({ type: 'chk', val: 'chk' });
      (window as any).__applyGiftBg?.('chk', false);
    } else {
      setBgState({ type: 'color', val });
      (window as any).__applyGiftBg?.(val, false);
    }
  };

  // Sync local state when modal opens
  useEffect(() => {
    if (!open) return;
    const stageBg = (window as any).__getGiftBg?.();
    if (stageBg && stageBg.type) {
      setBgState({
        type: stageBg.type,
        val: stageBg.type === 'chk' ? 'chk' : stageBg.val,
      });
    }
    if (config.enabled) {
      setTopMargin(config.topMargin);
      setBottomMargin(config.bottomMargin);
      setLeftMargin(config.leftMargin);
      setRightMargin(config.rightMargin);
      setFeatherRadius(config.featherRadius);
    } else {
      // Default to matching the screenshot preview (Top: 21%, Radius: 200px) if all were 0
      const hasCustom =
        config.topMargin > 0 ||
        config.bottomMargin > 0 ||
        config.leftMargin > 0 ||
        config.rightMargin > 0;
      setTopMargin(hasCustom ? config.topMargin : 21);
      setBottomMargin(hasCustom ? config.bottomMargin : 0);
      setLeftMargin(hasCustom ? config.leftMargin : 0);
      setRightMargin(hasCustom ? config.rightMargin : 0);
      setFeatherRadius(config.featherRadius > 0 ? config.featherRadius : 200);
    }
  }, [open, config]);

  // Pointer drag handling for the 4 edge handles
  useEffect(() => {
    if (!draggingSide) return;

    const handlePointerMove = (e: PointerEvent) => {
      const box = previewBoxRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      if (draggingSide === 'top') {
        const pct = Math.round(((e.clientY - rect.top) / rect.height) * 100);
        setTopMargin(Math.max(0, Math.min(50, pct)));
      } else if (draggingSide === 'bottom') {
        const pct = Math.round(((rect.bottom - e.clientY) / rect.height) * 100);
        setBottomMargin(Math.max(0, Math.min(50, pct)));
      } else if (draggingSide === 'left') {
        const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
        setLeftMargin(Math.max(0, Math.min(50, pct)));
      } else if (draggingSide === 'right') {
        const pct = Math.round(((rect.right - e.clientX) / rect.width) * 100);
        setRightMargin(Math.max(0, Math.min(50, pct)));
      }
    };

    const handlePointerUp = () => {
      setDraggingSide(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingSide]);

  // Live animation preview loop with real-time Edge Feather alpha masking
  useEffect(() => {
    if (!open) return;
    let rafId = 0;

    const draftCfg: EdgeFeatherConfig = {
      enabled: true,
      topMargin,
      bottomMargin,
      leftMargin,
      rightMargin,
      featherRadius,
    };

    const findStageSource = (): HTMLCanvasElement | HTMLVideoElement | HTMLImageElement | null => {
      const viewEl = document.getElementById('view');
      if (!viewEl) return null;
      const canvases = Array.from(viewEl.querySelectorAll('canvas'));
      const visibleCanvas = canvases.find((c) => c.width > 0 && c.height > 0 && c.style.display !== 'none') || canvases[0];
      if (visibleCanvas && visibleCanvas.width > 0 && visibleCanvas.height > 0) {
        return visibleCanvas;
      }
      const vid = viewEl.querySelector('video');
      if (vid && vid.videoWidth > 0 && vid.videoHeight > 0) {
        return vid;
      }
      const img = viewEl.querySelector('img');
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        return img;
      }
      return null;
    };

    const drawFallbackEmblem = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      const cx = W / 2;
      const cy = H / 2;
      const r = Math.min(W, H) * 0.44;

      // Golden royal frame ring preview when no file is loaded
      const grad = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r * 1.05);
      grad.addColorStop(0, 'rgba(245, 158, 11, 0)');
      grad.addColorStop(0.55, 'rgba(251, 191, 36, 0.35)');
      grad.addColorStop(0.8, 'rgba(217, 119, 6, 0.95)');
      grad.addColorStop(0.95, 'rgba(254, 240, 138, 1)');
      grad.addColorStop(1, 'rgba(180, 83, 9, 0.9)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.04, 0, Math.PI * 2);
      ctx.fill();

      // Decorative wings/spikes extending to the edges so feathering is clearly visible
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.65);
        ctx.lineTo(r * 0.14, -r * 1.12);
        ctx.lineTo(0, -r * 1.02);
        ctx.lineTo(-r * 0.14, -r * 1.12);
        ctx.closePath();
        ctx.fillStyle = i % 2 === 0 ? '#fde047' : '#d97706';
        ctx.fill();
        ctx.restore();
      }
    };

    const renderLoop = () => {
      const cv = canvasRef.current;
      if (cv) {
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
        const dispW = Math.max(120, Math.round(srcW * scale));
        const dispH = Math.max(120, Math.round(srcH * scale));

        if (cv.width !== dispW || cv.height !== dispH) {
          cv.width = dispW;
          cv.height = dispH;
          setAspectSize({ w: dispW, h: dispH });
        }

        const ctx = cv.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, dispW, dispH);
          if (src) {
            try {
              ctx.drawImage(src, 0, 0, dispW, dispH);
            } catch {
              drawFallbackEmblem(ctx, dispW, dispH);
            }
          } else {
            drawFallbackEmblem(ctx, dispW, dispH);
          }
          applyEdgeFeatherToContext(ctx, dispW, dispH, draftCfg);
        }
      }
      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [open, topMargin, bottomMargin, leftMargin, rightMargin, featherRadius]);

  if (!open) return null;

  const clampMargin = (val: number) => Math.max(0, Math.min(50, Number.isFinite(val) ? Math.round(val) : 0));
  const clampRadius = (val: number) => Math.max(0, Math.min(200, Number.isFinite(val) ? Math.round(val) : 0));

  const sliderPct = Math.max(0, Math.min(100, (featherRadius / 200) * 100));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(6px)',
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
        aria-label="Edge Feather"
        dir="ltr"
        style={{
          background: '#141418',
          border: '1px solid #282832',
          borderRadius: '10px',
          width: 'min(860px, 96vw)',
          maxHeight: '92vh',
          overflow: 'auto',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.85)',
          color: '#f4f4f6',
          padding: '24px 28px 28px',
          position: 'relative',
          fontFamily: 'Inter, "Cairo", "Segoe UI", system-ui, sans-serif',
        }}
      >
        {/* Top-Right Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '38px',
            height: '32px',
            borderRadius: '6px',
            background: '#1e1e24',
            border: '1px solid #2c2c35',
            color: '#ef4444',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <div style={{ marginBottom: '20px', paddingRight: '48px' }}>
          <h2
            style={{
              margin: '0 0 6px 0',
              fontSize: '18px',
              fontWeight: 700,
              color: '#ffffff',
            }}
          >
            Edge Feather
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '12px',
              color: '#9ca3af',
              lineHeight: 1.45,
            }}
          >
            Add soft gradient transparency transitions around the animation. The animation will be
            converted to frame sequences, which may increase file size
          </p>
        </div>

        {/* Main 2-Column Content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(300px, 1.35fr) minmax(240px, 1fr)',
            gap: '28px',
            alignItems: 'start',
          }}
        >
          {/* Left Preview Stage */}
          <div
            style={{
              background: '#1b1b20',
              border: '1px solid #2d2d37',
              borderRadius: '8px',
              minHeight: '440px',
              padding: '20px 22px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              userSelect: 'none',
            }}
          >
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
                ref={previewBoxRef}
                data-testid="ef-preview-box"
                style={{
                  width: `${aspectSize.w}px`,
                  height: `${aspectSize.h}px`,
                  position: 'relative',
                  borderRadius: '4px',
                  ...(bgState.type === 'image'
                    ? {
                        backgroundColor: '#0c0d14',
                        backgroundImage: `url("${bgState.val}")`,
                        backgroundSize: '100% 100%',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                      }
                    : bgState.type === 'color'
                    ? {
                        background: bgState.val,
                      }
                    : {
                        background:
                          'repeating-conic-gradient(#d4d4d8 0 25%, #ffffff 0 50%) 0 0 / 16px 16px',
                      }),
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  overflow: 'visible',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={360}
                  height={360}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    borderRadius: '4px',
                    background: 'transparent',
                  }}
                />

                {/* Top Margin Guide Line & Handle */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: `${topMargin}%`,
                    height: '1px',
                    background:
                      topMargin > 0 || draggingSide === 'top'
                        ? 'rgba(16, 185, 129, 0.75)'
                        : 'transparent',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDraggingSide('top');
                  }}
                  title={`Top Margin: ${topMargin}%`}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: `${topMargin}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '32px',
                    height: '7px',
                    borderRadius: '99px',
                    background: draggingSide === 'top' ? '#10b981' : '#9ca3af',
                    border: '1px solid rgba(0,0,0,0.35)',
                    cursor: 'ns-resize',
                    zIndex: 5,
                  }}
                />

                {/* Bottom Margin Guide Line & Handle */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: `${bottomMargin}%`,
                    height: '1px',
                    background:
                      bottomMargin > 0 || draggingSide === 'bottom'
                        ? 'rgba(16, 185, 129, 0.75)'
                        : 'transparent',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDraggingSide('bottom');
                  }}
                  title={`Bottom Margin: ${bottomMargin}%`}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: `${bottomMargin}%`,
                    transform: 'translate(-50%, 50%)',
                    width: '32px',
                    height: '7px',
                    borderRadius: '99px',
                    background: draggingSide === 'bottom' ? '#10b981' : '#9ca3af',
                    border: '1px solid rgba(0,0,0,0.35)',
                    cursor: 'ns-resize',
                    zIndex: 5,
                  }}
                />

                {/* Left Margin Guide Line & Handle */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${leftMargin}%`,
                    width: '1px',
                    background:
                      leftMargin > 0 || draggingSide === 'left'
                        ? 'rgba(16, 185, 129, 0.75)'
                        : 'transparent',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDraggingSide('left');
                  }}
                  title={`Left Margin: ${leftMargin}%`}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: `${leftMargin}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '7px',
                    height: '32px',
                    borderRadius: '99px',
                    background: draggingSide === 'left' ? '#10b981' : '#9ca3af',
                    border: '1px solid rgba(0,0,0,0.35)',
                    cursor: 'ew-resize',
                    zIndex: 5,
                  }}
                />

                {/* Right Margin Guide Line & Handle */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    right: `${rightMargin}%`,
                    width: '1px',
                    background:
                      rightMargin > 0 || draggingSide === 'right'
                        ? 'rgba(16, 185, 129, 0.75)'
                        : 'transparent',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setDraggingSide('right');
                  }}
                  title={`Right Margin: ${rightMargin}%`}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    right: `${rightMargin}%`,
                    transform: 'translate(50%, -50%)',
                    width: '7px',
                    height: '32px',
                    borderRadius: '99px',
                    background: draggingSide === 'right' ? '#10b981' : '#9ca3af',
                    border: '1px solid rgba(0,0,0,0.35)',
                    cursor: 'ew-resize',
                    zIndex: 5,
                  }}
                />
              </div>
            </div>

            {/* Background Preview Switcher (Upload BG + Color Dots + Custom Color Picker) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                background: 'rgba(16, 16, 22, 0.9)',
                border: '1px solid #2e2e3a',
                borderRadius: '99px',
                padding: '5px 12px',
              }}
            >
              <button
                type="button"
                id="efUploadBgBtn"
                onClick={() => bgFileInputRef.current?.click()}
                title={isAr ? 'رفع صورة خلفية لمعاينة الشفافية' : 'Upload custom background image'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 9px',
                  borderRadius: '99px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: bgState.type === 'image' ? '#10b981' : '#23232e',
                  color: '#ffffff',
                  border:
                    bgState.type === 'image'
                      ? '1px solid #34d399'
                      : '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L6 21" />
                </svg>
                <span>{isAr ? 'رفع خلفية' : 'Upload BG'}</span>
              </button>
              <input
                ref={bgFileInputRef}
                type="file"
                id="efBgFileInput"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    if (ev.target?.result) {
                      selectPreviewBg(ev.target.result as string, true);
                    }
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
              {bgState.type === 'image' && (
                <button
                  type="button"
                  id="efClearBgBtn"
                  onClick={() => selectPreviewBg('chk', false)}
                  title={isAr ? 'حذف صورة الخلفية' : 'Clear background image'}
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    fontSize: '12px',
                    lineHeight: 1,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  ×
                </button>
              )}

              {[
                { key: '#000000', label: 'Black (#000000)', bg: '#000000' },
                { key: '#ffffff', label: 'White (#ffffff)', bg: '#ffffff' },
                { key: '#00ff00', label: 'Green (#00ff00)', bg: '#00ff00' },
                { key: '#7c3aed', label: 'Purple (#7c3aed)', bg: '#7c3aed' },
                { key: '#3b82f6', label: 'Blue (#3b82f6)', bg: '#3b82f6' },
                { key: '#ef4444', label: 'Red (#ef4444)', bg: '#ef4444' },
              ].map((sw) => {
                const isSelected =
                  bgState.type === 'color' && bgState.val.toLowerCase() === sw.key;
                return (
                  <button
                    key={sw.key}
                    type="button"
                    aria-label={sw.label}
                    title={sw.label}
                    onClick={() => selectPreviewBg(sw.key, false)}
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: sw.bg,
                      border: '1px solid rgba(255,255,255,0.35)',
                      outline: isSelected ? '2px solid #10b981' : 'none',
                      outlineOffset: '1px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                );
              })}

              {/* Custom Color Picker */}
              <label
                title={isAr ? 'اختر لون خلفية مخصص' : 'Custom background color'}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background:
                    'conic-gradient(#ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ec4899, #ef4444)',
                  border: '1px solid rgba(255,255,255,0.45)',
                  cursor: 'pointer',
                  display: 'inline-block',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <input
                  type="color"
                  id="efCustomColorInput"
                  aria-label="Custom preview background color"
                  value={
                    bgState.type === 'color' && /^#[0-9a-f]{6}$/i.test(bgState.val)
                      ? bgState.val
                      : '#ff0055'
                  }
                  onChange={(e) => selectPreviewBg(e.target.value, false)}
                  style={{
                    opacity: 0,
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    cursor: 'pointer',
                    border: 0,
                    padding: 0,
                  }}
                />
              </label>

              {/* Checkerboard Swatch */}
              <button
                type="button"
                aria-label="Transparency Checkerboard"
                title="Transparency Checkerboard"
                onClick={() => selectPreviewBg('chk', false)}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background:
                    'repeating-conic-gradient(#888 0 25%, #ddd 0 50%) 0 0 / 6px 6px',
                  border: '1px solid rgba(255,255,255,0.35)',
                  outline: bgState.type === 'chk' ? '2px solid #10b981' : 'none',
                  outlineOffset: '1px',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            </div>
          </div>

          {/* Right Parameters Column */}
          <div style={{ paddingTop: '6px' }}>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: '#d4d4d8',
                marginBottom: '20px',
              }}
            >
              Parameters
            </div>

            {/* 4 Margin Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Top Margin', val: topMargin, set: setTopMargin, id: 'efTopMargin' },
                { label: 'Bottom Margin', val: bottomMargin, set: setBottomMargin, id: 'efBottomMargin' },
                { label: 'Left Margin', val: leftMargin, set: setLeftMargin, id: 'efLeftMargin' },
                { label: 'Right Margin', val: rightMargin, set: setRightMargin, id: 'efRightMargin' },
              ].map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <label
                    htmlFor={item.id}
                    style={{
                      fontSize: '13px',
                      color: '#e4e4e7',
                      fontWeight: 500,
                    }}
                  >
                    {item.label}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      id={item.id}
                      type="number"
                      min={0}
                      max={50}
                      value={item.val}
                      onChange={(e) => item.set(clampMargin(Number(e.target.value)))}
                      style={{
                        width: '66px',
                        height: '34px',
                        background: '#1c1c22',
                        border: '1px solid #353542',
                        borderRadius: '6px',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontSize: '13px',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: '13px', color: '#9ca3af', width: '14px' }}>%</span>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                height: '1px',
                background: '#262630',
                margin: '22px 0',
              }}
            />

            {/* Feather Radius */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <label
                htmlFor="efFeatherRadius"
                style={{
                  fontSize: '13px',
                  color: '#e4e4e7',
                  fontWeight: 500,
                }}
              >
                Feather Radius
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  id="efFeatherRadius"
                  type="number"
                  min={0}
                  max={200}
                  value={featherRadius}
                  onChange={(e) => setFeatherRadius(clampRadius(Number(e.target.value)))}
                  style={{
                    width: '66px',
                    height: '34px',
                    background: '#1c1c22',
                    border: '1px solid #353542',
                    borderRadius: '6px',
                    color: '#ffffff',
                    textAlign: 'center',
                    fontSize: '13px',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '13px', color: '#9ca3af', width: '18px' }}>px</span>
              </div>
            </div>

            {/* Green Range Slider */}
            <div style={{ padding: '4px 0' }}>
              <input
                type="range"
                min={0}
                max={200}
                value={featherRadius}
                onChange={(e) => setFeatherRadius(clampRadius(Number(e.target.value)))}
                style={{
                  width: '100%',
                  height: '6px',
                  borderRadius: '99px',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: `linear-gradient(90deg, #10b981 ${sliderPct}%, #272730 ${sliderPct}%)`,
                  accentColor: '#10b981',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              />
            </div>

            <div
              style={{
                height: '1px',
                background: '#262630',
                margin: '24px 0 22px',
              }}
            />

            {/* Footer Action Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button
                type="button"
                id="efCancelBtn"
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: '#1c1c22',
                  border: '1px solid #383845',
                  color: '#e4e4e7',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>Cancel</span>
              </button>
              <button
                type="button"
                id="efApplyBtn"
                onClick={() => {
                  onApply({
                    enabled: true,
                    topMargin,
                    bottomMargin,
                    leftMargin,
                    rightMargin,
                    featherRadius,
                  });
                  onClose();
                }}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  background: '#0d9f6e',
                  border: '1px solid #10b981',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Apply</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
