import React, { useState, useRef, useEffect } from 'react';
import {
  AnimationPreset,
  ProjectComposerState,
  ProjectLayerTransform,
  SecondaryOverlayLayer,
  OverlayZOrder,
  OverlayFitMode,
  OverlayAlphaMode,
  DEFAULT_LAYER_TRANSFORM,
  clampTransformValues,
  nudgeLayerTransform,
  isDefaultLayerTransform,
  hasAnimatedMotion,
  moveOverlayLayerUp,
  moveOverlayLayerDown,
  moveOverlayLayerToTop,
  moveOverlayLayerToBottom,
  getUnifiedVisualLayerStack,
  UnifiedStackItem,
} from '../utils/projectComposer';
import {
  MaskDepthBand,
  VapMaskShapePreset,
  resolveMaskDepthBand,
  parseHexColorRgb,
} from '../utils/vapDynamicMaskPacking';
import {
  UnifiedLayersExplorer,
  UnifiedSelectionRef,
  PrimaryProjectSnapshot,
  WatermarkLayerSnapshot,
} from './UnifiedLayersExplorer';

interface ProjectComposerPanelProps {
  open: boolean;
  onClose: () => void;
  language: 'ar' | 'en';
  composerState: ProjectComposerState;
  onChangeState: (next: ProjectComposerState) => void;
  onUploadSecondaryFile: (file: File, replaceId?: string) => Promise<void>;
  onRemoveSecondaryFile: (id: string) => void;
  baseWidth: number;
  baseHeight: number;
  isUploadingOverlay?: boolean;
  onOpenEdgeFeather?: () => void;
  onOpenChromaKey?: () => void;
  onOpenWatermark?: () => void;
  onOpenBatchOps?: () => void;
}

const STEP_OPTIONS = [1, 5, 15, 30, 50];

