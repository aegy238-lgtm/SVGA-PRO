import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Flame,
  Upload,
  Sparkles,
  Play,
  Pause,
  Search,
  Download,
  Layers,
  Check,
  X,
  RotateCcw,
  Sliders,
  Grid,
  Zap,
  Eye,
  RefreshCw,
} from 'lucide-react';
import {
  FIRE_EFFECT_CATEGORIES,
  FIRE_SHAPE_CATEGORIES,
  TOTAL_FIRE_EFFECTS_COUNT,
  TOTAL_FIRE_SHAPES_COUNT,
  FireEffectCategoryId,
  FireShapeCategoryId,
  FireEffectPreset,
  FireShapeDesign,
  FirePlacementMode,
  FireLoopMode,
  FireStudioConfig,
  DEFAULT_FIRE_STUDIO_CONFIG,
  REFERENCE_FIRE_SPRITE_SHEETS,
  ReferenceFireSpriteSheet,
  searchFireEffectsCatalog,
  searchFireShapesCatalog,
  getFireEffectById,
  getFireShapeById,
  generateFireShapeSvgMarkup,
  renderFireEffectFrameToContext,
  sortSequentialFireFiles,
  cleanFireFrameAlphaInPlace,
} from '../utils/svgaFireEngine';
import { Point2D } from '../utils/svgaShineEngine';
import { ShineTargetOption } from './SvgaShineStudioPanel';

export interface ImportedFireSequenceState {
  id: string;
  name: string;
  frames: HTMLCanvasElement[];
  frameCount: number;
  width: number;
  height: number;
  rawTotalBytes: number;
  cleanBackground: boolean;
}

export interface FireCompressionReport {
  frameCount: number;
  uniqueCount: number;
  beforeBytes: number;
  afterBytes: number;
  reductionRatio: number;
  atlasWidth: number;
  atlasHeight: number;
  cellWidth: number;
  cellHeight: number;
  singleLayerConfirmed: boolean;
}

interface SvgaFireStudioPanelProps {
  config: FireStudioConfig;
  onChangeConfig: (patch: Partial<FireStudioConfig>) => void;
  targetOptions: ShineTargetOption[];
  selectedTargetBitmap: ImageBitmap | HTMLCanvasElement | null;
  selectedTargetBounds: { x: number; y: number; w: number; h: number } | null;
  basePerimeterPoints: { x: number; y: number; nx?: number; ny?: number }[];
  compFrames: number;
  compFps: number;
  compWidth: number;
  compHeight: number;
  importedSequence: ImportedFireSequenceState | null;
  onImportSequentialFiles: (files: File[], cleanBg: boolean) => Promise<void>;
  onLoadReferenceSpriteSheet: (sheet: ReferenceFireSpriteSheet, customCols?: number, customRows?: number) => Promise<void>;
  onSliceUploadedSpriteSheet: (file: File, cols: number, rows: number, cleanBg: boolean) => Promise<void>;
  onApplyFireAsSingleLayer: (mode: 'base_layer' | 'library_effect' | 'imported_sequence' | 'fire_shape') => Promise<void>;
  onExportSingleLayerSvga: () => Promise<void>;
  onExportSingleLayerSvg: () => void;
  isProcessing: boolean;
  progressPercent: number;
  progressLabel: string;
  errorText: string | null;
  onCancelProcessing: () => void;
  onRetryLastAction: () => void;
  lastCompressionReport: FireCompressionReport | null;
  compactMode?: boolean;
}

