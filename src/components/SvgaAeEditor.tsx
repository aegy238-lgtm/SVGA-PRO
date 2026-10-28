import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Layers,
  Image as ImageIcon,
  Shapes,
  GitCommitHorizontal,
  ChevronDown,
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
} from 'lucide-react';
import { parseMovie, SvgaMovie } from '../utils/codecs';
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
} from '../utils/svgaEditorLogic';
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
  pngBytes: Uint8Array;
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  transform: LayerTransform;
  inFrame: number;
  outFrame: number;
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

interface HistorySnapshot {
  docTransform: LayerTransform;
  layerTransforms: Record<string, LayerTransform>;
  layerKeyframes: Record<string, LayerPropertyKeyframes>;
  spriteFrameRanges: Record<number, SpriteFrameRange>;
  hiddenLayerIds: string[];
  deletedSpriteIndices: number[];
  addedLayers: AddedLayer[];
  shapes: ShapeObject[];
}

interface SvgaAeEditorProps {
  externalSvgaFile?: File | null;
  onSyncToMotionTools?: (file: File) => void;
  aeModalOpen?: boolean;
  onCloseAeModal?: () => void;
}

async function decompressDeflate(raw: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  return new Uint8Array(
    await new Response(new Blob([raw as any]).stream().pipeThrough(ds)).arrayBuffer()
  );
}

