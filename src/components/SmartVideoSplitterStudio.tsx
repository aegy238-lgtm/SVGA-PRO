import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  SMART_EXPORT_FORMATS,
  SmartElementExportFormat,
  SmartSplitDetectionMode,
  SmartSplitterConfig,
  DEFAULT_SMART_SPLITTER_CONFIG,
  DetectedElementRegion,
  DetectedBackgroundInfo,
  detectDominantBackgroundKeyColor,
  removeVideoBackgroundAndDespillInPlace,
  computeTemporalForegroundOccupancyMap,
  detectSmartElementsRegions,
  extractElementSequenceRgba,
  encodeExtractedElementSync,
  buildZipArchiveSync,
} from '../utils/smartVideoSplitter';

export const SAMPLE_GREEN_SCREEN_VIDEO_URL =
  '/assets/aistudio/167039352_1794158026248405_45d857bd.mp4';

interface SmartVideoSplitterStudioProps {
  isAr: boolean;
  externalVideoFile?: File | null;
  onOpenElementInSvgaEditor?: (svgaFile: File) => void;
  onSendElementToConverter?: (file: File) => void;
}

export default function SmartVideoSplitterStudio({
  isAr,
  externalVideoFile,
  onOpenElementInSvgaEditor,
  onSendElementToConverter,
}: SmartVideoSplitterStudioProps) {
  const [config, setConfig] = useState<SmartSplitterConfig>(DEFAULT_SMART_SPLITTER_CONFIG);
  const [sourceFileName, setSourceFileName] = useState<string>('');
  const [sourceDimensions, setSourceDimensions] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const [sourceDurationSec, setSourceDurationSec] = useState<number>(0);
  const [detectedBg, setDetectedBg] = useState<DetectedBackgroundInfo | null>(null);

  // Raw decoded frames before chroma removal so user can tweak Chroma Key sliders without re-decoding video
  const rawFramesRef = useRef<Uint8ClampedArray[]>([]);
  // Processed frames after chroma key & despill
  const processedFramesRef = useRef<Uint8ClampedArray[]>([]);
  const [frameCount, setFrameCount] = useState<number>(0);

  const [regions, setRegions] = useState<DetectedElementRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [currentFrameIdx, setCurrentFrameIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showOverlayBoxes, setShowOverlayBoxes] = useState<boolean>(true);
  const [previewBg, setPreviewBg] = useState<'checker' | 'dark' | 'white' | 'green'>('checker');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [statusBanner, setStatusBanner] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const overviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedInspectorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const itemCanvasMapRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const offscreenSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setStatusBanner(msg);
    const globalToast = document.getElementById('toast');
    if (globalToast) {
      globalToast.textContent = msg;
      globalToast.classList.add('on');
      setTimeout(() => globalToast.classList.remove('on'), 2600);
    }
  }, []);

  /**
   * Runs Chroma Key removal + Temporal Foreground Occupancy + Smart Elements Detection
   * on the currently decoded `rawFramesRef.current`.
   */
  const runSmartDetectionPipeline = useCallback(
    (
      rawFrames: Uint8ClampedArray[],
      W: number,
      H: number,
      activeConfig: SmartSplitterConfig
    ) => {
      if (!rawFrames || rawFrames.length === 0 || W <= 0 || H <= 0) return;

      const bgInfo = detectDominantBackgroundKeyColor(rawFrames[0], W, H);
      setDetectedBg(bgInfo);

      const effectiveChroma = {
        ...activeConfig.chroma,
        keyColorHex: activeConfig.chroma.autoDetectColor
          ? bgInfo.hex
          : activeConfig.chroma.keyColorHex,
      };

      const cleanedFrames: Uint8ClampedArray[] = rawFrames.map((raw) => {
        const copy = new Uint8ClampedArray(raw.length);
        copy.set(raw);
        if (effectiveChroma.enabled) {
          removeVideoBackgroundAndDespillInPlace(copy, W, H, effectiveChroma, bgInfo);
        }
        return copy;
      });

      processedFramesRef.current = cleanedFrames;
      setFrameCount(cleanedFrames.length);

      const occupancy = computeTemporalForegroundOccupancyMap(cleanedFrames, W, H, 28);
      const detected = detectSmartElementsRegions(occupancy, W, H, activeConfig);
      setRegions(detected);
      if (detected.length > 0) {
        setSelectedRegionId((prev) =>
          prev && detected.some((d) => d.id === prev) ? prev : detected[0].id
        );
      }
      setStatusBanner(
        isAr
          ? `✅ تم الكشف الذكي وقص ${detected.length} عنصر متحرك منفصل بنجاح (${W}×${H}px • ${cleanedFrames.length} إطار)`
          : `✅ Smartly detected and isolated ${detected.length} separate animated elements (${W}×${H}px • ${cleanedFrames.length} frames)`
      );
    },
    [isAr]
  );

  /**
   * Decodes frames from a video URL or uploaded File (`MP4`, `WebM`, `MOV`, or Static/Animated Image),
   * then runs the smart background removal & element isolation pipeline.
   */
  const decodeMediaSourceAndSplit = useCallback(
    async (source: File | string, displayName: string, overrideConfig?: SmartSplitterConfig) => {
      const activeCfg = overrideConfig || config;
      setIsProcessing(true);
      setErrorMessage(null);
      setProgressPercent(5);
      setProgressLabel(
        isAr
          ? 'جاري قراءة الفيديو واستخراج الإطارات الذكية...'
          : 'Decoding video and extracting frames...'
      );

      let objectUrlToRevoke: string | null = null;
      try {
        const isImageFile =
          typeof source !== 'string' &&
          (source.type.startsWith('image/') ||
            /\.(png|jpe?g|webp|gif|apng)$/i.test(source.name || ''));

        if (isImageFile && typeof source !== 'string') {
          const bm = await createImageBitmap(source);
          const scale = Math.min(1, 960 / Math.max(bm.width, bm.height));
          const W = Math.max(2, Math.round(bm.width * scale));
          const H = Math.max(2, Math.round(bm.height * scale));
          const c = document.createElement('canvas');
          c.width = W;
          c.height = H;
          const ctx = c.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context unavailable');
          ctx.drawImage(bm, 0, 0, W, H);
          const imgData = ctx.getImageData(0, 0, W, H);

          rawFramesRef.current = [new Uint8ClampedArray(imgData.data)];
          setSourceFileName(displayName);
          setSourceDimensions({ w: W, h: H });
          setSourceDurationSec(1);
          setProgressPercent(75);
          runSmartDetectionPipeline(rawFramesRef.current, W, H, activeCfg);
          setProgressPercent(100);
          return;
        }

        // Video decoding path via HTMLVideoElement
        const videoUrl =
          typeof source === 'string'
            ? source
            : ((objectUrlToRevoke = URL.createObjectURL(source)), objectUrlToRevoke);

        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = videoUrl;

        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('انتهت مهلة تحميل الفيديو')), 15000);
          video.onloadedmetadata = () => {
            clearTimeout(t);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(t);
            reject(new Error('تعذر فك تشفير ملف الفيديو المرفوع'));
          };
        });

        const rawW = video.videoWidth || 464;
        const rawH = video.videoHeight || 848;
        // Keep full sharpness up to 880px max dimension so 24 stickers remain crisp and fast
        const scale = Math.min(1, 880 / Math.max(rawW, rawH));
        const W = Math.max(2, Math.round((rawW * scale) / 2) * 2);
        const H = Math.max(2, Math.round((rawH * scale) / 2) * 2);
        const duration = Math.max(0.2, Number.isFinite(video.duration) ? video.duration : 3.0);

        const targetFps = Math.max(6, Math.min(24, activeCfg.sampleFps || 12));
        const totalFramesToSample = Math.max(
          6,
          Math.min(activeCfg.maxFrames || 30, Math.round(duration * targetFps))
        );

        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas 2D context unavailable');

        const extractedRawFrames: Uint8ClampedArray[] = [];
        for (let i = 0; i < totalFramesToSample; i++) {
          const targetTime = Math.min(
            Math.max(0, duration - 0.04),
            (i / Math.max(1, totalFramesToSample - 1)) * Math.max(0.05, duration - 0.05)
          );
          video.currentTime = targetTime;
          await new Promise<void>((resolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              resolve();
            };
            video.addEventListener('seeked', onSeeked);
            setTimeout(() => {
              video.removeEventListener('seeked', onSeeked);
              resolve();
            }, 450);
          });

          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(video, 0, 0, W, H);
          const frameData = ctx.getImageData(0, 0, W, H);
          extractedRawFrames.push(new Uint8ClampedArray(frameData.data));
          setProgressPercent(Math.round(10 + ((i + 1) / totalFramesToSample) * 65));
          setProgressLabel(
            isAr
              ? `جاري استخراج وتحليل الإطار ${i + 1} من ${totalFramesToSample}...`
              : `Extracting frame ${i + 1} of ${totalFramesToSample}...`
          );
        }

        rawFramesRef.current = extractedRawFrames;
        setSourceFileName(displayName);
        setSourceDimensions({ w: W, h: H });
        setSourceDurationSec(Number(duration.toFixed(2)));
        setCurrentFrameIdx(0);

        setProgressPercent(85);
        setProgressLabel(
          isAr
            ? 'جاري إزالة الخلفية الذكية وفصل كل عنصر لوحده...'
            : 'Removing background and isolating individual elements...'
        );
        await new Promise((r) => setTimeout(r, 20));

        runSmartDetectionPipeline(extractedRawFrames, W, H, activeCfg);
        setProgressPercent(100);
      } catch (err: any) {
        setErrorMessage(
          err?.message ||
            (isAr ? 'حدث خطأ أثناء تحليل وقص الفيديو' : 'Failed to analyze and split video')
        );
      } finally {
        if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
        setIsProcessing(false);
      }
    },
    [config, isAr, runSmartDetectionPipeline]
  );

  // Load externalVideoFile if passed from parent App
  useEffect(() => {
    if (externalVideoFile) {
      decodeMediaSourceAndSplit(externalVideoFile, externalVideoFile.name);
    }
  }, [externalVideoFile, decodeMediaSourceAndSplit]);

  // Animation playback loop for live preview of all cropped elements + overview
  useEffect(() => {
    if (!isPlaying || frameCount <= 1) return;
    const intervalMs = Math.max(40, Math.round(1000 / Math.max(4, config.sampleFps || 12)));
    const timer = window.setInterval(() => {
      setCurrentFrameIdx((prev) => (prev + 1) % frameCount);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, frameCount, config.sampleFps]);

  // Render current frame onto the source overview canvas + selected inspector canvas + every individual sticker card canvas!
  useEffect(() => {
    const frames = processedFramesRef.current;
    const W = sourceDimensions.w;
    const H = sourceDimensions.h;
    if (!frames || frames.length === 0 || W <= 0 || H <= 0) return;

    const safeFrameIdx = currentFrameIdx % frames.length;
    const rgba = frames[safeFrameIdx];
    if (!rgba) return;

    if (!offscreenSourceCanvasRef.current) {
      offscreenSourceCanvasRef.current = document.createElement('canvas');
    }
    const srcCanvas = offscreenSourceCanvasRef.current;
    if (srcCanvas.width !== W || srcCanvas.height !== H) {
      srcCanvas.width = W;
      srcCanvas.height = H;
    }
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) return;
    const imgData = new ImageData(new Uint8ClampedArray(rgba), W, H);
    srcCtx.putImageData(imgData, 0, 0);

    // 1. Draw Source Video Overview + Smart Bounding Boxes
    const ovCanvas = overviewCanvasRef.current;
    if (ovCanvas) {
      if (ovCanvas.width !== W || ovCanvas.height !== H) {
        ovCanvas.width = W;
        ovCanvas.height = H;
      }
      const ovCtx = ovCanvas.getContext('2d');
      if (ovCtx) {
        ovCtx.clearRect(0, 0, W, H);
        ovCtx.drawImage(srcCanvas, 0, 0);

        if (showOverlayBoxes) {
          regions.forEach((reg) => {
            const isSel = reg.id === selectedRegionId;
            ovCtx.save();
            ovCtx.strokeStyle = isSel ? '#f59e0b' : reg.selected ? '#10b981' : '#64748b';
            ovCtx.lineWidth = isSel ? 3 : 1.75;
            if (!isSel) ovCtx.setLineDash([4, 3]);
            ovCtx.strokeRect(reg.x, reg.y, reg.width, reg.height);

            // Number badge
            const badgeW = 24;
            const badgeH = 16;
            ovCtx.fillStyle = isSel ? '#f59e0b' : '#10b981';
            ovCtx.fillRect(reg.x, Math.max(0, reg.y - badgeH), badgeW, badgeH);
            ovCtx.fillStyle = '#050508';
            ovCtx.font = 'bold 10px sans-serif';
            ovCtx.textAlign = 'center';
            ovCtx.textBaseline = 'middle';
            ovCtx.fillText(
              `#${reg.index}`,
              reg.x + badgeW / 2,
              Math.max(badgeH / 2, reg.y - badgeH / 2)
            );
            ovCtx.restore();
          });
        }
      }
    }

    // 2. Draw Selected Element Inspector Canvas
    const selReg = regions.find((r) => r.id === selectedRegionId) || regions[0];
    const inspCanvas = selectedInspectorCanvasRef.current;
    if (inspCanvas && selReg) {
      const iW = 260;
      const iH = 260;
      if (inspCanvas.width !== iW || inspCanvas.height !== iH) {
        inspCanvas.width = iW;
        inspCanvas.height = iH;
      }
      const iCtx = inspCanvas.getContext('2d');
      if (iCtx) {
        iCtx.clearRect(0, 0, iW, iH);
        const scale = Math.min((iW * 0.88) / selReg.width, (iH * 0.88) / selReg.height);
        const dW = selReg.width * scale;
        const dH = selReg.height * scale;
        const dX = (iW - dW) / 2;
        const dY = (iH - dH) / 2;
        iCtx.drawImage(
          srcCanvas,
          selReg.x,
          selReg.y,
          selReg.width,
          selReg.height,
          dX,
          dY,
          dW,
          dH
        );
      }
    }

    // 3. Draw every individual sticker card's live animated preview canvas
    itemCanvasMapRef.current.forEach((cardCanvas, regId) => {
      const reg = regions.find((r) => r.id === regId);
      if (!reg || !cardCanvas) return;
      const cW = cardCanvas.width || 130;
      const cH = cardCanvas.height || 130;
      const cCtx = cardCanvas.getContext('2d');
      if (!cCtx) return;
      cCtx.clearRect(0, 0, cW, cH);
      const scale = Math.min((cW * 0.9) / reg.width, (cH * 0.9) / reg.height);
      const dW = reg.width * scale;
      const dH = reg.height * scale;
      const dX = (cW - dW) / 2;
      const dY = (cH - dH) / 2;
      cCtx.drawImage(srcCanvas, reg.x, reg.y, reg.width, reg.height, dX, dY, dW, dH);
    });
  }, [currentFrameIdx, regions, selectedRegionId, showOverlayBoxes, sourceDimensions]);

  const handleReapplyDetection = useCallback(
    (patch?: Partial<SmartSplitterConfig>) => {
      const nextCfg: SmartSplitterConfig = {
        ...config,
        ...(patch || {}),
        chroma: {
          ...config.chroma,
          ...(patch?.chroma || {}),
        },
      };
      setConfig(nextCfg);
      if (rawFramesRef.current.length > 0 && sourceDimensions.w > 0) {
        runSmartDetectionPipeline(
          rawFramesRef.current,
          sourceDimensions.w,
          sourceDimensions.h,
          nextCfg
        );
      }
    },
    [config, runSmartDetectionPipeline, sourceDimensions]
  );

  /**
   * Encodes a single `DetectedElementRegion` into the requested `SmartElementExportFormat`
   * (including browser `MediaRecorder` for `webm`/`mp4` when supported, or pure TS encoders for `svga`, `webp`, `apng`, `gif`, `lottie`, `png`, `png_seq_zip`).
   */
  const encodeSingleRegionToFormat = useCallback(
    async (
      reg: DetectedElementRegion,
      targetFormat: SmartElementExportFormat
    ): Promise<{ bytes: Uint8Array; fileName: string; mime: string }> => {
      const frames = processedFramesRef.current;
      const W = sourceDimensions.w;
      const H = sourceDimensions.h;
      if (!frames || frames.length === 0) {
        throw new Error('لا توجد إطارات مستخرجة للتصدير');
      }

      const extracted = extractElementSequenceRgba(frames, W, H, reg, {
        sizeMode: config.sizeMode,
        unifiedWidth: config.unifiedWidth,
        unifiedHeight: config.unifiedHeight,
      });

      const safeBaseName =
        (isAr ? reg.nameAr : reg.nameEn)
          .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]/g, '_')
          .replace(/_+/g, '_') || `sticker_${reg.index}`;

      // Optional browser MediaRecorder path for WebM / MP4 if supported
      if (
        (targetFormat === 'webm' || targetFormat === 'mp4') &&
        typeof window !== 'undefined' &&
        typeof HTMLCanvasElement !== 'undefined' &&
        typeof (window as any).MediaRecorder !== 'undefined'
      ) {
        const mimeCandidates =
          targetFormat === 'mp4'
            ? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
            : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
        const supportedMime = mimeCandidates.find((m) => {
          try {
            return MediaRecorder.isTypeSupported(m);
          } catch {
            return false;
          }
        });

        if (supportedMime) {
          try {
            const recCanvas = document.createElement('canvas');
            recCanvas.width = extracted.width;
            recCanvas.height = extracted.height;
            const recCtx = recCanvas.getContext('2d');
            const stream = (recCanvas as any).captureStream(config.sampleFps || 12);
            (stream as any).__internalExport = true;
            const recorder = new MediaRecorder(stream, {
              mimeType: supportedMime,
              videoBitsPerSecond: 4_000_000,
            });
            const chunks: BlobPart[] = [];
            recorder.ondataavailable = (ev) => {
              if (ev.data && ev.data.size > 0) chunks.push(ev.data);
            };
            const stoppedPromise = new Promise<Blob>((resolve) => {
              recorder.onstop = () =>
                resolve(new Blob(chunks, { type: supportedMime.split(';')[0] }));
            });

            recorder.start();
            const frameDelay = Math.max(30, Math.round(1000 / (config.sampleFps || 12)));
            for (let f = 0; f < extracted.frames.length; f++) {
              if (recCtx) {
                if (targetFormat === 'mp4') {
                  recCtx.fillStyle = '#0f172a';
                  recCtx.fillRect(0, 0, extracted.width, extracted.height);
                } else {
                  recCtx.clearRect(0, 0, extracted.width, extracted.height);
                }
                const idata = new ImageData(
                  new Uint8ClampedArray(extracted.frames[f]),
                  extracted.width,
                  extracted.height
                );
                const tmp = document.createElement('canvas');
                tmp.width = extracted.width;
                tmp.height = extracted.height;
                tmp.getContext('2d')?.putImageData(idata, 0, 0);
                recCtx.drawImage(tmp, 0, 0);
              }
              await new Promise((r) => setTimeout(r, frameDelay));
            }
            recorder.stop();
            const blob = await stoppedPromise;
            const u8 = new Uint8Array(await blob.arrayBuffer());
            if (u8.length > 64) {
              const ext = targetFormat === 'mp4' ? 'mp4' : 'webm';
              return {
                bytes: u8,
                fileName: `${String(reg.index).padStart(2, '0')}_${safeBaseName}.${ext}`,
                mime: targetFormat === 'mp4' ? 'video/mp4' : 'video/webm',
              };
            }
          } catch {}
        }
      }

      const encoded = encodeExtractedElementSync(
        extracted.frames,
        extracted.width,
        extracted.height,
        config.sampleFps || 12,
        targetFormat,
        safeBaseName
      );

      return {
        bytes: encoded.bytes,
        fileName: `${String(reg.index).padStart(2, '0')}_${safeBaseName}.${encoded.ext}`,
        mime: encoded.mime,
      };
    },
    [config.sampleFps, config.sizeMode, config.unifiedHeight, config.unifiedWidth, isAr, sourceDimensions]
  );

  const triggerBrowserDownload = (bytes: Uint8Array, fileName: string, mime: string) => {
    const blob = new Blob([bytes as any], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const handleDownloadSingleElement = useCallback(
    async (reg: DetectedElementRegion, fmtOverride?: SmartElementExportFormat) => {
      const targetFmt = fmtOverride || config.exportFormat;
      setIsProcessing(true);
      setProgressPercent(25);
      setProgressLabel(
        isAr
          ? `جاري تصدير "${reg.nameAr}" كملف مستقل بصيغة ${targetFmt.toUpperCase()}...`
          : `Exporting "${reg.nameEn}" as standalone ${targetFmt.toUpperCase()}...`
      );
      try {
        await new Promise((r) => setTimeout(r, 15));
        const res = await encodeSingleRegionToFormat(reg, targetFmt);
        setProgressPercent(100);
        triggerBrowserDownload(res.bytes, res.fileName, res.mime);
        showToast(
          isAr
            ? `✅ تم تصدير وتحميل "${res.fileName}" (${(res.bytes.length / 1024).toFixed(1)} KB) بنجاح!`
            : `✅ Exported "${res.fileName}" (${(res.bytes.length / 1024).toFixed(1)} KB)!`
        );
      } catch (err: any) {
        setErrorMessage(err?.message || 'فشل تصدير العنصر');
      } finally {
        setIsProcessing(false);
      }
    },
    [config.exportFormat, encodeSingleRegionToFormat, isAr, showToast]
  );

  const handleExportAllSelectedAsZip = useCallback(async () => {
    const selectedList = regions.filter((r) => r.selected);
    if (selectedList.length === 0) {
      showToast(isAr ? 'يرجى تحديد عنصر واحد على الأقل للتصدير' : 'Please select at least 1 item');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setProgressPercent(5);
    const targetFmt = config.exportFormat;

    try {
      const zipEntries: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < selectedList.length; i++) {
        const reg = selectedList[i];
        setProgressLabel(
          isAr
            ? `جاري تصدير العنصر (${i + 1}/${selectedList.length}): ${reg.nameAr}.${targetFmt}...`
            : `Encoding item (${i + 1}/${selectedList.length}): ${reg.nameEn}.${targetFmt}...`
        );
        await new Promise((r) => setTimeout(r, 10));
        const encoded = await encodeSingleRegionToFormat(reg, targetFmt);
        zipEntries.push({
          name: encoded.fileName,
          data: encoded.bytes,
        });
        setProgressPercent(Math.round(5 + ((i + 1) / selectedList.length) * 88));
      }

      setProgressLabel(
        isAr
          ? 'جاري تجميع كافة الملفات المستقلة في حقيبة ZIP واحدة...'
          : 'Packaging all standalone files into ZIP archive...'
      );
      const zipBytes = buildZipArchiveSync(zipEntries);
      const cleanBase =
        sourceFileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'Smart_Split';
      const zipName = `${cleanBase}_${selectedList.length}_Items_${targetFmt.toUpperCase()}.zip`;
      triggerBrowserDownload(zipBytes, zipName, 'application/zip');
      setProgressPercent(100);
      showToast(
        isAr
          ? `🎉 تم تصدير ${selectedList.length} ملف مستقل بصيغة ${targetFmt.toUpperCase()} داخل "${zipName}"!`
          : `🎉 Exported ${selectedList.length} standalone ${targetFmt.toUpperCase()} files in "${zipName}"!`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء التصدير الجماعي');
    } finally {
      setIsProcessing(false);
    }
  }, [config.exportFormat, encodeSingleRegionToFormat, isAr, regions, showToast, sourceFileName]);

  const handleOpenInSvgaEditor = useCallback(
    async (reg: DetectedElementRegion) => {
      if (!onOpenElementInSvgaEditor) return;
      setIsProcessing(true);
      setProgressPercent(35);
      setProgressLabel(
        isAr
          ? `جاري تحويل "${reg.nameAr}" إلى ملف SVGA 2.0 وفتحه في المحرر...`
          : `Converting "${reg.nameEn}" to SVGA 2.0 and opening in Editor...`
      );
      try {
        await new Promise((r) => setTimeout(r, 15));
        const res = await encodeSingleRegionToFormat(reg, 'svga');
        const file = new File([res.bytes as any], res.fileName, {
          type: 'application/octet-stream',
        });
        setProgressPercent(100);
        onOpenElementInSvgaEditor(file);
      } catch (err: any) {
        setErrorMessage(err?.message || 'تعذر فتح العنصر في محرر SVGA');
      } finally {
        setIsProcessing(false);
      }
    },
    [encodeSingleRegionToFormat, isAr, onOpenElementInSvgaEditor]
  );

  const handleSendToMainConverter = useCallback(
    async (reg: DetectedElementRegion) => {
      if (!onSendElementToConverter) return;
      setIsProcessing(true);
      setProgressPercent(35);
      setProgressLabel(
        isAr
          ? `جاري إرسال "${reg.nameAr}" إلى محول الصيغ الرئيسي...`
          : `Sending "${reg.nameEn}" to Main Motion Converter...`
      );
      try {
        await new Promise((r) => setTimeout(r, 15));
        const res = await encodeSingleRegionToFormat(reg, 'webp');
        const file = new File([res.bytes as any], res.fileName, {
          type: 'image/webp',
        });
        setProgressPercent(100);
        onSendElementToConverter(file);
      } catch (err: any) {
        setErrorMessage(err?.message || 'تعذر إرسال العنصر للمحول');
      } finally {
        setIsProcessing(false);
      }
    },
    [encodeSingleRegionToFormat, isAr, onSendElementToConverter]
  );

  const selectedRegion = regions.find((r) => r.id === selectedRegionId) || regions[0] || null;
  const selectedCount = regions.filter((r) => r.selected).length;
  const activeFormatMeta =
    SMART_EXPORT_FORMATS.find((f) => f.id === config.exportFormat) || SMART_EXPORT_FORMATS[0];

  const filteredRegions = regions.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      r.nameAr.toLowerCase().includes(q) ||
      r.nameEn.toLowerCase().includes(q) ||
      String(r.index).includes(q)
    );
  });

  const getBgStyle = (mode: 'checker' | 'dark' | 'white' | 'green'): React.CSSProperties => {
    if (mode === 'dark') return { background: '#090b12' };
    if (mode === 'white') return { background: '#f8fafc' };
    if (mode === 'green') return { background: '#16a34a' };
    return {
      background:
        'repeating-conic-gradient(#181b28 0% 25%, #232738 0% 50%) 0 0 / 14px 14px',
    };
  };

  return (
    <div
      id="smartVideoSplitterStudioRoot"
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        background: '#090b12',
        color: '#f1f5f9',
        padding: '18px 22px 48px',
        boxSizing: 'border-box',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Top Studio Header Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          padding: '16px 20px',
          background: '#111422',
          border: '1px solid #22263a',
          borderRadius: '14px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(16, 185, 129, 0.45)',
              display: 'grid',
              placeItems: 'center',
              fontSize: '22px',
              flexShrink: 0,
            }}
          >
            ✂️
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 800,
                color: '#f8fafc',
                letterSpacing: '-0.01em',
              }}
            >
              {isAr
                ? 'استوديو القص الذكي وتفكيك عناصر الفيديو (كل عنصر في ملف مستقل)'
                : 'Smart Video Elements Splitter & Multi-Format Exporter'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
              {isAr
                ? 'ارفع أي فيديو مجمّع (ملصقات، إيموجي، هدايا، شاشة خضراء) ليتم عزل الخلفية وقص كل عنصر لوحده بذكاء وتصديره لأي صيغة (SVGA, WebP, GIF, APNG, MP4, Lottie, PNG)'
                : 'Upload any multi-item video (green screen sticker pack, emojis, gifts) to smartly isolate each item and export individually to any format'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*,.mp4,.webm,.mov,.gif,.webp,.apng,.png"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                decodeMediaSourceAndSplit(f, f.name);
              }
              e.target.value = '';
            }}
          />
          <button
            type="button"
            id="uploadSmartSplitVideoBtn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1px solid #10b981',
              background: '#059669',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              cursor: isProcessing ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>📹</span>
            <span>{isAr ? 'رفع فيديو أو صورة مجمّعة للقص الذكي' : 'Upload Video / Sheet to Split'}</span>
          </button>

          <button
            type="button"
            id="loadSample24StickersVideoBtn"
            onClick={() =>
              decodeMediaSourceAndSplit(
                SAMPLE_GREEN_SCREEN_VIDEO_URL,
                'ملصقات_خليجية_متحركة_24_عنصر.mp4'
              )
            }
            disabled={isProcessing}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(245, 158, 11, 0.55)',
              background: 'rgba(245, 158, 11, 0.14)',
              color: '#fde047',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: isProcessing ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>🎬</span>
            <span>
              {isAr
                ? 'تجربة الفيديو المرفق (24 ملصق متحرك - شاشة خضراء)'
                : 'Load Attached Sample Video (24 Green-Screen Stickers)'}
            </span>
          </button>
        </div>
      </div>

      {/* Progress / Status Bar */}
      {(isProcessing || statusBanner || errorMessage) && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '12px',
            background: errorMessage
              ? 'rgba(239, 68, 68, 0.12)'
              : isProcessing
                ? 'rgba(59, 130, 246, 0.12)'
                : 'rgba(16, 185, 129, 0.12)',
            border: errorMessage
              ? '1px solid rgba(239, 68, 68, 0.4)'
              : isProcessing
                ? '1px solid rgba(59, 130, 246, 0.4)'
                : '1px solid rgba(16, 185, 129, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              fontSize: '13px',
              fontWeight: 700,
              color: errorMessage ? '#fca5a5' : isProcessing ? '#93c5fd' : '#6ee7b7',
            }}
          >
            <span>{errorMessage || (isProcessing ? progressLabel : statusBanner)}</span>
            {isProcessing && (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{progressPercent}%</span>
            )}
          </div>
          {isProcessing && (
            <div
              style={{
                width: '100%',
                height: '6px',
                background: '#1e293b',
                borderRadius: '99px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: '#10b981',
                  transition: 'width 0.18s ease',
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Main 3-Column Studio Workspace */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px minmax(0, 1fr)',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* LEFT SIDEBAR: Smart Detection, Chroma Key, Dimensions & Format Settings */}
        <aside
          style={{
            background: '#111422',
            border: '1px solid #22263a',
            borderRadius: '14px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* 1. Smart Detection Mode */}
          <div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 800,
                color: '#e2e8f0',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{isAr ? '1. نظام القص والكشف الذكي' : '1. Smart Detection Mode'}</span>
              <span
                style={{
                  fontSize: '11px',
                  color: '#34d399',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {regions.length} {isAr ? 'عنصر' : 'items'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(
                [
                  {
                    id: 'auto_smart',
                    titleAr: '🔍 كشف ذكي تلقائي (Auto Smart)',
                    descAr: 'يحلل صفوف وأعمدة الفيديو ويقص كل ملصق على حدوده بدقة',
                  },
                  {
                    id: 'grid',
                    titleAr: '📐 تقسيم شبكي مخصص (Grid Cols × Rows)',
                    descAr: 'تحديد عدد الأعمدة والصفوف يدوياً مع قص الحواف الفارغة',
                  },
                  {
                    id: 'islands',
                    titleAr: '🧩 عزل حر للأجسام المتفرقة (Islands)',
                    descAr: 'يعزل أي عناصر متفرقة في الفيديو حتى لو لم تكن في شبكة',
                  },
                ] as { id: SmartSplitDetectionMode; titleAr: string; descAr: string }[]
              ).map((m) => {
                const active = config.detectionMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleReapplyDetection({ detectionMode: m.id })}
                    style={{
                      textAlign: 'start',
                      padding: '9px 11px',
                      borderRadius: '10px',
                      border: active ? '1px solid #10b981' : '1px solid #23273b',
                      background: active ? 'rgba(16, 185, 129, 0.13)' : '#161a2b',
                      color: active ? '#ecfdf5' : '#cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '12.5px', fontWeight: 800 }}>{m.titleAr}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      {m.descAr}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Grid Controls if mode === 'grid' */}
            {config.detectionMode === 'grid' && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '10px',
                  borderRadius: '10px',
                  background: '#161a2b',
                  border: '1px solid #262b40',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { c: 4, r: 6, label: '4×6 (24)' },
                    { c: 4, r: 4, label: '4×4 (16)' },
                    { c: 3, r: 3, label: '3×3 (9)' },
                    { c: 2, r: 2, label: '2×2 (4)' },
                    { c: 3, r: 4, label: '3×4 (12)' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        handleReapplyDetection({
                          detectionMode: 'grid',
                          gridCols: preset.c,
                          gridRows: preset.r,
                        })
                      }
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        border:
                          config.gridCols === preset.c && config.gridRows === preset.r
                            ? '1px solid #10b981'
                            : '1px solid #2e344e',
                        background:
                          config.gridCols === preset.c && config.gridRows === preset.r
                            ? 'rgba(16, 185, 129, 0.2)'
                            : '#0f121d',
                        color: '#e2e8f0',
                        cursor: 'pointer',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <label style={{ fontSize: '11.5px', color: '#cbd5e1' }}>
                    {isAr ? 'الأعمدة (Cols):' : 'Columns:'}
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={config.gridCols || 4}
                      onChange={(e) =>
                        handleReapplyDetection({
                          gridCols: Math.max(1, Math.min(12, Number(e.target.value) || 4)),
                        })
                      }
                      style={{
                        width: '100%',
                        marginTop: '4px',
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid #2e344e',
                        background: '#090b12',
                        color: '#fff',
                      }}
                    />
                  </label>
                  <label style={{ fontSize: '11.5px', color: '#cbd5e1' }}>
                    {isAr ? 'الصفوف (Rows):' : 'Rows:'}
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={config.gridRows || 6}
                      onChange={(e) =>
                        handleReapplyDetection({
                          gridRows: Math.max(1, Math.min(12, Number(e.target.value) || 6)),
                        })
                      }
                      style={{
                        width: '100%',
                        marginTop: '4px',
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid #2e344e',
                        background: '#090b12',
                        color: '#fff',
                      }}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Padding & Tight Trim Controls */}
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                }}
              >
                <span>{isAr ? 'قص ضيق تلقائي على حدود كل عنصر' : 'Auto Tight-Trim to Element Bounds'}</span>
                <input
                  type="checkbox"
                  checked={config.tightTrimCells}
                  onChange={(e) => handleReapplyDetection({ tightTrimCells: e.target.checked })}
                />
              </label>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11.5px',
                    color: '#94a3b8',
                    marginBottom: '3px',
                  }}
                >
                  <span>{isAr ? 'هامش شفاف حول كل عنصر (Padding)' : 'Margin Around Each Item'}</span>
                  <span style={{ color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                    {config.paddingPx} px
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={32}
                  value={config.paddingPx}
                  onChange={(e) =>
                    handleReapplyDetection({ paddingPx: Number(e.target.value) })
                  }
                  style={{ width: '100%', accentColor: '#10b981' }}
                />
              </div>
            </div>
          </div>

          <hr style={{ border: 0, borderTop: '1px solid #22263a', margin: 0 }} />

          {/* 2. Smart Chroma Key & Background Removal */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#e2e8f0' }}>
                {isAr ? '2. تفريغ الخلفية والكروما الذكي' : '2. Smart Chroma Key & Alpha'}
              </span>
              <input
                type="checkbox"
                checked={config.chroma.enabled}
                onChange={(e) =>
                  handleReapplyDetection({
                    chroma: { ...config.chroma, enabled: e.target.checked },
                  })
                }
              />
            </div>

            {config.chroma.enabled && (
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: '#161a2b',
                  border: '1px solid #23273b',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    fontSize: '11.5px',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.chroma.autoDetectColor}
                      onChange={(e) =>
                        handleReapplyDetection({
                          chroma: { ...config.chroma, autoDetectColor: e.target.checked },
                        })
                      }
                    />
                    <span>{isAr ? 'كشف لون الخلفية تلقائياً' : 'Auto-detect key color'}</span>
                  </label>
                  <input
                    type="color"
                    value={
                      config.chroma.autoDetectColor && detectedBg
                        ? detectedBg.hex
                        : config.chroma.keyColorHex
                    }
                    onChange={(e) =>
                      handleReapplyDetection({
                        chroma: {
                          ...config.chroma,
                          autoDetectColor: false,
                          keyColorHex: e.target.value,
                        },
                      })
                    }
                    style={{
                      width: '28px',
                      height: '24px',
                      border: '1px solid #475569',
                      borderRadius: '6px',
                      padding: 0,
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: '#94a3b8',
                    }}
                  >
                    <span>{isAr ? 'حساسية إزالة الخلفية (Similarity)' : 'Chroma Similarity'}</span>
                    <span style={{ color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                      {config.chroma.similarity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={85}
                    value={config.chroma.similarity}
                    onChange={(e) =>
                      handleReapplyDetection({
                        chroma: { ...config.chroma, similarity: Number(e.target.value) },
                      })
                    }
                    style={{ width: '100%', accentColor: '#10b981' }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: '#94a3b8',
                    }}
                  >
                    <span>{isAr ? 'نعومة الحواف ومنع التكسير (Smoothness)' : 'Edge Smoothness'}</span>
                    <span style={{ color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                      {config.chroma.smoothness}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={config.chroma.smoothness}
                    onChange={(e) =>
                      handleReapplyDetection({
                        chroma: { ...config.chroma, smoothness: Number(e.target.value) },
                      })
                    }
                    style={{ width: '100%', accentColor: '#10b981' }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: '#94a3b8',
                    }}
                  >
                    <span>{isAr ? 'إزالة انعكاس اللون الأخضر (Spill Suppression)' : 'Green Spill Removal'}</span>
                    <span style={{ color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                      {config.chroma.despill}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={config.chroma.despill}
                    onChange={(e) =>
                      handleReapplyDetection({
                        chroma: { ...config.chroma, despill: Number(e.target.value) },
                      })
                    }
                    style={{ width: '100%', accentColor: '#10b981' }}
                  />
                </div>
              </div>
            )}
          </div>

          <hr style={{ border: 0, borderTop: '1px solid #22263a', margin: 0 }} />

          {/* 3. Output Size & Export Format Selection */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#e2e8f0', marginBottom: '8px' }}>
              {isAr ? '3. مقاس وصيغة تصدير كل عنصر' : '3. Element Size & Export Format'}
            </div>

            <label style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8', marginBottom: '4px' }}>
              {isAr ? 'أبعاد الملف المستخرج لكل عنصر:' : 'Output Dimensions per Element:'}
            </label>
            <select
              value={config.sizeMode}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  sizeMode: e.target.value as SmartSplitterConfig['sizeMode'],
                }))
              }
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid #2e344e',
                background: '#161a2b',
                color: '#f8fafc',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '10px',
              }}
            >
              <option value="auto_tight">
                {isAr ? 'المقاس الأصلي الدقيق لكل عنصر (Auto Tight)' : 'Exact Cropped Bounds (Auto Tight)'}
              </option>
              <option value="square_512">
                {isAr ? 'مربع قياسي موحد 512×512 (Square 512px)' : 'Unified Square 512×512 px'}
              </option>
              <option value="square_300">
                {isAr ? 'مربع ملصقات موحد 300×300 (Square 300px)' : 'Sticker Square 300×300 px'}
              </option>
              <option value="custom_unified">
                {isAr ? 'مقاس مخصص موحد (Custom W × H)' : 'Custom Unified Size (W × H)'}
              </option>
            </select>

            {config.sizeMode === 'custom_unified' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  marginBottom: '10px',
                }}
              >
                <input
                  type="number"
                  min={32}
                  max={2048}
                  value={config.unifiedWidth}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, unifiedWidth: Number(e.target.value) || 512 }))
                  }
                  placeholder="W"
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: '1px solid #2e344e',
                    background: '#090b12',
                    color: '#fff',
                  }}
                />
                <input
                  type="number"
                  min={32}
                  max={2048}
                  value={config.unifiedHeight}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, unifiedHeight: Number(e.target.value) || 512 }))
                  }
                  placeholder="H"
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: '1px solid #2e344e',
                    background: '#090b12',
                    color: '#fff',
                  }}
                />
              </div>
            )}

            <label style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8', marginBottom: '4px' }}>
              {isAr ? 'اختر الصيغة المطلوبة للتصدير:' : 'Target Export Format:'}
            </label>
            <select
              id="smartSplitFormatSelect"
              aria-label={isAr ? 'اختر الصيغة المطلوبة للتصدير' : 'Target Export Format'}
              value={config.exportFormat}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  exportFormat: e.target.value as SmartElementExportFormat,
                }))
              }
              style={{
                width: '100%',
                padding: '9px 10px',
                borderRadius: '8px',
                border: '1px solid #10b981',
                background: '#161a2b',
                color: '#ecfdf5',
                fontSize: '12.5px',
                fontWeight: 800,
                marginBottom: '12px',
              }}
            >
              {SMART_EXPORT_FORMATS.map((fmt) => (
                <option key={fmt.id} value={fmt.id}>
                  {isAr ? fmt.labelAr : fmt.labelEn}
                </option>
              ))}
            </select>

            <button
              type="button"
              id="exportAllSmartSplitZipBtn"
              disabled={isProcessing || selectedCount === 0}
              onClick={handleExportAllSelectedAsZip}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid #10b981',
                background: '#059669',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 800,
                cursor: isProcessing || selectedCount === 0 ? 'not-allowed' : 'pointer',
                opacity: isProcessing || selectedCount === 0 ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>📦</span>
              <span>
                {isAr
                  ? `تصدير كل عنصر في ملف مستقل (${selectedCount} ملف .${activeFormatMeta.ext} داخل ZIP)`
                  : `Export All Selected as Standalone .${activeFormatMeta.ext} Files (ZIP)`}
              </span>
            </button>
          </div>
        </aside>

        {/* RIGHT MAIN AREA: Source Video Overview + Selected Inspector + All Extracted Elements Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {regions.length === 0 ? (
            <div
              style={{
                background: '#111422',
                border: '1px dashed #2e344e',
                borderRadius: '14px',
                padding: '48px 24px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <div style={{ fontSize: '42px' }}>🎬✂️</div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
                {isAr
                  ? 'ابدأ برفع فيديو يحتوي على عدة عناصر أو جرب الفيديو المرفق بضغطة واحدة'
                  : 'Upload a Multi-Element Video or Try the Attached 24-Sticker Sample Video'}
              </h3>
              <p style={{ margin: 0, maxWidth: '560px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>
                {isAr
                  ? 'سيقوم النظام تلقائياً بتحليل إطارات الفيديو، إزالة الخلفية الخضراء أو الملونة بدقة احترافية، تحديد كل شخصية أو ملصق متحرك على حدة، وإتاحة معاينته وتصديره كملف مستقل لأي صيغة تريدها.'
                  : 'The engine automatically decodes frames, removes chroma backgrounds, isolates every animated sticker into its own bounding region, and lets you export each item individually.'}
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '11px 22px',
                    borderRadius: '10px',
                    border: '1px solid #10b981',
                    background: '#059669',
                    color: '#fff',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  📹 {isAr ? 'اختيار فيديو من جهازك' : 'Select Video File'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    decodeMediaSourceAndSplit(
                      SAMPLE_GREEN_SCREEN_VIDEO_URL,
                      'ملصقات_خليجية_متحركة_24_عنصر.mp4'
                    )
                  }
                  style={{
                    padding: '11px 22px',
                    borderRadius: '10px',
                    border: '1px solid #f59e0b',
                    background: 'rgba(245, 158, 11, 0.16)',
                    color: '#fde047',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  🎬 {isAr ? 'تحميل وتجربة الفيديو المرفق (24 ملصق)' : 'Load Sample 24-Sticker Video'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* TOP ROW: Source Video Bounding-Box Map + Selected Element Live Inspector */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '16px',
                }}
              >
                {/* Card A: Full Video Map with Clickable Detected Boxes */}
                <div
                  style={{
                    background: '#111422',
                    border: '1px solid #22263a',
                    borderRadius: '14px',
                    padding: '14px',
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
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#e2e8f0' }}>
                      {isAr
                        ? `خريطة القص الذكي للفيديو (${sourceDimensions.w}×${sourceDimensions.h}px)`
                        : `Smart Detection Map (${sourceDimensions.w}×${sourceDimensions.h}px)`}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label
                        style={{
                          fontSize: '11.5px',
                          color: '#94a3b8',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={showOverlayBoxes}
                          onChange={(e) => setShowOverlayBoxes(e.target.checked)}
                        />
                        <span>{isAr ? 'إظهار حدود القص' : 'Show Boxes'}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsPlaying((p) => !p)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid #2e344e',
                          background: '#161a2b',
                          color: '#e2e8f0',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {isPlaying ? (isAr ? '⏸ إيقاف مؤقت' : '⏸ Pause') : isAr ? '▶ تشغيل' : '▶ Play'}
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      ...getBgStyle(previewBg),
                      borderRadius: '10px',
                      border: '1px solid #23273b',
                      height: '290px',
                      display: 'grid',
                      placeItems: 'center',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <canvas
                      ref={overviewCanvasRef}
                      onClick={(e) => {
                        const c = overviewCanvasRef.current;
                        if (!c) return;
                        const rect = c.getBoundingClientRect();
                        const scaleX = c.width / Math.max(1, rect.width);
                        const scaleY = c.height / Math.max(1, rect.height);
                        const clickX = (e.clientX - rect.left) * scaleX;
                        const clickY = (e.clientY - rect.top) * scaleY;
                        const hit = regions.find(
                          (r) =>
                            clickX >= r.x &&
                            clickX <= r.x + r.width &&
                            clickY >= r.y &&
                            clickY <= r.y + r.height
                        );
                        if (hit) {
                          setSelectedRegionId(hit.id);
                        }
                      }}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '280px',
                        objectFit: 'contain',
                        cursor: 'pointer',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11.5px',
                      color: '#94a3b8',
                    }}
                  >
                    <span>
                      {isAr
                        ? '💡 اضغط على أي ملصق داخل الفيديو لمعاينته وتخصيصه منفرداً'
                        : '💡 Click any sticker box in the video to inspect it'}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {isAr ? 'الإطار:' : 'Frame:'} {currentFrameIdx + 1}/{frameCount}
                    </span>
                  </div>
                </div>

                {/* Card B: Selected Single Element Live Stage & Fine-Tuning Inspector */}
                {selectedRegion && (
                  <div
                    style={{
                      background: '#111422',
                      border: '1px solid #22263a',
                      borderRadius: '14px',
                      padding: '14px',
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
                        gap: '8px',
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#fde047' }}>
                        {isAr
                          ? `معاينة العنصر المحدد #${selectedRegion.index}: ${selectedRegion.nameAr}`
                          : `Selected Element #${selectedRegion.index}: ${selectedRegion.nameEn}`}
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {(['checker', 'dark', 'white', 'green'] as const).map((bgKey) => (
                          <button
                            key={bgKey}
                            type="button"
                            onClick={() => setPreviewBg(bgKey)}
                            style={{
                              padding: '3px 7px',
                              borderRadius: '5px',
                              fontSize: '10.5px',
                              border:
                                previewBg === bgKey ? '1px solid #10b981' : '1px solid #2e344e',
                              background: previewBg === bgKey ? 'rgba(16,185,129,0.2)' : '#161a2b',
                              color: '#e2e8f0',
                              cursor: 'pointer',
                            }}
                          >
                            {bgKey === 'checker'
                              ? isAr
                                ? 'شفاف'
                                : 'Alpha'
                              : bgKey === 'dark'
                                ? isAr
                                  ? 'داكن'
                                  : 'Dark'
                                : bgKey === 'white'
                                  ? isAr
                                    ? 'أبيض'
                                    : 'White'
                                  : isAr
                                    ? 'أخضر'
                                    : 'Green'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '180px minmax(0, 1fr)',
                        gap: '12px',
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          ...getBgStyle(previewBg),
                          borderRadius: '10px',
                          border: '1px solid #2e344e',
                          height: '180px',
                          display: 'grid',
                          placeItems: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        <canvas
                          ref={selectedInspectorCanvasRef}
                          style={{ width: '170px', height: '170px', objectFit: 'contain' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                          {isAr ? 'اسم ملف هذا العنصر عند التصدير:' : 'Element File Name:'}
                          <input
                            type="text"
                            value={isAr ? selectedRegion.nameAr : selectedRegion.nameEn}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRegions((prev) =>
                                prev.map((r) =>
                                  r.id === selectedRegion.id
                                    ? isAr
                                      ? { ...r, nameAr: val }
                                      : { ...r, nameEn: val }
                                    : r
                                )
                              );
                            }}
                            style={{
                              width: '100%',
                              marginTop: '4px',
                              padding: '6px 9px',
                              borderRadius: '7px',
                              border: '1px solid #2e344e',
                              background: '#090b12',
                              color: '#fff',
                              fontSize: '12px',
                              fontWeight: 700,
                              boxSizing: 'border-box',
                            }}
                          />
                        </label>

                        {/* Manual fine-tune X, Y, W, H for the selected element */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                          {(
                            [
                              { k: 'x', lbl: 'X' },
                              { k: 'y', lbl: 'Y' },
                              { k: 'width', lbl: 'W' },
                              { k: 'height', lbl: 'H' },
                            ] as const
                          ).map((field) => (
                            <label key={field.k} style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                              {field.lbl}
                              <input
                                type="number"
                                value={selectedRegion[field.k]}
                                onChange={(e) => {
                                  const v = Math.max(0, Number(e.target.value) || 0);
                                  setRegions((prev) =>
                                    prev.map((r) =>
                                      r.id === selectedRegion.id ? { ...r, [field.k]: v } : r
                                    )
                                  );
                                }}
                                style={{
                                  width: '100%',
                                  padding: '4px',
                                  borderRadius: '5px',
                                  border: '1px solid #2e344e',
                                  background: '#090b12',
                                  color: '#e2e8f0',
                                  fontSize: '11px',
                                  fontVariantNumeric: 'tabular-nums',
                                  boxSizing: 'border-box',
                                }}
                              />
                            </label>
                          ))}
                        </div>

                        <button
                          type="button"
                          id="downloadSelectedSingleElementBtn"
                          onClick={() => handleDownloadSingleElement(selectedRegion)}
                          disabled={isProcessing}
                          style={{
                            padding: '9px 12px',
                            borderRadius: '8px',
                            border: '1px solid #10b981',
                            background: '#059669',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          <span>⬇️</span>
                          <span>
                            {isAr
                              ? `تحميل هذا العنصر لوحده (.${activeFormatMeta.ext})`
                              : `Download This Element (.${activeFormatMeta.ext})`}
                          </span>
                        </button>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          {onOpenElementInSvgaEditor && (
                            <button
                              type="button"
                              onClick={() => handleOpenInSvgaEditor(selectedRegion)}
                              disabled={isProcessing}
                              style={{
                                padding: '7px 8px',
                                borderRadius: '7px',
                                border: '1px solid rgba(167, 139, 250, 0.45)',
                                background: 'rgba(124, 92, 255, 0.16)',
                                color: '#ddd6fe',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              ✨ {isAr ? 'فتح في محرر SVGA' : 'Open in SVGA Editor'}
                            </button>
                          )}
                          {onSendElementToConverter && (
                            <button
                              type="button"
                              onClick={() => handleSendToMainConverter(selectedRegion)}
                              disabled={isProcessing}
                              style={{
                                padding: '7px 8px',
                                borderRadius: '7px',
                                border: '1px solid #2e344e',
                                background: '#161a2b',
                                color: '#cbd5e1',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              ⚡ {isAr ? 'إرسال للمحول' : 'Send to Converter'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* BOTTOM SECTION: Grid of All Individual Cropped Elements */}
              <div
                style={{
                  background: '#111422',
                  border: '1px solid #22263a',
                  borderRadius: '14px',
                  padding: '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '14px',
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                      {isAr
                        ? `العناصر المقصوصة المستقلة (${regions.length} عنصر — كل عنصر جاهز كملف لوحده)`
                        : `Isolated Individual Elements (${regions.length} items — each ready as its own file)`}
                    </h3>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {isAr
                        ? `محدد حالياً: ${selectedCount} من ${regions.length} عنصر · الصيغة المختارة: ${activeFormatMeta.badge}`
                        : `Selected: ${selectedCount} of ${regions.length} · Format: ${activeFormatMeta.badge}`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={isAr ? 'بحث برقم أو اسم العنصر...' : 'Search item...'}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid #2e344e',
                        background: '#090b12',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRegions((prev) => prev.map((r) => ({ ...r, selected: true })))
                      }
                      style={{
                        padding: '6px 10px',
                        borderRadius: '7px',
                        border: '1px solid #2e344e',
                        background: '#161a2b',
                        color: '#e2e8f0',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {isAr ? 'تحديد الكل' : 'Select All'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRegions((prev) => prev.map((r) => ({ ...r, selected: false })))
                      }
                      style={{
                        padding: '6px 10px',
                        borderRadius: '7px',
                        border: '1px solid #2e344e',
                        background: '#161a2b',
                        color: '#94a3b8',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {isAr ? 'إلغاء التحديد' : 'Clear'}
                    </button>
                  </div>
                </div>

                {/* Individual Element Cards Grid */}
                <div
                  data-testid="smart-split-elements-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                    gap: '12px',
                  }}
                >
                  {filteredRegions.map((reg) => {
                    const isActive = reg.id === selectedRegionId;
                    return (
                      <div
                        key={reg.id}
                        data-testid={`split-item-card-${reg.index}`}
                        onClick={() => setSelectedRegionId(reg.id)}
                        style={{
                          background: isActive ? '#171c30' : '#141829',
                          border: isActive
                            ? '1.5px solid #f59e0b'
                            : reg.selected
                              ? '1px solid rgba(16, 185, 129, 0.4)'
                              : '1px solid #22263a',
                          borderRadius: '12px',
                          padding: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          cursor: 'pointer',
                          transition: 'border-color 0.15s ease',
                        }}
                      >
                        {/* Card Top Header */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '6px',
                          }}
                        >
                          <label
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              fontWeight: 800,
                              color: '#f8fafc',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={reg.selected}
                              onChange={(e) =>
                                setRegions((prev) =>
                                  prev.map((item) =>
                                    item.id === reg.id
                                      ? { ...item, selected: e.target.checked }
                                      : item
                                  )
                                )
                              }
                            />
                            <span style={{ fontVariantNumeric: 'tabular-nums', color: '#34d399' }}>
                              #{reg.index}
                            </span>
                          </label>
                          <span
                            style={{
                              fontSize: '10.5px',
                              color: '#94a3b8',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {reg.width}×{reg.height}
                          </span>
                        </div>

                        {/* Individual Cropped Element Live Canvas */}
                        <div
                          style={{
                            ...getBgStyle(previewBg),
                            borderRadius: '8px',
                            border: '1px solid #23273b',
                            height: '130px',
                            display: 'grid',
                            placeItems: 'center',
                            overflow: 'hidden',
                          }}
                        >
                          <canvas
                            width={130}
                            height={130}
                            ref={(el) => {
                              if (el) itemCanvasMapRef.current.set(reg.id, el);
                              else itemCanvasMapRef.current.delete(reg.id);
                            }}
                            style={{ width: '124px', height: '124px', objectFit: 'contain' }}
                          />
                        </div>

                        {/* Element Name */}
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#e2e8f0',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {isAr ? reg.nameAr : reg.nameEn}
                        </div>

                        {/* Card Individual Export Buttons */}
                        <div
                          style={{ display: 'flex', gap: '5px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleElement(reg)}
                            disabled={isProcessing}
                            style={{
                              flex: 1,
                              padding: '6px 8px',
                              borderRadius: '7px',
                              border: '1px solid rgba(16, 185, 129, 0.5)',
                              background: 'rgba(16, 185, 129, 0.16)',
                              color: '#6ee7b7',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            ⬇️ .{activeFormatMeta.ext}
                          </button>
                          {onOpenElementInSvgaEditor && (
                            <button
                              type="button"
                              title={isAr ? 'فتح هذا العنصر في محرر SVGA' : 'Open in SVGA Editor'}
                              onClick={() => handleOpenInSvgaEditor(reg)}
                              disabled={isProcessing}
                              style={{
                                padding: '6px 8px',
                                borderRadius: '7px',
                                border: '1px solid rgba(167, 139, 250, 0.4)',
                                background: 'rgba(124, 92, 255, 0.15)',
                                color: '#ddd6fe',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              SVGA
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
