import React, { useEffect, useRef, useState, useCallback } from 'react';
import JSZip from 'jszip';
import {
  GIFT_SHAPES,
  GiftShapeId,
  GiftExportFormat,
  GiftSizeMode,
  GiftImageFitMode,
  GiftApplyScope,
  GiftOverlayConfig,
  GiftCreatorGlobalSettings,
  GiftItemAdjustment,
  DEFAULT_GIFT_CREATOR_SETTINGS,
  DEFAULT_GIFT_OVERLAY_CONFIG,
  getGiftShapeMetadata,
  resolveEffectiveItemSettings,
  computeOutputDimensions,
  renderGiftImageToCanvas,
  generatePresetOverlayFrameDataUrl,
  buildExportFileName,
} from '../utils/giftImageCreator';
import { FeatureFreeAttemptsStatus } from '../utils/platformStore';

export interface GiftImageItem {
  id: string;
  file: File;
  name: string;
  url: string;
  imgElement: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  selected: boolean;
  adjustment: GiftItemAdjustment;
}

interface GiftImageCreatorProps {
  isAr: boolean;
  attemptStatus?: FeatureFreeAttemptsStatus;
  isPro?: boolean;
  onRequirePro?: (key?: string) => void;
  onConsumeAttempt?: () => { success: boolean; remainingAttempts?: number };
}