export const SvgaFireStudioPanel: React.FC<SvgaFireStudioPanelProps> = ({
  config,
  onChangeConfig,
  targetOptions,
  selectedTargetBitmap,
  selectedTargetBounds,
  basePerimeterPoints,
  compFrames,
  compFps,
  compWidth,
  compHeight,
  importedSequence,
  onImportSequentialFiles,
  onLoadReferenceSpriteSheet,
  onSliceUploadedSpriteSheet,
  onApplyFireAsSingleLayer,
  onExportSingleLayerSvga,
  onExportSingleLayerSvg,
  isProcessing,
  progressPercent,
  progressLabel,
  errorText,
  onCancelProcessing,
  onRetryLastAction,
  lastCompressionReport,
  compactMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<'base_fire' | 'import_seq' | 'effects_50k' | 'shapes_5k'>('base_fire');
  const [effectCategory, setEffectCategory] = useState<FireEffectCategoryId | 'all'>('all');
  const [effectQuery, setEffectQuery] = useState('');
  const [effectPage, setEffectPage] = useState(0);

  const [shapeCategory, setShapeCategory] = useState<FireShapeCategoryId | 'all'>('all');
  const [shapeQuery, setShapeQuery] = useState('');
  const [shapePage, setShapePage] = useState(0);

  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [cleanBgOnImport, setCleanBgOnImport] = useState(true);
  const [sheetCols, setSheetCols] = useState(2);
  const [sheetRows, setSheetRows] = useState(8);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const seqInputRef = useRef<HTMLInputElement | null>(null);
  const sheetInputRef = useRef<HTMLInputElement | null>(null);

  const selectedEffect = useMemo(
    () => getFireEffectById(config.selectedEffectId || 1),
    [config.selectedEffectId]
  );

  const selectedShape = useMemo(
    () => getFireShapeById(config.selectedShapeId || 1),
    [config.selectedShapeId]
  );

  const effectsResult = useMemo(
    () =>
      searchFireEffectsCatalog({
        categoryId: effectCategory === 'all' ? 'ALL' : effectCategory,
        query: effectQuery,
        page: effectPage + 1,
        pageSize: 18,
      }),
    [effectCategory, effectQuery, effectPage]
  );

  const shapesResult = useMemo(
    () =>
      searchFireShapesCatalog({
        categoryId: shapeCategory === 'all' ? 'ALL' : shapeCategory,
        query: shapeQuery,
        page: shapePage + 1,
        pageSize: 12,
      }),
    [shapeCategory, shapeQuery, shapePage]
  );

  const totalPreviewFrames = useMemo(() => {
    if (config.sourceType === 'imported_sequence' && importedSequence && importedSequence.frameCount > 0) {
      return config.fitToComposition ? Math.max(1, compFrames) : importedSequence.frameCount;
    }
    return config.fitToComposition ? Math.max(1, compFrames) : Math.max(8, config.customFrameCount || compFrames);
  }, [config.sourceType, config.fitToComposition, config.customFrameCount, compFrames, importedSequence]);

  // Live preview animation loop
  useEffect(() => {
    if (!previewPlaying) return;
    const effectiveFps = Math.max(4, Math.min(60, Math.round(compFps * (config.playbackSpeed || 1))));
    const intervalMs = Math.max(16, Math.round(1000 / effectiveFps));
    const timer = window.setInterval(() => {
      setPreviewFrame((prev) => (prev + 1) % Math.max(1, totalPreviewFrames));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [previewPlaying, compFps, config.playbackSpeed, totalPreviewFrames]);

  // Draw live preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Subtle dark checkerboard background so alpha transparency is crystal-clear
    const tile = 12;
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        ctx.fillStyle = ((x / tile + y / tile) & 1) === 0 ? '#11131a' : '#181b24';
        ctx.fillRect(x, y, tile, tile);
      }
    }

    // Draw base layer if present and enabled
    if (selectedTargetBitmap) {
      ctx.save();
      const bw = selectedTargetBitmap.width || W;
      const bh = selectedTargetBitmap.height || H;
      const fitScale = Math.min((W * 0.68) / Math.max(1, bw), (H * 0.68) / Math.max(1, bh));
      const dw = bw * fitScale;
      const dh = bh * fitScale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      ctx.globalAlpha = 0.92;
      ctx.drawImage(selectedTargetBitmap, dx, dy, dw, dh);
      ctx.restore();
    }

    if (
      (activeTab === 'import_seq' || config.sourceType === 'imported_sequence') &&
      importedSequence &&
      importedSequence.frames.length > 0
    ) {
      const seqLen = importedSequence.frames.length;
      const progress =
        totalPreviewFrames > 1 ? previewFrame / (totalPreviewFrames - 1) : 0;
      let seqIdx = 0;
      if (config.loopMode === 'pingpong') {
        const tri = progress <= 0.5 ? progress * 2 : (1 - progress) * 2;
        seqIdx = Math.min(seqLen - 1, Math.floor(tri * seqLen));
      } else {
        seqIdx = Math.min(seqLen - 1, Math.floor((progress * seqLen) % seqLen));
      }
      const frameCanvas = importedSequence.frames[seqIdx];
      if (frameCanvas) {
        ctx.save();
        ctx.globalAlpha = Math.max(0.05, Math.min(1, config.opacity / 100));
        const fitScale =
          Math.min((W * 0.86) / Math.max(1, frameCanvas.width), (H * 0.86) / Math.max(1, frameCanvas.height)) *
          (config.scale / 100);
        const dw = frameCanvas.width * fitScale;
        const dh = frameCanvas.height * fitScale;
        ctx.translate(W / 2 + config.offsetX * 0.25, H / 2 + config.offsetY * 0.25);
        ctx.rotate((config.rotation * Math.PI) / 180);
        ctx.drawImage(frameCanvas, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      }
      return;
    }

    // Scale base perimeter points to preview canvas if generating on base layer
    let previewPerimeter: { x: number; y: number; nx: number; ny: number }[] | undefined = undefined;
    if (basePerimeterPoints.length >= 6 && selectedTargetBounds) {
      const sx = (W * 0.68) / Math.max(1, selectedTargetBounds.w);
      const sy = (H * 0.68) / Math.max(1, selectedTargetBounds.h);
      const scale = Math.min(sx, sy);
      const ox = (W - selectedTargetBounds.w * scale) / 2;
      const oy = (H - selectedTargetBounds.h * scale) / 2;
      previewPerimeter = basePerimeterPoints.map((pt) => ({
        x: ox + (pt.x - selectedTargetBounds.x) * scale,
        y: oy + (pt.y - selectedTargetBounds.y) * scale,
        nx: pt.nx ?? 0,
        ny: pt.ny ?? -1,
      }));
    }

    renderFireEffectFrameToContext(
      ctx,
      W,
      H,
      selectedEffect,
      previewFrame,
      totalPreviewFrames,
      {
        intensityScale: config.flameIntensity,
        densityScale: config.flameDensity,
        spreadScale: config.flameSpread,
        windAngleOffset: config.flameDirection,
        placementMode: config.placementMode,
        perimeterPoints: previewPerimeter,
      }
    );
  }, [
    previewFrame,
    totalPreviewFrames,
    selectedEffect,
    selectedTargetBitmap,
    selectedTargetBounds,
    basePerimeterPoints,
    config,
    activeTab,
    importedSequence,
  ]);

  const handleSelectEffect = useCallback(
    (preset: FireEffectPreset) => {
      onChangeConfig({
        selectedEffectId: preset.id,
        sourceType: config.targetKey ? 'base_layer_generated' : 'library_effect',
      });
    },
    [onChangeConfig, config.targetKey]
  );

  const handleSelectShape = useCallback(
    (shape: FireShapeDesign) => {
      onChangeConfig({
        selectedShapeId: shape.id,
        sourceType: 'fire_shape',
      });
    },
    [onChangeConfig]
  );

  const formatBytes = (b: number) => {
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(2)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${b} B`;
  };

  return (
    <div
      dir="rtl"
      className="flex flex-col gap-2.5 rounded-xl border border-orange-500/35 bg-gradient-to-b from-[#1a1110]/95 via-[#121016]/95 to-[#0d0d12]/95 p-3 text-right shadow-xl"
      data-testid="svga-fire-studio-panel"
    >
      {/* Studio Header */}
      <div className="flex items-center justify-between gap-2 border-b border-orange-500/20 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-md shadow-orange-600/30">
            <Flame className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[12px] font-bold text-orange-200 flex items-center gap-1.5">
              <span>🔥 Fire Effects Studio – استوديو التأثيرات النارية</span>
              <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-orange-300 border border-orange-500/30">
                Layer واحد
              </span>
            </div>
            <div className="text-[10px] text-zinc-400">
              50,000 تأثير ناري · 5,000 شكل لهب · استيراد إطارات متتابعة · توليد نار على الطبقة
            </div>
          </div>
        </div>
      </div>

      {/* Live Preview Stage + Single-Layer Telemetry */}
      <div className="relative overflow-hidden rounded-lg border border-orange-500/30 bg-[#0b0c10]">
        <canvas
          ref={previewCanvasRef}
          width={280}
          height={compactMode ? 140 : 168}
          className="w-full h-auto block"
          data-testid="fire-studio-preview-canvas"
        />
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded bg-black/75 px-2 py-0.5 text-[10px] text-orange-200 border border-orange-500/30">
          <Flame className="h-3 w-3 text-orange-400" />
          <span className="truncate max-w-[165px]">
            {config.sourceType === 'imported_sequence' && importedSequence
              ? `${importedSequence.name} (${importedSequence.frameCount}F)`
              : `${selectedEffect.nameAr} (#${selectedEffect.id})`}
          </span>
        </div>
        <div className="absolute bottom-1.5 inset-x-1.5 flex items-center justify-between gap-1 rounded bg-black/80 px-2 py-1 text-[10px] text-zinc-300">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPreviewPlaying((p) => !p)}
              className="flex items-center gap-1 rounded bg-orange-500/25 hover:bg-orange-500/40 px-1.5 py-0.5 text-orange-200 border border-orange-500/30"
              title={previewPlaying ? 'إيقاف المعاينة' : 'تشغيل المعاينة'}
            >
              {previewPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              <span>{previewPlaying ? 'مباشر' : 'متوقف'}</span>
            </button>
            <span className="font-mono text-[9px] text-zinc-400">
              F{previewFrame + 1}/{totalPreviewFrames}
            </span>
          </div>
          <span className="text-[9px] text-emerald-300 font-semibold">
            Alpha شفاف · Layer واحد فقط
          </span>
        </div>
      </div>

      {/* Progress / Error / Compression Status */}
      {isProcessing && (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-2 text-[11px]"
          data-testid="fire-studio-progress-box"
        >
          <div className="flex items-center justify-between text-amber-200 mb-1">
            <span>{progressLabel || 'جاري بناء وضغط التأثير الناري في طبقة واحدة...'}</span>
            <span className="font-mono font-bold">{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 transition-all duration-150"
              style={{ width: `${Math.max(4, Math.min(100, progressPercent))}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={onCancelProcessing}
              className="flex items-center gap-1 rounded bg-red-500/20 hover:bg-red-500/35 px-2 py-0.5 text-[10px] text-red-200 border border-red-500/30"
            >
              <X className="h-3 w-3" />
              <span>إلغاء العملية</span>
            </button>
          </div>
        </div>
      )}

      {errorText && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-500/40 bg-red-950/30 p-2 text-[11px] text-red-200">
          <span>{errorText}</span>
          <button
            type="button"
            onClick={onRetryLastAction}
            className="flex items-center gap-1 rounded bg-red-500/25 hover:bg-red-500/40 px-2 py-0.5 text-[10px] text-red-100 border border-red-500/30"
          >
            <RefreshCw className="h-3 w-3" />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      )}

      {lastCompressionReport && !isProcessing && (
        <div
          className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1.5 text-[10px] text-emerald-200 flex flex-wrap items-center justify-between gap-1"
          data-testid="fire-compression-report"
        >
          <span>
            ✅ <strong>Layer واحد فقط</strong> ({lastCompressionReport.frameCount} إطار ←{' '}
            {lastCompressionReport.uniqueCount} خلية فريدة)
          </span>
          <span className="font-mono text-emerald-300">
            قبل: {formatBytes(lastCompressionReport.beforeBytes)} ← بعد:{' '}
            {formatBytes(lastCompressionReport.afterBytes)} (وفر{' '}
            {Math.round(lastCompressionReport.reductionRatio * 100)}%)
          </span>
        </div>
      )}

      {/* 4 Main Studio Mode Tabs */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#0c0d12] p-1 border border-white/10">
        <button
          type="button"
          data-testid="fire-tab-base-layer"
          onClick={() => setActiveTab('base_fire')}
          className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition ${
            activeTab === 'base_fire'
              ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          <Zap className="h-3 w-3" />
          <span>نار على الطبقة الأساسية</span>
        </button>
        <button
          type="button"
          data-testid="fire-tab-import-seq"
          onClick={() => setActiveTab('import_seq')}
          className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition ${
            activeTab === 'import_seq'
              ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          <Upload className="h-3 w-3" />
          <span>استيراد إطارات (100+)</span>
        </button>
        <button
          type="button"
          data-testid="fire-tab-50k-effects"
          onClick={() => setActiveTab('effects_50k')}
          className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition ${
            activeTab === 'effects_50k'
              ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          <Flame className="h-3 w-3" />
          <span>50,000 تأثير ناري</span>
        </button>
        <button
          type="button"
          data-testid="fire-tab-5k-shapes"
          onClick={() => setActiveTab('shapes_5k')}
          className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition ${
            activeTab === 'shapes_5k'
              ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          <Sparkles className="h-3 w-3" />
          <span>5,000 شكل وتصميم</span>
        </button>
      </div>

      {/* TAB 1: Generate Fire on Base Layer */}
      {activeTab === 'base_fire' && (
        <div className="flex flex-col gap-2 rounded-lg border border-orange-500/20 bg-black/30 p-2.5">
          <div className="text-[11px] font-bold text-orange-300 flex items-center justify-between">
            <span>⚡ Generate Fire on Base Layer – نار موجية على الطبقة</span>
            <span className="text-[9px] text-zinc-400">
              {basePerimeterPoints.length > 0
                ? `${basePerimeterPoints.length} نقطة محيط`
                : 'محيط تلقائي'}
            </span>
          </div>

          <label className="text-[10px] text-zinc-300">
            1. اختر الطبقة الأساسية المستهدفة (Base Layer):
          </label>
          <select
            value={config.targetKey || ''}
            onChange={(e) =>
              onChangeConfig({
                targetKey: e.target.value || null,
                sourceType: 'base_layer_generated',
              })
            }
            data-testid="fire-base-layer-select"
            className="w-full rounded border border-orange-500/30 bg-[#14151f] px-2 py-1.5 text-[11px] text-zinc-100"
          >
            <option value="">🌐 كامل مساحة التكوين ({compWidth}×{compHeight})</option>
            {targetOptions
              .filter((opt) => opt.id !== 'DOCUMENT')
              .map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
          </select>

          <label className="text-[10px] text-zinc-300 mt-1">
            2. موضع وتوزيع النيران حول العنصر (Placement & Wave Mode):
          </label>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                { id: 'around_full', label: '🔥 حول العنصر بالكامل 360°' },
                { id: 'bottom_rising', label: '⬆️ من الأسفل للأعلى' },
                { id: 'sides_wings', label: '🪽 من الأطراف والجانبين' },
                { id: 'top_crown', label: '👑 تاج ناري علوي' },
                { id: 'inner_aura', label: '✨ توهج وهالة نارية داخلية' },
              ] as { id: FirePlacementMode; label: string }[]
            ).map((pm) => (
              <button
                key={pm.id}
                type="button"
                onClick={() => onChangeConfig({ placementMode: pm.id })}
                className={`rounded px-2 py-1 text-[10px] border text-right transition ${
                  config.placementMode === pm.id
                    ? 'border-orange-400 bg-orange-500/25 text-orange-100 font-semibold'
                    : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                }`}
              >
                {pm.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            data-testid="generate-fire-on-base-layer-btn"
            disabled={isProcessing}
            onClick={() => onApplyFireAsSingleLayer('base_layer')}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 via-red-500 to-amber-500 px-3 py-2 text-[11px] font-bold text-white shadow-lg shadow-orange-600/25 hover:brightness-110 disabled:opacity-50"
          >
            <Flame className="h-4 w-4" />
            <span>Generate Fire on Base Layer (دمج كـ Layer واحد)</span>
          </button>
        </div>
      )}

      {/* TAB 2: Sequential Fire Frames & Sprite Sheet Importer */}
      {activeTab === 'import_seq' && (
        <div className="flex flex-col gap-2 rounded-lg border border-orange-500/20 bg-black/30 p-2.5">
          <div className="text-[11px] font-bold text-orange-300">
            📥 استيراد إطارات نارية متتابعة (حتى +100 إطار) أو Sprite Sheet
          </div>

          <input
            ref={seqInputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (files.length > 0) {
                await onImportSequentialFiles(files, cleanBgOnImport);
              }
            }}
          />

          <input
            ref={sheetInputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) {
                await onSliceUploadedSpriteSheet(file, sheetCols, sheetRows, cleanBgOnImport);
              }
            }}
          />

          <label className="flex items-center gap-2 text-[10px] text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={cleanBgOnImport}
              onChange={(e) => setCleanBgOnImport(e.target.checked)}
              className="accent-orange-500"
            />
            <span>إزالة الخلفية السوداء/الداكنة تلقائياً مع الحفاظ على قناة Alpha الناعمة</span>
          </label>

          <button
            type="button"
            data-testid="upload-sequential-fire-frames-btn"
            onClick={() => seqInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-400/50 bg-orange-500/20 hover:bg-orange-500/30 px-3 py-2 text-[11px] font-semibold text-orange-100"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>رفع مجموعة صور إطارات متتابعة (Sequential Frames 1..100+)</span>
          </button>

          {/* Sprite sheet grid slicer */}
          <div className="rounded border border-white/10 bg-[#12131c] p-2 flex flex-col gap-1.5">
            <div className="text-[10px] font-semibold text-zinc-300">
              أو تقطيع صورة Sprite Sheet متتابعة (أعمدة × صفوف):
            </div>
            <div className="grid grid-cols-3 gap-1.5 items-center">
              <div>
                <span className="text-[9px] text-zinc-400 block">أعمدة (Cols)</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={sheetCols}
                  onChange={(e) => setSheetCols(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded border border-white/15 bg-black/50 px-1.5 py-1 text-[10px] text-white"
                />
              </div>
              <div>
                <span className="text-[9px] text-zinc-400 block">صفوف (Rows)</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={sheetRows}
                  onChange={(e) => setSheetRows(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded border border-white/15 bg-black/50 px-1.5 py-1 text-[10px] text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => sheetInputRef.current?.click()}
                className="mt-3 rounded bg-amber-500/25 hover:bg-amber-500/40 border border-amber-500/40 px-2 py-1 text-[10px] font-semibold text-amber-200"
              >
                رفع وتقطيع
              </button>
            </div>
          </div>

          {/* Built-in Reference Fire Sprite Sheets from User Attachments */}
          <div className="text-[10px] font-semibold text-orange-200 mt-0.5">
            🔥 التسلسلات النارية المرجعية الجاهزة (بنقرة واحدة):
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {REFERENCE_FIRE_SPRITE_SHEETS.map((sheet) => (
              <button
                key={sheet.id}
                type="button"
                data-testid={`load-ref-sheet-${sheet.id}`}
                onClick={() => onLoadReferenceSpriteSheet(sheet)}
                className="flex flex-col items-start gap-0.5 rounded border border-orange-500/25 bg-[#161218] hover:border-orange-400/60 hover:bg-orange-500/15 p-1.5 text-right transition"
              >
                <span className="text-[10px] font-bold text-orange-200 line-clamp-1">
                  {sheet.nameAr}
                </span>
                <span className="text-[9px] text-zinc-400">
                  {sheet.frameCount} إطار متتابع ({sheet.cols}×{sheet.rows})
                </span>
              </button>
            ))}
          </div>

          {importedSequence && (
            <div className="mt-1 rounded border border-emerald-500/30 bg-emerald-950/20 p-2 text-[10px] text-emerald-200 flex items-center justify-between">
              <div>
                <div className="font-bold">{importedSequence.name}</div>
                <div className="text-[9px] text-emerald-300">
                  عدد الإطارات المكتشفة: {importedSequence.frameCount} إطار · الأبعاد:{' '}
                  {importedSequence.width}×{importedSequence.height}px
                </div>
              </div>
              <button
                type="button"
                data-testid="apply-imported-fire-sequence-btn"
                onClick={() => onApplyFireAsSingleLayer('imported_sequence')}
                className="rounded bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white shadow"
              >
                إضافة كـ Layer واحد
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: 50,000 Fire Effects Library */}
      {activeTab === 'effects_50k' && (
        <div className="flex flex-col gap-2 rounded-lg border border-orange-500/20 bg-black/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-orange-300">
              🔥 مكتبة {TOTAL_FIRE_EFFECTS_COUNT.toLocaleString()} تأثير ناري احترافي
            </span>
            <span className="text-[9px] text-zinc-400">
              النتائج: {effectsResult.totalMatched.toLocaleString()}
            </span>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute right-2.5 top-2" />
            <input
              type="text"
              value={effectQuery}
              onChange={(e) => {
                setEffectQuery(e.target.value);
                setEffectPage(0);
              }}
              placeholder="ابحث بالاسم أو الرقم (#1 إلى #50000) مثل: تنين، أزرق، موجي..."
              data-testid="fire-50k-search-input"
              className="w-full rounded border border-white/15 bg-[#12131a] pr-8 pl-2 py-1.5 text-[10px] text-white placeholder:text-zinc-500"
            />
          </div>

          {/* Category pills */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => {
                setEffectCategory('all');
                setEffectPage(0);
              }}
              className={`shrink-0 rounded px-2 py-1 text-[9px] font-semibold border ${
                effectCategory === 'all'
                  ? 'border-orange-400 bg-orange-500/25 text-orange-100'
                  : 'border-white/10 bg-white/5 text-zinc-400'
              }`}
            >
              الكل (50,000)
            </button>
            {FIRE_EFFECT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setEffectCategory(cat.id);
                  setEffectPage(0);
                }}
                className={`shrink-0 rounded px-2 py-1 text-[9px] font-semibold border ${
                  effectCategory === cat.id
                    ? 'border-orange-400 bg-orange-500/25 text-orange-100'
                    : 'border-white/10 bg-white/5 text-zinc-400'
                }`}
              >
                {cat.nameAr} ({cat.count.toLocaleString()})
              </button>
            ))}
          </div>

          {/* Paginated Grid */}
          <div
            className="grid grid-cols-2 gap-1.5 max-h-[210px] overflow-y-auto pr-0.5"
            data-testid="fire-50k-grid"
          >
            {effectsResult.items.map((item) => {
              const isSel = item.id === config.selectedEffectId;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectEffect(item)}
                  className={`cursor-pointer rounded border p-1.5 transition flex flex-col justify-between gap-1 ${
                    isSel
                      ? 'border-orange-400 bg-orange-500/20 shadow-sm'
                      : 'border-white/10 bg-[#14151e] hover:border-orange-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[9px] text-orange-300">#{item.id}</span>
                    <div className="flex items-center gap-0.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-white/20"
                        style={{ background: item.palette.outerColor }}
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-white/20"
                        style={{ background: item.palette.midColor }}
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-white/20"
                        style={{ background: item.palette.coreColor }}
                      />
                    </div>
                  </div>
                  <div className="text-[10px] font-semibold text-zinc-100 line-clamp-1">
                    {item.nameAr}
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-zinc-400">
                    <span>{item.topology}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectEffect(item);
                        onApplyFireAsSingleLayer('library_effect');
                      }}
                      className="rounded bg-orange-500/30 hover:bg-orange-500/50 px-1.5 py-0.5 text-[9px] font-bold text-orange-100"
                    >
                      تطبيق
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Bar */}
          <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-400">
            <button
              type="button"
              disabled={effectPage <= 0}
              onClick={() => setEffectPage((p) => Math.max(0, p - 1))}
              className="rounded border border-white/10 bg-white/5 px-2 py-0.5 disabled:opacity-40"
            >
              السابق
            </button>
            <span>
              صفحة {effectPage + 1} من{' '}
              {Math.max(1, Math.ceil(effectsResult.totalMatched / 18)).toLocaleString()}
            </span>
            <button
              type="button"
              disabled={(effectPage + 1) * 18 >= effectsResult.totalMatched}
              onClick={() => setEffectPage((p) => p + 1)}
              className="rounded border border-white/10 bg-white/5 px-2 py-0.5 disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: 5,000 Fire Shapes & Designs Library */}
      {activeTab === 'shapes_5k' && (
        <div className="flex flex-col gap-2 rounded-lg border border-orange-500/20 bg-black/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-orange-300">
              ✨ مكتبة {TOTAL_FIRE_SHAPES_COUNT.toLocaleString()} شكل وتصميم ناري SVG
            </span>
            <span className="text-[9px] text-zinc-400">
              النتائج: {shapesResult.totalMatched.toLocaleString()}
            </span>
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute right-2.5 top-2" />
            <input
              type="text"
              value={shapeQuery}
              onChange={(e) => {
                setShapeQuery(e.target.value);
                setShapePage(0);
              }}
              placeholder="ابحث في 5,000 شكل ناري (#1 إلى #5000)..."
              data-testid="fire-5k-shapes-search-input"
              className="w-full rounded border border-white/15 bg-[#12131a] pr-8 pl-2 py-1.5 text-[10px] text-white placeholder:text-zinc-500"
            />
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => {
                setShapeCategory('all');
                setShapePage(0);
              }}
              className={`shrink-0 rounded px-2 py-1 text-[9px] font-semibold border ${
                shapeCategory === 'all'
                  ? 'border-orange-400 bg-orange-500/25 text-orange-100'
                  : 'border-white/10 bg-white/5 text-zinc-400'
              }`}
            >
              الكل (5,000)
            </button>
            {FIRE_SHAPE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setShapeCategory(cat.id);
                  setShapePage(0);
                }}
                className={`shrink-0 rounded px-2 py-1 text-[9px] font-semibold border ${
                  shapeCategory === cat.id
                    ? 'border-orange-400 bg-orange-500/25 text-orange-100'
                    : 'border-white/10 bg-white/5 text-zinc-400'
                }`}
              >
                {cat.nameAr} ({cat.count})
              </button>
            ))}
          </div>

          <div
            className="grid grid-cols-2 gap-1.5 max-h-[210px] overflow-y-auto pr-0.5"
            data-testid="fire-5k-shapes-grid"
          >
            {shapesResult.items.map((sh) => {
              const isSel = sh.id === config.selectedShapeId;
              const svgPreview = generateFireShapeSvgMarkup(sh, { width: 72, height: 72 });
              return (
                <div
                  key={sh.id}
                  onClick={() => handleSelectShape(sh)}
                  className={`cursor-pointer rounded border p-1.5 transition flex items-center gap-2 ${
                    isSel
                      ? 'border-orange-400 bg-orange-500/20'
                      : 'border-white/10 bg-[#14151e] hover:border-orange-500/40'
                  }`}
                >
                  <div
                    className="h-11 w-11 shrink-0 rounded bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: svgPreview }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[9px] text-orange-300">#{sh.id}</div>
                    <div className="text-[10px] font-semibold text-zinc-100 truncate">
                      {sh.nameAr}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectShape(sh);
                        onApplyFireAsSingleLayer('fire_shape');
                      }}
                      className="mt-0.5 rounded bg-orange-500/30 hover:bg-orange-500/50 px-1.5 py-0.5 text-[9px] font-bold text-orange-100"
                    >
                      دمج كـ Layer واحد
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-400">
            <button
              type="button"
              disabled={shapePage <= 0}
              onClick={() => setShapePage((p) => Math.max(0, p - 1))}
              className="rounded border border-white/10 bg-white/5 px-2 py-0.5 disabled:opacity-40"
            >
              السابق
            </button>
            <span>
              صفحة {shapePage + 1} من{' '}
              {Math.max(1, Math.ceil(shapesResult.totalMatched / 12)).toLocaleString()}
            </span>
            <button
              type="button"
              disabled={(shapePage + 1) * 12 >= shapesResult.totalMatched}
              onClick={() => setShapePage((p) => p + 1)}
              className="rounded border border-white/10 bg-white/5 px-2 py-0.5 disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>
      )}

      {/* Universal Fire Physics, Timing & Transform Sliders */}
      <div className="rounded-lg border border-white/10 bg-[#111219] p-2.5 flex flex-col gap-2">
        <div className="text-[10px] font-bold text-orange-200 flex items-center justify-between">
          <span>⚙️ خصائص اللهب والتوقيت والشفافية (تحديث مباشر)</span>
          <button
            type="button"
            onClick={() =>
              onChangeConfig({
                flameIntensity: DEFAULT_FIRE_STUDIO_CONFIG.flameIntensity,
                flameDensity: DEFAULT_FIRE_STUDIO_CONFIG.flameDensity,
                flameSpread: DEFAULT_FIRE_STUDIO_CONFIG.flameSpread,
                flameDirection: DEFAULT_FIRE_STUDIO_CONFIG.flameDirection,
                playbackSpeed: DEFAULT_FIRE_STUDIO_CONFIG.playbackSpeed,
                opacity: 100,
                scale: 100,
                rotation: 0,
              })
            }
            className="text-[9px] text-zinc-400 hover:text-orange-300 flex items-center gap-0.5"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>إعادة ضبط</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="flex justify-between text-[9px] text-zinc-300">
              <span>قوة اللهب (Intensity)</span>
              <span className="font-mono text-orange-300">{config.flameIntensity}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={240}
              value={config.flameIntensity}
              onChange={(e) => onChangeConfig({ flameIntensity: Number(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-[9px] text-zinc-300">
              <span>كثافة النار والشرارات</span>
              <span className="font-mono text-orange-300">{config.flameDensity}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={240}
              value={config.flameDensity}
              onChange={(e) => onChangeConfig({ flameDensity: Number(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-[9px] text-zinc-300">
              <span>انتشار اللهب (Spread)</span>
              <span className="font-mono text-orange-300">{config.flameSpread}px</span>
            </div>
            <input
              type="range"
              min={4}
              max={160}
              value={config.flameSpread}
              onChange={(e) => onChangeConfig({ flameSpread: Number(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-[9px] text-zinc-300">
              <span>سرعة التشغيل (Speed)</span>
              <span className="font-mono text-orange-300">{config.playbackSpeed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.2}
              max={3.5}
              step={0.1}
              value={config.playbackSpeed}
              onChange={(e) => onChangeConfig({ playbackSpeed: Number(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-[9px] text-zinc-300">
              <span>اتجاه اللهب والرياح</span>
              <span className="font-mono text-orange-300">{config.flameDirection}°</span>
            </div>
            <input
              type="range"
              min={-90}
              max={90}
              value={config.flameDirection}
              onChange={(e) => onChangeConfig({ flameDirection: Number(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-[9px] text-zinc-300">
              <span>الشفافية (Alpha Opacity)</span>
              <span className="font-mono text-orange-300">{config.opacity}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              value={config.opacity}
              onChange={(e) => onChangeConfig({ opacity: Number(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </div>
        </div>

        {/* Loop Mode & Composition Sync */}
        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-white/10">
          <div>
            <span className="text-[9px] text-zinc-400 block mb-0.5">نمط التكرار (Loop):</span>
            <select
              value={config.loopMode}
              onChange={(e) => onChangeConfig({ loopMode: e.target.value as FireLoopMode })}
              className="w-full rounded border border-white/15 bg-black/50 px-1.5 py-1 text-[10px] text-white"
            >
              <option value="loop">🔁 تكرار مستمر (Loop)</option>
              <option value="once">1️⃣ تشغيل مرة واحدة (Once)</option>
              <option value="pingpong">↔️ ذهاب وإياب (Ping-Pong)</option>
            </select>
          </div>
          <div>
            <span className="text-[9px] text-zinc-400 block mb-0.5">مدة التأثير مع المشروع:</span>
            <button
              type="button"
              onClick={() => onChangeConfig({ fitToComposition: !config.fitToComposition })}
              className={`w-full rounded border px-2 py-1 text-[10px] font-semibold ${
                config.fitToComposition
                  ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200'
                  : 'border-white/15 bg-white/5 text-zinc-300'
              }`}
            >
              {config.fitToComposition
                ? `✅ مطابق للمشروع (${compFrames}F)`
                : `مخصص (${config.customFrameCount}F)`}
            </button>
          </div>
        </div>
      </div>

      {/* Primary Action & Single-Layer Export Buttons */}
      <div className="flex flex-col gap-1.5 pt-0.5">
        <button
          type="button"
          data-testid="fire-apply-single-layer-main-btn"
          disabled={isProcessing}
          onClick={() =>
            onApplyFireAsSingleLayer(
              activeTab === 'import_seq' && importedSequence
                ? 'imported_sequence'
                : activeTab === 'shapes_5k'
                ? 'fire_shape'
                : activeTab === 'effects_50k'
                ? 'library_effect'
                : 'base_layer'
            )
          }
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-600 via-red-600 to-amber-500 px-3 py-2 text-[11px] font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50"
        >
          <Layers className="h-4 w-4" />
          <span>دمج وحفظ التأثير الناري في المشروع (Layer واحد فقط)</span>
        </button>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-testid="fire-export-svga-single-layer-btn"
            disabled={isProcessing}
            onClick={onExportSingleLayerSvga}
            className="flex items-center justify-center gap-1 rounded-lg border border-orange-500/40 bg-orange-500/15 hover:bg-orange-500/25 px-2.5 py-1.5 text-[10px] font-bold text-orange-200 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>تصدير SVGA (Layer واحد)</span>
          </button>
          <button
            type="button"
            data-testid="fire-export-svg-single-layer-btn"
            disabled={isProcessing}
            onClick={onExportSingleLayerSvg}
            className="flex items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1.5 text-[10px] font-bold text-amber-200 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>تصدير SVG Animation</span>
          </button>
        </div>
      </div>
    </div>
  );
};
