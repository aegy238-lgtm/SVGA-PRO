import React, { useState, useRef, useEffect } from 'react';
import {
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
  moveOverlayLayerUp,
  moveOverlayLayerDown,
  moveOverlayLayerToTop,
  moveOverlayLayerToBottom,
  getUnifiedVisualLayerStack,
  UnifiedStackItem,
} from '../utils/projectComposer';

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
}) => {
  const isAr = language === 'ar';
  const [stepPx, setStepPx] = useState<number>(15);
  const [activeTab, setActiveTab] = useState<'primary' | 'secondary' | 'stack'>('primary');
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
    if (composerState.activeTargetId === 'primary') {
      setActiveTab('primary');
    } else if (composerState.overlays.some((o) => o.id === composerState.activeTargetId)) {
      setActiveTab('secondary');
    }
  }, [composerState.activeTargetId, composerState.overlays.length]);

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

  const selectedOverlay: SecondaryOverlayLayer | null =
    composerState.overlays.find((o) => o.id === composerState.activeTargetId) ||
    composerState.overlays[0] ||
    null;

  const isEditingPrimary = activeTab === 'primary' || !selectedOverlay;
  const activeTransform: ProjectLayerTransform = isEditingPrimary
    ? composerState.primaryTransform
    : selectedOverlay.transform;

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

  const handleSwitchTab = (tab: 'primary' | 'secondary' | 'stack') => {
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
    setActiveTab('secondary');
    await onUploadSecondaryFile(f, repId);
  };

  const defaultStyle: React.CSSProperties = panelPos
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
        width: '372px',
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
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '5px',
          padding: '10px 10px 6px',
          background: '#111320',
        }}
      >
        <button
          type="button"
          id="composerTabPrimary"
          onClick={() => handleSwitchTab('primary')}
          style={{
            padding: '7px 6px',
            borderRadius: '9px',
            fontSize: '11px',
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
            gap: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>🎯</span>
          <span>{isAr ? 'المشروع الأساسي' : 'Main Project'}</span>
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
            padding: '7px 6px',
            borderRadius: '9px',
            fontSize: '11px',
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
            gap: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>⚡</span>
          <span>
            {isAr
              ? `الطبقات (${composerState.overlays.length})`
              : `Extra (${composerState.overlays.length})`}
          </span>
        </button>

        <button
          type="button"
          id="composerTabStack"
          onClick={() => handleSwitchTab('stack')}
          style={{
            padding: '7px 6px',
            borderRadius: '9px',
            fontSize: '11px',
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
            gap: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>🥞</span>
          <span>{isAr ? 'ترتيب الطبقات' : 'Layer Stack'}</span>
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
          <div style={{ fontSize: '10.5px', color: '#a7f3d0', lineHeight: '1.4' }}>
            {isAr
              ? '💡 يمكنك تكبير وتصغير أي طبقة مضافة أو المشروع الأساسي مباشرة عبر عجلة الماوس (Wheel) أو بالضغط على زر Shift أثناء السحب بالماوس!'
              : '💡 Scale any layer up/down directly using mouse wheel scroll or Shift + Drag on preview stage!'}
          </div>
        </div>

        {/* Secondary File Upload & Layer Selector Section (Always accessible in Secondary tab, plus quick button in Primary tab) */}
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
                          title={isAr ? 'رفع المستوى للأعلى' : 'Move Up'}
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeState(moveOverlayLayerUp(composerState, ov.id));
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
          </div>
        ) : activeTab === 'stack' ? (
          /* Stack Layer Tree Navigation View */
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
                {isAr ? '🥞 شجرة ترتيب وتنقل طبقات التصميم' : '🥞 Layer Z-Stack Navigation'}
              </span>
              <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                {isAr ? 'أعلى القائمة = المقدمة' : 'Top = Frontmost'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {getUnifiedVisualLayerStack(
                composerState,
                isAr ? 'المشروع الأساسي الرئيسي' : 'Main Project File'
              ).map((item) => {
                const isSel = composerState.activeTargetId === item.id;
                const isPrimary = item.type === 'primary';

                return (
                  <div
                    key={item.id}
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
                    <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px' }}>
                        {isPrimary ? '⭐' : item.zOrder === 'above' ? '🔝' : '⬇️'}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color: isSel ? '#ffffff' : isPrimary ? '#ddd6fe' : '#e2e8f0',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.name}
                        </div>
                        <div style={{ fontSize: '9.5px', color: '#94a3b8' }}>
                          {isPrimary
                            ? isAr
                              ? 'المشروع الأصلي الرئيسي'
                              : 'Primary Original Project'
                            : item.zOrder === 'above'
                            ? isAr
                              ? `طبقة مضافة (فوق المشروع)`
                              : `Overlay Layer (Above)`
                            : isAr
                            ? `طبقة مضافة (تحت المشروع)`
                            : `Underlay Layer (Below)`}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {!isPrimary && (
                        <>
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
                          <button
                            type="button"
                            title={isAr ? 'إحالة إلى القمة القصوى (🔝)' : 'Bring to Front'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onChangeState(moveOverlayLayerToTop(composerState, item.id));
                            }}
                            style={{
                              padding: '3px 5px',
                              borderRadius: '4px',
                              border: '1px solid rgba(139, 92, 246, 0.4)',
                              background: 'rgba(139, 92, 246, 0.2)',
                              color: '#ddd6fe',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            🔝
                          </button>
                          <button
                            type="button"
                            title={isAr ? 'إحالة إلى الخلفية القاع (⬇️⬇️)' : 'Send to Back'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onChangeState(moveOverlayLayerToBottom(composerState, item.id));
                            }}
                            style={{
                              padding: '3px 5px',
                              borderRadius: '4px',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              background: '#171928',
                              color: '#94a3b8',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            ⬇️⬇️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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

        {/* Controls Section: Show if editing Primary OR if at least one Secondary file exists */}
        {(isEditingPrimary || selectedOverlay) && (
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
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    background: 'rgba(14, 165, 233, 0.15)',
                    color: '#e0f2fe',
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
                      ? '1px solid rgba(16, 185, 129, 0.4)'
                      : '1px solid rgba(239, 68, 68, 0.4)',
                    background: activeTransform.visible
                      ? 'rgba(16, 185, 129, 0.14)'
                      : 'rgba(239, 68, 68, 0.14)',
                    color: activeTransform.visible ? '#a7f3d0' : '#fca5a5',
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

