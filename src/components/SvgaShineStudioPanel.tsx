import React, { useRef } from 'react';
import {
  Sparkles,
  Crosshair,
  Navigation,
  Upload,
  RotateCcw,
  Plus,
  Trash2,
  CircleDot,
  Square,
  Pencil,
  Wand2,
  Play,
  ArrowRightLeft,
  Layers,
} from 'lucide-react';
import {
  SHINE_PRESETS,
  ShineCanvasEditSubmode,
  ShineLayerConfig,
  ShinePresetId,
} from '../utils/svgaShineEngine';

export interface ShineTargetOption {
  id: string;
  label: string;
  assetKey?: string;
}

interface SvgaShineStudioPanelProps {
  shineLayerId: string;
  shineLayerName: string;
  shineThumbUrl: string;
  config: ShineLayerConfig;
  editSubmode: ShineCanvasEditSubmode;
  onChangeEditSubmode: (mode: ShineCanvasEditSubmode) => void;
  targetOptions: ShineTargetOption[];
  svgaAssetKeys: string[];
  totalFrames: number;
  onUpdateConfig: (
    patch: Partial<ShineLayerConfig>,
    options?: { regenerateBitmap?: boolean; regenerateKeyframes?: boolean; actionLabel?: string }
  ) => void;
  onAutoTraceTargetLayer: (targetLayerId?: string) => void;
  onApplyPresetMask: (preset: 'ring' | 'rect' | 'clear_for_free_draw') => void;
  onRemoveLastMaskPoint: () => void;
  onApplyMotionDirection: (dir: 'diag_tl_br' | 'diag_tr_bl' | 'horiz_lr' | 'vert_tb' | 'reverse') => void;
  onAddMotionMidpoint: () => void;
  onRemoveLastMotionPoint: () => void;
  onUploadCustomShineImage: (file: File) => void;
  onSelectSvgaAssetAsShineImage: (assetKey: string) => void;
  onTriggerPlayPreview: () => void;
}

