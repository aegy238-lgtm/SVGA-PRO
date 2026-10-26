import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppliedWatermarkLayer,
  WATERMARK_FONTS,
  WATERMARK_WEIGHT_MAP,
  WatermarkConfig,
  WatermarkContentType,
  WatermarkFontWeight,
  computeSnapPosition,
  createDefaultWatermarkConfig,
  normalizeHexColor,
  validateWatermarkImageKey,
} from '../utils/watermark';

interface WatermarkModalProps {
  open: boolean;
  existingAssets: Record<string, string>;
  hasActiveWatermarks?: boolean;
  isAr?: boolean;
  onClose: () => void;
  onApply: (layer: AppliedWatermarkLayer) => void;
  onClearWatermarks?: () => void;
}

type DragMode = 'move' | 'rotate' | 'scale' | null;

export default function WatermarkModal({
  open,
  existingAssets,
  hasActiveWatermarks,
  isAr,
  onClose,
  onApply,
  onClearWatermarks,
}: WatermarkModalProps) {
  const [animSize, setAnimSize] = useState<{ w: number; h: number }>({ w: 413, h: 413 });
  const [dispSize, setDispSize] = useState<{ w: number; h: number }>({ w: 413, h: 413 });
  const [config, setConfig] = useState<WatermarkConfig>(() =>
    createDefaultWatermarkConfig(413, 413, existingAssets)
  );
  const [colorHexDraft, setColorHexDraft] = useState<string>('#ffffff');
  const [activeSnapCell, setActiveSnapCell] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [bgState, setBgState] = useState<{ type: 'chk' | 'color' | 'image'; val: string }>({
    type: 'chk',
    val: 'chk',
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
    startScale: number;
    startRotation: number;
    centerScreenX: number;
    centerScreenY: number;
    startDist: number;
    startAngle: number;
  } | null>(null);

  // Measure actual rendered text PNG dimensions using an offscreen 2D canvas
  const renderedWatermark = useMemo(() => {
    if (typeof document === 'undefined') {
      return { dataUrl: '', width: 180, height: 39 };
    }
    if (config.contentType === 'image' && config.imageDataUrl) {
      return {
        dataUrl: config.imageDataUrl,
        width: Math.max(1, Math.round(config.imageWidth || 180)),
        height: Math.max(1, Math.round(config.imageHeight || 60)),
      };
    }

    const textStr = (config.text || '').trim() || 'Watermark';
    const fontSize = Math.max(8, Math.min(240, Number(config.fontSize) || 32));
    const weightNum = WATERMARK_WEIGHT_MAP[config.fontWeight] || 600;
    const fontSpec = `${weightNum} ${fontSize}px ${config.fontFamily}`;

    const measureCv = document.createElement('canvas');
    const mCtx = measureCv.getContext('2d');
    if (!mCtx) {
      return { dataUrl: '', width: 180, height: 39 };
    }
    mCtx.font = fontSpec;
    const metrics = mCtx.measureText(textStr);
    const rawW = Math.ceil(metrics.width);
    const padX = Math.max(8, Math.round(fontSize * 0.28));
    const padY = Math.max(4, Math.round(fontSize * 0.14));
    const width = Math.max(24, rawW + padX * 2);
    const height = Math.max(18, Math.round(fontSize * 1.22));

    measureCv.width = width;
    measureCv.height = height;
    const ctx = measureCv.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.font = fontSpec;
      ctx.fillStyle = normalizeHexColor(config.color, '#ffffff');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(textStr, width / 2, height / 2 + padY * 0.1);
    }

    return {
      dataUrl: measureCv.toDataURL('image/png'),
      width,
      height,
    };
  }, [
    config.contentType,
    config.text,
    config.fontFamily,
    config.fontSize,
    config.color,
    config.fontWeight,
    config.imageDataUrl,
    config.imageWidth,
    config.imageHeight,
  ]);

  // Detect stage animation resolution and initialize state when modal opens
  useEffect(() => {
    if (!open) return;

    const wInput = document.getElementById('w') as HTMLInputElement | null;
    const hInput = document.getElementById('h') as HTMLInputElement | null;
    const detectedW = Math.max(64, Number(wInput?.value) || 413);
    const detectedH = Math.max(64, Number(hInput?.value) || 413);
    setAnimSize({ w: detectedW, h: detectedH });

    const defaultCfg = createDefaultWatermarkConfig(detectedW, detectedH, existingAssets);
    setConfig(defaultCfg);
    setColorHexDraft(defaultCfg.color);
    setActiveSnapCell(null);

    const stageBg = (window as any).__getGiftBg?.();
    if (stageBg && stageBg.type) {
      setBgState({
        type: stageBg.type,
        val: stageBg.type === 'chk' ? 'chk' : stageBg.val,
      });
    }
  }, [open]);

  const selectPreviewBg = (val: string) => {
    if (val === 'chk') {
      setBgState({ type: 'chk', val: 'chk' });
      (window as any).__applyGiftBg?.('chk', false);
    } else {
      setBgState({ type: 'color', val });
      (window as any).__applyGiftBg?.(val, false);
    }
  };

  // Live animation preview loop
  useEffect(() => {
    if (!open) return;
    let rafId = 0;

    const findStageSource = (): HTMLCanvasElement | HTMLVideoElement | HTMLImageElement | null => {
      const viewEl = document.getElementById('view');
      if (!viewEl) return null;
      const canvases = Array.from(viewEl.querySelectorAll('canvas'));
      const visibleCanvas =
        canvases.find((c) => c.width > 0 && c.height > 0 && c.style.display !== 'none') ||
        canvases[0];
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
      const r = Math.min(W, H) * 0.42;

      const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.05);
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.08)');
      grad.addColorStop(0.55, 'rgba(245, 158, 11, 0.45)');
      grad.addColorStop(0.82, 'rgba(220, 38, 38, 0.92)');
      grad.addColorStop(0.96, 'rgba(254, 240, 138, 1)');
      grad.addColorStop(1, 'rgba(180, 83, 9, 0.9)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Bottom banner bar
      ctx.fillStyle = 'rgba(185, 28, 28, 0.92)';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      const bw = r * 1.3;
      const bh = r * 0.34;
      ctx.beginPath();
      ctx.roundRect(cx - bw / 2, cy + r * 0.48, bw, bh, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = `bold ${Math.round(r * 0.19)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Super Admin', cx, cy + r * 0.65);
    };

    const renderLoop = () => {
      const cv = canvasRef.current;
      if (cv) {
        const src = findStageSource();
        const srcW = animSize.w || 413;
        const srcH = animSize.h || 413;

        const maxBox = 430;
        const scale = Math.min(maxBox / srcW, maxBox / srcH);
        const dW = Math.max(180, Math.round(srcW * scale));
        const dH = Math.max(180, Math.round(srcH * scale));

        if (cv.width !== dW || cv.height !== dH) {
          cv.width = dW;
          cv.height = dH;
          setDispSize({ w: dW, h: dH });
        }

        const ctx = cv.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, dW, dH);
          if (src) {
            try {
              ctx.drawImage(src, 0, 0, dW, dH);
            } catch {
              drawFallbackEmblem(ctx, dW, dH);
            }
          } else {
            drawFallbackEmblem(ctx, dW, dH);
          }
        }
      }
      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [open, animSize.w, animSize.h]);

  // Interactive Gizmo pointer drag (move, scale, rotate)
  useEffect(() => {
    if (!dragMode) return;

    const handlePointerMove = (e: PointerEvent) => {
      const st = dragStartRef.current;
      const stageEl = previewStageRef.current;
      if (!st || !stageEl) return;

      const rect = stageEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const scaleX = animSize.w / rect.width;
      const scaleY = animSize.h / rect.height;

      if (dragMode === 'move') {
        const dx = (e.clientX - st.clientX) * scaleX;
        const dy = (e.clientY - st.clientY) * scaleY;
        const nextX = Math.max(0, Math.min(animSize.w, Math.round(st.startX + dx)));
        const nextY = Math.max(0, Math.min(animSize.h, Math.round(st.startY + dy)));
        setActiveSnapCell(null);
        setConfig((prev) => ({ ...prev, x: nextX, y: nextY }));
      } else if (dragMode === 'rotate') {
        const curAngle = Math.atan2(
          e.clientY - st.centerScreenY,
          e.clientX - st.centerScreenX
        );
        const deltaDeg = ((curAngle - st.startAngle) * 180) / Math.PI;
        let nextRot = Math.round(st.startRotation + deltaDeg);
        while (nextRot > 180) nextRot -= 360;
        while (nextRot < -180) nextRot += 360;
        setConfig((prev) => ({
          ...prev,
          rotation: Math.max(-180, Math.min(180, nextRot)),
        }));
      } else if (dragMode === 'scale') {
        const curDist = Math.hypot(
          e.clientX - st.centerScreenX,
          e.clientY - st.centerScreenY
        );
        if (st.startDist > 4) {
          const ratio = curDist / st.startDist;
          const nextScale = Math.max(10, Math.min(300, Math.round(st.startScale * ratio)));
          setConfig((prev) => ({ ...prev, scale: nextScale }));
        }
      }
    };

    const handlePointerUp = () => {
      setDragMode(null);
      dragStartRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragMode, animSize.w, animSize.h]);

  if (!open) return null;

  const beginGizmoDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const stageEl = previewStageRef.current;
    if (!stageEl) return;
    const rect = stageEl.getBoundingClientRect();
    const centerScreenX = rect.left + (config.x / Math.max(1, animSize.w)) * rect.width;
    const centerScreenY = rect.top + (config.y / Math.max(1, animSize.h)) * rect.height;
    const startDist = Math.max(8, Math.hypot(e.clientX - centerScreenX, e.clientY - centerScreenY));
    const startAngle = Math.atan2(e.clientY - centerScreenY, e.clientX - centerScreenX);

    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: config.x,
      startY: config.y,
      startScale: config.scale,
      startRotation: config.rotation,
      centerScreenX,
      centerScreenY,
      startDist,
      startAngle,
    };
    setDragMode(mode);
  };

  const handleImageFileSelect = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      const im = new Image();
      im.onload = () => {
        setConfig((prev) => ({
          ...prev,
          contentType: 'image',
          imageDataUrl: dataUrl,
          imageWidth: Math.max(1, im.naturalWidth || 180),
          imageHeight: Math.max(1, im.naturalHeight || 60),
        }));
      };
      im.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSnapGridClick = (row: 0 | 1 | 2, col: 0 | 1 | 2) => {
    const pos = computeSnapPosition(
      row,
      col,
      animSize.w,
      animSize.h,
      renderedWatermark.width,
      renderedWatermark.height,
      config.scale
    );
    setActiveSnapCell(`${row}-${col}`);
    setConfig((prev) => ({
      ...prev,
      x: pos.x,
      y: pos.y,
    }));
  };

  const handleResetPosition = () => {
    setActiveSnapCell('1-1');
    setConfig((prev) => ({
      ...prev,
      x: Math.round(animSize.w / 2),
      y: Math.round(animSize.h * 0.85),
      scale: 69,
      rotation: 0,
      opacity: 80,
    }));
  };

  const keyValidation = validateWatermarkImageKey(config.imageKey, existingAssets);

  const handleConfirmAdd = () => {
    if (!keyValidation.valid || !renderedWatermark.dataUrl) return;
    onApply({
      imageKey: keyValidation.normalizedKey,
      dataUrl: renderedWatermark.dataUrl,
      width: renderedWatermark.width,
      height: renderedWatermark.height,
      x: config.x,
      y: config.y,
      scale: config.scale,
      rotation: config.rotation,
      opacity: config.opacity,
      animWidth: animSize.w,
      animHeight: animSize.h,
    });
    onClose();
  };

  const stageRatioX = dispSize.w / Math.max(1, animSize.w);
  const stageRatioY = dispSize.h / Math.max(1, animSize.h);
  const gizmoCenterX = config.x * stageRatioX;
  const gizmoCenterY = config.y * stageRatioY;
  const gizmoW = Math.max(24, renderedWatermark.width * (config.scale / 100) * stageRatioX);
  const gizmoH = Math.max(16, renderedWatermark.height * (config.scale / 100) * stageRatioY);

  const scaleSliderPct = Math.max(0, Math.min(100, ((config.scale - 10) / 290) * 100));
  const rotSliderPct = Math.max(0, Math.min(100, ((config.rotation + 180) / 360) * 100));
  const opSliderPct = Math.max(0, Math.min(100, config.opacity));

  const BG_SWATCHES = [
    { key: 'chk', color: 'chk', title: 'Checkerboard' },
    { key: '#000000', color: '#000000', title: 'Black' },
    { key: '#d1d5db', color: '#d1d5db', title: 'Light Gray' },
    { key: '#808080', color: '#808080', title: 'Gray' },
    { key: '#5b9b59', color: '#5b9b59', title: 'Green' },
    { key: '#4a76d4', color: '#4a76d4', title: 'Blue' },
  ];

  return (
    <div
      id="addWatermarkModal"
      role="dialog"
      aria-label="Add Watermark"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99995,
        background: 'rgba(3, 5, 7, 0.84)',
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
        style={{
          width: 'min(860px, 96vw)',
          maxHeight: '94vh',
          background: '#0d0f11',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '14px',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.88)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f3f4f6',
          fontFamily: 'Inter, "Cairo", system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px 12px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.01em',
              }}
            >
              Add Watermark
            </h3>
            <p
              style={{
                margin: '3px 0 0',
                fontSize: '12px',
                color: '#9ca3af',
              }}
            >
              {isAr
                ? 'إضافة صورة أو نص كعلامة مائية في طبقة علوية (Add an image or text watermark resource as a top layer)'
                : 'Add an image or text watermark resource as a top layer'}
            </p>
          </div>
          <button
            type="button"
            id="closeWatermarkModalBtn"
            aria-label="Close Add Watermark"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 0,
              color: '#ef4444',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.15fr 1fr',
            gap: '16px',
            padding: '6px 22px 16px',
            overflowY: 'auto',
            alignItems: 'stretch',
          }}
        >
          {/* Left Column: Live Stage Preview + Interactive Watermark Bounding Box */}
          <div
            style={{
              background: '#0b0d0e',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '490px',
              padding: '16px',
              position: 'relative',
              overflow: 'hidden',
              userSelect: 'none',
            }}
          >
            <div
              ref={previewStageRef}
              style={{
                position: 'relative',
                width: `${dispSize.w}px`,
                height: `${dispSize.h}px`,
                backgroundColor: bgState.type === 'color' ? bgState.val : 'transparent',
                backgroundImage:
                  bgState.type === 'chk'
                    ? 'repeating-conic-gradient(#d4d4d8 0 25%, #ffffff 0 50%)'
                    : bgState.type === 'image'
                      ? `url("${bgState.val}")`
                      : 'none',
                backgroundSize: bgState.type === 'chk' ? '16px 16px' : '100% 100%',
                backgroundPosition: 'center',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />

              {/* Interactive Draggable / Rotatable / Resizable Watermark Overlay */}
              <div
                id="watermarkPreviewGizmo"
                onPointerDown={(e) => beginGizmoDrag('move', e)}
                style={{
                  position: 'absolute',
                  left: `${gizmoCenterX}px`,
                  top: `${gizmoCenterY}px`,
                  width: `${gizmoW}px`,
                  height: `${gizmoH}px`,
                  transform: `translate(-50%, -50%) rotate(${config.rotation}deg)`,
                  transformOrigin: 'center center',
                  border: '1.5px solid #10b981',
                  boxSizing: 'border-box',
                  cursor: dragMode === 'move' ? 'grabbing' : 'move',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                }}
              >
                {renderedWatermark.dataUrl && (
                  <img
                    src={renderedWatermark.dataUrl}
                    alt="Watermark preview"
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      opacity: Math.max(0, Math.min(1, config.opacity / 100)),
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}
                  />
                )}

                {/* 4 Corner Scale Handles */}
                {[
                  { pos: 'tl', left: '-5px', top: '-5px', cursor: 'nwse-resize' },
                  { pos: 'tr', right: '-5px', top: '-5px', cursor: 'nesw-resize' },
                  { pos: 'bl', left: '-5px', bottom: '-5px', cursor: 'nesw-resize' },
                  { pos: 'br', right: '-5px', bottom: '-5px', cursor: 'nwse-resize' },
                ].map((h) => (
                  <div
                    key={h.pos}
                    onPointerDown={(e) => beginGizmoDrag('scale', e)}
                    style={{
                      position: 'absolute',
                      left: h.left,
                      right: h.right,
                      top: h.top,
                      bottom: h.bottom,
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: '#10b981',
                      border: '1.5px solid #052e16',
                      cursor: h.cursor,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
                    }}
                  />
                ))}

                {/* Rotation Handle Stem + Circle */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '-18px',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '1.5px',
                      height: '7px',
                      background: '#10b981',
                    }}
                  />
                  <div
                    title="Drag to rotate watermark"
                    onPointerDown={(e) => beginGizmoDrag('rotate', e)}
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: '#10b981',
                      border: '1.5px solid #052e16',
                      cursor: 'grab',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Settings Stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Card 1: Content Type */}
            <div
              style={{
                background: '#111417',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '10px',
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f3f4f6' }}>
                  Content Type
                </span>
                <span
                  id="watermarkDimensionsBadge"
                  style={{
                    fontSize: '11.5px',
                    color: '#9ca3af',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {renderedWatermark.width} × {renderedWatermark.height}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {(['image', 'text'] as WatermarkContentType[]).map((type) => {
                  const active = config.contentType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      id={type === 'image' ? 'wmTypeImageBtn' : 'wmTypeTextBtn'}
                      onClick={() => setConfig((prev) => ({ ...prev, contentType: type }))}
                      style={{
                        height: '34px',
                        borderRadius: '7px',
                        border: active
                          ? '1px solid #10b981'
                          : '1px solid rgba(255, 255, 255, 0.14)',
                        background: active ? 'rgba(16, 185, 129, 0.08)' : '#15181c',
                        color: active ? '#10b981' : '#e5e7eb',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {type === 'image' ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="4 7 4 4 20 4 20 7" />
                          <line x1="9" y1="20" x2="15" y2="20" />
                          <line x1="12" y1="4" x2="12" y2="20" />
                        </svg>
                      )}
                      <span>{type === 'image' ? 'Image' : 'Text'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card 2: Text Content / Font / Size / Color / Weight OR Image Upload */}
            <div
              style={{
                background: '#111417',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {config.contentType === 'text' ? (
                <>
                  <div>
                    <label
                      htmlFor="wmTextInput"
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginBottom: '5px',
                      }}
                    >
                      Text Content
                    </label>
                    <input
                      id="wmTextInput"
                      type="text"
                      value={config.text}
                      placeholder="Watermark"
                      onChange={(e) => setConfig((prev) => ({ ...prev, text: e.target.value }))}
                      style={{
                        width: '100%',
                        height: '34px',
                        background: '#08090b',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        padding: '0 10px',
                        color: '#f3f4f6',
                        fontSize: '12.5px',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label
                        htmlFor="wmFontSelect"
                        style={{
                          display: 'block',
                          fontSize: '11px',
                          color: '#9ca3af',
                          marginBottom: '5px',
                        }}
                      >
                        Font
                      </label>
                      <select
                        id="wmFontSelect"
                        value={config.fontFamily}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, fontFamily: e.target.value }))
                        }
                        style={{
                          width: '100%',
                          height: '34px',
                          background: '#08090b',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '0 8px',
                          color: '#f3f4f6',
                          fontSize: '12px',
                        }}
                      >
                        {WATERMARK_FONTS.map((f) => (
                          <option key={f.label} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="wmSizeInput"
                        style={{
                          display: 'block',
                          fontSize: '11px',
                          color: '#9ca3af',
                          marginBottom: '5px',
                        }}
                      >
                        Size
                      </label>
                      <input
                        id="wmSizeInput"
                        type="number"
                        min={8}
                        max={240}
                        value={config.fontSize}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            fontSize: Math.max(8, Math.min(240, Number(e.target.value) || 32)),
                          }))
                        }
                        style={{
                          width: '100%',
                          height: '34px',
                          background: '#08090b',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '0 10px',
                          color: '#f3f4f6',
                          fontSize: '12.5px',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label
                        htmlFor="wmColorHexInput"
                        style={{
                          display: 'block',
                          fontSize: '11px',
                          color: '#9ca3af',
                          marginBottom: '5px',
                        }}
                      >
                        Color
                      </label>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <label
                          style={{
                            width: '38px',
                            height: '34px',
                            borderRadius: '6px',
                            background: '#08090b',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <input
                            type="color"
                            aria-label="Watermark color picker"
                            value={normalizeHexColor(config.color, '#ffffff')}
                            onChange={(e) => {
                              setConfig((prev) => ({ ...prev, color: e.target.value }));
                              setColorHexDraft(e.target.value);
                            }}
                            style={{
                              width: '100%',
                              height: '100%',
                              border: 0,
                              padding: 0,
                              background: 'transparent',
                              cursor: 'pointer',
                            }}
                          />
                        </label>
                        <input
                          id="wmColorHexInput"
                          type="text"
                          value={colorHexDraft}
                          onChange={(e) => {
                            const val = e.target.value;
                            setColorHexDraft(val);
                            if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(val.trim())) {
                              setConfig((prev) => ({
                                ...prev,
                                color: normalizeHexColor(val, prev.color),
                              }));
                            }
                          }}
                          style={{
                            flex: 1,
                            height: '34px',
                            background: '#08090b',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '0 10px',
                            color: '#f3f4f6',
                            fontSize: '12.5px',
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="wmWeightSelect"
                        style={{
                          display: 'block',
                          fontSize: '11px',
                          color: '#9ca3af',
                          marginBottom: '5px',
                        }}
                      >
                        Weight
                      </label>
                      <select
                        id="wmWeightSelect"
                        value={config.fontWeight}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            fontWeight: e.target.value as WatermarkFontWeight,
                          }))
                        }
                        style={{
                          width: '100%',
                          height: '34px',
                          background: '#08090b',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '0 8px',
                          color: '#f3f4f6',
                          fontSize: '12px',
                        }}
                      >
                        {(['Regular', 'Medium', 'Semibold', 'Bold', 'ExtraBold'] as WatermarkFontWeight[]).map(
                          (w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <input
                    ref={imgInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    hidden
                    onChange={(e) => {
                      handleImageFileSelect(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <div
                    onClick={() => imgInputRef.current?.click()}
                    style={{
                      border: '1px dashed rgba(16, 185, 129, 0.45)',
                      background: 'rgba(16, 185, 129, 0.05)',
                      borderRadius: '8px',
                      padding: '16px 12px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {config.imageDataUrl ? (
                      <>
                        <img
                          src={config.imageDataUrl}
                          alt="Uploaded watermark"
                          style={{
                            maxHeight: '64px',
                            maxWidth: '180px',
                            objectFit: 'contain',
                          }}
                        />
                        <span style={{ fontSize: '11.5px', color: '#34d399', fontWeight: 600 }}>
                          Click to replace watermark image ({config.imageWidth} × {config.imageHeight})
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '12.5px', color: '#e5e7eb', fontWeight: 600 }}>
                          + Click to upload watermark image (PNG / WebP / SVG)
                        </span>
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                          Transparent PNG recommended for best overlay quality
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Card 3: Watermark Position, 3x3 Grid & Sliders */}
            <div
              style={{
                background: '#111417',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '10px',
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f3f4f6' }}>
                  Watermark Position
                </span>
                <span
                  id="watermarkPositionCoords"
                  style={{
                    fontSize: '11.5px',
                    color: '#9ca3af',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  X {Math.round(config.x)} / Y {Math.round(config.y)}
                </span>
                <button
                  type="button"
                  id="wmResetPosBtn"
                  title="Reset watermark position & transform"
                  aria-label="Reset watermark position"
                  onClick={handleResetPosition}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    background: '#16191e',
                    color: '#d1d5db',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '76px 1fr',
                  gap: '14px',
                  alignItems: 'center',
                }}
              >
                {/* 3x3 Quick Snap Alignment Grid */}
                <div
                  style={{
                    width: '76px',
                    height: '76px',
                    background: '#16191e',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '5px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gridTemplateRows: 'repeat(3, 1fr)',
                    gap: '4px',
                  }}
                >
                  {([0, 1, 2] as const).map((r) =>
                    ([0, 1, 2] as const).map((c) => {
                      const cellKey = `${r}-${c}`;
                      const isCellActive = activeSnapCell === cellKey;
                      return (
                        <button
                          key={cellKey}
                          type="button"
                          aria-label={`Snap watermark to grid ${r + 1}-${c + 1}`}
                          onClick={() => handleSnapGridClick(r, c)}
                          style={{
                            background: isCellActive ? '#10b981' : '#2b3038',
                            border: isCellActive
                              ? '1px solid #34d399'
                              : '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'all 0.12s ease',
                          }}
                        />
                      );
                    })
                  )}
                </div>

                {/* 3 Transform Sliders: Scale, Rotation, Opacity */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  {/* Scale */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '72px 1fr 44px',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11.5px',
                        color: '#d1d5db',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                      >
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                      <span>Scale</span>
                    </span>
                    <input
                      id="wmScaleSlider"
                      type="range"
                      aria-label="Watermark Scale"
                      min={10}
                      max={300}
                      value={config.scale}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, scale: Number(e.target.value) }))
                      }
                      style={{
                        width: '100%',
                        accentColor: '#10b981',
                        background: `linear-gradient(to right, #10b981 ${scaleSliderPct}%, #d1d5db ${scaleSliderPct}%)`,
                        height: '6px',
                        borderRadius: '99px',
                        cursor: 'pointer',
                      }}
                    />
                    <span
                      style={{
                        background: '#1b1f24',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        fontSize: '11px',
                        color: '#e5e7eb',
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {config.scale}%
                    </span>
                  </div>

                  {/* Rotation */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '72px 1fr 44px',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11.5px',
                        color: '#d1d5db',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                      >
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      <span>Rotation</span>
                    </span>
                    <input
                      id="wmRotationSlider"
                      type="range"
                      aria-label="Watermark Rotation"
                      min={-180}
                      max={180}
                      value={config.rotation}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, rotation: Number(e.target.value) }))
                      }
                      style={{
                        width: '100%',
                        accentColor: '#10b981',
                        background: `linear-gradient(to right, #10b981 ${rotSliderPct}%, #d1d5db ${rotSliderPct}%)`,
                        height: '6px',
                        borderRadius: '99px',
                        cursor: 'pointer',
                      }}
                    />
                    <span
                      style={{
                        background: '#1b1f24',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        fontSize: '11px',
                        color: '#e5e7eb',
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {config.rotation}°
                    </span>
                  </div>

                  {/* Opacity */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '72px 1fr 44px',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11.5px',
                        color: '#d1d5db',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                      >
                        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                      </svg>
                      <span>Opacity</span>
                    </span>
                    <input
                      id="wmOpacitySlider"
                      type="range"
                      aria-label="Watermark Opacity"
                      min={0}
                      max={100}
                      value={config.opacity}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, opacity: Number(e.target.value) }))
                      }
                      style={{
                        width: '100%',
                        accentColor: '#10b981',
                        background: `linear-gradient(to right, #10b981 ${opSliderPct}%, #d1d5db ${opSliderPct}%)`,
                        height: '6px',
                        borderRadius: '99px',
                        cursor: 'pointer',
                      }}
                    />
                    <span
                      style={{
                        background: '#1b1f24',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '4px',
                        padding: '2px 4px',
                        fontSize: '11px',
                        color: '#e5e7eb',
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {config.opacity}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: Advanced (Image Key) */}
            <div
              style={{
                background: '#111417',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '10px',
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f3f4f6' }}>Advanced</span>
                <span
                  style={{
                    fontSize: '11.5px',
                    color: '#9ca3af',
                    fontFamily: 'monospace',
                  }}
                >
                  {config.imageKey || 'watermark'}
                </span>
              </div>

              <label
                htmlFor="wmImageKeyInput"
                style={{
                  display: 'block',
                  fontSize: '11px',
                  color: '#9ca3af',
                  marginBottom: '5px',
                }}
              >
                Image Key
              </label>
              <input
                id="wmImageKeyInput"
                type="text"
                value={config.imageKey}
                placeholder="watermark"
                onChange={(e) => setConfig((prev) => ({ ...prev, imageKey: e.target.value }))}
                style={{
                  width: '100%',
                  height: '34px',
                  background: '#08090b',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '0 10px',
                  color: '#f3f4f6',
                  fontSize: '12.5px',
                }}
              />
              <div
                id="wmKeyStatusText"
                style={{
                  marginTop: '6px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color:
                    keyValidation.status === 'available'
                      ? '#10b981'
                      : keyValidation.status === 'exists'
                        ? '#f59e0b'
                        : '#ef4444',
                }}
              >
                {keyValidation.status === 'available'
                  ? 'Key available'
                  : keyValidation.status === 'exists'
                    ? 'Key already exists (will update existing layer)'
                    : keyValidation.status === 'empty'
                      ? 'Image Key is required'
                      : 'Invalid characters in Image Key'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 22px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Left: 6 Background Swatch Circles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {BG_SWATCHES.map((sw) => {
              const isSelected =
                sw.color === 'chk'
                  ? bgState.type === 'chk'
                  : bgState.type === 'color' && bgState.val.toLowerCase() === sw.color.toLowerCase();
              return (
                <button
                  key={sw.key}
                  type="button"
                  title={sw.title}
                  aria-label={`Preview background ${sw.title}`}
                  onClick={() => selectPreviewBg(sw.color)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    padding: 0,
                    cursor: 'pointer',
                    border: isSelected
                      ? '2px solid #9ca3af'
                      : '1.5px solid rgba(255, 255, 255, 0.18)',
                    boxShadow: isSelected ? '0 0 0 2px rgba(255,255,255,0.15)' : 'none',
                    backgroundColor: sw.color === 'chk' ? 'transparent' : sw.color,
                    backgroundImage:
                      sw.color === 'chk'
                        ? 'repeating-conic-gradient(#71717a 0 25%, #d4d4d8 0 50%)'
                        : 'none',
                    backgroundSize: sw.color === 'chk' ? '10px 10px' : 'auto',
                  }}
                />
              );
            })}
          </div>

          {/* Right: Cancel + Add Watermark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {hasActiveWatermarks && onClearWatermarks && (
              <button
                type="button"
                id="clearWatermarksBtn"
                onClick={() => {
                  onClearWatermarks();
                  onClose();
                }}
                style={{
                  height: '36px',
                  padding: '0 14px',
                  borderRadius: '7px',
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#fca5a5',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isAr ? 'حذف العلامة المائية' : 'Remove Watermark'}
              </button>
            )}
            <button
              type="button"
              id="cancelWatermarkModalBtn"
              onClick={onClose}
              style={{
                height: '36px',
                padding: '0 16px',
                borderRadius: '7px',
                border: '1px solid transparent',
                background: 'transparent',
                color: '#e5e7eb',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              id="confirmAddWatermarkBtn"
              disabled={!keyValidation.valid}
              onClick={handleConfirmAdd}
              style={{
                height: '36px',
                padding: '0 18px',
                borderRadius: '7px',
                border: '1px solid #059669',
                background: keyValidation.valid ? '#10b981' : '#374151',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: keyValidation.valid ? 'pointer' : 'not-allowed',
                boxShadow: keyValidation.valid ? '0 4px 14px rgba(16, 185, 129, 0.35)' : 'none',
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
              <span>Add Watermark</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
