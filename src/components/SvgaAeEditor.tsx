import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Layers,
  Image as ImageIcon,
  Shapes,
  GitCommitHorizontal,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  FolderOpen,
  ImagePlus,
  Upload,
  ArrowLeftRight,
  Download,
  Undo2,
  Redo2,
  RotateCcw,
  X,
  Sparkles,
  MousePointer,
  Hash,
  Square,
  PenTool,
  Type,
  Hand,
  Search,
  Trash2,
  FileText,
  Pencil,
  Circle,
  Hexagon,
  Diamond,
  Eye,
  EyeOff,
  Plus,
  Check,
  Scissors,
  MoveUp,
  MoveDown,
  ArrowUpDown,
  ArrowUpToLine,
  ArrowDownToLine,
  CopyPlus,
  FlipHorizontal2,
  Clapperboard,
} from 'lucide-react';
import { parseMovie, pako, SvgaFrame, SvgaMovie } from '../utils/codecs';
import { compressPngBufferLikeReference } from '../utils/svgaImageCompressor';
import {
  LayerTransform,
  AnimatableProperty,
  LayerPropertyKeyframes,
  SpriteFrameRange,
  DEFAULT_TRANSFORM,
  computeAssetUsage,
  generateTimeRulerMarks,
  generateAfterEffectsJsxScript,
  computeSpriteFrameMatrix,
  computeAddedLayerFrameMatrix,
  buildPivotTransformMatrix,
  interpolateLayerTransform,
  computeSpriteFrameSpan,
  resolveSpriteFrameAt,
  serializeDecomposedSvga,
  invertAffine,
  parseSvgaShapeEntity,
  DecomposedExtraLayer,
  isIdentityLayerTransform,
  multiplyAffine,
  cloneSvgaFrame,
  copySpriteFramesToLayer,
  retargetCopiedFramesDimensions,
  cloneLayerPropertyKeyframes,
  mirrorSvgaFramesHorizontally,
  mirrorLayerTransformHorizontally,
  duplicateSvgaSprite,
  computeUnstretchedZoomPatch,
  AffineMatrix,
} from '../utils/svgaEditorLogic';
import {
  ShineLayerConfig,
  ShineCanvasEditSubmode,
  Point2D,
  Point2D as ShinePoint,
  SHINE_PRESETS,
  generateRectMaskContours,
  generateRingFrameMaskContours,
  traceAlphaContourFromRgba,
  projectWorldContoursToLocalClipPath,
  computeTargetDeltaMatrix,
  buildShineKeyframesFromMotionPoints,
  buildClippedShineSvgaFrames,
  renderProceduralShineBitmapAndBytes,
  featherCustomShineBitmap,
  extractShineConfigFromExistingSprite,
} from '../utils/svgaShineEngine';
import { SvgaShineStudioPanel, ShineTargetOption } from './SvgaShineStudioPanel';
import { SvgaTimelinePanel } from './SvgaTimelinePanel';
import {
  SvgaCropAndContextMenu,
  CropSelectionRect,
  ContextMenuState,
} from './SvgaCropAndContextMenu';

interface AddedLayer {
  id: string;
  assetKey: string;
  name: string;
  bitmap: ImageBitmap;
  originalBitmap?: ImageBitmap;
  originalWidth?: number;
  originalHeight?: number;
  pngBytes: Uint8Array;
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  transform: LayerTransform;
  inFrame: number;
  outFrame: number;
  copiedFrames?: SvgaFrame[];
  copiedFromKey?: string;
  copiedFromDisplayNum?: number;
  shineConfig?: ShineLayerConfig;
}

interface ShapeObject {
  id: string;
  assetKey: string;
  type: 'rectangle' | 'ellipse' | 'polygon' | 'path' | 'text';
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  text?: string;
  fontSize?: number;
  points?: { x: number; y: number }[];
  transform: LayerTransform;
  inFrame: number;
  outFrame: number;
}

export interface MergedGroup {
  id: string;
  name: string;
  spriteIds: string[];
  transform: LayerTransform;
  isUngrouped: boolean;
}

interface HistorySnapshot {
  docTransform: LayerTransform;
  layerTransforms: Record<string, LayerTransform>;
  layerKeyframes: Record<string, LayerPropertyKeyframes>;
  spriteFrameRanges: Record<number, SpriteFrameRange>;
  hiddenLayerIds: string[];
  deletedSpriteIndices: number[];
  addedLayers: AddedLayer[];
  shapes: ShapeObject[];
  mergedGroups?: MergedGroup[];
  layerOrder?: string[];
}

interface SvgaAeEditorProps {
  title?: string;
  externalSvgaFile?: File | null;
  onSyncToMotionTools?: (file: File) => void;
  aeModalOpen?: boolean;
  onCloseAeModal?: () => void;
}

async function decompressDeflate(raw: Uint8Array): Promise<Uint8Array> {
  if (pako?.inflate) {
    try {
      return pako.inflate(raw);
    } catch (_) {
      try {
        if (pako.inflateRaw) return pako.inflateRaw(raw);
      } catch (_) {}
    }
  }
  const ds = new DecompressionStream('deflate');
  return new Uint8Array(
    await new Response(new Blob([raw as any]).stream().pipeThrough(ds)).arrayBuffer()
  );
}

async function compressDeflate(raw: Uint8Array): Promise<Uint8Array> {
  if (pako?.deflate) {
    try {
      return pako.deflate(raw, { level: 9 });
    } catch (_) {}
  }
  const cs = new CompressionStream('deflate');
  return new Uint8Array(
    await new Response(new Blob([raw as any]).stream().pipeThrough(cs)).arrayBuffer()
  );
}

async function renderShapeObjectToPngBytes(sh: ShapeObject): Promise<Uint8Array> {
  const W = Math.max(4, Math.round(sh.w || 120));
  const H = Math.max(4, Math.round(sh.h || 120));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return new Uint8Array();

  const sw = Math.max(0, sh.strokeWidth ?? 2);
  const pad = Math.ceil(sw / 2) + 2;
  ctx.fillStyle = sh.color + (sh.type === 'text' ? '' : '66');
  ctx.strokeStyle = sh.strokeColor || sh.color;
  ctx.lineWidth = sw;

  if (sh.type === 'rectangle') {
    ctx.fillRect(pad, pad, Math.max(2, W - pad * 2), Math.max(2, H - pad * 2));
    if (sw > 0) ctx.strokeRect(pad, pad, Math.max(2, W - pad * 2), Math.max(2, H - pad * 2));
  } else if (sh.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      W / 2,
      H / 2,
      Math.max(2, W / 2 - pad),
      Math.max(2, H / 2 - pad),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    if (sw > 0) ctx.stroke();
  } else if (sh.type === 'polygon') {
    ctx.beginPath();
    const cx = W / 2;
    const cy = H / 2;
    const r = Math.max(4, Math.min(W, H) / 2 - pad);
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3 - Math.PI / 2;
      const px = cx + r * Math.cos(ang);
      const py = cy + r * Math.sin(ang);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    if (sw > 0) ctx.stroke();
  } else if (sh.type === 'path' && sh.points && sh.points.length >= 2) {
    ctx.beginPath();
    sh.points.forEach((pt, idx) => {
      const lx = pt.x - sh.x;
      const ly = pt.y - sh.y;
      if (idx === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    });
    if (sh.points.length >= 3) ctx.closePath();
    ctx.fill();
    if (sw > 0) ctx.stroke();
  } else if (sh.type === 'text') {
    const fSize = sh.fontSize || 32;
    ctx.font = `bold ${fSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (sw > 0) {
      ctx.lineWidth = sw;
      ctx.strokeText(sh.text || sh.name, W / 2, H / 2);
    }
    ctx.fillStyle = sh.color;
    ctx.fillText(sh.text || sh.name, W / 2, H / 2);
  }

  const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
  if (!blob) return new Uint8Array();
  return new Uint8Array(await blob.arrayBuffer());
}

const EMPTY_MOVIE: SvgaMovie = {
  w: 500,
  h: 500,
  fps: 20,
  n: 40,
  im: {},
  sp: [],
};

export default function SvgaAeEditor({
  title,
  externalSvgaFile,
  onSyncToMotionTools,
  aeModalOpen = false,
  onCloseAeModal,
}: SvgaAeEditorProps) {
  const [docName, setDocName] = useState<string>('untitled.svga');
  const [isRenamingDoc, setIsRenamingDoc] = useState<boolean>(false);
  const [fileSize, setFileSize] = useState<number>(0);
  const [lastAction, setLastAction] = useState<string>(
    'Ready — Open an SVGA file or add decomposed layers'
  );
  const [movie, setMovie] = useState<SvgaMovie>(EMPTY_MOVIE);
  const [bitmaps, setBitmaps] = useState<Record<string, ImageBitmap>>({});
  const [thumbs, setThumbs] = useState<Record<string, { url: string; w: number; h: number }>>({});

  const [leftTab, setLeftTab] = useState<'layers' | 'assets' | 'shapes' | 'signals' | null>(
    'layers'
  );
  const [activeTool, setActiveTool] = useState<
    'Move' | 'Crop' | 'Shine' | 'Frame' | 'Shape' | 'Pen' | 'Text' | 'Hand' | 'Zoom'
  >('Move');

  // selectedTarget: 'DOCUMENT' | `sprite_${idx}` | `layer_${id}` | `shape_${id}`
  const [selectedTarget, setSelectedTarget] = useState<string>('DOCUMENT');
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null);
  const [applyScope, setApplyScope] = useState<'current' | 'all'>('current');

  const [layerSearch, setLayerSearch] = useState<string>('');
  const [assetSearch, setAssetSearch] = useState<string>('');
  const [assetFilter, setAssetFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [shapeSearch, setShapeSearch] = useState<string>('');

  const [playing, setPlaying] = useState<boolean>(false);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(100);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [docTrackExpanded, setDocTrackExpanded] = useState<boolean>(true);
  const [expandedTimelineLayerIds, setExpandedTimelineLayerIds] = useState<Set<string>>(
    () => new Set()
  );
  const [scaleLinked, setScaleLinked] = useState<boolean>(false);

  const [docTransform, setDocTransform] = useState<LayerTransform>({ ...DEFAULT_TRANSFORM });
  // Keyed by `sprite_${idx}` or asset key
  const [layerTransforms, setLayerTransforms] = useState<Record<string, LayerTransform>>({});
  // Per-property keyframes keyed by layerId -> { position, scale, rotation, opacity }
  const [layerKeyframes, setLayerKeyframes] = useState<Record<string, LayerPropertyKeyframes>>({});
  // Custom timeline bar trim/offset per spriteIdx
  const [spriteFrameRanges, setSpriteFrameRanges] = useState<Record<number, SpriteFrameRange>>({});

  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(() => new Set());
  const [deletedSpriteIndices, setDeletedSpriteIndices] = useState<Set<number>>(() => new Set());
  const [isAllLayersGrouped, setIsAllLayersGrouped] = useState<boolean>(false);
  const [isGroupSublayersExpanded, setIsGroupSublayersExpanded] = useState<boolean>(false);
  const [mergedGroups, setMergedGroups] = useState<MergedGroup[]>([]);

  const [addedLayers, setAddedLayers] = useState<AddedLayer[]>([]);
  const [shapes, setShapes] = useState<ShapeObject[]>([]);
  const [penDraftPoints, setPenDraftPoints] = useState<{ x: number; y: number }[]>([]);
  const [signals, setSignals] = useState<{ id: string; frame: number; label: string }[]>([]);
  const [shineEditSubmode, setShineEditSubmode] = useState<ShineCanvasEditSubmode>('mask_points');
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  const [moveMenuLayerId, setMoveMenuLayerId] = useState<string | null>(null);
  const [moveTargetSelectId, setMoveTargetSelectId] = useState<string>('');

  // Crop selection box in canvas coordinates
  const [cropRect, setCropRect] = useState<CropSelectionRect | null>(null);
  // Right-click custom context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);

  const [editModalKey, setEditModalKey] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [editColor, setEditColor] = useState<string>('#ffe0a4');
  const [editFontSize, setEditFontSize] = useState<number>(28);
  const [editShowImage, setEditShowImage] = useState<boolean>(true);

  const [newTextModalOpen, setNewTextModalOpen] = useState<boolean>(false);
  const [newTextValue, setNewTextValue] = useState<string>('MotionTools');
  const [newTextColor, setNewTextColor] = useState<string>('#fde047');
  const [newTextStroke, setNewTextStroke] = useState<string>('#7c5cff');
  const [newTextSize, setNewTextSize] = useState<number>(36);

  // Modal to pick a source SVGA layer to copy motion/animation/frames onto an AddedLayer
  const [copyMotionModalLayerId, setCopyMotionModalLayerId] = useState<string | null>(null);
  const [copyMotionSearch, setCopyMotionSearch] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shineCompCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shineMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeHandlesRef = useRef<
    Array<{
      handle: 'tl' | 'tr' | 'br' | 'bl' | 'tm' | 'mr' | 'bm' | 'ml';
      x: number;
      y: number;
      cursor: string;
    }>
  >([]);
  const shineHandlesRef = useRef<
    Array<{
      kind: 'mask' | 'motion';
      contourIdx: number;
      pointIdx: number;
      x: number;
      y: number;
    }>
  >([]);
  const activeCenterRef = useRef<{ x: number; y: number } | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const openSvgaInputRef = useRef<HTMLInputElement | null>(null);
  const addLayerInputRef = useRef<HTMLInputElement | null>(null);
  const mergeSvgaInputRef = useRef<HTMLInputElement | null>(null);
  const replaceImgInputRef = useRef<HTMLInputElement | null>(null);

  const pushHistory = useCallback(
    (
      nextDocT: LayerTransform,
      nextLayerT: Record<string, LayerTransform>,
      nextHidden: Set<string>,
      nextDeleted: Set<number>,
      overrides?: {
        layerKeyframes?: Record<string, LayerPropertyKeyframes>;
        spriteFrameRanges?: Record<number, SpriteFrameRange>;
        addedLayers?: AddedLayer[];
        shapes?: ShapeObject[];
        mergedGroups?: MergedGroup[];
        layerOrder?: string[];
      }
    ) => {
      const snap: HistorySnapshot = {
        docTransform: { ...nextDocT },
        layerTransforms: { ...nextLayerT },
        layerKeyframes: overrides?.layerKeyframes ?? { ...layerKeyframes },
        spriteFrameRanges: overrides?.spriteFrameRanges ?? { ...spriteFrameRanges },
        hiddenLayerIds: Array.from(nextHidden),
        deletedSpriteIndices: Array.from(nextDeleted),
        addedLayers: overrides?.addedLayers ?? [...addedLayers],
        shapes: overrides?.shapes ?? [...shapes],
        mergedGroups: overrides?.mergedGroups ?? [...mergedGroups],
        layerOrder: overrides?.layerOrder ?? [...layerOrder],
      };
      setHistory((prev) => [...prev.slice(0, historyIdx + 1), snap]);
      setHistoryIdx((idx) => idx + 1);
    },
    [historyIdx, layerKeyframes, spriteFrameRanges, addedLayers, shapes, mergedGroups, layerOrder]
  );

  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      const prev = history[historyIdx - 1];
      setHistoryIdx(historyIdx - 1);
      setDocTransform(prev.docTransform);
      setLayerTransforms(prev.layerTransforms);
      setLayerKeyframes(prev.layerKeyframes || {});
      setSpriteFrameRanges(prev.spriteFrameRanges || {});
      setHiddenLayerIds(new Set(prev.hiddenLayerIds));
      setDeletedSpriteIndices(new Set(prev.deletedSpriteIndices));
      setAddedLayers(prev.addedLayers || []);
      setShapes(prev.shapes || []);
      setMergedGroups(prev.mergedGroups || []);
      if (prev.layerOrder) setLayerOrder(prev.layerOrder);
      setLastAction('رجوع للخلف / تراجع (Undo)');
    }
  }, [history, historyIdx]);

  const handleRedo = useCallback(() => {
    if (historyIdx + 1 < history.length) {
      const next = history[historyIdx + 1];
      setHistoryIdx(historyIdx + 1);
      setDocTransform(next.docTransform);
      setLayerTransforms(next.layerTransforms);
      setLayerKeyframes(next.layerKeyframes || {});
      setSpriteFrameRanges(next.spriteFrameRanges || {});
      setHiddenLayerIds(new Set(next.hiddenLayerIds));
      setDeletedSpriteIndices(new Set(next.deletedSpriteIndices));
      setAddedLayers(next.addedLayers || []);
      setShapes(next.shapes || []);
      setMergedGroups(next.mergedGroups || []);
      if (next.layerOrder) setLayerOrder(next.layerOrder);
      setLastAction('تقدم للأمام / إعادة (Redo)');
    }
  }, [history, historyIdx]);

  const loadSvgaBuffer = useCallback(
    async (buf: ArrayBuffer, name: string, reportedSize?: number) => {
      setLastAction('Decoding decomposed SVGA 2.0...');
      try {
        const raw = new Uint8Array(buf);
        if (raw[0] === 0x50 && raw[1] === 0x4b) {
          throw new Error('SVGA 1.x (ZIP) is not supported; use SVGA 2.0');
        }
        const inflated = await decompressDeflate(raw);
        const m = parseMovie(inflated);
        if (!m.w || !m.h) throw new Error('Invalid SVGA 2.0 header');
        if (!m.n) m.n = Math.max(...m.sp.map((s) => s.fr.length), 1);

        const newBitmaps: Record<string, ImageBitmap> = {};
        const newThumbs: Record<string, { url: string; w: number; h: number }> = {};

        for (const k of Object.keys(m.im)) {
          const d = m.im[k];
          if (!d || d.length < 4) continue;
          const mime =
            d[0] === 0x89
              ? 'image/png'
              : d[0] === 0xff
                ? 'image/jpeg'
                : d[0] === 0x52
                  ? 'image/webp'
                  : d[0] === 0x47
                    ? 'image/gif'
                    : 'image/png';
          try {
            const blob = new Blob([d as any], { type: mime });
            const bm = await createImageBitmap(blob);
            newBitmaps[k] = bm;
            const c = document.createElement('canvas');
            c.width = bm.width;
            c.height = bm.height;
            c.getContext('2d')?.drawImage(bm, 0, 0);
            newThumbs[k] = {
              url: c.toDataURL('image/png'),
              w: bm.width,
              h: bm.height,
            };
          } catch {}
        }

        const initialGroupId = `merged_group_main_${Date.now()}`;
        const initialSpriteIds = m.sp.map((_, idx) => `sprite_${idx}`);
        const initialGroup: MergedGroup = {
          id: initialGroupId,
          name: `📁 ${name}`,
          spriteIds: initialSpriteIds,
          transform: { ...DEFAULT_TRANSFORM },
          isUngrouped: true,
        };

        setMovie(m);
        setBitmaps(newBitmaps);
        setThumbs(newThumbs);
        setDocName(name);
        setFileSize(reportedSize ?? buf.byteLength);
        setCurrentFrame(0);
        setMergedGroups([initialGroup]);
        setSelectedTarget(initialGroupId);
        setSelectedAssetKey(null);
        setDocTransform({ ...DEFAULT_TRANSFORM });
        setLayerTransforms({});
        setLayerKeyframes({});
        setSpriteFrameRanges({});
        setHiddenLayerIds(new Set());
        setDeletedSpriteIndices(new Set());
        setExpandedTimelineLayerIds(new Set());
        setAddedLayers([]);
        setShapes([]);
        setPenDraftPoints([]);
        setCropRect(null);
        const initialLayerOrder = m.sp.map((_, i) => `sprite_${i}`);
        setLayerOrder(initialLayerOrder);
        setHistory([
          {
            docTransform: { ...DEFAULT_TRANSFORM },
            layerTransforms: {},
            layerKeyframes: {},
            spriteFrameRanges: {},
            hiddenLayerIds: [],
            deletedSpriteIndices: [],
            addedLayers: [],
            shapes: [],
            mergedGroups: [initialGroup],
            layerOrder: initialLayerOrder,
          },
        ]);
        setHistoryIdx(0);
        setLastAction(
          `Loaded ${name} (${m.sp.length} layers, ${Object.keys(m.im).length} assets)`
        );
      } catch (err: any) {
        setLastAction(`Error: ${err?.message || 'Could not decode SVGA'}`);
      }
    },
    []
  );

  useEffect(() => {
    if (externalSvgaFile) {
      externalSvgaFile.arrayBuffer().then((buf) => {
        loadSvgaBuffer(buf, externalSvgaFile.name, externalSvgaFile.size);
      });
    }
  }, [externalSvgaFile, loadSvgaBuffer]);

  // Active (non-deleted) movie view for asset usage stats
  const activeMovieForStats = useMemo<SvgaMovie>(() => {
    return {
      ...movie,
      sp: movie.sp.filter((_, idx) => !deletedSpriteIndices.has(idx)),
    };
  }, [movie, deletedSpriteIndices]);

  const assetStats = useMemo(() => computeAssetUsage(activeMovieForStats), [activeMovieForStats]);

  const filteredAssets = useMemo(() => {
    return assetStats.assets.filter((a) => {
      if (assetFilter === 'used' && a.usageCount === 0) return false;
      if (assetFilter === 'unused' && a.usageCount > 0) return false;
      if (assetSearch.trim() && !a.key.toLowerCase().includes(assetSearch.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [assetStats.assets, assetFilter, assetSearch]);

  // Unified visual stacking order from bottom (0, background) to top (N-1, foreground)
  const effectiveLayerOrder = useMemo(() => {
    const validIds = new Set<string>();
    const defaultOrder: string[] = [];
    const total = movie.sp.length;

    for (let idx = 0; idx < total; idx++) {
      if (!deletedSpriteIndices.has(idx)) {
        const id = `sprite_${idx}`;
        validIds.add(id);
        defaultOrder.push(id);
      }
    }
    for (const al of addedLayers) {
      validIds.add(al.id);
      defaultOrder.push(al.id);
    }
    for (const sh of shapes) {
      validIds.add(sh.id);
      defaultOrder.push(sh.id);
    }

    if (!layerOrder || layerOrder.length === 0) {
      return defaultOrder;
    }

    const seen = new Set<string>();
    const result: string[] = [];

    for (const id of layerOrder) {
      if (validIds.has(id) && !seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }

    for (const id of defaultOrder) {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }

    return result;
  }, [movie.sp, deletedSpriteIndices, addedLayers, shapes, layerOrder]);

  // Decomposed Sprite Layers list in top-to-bottom visual stacking order (#N down to #1)
  const spriteLayers = useMemo(() => {
    const list: {
      spriteIdx: number;
      id: string;
      displayNum: number;
      key: string;
      matteKey?: string;
      span: ReturnType<typeof computeSpriteFrameSpan>;
    }[] = [];
    const total = movie.sp.length;
    for (let idx = total - 1; idx >= 0; idx--) {
      if (deletedSpriteIndices.has(idx)) continue;
      const sp = movie.sp[idx];
      const displayNum = total - idx;
      list.push({
        spriteIdx: idx,
        id: `sprite_${idx}`,
        displayNum,
        key: sp.key || `vector_${displayNum}`,
        matteKey: sp.mk,
        span: computeSpriteFrameSpan(sp, movie.n || 40),
      });
    }
    return list;
  }, [movie.sp, movie.n, deletedSpriteIndices]);

  const filteredSpriteLayers = useMemo(() => {
    const q = layerSearch.trim().toLowerCase();
    if (!q) return spriteLayers;
    return spriteLayers.filter(
      (l) =>
        l.key.toLowerCase().includes(q) ||
        `#${l.displayNum}`.includes(q) ||
        (l.matteKey && l.matteKey.toLowerCase().includes(q))
    );
  }, [spriteLayers, layerSearch]);

  const filteredShapes = useMemo(() => {
    const q = shapeSearch.trim().toLowerCase();
    if (!q) return shapes;
    return shapes.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        (s.text && s.text.toLowerCase().includes(q))
    );
  }, [shapes, shapeSearch]);

  const filteredUnifiedLayers = useMemo(() => {
    const q = layerSearch.trim().toLowerCase();
    const reversed = [...effectiveLayerOrder].reverse();
    const items: Array<{
      id: string;
      type: 'sprite' | 'added' | 'shape';
      spriteIdx?: number;
      displayNum?: number;
      key?: string;
      matteKey?: string;
      name: string;
      span?: ReturnType<typeof computeSpriteFrameSpan>;
      addedLayer?: AddedLayer;
      shape?: ShapeObject;
    }> = [];

    for (const lid of reversed) {
      if (lid.startsWith('sprite_')) {
        const sIdx = Number(lid.replace('sprite_', ''));
        const sp = movie.sp[sIdx];
        if (!sp || deletedSpriteIndices.has(sIdx)) continue;
        const displayNum = movie.sp.length - sIdx;
        const key = sp.key || `vector_${displayNum}`;
        items.push({
          id: lid,
          type: 'sprite',
          spriteIdx: sIdx,
          displayNum,
          key,
          matteKey: sp.mk,
          name: `#${displayNum} ${key}`,
          span: computeSpriteFrameSpan(sp, movie.n || 40),
        });
      } else if (lid.startsWith('layer_')) {
        const al = addedLayers.find((l) => l.id === lid);
        if (!al) continue;
        items.push({
          id: lid,
          type: 'added',
          key: al.assetKey,
          name: al.name,
          addedLayer: al,
        });
      } else if (lid.startsWith('shape_')) {
        const sh = shapes.find((s) => s.id === lid);
        if (!sh) continue;
        items.push({
          id: lid,
          type: 'shape',
          key: sh.assetKey,
          name: sh.name,
          shape: sh,
        });
      }
    }

    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.key && item.key.toLowerCase().includes(q)) ||
        (item.displayNum && `#${item.displayNum}`.includes(q))
    );
  }, [effectiveLayerOrder, movie.sp, movie.n, deletedSpriteIndices, addedLayers, shapes, layerSearch]);

  const totalFrames = Math.max(1, movie.n || 40);
  const fps = Math.max(1, movie.fps || 20);
  const durationSec = totalFrames / fps;
  const canvasW = Math.max(1, Math.round(movie.w || 500));
  const canvasH = Math.max(1, Math.round(movie.h || 500));

  const rulerMarks = useMemo(
    () => generateTimeRulerMarks(durationSec, totalFrames, fps),
    [durationSec, totalFrames, fps]
  );

  // Playback loop
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % totalFrames);
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [playing, totalFrames, fps]);

  // Helper to resolve effective transform for any layer ID at `frame`
  const getEffectiveTransform = useCallback(
    (layerId: string, assetKey: string | undefined, frame: number): LayerTransform => {
      if (layerId === 'DOCUMENT' || layerId === 'GROUP_ALL') {
        return interpolateLayerTransform(docTransform, layerKeyframes['DOCUMENT'], frame);
      }
      if (layerId.startsWith('merged_group_')) {
        const mg = mergedGroups.find((g) => g.id === layerId);
        const base = mg ? mg.transform : DEFAULT_TRANSFORM;
        return interpolateLayerTransform(base, layerKeyframes[layerId], frame);
      }
      const added = addedLayers.find((l) => l.id === layerId);
      if (added) {
        return interpolateLayerTransform(added.transform, layerKeyframes[layerId], frame);
      }
      const sh = shapes.find((s) => s.id === layerId);
      if (sh) {
        return interpolateLayerTransform(sh.transform, layerKeyframes[layerId], frame);
      }
      const base =
        layerTransforms[layerId] ||
        (assetKey ? layerTransforms[assetKey] : undefined) ||
        DEFAULT_TRANSFORM;
      const kfs =
        layerKeyframes[layerId] || (assetKey ? layerKeyframes[assetKey] : undefined);
      return interpolateLayerTransform(base, kfs, frame);
    },
    [docTransform, layerTransforms, layerKeyframes, addedLayers, shapes, mergedGroups]
  );

  // Canvas 2D Render Loop (uses exact same matrix math as serializeDecomposedSvga)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const W = canvasW;
    const H = canvasH;
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;

    ctx.clearRect(0, 0, W, H);

    const docT = getEffectiveTransform('DOCUMENT', undefined, currentFrame);
    const docAlpha = hiddenLayerIds.has('DOCUMENT')
      ? 0
      : Math.max(0, Math.min(1, docT.opacity / 100));

    let compMinX = Infinity;
    let compMinY = Infinity;
    let compMaxX = -Infinity;
    let compMaxY = -Infinity;

    let selectedBounds: {
      x: number;
      y: number;
      w: number;
      h: number;
      mat: [number, number, number, number, number, number];
      label: string;
    } | null = null;

    // 1. Render original decomposed SVGA sprites (top group in mergedGroups renders last = visually in front)
    const spriteToGroupMap = new Map<number, MergedGroup>();
    mergedGroups.forEach((g) => {
      g.spriteIds.forEach((sid) => {
        const idx = Number(sid.replace('sprite_', ''));
        spriteToGroupMap.set(idx, g);
      });
    });

    const orderedSpriteIndices = movie.sp.map((_, i) => i).sort((a, b) => {
      const groupA = spriteToGroupMap.get(a);
      const groupB = spriteToGroupMap.get(b);
      const orderA = groupA ? mergedGroups.indexOf(groupA) : mergedGroups.length;
      const orderB = groupB ? mergedGroups.indexOf(groupB) : mergedGroups.length;
      if (orderA !== orderB) return orderB - orderA;
      return a - b;
    });

    const drawSingleSprite = (idx: number) => {
      if (deletedSpriteIndices.has(idx)) return;
      const spriteId = `sprite_${idx}`;
      const parentGroup = spriteToGroupMap.get(idx);
      if (hiddenLayerIds.has(spriteId) || (parentGroup && hiddenLayerIds.has(parentGroup.id))) return;

      const s = movie.sp[idx];
      const resolved = resolveSpriteFrameAt(s, currentFrame, totalFrames, spriteFrameRanges[idx]);
      const f = resolved.frameObj;
      if (!f || !resolved.visible) return;
      const bm = s.key ? bitmaps[s.key] : undefined;
      const hasShapes = f.shapesRaw && f.shapesRaw.length > 0;
      if (f.a <= 0.001 && !hasShapes) return;

      const lt = getEffectiveTransform(spriteId, s.key, currentFrame);
      const groupT =
        parentGroup && !parentGroup.isUngrouped
          ? getEffectiveTransform(parentGroup.id, undefined, currentFrame)
          : DEFAULT_TRANSFORM;

      const layerAlpha = Math.max(0, Math.min(1, lt.opacity / 100));
      const groupAlpha = Math.max(0, Math.min(1, groupT.opacity / 100));
      const finalAlpha = Math.min(1, Math.max(0, (f.a ?? 1) * docAlpha * groupAlpha * layerAlpha));
      if (finalAlpha <= 0.001) return;

      const assetW = bm?.width || thumbs[s.key]?.w || f.w || W;
      const assetH = bm?.height || thumbs[s.key]?.h || f.h || H;

      let mat = computeSpriteFrameMatrix(f, assetW, assetH, W, H, lt, DEFAULT_TRANSFORM);
      if (!isIdentityLayerTransform(groupT)) {
        const mGroup = buildPivotTransformMatrix(W / 2, H / 2, W / 2, H / 2, groupT);
        mat = multiplyAffine(mGroup, mat);
      }
      if (!isIdentityLayerTransform(docT)) {
        const mDoc = buildPivotTransformMatrix(W / 2, H / 2, W / 2, H / 2, docT);
        mat = multiplyAffine(mDoc, mat);
      }

      const fw = f.w > 0 ? f.w : assetW;
      const fh = f.h > 0 ? f.h : assetH;
      const fx = f.x || 0;
      const fy = f.y || 0;
      for (const p of [
        { x: fx, y: fy },
        { x: fx + fw, y: fy },
        { x: fx + fw, y: fy + fh },
        { x: fx, y: fy + fh },
      ]) {
        const sx = mat[0] * p.x + mat[2] * p.y + mat[4];
        const sy = mat[1] * p.x + mat[3] * p.y + mat[5];
        if (sx < compMinX) compMinX = sx;
        if (sy < compMinY) compMinY = sy;
        if (sx > compMaxX) compMaxX = sx;
        if (sy > compMaxY) compMaxY = sy;
      }

      ctx.save();
      ctx.globalAlpha = finalAlpha;
      ctx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);

      if (f.clipPath) {
        try {
          const clipP = new Path2D(f.clipPath);
          ctx.clip(clipP);
        } catch {}
      }

      if (bm) {
        ctx.drawImage(bm, f.x || 0, f.y || 0, f.w || bm.width, f.h || bm.height);
      }

      if (hasShapes && f.shapesRaw) {
        for (const rawSh of f.shapesRaw) {
          const parsed = parseSvgaShapeEntity(rawSh);
          ctx.save();
          if (parsed.transform) {
            const st = parsed.transform;
            ctx.transform(st[0], st[1], st[2], st[3], st[4], st[5]);
          }
          if (parsed.pathD) {
            try {
              const p2d = new Path2D(parsed.pathD);
              if (parsed.fill) {
                ctx.fillStyle = parsed.fill;
                ctx.fill(p2d);
              }
              if (parsed.stroke && (parsed.strokeWidth ?? 0) > 0) {
                ctx.strokeStyle = parsed.stroke;
                ctx.lineWidth = parsed.strokeWidth || 1;
                ctx.stroke(p2d);
              }
            } catch {}
          } else if (parsed.rect) {
            const r = parsed.rect;
            if (parsed.fill) {
              ctx.fillStyle = parsed.fill;
              ctx.fillRect(r.x, r.y, r.w, r.h);
            }
            if (parsed.stroke && (parsed.strokeWidth ?? 0) > 0) {
              ctx.strokeStyle = parsed.stroke;
              ctx.lineWidth = parsed.strokeWidth || 1;
              ctx.strokeRect(r.x, r.y, r.w, r.h);
            }
          } else if (parsed.ellipse) {
            const el = parsed.ellipse;
            ctx.beginPath();
            ctx.ellipse(el.x, el.y, Math.max(0, el.rx), Math.max(0, el.ry), 0, 0, Math.PI * 2);
            if (parsed.fill) {
              ctx.fillStyle = parsed.fill;
              ctx.fill();
            }
            if (parsed.stroke && (parsed.strokeWidth ?? 0) > 0) {
              ctx.strokeStyle = parsed.stroke;
              ctx.lineWidth = parsed.strokeWidth || 1;
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }

      ctx.restore();

      if (selectedTarget === spriteId && !isAllLayersGrouped) {
        selectedBounds = {
          x: f.x || 0,
          y: f.y || 0,
          w: f.w || assetW,
          h: f.h || assetH,
          mat,
          label: `#${movie.sp.length - idx} · ${s.key || 'layer'}`,
        };
      }
    };

    // Helper to compute target layer world matrix at any frame (for followTargetLayerTransform)
    const resolveLayerWorldMatrixAtFrame = (
      targetLayerId: string,
      frameIdx: number
    ): [number, number, number, number, number, number] | null => {
      if (!targetLayerId || targetLayerId === 'DOCUMENT') {
        const dt = getEffectiveTransform('DOCUMENT', undefined, frameIdx);
        return buildPivotTransformMatrix(W / 2, H / 2, W / 2, H / 2, dt);
      }
      if (targetLayerId.startsWith('sprite_')) {
        const sIdx = Number(targetLayerId.replace('sprite_', ''));
        const sp = movie.sp[sIdx];
        if (!sp) return null;
        const resolved = resolveSpriteFrameAt(sp, frameIdx, totalFrames, spriteFrameRanges[sIdx]);
        const f = resolved.frameObj || sp.fr.find((fr) => fr && fr.a > 0.001) || sp.fr[0];
        if (!f) return null;
        const bm = sp.key ? bitmaps[sp.key] : undefined;
        const assetW = bm?.width || thumbs[sp.key]?.w || f.w || W;
        const assetH = bm?.height || thumbs[sp.key]?.h || f.h || H;
        const lt = getEffectiveTransform(targetLayerId, sp.key, frameIdx);
        const dt = getEffectiveTransform('DOCUMENT', undefined, frameIdx);
        return computeSpriteFrameMatrix(f, assetW, assetH, W, H, lt, dt);
      }
      const targetAl = addedLayers.find((x) => x.id === targetLayerId);
      if (targetAl) {
        const lt = getEffectiveTransform(targetAl.id, targetAl.assetKey, frameIdx);
        const dt = getEffectiveTransform('DOCUMENT', undefined, frameIdx);
        return computeAddedLayerFrameMatrix(targetAl.width, targetAl.height, W, H, lt, dt);
      }
      const targetSh = shapes.find((x) => x.id === targetLayerId);
      if (targetSh) {
        const lt = getEffectiveTransform(targetSh.id, targetSh.assetKey, frameIdx);
        const dt = getEffectiveTransform('DOCUMENT', undefined, frameIdx);
        return computeAddedLayerFrameMatrix(targetSh.w, targetSh.h, W, H, lt, dt);
      }
      return null;
    };

    // Helper to draw the exact rendered alpha silhouette of a target layer at currentFrame
    // for 100% pixel-perfect destination-in masking of Shine layers (zero cut marks)
    const drawTargetAlphaMaskAtCurrentFrame = (
      maskCtx: CanvasRenderingContext2D,
      targetLayerId: string
    ): boolean => {
      maskCtx.clearRect(0, 0, W, H);
      let drewAny = false;

      const drawSingleSpriteToMask = (sIdx: number) => {
        if (deletedSpriteIndices.has(sIdx)) return;
        const spriteId = `sprite_${sIdx}`;
        const parentGroup = spriteToGroupMap.get(sIdx);
        if (hiddenLayerIds.has(spriteId) || (parentGroup && hiddenLayerIds.has(parentGroup.id))) return;
        const s = movie.sp[sIdx];
        if (!s) return;
        const resolved = resolveSpriteFrameAt(s, currentFrame, totalFrames, spriteFrameRanges[sIdx]);
        const f = resolved.frameObj;
        if (!f || !resolved.visible) return;
        const bm = s.key ? bitmaps[s.key] : undefined;
        const hasShapes = f.shapesRaw && f.shapesRaw.length > 0;
        if (f.a <= 0.001 && !hasShapes) return;

        const lt = getEffectiveTransform(spriteId, s.key, currentFrame);
        const groupT =
          parentGroup && !parentGroup.isUngrouped
            ? getEffectiveTransform(parentGroup.id, undefined, currentFrame)
            : DEFAULT_TRANSFORM;
        const layerAlpha = Math.max(0, Math.min(1, lt.opacity / 100));
        const groupAlpha = Math.max(0, Math.min(1, groupT.opacity / 100));
        const finalAlpha = Math.min(1, Math.max(0, (f.a ?? 1) * docAlpha * groupAlpha * layerAlpha));
        if (finalAlpha <= 0.001) return;

        const assetW = bm?.width || thumbs[s.key]?.w || f.w || W;
        const assetH = bm?.height || thumbs[s.key]?.h || f.h || H;
        let mat = computeSpriteFrameMatrix(f, assetW, assetH, W, H, lt, DEFAULT_TRANSFORM);
        if (!isIdentityLayerTransform(groupT)) {
          const mGroup = buildPivotTransformMatrix(W / 2, H / 2, W / 2, H / 2, groupT);
          mat = multiplyAffine(mGroup, mat);
        }
        if (!isIdentityLayerTransform(docT)) {
          const mDoc = buildPivotTransformMatrix(W / 2, H / 2, W / 2, H / 2, docT);
          mat = multiplyAffine(mDoc, mat);
        }

        maskCtx.save();
        maskCtx.globalAlpha = finalAlpha;
        maskCtx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);
        if (f.clipPath) {
          try {
            maskCtx.clip(new Path2D(f.clipPath));
          } catch {}
        }
        if (bm) {
          maskCtx.drawImage(bm, f.x || 0, f.y || 0, f.w || bm.width, f.h || bm.height);
          drewAny = true;
        }
        if (hasShapes && f.shapesRaw) {
          for (const rawSh of f.shapesRaw) {
            const parsed = parseSvgaShapeEntity(rawSh);
            maskCtx.save();
            if (parsed.transform) {
              const st = parsed.transform;
              maskCtx.transform(st[0], st[1], st[2], st[3], st[4], st[5]);
            }
            if (parsed.pathD) {
              try {
                const p2d = new Path2D(parsed.pathD);
                if (parsed.fill) {
                  maskCtx.fillStyle = parsed.fill;
                  maskCtx.fill(p2d);
                  drewAny = true;
                }
                if (parsed.stroke && (parsed.strokeWidth ?? 0) > 0) {
                  maskCtx.strokeStyle = parsed.stroke;
                  maskCtx.lineWidth = parsed.strokeWidth || 1;
                  maskCtx.stroke(p2d);
                  drewAny = true;
                }
              } catch {}
            }
            maskCtx.restore();
          }
        }
        maskCtx.restore();
      };

      const drawSingleAddedLayerToMask = (targetAl: AddedLayer) => {
        if (hiddenLayerIds.has(targetAl.id) || targetAl.shineConfig?.enabled) return;
        if (currentFrame < targetAl.inFrame || currentFrame > targetAl.outFrame) return;
        const tLt = getEffectiveTransform(targetAl.id, targetAl.assetKey, currentFrame);
        if (targetAl.copiedFrames && targetAl.copiedFrames.length > 0) {
          const cf = targetAl.copiedFrames[Math.min(currentFrame, targetAl.copiedFrames.length - 1)];
          if (!cf || (cf.a ?? 0) <= 0.001) return;
          const fAlpha = Math.max(0, Math.min(1, (cf.a ?? 1) * (tLt.opacity / 100) * docAlpha));
          if (fAlpha <= 0.001) return;
          const fw = cf.w > 0 ? cf.w : targetAl.width;
          const fh = cf.h > 0 ? cf.h : targetAl.height;
          const fx = cf.x || 0;
          const fy = cf.y || 0;
          const mat = computeSpriteFrameMatrix(cf, fw, fh, W, H, tLt, docT);
          maskCtx.save();
          maskCtx.globalAlpha = fAlpha;
          maskCtx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);
          if (cf.clipPath) {
            try {
              maskCtx.clip(new Path2D(cf.clipPath), 'evenodd');
            } catch {}
          }
          maskCtx.drawImage(targetAl.originalBitmap || targetAl.bitmap, fx, fy, fw, fh);
          maskCtx.restore();
          drewAny = true;
        } else {
          const fAlpha = Math.max(0, Math.min(1, (tLt.opacity / 100) * docAlpha));
          if (fAlpha <= 0.001) return;
          const mat = computeAddedLayerFrameMatrix(targetAl.width, targetAl.height, W, H, tLt, docT);
          maskCtx.save();
          maskCtx.globalAlpha = fAlpha;
          maskCtx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);
          maskCtx.drawImage(
            targetAl.originalBitmap || targetAl.bitmap,
            0,
            0,
            targetAl.width,
            targetAl.height
          );
          maskCtx.restore();
          drewAny = true;
        }
      };

      if (!targetLayerId || targetLayerId === 'DOCUMENT') {
        orderedSpriteIndices.forEach((sIdx) => drawSingleSpriteToMask(sIdx));
        addedLayers.forEach((l) => drawSingleAddedLayerToMask(l));
        return drewAny;
      }

      if (targetLayerId.startsWith('sprite_')) {
        const sIdx = Number(targetLayerId.replace('sprite_', ''));
        drawSingleSpriteToMask(sIdx);
        return drewAny;
      }

      if (targetLayerId.startsWith('merged_group_')) {
        const mg = mergedGroups.find((g) => g.id === targetLayerId);
        if (mg) {
          mg.spriteIds.forEach((sid) => {
            const sIdx = Number(sid.replace('sprite_', ''));
            drawSingleSpriteToMask(sIdx);
          });
        }
        return drewAny;
      }

      const targetAl = addedLayers.find((x) => x.id === targetLayerId);
      if (targetAl) {
        drawSingleAddedLayerToMask(targetAl);
        return drewAny;
      }

      return drewAny;
    };

    // 2. Render added decomposed image layers helper (supporting static/keyframed, copied SVGA sprite motion, and Shine clipPath + destination-in alpha layers)
    const drawSingleAddedLayer = (al: AddedLayer) => {
      if (hiddenLayerIds.has(al.id)) return;
      if (currentFrame < al.inFrame || currentFrame > al.outFrame) return;
      const lt = getEffectiveTransform(al.id, al.assetKey, currentFrame);

      // Compute optional targetDeltaMatrix if this is a Shine layer locked to a moving target layer
      let shineTargetDelta: [number, number, number, number, number, number] | null = null;
      if (
        al.shineConfig?.enabled &&
        al.shineConfig.followTargetLayerTransform &&
        al.shineConfig.targetLayerId &&
        al.shineConfig.targetLayerId !== 'DOCUMENT'
      ) {
        const refFrame = al.shineConfig.referenceFrame ?? 0;
        const matRef = resolveLayerWorldMatrixAtFrame(al.shineConfig.targetLayerId, refFrame);
        const matCur = resolveLayerWorldMatrixAtFrame(al.shineConfig.targetLayerId, currentFrame);
        if (matRef && matCur) {
          const invRef = invertAffine(matRef);
          if (invRef) {
            shineTargetDelta = multiplyAffine(matCur, invRef);
          }
        }
      }

      if (al.copiedFrames && al.copiedFrames.length > 0 && !al.shineConfig?.enabled) {
        const cf = al.copiedFrames[Math.min(currentFrame, al.copiedFrames.length - 1)];
        if (!cf || (cf.a ?? 0) <= 0.001) return;
        const finalAlpha = Math.max(
          0,
          Math.min(1, (cf.a ?? 1) * (lt.opacity / 100) * docAlpha)
        );
        if (finalAlpha <= 0.001) return;

        const fw = cf.w > 0 ? cf.w : al.width;
        const fh = cf.h > 0 ? cf.h : al.height;
        const fx = cf.x || 0;
        const fy = cf.y || 0;
        const mat = computeSpriteFrameMatrix(cf, fw, fh, W, H, lt, docT);

        for (const p of [
          { x: fx, y: fy },
          { x: fx + fw, y: fy },
          { x: fx + fw, y: fy + fh },
          { x: fx, y: fy + fh },
        ]) {
          const sx = mat[0] * p.x + mat[2] * p.y + mat[4];
          const sy = mat[1] * p.x + mat[3] * p.y + mat[5];
          if (sx < compMinX) compMinX = sx;
          if (sy < compMinY) compMinY = sy;
          if (sx > compMaxX) compMaxX = sx;
          if (sy > compMaxY) compMaxY = sy;
        }

        ctx.save();
        ctx.globalAlpha = finalAlpha;
        ctx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);
        if (cf.clipPath) {
          try {
            const clipP = new Path2D(cf.clipPath);
            ctx.clip(clipP, 'evenodd');
          } catch {}
        }
        ctx.drawImage(al.originalBitmap || al.bitmap, fx, fy, fw, fh);
        ctx.restore();

        if (selectedTarget === al.id && !isAllLayersGrouped) {
          selectedBounds = {
            x: fx,
            y: fy,
            w: fw,
            h: fh,
            mat,
            label: `${al.name} (🎬 ${al.copiedFromKey || 'SVGA'})`,
          };
        }
      } else {
        const finalAlpha = Math.max(0, Math.min(1, (lt.opacity / 100) * docAlpha));
        if (finalAlpha <= 0.001) return;

        const mat = computeAddedLayerFrameMatrix(al.width, al.height, W, H, lt, docT);

        for (const p of [
          { x: 0, y: 0 },
          { x: al.width, y: 0 },
          { x: al.width, y: al.height },
          { x: 0, y: al.height },
        ]) {
          const sx = mat[0] * p.x + mat[2] * p.y + mat[4];
          const sy = mat[1] * p.x + mat[3] * p.y + mat[5];
          if (sx < compMinX) compMinX = sx;
          if (sy < compMinY) compMinY = sy;
          if (sx > compMaxX) compMaxX = sx;
          if (sy > compMaxY) compMaxY = sy;
        }

        if (al.shineConfig?.enabled) {
          if (!shineCompCanvasRef.current) {
            shineCompCanvasRef.current = document.createElement('canvas');
          }
          const compC = shineCompCanvasRef.current;
          if (compC.width !== W || compC.height !== H) {
            compC.width = W;
            compC.height = H;
          }
          const compCtx = compC.getContext('2d');
          if (compCtx) {
            compCtx.clearRect(0, 0, W, H);
            compCtx.save();
            compCtx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);

            const useExactAlpha = al.shineConfig.exactLayerAlphaMask !== false;
            const applyPolygonClip =
              al.shineConfig.maskContours.length > 0 &&
              (!useExactAlpha || al.shineConfig.maskMode !== 'auto_layer_contour');

            if (applyPolygonClip) {
              const dynamicClipD = projectWorldContoursToLocalClipPath(
                al.shineConfig.maskContours,
                mat,
                shineTargetDelta,
                { smoothCurve: al.shineConfig.maskMode !== 'rect_box' }
              );
              if (dynamicClipD) {
                try {
                  const clipP = new Path2D(dynamicClipD);
                  compCtx.clip(clipP, 'evenodd');
                } catch {}
              }
            }

            compCtx.drawImage(al.originalBitmap || al.bitmap, 0, 0, al.width, al.height);
            compCtx.restore();

            if (useExactAlpha) {
              if (!shineMaskCanvasRef.current) {
                shineMaskCanvasRef.current = document.createElement('canvas');
              }
              const maskC = shineMaskCanvasRef.current;
              if (maskC.width !== W || maskC.height !== H) {
                maskC.width = W;
                maskC.height = H;
              }
              const maskCtx = maskC.getContext('2d');
              if (maskCtx) {
                const hasMaskPixels = drawTargetAlphaMaskAtCurrentFrame(
                  maskCtx,
                  al.shineConfig.targetLayerId
                );
                if (hasMaskPixels) {
                  compCtx.save();
                  compCtx.globalCompositeOperation = 'destination-in';
                  compCtx.drawImage(maskC, 0, 0);
                  compCtx.restore();
                }
              }
            }

            ctx.save();
            ctx.globalAlpha = finalAlpha;
            ctx.globalCompositeOperation = al.shineConfig.blendMode || 'screen';
            ctx.drawImage(compC, 0, 0);
            ctx.restore();
          }
        } else {
          ctx.save();
          ctx.globalAlpha = finalAlpha;
          ctx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);
          ctx.drawImage(al.originalBitmap || al.bitmap, 0, 0, al.width, al.height);
          ctx.restore();

          if (selectedTarget === al.id && !isAllLayersGrouped) {
            selectedBounds = {
              x: 0,
              y: 0,
              w: al.width,
              h: al.height,
              mat,
              label: al.name,
            };
          }
        }
      }
    };

    // 3. Render added decomposed shape / path / text layers helper
    const drawSingleShape = (sh: ShapeObject) => {
      if (hiddenLayerIds.has(sh.id)) return;
      if (currentFrame < sh.inFrame || currentFrame > sh.outFrame) return;
      const lt = getEffectiveTransform(sh.id, sh.assetKey, currentFrame);
      const finalAlpha = Math.max(0, Math.min(1, (lt.opacity / 100) * docAlpha));
      if (finalAlpha <= 0.001) return;

      const mat = computeAddedLayerFrameMatrix(sh.w, sh.h, W, H, lt, docT);

      for (const p of [
        { x: 0, y: 0 },
        { x: sh.w, y: 0 },
        { x: sh.w, y: sh.h },
        { x: 0, y: sh.h },
      ]) {
        const sx = mat[0] * p.x + mat[2] * p.y + mat[4];
        const sy = mat[1] * p.x + mat[3] * p.y + mat[5];
        if (sx < compMinX) compMinX = sx;
        if (sy < compMinY) compMinY = sy;
        if (sx > compMaxX) compMaxX = sx;
        if (sy > compMaxY) compMaxY = sy;
      }

      ctx.save();
      ctx.globalAlpha = finalAlpha;
      ctx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);

      const sw = Math.max(0, sh.strokeWidth ?? 2);
      const pad = Math.ceil(sw / 2) + 2;
      ctx.fillStyle = sh.color + (sh.type === 'text' ? '' : '66');
      ctx.strokeStyle = sh.strokeColor || sh.color;
      ctx.lineWidth = sw;

      if (sh.type === 'rectangle') {
        ctx.fillRect(pad, pad, Math.max(2, sh.w - pad * 2), Math.max(2, sh.h - pad * 2));
        if (sw > 0)
          ctx.strokeRect(pad, pad, Math.max(2, sh.w - pad * 2), Math.max(2, sh.h - pad * 2));
      } else if (sh.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(
          sh.w / 2,
          sh.h / 2,
          Math.max(2, sh.w / 2 - pad),
          Math.max(2, sh.h / 2 - pad),
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        if (sw > 0) ctx.stroke();
      } else if (sh.type === 'polygon') {
        ctx.beginPath();
        const cx = sh.w / 2;
        const cy = sh.h / 2;
        const r = Math.max(4, Math.min(sh.w, sh.h) / 2 - pad);
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI) / 3 - Math.PI / 2;
          const px = cx + r * Math.cos(ang);
          const py = cy + r * Math.sin(ang);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        if (sw > 0) ctx.stroke();
      } else if (sh.type === 'path' && sh.points && sh.points.length >= 2) {
        ctx.beginPath();
        sh.points.forEach((pt, idx) => {
          const lx = pt.x - sh.x;
          const ly = pt.y - sh.y;
          if (idx === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        });
        if (sh.points.length >= 3) ctx.closePath();
        ctx.fill();
        if (sw > 0) ctx.stroke();
      } else if (sh.type === 'text') {
        const fSize = sh.fontSize || 32;
        ctx.font = `bold ${fSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (sw > 0) {
          ctx.lineWidth = sw;
          ctx.strokeText(sh.text || sh.name, sh.w / 2, sh.h / 2);
        }
        ctx.fillStyle = sh.color;
        ctx.fillText(sh.text || sh.name, sh.w / 2, sh.h / 2);
      }

      ctx.restore();

      if (selectedTarget === sh.id && !isAllLayersGrouped) {
        selectedBounds = {
          x: 0,
          y: 0,
          w: sh.w,
          h: sh.h,
          mat,
          label: sh.name,
        };
      }
    };

    // 4. Render all project layers in true visual stacking order
    for (const lid of effectiveLayerOrder) {
      if (lid.startsWith('sprite_')) {
        const sIdx = Number(lid.replace('sprite_', ''));
        if (!Number.isNaN(sIdx) && movie.sp[sIdx]) {
          drawSingleSprite(sIdx);
        }
      } else if (lid.startsWith('layer_')) {
        const al = addedLayers.find((l) => l.id === lid);
        if (al) {
          drawSingleAddedLayer(al);
        }
      } else if (lid.startsWith('shape_')) {
        const sh = shapes.find((s) => s.id === lid);
        if (sh) {
          drawSingleShape(sh);
        }
      }
    }

    // 4. Render interactive Pen tool draft points on stage
    if (activeTool === 'Pen' && penDraftPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#a78bfa';
      ctx.fillStyle = 'rgba(124, 92, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      penDraftPoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      if (penDraftPoints.length >= 3) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
      for (const pt of penDraftPoints) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#7c5cff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4b. Render interactive Shine Mask Contour Points & Motion Path Waypoints on stage
    // Only draw the specific overlay that matches shineEditSubmode (and hide during playback)
    shineHandlesRef.current = [];
    const activeShineLayer = addedLayers.find(
      (l) => l.id === selectedTarget && l.shineConfig?.enabled
    );
    if (
      activeShineLayer &&
      activeShineLayer.shineConfig &&
      !isAllLayersGrouped &&
      !playing &&
      shineEditSubmode !== 'none'
    ) {
      const sc = activeShineLayer.shineConfig;
      const nextHandles: typeof shineHandlesRef.current = [];

      ctx.save();
      if (shineEditSubmode === 'mask_points') {
        // Draw Mask Contours (Cyan for outer mask, Purple dashed for inner cutout hole)
        sc.maskContours.forEach((contour, cIdx) => {
          if (!contour || contour.length === 0) return;
          const isInner = cIdx > 0;
          ctx.beginPath();
          contour.forEach((pt, pIdx) => {
            if (pIdx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          if (contour.length >= 3) ctx.closePath();
          ctx.strokeStyle = isInner ? '#c084fc' : '#38bdf8';
          ctx.lineWidth = 1.8;
          ctx.setLineDash(isInner ? [4, 4] : [6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          contour.forEach((pt, pIdx) => {
            nextHandles.push({
              kind: 'mask',
              contourIdx: cIdx,
              pointIdx: pIdx,
              x: pt.x,
              y: pt.y,
            });
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = isInner ? '#a855f7' : '#0284c7';
            ctx.fill();
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          });
        });
      }

      if (shineEditSubmode === 'motion_points' && sc.motionPoints && sc.motionPoints.length > 0) {
        ctx.beginPath();
        sc.motionPoints.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw directional arrow head on each motion segment
        for (let i = 0; i < sc.motionPoints.length - 1; i++) {
          const pA = sc.motionPoints[i];
          const pB = sc.motionPoints[i + 1];
          const midX = (pA.x + pB.x) / 2;
          const midY = (pA.y + pB.y) / 2;
          const ang = Math.atan2(pB.y - pA.y, pB.x - pA.x);
          ctx.save();
          ctx.translate(midX, midY);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.moveTo(6, 0);
          ctx.lineTo(-5, -4.5);
          ctx.lineTo(-5, 4.5);
          ctx.closePath();
          ctx.fillStyle = '#fde047';
          ctx.fill();
          ctx.restore();
        }

        sc.motionPoints.forEach((pt, idx) => {
          nextHandles.push({
            kind: 'motion',
            contourIdx: 0,
            pointIdx: idx,
            x: pt.x,
            y: pt.y,
          });
          const isStart = idx === 0;
          const isEnd = idx === sc.motionPoints.length - 1 && sc.motionPoints.length > 1;
          const r = 7;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isStart ? '#10b981' : isEnd ? '#f43f5e' : '#f59e0b';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8.5px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`P${idx + 1}`, pt.x, pt.y);
        });
      }
      ctx.restore();
      shineHandlesRef.current = nextHandles;
    }

    // 5. Render editor selection bounding box overlay (not exported into SVGA)
    if (selectedTarget.startsWith('merged_group_')) {
      const mg = mergedGroups.find((g) => g.id === selectedTarget);
      if (mg) {
        let groupMinX = Infinity;
        let groupMinY = Infinity;
        let groupMaxX = -Infinity;
        let groupMaxY = -Infinity;

        movie.sp.forEach((s, idx) => {
          const spriteId = `sprite_${idx}`;
          if (!mg.spriteIds.includes(spriteId) || deletedSpriteIndices.has(idx) || hiddenLayerIds.has(spriteId)) return;
          const resolved = resolveSpriteFrameAt(s, currentFrame, totalFrames, spriteFrameRanges[idx]);
          const f = resolved.frameObj;
          if (!f || !resolved.visible || f.a <= 0.001) return;

          const bm = s.key ? bitmaps[s.key] : undefined;
          const assetW = bm?.width || thumbs[s.key]?.w || f.w || W;
          const assetH = bm?.height || thumbs[s.key]?.h || f.h || H;
          const lt = getEffectiveTransform(spriteId, s.key, currentFrame);
          const groupT = getEffectiveTransform(mg.id, undefined, currentFrame);

          let mat = computeSpriteFrameMatrix(f, assetW, assetH, W, H, lt, DEFAULT_TRANSFORM);
          if (!isIdentityLayerTransform(groupT)) {
            const mGroup = buildPivotTransformMatrix(W / 2, H / 2, W / 2, H / 2, groupT);
            mat = multiplyAffine(mGroup, mat);
          }
          if (!isIdentityLayerTransform(docT)) {
            const mDoc = buildPivotTransformMatrix(W / 2, H / 2, W / 2, H / 2, docT);
            mat = multiplyAffine(mDoc, mat);
          }

          const fw = f.w > 0 ? f.w : assetW;
          const fh = f.h > 0 ? f.h : assetH;
          const fx = f.x || 0;
          const fy = f.y || 0;
          for (const p of [
            { x: fx, y: fy },
            { x: fx + fw, y: fy },
            { x: fx + fw, y: fy + fh },
            { x: fx, y: fy + fh },
          ]) {
            const sx = mat[0] * p.x + mat[2] * p.y + mat[4];
            const sy = mat[1] * p.x + mat[3] * p.y + mat[5];
            if (sx < groupMinX) groupMinX = sx;
            if (sy < groupMinY) groupMinY = sy;
            if (sx > groupMaxX) groupMaxX = sx;
            if (sy > groupMaxY) groupMaxY = sy;
          }
        });

        if (Number.isFinite(groupMinX) && Number.isFinite(groupMaxX) && groupMinX < groupMaxX && groupMinY < groupMaxY) {
          selectedBounds = {
            x: groupMinX,
            y: groupMinY,
            w: groupMaxX - groupMinX,
            h: groupMaxY - groupMinY,
            mat: [1, 0, 0, 1, 0, 0],
            label: mg.name,
          };
        }
      }
    } else if (isAllLayersGrouped || selectedTarget === 'GROUP_ALL') {
      const hasContent = Number.isFinite(compMinX) && Number.isFinite(compMaxX) && compMinX < compMaxX && compMinY < compMaxY;
      const totalLayers = movie.sp.length + addedLayers.length + shapes.length;
      const bX = hasContent ? Math.max(0, compMinX) : 0;
      const bY = hasContent ? Math.max(0, compMinY) : 0;
      const bW = hasContent ? Math.min(W - bX, compMaxX - compMinX) : W;
      const bH = hasContent ? Math.min(H - bY, compMaxY - compMinY) : H;
      selectedBounds = {
        x: bX,
        y: bY,
        w: Math.max(20, bW),
        h: Math.max(20, bH),
        mat: [1, 0, 0, 1, 0, 0],
        label: `📁 مجموعة كل الطبقات (${totalLayers} طبقة)`,
      };
    } else if (!selectedBounds && selectedTarget === 'DOCUMENT') {
      const docT = getEffectiveTransform('DOCUMENT', undefined, currentFrame);
      const mat = buildPivotTransformMatrix(W / 2, H / 2, W / 2, H / 2, docT);
      selectedBounds = {
        x: 0,
        y: 0,
        w: W,
        h: H,
        mat,
        label: docName,
      };
    }

    if (selectedBounds) {
      const b = selectedBounds as {
        x: number;
        y: number;
        w: number;
        h: number;
        mat: [number, number, number, number, number, number];
        label: string;
      };
      const corners = [
        { handle: 'tl' as const, x: b.x, y: b.y },
        { handle: 'tr' as const, x: b.x + b.w, y: b.y },
        { handle: 'br' as const, x: b.x + b.w, y: b.y + b.h },
        { handle: 'bl' as const, x: b.x, y: b.y + b.h },
      ].map((pt) => ({
        handle: pt.handle,
        x: b.mat[0] * pt.x + b.mat[2] * pt.y + b.mat[4],
        y: b.mat[1] * pt.x + b.mat[3] * pt.y + b.mat[5],
      }));

      const midpoints = [
        { handle: 'tm' as const, x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 },
        { handle: 'mr' as const, x: (corners[1].x + corners[2].x) / 2, y: (corners[1].y + corners[2].y) / 2 },
        { handle: 'bm' as const, x: (corners[2].x + corners[3].x) / 2, y: (corners[2].y + corners[3].y) / 2 },
        { handle: 'ml' as const, x: (corners[3].x + corners[0].x) / 2, y: (corners[3].y + corners[0].y) / 2 },
      ];

      const center = {
        x: (corners[0].x + corners[2].x) / 2,
        y: (corners[0].y + corners[2].y) / 2,
      };

      activeHandlesRef.current = [
        { handle: 'tl', x: corners[0].x, y: corners[0].y, cursor: 'nwse-resize' },
        { handle: 'tr', x: corners[1].x, y: corners[1].y, cursor: 'nesw-resize' },
        { handle: 'br', x: corners[2].x, y: corners[2].y, cursor: 'nwse-resize' },
        { handle: 'bl', x: corners[3].x, y: corners[3].y, cursor: 'nesw-resize' },
        { handle: 'tm', x: midpoints[0].x, y: midpoints[0].y, cursor: 'ns-resize' },
        { handle: 'mr', x: midpoints[1].x, y: midpoints[1].y, cursor: 'ew-resize' },
        { handle: 'bm', x: midpoints[2].x, y: midpoints[2].y, cursor: 'ns-resize' },
        { handle: 'ml', x: midpoints[3].x, y: midpoints[3].y, cursor: 'ew-resize' },
      ];
      activeCenterRef.current = center;

      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      corners.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      ctx.stroke();

      // Shadow for interactive handles
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      // Draw 4 corner handles (prominent white squares with gold border)
      for (const pt of corners) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.fillRect(pt.x - 5, pt.y - 5, 10, 10);
        ctx.strokeRect(pt.x - 5, pt.y - 5, 10, 10);
      }

      // Draw 4 edge midpoints
      ctx.shadowBlur = 0;
      for (const pt of midpoints) {
        ctx.fillStyle = '#fef3c7';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.5;
        ctx.fillRect(pt.x - 3.5, pt.y - 3.5, 7, 7);
        ctx.strokeRect(pt.x - 3.5, pt.y - 3.5, 7, 7);
      }

      ctx.restore();
    } else {
      activeHandlesRef.current = [];
      activeCenterRef.current = null;
    }

    // 6. Render mouse-dragged Crop / Cut selection marquee overlay
    if (cropRect && cropRect.w >= 2 && cropRect.h >= 2) {
      ctx.save();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.fillRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.setLineDash([]);
      ctx.fillStyle = '#09090d';
      ctx.fillRect(cropRect.x, Math.max(0, cropRect.y - 18), 86, 17);
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(
        `✂ ${Math.round(cropRect.w)}×${Math.round(cropRect.h)}`,
        cropRect.x + 4,
        Math.max(12, cropRect.y - 6)
      );
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }, [
    movie,
    bitmaps,
    thumbs,
    currentFrame,
    getEffectiveTransform,
    hiddenLayerIds,
    deletedSpriteIndices,
    spriteFrameRanges,
    addedLayers,
    shapes,
    activeTool,
    penDraftPoints,
    selectedTarget,
    cropRect,
    canvasW,
    canvasH,
    totalFrames,
    mergedGroups,
    isAllLayersGrouped,
    shineEditSubmode,
  ]);

  const activeLayerTransform: LayerTransform = useMemo(() => {
    return getEffectiveTransform(selectedTarget, selectedAssetKey || undefined, currentFrame);
  }, [getEffectiveTransform, selectedTarget, selectedAssetKey, currentFrame]);

  // Helper to sync updated transform properties into any active per-property keyframe tracks
  const syncKeyframePatch = useCallback(
    (targetId: string, effectiveAfterPatch: LayerTransform, patch: Partial<LayerTransform>) => {
      setLayerKeyframes((prev) => {
        const pkf = prev[targetId];
        if (!pkf) return prev;
        let changed = false;
        const nextPkf: LayerPropertyKeyframes = { ...pkf };

        if (
          (patch.x !== undefined || patch.y !== undefined) &&
          pkf.position &&
          Object.keys(pkf.position).length > 0
        ) {
          nextPkf.position = {
            ...pkf.position,
            [currentFrame]: { x: effectiveAfterPatch.x, y: effectiveAfterPatch.y },
          };
          changed = true;
        }
        if (
          (patch.sx !== undefined || patch.sy !== undefined) &&
          pkf.scale &&
          Object.keys(pkf.scale).length > 0
        ) {
          nextPkf.scale = {
            ...pkf.scale,
            [currentFrame]: { sx: effectiveAfterPatch.sx, sy: effectiveAfterPatch.sy },
          };
          changed = true;
        }
        if (
          patch.rotation !== undefined &&
          pkf.rotation &&
          Object.keys(pkf.rotation).length > 0
        ) {
          nextPkf.rotation = {
            ...pkf.rotation,
            [currentFrame]: effectiveAfterPatch.rotation,
          };
          changed = true;
        }
        if (
          patch.zoom !== undefined &&
          pkf.zoom &&
          Object.keys(pkf.zoom).length > 0
        ) {
          nextPkf.zoom = {
            ...pkf.zoom,
            [currentFrame]: effectiveAfterPatch.zoom ?? 100,
          };
          changed = true;
        }
        if (patch.opacity !== undefined && pkf.opacity && Object.keys(pkf.opacity).length > 0) {
          nextPkf.opacity = {
            ...pkf.opacity,
            [currentFrame]: effectiveAfterPatch.opacity,
          };
          changed = true;
        }
        return changed ? { ...prev, [targetId]: nextPkf } : prev;
      });
    },
    [currentFrame]
  );

  const updateLayerTransformById = useCallback(
    (
      targetId: string,
      assetKey: string | null,
      patch: Partial<LayerTransform>,
      actionDesc?: string
    ) => {
      const currentEff = getEffectiveTransform(targetId, assetKey || undefined, currentFrame);
      const mergedEff: LayerTransform = { ...currentEff, ...patch };

      if (targetId === 'DOCUMENT' || targetId === 'GROUP_ALL') {
        setDocTransform((prev) => {
          const next = { ...prev, ...patch };
          pushHistory(next, layerTransforms, hiddenLayerIds, deletedSpriteIndices);
          return next;
        });
        syncKeyframePatch('DOCUMENT', mergedEff, patch);
        if (actionDesc)
          setLastAction(`${actionDesc} (${targetId === 'GROUP_ALL' ? 'مجموعة كل الطبقات' : docName})`);
        return;
      }

      if (targetId.startsWith('merged_group_')) {
        const nextGroups = mergedGroups.map((g) =>
          g.id === targetId ? { ...g, transform: { ...g.transform, ...patch } } : g
        );
        setMergedGroups(nextGroups);
        syncKeyframePatch(targetId, mergedEff, patch);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          mergedGroups: nextGroups,
        });
        const gName = mergedGroups.find((g) => g.id === targetId)?.name || targetId;
        if (actionDesc) setLastAction(`${actionDesc} (${gName})`);
        return;
      }

      const addedIdx = addedLayers.findIndex((l) => l.id === targetId);
      if (addedIdx >= 0) {
        const updatedTransform = { ...addedLayers[addedIdx].transform, ...patch };
        const nextAdded = addedLayers.map((l, i) =>
          i === addedIdx ? { ...l, transform: updatedTransform } : l
        );
        const nextLayerMap = { ...layerTransforms, [targetId]: updatedTransform };
        setAddedLayers(nextAdded);
        setLayerTransforms(nextLayerMap);
        syncKeyframePatch(targetId, mergedEff, patch);
        pushHistory(docTransform, nextLayerMap, hiddenLayerIds, deletedSpriteIndices, {
          addedLayers: nextAdded,
        });
        if (actionDesc) setLastAction(`${actionDesc} (${addedLayers[addedIdx].name})`);
        return;
      }

      const shapeIdx = shapes.findIndex((s) => s.id === targetId);
      if (shapeIdx >= 0) {
        const updatedTransform = { ...shapes[shapeIdx].transform, ...patch };
        const nextShapes = shapes.map((s, i) =>
          i === shapeIdx ? { ...s, transform: updatedTransform } : s
        );
        const nextLayerMap = { ...layerTransforms, [targetId]: updatedTransform };
        setShapes(nextShapes);
        setLayerTransforms(nextLayerMap);
        syncKeyframePatch(targetId, mergedEff, patch);
        pushHistory(docTransform, nextLayerMap, hiddenLayerIds, deletedSpriteIndices, {
          shapes: nextShapes,
        });
        if (actionDesc) setLastAction(`${actionDesc} (${shapes[shapeIdx].name})`);
        return;
      }

      // SVGA Sprite layer (`sprite_${idx}`)
      setLayerTransforms((prev) => {
        const cur =
          prev[targetId] ||
          (assetKey ? prev[assetKey] : undefined) || { ...DEFAULT_TRANSFORM };
        const next = { ...cur, ...patch };
        let nextMap: Record<string, LayerTransform>;
        if (applyScope === 'all' && assetKey) {
          nextMap = { ...prev, [assetKey]: next };
          movie.sp.forEach((sp, idx) => {
            if (sp.key === assetKey) {
              nextMap[`sprite_${idx}`] = { ...(prev[`sprite_${idx}`] || cur), ...patch };
            }
          });
        } else {
          nextMap = { ...prev, [targetId]: next };
        }
        pushHistory(docTransform, nextMap, hiddenLayerIds, deletedSpriteIndices);
        return nextMap;
      });

      syncKeyframePatch(targetId, mergedEff, patch);
      if (actionDesc) setLastAction(`${actionDesc} (${assetKey || targetId})`);
    },
    [
      getEffectiveTransform,
      currentFrame,
      addedLayers,
      shapes,
      applyScope,
      movie.sp,
      docTransform,
      layerTransforms,
      hiddenLayerIds,
      deletedSpriteIndices,
      docName,
      pushHistory,
      syncKeyframePatch,
    ]
  );

  const updateActiveTransform = (patch: Partial<LayerTransform>, actionDesc?: string) => {
    updateLayerTransformById(selectedTarget, selectedAssetKey, patch, actionDesc);
  };

  // Toggle per-property keyframe point (`position` | `scale` | `rotation` | `opacity` | `all`)
  const handleTogglePropertyKeyframe = useCallback(
    (targetId: string, prop: AnimatableProperty | 'all', atFrame?: number) => {
      const frame = atFrame ?? currentFrame;
      const currentT = getEffectiveTransform(
        targetId,
        targetId === selectedTarget ? selectedAssetKey || undefined : undefined,
        frame
      );

      setLayerKeyframes((prev) => {
        const existing: LayerPropertyKeyframes = prev[targetId] || {};
        const nextForLayer: LayerPropertyKeyframes = {
          position: { ...(existing.position || {}) },
          scale: { ...(existing.scale || {}) },
          rotation: { ...(existing.rotation || {}) },
          zoom: { ...(existing.zoom || {}) },
          opacity: { ...(existing.opacity || {}) },
        };

        if (prop === 'all') {
          const anyAtF =
            nextForLayer.position?.[frame] !== undefined ||
            nextForLayer.scale?.[frame] !== undefined ||
            nextForLayer.rotation?.[frame] !== undefined ||
            nextForLayer.zoom?.[frame] !== undefined ||
            nextForLayer.opacity?.[frame] !== undefined;
          if (anyAtF) {
            delete nextForLayer.position![frame];
            delete nextForLayer.scale![frame];
            delete nextForLayer.rotation![frame];
            delete nextForLayer.zoom![frame];
            delete nextForLayer.opacity![frame];
          } else {
            nextForLayer.position![frame] = { x: currentT.x, y: currentT.y };
            nextForLayer.scale![frame] = { sx: currentT.sx, sy: currentT.sy };
            nextForLayer.rotation![frame] = currentT.rotation;
            nextForLayer.zoom![frame] = currentT.zoom ?? 100;
            nextForLayer.opacity![frame] = currentT.opacity;
          }
        } else if (prop === 'position') {
          if (nextForLayer.position![frame] !== undefined) {
            delete nextForLayer.position![frame];
          } else {
            nextForLayer.position![frame] = { x: currentT.x, y: currentT.y };
          }
        } else if (prop === 'scale') {
          if (nextForLayer.scale![frame] !== undefined) {
            delete nextForLayer.scale![frame];
          } else {
            nextForLayer.scale![frame] = { sx: currentT.sx, sy: currentT.sy };
          }
        } else if (prop === 'rotation') {
          if (nextForLayer.rotation![frame] !== undefined) {
            delete nextForLayer.rotation![frame];
          } else {
            nextForLayer.rotation![frame] = currentT.rotation;
          }
        } else if (prop === 'zoom') {
          if (nextForLayer.zoom![frame] !== undefined) {
            delete nextForLayer.zoom![frame];
          } else {
            nextForLayer.zoom![frame] = currentT.zoom ?? 100;
          }
        } else if (prop === 'opacity') {
          if (nextForLayer.opacity![frame] !== undefined) {
            delete nextForLayer.opacity![frame];
          } else {
            nextForLayer.opacity![frame] = currentT.opacity;
          }
        }

        const updated = { ...prev, [targetId]: nextForLayer };
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          layerKeyframes: updated,
        });
        return updated;
      });

      setExpandedTimelineLayerIds((prev) => {
        const next = new Set(prev);
        next.add(targetId);
        return next;
      });

      setLastAction(`نقطة تحريك (${prop}) للطبقة ${targetId} عند الفريم ${frame}`);
    },
    [
      currentFrame,
      getEffectiveTransform,
      selectedTarget,
      selectedAssetKey,
      docTransform,
      layerTransforms,
      hiddenLayerIds,
      deletedSpriteIndices,
      pushHistory,
    ]
  );

  // Start dragging or trimming a layer bar on the timeline with the mouse
  const handleStartLayerBarDrag = useCallback(
    (
      e: React.PointerEvent<HTMLElement>,
      layerId: string,
      mode: 'move' | 'trimStart' | 'trimEnd',
      currentIn: number,
      currentOut: number,
      currentOffset = 0
    ) => {
      const startClientX = e.clientX;
      const rulerEl = rulerRef.current;
      const trackWidth = Math.max(120, (rulerEl?.getBoundingClientRect().width || 600) - 36);
      const spanLen = Math.max(0, currentOut - currentIn);

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startClientX;
        const deltaFrames = Math.round((dx / trackWidth) * Math.max(1, totalFrames - 1));

        let nextIn = currentIn;
        let nextOut = currentOut;
        let nextOffset = currentOffset;

        if (mode === 'move') {
          nextIn = Math.max(0, Math.min(totalFrames - 1 - spanLen, currentIn + deltaFrames));
          nextOut = nextIn + spanLen;
          nextOffset = currentOffset + (nextIn - currentIn);
        } else if (mode === 'trimStart') {
          nextIn = Math.max(0, Math.min(currentOut, currentIn + deltaFrames));
        } else if (mode === 'trimEnd') {
          nextOut = Math.max(currentIn, Math.min(totalFrames - 1, currentOut + deltaFrames));
        }

        if (layerId.startsWith('sprite_')) {
          const spIdx = Number(layerId.replace('sprite_', ''));
          if (Number.isFinite(spIdx)) {
            setSpriteFrameRanges((prev) => ({
              ...prev,
              [spIdx]: {
                inFrame: nextIn,
                outFrame: nextOut,
                offsetFrames: nextOffset,
              },
            }));
          }
        } else if (layerId.startsWith('layer_')) {
          setAddedLayers((prev) =>
            prev.map((l) => (l.id === layerId ? { ...l, inFrame: nextIn, outFrame: nextOut } : l))
          );
        } else if (layerId.startsWith('shape_')) {
          setShapes((prev) =>
            prev.map((s) => (s.id === layerId ? { ...s, inFrame: nextIn, outFrame: nextOut } : s))
          );
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        setLastAction(`تحديث شريط توقيت الطبقة (${layerId})`);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [totalFrames]
  );

  // Trim/Split a layer's timeline bar at the current playhead frame
  const handleSplitOrTrimLayerAtCurrentFrame = useCallback(
    (layerId: string, mode: 'trimIn' | 'trimOut') => {
      if (layerId === 'DOCUMENT') return;
      if (layerId.startsWith('sprite_')) {
        const spIdx = Number(layerId.replace('sprite_', ''));
        const sp = movie.sp[spIdx];
        if (!sp) return;
        const baseSpan = computeSpriteFrameSpan(sp, totalFrames);
        const curRange = spriteFrameRanges[spIdx] || {
          inFrame: baseSpan.firstFrame,
          outFrame: baseSpan.lastFrame,
          offsetFrames: 0,
        };
        const nextRange: SpriteFrameRange =
          mode === 'trimIn'
            ? {
                ...curRange,
                inFrame: Math.min(curRange.outFrame, currentFrame),
              }
            : {
                ...curRange,
                outFrame: Math.max(curRange.inFrame, currentFrame),
              };
        const nextMap = { ...spriteFrameRanges, [spIdx]: nextRange };
        setSpriteFrameRanges(nextMap);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          spriteFrameRanges: nextMap,
        });
        setLastAction(
          `تم قص شريط الطبقة #${movie.sp.length - spIdx} إلى الفريمات F${nextRange.inFrame}–F${nextRange.outFrame}`
        );
      } else if (layerId.startsWith('layer_')) {
        const nextAdded = addedLayers.map((l) => {
          if (l.id !== layerId) return l;
          return mode === 'trimIn'
            ? { ...l, inFrame: Math.min(l.outFrame, currentFrame) }
            : { ...l, outFrame: Math.max(l.inFrame, currentFrame) };
        });
        setAddedLayers(nextAdded);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          addedLayers: nextAdded,
        });
        setLastAction(`تم قص شريط الطبقة المضافة عند الفريم ${currentFrame}`);
      } else if (layerId.startsWith('shape_')) {
        const nextShapes = shapes.map((s) => {
          if (s.id !== layerId) return s;
          return mode === 'trimIn'
            ? { ...s, inFrame: Math.min(s.outFrame, currentFrame) }
            : { ...s, outFrame: Math.max(s.inFrame, currentFrame) };
        });
        setShapes(nextShapes);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          shapes: nextShapes,
        });
        setLastAction(`تم قص شريط الشكل عند الفريم ${currentFrame}`);
      }
    },
    [
      movie.sp,
      totalFrames,
      spriteFrameRanges,
      currentFrame,
      docTransform,
      layerTransforms,
      hiddenLayerIds,
      deletedSpriteIndices,
      addedLayers,
      shapes,
      pushHistory,
    ]
  );

  // Crop / Cut / Split selected layer region drawn with mouse on Canvas
  const handleApplyCropMode = useCallback(
    async (mode: 'keepSelected' | 'eraseSelected' | 'splitToNewLayer') => {
      if (!cropRect || cropRect.w < 4 || cropRect.h < 4) return;
      if (selectedTarget === 'DOCUMENT') {
        setLastAction('يرجى تحديد طبقة أولاً لقص جزء منها');
        return;
      }

      const docT = getEffectiveTransform('DOCUMENT', undefined, currentFrame);

      // Case A: Added Image Layer
      const addedIdx = addedLayers.findIndex((l) => l.id === selectedTarget);
      if (addedIdx >= 0) {
        const al = addedLayers[addedIdx];
        const lt = getEffectiveTransform(al.id, al.assetKey, currentFrame);
        const mat = computeAddedLayerFrameMatrix(al.width, al.height, canvasW, canvasH, lt, docT);
        const inv = invertAffine(mat);
        if (!inv) return;

        const pts = [
          { x: cropRect.x, y: cropRect.y },
          { x: cropRect.x + cropRect.w, y: cropRect.y },
          { x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h },
          { x: cropRect.x, y: cropRect.y + cropRect.h },
        ].map((p) => ({
          x: inv[0] * p.x + inv[2] * p.y + inv[4],
          y: inv[1] * p.x + inv[3] * p.y + inv[5],
        }));

        const minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
        const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))));
        const maxX = Math.min(al.width, Math.ceil(Math.max(...pts.map((p) => p.x))));
        const maxY = Math.min(al.height, Math.ceil(Math.max(...pts.map((p) => p.y))));
        const cw = maxX - minX;
        const ch = maxY - minY;
        if (cw < 2 || ch < 2) {
          setLastAction('الجزء المحدد خارج حدود الطبقة المحددة');
          return;
        }

        if (mode === 'keepSelected') {
          const c = document.createElement('canvas');
          c.width = cw;
          c.height = ch;
          c.getContext('2d')?.drawImage(al.bitmap, minX, minY, cw, ch, 0, 0, cw, ch);
          const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
          if (!blob) return;
          const pngBytes = new Uint8Array(await blob.arrayBuffer());
          const newBm = await createImageBitmap(blob);

          // Shift layer center so cropped part stays at exact same canvas position
          const oldCenterLocal = { x: al.width / 2, y: al.height / 2 };
          const newCenterLocal = { x: minX + cw / 2, y: minY + ch / 2 };
          const dxLocal = newCenterLocal.x - oldCenterLocal.x;
          const dyLocal = newCenterLocal.y - oldCenterLocal.y;
          const rad = (lt.rotation * Math.PI) / 180;
          const sx = lt.sx / 100;
          const sy = lt.sy / 100;
          const dxStage = Math.cos(rad) * sx * dxLocal - Math.sin(rad) * sy * dyLocal;
          const dyStage = Math.sin(rad) * sx * dxLocal + Math.cos(rad) * sy * dyLocal;

          const updatedLayer: AddedLayer = {
            ...al,
            bitmap: newBm,
            pngBytes,
            dataUrl: c.toDataURL('image/png'),
            width: cw,
            height: ch,
            bytes: pngBytes.byteLength,
            copiedFrames:
              al.copiedFrames && al.copiedFrames.length > 0
                ? retargetCopiedFramesDimensions(al.copiedFrames, cw, ch)
                : al.copiedFrames,
            transform: {
              ...al.transform,
              x: Number((al.transform.x + dxStage).toFixed(2)),
              y: Number((al.transform.y + dyStage).toFixed(2)),
            },
          };
          const nextAdded = addedLayers.map((item, i) => (i === addedIdx ? updatedLayer : item));
          setAddedLayers(nextAdded);
          pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
            addedLayers: nextAdded,
          });
          setCropRect(null);
          setActiveTool('Move');
          setLastAction(`تم قص وتحديد الجزء (${cw}×${ch}) من الطبقة ${al.name} — يمكنك تحريكه بالماوس`);
          return;
        }

        if (mode === 'eraseSelected' || mode === 'splitToNewLayer') {
          // 1. Create erased copy of original layer
          const cOrig = document.createElement('canvas');
          cOrig.width = al.width;
          cOrig.height = al.height;
          const ctxOrig = cOrig.getContext('2d');
          if (!ctxOrig) return;
          ctxOrig.drawImage(al.bitmap, 0, 0);
          ctxOrig.clearRect(minX, minY, cw, ch);
          const blobOrig: Blob | null = await new Promise((r) => cOrig.toBlob(r, 'image/png'));
          if (!blobOrig) return;
          const bytesOrig = new Uint8Array(await blobOrig.arrayBuffer());
          const bmOrig = await createImageBitmap(blobOrig);

          let nextAdded = addedLayers.map((item, i) =>
            i === addedIdx
              ? {
                  ...al,
                  bitmap: bmOrig,
                  pngBytes: bytesOrig,
                  dataUrl: cOrig.toDataURL('image/png'),
                  bytes: bytesOrig.byteLength,
                }
              : item
          );

          if (mode === 'splitToNewLayer') {
            const cCut = document.createElement('canvas');
            cCut.width = cw;
            cCut.height = ch;
            cCut.getContext('2d')?.drawImage(al.bitmap, minX, minY, cw, ch, 0, 0, cw, ch);
            const blobCut: Blob | null = await new Promise((r) => cCut.toBlob(r, 'image/png'));
            if (blobCut) {
              const bytesCut = new Uint8Array(await blobCut.arrayBuffer());
              const bmCut = await createImageBitmap(blobCut);
              const oldCenterLocal = { x: al.width / 2, y: al.height / 2 };
              const newCenterLocal = { x: minX + cw / 2, y: minY + ch / 2 };
              const dxLocal = newCenterLocal.x - oldCenterLocal.x;
              const dyLocal = newCenterLocal.y - oldCenterLocal.y;
              const rad = (lt.rotation * Math.PI) / 180;
              const sx = lt.sx / 100;
              const sy = lt.sy / 100;
              const dxStage = Math.cos(rad) * sx * dxLocal - Math.sin(rad) * sy * dyLocal;
              const dyStage = Math.sin(rad) * sx * dxLocal + Math.cos(rad) * sy * dyLocal;

              const newId = `layer_cut_${Date.now()}`;
              const splitLayer: AddedLayer = {
                id: newId,
                assetKey: `${al.assetKey}_cut_${nextAdded.length + 1}`,
                name: `${al.name} (جزء مقصوص)`,
                bitmap: bmCut,
                pngBytes: bytesCut,
                dataUrl: cCut.toDataURL('image/png'),
                width: cw,
                height: ch,
                bytes: bytesCut.byteLength,
                transform: {
                  ...al.transform,
                  x: Number((al.transform.x + dxStage).toFixed(2)),
                  y: Number((al.transform.y + dyStage).toFixed(2)),
                },
                inFrame: al.inFrame,
                outFrame: al.outFrame,
              };
              nextAdded = [...nextAdded, splitLayer];
              setSelectedTarget(newId);
              setSelectedAssetKey(null);
            }
          }

          setAddedLayers(nextAdded);
          pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
            addedLayers: nextAdded,
          });
          setCropRect(null);
          setActiveTool('Move');
          setLastAction(
            mode === 'splitToNewLayer'
              ? `تم فصل الجزء المحدد (${cw}×${ch}) في طبقة مستقلة قابلة للتحريك بالماوس`
              : `تم مسح الجزء المحدد (${cw}×${ch}) من الطبقة ${al.name}`
          );
          return;
        }
      }

      // Case B: Decomposed SVGA Sprite Layer (`sprite_${idx}`)
      if (selectedTarget.startsWith('sprite_')) {
        const spIdx = Number(selectedTarget.replace('sprite_', ''));
        const sp = movie.sp[spIdx];
        if (!sp || !sp.key || !bitmaps[sp.key]) return;
        const bm = bitmaps[sp.key];
        const resolved = resolveSpriteFrameAt(
          sp,
          currentFrame,
          totalFrames,
          spriteFrameRanges[spIdx]
        );
        const f = resolved.frameObj || sp.fr[currentFrame];
        if (!f) return;

        const lt = getEffectiveTransform(selectedTarget, sp.key, currentFrame);
        const mat = computeSpriteFrameMatrix(f, bm.width, bm.height, canvasW, canvasH, lt, docT);
        const inv = invertAffine(mat);
        if (!inv) return;

        const pts = [
          { x: cropRect.x, y: cropRect.y },
          { x: cropRect.x + cropRect.w, y: cropRect.y },
          { x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h },
          { x: cropRect.x, y: cropRect.y + cropRect.h },
        ].map((p) => ({
          x: inv[0] * p.x + inv[2] * p.y + inv[4],
          y: inv[1] * p.x + inv[3] * p.y + inv[5],
        }));

        const fx = f.x || 0;
        const fy = f.y || 0;
        const fw = f.w || bm.width;
        const fh = f.h || bm.height;
        const scaleBmpX = bm.width / Math.max(1, fw);
        const scaleBmpY = bm.height / Math.max(1, fh);

        const minX = Math.max(0, Math.floor((Math.min(...pts.map((p) => p.x)) - fx) * scaleBmpX));
        const minY = Math.max(0, Math.floor((Math.min(...pts.map((p) => p.y)) - fy) * scaleBmpY));
        const maxX = Math.min(
          bm.width,
          Math.ceil((Math.max(...pts.map((p) => p.x)) - fx) * scaleBmpX)
        );
        const maxY = Math.min(
          bm.height,
          Math.ceil((Math.max(...pts.map((p) => p.y)) - fy) * scaleBmpY)
        );
        const cw = maxX - minX;
        const ch = maxY - minY;
        if (cw < 2 || ch < 2) {
          setLastAction('الجزء المحدد خارج حدود هذه الطبقة');
          return;
        }

        // Modify sprite's bitmap in place ( keeping full bitmap dimensions so SVGA frame coordinates stay exact )
        const c = document.createElement('canvas');
        c.width = bm.width;
        c.height = bm.height;
        const ctx = c.getContext('2d');
        if (!ctx) return;

        if (mode === 'keepSelected') {
          ctx.drawImage(bm, minX, minY, cw, ch, minX, minY, cw, ch);
        } else {
          ctx.drawImage(bm, 0, 0);
          ctx.clearRect(minX, minY, cw, ch);
        }

        const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
        if (!blob) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const newBm = await createImageBitmap(blob);
        const dataUrl = c.toDataURL('image/png');

        const newKey = `${sp.key}_crop_${movie.sp.length - spIdx}`;
        setBitmaps((prev) => ({ ...prev, [newKey]: newBm }));
        setThumbs((prev) => ({ ...prev, [newKey]: { url: dataUrl, w: bm.width, h: bm.height } }));
        setMovie((prev) => ({
          ...prev,
          im: { ...prev.im, [newKey]: bytes },
          sp: prev.sp.map((item, idx) => (idx === spIdx ? { ...item, key: newKey } : item)),
        }));
        setSelectedAssetKey(newKey);

        if (mode === 'splitToNewLayer') {
          const cCut = document.createElement('canvas');
          cCut.width = cw;
          cCut.height = ch;
          cCut.getContext('2d')?.drawImage(bm, minX, minY, cw, ch, 0, 0, cw, ch);
          const blobCut: Blob | null = await new Promise((r) => cCut.toBlob(r, 'image/png'));
          if (blobCut) {
            const bytesCut = new Uint8Array(await blobCut.arrayBuffer());
            const bmCut = await createImageBitmap(blobCut);
            const cutCenterStageX = cropRect.x + cropRect.w / 2 - canvasW / 2;
            const cutCenterStageY = cropRect.y + cropRect.h / 2 - canvasH / 2;
            const newId = `layer_cut_${Date.now()}`;
            const splitLayer: AddedLayer = {
              id: newId,
              assetKey: `${sp.key}_part_${addedLayers.length + 1}`,
              name: `${sp.key} (جزء مقصوص)`,
              bitmap: bmCut,
              pngBytes: bytesCut,
              dataUrl: cCut.toDataURL('image/png'),
              width: cw,
              height: ch,
              bytes: bytesCut.byteLength,
              transform: {
                ...DEFAULT_TRANSFORM,
                x: Number(cutCenterStageX.toFixed(1)),
                y: Number(cutCenterStageY.toFixed(1)),
              },
              inFrame: 0,
              outFrame: totalFrames - 1,
            };
            const nextAdded = [...addedLayers, splitLayer];
            setAddedLayers(nextAdded);
            setSelectedTarget(newId);
            setSelectedAssetKey(null);
          }
        }

        setCropRect(null);
        setActiveTool('Move');
        setLastAction(
          mode === 'keepSelected'
            ? `تم قص الطبقة #${movie.sp.length - spIdx} (${cw}×${ch}) — اسحب بالماوس لتحريكها`
            : mode === 'splitToNewLayer'
              ? `تم فصل الجزء المحدد (${cw}×${ch}) في طبقة مستقلة قابلة للتحريك`
              : `تم مسح الجزء المحدد (${cw}×${ch}) من الطبقة #${movie.sp.length - spIdx}`
        );
      }
    },
    [
      cropRect,
      selectedTarget,
      getEffectiveTransform,
      currentFrame,
      addedLayers,
      canvasW,
      canvasH,
      docTransform,
      layerTransforms,
      hiddenLayerIds,
      deletedSpriteIndices,
      pushHistory,
      movie.sp,
      bitmaps,
      spriteFrameRanges,
      totalFrames,
    ]
  );

  // Send layer backward / bring forward in stacking order
  const handleSendLayerBackward = useCallback(
    (targetId: string) => {
      if (targetId.startsWith('sprite_')) {
        const idx = Number(targetId.replace('sprite_', ''));
        if (idx > 0) {
          setMovie((prev) => {
            const nextSp = [...prev.sp];
            const temp = nextSp[idx - 1];
            nextSp[idx - 1] = nextSp[idx];
            nextSp[idx] = temp;
            return { ...prev, sp: nextSp };
          });
          setSelectedTarget(`sprite_${idx - 1}`);
          setLastAction('تم إرجاع الطبقة خطوة للخلف (Sent Layer Backward)');
        }
      } else if (targetId.startsWith('layer_')) {
        setAddedLayers((prev) => {
          const idx = prev.findIndex((l) => l.id === targetId);
          if (idx <= 0) return prev;
          const next = [...prev];
          const temp = next[idx - 1];
          next[idx - 1] = next[idx];
          next[idx] = temp;
          return next;
        });
        setLastAction('تم إرجاع الطبقة المضافة للخلف');
      }
    },
    []
  );

  const handleBringLayerForward = useCallback(
    (targetId: string) => {
      if (targetId.startsWith('sprite_')) {
        const idx = Number(targetId.replace('sprite_', ''));
        if (idx >= 0 && idx < movie.sp.length - 1) {
          setMovie((prev) => {
            const nextSp = [...prev.sp];
            const temp = nextSp[idx + 1];
            nextSp[idx + 1] = nextSp[idx];
            nextSp[idx] = temp;
            return { ...prev, sp: nextSp };
          });
          setSelectedTarget(`sprite_${idx + 1}`);
          setLastAction('تم تقديم الطبقة خطوة للأمام (Brought Layer Forward)');
        }
      } else if (targetId.startsWith('layer_')) {
        setAddedLayers((prev) => {
          const idx = prev.findIndex((l) => l.id === targetId);
          if (idx < 0 || idx >= prev.length - 1) return prev;
          const next = [...prev];
          const temp = next[idx + 1];
          next[idx + 1] = next[idx];
          next[idx] = temp;
          return next;
        });
        setLastAction('تم تقديم الطبقة المضافة للأمام');
      }
    },
    [movie.sp.length]
  );

  // Delete layer handler (works on SVGA sprite layers, added image layers, and shape/text layers)
  const handleDeleteLayer = useCallback(
    (targetId: string) => {
      if (targetId === 'DOCUMENT') return;
      if (targetId.startsWith('merged_group_')) {
        const mg = mergedGroups.find((g) => g.id === targetId);
        if (mg) {
          setDeletedSpriteIndices((prev) => {
            const next = new Set(prev);
            mg.spriteIds.forEach((id) => {
              const idx = Number(id.replace('sprite_', ''));
              if (Number.isFinite(idx)) next.add(idx);
            });
            pushHistory(docTransform, layerTransforms, hiddenLayerIds, next);
            return next;
          });
          setMergedGroups((prev) => prev.filter((g) => g.id !== targetId));
          if (selectedTarget === targetId) {
            setSelectedTarget('DOCUMENT');
            setSelectedAssetKey(null);
          }
          setLastAction(`تم حذف ${mg.name}`);
        }
        return;
      }
      if (targetId.startsWith('sprite_')) {
        const idx = Number(targetId.replace('sprite_', ''));
        if (Number.isFinite(idx)) {
          const spKey = movie.sp[idx]?.key || targetId;
          setDeletedSpriteIndices((prev) => {
            const next = new Set(prev);
            next.add(idx);
            pushHistory(docTransform, layerTransforms, hiddenLayerIds, next);
            return next;
          });
          if (selectedTarget === targetId) {
            setSelectedTarget('DOCUMENT');
            setSelectedAssetKey(null);
          }
          setLastAction(`Deleted layer #${movie.sp.length - idx} (${spKey})`);
        }
        return;
      }
      if (addedLayers.some((l) => l.id === targetId)) {
        const name = addedLayers.find((l) => l.id === targetId)?.name || targetId;
        const nextAdded = addedLayers.filter((l) => l.id !== targetId);
        setAddedLayers(nextAdded);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          addedLayers: nextAdded,
        });
        if (selectedTarget === targetId) {
          setSelectedTarget('DOCUMENT');
          setSelectedAssetKey(null);
        }
        setLastAction(`Deleted added layer ${name}`);
        return;
      }
      if (shapes.some((s) => s.id === targetId)) {
        const name = shapes.find((s) => s.id === targetId)?.name || targetId;
        const nextShapes = shapes.filter((s) => s.id !== targetId);
        setShapes(nextShapes);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          shapes: nextShapes,
        });
        if (selectedTarget === targetId) {
          setSelectedTarget('DOCUMENT');
          setSelectedAssetKey(null);
        }
        setLastAction(`Deleted shape layer ${name}`);
      }
    },
    [
      mergedGroups,
      movie.sp,
      addedLayers,
      shapes,
      selectedTarget,
      docTransform,
      layerTransforms,
      hiddenLayerIds,
      deletedSpriteIndices,
      pushHistory,
    ]
  );

  const handleMoveLayer = useCallback(
    (
      layerId: string,
      direction: 'top' | 'bottom' | 'up' | 'down' | 'above' | 'below',
      relativeTargetId?: string
    ) => {
      const currentOrder = [...effectiveLayerOrder];
      const curIdx = currentOrder.indexOf(layerId);
      if (curIdx === -1) return;

      currentOrder.splice(curIdx, 1);

      if (direction === 'top') {
        currentOrder.push(layerId);
      } else if (direction === 'bottom') {
        currentOrder.unshift(layerId);
      } else if (direction === 'up') {
        const newIdx = Math.min(currentOrder.length, curIdx + 1);
        currentOrder.splice(newIdx, 0, layerId);
      } else if (direction === 'down') {
        const newIdx = Math.max(0, curIdx - 1);
        currentOrder.splice(newIdx, 0, layerId);
      } else if (direction === 'above' && relativeTargetId) {
        const targetIdx = currentOrder.indexOf(relativeTargetId);
        if (targetIdx !== -1) {
          currentOrder.splice(targetIdx + 1, 0, layerId);
        } else {
          currentOrder.push(layerId);
        }
      } else if (direction === 'below' && relativeTargetId) {
        const targetIdx = currentOrder.indexOf(relativeTargetId);
        if (targetIdx !== -1) {
          currentOrder.splice(targetIdx, 0, layerId);
        } else {
          currentOrder.unshift(layerId);
        }
      }

      setLayerOrder(currentOrder);
      setMoveMenuLayerId(null);
      pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
        layerOrder: currentOrder,
      });

      const label =
        direction === 'top'
          ? 'أعلى الكل ⤒'
          : direction === 'bottom'
          ? 'أسفل الكل ⤓'
          : direction === 'up'
          ? 'خطوة للأعلى ↑'
          : direction === 'down'
          ? 'خطوة للأسفل ↓'
          : direction === 'above'
          ? `فوق الطبقة المستهدفة 🎯`
          : `تحت الطبقة 🎯`;

      setLastAction(`🔄 تم نقل الطبقة إلى: ${label}`);
    },
    [effectiveLayerOrder, docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, pushHistory]
  );

  const handleMoveSpriteLayerUp = useCallback(
    (spriteIdx: number) => {
      handleMoveLayer(`sprite_${spriteIdx}`, 'up');
    },
    [handleMoveLayer]
  );

  const handleMoveSpriteLayerDown = useCallback(
    (spriteIdx: number) => {
      handleMoveLayer(`sprite_${spriteIdx}`, 'down');
    },
    [handleMoveLayer]
  );

  const handleMoveAddedLayerUp = useCallback(
    (idx: number) => {
      const al = addedLayers[idx];
      if (al) handleMoveLayer(al.id, 'up');
    },
    [addedLayers, handleMoveLayer]
  );

  const handleMoveAddedLayerDown = useCallback(
    (idx: number) => {
      const al = addedLayers[idx];
      if (al) handleMoveLayer(al.id, 'down');
    },
    [addedLayers, handleMoveLayer]
  );

  const handleMoveShapeUp = useCallback(
    (idx: number) => {
      const sh = shapes[idx];
      if (sh) handleMoveLayer(sh.id, 'up');
    },
    [shapes, handleMoveLayer]
  );

  const handleMoveShapeDown = useCallback(
    (idx: number) => {
      const sh = shapes[idx];
      if (sh) handleMoveLayer(sh.id, 'down');
    },
    [shapes, handleMoveLayer]
  );

  const handleMoveMergedGroupUp = useCallback((groupId: string) => {
    setMergedGroups((prev) => {
      const idx = prev.findIndex((g) => g.id === groupId);
      if (idx <= 0) return prev;
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[idx - 1];
      next[idx - 1] = temp;
      return next;
    });
    setLastAction('رفع المجموعة المدمجة للأعلى (Move Up)');
  }, []);

  const handleMoveMergedGroupDown = useCallback((groupId: string) => {
    setMergedGroups((prev) => {
      const idx = prev.findIndex((g) => g.id === groupId);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[idx + 1];
      next[idx + 1] = temp;
      return next;
    });
    setLastAction('خفض المجموعة المدمجة للأسفل (Move Down)');
  }, []);

  const handleToggleGroupUngroup = useCallback((groupId: string) => {
    setMergedGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, isUngrouped: !g.isUngrouped } : g))
    );
    setLastAction('تبديل حالة التجميع / فك التجميع (Group / Ungroup)');
  }, []);

  // Purge all unused assets from movie.im
  const handlePurgeUnusedAssets = useCallback(() => {
    const unusedKeys = assetStats.assets.filter((a) => a.usageCount === 0).map((a) => a.key);
    if (unusedKeys.length === 0) {
      setLastAction('No unused assets to remove');
      return;
    }
    setMovie((prev) => {
      const nextIm = { ...prev.im };
      for (const k of unusedKeys) delete nextIm[k];
      return { ...prev, im: nextIm };
    });
    setLastAction(`Removed ${unusedKeys.length} unused asset(s)`);
  }, [assetStats.assets]);

  const toggleLayerVisibility = (layerId: string) => {
    setHiddenLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  };

  // 1. Copy frame-by-frame motion, relative transform deltas, alpha & frame range from an SVGA sprite onto an Added Image Layer
  // while preserving 100% of the dimensions, scale, and placement that the user fixed on the Added Image Layer
  const handleCopyMotionFromSpriteToAddedLayer = useCallback(
    (addedLayerId: string, sourceSpriteIdx: number) => {
      const sourceSprite = movie.sp[sourceSpriteIdx];
      if (!sourceSprite) return;
      const targetLayer = addedLayers.find((al) => al.id === addedLayerId);
      if (!targetLayer) return;

      const sKey = sourceSprite.key || '';
      const bm = sKey ? bitmaps[sKey] : undefined;
      const sourceAssetW = bm?.width || thumbs[sKey]?.w || canvasW;
      const sourceAssetH = bm?.height || thumbs[sKey]?.h || canvasH;

      const sourceSpriteId = `sprite_${sourceSpriteIdx}`;
      const sourceOverrideTransform =
        layerTransforms[sourceSpriteId] ||
        (sKey ? layerTransforms[sKey] : undefined) ||
        DEFAULT_TRANSFORM;
      const sourceKf =
        layerKeyframes[sourceSpriteId] || (sKey ? layerKeyframes[sKey] : undefined);

      const copied = copySpriteFramesToLayer(
        sourceSprite,
        sourceAssetW,
        sourceAssetH,
        totalFrames,
        spriteFrameRanges[sourceSpriteIdx],
        {
          targetWidth: targetLayer.width,
          targetHeight: targetLayer.height,
          canvasW,
          canvasH,
          referenceFrame: currentFrame,
          preserveTargetBounds: true,
          sourceLayerTransform: sourceOverrideTransform,
          sourceLayerKeyframes: sourceKf,
        }
      );
      const displayNum = Math.max(1, movie.sp.length - sourceSpriteIdx);

      // Keep the user's fixed transform (dimensions/scale sx, sy, position x, y, rotation, opacity) intact
      const preservedUserTransform: LayerTransform = {
        ...targetLayer.transform,
      };

      const nextAdded = addedLayers.map((al) =>
        al.id === addedLayerId
          ? {
              ...al,
              copiedFrames: copied.frames,
              copiedFromKey: `${sKey || 'Layer'} (#${displayNum})`,
              copiedFromDisplayNum: displayNum,
              inFrame: copied.inFrame,
              outFrame: copied.outFrame,
              transform: preservedUserTransform,
            }
          : al
      );
      const nextLayerMap = {
        ...layerTransforms,
        [addedLayerId]: preservedUserTransform,
      };

      setAddedLayers(nextAdded);
      setLayerTransforms(nextLayerMap);
      pushHistory(docTransform, nextLayerMap, hiddenLayerIds, deletedSpriteIndices, {
        addedLayers: nextAdded,
      });

      setCopyMotionModalLayerId(null);
      const fixedW = Math.max(
        1,
        Math.round((targetLayer.width * Math.abs(preservedUserTransform.sx)) / 100)
      );
      const fixedH = Math.max(
        1,
        Math.round((targetLayer.height * Math.abs(preservedUserTransform.sy)) / 100)
      );
      setLastAction(
        `🎬 تم نسخ نفس الحركة والفريمات (F${copied.inFrame}–${copied.outFrame}) من الطبقة #${displayNum} (${sKey}) مع الحفاظ على مقاسات وأبعاد طبقتك (${fixedW}×${fixedH}px)`
      );
    },
    [
      movie.sp,
      addedLayers,
      bitmaps,
      thumbs,
      canvasW,
      canvasH,
      totalFrames,
      currentFrame,
      spriteFrameRanges,
      layerTransforms,
      layerKeyframes,
      docTransform,
      hiddenLayerIds,
      deletedSpriteIndices,
      pushHistory,
    ]
  );

  const handleClearCopiedMotionFromAddedLayer = useCallback((addedLayerId: string) => {
    setAddedLayers((prev) =>
      prev.map((al) => {
        if (al.id !== addedLayerId) return al;
        const next = { ...al };
        delete next.copiedFrames;
        delete next.copiedFromKey;
        delete next.copiedFromDisplayNum;
        return next;
      })
    );
    setLastAction('تم إلغاء الحركة المنسوخة والعودة للتحكم الحر بطبقة الصورة مع الاحتفاظ بمقاساتها');
  }, []);

  const handleCopyMotionFromAddedLayerToAddedLayer = useCallback(
    (targetAddedLayerId: string, sourceAddedLayerId: string) => {
      const src = addedLayers.find((a) => a.id === sourceAddedLayerId);
      const targetLayer = addedLayers.find((a) => a.id === targetAddedLayerId);
      if (!src || !targetLayer || src.id === targetAddedLayerId) return;

      const preservedUserTransform: LayerTransform = { ...targetLayer.transform };
      const nextCopiedFrames =
        src.copiedFrames && src.copiedFrames.length > 0
          ? retargetCopiedFramesDimensions(src.copiedFrames, targetLayer.width, targetLayer.height)
          : undefined;

      const nextAdded = addedLayers.map((al) =>
        al.id === targetAddedLayerId
          ? {
              ...al,
              inFrame: src.inFrame,
              outFrame: src.outFrame,
              transform: preservedUserTransform,
              copiedFrames: nextCopiedFrames,
              copiedFromKey: src.copiedFromKey || src.name,
            }
          : al
      );
      const nextLayerMap = {
        ...layerTransforms,
        [targetAddedLayerId]: preservedUserTransform,
      };
      setAddedLayers(nextAdded);
      setLayerTransforms(nextLayerMap);
      pushHistory(docTransform, nextLayerMap, hiddenLayerIds, deletedSpriteIndices, {
        addedLayers: nextAdded,
      });
      setCopyMotionModalLayerId(null);
      setLastAction(
        `🎬 تم نسخ نفس الحركة والفريمات (F${src.inFrame}–${src.outFrame}) من الطبقة (${src.name}) مع الاحتفاظ بمقاسات وأبعاد الطبقة`
      );
    },
    [
      addedLayers,
      layerTransforms,
      docTransform,
      hiddenLayerIds,
      deletedSpriteIndices,
      pushHistory,
    ]
  );

  // Bake / Lock current scaled dimensions (W x H) directly into the Added Image Layer's bitmap and frames
  const handleBakeAddedLayerDimensions = useCallback(
    async (addedLayerId: string) => {
      const idx = addedLayers.findIndex((al) => al.id === addedLayerId);
      if (idx < 0) return;
      const al = addedLayers[idx];
      const effT = getEffectiveTransform(al.id, al.assetKey, currentFrame);
      const signX = effT.sx < 0 ? -1 : 1;
      const signY = effT.sy < 0 ? -1 : 1;
      const zoomFactor = (effT.zoom ?? 100) / 100;
      const bakedW = Math.max(2, Math.round((al.width * Math.abs(effT.sx) * zoomFactor) / 100));
      const bakedH = Math.max(2, Math.round((al.height * Math.abs(effT.sy) * zoomFactor) / 100));
      const sourceBm = al.originalBitmap || al.bitmap;

      const c = document.createElement('canvas');
      c.width = bakedW;
      c.height = bakedH;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(sourceBm, 0, 0, bakedW, bakedH);
      const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
      if (!blob) return;
      const pngBytes = new Uint8Array(await blob.arrayBuffer());
      const newBm = await createImageBitmap(blob);
      const dataUrl = c.toDataURL('image/png');

      const bakedTransform: LayerTransform = {
        ...effT,
        sx: signX * 100,
        sy: signY * 100,
        zoom: 100,
      };
      const updatedCopiedFrames =
        al.copiedFrames && al.copiedFrames.length > 0
          ? retargetCopiedFramesDimensions(al.copiedFrames, bakedW, bakedH)
          : al.copiedFrames;

      const updatedLayer: AddedLayer = {
        ...al,
        bitmap: newBm,
        originalBitmap: sourceBm,
        originalWidth: al.originalWidth || al.width,
        originalHeight: al.originalHeight || al.height,
        pngBytes,
        dataUrl,
        width: bakedW,
        height: bakedH,
        bytes: pngBytes.byteLength,
        transform: bakedTransform,
        copiedFrames: updatedCopiedFrames,
      };

      const nextAdded = addedLayers.map((item, i) => (i === idx ? updatedLayer : item));
      const nextLayerMap = { ...layerTransforms, [addedLayerId]: bakedTransform };
      setAddedLayers(nextAdded);
      setLayerTransforms(nextLayerMap);
      pushHistory(docTransform, nextLayerMap, hiddenLayerIds, deletedSpriteIndices, {
        addedLayers: nextAdded,
      });
      setLastAction(
        `📌 تم تثبيت المقاسات والأبعاد (${bakedW}×${bakedH}px) على الطبقة (${al.name}) بنجاح`
      );
    },
    [
      addedLayers,
      getEffectiveTransform,
      currentFrame,
      layerTransforms,
      docTransform,
      hiddenLayerIds,
      deletedSpriteIndices,
      pushHistory,
    ]
  );

  // 2. Duplicate any layer (SVGA sprite, Added Image Layer, or Shape/Text Layer) with optional horizontal Left-to-Right mirror
  const handleDuplicateLayer = useCallback(
    (targetId: string, mirrorMode: 'none' | 'canvas' | 'local' = 'none') => {
      if (!targetId || targetId === 'DOCUMENT' || targetId === 'GROUP_ALL') return;

      // Case A: Added Image Layer
      if (targetId.startsWith('layer_')) {
        const srcLayer = addedLayers.find((al) => al.id === targetId);
        if (!srcLayer) return;
        const newId = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newAssetKey = `user_img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
        const baseTransform =
          srcLayer.transform || layerTransforms[srcLayer.id] || DEFAULT_TRANSFORM;

        let nextTransform: LayerTransform = { ...baseTransform };
        let nextCopiedFrames = srcLayer.copiedFrames
          ? srcLayer.copiedFrames.map(cloneSvgaFrame)
          : undefined;

        if (mirrorMode !== 'none') {
          if (nextCopiedFrames && nextCopiedFrames.length > 0) {
            nextCopiedFrames = mirrorSvgaFramesHorizontally(
              nextCopiedFrames,
              canvasW,
              srcLayer.width,
              srcLayer.height,
              mirrorMode
            );
            nextTransform = {
              ...baseTransform,
              x: mirrorMode === 'canvas' ? -baseTransform.x : baseTransform.x,
              rotation: -baseTransform.rotation,
            };
          } else {
            nextTransform = mirrorLayerTransformHorizontally(baseTransform, mirrorMode);
          }
        } else {
          // Slight offset when duplicating without mirror if not animated so user sees the new copy clearly
          if (!nextCopiedFrames) {
            nextTransform = {
              ...baseTransform,
              x: baseTransform.x + 12,
              y: baseTransform.y + 12,
            };
          }
        }

        const suffix = mirrorMode !== 'none' ? ' (معكوس ↔)' : ' (نسخة)';
        let newLayer: AddedLayer = {
          ...srcLayer,
          id: newId,
          assetKey: newAssetKey,
          name: `${srcLayer.name}${suffix}`,
          transform: nextTransform,
          copiedFrames: nextCopiedFrames,
        };

        const srcIdxInOrder = effectiveLayerOrder.indexOf(targetId);
        const nextLayerOrder = [...effectiveLayerOrder];
        if (srcIdxInOrder !== -1) {
          nextLayerOrder.splice(srcIdxInOrder + 1, 0, newId);
        } else {
          nextLayerOrder.push(newId);
        }

        // Special handling for Shine Layers: when duplicated/mirrored, automatically assign to opposite/2nd target layer and place right above it
        if (srcLayer.shineConfig?.enabled) {
          const candidateTargets: Array<{ id: string; name: string; cx: number; cy: number }> = [];

          movie.sp.forEach((sp, idx) => {
            if (deletedSpriteIndices.has(idx)) return;
            const lid = `sprite_${idx}`;
            const displayNum = movie.sp.length - idx;
            const key = sp.key || `vector_${displayNum}`;
            const b = getTargetLayerBoundsAndBitmapAtFrame(lid, currentFrame);
            candidateTargets.push({
              id: lid,
              name: `#${displayNum} (${key})`,
              cx: (b.minX + b.maxX) / 2,
              cy: (b.minY + b.maxY) / 2,
            });
          });

          addedLayers.forEach((al) => {
            if (al.id === srcLayer.id || al.shineConfig?.enabled) return;
            const b = getTargetLayerBoundsAndBitmapAtFrame(al.id, currentFrame);
            candidateTargets.push({
              id: al.id,
              name: al.name,
              cx: (b.minX + b.maxX) / 2,
              cy: (b.minY + b.maxY) / 2,
            });
          });

          shapes.forEach((sh) => {
            const b = getTargetLayerBoundsAndBitmapAtFrame(sh.id, currentFrame);
            candidateTargets.push({
              id: sh.id,
              name: sh.name,
              cx: (b.minX + b.maxX) / 2,
              cy: (b.minY + b.maxY) / 2,
            });
          });

          let nextTargetId = srcLayer.shineConfig.targetLayerId;
          let targetName = 'كامل المشروع';

          if (candidateTargets.length > 0) {
            const curTarget = candidateTargets.find(
              (c) => c.id === srcLayer.shineConfig?.targetLayerId
            );

            if (curTarget && mirrorMode !== 'none') {
              // Spatial symmetry matching: find layer whose center is closest to mirrored position (canvasW - curTarget.cx, curTarget.cy)
              const mirroredCx = canvasW - curTarget.cx;
              const mirroredCy = curTarget.cy;

              let bestDistSq = Infinity;
              let bestTarget = curTarget;

              candidateTargets.forEach((c) => {
                if (c.id === curTarget.id) return;
                const distSq = Math.pow(c.cx - mirroredCx, 2) + Math.pow(c.cy - mirroredCy, 2);
                if (distSq < bestDistSq) {
                  bestDistSq = distSq;
                  bestTarget = c;
                }
              });

              nextTargetId = bestTarget.id;
              targetName = bestTarget.name;
            } else {
              // Fallback: cycle to next candidate in sequence
              const curTargetIdx = candidateTargets.findIndex(
                (c) => c.id === srcLayer.shineConfig?.targetLayerId
              );
              const nextTargetObj =
                curTargetIdx !== -1
                  ? candidateTargets[(curTargetIdx + 1) % candidateTargets.length]
                  : candidateTargets[0];
              nextTargetId = nextTargetObj.id;
              targetName = nextTargetObj.name;
            }
          }

          // Mirror motion points and mask contours across stage center X if mirrored
          let nextMotionPoints = srcLayer.shineConfig.motionPoints;
          let nextMaskContours = srcLayer.shineConfig.maskContours;
          let nextBeamAngle = srcLayer.shineConfig.beamAngleDeg;

          if (mirrorMode !== 'none') {
            if (nextMotionPoints) {
              nextMotionPoints = nextMotionPoints.map((p) => ({
                x: Math.round(canvasW - p.x),
                y: p.y,
              }));
            }
            if (nextMaskContours) {
              nextMaskContours = nextMaskContours.map((contour) =>
                contour.map((p) => ({
                  x: Math.round(canvasW - p.x),
                  y: p.y,
                }))
              );
            }
            if (typeof nextBeamAngle === 'number') {
              nextBeamAngle = -nextBeamAngle;
            }
          }

          const suffixLabel = mirrorMode !== 'none' ? ' (معكوسة ↔)' : ' (نسخة)';
          const shineName = `✨ لمعة: ${targetName}${suffixLabel}`;

          newLayer = {
            ...newLayer,
            name: shineName,
            shineConfig: {
              ...srcLayer.shineConfig,
              targetLayerId: nextTargetId,
              motionPoints: nextMotionPoints,
              maskContours: nextMaskContours,
              beamAngleDeg: nextBeamAngle,
            },
          };

          const targetIdxInOrder = nextLayerOrder.indexOf(nextTargetId);
          if (targetIdxInOrder !== -1) {
            const tempIdx = nextLayerOrder.indexOf(newId);
            if (tempIdx !== -1) nextLayerOrder.splice(tempIdx, 1);
            nextLayerOrder.splice(targetIdxInOrder + 1, 0, newId);
          }
        }

        setLayerOrder(nextLayerOrder);

        let nextAddedLayers: AddedLayer[] = [];
        setAddedLayers((prev) => {
          const idx = prev.findIndex((a) => a.id === targetId);
          if (idx < 0) {
            nextAddedLayers = [...prev, newLayer];
          } else {
            const next = [...prev];
            next.splice(idx + 1, 0, newLayer);
            nextAddedLayers = next;
          }
          return nextAddedLayers;
        });
        setLayerTransforms((prev) => ({
          ...prev,
          [newId]: nextTransform,
        }));
        const clonedKf = cloneLayerPropertyKeyframes(
          layerKeyframes[srcLayer.id],
          mirrorMode,
          Boolean(nextCopiedFrames && nextCopiedFrames.length > 0)
        );
        if (clonedKf) {
          setLayerKeyframes((prev) => ({
            ...prev,
            [newId]: clonedKf,
          }));
        }
        setSelectedTarget(newId);
        setSelectedAssetKey(null);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          addedLayers: nextAddedLayers,
          layerOrder: nextLayerOrder,
        });
        setLastAction(
          mirrorMode !== 'none'
            ? `🪞 تم نسخ طبقة الصورة وعكسها من الشمال لليمين بنفس المقاسات (${newLayer.name})`
            : `📋 تم نسخ طبقة الصورة ووضعها فوق الطبقة الأصلية مباشرة (${newLayer.name})`
        );
        return;
      }

      // Case B: Shape / Text Layer
      if (targetId.startsWith('shape_')) {
        const srcShape = shapes.find((sh) => sh.id === targetId);
        if (!srcShape) return;
        const newId = `shape_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newAssetKey = `shape_asset_${Date.now().toString(36)}`;
        const baseTransform =
          srcShape.transform || layerTransforms[srcShape.id] || DEFAULT_TRANSFORM;
        const nextTransform =
          mirrorMode !== 'none'
            ? mirrorLayerTransformHorizontally(baseTransform, mirrorMode)
            : { ...baseTransform, x: baseTransform.x + 14, y: baseTransform.y + 14 };

        const suffix = mirrorMode !== 'none' ? ' (معكوس ↔)' : ' (نسخة)';
        const newShape: ShapeObject = {
          ...srcShape,
          id: newId,
          assetKey: newAssetKey,
          name: `${srcShape.name}${suffix}`,
          transform: nextTransform,
        };
        const srcIdxInOrder = effectiveLayerOrder.indexOf(targetId);
        const nextLayerOrder = [...effectiveLayerOrder];
        if (srcIdxInOrder !== -1) {
          nextLayerOrder.splice(srcIdxInOrder + 1, 0, newId);
        } else {
          nextLayerOrder.push(newId);
        }
        setLayerOrder(nextLayerOrder);
        setShapes((prev) => [...prev, newShape]);
        setLayerTransforms((prev) => ({
          ...prev,
          [newId]: nextTransform,
        }));
        setSelectedTarget(newId);
        setSelectedAssetKey(null);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          layerOrder: nextLayerOrder,
        });
        setLastAction(
          mirrorMode !== 'none'
            ? `🪞 تم نسخ الشكل/النص وعكسه من الشمال لليمين (${newShape.name})`
            : `📋 تم نسخ الشكل/النص ووضعه فوق الطبقة الأصلية مباشرة (${newShape.name})`
        );
        return;
      }

      // Case C: Decomposed SVGA Sprite Layer (sprite_N)
      if (targetId.startsWith('sprite_')) {
        const sIdx = Number(targetId.replace('sprite_', ''));
        if (Number.isNaN(sIdx) || !movie.sp[sIdx]) return;
        const s = movie.sp[sIdx];
        const sKey = s.key || '';
        const bm = sKey ? bitmaps[sKey] : undefined;
        const defaultW = bm?.width || thumbs[sKey]?.w || canvasW;
        const defaultH = bm?.height || thumbs[sKey]?.h || canvasH;

        const dupResult = duplicateSvgaSprite(movie, sIdx, {
          mirrorMode,
          assetW: defaultW,
          assetH: defaultH,
        });
        if (!dupResult) return;
        const newSpriteIdx = dupResult.newIndex;
        const newSpriteId = `sprite_${newSpriteIdx}`;

        const srcIdxInOrder = effectiveLayerOrder.indexOf(targetId);
        const nextLayerOrder = [...effectiveLayerOrder];
        if (srcIdxInOrder !== -1) {
          nextLayerOrder.splice(srcIdxInOrder + 1, 0, newSpriteId);
        } else {
          nextLayerOrder.push(newSpriteId);
        }
        setLayerOrder(nextLayerOrder);

        setMovie((prev) => ({
          ...prev,
          sp: [...prev.sp, dupResult.sprite],
        }));

        // Copy range & transforms to the new sprite index
        if (spriteFrameRanges[sIdx]) {
          setSpriteFrameRanges((prev) => ({
            ...prev,
            [newSpriteIdx]: { ...prev[sIdx] },
          }));
        }

        const baseTransform =
          layerTransforms[targetId] || (sKey ? layerTransforms[sKey] : undefined) || DEFAULT_TRANSFORM;
        const nextTransform: LayerTransform =
          mirrorMode !== 'none'
            ? {
                ...baseTransform,
                x: mirrorMode === 'canvas' ? -baseTransform.x : baseTransform.x,
                rotation: -baseTransform.rotation,
              }
            : { ...baseTransform };

        setLayerTransforms((prev) => ({
          ...prev,
          [newSpriteId]: nextTransform,
        }));

        const clonedKf = cloneLayerPropertyKeyframes(
          layerKeyframes[targetId],
          mirrorMode,
          true
        );
        if (clonedKf) {
          setLayerKeyframes((prev) => ({
            ...prev,
            [newSpriteId]: clonedKf,
          }));
        }

        // If the original sprite belonged to a mergedGroup, include the new sprite in that group as well
        setMergedGroups((prev) =>
          prev.map((g) =>
            g.spriteIds.includes(targetId)
              ? { ...g, spriteIds: [...g.spriteIds, newSpriteId] }
              : g
          )
        );

        setSelectedTarget(newSpriteId);
        setSelectedAssetKey(sKey || null);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          layerOrder: nextLayerOrder,
        });
        setLastAction(
          mirrorMode !== 'none'
            ? `🪞 تم نسخ الطبقة (${sKey}) وعكسها من الشمال لليمين بنفس الأنيميشن والفريمات`
            : `📋 تم نسخ طبقة ثانية من (${sKey}) ووضعها فوق الطبقة الأصلية مباشرة`
        );
      }
    },
    [
      addedLayers,
      shapes,
      movie,
      bitmaps,
      thumbs,
      canvasW,
      canvasH,
      effectiveLayerOrder,
      layerTransforms,
      layerKeyframes,
      spriteFrameRanges,
      docTransform,
      hiddenLayerIds,
      deletedSpriteIndices,
      pushHistory,
    ]
  );

  // 3. Flip/Mirror an existing layer horizontally in-place or across the canvas width
  const handleFlipLayerHorizontally = useCallback(
    (targetId: string, mirrorMode: 'canvas' | 'local' = 'canvas') => {
      if (!targetId || targetId === 'DOCUMENT' || targetId === 'GROUP_ALL') return;

      if (targetId.startsWith('layer_')) {
        const srcLayer = addedLayers.find((al) => al.id === targetId);
        if (!srcLayer) return;
        const baseTransform =
          srcLayer.transform || layerTransforms[srcLayer.id] || DEFAULT_TRANSFORM;

        if (srcLayer.copiedFrames && srcLayer.copiedFrames.length > 0) {
          const flippedFrames = mirrorSvgaFramesHorizontally(
            srcLayer.copiedFrames,
            canvasW,
            srcLayer.width,
            srcLayer.height,
            mirrorMode
          );
          const nextT: LayerTransform = {
            ...baseTransform,
            x: mirrorMode === 'canvas' ? -baseTransform.x : baseTransform.x,
            rotation: -baseTransform.rotation,
          };
          setAddedLayers((prev) =>
            prev.map((al) =>
              al.id === targetId
                ? { ...al, copiedFrames: flippedFrames, transform: nextT }
                : al
            )
          );
          setLayerTransforms((prev) => ({ ...prev, [targetId]: nextT }));
        } else {
          const nextT = mirrorLayerTransformHorizontally(baseTransform, mirrorMode);
          setAddedLayers((prev) =>
            prev.map((al) => (al.id === targetId ? { ...al, transform: nextT } : al))
          );
          setLayerTransforms((prev) => ({ ...prev, [targetId]: nextT }));
        }
        setLastAction('↔️ تم عكس طبقة الصورة أفقياً من الشمال لليمين مع الحفاظ على مقاساتها');
        return;
      }

      if (targetId.startsWith('shape_')) {
        const srcShape = shapes.find((sh) => sh.id === targetId);
        if (!srcShape) return;
        const baseTransform =
          srcShape.transform || layerTransforms[srcShape.id] || DEFAULT_TRANSFORM;
        const nextT = mirrorLayerTransformHorizontally(baseTransform, mirrorMode);
        setShapes((prev) =>
          prev.map((sh) => (sh.id === targetId ? { ...sh, transform: nextT } : sh))
        );
        setLayerTransforms((prev) => ({ ...prev, [targetId]: nextT }));
        setLastAction('↔️ تم عكس الشكل/النص أفقياً من الشمال لليمين');
        return;
      }

      if (targetId.startsWith('sprite_')) {
        const sIdx = Number(targetId.replace('sprite_', ''));
        if (Number.isNaN(sIdx) || !movie.sp[sIdx]) return;
        const s = movie.sp[sIdx];
        const sKey = s.key || '';
        const bm = sKey ? bitmaps[sKey] : undefined;
        const defaultW = bm?.width || thumbs[sKey]?.w || canvasW;
        const defaultH = bm?.height || thumbs[sKey]?.h || canvasH;

        setMovie((prev) => {
          const targetSp = prev.sp[sIdx];
          if (!targetSp) return prev;
          const flippedFrames = mirrorSvgaFramesHorizontally(
            targetSp.fr || [],
            canvasW,
            defaultW,
            defaultH,
            mirrorMode
          );
          const nextSp = [...prev.sp];
          nextSp[sIdx] = { ...targetSp, fr: flippedFrames };
          return { ...prev, sp: nextSp };
        });

        const baseTransform = layerTransforms[targetId] || DEFAULT_TRANSFORM;
        const nextT: LayerTransform = {
          ...baseTransform,
          x: mirrorMode === 'canvas' ? -baseTransform.x : baseTransform.x,
          rotation: -baseTransform.rotation,
        };
        setLayerTransforms((prev) => ({ ...prev, [targetId]: nextT }));
        setLastAction(`↔️ تم عكس الطبقة (${sKey}) من الشمال لليمين عبر الكانفاس`);
      }
    },
    [addedLayers, shapes, movie.sp, bitmaps, thumbs, canvasW, canvasH, layerTransforms]
  );

  // ============================================================================
  // SHINE / SHIMMER LAYER STUDIO HANDLERS (الطبقة اللامعة ونقاط القناع والحركة - إطار الهند)
  // ============================================================================

  const getTargetLayerBoundsAndBitmapAtFrame = useCallback(
    (
      targetId: string,
      frameIdx: number
    ): {
      bitmap: ImageBitmap | null;
      width: number;
      height: number;
      fx?: number;
      fy?: number;
      worldMatrix: [number, number, number, number, number, number];
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      cx: number;
      cy: number;
      label: string;
    } => {
      const docT = getEffectiveTransform('DOCUMENT', undefined, frameIdx);
      if (targetId.startsWith('sprite_')) {
        const sIdx = Number(targetId.replace('sprite_', ''));
        const sp = movie.sp[sIdx];
        if (sp) {
          const resolved = resolveSpriteFrameAt(sp, frameIdx, totalFrames, spriteFrameRanges[sIdx]);
          const f = resolved.frameObj || sp.fr.find((fr) => fr && fr.a > 0.001) || sp.fr[0];
          const bm = sp.key ? bitmaps[sp.key] || null : null;
          const assetW = bm?.width || thumbs[sp.key]?.w || f?.w || canvasW;
          const assetH = bm?.height || thumbs[sp.key]?.h || f?.h || canvasH;
          const lt = getEffectiveTransform(targetId, sp.key, frameIdx);
          const mat = f
            ? computeSpriteFrameMatrix(f, assetW, assetH, canvasW, canvasH, lt, docT)
            : computeAddedLayerFrameMatrix(assetW, assetH, canvasW, canvasH, lt, docT);
          const fx = f?.x || 0;
          const fy = f?.y || 0;
          const fw = f?.w || assetW;
          const fh = f?.h || assetH;
          const corners = [
            { x: fx, y: fy },
            { x: fx + fw, y: fy },
            { x: fx + fw, y: fy + fh },
            { x: fx, y: fy + fh },
          ].map((p) => ({
            x: mat[0] * p.x + mat[2] * p.y + mat[4],
            y: mat[1] * p.x + mat[3] * p.y + mat[5],
          }));
          const minX = Math.min(...corners.map((c) => c.x));
          const maxX = Math.max(...corners.map((c) => c.x));
          const minY = Math.min(...corners.map((c) => c.y));
          const maxY = Math.max(...corners.map((c) => c.y));
          return {
            bitmap: bm,
            width: fw,
            height: fh,
            fx,
            fy,
            worldMatrix: mat,
            minX,
            minY,
            maxX,
            maxY,
            cx: (minX + maxX) / 2,
            cy: (minY + maxY) / 2,
            label: `#${movie.sp.length - sIdx} · ${sp.key || 'layer'}`,
          };
        }
      }

      const targetAl = addedLayers.find((x) => x.id === targetId && !x.shineConfig?.enabled);
      if (targetAl) {
        const lt = getEffectiveTransform(targetAl.id, targetAl.assetKey, frameIdx);
        const mat = computeAddedLayerFrameMatrix(
          targetAl.width,
          targetAl.height,
          canvasW,
          canvasH,
          lt,
          docT
        );
        const corners = [
          { x: 0, y: 0 },
          { x: targetAl.width, y: 0 },
          { x: targetAl.width, y: targetAl.height },
          { x: 0, y: targetAl.height },
        ].map((p) => ({
          x: mat[0] * p.x + mat[2] * p.y + mat[4],
          y: mat[1] * p.x + mat[3] * p.y + mat[5],
        }));
        const minX = Math.min(...corners.map((c) => c.x));
        const maxX = Math.max(...corners.map((c) => c.x));
        const minY = Math.min(...corners.map((c) => c.y));
        const maxY = Math.max(...corners.map((c) => c.y));
        return {
          bitmap: targetAl.originalBitmap || targetAl.bitmap,
          width: targetAl.width,
          height: targetAl.height,
          fx: 0,
          fy: 0,
          worldMatrix: mat,
          minX,
          minY,
          maxX,
          maxY,
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
          label: targetAl.name,
        };
      }

      const targetSh = shapes.find((x) => x.id === targetId);
      if (targetSh) {
        const lt = getEffectiveTransform(targetSh.id, targetSh.assetKey, frameIdx);
        const mat = computeAddedLayerFrameMatrix(targetSh.w, targetSh.h, canvasW, canvasH, lt, docT);
        const corners = [
          { x: 0, y: 0 },
          { x: targetSh.w, y: 0 },
          { x: targetSh.w, y: targetSh.h },
          { x: 0, y: targetSh.h },
        ].map((p) => ({
          x: mat[0] * p.x + mat[2] * p.y + mat[4],
          y: mat[1] * p.x + mat[3] * p.y + mat[5],
        }));
        const minX = Math.min(...corners.map((c) => c.x));
        const maxX = Math.max(...corners.map((c) => c.x));
        const minY = Math.min(...corners.map((c) => c.y));
        const maxY = Math.max(...corners.map((c) => c.y));
        return {
          bitmap: null,
          width: targetSh.w,
          height: targetSh.h,
          fx: 0,
          fy: 0,
          worldMatrix: mat,
          minX,
          minY,
          maxX,
          maxY,
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
          label: targetSh.name,
        };
      }

      const padX = Math.round(canvasW * 0.14);
      const padY = Math.round(canvasH * 0.14);
      return {
        bitmap: null,
        width: canvasW,
        height: canvasH,
        fx: 0,
        fy: 0,
        worldMatrix: [1, 0, 0, 1, 0, 0],
        minX: padX,
        minY: padY,
        maxX: canvasW - padX,
        maxY: canvasH - padY,
        cx: canvasW / 2,
        cy: canvasH / 2,
        label: docName,
      };
    },
    [
      getEffectiveTransform,
      movie.sp,
      totalFrames,
      spriteFrameRanges,
      bitmaps,
      thumbs,
      canvasW,
      canvasH,
      addedLayers,
      shapes,
      docName,
    ]
  );

  const traceContoursFromLayerTarget = useCallback(
    (
      targetId: string,
      includeInnerHole: boolean,
      numRays = 28
    ): {
      contours: Point2D[][];
      bounds: ReturnType<typeof getTargetLayerBoundsAndBitmapAtFrame>;
    } => {
      const info = getTargetLayerBoundsAndBitmapAtFrame(targetId, currentFrame);
      if (info.bitmap) {
        try {
          const sampleW = Math.min(256, Math.max(16, info.bitmap.width));
          const sampleH = Math.min(256, Math.max(16, info.bitmap.height));
          const c = document.createElement('canvas');
          c.width = sampleW;
          c.height = sampleH;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.drawImage(info.bitmap, 0, 0, sampleW, sampleH);
            const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
            const scaleToLocalX = info.width / sampleW;
            const scaleToLocalY = info.height / sampleH;
            const fx = info.fx || 0;
            const fy = info.fy || 0;
            const adjMat: [number, number, number, number, number, number] = [
              info.worldMatrix[0] * scaleToLocalX,
              info.worldMatrix[1] * scaleToLocalX,
              info.worldMatrix[2] * scaleToLocalY,
              info.worldMatrix[3] * scaleToLocalY,
              info.worldMatrix[0] * fx + info.worldMatrix[2] * fy + info.worldMatrix[4],
              info.worldMatrix[1] * fx + info.worldMatrix[3] * fy + info.worldMatrix[5],
            ];
            const traced = traceAlphaContourFromRgba(
              imgData.data,
              sampleW,
              sampleH,
              adjMat,
              {
                alphaThreshold: 14,
                detectInnerHole: includeInnerHole,
                contourMethod: 'moore',
                rdpEpsilon: 1.1,
              }
            );
            if (traced.length > 0 && traced[0].length >= 3) {
              return { contours: traced, bounds: info };
            }
          }
        } catch {}
      }

      const rx = Math.max(24, (info.maxX - info.minX) / 2);
      const ry = Math.max(24, (info.maxY - info.minY) / 2);
      const fallbackContours = generateRingFrameMaskContours(
        info.cx,
        info.cy,
        rx,
        ry,
        includeInnerHole ? 0.28 : 1,
        24
      );
      return { contours: fallbackContours, bounds: info };
    },
    [getTargetLayerBoundsAndBitmapAtFrame, currentFrame]
  );

  const handleCreateShineLayer = useCallback(
    async (preferredTargetId?: string): Promise<string> => {
      // Pick the best target layer: preferredTargetId -> selectedTarget (if not a shine layer) -> topmost addedLayer -> topmost sprite -> DOCUMENT
      let resolvedTargetId = preferredTargetId || selectedTarget;
      const selectedAdded = addedLayers.find((l) => l.id === resolvedTargetId);
      if (selectedAdded?.shineConfig?.enabled) {
        resolvedTargetId = selectedAdded.shineConfig.targetLayerId || 'DOCUMENT';
      }
      if (
        (!resolvedTargetId || resolvedTargetId === 'DOCUMENT' || resolvedTargetId.startsWith('merged_group_')) &&
        !preferredTargetId
      ) {
        const nonShineAdded = [...addedLayers].reverse().find((l) => !l.shineConfig?.enabled && !hiddenLayerIds.has(l.id));
        if (nonShineAdded) {
          resolvedTargetId = nonShineAdded.id;
        } else if (spriteLayers.length > 0) {
          resolvedTargetId = spriteLayers[0].id;
        } else {
          resolvedTargetId = 'DOCUMENT';
        }
      }

      const { contours, bounds } = traceContoursFromLayerTarget(resolvedTargetId, true, 28);
      const spanW = Math.max(60, bounds.maxX - bounds.minX);
      const spanH = Math.max(60, bounds.maxY - bounds.minY);
      const shineW = Math.max(180, Math.min(900, Math.round(Math.max(spanW, spanH) * 1.55)));
      const shineH = shineW;

      const motionPoints: Point2D[] = [
        {
          x: Number((bounds.cx - spanW * 0.65).toFixed(1)),
          y: Number((bounds.cy - spanH * 0.55).toFixed(1)),
        },
        {
          x: Number(bounds.cx.toFixed(1)),
          y: Number(bounds.cy.toFixed(1)),
        },
        {
          x: Number((bounds.cx + spanW * 0.65).toFixed(1)),
          y: Number((bounds.cy + spanH * 0.55).toFixed(1)),
        },
      ];

      const sweepStart = 0;
      const sweepEnd = Math.max(1, totalFrames - 1);
      const presetId: ShineLayerConfig['presetId'] = 'royal_gold';
      const beamAngleDeg = -32;
      const beamWidthRatio = 0.28;
      const beamSoftness = 0.85;
      const colorPrimary = '#fde047';
      const colorSecondary = '#ffffff';

      const rendered = await renderProceduralShineBitmapAndBytes({
        presetId,
        width: shineW,
        height: shineH,
        colorPrimary,
        colorSecondary,
        beamAngleDeg,
        beamWidthRatio,
        beamSoftness,
      });

      const seqNum = addedLayers.filter((l) => l.shineConfig?.enabled).length + 1;
      const id = `layer_shine_${Date.now()}_${seqNum}`;
      const assetKey = `shine_beam_${seqNum}`;
      const name = `✨ لمعة احترافية ${seqNum} (${bounds.label.slice(0, 18)})`;

      const shineConfig: ShineLayerConfig = {
        enabled: true,
        targetLayerId: resolvedTargetId,
        followTargetLayerTransform: true,
        exactLayerAlphaMask: true,
        blendMode: 'screen',
        maskMode: 'auto_layer_contour',
        maskContours: contours,
        motionPoints,
        presetId,
        colorPrimary,
        colorSecondary,
        beamAngleDeg,
        beamWidthRatio,
        beamSoftness,
        shineWidth: rendered.width,
        shineHeight: rendered.height,
        startFrame: sweepStart,
        endFrame: sweepEnd,
        loopCount: 1,
        pauseFrames: 0,
        referenceFrame: currentFrame,
      };

      const kfs = buildShineKeyframesFromMotionPoints(
        shineConfig,
        totalFrames,
        canvasW,
        canvasH,
        100
      );

      const startPos = kfs.position?.[sweepStart] || {
        x: Number((motionPoints[0].x - canvasW / 2).toFixed(2)),
        y: Number((motionPoints[0].y - canvasH / 2).toFixed(2)),
      };

      const newShineLayer: AddedLayer = {
        id,
        assetKey,
        name,
        bitmap: rendered.bitmap,
        originalBitmap: rendered.bitmap,
        originalWidth: rendered.width,
        originalHeight: rendered.height,
        pngBytes: rendered.pngBytes,
        dataUrl: rendered.dataUrl,
        width: rendered.width,
        height: rendered.height,
        bytes: rendered.pngBytes.byteLength,
        transform: {
          ...DEFAULT_TRANSFORM,
          x: startPos.x,
          y: startPos.y,
          opacity: 100,
        },
        inFrame: 0,
        outFrame: totalFrames - 1,
        shineConfig,
      };

      // Position new shine layer directly above its target layer in effectiveLayerOrder
      const targetIdxInOrder = effectiveLayerOrder.indexOf(resolvedTargetId);
      const nextLayerOrder = [...effectiveLayerOrder];
      if (targetIdxInOrder !== -1) {
        nextLayerOrder.splice(targetIdxInOrder + 1, 0, id);
      } else {
        nextLayerOrder.push(id);
      }
      setLayerOrder(nextLayerOrder);

      let nextAdded: AddedLayer[];
      const targetInAddedIdx = addedLayers.findIndex((l) => l.id === resolvedTargetId);
      if (targetInAddedIdx !== -1) {
        nextAdded = [...addedLayers];
        nextAdded.splice(targetInAddedIdx + 1, 0, newShineLayer);
      } else {
        nextAdded = [...addedLayers, newShineLayer];
      }
      const nextKfs = { ...layerKeyframes, [id]: kfs };
      setAddedLayers(nextAdded);
      setLayerKeyframes(nextKfs);
      setExpandedTimelineLayerIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setSelectedTarget(id);
      setSelectedAssetKey(null);
      setShineEditSubmode('motion_points');
      setActiveTool('Shine');
      pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
        addedLayers: nextAdded,
        layerKeyframes: nextKfs,
        layerOrder: nextLayerOrder,
      });
      setLastAction(
        `✨ تم وضع طبقة اللمعة الاحترافية فوق الطبقة المستهدفة مباشرة (${bounds.label}) بنفس حواف وشكل الطبقة الأصلية 100% بدون أي آثار قص`
      );
      return id;
    },
    [
      selectedTarget,
      addedLayers,
      effectiveLayerOrder,
      hiddenLayerIds,
      spriteLayers,
      traceContoursFromLayerTarget,
      totalFrames,
      canvasW,
      canvasH,
      currentFrame,
      layerKeyframes,
      pushHistory,
      docTransform,
      layerTransforms,
      deletedSpriteIndices,
    ]
  );

  const handleUpdateShineConfig = useCallback(
    async (
      shineLayerId: string,
      patch: Partial<ShineLayerConfig>,
      options?: {
        regenerateBitmap?: boolean;
        regenerateKeyframes?: boolean;
        actionLabel?: string;
      }
    ) => {
      const targetLayer = addedLayers.find((l) => l.id === shineLayerId);
      if (!targetLayer || !targetLayer.shineConfig) return;

      const nextConfig: ShineLayerConfig = {
        ...targetLayer.shineConfig,
        ...patch,
      };

      let nextBitmap = targetLayer.bitmap;
      let nextPngBytes = targetLayer.pngBytes;
      let nextDataUrl = targetLayer.dataUrl;
      let nextW = targetLayer.width;
      let nextH = targetLayer.height;

      if (options?.regenerateBitmap && nextConfig.presetId !== 'custom_image') {
        const rendered = await renderProceduralShineBitmapAndBytes({
          presetId: nextConfig.presetId,
          width: nextConfig.shineWidth || targetLayer.width,
          height: nextConfig.shineHeight || targetLayer.height,
          colorPrimary: nextConfig.colorPrimary || '#fde047',
          colorSecondary: nextConfig.colorSecondary || '#ffffff',
          beamAngleDeg: nextConfig.beamAngleDeg ?? -32,
          beamWidthRatio: nextConfig.beamWidthRatio ?? 0.28,
          beamSoftness: nextConfig.beamSoftness ?? 0.85,
        });
        nextBitmap = rendered.bitmap;
        nextPngBytes = rendered.pngBytes;
        nextDataUrl = rendered.dataUrl;
        nextW = rendered.width;
        nextH = rendered.height;
      }

      let nextTransform = targetLayer.transform;
      if (options?.regenerateKeyframes && nextConfig.motionPoints.length >= 1) {
        const kfs = buildShineKeyframesFromMotionPoints(
          nextConfig,
          totalFrames,
          canvasW,
          canvasH,
          targetLayer.transform.opacity || 100
        );
        const posAtCur =
          kfs.position?.[currentFrame] ||
          kfs.position?.[nextConfig.startFrame] || {
            x: targetLayer.transform.x,
            y: targetLayer.transform.y,
          };
        nextTransform = {
          ...targetLayer.transform,
          x: posAtCur.x,
          y: posAtCur.y,
        };
        setLayerKeyframes((prev) => ({
          ...prev,
          [shineLayerId]: {
            ...prev[shineLayerId],
            position: kfs.position,
            opacity: kfs.opacity,
          },
        }));
      }

      setAddedLayers((prev) =>
        prev.map((l) =>
          l.id === shineLayerId
            ? {
                ...l,
                bitmap: nextBitmap,
                originalBitmap: nextBitmap,
                pngBytes: nextPngBytes,
                dataUrl: nextDataUrl,
                width: nextW,
                height: nextH,
                bytes: nextPngBytes.byteLength,
                transform: nextTransform,
                shineConfig: {
                  ...nextConfig,
                  shineWidth: nextW,
                  shineHeight: nextH,
                },
              }
            : l
        )
      );

      if (options?.actionLabel) {
        setLastAction(options.actionLabel);
      }
    },
    [addedLayers, canvasW, canvasH, totalFrames, currentFrame]
  );

  const handleAutoTraceShineTarget = useCallback(
    (shineLayerId: string, overrideTargetId?: string) => {
      const targetLayer = addedLayers.find((l) => l.id === shineLayerId);
      if (!targetLayer || !targetLayer.shineConfig) return;
      const targetId = overrideTargetId || targetLayer.shineConfig.targetLayerId || 'DOCUMENT';
      const { contours, bounds } = traceContoursFromLayerTarget(targetId, true, 28);
      handleUpdateShineConfig(
        shineLayerId,
        {
          targetLayerId: targetId,
          maskContours: contours,
          maskMode: 'auto_layer_contour',
          exactLayerAlphaMask: true,
          referenceFrame: currentFrame,
        },
        {
          actionLabel: `🎯 تم استدعاء وتتبع حواف الطبقة (${bounds.label}) بدقة 100% بدون آثار قص (${contours[0]?.length || 0} نقطة)`,
        }
      );
    },
    [addedLayers, traceContoursFromLayerTarget, handleUpdateShineConfig, currentFrame]
  );

  const handleApplyShinePresetMask = useCallback(
    (shineLayerId: string, preset: 'ring' | 'rect' | 'clear_for_free_draw') => {
      const targetLayer = addedLayers.find((l) => l.id === shineLayerId);
      if (!targetLayer || !targetLayer.shineConfig) return;
      const bounds = getTargetLayerBoundsAndBitmapAtFrame(
        targetLayer.shineConfig.targetLayerId,
        currentFrame
      );
      if (preset === 'clear_for_free_draw') {
        handleUpdateShineConfig(
          shineLayerId,
          {
            maskContours: [[]],
            maskMode: 'interactive_points',
          },
          {
            actionLabel:
              '✏️ تم تفريغ نقاط القناع — اضغط الآن بالماوس على الكانفاس لوضع نقاط القناع بحرية حول الشكل',
          }
        );
        setShineEditSubmode('mask_points');
        setActiveTool('Shine');
        return;
      }

      if (preset === 'ring') {
        const rx = Math.max(30, (bounds.maxX - bounds.minX) / 2);
        const ry = Math.max(30, (bounds.maxY - bounds.minY) / 2);
        const contours = generateRingFrameMaskContours(bounds.cx, bounds.cy, rx, ry, 0.28, 24);
        handleUpdateShineConfig(
          shineLayerId,
          {
            maskContours: contours,
            maskMode: 'ring_frame',
          },
          {
            actionLabel: '⭕ تم تطبيق قناع إطار دائري مفرغ منحني (مثل إطار الهند) قابل لتحريك النقاط',
          }
        );
        setShineEditSubmode('mask_points');
        return;
      }

      if (preset === 'rect') {
        const w = Math.max(50, bounds.maxX - bounds.minX);
        const h = Math.max(50, bounds.maxY - bounds.minY);
        const contours = generateRectMaskContours(bounds.minX, bounds.minY, w, h);
        handleUpdateShineConfig(
          shineLayerId,
          {
            maskContours: contours,
            maskMode: 'rect_box',
          },
          {
            actionLabel: '⬜ تم تطبيق قناع مستطيل حول الطبقة قابل لتحريك النقاط',
          }
        );
        setShineEditSubmode('mask_points');
      }
    },
    [addedLayers, getTargetLayerBoundsAndBitmapAtFrame, currentFrame, handleUpdateShineConfig]
  );

  const handleRemoveLastShineMaskPoint = useCallback(
    (shineLayerId: string) => {
      const targetLayer = addedLayers.find((l) => l.id === shineLayerId);
      if (!targetLayer || !targetLayer.shineConfig) return;
      const outer = targetLayer.shineConfig.maskContours[0] || [];
      if (outer.length === 0) return;
      const nextOuter = outer.slice(0, -1);
      const nextContours = [nextOuter, ...targetLayer.shineConfig.maskContours.slice(1)];
      handleUpdateShineConfig(
        shineLayerId,
        { maskContours: nextContours },
        { actionLabel: `تم حذف آخر نقطة قناع (متبقي ${nextOuter.length} نقطة)` }
      );
    },
    [addedLayers, handleUpdateShineConfig]
  );

  const handleApplyShineMotionDirection = useCallback(
    (
      shineLayerId: string,
      dir: 'diag_tl_br' | 'diag_tr_bl' | 'horiz_lr' | 'vert_tb' | 'reverse'
    ) => {
      const targetLayer = addedLayers.find((l) => l.id === shineLayerId);
      if (!targetLayer || !targetLayer.shineConfig) return;
      const sc = targetLayer.shineConfig;

      if (dir === 'reverse') {
        const rev = [...sc.motionPoints].reverse();
        handleUpdateShineConfig(
          shineLayerId,
          { motionPoints: rev },
          {
            regenerateKeyframes: true,
            actionLabel: '⇄ تم عكس اتجاه مسار حركة اللمعة',
          }
        );
        return;
      }

      const bounds = getTargetLayerBoundsAndBitmapAtFrame(sc.targetLayerId, currentFrame);
      const spanW = Math.max(60, bounds.maxX - bounds.minX);
      const spanH = Math.max(60, bounds.maxY - bounds.minY);
      let nextPts: ShinePoint[] = [];
      let nextAngle = sc.beamAngleDeg;

      if (dir === 'diag_tl_br') {
        nextPts = [
          { x: Number((bounds.cx - spanW * 0.65).toFixed(1)), y: Number((bounds.cy - spanH * 0.55).toFixed(1)) },
          { x: Number(bounds.cx.toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
          { x: Number((bounds.cx + spanW * 0.65).toFixed(1)), y: Number((bounds.cy + spanH * 0.55).toFixed(1)) },
        ];
        nextAngle = 135;
      } else if (dir === 'diag_tr_bl') {
        nextPts = [
          { x: Number((bounds.cx + spanW * 0.65).toFixed(1)), y: Number((bounds.cy - spanH * 0.55).toFixed(1)) },
          { x: Number(bounds.cx.toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
          { x: Number((bounds.cx - spanW * 0.65).toFixed(1)), y: Number((bounds.cy + spanH * 0.55).toFixed(1)) },
        ];
        nextAngle = 45;
      } else if (dir === 'horiz_lr') {
        nextPts = [
          { x: Number((bounds.cx - spanW * 0.7).toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
          { x: Number(bounds.cx.toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
          { x: Number((bounds.cx + spanW * 0.7).toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
        ];
        nextAngle = 115;
      } else if (dir === 'vert_tb') {
        nextPts = [
          { x: Number(bounds.cx.toFixed(1)), y: Number((bounds.cy - spanH * 0.7).toFixed(1)) },
          { x: Number(bounds.cx.toFixed(1)), y: Number(bounds.cy.toFixed(1)) },
          { x: Number(bounds.cx.toFixed(1)), y: Number((bounds.cy + spanH * 0.7).toFixed(1)) },
        ];
        nextAngle = 25;
      }

      handleUpdateShineConfig(
        shineLayerId,
        { motionPoints: nextPts, beamAngleDeg: nextAngle },
        {
          regenerateBitmap: sc.presetId !== 'custom_image',
          regenerateKeyframes: true,
          actionLabel: '🧭 تم تحديث مسار حركة اللمعة وزاوية الشعاع تلقائياً',
        }
      );
      setShineEditSubmode('motion_points');
    },
    [addedLayers, getTargetLayerBoundsAndBitmapAtFrame, currentFrame, handleUpdateShineConfig]
  );

  const handleAddShineMotionMidpoint = useCallback(
    (shineLayerId: string) => {
      const targetLayer = addedLayers.find((l) => l.id === shineLayerId);
      if (!targetLayer || !targetLayer.shineConfig) return;
      const pts = targetLayer.shineConfig.motionPoints || [];
      let nextPts: ShinePoint[];
      if (pts.length === 0) {
        nextPts = [
          { x: Math.round(canvasW * 0.25), y: Math.round(canvasH * 0.25) },
          { x: Math.round(canvasW * 0.75), y: Math.round(canvasH * 0.75) },
        ];
      } else if (pts.length === 1) {
        nextPts = [
          pts[0],
          { x: Math.min(canvasW, pts[0].x + 120), y: Math.min(canvasH, pts[0].y + 120) },
        ];
      } else {
        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const mid: ShinePoint = {
          x: Number(((prev.x + last.x) / 2 + 25).toFixed(1)),
          y: Number(((prev.y + last.y) / 2 - 25).toFixed(1)),
        };
        nextPts = [...pts.slice(0, -1), mid, last];
      }
      handleUpdateShineConfig(
        shineLayerId,
        { motionPoints: nextPts },
        {
          regenerateKeyframes: true,
          actionLabel: `📍 تم إضافة نقطة مسار حركة للّمعـة (إجمالي ${nextPts.length} نقاط)`,
        }
      );
      setShineEditSubmode('motion_points');
    },
    [addedLayers, canvasW, canvasH, handleUpdateShineConfig]
  );

  const handleRemoveLastShineMotionPoint = useCallback(
    (shineLayerId: string) => {
      const targetLayer = addedLayers.find((l) => l.id === shineLayerId);
      if (!targetLayer || !targetLayer.shineConfig) return;
      const pts = targetLayer.shineConfig.motionPoints || [];
      if (pts.length <= 2) return;
      const nextPts = [...pts.slice(0, -2), pts[pts.length - 1]];
      handleUpdateShineConfig(
        shineLayerId,
        { motionPoints: nextPts },
        {
          regenerateKeyframes: true,
          actionLabel: `تم حذف النقطة الوسطى من مسار اللمعة (متبقي ${nextPts.length} نقاط)`,
        }
      );
    },
    [addedLayers, handleUpdateShineConfig]
  );

  const handleUploadCustomShineImage = useCallback(
    async (shineLayerId: string, file: File) => {
      try {
        const rawBm = await createImageBitmap(file);
        const feathered = await featherCustomShineBitmap(rawBm);

        setAddedLayers((prev) =>
          prev.map((l) =>
            l.id === shineLayerId && l.shineConfig
              ? {
                  ...l,
                  bitmap: feathered.bitmap,
                  originalBitmap: feathered.bitmap,
                  originalWidth: feathered.width,
                  originalHeight: feathered.height,
                  pngBytes: feathered.pngBytes,
                  dataUrl: feathered.dataUrl,
                  width: feathered.width,
                  height: feathered.height,
                  bytes: feathered.pngBytes.byteLength,
                  shineConfig: {
                    ...l.shineConfig,
                    presetId: 'custom_image',
                    shineWidth: feathered.width,
                    shineHeight: feathered.height,
                  },
                }
              : l
          )
        );
        setLastAction(`✨ تم رفع صورة لمعة مخصصة وتنعيم حوافها لمنع آثار القص (${file.name})`);
      } catch {
        setLastAction('تعذر قراءة صورة اللمعة المرفوعة');
      }
    },
    []
  );

  const handleSelectSvgaAssetAsShineImage = useCallback(
    async (shineLayerId: string, assetKey: string) => {
      const bm = bitmaps[assetKey];
      const th = thumbs[assetKey];
      const rawBytes = movie.im[assetKey];
      if (!bm || !th || !rawBytes) return;

      const feathered = await featherCustomShineBitmap(bm);

      setAddedLayers((prev) =>
        prev.map((l) =>
          l.id === shineLayerId && l.shineConfig
            ? {
                ...l,
                bitmap: feathered.bitmap,
                originalBitmap: feathered.bitmap,
                originalWidth: feathered.width,
                originalHeight: feathered.height,
                pngBytes: feathered.pngBytes,
                dataUrl: feathered.dataUrl,
                width: feathered.width,
                height: feathered.height,
                bytes: feathered.pngBytes.byteLength,
                shineConfig: {
                  ...l.shineConfig,
                  presetId: 'custom_image',
                  shineWidth: feathered.width,
                  shineHeight: feathered.height,
                },
              }
            : l
        )
      );
      setLastAction(`✨ تم اختيار صورة اللمعة (${assetKey}) وتنعيم حوافها لمنع آثار القص`);
    },
    [bitmaps, thumbs, movie.im]
  );

  const handleConvertExistingSpriteToShineLayer = useCallback(
    async (spriteIdx: number) => {
      const sp = movie.sp[spriteIdx];
      if (!sp) return;
      const bm = sp.key ? bitmaps[sp.key] : undefined;
      const th = sp.key ? thumbs[sp.key] : undefined;
      const rawBytes = sp.key ? movie.im[sp.key] : undefined;
      const extracted = extractShineConfigFromExistingSprite(
        sp.fr,
        th?.w || bm?.width || canvasW,
        th?.h || bm?.height || canvasH,
        canvasW,
        canvasH
      );

      let shineBm = bm;
      let shineBytes = rawBytes;
      let shineUrl = th?.url || '';
      let shineW = th?.w || bm?.width || 300;
      let shineH = th?.h || bm?.height || 300;

      if (!shineBm || !shineBytes) {
        const rendered = await renderProceduralShineBitmapAndBytes({
          presetId: 'royal_gold',
          width: 320,
          height: 320,
          colorPrimary: '#fde047',
          colorSecondary: '#ffffff',
          beamAngleDeg: -32,
          beamWidthRatio: 0.28,
          beamSoftness: 0.85,
        });
        shineBm = rendered.bitmap;
        shineBytes = rendered.pngBytes;
        shineUrl = rendered.dataUrl;
        shineW = rendered.width;
        shineH = rendered.height;
      }

      const maskContours =
        extracted?.maskContours && extracted.maskContours.length > 0
          ? extracted.maskContours
          : generateRingFrameMaskContours(
              canvasW / 2,
              canvasH / 2,
              Math.min(canvasW, canvasH) * 0.36,
              Math.min(canvasW, canvasH) * 0.36,
              0.28,
              24
            );
      const motionPoints =
        extracted?.motionPoints && extracted.motionPoints.length >= 2
          ? extracted.motionPoints
          : [
              { x: Math.round(canvasW * 0.2), y: Math.round(canvasH * 0.2) },
              { x: Math.round(canvasW * 0.5), y: Math.round(canvasH * 0.5) },
              { x: Math.round(canvasW * 0.8), y: Math.round(canvasH * 0.8) },
            ];
      const sweepStart = extracted?.startFrame ?? 0;
      const sweepEnd = extracted?.endFrame ?? Math.max(1, totalFrames - 1);

      const id = `layer_shine_sp_${spriteIdx}_${Date.now()}`;
      const newConfig: ShineLayerConfig = {
        enabled: true,
        targetLayerId: 'DOCUMENT',
        followTargetLayerTransform: false,
        exactLayerAlphaMask: true,
        blendMode: 'screen',
        maskMode: 'interactive_points',
        maskContours,
        motionPoints,
        presetId: sp.key && bm ? 'custom_image' : 'royal_gold',
        colorPrimary: '#fde047',
        colorSecondary: '#ffffff',
        beamAngleDeg: -32,
        beamWidthRatio: 0.28,
        beamSoftness: 0.85,
        shineWidth: shineW,
        shineHeight: shineH,
        startFrame: sweepStart,
        endFrame: sweepEnd,
        loopCount: 1,
        pauseFrames: 0,
        referenceFrame: currentFrame,
      };

      const kfs = buildShineKeyframesFromMotionPoints(
        newConfig,
        totalFrames,
        canvasW,
        canvasH,
        100
      );
      const startPos = kfs.position?.[sweepStart] || { x: 0, y: 0 };

      const newShineLayer: AddedLayer = {
        id,
        assetKey: `${sp.key || 'shine'}_editable`,
        name: `✨ لمعة: ${sp.key || `#${movie.sp.length - spriteIdx}`}`,
        bitmap: shineBm,
        originalBitmap: shineBm,
        originalWidth: shineW,
        originalHeight: shineH,
        pngBytes: shineBytes,
        dataUrl: shineUrl,
        width: shineW,
        height: shineH,
        bytes: shineBytes.byteLength,
        transform: { ...DEFAULT_TRANSFORM, x: startPos.x, y: startPos.y, opacity: 100 },
        inFrame: 0,
        outFrame: totalFrames - 1,
        shineConfig: newConfig,
      };

      // Hide original sprite so the new editable shine layer replaces it cleanly
      setHiddenLayerIds((prev) => {
        const next = new Set(prev);
        next.add(`sprite_${spriteIdx}`);
        return next;
      });
      setAddedLayers((prev) => [...prev, newShineLayer]);
      setLayerKeyframes((prev) => ({ ...prev, [id]: kfs }));
      setSelectedTarget(id);
      setSelectedAssetKey(null);
      setShineEditSubmode('mask_points');
      setActiveTool('Shine');
      setLastAction(
        `✨ تم استخراج قناع ومسار لمعة الطبقة (${sp.key}) لتحرير نقاطها بحرية على الكانفاس`
      );
    },
    [movie.sp, movie.im, bitmaps, thumbs, canvasW, canvasH, totalFrames, currentFrame]
  );

  // Target options list for SvgaShineStudioPanel
  const shineTargetOptions = useMemo<ShineTargetOption[]>(() => {
    const opts: ShineTargetOption[] = [
      { id: 'DOCUMENT', label: `📐 كامل إطار المشروع (${canvasW}×${canvasH})` },
    ];
    addedLayers.forEach((al) => {
      if (al.shineConfig?.enabled) return;
      opts.push({
        id: al.id,
        label: `🖼️ طبقة مضافة: ${al.name} (${al.width}×${al.height})`,
        assetKey: al.assetKey,
      });
    });
    spriteLayers.forEach((sl) => {
      opts.push({
        id: sl.id,
        label: `🎞️ طبقة #${sl.displayNum}: ${sl.key}`,
        assetKey: sl.key,
      });
    });
    shapes.forEach((sh) => {
      opts.push({
        id: sh.id,
        label: `🔷 شكل/نص: ${sh.name}`,
      });
    });
    return opts;
  }, [canvasW, canvasH, addedLayers, spriteLayers, shapes]);

  // Expose programmatic helpers on window for automated E2E verification
  useEffect(() => {
    (window as any).__svgaCopyMotionToAddedLayer = handleCopyMotionFromSpriteToAddedLayer;
    (window as any).__svgaDuplicateLayer = handleDuplicateLayer;
    (window as any).__svgaFlipLayerHorizontally = handleFlipLayerHorizontally;
    (window as any).__svgaBakeAddedLayerDimensions = handleBakeAddedLayerDimensions;
    (window as any).__svgaUpdateLayerTransform = updateLayerTransformById;
    (window as any).__svgaCreateShineLayer = handleCreateShineLayer;
    (window as any).__svgaUpdateShineConfig = handleUpdateShineConfig;
    (window as any).__svgaSeedTestProject = async () => {
      const c1 = document.createElement('canvas');
      c1.width = 240;
      c1.height = 240;
      const ctx1 = c1.getContext('2d')!;
      ctx1.fillStyle = '#a855f7';
      ctx1.beginPath();
      ctx1.arc(120, 120, 90, 0, Math.PI * 2);
      ctx1.fill();
      const blob1: Blob = await new Promise((r) => c1.toBlob((b) => r(b!), 'image/png'));
      const bm1 = await createImageBitmap(blob1);
      const bytes1 = new Uint8Array(await blob1.arrayBuffer());

      const c2 = document.createElement('canvas');
      c2.width = 120;
      c2.height = 120;
      const ctx2 = c2.getContext('2d')!;
      ctx2.fillStyle = '#f59e0b';
      ctx2.fillRect(10, 10, 100, 100);
      ctx2.strokeStyle = '#fef08a';
      ctx2.lineWidth = 6;
      ctx2.strokeRect(10, 10, 100, 100);
      const blob2: Blob = await new Promise((r) => c2.toBlob((b) => r(b!), 'image/png'));
      const bm2 = await createImageBitmap(blob2);
      const bytes2 = new Uint8Array(await blob2.arrayBuffer());

      const frames = Array.from({ length: 30 }, (_, i) => ({
        a: 1,
        x: 0,
        y: 0,
        w: 240,
        h: 240,
        t: [1 + i * 0.01, 0, 0, 1 + i * 0.01, 130 + i * 2, 130] as [
          number,
          number,
          number,
          number,
          number,
          number,
        ],
        shapesRaw: [],
      }));

      setMovie({
        w: 500,
        h: 500,
        fps: 30,
        n: 30,
        im: { crown_glow: bytes1 },
        sp: [{ key: 'crown_glow', fr: frames }],
      });
      setBitmaps({ crown_glow: bm1 });
      setThumbs({ crown_glow: { url: c1.toDataURL('image/png'), w: 240, h: 240 } });

      const addedId = 'layer_test_1';
      const newLayer: AddedLayer = {
        id: addedId,
        assetKey: 'custom_badge_1',
        name: 'custom_badge',
        bitmap: bm2,
        pngBytes: bytes2,
        dataUrl: c2.toDataURL('image/png'),
        width: 120,
        height: 120,
        bytes: bytes2.byteLength,
        transform: { ...DEFAULT_TRANSFORM },
        inFrame: 0,
        outFrame: 29,
      };
      setAddedLayers([newLayer]);
      setSelectedTarget(addedId);
      setSelectedAssetKey(null);
      return addedId;
    };
    (window as any).__svgaEditorState = () => ({
      spriteCount: movie.sp.length,
      addedLayers: addedLayers.map((a) => ({
        id: a.id,
        name: a.name,
        width: a.width,
        height: a.height,
        transform: a.transform,
        effectivePixelWidth: Math.max(1, Math.round((a.width * Math.abs(a.transform.sx)) / 100)),
        effectivePixelHeight: Math.max(1, Math.round((a.height * Math.abs(a.transform.sy)) / 100)),
        inFrame: a.inFrame,
        outFrame: a.outFrame,
        copiedFromKey: a.copiedFromKey || null,
        copiedFramesCount: a.copiedFrames?.length || 0,
        shineConfig: a.shineConfig || null,
      })),
      selectedTarget,
    });
  }, [
    handleCopyMotionFromSpriteToAddedLayer,
    handleDuplicateLayer,
    handleFlipLayerHorizontally,
    handleBakeAddedLayerDimensions,
    updateLayerTransformById,
    handleCreateShineLayer,
    handleUpdateShineConfig,
    movie.sp.length,
    addedLayers,
    selectedTarget,
  ]);


  // Keyboard shortcuts (Ctrl+Z Undo, Ctrl+Y Redo, Delete to delete layer, Space to play/pause)
  // Also Mouse Back / Forward buttons (button 3 / 4) for Undo / Redo!
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.key === 'Escape') {
        setCropRect(null);
        setContextMenu(null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTarget !== 'DOCUMENT') {
          e.preventDefault();
          handleDeleteLayer(selectedTarget);
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'Enter' && activeTool === 'Pen' && penDraftPoints.length >= 2) {
        e.preventDefault();
        finishPenDraft();
      }
    };

    const onMouseUpGlobal = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        handleUndo();
      } else if (e.button === 4) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mouseup', onMouseUpGlobal);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mouseup', onMouseUpGlobal);
    };
  });

  // Hit-test topmost visible layer at canvas coordinate (cx, cy)
  const hitTestCanvasPoint = (
    cx: number,
    cy: number
  ): { target: string; assetKey: string | null } => {
    const docT = getEffectiveTransform('DOCUMENT', undefined, currentFrame);

    // 1. Check shapes in reverse order
    for (let i = shapes.length - 1; i >= 0; i--) {
      const sh = shapes[i];
      if (hiddenLayerIds.has(sh.id)) continue;
      if (currentFrame < sh.inFrame || currentFrame > sh.outFrame) continue;
      const lt = getEffectiveTransform(sh.id, sh.assetKey, currentFrame);
      const mat = computeAddedLayerFrameMatrix(sh.w, sh.h, canvasW, canvasH, lt, docT);
      const inv = invertAffine(mat);
      if (!inv) continue;
      const lx = inv[0] * cx + inv[2] * cy + inv[4];
      const ly = inv[1] * cx + inv[3] * cy + inv[5];
      if (lx >= 0 && lx <= sh.w && ly >= 0 && ly <= sh.h) {
        return { target: sh.id, assetKey: null };
      }
    }

    // 2. Check added image layers in reverse order
    for (let i = addedLayers.length - 1; i >= 0; i--) {
      const al = addedLayers[i];
      if (hiddenLayerIds.has(al.id)) continue;
      if (currentFrame < al.inFrame || currentFrame > al.outFrame) continue;
      const lt = getEffectiveTransform(al.id, al.assetKey, currentFrame);
      if (al.copiedFrames && al.copiedFrames.length > 0 && !al.shineConfig?.enabled) {
        const safeIdx = Math.max(0, Math.min(al.copiedFrames.length - 1, currentFrame));
        const cf = al.copiedFrames[safeIdx];
        if (!cf || cf.a <= 0.01) continue;
        const fw = cf.w || al.width || canvasW;
        const fh = cf.h || al.height || canvasH;
        const mat = computeSpriteFrameMatrix(cf, fw, fh, canvasW, canvasH, lt, docT);
        const inv = invertAffine(mat);
        if (!inv) continue;
        const lx = inv[0] * cx + inv[2] * cy + inv[4];
        const ly = inv[1] * cx + inv[3] * cy + inv[5];
        const fx = cf.x || 0;
        const fy = cf.y || 0;
        if (lx >= fx && lx <= fx + fw && ly >= fy && ly <= fy + fh) {
          return { target: al.id, assetKey: null };
        }
        continue;
      }
      const mat = computeAddedLayerFrameMatrix(al.width, al.height, canvasW, canvasH, lt, docT);
      const inv = invertAffine(mat);
      if (!inv) continue;
      const lx = inv[0] * cx + inv[2] * cy + inv[4];
      const ly = inv[1] * cx + inv[3] * cy + inv[5];
      if (lx >= 0 && lx <= al.width && ly >= 0 && ly <= al.height) {
        return { target: al.id, assetKey: null };
      }
    }

    // 3. Check SVGA sprites from topmost visual layer down to backmost
    const spriteToGroupMap = new Map<number, MergedGroup>();
    mergedGroups.forEach((g) => {
      g.spriteIds.forEach((sid) => {
        const sIdx = Number(sid.replace('sprite_', ''));
        spriteToGroupMap.set(sIdx, g);
      });
    });

    const orderedSpriteIndices = movie.sp.map((_, i) => i).sort((a, b) => {
      const groupA = spriteToGroupMap.get(a);
      const groupB = spriteToGroupMap.get(b);
      const orderA = groupA ? mergedGroups.indexOf(groupA) : mergedGroups.length;
      const orderB = groupB ? mergedGroups.indexOf(groupB) : mergedGroups.length;
      if (orderA !== orderB) return orderB - orderA;
      return a - b;
    });

    for (let k = orderedSpriteIndices.length - 1; k >= 0; k--) {
      const idx = orderedSpriteIndices[k];
      if (deletedSpriteIndices.has(idx)) continue;
      const spriteId = `sprite_${idx}`;
      if (hiddenLayerIds.has(spriteId)) continue;
      const parentGroup = spriteToGroupMap.get(idx);
      if (parentGroup && hiddenLayerIds.has(parentGroup.id)) continue;

      const s = movie.sp[idx];
      const resolved = resolveSpriteFrameAt(s, currentFrame, totalFrames, spriteFrameRanges[idx]);
      const f = resolved.frameObj;
      if (!f || !resolved.visible || f.a <= 0.01) continue;
      const bm = s.key ? bitmaps[s.key] : undefined;
      const assetW = bm?.width || thumbs[s.key]?.w || f.w || canvasW;
      const assetH = bm?.height || thumbs[s.key]?.h || f.h || canvasH;
      const lt = getEffectiveTransform(spriteId, s.key, currentFrame);
      const groupT =
        parentGroup && !parentGroup.isUngrouped
          ? getEffectiveTransform(parentGroup.id, undefined, currentFrame)
          : DEFAULT_TRANSFORM;

      let mat = computeSpriteFrameMatrix(f, assetW, assetH, canvasW, canvasH, lt, DEFAULT_TRANSFORM);
      if (!isIdentityLayerTransform(groupT)) {
        const mGroup = buildPivotTransformMatrix(canvasW / 2, canvasH / 2, canvasW / 2, canvasH / 2, groupT);
        mat = multiplyAffine(mGroup, mat);
      }
      if (!isIdentityLayerTransform(docT)) {
        const mDoc = buildPivotTransformMatrix(canvasW / 2, canvasH / 2, canvasW / 2, canvasH / 2, docT);
        mat = multiplyAffine(mDoc, mat);
      }

      const inv = invertAffine(mat);
      if (!inv) continue;
      const lx = inv[0] * cx + inv[2] * cy + inv[4];
      const ly = inv[1] * cx + inv[3] * cy + inv[5];
      const fx = f.x || 0;
      const fy = f.y || 0;
      const fw = f.w || assetW;
      const fh = f.h || assetH;
      if (lx >= fx && lx <= fx + fw && ly >= fy && ly <= fy + fh) {
        if (parentGroup && !parentGroup.isUngrouped) {
          return { target: parentGroup.id, assetKey: null };
        }
        return { target: spriteId, assetKey: s.key || null };
      }
    }

    return { target: selectedTarget, assetKey: selectedAssetKey };
  };

  const clientToCanvasCoords = (
    e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * canvasW;
    const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * canvasH;
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  };

  const finishPenDraft = () => {
    if (penDraftPoints.length < 2) {
      setPenDraftPoints([]);
      return;
    }
    const xs = penDraftPoints.map((p) => p.x);
    const ys = penDraftPoints.map((p) => p.y);
    const minX = Math.min(...xs) - 6;
    const minY = Math.min(...ys) - 6;
    const maxX = Math.max(...xs) + 6;
    const maxY = Math.max(...ys) + 6;
    const w = Math.max(24, Math.round(maxX - minX));
    const h = Math.max(24, Math.round(maxY - minY));
    const cx = minX + w / 2;
    const cy = minY + h / 2;

    const id = `shape_${Date.now()}`;
    const newShape: ShapeObject = {
      id,
      assetKey: `vec_path_${shapes.length + 1}`,
      type: 'path',
      name: `Path ${shapes.length + 1}`,
      x: minX,
      y: minY,
      w,
      h,
      color: '#7c5cff',
      strokeColor: '#c4b5fd',
      strokeWidth: 2.5,
      points: penDraftPoints,
      transform: {
        x: Number((cx - canvasW / 2).toFixed(1)),
        y: Number((cy - canvasH / 2).toFixed(1)),
        sx: 100,
        sy: 100,
        rotation: 0,
        opacity: 100,
      },
      inFrame: 0,
      outFrame: totalFrames - 1,
    };
    setShapes((prev) => [...prev, newShape]);
    setPenDraftPoints([]);
    setSelectedTarget(id);
    setSelectedAssetKey(null);
    setActiveTool('Move');
    setLastAction(`Created vector path layer ${newShape.name}`);
  };

  const dragRef = useRef<{
    mode: 'moveLayer' | 'panStage' | 'cropBox' | 'scaleLayer' | 'dragShinePoint';
    handle?: 'tl' | 'tr' | 'br' | 'bl' | 'tm' | 'mr' | 'bm' | 'ml';
    shineKind?: 'mask' | 'motion';
    shineContourIdx?: number;
    shinePointIdx?: number;
    targetId: string;
    assetKey: string | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origSx?: number;
    origSy?: number;
    origZoom?: number;
    centerCanvasX?: number;
    centerCanvasY?: number;
    initialDist?: number;
    initialHandleX?: number;
    initialHandleY?: number;
    canvasStartX?: number;
    canvasStartY?: number;
  } | null>(null);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setContextMenu(null);
    if (e.button === 2) return; // Right-click is handled by onContextMenu

    if (activeTool === 'Zoom') {
      if (e.altKey) {
        setZoom((z) => Math.max(25, z - 25));
      } else {
        setZoom((z) => Math.min(300, z + 25));
      }
      return;
    }

    if (activeTool === 'Hand') {
      dragRef.current = {
        mode: 'panStage',
        targetId: selectedTarget,
        assetKey: selectedAssetKey,
        startX: e.clientX,
        startY: e.clientY,
        origX: pan.x,
        origY: pan.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // 0a. Check if clicking on an interactive Shine Mask Point or Motion Waypoint handle
    const activeShineLayer = addedLayers.find(
      (l) => l.id === selectedTarget && l.shineConfig?.enabled
    );
    if (activeShineLayer && activeShineLayer.shineConfig && shineHandlesRef.current.length > 0) {
      const cv = canvasRef.current;
      if (cv) {
        const rect = cv.getBoundingClientRect();
        const scaleX = rect.width / Math.max(1, canvasW);
        const scaleY = rect.height / Math.max(1, canvasH);
        let hitShineHandle: (typeof shineHandlesRef.current)[0] | null = null;
        // Prioritize whichever submode is active, or check all handles
        const prioritizedHandles = [...shineHandlesRef.current].sort((a, b) => {
          const aMatch =
            (shineEditSubmode === 'mask_points' && a.kind === 'mask') ||
            (shineEditSubmode === 'motion_points' && a.kind === 'motion')
              ? 0
              : 1;
          const bMatch =
            (shineEditSubmode === 'mask_points' && b.kind === 'mask') ||
            (shineEditSubmode === 'motion_points' && b.kind === 'motion')
              ? 0
              : 1;
          return aMatch - bMatch;
        });

        for (const sh of prioritizedHandles) {
          const screenX = rect.left + sh.x * scaleX;
          const screenY = rect.top + sh.y * scaleY;
          if (Math.hypot(e.clientX - screenX, e.clientY - screenY) <= 13) {
            hitShineHandle = sh;
            break;
          }
        }

        if (hitShineHandle) {
          // Alt+Click deletes the mask point or motion waypoint
          if (e.altKey) {
            if (hitShineHandle.kind === 'mask') {
              const nextContours = activeShineLayer.shineConfig.maskContours.map((c, cIdx) =>
                cIdx === hitShineHandle!.contourIdx
                  ? c.filter((_, pIdx) => pIdx !== hitShineHandle!.pointIdx)
                  : c
              );
              handleUpdateShineConfig(
                activeShineLayer.id,
                { maskContours: nextContours },
                { actionLabel: `تم حذف نقطة القناع #${hitShineHandle.pointIdx + 1}` }
              );
            } else if (
              hitShineHandle.kind === 'motion' &&
              activeShineLayer.shineConfig.motionPoints.length > 2
            ) {
              const nextMotion = activeShineLayer.shineConfig.motionPoints.filter(
                (_, pIdx) => pIdx !== hitShineHandle!.pointIdx
              );
              handleUpdateShineConfig(
                activeShineLayer.id,
                { motionPoints: nextMotion },
                {
                  regenerateKeyframes: true,
                  actionLabel: `تم حذف نقطة مسار اللمعة P${hitShineHandle.pointIdx + 1}`,
                }
              );
            }
            return;
          }

          dragRef.current = {
            mode: 'dragShinePoint',
            shineKind: hitShineHandle.kind,
            shineContourIdx: hitShineHandle.contourIdx,
            shinePointIdx: hitShineHandle.pointIdx,
            targetId: activeShineLayer.id,
            assetKey: null,
            startX: e.clientX,
            startY: e.clientY,
            origX: hitShineHandle.x,
            origY: hitShineHandle.y,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    // 0b. Handle hit-test: if clicking on a bounding box scale handle of the currently selected layer
    if ((activeTool === 'Move' || activeTool === 'Shine') && activeHandlesRef.current.length > 0) {
      const cv = canvasRef.current;
      if (cv) {
        const rect = cv.getBoundingClientRect();
        const scaleX = rect.width / Math.max(1, canvasW);
        const scaleY = rect.height / Math.max(1, canvasH);
        let hitHandle: (typeof activeHandlesRef.current)[0] | null = null;
        for (const h of activeHandlesRef.current) {
          const screenX = rect.left + h.x * scaleX;
          const screenY = rect.top + h.y * scaleY;
          if (Math.hypot(e.clientX - screenX, e.clientY - screenY) <= 12) {
            hitHandle = h;
            break;
          }
        }
        if (hitHandle) {
          const effectiveTargetId = isAllLayersGrouped ? 'GROUP_ALL' : selectedTarget;
          const effectiveAssetKey = isAllLayersGrouped ? null : selectedAssetKey;
          const curT = getEffectiveTransform(effectiveTargetId, effectiveAssetKey || undefined, currentFrame);
          const center = activeCenterRef.current || { x: canvasW / 2, y: canvasH / 2 };
          const initDist = Math.hypot(hitHandle.x - center.x, hitHandle.y - center.y);
          dragRef.current = {
            mode: 'scaleLayer',
            handle: hitHandle.handle,
            targetId: effectiveTargetId,
            assetKey: effectiveAssetKey,
            startX: e.clientX,
            startY: e.clientY,
            origX: curT.x,
            origY: curT.y,
            origSx: curT.sx,
            origSy: curT.sy,
            origZoom: curT.zoom ?? 100,
            centerCanvasX: center.x,
            centerCanvasY: center.y,
            initialDist: Math.max(4, initDist),
            initialHandleX: hitHandle.x,
            initialHandleY: hitHandle.y,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    const pt = clientToCanvasCoords(e);

    // Shine tool: add mask contour point or motion waypoint directly by clicking on Canvas (or create Shine layer if none active)
    if (
      activeTool === 'Shine' ||
      (activeShineLayer &&
        activeShineLayer.shineConfig &&
        activeShineLayer.shineConfig.maskMode === 'interactive_points' &&
        shineEditSubmode === 'mask_points')
    ) {
      if (!activeShineLayer || !activeShineLayer.shineConfig) {
        const hit = hitTestCanvasPoint(pt.x, pt.y);
        handleCreateShineLayer(hit.target);
        return;
      }

      if (shineEditSubmode === 'motion_points') {
        const curMotion = activeShineLayer.shineConfig.motionPoints || [];
        const nextMotion = [...curMotion, { x: pt.x, y: pt.y }];
        handleUpdateShineConfig(
          activeShineLayer.id,
          { motionPoints: nextMotion },
          {
            regenerateKeyframes: true,
            actionLabel: `📍 تم وضع نقطة مسار حركة اللمعة P${nextMotion.length} عند (${pt.x}, ${pt.y})`,
          }
        );
        return;
      }

      // Default in Shine tool / mask_points submode: append point to outer mask contour
      const curOuter = activeShineLayer.shineConfig.maskContours[0] || [];
      const nextOuter = [...curOuter, { x: pt.x, y: pt.y }];
      const nextContours = [
        nextOuter,
        ...activeShineLayer.shineConfig.maskContours.slice(1),
      ];
      handleUpdateShineConfig(
        activeShineLayer.id,
        {
          maskContours: nextContours,
          maskMode: 'interactive_points',
        },
        {
          actionLabel: `🎯 تم وضع نقطة قناع اللمعة #${nextOuter.length} عند (${pt.x}, ${pt.y})`,
        }
      );
      return;
    }

    // Crop tool (or Shift+drag in Move tool): drag a rectangular selection on the layer
    if (activeTool === 'Crop' || (activeTool === 'Move' && e.shiftKey)) {
      if (selectedTarget === 'DOCUMENT') {
        const hit = hitTestCanvasPoint(pt.x, pt.y);
        if (hit.target !== 'DOCUMENT') {
          setSelectedTarget(hit.target);
          setSelectedAssetKey(hit.assetKey);
        }
      }
      setCropRect({ x: pt.x, y: pt.y, w: 1, h: 1 });
      dragRef.current = {
        mode: 'cropBox',
        targetId: selectedTarget,
        assetKey: selectedAssetKey,
        startX: e.clientX,
        startY: e.clientY,
        origX: 0,
        origY: 0,
        canvasStartX: pt.x,
        canvasStartY: pt.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (activeTool === 'Pen') {
      setPenDraftPoints((prev) => [...prev, pt]);
      setLastAction(`Pen point (${pt.x}, ${pt.y}) — Press Enter or click Finish Path`);
      return;
    }

    if (activeTool === 'Shape') {
      handleAddShape('rectangle', pt.x - canvasW / 2, pt.y - canvasH / 2);
      setActiveTool('Move');
      return;
    }

    if (activeTool === 'Text') {
      setNewTextModalOpen(true);
      setActiveTool('Move');
      return;
    }

    if (activeTool === 'Frame') {
      setSelectedTarget('DOCUMENT');
      setSelectedAssetKey(null);
      return;
    }

    // Move tool: hit-test if clicking a visible layer
    let targetId = selectedTarget;
    let assetKey = selectedAssetKey;
    if (isAllLayersGrouped) {
      targetId = 'GROUP_ALL';
      assetKey = null;
      setSelectedTarget('GROUP_ALL');
      setSelectedAssetKey(null);
    } else {
      const hit = hitTestCanvasPoint(pt.x, pt.y);
      if (hit.target !== 'DOCUMENT') {
        targetId = hit.target;
        assetKey = hit.assetKey;
        setSelectedTarget(targetId);
        setSelectedAssetKey(assetKey);
      }
    }

    const curT = getEffectiveTransform(targetId, assetKey || undefined, currentFrame);
    dragRef.current = {
      mode: 'moveLayer',
      targetId,
      assetKey,
      startX: e.clientX,
      startY: e.clientY,
      origX: curT.x,
      origY: curT.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) {
      const cv = canvasRef.current;
      if (cv) {
        const rect = cv.getBoundingClientRect();
        const scaleX = rect.width / Math.max(1, canvasW);
        const scaleY = rect.height / Math.max(1, canvasH);
        if (shineHandlesRef.current.length > 0) {
          const hoveredShinePt = shineHandlesRef.current.find((sh) => {
            const screenX = rect.left + sh.x * scaleX;
            const screenY = rect.top + sh.y * scaleY;
            return Math.hypot(e.clientX - screenX, e.clientY - screenY) <= 13;
          });
          if (hoveredShinePt) {
            e.currentTarget.style.cursor = 'pointer';
            return;
          }
        }
        if ((activeTool === 'Move' || activeTool === 'Shine') && activeHandlesRef.current.length > 0) {
          const hoveredHandle = activeHandlesRef.current.find((h) => {
            const screenX = rect.left + h.x * scaleX;
            const screenY = rect.top + h.y * scaleY;
            return Math.hypot(e.clientX - screenX, e.clientY - screenY) <= 12;
          });
          if (hoveredHandle) {
            e.currentTarget.style.cursor = hoveredHandle.cursor;
            return;
          }
        }
        e.currentTarget.style.cursor = activeTool === 'Shine' ? 'crosshair' : 'default';
      }
      return;
    }

    if (dragRef.current.mode === 'dragShinePoint') {
      const pt = clientToCanvasCoords(e);
      const shineLayerId = dragRef.current.targetId;
      const shineKind = dragRef.current.shineKind;
      const cIdx = dragRef.current.shineContourIdx ?? 0;
      const pIdx = dragRef.current.shinePointIdx ?? 0;
      const targetLayer = addedLayers.find((l) => l.id === shineLayerId);
      if (!targetLayer || !targetLayer.shineConfig) return;

      if (shineKind === 'mask') {
        const nextContours = targetLayer.shineConfig.maskContours.map((contour, idx) =>
          idx === cIdx
            ? contour.map((oldPt, i) => (i === pIdx ? { x: pt.x, y: pt.y } : oldPt))
            : contour
        );
        handleUpdateShineConfig(shineLayerId, {
          maskContours: nextContours,
          maskMode: 'interactive_points',
        });
      } else if (shineKind === 'motion') {
        const nextMotion = targetLayer.shineConfig.motionPoints.map((oldPt, i) =>
          i === pIdx ? { x: pt.x, y: pt.y } : oldPt
        );
        handleUpdateShineConfig(
          shineLayerId,
          { motionPoints: nextMotion },
          { regenerateKeyframes: true }
        );
      }
      return;
    }

    if (dragRef.current.mode === 'panStage') {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPan({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
      return;
    }

    if (dragRef.current.mode === 'cropBox') {
      const pt = clientToCanvasCoords(e);
      const sx = dragRef.current.canvasStartX ?? pt.x;
      const sy = dragRef.current.canvasStartY ?? pt.y;
      const x = Math.max(0, Math.min(sx, pt.x));
      const y = Math.max(0, Math.min(sy, pt.y));
      const w = Math.min(canvasW - x, Math.abs(pt.x - sx));
      const h = Math.min(canvasH - y, Math.abs(pt.y - sy));
      setCropRect({ x, y, w, h });
      return;
    }

    if (dragRef.current.mode === 'scaleLayer') {
      const pt = clientToCanvasCoords(e);
      const {
        centerCanvasX = canvasW / 2,
        centerCanvasY = canvasH / 2,
        initialDist = 50,
        origSx = 100,
        origSy = 100,
        origZoom = 100,
        handle = 'br',
        initialHandleX = centerCanvasX + 50,
        initialHandleY = centerCanvasY + 50,
      } = dragRef.current;

      let newSx = origSx;
      let newSy = origSy;

      const signX = origSx < 0 ? -1 : 1;
      const signY = origSy < 0 ? -1 : 1;
      const absOrigSx = Math.max(1, Math.abs(origSx));
      const absOrigSy = Math.max(1, Math.abs(origSy));

      if (handle === 'tl' || handle === 'tr' || handle === 'br' || handle === 'bl') {
        const curDist = Math.hypot(pt.x - centerCanvasX, pt.y - centerCanvasY);
        const factor = curDist / Math.max(2, initialDist);
        const kfKey = dragRef.current.targetId === 'GROUP_ALL' ? 'DOCUMENT' : dragRef.current.targetId;
        const hasZoomKf = Boolean(
          layerKeyframes[kfKey]?.zoom && Object.keys(layerKeyframes[kfKey].zoom!).length > 0
        );
        if (hasZoomKf) {
          const newZoom = Math.max(2, Math.min(1000, Number((origZoom * factor).toFixed(1))));
          updateLayerTransformById(
            dragRef.current.targetId,
            dragRef.current.assetKey,
            { zoom: newZoom },
            `تكبير/تصغير بدون مط (${newZoom}%)`
          );
          return;
        }
        newSx = signX * Math.max(2, Math.min(1000, Number((absOrigSx * factor).toFixed(1))));
        newSy = signY * Math.max(2, Math.min(1000, Number((absOrigSy * factor).toFixed(1))));
      } else if (handle === 'mr' || handle === 'ml') {
        const curDistX = Math.abs(pt.x - centerCanvasX);
        const initDistX = Math.abs(initialHandleX - centerCanvasX);
        const factorX = curDistX / Math.max(2, initDistX);
        newSx = signX * Math.max(2, Math.min(1000, Number((absOrigSx * factorX).toFixed(1))));
      } else if (handle === 'tm' || handle === 'bm') {
        const curDistY = Math.abs(pt.y - centerCanvasY);
        const initDistY = Math.abs(initialHandleY - centerCanvasY);
        const factorY = curDistY / Math.max(2, initDistY);
        newSy = signY * Math.max(2, Math.min(1000, Number((absOrigSy * factorY).toFixed(1))));
      }

      updateLayerTransformById(
        dragRef.current.targetId,
        dragRef.current.assetKey,
        { sx: newSx, sy: newSy },
        `Scaled ${dragRef.current.assetKey || dragRef.current.targetId}`
      );
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = canvasW / Math.max(1, rect.width);
    const scaleY = canvasH / Math.max(1, rect.height);
    const dx = Number(((e.clientX - dragRef.current.startX) * scaleX).toFixed(2));
    const dy = Number(((e.clientY - dragRef.current.startY) * scaleY).toFixed(2));
    updateLayerTransformById(dragRef.current.targetId, dragRef.current.assetKey, {
      x: Number((dragRef.current.origX + dx).toFixed(2)),
      y: Number((dragRef.current.origY + dy).toFixed(2)),
    });
  };

  const handleCanvasPointerUp = () => {
    if (dragRef.current) {
      const mode = dragRef.current.mode;
      const movedTarget = dragRef.current.targetId;
      const shineKind = dragRef.current.shineKind;
      const shinePtIdx = dragRef.current.shinePointIdx ?? 0;
      dragRef.current = null;
      if (mode === 'cropBox') {
        setLastAction('تم تحديد المنطقة بالماوس — اختر قص أو فصل أو مسح من الشريط العلوي');
      } else if (mode === 'scaleLayer') {
        setLastAction(`تم تعديل مقاس الطبقة (${movedTarget}) بنجاح`);
      } else if (mode === 'dragShinePoint') {
        setLastAction(
          shineKind === 'mask'
            ? `🎯 تم تحريك نقطة قناع اللمعة #${shinePtIdx + 1}`
            : `📍 تم تحريك نقطة مسار اللمعة P${shinePtIdx + 1} وتحديث الحركة`
        );
      } else {
        setLastAction(`Moved ${selectedAssetKey || movedTarget}`);
      }
    }
  };

  const scrubFromClientX = (clientX: number) => {
    const el = rulerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const frame = Math.min(totalFrames - 1, Math.max(0, Math.round(ratio * (totalFrames - 1))));
    setCurrentFrame(frame);
  };

  const handleOpenSvgaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const buf = await f.arrayBuffer();
    await loadSvgaBuffer(buf, f.name, f.size);
  };

  const handleAddImageLayer = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const bm = await createImageBitmap(f);
        const c = document.createElement('canvas');
        c.width = bm.width;
        c.height = bm.height;
        c.getContext('2d')?.drawImage(bm, 0, 0);
        const pngBlob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
        if (!pngBlob) continue;
        const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

        const seqNum = addedLayers.length + i + 1;
        const id = `layer_${Date.now()}_${seqNum}`;
        const rawBase = f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const assetKey = rawBase ? `${rawBase}_${seqNum}` : `img_added_${seqNum}`;
        const name = f.name.replace(/\.[^.]+$/, '') || assetKey;

        const newLayer: AddedLayer = {
          id,
          assetKey,
          name,
          bitmap: bm,
          originalBitmap: bm,
          originalWidth: bm.width,
          originalHeight: bm.height,
          pngBytes,
          dataUrl: c.toDataURL('image/png'),
          width: bm.width,
          height: bm.height,
          bytes: pngBytes.byteLength,
          transform: { ...DEFAULT_TRANSFORM },
          inFrame: 0,
          outFrame: totalFrames - 1,
        };
        setAddedLayers((prev) => [...prev, newLayer]);
        setSelectedTarget(id);
        setSelectedAssetKey(null);
        setLastAction(`Added decomposed image layer "${name}" (${bm.width}×${bm.height})`);
      } catch {
        setLastAction(`Could not decode image ${f.name}`);
      }
    }
  };

  const handleMergeSvga = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setLastAction(`Merging ${f.name}...`);
    try {
      const raw = new Uint8Array(await f.arrayBuffer());
      const inf = await decompressDeflate(raw);
      const other = parseMovie(inf);
      const nextIm = { ...movie.im };
      const nextBm = { ...bitmaps };
      const nextTh = { ...thumbs };

      const keyMap: Record<string, string> = {};
      for (const k of Object.keys(other.im)) {
        let mergedKey = k;
        let suffix = 1;
        while (nextIm[mergedKey]) {
          mergedKey = `${k}_m${suffix++}`;
        }
        keyMap[k] = mergedKey;
        const d = other.im[k];
        nextIm[mergedKey] = d;
        try {
          const blob = new Blob([d as any], { type: 'image/png' });
          const bm = await createImageBitmap(blob);
          nextBm[mergedKey] = bm;
          const c = document.createElement('canvas');
          c.width = bm.width;
          c.height = bm.height;
          c.getContext('2d')?.drawImage(bm, 0, 0);
          nextTh[mergedKey] = { url: c.toDataURL('image/png'), w: bm.width, h: bm.height };
        } catch {}
      }

      const startIdx = movie.sp.length;
      const targetFrames = Math.max(movie.n || 1, other.n || 1);
      const mergedSprites = [
        ...movie.sp,
        ...other.sp.map((s) => ({
          ...s,
          key: keyMap[s.key] || s.key,
        })),
      ];

      let updatedMergedGroups = [...mergedGroups];
      let nextDocTransform = docTransform;

      // Ensure existing File 1 layers have their own separate independent group
      // and migrate any GROUP_ALL / docTransform into File 1's group so File 1 and File 2 move independently
      const hasFile1Group = updatedMergedGroups.some((g) => g.spriteIds.includes('sprite_0'));
      if (!hasFile1Group && startIdx > 0) {
        const file1GroupId = `merged_group_main_${Date.now()}`;
        const file1SpriteIds = Array.from({ length: startIdx }, (_, i) => `sprite_${i}`);
        updatedMergedGroups.push({
          id: file1GroupId,
          name: `📁 الملف الأساسي (#1): ${docName || 'الملف الأول'}`,
          spriteIds: file1SpriteIds,
          transform: { ...docTransform },
          isUngrouped: false,
        });
        nextDocTransform = { ...DEFAULT_TRANSFORM };
        setDocTransform(nextDocTransform);
      } else if (isAllLayersGrouped && !isIdentityLayerTransform(docTransform) && updatedMergedGroups.length === 1) {
        updatedMergedGroups = updatedMergedGroups.map((g, idx) =>
          idx === 0
            ? {
                ...g,
                transform: {
                  ...g.transform,
                  x: Number((g.transform.x + docTransform.x).toFixed(2)),
                  y: Number((g.transform.y + docTransform.y).toFixed(2)),
                  sx: Number(((g.transform.sx * docTransform.sx) / 100).toFixed(2)),
                  sy: Number(((g.transform.sy * docTransform.sy) / 100).toFixed(2)),
                  rotation: Number((g.transform.rotation + docTransform.rotation).toFixed(2)),
                },
              }
            : g
        );
        nextDocTransform = { ...DEFAULT_TRANSFORM };
        setDocTransform(nextDocTransform);
      }

      // Always disable global GROUP_ALL lock when multiple independent SVGA groups exist
      if (isAllLayersGrouped) {
        setIsAllLayersGrouped(false);
      }

      // Create independent group for File 2 and place it at top of list (in front on canvas)
      const newGroupId = `merged_group_${Date.now() + 1}`;
      const newSpriteIds: string[] = [];
      for (let i = 0; i < other.sp.length; i++) {
        newSpriteIds.push(`sprite_${startIdx + i}`);
      }
      const newGroup: MergedGroup = {
        id: newGroupId,
        name: `📁 ملف SVGA المدمج (#${updatedMergedGroups.length + 1}): ${f.name}`,
        spriteIds: newSpriteIds,
        transform: { ...DEFAULT_TRANSFORM },
        isUngrouped: false,
      };

      updatedMergedGroups = [newGroup, ...updatedMergedGroups];

      setBitmaps(nextBm);
      setThumbs(nextTh);
      setMovie({
        ...movie,
        w: movie.sp.length === 0 && other.w ? other.w : movie.w,
        h: movie.sp.length === 0 && other.h ? other.h : movie.h,
        fps: movie.sp.length === 0 && other.fps ? other.fps : movie.fps,
        n: targetFrames,
        im: nextIm,
        sp: mergedSprites,
      });

      setMergedGroups(updatedMergedGroups);
      pushHistory(nextDocTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
        mergedGroups: updatedMergedGroups,
      });

      setSelectedTarget(newGroupId);
      setSelectedAssetKey(null);

      setLastAction(
        `دمج ملف SVGA (${f.name}) كطبقة مستقلة منفصلة (+${other.sp.length} طبقة) — يمكنك تحريكها بمفردها`
      );
    } catch (err: any) {
      setLastAction(`Merge failed: ${err?.message || 'Invalid SVGA'}`);
    }
  };

  const handleReplaceImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || !selectedAssetKey) return;
    try {
      const bm = await createImageBitmap(f);
      const origThumb = thumbs[selectedAssetKey];
      const targetW = origThumb?.w || bm.width;
      const targetH = origThumb?.h || bm.height;

      const c = document.createElement('canvas');
      c.width = targetW;
      c.height = targetH;
      c.getContext('2d')?.drawImage(bm, 0, 0, targetW, targetH);
      const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
      if (!blob) return;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const resizedBm = await createImageBitmap(blob);
      const dataUrl = c.toDataURL('image/png');

      // Check if applyScope is 'current' and multiple sprites share this asset
      const spriteIdx = selectedTarget.startsWith('sprite_')
        ? Number(selectedTarget.replace('sprite_', ''))
        : -1;
      const usageCount =
        assetStats.assets.find((a) => a.key === selectedAssetKey)?.usageCount || 1;

      if (applyScope === 'current' && spriteIdx >= 0 && usageCount > 1) {
        const newKey = `${selectedAssetKey}_L${movie.sp.length - spriteIdx}`;
        setBitmaps((prev) => ({ ...prev, [newKey]: resizedBm }));
        setThumbs((prev) => ({ ...prev, [newKey]: { url: dataUrl, w: targetW, h: targetH } }));
        setMovie((prev) => ({
          ...prev,
          im: { ...prev.im, [newKey]: bytes },
          sp: prev.sp.map((s, idx) => (idx === spriteIdx ? { ...s, key: newKey } : s)),
        }));
        setSelectedAssetKey(newKey);
        setLastAction(`Replaced image on layer #${movie.sp.length - spriteIdx} (${newKey})`);
      } else {
        setBitmaps((prev) => ({ ...prev, [selectedAssetKey]: resizedBm }));
        setThumbs((prev) => ({
          ...prev,
          [selectedAssetKey]: { url: dataUrl, w: targetW, h: targetH },
        }));
        setMovie((prev) => ({
          ...prev,
          im: { ...prev.im, [selectedAssetKey]: bytes },
        }));
        setLastAction(`Replaced asset ${selectedAssetKey} (${targetW}×${targetH})`);
      }
    } catch {
      setLastAction('Could not replace image');
    }
  };

  const handleApplyInlineImageEdit = async () => {
    if (!editModalKey) return;
    const origThumb = thumbs[editModalKey];
    const W = origThumb?.w || canvasW;
    const H = origThumb?.h || canvasH;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    if (editShowImage && bitmaps[editModalKey]) {
      ctx.drawImage(bitmaps[editModalKey], 0, 0, W, H);
    }
    if (editText.trim()) {
      ctx.font = `bold ${editFontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = editColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(editText.trim(), W / 2, H / 2);
    }
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (!blob) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const newBm = await createImageBitmap(blob);

    setBitmaps((prev) => ({ ...prev, [editModalKey]: newBm }));
    setThumbs((prev) => ({
      ...prev,
      [editModalKey]: { url: c.toDataURL('image/png'), w: W, h: H },
    }));
    setMovie((prev) => ({ ...prev, im: { ...prev.im, [editModalKey]: bytes } }));
    setLastAction(`Edited image asset ${editModalKey}`);
    setEditModalKey(null);
  };

  const handleAddShape = (
    type: 'rectangle' | 'ellipse' | 'polygon',
    offsetX = 0,
    offsetY = 0
  ) => {
    const seq = shapes.length + 1;
    const id = `shape_${Date.now()}_${seq}`;
    const colors = ['#7c5cff', '#f59e0b', '#10b981', '#ec4899'];
    const color = colors[(seq - 1) % colors.length];
    const w = Math.max(40, Math.round(canvasW * 0.35));
    const h = Math.max(40, Math.round(canvasH * 0.35));
    const newShape: ShapeObject = {
      id,
      assetKey: `shape_${type}_${seq}`,
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${seq}`,
      x: 0,
      y: 0,
      w,
      h,
      color,
      strokeColor: color,
      strokeWidth: 2,
      transform: {
        x: Number(offsetX.toFixed(1)),
        y: Number(offsetY.toFixed(1)),
        sx: 100,
        sy: 100,
        rotation: 0,
        opacity: 100,
      },
      inFrame: 0,
      outFrame: totalFrames - 1,
    };
    setShapes((prev) => [...prev, newShape]);
    setSelectedTarget(id);
    setSelectedAssetKey(null);
    setLastAction(`Added decomposed ${newShape.name} layer`);
  };

  const handleCreateTextLayer = () => {
    const txt = newTextValue.trim() || 'Text';
    const seq = shapes.length + 1;
    const id = `shape_text_${Date.now()}_${seq}`;
    const fSize = Math.max(12, newTextSize || 36);
    const estW = Math.max(120, Math.round(txt.length * fSize * 0.68 + 32));
    const estH = Math.max(48, Math.round(fSize * 1.6));

    const newTextShape: ShapeObject = {
      id,
      assetKey: `text_layer_${seq}`,
      type: 'text',
      name: `Text: ${txt.slice(0, 14)}`,
      text: txt,
      fontSize: fSize,
      x: 0,
      y: 0,
      w: estW,
      h: estH,
      color: newTextColor,
      strokeColor: newTextStroke,
      strokeWidth: 2,
      transform: { ...DEFAULT_TRANSFORM },
      inFrame: 0,
      outFrame: totalFrames - 1,
    };
    setShapes((prev) => [...prev, newTextShape]);
    setSelectedTarget(id);
    setSelectedAssetKey(null);
    setNewTextModalOpen(false);
    setLastAction(`Added decomposed text layer "${txt}"`);
  };

  /**
   * Toggles virtual grouping of all layers ("مجموعة كل الطبقات") without baking or rasterizing.
   * Keeps all original decomposed tracks, vectors, shapes, and audio 100% intact.
   * When grouped, allows dragging, repositioning, and scaling the entire design simultaneously.
   */
  const handleToggleGroupAllLayers = () => {
    const totalCount = movie.sp.length + addedLayers.length + shapes.length;
    if (totalCount === 0) {
      setLastAction('لا توجد طبقات لتجميعها');
      return;
    }

    // If there are multiple merged groups, toggle group/ungroup on the selected group or all groups
    if (mergedGroups.length > 0) {
      setIsAllLayersGrouped(false);
      const anyGrouped = mergedGroups.some((g) => !g.isUngrouped);
      const nextGroups = mergedGroups.map((g) => ({ ...g, isUngrouped: anyGrouped }));
      setMergedGroups(nextGroups);
      if (!anyGrouped && nextGroups[0]) {
        setSelectedTarget(nextGroups[0].id);
        setSelectedAssetKey(null);
        setLastAction('تم تجميع كل ملف SVGA في طبقة مستقلة منفصلة — يمكنك تحريك كل ملف وترتيبه للأعلى أو للأسفل');
      } else {
        setSelectedTarget('DOCUMENT');
        setSelectedAssetKey(null);
        setLastAction('تم فك تجميع الملفات — يمكنك الآن التحكم في كل طبقة فرعية على حدة');
      }
      return;
    }

    // Single file loaded: create a dedicated MergedGroup for File 1 so it has MoveUp/MoveDown arrows and stays separate when File 2 is merged
    if (movie.sp.length > 0) {
      const file1GroupId = `merged_group_main_${Date.now()}`;
      const file1SpriteIds = Array.from({ length: movie.sp.length }, (_, i) => `sprite_${i}`);
      const nextGroup: MergedGroup = {
        id: file1GroupId,
        name: `📁 الملف الأساسي (#1): ${docName || 'الملف الأول'}`,
        spriteIds: file1SpriteIds,
        transform: { ...docTransform },
        isUngrouped: false,
      };
      setDocTransform({ ...DEFAULT_TRANSFORM });
      setIsAllLayersGrouped(false);
      setMergedGroups([nextGroup]);
      setSelectedTarget(file1GroupId);
      setSelectedAssetKey(null);
      setLastAction(
        `تم تجميع الملف (${movie.sp.length} طبقة) في لير مستقل — يمكنك تحريكه لوحده أو رفع ملف ثانٍ وتحريك كل ملف منفصلاً`
      );
      return;
    }

    if (isAllLayersGrouped) {
      setIsAllLayersGrouped(false);
      setSelectedTarget('DOCUMENT');
      setSelectedAssetKey(null);
      setLastAction('تم فك تجميع الطبقات — يمكنك الآن التحكم في كل طبقة على حدة');
    } else {
      setIsAllLayersGrouped(true);
      setSelectedTarget('GROUP_ALL');
      setSelectedAssetKey(null);
      setLastAction(
        `تم تجميع جميع الطبقات (${totalCount} طبقة) في لير موحد — يمكنك تحريكها وتكبيرها معاً`
      );
    }
  };

  /**
   * Builds a true Decomposed SVGA 2.0 binary Blob (never flattening/baking frames).
   * Preserves all individual assets in `movie.im`, all individual `SpriteEntity` tracks in `movie.sp`
   * with their updated 2D affine transforms, and exports all added image/shape/text layers as
   * independent decomposed SVGA assets and SpriteEntity tracks.
   */
  const buildEditedSvgaBlob = async (): Promise<Blob> => {
    const extraLayers: DecomposedExtraLayer[] = [];

    // Helper to resolve target layer world matrix at any frame for Shine layers
    const resolveTargetMatrixAtFrame = (
      targetLayerId: string,
      frameIdx: number
    ): [number, number, number, number, number, number] | null => {
      if (!targetLayerId || targetLayerId === 'DOCUMENT') {
        const dt = getEffectiveTransform('DOCUMENT', undefined, frameIdx);
        return buildPivotTransformMatrix(canvasW / 2, canvasH / 2, canvasW / 2, canvasH / 2, dt);
      }
      if (targetLayerId.startsWith('sprite_')) {
        const sIdx = Number(targetLayerId.replace('sprite_', ''));
        const sp = movie.sp[sIdx];
        if (!sp) return null;
        const resolved = resolveSpriteFrameAt(sp, frameIdx, totalFrames, spriteFrameRanges[sIdx]);
        const f = resolved.frameObj || sp.fr.find((fr) => fr && fr.a > 0.001) || sp.fr[0];
        if (!f) return null;
        const bm = sp.key ? bitmaps[sp.key] : undefined;
        const assetW = bm?.width || thumbs[sp.key]?.w || f.w || canvasW;
        const assetH = bm?.height || thumbs[sp.key]?.h || f.h || canvasH;
        const lt = getEffectiveTransform(targetLayerId, sp.key, frameIdx);
        const dt = getEffectiveTransform('DOCUMENT', undefined, frameIdx);
        return computeSpriteFrameMatrix(f, assetW, assetH, canvasW, canvasH, lt, dt);
      }
      const targetAl = addedLayers.find((x) => x.id === targetLayerId);
      if (targetAl) {
        const lt = getEffectiveTransform(targetAl.id, targetAl.assetKey, frameIdx);
        const dt = getEffectiveTransform('DOCUMENT', undefined, frameIdx);
        return computeAddedLayerFrameMatrix(
          targetAl.width,
          targetAl.height,
          canvasW,
          canvasH,
          lt,
          dt
        );
      }
      const targetSh = shapes.find((x) => x.id === targetLayerId);
      if (targetSh) {
        const lt = getEffectiveTransform(targetSh.id, targetSh.assetKey, frameIdx);
        const dt = getEffectiveTransform('DOCUMENT', undefined, frameIdx);
        return computeAddedLayerFrameMatrix(targetSh.w, targetSh.h, canvasW, canvasH, lt, dt);
      }
      return null;
    };

    for (const al of addedLayers) {
      if (hiddenLayerIds.has(al.id)) continue;
      const kfForAl = layerKeyframes[al.id];
      const isShineLayer = Boolean(al.shineConfig?.enabled);
      const hasScaleKeyframes = Boolean(
        (kfForAl?.scale && Object.keys(kfForAl.scale).length > 0) ||
          (kfForAl?.zoom && Object.keys(kfForAl.zoom).length > 0)
      );
      const zoomFactor = (al.transform.zoom ?? 100) / 100;
      const absSx = Math.abs(al.transform.sx) * zoomFactor;
      const absSy = Math.abs(al.transform.sy) * zoomFactor;
      const needsDimensionBake =
        !isShineLayer &&
        !hasScaleKeyframes &&
        (Math.abs(absSx - 100) > 0.25 || Math.abs(absSy - 100) > 0.25);

      let exportPngBytes = al.pngBytes;
      let exportW = al.width;
      let exportH = al.height;
      let exportTransform: LayerTransform = { ...al.transform };
      let exportCopiedFrames = al.copiedFrames;
      const sourceBm = al.originalBitmap || al.bitmap;

      if (isShineLayer && al.shineConfig) {
        const refFrame = al.shineConfig.referenceFrame ?? 0;
        const refTargetMat =
          al.shineConfig.followTargetLayerTransform &&
          al.shineConfig.targetLayerId &&
          al.shineConfig.targetLayerId !== 'DOCUMENT'
            ? resolveTargetMatrixAtFrame(al.shineConfig.targetLayerId, refFrame) || undefined
            : undefined;
        exportCopiedFrames = buildClippedShineSvgaFrames({
          totalFrames,
          shineWidth: exportW,
          shineHeight: exportH,
          canvasW,
          canvasH,
          inFrame: al.inFrame,
          outFrame: al.outFrame,
          baseTransform: exportTransform,
          keyframes: kfForAl,
          copiedFrames: al.copiedFrames,
          docTransformAtFrame: (fIdx) =>
            interpolateLayerTransform(docTransform, layerKeyframes['DOCUMENT'], fIdx),
          config: {
            ...al.shineConfig,
            referenceTargetMatrix: refTargetMat,
          },
          targetMatrixAtFrame:
            al.shineConfig.followTargetLayerTransform &&
            al.shineConfig.targetLayerId &&
            al.shineConfig.targetLayerId !== 'DOCUMENT'
              ? (fIdx) => resolveTargetMatrixAtFrame(al.shineConfig!.targetLayerId, fIdx)
              : undefined,
        });
      }

      if (needsDimensionBake && sourceBm) {
        const bakedW = Math.max(2, Math.round((al.width * absSx) / 100));
        const bakedH = Math.max(2, Math.round((al.height * absSy) / 100));
        const c = document.createElement('canvas');
        c.width = bakedW;
        c.height = bakedH;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(sourceBm, 0, 0, bakedW, bakedH);
          const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
          if (blob) {
            const rawBaked = new Uint8Array(await blob.arrayBuffer());
            exportPngBytes = compressPngBufferLikeReference(rawBaked, 100, 'png8_only').bytes;
            exportW = bakedW;
            exportH = bakedH;
            exportTransform = {
              ...al.transform,
              sx: al.transform.sx < 0 ? -100 : 100,
              sy: al.transform.sy < 0 ? -100 : 100,
              zoom: 100,
            };
            if (al.copiedFrames && al.copiedFrames.length > 0) {
              exportCopiedFrames = retargetCopiedFramesDimensions(al.copiedFrames, bakedW, bakedH);
            }
          }
        }
      } else if (exportPngBytes && exportPngBytes.byteLength > 0) {
        exportPngBytes = compressPngBufferLikeReference(exportPngBytes, 100, 'png8_only').bytes;
      }

      extraLayers.push({
        id: al.id,
        assetKey: al.assetKey,
        name: al.name,
        pngBytes: exportPngBytes,
        width: exportW,
        height: exportH,
        transform: exportTransform,
        inFrame: al.inFrame,
        outFrame: al.outFrame,
        copiedFrames: exportCopiedFrames,
        copiedFromKey: al.copiedFromKey,
      });
    }

    for (const sh of shapes) {
      if (hiddenLayerIds.has(sh.id)) continue;
      const rawShapePng = await renderShapeObjectToPngBytes(sh);
      const pngBytes =
        rawShapePng.byteLength > 0
          ? compressPngBufferLikeReference(rawShapePng, 100, 'png8_only').bytes
          : rawShapePng;
      if (pngBytes.byteLength > 0) {
        extraLayers.push({
          id: sh.id,
          assetKey: sh.assetKey,
          name: sh.name,
          pngBytes,
          width: sh.w,
          height: sh.h,
          transform: sh.transform,
          inFrame: sh.inFrame,
          outFrame: sh.outFrame,
        });
      }
    }

    const assetDimensions: Record<string, { w: number; h: number }> = {};
    for (const [k, th] of Object.entries(thumbs)) {
      assetDimensions[k] = { w: th.w, h: th.h };
    }

    const normalizedSpriteRanges: Record<string, SpriteFrameRange> = {};
    for (const [k, v] of Object.entries(spriteFrameRanges)) {
      normalizedSpriteRanges[k] = v;
      normalizedSpriteRanges[`sprite_${k}`] = v;
    }

    const rawProto = serializeDecomposedSvga(movie, {
      docTransform,
      spriteTransforms: layerTransforms,
      layerKeyframes,
      spriteFrameRanges: normalizedSpriteRanges,
      hiddenLayerIds,
      deletedSpriteIndices,
      assetDimensions,
      extraLayers,
      mergedGroups,
      layerOrder: effectiveLayerOrder,
    });

    const deflated = await compressDeflate(rawProto);
    return new Blob([deflated as any], { type: 'application/octet-stream' });
  };

  useEffect(() => {
    (window as any).__buildEditedSvgaFile = async (name = 'edited_gift.svga') => {
      const blob = await buildEditedSvgaBlob();
      return new File([blob], name, { type: 'application/octet-stream' });
    };
  });

  const handleExportSvga = async () => {
    if (typeof (window as any).__checkConversionAccess === 'function') {
      const allowed = (window as any).__checkConversionAccess('svga_editor', docName);
      if (!allowed) return;
    }
    setLastAction('Encoding decomposed SVGA 2.0 layers...');
    try {
      const blob = await buildEditedSvgaBlob();
      const outName = docName.endsWith('.svga') ? docName : `${docName}.svga`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const totalExportedLayers =
        spriteLayers.filter((l) => !hiddenLayerIds.has(l.id)).length +
        addedLayers.filter((l) => !hiddenLayerIds.has(l.id)).length +
        shapes.filter((s) => !hiddenLayerIds.has(s.id)).length;
      setLastAction(
        `Exported ${outName} (${totalExportedLayers} decomposed layers · ${(blob.size / 1024).toFixed(1)} KB)`
      );
    } catch (e: any) {
      setLastAction(`Export failed: ${e?.message || 'Error'}`);
    }
  };

  const handleSyncToMotionTools = async () => {
    setLastAction('Syncing decomposed SVGA to Motion Processing...');
    try {
      const blob = await buildEditedSvgaBlob();
      const outName = docName.endsWith('.svga') ? docName : `${docName}.svga`;
      const file = new File([blob], outName, { type: 'application/octet-stream' });
      setLastAction(`Synced ${outName} to Motion Processing`);
      if (onSyncToMotionTools) {
        onSyncToMotionTools(file);
      } else if ((window as any).MotionTools?.load) {
        (window as any).MotionTools.load(file);
      }
    } catch (e: any) {
      setLastAction(`Sync failed: ${e?.message || 'Error'}`);
    }
  };

  const handleDownloadAeScript = () => {
    if (typeof (window as any).__checkConversionAccess === 'function') {
      const allowed = (window as any).__checkConversionAccess('svga_editor', docName);
      if (!allowed) return;
    }
    const layersForAe = [
      ...addedLayers.map((l) => ({ name: l.name, ...l.transform })),
      ...shapes.map((s) => ({ name: s.name, ...s.transform })),
      ...spriteLayers.map((sl) => ({
        name: `#${sl.displayNum}_${sl.key}`,
        ...getEffectiveTransform(sl.id, sl.key, currentFrame),
      })),
    ];
    if (layersForAe.length === 0) {
      layersForAe.push({ name: docName, ...docTransform });
    }
    const jsx = generateAfterEffectsJsxScript(
      docName,
      canvasW,
      canvasH,
      fps,
      totalFrames,
      layersForAe
    );
    const blob = new Blob([jsx], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MotionTools_SVGA_AE_Plugin.jsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setLastAction(`Downloaded MotionTools_SVGA_AE_Plugin.jsx (${layersForAe.length} layers)`);
  };

  const toggleTimelineLayerExpand = (layerId: string) => {
    setExpandedTimelineLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  };

  const selectedAssetStat = useMemo(
    () => assetStats.assets.find((a) => a.key === selectedAssetKey) || null,
    [assetStats.assets, selectedAssetKey]
  );

  const selectedAddedLayer = useMemo(
    () => addedLayers.find((l) => l.id === selectedTarget) || null,
    [addedLayers, selectedTarget]
  );

  const selectedShapeLayer = useMemo(
    () => shapes.find((s) => s.id === selectedTarget) || null,
    [shapes, selectedTarget]
  );

  const isEmptyStage =
    spriteLayers.length === 0 && addedLayers.length === 0 && shapes.length === 0;

  return (
    <div
      className="svga-ae-root"
      onClick={() => {
        if (contextMenu) setContextMenu(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          targetId: selectedTarget,
          assetKey: selectedAssetKey,
        });
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (!f) return;
        if (f.name.toLowerCase().endsWith('.svga')) {
          f.arrayBuffer().then((buf) => loadSvgaBuffer(buf, f.name, f.size));
        }
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#09090d',
        color: '#e8e8ee',
        fontFamily: 'Cairo, Inter, "Segoe UI", system-ui, -apple-system, sans-serif',
        fontSize: '12px',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Hidden file inputs */}
      <input
        ref={openSvgaInputRef}
        type="file"
        accept=".svga"
        hidden
        onChange={handleOpenSvgaFile}
      />
      <input
        ref={addLayerInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleAddImageLayer}
      />
      <input
        ref={mergeSvgaInputRef}
        type="file"
        accept=".svga"
        hidden
        onChange={handleMergeSvga}
      />
      <input
        ref={replaceImgInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleReplaceImage}
      />

      {/* 1. SUB-HEADER TOOLBAR */}
      <div
        style={{
          height: '46px',
          minHeight: '46px',
          background: '#0c0c12',
          borderBottom: '1px solid #1b1b26',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          gap: '10px',
        }}
      >
        {/* Left tool icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setLeftTab('signals')}
            title="SVGA AE Script & Signals"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
              border: '0',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              marginRight: '4px',
            }}
          >
            <Sparkles size={14} />
          </button>

          {(
            [
              { id: 'Move', Icon: MousePointer, label: 'Move (تحديد وتحريك الطبقات بالماوس)' },
              {
                id: 'Crop',
                Icon: Scissors,
                label: 'Crop / Cut (تحديد وقص جزء من الطبقة بالماوس وفصله أو تحريكه)',
              },
              {
                id: 'Shine',
                Icon: Sparkles,
                label: 'Shine (أداة الطبقة اللامعة ونقاط تحرير القناع والحركة مثل إطار الهند)',
              },
              { id: 'Frame', Icon: Hash, label: 'Frame (Canvas size & FPS)' },
              { id: 'Shape', Icon: Square, label: 'Shape (Add shape layer)' },
              { id: 'Pen', Icon: PenTool, label: 'Pen (Draw vector path layer)' },
              { id: 'Text', Icon: Type, label: 'Text (Add decomposed text layer)' },
              { id: 'Hand', Icon: Hand, label: 'Hand (Pan stage)' },
              { id: 'Zoom', Icon: Search, label: 'Zoom (Click to zoom, Alt+Click out)' },
            ] as const
          ).map((t) => {
            const on = activeTool === t.id;
            const IconComp = t.Icon;
            return (
              <button
                key={t.id}
                type="button"
                aria-label={t.label}
                onClick={() => {
                  setActiveTool(t.id);
                  if (t.id === 'Shine') {
                    const curShine = addedLayers.find(
                      (l) => l.id === selectedTarget && l.shineConfig?.enabled
                    );
                    if (!curShine) {
                      const anyShine = addedLayers.find((l) => l.shineConfig?.enabled);
                      if (anyShine) {
                        setSelectedTarget(anyShine.id);
                        setSelectedAssetKey(null);
                      } else {
                        handleCreateShineLayer();
                      }
                    }
                  }
                  if (t.id === 'Frame') {
                    setSelectedTarget('DOCUMENT');
                    setSelectedAssetKey(null);
                  }
                  if (t.id === 'Shape') setLeftTab('shapes');
                  if (t.id === 'Text') setNewTextModalOpen(true);
                }}
                title={t.label}
                style={{
                  height: '28px',
                  minWidth: '28px',
                  padding: '0 6px',
                  borderRadius: '6px',
                  border: on
                    ? t.id === 'Crop' || t.id === 'Shine'
                      ? '1px solid #f59e0b'
                      : '1px solid #2e2e42'
                    : '1px solid transparent',
                  background: on
                    ? t.id === 'Crop' || t.id === 'Shine'
                      ? 'rgba(245,158,11,0.18)'
                      : '#191924'
                    : 'transparent',
                  color: on
                    ? t.id === 'Crop' || t.id === 'Shine'
                      ? '#fde047'
                      : '#f2f2f7'
                    : '#8e8ea0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <IconComp size={13} />
              </button>
            );
          })}
          <span
            style={{
              color:
                activeTool === 'Crop' || activeTool === 'Shine' ? '#fde047' : '#7c7c8e',
              fontSize: '11px',
              marginLeft: '5px',
              fontWeight: activeTool === 'Crop' || activeTool === 'Shine' ? 700 : 400,
            }}
          >
            {activeTool === 'Crop'
              ? '✂ قص وتحديد بالماوس'
              : activeTool === 'Shine'
                ? '✨ لمعة ونقاط تحرير'
                : activeTool}
          </span>
          {activeTool === 'Pen' && penDraftPoints.length > 0 && (
            <button
              type="button"
              onClick={finishPenDraft}
              style={{
                marginLeft: '6px',
                padding: '3px 8px',
                borderRadius: '5px',
                border: '1px solid #7c5cff',
                background: '#7c5cff',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Check size={11} /> Finish Path ({penDraftPoints.length} pts)
            </button>
          )}
        </div>

        {/* Center Document Breadcrumb */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>{title || 'Local drafts'}</span>
          <span style={{ color: '#4a4a5a' }}>/</span>
          {isRenamingDoc ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="text"
                value={docName}
                placeholder="اكتب الاسم الجديد (مثل Ahmed)..."
                autoFocus
                onChange={(e) => setDocName(e.target.value)}
                onBlur={() => {
                  const clean = docName
                    .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '')
                    .replace(/\.svga$/i, '')
                    .replace(/^\.+|\.+$/g, '')
                    .trim();
                  setDocName(clean ? `${clean}.svga` : 'SVGA.svga');
                  setIsRenamingDoc(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const clean = docName
                      .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '')
                      .replace(/\.svga$/i, '')
                      .replace(/^\.+|\.+$/g, '')
                      .trim();
                    const finalName = clean ? `${clean}.svga` : 'SVGA.svga';
                    setDocName(finalName);
                    setIsRenamingDoc(false);
                    setLastAction(`تم حذف الاسم القديم وتسمية الملف: ${finalName}`);
                  } else if (e.key === 'Escape') {
                    setIsRenamingDoc(false);
                  }
                }}
                style={{
                  width: '170px',
                  background: '#14141e',
                  border: '1px solid #a855f7',
                  borderRadius: '5px',
                  padding: '2px 6px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#c084fc',
                  background: 'rgba(168,85,247,0.16)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(168,85,247,0.35)',
                }}
              >
                .svga
              </span>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedTarget('DOCUMENT');
                  setSelectedAssetKey(null);
                }}
                onDoubleClick={() => {
                  setDocName('');
                  setIsRenamingDoc(true);
                }}
                title="اضغط لتحديد المستند، أو اضغط زر تغيير الاسم لحذف الاسم القديم وكتابة اسم جديد"
                style={{
                  background: 'transparent',
                  border: 0,
                  color: '#f0f0f6',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '210px',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {docName.endsWith('.svga') ? docName : `${docName}.svga`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocName('');
                  setIsRenamingDoc(true);
                }}
                title="حذف الاسم القديم بالكامل وكتابة اسم جديد بجانب .svga"
                style={{
                  height: '24px',
                  padding: '0 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(168,85,247,0.45)',
                  background: 'rgba(168,85,247,0.14)',
                  color: '#e9d5ff',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                }}
              >
                <Pencil size={11} />
                <span>تغيير الاسم (.svga)</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Action Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid #232332',
              borderRadius: '7px',
              background: '#12121a',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              title="رجوع للخلف / تراجع (Undo — Ctrl+Z أو كليك يمين بالماوس)"
              onClick={handleUndo}
              style={{
                padding: '0 8px',
                height: '28px',
                border: 0,
                borderRight: '1px solid #232332',
                background: 'transparent',
                color: historyIdx > 0 ? '#e8e8ee' : '#555566',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              <Undo2 size={13} />
              <span>رجوع</span>
            </button>
            <button
              type="button"
              title="تقدم للأمام / إعادة (Redo — Ctrl+Y)"
              onClick={handleRedo}
              style={{
                padding: '0 8px',
                height: '28px',
                border: 0,
                background: 'transparent',
                color: historyIdx + 1 < history.length ? '#e8e8ee' : '#555566',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              <Redo2 size={13} />
              <span>إعادة</span>
            </button>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: '1px solid #242434',
              borderRadius: '8px',
              background: '#12121a',
              padding: '2px',
              gap: '2px',
            }}
          >
            <button
              type="button"
              id="edOpenSvga"
              onClick={() => openSvgaInputRef.current?.click()}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: 0,
                background: 'transparent',
                color: '#e8e8ee',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                whiteSpace: 'nowrap',
              }}
            >
              <FolderOpen size={13} color="#a0a0b4" />
              <span>Open SVGA</span>
            </button>
            <button
              type="button"
              id="edAddImageLayer"
              onClick={() => addLayerInputRef.current?.click()}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: 0,
                background: 'transparent',
                color: '#e8e8ee',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                whiteSpace: 'nowrap',
              }}
            >
              <ImagePlus size={13} color="#a0a0b4" />
              <span>Add image layer</span>
            </button>
            <button
              type="button"
              id="edAddShineLayerBtn"
              onClick={() => handleCreateShineLayer()}
              title="إضافة طبقة لمعة احترافية (Shine Layer) مع قناع نقاط ومسار حركة مثل إطار الهند"
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(245, 158, 11, 0.45)',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.12))',
                color: '#fde68a',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11.5px',
                whiteSpace: 'nowrap',
              }}
            >
              <Sparkles size={13} color="#fbbf24" />
              <span>✨ إضافة لمعة (Shine)</span>
            </button>
            <button
              type="button"
              id="edMergeSvga"
              onClick={() => mergeSvgaInputRef.current?.click()}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                border: 0,
                background: 'transparent',
                color: '#e8e8ee',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                whiteSpace: 'nowrap',
              }}
            >
              <Upload size={13} color="#a0a0b4" />
              <span>Merge SVGA</span>
            </button>
          </div>

          <button
            type="button"
            id="edSyncMotionTools"
            onClick={handleSyncToMotionTools}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #242434',
              background: '#12121a',
              color: '#e8e8ee',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
            }}
          >
            <ArrowLeftRight size={13} color="#a0a0b4" />
            <span>Sync to Motion Tools</span>
          </button>

          <button
            type="button"
            id="edExportSvga"
            onClick={handleExportSvga}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #7c5cff',
              background: '#7c5cff',
              color: '#ffffff',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              whiteSpace: 'nowrap',
            }}
          >
            <Download size={13} />
            <span>Export SVGA</span>
          </button>
        </div>
      </div>

      {/* 2. MIDDLE WORKSPACE */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Far-left Icon Rail (44px) */}
        <div
          style={{
            width: '44px',
            minWidth: '44px',
            background: '#0c0c12',
            borderRight: '1px solid #1b1b26',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '8px 0',
            gap: '6px',
          }}
        >
          {(
            [
              { id: 'layers', Icon: Layers, title: 'Layers' },
              { id: 'assets', Icon: ImageIcon, title: 'Assets' },
              { id: 'shapes', Icon: Shapes, title: 'Shapes & Objects' },
              { id: 'signals', Icon: GitCommitHorizontal, title: 'AE Script & Signals' },
            ] as const
          ).map((item) => {
            const on = leftTab === item.id;
            const IconComp = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                id={`rail-${item.id}`}
                title={item.title}
                onClick={() => setLeftTab(on ? null : item.id)}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '7px',
                  border: on ? '1px solid #2e2e42' : '1px solid transparent',
                  background: on ? '#191925' : 'transparent',
                  color: on ? '#f0f0f7' : '#7e7e90',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <IconComp size={15} />
              </button>
            );
          })}
        </div>

        {/* Left Drawer Panel (256px) */}
        {leftTab && (
          <aside
            style={{
              width: '256px',
              minWidth: '256px',
              background: '#0d0d13',
              borderRight: '1px solid #1b1b26',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* TAB 1: LAYERS */}
            {leftTab === 'layers' && (
              <>
                <div
                  style={{
                    height: '40px',
                    padding: '0 12px',
                    borderBottom: '1px solid #1b1b26',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                    <Layers size={14} color="#8e8ea0" /> Layers
                  </span>
                  <button
                    type="button"
                    onClick={() => setLeftTab(null)}
                    style={{
                      background: 0,
                      border: 0,
                      color: '#7e7e90',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div
                  style={{
                    padding: '8px 10px',
                    borderBottom: '1px solid #1b1b26',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Search layers (#136, img_...)"
                    value={layerSearch}
                    onChange={(e) => setLayerSearch(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#13131c',
                      border: '1px solid #232332',
                      borderRadius: '7px',
                      padding: '5px 9px',
                      color: '#e8e8ee',
                      fontSize: '11px',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      color: '#7e7e90',
                      fontSize: '11px',
                      flexWrap: 'wrap',
                      gap: '4px',
                    }}
                  >
                    <span>
                      {spriteLayers.length + addedLayers.length + shapes.length} decomposed layers
                    </span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {(() => {
                        const isAnyGrouped = isAllLayersGrouped || mergedGroups.some((g) => !g.isUngrouped);
                        return (
                          <button
                            type="button"
                            id="edMergeAllLayers"
                            onClick={handleToggleGroupAllLayers}
                            title={
                              isAnyGrouped
                                ? 'فك تجميع الطبقات والرجوع للتحكم في كل طبقة منفردة'
                                : 'تجميع كل ملف في لير واحد مستقل لتسهيل تحريكه وترتيبه للأعلى والأسفل دون فقدان جودة'
                            }
                            style={{
                              background: isAnyGrouped
                                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.28), rgba(248, 113, 113, 0.18))'
                                : 'linear-gradient(135deg, rgba(124, 92, 255, 0.28), rgba(167, 139, 250, 0.18))',
                              border: isAnyGrouped
                                ? '1px solid rgba(239, 68, 68, 0.55)'
                                : '1px solid rgba(139, 92, 246, 0.55)',
                              color: isAnyGrouped ? '#fca5a5' : '#ddd6fe',
                              borderRadius: '5px',
                              padding: '2px 7px',
                              fontSize: '10px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Layers size={10} color={isAnyGrouped ? '#fca5a5' : '#a78bfa'} />
                            <span>{isAnyGrouped ? 'فك التجميع (Ungroup)' : 'دمج الطبقات كلها في لير واحد'}</span>
                          </button>
                        );
                      })()}
                      {selectedTarget !== 'DOCUMENT' && selectedTarget !== 'GROUP_ALL' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteLayer(selectedTarget)}
                          title="Delete selected layer"
                          style={{
                            background: 'rgba(248,113,113,0.12)',
                            border: '1px solid rgba(248,113,113,0.35)',
                            color: '#f87171',
                            borderRadius: '5px',
                            padding: '2px 6px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Trash2 size={10} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
                  {/* Master Group Row when isAllLayersGrouped */}
                  {isAllLayersGrouped && (
                    <div
                      style={{
                        marginBottom: '8px',
                        border: '1px solid rgba(139, 92, 246, 0.5)',
                        borderRadius: '7px',
                        background:
                          selectedTarget === 'GROUP_ALL'
                            ? 'rgba(124, 92, 255, 0.22)'
                            : 'rgba(124, 92, 255, 0.1)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        onClick={() => {
                          setSelectedTarget('GROUP_ALL');
                          setSelectedAssetKey(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 9px',
                          cursor: 'pointer',
                        }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsGroupSublayersExpanded((prev) => !prev);
                          }}
                          title={isGroupSublayersExpanded ? 'طي الطبقات الفرعية' : 'عرض الطبقات الفرعية'}
                          style={{
                            background: 0,
                            border: 0,
                            color: '#c4b5fd',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          {isGroupSublayersExpanded ? (
                            <ChevronDown size={13} />
                          ) : (
                            <ChevronRight size={13} />
                          )}
                        </button>
                        <Layers size={14} color="#a78bfa" />
                        <span
                          style={{
                            flex: 1,
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#f3e8ff',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          📁 مجموعة كل الطبقات ({spriteLayers.length + addedLayers.length + shapes.length} طبقة)
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#7c5cff',
                            color: '#fff',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                          }}
                        >
                          موحدة
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Document Root Row */}
                  <div
                    onClick={() => {
                      setSelectedTarget('DOCUMENT');
                      setSelectedAssetKey(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background:
                        selectedTarget === 'DOCUMENT' && !selectedAssetKey
                          ? '#191926'
                          : 'transparent',
                    }}
                  >
                    <ChevronDown size={12} color="#7e7e90" />
                    <Hash size={13} color="#8e8ea0" />
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}
                    >
                      {docName}
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: '#191925',
                        border: '1px solid #282838',
                        color: '#8e8ea0',
                      }}
                    >
                      FRAME
                    </span>
                  </div>

                  {/* Merged SVGA Group Layers */}
                  {mergedGroups.map((mg, gIdx) => {
                    const isHidden = hiddenLayerIds.has(mg.id);
                    const isSel = selectedTarget === mg.id;
                    return (
                      <div
                        key={mg.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', `merged_group_idx:${gIdx}`);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const raw = e.dataTransfer.getData('text/plain');
                          if (raw.startsWith('merged_group_idx:')) {
                            const fromIdx = Number(raw.replace('merged_group_idx:', ''));
                            if (Number.isFinite(fromIdx) && fromIdx !== gIdx && fromIdx >= 0 && fromIdx < mergedGroups.length) {
                              setMergedGroups((prev) => {
                                const next = [...prev];
                                const [moved] = next.splice(fromIdx, 1);
                                next.splice(gIdx, 0, moved);
                                return next;
                              });
                              setSelectedTarget(mg.id);
                              setLastAction(`تم نقل ${mg.name} بالماوس إلى الترتيب #${gIdx + 1}`);
                            }
                          }
                        }}
                        style={{
                          marginTop: '4px',
                          marginBottom: '4px',
                          border: isSel ? '1.5px solid #a78bfa' : '1px solid rgba(124, 92, 255, 0.35)',
                          borderRadius: '7px',
                          background: isSel ? 'rgba(124, 92, 255, 0.25)' : 'rgba(124, 92, 255, 0.08)',
                          overflow: 'hidden',
                          opacity: isHidden ? 0.45 : 1,
                          cursor: 'grab',
                        }}
                      >
                        <div
                          onClick={() => {
                            setSelectedTarget(mg.id);
                            setSelectedAssetKey(null);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 8px',
                            cursor: 'pointer',
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLayerVisibility(mg.id);
                            }}
                            title={isHidden ? 'إظهار المجموعة' : 'إخفاء المجموعة'}
                            style={{
                              background: 0,
                              border: 0,
                              color: isHidden ? '#555566' : '#a78bfa',
                              cursor: 'pointer',
                              padding: 0,
                              display: 'grid',
                              placeItems: 'center',
                            }}
                          >
                            {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <Layers size={14} color="#a78bfa" />
                          <span
                            style={{
                              flex: 1,
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#f3e8ff',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {mg.name} ({mg.spriteIds.length} طبقة)
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleGroupUngroup(mg.id);
                            }}
                            title={mg.isUngrouped ? 'تجميع الطبقات المدمجة' : 'فك التجميع (Ungroup)'}
                            style={{
                              background: mg.isUngrouped
                                ? 'rgba(239, 68, 68, 0.25)'
                                : 'rgba(124, 92, 255, 0.3)',
                              border: mg.isUngrouped
                                ? '1px solid rgba(239, 68, 68, 0.5)'
                                : '1px solid #a78bfa',
                              color: mg.isUngrouped ? '#fca5a5' : '#e9d5ff',
                              borderRadius: '4px',
                              padding: '2px 5px',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {mg.isUngrouped ? 'تجميع' : 'فك التجميع (Ungroup)'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveMergedGroupUp(mg.id);
                            }}
                            title="رفع المجموعة للأعلى"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #3e3e52', color: '#c4b5fd', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}
                          >
                            <MoveUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveMergedGroupDown(mg.id);
                            }}
                            title="خفض المجموعة للأسفل"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #3e3e52', color: '#c4b5fd', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}
                          >
                            <MoveDown size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLayer(mg.id);
                            }}
                            title="حذف المجموعة"
                            style={{ background: 0, border: 0, color: '#f87171', cursor: 'pointer', padding: '1px' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Unified Visual Layers List (in true stacking hierarchy order) */}
                  {filteredUnifiedLayers.map((layerItem) => {
                    const isHidden = hiddenLayerIds.has(layerItem.id);
                    const isSel = selectedTarget === layerItem.id;

                    if (layerItem.type === 'shape') {
                      const sh = layerItem.shape!;
                      return (
                        <div
                          key={sh.id}
                          onClick={() => {
                            setSelectedTarget(sh.id);
                            setSelectedAssetKey(null);
                          }}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '5px',
                            padding: '6px 8px',
                            borderRadius: '7px',
                            cursor: 'pointer',
                            marginTop: '3px',
                            background: isSel ? '#1d1d2d' : 'rgba(255,255,255,0.02)',
                            border: isSel ? '1px solid #7c5cff' : '1px solid #222230',
                            opacity: isHidden ? 0.45 : 1,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLayerVisibility(sh.id);
                              }}
                              style={{
                                background: 0,
                                border: 0,
                                color: isHidden ? '#555566' : '#8e8ea0',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            {sh.type === 'text' ? (
                              <Type size={12} color={sh.color} style={{ flexShrink: 0 }} />
                            ) : (
                              <Hexagon size={12} color={sh.color} style={{ flexShrink: 0 }} />
                            )}
                            <span
                              style={{
                                flex: 1,
                                fontWeight: 500,
                                color: '#e8e8ee',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {sh.name}
                            </span>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMoveMenuLayerId(moveMenuLayerId === sh.id ? null : sh.id);
                                }}
                                title="نقل وترتيب الطبقة في المشروع (Move Layer)"
                                style={{
                                  background: moveMenuLayerId === sh.id ? 'rgba(124, 92, 255, 0.28)' : 'rgba(255,255,255,0.05)',
                                  border: moveMenuLayerId === sh.id ? '1px solid #8b5cf6' : '1px solid #2a2a3c',
                                  color: moveMenuLayerId === sh.id ? '#f3e8ff' : '#c4b5fd',
                                  borderRadius: '6px',
                                  padding: '3px 8px',
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <ArrowUpDown size={11} color="#a78bfa" />
                                <span>نقل</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveLayer(sh.id, 'up');
                                }}
                                title="رفع الطبقة للأعلى (Move Up)"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #28283a', color: '#a78bfa', cursor: 'pointer', padding: '2px 4px', borderRadius: '5px' }}
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveLayer(sh.id, 'down');
                                }}
                                title="خفض الطبقة للأسفل (Move Down)"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #28283a', color: '#a78bfa', cursor: 'pointer', padding: '2px 4px', borderRadius: '5px' }}
                              >
                                <ChevronDown size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLayer(sh.id);
                                }}
                                title="Delete layer"
                                style={{
                                  background: 0,
                                  border: 0,
                                  color: '#727284',
                                  cursor: 'pointer',
                                  padding: '2px',
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Move Menu Popover for Shape */}
                          {moveMenuLayerId === sh.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                background: '#12121c',
                                border: '1px solid #2e2e42',
                                borderRadius: '8px',
                                padding: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                marginTop: '6px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #242436', paddingBottom: '6px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <ArrowUpDown size={12} color="#8b5cf6" />
                                  <span>نقل وترتيب الطبقة في المشروع</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setMoveMenuLayerId(null)}
                                  style={{ background: 0, border: 0, color: '#8e8ea0', cursor: 'pointer', padding: '2px', borderRadius: '4px', display: 'grid', placeItems: 'center' }}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleMoveLayer(sh.id, 'top')}
                                  title="أعلى الكل (Frontmost)"
                                  style={{
                                    flex: 1,
                                    background: 'rgba(124, 92, 255, 0.16)',
                                    border: '1px solid rgba(167, 139, 250, 0.4)',
                                    color: '#f3e8ff',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <ArrowUpToLine size={12} color="#c4b5fd" />
                                  <span>أعلى الكل ⤒</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveLayer(sh.id, 'bottom')}
                                  title="أسفل الكل (Backmost)"
                                  style={{
                                    flex: 1,
                                    background: 'rgba(124, 92, 255, 0.16)',
                                    border: '1px solid rgba(167, 139, 250, 0.4)',
                                    color: '#f3e8ff',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <ArrowDownToLine size={12} color="#c4b5fd" />
                                  <span>أسفل الكل ⤓</span>
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                                <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>نقل نسبة لطبقة أخرى:</span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <select
                                    value={moveTargetSelectId}
                                    onChange={(e) => setMoveTargetSelectId(e.target.value)}
                                    style={{
                                      flex: 1,
                                      background: '#0a0a10',
                                      border: '1px solid #2e2e42',
                                      borderRadius: '6px',
                                      color: '#f3e8ff',
                                      fontSize: '11px',
                                      padding: '4px 8px',
                                      outline: 'none',
                                    }}
                                  >
                                    <option value="">-- اختر الطبقة المرجعية --</option>
                                    {effectiveLayerOrder.filter((id) => id !== sh.id).map((id) => {
                                      let label = id;
                                      if (id.startsWith('sprite_')) {
                                        const sIdx = Number(id.replace('sprite_', ''));
                                        const sp = movie.sp[sIdx];
                                        label = `#${movie.sp.length - sIdx} · ${sp?.key || 'sprite'}`;
                                      } else if (id.startsWith('layer_')) {
                                        const foundAl = addedLayers.find((x) => x.id === id);
                                        label = foundAl?.name || id;
                                      } else if (id.startsWith('shape_')) {
                                        const foundSh = shapes.find((x) => x.id === id);
                                        label = foundSh?.name || id;
                                      }
                                      return <option key={id} value={id}>{label}</option>;
                                    })}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={!moveTargetSelectId}
                                    onClick={() => handleMoveLayer(sh.id, 'above', moveTargetSelectId)}
                                    title="وضع فوق الطبقة المختارة"
                                    style={{
                                      background: !moveTargetSelectId ? 'rgba(255,255,255,0.04)' : 'rgba(16, 185, 129, 0.2)',
                                      border: !moveTargetSelectId ? '1px solid #222232' : '1px solid rgba(16, 185, 129, 0.5)',
                                      color: !moveTargetSelectId ? '#555' : '#6ee7b7',
                                      borderRadius: '6px',
                                      padding: '4px 8px',
                                      fontSize: '10.5px',
                                      fontWeight: 700,
                                      cursor: !moveTargetSelectId ? 'not-allowed' : 'pointer',
                                    }}
                                  >
                                    فوقها ↑
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!moveTargetSelectId}
                                    onClick={() => handleMoveLayer(sh.id, 'below', moveTargetSelectId)}
                                    title="وضع تحت الطبقة المختارة"
                                    style={{
                                      background: !moveTargetSelectId ? 'rgba(255,255,255,0.04)' : 'rgba(56, 189, 248, 0.2)',
                                      border: !moveTargetSelectId ? '1px solid #222232' : '1px solid rgba(56, 189, 248, 0.5)',
                                      color: !moveTargetSelectId ? '#555' : '#7dd3fc',
                                      borderRadius: '6px',
                                      padding: '4px 8px',
                                      fontSize: '10.5px',
                                      fontWeight: 700,
                                      cursor: !moveTargetSelectId ? 'not-allowed' : 'pointer',
                                    }}
                                  >
                                    تحتها ↓
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (layerItem.type === 'added') {
                      const al = layerItem.addedLayer!;
                      const isShine = !!al.shineConfig?.enabled;
                      const targetLid = al.shineConfig?.targetLayerId;
                      const isTargetDoc = !targetLid || targetLid === 'DOCUMENT';

                      let targetName = 'كامل المشروع';
                      if (!isTargetDoc && targetLid) {
                        if (targetLid.startsWith('sprite_')) {
                          const sIdx = Number(targetLid.replace('sprite_', ''));
                          const sp = movie.sp[sIdx];
                          targetName = `#${movie.sp.length - sIdx} (${sp?.key || 'طبقة'})`;
                        } else {
                          const foundAl = addedLayers.find((x) => x.id === targetLid);
                          targetName = foundAl?.name || targetLid;
                        }
                      }

                      return (
                        <div
                          key={al.id}
                          onClick={() => {
                            setSelectedTarget(al.id);
                            setSelectedAssetKey(null);
                          }}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '5px',
                            padding: '6px 8px',
                            borderRadius: '7px',
                            cursor: 'pointer',
                            marginTop: '3px',
                            background: isSel
                              ? (isShine ? 'rgba(245, 158, 11, 0.12)' : '#1d1d2d')
                              : (isShine ? 'rgba(245, 158, 11, 0.04)' : 'rgba(255,255,255,0.02)'),
                            border: isSel
                              ? (isShine ? '1px solid #f59e0b' : '1px solid #7c5cff')
                              : (isShine ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #222230'),
                            opacity: isHidden ? 0.45 : 1,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLayerVisibility(al.id);
                              }}
                              style={{
                                background: 0,
                                border: 0,
                                color: isHidden ? '#555566' : '#8e8ea0',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'grid',
                                placeItems: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            {isShine ? (
                              <Sparkles size={13} color="#fcd34d" style={{ flexShrink: 0 }} />
                            ) : (
                              <ImageIcon size={12} color="#a78bfa" style={{ flexShrink: 0 }} />
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: isShine ? '#fde68a' : '#e8e8ee',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {al.name}
                                </span>
                                {isShine && (
                                  <span
                                    style={{
                                      fontSize: '9px',
                                      padding: '1px 4px',
                                      borderRadius: '3px',
                                      background: 'rgba(245, 158, 11, 0.25)',
                                      color: '#fef08a',
                                      fontWeight: 700,
                                      whiteSpace: 'nowrap',
                                      flexShrink: 0,
                                    }}
                                  >
                                    ✨ لمعة
                                  </span>
                                )}
                              </div>
                              <span
                                style={{
                                  fontSize: '9.5px',
                                  color: isShine ? '#fbbf24' : (al.copiedFromKey ? '#34d399' : '#727284'),
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {isShine
                                  ? (isTargetDoc ? 'لمعة على كامل المشروع' : `🎯 فوق الطبقة: ${targetName}`)
                                  : al.copiedFromKey
                                  ? `🎬 حركة: ${al.copiedFromKey} · F${al.inFrame}–${al.outFrame}`
                                  : `ADDED · ${al.width}×${al.height}`}
                              </span>
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMoveMenuLayerId(moveMenuLayerId === al.id ? null : al.id);
                                }}
                                title="نقل وترتيب الطبقة في المشروع (Move Layer)"
                                style={{
                                  background: isShine
                                    ? 'rgba(245, 158, 11, 0.16)'
                                    : (moveMenuLayerId === al.id ? 'rgba(124, 92, 255, 0.28)' : 'rgba(255,255,255,0.05)'),
                                  border: isShine
                                    ? '1px solid rgba(245, 158, 11, 0.45)'
                                    : (moveMenuLayerId === al.id ? '1px solid #8b5cf6' : '1px solid #28283a'),
                                  color: isShine ? '#fde68a' : (moveMenuLayerId === al.id ? '#f3e8ff' : '#c4b5fd'),
                                  borderRadius: '6px',
                                  padding: '3px 8px',
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <ArrowUpDown size={11} color={isShine ? '#fbbf24' : '#a78bfa'} />
                                <span>نقل</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveLayer(al.id, 'up');
                                }}
                                title="رفع الطبقة للأعلى (Move Up)"
                                style={{
                                  background: isShine ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255,255,255,0.04)',
                                  border: isShine ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid #28283a',
                                  color: isShine ? '#fde68a' : '#a78bfa',
                                  cursor: 'pointer',
                                  padding: '2px 4px',
                                  borderRadius: '5px',
                                }}
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveLayer(al.id, 'down');
                                }}
                                title="خفض الطبقة للأسفل (Move Down)"
                                style={{
                                  background: isShine ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255,255,255,0.04)',
                                  border: isShine ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid #28283a',
                                  color: isShine ? '#fde68a' : '#a78bfa',
                                  cursor: 'pointer',
                                  padding: '2px 4px',
                                  borderRadius: '5px',
                                }}
                              >
                                <ChevronDown size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLayer(al.id);
                                }}
                                title="Delete layer"
                                style={{
                                  background: 0,
                                  border: 0,
                                  color: isShine ? '#fca5a5' : '#727284',
                                  cursor: 'pointer',
                                  padding: '2px',
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Move Menu Popover for Added Layer */}
                          {moveMenuLayerId === al.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                background: '#12121c',
                                border: '1px solid #2e2e42',
                                borderRadius: '8px',
                                padding: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                marginTop: '6px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #242436', paddingBottom: '6px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <ArrowUpDown size={12} color="#8b5cf6" />
                                  <span>نقل وترتيب الطبقة في المشروع</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setMoveMenuLayerId(null)}
                                  style={{ background: 0, border: 0, color: '#8e8ea0', cursor: 'pointer', padding: '2px', borderRadius: '4px', display: 'grid', placeItems: 'center' }}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleMoveLayer(al.id, 'top')}
                                  title="أعلى الكل (Frontmost)"
                                  style={{
                                    flex: 1,
                                    background: 'rgba(124, 92, 255, 0.16)',
                                    border: '1px solid rgba(167, 139, 250, 0.4)',
                                    color: '#f3e8ff',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <ArrowUpToLine size={12} color="#c4b5fd" />
                                  <span>أعلى الكل ⤒</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveLayer(al.id, 'bottom')}
                                  title="أسفل الكل (Backmost)"
                                  style={{
                                    flex: 1,
                                    background: 'rgba(124, 92, 255, 0.16)',
                                    border: '1px solid rgba(167, 139, 250, 0.4)',
                                    color: '#f3e8ff',
                                    borderRadius: '6px',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <ArrowDownToLine size={12} color="#c4b5fd" />
                                  <span>أسفل الكل ⤓</span>
                                </button>
                              </div>

                              {isShine && !isTargetDoc && (
                                <button
                                  type="button"
                                  onClick={() => handleMoveLayer(al.id, 'above', targetLid)}
                                  title="وضع اللمعة فوق الطبقة المستهدفة مباشرة"
                                  style={{
                                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.14))',
                                    border: '1px solid rgba(245, 158, 11, 0.5)',
                                    color: '#fde68a',
                                    borderRadius: '6px',
                                    padding: '6px 10px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)',
                                  }}
                                >
                                  <Sparkles size={12} color="#fbbf24" />
                                  <span>🎯 وضع فوق الطبقة المستهدفة مباشرة ({targetName})</span>
                                </button>
                              )}

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                                <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>نقل نسبة لطبقة أخرى:</span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <select
                                    value={moveTargetSelectId}
                                    onChange={(e) => setMoveTargetSelectId(e.target.value)}
                                    style={{
                                      flex: 1,
                                      background: '#0a0a10',
                                      border: '1px solid #2e2e42',
                                      borderRadius: '6px',
                                      color: '#f3e8ff',
                                      fontSize: '11px',
                                      padding: '4px 8px',
                                      outline: 'none',
                                    }}
                                  >
                                    <option value="">-- اختر الطبقة المرجعية --</option>
                                    {effectiveLayerOrder.filter((id) => id !== al.id).map((id) => {
                                      let label = id;
                                      if (id.startsWith('sprite_')) {
                                        const sIdx = Number(id.replace('sprite_', ''));
                                        const sp = movie.sp[sIdx];
                                        label = `#${movie.sp.length - sIdx} · ${sp?.key || 'sprite'}`;
                                      } else if (id.startsWith('layer_')) {
                                        const foundAl = addedLayers.find((x) => x.id === id);
                                        label = foundAl?.name || id;
                                      } else if (id.startsWith('shape_')) {
                                        const foundSh = shapes.find((x) => x.id === id);
                                        label = foundSh?.name || id;
                                      }
                                      return <option key={id} value={id}>{label}</option>;
                                    })}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={!moveTargetSelectId}
                                    onClick={() => handleMoveLayer(al.id, 'above', moveTargetSelectId)}
                                    title="وضع فوق الطبقة المختارة"
                                    style={{
                                      background: !moveTargetSelectId ? 'rgba(255,255,255,0.04)' : 'rgba(16, 185, 129, 0.2)',
                                      border: !moveTargetSelectId ? '1px solid #222232' : '1px solid rgba(16, 185, 129, 0.5)',
                                      color: !moveTargetSelectId ? '#555' : '#6ee7b7',
                                      borderRadius: '6px',
                                      padding: '4px 8px',
                                      fontSize: '10.5px',
                                      fontWeight: 700,
                                      cursor: !moveTargetSelectId ? 'not-allowed' : 'pointer',
                                    }}
                                  >
                                    فوقها ↑
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!moveTargetSelectId}
                                    onClick={() => handleMoveLayer(al.id, 'below', moveTargetSelectId)}
                                    title="وضع تحت الطبقة المختارة"
                                    style={{
                                      background: !moveTargetSelectId ? 'rgba(255,255,255,0.04)' : 'rgba(56, 189, 248, 0.2)',
                                      border: !moveTargetSelectId ? '1px solid #222232' : '1px solid rgba(56, 189, 248, 0.5)',
                                      color: !moveTargetSelectId ? '#555' : '#7dd3fc',
                                      borderRadius: '6px',
                                      padding: '4px 8px',
                                      fontSize: '10.5px',
                                      fontWeight: 700,
                                      cursor: !moveTargetSelectId ? 'not-allowed' : 'pointer',
                                    }}
                                  >
                                    تحتها ↓
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', paddingLeft: '16px', flexWrap: 'wrap' }}>
                            {!isShine && (
                              <button
                                type="button"
                                className="btn-copy-motion-layer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTarget(al.id);
                                  setSelectedAssetKey(null);
                                  setCopyMotionSearch('');
                                  setCopyMotionModalLayerId(al.id);
                                }}
                                title="اختر طبقة من ملف SVGA لأخذ نفس الحركة والأنيميشن والفريمات"
                                style={{
                                  flex: 1,
                                  background: al.copiedFromKey
                                    ? 'rgba(16, 185, 129, 0.16)'
                                    : 'rgba(124, 92, 255, 0.16)',
                                  border: al.copiedFromKey
                                    ? '1px solid rgba(16, 185, 129, 0.45)'
                                    : '1px solid rgba(124, 92, 255, 0.45)',
                                  color: al.copiedFromKey ? '#6ee7b7' : '#c4b5fd',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Clapperboard size={11} />
                                <span>{al.copiedFromKey ? 'تغيير الحركة' : 'نسخ حركة SVGA'}</span>
                              </button>
                            )}

                            {!isShine ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCreateShineLayer(al.id);
                                }}
                                title="إضافة طبقة لمعة احترافية على هذه الطبقة (Shine Layer)"
                                style={{
                                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.14))',
                                  border: '1px solid rgba(245, 158, 11, 0.5)',
                                  color: '#fde68a',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Sparkles size={11} color="#fbbf24" />
                                <span>لمعة</span>
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateLayer(al.id, 'none');
                              }}
                              title="نسخ طبقة ثانية مباشرة فوق هذه الطبقة (Duplicate Layer)"
                              style={{
                                background: isShine
                                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.14))'
                                  : 'rgba(255, 255, 255, 0.05)',
                                border: isShine
                                  ? '1px solid rgba(245, 158, 11, 0.5)'
                                  : '1px solid #28283a',
                                color: isShine ? '#fde68a' : '#e8e8ee',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <CopyPlus size={11} color={isShine ? '#fbbf24' : '#e8e8ee'} />
                              <span>نسخ</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateLayer(al.id, 'canvas');
                              }}
                              title="نسخ الطبقة وعكسها من الشمال لليمين (Mirror Left-to-Right)"
                              style={{
                                background: isShine
                                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.14))'
                                  : 'rgba(255, 255, 255, 0.05)',
                                border: isShine
                                  ? '1px solid rgba(245, 158, 11, 0.5)'
                                  : '1px solid #28283a',
                                color: isShine ? '#fde68a' : '#e8e8ee',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <FlipHorizontal2 size={11} color={isShine ? '#fbbf24' : '#e8e8ee'} />
                              <span>عكس</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // layerItem.type === 'sprite'
                    const sl = layerItem;
                    const sIdx = sl.spriteIdx!;
                    const th = sl.key ? thumbs[sl.key] : undefined;
                    const parentGroup = mergedGroups.find((g) => g.spriteIds.includes(sl.id));
                    // If in a grouped merged group, skip rendering in main list unless ungrouped
                    if (parentGroup && !parentGroup.isUngrouped) return null;

                    return (
                      <div
                        key={sl.id}
                        onClick={() => {
                          setSelectedTarget(sl.id);
                          setSelectedAssetKey(sl.key || null);
                        }}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '5px',
                          padding: '6px 8px 6px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          marginTop: '2px',
                          background: isSel ? '#1d1d2d' : 'transparent',
                          border: isSel ? '1px solid #7c5cff' : '1px solid transparent',
                          opacity: isHidden ? 0.45 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLayerVisibility(sl.id);
                            }}
                            title={isHidden ? 'Show layer' : 'Hide layer'}
                            style={{
                              background: 0,
                              border: 0,
                              color: isHidden ? '#555566' : '#8e8ea0',
                              cursor: 'pointer',
                              padding: 0,
                              display: 'grid',
                              placeItems: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <div
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '4px',
                              background:
                                'repeating-conic-gradient(#22222c 0 25%, #17171f 0 50%) 0 0 / 8px 8px',
                              display: 'grid',
                              placeItems: 'center',
                              overflow: 'hidden',
                              flexShrink: 0,
                            }}
                          >
                            {th ? (
                              <img
                                src={th.url}
                                alt={sl.key}
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                              />
                            ) : (
                              <ImageIcon size={11} color="#8e8ea0" />
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: '#a78bfa', fontSize: '10px', fontWeight: 700 }}>
                                #{sl.displayNum}
                              </span>
                              <span
                                style={{
                                  fontWeight: 500,
                                  color: '#e8e8ee',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {sl.key}
                              </span>
                            </div>
                            {sl.span && (
                              <span style={{ fontSize: '10px', color: '#727284' }}>
                                F{sl.span.firstFrame}–{sl.span.lastFrame} ({sl.span.activeCount}f)
                                {sl.span.isStatic ? ' · static' : ''}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMoveMenuLayerId(moveMenuLayerId === sl.id ? null : sl.id);
                              }}
                              title="نقل وترتيب الطبقة في المشروع (Move Layer)"
                              style={{
                                background: moveMenuLayerId === sl.id ? 'rgba(124, 92, 255, 0.28)' : 'rgba(255,255,255,0.05)',
                                border: moveMenuLayerId === sl.id ? '1px solid #8b5cf6' : '1px solid #2a2a3c',
                                color: moveMenuLayerId === sl.id ? '#f3e8ff' : '#c4b5fd',
                                borderRadius: '6px',
                                padding: '3px 8px',
                                fontSize: '10.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <ArrowUpDown size={11} color="#a78bfa" />
                              <span>نقل</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveLayer(sl.id, 'up');
                              }}
                              title="رفع الطبقة للأعلى (Move Up)"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #28283a', color: '#a78bfa', cursor: 'pointer', padding: '2px 4px', borderRadius: '5px' }}
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveLayer(sl.id, 'down');
                              }}
                              title="خفض الطبقة للأسفل (Move Down)"
                              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #28283a', color: '#a78bfa', cursor: 'pointer', padding: '2px 4px', borderRadius: '5px' }}
                            >
                              <ChevronDown size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLayer(sl.id);
                              }}
                              title={`Delete layer #${sl.displayNum}`}
                              style={{
                                background: 0,
                                border: 0,
                                color: '#727284',
                                cursor: 'pointer',
                                padding: '2px',
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Move Menu Popover for Sprite Layer */}
                        {moveMenuLayerId === sl.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              background: '#12121c',
                              border: '1px solid #2e2e42',
                              borderRadius: '8px',
                              padding: '10px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              marginTop: '6px',
                              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #242436', paddingBottom: '6px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <ArrowUpDown size={12} color="#8b5cf6" />
                                <span>نقل وترتيب الطبقة #{sl.displayNum}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setMoveMenuLayerId(null)}
                                style={{ background: 0, border: 0, color: '#8e8ea0', cursor: 'pointer', padding: '2px', borderRadius: '4px', display: 'grid', placeItems: 'center' }}
                              >
                                <X size={13} />
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => handleMoveLayer(sl.id, 'top')}
                                title="أعلى الكل (Frontmost)"
                                style={{
                                  flex: 1,
                                  background: 'rgba(124, 92, 255, 0.16)',
                                  border: '1px solid rgba(167, 139, 250, 0.4)',
                                  color: '#f3e8ff',
                                  borderRadius: '6px',
                                  padding: '5px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <ArrowUpToLine size={12} color="#c4b5fd" />
                                <span>أعلى الكل ⤒</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveLayer(sl.id, 'bottom')}
                                title="أسفل الكل (Backmost)"
                                style={{
                                  flex: 1,
                                  background: 'rgba(124, 92, 255, 0.16)',
                                  border: '1px solid rgba(167, 139, 250, 0.4)',
                                  color: '#f3e8ff',
                                  borderRadius: '6px',
                                  padding: '5px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                }}
                              >
                                <ArrowDownToLine size={12} color="#c4b5fd" />
                                <span>أسفل الكل ⤓</span>
                              </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                              <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>نقل نسبة لطبقة أخرى:</span>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <select
                                  value={moveTargetSelectId}
                                  onChange={(e) => setMoveTargetSelectId(e.target.value)}
                                  style={{
                                    flex: 1,
                                    background: '#0a0a10',
                                    border: '1px solid #2e2e42',
                                    borderRadius: '6px',
                                    color: '#f3e8ff',
                                    fontSize: '11px',
                                    padding: '4px 8px',
                                    outline: 'none',
                                  }}
                                >
                                  <option value="">-- اختر الطبقة المرجعية --</option>
                                  {effectiveLayerOrder.filter((id) => id !== sl.id).map((id) => {
                                    let label = id;
                                    if (id.startsWith('sprite_')) {
                                      const sIdx = Number(id.replace('sprite_', ''));
                                      const sp = movie.sp[sIdx];
                                      label = `#${movie.sp.length - sIdx} · ${sp?.key || 'sprite'}`;
                                    } else if (id.startsWith('layer_')) {
                                      const foundAl = addedLayers.find((x) => x.id === id);
                                      label = foundAl?.name || id;
                                    } else if (id.startsWith('shape_')) {
                                      const foundSh = shapes.find((x) => x.id === id);
                                      label = foundSh?.name || id;
                                    }
                                    return <option key={id} value={id}>{label}</option>;
                                  })}
                                </select>
                                <button
                                  type="button"
                                  disabled={!moveTargetSelectId}
                                  onClick={() => handleMoveLayer(sl.id, 'above', moveTargetSelectId)}
                                  title="وضع فوق الطبقة المختارة"
                                  style={{
                                    background: !moveTargetSelectId ? 'rgba(255,255,255,0.04)' : 'rgba(16, 185, 129, 0.2)',
                                    border: !moveTargetSelectId ? '1px solid #222232' : '1px solid rgba(16, 185, 129, 0.5)',
                                    color: !moveTargetSelectId ? '#555' : '#6ee7b7',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    cursor: !moveTargetSelectId ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  فوقها ↑
                                </button>
                                <button
                                  type="button"
                                  disabled={!moveTargetSelectId}
                                  onClick={() => handleMoveLayer(sl.id, 'below', moveTargetSelectId)}
                                  title="وضع تحت الطبقة المختارة"
                                  style={{
                                    background: !moveTargetSelectId ? 'rgba(255,255,255,0.04)' : 'rgba(56, 189, 248, 0.2)',
                                    border: !moveTargetSelectId ? '1px solid #222232' : '1px solid rgba(56, 189, 248, 0.5)',
                                    color: !moveTargetSelectId ? '#555' : '#7dd3fc',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    cursor: !moveTargetSelectId ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  تحتها ↓
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', paddingLeft: '16px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-shine-sprite"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateShineLayer(sl.id);
                            }}
                            title="إضافة طبقة لمعة احترافية مباشرة فوق هذه الطبقة (Add Shine Layer)"
                            style={{
                              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.14))',
                              border: '1px solid rgba(245, 158, 11, 0.5)',
                              color: '#fde68a',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Sparkles size={11} color="#fbbf24" />
                            <span>لمعة</span>
                          </button>
                          <button
                            type="button"
                            className="btn-dup-sprite"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateLayer(sl.id, 'none');
                            }}
                            title="نسخ طبقة ثانية مباشرة فوق هذه الطبقة (Duplicate Layer)"
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid #28283a',
                              color: '#e8e8ee',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <CopyPlus size={11} color="#e8e8ee" />
                            <span>نسخ</span>
                          </button>
                          <button
                            type="button"
                            className="btn-mirror-sprite"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateLayer(sl.id, 'canvas');
                            }}
                            title="نسخ الطبقة وعكسها من الشمال لليمين (Mirror Left-to-Right)"
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid #28283a',
                              color: '#e8e8ee',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <FlipHorizontal2 size={11} color="#e8e8ee" />
                            <span>عكس</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* TAB 2: ASSETS */}
            {leftTab === 'assets' && (
              <>
                <div
                  style={{
                    height: '40px',
                    padding: '0 12px',
                    borderBottom: '1px solid #1b1b26',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                    <ImageIcon size={14} color="#8e8ea0" /> Assets
                  </span>
                  <button
                    type="button"
                    onClick={() => setLeftTab(null)}
                    style={{
                      background: 0,
                      border: 0,
                      color: '#7e7e90',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Search assets"
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#13131c',
                      border: '1px solid #232332',
                      borderRadius: '7px',
                      padding: '6px 10px',
                      color: '#e8e8ee',
                      fontSize: '12px',
                    }}
                  />

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      background: '#13131c',
                      borderRadius: '7px',
                      padding: '2px',
                      border: '1px solid #20202e',
                    }}
                  >
                    {(
                      [
                        { id: 'all', label: `All ${assetStats.assets.length}` },
                        { id: 'used', label: `Used ${assetStats.usedCount}` },
                        { id: 'unused', label: `Unused ${assetStats.unusedCount}` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setAssetFilter(tab.id)}
                        style={{
                          padding: '4px 4px',
                          borderRadius: '5px',
                          border: 0,
                          background: assetFilter === tab.id ? '#222232' : 'transparent',
                          color: assetFilter === tab.id ? '#f0f0f7' : '#808092',
                          fontWeight: assetFilter === tab.id ? 600 : 400,
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      color: '#727284',
                      fontSize: '11px',
                      padding: '2px 2px 0',
                    }}
                  >
                    <span>{filteredAssets.length} assets</span>
                    <button
                      type="button"
                      onClick={handlePurgeUnusedAssets}
                      title="Purge unused assets"
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: assetStats.unusedCount > 0 ? '#f87171' : '#727284',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        padding: '2px 4px',
                      }}
                    >
                      <Trash2 size={11} /> {assetStats.unusedCount}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '0 10px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  {filteredAssets.map((a) => {
                    const th = thumbs[a.key];
                    const isSelected = selectedAssetKey === a.key;
                    return (
                      <div
                        key={a.key}
                        onClick={() => {
                          setSelectedAssetKey(a.key);
                          // Select the first non-deleted sprite layer that uses this asset
                          const firstSpriteIdx = movie.sp.findIndex(
                            (s, idx) => s.key === a.key && !deletedSpriteIndices.has(idx)
                          );
                          if (firstSpriteIdx >= 0) {
                            setSelectedTarget(`sprite_${firstSpriteIdx}`);
                            const spSpan = computeSpriteFrameSpan(
                              movie.sp[firstSpriteIdx],
                              totalFrames
                            );
                            if (
                              currentFrame < spSpan.firstFrame ||
                              currentFrame > spSpan.lastFrame
                            ) {
                              setCurrentFrame(spSpan.firstFrame);
                            }
                          } else {
                            setSelectedTarget(a.key);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px',
                          borderRadius: '8px',
                          background: isSelected ? '#1d1d2b' : '#13131b',
                          border: isSelected ? '1px solid #7c5cff' : '1px solid #1e1e2a',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          title="عرض الصورة بوضوح"
                          style={{
                            width: '54px',
                            height: '54px',
                            borderRadius: '6px',
                            background:
                              'repeating-conic-gradient(#22222c 0 25%, #17171f 0 50%) 0 0 / 10px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '3px',
                            overflow: 'hidden',
                            flexShrink: 0,
                            border: '1px solid rgba(255,255,255,0.12)',
                          }}
                        >
                          {th && (
                            <img
                              src={th.url}
                              alt={a.key}
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                            />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: '#f0f0f6',
                              fontSize: '12px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {a.key}
                          </div>
                          <div style={{ color: '#7c7c8e', fontSize: '10px', marginTop: '1px' }}>
                            {a.format} · {a.sizeLabel} ·{' '}
                            {th ? `${th.w} x ${th.h}` : `${canvasW} x ${canvasH}`}
                          </div>
                          <div style={{ color: '#68687a', fontSize: '10px', marginTop: '1px' }}>
                            {a.usedByLabel}
                          </div>
                        </div>
                        <span
                          style={{
                            minWidth: '20px',
                            height: '20px',
                            borderRadius: '99px',
                            background: '#1c1c28',
                            border: '1px solid #2b2b3c',
                            color: '#a0a0b2',
                            fontSize: '10px',
                            display: 'grid',
                            placeItems: 'center',
                            padding: '0 6px',
                          }}
                        >
                          {a.usageCount}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* TAB 3: SHAPES & OBJECTS */}
            {leftTab === 'shapes' && (
              <>
                <div
                  style={{
                    height: '40px',
                    padding: '0 12px',
                    borderBottom: '1px solid #1b1b26',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                    <Shapes size={14} color="#8e8ea0" /> Shapes & Objects
                  </span>
                  <button
                    type="button"
                    onClick={() => setLeftTab(null)}
                    style={{
                      background: 0,
                      border: 0,
                      color: '#7e7e90',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div
                  style={{
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    overflowY: 'auto',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Search objects..."
                    value={shapeSearch}
                    onChange={(e) => setShapeSearch(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#13131c',
                      border: '1px solid #232332',
                      borderRadius: '7px',
                      padding: '6px 10px',
                      color: '#e8e8ee',
                      fontSize: '12px',
                    }}
                  />

                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        color: '#d0d0dc',
                        marginBottom: '8px',
                        fontSize: '12px',
                      }}
                    >
                      Add Decomposed Vector / Text Layer
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '8px',
                      }}
                    >
                      {(
                        [
                          { type: 'rectangle', label: 'Rectangle', Icon: Square },
                          { type: 'ellipse', label: 'Ellipse', Icon: Circle },
                          { type: 'polygon', label: 'Polygon', Icon: Hexagon },
                        ] as const
                      ).map((s) => {
                        const IconComp = s.Icon;
                        return (
                          <button
                            key={s.type}
                            type="button"
                            onClick={() => handleAddShape(s.type)}
                            style={{
                              padding: '12px 8px',
                              borderRadius: '8px',
                              border: '1px solid #222230',
                              background: '#13131c',
                              color: '#e0e0ea',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                              fontSize: '11px',
                            }}
                          >
                            <IconComp size={18} color="#c8c8d8" />
                            <span>{s.label}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setNewTextModalOpen(true)}
                        style={{
                          padding: '12px 8px',
                          borderRadius: '8px',
                          border: '1px solid #222230',
                          background: '#13131c',
                          color: '#e0e0ea',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          fontSize: '11px',
                        }}
                      >
                        <Type size={18} color="#c8c8d8" />
                        <span>Text Layer</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 600,
                        color: '#d0d0dc',
                        marginBottom: '8px',
                        fontSize: '12px',
                      }}
                    >
                      <span>Objects</span>
                      <span style={{ color: '#727284' }}>{filteredShapes.length}</span>
                    </div>
                    {filteredShapes.length === 0 ? (
                      <div
                        style={{
                          border: '1px dashed #232332',
                          borderRadius: '8px',
                          padding: '18px 12px',
                          textAlign: 'center',
                          color: '#727284',
                          fontSize: '11px',
                        }}
                      >
                        No shape or text objects yet. Click any shape above to add a decomposed layer.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {filteredShapes.map((sh) => (
                          <div
                            key={sh.id}
                            onClick={() => {
                              setSelectedTarget(sh.id);
                              setSelectedAssetKey(null);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 10px',
                              borderRadius: '7px',
                              background: selectedTarget === sh.id ? '#1d1d2d' : '#14141d',
                              border:
                                selectedTarget === sh.id
                                  ? '1px solid #7c5cff'
                                  : '1px solid #232332',
                              cursor: 'pointer',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input
                                type="color"
                                value={sh.color}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  setShapes((prev) =>
                                    prev.map((x) =>
                                      x.id === sh.id ? { ...x, color: e.target.value } : x
                                    )
                                  )
                                }
                                style={{ width: '18px', height: '18px', border: 0, padding: 0 }}
                              />
                              <span>{sh.name}</span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLayer(sh.id);
                              }}
                              style={{
                                background: 0,
                                border: 0,
                                color: '#f87171',
                                cursor: 'pointer',
                              }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* TAB 4: AE SCRIPT & SIGNALS */}
            {leftTab === 'signals' && (
              <>
                <div
                  style={{
                    height: '40px',
                    padding: '0 12px',
                    borderBottom: '1px solid #1b1b26',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                    <GitCommitHorizontal size={14} color="#a78bfa" /> AE Script & Signals
                  </span>
                  <button
                    type="button"
                    onClick={() => setLeftTab(null)}
                    style={{
                      background: 0,
                      border: 0,
                      color: '#7e7e90',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      background: '#14141f',
                      border: '1px solid #28283c',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#e8e8ee' }}>
                      After Effects Decomposed SVGA Bridge
                    </div>
                    <div style={{ color: '#8e8ea0', fontSize: '11px', lineHeight: 1.4 }}>
                      Export this composition ({canvasW}×{canvasH}, {fps} fps, {totalFrames} frames,{' '}
                      {spriteLayers.length + addedLayers.length + shapes.length} layers) as an Adobe
                      After Effects ExtendScript (.jsx) panel.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={handleDownloadAeScript}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '7px',
                          border: '1px solid #7c5cff',
                          background: '#7c5cff',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        <Download size={13} />
                        <span>Download AE Script (.jsx)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => (window as any).__openAeScriptModal?.()}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '7px',
                          border: '1px solid rgba(168, 85, 247, 0.65)',
                          background:
                            'linear-gradient(135deg, rgba(147, 51, 234, 0.35), rgba(79, 70, 229, 0.35))',
                          color: '#f5f3ff',
                          fontWeight: 700,
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                        title="فتح أداة إنشاء سكريبت وحزمة After Effects المتكاملة"
                      >
                        <Sparkles size={12} className="text-[#facc15]" />
                        <span>سكريبت افتر افكت (حزمة شاملة JSX + Assets)</span>
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '4px',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Frame Signals ({signals.length})</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSignals((prev) => [
                          ...prev,
                          {
                            id: 'sig_' + (prev.length + 1),
                            frame: currentFrame,
                            label: `cue_${currentFrame}`,
                          },
                        ]);
                        setLastAction(`Added signal @ frame ${currentFrame}`);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        border: '1px solid #2a2a3c',
                        background: '#161622',
                        color: '#c4b5fd',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      + Add @ F{currentFrame}
                    </button>
                  </div>

                  {signals.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setCurrentFrame(s.frame)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        background: '#13131c',
                        border: '1px solid #222230',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      <span>
                        Frame {s.frame}: <b>{s.label}</b>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSignals((prev) => prev.filter((x) => x.id !== s.id));
                        }}
                        style={{ background: 0, border: 0, color: '#8e8ea0', cursor: 'pointer' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        )}

        {/* CENTER CANVAS STAGE */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#09090d',
            display: 'grid',
            placeItems: 'center',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              width: `${Math.round(Math.min(540, canvasW * 1.15) * (zoom / 100))}px`,
              height: `${Math.round(Math.min(540, canvasH * 1.15) * (zoom / 100))}px`,
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              background:
                'repeating-conic-gradient(#17171e 0 25%, #101015 0 50%) 0 0 / 28px 28px',
              border: '1px solid #1e1e2a',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.65)',
              position: 'relative',
            }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                cursor:
                  activeTool === 'Hand'
                    ? 'grab'
                    : activeTool === 'Zoom'
                      ? 'zoom-in'
                      : activeTool === 'Pen' || activeTool === 'Shape' || activeTool === 'Crop'
                        ? 'crosshair'
                        : 'move',
              }}
            />

            {isEmptyStage && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: '24px',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    color: '#a0a0b4',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  Decomposed SVGA 2.0 Stage ({canvasW} × {canvasH})
                </div>
                <div style={{ color: '#6e6e82', fontSize: '11px', maxWidth: '280px' }}>
                  Click <b>Open SVGA</b> (or drop an .svga file here) to inspect & edit all
                  decomposed layers, or click <b>Add image layer</b> / <b>Shape</b> to build from
                  scratch.
                </div>
              </div>
            )}
          </div>

          <SvgaCropAndContextMenu
            activeTool={activeTool}
            selectedTarget={selectedTarget}
            cropRect={cropRect}
            onApplyCropMode={handleApplyCropMode}
            onClearCropRect={() => setCropRect(null)}
            contextMenu={contextMenu}
            onCloseContextMenu={() => setContextMenu(null)}
            canUndo={historyIdx > 0}
            canRedo={historyIdx + 1 < history.length}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onActivateCropTool={() => {
              setActiveTool('Crop');
              setLastAction(
                'أداة القص والتحديد بالماوس مفعلة — اسحب مربع تحديد على الكانفاس لقص أو فصل جزء من الطبقة'
              );
            }}
            onActivateMoveTool={() => {
              setActiveTool('Move');
              setLastAction('أداة التحريك (Move) مفعلة');
            }}
            onAddKeyframeAtCurrentFrame={() => {
              if (!selectedTarget) return;
              handleTogglePropertyKeyframe(selectedTarget, 'all');
            }}
            onSendLayerBackward={handleSendLayerBackward}
            onBringLayerForward={handleBringLayerForward}
            onDeleteLayer={handleDeleteLayer}
            onDuplicateLayer={handleDuplicateLayer}
            onFlipLayerHorizontally={handleFlipLayerHorizontally}
            onOpenCopyMotionModal={(layerId) => {
              setCopyMotionSearch('');
              setCopyMotionModalLayerId(layerId);
            }}
          />

          <div
            style={{
              position: 'absolute',
              right: '16px',
              bottom: '14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#12121a',
              border: '1px solid #242434',
              borderRadius: '99px',
              padding: '4px 10px',
              fontSize: '11px',
              color: '#c8c8d8',
            }}
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(25, z - 25))}
              style={{ background: 0, border: 0, color: 'inherit', cursor: 'pointer' }}
            >
              −
            </button>
            <span style={{ minWidth: '34px', textAlign: 'center', fontWeight: 600 }}>{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(300, z + 25))}
              style={{ background: 0, border: 0, color: 'inherit', cursor: 'pointer' }}
            >
              +
            </button>
            <button
              type="button"
              title="Reset zoom & pan"
              onClick={() => {
                setZoom(100);
                setPan({ x: 0, y: 0 });
              }}
              style={{
                background: 0,
                border: 0,
                color: 'inherit',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        {/* RIGHT INSPECTOR PANEL (290px) */}
        <aside
          style={{
            width: '290px',
            minWidth: '290px',
            background: '#0d0d13',
            borderLeft: '1px solid #1b1b26',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '14px',
            gap: '14px',
          }}
        >
          {selectedTarget === 'GROUP_ALL' ||
          (selectedAssetKey && selectedAssetStat) ||
          selectedAddedLayer ||
          selectedShapeLayer ? (
            <>
              {selectedTarget === 'GROUP_ALL' ? (
                <>
                  {/* GROUP HEADER */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '7px',
                        background: 'rgba(124, 92, 255, 0.2)',
                        border: '1px solid rgba(139, 92, 246, 0.45)',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#c4b5fd',
                      }}
                    >
                      <Layers size={15} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: '#f2f2f8',
                          fontSize: '13px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        مجموعة كل الطبقات
                      </div>
                      <div style={{ color: '#a78bfa', fontSize: '11px' }}>
                        {movie.sp.length + addedLayers.length + shapes.length} طبقة موحدة · SVGA 2.0 أصلية
                      </div>
                    </div>
                    <button
                      type="button"
                      id="edInspectorUngroup"
                      onClick={handleToggleGroupAllLayers}
                      title="فك التجميع"
                      style={{
                        background: 'rgba(239, 68, 68, 0.14)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        color: '#fca5a5',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      فك التجميع
                    </button>
                  </div>

                  <div
                    style={{
                      background: 'rgba(124, 92, 255, 0.08)',
                      border: '1px solid rgba(139, 92, 246, 0.25)',
                      borderRadius: '7px',
                      padding: '8px 10px',
                      fontSize: '11px',
                      color: '#ddd6fe',
                      lineHeight: '1.45',
                    }}
                  >
                    تتحرك جميع الطبقات وتكبر وتصغر معاً عبر المقابض الأربعة على الكانفاس أو لوحة Transform أدناه دون التأثير على جودة الـ SVGA أو تحويلها لصور.
                  </div>
                </>
              ) : (
                <>
                  {/* LAYER HEADER */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: '#171722',
                        border: '1px solid #262636',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#a0a0b4',
                      }}
                    >
                      {selectedShapeLayer ? <Shapes size={14} /> : <ImageIcon size={14} />}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: '#f2f2f8',
                          fontSize: '13px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {selectedAddedLayer?.name ||
                          selectedShapeLayer?.name ||
                          selectedAssetStat?.key}
                      </div>
                      <div style={{ color: '#727284', fontSize: '11px' }}>
                        {selectedShapeLayer
                          ? `Decomposed ${selectedShapeLayer.type} layer`
                          : selectedAddedLayer
                            ? 'Added decomposed image layer'
                            : selectedTarget.startsWith('sprite_')
                              ? `Image layer · #${movie.sp.length - Number(selectedTarget.replace('sprite_', ''))}`
                              : 'Image layer'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteLayer(selectedTarget)}
                      title="Delete this layer"
                      style={{
                        background: 'rgba(248,113,113,0.12)',
                        border: '1px solid rgba(248,113,113,0.3)',
                        color: '#f87171',
                        borderRadius: '6px',
                        width: '26px',
                        height: '26px',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* QUICK CROP / SELECTION BUTTON FOR SELECTED LAYER */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTool((prev) => (prev === 'Crop' ? 'Move' : 'Crop'));
                      setLastAction(
                        'اسحب بالماوس على الطبقة في الكانفاس لتحديد جزء معين وقصه أو فصله في طبقة مستقلة متحركة'
                      );
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border:
                        activeTool === 'Crop' ? '1px solid #38bdf8' : '1px solid rgba(124,92,255,0.45)',
                      background:
                        activeTool === 'Crop'
                          ? 'rgba(56,189,248,0.18)'
                          : 'rgba(124,92,255,0.12)',
                      color: activeTool === 'Crop' ? '#7dd3fc' : '#c4b5fd',
                      fontWeight: 700,
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Scissors size={13} />
                    <span>
                      {activeTool === 'Crop'
                        ? 'اسحب بالماوس الآن لتحديد الجزء المراد قصه'
                        : 'تحديد وقص جزء من الطبقة بالماوس'}
                    </span>
                  </button>

                  {/* LAYER MOTION COPY, DUPLICATE & MIRROR (LEFT-TO-RIGHT) PANEL */}
                  <div
                    style={{
                      background: 'rgba(19, 19, 31, 0.9)',
                      border: '1px solid #252538',
                      borderRadius: '9px',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '7px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>⚡ أدوات الطبقة والأنيميشن</span>
                      <span style={{ fontSize: '9.5px', color: '#94a3b8', fontWeight: 500 }}>
                        نسخ · عكس · حركة
                      </span>
                    </div>

                    {selectedAddedLayer && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <button
                          type="button"
                          id="edInspectorCopyMotionBtn"
                          onClick={() => {
                            setCopyMotionSearch('');
                            setCopyMotionModalLayerId(selectedAddedLayer.id);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: '7px',
                            border: '1px solid rgba(245, 158, 11, 0.5)',
                            background: 'linear-gradient(135deg, rgba(245,158,11,0.22), rgba(217,119,6,0.14))',
                            color: '#fde68a',
                            fontWeight: 700,
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          <Clapperboard size={13} />
                          <span>🎬 اختر طبقة من SVGA لأخذ نفس الحركة والفريمات</span>
                        </button>

                        {selectedAddedLayer.copiedFromKey && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '6px',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              background: 'rgba(16, 185, 129, 0.12)',
                              border: '1px solid rgba(16, 185, 129, 0.35)',
                              fontSize: '10.5px',
                              color: '#6ee7b7',
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ✓ مرتبطة بحركة: <b>{selectedAddedLayer.copiedFromKey}</b>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleClearCopiedMotionFromAddedLayer(selectedAddedLayer.id)}
                              style={{
                                background: 'rgba(239,68,68,0.18)',
                                border: '1px solid rgba(239,68,68,0.4)',
                                color: '#fca5a5',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                fontSize: '9.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              إلغاء الحركة
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <button
                        type="button"
                        id="edInspectorDuplicateBtn"
                        onClick={() => handleDuplicateLayer(selectedTarget, 'none')}
                        title="نسخ طبقة ثانية بنفس الحركة والفريمات"
                        style={{
                          padding: '7px 8px',
                          borderRadius: '7px',
                          border: selectedAddedLayer?.shineConfig?.enabled
                            ? '1px solid rgba(245, 158, 11, 0.5)'
                            : '1px solid #28283a',
                          background: selectedAddedLayer?.shineConfig?.enabled
                            ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.14))'
                            : '#14141e',
                          color: selectedAddedLayer?.shineConfig?.enabled ? '#fde68a' : '#e8e8ee',
                          fontWeight: 700,
                          fontSize: '10.5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                        }}
                      >
                        <CopyPlus size={12} color={selectedAddedLayer?.shineConfig?.enabled ? '#fbbf24' : '#e8e8ee'} />
                        <span>نسخ طبقة ثانية</span>
                      </button>

                      <button
                        type="button"
                        id="edInspectorDuplicateMirrorBtn"
                        onClick={() => handleDuplicateLayer(selectedTarget, 'canvas')}
                        title="نسخ الطبقة وعكسها من الشمال لليمين عبر الكانفاس"
                        style={{
                          padding: '7px 8px',
                          borderRadius: '7px',
                          border: selectedAddedLayer?.shineConfig?.enabled
                            ? '1px solid rgba(245, 158, 11, 0.5)'
                            : '1px solid #28283a',
                          background: selectedAddedLayer?.shineConfig?.enabled
                            ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.14))'
                            : '#14141e',
                          color: selectedAddedLayer?.shineConfig?.enabled ? '#fde68a' : '#e8e8ee',
                          fontWeight: 700,
                          fontSize: '10.5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                        }}
                      >
                        <FlipHorizontal2 size={12} color={selectedAddedLayer?.shineConfig?.enabled ? '#fbbf24' : '#e8e8ee'} />
                        <span>نسخ وعكس (شمال↔يمين)</span>
                      </button>
                    </div>

                      <button
                        type="button"
                        id="edInspectorFlipInPlaceBtn"
                        onClick={() => handleFlipLayerHorizontally(selectedTarget, 'canvas')}
                        title="عكس الطبقة الحالية نفسها من الشمال لليمين"
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '7px',
                          border: selectedAddedLayer?.shineConfig?.enabled
                            ? '1px solid rgba(245, 158, 11, 0.4)'
                            : '1px solid #28283a',
                          background: selectedAddedLayer?.shineConfig?.enabled
                            ? 'rgba(245, 158, 11, 0.12)'
                            : '#14141e',
                          color: selectedAddedLayer?.shineConfig?.enabled ? '#fde68a' : '#e8e8ee',
                          fontWeight: 600,
                          fontSize: '10.5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                        }}
                      >
                        <FlipHorizontal2 size={12} color={selectedAddedLayer?.shineConfig?.enabled ? '#fbbf24' : '#e8e8ee'} />
                        <span>↔️ عكس الطبقة الحالية من الشمال لليمين</span>
                      </button>

                      {/* ✨ زر إضافة لمعة احترافية على الطبقة الحالية أو تحويل طبقة قناع إلى لمعة */}
                      {!selectedAddedLayer?.shineConfig?.enabled && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '2px' }}>
                          <button
                            type="button"
                            id="edInspectorAddShineBtn"
                            onClick={() => handleCreateShineLayer(selectedTarget)}
                            title="استدعاء طبقة لمعة احترافية مع نقاط القناع ومسار الحركة فوق هذه الطبقة (مثل إطار الهند)"
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid rgba(251, 191, 36, 0.65)',
                              background: 'linear-gradient(135deg, rgba(245,158,11,0.28), rgba(217,119,6,0.18))',
                              color: '#fef08a',
                              fontWeight: 800,
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              boxShadow: '0 2px 10px rgba(245, 158, 11, 0.16)',
                            }}
                          >
                            <Sparkles size={13} color="#fbbf24" />
                            <span>✨ إضافة طبقة لمعة احترافية على هذه الطبقة (Shine)</span>
                          </button>

                          {selectedTarget.startsWith('sprite_') &&
                            movie.sp[Number(selectedTarget.replace('sprite_', ''))]?.fr?.some(
                              (fr: any) => fr && typeof fr.clipPath === 'string' && fr.clipPath.trim().length > 0
                            ) && (
                              <button
                                type="button"
                                id="edInspectorConvertClipSpriteToShineBtn"
                                onClick={() =>
                                  handleConvertExistingSpriteToShineLayer(
                                    Number(selectedTarget.replace('sprite_', ''))
                                  )
                                }
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: '7px',
                                  border: '1px solid rgba(56, 189, 248, 0.5)',
                                  background: 'rgba(14, 165, 233, 0.16)',
                                  color: '#bae6fd',
                                  fontWeight: 700,
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '5px',
                                }}
                              >
                                <Sparkles size={11} />
                                <span>🎯 استخراج نقاط القناع واللمعة من هذه الطبقة لتعديلها</span>
                              </button>
                            )}
                        </div>
                      )}
                    </div>

                    {/* ✨ لوحة استوديو اللمعة الاحترافية بالنقاط عند اختيار طبقة لمعة */}
                    {selectedAddedLayer?.shineConfig?.enabled && (
                      <SvgaShineStudioPanel
                        shineLayerId={selectedAddedLayer.id}
                        shineLayerName={selectedAddedLayer.name}
                        shineThumbUrl={selectedAddedLayer.dataUrl}
                        config={selectedAddedLayer.shineConfig}
                        editSubmode={shineEditSubmode}
                        onChangeEditSubmode={(mode) => {
                          setShineEditSubmode(mode);
                          if (mode !== 'none') setActiveTool('Shine');
                        }}
                        targetOptions={shineTargetOptions}
                        svgaAssetKeys={Object.keys(thumbs)}
                        totalFrames={totalFrames}
                        onUpdateConfig={(patch, options) =>
                          handleUpdateShineConfig(selectedAddedLayer.id, patch, options)
                        }
                        onAutoTraceTargetLayer={(targetId) =>
                          handleAutoTraceShineTarget(selectedAddedLayer.id, targetId)
                        }
                        onApplyPresetMask={(preset) =>
                          handleApplyShinePresetMask(selectedAddedLayer.id, preset)
                        }
                        onRemoveLastMaskPoint={() =>
                          handleRemoveLastShineMaskPoint(selectedAddedLayer.id)
                        }
                        onApplyMotionDirection={(dir) =>
                          handleApplyShineMotionDirection(selectedAddedLayer.id, dir)
                        }
                        onAddMotionMidpoint={() =>
                          handleAddShineMotionMidpoint(selectedAddedLayer.id)
                        }
                        onRemoveLastMotionPoint={() =>
                          handleRemoveLastShineMotionPoint(selectedAddedLayer.id)
                        }
                        onUploadCustomShineImage={(file) =>
                          handleUploadCustomShineImage(selectedAddedLayer.id, file)
                        }
                        onSelectSvgaAssetAsShineImage={(assetKey) =>
                          handleSelectSvgaAssetAsShineImage(selectedAddedLayer.id, assetKey)
                        }
                        onTriggerPlayPreview={() => {
                          setCurrentFrame(selectedAddedLayer.shineConfig?.startFrame || 0);
                          setPlaying(true);
                        }}
                      />
                    )}
                  </>
                )}

              {/* IMAGE ASSET SECTION (for SVGA Sprite Layers) */}
              {selectedAssetStat && (
                <div style={{ borderTop: '1px solid #1b1b26', paddingTop: '12px' }}>
                  <div style={{ fontWeight: 700, color: '#e8e8ee', marginBottom: '10px' }}>
                    Image
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        background:
                          'repeating-conic-gradient(#d8d8e0 0 25%, #ffffff 0 50%) 0 0 / 10px 10px',
                        display: 'grid',
                        placeItems: 'center',
                        overflow: 'hidden',
                        border: '1px solid #2a2a3a',
                        flexShrink: 0,
                      }}
                    >
                      {thumbs[selectedAssetStat.key] && (
                        <img
                          src={thumbs[selectedAssetStat.key].url}
                          alt={selectedAssetStat.key}
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        />
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#f2f2f8' }}>
                        {selectedAssetStat.key}
                      </div>
                      <div style={{ color: '#7e7e90', fontSize: '11px' }}>
                        {thumbs[selectedAssetStat.key]?.w || canvasW} x{' '}
                        {thumbs[selectedAssetStat.key]?.h || canvasH} · {selectedAssetStat.format} ·{' '}
                        {selectedAssetStat.sizeLabel}
                      </div>
                      <div style={{ color: '#60a5fa', fontSize: '11px', marginTop: '2px' }}>
                        {selectedAssetStat.usageCount}{' '}
                        {selectedAssetStat.usageCount === 1 ? 'layer uses' : 'layers use'} this
                        asset
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <span style={{ color: '#8e8ea0', fontSize: '11px' }}>Apply to</span>
                    <select
                      value={applyScope}
                      onChange={(e) => setApplyScope(e.target.value as 'current' | 'all')}
                      style={{
                        width: '175px',
                        background: '#14141e',
                        border: '1px solid #252536',
                        borderRadius: '7px',
                        padding: '5px 8px',
                        color: '#e8e8ee',
                        fontSize: '11px',
                      }}
                    >
                      <option value="current">Current layer</option>
                      <option value="all">All layers using this asset</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => replaceImgInputRef.current?.click()}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '8px',
                      border: '1px solid #262638',
                      background: '#14141e',
                      color: '#e8e8ee',
                      fontWeight: 500,
                      cursor: 'pointer',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <ImageIcon size={13} />
                    <span>Replace image</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditModalKey(selectedAssetStat.key);
                      setEditText('');
                      setEditShowImage(true);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '8px',
                      border: '1px solid #7c5cff',
                      background: '#7c5cff',
                      color: '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Pencil size={13} />
                    <span>Edit image</span>
                  </button>
                </div>
              )}

              {/* SHAPE / TEXT PROPERTIES (if shape or text layer selected) */}
              {selectedShapeLayer && (
                <div style={{ borderTop: '1px solid #1b1b26', paddingTop: '12px' }}>
                  <div style={{ fontWeight: 700, color: '#e8e8ee', marginBottom: '10px' }}>
                    {selectedShapeLayer.type === 'text' ? 'Text Layer Properties' : 'Shape Style'}
                  </div>
                  {selectedShapeLayer.type === 'text' && (
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ color: '#8e8ea0', fontSize: '11px' }}>Text Content</span>
                      <input
                        type="text"
                        value={selectedShapeLayer.text || ''}
                        onChange={(e) =>
                          setShapes((prev) =>
                            prev.map((s) =>
                              s.id === selectedShapeLayer.id
                                ? { ...s, text: e.target.value, name: `Text: ${e.target.value}` }
                                : s
                            )
                          )
                        }
                        style={{
                          width: '100%',
                          marginTop: '4px',
                          background: '#14141e',
                          border: '1px solid #242434',
                          borderRadius: '6px',
                          padding: '5px 8px',
                        }}
                      />
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <span style={{ color: '#8e8ea0', fontSize: '11px' }}>Fill Color</span>
                      <input
                        type="color"
                        value={selectedShapeLayer.color}
                        onChange={(e) =>
                          setShapes((prev) =>
                            prev.map((s) =>
                              s.id === selectedShapeLayer.id ? { ...s, color: e.target.value } : s
                            )
                          )
                        }
                        style={{ width: '100%', height: '28px', marginTop: '4px' }}
                      />
                    </div>
                    <div>
                      <span style={{ color: '#8e8ea0', fontSize: '11px' }}>Stroke Color</span>
                      <input
                        type="color"
                        value={selectedShapeLayer.strokeColor}
                        onChange={(e) =>
                          setShapes((prev) =>
                            prev.map((s) =>
                              s.id === selectedShapeLayer.id
                                ? { ...s, strokeColor: e.target.value }
                                : s
                            )
                          )
                        }
                        style={{ width: '100%', height: '28px', marginTop: '4px' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TRANSFORM SECTION */}
              <div style={{ borderTop: '1px solid #1b1b26', paddingTop: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#e8e8ee' }}>
                    Transform · المقاسات والأبعاد
                  </span>
                  <button
                    type="button"
                    onClick={() => setScaleLinked((prev) => !prev)}
                    title={
                      scaleLinked
                        ? 'فك ربط العرض والارتفاع (تحكم حر في كل بُعد)'
                        : 'ربط نسبة العرض والارتفاع معاً'
                    }
                    style={{
                      background: scaleLinked ? 'rgba(124, 92, 255, 0.2)' : '#14141e',
                      border: scaleLinked ? '1px solid #7c5cff' : '1px solid #28283a',
                      color: scaleLinked ? '#c4b5fd' : '#94a3b8',
                      borderRadius: '5px',
                      padding: '2px 7px',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {scaleLinked ? '🔗 متناسق' : '🔓 أبعاد حرة'}
                  </button>
                </div>

                {/* DIRECT PIXEL DIMENSIONS (W x H px) FOR ADDED OR SELECTED LAYER */}
                {(() => {
                  const baseW = selectedAddedLayer
                    ? selectedAddedLayer.width
                    : selectedShapeLayer
                      ? selectedShapeLayer.w
                      : selectedAssetKey && thumbs[selectedAssetKey]
                        ? thumbs[selectedAssetKey].w
                        : canvasW;
                  const baseH = selectedAddedLayer
                    ? selectedAddedLayer.height
                    : selectedShapeLayer
                      ? selectedShapeLayer.h
                      : selectedAssetKey && thumbs[selectedAssetKey]
                        ? thumbs[selectedAssetKey].h
                        : canvasH;
                  const zoomFactor = (activeLayerTransform.zoom ?? 100) / 100;
                  const curPixelW = Math.max(
                    1,
                    Math.round((baseW * Math.abs(activeLayerTransform.sx) * zoomFactor) / 100)
                  );
                  const curPixelH = Math.max(
                    1,
                    Math.round((baseH * Math.abs(activeLayerTransform.sy) * zoomFactor) / 100)
                  );
                  const signX = activeLayerTransform.sx < 0 ? -1 : 1;
                  const signY = activeLayerTransform.sy < 0 ? -1 : 1;

                  return (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        marginBottom: '8px',
                        padding: '7px 8px',
                        borderRadius: '7px',
                        background: 'rgba(124, 92, 255, 0.07)',
                        border: '1px solid rgba(124, 92, 255, 0.25)',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '52px 1fr 1fr',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span style={{ color: '#c4b5fd', fontSize: '10.5px', fontWeight: 700 }}>
                          الأبعاد px
                        </span>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: '#14141e',
                            border: '1px solid #2b2b40',
                            borderRadius: '6px',
                            padding: '0 6px',
                          }}
                        >
                          <span style={{ color: '#a78bfa', fontSize: '10px', marginRight: '4px' }}>
                            W
                          </span>
                          <input
                            id="edInspectorPixelWidthInput"
                            type="number"
                            min="1"
                            max="4096"
                            aria-label="Layer width in pixels"
                            value={curPixelW}
                            onChange={(e) => {
                              const targetW = Math.max(1, Number(e.target.value) || 1);
                              const newSx =
                                signX * Number(((targetW / Math.max(1, baseW)) * 100).toFixed(2));
                              if (scaleLinked) {
                                const ratio = targetW / Math.max(1, curPixelW);
                                const newSy =
                                  signY *
                                  Number(
                                    (Math.abs(activeLayerTransform.sy) * ratio).toFixed(2)
                                  );
                                updateActiveTransform(
                                  { sx: newSx, sy: newSy },
                                  `تحديد عرض الطبقة ${targetW}px`
                                );
                              } else {
                                updateActiveTransform(
                                  { sx: newSx },
                                  `تحديد عرض الطبقة ${targetW}px`
                                );
                              }
                            }}
                            style={{
                              border: 0,
                              background: 'transparent',
                              padding: '4px 0',
                              textAlign: 'right',
                              width: '100%',
                            }}
                          />
                          <span style={{ color: '#6e6e80', fontSize: '9.5px', marginLeft: '2px' }}>
                            px
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: '#14141e',
                            border: '1px solid #2b2b40',
                            borderRadius: '6px',
                            padding: '0 6px',
                          }}
                        >
                          <span style={{ color: '#a78bfa', fontSize: '10px', marginRight: '4px' }}>
                            H
                          </span>
                          <input
                            id="edInspectorPixelHeightInput"
                            type="number"
                            min="1"
                            max="4096"
                            aria-label="Layer height in pixels"
                            value={curPixelH}
                            onChange={(e) => {
                              const targetH = Math.max(1, Number(e.target.value) || 1);
                              const newSy =
                                signY * Number(((targetH / Math.max(1, baseH)) * 100).toFixed(2));
                              if (scaleLinked) {
                                const ratio = targetH / Math.max(1, curPixelH);
                                const newSx =
                                  signX *
                                  Number(
                                    (Math.abs(activeLayerTransform.sx) * ratio).toFixed(2)
                                  );
                                updateActiveTransform(
                                  { sx: newSx, sy: newSy },
                                  `تحديد ارتفاع الطبقة ${targetH}px`
                                );
                              } else {
                                updateActiveTransform(
                                  { sy: newSy },
                                  `تحديد ارتفاع الطبقة ${targetH}px`
                                );
                              }
                            }}
                            style={{
                              border: 0,
                              background: 'transparent',
                              padding: '4px 0',
                              textAlign: 'right',
                              width: '100%',
                            }}
                          />
                          <span style={{ color: '#6e6e80', fontSize: '9.5px', marginLeft: '2px' }}>
                            px
                          </span>
                        </div>
                      </div>

                      {selectedAddedLayer && (
                        <button
                          type="button"
                          id="edBakeDimensionsBtn"
                          onClick={() => handleBakeAddedLayerDimensions(selectedAddedLayer.id)}
                          style={{
                            width: '100%',
                            padding: '5px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(16, 185, 129, 0.45)',
                            background: 'rgba(16, 185, 129, 0.14)',
                            color: '#6ee7b7',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                          }}
                        >
                          <Check size={12} />
                          <span>
                            📌 تثبيت المقاسات والأبعاد الحالية ({curPixelW}×{curPixelH}px)
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })()}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '56px 1fr 1fr 22px',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                  }}
                >
                  <span style={{ color: '#8e8ea0', fontSize: '11px' }}>Position</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#14141e',
                      border: '1px solid #242434',
                      borderRadius: '6px',
                      padding: '0 6px',
                    }}
                  >
                    <span style={{ color: '#6e6e80', fontSize: '10px', marginRight: '4px' }}>
                      X
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      value={activeLayerTransform.x}
                      onChange={(e) =>
                        updateActiveTransform({ x: Number(e.target.value) }, 'Updated Position X')
                      }
                      style={{
                        border: 0,
                        background: 'transparent',
                        padding: '4px 0',
                        textAlign: 'right',
                        width: '100%',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#14141e',
                      border: '1px solid #242434',
                      borderRadius: '6px',
                      padding: '0 6px',
                    }}
                  >
                    <span style={{ color: '#6e6e80', fontSize: '10px', marginRight: '4px' }}>
                      Y
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      value={activeLayerTransform.y}
                      onChange={(e) =>
                        updateActiveTransform({ y: Number(e.target.value) }, 'Updated Position Y')
                      }
                      style={{
                        border: 0,
                        background: 'transparent',
                        padding: '4px 0',
                        textAlign: 'right',
                        width: '100%',
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    title="إضافة / حذف نقطة تحريك (Keyframe) لـ Position"
                    onClick={() => handleTogglePropertyKeyframe(selectedTarget, 'position')}
                    style={{
                      background:
                        layerKeyframes[selectedTarget]?.position?.[currentFrame] !== undefined
                          ? 'rgba(245,158,11,0.18)'
                          : 'transparent',
                      border:
                        layerKeyframes[selectedTarget]?.position?.[currentFrame] !== undefined
                          ? '1px solid #f59e0b'
                          : '1px solid #2a2a3c',
                      borderRadius: '4px',
                      width: '20px',
                      height: '20px',
                      display: 'grid',
                      placeItems: 'center',
                      color:
                        layerKeyframes[selectedTarget]?.position?.[currentFrame] !== undefined
                          ? '#fbbf24'
                          : '#7e7e90',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <Diamond size={11} />
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '56px 1fr 1fr 22px',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                  }}
                >
                  <span style={{ color: '#8e8ea0', fontSize: '11px' }}>Scale</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#14141e',
                      border: '1px solid #242434',
                      borderRadius: '6px',
                      padding: '0 6px',
                    }}
                  >
                    <span style={{ color: '#6e6e80', fontSize: '10px', marginRight: '4px' }}>
                      SX
                    </span>
                    <input
                      type="number"
                      value={activeLayerTransform.sx}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        updateActiveTransform(
                          scaleLinked ? { sx: v, sy: v } : { sx: v },
                          'Updated Scale'
                        );
                      }}
                      style={{
                        border: 0,
                        background: 'transparent',
                        padding: '4px 0',
                        textAlign: 'right',
                        width: '100%',
                      }}
                    />
                    <span style={{ color: '#6e6e80', fontSize: '10px', marginLeft: '2px' }}>%</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#14141e',
                      border: '1px solid #242434',
                      borderRadius: '6px',
                      padding: '0 6px',
                    }}
                  >
                    <span style={{ color: '#6e6e80', fontSize: '10px', marginRight: '4px' }}>
                      SY
                    </span>
                    <input
                      type="number"
                      value={activeLayerTransform.sy}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        updateActiveTransform(
                          scaleLinked ? { sx: v, sy: v } : { sy: v },
                          'Updated Scale'
                        );
                      }}
                      style={{
                        border: 0,
                        background: 'transparent',
                        padding: '4px 0',
                        textAlign: 'right',
                        width: '100%',
                      }}
                    />
                    <span style={{ color: '#6e6e80', fontSize: '10px', marginLeft: '2px' }}>%</span>
                  </div>
                  <button
                    type="button"
                    title="إضافة / حذف نقطة تحريك (Keyframe) لـ Scale"
                    onClick={() => handleTogglePropertyKeyframe(selectedTarget, 'scale')}
                    style={{
                      background:
                        layerKeyframes[selectedTarget]?.scale?.[currentFrame] !== undefined
                          ? 'rgba(245,158,11,0.18)'
                          : 'transparent',
                      border:
                        layerKeyframes[selectedTarget]?.scale?.[currentFrame] !== undefined
                          ? '1px solid #f59e0b'
                          : '1px solid #2a2a3c',
                      borderRadius: '4px',
                      width: '20px',
                      height: '20px',
                      display: 'grid',
                      placeItems: 'center',
                      color:
                        layerKeyframes[selectedTarget]?.scale?.[currentFrame] !== undefined
                          ? '#fbbf24'
                          : '#7e7e90',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <Diamond size={11} />
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '56px 1fr 22px',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                  }}
                >
                  <span style={{ color: '#8e8ea0', fontSize: '11px' }}>Rotation</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#14141e',
                      border: '1px solid #242434',
                      borderRadius: '6px',
                      padding: '0 6px',
                    }}
                  >
                    <span style={{ color: '#6e6e80', fontSize: '10px', marginRight: '4px' }}>
                      R
                    </span>
                    <input
                      type="number"
                      value={activeLayerTransform.rotation}
                      onChange={(e) =>
                        updateActiveTransform(
                          { rotation: Number(e.target.value) },
                          'Updated Rotation'
                        )
                      }
                      style={{
                        border: 0,
                        background: 'transparent',
                        padding: '4px 0',
                        textAlign: 'right',
                        width: '100%',
                      }}
                    />
                    <span style={{ color: '#6e6e80', fontSize: '10px', marginLeft: '4px' }}>
                      deg
                    </span>
                  </div>
                  <button
                    type="button"
                    title="إضافة / حذف نقطة تحريك (Keyframe) لـ Rotation"
                    onClick={() => handleTogglePropertyKeyframe(selectedTarget, 'rotation')}
                    style={{
                      background:
                        layerKeyframes[selectedTarget]?.rotation?.[currentFrame] !== undefined
                          ? 'rgba(245,158,11,0.18)'
                          : 'transparent',
                      border:
                        layerKeyframes[selectedTarget]?.rotation?.[currentFrame] !== undefined
                          ? '1px solid #f59e0b'
                          : '1px solid #2a2a3c',
                      borderRadius: '4px',
                      width: '20px',
                      height: '20px',
                      display: 'grid',
                      placeItems: 'center',
                      color:
                        layerKeyframes[selectedTarget]?.rotation?.[currentFrame] !== undefined
                          ? '#fbbf24'
                          : '#7e7e90',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <Diamond size={11} />
                  </button>
                </div>

                {/* UNIFORM ZOOM / SCALE WITHOUT STRETCHING (تكبير وتصغير الطبقة بدون مط + بوينت Keyframe) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '56px 1fr 22px',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span
                    title="تكبير وتصغير الطبقة بشكل متناسق من دون مط"
                    style={{
                      color: '#c4b5fd',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      lineHeight: 1.15,
                    }}
                  >
                    Zoom
                    <small style={{ display: 'block', color: '#8e8ea0', fontSize: '9px', fontWeight: 400 }}>
                      بدون مط
                    </small>
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#14141e',
                      border: '1px solid rgba(192, 132, 252, 0.35)',
                      borderRadius: '6px',
                      padding: '0 6px',
                      minWidth: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        color: '#c084fc',
                        fontSize: '10px',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      Z
                    </span>
                    <input
                      id="edInspectorUniformZoomSlider"
                      type="range"
                      min="10"
                      max="300"
                      step="1"
                      aria-label="Uniform layer zoom slider without stretching"
                      value={Math.min(300, Math.max(10, Math.round(activeLayerTransform.zoom ?? 100)))}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        updateActiveTransform(
                          computeUnstretchedZoomPatch(activeLayerTransform, v),
                          `تكبير/تصغير بدون مط (${v}%)`
                        );
                      }}
                      style={{
                        flex: 1,
                        width: '100%',
                        minWidth: 0,
                        accentColor: '#c084fc',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      id="edInspectorUniformZoomInput"
                      type="number"
                      min="1"
                      max="1000"
                      step="1"
                      aria-label="Uniform layer zoom percentage without stretching"
                      value={activeLayerTransform.zoom ?? 100}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        updateActiveTransform(
                          computeUnstretchedZoomPatch(activeLayerTransform, v),
                          `تكبير/تصغير بدون مط (${v}%)`
                        );
                      }}
                      style={{
                        border: 0,
                        background: 'transparent',
                        padding: '4px 0',
                        textAlign: 'right',
                        width: '36px',
                        minWidth: 0,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: '#6e6e80', fontSize: '10px', flexShrink: 0 }}>%</span>
                  </div>
                  <button
                    type="button"
                    id="edInspectorZoomKeyframeBtn"
                    aria-label="Add or remove Zoom keyframe point"
                    title="إضافة / حذف نقطة تحريك (Keyframe Point) لتكبير وتصغير الطبقة بدون مط"
                    onClick={() => handleTogglePropertyKeyframe(selectedTarget, 'zoom')}
                    style={{
                      background:
                        layerKeyframes[selectedTarget]?.zoom?.[currentFrame] !== undefined
                          ? 'rgba(245,158,11,0.18)'
                          : 'transparent',
                      border:
                        layerKeyframes[selectedTarget]?.zoom?.[currentFrame] !== undefined
                          ? '1px solid #f59e0b'
                          : '1px solid #2a2a3c',
                      borderRadius: '4px',
                      width: '20px',
                      height: '20px',
                      display: 'grid',
                      placeItems: 'center',
                      color:
                        layerKeyframes[selectedTarget]?.zoom?.[currentFrame] !== undefined
                          ? '#fbbf24'
                          : '#7e7e90',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <Diamond size={11} />
                  </button>
                </div>
              </div>

              {/* LAYER OPACITY SECTION */}
              <div style={{ borderTop: '1px solid #1b1b26', paddingTop: '12px' }}>
                <div style={{ fontWeight: 700, color: '#e8e8ee', marginBottom: '10px' }}>
                  Layer
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '56px 1fr 22px',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span style={{ color: '#8e8ea0', fontSize: '11px' }}>Opacity</span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#14141e',
                      border: '1px solid #242434',
                      borderRadius: '6px',
                      padding: '0 6px',
                    }}
                  >
                    <span style={{ color: '#6e6e80', fontSize: '10px', marginRight: '4px' }}>
                      O
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={activeLayerTransform.opacity}
                      onChange={(e) =>
                        updateActiveTransform(
                          { opacity: Number(e.target.value) },
                          'Updated Opacity'
                        )
                      }
                      style={{
                        border: 0,
                        background: 'transparent',
                        padding: '4px 0',
                        textAlign: 'right',
                        width: '100%',
                      }}
                    />
                    <span style={{ color: '#6e6e80', fontSize: '10px', marginLeft: '4px' }}>
                      %
                    </span>
                  </div>
                  <button
                    type="button"
                    title="إضافة / حذف نقطة تحريك (Keyframe) لـ Opacity"
                    onClick={() => handleTogglePropertyKeyframe(selectedTarget, 'opacity')}
                    style={{
                      background:
                        layerKeyframes[selectedTarget]?.opacity?.[currentFrame] !== undefined
                          ? 'rgba(245,158,11,0.18)'
                          : 'transparent',
                      border:
                        layerKeyframes[selectedTarget]?.opacity?.[currentFrame] !== undefined
                          ? '1px solid #f59e0b'
                          : '1px solid #2a2a3c',
                      borderRadius: '4px',
                      width: '20px',
                      height: '20px',
                      display: 'grid',
                      placeItems: 'center',
                      color:
                        layerKeyframes[selectedTarget]?.opacity?.[currentFrame] !== undefined
                          ? '#fbbf24'
                          : '#7e7e90',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <Diamond size={11} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* DOCUMENT INSPECTOR */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: '#171722',
                    border: '1px solid #262636',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#a0a0b4',
                  }}
                >
                  <FileText size={14} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: '#f2f2f8',
                      fontSize: '13px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {docName}
                  </div>
                  <div style={{ color: '#727284', fontSize: '11px' }}>Document</div>
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontWeight: 700,
                    color: '#e8e8ee',
                    fontSize: '12px',
                    marginBottom: '6px',
                  }}
                >
                  Last action
                </div>
                <div
                  style={{
                    padding: '9px 11px',
                    borderRadius: '8px',
                    background: 'rgba(124, 92, 255, 0.08)',
                    border: '1px solid rgba(124, 92, 255, 0.35)',
                    color: '#a78bfa',
                    fontSize: '11px',
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}
                >
                  {lastAction}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #1b1b26', paddingTop: '12px' }}>
                <div
                  style={{
                    fontWeight: 700,
                    color: '#e8e8ee',
                    fontSize: '12px',
                    marginBottom: '8px',
                  }}
                >
                  Scene (Editable)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: '#8e8ea0' }}>Canvas</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min="16"
                        max="4096"
                        value={canvasW}
                        aria-label="Canvas width"
                        onChange={(e) =>
                          setMovie((m) => ({
                            ...m,
                            w: Math.max(16, Number(e.target.value) || 300),
                          }))
                        }
                        style={{
                          width: '54px',
                          background: '#14141e',
                          border: '1px solid #242434',
                          borderRadius: '5px',
                          padding: '2px 5px',
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ color: '#6e6e80' }}>×</span>
                      <input
                        type="number"
                        min="16"
                        max="4096"
                        value={canvasH}
                        aria-label="Canvas height"
                        onChange={(e) =>
                          setMovie((m) => ({
                            ...m,
                            h: Math.max(16, Number(e.target.value) || 300),
                          }))
                        }
                        style={{
                          width: '54px',
                          background: '#14141e',
                          border: '1px solid #242434',
                          borderRadius: '5px',
                          padding: '2px 5px',
                          textAlign: 'right',
                        }}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: '#8e8ea0' }}>Frame rate</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={fps}
                        aria-label="Frame rate FPS"
                        onChange={(e) =>
                          setMovie((m) => ({
                            ...m,
                            fps: Math.max(1, Math.min(120, Number(e.target.value) || 20)),
                          }))
                        }
                        style={{
                          width: '54px',
                          background: '#14141e',
                          border: '1px solid #242434',
                          borderRadius: '5px',
                          padding: '2px 5px',
                          textAlign: 'right',
                        }}
                      />
                      <span style={{ color: '#8e8ea0', fontSize: '11px' }}>fps</span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: '#8e8ea0' }}>Frames</span>
                    <input
                      type="number"
                      min="1"
                      max="2000"
                      value={totalFrames}
                      aria-label="Total frames"
                      onChange={(e) =>
                        setMovie((m) => ({
                          ...m,
                          n: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      style={{
                        width: '64px',
                        background: '#14141e',
                        border: '1px solid #242434',
                        borderRadius: '5px',
                        padding: '2px 5px',
                        textAlign: 'right',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8ea0' }}>Duration</span>
                    <span style={{ fontWeight: 600, color: '#f0f0f6' }}>
                      {durationSec.toFixed(2)}s
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #1b1b26', paddingTop: '12px' }}>
                <div
                  style={{
                    fontWeight: 700,
                    color: '#e8e8ee',
                    fontSize: '12px',
                    marginBottom: '8px',
                  }}
                >
                  Content
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8ea0' }}>Decomposed Layers</span>
                    <span style={{ fontWeight: 600, color: '#f0f0f6' }}>
                      {spriteLayers.length + addedLayers.length + shapes.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8ea0' }}>Assets</span>
                    <span style={{ fontWeight: 600, color: '#f0f0f6' }}>
                      {assetStats.assets.length + addedLayers.length + shapes.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8ea0' }}>Images</span>
                    <span style={{ fontWeight: 600, color: '#f0f0f6' }}>
                      {(
                        (fileSize ||
                          assetStats.totalBytes +
                            addedLayers.reduce((s, l) => s + l.bytes, 0)) /
                        (1024 * 1024)
                      ).toFixed(2)}{' '}
                      MB
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8ea0' }}>Audio</span>
                    <span style={{ fontWeight: 600, color: '#f0f0f6' }}>
                      {movie.audiosRaw?.length || 0}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #1b1b26', paddingTop: '12px' }}>
                <div
                  style={{
                    fontWeight: 700,
                    color: '#e8e8ee',
                    fontSize: '12px',
                    marginBottom: '6px',
                  }}
                >
                  Signals
                </div>
                <div style={{ color: '#727284', fontSize: '11px' }}>
                  {signals.length === 0
                    ? 'No signals defined.'
                    : `${signals.length} frame cue signal(s) active.`}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* 3. BOTTOM AFTER-EFFECTS TIMELINE PANEL (PER-PROPERTY KEYFRAMES + DRAGGABLE/TRIMMABLE BARS) */}
      <SvgaTimelinePanel
        docName={docName}
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        fps={fps}
        durationSec={durationSec}
        rulerMarks={rulerMarks}
        rulerRef={rulerRef}
        onScrubFromClientX={scrubFromClientX}
        onSetCurrentFrame={setCurrentFrame}
        selectedTarget={selectedTarget}
        onSelectTarget={(id, assetKey) => {
          setSelectedTarget(id);
          setSelectedAssetKey(assetKey);
        }}
        docTrackExpanded={docTrackExpanded}
        onToggleDocTrackExpanded={() => setDocTrackExpanded((v) => !v)}
        expandedTimelineLayerIds={expandedTimelineLayerIds}
        onToggleLayerExpand={toggleTimelineLayerExpand}
        hiddenLayerIds={hiddenLayerIds}
        onToggleLayerVisibility={toggleLayerVisibility}
        onDeleteLayer={handleDeleteLayer}
        scaleLinked={scaleLinked}
        onToggleScaleLinked={() => setScaleLinked((v) => !v)}
        spriteLayers={spriteLayers}
        addedLayers={addedLayers}
        shapes={shapes}
        spriteFrameRanges={spriteFrameRanges}
        layerKeyframes={layerKeyframes}
        getEffectiveTransform={getEffectiveTransform}
        onUpdateLayerTransform={updateLayerTransformById}
        onTogglePropertyKeyframe={handleTogglePropertyKeyframe}
        onStartLayerBarDrag={handleStartLayerBarDrag}
        onSplitOrTrimLayerAtCurrentFrame={handleSplitOrTrimLayerAtCurrentFrame}
      />

      {/* NEW TEXT LAYER MODAL */}
      {newTextModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 55,
            display: 'grid',
            placeItems: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: 'min(440px, 100%)',
              background: '#111119',
              border: '1px solid #28283a',
              borderRadius: '12px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>
                Add Decomposed Text Layer
              </div>
              <button
                type="button"
                onClick={() => setNewTextModalOpen(false)}
                style={{ background: 0, border: 0, color: '#a0a0b4', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <div>
              <span style={{ color: '#9090a4', fontSize: '11px' }}>Text</span>
              <input
                type="text"
                value={newTextValue}
                onChange={(e) => setNewTextValue(e.target.value)}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div>
                <span style={{ color: '#9090a4', fontSize: '11px' }}>Fill Color</span>
                <input
                  type="color"
                  value={newTextColor}
                  onChange={(e) => setNewTextColor(e.target.value)}
                  style={{ width: '100%', height: '32px', marginTop: '4px' }}
                />
              </div>
              <div>
                <span style={{ color: '#9090a4', fontSize: '11px' }}>Stroke</span>
                <input
                  type="color"
                  value={newTextStroke}
                  onChange={(e) => setNewTextStroke(e.target.value)}
                  style={{ width: '100%', height: '32px', marginTop: '4px' }}
                />
              </div>
              <div>
                <span style={{ color: '#9090a4', fontSize: '11px' }}>Size (px)</span>
                <input
                  type="number"
                  value={newTextSize}
                  onChange={(e) => setNewTextSize(Number(e.target.value))}
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="pill" onClick={() => setNewTextModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTextLayer}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: '1px solid #7c5cff',
                  background: '#7c5cff',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Plus size={12} style={{ display: 'inline', marginRight: '4px' }} />
                Add Text Layer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INLINE IMAGE EDIT MODAL */}
      {editModalKey && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 50,
            display: 'grid',
            placeItems: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: 'min(520px, 100%)',
              background: '#111119',
              border: '1px solid #28283a',
              borderRadius: '12px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>
                  Edit Image Asset · {editModalKey}
                </div>
                <div style={{ color: '#808092', fontSize: '11px' }}>
                  Toggle visibility or burn custom text into this SVGA asset
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalKey(null)}
                style={{ background: 0, border: 0, color: '#a0a0b4', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <label
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px',
                borderRadius: '8px',
                background: '#161622',
                border: '1px solid #242436',
              }}
            >
              <span>Show original image</span>
              <input
                type="checkbox"
                checked={editShowImage}
                onChange={(e) => setEditShowImage(e.target.checked)}
                style={{ width: 'auto' }}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ color: '#9090a4', fontSize: '11px' }}>Overlay Text (optional)</span>
              <input
                type="text"
                placeholder="Enter text overlay..."
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <span style={{ color: '#9090a4', fontSize: '11px' }}>Text Color</span>
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  style={{ height: '32px', width: '100%', marginTop: '4px' }}
                />
              </div>
              <div>
                <span style={{ color: '#9090a4', fontSize: '11px' }}>Font Size (px)</span>
                <input
                  type="number"
                  value={editFontSize}
                  onChange={(e) => setEditFontSize(Number(e.target.value))}
                  style={{ marginTop: '4px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-end', gap: '8px' }}>
              <button type="button" onClick={() => setEditModalKey(null)} className="pill">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyInlineImageEdit}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: '1px solid #7c5cff',
                  background: '#7c5cff',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Apply to Asset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AFTER EFFECTS PLUGIN & SCRIPT MODAL */}
      {aeModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 60,
            display: 'grid',
            placeItems: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: 'min(580px, 100%)',
              background: '#101018',
              border: '1px solid #7c5cff',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '9px',
                    background: 'linear-gradient(135deg, #7c5cff, #4c1d95)',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    color: '#fff',
                  }}
                >
                  Ae
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>
                    SVGA AE Plugin & Decomposed Layer Script
                  </div>
                  <div style={{ color: '#9090a4', fontSize: '11px' }}>
                    Adobe After Effects ExtendScript (.jsx) + Decomposed SVGA 2.0 Timeline Editor
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseAeModal}
                style={{
                  background: 0,
                  border: 0,
                  color: '#9090a4',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                background: '#161622',
                border: '1px solid #262638',
                borderRadius: '10px',
                padding: '12px',
                color: '#c8c8d8',
                fontSize: '12px',
                lineHeight: 1.5,
              }}
            >
              <div>
                <b>Active Composition:</b> {docName} ({canvasW}×{canvasH} · {fps} FPS ·{' '}
                {totalFrames} Frames · {spriteLayers.length + addedLayers.length + shapes.length}{' '}
                decomposed layers)
              </div>
              <div style={{ marginTop: '4px', color: '#8e8ea0' }}>
                All layers added or transformed in this workspace are exported as genuine
                decomposed SVGA 2.0 sprite layers (never flattened into baked frames). You can also
                download the <b>MotionTools_SVGA_AE_Plugin.jsx</b> script to run inside Adobe After
                Effects (<i>File → Scripts → Run Script File...</i>).
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="pill" onClick={onCloseAeModal}>
                Continue in Web Editor
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDownloadAeScript();
                  if (onCloseAeModal) onCloseAeModal();
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #7c5cff',
                  background: '#7c5cff',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Download size={14} />
                <span>Download SVGA AE Script (.jsx)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COPY MOTION / ANIMATION / FRAMES FROM SVGA SPRITE MODAL */}
      {copyMotionModalLayerId && (
        <div
          id="copyMotionModalBackdrop"
          onClick={() => setCopyMotionModalLayerId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 6, 12, 0.82)',
            backdropFilter: 'blur(8px)',
            zIndex: 9998,
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '560px',
              maxHeight: '82vh',
              background: '#11111a',
              border: '1px solid #2d2d44',
              borderRadius: '14px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
              direction: 'rtl',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '9px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                  }}
                >
                  <Clapperboard size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px', color: '#fff' }}>
                    🎬 اختر طبقة من ملف SVGA لأخذ نفس الحركة والأنيميشن والفريمات
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                    سيتم نسخ مسار الحركة (Transform Matrix) والشفافية والفريمات (F0–F{totalFrames - 1}) وتطبيقها فوراً على طبقة الصورة المضافة
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCopyMotionModalLayerId(null)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  width: '30px',
                  height: '30px',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                color="#7e7e92"
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              />
              <input
                type="text"
                value={copyMotionSearch}
                onChange={(e) => setCopyMotionSearch(e.target.value)}
                placeholder="ابحث برقم الطبقة أو اسمها (مثال: #12 أو img_263)..."
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 32px 0 12px',
                  borderRadius: '8px',
                  border: '1px solid #2b2b40',
                  background: '#171723',
                  color: '#f1f5f9',
                  fontSize: '12px',
                }}
              />
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '4px 2px',
                maxHeight: '420px',
              }}
            >
              {spriteLayers
                .filter((sl) => {
                  const q = copyMotionSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    sl.key.toLowerCase().includes(q) ||
                    `#${sl.displayNum}`.includes(q) ||
                    String(sl.displayNum).includes(q)
                  );
                })
                .map((sl) => {
                  const th = thumbs[sl.key];
                  return (
                    <div
                      key={sl.id}
                      onClick={() =>
                        handleCopyMotionFromSpriteToAddedLayer(copyMotionModalLayerId, sl.spriteIdx)
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '9px',
                        background: '#181826',
                        border: '1px solid #27273a',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '6px',
                            background:
                              'repeating-conic-gradient(#22222c 0 25%, #17171f 0 50%) 0 0 / 8px 8px',
                            display: 'grid',
                            placeItems: 'center',
                            overflow: 'hidden',
                            border: '1px solid #2e2e42',
                            flexShrink: 0,
                          }}
                        >
                          {th ? (
                            <img
                              src={th.url}
                              alt={sl.key}
                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                            />
                          ) : (
                            <ImageIcon size={14} color="#94a3b8" />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                background: 'rgba(124, 92, 255, 0.2)',
                                color: '#c4b5fd',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                            >
                              #{sl.displayNum}
                            </span>
                            <span
                              style={{
                                fontWeight: 700,
                                color: '#f1f5f9',
                                fontSize: '12.5px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {sl.key}
                            </span>
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                            الفريمات النشطة: <b>F{sl.span.firstFrame}–{sl.span.lastFrame}</b> ({sl.span.activeCount}{' '}
                            فريم) · {sl.span.isStatic ? 'ثابتة' : 'متحركة (Animated)'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-confirm-copy-motion"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyMotionFromSpriteToAddedLayer(
                            copyMotionModalLayerId,
                            sl.spriteIdx
                          );
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '7px',
                          border: '1px solid rgba(245, 158, 11, 0.5)',
                          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '11px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        🎬 أخذ نفس الحركة والفريمات
                      </button>
                    </div>
                  );
                })}

              {addedLayers
                .filter((al) => {
                  if (al.id === copyMotionModalLayerId) return false;
                  const q = copyMotionSearch.trim().toLowerCase();
                  if (!q) return true;
                  return al.name.toLowerCase().includes(q);
                })
                .map((al) => (
                  <div
                    key={al.id}
                    onClick={() =>
                      handleCopyMotionFromAddedLayerToAddedLayer(copyMotionModalLayerId, al.id)
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '9px',
                      background: '#181826',
                      border: '1px solid #27273a',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '6px',
                          background: '#1f1f30',
                          display: 'grid',
                          placeItems: 'center',
                          border: '1px solid #383854',
                          flexShrink: 0,
                        }}
                      >
                        <ImageIcon size={15} color="#a78bfa" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              background: 'rgba(16, 185, 129, 0.18)',
                              color: '#6ee7b7',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10.5px',
                              fontWeight: 700,
                            }}
                          >
                            طبقة مضافة
                          </span>
                          <span
                            style={{
                              fontWeight: 700,
                              color: '#f1f5f9',
                              fontSize: '12.5px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {al.name}
                          </span>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                          الفريمات النشطة: <b>F{al.inFrame}–{al.outFrame}</b> · {al.width}×{al.height}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-confirm-copy-motion"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyMotionFromAddedLayerToAddedLayer(
                          copyMotionModalLayerId,
                          al.id
                        );
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '7px',
                        border: '1px solid rgba(245, 158, 11, 0.5)',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '11px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      🎬 أخذ نفس الحركة والفريمات
                    </button>
                  </div>
                ))}

              {spriteLayers.length === 0 && addedLayers.filter((a) => a.id !== copyMotionModalLayerId).length === 0 && (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: '12px',
                    background: '#151522',
                    borderRadius: '8px',
                    border: '1px dashed #2e2e44',
                  }}
                >
                  افتح ملف <b>SVGA</b> أولاً (من زر Open SVGA بالأعلى أو من استوديو الهدايا) لتظهر هنا جميع طبقات الهدية وتختار أي طبقة لأخذ حركتها وفريماتها.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
