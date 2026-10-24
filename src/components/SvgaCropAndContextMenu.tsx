import React from 'react';
import {
  Undo2,
  Redo2,
  Scissors,
  MousePointer,
  Diamond,
  ArrowDownToLine,
  ArrowUpToLine,
  Trash2,
  CopyPlus,
  Eraser,
  X,
} from 'lucide-react';

export interface CropSelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ContextMenuState {
  x: number;
  y: number;
  targetId: string;
  assetKey: string | null;
}

interface SvgaCropAndContextMenuProps {
  activeTool: string;
  selectedTarget: string;
  cropRect: CropSelectionRect | null;
  onApplyCropMode: (mode: 'keepSelected' | 'eraseSelected' | 'splitToNewLayer') => void;
  onClearCropRect: () => void;
  contextMenu: ContextMenuState | null;
  onCloseContextMenu: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onActivateCropTool: () => void;
  onActivateMoveTool: () => void;
  onAddKeyframeAtCurrentFrame: () => void;
  onSendLayerBackward: (targetId: string) => void;
  onBringLayerForward: (targetId: string) => void;
  onDeleteLayer: (targetId: string) => void;
}

export const SvgaCropAndContextMenu: React.FC<SvgaCropAndContextMenuProps> = ({
  activeTool,
  selectedTarget,
  cropRect,
  onApplyCropMode,
  onClearCropRect,
  contextMenu,
  onCloseContextMenu,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onActivateCropTool,
  onActivateMoveTool,
  onAddKeyframeAtCurrentFrame,
  onSendLayerBackward,
  onBringLayerForward,
  onDeleteLayer,
}) => {
  const hasValidCrop = cropRect && cropRect.w >= 4 && cropRect.h >= 4;

  return (
    <>
      {/* Floating Crop / Cut Action Bar at top of Stage when Crop tool is active or a selection box is drawn */}
      {(activeTool === 'Crop' || hasValidCrop) && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 35,
            background: 'rgba(15, 15, 24, 0.96)',
            border: '1px solid #f59e0b',
            borderRadius: '10px',
            padding: '7px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.65)',
            whiteSpace: 'nowrap',
          }}
        >
          <Scissors size={14} color="#f59e0b" />
          {!hasValidCrop ? (
            <span style={{ color: '#fde047', fontSize: '11px', fontWeight: 600 }}>
              {selectedTarget === 'DOCUMENT'
                ? 'حدد طبقة أولاً ثم اسحب بالماوس لتحديد الجزء المراد قصه أو فصله'
                : 'اسحب بالماوس فوق الطبقة لتحديد المستطيل المراد قصه أو تحريكه'}
            </span>
          ) : (
            <>
              <span style={{ color: '#fde047', fontSize: '11px', fontWeight: 700 }}>
                تحديد ({Math.round(cropRect.w)}×{Math.round(cropRect.h)}):
              </span>
              <button
                type="button"
                onClick={() => onApplyCropMode('keepSelected')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #f59e0b',
                  background: '#f59e0b',
                  color: '#09090d',
                  fontWeight: 700,
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Scissors size={12} /> قص والإبقاء على المحدد فقط
              </button>
              <button
                type="button"
                onClick={() => onApplyCropMode('splitToNewLayer')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #7c5cff',
                  background: '#7c5cff',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CopyPlus size={12} /> فصل الجزء المحدد في طبقة متحركة
              </button>
              <button
                type="button"
                onClick={() => onApplyCropMode('eraseSelected')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(248,113,113,0.45)',
                  background: 'rgba(248,113,113,0.16)',
                  color: '#fca5a5',
                  fontWeight: 600,
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Eraser size={12} /> مسح الجزء المحدد
              </button>
              <button
                type="button"
                onClick={onClearCropRect}
                title="إلغاء التحديد"
                style={{
                  background: 'transparent',
                  border: 0,
                  color: '#9e9eb2',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  padding: '2px',
                }}
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Custom Mouse Right-Click Context Menu */}
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: 'fixed',
            left: `${Math.min(window.innerWidth - 245, Math.max(8, contextMenu.x))}px`,
            top: `${Math.min(window.innerHeight - 310, Math.max(8, contextMenu.y))}px`,
            width: '235px',
            background: '#12121c',
            border: '1px solid #2e2e44',
            borderRadius: '10px',
            padding: '6px',
            zIndex: 100,
            boxShadow: '0 16px 40px rgba(0,0,0,0.75)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            fontSize: '12px',
            color: '#e8e8ee',
          }}
        >
          <div
            style={{
              padding: '4px 8px 6px',
              borderBottom: '1px solid #1f1f2e',
              color: '#a78bfa',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>أوامر الماوس السريعة</span>
            <span>{contextMenu.targetId === 'DOCUMENT' ? 'Stage' : contextMenu.targetId}</span>
          </div>

          <button
            type="button"
            disabled={!canUndo}
            onClick={() => {
              onUndo();
              onCloseContextMenu();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: '6px',
              border: 0,
              background: 'transparent',
              color: canUndo ? '#f0f0f8' : '#555568',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Undo2 size={13} color="#a78bfa" />
              <span>رجوع للخلف / تراجع (Undo)</span>
            </span>
            <span style={{ fontSize: '10px', color: '#6e6e82' }}>Ctrl+Z</span>
          </button>

          <button
            type="button"
            disabled={!canRedo}
            onClick={() => {
              onRedo();
              onCloseContextMenu();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: '6px',
              border: 0,
              background: 'transparent',
              color: canRedo ? '#f0f0f8' : '#555568',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Redo2 size={13} color="#60a5fa" />
              <span>تقدم للأمام / إعادة (Redo)</span>
            </span>
            <span style={{ fontSize: '10px', color: '#6e6e82' }}>Ctrl+Y</span>
          </button>

          <div style={{ height: '1px', background: '#1f1f2e', margin: '3px 0' }} />

          <button
            type="button"
            onClick={() => {
              onActivateCropTool();
              onCloseContextMenu();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 10px',
              borderRadius: '6px',
              border: 0,
              background: 'transparent',
              color: '#fde047',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Scissors size={13} color="#f59e0b" />
            <span>تحديد وقص جزء من الطبقة بالماوس</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onActivateMoveTool();
              onCloseContextMenu();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 10px',
              borderRadius: '6px',
              border: 0,
              background: 'transparent',
              color: '#e8e8ee',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <MousePointer size={13} color="#34d399" />
            <span>أداة تحريك الطبقة بالماوس (Move)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onAddKeyframeAtCurrentFrame();
              onCloseContextMenu();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 10px',
              borderRadius: '6px',
              border: 0,
              background: 'transparent',
              color: '#e8e8ee',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Diamond size={13} color="#f59e0b" />
            <span>إضافة نقطة تحريك هنا (Keyframe)</span>
          </button>

          {contextMenu.targetId !== 'DOCUMENT' && (
            <>
              <div style={{ height: '1px', background: '#1f1f2e', margin: '3px 0' }} />
              <button
                type="button"
                onClick={() => {
                  onSendLayerBackward(contextMenu.targetId);
                  onCloseContextMenu();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 0,
                  background: 'transparent',
                  color: '#e8e8ee',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <ArrowDownToLine size={13} color="#93c5fd" />
                <span>إرجاع الطبقة للخلف (Send Backward)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onBringLayerForward(contextMenu.targetId);
                  onCloseContextMenu();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 0,
                  background: 'transparent',
                  color: '#e8e8ee',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <ArrowUpToLine size={13} color="#93c5fd" />
                <span>تقديم الطبقة للأمام (Bring Forward)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onDeleteLayer(contextMenu.targetId);
                  onCloseContextMenu();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: 0,
                  background: 'transparent',
                  color: '#f87171',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Trash2 size={13} color="#f87171" />
                <span>حذف الطبقة المحددة</span>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
};