async function compressDeflate(raw: Uint8Array): Promise<Uint8Array> {
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
    'Move' | 'Crop' | 'Frame' | 'Shape' | 'Pen' | 'Text' | 'Hand' | 'Zoom'
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
  const [scaleLinked, setScaleLinked] = useState<boolean>(true);

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

  const [addedLayers, setAddedLayers] = useState<AddedLayer[]>([]);
  const [shapes, setShapes] = useState<ShapeObject[]>([]);
  const [penDraftPoints, setPenDraftPoints] = useState<{ x: number; y: number }[]>([]);
  const [signals, setSignals] = useState<{ id: string; frame: number; label: string }[]>([]);

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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeHandlesRef = useRef<
    Array<{
      handle: 'tl' | 'tr' | 'br' | 'bl' | 'tm' | 'mr' | 'bm' | 'ml';
      x: number;
      y: number;
      cursor: string;
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
      };
      setHistory((prev) => [...prev.slice(0, historyIdx + 1), snap]);
      setHistoryIdx((idx) => idx + 1);
    },
    [historyIdx, layerKeyframes, spriteFrameRanges, addedLayers, shapes]
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

        setMovie(m);
        setBitmaps(newBitmaps);
        setThumbs(newThumbs);
        setDocName(name);
        setFileSize(reportedSize ?? buf.byteLength);
        setCurrentFrame(0);
        setSelectedTarget('DOCUMENT');
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
    [docTransform, layerTransforms, layerKeyframes, addedLayers, shapes]
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

    // 1. Render original decomposed SVGA sprites in stacking order 0 .. sp.length - 1
    movie.sp.forEach((s, idx) => {
      if (deletedSpriteIndices.has(idx)) return;
      const spriteId = `sprite_${idx}`;
      if (hiddenLayerIds.has(spriteId)) return;

      const resolved = resolveSpriteFrameAt(s, currentFrame, totalFrames, spriteFrameRanges[idx]);
      const f = resolved.frameObj;
      if (!f || !resolved.visible) return;
      const bm = s.key ? bitmaps[s.key] : undefined;
      const hasShapes = f.shapesRaw && f.shapesRaw.length > 0;
      if (f.a <= 0.001 && !hasShapes) return;

      const lt = getEffectiveTransform(spriteId, s.key, currentFrame);
      const layerAlpha = Math.max(0, Math.min(1, lt.opacity / 100));
      const finalAlpha = Math.min(1, Math.max(0, (f.a ?? 1) * docAlpha * layerAlpha));
      if (finalAlpha <= 0.001) return;

      const assetW = bm?.width || thumbs[s.key]?.w || f.w || W;
      const assetH = bm?.height || thumbs[s.key]?.h || f.h || H;
      const mat = computeSpriteFrameMatrix(f, assetW, assetH, W, H, lt, docT);

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
    });

    // 2. Render added decomposed image layers
    for (const al of addedLayers) {
      if (hiddenLayerIds.has(al.id)) continue;
      if (currentFrame < al.inFrame || currentFrame > al.outFrame) continue;
      const lt = getEffectiveTransform(al.id, al.assetKey, currentFrame);
      const finalAlpha = Math.max(0, Math.min(1, (lt.opacity / 100) * docAlpha));
      if (finalAlpha <= 0.001) continue;

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

      ctx.save();
      ctx.globalAlpha = finalAlpha;
      ctx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);
      ctx.drawImage(al.bitmap, 0, 0, al.width, al.height);
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

    // 3. Render added decomposed shape / path / text layers
    for (const sh of shapes) {
      if (hiddenLayerIds.has(sh.id)) continue;
      if (currentFrame < sh.inFrame || currentFrame > sh.outFrame) continue;
      const lt = getEffectiveTransform(sh.id, sh.assetKey, currentFrame);
      const finalAlpha = Math.max(0, Math.min(1, (lt.opacity / 100) * docAlpha));
      if (finalAlpha <= 0.001) continue;

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

    // 5. Render editor selection bounding box overlay (not exported into SVGA)
    if (isAllLayersGrouped || selectedTarget === 'GROUP_ALL') {
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

      const addedIdx = addedLayers.findIndex((l) => l.id === targetId);
      if (addedIdx >= 0) {
        const nextAdded = addedLayers.map((l, i) =>
          i === addedIdx ? { ...l, transform: { ...l.transform, ...patch } } : l
        );
        setAddedLayers(nextAdded);
        syncKeyframePatch(targetId, mergedEff, patch);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
          addedLayers: nextAdded,
        });
        if (actionDesc) setLastAction(`${actionDesc} (${addedLayers[addedIdx].name})`);
        return;
      }

      const shapeIdx = shapes.findIndex((s) => s.id === targetId);
      if (shapeIdx >= 0) {
        const nextShapes = shapes.map((s, i) =>
          i === shapeIdx ? { ...s, transform: { ...s.transform, ...patch } } : s
        );
        setShapes(nextShapes);
        syncKeyframePatch(targetId, mergedEff, patch);
        pushHistory(docTransform, layerTransforms, hiddenLayerIds, deletedSpriteIndices, {
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
          opacity: { ...(existing.opacity || {}) },
        };

        if (prop === 'all') {
          const anyAtF =
            nextForLayer.position?.[frame] !== undefined ||
            nextForLayer.scale?.[frame] !== undefined ||
            nextForLayer.rotation?.[frame] !== undefined ||
            nextForLayer.opacity?.[frame] !== undefined;
          if (anyAtF) {
            delete nextForLayer.position![frame];
            delete nextForLayer.scale![frame];
            delete nextForLayer.rotation![frame];
            delete nextForLayer.opacity![frame];
          } else {
            nextForLayer.position![frame] = { x: currentT.x, y: currentT.y };
            nextForLayer.scale![frame] = { sx: currentT.sx, sy: currentT.sy };
            nextForLayer.rotation![frame] = currentT.rotation;
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
      const mat = computeAddedLayerFrameMatrix(al.width, al.height, canvasW, canvasH, lt, docT);
      const inv = invertAffine(mat);
      if (!inv) continue;
      const lx = inv[0] * cx + inv[2] * cy + inv[4];
      const ly = inv[1] * cx + inv[3] * cy + inv[5];
      if (lx >= 0 && lx <= al.width && ly >= 0 && ly <= al.height) {
        return { target: al.id, assetKey: null };
      }
    }

    // 3. Check SVGA sprites from topmost (sp.length - 1) down to 0
    for (let idx = movie.sp.length - 1; idx >= 0; idx--) {
      if (deletedSpriteIndices.has(idx)) continue;
      const spriteId = `sprite_${idx}`;
      if (hiddenLayerIds.has(spriteId)) continue;
      const s = movie.sp[idx];
      const resolved = resolveSpriteFrameAt(s, currentFrame, totalFrames, spriteFrameRanges[idx]);
      const f = resolved.frameObj;
      if (!f || !resolved.visible || f.a <= 0.01) continue;
      const bm = s.key ? bitmaps[s.key] : undefined;
      const assetW = bm?.width || thumbs[s.key]?.w || f.w || canvasW;
      const assetH = bm?.height || thumbs[s.key]?.h || f.h || canvasH;
      const lt = getEffectiveTransform(spriteId, s.key, currentFrame);
      const mat = computeSpriteFrameMatrix(f, assetW, assetH, canvasW, canvasH, lt, docT);
      const inv = invertAffine(mat);
      if (!inv) continue;
      const lx = inv[0] * cx + inv[2] * cy + inv[4];
      const ly = inv[1] * cx + inv[3] * cy + inv[5];
      const fx = f.x || 0;
      const fy = f.y || 0;
      const fw = f.w || assetW;
      const fh = f.h || assetH;
      if (lx >= fx && lx <= fx + fw && ly >= fy && ly <= fy + fh) {
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
    mode: 'moveLayer' | 'panStage' | 'cropBox' | 'scaleLayer';
    handle?: 'tl' | 'tr' | 'br' | 'bl' | 'tm' | 'mr' | 'bm' | 'ml';
    targetId: string;
    assetKey: string | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origSx?: number;
    origSy?: number;
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

    // 0. Handle hit-test: if clicking on a bounding box scale handle of the currently selected layer
    if (activeTool === 'Move' && activeHandlesRef.current.length > 0) {
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
      if (activeTool === 'Move' && activeHandlesRef.current.length > 0) {
        const cv = canvasRef.current;
        if (cv) {
          const rect = cv.getBoundingClientRect();
          const scaleX = rect.width / Math.max(1, canvasW);
          const scaleY = rect.height / Math.max(1, canvasH);
          const hoveredHandle = activeHandlesRef.current.find((h) => {
            const screenX = rect.left + h.x * scaleX;
            const screenY = rect.top + h.y * scaleY;
            return Math.hypot(e.clientX - screenX, e.clientY - screenY) <= 12;
          });
          if (hoveredHandle) {
            e.currentTarget.style.cursor = hoveredHandle.cursor;
            return;
          } else {
            e.currentTarget.style.cursor = 'default';
          }
        }
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
        handle = 'br',
        initialHandleX = centerCanvasX + 50,
        initialHandleY = centerCanvasY + 50,
      } = dragRef.current;

      let newSx = origSx;
      let newSy = origSy;

      if (handle === 'tl' || handle === 'tr' || handle === 'br' || handle === 'bl') {
        const curDist = Math.hypot(pt.x - centerCanvasX, pt.y - centerCanvasY);
        const factor = curDist / Math.max(2, initialDist);
        newSx = Math.max(5, Math.min(1000, Number((origSx * factor).toFixed(1))));
        newSy = Math.max(5, Math.min(1000, Number((origSy * factor).toFixed(1))));
      } else if (handle === 'mr' || handle === 'ml') {
        const curDistX = Math.abs(pt.x - centerCanvasX);
        const initDistX = Math.abs(initialHandleX - centerCanvasX);
        const factorX = curDistX / Math.max(2, initDistX);
        newSx = Math.max(5, Math.min(1000, Number((origSx * factorX).toFixed(1))));
      } else if (handle === 'tm' || handle === 'bm') {
        const curDistY = Math.abs(pt.y - centerCanvasY);
        const initDistY = Math.abs(initialHandleY - centerCanvasY);
        const factorY = curDistY / Math.max(2, initDistY);
        newSy = Math.max(5, Math.min(1000, Number((origSy * factorY).toFixed(1))));
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
      dragRef.current = null;
      if (mode === 'cropBox') {
        setLastAction('تم تحديد المنطقة بالماوس — اختر قص أو فصل أو مسح من الشريط العلوي');
      } else if (mode === 'scaleLayer') {
        setLastAction(`تم تعديل مقاس الطبقة (${movedTarget}) بنجاح`);
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

      const targetFrames = Math.max(movie.n || 1, other.n || 1);
      const mergedSprites = [
        ...movie.sp,
        ...other.sp.map((s) => ({
          ...s,
          key: keyMap[s.key] || s.key,
        })),
      ];

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
      setLastAction(
        `Merged ${f.name} (+${other.sp.length} decomposed layers, +${Object.keys(other.im).length} assets)`
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

    for (const al of addedLayers) {
      if (hiddenLayerIds.has(al.id)) continue;
      extraLayers.push({
        id: al.id,
        assetKey: al.assetKey,
        name: al.name,
        pngBytes: al.pngBytes,
        width: al.width,
        height: al.height,
        transform: al.transform,
        inFrame: al.inFrame,
        outFrame: al.outFrame,
      });
    }

    for (const sh of shapes) {
      if (hiddenLayerIds.has(sh.id)) continue;
      const pngBytes = await renderShapeObjectToPngBytes(sh);
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
    });

    const deflated = await compressDeflate(rawProto);
    return new Blob([deflated as any], { type: 'application/octet-stream' });
  };

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
                    ? t.id === 'Crop'
                      ? '1px solid #f59e0b'
                      : '1px solid #2e2e42'
                    : '1px solid transparent',
                  background: on
                    ? t.id === 'Crop'
                      ? 'rgba(245,158,11,0.18)'
                      : '#191924'
                    : 'transparent',
                  color: on ? (t.id === 'Crop' ? '#fde047' : '#f2f2f7') : '#8e8ea0',
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
              color: activeTool === 'Crop' ? '#fde047' : '#7c7c8e',
              fontSize: '11px',
              marginLeft: '5px',
              fontWeight: activeTool === 'Crop' ? 700 : 400,
            }}
          >
            {activeTool === 'Crop' ? '✂ قص وتحديد بالماوس' : activeTool}
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
          <span style={{ color: '#7e7e90' }}>Local drafts</span>
          <span style={{ color: '#4a4a5a' }}>/</span>
          {isRenamingDoc ? (
            <input
              type="text"
              value={docName}
              autoFocus
              onChange={(e) => setDocName(e.target.value)}
              onBlur={() => setIsRenamingDoc(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsRenamingDoc(false);
              }}
              style={{
                width: '180px',
                background: '#14141e',
                border: '1px solid #7c5cff',
                borderRadius: '5px',
                padding: '2px 6px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setSelectedTarget('DOCUMENT');
                setSelectedAssetKey(null);
              }}
              onDoubleClick={() => setIsRenamingDoc(true)}
              title="Click to inspect document, double-click to rename"
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
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{docName}</span>
              <ChevronDown size={12} color="#7e7e90" />
            </button>
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
                      <button
                        type="button"
                        id="edMergeAllLayers"
                        onClick={handleToggleGroupAllLayers}
                        title={
                          isAllLayersGrouped
                            ? 'فك تجميع الطبقات والرجوع للتحكم في كل طبقة منفردة'
                            : 'تجميع كل الطبقات في لير واحد مجمع لتسهيل تحريكه وتكبيره وتصغيره معاً دون فقدان جودة وبدون تحويل لصور'
                        }
                        style={{
                          background: isAllLayersGrouped
                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.28), rgba(248, 113, 113, 0.18))'
                            : 'linear-gradient(135deg, rgba(124, 92, 255, 0.28), rgba(167, 139, 250, 0.18))',
                          border: isAllLayersGrouped
                            ? '1px solid rgba(239, 68, 68, 0.55)'
                            : '1px solid rgba(139, 92, 246, 0.55)',
                          color: isAllLayersGrouped ? '#fca5a5' : '#ddd6fe',
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
                        <Layers size={10} color={isAllLayersGrouped ? '#fca5a5' : '#a78bfa'} />
                        <span>{isAllLayersGrouped ? 'فك التجميع (Ungroup)' : 'دمج الطبقات كلها في لير واحد'}</span>
                      </button>
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

                  {/* Added Shape / Text Layers */}
                  {shapes.map((sh) => {
                    const isHidden = hiddenLayerIds.has(sh.id);
                    const isSel = selectedTarget === sh.id;
                    return (
                      <div
                        key={sh.id}
                        onClick={() => {
                          setSelectedTarget(sh.id);
                          setSelectedAssetKey(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 8px 5px 18px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          marginTop: '2px',
                          background: isSel ? '#1d1d2d' : 'transparent',
                          border: isSel ? '1px solid #7c5cff' : '1px solid transparent',
                          opacity: isHidden ? 0.45 : 1,
                        }}
                      >
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
                          }}
                        >
                          {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        {sh.type === 'text' ? (
                          <Type size={12} color={sh.color} />
                        ) : (
                          <Hexagon size={12} color={sh.color} />
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
                            padding: 0,
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}

                  {/* Added Image Layers */}
                  {addedLayers.map((al) => {
                    const isHidden = hiddenLayerIds.has(al.id);
                    const isSel = selectedTarget === al.id;
                    return (
                      <div
                        key={al.id}
                        onClick={() => {
                          setSelectedTarget(al.id);
                          setSelectedAssetKey(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 8px 5px 18px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          marginTop: '2px',
                          background: isSel ? '#1d1d2d' : 'transparent',
                          border: isSel ? '1px solid #7c5cff' : '1px solid transparent',
                          opacity: isHidden ? 0.45 : 1,
                        }}
                      >
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
                          }}
                        >
                          {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        <ImageIcon size={12} color="#a78bfa" />
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              fontWeight: 500,
                              color: '#e8e8ee',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {al.name}
                          </span>
                          <span style={{ fontSize: '10px', color: '#727284' }}>
                            ADDED · {al.width}×{al.height}
                          </span>
                        </div>
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
                            color: '#727284',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}

                  {/* All Decomposed SVGA Sprite Layers (#N down to #1) */}
                  {filteredSpriteLayers.map((sl) => {
                    const isHidden = hiddenLayerIds.has(sl.id);
                    const isSel = selectedTarget === sl.id;
                    const th = thumbs[sl.key];
                    return (
                      <div
                        key={sl.id}
                        onClick={() => {
                          setSelectedTarget(sl.id);
                          setSelectedAssetKey(sl.key);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 8px 5px 14px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          marginTop: '2px',
                          background: isSel ? '#1d1d2d' : 'transparent',
                          border: isSel ? '1px solid #7c5cff' : '1px solid transparent',
                          opacity: isHidden ? 0.45 : 1,
                        }}
                      >
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
                          <span style={{ fontSize: '10px', color: '#727284' }}>
                            F{sl.span.firstFrame}–{sl.span.lastFrame} ({sl.span.activeCount}f)
                            {sl.span.isStatic ? ' · static' : ''}
                          </span>
                        </div>
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
                            padding: 0,
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
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
                <div style={{ fontWeight: 700, color: '#e8e8ee', marginBottom: '10px' }}>
                  Transform
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
    </div>
  );
}