export const SvgaShineStudioPanel: React.FC<SvgaShineStudioPanelProps> = ({
  shineLayerName,
  shineThumbUrl,
  config,
  editSubmode,
  onChangeEditSubmode,
  targetOptions,
  svgaAssetKeys,
  totalFrames,
  onUpdateConfig,
  onAutoTraceTargetLayer,
  onApplyPresetMask,
  onRemoveLastMaskPoint,
  onApplyMotionDirection,
  onAddMotionMidpoint,
  onRemoveLastMotionPoint,
  onUploadCustomShineImage,
  onSelectSvgaAssetAsShineImage,
  onTriggerPlayPreview,
}) => {
  const customShineInputRef = useRef<HTMLInputElement | null>(null);
  const outerPointsCount = config.maskContours[0]?.length || 0;
  const hasInnerHole = Boolean(config.maskContours[1] && config.maskContours[1].length >= 3);
  const motionPointsCount = config.motionPoints?.length || 0;

  return (
    <div
      id="svgaShineStudioPanel"
      style={{
        background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.12) 0%, rgba(18, 18, 28, 0.96) 100%)',
        border: '1px solid rgba(245, 158, 11, 0.45)',
        borderRadius: '10px',
        padding: '11px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        direction: 'rtl',
      }}
    >
      <input
        ref={customShineInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onUploadCustomShineImage(f);
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              flexShrink: 0,
              boxShadow: '0 2px 10px rgba(245, 158, 11, 0.35)',
            }}
          >
            <Sparkles size={14} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: '11.5px',
                color: '#fef3c7',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              ✨ استوديو الطبقة اللامعة (Shine)
            </div>
            <div style={{ fontSize: '9.5px', color: '#fcd34d' }}>
              نقاط القناع + مسار اللمعة · حفظ SVGA أصلي
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onTriggerPlayPreview}
          title="معاينة حركة اللمعة على الكانفاس"
          style={{
            background: 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.5)',
            color: '#6ee7b7',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '10px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          <Play size={10} />
          <span>معاينة</span>
        </button>
      </div>

      {/* 1. Target Layer Selection (استدعاء الطبقة المستهدفة) */}
      <div
        style={{
          background: 'rgba(12, 12, 20, 0.75)',
          border: '1px solid #27273a',
          borderRadius: '8px',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Layers size={11} color="#fbbf24" />
            <span>1. استدعاء الطبقة المستهدفة للمعة:</span>
          </span>
        </div>

        <select
          id="edShineTargetLayerSelect"
          aria-label="الطبقة المستهدفة للمعة"
          value={config.targetLayerId}
          onChange={(e) => {
            const nextTarget = e.target.value;
            onAutoTraceTargetLayer(nextTarget);
          }}
          style={{
            width: '100%',
            background: '#141420',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '6px',
            padding: '5px 8px',
            color: '#fef3c7',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          {targetOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
          <button
            type="button"
            id="edShineAutoTraceBtn"
            onClick={() => onAutoTraceTargetLayer(config.targetLayerId)}
            style={{
              flex: 1,
              padding: '5px 7px',
              borderRadius: '6px',
              border: '1px solid rgba(56, 189, 248, 0.45)',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#bae6fd',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <Wand2 size={11} />
            <span>تحديد نقاط تلقائي على حدود الطبقة</span>
          </button>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '10px',
            color: '#6ee7b7',
            fontWeight: 700,
            cursor: 'pointer',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '6px',
            padding: '5px 7px',
          }}
        >
          <input
            type="checkbox"
            id="edShineExactAlphaMaskToggle"
            checked={config.exactLayerAlphaMask !== false}
            onChange={(e) =>
              onUpdateConfig(
                { exactLayerAlphaMask: e.target.checked },
                {
                  actionLabel: e.target.checked
                    ? '✨ تم تفعيل الدمج المطابق 100% لحواف وتفاصيل الطبقة الأصلية بدون أي آثار قص'
                    : 'تم إيقاف قناع الألفا الدقيق والاكتفاء بقناع النقاط',
                }
              )
            }
            style={{ width: 'auto', accentColor: '#10b981' }}
          />
          <span>✨ دمج مطابق 100% لحواف وشكل الطبقة الأصلية (بدون آثار قص)</span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <span style={{ fontSize: '9.5px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
            طريقة دمج اللمعة:
          </span>
          <select
            id="edShineBlendModeSelect"
            aria-label="طريقة دمج اللمعة مع الطبقة"
            value={config.blendMode || 'screen'}
            onChange={(e) =>
              onUpdateConfig(
                { blendMode: e.target.value as 'screen' | 'lighter' | 'source-over' },
                { actionLabel: 'تحديث وضع دمج اللمعة مع الطبقة الأصلية' }
              )
            }
            style={{
              flex: 1,
              background: '#141420',
              border: '1px solid #2b2b3e',
              borderRadius: '5px',
              padding: '3px 6px',
              color: '#fde68a',
              fontSize: '9.5px',
              fontWeight: 600,
            }}
          >
            <option value="screen">✨ توهج مدمج مع ألوان الطبقة (Screen)</option>
            <option value="lighter">🔥 بريق ساطع مضيء (Add / Glow)</option>
            <option value="source-over">🎨 عادي فوق الطبقة (Normal)</option>
          </select>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '10px',
            color: '#cbd5e1',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={config.followTargetLayerTransform}
            onChange={(e) =>
              onUpdateConfig(
                { followTargetLayerTransform: e.target.checked },
                { actionLabel: 'تحديث ارتباط قناع اللمعة بحركة الطبقة المستهدفة' }
              )
            }
            style={{ width: 'auto', accentColor: '#f59e0b' }}
          />
          <span>تتبع حركة ومقاس الطبقة المستهدفة تلقائياً عبر الفريمات</span>
        </label>
      </div>

      {/* 2. Interactive Canvas Point Placement & Editing Mode (نقاط القناع ونقاط مسار الحركة) */}
      <div
        style={{
          background: 'rgba(12, 12, 20, 0.75)',
          border: '1px solid #27273a',
          borderRadius: '8px',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '7px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#e2e8f0' }}>
            2. وضع وتحريك النقاط على الكانفاس:
          </span>
          {editSubmode !== 'none' && (
            <button
              type="button"
              id="edShineHidePointsBtn"
              onClick={() => onChangeEditSubmode('none')}
              style={{
                background: 'rgba(148, 163, 184, 0.14)',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                color: '#e2e8f0',
                borderRadius: '5px',
                padding: '2px 6px',
                fontSize: '9px',
                cursor: 'pointer',
              }}
            >
              إخفاء النقاط للمعاينة الصافية
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
          <button
            type="button"
            id="edShineMaskPointsModeBtn"
            onClick={() =>
              onChangeEditSubmode(editSubmode === 'mask_points' ? 'none' : 'mask_points')
            }
            style={{
              padding: '6px 6px',
              borderRadius: '6px',
              border:
                editSubmode === 'mask_points'
                  ? '1.5px solid #38bdf8'
                  : '1px solid #2b2b3e',
              background:
                editSubmode === 'mask_points'
                  ? 'rgba(56, 189, 248, 0.22)'
                  : '#151522',
              color: editSubmode === 'mask_points' ? '#7dd3fc' : '#94a3b8',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <Crosshair size={11} />
            <span>نقاط القناع ({outerPointsCount})</span>
          </button>

          <button
            type="button"
            id="edShineMotionPointsModeBtn"
            onClick={() =>
              onChangeEditSubmode(editSubmode === 'motion_points' ? 'none' : 'motion_points')
            }
            style={{
              padding: '6px 6px',
              borderRadius: '6px',
              border:
                editSubmode === 'motion_points'
                  ? '1.5px solid #f59e0b'
                  : '1px solid #2b2b3e',
              background:
                editSubmode === 'motion_points'
                  ? 'rgba(245, 158, 11, 0.22)'
                  : '#151522',
              color: editSubmode === 'motion_points' ? '#fde047' : '#94a3b8',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <Navigation size={11} />
            <span>نقاط المسار ({motionPointsCount})</span>
          </button>
        </div>

        {editSubmode === 'mask_points' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              padding: '6px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.07)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
            }}
          >
            <div style={{ fontSize: '9.5px', color: '#bae6fd', lineHeight: 1.4 }}>
              💡 <b>تعديل القناع بالماوس:</b> اسحب أي نقطة زرقاء لتعديل حدود اللمعة، أو اضغط في أي مكان على الكانفاس لإضافة نقطة تحرير جديدة، أو كليك يمين على نقطة لحذفها.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <button
                type="button"
                id="edShinePresetRingMaskBtn"
                onClick={() => onApplyPresetMask('ring')}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  background: 'rgba(245, 158, 11, 0.14)',
                  color: '#fde68a',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                }}
              >
                <CircleDot size={10} />
                <span>قناع إطار حلقي مفرغ</span>
              </button>
              <button
                type="button"
                id="edShinePresetRectMaskBtn"
                onClick={() => onApplyPresetMask('rect')}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid rgba(167, 139, 250, 0.4)',
                  background: 'rgba(167, 139, 250, 0.14)',
                  color: '#ddd6fe',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                }}
              >
                <Square size={10} />
                <span>قناع مستطيل (8 نقاط)</span>
              </button>
              <button
                type="button"
                id="edShineFreeDrawMaskBtn"
                onClick={() => onApplyPresetMask('clear_for_free_draw')}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  background: 'rgba(52, 211, 153, 0.14)',
                  color: '#a7f3d0',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                }}
              >
                <Pencil size={10} />
                <span>رسم حر بالنقاط من الصفر</span>
              </button>
              <button
                type="button"
                onClick={onRemoveLastMaskPoint}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  background: 'rgba(248, 113, 113, 0.12)',
                  color: '#fca5a5',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                }}
              >
                <RotateCcw size={10} />
                <span>حذف آخر نقطة</span>
              </button>
            </div>
            {hasInnerHole && (
              <div style={{ fontSize: '9px', color: '#6ee7b7' }}>
                ✓ القناع يحتوي على تفريغ داخلي (فتحة الإطار الوسطى شفافة مثل إطار الهند)
              </div>
            )}
          </div>
        )}

        {editSubmode === 'motion_points' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              padding: '6px',
              borderRadius: '6px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.28)',
            }}
          >
            <div style={{ fontSize: '9.5px', color: '#fde68a', lineHeight: 1.4 }}>
              💡 <b>تحريك مسار اللمعة:</b> اسحب نقطة البداية الخضراء <b>(P1)</b> أو نقطة النهاية الحمراء <b>(P{motionPointsCount})</b> على الكانفاس، أو اضغط على الكانفاس لإضافة نقطة مسار جديدة!
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <button
                type="button"
                onClick={() => onApplyMotionDirection('diag_tl_br')}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid #2e2e42',
                  background: '#161624',
                  color: '#e2e8f0',
                  fontSize: '9.5px',
                  cursor: 'pointer',
                }}
              >
                ↘ مسار قطري (يسار←يمين)
              </button>
              <button
                type="button"
                onClick={() => onApplyMotionDirection('diag_tr_bl')}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid #2e2e42',
                  background: '#161624',
                  color: '#e2e8f0',
                  fontSize: '9.5px',
                  cursor: 'pointer',
                }}
              >
                ↙ مسار قطري عكسي
              </button>
              <button
                type="button"
                onClick={() => onApplyMotionDirection('horiz_lr')}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid #2e2e42',
                  background: '#161624',
                  color: '#e2e8f0',
                  fontSize: '9.5px',
                  cursor: 'pointer',
                }}
              >
                → مسار أفقي مستقيم
              </button>
              <button
                type="button"
                onClick={() => onApplyMotionDirection('reverse')}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  background: 'rgba(245, 158, 11, 0.14)',
                  color: '#fde047',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                }}
              >
                <ArrowRightLeft size={10} />
                <span>عكس اتجاه اللمعة</span>
              </button>
              <button
                type="button"
                id="edShineAddMotionWaypointBtn"
                onClick={onAddMotionMidpoint}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  background: 'rgba(52, 211, 153, 0.14)',
                  color: '#6ee7b7',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                }}
              >
                <Plus size={10} />
                <span>إضافة نقطة في المسار</span>
              </button>
              <button
                type="button"
                onClick={onRemoveLastMotionPoint}
                disabled={motionPointsCount <= 2}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  background: 'rgba(248, 113, 113, 0.12)',
                  color: motionPointsCount <= 2 ? '#64748b' : '#fca5a5',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  cursor: motionPointsCount <= 2 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                }}
              >
                <Trash2 size={10} />
                <span>حذف نقطة مسار</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Shine Image Source & Procedural Generator (صورة الطبقة اللامعة) */}
      <div
        style={{
          background: 'rgba(12, 12, 20, 0.75)',
          border: '1px solid #27273a',
          borderRadius: '8px',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '7px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#e2e8f0' }}>
            3. صورة الطبقة اللامعة (Shine Image):
          </span>
          <span style={{ fontSize: '9.5px', color: '#fbbf24' }}>
            {config.shineWidth}×{config.shineHeight}px
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '7px',
              background: 'repeating-conic-gradient(#22222c 0 25%, #14141c 0 50%) 0 0 / 8px 8px',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {shineThumbUrl && (
              <img
                src={shineThumbUrl}
                alt={shineLayerName}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
            <button
              type="button"
              id="edUploadCustomShineImgBtn"
              onClick={() => customShineInputRef.current?.click()}
              style={{
                width: '100%',
                padding: '5px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                background: 'rgba(245, 158, 11, 0.16)',
                color: '#fde68a',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <Upload size={11} />
              <span>رفع صورة لمعة خاصة (PNG/WebP)</span>
            </button>

            {svgaAssetKeys.length > 0 && (
              <select
                aria-label="استخدام صورة من ملف SVGA الحالي كلمعة"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    onSelectSvgaAssetAsShineImage(e.target.value);
                  }
                }}
                style={{
                  width: '100%',
                  background: '#141420',
                  border: '1px solid #2b2b3e',
                  borderRadius: '5px',
                  padding: '3px 6px',
                  color: '#cbd5e1',
                  fontSize: '9.5px',
                }}
              >
                <option value="">🖼️ أو اختر صورة من ملف SVGA الحالي...</option>
                {svgaAssetKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Preset Selector */}
        <div>
          <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>قوالب اللمعة الاحترافية الجاهزة:</span>
          <select
            id="edShinePresetSelect"
            aria-label="قالب اللمعة الجاهز"
            value={config.presetId}
            onChange={(e) => {
              const pId = e.target.value as ShinePresetId;
              const found = SHINE_PRESETS.find((p) => p.id === pId);
              if (found) {
                onUpdateConfig(
                  {
                    presetId: found.id,
                    colorPrimary: found.colorPrimary,
                    colorSecondary: found.colorSecondary,
                    beamAngleDeg: found.beamAngleDeg,
                    beamWidthRatio: found.beamWidthRatio,
                  },
                  {
                    regenerateBitmap: true,
                    actionLabel: `تطبيق قالب اللمعة: ${found.labelAr}`,
                  }
                );
              }
            }}
            style={{
              width: '100%',
              marginTop: '3px',
              background: '#141420',
              border: '1px solid #2b2b3e',
              borderRadius: '6px',
              padding: '5px 8px',
              color: '#f8fafc',
              fontSize: '10.5px',
            }}
          >
            {SHINE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.labelAr}
              </option>
            ))}
            {config.presetId === 'custom_image' && (
              <option value="custom_image">صورة لمعة مخصصة (Custom Image)</option>
            )}
          </select>
        </div>

        {config.presetId !== 'custom_image' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>
                <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>لون التوهج</span>
                <input
                  type="color"
                  aria-label="لون التوهج الأساسي"
                  value={config.colorPrimary}
                  onChange={(e) =>
                    onUpdateConfig(
                      { colorPrimary: e.target.value },
                      { regenerateBitmap: true, actionLabel: 'تغيير لون اللمعة' }
                    )
                  }
                  style={{ width: '100%', height: '24px', marginTop: '2px', cursor: 'pointer' }}
                />
              </div>
              <div>
                <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>لون مركز الشعاع</span>
                <input
                  type="color"
                  aria-label="لون مركز الشعاع"
                  value={config.colorSecondary}
                  onChange={(e) =>
                    onUpdateConfig(
                      { colorSecondary: e.target.value },
                      { regenerateBitmap: true, actionLabel: 'تغيير لون مركز اللمعة' }
                    )
                  }
                  style={{ width: '100%', height: '24px', marginTop: '2px', cursor: 'pointer' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ fontSize: '9.5px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                زاوية الشعاع ({config.beamAngleDeg}°)
              </span>
              <input
                type="range"
                min="-85"
                max="85"
                step="1"
                aria-label="زاوية ميلان اللمعة"
                value={config.beamAngleDeg}
                onChange={(e) =>
                  onUpdateConfig(
                    { beamAngleDeg: Number(e.target.value) },
                    { regenerateBitmap: true }
                  )
                }
                style={{ flex: 1, accentColor: '#f59e0b', cursor: 'pointer' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ fontSize: '9.5px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                عرض الشعاع ({Math.round(config.beamWidthRatio * 100)}%)
              </span>
              <input
                type="range"
                min="8"
                max="75"
                step="1"
                aria-label="عرض شعاع اللمعة"
                value={Math.round(config.beamWidthRatio * 100)}
                onChange={(e) =>
                  onUpdateConfig(
                    { beamWidthRatio: Number(e.target.value) / 100 },
                    { regenerateBitmap: true }
                  )
                }
                style={{ flex: 1, accentColor: '#f59e0b', cursor: 'pointer' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. Shine Sweep Timing & Loops (توقيت وسرعة اللمعة عبر الفريمات) */}
      <div
        style={{
          background: 'rgba(12, 12, 20, 0.75)',
          border: '1px solid #27273a',
          borderRadius: '8px',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#e2e8f0' }}>
          4. توقيت وتكرار حركة اللمعة على الفريمات:
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <div>
            <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>فريم البداية</span>
            <input
              type="number"
              min="0"
              max={Math.max(0, totalFrames - 1)}
              aria-label="فريم بداية اللمعة"
              value={config.startFrame}
              onChange={(e) =>
                onUpdateConfig(
                  { startFrame: Math.max(0, Math.min(totalFrames - 1, Number(e.target.value) || 0)) },
                  { regenerateKeyframes: true, actionLabel: 'تحديث فريم بداية اللمعة' }
                )
              }
              style={{
                width: '100%',
                marginTop: '2px',
                background: '#141420',
                border: '1px solid #2b2b3e',
                borderRadius: '5px',
                padding: '3px 6px',
                color: '#fff',
                fontSize: '10.5px',
              }}
            />
          </div>
          <div>
            <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>فريم النهاية</span>
            <input
              type="number"
              min="0"
              max={Math.max(0, totalFrames - 1)}
              aria-label="فريم نهاية اللمعة"
              value={config.endFrame}
              onChange={(e) =>
                onUpdateConfig(
                  { endFrame: Math.max(0, Math.min(totalFrames - 1, Number(e.target.value) || 0)) },
                  { regenerateKeyframes: true, actionLabel: 'تحديث فريم نهاية اللمعة' }
                )
              }
              style={{
                width: '100%',
                marginTop: '2px',
                background: '#141420',
                border: '1px solid #2b2b3e',
                borderRadius: '5px',
                padding: '3px 6px',
                color: '#fff',
                fontSize: '10.5px',
              }}
            />
          </div>
          <div>
            <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>عدد المرات (Loops)</span>
            <input
              type="number"
              min="1"
              max="10"
              aria-label="عدد مرات تكرار اللمعة"
              value={config.loopCount}
              onChange={(e) =>
                onUpdateConfig(
                  { loopCount: Math.max(1, Math.min(10, Number(e.target.value) || 1)) },
                  { regenerateKeyframes: true, actionLabel: 'تحديث تكرار اللمعة' }
                )
              }
              style={{
                width: '100%',
                marginTop: '2px',
                background: '#141420',
                border: '1px solid #2b2b3e',
                borderRadius: '5px',
                padding: '3px 6px',
                color: '#fff',
                fontSize: '10.5px',
              }}
            />
          </div>
          <div>
            <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>توقف بين اللمعات (فريم)</span>
            <input
              type="number"
              min="0"
              max={Math.max(0, totalFrames - 2)}
              aria-label="فريمات التوقف بين اللمعات"
              value={config.pauseFrames}
              onChange={(e) =>
                onUpdateConfig(
                  { pauseFrames: Math.max(0, Number(e.target.value) || 0) },
                  { regenerateKeyframes: true, actionLabel: 'تحديث فترة التوقف لللمعة' }
                )
              }
              style={{
                width: '100%',
                marginTop: '2px',
                background: '#141420',
                border: '1px solid #2b2b3e',
                borderRadius: '5px',
                padding: '3px 6px',
                color: '#fff',
                fontSize: '10.5px',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
