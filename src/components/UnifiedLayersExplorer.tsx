import React, { useState } from 'react';
import {
  ProjectComposerState,
  SecondaryOverlayLayer,
  hasAnimatedMotion,
  moveOverlayLayerDown,
  moveOverlayLayerUp,
} from '../utils/projectComposer';
import { MaskDepthBand, resolveMaskDepthBand } from '../utils/vapDynamicMaskPacking';

export type UnifiedLayerKind = 'primary' | 'overlay' | 'mask' | 'watermark' | 'asset';

export interface UnifiedSelectionRef {
  kind: UnifiedLayerKind;
  id: string;
}

export interface PrimaryProjectSnapshot {
  hasSource: boolean;
  name: string;
  format: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  thumb: string;
}

export interface WatermarkLayerSnapshot {
  imageKey: string;
  text?: string;
  dataUrl: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

interface UnifiedLayersExplorerProps {
  isAr: boolean;
  composerState: ProjectComposerState;
  onChangeState: (next: ProjectComposerState) => void;
  vapMasksSnap: {
    slots: any[];
    silhouettes: Record<string, string>;
    replacements: Record<string, any>;
    selectedSrcId: string | null;
    guidesEnabled: boolean;
  };
  primaryInfo: PrimaryProjectSnapshot;
  watermarks: WatermarkLayerSnapshot[];
  assets: Record<string, string>;
  selectedItem: UnifiedSelectionRef;
  onSelectItem: (item: UnifiedSelectionRef) => void;
  onJumpToTransform: (item: UnifiedSelectionRef) => void;
  onJumpToMotion: (item: UnifiedSelectionRef) => Promise<void> | void;
  onJumpToMask: (srcId?: string) => void;
  onTriggerUploadOverlay: (replaceId?: string) => void;
  onRemoveOverlay: (id: string) => void;
  onOpenEdgeFeather?: () => void;
  onOpenChromaKey?: () => void;
  onOpenWatermark?: () => void;
  onOpenBatchOps?: () => void;
}

type CategoryFilter = 'all' | 'uploads' | 'masks' | 'watermarks' | 'assets';
type PreviewBgMode = 'checker' | 'dark' | 'light';

const CHECKER_BG =
  'repeating-conic-gradient(#26293d 0% 25%, #191b2b 0% 50%) 50% / 14px 14px';

export const UnifiedLayersExplorer: React.FC<UnifiedLayersExplorerProps> = ({
  isAr,
  composerState,
  onChangeState,
  vapMasksSnap,
  primaryInfo,
  watermarks,
  assets,
  selectedItem,
  onSelectItem,
  onJumpToTransform,
  onJumpToMotion,
  onJumpToMask,
  onTriggerUploadOverlay,
  onRemoveOverlay,
  onOpenEdgeFeather,
  onOpenChromaKey,
  onOpenWatermark,
  onOpenBatchOps,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [previewBg, setPreviewBg] = useState<PreviewBgMode>('checker');
  const [busyAction, setBusyAction] = useState(false);

  const wmKeySet = new Set(watermarks.map((w) => w.imageKey));
  const maskAssetKeySet = new Set(
    (vapMasksSnap.slots || []).map((s: any) => s.assetKey).filter(Boolean)
  );
  const embeddedAssetKeys = Object.keys(assets).filter(
    (k) => !wmKeySet.has(k) && !maskAssetKeySet.has(k)
  );

  const q = searchQuery.trim().toLowerCase();
  const matchesQuery = (label: string) => !q || label.toLowerCase().includes(q);

  const overlays = composerState.overlays || [];
  const masks = [...(vapMasksSnap.slots || [])].reverse();

  const totalCount =
    (primaryInfo.hasSource ? 1 : 0) +
    overlays.length +
    masks.length +
    watermarks.length +
    embeddedAssetKeys.length;

  const getPreviewBgStyle = (): string => {
    if (previewBg === 'dark') return '#07080f';
    if (previewBg === 'light') return '#e2e8f0';
    return CHECKER_BG;
  };

  // Resolve currently selected item details for the top Preview & Universal Controller Card
  const selectedOverlay: SecondaryOverlayLayer | null =
    selectedItem.kind === 'overlay'
      ? overlays.find((o) => o.id === selectedItem.id) || null
      : null;

  const selectedMask: any =
    selectedItem.kind === 'mask'
      ? masks.find((m: any) => String(m.srcId) === String(selectedItem.id)) || null
      : null;

  const selectedWatermark: WatermarkLayerSnapshot | null =
    selectedItem.kind === 'watermark'
      ? watermarks.find((w) => w.imageKey === selectedItem.id) || null
      : null;

  const selectedAssetKey: string | null =
    selectedItem.kind === 'asset' && assets[selectedItem.id] ? selectedItem.id : null;

  const resolvedKind: UnifiedLayerKind =
    selectedOverlay
      ? 'overlay'
      : selectedMask
      ? 'mask'
      : selectedWatermark
      ? 'watermark'
      : selectedAssetKey
      ? 'asset'
      : 'primary';

  let selTitle = primaryInfo.name || (isAr ? 'المشروع الأساسي الرئيسي' : 'Main Project');
  let selSubtitle = primaryInfo.hasSource
    ? `${primaryInfo.format} · ${primaryInfo.width}×${primaryInfo.height} · ${primaryInfo.frames}f`
    : isAr
    ? 'ارفع ملفاً للبدء'
    : 'Drop a file to start';
  let selThumb = primaryInfo.thumb;
  let selSecondaryShapeThumb = '';
  let selVisible = composerState.primaryTransform.visible !== false;
  let selHasMotion = hasAnimatedMotion(composerState.primaryTransform);
  let selBadge = isAr ? '⭐ المشروع الأساسي' : '⭐ Primary';

  if (resolvedKind === 'overlay' && selectedOverlay) {
    selTitle = selectedOverlay.name;
    selSubtitle = `${selectedOverlay.format} · ${selectedOverlay.width}×${selectedOverlay.height} · ${
      selectedOverlay.zOrder === 'below'
        ? isAr
          ? '⬇️ خلف المشروع'
          : 'Below Primary'
        : isAr
        ? '⬆️ أمام المشروع'
        : 'Above Primary'
    }`;
    selThumb = selectedOverlay.thumbnailDataUrl || '';
    selVisible = selectedOverlay.transform?.visible !== false;
    selHasMotion = hasAnimatedMotion(selectedOverlay.transform);
    selBadge = selectedOverlay.isVapMask
      ? isAr
        ? '🎭 مرفوع (قناع)'
        : '🎭 Uploaded Mask'
      : isAr
      ? '🧩 عنصر / ملف مرفوع'
      : '🧩 Uploaded Layer';
  } else if (resolvedKind === 'mask' && selectedMask) {
    const rep = vapMasksSnap.replacements?.[selectedMask.srcId] || {};
    const fRect = selectedMask.defaultFrame || [0, 0, selectedMask.w, selectedMask.h];
    const band: MaskDepthBand = resolveMaskDepthBand(selectedMask);
    const bandTxt: Record<MaskDepthBand, string> = {
      belowOverlays: isAr ? 'خلف الكل' : 'Below All',
      behindPrimary: isAr ? 'خلف الهدية' : 'Behind Gift',
      abovePrimary: isAr ? 'أمام الهدية' : 'Above Gift',
      aboveOverlays: isAr ? 'فوق الإطارات' : 'Above Frames',
    };
    selTitle = selectedMask.srcTag || `Mask ${selectedMask.srcId}`;
    selSubtitle = `${selectedMask.isTextSlot ? (isAr ? 'قناع اسم' : 'Name Mask') : isAr ? 'قناع صورة' : 'Image Mask'} · ${Math.round(fRect[2])}×${Math.round(fRect[3])} · ${bandTxt[band]}`;
    const silUrl = vapMasksSnap.silhouettes?.[selectedMask.srcId] || '';
    selThumb = (rep.active && rep.dataUrl) || silUrl;
    if (rep.active && rep.dataUrl && silUrl) {
      selSecondaryShapeThumb = silUrl;
    }
    selVisible = selectedMask.motionTransform?.visible !== false;
    selHasMotion = hasAnimatedMotion(selectedMask.motionTransform);
    selBadge = isAr ? '🎭 قناع ديناميكي' : '🎭 Mask';
  } else if (resolvedKind === 'watermark' && selectedWatermark) {
    selTitle = selectedWatermark.text || selectedWatermark.imageKey;
    selSubtitle = `${selectedWatermark.width}×${selectedWatermark.height} · ${Math.round(selectedWatermark.scale)}% · ${isAr ? 'شفافية' : 'Opacity'} ${Math.round(selectedWatermark.opacity)}%`;
    selThumb = selectedWatermark.dataUrl;
    selVisible = true;
    selHasMotion = false;
    selBadge = isAr ? '💧 علامة مائية' : '💧 Watermark';
  } else if (resolvedKind === 'asset' && selectedAssetKey) {
    const isHiddenStatic = Boolean((window as any).__isStaticAssetHidden?.(selectedAssetKey));
    selTitle = selectedAssetKey;
    selSubtitle = isHiddenStatic
      ? isAr
        ? 'صورة داخل الملف (النسخة الثابتة مخفية)'
        : 'Embedded Sprite (Static copy hidden)'
      : isAr
      ? 'صورة / عنصر داخل المشروع الأصلي'
      : 'Embedded Project Image';
    selThumb = assets[selectedAssetKey];
    selVisible = !isHiddenStatic;
    selHasMotion = false;
    selBadge = isAr ? '🖼️ صورة داخل المشروع' : '🖼️ Embedded Asset';
  }

  const handleToggleVisibility = async () => {
    if (resolvedKind === 'primary') {
      onChangeState({
        ...composerState,
        activeTargetId: 'primary',
        primaryTransform: {
          ...composerState.primaryTransform,
          visible: !selVisible,
        },
      });
    } else if (resolvedKind === 'overlay' && selectedOverlay) {
      onChangeState({
        ...composerState,
        activeTargetId: selectedOverlay.id,
        overlays: composerState.overlays.map((o) =>
          o.id === selectedOverlay.id
            ? { ...o, transform: { ...o.transform, visible: !selVisible } }
            : o
        ),
      });
    } else if (resolvedKind === 'mask' && selectedMask) {
      const nextT = {
        ...(selectedMask.motionTransform || {
          offsetX: 0,
          offsetY: 0,
          scale: 100,
          rotation: 0,
          opacity: 100,
          flipH: false,
          flipV: false,
          visible: true,
        }),
        visible: !selVisible,
      };
      (window as any).__setVapMaskMotionTransform?.(selectedMask.srcId, nextT);
    } else if (resolvedKind === 'asset' && selectedAssetKey) {
      setBusyAction(true);
      try {
        await (window as any).__toggleStaticAssetVisibility?.(selectedAssetKey);
      } finally {
        setBusyAction(false);
      }
    }
  };

  const renderThumbBox = (
    thumbUrl: string,
    fallbackEmoji: string,
    isSel: boolean,
    isHidden: boolean
  ) => (
    <div
      style={{
        width: '44px',
        height: '44px',
        borderRadius: '8px',
        flexShrink: 0,
        background: CHECKER_BG,
        border: isSel
          ? '1.5px solid #38bdf8'
          : '1px solid rgba(255, 255, 255, 0.14)',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        position: 'relative',
        opacity: isHidden ? 0.45 : 1,
      }}
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt=""
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
      ) : (
        <span style={{ fontSize: '18px' }}>{fallbackEmoji}</span>
      )}
    </div>
  );

