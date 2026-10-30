import { useEffect, useRef, useState } from 'react';
import {
  EdgeFeatherConfig,
  applyEdgeFeatherToContext,
  formatDurationSec,
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
  isAr = true,
  onClose,
  onApply,
}: EdgeFeatherModalProps) {
  // Margin & Feather state
  const [topMargin, setTopMargin] = useState<number>(config.topMargin);
  const [bottomMargin, setBottomMargin] = useState<number>(config.bottomMargin);
  const [leftMargin, setLeftMargin] = useState<number>(config.leftMargin);
  const [rightMargin, setRightMargin] = useState<number>(config.rightMargin);
  const [featherRadius, setFeatherRadius] = useState<number>(config.featherRadius);
  const [draggingSide, setDraggingSide] = useState<DragSide>(null);

  // Time & Duration Trim state
  const [trimEnabled, setTrimEnabled] = useState<boolean>(Boolean(config.trimEnabled));
  const [totalDuration, setTotalDuration] = useState<number>(config.totalDuration || 4.0);
  const [totalFrames, setTotalFrames] = useState<number>(config.totalFrames || 60);
  const [fps, setFps] = useState<number>(config.fps || 15);
  const [trimStartTime, setTrimStartTime] = useState<number>(config.trimStartTime ?? 0);
  const [trimEndTime, setTrimEndTime] = useState<number>(config.trimEndTime ?? 4.0);
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [isPlayingTrim, setIsPlayingTrim] = useState<boolean>(true);
  const [draggingThumb, setDraggingThumb] = useState<'start' | 'end' | null>(null);
  const [filmstripThumbs, setFilmstripThumbs] = useState<string[]>([]);

  const [aspectSize, setAspectSize] = useState<{ w: number; h: number }>({ w: 360, h: 360 });
  const [bgState, setBgState] = useState<{ type: 'chk' | 'color' | 'image'; val: string }>({
    type: 'chk',
    val: 'chk',
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
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

  // Detect loaded animation information when modal opens
  useEffect(() => {
    if (!open) return;

    let detectedDuration = 4.0;
    let detectedFrames = 60;
    let detectedFps = 15;

    // 1. Try from motion engine state
    if (typeof (window as any).__getMotionAnimationState === 'function') {
      const state = (window as any).__getMotionAnimationState();
      if (state) {
        if (state.fps && state.fps > 0) detectedFps = Math.round(state.fps);
        if (state.n && state.n > 0) detectedFrames = state.n;
        if (state.duration && state.duration > 0) detectedDuration = Number(state.duration.toFixed(2));
        else if (detectedFrames > 0 && detectedFps > 0) {
          detectedDuration = Number((detectedFrames / detectedFps).toFixed(2));
        }
      }
    }

    // 2. Try from DOM elements in #view (video or canvas)
    const viewVideo = document.querySelector('#view video') as HTMLVideoElement | null;
    if (viewVideo && viewVideo.duration > 0 && Number.isFinite(viewVideo.duration)) {
      detectedDuration = Number(viewVideo.duration.toFixed(2));
      detectedFrames = Math.max(1, Math.round(detectedDuration * detectedFps));
    }

    // 3. Try from #info block
    const infoText = document.getElementById('info')?.innerText || '';
    const durMatch = infoText.match(/Duration:\s*([\d.]+)\s*S/i);
    if (durMatch && durMatch[1]) {
      const parsedDur = parseFloat(durMatch[1]);
      if (parsedDur > 0) detectedDuration = Number(parsedDur.toFixed(2));
    }
    const fpsMatch = infoText.match(/Frame Rate:\s*([\d.]+)\s*FPS/i);
    if (fpsMatch && fpsMatch[1]) {
      const parsedFps = parseFloat(fpsMatch[1]);
      if (parsedFps > 0) detectedFps = Math.round(parsedFps);
    }
    const framesMatch = infoText.match(/Frames:\s*(\d+)/i) || infoText.match(/Image Count:\s*(\d+)/i);
    if (framesMatch && framesMatch[1]) {
      const parsedFrames = parseInt(framesMatch[1], 10);
      if (parsedFrames > 0) detectedFrames = parsedFrames;
    }

    // 4. Try from #trim inputs if user had already entered values
    const domTrimChecked = (document.getElementById('trim') as HTMLInputElement | null)?.checked;
    const domTrimStart = parseFloat((document.getElementById('trimStart') as HTMLInputElement | null)?.value || '');
    const domTrimEnd = parseFloat((document.getElementById('trimEnd') as HTMLInputElement | null)?.value || '');

    setTotalDuration(detectedDuration);
    setTotalFrames(detectedFrames);
    setFps(detectedFps);

    // Initial trim values
    if (config.trimEnabled && config.trimEndTime !== undefined && config.trimEndTime > 0) {
      setTrimEnabled(true);
      setTrimStartTime(Math.max(0, Math.min(detectedDuration - 0.05, config.trimStartTime || 0)));
      setTrimEndTime(Math.max(0.1, Math.min(detectedDuration, config.trimEndTime)));
    } else if (domTrimChecked && domTrimEnd > 0) {
      setTrimEnabled(true);
      setTrimStartTime(Math.max(0, Math.min(detectedDuration - 0.05, domTrimStart || 0)));
      setTrimEndTime(Math.max(0.1, Math.min(detectedDuration, domTrimEnd)));
    } else {
      setTrimEnabled(Boolean(config.trimEnabled));
      setTrimStartTime(0);
      setTrimEndTime(detectedDuration);
    }

    // Background preview syncing
    const stageBg = (window as any).__getGiftBg?.();
    if (stageBg && stageBg.type) {
      setBgState({
        type: stageBg.type,
        val: stageBg.type === 'chk' ? 'chk' : stageBg.val,
      });
    }

    // Margins and feather radius
    if (config.enabled) {
      setTopMargin(config.topMargin);
      setBottomMargin(config.bottomMargin);
      setLeftMargin(config.leftMargin);
      setRightMargin(config.rightMargin);
      setFeatherRadius(config.featherRadius);
    } else {
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

  // Extract video/animation frame snapshots for the timeline track filmstrip
  useEffect(() => {
    if (!open) {
      setFilmstripThumbs([]);
      return;
    }
    let isCancelled = false;

    const extractSnapshots = async () => {
      // 1. Try video element snapshot sampling
      const viewVideo = document.querySelector('#view video') as HTMLVideoElement | null;
      if (viewVideo && (viewVideo.currentSrc || viewVideo.src) && totalDuration > 0) {
        const tempVid = document.createElement('video');
        tempVid.crossOrigin = 'anonymous';
        tempVid.muted = true;
        tempVid.playsInline = true;
        tempVid.src = viewVideo.currentSrc || viewVideo.src;

        await new Promise((res) => {
          const onLoaded = () => res(true);
          tempVid.addEventListener('loadeddata', onLoaded, { once: true });
          tempVid.addEventListener('error', () => res(false), { once: true });
          setTimeout(() => res(false), 900);
        });

        const count = 10;
        const thumbs: string[] = [];
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 90;
        offCanvas.height = 54;
        const offCtx = offCanvas.getContext('2d');

        for (let i = 0; i < count; i++) {
          if (isCancelled) break;
          const targetTime = Math.min(totalDuration - 0.01, (i / (count - 1)) * totalDuration);
          try {
            tempVid.currentTime = Math.max(0, targetTime);
          } catch (_) {}

          await new Promise((res) => {
            const onSeek = () => {
              tempVid.removeEventListener('seeked', onSeek);
              res(true);
            };
            tempVid.addEventListener('seeked', onSeek);
            setTimeout(res, 180);
          });

          if (offCtx && tempVid.videoWidth > 0 && tempVid.videoHeight > 0) {
            offCtx.clearRect(0, 0, 90, 54);
            try {
              offCtx.drawImage(tempVid, 0, 0, 90, 54);
              thumbs.push(offCanvas.toDataURL('image/jpeg', 0.65));
            } catch (_) {}
          }
        }

        if (!isCancelled && thumbs.length > 0) {
          setFilmstripThumbs(thumbs);
          return;
        }
      }

      // 2. Fallback: canvas element snapshot sampling
      const stageCanvas = document.querySelector('#view canvas') as HTMLCanvasElement | null;
      if (stageCanvas && stageCanvas.width > 0 && stageCanvas.height > 0 && totalDuration > 0) {
        const initialPlaybackTime = (document.querySelector('#view video') as HTMLVideoElement | null)?.currentTime || 0;
        const count = 10;
        const thumbs: string[] = [];
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 90;
        offCanvas.height = 54;
        const offCtx = offCanvas.getContext('2d');

        for (let i = 0; i < count; i++) {
          if (isCancelled) break;
          const targetTime = Math.min(totalDuration, (i / (count - 1)) * totalDuration);
          if (typeof (window as any).__seekMotionFrameOrTime === 'function') {
            (window as any).__seekMotionFrameOrTime(targetTime);
          }
          if (offCtx) {
            offCtx.clearRect(0, 0, 90, 54);
            try {
              offCtx.drawImage(stageCanvas, 0, 0, 90, 54);
              thumbs.push(offCanvas.toDataURL('image/jpeg', 0.65));
            } catch (_) {}
          }
        }

        // Restore initial animation timestamp
        if (typeof (window as any).__seekMotionFrameOrTime === 'function') {
          (window as any).__seekMotionFrameOrTime(initialPlaybackTime);
        }

        if (!isCancelled && thumbs.length > 0) {
          setFilmstripThumbs(thumbs);
        }
      }
    };

    extractSnapshots();
    return () => {
      isCancelled = true;
    };
  }, [open, totalDuration]);

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

  // Pointer drag handling for Timeline Start/End thumbs
  useEffect(() => {
    if (!draggingThumb) return;

    const handleTimelinePointerMove = (e: PointerEvent) => {
      const track = timelineTrackRef.current;
      if (!track || totalDuration <= 0) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;

      const clientX = Math.max(rect.left, Math.min(rect.right, e.clientX));
      const ratio = (clientX - rect.left) / rect.width;
      const sec = Number((ratio * totalDuration).toFixed(2));

      const viewVid = document.querySelector('#view video') as HTMLVideoElement | null;

      if (draggingThumb === 'start') {
        const newStart = Math.max(0, Math.min(trimEndTime - 0.05, sec));
        setTrimStartTime(newStart);
        setPlaybackTime(newStart);
        if (viewVid) {
          try {
            viewVid.currentTime = newStart;
          } catch (_) {}
        } else if (typeof (window as any).__seekMotionFrameOrTime === 'function') {
          (window as any).__seekMotionFrameOrTime(newStart);
        }
      } else if (draggingThumb === 'end') {
        const newEnd = Math.max(trimStartTime + 0.05, Math.min(totalDuration, sec));
        setTrimEndTime(newEnd);
        setPlaybackTime(newEnd);
        if (viewVid) {
          try {
            viewVid.currentTime = newEnd;
          } catch (_) {}
        } else if (typeof (window as any).__seekMotionFrameOrTime === 'function') {
          (window as any).__seekMotionFrameOrTime(newEnd);
        }
      }
    };

    const handleTimelinePointerUp = () => {
      setDraggingThumb(null);
      const viewVid = document.querySelector('#view video') as HTMLVideoElement | null;
      if (viewVid) {
        try {
          viewVid.currentTime = trimStartTime;
        } catch (_) {}
      }
    };

    window.addEventListener('pointermove', handleTimelinePointerMove);
    window.addEventListener('pointerup', handleTimelinePointerUp);
    return () => {
      window.removeEventListener('pointermove', handleTimelinePointerMove);
      window.removeEventListener('pointerup', handleTimelinePointerUp);
    };
  }, [draggingThumb, totalDuration, trimStartTime, trimEndTime]);

  // Sync preview trim range with global background monitor while modal is open
  useEffect(() => {
    if (open) {
      (window as any).__previewTrimRange = {
        active: trimEnabled,
        start: trimStartTime,
        end: trimEndTime,
      };
    } else {
      (window as any).__previewTrimRange = null;
    }
    return () => {
      (window as any).__previewTrimRange = null;
    };
  }, [open, trimEnabled, trimStartTime, trimEndTime]);

  // Live animation preview loop with real-time Edge Feather alpha masking and duration trimming
  useEffect(() => {
    if (!open) return;
    let rafId = 0;
    const loopStartTime = performance.now();

    const draftCfg: EdgeFeatherConfig = {
      enabled: true,
      topMargin,
      bottomMargin,
      leftMargin,
      rightMargin,
      featherRadius,
      trimEnabled,
      trimStartTime,
      trimEndTime,
    };

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
      const r = Math.min(W, H) * 0.44;

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

        // Duration Trim loop sync
        if (trimEnabled && trimEndTime > trimStartTime && isPlayingTrim && !draggingThumb) {
          if (src instanceof HTMLVideoElement) {
            setPlaybackTime(src.currentTime);
            if (src.currentTime < trimStartTime - 0.05 || src.currentTime >= trimEndTime - 0.04) {
              try {
                src.currentTime = trimStartTime;
              } catch (_) {}
            }
          } else {
            const trimSpan = Math.max(0.1, trimEndTime - trimStartTime);
            const elapsedSec = (performance.now() - loopStartTime) / 1000;
            const currentRelTime = trimStartTime + (elapsedSec % trimSpan);
            setPlaybackTime(currentRelTime);
            if (typeof (window as any).__seekMotionFrameOrTime === 'function') {
              (window as any).__seekMotionFrameOrTime(currentRelTime);
            }
          }
        } else if (src instanceof HTMLVideoElement && src.currentTime !== undefined) {
          setPlaybackTime(src.currentTime);
        }

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
  }, [
    open,
    topMargin,
    bottomMargin,
    leftMargin,
    rightMargin,
    featherRadius,
    trimEnabled,
    trimStartTime,
    trimEndTime,
    isPlayingTrim,
    fps,
  ]);

  if (!open) return null;

  const clampMargin = (val: number) =>
    Math.max(0, Math.min(50, Number.isFinite(val) ? Math.round(val) : 0));
  const clampRadius = (val: number) =>
    Math.max(0, Math.min(200, Number.isFinite(val) ? Math.round(val) : 0));

  const sliderPct = Math.max(0, Math.min(100, (featherRadius / 200) * 100));

  // Trim timeline percentage helpers
  const safeTotalDur = Math.max(0.1, totalDuration);
  const startPct = Math.max(0, Math.min(100, (trimStartTime / safeTotalDur) * 100));
  const endPct = Math.max(0, Math.min(100, (trimEndTime / safeTotalDur) * 100));
  const playheadPct = Math.max(0, Math.min(100, (playbackTime / safeTotalDur) * 100));
  const selectedSpanSec = Math.max(0.01, trimEndTime - trimStartTime);
  const selectedSpanFrames = Math.max(1, Math.round(selectedSpanSec * fps));

  const handleApplyClick = () => {
    onApply({
      enabled: true,
      topMargin,
      bottomMargin,
      leftMargin,
      rightMargin,
      featherRadius,
      trimEnabled,
      trimStartTime: Number(trimStartTime.toFixed(2)),
      trimEndTime: Number(trimEndTime.toFixed(2)),
      trimStartFrame: Math.round(trimStartTime * fps),
      trimEndFrame: Math.round(trimEndTime * fps),
      totalDuration: Number(totalDuration.toFixed(2)),
      totalFrames,
      fps,
    });
    onClose();
  };

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
        aria-label="Edge Feather & Duration Trim"
        dir="ltr"
        style={{
          background: '#141418',
          border: '1px solid #282832',
          borderRadius: '12px',
          width: 'min(940px, 97vw)',
          maxHeight: '94vh',
          overflow: 'auto',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.9)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2
              style={{
                margin: '0',
                fontSize: '18px',
                fontWeight: 700,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>Edge Feather & Duration Trim</span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#6ee7b7',
                  background: 'rgba(16, 185, 129, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '99px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                {isAr ? 'قص مدة العرض + هوامش الشفافية' : 'Trim & Soft Margins'}
              </span>
            </h2>
          </div>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: '12px',
              color: '#9ca3af',
              lineHeight: 1.45,
            }}
          >
            {isAr
              ? 'تحديد وقص مدة معينة من الملف لعرضها وتصديرها بدقة، مع إضافة تدرجات شفافية ناعمة حول حواف الحركة'
              : 'Trim a specific duration of the animation or video, and apply soft gradient feathering around the edges'}
          </p>
        </div>

        {/* Main 2-Column Content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(310px, 1.25fr) minmax(320px, 1.45fr)',
            gap: '26px',
            alignItems: 'start',
          }}
        >
          {/* Left Column: Preview Stage & Background Chooser */}
          <div
            style={{
              background: '#1b1b20',
              border: '1px solid #2d2d37',
              borderRadius: '8px',
              minHeight: '460px',
              padding: '20px 20px 16px',
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

          {/* Right Parameters Column — Duration Trim at Top + Edge Feather below */}
          <div style={{ paddingTop: '2px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 1. DURATION & TIME TRIMMING SYSTEM (Where the user's arrow points) */}
            <div
              id="efTrimDurationSection"
              style={{
                background: 'linear-gradient(180deg, #181822 0%, #15151e 100%)',
                border: trimEnabled
                  ? '1px solid rgba(16, 185, 129, 0.45)'
                  : '1px solid #282835',
                borderRadius: '10px',
                padding: '16px 18px',
                boxShadow: trimEnabled ? '0 4px 20px rgba(16, 185, 129, 0.08)' : 'none',
                transition: 'border-color 0.2s ease',
              }}
            >
              {/* Trim Section Header with Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>✂️</span>
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: 700,
                        color: trimEnabled ? '#6ee7b7' : '#ffffff',
                      }}
                    >
                      {isAr ? 'قص مدة معينة من الملف' : 'Trim Playback Duration'}
                    </h3>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {isAr ? 'تحديد مقطع زمني محدد لعرضه وتصديره' : 'Select a specific slice to render and export'}
                    </div>
                  </div>
                </div>

                {/* Custom Green Switch Toggle Button */}
                <button
                  type="button"
                  id="efTrimToggleBtn"
                  role="switch"
                  aria-checked={trimEnabled}
                  onClick={() => {
                    setTrimEnabled((prev) => {
                      const next = !prev;
                      if (next && trimEndTime <= trimStartTime) {
                        setTrimEndTime(totalDuration);
                      }
                      return next;
                    });
                  }}
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '99px',
                    background: trimEnabled ? '#10b981' : '#272733',
                    border: trimEnabled ? '1px solid #34d399' : '1px solid #3b3b4a',
                    position: 'relative',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.2s ease',
                  }}
                  title={isAr ? 'تفعيل / إلغاء تفعيل قص المدة' : 'Toggle Trim Duration'}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      position: 'absolute',
                      top: '2px',
                      left: trimEnabled ? '22px' : '2px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    }}
                  />
                </button>
              </div>

              {/* Status & Media Info Bar */}
              <div
                style={{
                  background: '#111117',
                  border: '1px solid #242432',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                  fontSize: '12px',
                }}
              >
                <div>
                  <span style={{ color: '#94a3b8' }}>{isAr ? 'المدة الإجمالية: ' : 'Total: '}</span>
                  <b style={{ color: '#ffffff', fontFamily: 'monospace' }}>
                    {formatDurationSec(totalDuration)}
                  </b>
                  <span style={{ color: '#64748b', fontSize: '11px', margin: '0 6px' }}>
                    ({totalFrames} {isAr ? 'إطار' : 'fr'} • {fps} FPS)
                  </span>
                </div>

                <div
                  style={{
                    background: trimEnabled ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                    color: trimEnabled ? '#34d399' : '#94a3b8',
                    border: trimEnabled ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #333342',
                    padding: '3px 9px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '11.5px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {isAr ? 'الجزء المحدد: ' : 'Trimmed: '}
                  <b>{formatDurationSec(selectedSpanSec)}</b>
                  <span style={{ fontSize: '10.5px', opacity: 0.85, marginInlineStart: '4px' }}>
                    ({selectedSpanFrames} {isAr ? 'إطار' : 'fr'})
                  </span>
                </div>
              </div>

              {/* Dual Range Timeline Track */}
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: '#94a3b8',
                    marginBottom: '6px',
                    fontFamily: 'monospace',
                  }}
                >
                  <span>0.00s</span>
                  <span style={{ color: '#6ee7b7', fontWeight: 600 }}>
                    {isAr ? 'المخطط الزمني للسحب والتحديد' : 'Interactive Timeline'}
                  </span>
                  <span>{formatDurationSec(totalDuration)}</span>
                </div>

                {/* Timeline Visual Track */}
                <div
                  ref={timelineTrackRef}
                  id="efTimelineTrack"
                  style={{
                    position: 'relative',
                    height: '36px',
                    background: '#1d1d27',
                    border: '1px solid #363646',
                    borderRadius: '6px',
                    cursor: trimEnabled ? 'pointer' : 'default',
                    overflow: 'hidden',
                    userSelect: 'none',
                    opacity: trimEnabled ? 1 : 0.6,
                  }}
                  onPointerDown={(e) => {
                    if (!trimEnabled || totalDuration <= 0) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    const clickSec = ratio * totalDuration;
                    const distToStart = Math.abs(clickSec - trimStartTime);
                    const distToEnd = Math.abs(clickSec - trimEndTime);
                    if (distToStart < distToEnd) {
                      setDraggingThumb('start');
                      setTrimStartTime(Math.max(0, Math.min(trimEndTime - 0.05, Number(clickSec.toFixed(2)))));
                    } else {
                      setDraggingThumb('end');
                      setTrimEndTime(Math.max(trimStartTime + 0.05, Math.min(totalDuration, Number(clickSec.toFixed(2)))));
                    }
                  }}
                >
                  {/* Background Filmstrip Thumbnails Layer */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      overflow: 'hidden',
                      zIndex: 1,
                      opacity: 0.88,
                      pointerEvents: 'none',
                    }}
                  >
                    {filmstripThumbs.length > 0 ? (
                      filmstripThumbs.map((thumb, idx) => (
                        <img
                          key={idx}
                          src={thumb}
                          alt={`frame-${idx}`}
                          style={{
                            flex: 1,
                            height: '100%',
                            objectFit: 'cover',
                            borderRight: '1px solid rgba(0,0,0,0.3)',
                          }}
                        />
                      ))
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background:
                            'repeating-linear-gradient(90deg, #1f1f2e 0, #1f1f2e 24px, #2a2a3c 24px, #2a2a3c 48px)',
                          opacity: 0.7,
                        }}
                      />
                    )}
                  </div>

                  {/* Left inactive unselected area overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${startPct}%`,
                      background: 'rgba(0, 0, 0, 0.68)',
                      zIndex: 2,
                    }}
                  />

                  {/* Active selected slice (Glowing Emerald Bar) */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${startPct}%`,
                      width: `${Math.max(0, endPct - startPct)}%`,
                      top: 0,
                      bottom: 0,
                      background: trimEnabled
                        ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.28) 0%, rgba(5, 150, 105, 0.42) 100%)'
                        : 'rgba(75, 85, 99, 0.35)',
                      borderTop: trimEnabled ? '2px solid #10b981' : '2px solid #6b7280',
                      borderBottom: trimEnabled ? '2px solid #10b981' : '2px solid #6b7280',
                      zIndex: 2,
                    }}
                  />

                  {/* Right inactive unselected area overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${endPct}%`,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      background: 'rgba(0, 0, 0, 0.68)',
                      zIndex: 2,
                    }}
                  />

                  {/* Live Playhead Indicator */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${playheadPct}%`,
                      top: 0,
                      bottom: 0,
                      width: '2px',
                      background: '#fbbf24',
                      zIndex: 3,
                      boxShadow: '0 0 8px rgba(251, 191, 36, 0.8)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Start Draggable Handle */}
                  {trimEnabled && (
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDraggingThumb('start');
                      }}
                      title={`Start Time: ${trimStartTime.toFixed(2)}s`}
                      style={{
                        position: 'absolute',
                        left: `${startPct}%`,
                        top: 0,
                        bottom: 0,
                        width: '12px',
                        transform: 'translateX(-50%)',
                        background: '#10b981',
                        border: '1px solid #ffffff',
                        borderRadius: '3px',
                        cursor: 'ew-resize',
                        zIndex: 4,
                        boxShadow: '0 0 6px rgba(0,0,0,0.5)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <div style={{ width: '2px', height: '14px', background: '#ffffff' }} />
                    </div>
                  )}

                  {/* End Draggable Handle */}
                  {trimEnabled && (
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDraggingThumb('end');
                      }}
                      title={`End Time: ${trimEndTime.toFixed(2)}s`}
                      style={{
                        position: 'absolute',
                        left: `${endPct}%`,
                        top: 0,
                        bottom: 0,
                        width: '12px',
                        transform: 'translateX(-50%)',
                        background: '#10b981',
                        border: '1px solid #ffffff',
                        borderRadius: '3px',
                        cursor: 'ew-resize',
                        zIndex: 4,
                        boxShadow: '0 0 6px rgba(0,0,0,0.5)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <div style={{ width: '2px', height: '14px', background: '#ffffff' }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Exact Number Inputs for Start and End Times */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '14px',
                  opacity: trimEnabled ? 1 : 0.6,
                  pointerEvents: trimEnabled ? 'auto' : 'none',
                }}
              >
                {/* Start Time Box */}
                <div
                  style={{
                    background: '#13131c',
                    border: '1px solid #2c2c3b',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px',
                    }}
                  >
                    <label
                      htmlFor="efTrimStartInput"
                      style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}
                    >
                      {isAr ? 'وقت البداية (Start)' : 'Start Time'}
                    </label>
                    <span
                      style={{
                        fontSize: '10.5px',
                        color: '#6ee7b7',
                        fontFamily: 'monospace',
                        background: 'rgba(16, 185, 129, 0.1)',
                        padding: '1px 5px',
                        borderRadius: '4px',
                      }}
                    >
                      {isAr ? 'إطار: ' : 'Fr: '}
                      {Math.round(trimStartTime * fps)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      id="efTrimStartInput"
                      type="number"
                      min={0}
                      max={Math.max(0, trimEndTime - 0.05)}
                      step={0.05}
                      value={trimStartTime}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isFinite(val)) {
                          setTrimStartTime(Math.max(0, Math.min(trimEndTime - 0.05, val)));
                        }
                      }}
                      style={{
                        width: '100%',
                        height: '30px',
                        background: '#1e1e28',
                        border: '1px solid #3d3d4e',
                        borderRadius: '6px',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: '12px', color: '#94a3b8', width: '12px' }}>s</span>
                  </div>
                </div>

                {/* End Time Box */}
                <div
                  style={{
                    background: '#13131c',
                    border: '1px solid #2c2c3b',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px',
                    }}
                  >
                    <label
                      htmlFor="efTrimEndInput"
                      style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}
                    >
                      {isAr ? 'وقت النهاية (End)' : 'End Time'}
                    </label>
                    <span
                      style={{
                        fontSize: '10.5px',
                        color: '#6ee7b7',
                        fontFamily: 'monospace',
                        background: 'rgba(16, 185, 129, 0.1)',
                        padding: '1px 5px',
                        borderRadius: '4px',
                      }}
                    >
                      {isAr ? 'إطار: ' : 'Fr: '}
                      {Math.round(trimEndTime * fps)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      id="efTrimEndInput"
                      type="number"
                      min={Math.max(0.05, trimStartTime + 0.05)}
                      max={totalDuration}
                      step={0.05}
                      value={trimEndTime}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isFinite(val)) {
                          setTrimEndTime(Math.max(trimStartTime + 0.05, Math.min(totalDuration, val)));
                        }
                      }}
                      style={{
                        width: '100%',
                        height: '30px',
                        background: '#1e1e28',
                        border: '1px solid #3d3d4e',
                        borderRadius: '6px',
                        color: '#ffffff',
                        textAlign: 'center',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: '12px', color: '#94a3b8', width: '12px' }}>s</span>
                  </div>
                </div>
              </div>

              {/* Quick Preset Buttons & Playback Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                  opacity: trimEnabled ? 1 : 0.6,
                  pointerEvents: trimEnabled ? 'auto' : 'none',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setTrimStartTime(0);
                      setTrimEndTime(totalDuration);
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: '#1e1e28',
                      border: '1px solid #373747',
                      color: '#cbd5e1',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isAr ? 'الملف كامل (100%)' : 'Full File (100%)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTrimStartTime(0);
                      setTrimEndTime(Number((totalDuration * 0.5).toFixed(2)));
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: '#1e1e28',
                      border: '1px solid #373747',
                      color: '#cbd5e1',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isAr ? 'النصف الأول (50%)' : 'First Half (50%)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTrimStartTime(Number((totalDuration * 0.5).toFixed(2)));
                      setTrimEndTime(totalDuration);
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: '#1e1e28',
                      border: '1px solid #373747',
                      color: '#cbd5e1',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isAr ? 'النصف الثاني (50%)' : 'Second Half (50%)'}
                  </button>
                  {totalDuration > 2.0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTrimStartTime(0);
                        setTrimEndTime(2.0);
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: '#1e1e28',
                        border: '1px solid #373747',
                        color: '#cbd5e1',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {isAr ? 'أول 2 ثواني' : 'First 2s'}
                    </button>
                  )}
                </div>

                {/* Preview Play/Pause Button */}
                <button
                  type="button"
                  id="efTogglePlayTrimBtn"
                  onClick={() => setIsPlayingTrim((p) => !p)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: isPlayingTrim ? 'rgba(16, 185, 129, 0.2)' : '#272738',
                    border: isPlayingTrim
                      ? '1px solid rgba(16, 185, 129, 0.5)'
                      : '1px solid #3e3e52',
                    color: isPlayingTrim ? '#6ee7b7' : '#ffffff',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span>{isPlayingTrim ? '⏸' : '▶'}</span>
                  <span>{isPlayingTrim ? (isAr ? 'إيقاف المعاينة' : 'Pause Loop') : (isAr ? 'معاينة المقطع' : 'Play Loop')}</span>
                </button>
              </div>
            </div>

            {/* 2. EDGE MARGINS & FEATHER RADIUS SECTION */}
            <div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#e4e4e7',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>📐</span>
                <span>{isAr ? 'هوامش ونصف قطر التدرج (Edge Parameters)' : 'Edge Parameters & Margins'}</span>
              </div>

              {/* 4 Margin Inputs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: isAr ? 'الهامش العلوي (Top Margin)' : 'Top Margin', val: topMargin, set: setTopMargin, id: 'efTopMargin' },
                  { label: isAr ? 'الهامش السفلي (Bottom Margin)' : 'Bottom Margin', val: bottomMargin, set: setBottomMargin, id: 'efBottomMargin' },
                  { label: isAr ? 'الهامش الأيسر (Left Margin)' : 'Left Margin', val: leftMargin, set: setLeftMargin, id: 'efLeftMargin' },
                  { label: isAr ? 'الهامش الأيمن (Right Margin)' : 'Right Margin', val: rightMargin, set: setRightMargin, id: 'efRightMargin' },
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
                        color: '#cbd5e1',
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
                          height: '32px',
                          background: '#1c1c22',
                          border: '1px solid #353542',
                          borderRadius: '6px',
                          color: '#ffffff',
                          textAlign: 'center',
                          fontSize: '13px',
                          fontFamily: 'monospace',
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
                  margin: '18px 0',
                }}
              />

              {/* Feather Radius */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}
              >
                <label
                  htmlFor="efFeatherRadius"
                  style={{
                    fontSize: '13px',
                    color: '#cbd5e1',
                    fontWeight: 500,
                  }}
                >
                  {isAr ? 'نصف قطر التدرج (Feather Radius)' : 'Feather Radius'}
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
                      height: '32px',
                      background: '#1c1c22',
                      border: '1px solid #353542',
                      borderRadius: '6px',
                      color: '#ffffff',
                      textAlign: 'center',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '13px', color: '#9ca3af', width: '18px' }}>px</span>
                </div>
              </div>

              {/* Green Range Slider */}
              <div style={{ padding: '2px 0 10px' }}>
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
            </div>

            <div
              style={{
                height: '1px',
                background: '#262630',
                margin: '8px 0 0',
              }}
            />

            {/* Footer Action Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <button
                type="button"
                id="efCancelBtn"
                onClick={onClose}
                style={{
                  padding: '9px 18px',
                  borderRadius: '7px',
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
                <span>{isAr ? 'إلغاء' : 'Cancel'}</span>
              </button>

              <button
                type="button"
                id="efApplyBtn"
                onClick={handleApplyClick}
                style={{
                  padding: '9px 22px',
                  borderRadius: '7px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: '1px solid #34d399',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
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
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{isAr ? 'تطبيق وقص العرض' : 'Apply Settings'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