export const ProjectComposerPanel: React.FC<ProjectComposerPanelProps> = ({
  open,
  onClose,
  language,
  composerState,
  onChangeState,
  onUploadSecondaryFile,
  onRemoveSecondaryFile,
  baseWidth,
  baseHeight,
  isUploadingOverlay = false,
  onOpenEdgeFeather,
  onOpenChromaKey,
  onOpenWatermark,
  onOpenBatchOps,
}) => {
  const isAr = language === 'ar';
  const [stepPx, setStepPx] = useState<number>(15);
  const [activeTab, setActiveTab] = useState<'all' | 'primary' | 'secondary' | 'masks' | 'stack' | 'motion'>('all');
  const [motionTargetId, setMotionTargetId] = useState<string>('primary');
  const [selectedUnified, setSelectedUnified] = useState<UnifiedSelectionRef>({
    kind: 'primary',
    id: 'primary',
  });
  const [primaryInfo, setPrimaryInfo] = useState<PrimaryProjectSnapshot>({
    hasSource: false,
    name: '',
    format: '',
    width: baseWidth || 400,
    height: baseHeight || 400,
    fps: 24,
    frames: 30,
    thumb: '',
  });
  const [watermarks, setWatermarks] = useState<WatermarkLayerSnapshot[]>([]);
  const [motionAssets, setMotionAssets] = useState<Record<string, string>>({});
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetIdRef = useRef<string | undefined>(undefined);

  const safeW = Math.max(100, baseWidth || 750);
  const safeH = Math.max(100, baseHeight || 1624);

  // Sync activeTab with activeTargetId when user switches targets externally
  useEffect(() => {
    if (
      activeTab === 'all' ||
      activeTab === 'masks' ||
      activeTab === 'stack' ||
      activeTab === 'motion'
    ) {
      return;
    }
    if (composerState.activeTargetId === 'primary') {
      setActiveTab('primary');
    } else if (composerState.overlays.some((o) => o.id === composerState.activeTargetId)) {
      setActiveTab('secondary');
    }
  }, [composerState.activeTargetId, composerState.overlays.length]);

  useEffect(() => {
    if (!open) return;
    const pending = (window as any).__pendingComposerTab;
    if (pending === 'masks' || pending === 'all') {
      (window as any).__pendingComposerTab = null;
      setActiveTab(pending);
    }
  }, [open]);

  useEffect(() => {
    const onOpenMasksTab = () => {
      (window as any).__pendingComposerTab = null;
      setActiveTab('masks');
    };
    const onOpenAllLayersTab = () => {
      (window as any).__pendingComposerTab = null;
      setActiveTab('all');
    };
    const onOpenMotionForMask = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const srcId = detail?.srcId || (window as any).__selectedVapMaskId;
      setActiveTab('motion');
      if (srcId) {
        setMotionTargetId(`mask:${String(srcId)}`);
        setSelectedUnified({ kind: 'mask', id: String(srcId) });
      }
      const snap = (window as any).__getVapMasksSnapshot?.();
      if (snap) {
        setVapMasksSnap({
          slots: Array.isArray(snap.slots) ? snap.slots : [],
          detectedDummies: Array.isArray(snap.detectedDummies) ? snap.detectedDummies : [],
          silhouettes: snap.silhouettes || {},
          replacements: snap.replacements || {},
          bakeReplacedSlots: snap.bakeReplacedSlots !== false,
          selectedSrcId: snap.selectedSrcId || null,
          guidesEnabled: Boolean(snap.guidesEnabled),
          hasSource: Boolean(snap.hasSource),
        });
      }
    };
    window.addEventListener('opencomposermaskstab', onOpenMasksTab);
    window.addEventListener('opencomposeralllayerstab', onOpenAllLayersTab);
    window.addEventListener('opencomposermotionformask', onOpenMotionForMask);
    return () => {
      window.removeEventListener('opencomposermaskstab', onOpenMasksTab);
      window.removeEventListener('opencomposeralllayerstab', onOpenAllLayersTab);
      window.removeEventListener('opencomposermotionformask', onOpenMotionForMask);
    };
  }, []);

  const [vapMasksSnap, setVapMasksSnap] = useState<{
    slots: any[];
    detectedDummies: any[];
    silhouettes: Record<string, string>;
    replacements: Record<string, any>;
    bakeReplacedSlots: boolean;
    selectedSrcId: string | null;
    guidesEnabled: boolean;
    hasSource: boolean;
  }>({
    slots: [],
    detectedDummies: [],
    silhouettes: {},
    replacements: {},
    bakeReplacedSlots: true,
    selectedSrcId: null,
    guidesEnabled: false,
    hasSource: false,
  });

  useEffect(() => {
    const syncSnap = () => {
      const snapFn = (window as any).__getVapMasksSnapshot;
      if (typeof snapFn === 'function') {
        const res = snapFn();
        setVapMasksSnap({
          slots: Array.isArray(res?.slots) ? res.slots : [],
          detectedDummies: Array.isArray(res?.detectedDummies) ? res.detectedDummies : [],
          silhouettes: res?.silhouettes || {},
          replacements: res?.replacements || {},
          bakeReplacedSlots: res?.bakeReplacedSlots !== false,
          selectedSrcId: res?.selectedSrcId || null,
          guidesEnabled: Boolean(res?.guidesEnabled),
          hasSource: Boolean(res?.hasSource),
        });
      }
    };
    syncSnap();
    window.addEventListener('vapmaskschange', syncSnap);
    return () => window.removeEventListener('vapmaskschange', syncSnap);
  }, [open, composerState.overlays.length]);

  useEffect(() => {
    const syncUnifiedData = () => {
      const pInfo = (window as any).__getPrimaryProjectInfo?.();
      const pThumb = (window as any).__getPrimaryLayerPreviewThumb?.() || '';
      if (pInfo) {
        setPrimaryInfo({ ...pInfo, thumb: pThumb });
      }
      const wmList = (window as any).__getWatermarkLayersSnapshot?.();
      if (Array.isArray(wmList)) {
        setWatermarks(wmList);
      }
      const latestAssets = (window as any).__getMotionAssets?.();
      if (latestAssets && typeof latestAssets === 'object') {
        setMotionAssets({ ...latestAssets });
      }
    };
    syncUnifiedData();
    window.addEventListener('primaryprojectchange', syncUnifiedData);
    window.addEventListener('watermarklayerschange', syncUnifiedData);
    window.addEventListener('motionassetschange', syncUnifiedData);
    window.addEventListener('vapmaskschange', syncUnifiedData);
    return () => {
      window.removeEventListener('primaryprojectchange', syncUnifiedData);
      window.removeEventListener('watermarklayerschange', syncUnifiedData);
      window.removeEventListener('motionassetschange', syncUnifiedData);
      window.removeEventListener('vapmaskschange', syncUnifiedData);
    };
  }, [open, composerState.overlays.length]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPanelPos({
        x: Math.max(8, Math.min(window.innerWidth - 360, dragRef.current.origX + dx)),
        y: Math.max(48, Math.min(window.innerHeight - 120, dragRef.current.origY + dy)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  if (!open) return null;

  const explicitOverlay =
    composerState.overlays.find((o) => o.id === composerState.activeTargetId) || null;
  const selectedOverlay: SecondaryOverlayLayer | null =
    explicitOverlay ||
    (composerState.activeTargetId === 'primary' && activeTab !== 'secondary'
      ? null
      : composerState.overlays[0] || null);

  const isEditingPrimary =
    activeTab === 'primary' ||
    (activeTab === 'motion' && composerState.activeTargetId === 'primary') ||
    !selectedOverlay;
  const activeTransform: ProjectLayerTransform = isEditingPrimary
    ? composerState.primaryTransform
    : selectedOverlay.transform;

  // Motion tab supports targeting Primary, any added Overlay/Frame, OR any dynamic Mask slot
  const motionMaskSrcId =
    activeTab === 'motion' && motionTargetId.startsWith('mask:') ? motionTargetId.slice(5) : null;
  const motionMaskSlot = motionMaskSrcId
    ? vapMasksSnap.slots.find((s: any) => String(s.srcId) === motionMaskSrcId) || null
    : null;
  const motionOverlayLayer =
    activeTab === 'motion' && !motionMaskSlot
      ? composerState.overlays.find((o) => o.id === motionTargetId) || null
      : null;
  const motionIsMask = activeTab === 'motion' && Boolean(motionMaskSlot);
  const motionIsOverlay = activeTab === 'motion' && Boolean(motionOverlayLayer);
  const motionTransform: ProjectLayerTransform = motionIsMask
    ? { ...DEFAULT_LAYER_TRANSFORM, ...(motionMaskSlot.motionTransform || {}) }
    : motionIsOverlay && motionOverlayLayer
    ? motionOverlayLayer.transform
    : activeTab === 'motion'
    ? composerState.primaryTransform
    : activeTransform;

  const updateMotionTransform = (patch: Partial<ProjectLayerTransform>) => {
    if (motionIsMask && motionMaskSlot) {
      const nextMaskT = clampTransformValues(
        { ...motionTransform, ...patch },
        safeW,
        safeH
      );
      (window as any).__setVapMaskMotionTransform?.(motionMaskSlot.srcId, nextMaskT);
      return;
    }
    if (motionIsOverlay && motionOverlayLayer) {
      const nextOvT = clampTransformValues(
        { ...motionTransform, ...patch },
        safeW,
        safeH
      );
      onChangeState({
        ...composerState,
        activeTargetId: motionOverlayLayer.id,
        overlays: composerState.overlays.map((o) =>
          o.id === motionOverlayLayer.id ? { ...o, transform: nextOvT } : o
        ),
      });
      return;
    }
    const nextPrimT = clampTransformValues(
      { ...motionTransform, ...patch },
      safeW,
      safeH
    );
    onChangeState({
      ...composerState,
      activeTargetId: 'primary',
      primaryTransform: nextPrimT,
    });
  };

  const updateActiveTransform = (patch: Partial<ProjectLayerTransform>) => {
    const nextTransform = clampTransformValues(
      { ...activeTransform, ...patch },
      safeW,
      safeH
    );
    if (isEditingPrimary) {
      onChangeState({
        ...composerState,
        activeTargetId: 'primary',
        primaryTransform: nextTransform,
      });
    } else if (selectedOverlay) {
      onChangeState({
        ...composerState,
        activeTargetId: selectedOverlay.id,
        overlays: composerState.overlays.map((o) =>
          o.id === selectedOverlay.id ? { ...o, transform: nextTransform } : o
        ),
      });
    }
  };

  const handleNudge = (dx: number, dy: number) => {
    const nextTransform = nudgeLayerTransform(activeTransform, dx, dy, safeW, safeH);
    if (isEditingPrimary) {
      onChangeState({
        ...composerState,
        activeTargetId: 'primary',
        primaryTransform: nextTransform,
      });
    } else if (selectedOverlay) {
      onChangeState({
        ...composerState,
        activeTargetId: selectedOverlay.id,
        overlays: composerState.overlays.map((o) =>
          o.id === selectedOverlay.id ? { ...o, transform: nextTransform } : o
        ),
      });
    }
  };

  const updateSelectedOverlayMeta = (patch: Partial<SecondaryOverlayLayer>) => {
    if (!selectedOverlay) return;
    onChangeState({
      ...composerState,
      activeTargetId: selectedOverlay.id,
      overlays: composerState.overlays.map((o) =>
        o.id === selectedOverlay.id ? { ...o, ...patch } : o
      ),
    });
  };

  const handleSelectUnifiedItem = (item: UnifiedSelectionRef) => {
    setSelectedUnified(item);
    if (item.kind === 'primary') {
      setMotionTargetId('primary');
      onChangeState({ ...composerState, activeTargetId: 'primary' });
    } else if (item.kind === 'overlay') {
      setMotionTargetId(item.id);
      onChangeState({ ...composerState, activeTargetId: item.id });
    } else if (item.kind === 'mask') {
      setMotionTargetId(`mask:${item.id}`);
      (window as any).__selectVapMaskSlot?.(item.id);
    }
  };

  const handleJumpToTransform = async (item: UnifiedSelectionRef) => {
    if (item.kind === 'primary') {
      setMotionTargetId('primary');
      onChangeState({ ...composerState, activeTargetId: 'primary' });
      setActiveTab('primary');
    } else if (item.kind === 'overlay') {
      setMotionTargetId(item.id);
      onChangeState({ ...composerState, activeTargetId: item.id });
      setActiveTab('secondary');
    } else if (item.kind === 'mask') {
      (window as any).__selectVapMaskSlot?.(item.id);
      setActiveTab('masks');
    } else if (item.kind === 'asset') {
      const created = await (window as any).__promoteAssetToComposerLayer?.(item.id, true);
      if (created?.id) {
        setSelectedUnified({ kind: 'overlay', id: created.id });
        setMotionTargetId(created.id);
        setActiveTab('secondary');
      }
    } else if (item.kind === 'watermark') {
      const created = await (window as any).__promoteWatermarkToComposerLayer?.(item.id, true);
      if (created?.id) {
        setSelectedUnified({ kind: 'overlay', id: created.id });
        setMotionTargetId(created.id);
        setActiveTab('secondary');
      }
    }
  };

  const handleJumpToMotion = async (item: UnifiedSelectionRef) => {
    if (item.kind === 'primary') {
      onChangeState({ ...composerState, activeTargetId: 'primary' });
      setMotionTargetId('primary');
      setActiveTab('motion');
    } else if (item.kind === 'overlay') {
      onChangeState({ ...composerState, activeTargetId: item.id });
      setMotionTargetId(item.id);
      setActiveTab('motion');
    } else if (item.kind === 'mask') {
      (window as any).__selectVapMaskSlot?.(item.id);
      setMotionTargetId(`mask:${item.id}`);
      setActiveTab('motion');
    } else if (item.kind === 'asset') {
      const created = await (window as any).__promoteAssetToComposerLayer?.(item.id, true);
      if (created?.id) {
        setSelectedUnified({ kind: 'overlay', id: created.id });
        setMotionTargetId(created.id);
        setActiveTab('motion');
      }
    } else if (item.kind === 'watermark') {
      const created = await (window as any).__promoteWatermarkToComposerLayer?.(item.id, true);
      if (created?.id) {
        setSelectedUnified({ kind: 'overlay', id: created.id });
        setMotionTargetId(created.id);
        setActiveTab('motion');
      }
    }
  };

  const handleJumpToMask = (srcId?: string) => {
    if (srcId) {
      (window as any).__selectVapMaskSlot?.(srcId);
    }
    setActiveTab('masks');
  };

  const handleSwitchTab = (tab: 'all' | 'primary' | 'secondary' | 'masks' | 'stack' | 'motion') => {
    const prevTab = activeTab;
    setActiveTab(tab);
    if (tab === 'primary') {
      onChangeState({
        ...composerState,
        activeTargetId: 'primary',
      });
    } else if (tab === 'secondary') {
      const targetOv =
        composerState.overlays.find((o) => o.id === composerState.activeTargetId) ||
        composerState.overlays[0];
      if (targetOv) {
        onChangeState({
          ...composerState,
          activeTargetId: targetOv.id,
        });
      }
    } else if (tab === 'masks' || tab === 'motion' || tab === 'all') {
      const snap = (window as any).__getVapMasksSnapshot?.();
      if (snap) {
        setVapMasksSnap({
          slots: Array.isArray(snap.slots) ? snap.slots : [],
          detectedDummies: Array.isArray(snap.detectedDummies) ? snap.detectedDummies : [],
          silhouettes: snap.silhouettes || {},
          replacements: snap.replacements || {},
          bakeReplacedSlots: snap.bakeReplacedSlots !== false,
          selectedSrcId: snap.selectedSrcId || null,
          guidesEnabled: Boolean(snap.guidesEnabled),
          hasSource: Boolean(snap.hasSource),
        });
      }
      if (tab === 'motion') {
        if (selectedUnified.kind === 'mask' && selectedUnified.id) {
          setMotionTargetId(`mask:${selectedUnified.id}`);
        } else if (selectedUnified.kind === 'overlay' && composerState.overlays.some((o) => o.id === selectedUnified.id)) {
          setMotionTargetId(selectedUnified.id);
        } else if (prevTab === 'masks' && snap?.selectedSrcId) {
          setMotionTargetId(`mask:${String(snap.selectedSrcId)}`);
        } else if (prevTab === 'secondary' && composerState.activeTargetId !== 'primary') {
          setMotionTargetId(composerState.activeTargetId);
        } else if (motionTargetId.startsWith('mask:')) {
          const curMaskId = motionTargetId.slice(5);
          const stillExists = Array.isArray(snap?.slots) && snap.slots.some((s: any) => String(s.srcId) === curMaskId);
          if (!stillExists) setMotionTargetId('primary');
        } else if (motionTargetId !== 'primary' && !composerState.overlays.some((o) => o.id === motionTargetId)) {
          setMotionTargetId('primary');
        }
      }
    }
  };

  const triggerFileSelect = (replaceId?: string) => {
    replaceTargetIdRef.current = replaceId;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const repId = replaceTargetIdRef.current;
    replaceTargetIdRef.current = undefined;
    if (activeTab !== 'all') setActiveTab('secondary');
    await onUploadSecondaryFile(f, repId);
  };

  const isNarrowViewport = typeof window !== 'undefined' && window.innerWidth <= 820;
  const defaultStyle: React.CSSProperties = isNarrowViewport
    ? { left: '8px', right: '8px', top: '54px' }
    : panelPos
    ? { left: `${panelPos.x}px`, top: `${panelPos.y}px` }
    : isAr
    ? { left: '286px', top: '64px' }
    : { left: '286px', top: '64px' };

  return (
    <div
      id="projectComposerMenuPanel"
      role="dialog"
      aria-label={isAr ? 'قائمة تحريك ودمج المشاريع الاحترافية' : 'Project Transform & Overlay Studio'}
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        position: 'fixed',
        ...defaultStyle,
        width: '448px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'calc(100vh - 82px)',
        background: 'linear-gradient(180deg, #151726 0%, #0f111c 100%)',
        border: '1px solid rgba(154, 124, 255, 0.38)',
        borderRadius: '14px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        color: '#f1f5f9',
        fontFamily: 'inherit',
        overflow: 'hidden',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        id="secondaryProjectFileInput"
        hidden
        accept=".svga,.pag,.vap,.yyeva,.mp4,.webm,.mov,.gif,.webp,.apng,.png,.jpg,.jpeg,.json,.lottie,.svg,.zip"
        onChange={onFilePicked}
      />

      {/* Draggable Header */}
      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: rect.left,
            origY: rect.top,
          };
        }}
        style={{
          padding: '11px 14px',
          background: 'rgba(124, 92, 255, 0.12)',
          borderBottom: '1px solid rgba(154, 124, 255, 0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #7c5cff, #4f46e5)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              flexShrink: 0,
            }}
          >
            ✥
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#f8fafc',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {isAr ? 'قائمة تحريك المشروع ودمج الملفات' : 'Project Mover & Multi-File Studio'}
            </div>
            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
              {isAr
                ? `داخل المقاس الأساسي (${safeW} × ${safeH})`
                : `Inside base canvas (${safeW} × ${safeH})`}
            </div>
          </div>
        </div>
        <button
          type="button"
          id="closeComposerMenuBtn"
          onClick={onClose}
          title={isAr ? 'إغلاق القائمة' : 'Close menu'}
          aria-label={isAr ? 'إغلاق القائمة' : 'Close menu'}
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '7px',
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            color: '#cbd5e1',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Main Target Selector Tabs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '5px',
          padding: '10px 10px 6px',
          background: '#111320',
        }}
      >
        <button
          type="button"
          id="composerTabAllLayers"
          onClick={() => handleSwitchTab('all')}
          style={{
            padding: '7px 4px',
            borderRadius: '9px',
            fontSize: '10.5px',
            fontWeight: 800,
            cursor: 'pointer',
            border:
              activeTab === 'all'
                ? '1px solid #38bdf8'
                : '1px solid rgba(255, 255, 255, 0.08)',
            background:
              activeTab === 'all'
                ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.28), rgba(124, 92, 255, 0.24))'
                : '#171929',
            color: activeTab === 'all' ? '#ffffff' : '#bae6fd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            whiteSpace: 'nowrap',
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
            style={{ flexShrink: 0 }}
          >
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 12 12 17 22 12" />
            <polyline points="2 17 12 22 22 17" />
          </svg>
          <span>
            {isAr
              ? `كل العناصر (${(primaryInfo.hasSource ? 1 : 0) + composerState.overlays.length + vapMasksSnap.slots.length + watermarks.length + Object.keys(motionAssets).filter((k) => !watermarks.some((w) => w.imageKey === k) && !vapMasksSnap.slots.some((s: any) => s.assetKey === k)).length})`
              : `All Layers`}
          </span>
        </button>

        <button
          type="button"
          id="composerTabPrimary"
          onClick={() => handleSwitchTab('primary')}
          style={{
            padding: '7px 4px',
            borderRadius: '9px',
            fontSize: '10.5px',
            fontWeight: 700,
            cursor: 'pointer',
            border:
              activeTab === 'primary'
                ? '1px solid #9a7cff'
                : '1px solid rgba(255, 255, 255, 0.08)',
            background:
              activeTab === 'primary'
                ? 'linear-gradient(135deg, rgba(124, 92, 255, 0.28), rgba(79, 70, 229, 0.2))'
                : '#171929',
            color: activeTab === 'primary' ? '#ffffff' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>🎯</span>
          <span>{isAr ? 'الأساسي' : 'Main'}</span>
          {!isDefaultLayerTransform(composerState.primaryTransform) && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#34d399',
              }}
            />
          )}
        </button>

        <button
          type="button"
          id="composerTabSecondary"
          onClick={() => handleSwitchTab('secondary')}
          style={{
            padding: '7px 4px',
            borderRadius: '9px',
            fontSize: '10.5px',
            fontWeight: 700,
            cursor: 'pointer',
            border:
              activeTab === 'secondary'
                ? '1px solid #b79cff'
                : '1px solid rgba(255, 255, 255, 0.08)',
            background:
              activeTab === 'secondary'
                ? 'linear-gradient(135deg, rgba(183, 156, 255, 0.28), rgba(124, 92, 255, 0.2))'
                : '#171929',
            color: activeTab === 'secondary' ? '#ffffff' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>⚡</span>
          <span>
            {isAr
              ? `الطبقات (${composerState.overlays.length})`
              : `Layers (${composerState.overlays.length})`}
          </span>
        </button>

        <button
          type="button"
          id="composerTabMotion"
          onClick={() => handleSwitchTab('motion')}
          style={{
            padding: '7px 4px',
            borderRadius: '9px',
            fontSize: '10.5px',
            fontWeight: 700,
            cursor: 'pointer',
            border:
              activeTab === 'motion'
                ? '1px solid #38bdf8'
                : '1px solid rgba(255, 255, 255, 0.08)',
            background:
              activeTab === 'motion'
                ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.28), rgba(14, 165, 233, 0.2))'
                : '#171929',
            color: activeTab === 'motion' ? '#ffffff' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>⚡</span>
          <span>{isAr ? 'التحريك' : 'Motion'}</span>
        </button>

        <button
          type="button"
          id="composerTabMasks"
          onClick={() => handleSwitchTab('masks')}
          style={{
            padding: '7px 4px',
            borderRadius: '9px',
            fontSize: '10.5px',
            fontWeight: 700,
            cursor: 'pointer',
            border:
              activeTab === 'masks'
                ? '1px solid #d946ef'
                : '1px solid rgba(255, 255, 255, 0.08)',
            background:
              activeTab === 'masks'
                ? 'linear-gradient(135deg, rgba(217, 70, 239, 0.28), rgba(168, 85, 247, 0.2))'
                : '#171929',
            color: activeTab === 'masks' ? '#ffffff' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>🎭</span>
          <span>
            {isAr
              ? `الأقنعة (${vapMasksSnap.slots.length})`
              : `Masks (${vapMasksSnap.slots.length})`}
          </span>
        </button>

        <button
          type="button"
          id="composerTabStack"
          onClick={() => handleSwitchTab('stack')}
          style={{
            padding: '7px 4px',
            borderRadius: '9px',
            fontSize: '10.5px',
            fontWeight: 700,
            cursor: 'pointer',
            border:
              activeTab === 'stack'
                ? '1px solid #8b5cf6'
                : '1px solid rgba(255, 255, 255, 0.08)',
            background:
              activeTab === 'stack'
                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.28), rgba(109, 40, 217, 0.2))'
                : '#171929',
            color: activeTab === 'stack' ? '#ffffff' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>🥞</span>
          <span>{isAr ? 'الترتيب' : 'Stack'}</span>
        </button>
      </div>

      {/* Scrollable Body */}
      <div
        style={{
          padding: '10px 12px 14px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* Direct Mouse Drag & Scaling Toggle Bar */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '8px 10px',
            borderRadius: '8px',
            background: 'rgba(154, 124, 255, 0.07)',
            border: '1px solid rgba(154, 124, 255, 0.22)',
            fontSize: '11.5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#e2e8f0', fontWeight: 700 }}>
              {isAr
                ? '🖱️ التحريك والتكبير بالماوس على المعاينة'
                : '🖱️ Direct Drag & Scale on Stage'}
            </span>
            <input
              type="checkbox"
              id="composerDirectDragToggle"
              checked={composerState.directDragEnabled}
              onChange={(e) =>
                onChangeState({
                  ...composerState,
                  directDragEnabled: e.target.checked,
                })
              }
              style={{ width: '16px', height: '16px', accentColor: '#9a7cff', cursor: 'pointer' }}
            />
          </div>
          <div style={{ fontSize: '10.5px', color: '#c4b5fd', lineHeight: '1.4' }}>
            {isAr
              ? '💡 يمكنك تكبير وتصغير أي طبقة مضافة أو المشروع الأساسي مباشرة عبر عجلة الماوس (Wheel) أو بالضغط على زر Shift أثناء السحب بالماوس!'
              : '💡 Scale any layer up/down directly using mouse wheel scroll or Shift + Drag on preview stage!'}
          </div>
        </div>

        {/* Unified All Layers & Uploaded Assets Explorer */}
        {activeTab === 'all' && (
          <UnifiedLayersExplorer
            isAr={isAr}
            composerState={composerState}
            onChangeState={onChangeState}
            vapMasksSnap={vapMasksSnap}
            primaryInfo={primaryInfo}
            watermarks={watermarks}
            assets={motionAssets}
            selectedItem={selectedUnified}
            onSelectItem={handleSelectUnifiedItem}
            onJumpToTransform={handleJumpToTransform}
            onJumpToMotion={handleJumpToMotion}
            onJumpToMask={handleJumpToMask}
            onTriggerUploadOverlay={triggerFileSelect}
            onRemoveOverlay={onRemoveSecondaryFile}
            onOpenEdgeFeather={onOpenEdgeFeather}
            onOpenChromaKey={onOpenChromaKey}
            onOpenWatermark={onOpenWatermark}
            onOpenBatchOps={onOpenBatchOps}
          />
        )}

        {/* Secondary File Upload & Layer Selector Section (Always accessible in Secondary tab, plus quick button in Primary tab) */}
        {activeTab === 'motion' && (() => {
          const timelineInfo = (window as any).__getProjectTimelineInfo?.() || {
            totalFrames: 30,
            fps: 24,
            durationSec: 1.25,
          };
          const giftTotalFrames = Math.max(1, Number(timelineInfo.totalFrames) || 30);
          const giftFps = Math.max(1, Number(timelineInfo.fps) || 24);
          const giftDurSec = (giftTotalFrames / giftFps).toFixed(2);
          const visEnabled = Boolean(motionTransform.visibilityEnabled);
          const visStart = Math.max(0, Number(motionTransform.visibilityStartFrame ?? 0));
          const visEnd = Math.max(
            visStart,
            Number(motionTransform.visibilityEndFrame ?? Math.max(0, giftTotalFrames - 1))
          );

          const MOTION_PRESETS: Array<{ id: AnimationPreset; labelAr: string; labelEn: string; icon: string }> = [
            { id: 'none', labelAr: 'بدون تأثير', labelEn: 'None', icon: '⚪' },
            { id: 'flyInRight', labelAr: 'دخول من اليمين', labelEn: 'Fly In From Right', icon: '⬅️' },
            { id: 'flyInLeft', labelAr: 'دخول من اليسار', labelEn: 'Fly In From Left', icon: '➡️' },
            { id: 'swayRightLeft', labelAr: 'حركة يمين وشمال مستمرة', labelEn: 'Right ↔ Left Sway', icon: '↔️' },
            { id: 'windBreeze', labelAr: 'نسيم رياح يمين وشمال', labelEn: 'Wind Breeze Drift', icon: '🌬️' },
            { id: 'glideRightToLeft', labelAr: 'مرور عرضي يمين ← شمال', labelEn: 'Pass Right → Left', icon: '⏪' },
            { id: 'glideLeftToRight', labelAr: 'مرور عرضي شمال ← يمين', labelEn: 'Pass Left → Right', icon: '⏩' },
            { id: 'slideBounceRightLeft', labelAr: 'انزلاق وتمايل يمين وشمال', labelEn: 'Dual Slide Sway', icon: '🔄' },
            { id: 'dropFromTop', labelAr: 'سقوط من الأعلى', labelEn: 'Drop From Top', icon: '⬇️' },
            { id: 'riseFromBottom', labelAr: 'صعود فخم من الأسفل', labelEn: 'Rise From Bottom', icon: '⬆️' },
            { id: 'royalEntrance', labelAr: 'دخول ملكي سينمائي', labelEn: 'Royal Entrance', icon: '👑' },
            { id: 'zoomIn', labelAr: 'زوم سينمائي', labelEn: 'Cinematic Zoom', icon: '🌀' },
            { id: 'elasticBounce', labelAr: 'ارتداد مطاطي', labelEn: 'Elastic Bounce', icon: '🏀' },
            { id: 'rubberSnap', labelAr: 'تثبيت زنبركي سريع', labelEn: 'Rubber Snap', icon: '🎯' },
            { id: 'popPulse', labelAr: 'نبض وظهور مفاجئ', labelEn: 'Pop & Pulse', icon: '⚡' },
            { id: 'heartbeatPulse', labelAr: 'نبض قلب مستمر', labelEn: 'Heartbeat Loop', icon: '💓' },
            { id: 'breathingAura', labelAr: 'تنفس وحضور ناعم', labelEn: 'Breathing Aura', icon: '✨' },
            { id: 'floatingHover', labelAr: 'طفو وتحويم ناعم', labelEn: 'Floating Hover', icon: '☁️' },
            { id: 'orbitFloat', labelAr: 'حركة مدارية فخمة', labelEn: 'Orbit Float Loop', icon: '🪐' },
            { id: 'spinFade', labelAr: 'دوران وتلاشي', labelEn: 'Spin & Fade', icon: '💫' },
            { id: 'spiralZoom', labelAr: 'دوامة حلزونية', labelEn: 'Spiral Vortex', icon: '🌪️' },
            { id: 'slideFade', labelAr: 'انزلاق ناعم', labelEn: 'Smooth Slide', icon: '🌊' },
            { id: 'flip3DReveal', labelAr: 'انقلاب 3D ملكي', labelEn: '3D Flip Reveal', icon: '🃏' },
            { id: 'swingPendulum', labelAr: 'تأرجح بندول', labelEn: 'Swing Pendulum', icon: '🔔' },
            { id: 'shakeImpact', labelAr: 'اهتزاز وصدمة', labelEn: 'Shake Impact', icon: '💥' },
            { id: 'glowFlashReveal', labelAr: 'وميض وظهور فخم', labelEn: 'Flash Reveal', icon: '🌟' },
            { id: 'neonStrobe', labelAr: 'بريق احتفالي متواصل', labelEn: 'Luxury Shimmer Loop', icon: '🎇' },
          ];

          const resolvedSelectVal = motionIsMask
            ? `mask:${motionMaskSlot.srcId}`
            : motionIsOverlay && motionOverlayLayer
            ? motionOverlayLayer.id
            : 'primary';

          return (
          <div
            style={{
              padding: '12px',
              borderRadius: '10px',
              background: '#131222',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#e0f2fe' }}>
                {isAr ? '⚡ استوديو التحريك وفترة الظهور' : 'Motion, Mask & Visibility Studio'}
              </span>
              <button
                type="button"
                onClick={() => {
                  (window as any).__replayComposerMotion?.(
                    visEnabled ? visStart : (motionTransform.startFrame ?? 0)
                  );
                }}
                style={{
                  padding: '3px 9px',
                  borderRadius: '5px',
                  border: '1px solid #22c55e',
                  background: 'rgba(34, 197, 94, 0.2)',
                  color: '#bbf7d0',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title={isAr ? 'تشغيل وإعادة معاينة الحركة من البداية' : 'Replay motion preview'}
              >
                {isAr ? '▶ تشغيل المعاينة' : '▶ Replay'}
              </button>
            </div>

            {/* Unified Target Selector: Primary, Added Overlays/Frames, AND Dynamic Masks */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                padding: '8px',
                borderRadius: '8px',
                background: 'rgba(124, 92, 255, 0.1)',
                border: '1px solid rgba(167, 139, 250, 0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#ddd6fe' }}>
                  {isAr ? '🎯 العنصر المستهدف (مشروع / إطار / قناع):' : '🎯 Target Element:'}
                </span>
                <span style={{ fontSize: '9.5px', color: '#7dd3fc', fontVariantNumeric: 'tabular-nums' }}>
                  {isAr
                    ? `الهدية: ${giftTotalFrames} فريم (${giftDurSec}ث)`
                    : `Gift: ${giftTotalFrames}f (${giftDurSec}s)`}
                </span>
              </div>
              <select
                id="composerMotionTargetSelect"
                value={resolvedSelectVal}
                onChange={(e) => {
                  const val = e.target.value;
                  setMotionTargetId(val);
                  if (val === 'primary') {
                    onChangeState({ ...composerState, activeTargetId: 'primary' });
                  } else if (val.startsWith('mask:')) {
                    const sid = val.slice(5);
                    (window as any).__selectedVapMaskId = sid;
                  } else {
                    onChangeState({ ...composerState, activeTargetId: val });
                  }
                }}
                style={{
                  width: '100%',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#f8fafc',
                  background: '#17192d',
                  border: '1px solid rgba(167,139,250,0.45)',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                <option value="primary" style={{ background: '#131222', color: '#fff' }}>
                  {isAr ? '⭐ المشروع الأساسي الرئيسي' : '⭐ Main Project File'}
                </option>
                {composerState.overlays.map((ov) => (
                  <option key={ov.id} value={ov.id} style={{ background: '#131222', color: '#a7f3d0' }}>
                    {isAr ? `🖼️ إطار / طبقة: ${ov.name}` : `🖼️ Layer: ${ov.name}`}
                  </option>
                ))}
                {vapMasksSnap.slots.map((sl: any) => (
                  <option key={`mask_${sl.srcId}`} value={`mask:${sl.srcId}`} style={{ background: '#131222', color: '#f0abfc' }}>
                    {isAr
                      ? `🎭 قناع ${sl.isTextSlot ? 'اسم' : 'صورة'}: ${sl.srcTag}`
                      : `🎭 Mask: ${sl.srcTag}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Visibility Duration Window inside the Gift */}
            <div
              style={{
                padding: '9px 10px',
                borderRadius: '8px',
                background: visEnabled ? 'rgba(16, 185, 129, 0.1)' : '#171a2d',
                border: visEnabled
                  ? '1px solid rgba(16, 185, 129, 0.45)'
                  : '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 800, color: visEnabled ? '#6ee7b7' : '#e2e8f0' }}>
                    {isAr ? '⏱️ تحديد فترة الظهور داخل الهدية' : '⏱️ Visibility Duration Window'}
                  </span>
                  <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>
                    {isAr
                      ? 'اجعل القناع أو الإطار يظهر في مدة معينة ويختفي قبلها وبعدها'
                      : 'Show element only between specific frames/seconds inside the gift'}
                  </span>
                </div>
                <input
                  id="composerVisibilityEnabledCheckbox"
                  type="checkbox"
                  checked={visEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateMotionTransform({
                      visibilityEnabled: checked,
                      visibilityStartFrame: motionTransform.visibilityStartFrame ?? 0,
                      visibilityEndFrame:
                        motionTransform.visibilityEndFrame ?? Math.max(1, giftTotalFrames - 1),
                    });
                  }}
                  style={{ width: '16px', height: '16px', accentColor: '#10b981', cursor: 'pointer' }}
                />
              </label>

              {visEnabled && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '10.5px' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ color: '#a7f3d0', fontWeight: 700 }}>
                        {isAr ? `يظهر من فريم (${(visStart / giftFps).toFixed(2)}ث)` : `Show From (${(visStart / giftFps).toFixed(2)}s)`}
                      </span>
                      <input
                        id="composerVisibilityStartInput"
                        type="number"
                        min="0"
                        max={Math.max(0, giftTotalFrames - 1)}
                        value={visStart}
                        onChange={(e) => {
                          const sVal = Math.max(0, Number(e.target.value) || 0);
                          updateMotionTransform({
                            visibilityEnabled: true,
                            visibilityStartFrame: sVal,
                            visibilityEndFrame: Math.max(sVal, visEnd),
                          });
                        }}
                        style={{
                          background: '#0c0d16',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          color: '#fff',
                          textAlign: 'left',
                        }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span style={{ color: '#a7f3d0', fontWeight: 700 }}>
                        {isAr ? `يختفي بعد فريم (${(visEnd / giftFps).toFixed(2)}ث)` : `Hide After (${(visEnd / giftFps).toFixed(2)}s)`}
                      </span>
                      <input
                        id="composerVisibilityEndInput"
                        type="number"
                        min={visStart}
                        max={Math.max(giftTotalFrames - 1, 1200)}
                        value={visEnd}
                        onChange={(e) => {
                          const eVal = Math.max(visStart, Number(e.target.value) || 0);
                          updateMotionTransform({
                            visibilityEnabled: true,
                            visibilityStartFrame: visStart,
                            visibilityEndFrame: eVal,
                          });
                        }}
                        style={{
                          background: '#0c0d16',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          color: '#fff',
                          textAlign: 'left',
                        }}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                    {[
                      { labelAr: 'الكل', labelEn: 'Full', s: 0, e: Math.max(0, giftTotalFrames - 1) },
                      { labelAr: 'النصف 1', labelEn: '1st Half', s: 0, e: Math.max(1, Math.floor(giftTotalFrames / 2)) },
                      { labelAr: 'المنتصف', labelEn: 'Middle', s: Math.floor(giftTotalFrames * 0.2), e: Math.max(1, Math.floor(giftTotalFrames * 0.8)) },
                      { labelAr: 'النصف 2', labelEn: '2nd Half', s: Math.floor(giftTotalFrames * 0.45), e: Math.max(0, giftTotalFrames - 1) },
                    ].map((rng) => (
                      <button
                        key={rng.labelEn}
                        type="button"
                        onClick={() =>
                          updateMotionTransform({
                            visibilityEnabled: true,
                            visibilityStartFrame: rng.s,
                            visibilityEndFrame: rng.e,
                          })
                        }
                        style={{
                          padding: '3px 4px',
                          borderRadius: '5px',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          background: 'rgba(6, 78, 59, 0.35)',
                          color: '#a7f3d0',
                          fontSize: '9.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {isAr ? rng.labelAr : rng.labelEn}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Animation Presets Grid (16 Cinematic Presets) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
              {MOTION_PRESETS.map((preset) => {
                const active = (motionTransform.animationPreset || 'none') === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      updateMotionTransform({ animationPreset: preset.id });
                      if (preset.id !== 'none') {
                        setTimeout(() => {
                          (window as any).__replayComposerMotion?.(
                            visEnabled ? visStart : (motionTransform.startFrame ?? 0)
                          );
                        }, 20);
                      }
                    }}
                    style={{
                      padding: '7px 8px',
                      borderRadius: '7px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: isAr ? 'right' : 'left',
                      border: active ? '1px solid #38bdf8' : '1px solid #23273c',
                      background: active
                        ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.28), rgba(124, 92, 255, 0.2))'
                        : '#171929',
                      color: active ? '#f0f9ff' : '#cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>{preset.icon}</span>
                    <span>{isAr ? preset.labelAr : preset.labelEn}</span>
                  </button>
                );
              })}
            </div>

            {/* Link Frame and Layer Checkbox */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '8px',
                background: '#1a1d30',
                border: '1px solid #2b2f4c',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#f8fafc' }}>
                  {isAr ? '🔗 ربط الإطار والطبقة ككتلة واحدة' : 'Link Frame & Layer Together'}
                </span>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                  {isAr ? 'يضمن تحريك العنصر متزامناً مع حركة المشروع الرئيسي' : 'Synchronizes element with main project motion'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={motionTransform.linkFrameAndLayer !== false}
                onChange={(e) => updateMotionTransform({ linkFrameAndLayer: e.target.checked })}
                style={{ width: '16px', height: '16px', accentColor: '#38bdf8', cursor: 'pointer' }}
              />
            </div>

            {/* Animation Timing Frame Range */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ color: '#94a3b8' }}>{isAr ? 'بداية حركة الدخول (فريم)' : 'Anim Start Frame'}</span>
                <input
                  type="number"
                  min="0"
                  max="600"
                  value={motionTransform.startFrame ?? 0}
                  onChange={(e) => updateMotionTransform({ startFrame: Math.max(0, Number(e.target.value) || 0) })}
                  style={{
                    background: '#0c0d16',
                    border: '1px solid #2b2f4c',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    color: '#fff',
                    textAlign: 'left',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ color: '#94a3b8' }}>{isAr ? 'نهاية حركة الدخول (فريم)' : 'Anim End Frame'}</span>
                <input
                  type="number"
                  min="1"
                  max="1200"
                  value={motionTransform.endFrame ?? 30}
                  onChange={(e) => updateMotionTransform({ endFrame: Math.max(1, Number(e.target.value) || 30) })}
                  style={{
                    background: '#0c0d16',
                    border: '1px solid #2b2f4c',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    color: '#fff',
                    textAlign: 'left',
                  }}
                />
              </label>
            </div>

            {/* Custom Keyframe Waypoints Manager */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '10px',
                borderRadius: '8px',
                background: '#181a2e',
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#38bdf8' }}>
                  {isAr ? '📍 نقاط مسار الحركة (Keyframes & Waypoints)' : 'Motion Waypoints & Keyframes'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const wps = [...(motionTransform.motionWaypoints || [])];
                      const curFrame = Math.max(0, Math.round(Number((window as any).__getCurrentComposerFrame?.()) || 0));
                      if (wps.length === 0) {
                        wps.push({
                          frame: 0,
                          offsetX: motionTransform.offsetX,
                          offsetY: motionTransform.offsetY,
                          scale: motionTransform.scale,
                          rotation: motionTransform.rotation,
                          opacity: motionTransform.opacity,
                        });
                        wps.push({
                          frame: curFrame > 0 ? curFrame : 15,
                          offsetX: motionTransform.offsetX,
                          offsetY: motionTransform.offsetY,
                          scale: motionTransform.scale,
                          rotation: motionTransform.rotation,
                          opacity: motionTransform.opacity,
                        });
                      } else {
                        const lastF = wps[wps.length - 1].frame;
                        const nextFrame = curFrame > lastF ? curFrame : lastF + 10;
                        wps.push({
                          frame: nextFrame,
                          offsetX: motionTransform.offsetX,
                          offsetY: motionTransform.offsetY,
                          scale: motionTransform.scale,
                          rotation: motionTransform.rotation,
                          opacity: motionTransform.opacity,
                        });
                      }
                      updateMotionTransform({ motionWaypoints: wps });
                      setTimeout(() => {
                        (window as any).__replayComposerMotion?.(0);
                      }, 20);
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '5px',
                      border: '1px solid #38bdf8',
                      background: 'rgba(56, 189, 248, 0.2)',
                      color: '#bae6fd',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isAr ? '+ إضافة نقطة مسار' : '+ Add Waypoint'}
                  </button>
                  {Array.isArray(motionTransform.motionWaypoints) && motionTransform.motionWaypoints.length > 0 && (
                    <button
                      type="button"
                      onClick={() => updateMotionTransform({ motionWaypoints: [] })}
                      style={{
                        padding: '3px 6px',
                        borderRadius: '5px',
                        border: '1px solid rgba(239,68,68,0.45)',
                        background: 'rgba(239,68,68,0.16)',
                        color: '#fca5a5',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      title={isAr ? 'مسح كل النقاط' : 'Clear all waypoints'}
                    >
                      {isAr ? 'مسح' : 'Clear'}
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.3' }}>
                {isAr
                  ? 'أنشئ نقاط تحريك متتابعة عبر التايملاين مع إحداثيات الدقة والتكبير والدوران والشفافية لكل نقطة.'
                  : 'Create custom sequential waypoint keyframes across the timeline for precise position, scale, rotation and opacity.'}
              </div>

              {Array.isArray(motionTransform.motionWaypoints) && motionTransform.motionWaypoints.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '175px', overflowY: 'auto' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '42px 1fr 1fr 1fr 1fr 1fr 22px',
                      gap: '4px',
                      padding: '0 6px',
                      fontSize: '9.5px',
                      color: '#94a3b8',
                      textAlign: 'center',
                    }}
                  >
                    <span>{isAr ? 'فريم' : 'Frm'}</span>
                    <span>X</span>
                    <span>Y</span>
                    <span>{isAr ? 'حجم%' : 'Scale'}</span>
                    <span>{isAr ? 'دوران°' : 'Rot'}</span>
                    <span>{isAr ? 'شفاف%' : 'Op%'}</span>
                    <span></span>
                  </div>
                  {motionTransform.motionWaypoints.map((wp, wIdx) => (
                    <div
                      key={wIdx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '42px 1fr 1fr 1fr 1fr 1fr 22px',
                        gap: '4px',
                        alignItems: 'center',
                        padding: '4px 6px',
                        borderRadius: '6px',
                        background: '#121422',
                        border: '1px solid #23273c',
                        fontSize: '10px',
                      }}
                    >
                      <input
                        type="number"
                        value={wp.frame}
                        onChange={(e) => {
                          const wps = [...motionTransform.motionWaypoints!];
                          wps[wIdx] = { ...wp, frame: Math.max(0, Number(e.target.value) || 0) };
                          updateMotionTransform({ motionWaypoints: wps });
                        }}
                        style={{ background: '#0a0b12', border: '1px solid #2b2f4c', borderRadius: '4px', color: '#fff', padding: '2px', textAlign: 'center', fontSize: '10px' }}
                        title={isAr ? 'الفريم' : 'Frame'}
                      />
                      <input
                        type="number"
                        value={wp.offsetX}
                        onChange={(e) => {
                          const wps = [...motionTransform.motionWaypoints!];
                          wps[wIdx] = { ...wp, offsetX: Number(e.target.value) || 0 };
                          updateMotionTransform({ motionWaypoints: wps });
                        }}
                        style={{ background: '#0a0b12', border: '1px solid #2b2f4c', borderRadius: '4px', color: '#fff', padding: '2px', textAlign: 'center', fontSize: '10px' }}
                        title="X"
                      />
                      <input
                        type="number"
                        value={wp.offsetY}
                        onChange={(e) => {
                          const wps = [...motionTransform.motionWaypoints!];
                          wps[wIdx] = { ...wp, offsetY: Number(e.target.value) || 0 };
                          updateMotionTransform({ motionWaypoints: wps });
                        }}
                        style={{ background: '#0a0b12', border: '1px solid #2b2f4c', borderRadius: '4px', color: '#fff', padding: '2px', textAlign: 'center', fontSize: '10px' }}
                        title="Y"
                      />
                      <input
                        type="number"
                        value={wp.scale}
                        onChange={(e) => {
                          const wps = [...motionTransform.motionWaypoints!];
                          wps[wIdx] = { ...wp, scale: Math.max(5, Number(e.target.value) || 100) };
                          updateMotionTransform({ motionWaypoints: wps });
                        }}
                        style={{ background: '#0a0b12', border: '1px solid #2b2f4c', borderRadius: '4px', color: '#fff', padding: '2px', textAlign: 'center', fontSize: '10px' }}
                        title="Scale %"
                      />
                      <input
                        type="number"
                        value={wp.rotation}
                        onChange={(e) => {
                          const wps = [...motionTransform.motionWaypoints!];
                          wps[wIdx] = { ...wp, rotation: Number(e.target.value) || 0 };
                          updateMotionTransform({ motionWaypoints: wps });
                        }}
                        style={{ background: '#0a0b12', border: '1px solid #2b2f4c', borderRadius: '4px', color: '#fff', padding: '2px', textAlign: 'center', fontSize: '10px' }}
                        title={isAr ? 'دوران' : 'Rotation'}
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={wp.opacity}
                        onChange={(e) => {
                          const wps = [...motionTransform.motionWaypoints!];
                          wps[wIdx] = { ...wp, opacity: Math.max(0, Math.min(100, Number(e.target.value) ?? 100)) };
                          updateMotionTransform({ motionWaypoints: wps });
                        }}
                        style={{ background: '#0a0b12', border: '1px solid #2b2f4c', borderRadius: '4px', color: '#fff', padding: '2px', textAlign: 'center', fontSize: '10px' }}
                        title={isAr ? 'الشفافية %' : 'Opacity %'}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const wps = motionTransform.motionWaypoints!.filter((_, i) => i !== wIdx);
                          updateMotionTransform({ motionWaypoints: wps });
                        }}
                        style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '4px', color: '#fca5a5', cursor: 'pointer', fontSize: '11px', height: '20px', display: 'grid', placeItems: 'center' }}
                        title={isAr ? 'حذف النقطة' : 'Delete Waypoint'}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {activeTab === 'secondary' ? (
          <div
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: '#131222',
              border: '1px solid rgba(124, 92, 255, 0.32)',
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
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#ece3ff' }}>
                {isAr ? '⚡ إضافة صورة خارقة / ملف إضافي جديد' : '⚡ Add Super Image / Extra File'}
              </span>
              <button
                type="button"
                id="addSecondFileBtn"
                disabled={isUploadingOverlay}
                onClick={() => triggerFileSelect(undefined)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '7px',
                  border: '1px solid #b79cff',
                  background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
                  color: '#ffffff',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: isUploadingOverlay ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isUploadingOverlay
                  ? isAr
                    ? '⏳ جاري الإضافة...'
                    : '⏳ Loading...'
                  : isAr
                  ? '➕ إضافة صورة/ملف'
                  : '➕ Add Image/File'}
              </button>
            </div>

            <div style={{ fontSize: '10.5px', color: '#94a3b8', lineHeight: 1.4 }}>
              {isAr
                ? 'الصيغ المدعومة: PNG · JPG · WEBP · SVG · GIF · MP4 · WebM · SVGA · PAG · VAP · Lottie'
                : 'Supports: PNG · JPG · WEBP · SVG · GIF · MP4 · WebM · SVGA · PAG · VAP · Lottie'}
            </div>

            {composerState.overlays.length === 0 ? (
              <button
                type="button"
                id="emptyAddSecondFileCard"
                onClick={() => triggerFileSelect(undefined)}
                style={{
                  padding: '16px 12px',
                  borderRadius: '99px',
                  border: '1px dashed rgba(124, 92, 255, 0.5)',
                  background: 'rgba(124, 92, 255, 0.08)',
                  color: '#ece3ff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: '20px' }}>🖼️</span>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>
                  {isAr
                    ? 'اضغط هنا لرفع صورة خارقة / ملف إضافي جديد وتحريكه بحرية'
                    : 'Click here to upload a super image / extra file & move it freely'}
                </span>
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {composerState.overlays.map((ov, idx) => {
                  const isSel = selectedOverlay?.id === ov.id;
                  return (
                    <div
                      key={ov.id}
                      id={`composer_layer_row_${ov.id}`}
                      onClick={() =>
                        onChangeState({
                          ...composerState,
                          activeTargetId: ov.id,
                        })
                      }
                      style={{
                        padding: '7px 9px',
                        borderRadius: '8px',
                        border: isSel
                          ? '1px solid #7c5cff'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                        background: isSel ? 'rgba(124, 92, 255, 0.22)' : '#111320',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color: '#f8fafc',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {idx + 1}. {ov.name}
                        </div>
                        <div
                          style={{
                            fontSize: '10px',
                            color: '#94a3b8',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {ov.format} · {ov.width}×{ov.height} · {ov.zOrder === 'below' ? (isAr ? '⬇️ تحت المشروع' : 'Below') : (isAr ? '⬆️ فوق المشروع' : 'Above')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <button
                          type="button"
                          id={`composer_toggle_mask_${ov.id}`}
                          title={
                            ov.isVapMask
                              ? isAr
                                ? 'مُفعّل كقناع VAP (اضغط لإعادته طبقة عادية)'
                                : 'Active VAP Mask (click to unlink)'
                              : isAr
                              ? 'تحويل هذه الصورة إلى قناع VAP يتحرك بالماوس'
                              : 'Convert this image to a VAP Mask'
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            (window as any).__convertComposerLayerToVapMask?.(ov.id, !ov.isVapMask);
                          }}
                          style={{
                            padding: '3px 6px',
                            borderRadius: '5px',
                            border: ov.isVapMask
                              ? '1px solid #34d399'
                              : '1px solid rgba(168, 85, 247, 0.5)',
                            background: ov.isVapMask
                              ? 'rgba(16, 185, 129, 0.22)'
                              : 'rgba(139, 92, 246, 0.22)',
                            color: ov.isVapMask ? '#6ee7b7' : '#e9d5ff',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ov.isVapMask ? (isAr ? '✓ قناع' : '✓ Mask') : isAr ? '🎭 قناع' : '🎭 Mask'}
                        </button>
                        <button
                          type="button"
                          title={isAr ? 'رفع المستوى للأعلى' : 'Move Up'}
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeState(moveOverlayLayerUp(composerState, ov.id));
                            setTimeout(() => {
                              document.getElementById(`composer_layer_row_${ov.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                            }, 40);
                          }}
                          style={{
                            padding: '3px 5px',
                            borderRadius: '5px',
                            border: '1px solid rgba(255,255,255,0.14)',
                            background: '#1e2238',
                            color: '#f8fafc',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          ⬆️
                        </button>
                        <button
                          type="button"
                          title={isAr ? 'تنزيل المستوى للأسفل' : 'Move Down'}
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeState(moveOverlayLayerDown(composerState, ov.id));
                            setTimeout(() => {
                              document.getElementById(`composer_layer_row_${ov.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                            }, 40);
                          }}
                          style={{
                            padding: '3px 5px',
                            borderRadius: '5px',
                            border: '1px solid rgba(255,255,255,0.14)',
                            background: '#1e2238',
                            color: '#f8fafc',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          ⬇️
                        </button>
                        <button
                          type="button"
                          title={isAr ? 'استبدال الملف بملف آخر' : 'Replace file'}
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerFileSelect(ov.id);
                          }}
                          style={{
                            padding: '3px 5px',
                            borderRadius: '5px',
                            border: '1px solid rgba(255,255,255,0.14)',
                            background: '#1e2238',
                            color: '#cbd5e1',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          🔄
                        </button>
                        <button
                          type="button"
                          title={isAr ? 'حذف الملف المضاف' : 'Delete added file'}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveSecondaryFile(ov.id);
                          }}
                          style={{
                            padding: '3px 5px',
                            borderRadius: '5px',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#fca5a5',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {vapMasksSnap.slots.length > 0 && (
              <div
                style={{
                  marginTop: '6px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(168, 85, 247, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#e9d5ff' }}>
                    {isAr ? `🎭 الأقنعة النشطة (${vapMasksSnap.slots.length})` : `🎭 Active Masks (${vapMasksSnap.slots.length})`}
                  </span>
                  <button
                    type="button"
                    onClick={() => (window as any).__toggleVapMaskGuides?.()}
                    style={{
                      padding: '2px 7px',
                      borderRadius: '6px',
                      border: vapMasksSnap.guidesEnabled ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.14)',
                      background: vapMasksSnap.guidesEnabled ? 'rgba(56, 189, 248, 0.2)' : '#1a1c2e',
                      color: vapMasksSnap.guidesEnabled ? '#7dd3fc' : '#cbd5e1',
                      fontSize: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    {vapMasksSnap.guidesEnabled ? '👁️ إخفاء الحدود' : '👁️ تحريك بالماوس'}
                  </button>
                </div>
                {[...vapMasksSnap.slots].reverse().map((slot: any, idx: number, arr: any[]) => {
                  const isSelMask = String(vapMasksSnap.selectedSrcId || '') === String(slot.srcId);
                  const fRect = slot.defaultFrame || [0, 0, slot.w, slot.h];
                  return (
                    <div
                      key={slot.srcId}
                      onClick={() => (window as any).__selectVapMaskSlot?.(slot.srcId)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '7px',
                        border: isSelMask ? '1px solid #fbbf24' : '1px solid rgba(168, 85, 247, 0.25)',
                        background: isSelMask ? 'rgba(251, 191, 36, 0.1)' : '#101120',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: isSelMask ? '#fde68a' : '#f3e8ff' }}>
                          🎭 {slot.srcTag}{' '}
                          {Number(slot.z ?? 0) < 0 && (
                            <span style={{ fontSize: '9px', color: '#fbbf24' }}>({isAr ? 'خلف المشروع' : 'Behind'})</span>
                          )}
                        </div>
                        <div style={{ fontSize: '9.5px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                          {Math.round(fRect[2])}×{Math.round(fRect[3])} · ({Math.round(fRect[0])},{Math.round(fRect[1])})
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <button
                          type="button"
                          disabled={idx === 0}
                          title={isAr ? 'تقديم للأمام' : 'Bring Forward'}
                          onClick={(e) => {
                            e.stopPropagation();
                            (window as any).__reorderVapMaskSlot?.(slot.srcId, 'up');
                          }}
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '5px',
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: '#1b1d30',
                            color: idx === 0 ? '#4b5563' : '#f8fafc',
                            fontSize: '10px',
                            cursor: idx === 0 ? 'default' : 'pointer',
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={idx === arr.length - 1}
                          title={isAr ? 'تنزيل خلف القناع التالي' : 'Send Backward'}
                          onClick={(e) => {
                            e.stopPropagation();
                            (window as any).__reorderVapMaskSlot?.(slot.srcId, 'down');
                          }}
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '5px',
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: '#1b1d30',
                            color: idx === arr.length - 1 ? '#4b5563' : '#f8fafc',
                            fontSize: '10px',
                            cursor: idx === arr.length - 1 ? 'default' : 'pointer',
                          }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          title={isAr ? 'وضع خلف / أمام المشروع الرئيسي' : 'Toggle Behind Main Project'}
                          onClick={(e) => {
                            e.stopPropagation();
                            (window as any).__reorderVapMaskSlot?.(slot.srcId, 'toggleBehind');
                          }}
                          style={{
                            padding: '2px 5px',
                            height: '22px',
                            borderRadius: '5px',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            background: Number(slot.z ?? 0) < 0 ? 'rgba(251, 191, 36, 0.2)' : '#1b1d30',
                            color: '#fde68a',
                            fontSize: '9.5px',
                            cursor: 'pointer',
                          }}
                        >
                          {Number(slot.z ?? 0) < 0 ? '⬆️' : '⬇️'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'masks' ? (
          /* Unified Mask Control Bundle (التحكم الموحد في الأقنعة لجميع الصيغ) */
          (() => {
            const orderedMasks = [...vapMasksSnap.slots].reverse();
            const selSlot =
              orderedMasks.find(
                (s) => String(s.srcId) === String(vapMasksSnap.selectedSrcId || '')
              ) || orderedMasks[0] || null;
            const selRep = selSlot ? vapMasksSnap.replacements?.[selSlot.srcId] || {} : {};
            const selBand: MaskDepthBand = selSlot ? resolveMaskDepthBand(selSlot) : 'abovePrimary';
            const selFrame: [number, number, number, number] = selSlot?.defaultFrame || [
              0,
              0,
              Number(selSlot?.w) || 120,
              Number(selSlot?.h) || 120,
            ];
            const selFill = String(selSlot?.fillColor || 'transparent');
            const selIsColored = Boolean(parseHexColorRgb(selFill));
            const selShape =
              selSlot?.shapePreset || (selSlot?.isTextSlot ? 'roundedRect' : 'circle');
            const bandLabelAr: Record<MaskDepthBand, string> = {
              belowOverlays: 'خلف الإطارات والكل',
              behindPrimary: 'خلف الهدية الأساسية',
              abovePrimary: 'أمام الهدية (خلف الإطارات)',
              aboveOverlays: 'فوق كل الإطارات',
            };

            return (
              <div
                id="composerUnifiedMasksBundle"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '9px',
                }}
              >
                {/* Bundle Top Action Bar */}
                <div
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    background: 'linear-gradient(180deg, rgba(168,85,247,0.14), rgba(19,17,32,0.95))',
                    border: '1px solid rgba(192, 132, 252, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '7px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#f3e8ff' }}>
                      {isAr
                        ? `🎭 بند التحكم في الأقنعة (${vapMasksSnap.slots.length})`
                        : `🎭 Unified Mask Bundle (${vapMasksSnap.slots.length})`}
                    </span>
                    <button
                      type="button"
                      id="composerMaskGuidesBtn"
                      onClick={() => (window as any).__toggleVapMaskGuides?.()}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: vapMasksSnap.guidesEnabled
                          ? '1px solid #38bdf8'
                          : '1px solid rgba(255,255,255,0.14)',
                        background: vapMasksSnap.guidesEnabled
                          ? 'rgba(56, 189, 248, 0.22)'
                          : '#1a1c2e',
                        color: vapMasksSnap.guidesEnabled ? '#7dd3fc' : '#cbd5e1',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {vapMasksSnap.guidesEnabled
                        ? isAr
                          ? '👁️ إخفاء الحدود'
                          : '👁️ Hide Guides'
                        : isAr
                        ? '👁️ تحريك بالماوس'
                        : '👁️ Show Guides'}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button
                      type="button"
                      id="composerAddImgMaskBtn"
                      onClick={() =>
                        (window as any).__createQuickVapMask?.({
                          srcType: 'img',
                          band: 'behindPrimary',
                        })
                      }
                      style={{
                        padding: '6px 8px',
                        borderRadius: '7px',
                        border: '1px solid rgba(192, 132, 252, 0.5)',
                        background: 'rgba(139, 92, 246, 0.24)',
                        color: '#f3e8ff',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {isAr ? '➕ قناع صورة' : '➕ Image Mask'}
                    </button>
                    <button
                      type="button"
                      id="composerAddTxtMaskBtn"
                      onClick={() =>
                        (window as any).__createQuickVapMask?.({
                          srcType: 'txt',
                          band: 'behindPrimary',
                        })
                      }
                      style={{
                        padding: '6px 8px',
                        borderRadius: '7px',
                        border: '1px solid rgba(56, 189, 248, 0.5)',
                        background: 'rgba(14, 165, 233, 0.2)',
                        color: '#bae6fd',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {isAr ? '➕ قناع اسم' : '➕ Name Mask'}
                    </button>
                  </div>
                  <button
                    type="button"
                    id="composerAddSvgaInMasksBtn"
                    onClick={() => (window as any).__uploadSvgaFrameInMasksBundle?.()}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '7px',
                      border: '1px solid rgba(16, 185, 129, 0.5)',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#6ee7b7',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isAr ? '🟣 رفع ملف SVGA في خانة الأقنعة (إطار / هدية)' : '🟣 Upload SVGA in Masks Tab'}
                  </button>

                  {(() => {
                    const uploadedFrameOverlays = (composerState.overlays || []).filter(
                      (ov) => ov && !ov.isVapMask
                    );
                    if (uploadedFrameOverlays.length === 0) return null;
                    return (
                      <div
                        id="composerMasksUploadedFramesBox"
                        style={{
                          padding: '7px',
                          borderRadius: '8px',
                          background: 'rgba(6, 78, 59, 0.25)',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '5px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#6ee7b7' }}>
                            {isAr
                              ? `🟣 ملفات / إطارات SVGA المضافة (${uploadedFrameOverlays.length})`
                              : `🟣 Uploaded Frames / SVGA (${uploadedFrameOverlays.length})`}
                          </span>
                          {orderedMasks.length > 0 && (
                            <button
                              type="button"
                              id="composerLockMasksBehindSvgaBtn"
                              onClick={() => {
                                const moved =
                                  (window as any).__ensureMasksBehindAddedFrames?.('behindPrimary') || 0;
                                if (!moved) {
                                  (window as any).__ensureMasksBehindAddedFrames?.('abovePrimary');
                                }
                              }}
                              style={{
                                padding: '3px 7px',
                                borderRadius: '5px',
                                border: '1px solid rgba(251, 191, 36, 0.55)',
                                background: 'rgba(251, 191, 36, 0.16)',
                                color: '#fde68a',
                                fontSize: '9.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              {isAr ? '📌 تثبيت كل الأقنعة بالخلف' : '📌 Lock Masks Behind'}
                            </button>
                          )}
                        </div>

                        {uploadedFrameOverlays.map((ov) => {
                          const isVisible = ov.transform?.visible !== false;
                          const isAbove = ov.zOrder !== 'below';
                          return (
                            <div
                              key={`mask_tab_ov_${ov.id}`}
                              style={{
                                padding: '5px 6px',
                                borderRadius: '6px',
                                background: 'rgba(12, 16, 28, 0.88)',
                                border: '1px solid rgba(16, 185, 129, 0.28)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    color: '#ecfdf5',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {ov.name}
                                </div>
                                <div style={{ fontSize: '9.5px', color: '#a7f3d0' }}>
                                  {ov.format} · {ov.width}×{ov.height} ·{' '}
                                  {isAbove
                                    ? isAr
                                      ? '⬆️ أمام الأقنعة'
                                      : 'Above Masks'
                                    : isAr
                                    ? '⬇️ خلف المشروع'
                                    : 'Below Primary'}
                                </div>
                              </div>
                              <button
                                type="button"
                                title={
                                  isAbove
                                    ? isAr
                                      ? 'إرسال خلف الهدية الأساسية'
                                      : 'Send Below Primary'
                                    : isAr
                                    ? 'رفع أمام الهدية (فوق الأقنعة)'
                                    : 'Bring Above Primary'
                                }
                                onClick={() =>
                                  onChangeState(
                                    isAbove
                                      ? moveOverlayLayerDown(composerState, ov.id)
                                      : moveOverlayLayerUp(composerState, ov.id)
                                  )
                                }
                                style={{
                                  padding: '2px 5px',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(255,255,255,0.14)',
                                  background: '#171d31',
                                  color: '#f8fafc',
                                  fontSize: '9.5px',
                                  cursor: 'pointer',
                                }}
                              >
                                {isAbove ? '⬇️' : '⬆️'}
                              </button>
                              <button
                                type="button"
                                title={isAr ? 'تحريك وتحديد مدة الظهور' : 'Motion & Visibility'}
                                onClick={() => {
                                  setActiveTab('motion');
                                  setMotionTargetId(ov.id);
                                }}
                                style={{
                                  padding: '2px 5px',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(56,189,248,0.45)',
                                  background: 'rgba(56,189,248,0.16)',
                                  color: '#7dd3fc',
                                  fontSize: '9.5px',
                                  cursor: 'pointer',
                                }}
                              >
                                ⚡
                              </button>
                              <button
                                type="button"
                                title={isAr ? 'إظهار/إخفاء' : 'Show/Hide'}
                                onClick={() =>
                                  onChangeState({
                                    ...composerState,
                                    overlays: composerState.overlays.map((item) =>
                                      item.id === ov.id
                                        ? {
                                            ...item,
                                            transform: {
                                              ...item.transform,
                                              visible: !isVisible,
                                            },
                                          }
                                        : item
                                    ),
                                  })
                                }
                                style={{
                                  padding: '2px 5px',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(255,255,255,0.14)',
                                  background: isVisible ? 'rgba(16,185,129,0.18)' : '#171d31',
                                  color: isVisible ? '#6ee7b7' : '#64748b',
                                  fontSize: '9.5px',
                                  cursor: 'pointer',
                                }}
                              >
                                👁️
                              </button>
                              <button
                                type="button"
                                title={isAr ? 'حذف الملف' : 'Remove'}
                                onClick={() => onRemoveSecondaryFile(ov.id)}
                                style={{
                                  padding: '2px 5px',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(239,68,68,0.4)',
                                  background: 'rgba(239,68,68,0.15)',
                                  color: '#fca5a5',
                                  fontSize: '9.5px',
                                  cursor: 'pointer',
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      padding: '5px 8px',
                      borderRadius: '7px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontSize: '10.5px',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    <span>
                      {isAr
                        ? 'تضمين الصور المستبدلة داخل التصدير (Bake)'
                        : 'Bake replaced photos into exported file'}
                    </span>
                    <input
                      type="checkbox"
                      id="composerMaskBakeCheckbox"
                      checked={vapMasksSnap.bakeReplacedSlots}
                      onChange={(e) => (window as any).__setVapBakeReplaced?.(e.target.checked)}
                      style={{ accentColor: '#c084fc', cursor: 'pointer' }}
                    />
                  </label>
                </div>

                {/* Detected Dummy Masks Section */}
                {vapMasksSnap.detectedDummies.length > 0 && (
                  <div
                    style={{
                      padding: '8px',
                      borderRadius: '9px',
                      background: 'rgba(48, 12, 34, 0.55)',
                      border: '1px solid rgba(244, 114, 182, 0.42)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#f9a8d4' }}>
                      {isAr
                        ? `🎯 أقنعة وهمية مكتشفة تلقائياً (${vapMasksSnap.detectedDummies.length})`
                        : `🎯 Auto-Detected Dummy Masks (${vapMasksSnap.detectedDummies.length})`}
                    </div>
                    {vapMasksSnap.detectedDummies.map((dm: any) => (
                      <div
                        key={dm.id}
                        style={{
                          padding: '6px',
                          borderRadius: '7px',
                          background: 'rgba(15, 11, 20, 0.92)',
                          border: '1px solid rgba(244, 114, 182, 0.35)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '5px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {dm.thumbUrl && (
                            <img
                              src={dm.thumbUrl}
                              alt={dm.labelAr}
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '5px',
                                objectFit: 'contain',
                                border: '1px solid rgba(244,114,182,0.4)',
                                background: '#171723',
                              }}
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#fce7f3' }}>
                              {dm.labelAr}
                            </div>
                            <div style={{ fontSize: '9.5px', color: '#f472b6' }}>
                              {dm.frame?.[2]}×{dm.frame?.[3]} · ({dm.frame?.[0]},{dm.frame?.[1]})
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => (window as any).__convertVapDummyMask?.(dm.id, 'convert')}
                            style={{
                              flex: 1,
                              padding: '3px 6px',
                              borderRadius: '5px',
                              border: '1px solid rgba(168,85,247,0.5)',
                              background: 'rgba(139,92,246,0.22)',
                              color: '#e9d5ff',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            🎭 تحويل لقناع نظيف
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              (window as any).__convertVapDummyMask?.(dm.id, 'convertAndReplace')
                            }
                            style={{
                              flex: 1,
                              padding: '3px 6px',
                              borderRadius: '5px',
                              border: '1px solid rgba(16,185,129,0.45)',
                              background: 'rgba(16,185,129,0.18)',
                              color: '#a7f3d0',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            📁 إزالة + صورة
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              (window as any).__convertVapDummyMask?.(dm.id, 'eraseOnly')
                            }
                            style={{
                              padding: '3px 6px',
                              borderRadius: '5px',
                              border: '1px solid rgba(239,68,68,0.4)',
                              background: 'rgba(239,68,68,0.14)',
                              color: '#fca5a5',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            🧹 مسح
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unified Masks List with 4-Band Placement */}
                {orderedMasks.length === 0 ? (
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: '9px',
                      border: '1px dashed rgba(192, 132, 252, 0.35)',
                      background: 'rgba(19, 17, 32, 0.7)',
                      textAlign: 'center',
                      fontSize: '11px',
                      color: '#cbd5e1',
                    }}
                  >
                    {isAr
                      ? 'لا توجد أقنعة حالياً — اضغط (➕ قناع صورة) أو (➕ قناع اسم) أعلاه لإضافة قناع جديد متوافق مع SVGA و VAP.'
                      : 'No masks yet — click + Image Mask or + Name Mask above to add one.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {orderedMasks.map((slot: any, idx: number, arr: any[]) => {
                      const isSel = selSlot && String(selSlot.srcId) === String(slot.srcId);
                      const rep = vapMasksSnap.replacements?.[slot.srcId] || {};
                      const band = resolveMaskDepthBand(slot);
                      const fRect = slot.defaultFrame || [0, 0, slot.w, slot.h];
                      const thumbSrc =
                        (rep.active && rep.dataUrl) ||
                        vapMasksSnap.silhouettes?.[slot.srcId] ||
                        '';
                      const isBehind = band === 'belowOverlays' || band === 'behindPrimary';

                      return (
                        <div
                          key={`mask_bundle_row_${slot.srcId}`}
                          data-composer-mask-card={slot.srcId}
                          onClick={() => (window as any).__selectVapMaskSlot?.(slot.srcId)}
                          style={{
                            padding: '7px',
                            borderRadius: '9px',
                            border: isSel
                              ? '1px solid #fbbf24'
                              : '1px solid rgba(192, 132, 252, 0.25)',
                            background: isSel
                              ? 'rgba(251, 191, 36, 0.1)'
                              : 'rgba(14, 15, 27, 0.94)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '5px',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                (window as any).__uploadVapMaskPhoto?.(slot.srcId);
                              }}
                              title={isAr ? 'اضغط لرفع/استبدال صورة القناع' : 'Upload photo inside mask'}
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '6px',
                                overflow: 'hidden',
                                flexShrink: 0,
                                border: rep.active
                                  ? '1px solid #34d399'
                                  : '1px solid rgba(255,255,255,0.14)',
                                background: '#171723',
                                display: 'grid',
                                placeItems: 'center',
                              }}
                            >
                              {thumbSrc ? (
                                <img
                                  src={thumbSrc}
                                  alt={slot.srcTag}
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                />
                              ) : (
                                <span style={{ fontSize: '14px' }}>🎭</span>
                              )}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  color: isSel ? '#fde68a' : '#f3f4f6',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                }}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {slot.srcTag}
                                </span>
                                {rep.active && (
                                  <span
                                    style={{
                                      fontSize: '9px',
                                      background: 'rgba(16,185,129,0.2)',
                                      color: '#6ee7b7',
                                      padding: '0 4px',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    {isAr ? 'محمّل' : 'Loaded'}
                                  </span>
                                )}
                                {hasAnimatedMotion(slot.motionTransform) && (
                                  <span
                                    style={{
                                      fontSize: '9px',
                                      background: 'rgba(56,189,248,0.2)',
                                      color: '#7dd3fc',
                                      padding: '0 4px',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    ⚡
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: '9.5px',
                                  color: slot.isTextSlot ? '#38bdf8' : '#c084fc',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {slot.isTextSlot ? (isAr ? 'اسم' : 'Name') : isAr ? 'صورة' : 'Image'} ·{' '}
                                {Math.round(fRect[2])}×{Math.round(fRect[3])} ·{' '}
                                <span style={{ color: isBehind ? '#fde68a' : '#cbd5e1' }}>
                                  {bandLabelAr[band]}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <button
                                type="button"
                                disabled={idx === 0}
                                title={isAr ? 'تقديم للأمام' : 'Move Up'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  (window as any).__reorderVapMaskSlot?.(slot.srcId, 'up');
                                }}
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '5px',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  background: '#1b1d30',
                                  color: idx === 0 ? '#4b5563' : '#f8fafc',
                                  fontSize: '10px',
                                  cursor: idx === 0 ? 'default' : 'pointer',
                                }}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={idx === arr.length - 1}
                                title={isAr ? 'إنزال للخلف' : 'Move Down'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  (window as any).__reorderVapMaskSlot?.(slot.srcId, 'down');
                                }}
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '5px',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  background: '#1b1d30',
                                  color: idx === arr.length - 1 ? '#4b5563' : '#f8fafc',
                                  fontSize: '10px',
                                  cursor: idx === arr.length - 1 ? 'default' : 'pointer',
                                }}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                title={isAr ? 'رفع صورة داخل القناع' : 'Upload Photo'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  (window as any).__uploadVapMaskPhoto?.(slot.srcId);
                                }}
                                style={{
                                  padding: '0 6px',
                                  height: '22px',
                                  borderRadius: '5px',
                                  border: '1px solid rgba(168, 85, 247, 0.45)',
                                  background: 'rgba(139, 92, 246, 0.2)',
                                  color: '#e9d5ff',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                }}
                              >
                                📁
                              </button>
                              {rep.active && (
                                <button
                                  type="button"
                                  title={isAr ? 'مسح الصورة المستبدلة' : 'Clear Photo'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    (window as any).__clearVapMaskPhoto?.(slot.srcId);
                                  }}
                                  style={{
                                    padding: '0 5px',
                                    height: '22px',
                                    borderRadius: '5px',
                                    border: '1px solid rgba(251, 191, 36, 0.35)',
                                    background: 'rgba(251, 191, 36, 0.14)',
                                    color: '#fde68a',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  🧹
                                </button>
                              )}
                              <button
                                type="button"
                                title={isAr ? 'حذف القناع' : 'Delete Mask'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  (window as any).__deleteVapMaskSlot?.(slot.srcId);
                                }}
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '5px',
                                  border: '1px solid rgba(239,68,68,0.35)',
                                  background: 'rgba(239,68,68,0.14)',
                                  color: '#fca5a5',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          {/* 4-Band Placement Selector (Solves Behind-Added-Frame!) */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                            <span style={{ fontSize: '9.5px', color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {isAr ? 'طبقة العمق:' : 'Depth:'}
                            </span>
                            <select
                              data-composer-mask-depth={slot.srcId}
                              value={band}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                (window as any).__setVapMaskDepthBand?.(
                                  slot.srcId,
                                  e.target.value as MaskDepthBand
                                );
                              }}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                height: '24px',
                                padding: '0 6px',
                                borderRadius: '6px',
                                border: isBehind
                                  ? '1px solid rgba(251,191,36,0.45)'
                                  : '1px solid rgba(139,92,246,0.4)',
                                background: isBehind ? 'rgba(251,191,36,0.14)' : '#15182c',
                                color: isBehind ? '#fde68a' : '#f1f5f9',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              <option value="belowOverlays">
                                {isAr ? '⬇️⬇️ خلف الإطارات والكل' : '⬇️⬇️ Below Everything & Frames'}
                              </option>
                              <option value="behindPrimary">
                                {isAr ? '⬇️ خلف الهدية الأساسية' : '⬇️ Behind Main Gift'}
                              </option>
                              <option value="abovePrimary">
                                {isAr ? '⬆️ أمام الهدية (خلف الإطارات المضافة)' : '⬆️ Above Gift (Behind Added Frames)'}
                              </option>
                              <option value="aboveOverlays">
                                {isAr ? '🔝 فوق كل الإطارات والملفات' : '🔝 Above All Frames & Layers'}
                              </option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Selected Mask Properties Inspector */}
                {selSlot && (
                  <div
                    id="composerMaskInspector"
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      background: '#131526',
                      border: '1px solid rgba(251, 191, 36, 0.35)',
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
                        gap: '6px',
                      }}
                    >
                      <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#fde68a' }}>
                        {isAr ? `🎛️ تعديل القناع: ${selSlot.srcTag}` : `🎛️ Edit Mask: ${selSlot.srcTag}`}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          id="composerMaskMotionQuickBtn"
                          onClick={() => (window as any).__openComposerMotionForMask?.(selSlot.srcId)}
                          style={{
                            padding: '3px 7px',
                            borderRadius: '5px',
                            border: '1px solid rgba(56, 189, 248, 0.5)',
                            background: 'rgba(14, 165, 233, 0.2)',
                            color: '#bae6fd',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          ⚡ {isAr ? 'تحريك وفترة ظهور' : 'Motion & Timing'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, { reset: true })
                          }
                          style={{
                            padding: '3px 7px',
                            borderRadius: '5px',
                            border: '1px solid rgba(255,255,255,0.14)',
                            background: '#1c1e33',
                            color: '#fde68a',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          ↺ {isAr ? 'استعادة' : 'Reset'}
                        </button>
                      </div>
                    </div>

                    {/* Text input for Name Masks */}
                    {selSlot.isTextSlot && (
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder={isAr ? 'اكتب النص / الاسم هنا...' : 'Enter text...'}
                          defaultValue={selRep.text || ''}
                          onBlur={(e) => {
                            if (e.target.value.trim()) {
                              (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                                text: e.target.value.trim(),
                              });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                                text: (e.target as HTMLInputElement).value.trim(),
                              });
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '5px 8px',
                            borderRadius: '6px',
                            border: '1px solid #2e324a',
                            background: '#0e101c',
                            color: '#fff',
                            fontSize: '11px',
                          }}
                        />
                        <input
                          type="color"
                          defaultValue={selRep.textColor || selSlot.color || '#ffffff'}
                          title={isAr ? 'لون النص' : 'Text color'}
                          onChange={(e) =>
                            (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                              textColor: e.target.value,
                              text: selRep.text || 'Name',
                            })
                          }
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            border: '1px solid #2e324a',
                            background: 'transparent',
                            cursor: 'pointer',
                          }}
                        />
                      </div>
                    )}

                    {/* Shape + Fit + Fill Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px' }}>
                      <select
                        value={selShape}
                        onChange={(e) => {
                          const v = e.target.value as VapMaskShapePreset;
                          if (v === 'customImage') {
                            (window as any).__uploadVapMaskShapePng?.(selSlot.srcId);
                          } else {
                            (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                              shapePreset: v,
                            });
                          }
                        }}
                        style={{
                          padding: '5px 7px',
                          borderRadius: '6px',
                          border: '1px solid #2e324a',
                          background: '#0e101c',
                          color: '#f1f5f9',
                          fontSize: '10.5px',
                        }}
                      >
                        <option value="circle">⚪ دائرة</option>
                        <option value="roundedRect">▢ مستطيل دائري</option>
                        <option value="shield">🛡️ درع</option>
                        <option value="rect">⬜ مربع كامل</option>
                        <option value="customImage">🎭 شكل صورة PNG مخصصة</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => (window as any).__uploadVapMaskShapePng?.(selSlot.srcId)}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid rgba(56,189,248,0.45)',
                          background: 'rgba(14,165,233,0.16)',
                          color: '#bae6fd',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        🎭 شكل PNG
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <select
                        value={selRep.fitMode || selSlot.fitType || 'fitXY'}
                        onChange={(e) =>
                          (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                            fitMode: e.target.value,
                          })
                        }
                        style={{
                          padding: '4px 7px',
                          borderRadius: '6px',
                          border: '1px solid #2e324a',
                          background: '#0e101c',
                          color: '#f1f5f9',
                          fontSize: '10.5px',
                        }}
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="fitXY">FitXY</option>
                      </select>

                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '10.5px',
                          color: '#cbd5e1',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selRep.useMask !== false}
                          onChange={(e) =>
                            (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                              useMask: e.target.checked,
                            })
                          }
                        />
                        <span>{isAr ? 'قص مدمج' : 'Clip Mask'}</span>
                      </label>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() =>
                            (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                              fillColor: selIsColored ? 'transparent' : '#ec4899',
                            })
                          }
                          style={{
                            padding: '4px 7px',
                            borderRadius: '6px',
                            border: `1px solid ${selIsColored ? selFill : 'rgba(255,255,255,0.16)'}`,
                            background: selIsColored ? selFill : '#1a1d2e',
                            color: '#fff',
                            fontSize: '10px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {selIsColored ? (isAr ? 'لون محدد' : 'Colored') : isAr ? 'شفاف' : 'Transparent'}
                        </button>
                        <input
                          type="color"
                          value={selIsColored ? selFill : '#ec4899'}
                          onChange={(e) =>
                            (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                              fillColor: e.target.value,
                            })
                          }
                          title={isAr ? 'تخصيص لون طبقة القناع' : 'Custom Mask Fill Color'}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '5px',
                            border: '1px solid rgba(255,255,255,0.18)',
                            background: 'transparent',
                            cursor: 'pointer',
                          }}
                        />
                      </div>
                    </div>

                    {/* Coordinates & Nudge D-Pad for Mask */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
                      {(['X', 'Y', 'W', 'H'] as const).map((axis, ai) => (
                        <label key={axis} style={{ fontSize: '9.5px', color: '#94a3b8' }}>
                          {axis}
                          <input
                            type="number"
                            value={Math.round(selFrame[ai])}
                            min={ai >= 2 ? 8 : 0}
                            onChange={(e) => {
                              const next: [number, number, number, number] = [...selFrame] as any;
                              next[ai] = Number(e.target.value) || 0;
                              (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                                frame: next,
                              });
                            }}
                            style={{
                              width: '100%',
                              padding: '3px 5px',
                              marginTop: '2px',
                              borderRadius: '5px',
                              border: '1px solid #2e324a',
                              background: '#0e101c',
                              color: '#fff',
                              fontSize: '10.5px',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                        </label>
                      ))}
                    </div>

                    {/* Mini Nudge Pad for Selected Mask */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() =>
                          (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                            frame: [selFrame[0], selFrame[1] - stepPx, selFrame[2], selFrame[3]],
                          })
                        }
                        style={{
                          padding: '5px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: '#1c1f35',
                          color: '#fff',
                          fontSize: '10.5px',
                          cursor: 'pointer',
                        }}
                      >
                        ⬆️
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                            frame: [selFrame[0], selFrame[1] + stepPx, selFrame[2], selFrame[3]],
                          })
                        }
                        style={{
                          padding: '5px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: '#1c1f35',
                          color: '#fff',
                          fontSize: '10.5px',
                          cursor: 'pointer',
                        }}
                      >
                        ⬇️
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                            frame: [selFrame[0] + stepPx, selFrame[1], selFrame[2], selFrame[3]],
                          })
                        }
                        style={{
                          padding: '5px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: '#1c1f35',
                          color: '#fff',
                          fontSize: '10.5px',
                          cursor: 'pointer',
                        }}
                      >
                        ➡️
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          (window as any).__updateVapMaskSlotProps?.(selSlot.srcId, {
                            frame: [selFrame[0] - stepPx, selFrame[1], selFrame[2], selFrame[3]],
                          })
                        }
                        style={{
                          padding: '5px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: '#1c1f35',
                          color: '#fff',
                          fontSize: '10.5px',
                          cursor: 'pointer',
                        }}
                      >
                        ⬅️
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        ) : activeTab === 'stack' ? (
          /* Unified 7-Tier Stack Layer Tree Navigation View */
          <div
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: '#141628',
              border: '1px solid rgba(139, 92, 246, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#c4b5fd' }}>
                {isAr ? '🥞 الترتيب الموحد لطبقات التصميم والأقنعة' : '🥞 Unified Layer & Mask Stack'}
              </span>
              <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                {isAr ? 'أعلى القائمة = المقدمة' : 'Top = Frontmost'}
              </span>
            </div>

            {(() => {
              const allSlotsOrdered = [...vapMasksSnap.slots].reverse();
              const masksAboveOverlays = allSlotsOrdered.filter(
                (s) => resolveMaskDepthBand(s) === 'aboveOverlays'
              );
              const masksAbovePrimary = allSlotsOrdered.filter(
                (s) => resolveMaskDepthBand(s) === 'abovePrimary'
              );
              const masksBehindPrimary = allSlotsOrdered.filter(
                (s) => resolveMaskDepthBand(s) === 'behindPrimary'
              );
              const masksBelowOverlays = allSlotsOrdered.filter(
                (s) => resolveMaskDepthBand(s) === 'belowOverlays'
              );
              const visualStack = getUnifiedVisualLayerStack(
                composerState,
                isAr ? 'المشروع الأساسي الرئيسي' : 'Main Project File'
              );
              const aboveOverlays = visualStack.filter(
                (it) => it.type === 'overlay' && it.zOrder === 'above'
              );
              const primaryRow = visualStack.find((it) => it.type === 'primary');
              const belowOverlays = visualStack.filter(
                (it) => it.type === 'overlay' && it.zOrder === 'below'
              );

              const renderMaskBandGroup = (title: string, items: any[], accent: string) => {
                if (items.length === 0) return null;
                return (
                  <div
                    style={{
                      padding: '6px 7px',
                      borderRadius: '8px',
                      background: 'rgba(168, 85, 247, 0.08)',
                      border: `1px solid ${accent}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#e9d5ff' }}>
                      {title}
                    </div>
                    {items.map((slot: any) => {
                      const isSelMask =
                        String(vapMasksSnap.selectedSrcId || '') === String(slot.srcId);
                      const band = resolveMaskDepthBand(slot);
                      return (
                        <div
                          key={`stack_mask_${slot.srcId}`}
                          onClick={() => (window as any).__selectVapMaskSlot?.(slot.srcId)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '7px',
                            border: isSelMask
                              ? '1px solid #fbbf24'
                              : '1px solid rgba(255,255,255,0.08)',
                            background: isSelMask ? 'rgba(251, 191, 36, 0.12)' : '#101221',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            cursor: 'pointer',
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
                            <div
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: isSelMask ? '#fde68a' : '#f3e8ff',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              🎭 {slot.srcTag}
                            </div>
                            <div style={{ fontSize: '9.5px', color: '#94a3b8', flexShrink: 0 }}>
                              {slot.w}×{slot.h}
                            </div>
                          </div>
                          <select
                            data-stack-mask-depth={slot.srcId}
                            value={band}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              (window as any).__setVapMaskDepthBand?.(
                                slot.srcId,
                                e.target.value as MaskDepthBand
                              );
                            }}
                            style={{
                              width: '100%',
                              height: '23px',
                              padding: '0 6px',
                              borderRadius: '5px',
                              border: '1px solid rgba(168,85,247,0.35)',
                              background: '#17192c',
                              color: '#f1f5f9',
                              fontSize: '10px',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="belowOverlays">⬇️⬇️ خلف الإطارات والكل</option>
                            <option value="behindPrimary">⬇️ خلف الهدية الأساسية</option>
                            <option value="abovePrimary">⬆️ أمام الهدية (خلف الإطارات)</option>
                            <option value="aboveOverlays">🔝 فوق كل الإطارات والملفات</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                );
              };

              const renderComposerRow = (item: UnifiedStackItem) => {
                const isSel = composerState.activeTargetId === item.id;
                const isPrimary = item.type === 'primary';
                return (
                  <div
                    key={item.id}
                    id={`composer_stack_row_${item.id}`}
                    onClick={() =>
                      onChangeState({
                        ...composerState,
                        activeTargetId: item.id,
                      })
                    }
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: isSel
                        ? '1px solid #8b5cf6'
                        : isPrimary
                        ? '1px solid rgba(154, 124, 255, 0.3)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      background: isSel
                        ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.22), rgba(30, 27, 75, 0.4))'
                        : isPrimary
                        ? 'rgba(124, 92, 255, 0.09)'
                        : '#101221',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: isPrimary ? '#ddd6fe' : '#f8fafc',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        <span>{isPrimary ? '⭐' : '🧩'}</span>
                        <span>{item.name}</span>
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                        {isPrimary
                          ? isAr
                            ? 'المشروع الأساسي (المرجع المركزي للطبقات)'
                            : 'Main Gift Reference'
                          : `${item.format} · ${
                              item.zOrder === 'above'
                                ? isAr
                                  ? '⬆️ إطار / طبقة أمام المشروع'
                                  : '⬆️ Frame / Above Gift'
                                : isAr
                                ? '⬇️ طبقة خلف المشروع'
                                : '⬇️ Below Gift'
                            }`}
                      </div>
                    </div>

                    {!isPrimary && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <button
                          type="button"
                          title={isAr ? 'رفع مستوى للأعلى (⬆️)' : 'Move Layer Up'}
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeState(moveOverlayLayerUp(composerState, item.id));
                          }}
                          style={{
                            padding: '3px 6px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255,255,255,0.15)',
                            background: '#1e2035',
                            color: '#f8fafc',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          ⬆️
                        </button>
                        <button
                          type="button"
                          title={isAr ? 'تنزيل مستوى للأسفل (⬇️)' : 'Move Layer Down'}
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeState(moveOverlayLayerDown(composerState, item.id));
                          }}
                          style={{
                            padding: '3px 6px',
                            borderRadius: '4px',
                            border: '1px solid rgba(255,255,255,0.15)',
                            background: '#1e2035',
                            color: '#f8fafc',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          ⬇️
                        </button>
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {renderMaskBandGroup(
                    isAr ? '🔝 أقنعة فوق كل الإطارات' : '🔝 Masks Above Frames',
                    masksAboveOverlays,
                    'rgba(217, 70, 239, 0.35)'
                  )}
                  {aboveOverlays.map(renderComposerRow)}
                  {renderMaskBandGroup(
                    isAr
                      ? '⬆️ أقنعة أمام الهدية (تظهر خلف الإطارات المضافة أعلاه)'
                      : '⬆️ Masks Above Gift (Behind Added Frames)',
                    masksAbovePrimary,
                    'rgba(168, 85, 247, 0.3)'
                  )}
                  {primaryRow && renderComposerRow(primaryRow)}
                  {renderMaskBandGroup(
                    isAr ? '⬇️ أقنعة خلف الهدية الأساسية' : '⬇️ Masks Behind Main Gift',
                    masksBehindPrimary,
                    'rgba(251, 191, 36, 0.3)'
                  )}
                  {belowOverlays.map(renderComposerRow)}
                  {renderMaskBandGroup(
                    isAr ? '⬇️⬇️ أقنعة خلف الكل والإطارات السفلية' : '⬇️⬇️ Masks Below Everything',
                    masksBelowOverlays,
                    'rgba(251, 191, 36, 0.4)'
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          /* Quick Add Second File Banner while on Primary Tab */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: '8px',
              background: 'rgba(124, 92, 255, 0.1)',
              border: '1px solid rgba(124, 92, 255, 0.28)',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '11.5px', color: '#ece3ff', fontWeight: 600 }}>
              {composerState.overlays.length > 0
                ? isAr
                  ? `يوجد (${composerState.overlays.length}) صورة خارقة / ملف إضافي مضاف`
                  : `${composerState.overlays.length} super image / extra layer(s) active`
                : isAr
                ? 'هل تريد إضافة صورة خارقة أو ملف إضافي جديد؟'
                : 'Add a super image or extra layer?'}
            </span>
            <button
              type="button"
              id="quickAddSecondFileBtn"
              onClick={() => {
                triggerFileSelect(undefined);
              }}
              style={{
                padding: '4px 9px',
                borderRadius: '6px',
                border: '1px solid #b79cff',
                background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isAr ? '⚡ ➕ إضافة صورة خارقة / ملف' : '⚡ ➕ Add Super Image'}
            </button>
          </div>
        )}

        {/* Controls Section: Show on Primary/Secondary tab when editing Primary OR Secondary exists */}
        {(activeTab === 'primary' || activeTab === 'secondary') &&
          (isEditingPrimary || selectedOverlay) && (
          <>
            {/* Active Target Indicator */}
            <div
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                background: isEditingPrimary
                  ? 'rgba(124, 92, 255, 0.16)'
                  : 'rgba(183, 156, 255, 0.16)',
                border: isEditingPrimary
                  ? '1px solid rgba(154, 124, 255, 0.4)'
                  : '1px solid rgba(183, 156, 255, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11.5px',
                fontWeight: 700,
              }}
            >
              <span>
                {isEditingPrimary
                  ? isAr
                    ? '🎯 تتحكم الآن في: المشروع الأساسي'
                    : '🎯 Controlling: Main Project'
                  : isAr
                  ? `➕ تتحكم الآن في: ${selectedOverlay?.name}`
                  : `➕ Controlling: ${selectedOverlay?.name}`}
              </span>
              <span
                style={{
                  fontSize: '10.5px',
                  color: '#cbd5e1',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                X:{activeTransform.offsetX} · Y:{activeTransform.offsetY}
              </span>
            </div>

            {/* Interactive Directional Pad (تحريك للأعلى والأسفل واليمين واليسار) */}
            <div
              style={{
                padding: '10px',
                borderRadius: '10px',
                background: '#161829',
                border: '1px solid rgba(255, 255, 255, 0.07)',
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
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#e2e8f0' }}>
                  {isAr ? '🕹️ تحريك سريع للأعلى والأسفل والاتجاهات' : '🕹️ Directional Pad'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  {STEP_OPTIONS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStepPx(st)}
                      style={{
                        padding: '2px 5px',
                        borderRadius: '5px',
                        fontSize: '10px',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        cursor: 'pointer',
                        border:
                          stepPx === st
                            ? '1px solid #9a7cff'
                            : '1px solid rgba(255,255,255,0.1)',
                        background: stepPx === st ? '#7c5cff' : '#111320',
                        color: stepPx === st ? '#fff' : '#94a3b8',
                      }}
                    >
                      {st}px
                    </button>
                  ))}
                </div>
              </div>

              {/* D-Pad Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '6px',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  id="composerAlignTopBtn"
                  onClick={() =>
                    updateActiveTransform({ offsetY: -Math.round(safeH * 0.18) })
                  }
                  title={isAr ? 'رفع للجزء العلوي من المشروع' : 'Move to upper region'}
                  style={{
                    padding: '7px 6px',
                    borderRadius: '7px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: '#1d2036',
                    color: '#cbd5e1',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAr ? '⏫ أقصى الأعلى' : '⏫ Top Area'}
                </button>

                <button
                  type="button"
                  id="composerNudgeUpBtn"
                  onClick={() => handleNudge(0, -stepPx)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: '1px solid rgba(154, 124, 255, 0.5)',
                    background: 'linear-gradient(180deg, #2d2654, #1f1b3d)',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAr ? '⬆️ للأعلى' : '⬆️ Up'}
                </button>

                <button
                  type="button"
                  id="composerAlignBottomBtn"
                  onClick={() =>
                    updateActiveTransform({ offsetY: Math.round(safeH * 0.18) })
                  }
                  title={isAr ? 'خفض للجزء السفلي من المشروع' : 'Move to lower region'}
                  style={{
                    padding: '7px 6px',
                    borderRadius: '7px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: '#1d2036',
                    color: '#cbd5e1',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAr ? '⏬ أقصى الأسفل' : '⏬ Bottom Area'}
                </button>

                <button
                  type="button"
                  id="composerNudgeRightBtn"
                  onClick={() => handleNudge(isAr ? stepPx : -stepPx, 0)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.14)',
                    background: '#1f233a',
                    color: '#f1f5f9',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAr ? '➡️ يمين' : '⬅️ Left'}
                </button>

                <button
                  type="button"
                  id="composerCenterBtn"
                  onClick={() => updateActiveTransform({ offsetX: 0, offsetY: 0 })}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: '1px solid rgba(154, 124, 255, 0.45)',
                    background: 'rgba(124, 92, 255, 0.18)',
                    color: '#f3e8ff',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAr ? '🎯 توسيط' : '🎯 Center'}
                </button>

                <button
                  type="button"
                  id="composerNudgeLeftBtn"
                  onClick={() => handleNudge(isAr ? -stepPx : stepPx, 0)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.14)',
                    background: '#1f233a',
                    color: '#f1f5f9',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAr ? '⬅️ يسار' : '➡️ Right'}
                </button>

                <div />
                <button
                  type="button"
                  id="composerNudgeDownBtn"
                  onClick={() => handleNudge(0, stepPx)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: '1px solid rgba(154, 124, 255, 0.5)',
                    background: 'linear-gradient(180deg, #2d2654, #1f1b3d)',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAr ? '⬇️ للأسفل' : '⬇️ Down'}
                </button>
                <div />
              </div>
            </div>

            {/* Sliders & Numeric Inputs for Y (Up/Down), X (Left/Right), Scale, Rotation, Opacity */}
            <div
              style={{
                padding: '10px',
                borderRadius: '10px',
                background: '#161829',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
              }}
            >
              {/* Y Offset (Up / Down) */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                    fontSize: '11.5px',
                  }}
                >
                  <label htmlFor="composerOffsetYInput" style={{ fontWeight: 700, color: '#e2e8f0' }}>
                    {isAr ? '↕️ التحريك للأعلى وللأسفل (Y)' : '↕️ Vertical Position (Y)'}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      id="composerOffsetYInput"
                      type="number"
                      value={activeTransform.offsetY}
                      onChange={(e) =>
                        updateActiveTransform({ offsetY: Number(e.target.value) || 0 })
                      }
                      style={{
                        width: '68px',
                        padding: '2px 6px',
                        borderRadius: '5px',
                        border: '1px solid #2e324a',
                        background: '#0f111c',
                        color: '#fff',
                        fontSize: '11.5px',
                        fontVariantNumeric: 'tabular-nums',
                        textAlign: 'center',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => updateActiveTransform({ offsetY: 0 })}
                      title={isAr ? 'تصفير Y' : 'Reset Y'}
                      style={{
                        padding: '2px 6px',
                        borderRadius: '5px',
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#1e2238',
                        color: '#cbd5e1',
                        fontSize: '10.5px',
                        cursor: 'pointer',
                      }}
                    >
                      0
                    </button>
                  </div>
                </div>
                <input
                  id="composerOffsetYRange"
                  type="range"
                  min={-safeH}
                  max={safeH}
                  step={1}
                  value={activeTransform.offsetY}
                  onChange={(e) =>
                    updateActiveTransform({ offsetY: Number(e.target.value) || 0 })
                  }
                  style={{ width: '100%', accentColor: '#9a7cff', cursor: 'pointer' }}
                />
              </div>

              {/* X Offset (Left / Right) */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                    fontSize: '11.5px',
                  }}
                >
                  <label htmlFor="composerOffsetXInput" style={{ fontWeight: 700, color: '#e2e8f0' }}>
                    {isAr ? '↔️ التحريك يمين ويسار (X)' : '↔️ Horizontal Position (X)'}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      id="composerOffsetXInput"
                      type="number"
                      value={activeTransform.offsetX}
                      onChange={(e) =>
                        updateActiveTransform({ offsetX: Number(e.target.value) || 0 })
                      }
                      style={{
                        width: '68px',
                        padding: '2px 6px',
                        borderRadius: '5px',
                        border: '1px solid #2e324a',
                        background: '#0f111c',
                        color: '#fff',
                        fontSize: '11.5px',
                        fontVariantNumeric: 'tabular-nums',
                        textAlign: 'center',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => updateActiveTransform({ offsetX: 0 })}
                      title={isAr ? 'تصفير X' : 'Reset X'}
                      style={{
                        padding: '2px 6px',
                        borderRadius: '5px',
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#1e2238',
                        color: '#cbd5e1',
                        fontSize: '10.5px',
                        cursor: 'pointer',
                      }}
                    >
                      0
                    </button>
                  </div>
                </div>
                <input
                  id="composerOffsetXRange"
                  type="range"
                  min={-safeW}
                  max={safeW}
                  step={1}
                  value={activeTransform.offsetX}
                  onChange={(e) =>
                    updateActiveTransform({ offsetX: Number(e.target.value) || 0 })
                  }
                  style={{ width: '100%', accentColor: '#9a7cff', cursor: 'pointer' }}
                />
              </div>

              {/* Scale (%) */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                    fontSize: '11.5px',
                  }}
                >
                  <label htmlFor="composerScaleInput" style={{ fontWeight: 700, color: '#e2e8f0' }}>
                    {isAr ? '🔍 التحكم في الحجم (%)' : '🔍 Scale (%)'}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      id="composerScaleInput"
                      type="number"
                      min={5}
                      max={500}
                      value={activeTransform.scale}
                      onChange={(e) =>
                        updateActiveTransform({ scale: Number(e.target.value) || 100 })
                      }
                      style={{
                        width: '68px',
                        padding: '2px 6px',
                        borderRadius: '5px',
                        border: '1px solid #2e324a',
                        background: '#0f111c',
                        color: '#fff',
                        fontSize: '11.5px',
                        fontVariantNumeric: 'tabular-nums',
                        textAlign: 'center',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => updateActiveTransform({ scale: 100 })}
                      style={{
                        padding: '2px 6px',
                        borderRadius: '5px',
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#1e2238',
                        color: '#cbd5e1',
                        fontSize: '10.5px',
                        cursor: 'pointer',
                      }}
                    >
                      100%
                    </button>
                  </div>
                </div>
                <input
                  id="composerScaleRange"
                  type="range"
                  min={10}
                  max={300}
                  step={1}
                  value={activeTransform.scale}
                  onChange={(e) =>
                    updateActiveTransform({ scale: Number(e.target.value) || 100 })
                  }
                  style={{ width: '100%', accentColor: '#9a7cff', cursor: 'pointer' }}
                />
              </div>

              {/* Rotation & Opacity Compact Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      marginBottom: '3px',
                    }}
                  >
                    <label htmlFor="composerRotationRange">{isAr ? '🔄 الدوران' : '🔄 Rotate'}</label>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: '#cbd5e1' }}>
                      {activeTransform.rotation}°
                    </span>
                  </div>
                  <input
                    id="composerRotationRange"
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={activeTransform.rotation}
                    onChange={(e) =>
                      updateActiveTransform({ rotation: Number(e.target.value) || 0 })
                    }
                    style={{ width: '100%', accentColor: '#9a7cff', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      marginBottom: '3px',
                    }}
                  >
                    <label htmlFor="composerOpacityRange">{isAr ? '💧 الشفافية' : '💧 Opacity'}</label>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: '#cbd5e1' }}>
                      {activeTransform.opacity}%
                    </span>
                  </div>
                  <input
                    id="composerOpacityRange"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={activeTransform.opacity}
                    onChange={(e) =>
                      updateActiveTransform({ opacity: Number(e.target.value) ?? 100 })
                    }
                    style={{ width: '100%', accentColor: '#9a7cff', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Flip & Visibility Row */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => updateActiveTransform({ flipH: !activeTransform.flipH })}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: '7px',
                    border: activeTransform.flipH
                      ? '1px solid #9a7cff'
                      : '1px solid rgba(255,255,255,0.1)',
                    background: activeTransform.flipH
                      ? 'rgba(124, 92, 255, 0.22)'
                      : '#111320',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAr ? '↔️ عكس أفقي' : '↔️ Flip H'}
                </button>
                <button
                  type="button"
                  onClick={() => updateActiveTransform({ flipV: !activeTransform.flipV })}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: '7px',
                    border: activeTransform.flipV
                      ? '1px solid #9a7cff'
                      : '1px solid rgba(255,255,255,0.1)',
                    background: activeTransform.flipV
                      ? 'rgba(124, 92, 255, 0.22)'
                      : '#111320',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? '↕️ عكس عمودي' : '↕️ Flip V'}
                </button>
                <button
                  type="button"
                  onClick={() => updateActiveTransform({ visible: !activeTransform.visible })}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '7px',
                    border: activeTransform.visible
                      ? '1px solid rgba(154, 124, 255, 0.45)'
                      : '1px solid rgba(239, 68, 68, 0.4)',
                    background: activeTransform.visible
                      ? 'rgba(124, 92, 255, 0.2)'
                      : 'rgba(239, 68, 68, 0.14)',
                    color: activeTransform.visible ? '#f3e8ff' : '#fca5a5',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {activeTransform.visible
                    ? isAr
                      ? '👁️ ظاهر'
                      : '👁️ Visible'
                    : isAr
                    ? '🚫 مخفي'
                    : '🚫 Hidden'}
                </button>
              </div>
            </div>

            {/* Extra Layer Options for Secondary Overlay File */}
            {!isEditingPrimary && selectedOverlay && (
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: '#131222',
                  border: '1px solid rgba(124, 92, 255, 0.32)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#ece3ff' }}>
                  {isAr ? '⚙️ إعدادات دمج الملف الثاني مع المشروع' : '⚙️ Second File Layer Options'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px' }}>
                  <button
                    type="button"
                    title={isAr ? 'إرسال للقمة في المقدمة (فوق كل الطبقات)' : 'Bring to Front'}
                    onClick={() => onChangeState(moveOverlayLayerToTop(composerState, selectedOverlay.id))}
                    style={{
                      padding: '5px 4px',
                      borderRadius: '6px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid rgba(124, 92, 255, 0.45)',
                      background: 'rgba(124, 92, 255, 0.22)',
                      color: '#ece3ff',
                    }}
                  >
                    🔝 {isAr ? 'المقدمة' : 'Front'}
                  </button>

                  <button
                    type="button"
                    title={isAr ? 'رفع مستوى واحد للأعلى (عبر الطبقات والمشروع الرئيسي)' : 'Move Up 1 Level'}
                    onClick={() => onChangeState(moveOverlayLayerUp(composerState, selectedOverlay.id))}
                    style={{
                      padding: '5px 4px',
                      borderRadius: '6px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      background: '#1c1f33',
                      color: '#f8fafc',
                    }}
                  >
                    ⬆️ {isAr ? 'رفع' : 'Up 1'}
                  </button>

                  <button
                    type="button"
                    title={isAr ? 'تنزيل مستوى واحد للأسفل (عبر الطبقات والمشروع الرئيسي)' : 'Move Down 1 Level'}
                    onClick={() => onChangeState(moveOverlayLayerDown(composerState, selectedOverlay.id))}
                    style={{
                      padding: '5px 4px',
                      borderRadius: '6px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      background: '#1c1f33',
                      color: '#f8fafc',
                    }}
                  >
                    ⬇️ {isAr ? 'تنزيل' : 'Down 1'}
                  </button>

                  <button
                    type="button"
                    title={isAr ? 'إرسال للقاع في الخلفية (تحت كل الطبقات)' : 'Send to Back'}
                    onClick={() => onChangeState(moveOverlayLayerToBottom(composerState, selectedOverlay.id))}
                    style={{
                      padding: '5px 4px',
                      borderRadius: '6px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      background: '#111322',
                      color: '#94a3b8',
                    }}
                  >
                    ⬇️⬇️ {isAr ? 'الخلفية' : 'Back'}
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    fontSize: '11.5px',
                  }}
                >
                  <label htmlFor="composerOverlayFitSelect" style={{ color: '#cbd5e1' }}>
                    {isAr ? 'ملاءمة أبعاد الملف الثاني:' : 'Fit Mode:'}
                  </label>
                  <select
                    id="composerOverlayFitSelect"
                    value={selectedOverlay.fitMode}
                    onChange={(e) =>
                      updateSelectedOverlayMeta({
                        fitMode: e.target.value as OverlayFitMode,
                      })
                    }
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #2e324a',
                      background: '#0f111c',
                      color: '#f1f5f9',
                      fontSize: '11px',
                    }}
                  >
                    <option value="contain">
                      {isAr ? 'احتواء متناسب (Contain)' : 'Contain'}
                    </option>
                    <option value="stretch">
                      {isAr ? 'تمدد كامل (Stretch)' : 'Stretch'}
                    </option>
                    <option value="cover">{isAr ? 'تغطية (Cover)' : 'Cover'}</option>
                    <option value="original">
                      {isAr ? 'المقاس الأصلي (1:1)' : 'Original 1:1'}
                    </option>
                  </select>
                </div>

                {/^(VAP|YYEVA|MP4|WEBM|MOV)$/i.test(selectedOverlay.format) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      fontSize: '11.5px',
                    }}
                  >
                    <label htmlFor="composerOverlayAlphaSelect" style={{ color: '#cbd5e1' }}>
                      {isAr ? 'شفافية الفيديو المضاف:' : 'Video Alpha:'}
                    </label>
                    <select
                      id="composerOverlayAlphaSelect"
                      value={selectedOverlay.alphaMode}
                      onChange={(e) =>
                        updateSelectedOverlayMeta({
                          alphaMode: e.target.value as OverlayAlphaMode,
                        })
                      }
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #2e324a',
                        background: '#0f111c',
                        color: '#f1f5f9',
                        fontSize: '11px',
                      }}
                    >
                      <option value="auto">
                        {isAr ? 'تلقائي (VAP / YYEVA)' : 'Auto (VAP / YYEVA)'}
                      </option>
                      <option value="none">{isAr ? 'بدون قناع ألفا' : 'Normal Video'}</option>
                      <option value="right">{isAr ? 'الشفافية يمين' : 'Alpha Right'}</option>
                      <option value="left">{isAr ? 'الشفافية يسار' : 'Alpha Left'}</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Reset Active Target Button */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                id="composerResetActiveBtn"
                onClick={() => updateActiveTransform({ ...DEFAULT_LAYER_TRANSFORM })}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  background: '#1a1d30',
                  color: '#e2e8f0',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isEditingPrimary
                  ? isAr
                    ? '↺ استعادة موضع المشروع الأساسي'
                    : '↺ Reset Main Project Position'
                  : isAr
                  ? '↺ استعادة موضع الملف الثاني'
                  : '↺ Reset Second File Position'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProjectComposerPanel;