  const actionBtnStyle: React.CSSProperties = {
    padding: '5px 7px',
    borderRadius: '7px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: '#191d32',
    color: '#f1f5f9',
    fontSize: '10.5px',
    fontWeight: 700,
    cursor: busyAction ? 'wait' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    whiteSpace: 'nowrap',
  };

  const categories: Array<{ id: CategoryFilter; labelAr: string; labelEn: string; count: number }> = [
    { id: 'all', labelAr: 'الكل', labelEn: 'All', count: totalCount },
    { id: 'uploads', labelAr: 'المرفوعات', labelEn: 'Uploads', count: overlays.length },
    { id: 'masks', labelAr: 'الأقنعة', labelEn: 'Masks', count: masks.length },
    { id: 'watermarks', labelAr: 'العلامات', labelEn: 'Marks', count: watermarks.length },
    { id: 'assets', labelAr: 'صور الملف', labelEn: 'Sprites', count: embeddedAssetKeys.length },
  ];

  return (
    <div
      id="unifiedLayersExplorer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
      }}
    >
      {/* Top Bar: Search + Upload */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          type="text"
          id="unifiedLayersSearchInput"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={isAr ? '🔎 ابحث عن أي طبقة أو صورة مرفوعة...' : '🔎 Search all layers & uploads...'}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '6px 9px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: '#0d0f1a',
            color: '#f8fafc',
            fontSize: '11px',
          }}
        />
        <button
          type="button"
          id="unifiedLayersUploadBtn"
          onClick={() => onTriggerUploadOverlay(undefined)}
          style={{
            padding: '6px 10px',
            borderRadius: '8px',
            border: '1px solid #a78bfa',
            background: 'linear-gradient(135deg, #7c5cff, #4f46e5)',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {isAr ? '➕ رفع ملف/صورة' : '➕ Upload'}
        </button>
      </div>

      {/* Category Filter Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '4px',
        }}
      >
        {categories.map((cat) => {
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              style={{
                padding: '4px 3px',
                borderRadius: '6px',
                border: active
                  ? '1px solid #38bdf8'
                  : '1px solid rgba(255,255,255,0.08)',
                background: active ? 'rgba(56, 189, 248, 0.18)' : '#141728',
                color: active ? '#e0f2fe' : '#94a3b8',
                fontSize: '9.5px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isAr ? cat.labelAr : cat.labelEn} ({cat.count})
            </button>
          );
        })}
      </div>

      {/* Selected Element Large Preview & Cross-Feature Controller Card */}
      <div
        id="unifiedSelectedElementCard"
        style={{
          padding: '10px',
          borderRadius: '11px',
          background:
            'linear-gradient(180deg, rgba(30, 41, 59, 0.55) 0%, rgba(15, 18, 32, 0.96) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.45)',
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
          {/* Crisp Large Image + Shape Preview */}
          <div
            style={{
              width: '106px',
              minHeight: '106px',
              borderRadius: '9px',
              background: getPreviewBgStyle(),
              border: '1px solid rgba(255,255,255,0.18)',
              display: 'grid',
              placeItems: 'center',
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0,
              padding: '4px',
            }}
          >
            {selThumb ? (
              <img
                src={selThumb}
                alt={selTitle}
                style={{
                  maxWidth: '96px',
                  maxHeight: '96px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.55))',
                }}
              />
            ) : (
              <span style={{ fontSize: '28px' }}>🖼️</span>
            )}

            {/* If mask has a loaded photo, show shape cutout corner preview too! */}
            {selSecondaryShapeThumb && (
              <div
                title={isAr ? 'شكل القناع الأصلي' : 'Mask silhouette shape'}
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  right: '4px',
                  width: '30px',
                  height: '30px',
                  borderRadius: '6px',
                  border: '1px solid #fbbf24',
                  background: '#090a12',
                  display: 'grid',
                  placeItems: 'center',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={selSecondaryShapeThumb}
                  alt="shape"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              </div>
            )}

            {/* Background Toggle Mini Strip */}
            <div
              style={{
                position: 'absolute',
                top: '4px',
                left: '4px',
                display: 'flex',
                gap: '2px',
                background: 'rgba(10, 12, 22, 0.78)',
                padding: '2px',
                borderRadius: '5px',
              }}
            >
              {(['checker', 'dark', 'light'] as PreviewBgMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  title={
                    mode === 'checker'
                      ? isAr
                        ? 'خلفية شفافة'
                        : 'Transparent'
                      : mode === 'dark'
                      ? isAr
                        ? 'خلفية داكنة'
                        : 'Dark'
                      : isAr
                      ? 'خلفية فاتحة'
                      : 'Light'
                  }
                  onClick={() => setPreviewBg(mode)}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    border:
                      previewBg === mode
                        ? '1px solid #38bdf8'
                        : '1px solid rgba(255,255,255,0.2)',
                    background:
                      mode === 'checker'
                        ? 'linear-gradient(135deg, #475569 50%, #1e293b 50%)'
                        : mode === 'dark'
                        ? '#020617'
                        : '#f8fafc',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Selected Details */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '5px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '5px',
                    background: 'rgba(56, 189, 248, 0.16)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#bae6fd',
                  }}
                >
                  {selBadge}
                </span>
                {selHasMotion && (
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 800,
                      padding: '2px 5px',
                      borderRadius: '5px',
                      background: 'rgba(16, 185, 129, 0.18)',
                      color: '#6ee7b7',
                    }}
                  >
                    ⚡ {isAr ? 'مُحرَّك' : 'Animated'}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#f8fafc',
                  wordBreak: 'break-word',
                  lineHeight: 1.3,
                }}
              >
                {selTitle}
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: '#94a3b8',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {selSubtitle}
              </div>
            </div>

            {/* Instant Motion + Position Primary Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
              <button
                type="button"
                id="unifiedQuickTransformBtn"
                disabled={busyAction}
                onClick={() => onJumpToTransform({ kind: resolvedKind, id: selectedItem.id })}
                style={{
                  ...actionBtnStyle,
                  borderColor: 'rgba(139, 92, 246, 0.55)',
                  background: 'rgba(124, 92, 255, 0.24)',
                  color: '#ede9fe',
                }}
              >
                <span>🎯</span>
                <span>{isAr ? 'تحريك وموضع' : 'Position'}</span>
              </button>
              <button
                type="button"
                id="unifiedQuickMotionBtn"
                disabled={busyAction}
                onClick={async () => {
                  setBusyAction(true);
                  try {
                    await onJumpToMotion({ kind: resolvedKind, id: selectedItem.id });
                  } finally {
                    setBusyAction(false);
                  }
                }}
                style={{
                  ...actionBtnStyle,
                  borderColor: 'rgba(56, 189, 248, 0.6)',
                  background: 'linear-gradient(135deg, rgba(14,165,233,0.3), rgba(56,189,248,0.22))',
                  color: '#e0f2fe',
                }}
              >
                <span>⚡</span>
                <span>{isAr ? 'إضافة تحريك' : 'Animate'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Cross-Tool Controls for the Selected Element */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            paddingTop: '6px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Visibility Toggle */}
          {(resolvedKind === 'primary' ||
            resolvedKind === 'overlay' ||
            resolvedKind === 'mask' ||
            resolvedKind === 'asset') && (
            <button
              type="button"
              onClick={handleToggleVisibility}
              style={{
                ...actionBtnStyle,
                borderColor: selVisible
                  ? 'rgba(16, 185, 129, 0.4)'
                  : 'rgba(239, 68, 68, 0.4)',
                background: selVisible
                  ? 'rgba(16, 185, 129, 0.14)'
                  : 'rgba(239, 68, 68, 0.14)',
                color: selVisible ? '#a7f3d0' : '#fca5a5',
              }}
            >
              {selVisible ? (isAr ? '👁️ إخفاء' : '👁️ Hide') : isAr ? '🚫 إظهار' : '🚫 Show'}
            </button>
          )}

          {/* Overlay specific actions */}
          {resolvedKind === 'overlay' && selectedOverlay && (
            <>
              <button
                type="button"
                onClick={() => onChangeState(moveOverlayLayerUp(composerState, selectedOverlay.id))}
                style={actionBtnStyle}
              >
                {isAr ? '⬆️ رفع' : '⬆️ Up'}
              </button>
              <button
                type="button"
                onClick={() => onChangeState(moveOverlayLayerDown(composerState, selectedOverlay.id))}
                style={actionBtnStyle}
              >
                {isAr ? '⬇️ إنزال' : '⬇️ Down'}
              </button>
              <button
                type="button"
                onClick={() =>
                  (window as any).__convertComposerLayerToVapMask?.(
                    selectedOverlay.id,
                    !selectedOverlay.isVapMask
                  )
                }
                style={{
                  ...actionBtnStyle,
                  borderColor: 'rgba(217, 70, 239, 0.45)',
                  color: '#f5d0fe',
                }}
              >
                {selectedOverlay.isVapMask
                  ? isAr
                    ? '✓ قناع'
                    : '✓ Mask'
                  : isAr
                  ? '🎭 تحويل لقناع'
                  : '🎭 As Mask'}
              </button>
              <button
                type="button"
                onClick={() => onTriggerUploadOverlay(selectedOverlay.id)}
                style={actionBtnStyle}
              >
                {isAr ? '🔄 استبدال' : '🔄 Replace'}
              </button>
              <button
                type="button"
                onClick={() => onRemoveOverlay(selectedOverlay.id)}
                style={{
                  ...actionBtnStyle,
                  borderColor: 'rgba(239,68,68,0.45)',
                  color: '#fca5a5',
                }}
              >
                {isAr ? '🗑️ حذف' : '🗑️ Delete'}
              </button>
            </>
          )}

          {/* Mask specific actions */}
          {resolvedKind === 'mask' && selectedMask && (
            <>
              <button
                type="button"
                onClick={() => (window as any).__uploadVapMaskPhoto?.(selectedMask.srcId)}
                style={{
                  ...actionBtnStyle,
                  borderColor: 'rgba(168,85,247,0.45)',
                  color: '#e9d5ff',
                }}
              >
                {isAr ? '📁 صورة داخل القناع' : '📁 Photo'}
              </button>
              <button
                type="button"
                onClick={() => (window as any).__uploadVapMaskShapePng?.(selectedMask.srcId)}
                style={actionBtnStyle}
              >
                {isAr ? '🎭 شكل القناع' : '🎭 Shape'}
              </button>
              <button
                type="button"
                onClick={() => onJumpToMask(selectedMask.srcId)}
                style={{
                  ...actionBtnStyle,
                  borderColor: 'rgba(251, 191, 36, 0.45)',
                  color: '#fde68a',
                }}
              >
                {isAr ? '🎛️ خصائص القناع' : '🎛️ Mask Props'}
              </button>
              <button
                type="button"
                onClick={() => (window as any).__reorderVapMaskSlot?.(selectedMask.srcId, 'toggleBehind')}
                style={actionBtnStyle}
              >
                {Number(selectedMask.z ?? 0) < 0
                  ? isAr
                    ? '⬆️ للأمام'
                    : '⬆️ Front'
                  : isAr
                  ? '⬇️ خلف المشروع'
                  : '⬇️ Behind'}
              </button>
              <button
                type="button"
                onClick={() => (window as any).__deleteVapMaskSlot?.(selectedMask.srcId)}
                style={{
                  ...actionBtnStyle,
                  borderColor: 'rgba(239,68,68,0.45)',
                  color: '#fca5a5',
                }}
              >
                {isAr ? '🗑️ حذف' : '🗑️ Delete'}
              </button>
            </>
          )}

          {/* Embedded asset specific actions */}
          {resolvedKind === 'asset' && selectedAssetKey && (
            <>
              <button
                type="button"
                onClick={() => (window as any).__openAssetEditModal?.(selectedAssetKey)}
                style={{
                  ...actionBtnStyle,
                  borderColor: 'rgba(56,189,248,0.4)',
                  color: '#bae6fd',
                }}
              >
                {isAr ? '✎ تعديل الصورة / النص' : '✎ Edit Image'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setBusyAction(true);
                  try {
                    await (window as any).__convertAssetToVapMask?.(selectedAssetKey);
                  } finally {
                    setBusyAction(false);
                  }
                }}
                style={{
                  ...actionBtnStyle,
                  borderColor: 'rgba(217, 70, 239, 0.45)',
                  color: '#f5d0fe',
                }}
              >
                {isAr ? '🎭 تحويل لقناع' : '🎭 Convert to Mask'}
              </button>
              <button
                type="button"
                onClick={() => (window as any).__openAssetPreviewModal?.(selectedAssetKey)}
                style={actionBtnStyle}
              >
                {isAr ? '🔍 تكبير' : '🔍 Zoom'}
              </button>
              <button
                type="button"
                onClick={() => (window as any).__downloadSingleAsset?.(selectedAssetKey)}
                style={actionBtnStyle}
              >
                {isAr ? '💾 تحميل' : '💾 Save PNG'}
              </button>
            </>
          )}

          {/* Watermark specific actions */}
          {resolvedKind === 'watermark' && selectedWatermark && (
            <>
              <button
                type="button"
                onClick={() => onOpenWatermark?.()}
                style={actionBtnStyle}
              >
                {isAr ? '💧 إعدادات العلامة' : '💧 Edit Watermark'}
              </button>
              <button
                type="button"
                onClick={() =>
                  (window as any).__removeWatermarkLayerByKey?.(selectedWatermark.imageKey)
                }
                style={{
                  ...actionBtnStyle,
                  borderColor: 'rgba(239,68,68,0.45)',
                  color: '#fca5a5',
                }}
              >
                {isAr ? '🗑️ حذف' : '🗑️ Remove'}
              </button>
            </>
          )}

          {/* Universal Studio Features Shortcut Bar */}
          {onOpenChromaKey && (
            <button type="button" onClick={onOpenChromaKey} style={actionBtnStyle}>
              {isAr ? '🪄 كروما' : '🪄 Chroma'}
            </button>
          )}
          {onOpenEdgeFeather && (
            <button type="button" onClick={onOpenEdgeFeather} style={actionBtnStyle}>
              {isAr ? '🪶 تنعيم حواف' : '🪶 Feather'}
            </button>
          )}
          {onOpenWatermark && resolvedKind !== 'watermark' && (
            <button type="button" onClick={onOpenWatermark} style={actionBtnStyle}>
              {isAr ? '💧 علامة مائية' : '💧 Watermark'}
            </button>
          )}
          {onOpenBatchOps && (
            <button type="button" onClick={onOpenBatchOps} style={actionBtnStyle}>
              {isAr ? '📚 معالجة جماعية' : '📚 Batch'}
            </button>
          )}
        </div>
      </div>

      {/* Unified Visual List of All Layers & Uploads */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          maxHeight: '280px',
          overflowY: 'auto',
          paddingRight: '2px',
        }}
      >
        {/* 1. Primary Project */}
        {(category === 'all') &&
          primaryInfo.hasSource &&
          matchesQuery(`${primaryInfo.name} ${primaryInfo.format} المشروع الأساسي`) && (
            <div
              key="unified_primary"
              data-unified-layer="primary"
              onClick={() => onSelectItem({ kind: 'primary', id: 'primary' })}
              style={{
                padding: '6px 8px',
                borderRadius: '9px',
                border:
                  resolvedKind === 'primary'
                    ? '1.5px solid #38bdf8'
                    : '1px solid rgba(154, 124, 255, 0.28)',
                background:
                  resolvedKind === 'primary'
                    ? 'rgba(56, 189, 248, 0.14)'
                    : 'rgba(124, 92, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              {renderThumbBox(
                primaryInfo.thumb,
                '⭐',
                resolvedKind === 'primary',
                composerState.primaryTransform.visible === false
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 800,
                    color: '#f8fafc',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>⭐</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {primaryInfo.name || (isAr ? 'المشروع الأساسي الرئيسي' : 'Main Project')}
                  </span>
                </div>
                <div style={{ fontSize: '9.5px', color: '#94a3b8' }}>
                  {isAr ? 'المشروع الأساسي' : 'Main Project'} · {primaryInfo.format} ·{' '}
                  {primaryInfo.width}×{primaryInfo.height}
                </div>
              </div>
              {hasAnimatedMotion(composerState.primaryTransform) && (
                <span style={{ fontSize: '11px', color: '#38bdf8' }}>⚡</span>
              )}
            </div>
          )}

        {/* 2. Uploaded Files / Overlays */}
        {(category === 'all' || category === 'uploads') &&
          overlays
            .filter((ov) => matchesQuery(`${ov.name} ${ov.format} مرفوع طبقة`))
            .map((ov, idx) => {
              const isSel = resolvedKind === 'overlay' && selectedOverlay?.id === ov.id;
              const isHidden = ov.transform?.visible === false;
              return (
                <div
                  key={`unified_ov_${ov.id}`}
                  data-unified-layer={`overlay:${ov.id}`}
                  onClick={() => onSelectItem({ kind: 'overlay', id: ov.id })}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '9px',
                    border: isSel
                      ? '1.5px solid #38bdf8'
                      : '1px solid rgba(255, 255, 255, 0.09)',
                    background: isSel ? 'rgba(56, 189, 248, 0.14)' : '#111322',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {renderThumbBox(ov.thumbnailDataUrl || '', '🧩', isSel, isHidden)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: isSel ? '#e0f2fe' : '#f8fafc',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {idx + 1}. {ov.name}
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#94a3b8' }}>
                      {isAr ? 'مرفوع' : 'Uploaded'} · {ov.format} · {ov.width}×{ov.height} ·{' '}
                      {ov.zOrder === 'below'
                        ? isAr
                          ? '⬇️ خلف'
                          : 'Below'
                        : isAr
                        ? '⬆️ أمام'
                        : 'Above'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {ov.isVapMask && <span style={{ fontSize: '10px', color: '#e879f9' }}>🎭</span>}
                    {hasAnimatedMotion(ov.transform) && (
                      <span style={{ fontSize: '10px', color: '#38bdf8' }}>⚡</span>
                    )}
                    {isHidden && <span style={{ fontSize: '10px', color: '#f87171' }}>🚫</span>}
                  </div>
                </div>
              );
            })}

        {/* 3. Dynamic Masks */}
        {(category === 'all' || category === 'masks') &&
          masks
            .filter((slot: any) => matchesQuery(`${slot.srcTag} قناع mask`))
            .map((slot: any) => {
              const isSel =
                resolvedKind === 'mask' &&
                String(selectedMask?.srcId || '') === String(slot.srcId);
              const rep = vapMasksSnap.replacements?.[slot.srcId] || {};
              const thumb =
                (rep.active && rep.dataUrl) || vapMasksSnap.silhouettes?.[slot.srcId] || '';
              const fRect = slot.defaultFrame || [0, 0, slot.w, slot.h];
              const isHidden = slot.motionTransform?.visible === false;
              return (
                <div
                  key={`unified_mask_${slot.srcId}`}
                  data-unified-layer={`mask:${slot.srcId}`}
                  onClick={() => onSelectItem({ kind: 'mask', id: String(slot.srcId) })}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '9px',
                    border: isSel
                      ? '1.5px solid #fbbf24'
                      : '1px solid rgba(192, 132, 252, 0.25)',
                    background: isSel ? 'rgba(251, 191, 36, 0.12)' : '#121223',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {renderThumbBox(thumb, '🎭', isSel, isHidden)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: isSel ? '#fde68a' : '#f3e8ff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      🎭 {slot.srcTag}
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#c084fc' }}>
                      {slot.isTextSlot ? (isAr ? 'قناع اسم' : 'Name Mask') : isAr ? 'قناع صورة' : 'Image Mask'} ·{' '}
                      {Math.round(fRect[2])}×{Math.round(fRect[3])}
                      {rep.active ? (isAr ? ' · صورة محملة' : ' · Photo Loaded') : ''}
                    </div>
                  </div>
                  {hasAnimatedMotion(slot.motionTransform) && (
                    <span style={{ fontSize: '11px', color: '#38bdf8' }}>⚡</span>
                  )}
                </div>
              );
            })}

        {/* 4. Watermarks */}
        {(category === 'all' || category === 'watermarks') &&
          watermarks
            .filter((wm) => matchesQuery(`${wm.text || ''} ${wm.imageKey} علامة مائية`))
            .map((wm) => {
              const isSel =
                resolvedKind === 'watermark' && selectedWatermark?.imageKey === wm.imageKey;
              return (
                <div
                  key={`unified_wm_${wm.imageKey}`}
                  data-unified-layer={`watermark:${wm.imageKey}`}
                  onClick={() => onSelectItem({ kind: 'watermark', id: wm.imageKey })}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '9px',
                    border: isSel
                      ? '1.5px solid #34d399'
                      : '1px solid rgba(16, 185, 129, 0.24)',
                    background: isSel ? 'rgba(16, 185, 129, 0.14)' : '#101822',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {renderThumbBox(wm.dataUrl, '💧', isSel, false)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: '#ecfdf5',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      💧 {wm.text || wm.imageKey}
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#6ee7b7' }}>
                      {isAr ? 'علامة مائية' : 'Watermark'} · {wm.width}×{wm.height}
                    </div>
                  </div>
                </div>
              );
            })}

        {/* 5. Embedded Project Images / Sprites */}
        {(category === 'all' || category === 'assets') &&
          embeddedAssetKeys
            .filter((k) => matchesQuery(`${k} صورة عنصر asset`))
            .map((k) => {
              const isSel = resolvedKind === 'asset' && selectedAssetKey === k;
              const isHiddenStatic = Boolean((window as any).__isStaticAssetHidden?.(k));
              return (
                <div
                  key={`unified_asset_${k}`}
                  data-unified-layer={`asset:${k}`}
                  onClick={() => onSelectItem({ kind: 'asset', id: k })}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '9px',
                    border: isSel
                      ? '1.5px solid #38bdf8'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    background: isSel ? 'rgba(56, 189, 248, 0.12)' : '#10121e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {renderThumbBox(assets[k], '🖼️', isSel, isHiddenStatic)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: isSel ? '#e0f2fe' : '#e2e8f0',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      🖼️ {k}
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#94a3b8' }}>
                      {isHiddenStatic
                        ? isAr
                          ? 'عنصر من الملف (مخفي حالياً)'
                          : 'Embedded Asset (Hidden)'
                        : isAr
                        ? 'عنصر / طبقة داخل الملف'
                        : 'Embedded File Layer'}
                    </div>
                  </div>
                  {isHiddenStatic && <span style={{ fontSize: '10px', color: '#f87171' }}>🚫</span>}
                </div>
              );
            })}

        {totalCount === 0 && (
          <div
            style={{
              padding: '16px',
              borderRadius: '9px',
              border: '1px dashed rgba(148, 163, 184, 0.25)',
              textAlign: 'center',
              fontSize: '11px',
              color: '#94a3b8',
            }}
          >
            {isAr
              ? 'لا توجد طبقات حالياً — اسحب ملف هدية أو اضغط (➕ رفع ملف/صورة) أعلاه'
              : 'No layers yet — drop a gift or click + Upload above.'}
          </div>
        )}
      </div>
    </div>
  );
};