export default function GiftImageCreator({
  isAr,
  attemptStatus,
  isPro = false,
  onRequirePro,
  onConsumeAttempt,
}: GiftImageCreatorProps) {
  const [items, setItems] = useState<GiftImageItem[]>([]);
  const [settings, setSettings] = useState<GiftCreatorGlobalSettings>(DEFAULT_GIFT_CREATOR_SETTINGS);
  const [overlay, setOverlay] = useState<GiftOverlayConfig>(DEFAULT_GIFT_OVERLAY_CONFIG);
  const [overlayImgEl, setOverlayImgEl] = useState<HTMLImageElement | null>(null);

  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewBg, setPreviewBg] = useState<'checker' | 'dark' | 'light' | 'emerald'>('checker');
  const [dragTargetMode, setDragTargetMode] = useState<'image' | 'overlay'>('image');

  // Batch processing & export progress states
  const [batchProgress, setBatchProgress] = useState<{
    active: boolean;
    processed: number;
    total: number;
    label: string;
  }>({
    active: false,
    processed: 0,
    total: 0,
    label: '',
  });

  const [renderedCount, setRenderedCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetIdRef = useRef<string | null>(null);
  const overlayInputRef = useRef<HTMLInputElement | null>(null);
  const inspectorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardCanvasMapRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const panDragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    initialOffsetX: number;
    initialOffsetY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    initialOffsetX: 0,
    initialOffsetY: 0,
  });

  const showToast = useCallback((msg: string) => {
    setStatusMessage(msg);
    const globalToast = document.getElementById('toast');
    if (globalToast) {
      globalToast.textContent = msg;
      globalToast.classList.add('on');
      setTimeout(() => globalToast.classList.remove('on'), 2400);
    }
  }, []);

  // Load an image file into an HTMLImageElement
  const loadImageFile = (file: File): Promise<{ img: HTMLImageElement; url: string }> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to decode image: ${file.name}`));
      };
      img.src = url;
    });
  };

  // Batch upload multiple image files in chunks so the UI remains responsive
  const handleAddFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const rawFiles = Array.from(fileList || []).filter(
        (f) =>
          f.type.startsWith('image/') ||
          /\.(png|jpe?g|webp|gif|bmp|svg|avif|ico)$/i.test(f.name || '')
      );
      if (rawFiles.length === 0) {
        showToast(
          isAr
            ? 'يرجى اختيار ملفات صور صالحة (PNG, JPG, WEBP, GIF, SVG)'
            : 'Please select valid image files (PNG, JPG, WEBP, GIF, SVG)'
        );
        return;
      }

      setBatchProgress({
        active: true,
        processed: 0,
        total: rawFiles.length,
        label: isAr ? 'جارٍ رفع وتجهيز الصور...' : 'Loading and preparing images...',
      });

      const newItems: GiftImageItem[] = [];
      const chunkSize = 6;

      for (let i = 0; i < rawFiles.length; i += chunkSize) {
        const slice = rawFiles.slice(i, i + chunkSize);
        const loadedChunk = await Promise.all(
          slice.map(async (file, idx) => {
            try {
              const { img, url } = await loadImageFile(file);
              return {
                id: `gift_img_${Date.now()}_${i + idx}_${Math.random().toString(36).slice(2, 7)}`,
                file,
                name: file.name,
                url,
                imgElement: img,
                naturalWidth: img.naturalWidth || img.width || 512,
                naturalHeight: img.naturalHeight || img.height || 512,
                selected: true,
                adjustment: {},
              } as GiftImageItem;
            } catch {
              return null;
            }
          })
        );

        for (const it of loadedChunk) {
          if (it) newItems.push(it);
        }

        setBatchProgress({
          active: true,
          processed: Math.min(rawFiles.length, i + slice.length),
          total: rawFiles.length,
          label: isAr ? 'جارٍ رفع وتجهيز الصور...' : 'Loading and preparing images...',
        });

        await new Promise((r) => setTimeout(r, 8));
      }

      setBatchProgress({ active: false, processed: 0, total: 0, label: '' });

      if (newItems.length > 0) {
        setItems((prev) => {
          const combined = [...prev, ...newItems];
          return combined;
        });
        setActiveItemId((prevId) => prevId || newItems[0].id);
        showToast(
          isAr
            ? `تم رفع ${newItems.length} صورة بنجاح وجاهزة للتشكيل`
            : `Successfully uploaded ${newItems.length} images`
        );
      }
    },
    [isAr, showToast]
  );

  // Replace a single image while keeping its position and adjustments
  const handleReplaceSingleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const targetId = replaceTargetIdRef.current;
    if (!file || !targetId) return;

    try {
      const { img, url } = await loadImageFile(file);
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== targetId) return item;
          URL.revokeObjectURL(item.url);
          return {
            ...item,
            file,
            name: file.name,
            url,
            imgElement: img,
            naturalWidth: img.naturalWidth || img.width || 512,
            naturalHeight: img.naturalHeight || img.height || 512,
          };
        })
      );
      showToast(isAr ? `تم استبدال الصورة بـ ${file.name}` : `Replaced image with ${file.name}`);
    } catch {
      showToast(isAr ? 'تعذر قراءة الصورة البديلة' : 'Failed to load replacement image');
    }
  };

  // Upload shared overlay layer image
  const handleUploadOverlayFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const { img, url } = await loadImageFile(file);
      if (overlay.imageUrl && overlay.imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(overlay.imageUrl);
      }
      setOverlayImgEl(img);
      setOverlay((prev) => ({
        ...prev,
        enabled: true,
        imageUrl: url,
        fileName: file.name,
        naturalWidth: img.naturalWidth || img.width || 512,
        naturalHeight: img.naturalHeight || img.height || 512,
      }));
      showToast(
        isAr
          ? `تم تفعيل الطبقة المشتركة: ${file.name}`
          : `Activated shared overlay layer: ${file.name}`
      );
    } catch {
      showToast(isAr ? 'تعذر تحميل صورة الطبقة' : 'Failed to load overlay image');
    }
  };

  // Apply a built-in transparent PNG frame preset
  const handleApplyOverlayPreset = (preset: 'gold_ring' | 'neon_hex' | 'crystal_corner') => {
    const dataUrl = generatePresetOverlayFrameDataUrl(preset, 512);
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      setOverlayImgEl(img);
      setOverlay((prev) => ({
        ...prev,
        enabled: true,
        imageUrl: dataUrl,
        fileName:
          preset === 'gold_ring'
            ? 'royal_gold_frame.png'
            : preset === 'neon_hex'
              ? 'neon_hexagon_frame.png'
              : 'crystal_rounded_frame.png',
        naturalWidth: 512,
        naturalHeight: 512,
      }));
      showToast(
        isAr ? 'تم تطبيق الإطار الشفاف الجاهز على الصور' : 'Applied preset transparent frame'
      );
    };
    img.src = dataUrl;
  };

  const handleRemoveOverlay = () => {
    if (overlay.imageUrl && overlay.imageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(overlay.imageUrl);
    }
    setOverlayImgEl(null);
    setOverlay(DEFAULT_GIFT_OVERLAY_CONFIG);
    setDragTargetMode('image');
    showToast(isAr ? 'تم حذف الطبقة المشتركة' : 'Removed shared overlay layer');
  };

  // Generate sample demo gift images so user can test immediately if desired
  const handleLoadDemoImages = async () => {
    const demoSpecs = [
      {
        name: 'royal_crown_gift.png',
        bg1: '#4f46e5',
        bg2: '#ec4899',
        accent: '#fde047',
        symbol: '👑',
      },
      {
        name: 'emerald_diamond_gift.png',
        bg1: '#059669',
        bg2: '#0284c7',
        accent: '#a7f3d0',
        symbol: '💎',
      },
      {
        name: 'golden_lion_gift.png',
        bg1: '#b45309',
        bg2: '#7c2d12',
        accent: '#fef08a',
        symbol: '🦁',
      },
      {
        name: 'cyber_rocket_gift.png',
        bg1: '#6d28d9',
        bg2: '#1e1b4b',
        accent: '#38bdf8',
        symbol: '🚀',
      },
    ];

    const files: File[] = [];
    for (const spec of demoSpecs) {
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 512;
      const ctx = cv.getContext('2d');
      if (ctx) {
        const grad = ctx.createRadialGradient(256, 220, 30, 256, 256, 260);
        grad.addColorStop(0, spec.bg1);
        grad.addColorStop(1, spec.bg2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);

        // Decorative concentric rings
        ctx.strokeStyle = spec.accent;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(256, 256, 190, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.font = '150px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(spec.symbol, 256, 268);
      }
      const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
      if (blob) {
        files.push(new File([blob], spec.name, { type: 'image/png' }));
      }
    }
    if (files.length > 0) {
      await handleAddFiles(files);
    }
  };

  // Apply shape selection respecting applyScope ('all' vs 'selected')
  const handleSelectShape = (shapeId: GiftShapeId) => {
    const meta = getGiftShapeMetadata(shapeId);
    setSettings((prev) => {
      const next = { ...prev, shapeId };
      if (prev.lockAspectToShape) {
        next.height = Math.max(32, Math.round(prev.width / meta.recommendedAspect));
      }
      return next;
    });

    setItems((prev) =>
      prev.map((item) => {
        if (settings.applyScope === 'selected' && !item.selected) {
          // Freeze non-selected items' current shape so only selected items change
          return {
            ...item,
            adjustment: {
              ...item.adjustment,
              shapeId: item.adjustment.shapeId ?? settings.shapeId,
            },
          };
        }
        // Clear item shape override or set to new shapeId
        const nextAdj = { ...item.adjustment };
        if (settings.applyScope === 'selected') {
          nextAdj.shapeId = shapeId;
        } else {
          delete nextAdj.shapeId;
        }
        return { ...item, adjustment: nextAdj };
      })
    );
  };

  // Apply soft transparent edge feathering (تنعيم الحواف وجعلها متدرجة الشفافية غير حادة)
  const handleSetEdgeSoftness = (softnessPx: number, showNotification = false) => {
    const clamped = Math.max(0, Math.min(60, Math.round(Number(softnessPx) || 0)));
    setSettings((prev) => ({ ...prev, edgeSoftness: clamped }));
    setItems((prev) =>
      prev.map((item) => {
        if (settings.applyScope === 'selected' && !item.selected) {
          return {
            ...item,
            adjustment: {
              ...item.adjustment,
              edgeSoftness: item.adjustment.edgeSoftness ?? settings.edgeSoftness,
            },
          };
        }
        const nextAdj = { ...item.adjustment };
        if (settings.applyScope === 'selected') {
          nextAdj.edgeSoftness = clamped;
        } else {
          delete nextAdj.edgeSoftness;
        }
        return { ...item, adjustment: nextAdj };
      })
    );
    if (showNotification) {
      showToast(
        clamped === 0
          ? isAr
            ? 'تم ضبط الحواف إلى حواف حادة قياسية (0px)'
            : 'Set edges to sharp standard (0px)'
          : isAr
            ? `تم تفعيل تنعيم الحواف الشفافة الغير حادة (${clamped}px)`
            : `Soft transparent edge feather set to ${clamped}px`
      );
    }
  };

  // Apply current global settings to all or selected items explicitly
  const handleApplyAdjustmentsToScope = (scope: GiftApplyScope) => {
    setItems((prev) =>
      prev.map((item) => {
        if (scope === 'selected' && !item.selected) return item;
        return {
          ...item,
          adjustment:
            scope === 'all'
              ? {}
              : {
                  shapeId: settings.shapeId,
                  cornerRadius: settings.cornerRadius,
                  transparentPadding: settings.transparentPadding,
                  edgeSoftness: settings.edgeSoftness,
                  imageFit: settings.imageFit,
                  imageScale: settings.imageScale,
                  imageOffsetX: settings.imageOffsetX,
                  imageOffsetY: settings.imageOffsetY,
                },
        };
      })
    );
    showToast(
      scope === 'all'
        ? isAr
          ? 'تم تعميم الشكل والمقاسات وتنعيم الحواف على جميع الصور المرفوعة'
          : 'Applied shape and settings to all uploaded images'
        : isAr
          ? 'تم تطبيق التعديلات على الصور المحددة فقط'
          : 'Applied settings to selected images only'
    );
  };

  const activeItem = items.find((i) => i.id === activeItemId) || items[0] || null;

  // Chunked rendering of all preview cards + active inspector canvas
  useEffect(() => {
    let cancelled = false;

    const renderAllInChunks = async () => {
      // 1. Immediately render the active inspector canvas for zero-latency feedback
      if (activeItem && inspectorCanvasRef.current) {
        renderGiftImageToCanvas(inspectorCanvasRef.current, activeItem.imgElement, settings, {
          itemOverride: activeItem.adjustment,
          isItemSelected: activeItem.selected,
          overlayConfig: overlay,
          overlayImg: overlayImgEl,
          forExportFormat: settings.exportFormat,
          maxPreviewDimension: 640,
        });
      }

      if (items.length === 0) {
        setRenderedCount(0);
        return;
      }

      const chunkSize = 8;
      let done = 0;
      for (let i = 0; i < items.length; i += chunkSize) {
        if (cancelled) return;
        const slice = items.slice(i, i + chunkSize);
        for (const item of slice) {
          const cardCv = cardCanvasMapRef.current.get(item.id);
          if (cardCv) {
            renderGiftImageToCanvas(cardCv, item.imgElement, settings, {
              itemOverride: item.adjustment,
              isItemSelected: item.selected,
              overlayConfig: overlay,
              overlayImg: overlayImgEl,
              forExportFormat: settings.exportFormat,
              maxPreviewDimension: 260,
            });
          }
          done++;
        }
        setRenderedCount(done);
        if (i + chunkSize < items.length) {
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
      }
    };

    renderAllInChunks();

    return () => {
      cancelled = true;
    };
  }, [items, settings, overlay, overlayImgEl, activeItem]);

  // Interactive mouse drag on the inspector stage to pan either the image inside the shape or the shared overlay
  const handleStagePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeItem) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (dragTargetMode === 'overlay' && overlay.enabled) {
      panDragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        initialOffsetX: overlay.offsetX,
        initialOffsetY: overlay.offsetY,
      };
    } else {
      const eff = resolveEffectiveItemSettings(settings, activeItem.adjustment);
      panDragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        initialOffsetX: eff.imageOffsetX,
        initialOffsetY: eff.imageOffsetY,
      };
    }
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!panDragRef.current.dragging || !activeItem) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dxPercent = ((e.clientX - panDragRef.current.startX) / Math.max(100, rect.width)) * 140;
    const dyPercent = ((e.clientY - panDragRef.current.startY) / Math.max(100, rect.height)) * 140;

    const nextX = Math.max(
      -100,
      Math.min(100, Math.round(panDragRef.current.initialOffsetX + dxPercent))
    );
    const nextY = Math.max(
      -100,
      Math.min(100, Math.round(panDragRef.current.initialOffsetY + dyPercent))
    );

    if (dragTargetMode === 'overlay' && overlay.enabled) {
      setOverlay((prev) => ({ ...prev, offsetX: nextX, offsetY: nextY }));
    } else if (settings.applyScope === 'all') {
      setSettings((prev) => ({ ...prev, imageOffsetX: nextX, imageOffsetY: nextY }));
    } else {
      setItems((prev) =>
        prev.map((it) =>
          it.id === activeItem.id || (settings.applyScope === 'selected' && it.selected)
            ? {
                ...it,
                adjustment: { ...it.adjustment, imageOffsetX: nextX, imageOffsetY: nextY },
              }
            : it
        )
      );
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panDragRef.current.dragging) {
      panDragRef.current.dragging = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Render full-resolution export Blob for a single GiftImageItem
  const renderItemToBlob = async (item: GiftImageItem): Promise<Blob | null> => {
    const exportCv = document.createElement('canvas');
    renderGiftImageToCanvas(exportCv, item.imgElement, settings, {
      itemOverride: item.adjustment,
      isItemSelected: item.selected,
      overlayConfig: overlay,
      overlayImg: overlayImgEl,
      forExportFormat: settings.exportFormat,
    });

    const mimeType =
      settings.exportFormat === 'jpg'
        ? 'image/jpeg'
        : settings.exportFormat === 'webp'
          ? 'image/webp'
          : 'image/png';
    const qualityArg =
      settings.exportFormat === 'png'
        ? undefined
        : Math.max(0.1, Math.min(1, settings.exportQuality / 100));

    return new Promise<Blob | null>((resolve) => {
      exportCv.toBlob((b) => resolve(b), mimeType, qualityArg);
    });
  };

  // Download helper
  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const checkExportPermission = (): boolean => {
    let res: any = null;
    try {
      if (typeof (window as any).__checkFeatureProAccess === 'function') {
        res = (window as any).__checkFeatureProAccess('gift_image', 'export');
      }
    } catch (e) {}

    if (res) {
      if (!res.allowed) {
        if (typeof onRequirePro === 'function') {
          onRequirePro('gift_image');
        } else if (typeof (window as any).__openProModal === 'function') {
          (window as any).__openProModal('gift_image');
        }
        showToast(
          isAr
            ? '🔒 يتطلب تحميل وتصدير صور الهدايا الاشتراك في باقة برو (استنفدت المحاولات المجانية)'
            : '🔒 Pro Membership required for export (Free trials exhausted)'
        );
        return false;
      }
      return true;
    }

    if (attemptStatus && attemptStatus.rule.isPro) {
      if (isPro) return true;
      if (attemptStatus.remainingAttempts > 0) return true;
      if (typeof onRequirePro === 'function') {
        onRequirePro('gift_image');
      }
      return false;
    }

    return true;
  };

  const consumeAttemptIfApplicable = () => {
    try {
      let consumeRes: any = null;
      if (typeof onConsumeAttempt === 'function') {
        consumeRes = onConsumeAttempt();
      } else if (typeof (window as any).__consumeFeatureAttempt === 'function') {
        consumeRes = (window as any).__consumeFeatureAttempt('gift_image');
      }
      if (consumeRes && consumeRes.success && consumeRes.remainingAttempts !== undefined) {
        showToast(
          isAr
            ? `🎉 تم استخدام محاولة مجانية (المتبقي لديك: ${consumeRes.remainingAttempts} محاولة)`
            : `🎉 Free trial attempt used (${consumeRes.remainingAttempts} left)`
        );
      }
    } catch (e) {}
  };

  // Export a single image immediately
  const handleDownloadSingleItem = async (item: GiftImageItem) => {
    if (!checkExportPermission()) return;
    const blob = await renderItemToBlob(item);
    if (!blob) {
      showToast(isAr ? 'تعذر تصدير الصورة' : 'Failed to export image');
      return;
    }
    const used = new Set<string>();
    const fileName = buildExportFileName(item.name, settings.exportFormat, used);
    triggerBlobDownload(blob, fileName);
    consumeAttemptIfApplicable();
    showToast(isAr ? `تم تنزيل: ${fileName}` : `Downloaded: ${fileName}`);
  };

  // Batch export all or selected images into a single organized ZIP archive
  const handleBatchExportZip = async (onlySelected: boolean) => {
    const targetList = onlySelected ? items.filter((i) => i.selected) : items;
    if (targetList.length === 0) {
      showToast(
        isAr
          ? 'يرجى رفع أو تحديد صورة واحدة على الأقل للتصدير'
          : 'Please upload or select at least one image to export'
      );
      return;
    }

    if (!checkExportPermission()) return;

    if (targetList.length === 1) {
      await handleDownloadSingleItem(targetList[0]);
      return;
    }

    setBatchProgress({
      active: true,
      processed: 0,
      total: targetList.length,
      label: isAr
        ? 'جارٍ معالجة الصور بأقنعة الشفافية وتجهيز ملف ZIP...'
        : 'Processing alpha-masked gift images into ZIP...',
    });

    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const chunkSize = 5;

      for (let i = 0; i < targetList.length; i += chunkSize) {
        const slice = targetList.slice(i, i + chunkSize);
        for (let j = 0; j < slice.length; j++) {
          const item = slice[j];
          const blob = await renderItemToBlob(item);
          if (blob) {
            const fname = buildExportFileName(item.name, settings.exportFormat, usedNames);
            zip.file(fname, blob);
          }
          setBatchProgress({
            active: true,
            processed: i + j + 1,
            total: targetList.length,
            label: isAr
              ? `تمت معالجة ${i + j + 1} من ${targetList.length} (المتبقي ${targetList.length - (i + j + 1)})`
              : `Processed ${i + j + 1} of ${targetList.length} (${targetList.length - (i + j + 1)} remaining)`,
          });
        }
        // Yield between chunks to keep UI smooth and prevent memory spikes
        await new Promise((r) => setTimeout(r, 12));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      // Expose last exported zip for deterministic automated verification if needed
      (window as any).__lastGiftImagesZip = {
        name: `Gift_Images_${settings.shapeId}_${targetList.length}.zip`,
        blob: zipBlob,
      };
      triggerBlobDownload(zipBlob, `Gift_Images_${settings.shapeId}_${targetList.length}.zip`);
      consumeAttemptIfApplicable();
      showToast(
        isAr
          ? `تم تصدير وتنزيل ${targetList.length} صورة هدية في ملف ZIP بنجاح!`
          : `Successfully exported ${targetList.length} gift images as ZIP!`
      );
    } catch (err: any) {
      showToast(
        isAr
          ? `حدث خطأ أثناء التصدير الجماعي: ${err?.message || err}`
          : `Batch export error: ${err?.message || err}`
      );
    } finally {
      setBatchProgress({ active: false, processed: 0, total: 0, label: '' });
    }
  };

  // Selection & ordering helpers
  const selectedCount = items.filter((i) => i.selected).length;

  const handleSelectAll = () => {
    setItems((prev) => prev.map((i) => ({ ...i, selected: true })));
  };

  const handleDeselectAll = () => {
    setItems((prev) => prev.map((i) => ({ ...i, selected: false })));
  };

  const handleDeleteSelected = () => {
    setItems((prev) => {
      prev.filter((i) => i.selected).forEach((i) => URL.revokeObjectURL(i.url));
      const remaining = prev.filter((i) => !i.selected);
      if (remaining.length > 0 && !remaining.some((r) => r.id === activeItemId)) {
        setActiveItemId(remaining[0].id);
      } else if (remaining.length === 0) {
        setActiveItemId(null);
      }
      return remaining;
    });
  };

  const handleDeleteSingle = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      const remaining = prev.filter((i) => i.id !== id);
      if (activeItemId === id) {
        setActiveItemId(remaining[0]?.id || null);
      }
      return remaining;
    });
  };

  const handleMoveItem = (index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const targetIdx = index + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIdx, 0, moved);
      return copy;
    });
  };

  const currentShapeMeta = getGiftShapeMetadata(settings.shapeId);
  const previewBgStyle =
    previewBg === 'checker'
      ? {
          backgroundImage:
            'repeating-conic-gradient(#1b1f32 0% 25%, #101320 0% 50%)',
          backgroundSize: '16px 16px',
        }
      : previewBg === 'dark'
        ? { background: '#070911' }
        : previewBg === 'light'
          ? { background: '#f1f5f9' }
          : { background: '#064e3b' };

  return (
    <div
      id="giftImageCreatorRoot"
      dir={isAr ? 'rtl' : 'ltr'}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget === e.target) setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer?.files?.length) {
          handleAddFiles(e.dataTransfer.files);
        }
      }}
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background:
          'radial-gradient(circle at 15% 10%, rgba(124, 92, 255, 0.14), transparent 40%), radial-gradient(circle at 85% 85%, rgba(16, 185, 129, 0.1), transparent 40%), #080911',
        color: '#e8e8f2',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        id="giftCreatorUploadInput"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/bmp,image/avif,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) {
            handleAddFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={replaceInputRef}
        id="giftCreatorReplaceInput"
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleReplaceSingleFile}
      />
      <input
        ref={overlayInputRef}
        id="giftCreatorOverlayInput"
        type="file"
        accept="image/png,image/webp,image/svg+xml,image/*"
        style={{ display: 'none' }}
        onChange={handleUploadOverlayFile}
      />

      {/* Top 3D Command Header */}
      <header
        style={{
          padding: '10px 18px',
          background: 'linear-gradient(180deg, rgba(22, 24, 38, 0.96), rgba(14, 15, 24, 0.96))',
          borderBottom: '1px solid rgba(124, 92, 255, 0.25)',
          boxShadow: '0 6px 24px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        {/* Brand Title & Live Processing Counters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '11px',
              background: 'linear-gradient(135deg, #7c5cff 0%, #4f46e5 55%, #10b981 100%)',
              boxShadow:
                '0 6px 16px rgba(124, 92, 255, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
              display: 'grid',
              placeItems: 'center',
              fontSize: '20px',
              flexShrink: 0,
            }}
          >
            🖼️
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 800,
                letterSpacing: '-0.01em',
                color: '#f8fafc',
              }}
            >
              {isAr ? 'إنشاء صورة الهدية ثلاثية الأبعاد' : '3D Gift Image Creator Studio'}
            </h2>
            <div
              style={{
                fontSize: '11.5px',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span>
                {isAr
                  ? `الإجمالي: ${items.length} صورة`
                  : `Total: ${items.length} images`}
              </span>
              <span>·</span>
              <span style={{ color: '#a78bfa', fontWeight: 700 }}>
                {isAr ? `المحدد: ${selectedCount}` : `Selected: ${selectedCount}`}
              </span>
              <span>·</span>
              <span
                id="giftCreatorProcessedBadge"
                style={{ color: '#34d399', fontWeight: 700 }}
              >
                {batchProgress.active
                  ? isAr
                    ? `تمت معالجة ${batchProgress.processed} من ${batchProgress.total} (المتبقي ${Math.max(0, batchProgress.total - batchProgress.processed)})`
                    : `Processed ${batchProgress.processed}/${batchProgress.total} (${Math.max(0, batchProgress.total - batchProgress.processed)} left)`
                  : isAr
                    ? `جاهز: ${Math.min(renderedCount, items.length)} / ${items.length} (المتبقي ${Math.max(0, items.length - renderedCount)})`
                    : `Ready: ${Math.min(renderedCount, items.length)} / ${items.length}`}
              </span>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            id="giftCreatorAddImagesBtn"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(124, 92, 255, 0.6)',
              background: 'linear-gradient(180deg, #28204d 0%, #1a1533 100%)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
              color: '#e9d5ff',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>➕</span>
            <span>{isAr ? 'رفع صور (دفعة واحدة)' : 'Upload Images (Batch)'}</span>
          </button>

          <button
            type="button"
            id="giftCreatorUploadOverlayTopBtn"
            onClick={() => overlayInputRef.current?.click()}
            style={{
              padding: '8px 13px',
              borderRadius: '10px',
              border: overlay.enabled
                ? '1px solid rgba(16, 185, 129, 0.7)'
                : '1px solid rgba(255, 255, 255, 0.14)',
              background: overlay.enabled
                ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.25), rgba(6, 95, 70, 0.3))'
                : 'linear-gradient(180deg, #1e2030, #141622)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
              color: overlay.enabled ? '#6ee7b7' : '#cbd5e1',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>✨</span>
            <span>
              {overlay.enabled
                ? isAr
                  ? 'تغيير الطبقة المشتركة'
                  : 'Change Shared Overlay'
                : isAr
                  ? 'إضافة طبقة مشتركة (إطار/شعار)'
                  : 'Add Shared Overlay Layer'}
            </span>
          </button>

          <button
            type="button"
            id="giftCreatorEdgeFeatherTopBtn"
            onClick={() => {
              const nextVal =
                settings.edgeSoftness === 0
                  ? 18
                  : settings.edgeSoftness < 32
                    ? 34
                    : 0;
              handleSetEdgeSoftness(nextVal, true);
              document
                .getElementById('softEdgeFeatherCard')
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }}
            style={{
              padding: '8px 13px',
              borderRadius: '10px',
              border:
                settings.edgeSoftness > 0
                  ? '1.5px solid rgba(244, 114, 182, 0.85)'
                  : '1px solid rgba(167, 139, 250, 0.45)',
              background:
                settings.edgeSoftness > 0
                  ? 'linear-gradient(135deg, rgba(219, 39, 119, 0.32), rgba(124, 92, 255, 0.32))'
                  : 'linear-gradient(180deg, #231d38, #161426)',
              boxShadow:
                settings.edgeSoftness > 0
                  ? '0 4px 14px rgba(236, 72, 153, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                  : '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
              color: settings.edgeSoftness > 0 ? '#fbcfe8' : '#e9d5ff',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🌫️</span>
            <span>
              {settings.edgeSoftness > 0
                ? isAr
                  ? `تنعيم الحواف الشفافة: مفعّل (${settings.edgeSoftness}px)`
                  : `Soft Transparent Edges: ON (${settings.edgeSoftness}px)`
                : isAr
                  ? 'تنعيم الحواف (حواف شفافة غير حادة)'
                  : 'Soft Transparent Edges (Feather)'}
            </span>
          </button>

          <button
            type="button"
            id="giftCreatorExportSelectedBtn"
            disabled={items.length === 0 || batchProgress.active}
            onClick={() => handleBatchExportZip(true)}
            title={
              isAr
                ? 'تصدير الصور المحددة فوراً حسب الصيغة المختارة'
                : 'Export selected images immediately in chosen format'
            }
            style={{
              padding: '8px 13px',
              borderRadius: '10px',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              background: 'linear-gradient(180deg, rgba(14, 116, 144, 0.35), rgba(15, 23, 42, 0.8))',
              color: '#7dd3fc',
              fontWeight: 700,
              fontSize: '12px',
              cursor: items.length === 0 ? 'not-allowed' : 'pointer',
              opacity: items.length === 0 ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>📥</span>
            <span>
              {isAr
                ? `تصدير المحدد (${selectedCount})`
                : `Export Selected (${selectedCount})`}
            </span>
          </button>

          <button
            type="button"
            id="giftCreatorExportAllZipBtn"
            disabled={items.length === 0 || batchProgress.active}
            onClick={() => handleBatchExportZip(false)}
            title={
              isAr
                ? 'اختصار التصدير الفوري: اضغط زر Tab أو كليك شمال للتصدير بالصيغة المحددة'
                : 'Quick export shortcut: Press Tab or Left-Click to export in selected format'
            }
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(167, 139, 250, 0.75)',
              background: 'linear-gradient(135deg, #7c5cff 0%, #6366f1 60%, #059669 100%)',
              boxShadow:
                '0 6px 18px rgba(124, 92, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '12.5px',
              cursor: items.length === 0 ? 'not-allowed' : 'pointer',
              opacity: items.length === 0 ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📦</span>
            <span>
              {items.length <= 1
                ? isAr
                  ? `تنزيل الصورة (${settings.exportFormat.toUpperCase()}) ⚡ [Tab / كليك شمال]`
                  : `Download Image (${settings.exportFormat.toUpperCase()}) ⚡ [Tab / Left-Click]`
                : isAr
                  ? `تنزيل جميع الصور ZIP (${items.length}) ⚡ [Tab / كليك شمال]`
                  : `Download All ZIP (${items.length}) ⚡ [Tab / Left-Click]`}
            </span>
          </button>
        </div>
      </header>

      {/* Pro Feature & Free Trial Status Bar */}
      {attemptStatus?.rule?.isPro && (
        <div
          id="giftCreatorProBanner"
          style={{
            padding: '7px 18px',
            background: isPro
              ? 'linear-gradient(90deg, rgba(245, 158, 11, 0.16) 0%, rgba(124, 92, 255, 0.12) 100%)'
              : attemptStatus.remainingAttempts > 0
                ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.16) 0%, rgba(59, 130, 246, 0.12) 100%)'
                : 'linear-gradient(90deg, rgba(239, 68, 68, 0.18) 0%, rgba(220, 38, 38, 0.12) 100%)',
            borderBottom: isPro
              ? '1px solid rgba(245, 158, 11, 0.35)'
              : attemptStatus.remainingAttempts > 0
                ? '1px solid rgba(16, 185, 129, 0.35)'
                : '1px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            fontWeight: 700,
            gap: '8px',
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{isPro ? '👑' : attemptStatus.remainingAttempts > 0 ? '🎁' : '🔒'}</span>
            <span
              style={{
                color: isPro ? '#fde047' : attemptStatus.remainingAttempts > 0 ? '#6ee7b7' : '#fca5a5',
              }}
            >
              {isPro
                ? isAr
                  ? 'عضوية برو مفعلة: استخدام وتصدير غير محدود لجميع صور الهدايا'
                  : 'Pro Membership Active: Unlimited usage & export for all gift images'
                : attemptStatus.remainingAttempts > 0
                  ? isAr
                    ? `ميزة برو متاحة لك تجريبياً: متبقي لديك (${attemptStatus.remainingAttempts}) محاولة مجانية للتصدير والتحميل`
                    : `Pro Trial: You have (${attemptStatus.remainingAttempts}) free export attempts remaining`
                  : isAr
                    ? 'استنفدت جميع محاولاتك المجانية! اشترك الآن في باقة برو للتصدير والتحميل غير المحدود'
                    : 'Free trial attempts exhausted! Subscribe to Pro for unlimited export & downloads'}
            </span>
          </div>

          {!isPro && (
            <button
              type="button"
              id="giftCreatorUpgradeProBtn"
              onClick={() => {
                if (typeof onRequirePro === 'function') onRequirePro('gift_image');
                else if (typeof (window as any).__openProModal === 'function')
                  (window as any).__openProModal('gift_image');
              }}
              style={{
                padding: '3px 12px',
                borderRadius: '99px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 0,
                color: '#000',
                fontWeight: 800,
                fontSize: '11px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
              }}
            >
              👑 {isAr ? 'ترقية إلى برو' : 'Upgrade to Pro'}
            </button>
          )}
        </div>
      )}

      {/* Batch Progress Bar Banner when active */}
      {batchProgress.active && (
        <div
          style={{
            padding: '8px 18px',
            background: 'rgba(124, 92, 255, 0.16)',
            borderBottom: '1px solid rgba(124, 92, 255, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#e9d5ff' }}>
            {batchProgress.label}
          </span>
          <div
            style={{
              flex: 1,
              height: '8px',
              background: 'rgba(15, 23, 42, 0.8)',
              borderRadius: '99px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round((batchProgress.processed / Math.max(1, batchProgress.total)) * 100)}%`,
                background: 'linear-gradient(90deg, #7c5cff, #10b981)',
                transition: 'width 0.15s ease',
              }}
            />
          </div>
          <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#34d399' }}>
            {Math.round((batchProgress.processed / Math.max(1, batchProgress.total)) * 100)}%
          </span>
        </div>
      )}

      {/* Main 3D Workspace Layout: Control Sidebar + Live Preview & Inspector */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '380px 1fr',
          overflow: 'hidden',
        }}
        className="gift-creator-grid"
      >
        {/* Left/Right Settings Panel (Shapes, Shared Overlay Layer, Dimensions, Quality) */}
        <aside
          style={{
            background: 'linear-gradient(180deg, #10121d 0%, #0b0c14 100%)',
            borderInlineEnd: '1px solid rgba(255, 255, 255, 0.08)',
            overflowY: 'auto',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Scope Selector: Apply to All vs Selected Only */}
          <div
            style={{
              background: 'linear-gradient(180deg, #171929, #121420)',
              border: '1px solid rgba(124, 92, 255, 0.28)',
              borderRadius: '12px',
              padding: '10px 12px',
              boxShadow: '0 6px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
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
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#e2e8f0' }}>
                {isAr ? '🎯 نطاق تطبيق التعديلات والشكل' : '🎯 Target Application Scope'}
              </span>
              <button
                type="button"
                onClick={() => handleApplyAdjustmentsToScope(settings.applyScope)}
                style={{
                  padding: '3px 8px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: '1px solid rgba(16, 185, 129, 0.5)',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#6ee7b7',
                  cursor: 'pointer',
                }}
              >
                {isAr ? 'تعميم الآن ✓' : 'Apply Now ✓'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                id="scopeAllBtn"
                onClick={() => setSettings((p) => ({ ...p, applyScope: 'all' }))}
                style={{
                  padding: '7px 8px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border:
                    settings.applyScope === 'all'
                      ? '1px solid #7c5cff'
                      : '1px solid rgba(255,255,255,0.08)',
                  background:
                    settings.applyScope === 'all'
                      ? 'rgba(124, 92, 255, 0.24)'
                      : 'rgba(255,255,255,0.03)',
                  color: settings.applyScope === 'all' ? '#fff' : '#94a3b8',
                }}
              >
                {isAr ? 'جميع الصور المرفوعة' : 'All Uploaded Images'}
              </button>
              <button
                type="button"
                id="scopeSelectedBtn"
                onClick={() => setSettings((p) => ({ ...p, applyScope: 'selected' }))}
                style={{
                  padding: '7px 8px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border:
                    settings.applyScope === 'selected'
                      ? '1px solid #7c5cff'
                      : '1px solid rgba(255,255,255,0.08)',
                  background:
                    settings.applyScope === 'selected'
                      ? 'rgba(124, 92, 255, 0.24)'
                      : 'rgba(255,255,255,0.03)',
                  color: settings.applyScope === 'selected' ? '#fff' : '#94a3b8',
                }}
              >
                {isAr ? `الصور المحددة فقط (${selectedCount})` : `Selected Only (${selectedCount})`}
              </button>
            </div>
          </div>

          {/* SECTION 1: Professional Shapes Library (True Alpha Mask) */}
          <div
            style={{
              background: 'linear-gradient(180deg, #161826, #10121c)',
              border: '1px solid rgba(255, 255, 255, 0.09)',
              borderRadius: '14px',
              padding: '12px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
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
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                {isAr ? '1. اختيار شكل القص (قناع شفافية Alpha)' : '1. Shape Mask Library (Alpha)'}
              </h3>
              <span style={{ fontSize: '10.5px', color: '#a78bfa', fontWeight: 700 }}>
                {isAr ? currentShapeMeta.nameAr : currentShapeMeta.nameEn}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '7px',
              }}
            >
              {GIFT_SHAPES.map((shape) => {
                const isSelected = settings.shapeId === shape.id;
                return (
                  <button
                    key={shape.id}
                    type="button"
                    id={`shapeBtn_${shape.id}`}
                    onClick={() => handleSelectShape(shape.id)}
                    style={{
                      padding: '8px 6px',
                      borderRadius: '10px',
                      border: isSelected
                        ? '1.5px solid #8b5cf6'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      background: isSelected
                        ? 'linear-gradient(180deg, rgba(124, 92, 255, 0.28), rgba(79, 70, 229, 0.18))'
                        : 'linear-gradient(180deg, #1b1d2e, #131522)',
                      boxShadow: isSelected
                        ? '0 4px 14px rgba(124, 92, 255, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                        : '0 2px 6px rgba(0,0,0,0.25)',
                      color: isSelected ? '#ffffff' : '#cbd5e1',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background:
                          'repeating-conic-gradient(#25283d 0% 25%, #181a29 0% 50%) 0 0 / 8px 8px',
                        display: 'grid',
                        placeItems: 'center',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <svg width="26" height="26" viewBox="0 0 100 100">
                        <defs>
                          <linearGradient
                            id={`grad_${shape.id}`}
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="100%"
                          >
                            <stop offset="0%" stopColor={isSelected ? '#a78bfa' : '#64748b'} />
                            <stop offset="100%" stopColor={isSelected ? '#34d399' : '#475569'} />
                          </linearGradient>
                        </defs>
                        <path
                          d={shape.svgPreviewPath}
                          fill={`url(#grad_${shape.id})`}
                          stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.35)'}
                          strokeWidth="4"
                        />
                      </svg>
                    </div>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: isSelected ? 800 : 600,
                        textAlign: 'center',
                        lineHeight: 1.2,
                      }}
                    >
                      {isAr ? shape.nameAr : shape.nameEn}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DEDICATED CARD: Soft Transparent Edge Feathering (تنعيم حواف الصورة وجعلها شفافة غير حادة) */}
          <div
            id="softEdgeFeatherCard"
            style={{
              background:
                settings.edgeSoftness > 0
                  ? 'linear-gradient(180deg, rgba(46, 16, 45, 0.85), rgba(20, 16, 34, 0.95))'
                  : 'linear-gradient(180deg, #19172b, #11121e)',
              border:
                settings.edgeSoftness > 0
                  ? '1.5px solid rgba(244, 114, 182, 0.65)'
                  : '1px solid rgba(167, 139, 250, 0.35)',
              borderRadius: '14px',
              padding: '12px',
              boxShadow:
                settings.edgeSoftness > 0
                  ? '0 8px 24px rgba(236, 72, 153, 0.22), inset 0 1px 0 rgba(255,255,255,0.12)'
                  : '0 8px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '9px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#fdf2f8' }}>
                {isAr
                  ? '🌫️ تنعيم حواف الصورة (حواف شفافة غير حادة)'
                  : '🌫️ Soft Transparent Edges (Feather)'}
              </h3>
              <span
                id="softEdgeFeatherValueBadge"
                style={{
                  padding: '2px 8px',
                  borderRadius: '99px',
                  fontSize: '11px',
                  fontWeight: 800,
                  background:
                    settings.edgeSoftness > 0
                      ? 'rgba(244, 114, 182, 0.25)'
                      : 'rgba(255, 255, 255, 0.08)',
                  color: settings.edgeSoftness > 0 ? '#f472b6' : '#94a3b8',
                  border:
                    settings.edgeSoftness > 0
                      ? '1px solid rgba(244, 114, 182, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                {settings.edgeSoftness === 0
                  ? isAr
                    ? 'حواف حادة (0px)'
                    : 'Sharp (0px)'
                  : isAr
                    ? `ناعم شفاف (${settings.edgeSoftness}px)`
                    : `Soft (${settings.edgeSoftness}px)`}
              </span>
            </div>

            <div style={{ fontSize: '11px', color: '#cbd5e1', lineHeight: 1.45 }}>
              {isAr
                ? 'اجعل حواف الشكل متدرجة الشفافية للداخل بحيث تندمج بنعومة تامة بدون أي حدود حادة:'
                : 'Make shape borders fade smoothly into full transparency with zero sharp edges:'}
            </div>

            {/* One-Click Soft Edge Feather Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
              {[
                { val: 0, labelAr: 'حادة (0)', labelEn: 'Sharp (0)' },
                { val: 10, labelAr: 'ناعم خفيف', labelEn: 'Soft 10px' },
                { val: 22, labelAr: 'ناعم متوسط', labelEn: 'Medium 22px' },
                { val: 40, labelAr: 'تلاشي قوي', labelEn: 'Deep 40px' },
              ].map((preset) => {
                const isCurrent = settings.edgeSoftness === preset.val;
                return (
                  <button
                    key={preset.val}
                    type="button"
                    id={`featherPresetBtn_${preset.val}`}
                    onClick={() => handleSetEdgeSoftness(preset.val, true)}
                    style={{
                      padding: '6px 4px',
                      borderRadius: '8px',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      border: isCurrent
                        ? '1.5px solid #f472b6'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      background: isCurrent
                        ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.35), rgba(124, 92, 255, 0.35))'
                        : 'rgba(255, 255, 255, 0.04)',
                      color: isCurrent ? '#ffffff' : '#cbd5e1',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isAr ? preset.labelAr : preset.labelEn}
                  </button>
                );
              })}
            </div>

            {/* Continuous Range Slider for Soft Transparent Edge Feather */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  marginBottom: '3px',
                }}
              >
                <span>
                  {isAr
                    ? 'درجة نعومة وتلاشي الحواف الشفافة (Feather)'
                    : 'Edge Transparency Feather Strength'}
                </span>
                <b style={{ color: '#f472b6' }}>{settings.edgeSoftness} px</b>
              </div>
              <input
                id="giftSoftEdgeFeatherInput"
                type="range"
                min="0"
                max="60"
                value={settings.edgeSoftness}
                onChange={(e) => handleSetEdgeSoftness(Number(e.target.value), false)}
                style={{ width: '100%', accentColor: '#ec4899' }}
              />
            </div>
          </div>

          {/* SECTION 2: Shared Overlay Layer Above All Images */}
          <div
            style={{
              background: 'linear-gradient(180deg, #161826, #10121c)',
              border: overlay.enabled
                ? '1px solid rgba(16, 185, 129, 0.45)'
                : '1px solid rgba(255, 255, 255, 0.09)',
              borderRadius: '14px',
              padding: '12px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
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
              <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                {isAr
                  ? '2. طبقة مشتركة فوق الصور (إطار / شعار)'
                  : '2. Shared Overlay Layer (Frame / Logo)'}
              </h3>
              {overlay.imageUrl && (
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    color: overlay.enabled ? '#34d399' : '#94a3b8',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  <input
                    type="checkbox"
                    id="toggleOverlayEnabledCheckbox"
                    checked={overlay.enabled}
                    onChange={(e) => setOverlay((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  <span>{overlay.enabled ? (isAr ? 'مفعّلة' : 'Active') : isAr ? 'مخفية' : 'Hidden'}</span>
                </label>
              )}
            </div>

            {/* Upload or Quick Preset Frames */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                id="uploadOverlayLayerBtn"
                onClick={() => overlayInputRef.current?.click()}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '9px',
                  border: '1px dashed rgba(16, 185, 129, 0.6)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#6ee7b7',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {overlay.imageUrl
                  ? isAr
                    ? '🔄 استبدال صورة الطبقة (PNG)'
                    : '🔄 Replace Overlay Image'
                  : isAr
                    ? '📤 رفع طبقة إضافية شفافة (PNG / WEBP)'
                    : '📤 Upload Transparent Overlay (PNG)'}
              </button>
              {overlay.imageUrl && (
                <button
                  type="button"
                  id="deleteOverlayLayerBtn"
                  onClick={handleRemoveOverlay}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '9px',
                    border: '1px solid rgba(239, 68, 68, 0.45)',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#fca5a5',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'حذف' : 'Remove'}
                </button>
              )}
            </div>

            {/* Quick Transparent Frame Presets */}
            <div style={{ marginBottom: overlay.imageUrl ? '10px' : '0' }}>
              <div style={{ fontSize: '10.5px', color: '#94a3b8', marginBottom: '5px' }}>
                {isAr
                  ? 'أو اختر إطار هدايا شفاف جاهز للتجربة الفورية:'
                  : 'Or pick a ready-made transparent gift frame:'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
                <button
                  type="button"
                  id="presetOverlayGoldBtn"
                  onClick={() => handleApplyOverlayPreset('gold_ring')}
                  style={{
                    padding: '5px 6px',
                    borderRadius: '7px',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: '#fde047',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? '👑 إطار ذهبي' : '👑 Gold Ring'}
                </button>
                <button
                  type="button"
                  id="presetOverlayNeonBtn"
                  onClick={() => handleApplyOverlayPreset('neon_hex')}
                  style={{
                    padding: '5px 6px',
                    borderRadius: '7px',
                    border: '1px solid rgba(168, 85, 247, 0.4)',
                    background: 'rgba(168, 85, 247, 0.12)',
                    color: '#e9d5ff',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? '🔷 إطار نيون' : '🔷 Neon Hex'}
                </button>
                <button
                  type="button"
                  id="presetOverlayCrystalBtn"
                  onClick={() => handleApplyOverlayPreset('crystal_corner')}
                  style={{
                    padding: '5px 6px',
                    borderRadius: '7px',
                    border: '1px solid rgba(52, 211, 153, 0.4)',
                    background: 'rgba(52, 211, 153, 0.12)',
                    color: '#6ee7b7',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? '💎 إطار كريستال' : '💎 Crystal'}
                </button>
              </div>
            </div>

            {/* Overlay Controls when an overlay is loaded */}
            {overlay.imageUrl && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                    {isAr ? 'تطبيق الطبقة على:' : 'Apply Layer To:'}
                  </span>
                  <select
                    id="overlayScopeSelect"
                    value={overlay.scope}
                    onChange={(e) =>
                      setOverlay((p) => ({ ...p, scope: e.target.value as GiftApplyScope }))
                    }
                    style={{ width: '165px', fontSize: '11px' }}
                  >
                    <option value="all">{isAr ? 'جميع الصور المرفوعة' : 'All Images'}</option>
                    <option value="selected">
                      {isAr ? 'الصور المحددة فقط' : 'Selected Images Only'}
                    </option>
                  </select>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                    {isAr ? 'وضع دمج الطبقة:' : 'Overlay Mode:'}
                  </span>
                  <select
                    id="overlayClipSelect"
                    value={overlay.clipToShape ? 'clipped' : 'free'}
                    onChange={(e) =>
                      setOverlay((p) => ({ ...p, clipToShape: e.target.value === 'clipped' }))
                    }
                    style={{ width: '165px', fontSize: '11px' }}
                  >
                    <option value="free">
                      {isAr ? 'إطار حر فوق الشكل' : 'Free Frame Over Shape'}
                    </option>
                    <option value="clipped">
                      {isAr ? 'مقصوص داخل حدود الشكل' : 'Clipped Inside Shape'}
                    </option>
                  </select>
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      marginBottom: '2px',
                    }}
                  >
                    <span>{isAr ? 'حجم الطبقة (تكبير/تصغير)' : 'Overlay Scale'}</span>
                    <b style={{ color: '#34d399' }}>{overlay.scale}%</b>
                  </div>
                  <input
                    id="overlayScaleInput"
                    type="range"
                    min="20"
                    max="250"
                    value={overlay.scale}
                    onChange={(e) => setOverlay((p) => ({ ...p, scale: Number(e.target.value) }))}
                    style={{ width: '100%', accentColor: '#10b981' }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      marginBottom: '2px',
                    }}
                  >
                    <span>{isAr ? 'شفافية الطبقة ودرجة الظهور' : 'Overlay Opacity'}</span>
                    <b style={{ color: '#34d399' }}>{overlay.opacity}%</b>
                  </div>
                  <input
                    id="overlayOpacityInput"
                    type="range"
                    min="5"
                    max="100"
                    value={overlay.opacity}
                    onChange={(e) => setOverlay((p) => ({ ...p, opacity: Number(e.target.value) }))}
                    style={{ width: '100%', accentColor: '#10b981' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '10.5px',
                      }}
                    >
                      <span>{isAr ? 'تحريك أفقي (X)' : 'Offset X'}</span>
                      <b>{overlay.offsetX}%</b>
                    </div>
                    <input
                      id="overlayOffsetXInput"
                      type="range"
                      min="-100"
                      max="100"
                      value={overlay.offsetX}
                      onChange={(e) =>
                        setOverlay((p) => ({ ...p, offsetX: Number(e.target.value) }))
                      }
                      style={{ width: '100%', accentColor: '#10b981' }}
                    />
                  </div>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '10.5px',
                      }}
                    >
                      <span>{isAr ? 'تحريك رأسي (Y)' : 'Offset Y'}</span>
                      <b>{overlay.offsetY}%</b>
                    </div>
                    <input
                      id="overlayOffsetYInput"
                      type="range"
                      min="-100"
                      max="100"
                      value={overlay.offsetY}
                      onChange={(e) =>
                        setOverlay((p) => ({ ...p, offsetY: Number(e.target.value) }))
                      }
                      style={{ width: '100%', accentColor: '#10b981' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: Dimensions, Borders, Image Positioning & Export Quality */}
          <div
            style={{
              background: 'linear-gradient(180deg, #161826, #10121c)',
              border: '1px solid rgba(255, 255, 255, 0.09)',
              borderRadius: '14px',
              padding: '12px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
              {isAr
                ? '3. المقاسات والحواف وموضع الصورة والجودة'
                : '3. Dimensions, Edges, Position & Quality'}
            </h3>

            {/* Size Mode: Unified vs Original */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                id="sizeModeUnifiedBtn"
                onClick={() => setSettings((p) => ({ ...p, sizeMode: 'unified' }))}
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border:
                    settings.sizeMode === 'unified'
                      ? '1px solid #7c5cff'
                      : '1px solid rgba(255,255,255,0.08)',
                  background:
                    settings.sizeMode === 'unified'
                      ? 'rgba(124, 92, 255, 0.22)'
                      : 'rgba(255,255,255,0.03)',
                  color: settings.sizeMode === 'unified' ? '#fff' : '#94a3b8',
                }}
              >
                {isAr ? 'مقاس موحد للكل' : 'Unified Size'}
              </button>
              <button
                type="button"
                id="sizeModeOriginalBtn"
                onClick={() => setSettings((p) => ({ ...p, sizeMode: 'original' }))}
                style={{
                  padding: '6px 8px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border:
                    settings.sizeMode === 'original'
                      ? '1px solid #7c5cff'
                      : '1px solid rgba(255,255,255,0.08)',
                  background:
                    settings.sizeMode === 'original'
                      ? 'rgba(124, 92, 255, 0.22)'
                      : 'rgba(255,255,255,0.03)',
                  color: settings.sizeMode === 'original' ? '#fff' : '#94a3b8',
                }}
              >
                {isAr ? 'المقاسات الأصلية' : 'Keep Original Size'}
              </button>
            </div>

            {settings.sizeMode === 'unified' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block' }}>
                      {isAr ? 'العرض (px)' : 'Width (px)'}
                    </label>
                    <input
                      id="giftOutWidthInput"
                      type="number"
                      min="32"
                      max="4096"
                      value={settings.width}
                      onChange={(e) => {
                        const w = Math.max(32, Math.min(4096, Number(e.target.value) || 512));
                        setSettings((p) => ({
                          ...p,
                          width: w,
                          height: p.lockAspectToShape
                            ? Math.round(w / currentShapeMeta.recommendedAspect)
                            : p.height,
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '10.5px', color: '#94a3b8', display: 'block' }}>
                      {isAr ? 'الارتفاع (px)' : 'Height (px)'}
                    </label>
                    <input
                      id="giftOutHeightInput"
                      type="number"
                      min="32"
                      max="4096"
                      value={settings.height}
                      onChange={(e) => {
                        const h = Math.max(32, Math.min(4096, Number(e.target.value) || 512));
                        setSettings((p) => ({ ...p, height: h }));
                      }}
                    />
                  </div>
                </div>

                {/* Quick Size Presets */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {[
                    { label: '256×256', w: 256, h: 256 },
                    { label: '512×512', w: 512, h: 512 },
                    { label: '720×720', w: 720, h: 720 },
                    { label: '1024×1024', w: 1024, h: 1024 },
                    { label: '800×600', w: 800, h: 600 },
                  ].map((pr) => (
                    <button
                      key={pr.label}
                      type="button"
                      onClick={() => setSettings((p) => ({ ...p, width: pr.w, height: pr.h }))}
                      style={{
                        padding: '3px 7px',
                        borderRadius: '6px',
                        fontSize: '10px',
                        fontWeight: 700,
                        border:
                          settings.width === pr.w && settings.height === pr.h
                            ? '1px solid #7c5cff'
                            : '1px solid rgba(255,255,255,0.1)',
                        background:
                          settings.width === pr.w && settings.height === pr.h
                            ? 'rgba(124, 92, 255, 0.25)'
                            : '#141624',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                      }}
                    >
                      {pr.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Corner Radius & Transparent Margin */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  marginBottom: '2px',
                }}
              >
                <span>{isAr ? 'حجم الحواف الدائرية (Corner Radius)' : 'Corner Radius'}</span>
                <b style={{ color: '#a78bfa' }}>{settings.cornerRadius}%</b>
              </div>
              <input
                id="giftCornerRadiusInput"
                type="range"
                min="0"
                max="50"
                value={settings.cornerRadius}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, cornerRadius: Number(e.target.value) }))
                }
                style={{ width: '100%', accentColor: '#7c5cff' }}
              />
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  marginBottom: '2px',
                }}
              >
                <span>{isAr ? 'مساحة شفافة حول الشكل (Padding)' : 'Transparent Outer Margin'}</span>
                <b style={{ color: '#a78bfa' }}>{settings.transparentPadding}%</b>
              </div>
              <input
                id="giftPaddingInput"
                type="range"
                min="0"
                max="30"
                value={settings.transparentPadding}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, transparentPadding: Number(e.target.value) }))
                }
                style={{ width: '100%', accentColor: '#7c5cff' }}
              />
            </div>

            {/* Image Fit, Zoom & Pan inside Shape */}
            <div
              style={{
                paddingTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
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
                }}
              >
                <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                  {isAr ? 'ملاءمة الصورة داخل الشكل:' : 'Image Fit Mode:'}
                </span>
                <select
                  id="giftImageFitSelect"
                  value={settings.imageFit}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      imageFit: e.target.value as GiftImageFitMode,
                    }))
                  }
                  style={{ width: '155px', fontSize: '11px' }}
                >
                  <option value="cover">{isAr ? 'ملء الشكل (Cover)' : 'Fill Shape (Cover)'}</option>
                  <option value="contain">
                    {isAr ? 'احتواء كامل (Contain)' : 'Fit Inside (Contain)'}
                  </option>
                  <option value="stretch">{isAr ? 'تمدد (Stretch)' : 'Stretch'}</option>
                </select>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    marginBottom: '2px',
                  }}
                >
                  <span>{isAr ? 'تكبير / تصغير الصورة داخل الشكل' : 'Image Zoom Scale'}</span>
                  <b style={{ color: '#38bdf8' }}>{settings.imageScale}%</b>
                </div>
                <input
                  id="giftImageScaleInput"
                  type="range"
                  min="30"
                  max="250"
                  value={settings.imageScale}
                  onChange={(e) =>
                    setSettings((p) => ({ ...p, imageScale: Number(e.target.value) }))
                  }
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px' }}>
                    <span>{isAr ? 'موضع الصورة أفقي X' : 'Image Pan X'}</span>
                    <b>{settings.imageOffsetX}%</b>
                  </div>
                  <input
                    id="giftImageOffsetXInput"
                    type="range"
                    min="-100"
                    max="100"
                    value={settings.imageOffsetX}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, imageOffsetX: Number(e.target.value) }))
                    }
                    style={{ width: '100%', accentColor: '#38bdf8' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px' }}>
                    <span>{isAr ? 'موضع الصورة رأسي Y' : 'Image Pan Y'}</span>
                    <b>{settings.imageOffsetY}%</b>
                  </div>
                  <input
                    id="giftImageOffsetYInput"
                    type="range"
                    min="-100"
                    max="100"
                    value={settings.imageOffsetY}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, imageOffsetY: Number(e.target.value) }))
                    }
                    style={{ width: '100%', accentColor: '#38bdf8' }}
                  />
                </div>
              </div>
            </div>

            {/* Export Format & Quality */}
            <div
              style={{
                paddingTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
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
                }}
              >
                <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>
                  {isAr ? 'صيغة التصدير:' : 'Export Format:'}
                </span>
                <select
                  id="giftExportFormatSelect"
                  value={settings.exportFormat}
                  onChange={(e) =>
                    setSettings((p) => ({
                      ...p,
                      exportFormat: e.target.value as GiftExportFormat,
                    }))
                  }
                  style={{ width: '170px', fontSize: '11px', fontWeight: 700 }}
                >
                  <option value="png">
                    {isAr ? 'PNG شفاف (أعلى دقة Alpha)' : 'Transparent PNG (Lossless)'}
                  </option>
                  <option value="webp">
                    {isAr ? 'WEBP شفاف (حجم خفيف)' : 'Transparent WEBP'}
                  </option>
                  <option value="jpg">
                    {isAr ? 'JPG (خلفية ملونة غير شفافة)' : 'JPG (Solid Background)'}
                  </option>
                </select>
              </div>

              {settings.exportFormat !== 'png' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span>{isAr ? 'جودة التصدير ومستوى الضغط' : 'Export Quality'}</span>
                    <b style={{ color: '#fde047' }}>{settings.exportQuality}%</b>
                  </div>
                  <input
                    id="giftExportQualityInput"
                    type="range"
                    min="20"
                    max="100"
                    value={settings.exportQuality}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, exportQuality: Number(e.target.value) }))
                    }
                    style={{ width: '100%', accentColor: '#f59e0b' }}
                  />
                </div>
              )}

              {settings.exportFormat === 'jpg' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                    {isAr ? 'لون خلفية JPG:' : 'JPG Background Color:'}
                  </span>
                  <input
                    type="color"
                    value={settings.jpgBackgroundColor}
                    onChange={(e) =>
                      setSettings((p) => ({ ...p, jpgBackgroundColor: e.target.value }))
                    }
                    style={{
                      width: '44px',
                      height: '26px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '6px',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Right/Main Workspace: Selection Toolbar + Focused Interactive Stage + Live Batch Grid */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            padding: '14px 18px',
            gap: '12px',
          }}
        >
          {/* Selection & Workspace Toolbar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
              padding: '8px 12px',
              borderRadius: '12px',
              background: 'rgba(19, 21, 34, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                id="giftSelectAllBtn"
                onClick={handleSelectAll}
                disabled={items.length === 0}
                className="pill"
                style={{ padding: '4px 10px', fontSize: '11px' }}
              >
                {isAr ? '☑ تحديد الكل' : '☑ Select All'}
              </button>
              <button
                type="button"
                id="giftDeselectAllBtn"
                onClick={handleDeselectAll}
                disabled={items.length === 0}
                className="pill"
                style={{ padding: '4px 10px', fontSize: '11px' }}
              >
                {isAr ? '☐ إلغاء التحديد' : '☐ Deselect All'}
              </button>
              <button
                type="button"
                id="giftDeleteSelectedBtn"
                onClick={handleDeleteSelected}
                disabled={selectedCount === 0}
                className="pill"
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  borderColor: selectedCount > 0 ? 'rgba(239, 68, 68, 0.45)' : undefined,
                  color: selectedCount > 0 ? '#fca5a5' : undefined,
                }}
              >
                {isAr ? `🗑 حذف المحدد (${selectedCount})` : `🗑 Delete Selected (${selectedCount})`}
              </button>
              <button
                type="button"
                id="giftResetPositionsBtn"
                onClick={() => {
                  setSettings((p) => ({
                    ...p,
                    imageScale: 100,
                    imageOffsetX: 0,
                    imageOffsetY: 0,
                  }));
                  setOverlay((p) => ({ ...p, scale: 100, offsetX: 0, offsetY: 0 }));
                  setItems((prev) => prev.map((it) => ({ ...it, adjustment: {} })));
                }}
                disabled={items.length === 0}
                className="pill"
                style={{ padding: '4px 10px', fontSize: '11px' }}
              >
                {isAr ? '↺ إعادة ضبط المواضع' : '↺ Reset Positions'}
              </button>
            </div>

            {/* Preview Checkerboard Background Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {isAr ? 'خلفية المعاينة (فحص الشفافية):' : 'Preview Backdrop:'}
              </span>
              {(
                [
                  { id: 'checker', label: isAr ? 'شفاف' : 'Alpha Grid' },
                  { id: 'dark', label: isAr ? 'داكن' : 'Dark' },
                  { id: 'light', label: isAr ? 'فاتح' : 'Light' },
                  { id: 'emerald', label: isAr ? 'زمردي' : 'Emerald' },
                ] as const
              ).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setPreviewBg(b.id)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border:
                      previewBg === b.id
                        ? '1px solid #7c5cff'
                        : '1px solid rgba(255,255,255,0.1)',
                    background:
                      previewBg === b.id ? 'rgba(124, 92, 255, 0.25)' : 'rgba(255,255,255,0.04)',
                    color: previewBg === b.id ? '#fff' : '#cbd5e1',
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Empty State Dropzone OR Active Split View (Interactive Inspector + Live Batch Grid) */}
          {items.length === 0 ? (
            <div
              id="giftCreatorEmptyDropzone"
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1,
                borderRadius: '18px',
                border: dragActive
                  ? '2px dashed #34d399'
                  : '2px dashed rgba(124, 92, 255, 0.45)',
                background: dragActive
                  ? 'rgba(16, 185, 129, 0.08)'
                  : 'radial-gradient(circle at center, rgba(124, 92, 255, 0.11), rgba(14, 16, 26, 0.85))',
                boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px',
                textAlign: 'center',
                cursor: 'pointer',
                gap: '14px',
              }}
            >
              <div
                style={{
                  width: '84px',
                  height: '84px',
                  borderRadius: '24px',
                  background: 'linear-gradient(135deg, rgba(124, 92, 255, 0.3), rgba(16, 185, 129, 0.25))',
                  border: '1px solid rgba(167, 139, 250, 0.4)',
                  boxShadow: '0 14px 34px rgba(124, 92, 255, 0.3)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '38px',
                }}
              >
                🎁
              </div>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                {isAr
                  ? 'اسحب وأفلت عدداً كبيراً من الصور هنا أو اضغط للرفع'
                  : 'Drag & Drop Multiple Images Here or Click to Upload'}
              </h3>
              <p
                style={{
                  margin: 0,
                  maxWidth: '560px',
                  fontSize: '13px',
                  color: '#94a3b8',
                  lineHeight: 1.6,
                }}
              >
                {isAr
                  ? 'يدعم جميع صيغ الصور (PNG, JPG, JPEG, WEBP, GIF, SVG) مع قص حقيقي بأقنعة شفافية كاملة Alpha Mask، وإضافة طبقة إطار أو شعار مشترك فوق جميع الصور، وتصدير فردي أو جماعي داخل ملف ZIP.'
                  : 'Supports PNG, JPG, JPEG, WEBP, GIF, SVG with true Alpha Masking, shared overlay frames, and instant single or batch ZIP export.'}
              </p>
              <div
                style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  id="emptyStateUploadBtn"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '12px',
                    border: '1px solid rgba(167, 139, 250, 0.8)',
                    background: 'linear-gradient(135deg, #7c5cff, #4f46e5)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 8px 20px rgba(124, 92, 255, 0.4)',
                  }}
                >
                  {isAr ? '📂 اختيار صور من الجهاز' : '📂 Select Images from Device'}
                </button>
                <button
                  type="button"
                  id="loadDemoGiftImagesBtn"
                  onClick={handleLoadDemoImages}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '12px',
                    border: '1px solid rgba(52, 211, 153, 0.5)',
                    background: 'rgba(16, 185, 129, 0.14)',
                    color: '#6ee7b7',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? '✨ تجربة فورية بصور هدايا تجريبية' : '✨ Try Instant Demo Gift Images'}
                </button>
              </div>
            </div>
          ) : (
            <div
              className="gift-creator-split"
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: '310px 1fr',
                gap: '14px',
                overflow: 'hidden',
              }}
            >
              {/* Focused Live 3D Inspector Stage (Interactive Drag to Pan) */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #151726, #0f101a)',
                  border: '1px solid rgba(124, 92, 255, 0.3)',
                  borderRadius: '16px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#e2e8f0' }}>
                    {isAr ? '🔍 المعاينة المباشرة والتحريك' : '🔍 Live Inspector & Drag'}
                  </span>
                  {overlay.enabled && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setDragTargetMode('image')}
                        style={{
                          padding: '2px 7px',
                          fontSize: '10px',
                          borderRadius: '5px',
                          border:
                            dragTargetMode === 'image'
                              ? '1px solid #38bdf8'
                              : '1px solid rgba(255,255,255,0.1)',
                          background:
                            dragTargetMode === 'image'
                              ? 'rgba(56, 189, 248, 0.2)'
                              : 'transparent',
                          color: '#e2e8f0',
                          cursor: 'pointer',
                        }}
                      >
                        {isAr ? 'تحريك الصورة' : 'Drag Image'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDragTargetMode('overlay')}
                        style={{
                          padding: '2px 7px',
                          fontSize: '10px',
                          borderRadius: '5px',
                          border:
                            dragTargetMode === 'overlay'
                              ? '1px solid #10b981'
                              : '1px solid rgba(255,255,255,0.1)',
                          background:
                            dragTargetMode === 'overlay'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'transparent',
                          color: '#e2e8f0',
                          cursor: 'pointer',
                        }}
                      >
                        {isAr ? 'تحريك الطبقة' : 'Drag Overlay'}
                      </button>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    flex: 1,
                    minHeight: '210px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    display: 'grid',
                    placeItems: 'center',
                    padding: '10px',
                    overflow: 'hidden',
                    position: 'relative',
                    ...previewBgStyle,
                  }}
                >
                  <canvas
                    ref={inspectorCanvasRef}
                    id="giftInspectorCanvas"
                    data-testid="gift-inspector-canvas"
                    onPointerDown={handleStagePointerDown}
                    onPointerMove={handleStagePointerMove}
                    onPointerUp={handleStagePointerUp}
                    title={
                      isAr
                        ? 'اسحب بالماوس لتحريك الصورة أو الطبقة داخل الشكل'
                        : 'Drag with mouse to pan image or overlay'
                    }
                    style={{
                      maxWidth: '100%',
                      maxHeight: '240px',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      cursor: 'grab',
                      filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.45))',
                    }}
                  />
                </div>

                {activeItem && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: '#cbd5e1',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '170px',
                        }}
                      >
                        {activeItem.name}
                      </span>
                      <span style={{ color: '#a78bfa', fontSize: '10.5px' }}>
                        {
                          computeOutputDimensions(
                            activeItem.naturalWidth,
                            activeItem.naturalHeight,
                            settings,
                            activeItem.adjustment.shapeId
                          ).width
                        }
                        ×
                        {
                          computeOutputDimensions(
                            activeItem.naturalWidth,
                            activeItem.naturalHeight,
                            settings,
                            activeItem.adjustment.shapeId
                          ).height
                        }
                        px
                      </span>
                    </div>
                    <button
                      type="button"
                      id="downloadActiveGiftImgBtn"
                      onClick={() => handleDownloadSingleItem(activeItem)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '9px',
                        border: '1px solid rgba(16, 185, 129, 0.55)',
                        background:
                          'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.35))',
                        color: '#6ee7b7',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {isAr
                        ? `⬇ تنزيل هذه الصورة (${settings.exportFormat.toUpperCase()})`
                        : `⬇ Download This Image (${settings.exportFormat.toUpperCase()})`}
                    </button>
                  </div>
                )}
              </div>

              {/* Organized Batch Preview Grid */}
              <div
                id="giftCreatorBatchGrid"
                style={{
                  overflowY: 'auto',
                  padding: '4px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))',
                  gap: '12px',
                  alignContent: 'start',
                }}
              >
                {items.map((item, idx) => {
                  const isFocused = activeItem?.id === item.id;
                  const eff = resolveEffectiveItemSettings(settings, item.adjustment);
                  const shapeMeta = getGiftShapeMetadata(eff.shapeId);
                  const outDims = computeOutputDimensions(
                    item.naturalWidth,
                    item.naturalHeight,
                    settings,
                    eff.shapeId
                  );

                  return (
                    <div
                      key={item.id}
                      data-testid={`gift-image-card-${idx}`}
                      onClick={() => setActiveItemId(item.id)}
                      style={{
                        background: isFocused
                          ? 'linear-gradient(180deg, #1f1b38 0%, #151426 100%)'
                          : 'linear-gradient(180deg, #161826 0%, #10121d 100%)',
                        border: isFocused
                          ? '1.5px solid #8b5cf6'
                          : item.selected
                            ? '1px solid rgba(124, 92, 255, 0.45)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '14px',
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        boxShadow: isFocused
                          ? '0 8px 24px rgba(124, 92, 255, 0.3)'
                          : '0 4px 14px rgba(0, 0, 0, 0.3)',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease, border-color 0.15s ease',
                      }}
                    >
                      {/* Card Top Row: Selection Checkbox + Order Badge + Shape Label */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: item.selected ? '#c4b5fd' : '#94a3b8',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setItems((prev) =>
                                prev.map((it) =>
                                  it.id === item.id ? { ...it, selected: checked } : it
                                )
                              );
                            }}
                          />
                          <span>#{idx + 1}</span>
                        </label>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {isAr ? shapeMeta.nameAr : shapeMeta.nameEn}
                        </span>
                      </div>

                      {/* Live Alpha-Masked Canvas Preview */}
                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          borderRadius: '10px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          display: 'grid',
                          placeItems: 'center',
                          padding: '8px',
                          overflow: 'hidden',
                          ...previewBgStyle,
                        }}
                      >
                        <canvas
                          ref={(el) => {
                            if (el) {
                              cardCanvasMapRef.current.set(item.id, el);
                            } else {
                              cardCanvasMapRef.current.delete(item.id);
                            }
                          }}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            width: 'auto',
                            height: 'auto',
                            objectFit: 'contain',
                            display: 'block',
                          }}
                        />
                      </div>

                      {/* File Name & Output Dimensions */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '4px',
                          fontSize: '10.5px',
                        }}
                      >
                        <span
                          title={item.name}
                          style={{
                            fontWeight: 700,
                            color: '#e2e8f0',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {item.name}
                        </span>
                        <span style={{ color: '#94a3b8', flexShrink: 0 }}>
                          {outDims.width}×{outDims.height}
                        </span>
                      </div>

                      {/* Card Action Buttons: Reorder, Replace, Download Single, Delete */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '4px',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: 'flex', gap: '3px' }}>
                          <button
                            type="button"
                            title={isAr ? 'تحريك لأعلى / للأول' : 'Move Earlier'}
                            disabled={idx === 0}
                            onClick={() => handleMoveItem(idx, -1)}
                            style={{
                              padding: '3px 6px',
                              borderRadius: '6px',
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: '#1a1c2c',
                              color: '#cbd5e1',
                              fontSize: '10px',
                              cursor: idx === 0 ? 'not-allowed' : 'pointer',
                              opacity: idx === 0 ? 0.4 : 1,
                            }}
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            title={isAr ? 'تحريك لأسفل / للتالي' : 'Move Later'}
                            disabled={idx === items.length - 1}
                            onClick={() => handleMoveItem(idx, 1)}
                            style={{
                              padding: '3px 6px',
                              borderRadius: '6px',
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: '#1a1c2c',
                              color: '#cbd5e1',
                              fontSize: '10px',
                              cursor: idx === items.length - 1 ? 'not-allowed' : 'pointer',
                              opacity: idx === items.length - 1 ? 0.4 : 1,
                            }}
                          >
                            ▶
                          </button>
                          <button
                            type="button"
                            title={isAr ? 'استبدال الصورة' : 'Replace Image'}
                            onClick={() => {
                              replaceTargetIdRef.current = item.id;
                              replaceInputRef.current?.click();
                            }}
                            style={{
                              padding: '3px 6px',
                              borderRadius: '6px',
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: '#1a1c2c',
                              color: '#cbd5e1',
                              fontSize: '10px',
                              cursor: 'pointer',
                            }}
                          >
                            🔄
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            title={isAr ? 'تنزيل هذه الصورة فوراً' : 'Download Image'}
                            onClick={() => handleDownloadSingleItem(item)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              border: '1px solid rgba(16, 185, 129, 0.5)',
                              background: 'rgba(16, 185, 129, 0.16)',
                              color: '#6ee7b7',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            ⬇ {isAr ? 'تنزيل' : 'Save'}
                          </button>
                          <button
                            type="button"
                            title={isAr ? 'حذف الصورة' : 'Delete Image'}
                            onClick={() => handleDeleteSingle(item.id)}
                            style={{
                              padding: '3px 7px',
                              borderRadius: '6px',
                              border: '1px solid rgba(239, 68, 68, 0.4)',
                              background: 'rgba(239, 68, 68, 0.14)',
                              color: '#fca5a5',
                              fontSize: '10.5px',
                              cursor: 'pointer',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status Footer */}
          {statusMessage && (
            <div
              role="status"
              style={{
                fontSize: '11.5px',
                color: '#a78bfa',
                fontWeight: 600,
              }}
            >
              {statusMessage}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
