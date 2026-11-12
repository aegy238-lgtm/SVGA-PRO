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
  Palette,
} from 'lucide-react';
import {
  CLONE_COLOR_PRESETS,
  CloneColorPresetId,
  CloneLayerColorAdjustments,
  CloneShineAnimStyle,
  DEFAULT_CLONE_COLOR_ADJUSTMENTS,
  SHINE_PRESETS,
  ShineCanvasEditSubmode,
  ShineLayerConfig,
  ShinePresetId,
  ShineSystemMode,
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
  onSwitchShineSystemMode?: (mode: ShineSystemMode) => void;
  onRecloneFromTargetLayer?: () => void;
  onUploadCloneColorImage?: (file: File) => void;
  onSelectExistingLayerAsCloneSource?: (layerId: string) => void;
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
  onSwitchShineSystemMode,
  onRecloneFromTargetLayer,
  onUploadCloneColorImage,
  onSelectExistingLayerAsCloneSource,
}) => {
  const customShineInputRef = useRef<HTMLInputElement | null>(null);
  const cloneColorUploadInputRef = useRef<HTMLInputElement | null>(null);
  const outerPointsCount = config.maskContours[0]?.length || 0;
  const hasInnerHole = Boolean(config.maskContours[1] && config.maskContours[1].length >= 3);
  const motionPointsCount = config.motionPoints?.length || 0;
  const isColorClone = config.shineSystemMode === 'layer_color_clone';
  const colorAdj: CloneLayerColorAdjustments = {
    ...DEFAULT_CLONE_COLOR_ADJUSTMENTS,
    ...config.colorAdjustments,
  };

  return (
    <div
      id="svgaShineStudioPanel"
      style={{
        background: 'linear-gradient(180deg, rgba(124, 92, 255, 0.14) 0%, rgba(18, 18, 28, 0.96) 100%)',
        border: '1px solid rgba(124, 92, 255, 0.4)',
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
      <input
        ref={cloneColorUploadInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) {
            if (onUploadCloneColorImage) {
              onUploadCloneColorImage(f);
            } else {
              onUploadCustomShineImage(f);
            }
          }
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
              background: 'linear-gradient(135deg, #7c5cff, #6366f1)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              flexShrink: 0,
              boxShadow: '0 2px 10px rgba(124, 92, 255, 0.35)',
            }}
          >
            <Sparkles size={14} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: '11.5px',
                color: '#f1f5f9',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              ✨ استوديو الطبقة اللامعة (Shine)
            </div>
            <div style={{ fontSize: '9.5px', color: '#c084fc' }}>
              نقاط القناع + مسار اللمعة · حفظ SVGA أصلي
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onTriggerPlayPreview}
          title="معاينة حركة اللمعة على الكانفاس"
          style={{
            background: 'rgba(124, 92, 255, 0.2)',
            border: '1px solid rgba(124, 92, 255, 0.5)',
            color: '#e9d5ff',
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

      {/* Dual Shine System Switcher (اختيار نظام اللمعة: لمعة شعاع ١ أو لمعة نفس الطبقة بألوان متغيرة ٢) */}
      <div
        style={{
          background: 'rgba(12, 12, 22, 0.88)',
          border: '1px solid rgba(124, 92, 255, 0.4)',
          borderRadius: '8px',
          padding: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
        }}
      >
        <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#e9d5ff' }}>
          ✨ اختر نوع ونظام اللمعة:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
          <button
            type="button"
            id="edShineSystemBeamBtn"
            onClick={() => {
              if (onSwitchShineSystemMode) {
                onSwitchShineSystemMode('beam_sweep');
              } else {
                onUpdateConfig(
                  { shineSystemMode: 'beam_sweep' },
                  { regenerateBitmap: true, regenerateKeyframes: true, actionLabel: '✨ تم التبديل إلى نظام لمعة الشعاع الكلاسيكية' }
                );
              }
            }}
            style={{
              padding: '6px 6px',
              borderRadius: '6px',
              border: !isColorClone ? '1.5px solid #a78bfa' : '1px solid #2b2b3e',
              background: !isColorClone
                ? 'linear-gradient(135deg, rgba(124, 92, 255, 0.34), rgba(99, 102, 241, 0.24))'
                : '#151522',
              color: !isColorClone ? '#f3e8ff' : '#94a3b8',
              fontSize: '10px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <Sparkles size={11} color={!isColorClone ? '#c084fc' : '#94a3b8'} />
            <span>لمعة ١: شعاع كلاسيكي</span>
          </button>

          <button
            type="button"
            id="edShineSystemCloneColorBtn"
            onClick={() => {
              if (onSwitchShineSystemMode) {
                onSwitchShineSystemMode('layer_color_clone');
              } else {
                onUpdateConfig(
                  {
                    shineSystemMode: 'layer_color_clone',
                    cloneAnimStyle: config.cloneAnimStyle || 'sweep_reveal',
                    colorAdjustments: config.colorAdjustments || DEFAULT_CLONE_COLOR_ADJUSTMENTS,
                  },
                  { regenerateBitmap: true, regenerateKeyframes: true, actionLabel: '🎨 تم التفعيل: لمعة نفس الطبقة الأساسية بألوان متغيرة' }
                );
              }
            }}
            style={{
              padding: '6px 6px',
              borderRadius: '6px',
              border: isColorClone ? '1.5px solid #a78bfa' : '1px solid #2b2b3e',
              background: isColorClone
                ? 'linear-gradient(135deg, rgba(124, 92, 255, 0.34), rgba(99, 102, 241, 0.24))'
                : '#151522',
              color: isColorClone ? '#f3e8ff' : '#94a3b8',
              fontSize: '10px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <Palette size={11} color={isColorClone ? '#c084fc' : '#94a3b8'} />
            <span>لمعة ٢: نفس الطبقة ملونة</span>
          </button>
        </div>
        <div style={{ fontSize: '9px', color: '#c4b5fd', lineHeight: 1.35 }}>
          {isColorClone
            ? '🎨 النظام الثاني: طبقة مطابقة للطبقة الأساسية بألوان مضيئة متغيرة (أو طبقة تحددها أنت) تبرق وتلمع فوق الطبقة الأصلية!'
            : '✨ النظام الأول: شعاع بريق متحرك يمر فوق الطبقة المستهدفة مع قناع النقاط.'}
        </div>
      </div>

      {/* Soft Feathered Edge Transparency Control (التحكم المباشر في الفيذر / الفيزا وشفافية حواف اللمعة في العرض والتصدير SVGA) */}
      <div
        id="edCloneEdgeFeatherControlBox"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          background: 'linear-gradient(135deg, rgba(124, 92, 255, 0.2), rgba(99, 102, 241, 0.12))',
          border: '1px solid rgba(167, 139, 250, 0.5)',
          borderRadius: '8px',
          padding: '8px 9px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#f3e8ff' }}>
            🪶 التحكم في الفيذر (Feather) وشفافية حواف اللمعة:
          </span>
          <span
            style={{
              fontSize: '9.5px',
              fontWeight: 800,
              color: '#f3e8ff',
              background: 'rgba(124, 92, 255, 0.28)',
              border: '1px solid rgba(167, 139, 250, 0.5)',
              padding: '1px 6px',
              borderRadius: '4px',
            }}
          >
            {Math.round((config.beamSoftness ?? 0.92) * 100)}% ({config.edgeFeather ?? 8}px)
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
          {[
            { id: 'edCloneFeatherUltraSoftBtn', label: '☁️ فائقة 100%', soft: 1.0, feather: 10 },
            { id: 'edCloneFeatherSmoothBtn', label: '✨ ناعمة 88%', soft: 0.88, feather: 7 },
            { id: 'edCloneFeatherMediumBtn', label: '💎 متوسطة 55%', soft: 0.55, feather: 4 },
            { id: 'edCloneFeatherSharpBtn', label: '⚡ محددة 20%', soft: 0.2, feather: 1.5 },
          ].map((preset) => {
            const curSoft = config.beamSoftness ?? 0.92;
            const isActive = Math.abs(curSoft - preset.soft) < 0.08;
            return (
              <button
                key={preset.id}
                id={preset.id}
                type="button"
                onClick={() =>
                  onUpdateConfig(
                    {
                      beamSoftness: preset.soft,
                      edgeFeather: preset.feather,
                    },
                    {
                      regenerateBitmap: !isColorClone,
                      actionLabel: `🪶 ضبط الفيذر وشفافية حواف اللمعة (${Math.round(preset.soft * 100)}%) — مطابق في العرض وتصدير SVGA`,
                    }
                  )
                }
                style={{
                  padding: '5px 4px',
                  borderRadius: '6px',
                  border: isActive
                    ? '1.5px solid #a78bfa'
                    : '1px solid rgba(124, 92, 255, 0.28)',
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(124, 92, 255, 0.35), rgba(99, 102, 241, 0.24))'
                    : '#151522',
                  color: isActive ? '#f3e8ff' : '#cbd5e1',
                  fontSize: '9px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <input
          type="range"
          id="edCloneEdgeSoftnessRange"
          min="5"
          max="100"
          step="1"
          aria-label="درجة الفيذر وشفافية حواف اللمعة"
          value={Math.max(5, Math.min(100, Math.round((config.beamSoftness ?? 0.92) * 100)))}
          onChange={(e) => {
            const pct = Number(e.target.value);
            onUpdateConfig(
              {
                beamSoftness: pct / 100,
                edgeFeather: Math.max(1, Math.round((pct / 100) * 10)),
              },
              {
                regenerateBitmap: !isColorClone,
                actionLabel: `🪶 ضبط الفيذر وتلاشي حواف اللمعة (${pct}%) في العرض والتصدير`,
              }
            );
          }}
          style={{ width: '100%', accentColor: '#7c5cff', cursor: 'pointer', height: '4px' }}
        />
      </div>

      {/* 1. Target Layer Selection (استدعاء الطبقة المستهدفة) */}
      <div
        style={{
          background: 'rgba(12, 12, 20, 0.75)',
          border: '1px solid rgba(124, 92, 255, 0.25)',
          borderRadius: '8px',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Layers size={11} color="#c084fc" />
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
            border: '1px solid rgba(124, 92, 255, 0.45)',
            borderRadius: '6px',
            padding: '5px 8px',
            color: '#f8fafc',
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
              border: '1px solid rgba(124, 92, 255, 0.45)',
              background: 'rgba(124, 92, 255, 0.16)',
              color: '#e9d5ff',
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

        {/* Hollow Center Cutout Status Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: hasInnerHole ? 'rgba(124, 92, 255, 0.16)' : 'rgba(124, 92, 255, 0.08)',
            border: hasInnerHole ? '1px solid rgba(167, 139, 250, 0.45)' : '1px solid rgba(124, 92, 255, 0.25)',
            borderRadius: '6px',
            padding: '5px 8px',
            fontSize: '10px',
            color: hasInnerHole ? '#e9d5ff' : '#cbd5e1',
            fontWeight: 600,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CircleDot size={11} color={hasInnerHole ? '#c084fc' : '#a78bfa'} />
            <span>
              {hasInnerHole
                ? '⭕ تم تفريغ منتصف الإطار تلقائياً (100% شفافة بدون تسريب للمعة)'
                : 'إطار كامل / مصمت (بدون تفريغ داخلي)'}
            </span>
          </span>
          {!hasInnerHole && (
            <button
              type="button"
              onClick={() => onApplyPresetMask('ring')}
              style={{
                background: 'rgba(124, 92, 255, 0.25)',
                border: '1px solid rgba(124, 92, 255, 0.5)',
                color: '#f3e8ff',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '9.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              تفريغ إطار حقيقي
            </button>
          )}
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '10px',
            color: '#e2e8f0',
            fontWeight: 700,
            cursor: 'pointer',
            background: 'rgba(124, 92, 255, 0.12)',
            border: '1px solid rgba(124, 92, 255, 0.35)',
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
            style={{ width: 'auto', accentColor: '#7c5cff' }}
          />
          <span>✨ دمج مطابق 100% لحواف وشكل الطبقة الأصلية (بدون آثار قص)</span>
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '10px',
            color: '#e9d5ff',
            fontWeight: 700,
            cursor: 'pointer',
            background: 'rgba(124, 92, 255, 0.12)',
            border: '1px solid rgba(124, 92, 255, 0.35)',
            borderRadius: '6px',
            padding: '5px 7px',
          }}
        >
          <input
            type="checkbox"
            id="edShineMetallicReliefToggle"
            checked={config.metallicSurfaceRelief !== false}
            onChange={(e) =>
              onUpdateConfig(
                { metallicSurfaceRelief: e.target.checked },
                {
                  actionLabel: e.target.checked
                    ? '👑 تم تفعيل عزل المعادن والذهب الأصلي (SVGA Specular) لمنع تغبيش الخلفيات الداكنة'
                    : 'تم إيقاف عزل المعادن وتوزيع اللمعة بالتساوي على كامل السطح',
                }
              )
            }
            style={{ width: 'auto', accentColor: '#7c5cff' }}
          />
          <span>👑 عزل ذكي للمعادن والذهب (لمعة SVGA أصلية بدون تغبيش الخلفية الداكنة)</span>
        </label>

        {/* Automatic Soft Edge Feather Control (تنعيم وتلاشي حواف القص التلقائي — الفيذر / Feather) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            background: 'rgba(124, 92, 255, 0.14)',
            border: '1px solid rgba(167, 139, 250, 0.4)',
            borderRadius: '6px',
            padding: '6px 8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#f3e8ff' }}>
              🪶 تدريج الفيذر ونعومة الحواف (Feather — بدون حواف حادة):
            </span>
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 800,
                color: '#f3e8ff',
                background: 'rgba(124, 92, 255, 0.28)',
                border: '1px solid rgba(167, 139, 250, 0.45)',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              {config.edgeFeather ?? 8}px ({Math.round((config.beamSoftness ?? 0.92) * 100)}%)
            </span>
          </div>
          <input
            type="range"
            id="edShineEdgeFeatherRange"
            aria-label="تدريج الفيذر ونعومة حواف اللمعة"
            min={0}
            max={16}
            step={0.5}
            value={config.edgeFeather ?? 8}
            onChange={(e) => {
              const featherVal = Number(e.target.value);
              const softVal = Math.max(0.05, Math.min(1, Number((featherVal / 10).toFixed(2))));
              onUpdateConfig(
                {
                  edgeFeather: featherVal,
                  beamSoftness: softVal,
                },
                {
                  regenerateBitmap: !isColorClone,
                  actionLabel: `🪶 ضبط تدريج الفيذر ونعومة حواف اللمعة (${featherVal}px / ${Math.round(softVal * 100)}%)`,
                }
              );
            }}
            style={{ width: '100%', accentColor: '#7c5cff', height: '4px', cursor: 'pointer' }}
          />
        </div>

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
              border: '1px solid rgba(124, 92, 255, 0.35)',
              borderRadius: '5px',
              padding: '3px 6px',
              color: '#e9d5ff',
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
            style={{ width: 'auto', accentColor: '#7c5cff' }}
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
                  ? '1.5px solid #a78bfa'
                  : '1px solid #2b2b3e',
              background:
                editSubmode === 'mask_points'
                  ? 'rgba(124, 92, 255, 0.25)'
                  : '#151522',
              color: editSubmode === 'mask_points' ? '#f3e8ff' : '#94a3b8',
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
                  ? '1.5px solid #8b5cf6'
                  : '1px solid #2b2b3e',
              background:
                editSubmode === 'motion_points'
                  ? 'rgba(139, 92, 246, 0.22)'
                  : '#151522',
              color: editSubmode === 'motion_points' ? '#ede9fe' : '#94a3b8',
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
              background: 'rgba(124, 92, 255, 0.08)',
              border: '1px solid rgba(124, 92, 255, 0.28)',
            }}
          >
            <div style={{ fontSize: '9.5px', color: '#e9d5ff', lineHeight: 1.4 }}>
              💡 <b>تعديل القناع بالماوس:</b> اسحب أي نقطة لتعديل حدود اللمعة، أو اضغط في أي مكان على الكانفاس لإضافة نقطة تحرير جديدة، أو كليك يمين على نقطة لحذفها.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <button
                type="button"
                id="edShinePresetRingMaskBtn"
                onClick={() => onApplyPresetMask('ring')}
                style={{
                  padding: '4px 6px',
                  borderRadius: '5px',
                  border: '1px solid rgba(124, 92, 255, 0.4)',
                  background: 'rgba(124, 92, 255, 0.14)',
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
                  border: '1px solid rgba(124, 92, 255, 0.4)',
                  background: 'rgba(124, 92, 255, 0.14)',
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
              <div style={{ fontSize: '9px', color: '#c084fc' }}>
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
              background: 'rgba(124, 92, 255, 0.08)',
              border: '1px solid rgba(124, 92, 255, 0.28)',
            }}
          >
            <div style={{ fontSize: '9.5px', color: '#e9d5ff', lineHeight: 1.4 }}>
              💡 <b>تحريك مسار اللمعة:</b> اسحب نقطة البداية <b>(P1)</b> أو نقطة النهاية <b>(P{motionPointsCount})</b> على الكانفاس، أو اضغط على الكانفاس لإضافة نقطة مسار جديدة!
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
                  border: '1px solid rgba(124, 92, 255, 0.4)',
                  background: 'rgba(124, 92, 255, 0.14)',
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
                  border: '1px solid rgba(124, 92, 255, 0.4)',
                  background: 'rgba(124, 92, 255, 0.14)',
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

      {/* 3. Shine Image Source & Color Clone / Procedural Generator */}
      {isColorClone ? (
        <div
          id="edShineCloneColorSection"
          style={{
            background: 'rgba(12, 12, 20, 0.85)',
            border: '1px solid rgba(124, 92, 255, 0.38)',
            borderRadius: '8px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '7px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#f3e8ff', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Palette size={12} color="#c084fc" />
              <span>3. ألوان ومصدر الطبقة المطابقة اللامعة:</span>
            </span>
            <span style={{ fontSize: '9.5px', color: '#c084fc' }}>
              {config.shineWidth}×{config.shineHeight}px
            </span>
          </div>

          {/* Thumbnail + Upload / Re-clone / Pick Layer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '7px',
                background: 'repeating-conic-gradient(#22222c 0 25%, #14141c 0 50%) 0 0 / 8px 8px',
                border: '1.5px solid rgba(167, 139, 250, 0.55)',
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                <button
                  type="button"
                  id="edUploadCloneColorImgBtn"
                  onClick={() => cloneColorUploadInputRef.current?.click()}
                  title="ارفع نفس الطبقة بعد تعديل ألوانها خارجياً لتعمل كطبقة لامعة"
                  style={{
                    padding: '5px 6px',
                    borderRadius: '6px',
                    border: '1px solid rgba(167, 139, 250, 0.5)',
                    background: 'linear-gradient(135deg, rgba(124, 92, 255, 0.26), rgba(99, 102, 241, 0.18))',
                    color: '#f3e8ff',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <Upload size={10} color="#c084fc" />
                  <span>رفع طبقة ملونة جاهزة</span>
                </button>

                {onRecloneFromTargetLayer && (
                  <button
                    type="button"
                    id="edRecloneTargetLayerBtn"
                    onClick={onRecloneFromTargetLayer}
                    title="استنساخ صورة ومقاس وحركة الطبقة الأساسية المستهدفة من جديد"
                    style={{
                      padding: '5px 6px',
                      borderRadius: '6px',
                      border: '1px solid rgba(124, 92, 255, 0.5)',
                      background: 'rgba(124, 92, 255, 0.18)',
                      color: '#e9d5ff',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <RotateCcw size={10} color="#c084fc" />
                    <span>مزامنة الطبقة الأساسية</span>
                  </button>
                )}
              </div>

              {onSelectExistingLayerAsCloneSource && targetOptions.length > 1 && (
                <select
                  id="edSelectLayerAsCloneSourceSelect"
                  aria-label="اختيار طبقة من المشروع لتعمل كطبقة لامعة"
                  value={config.customCloneSourceLayerId || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      onSelectExistingLayerAsCloneSource(e.target.value);
                    }
                  }}
                  style={{
                    width: '100%',
                    background: '#141420',
                    border: '1px solid rgba(124, 92, 255, 0.45)',
                    borderRadius: '5px',
                    padding: '4px 6px',
                    color: '#e9d5ff',
                    fontSize: '9.5px',
                    fontWeight: 600,
                  }}
                >
                  <option value="">📂 أو حدد أي طبقة مرفوعة بالمشروع لتعمل كلمعة...</option>
                  {targetOptions
                    .filter((opt) => opt.id !== 'DOCUMENT')
                    .map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>

          {/* Clone Animation Style (طريقة عمل الطبقة اللامعة الملونة) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#e2e8f0' }}>
              🎬 طريقة إضاءة وحركة الطبقة الملونة:
            </span>
            <select
              id="edCloneAnimStyleSelect"
              aria-label="طريقة إضاءة وحركة الطبقة الملونة"
              value={config.cloneAnimStyle || 'sweep_reveal'}
              onChange={(e) =>
                onUpdateConfig(
                  { cloneAnimStyle: e.target.value as CloneShineAnimStyle },
                  {
                    regenerateKeyframes: true,
                    actionLabel: 'تحديث نمط حركة لمعة الطبقة الملونة',
                  }
                )
              }
              style={{
                width: '100%',
                background: '#141420',
                border: '1px solid rgba(124, 92, 255, 0.45)',
                borderRadius: '6px',
                padding: '5px 8px',
                color: '#f8fafc',
                fontSize: '10px',
                fontWeight: 700,
              }}
            >
              <option value="sweep_reveal">✨ شعاع كاشف متحرك يمر على الطبقة الملونة (Sweep Reveal)</option>
              <option value="pulse_glow">💫 نبض وتوهج متدرج للطبقة الملونة (Pulse Glow)</option>
              <option value="static_region">🎯 إضاءة مستمرة للمنطقة المحددة بالقناع (Static Glow)</option>
            </select>
          </div>

          {/* Ready-made Color-Clone Presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#cbd5e1' }}>
              🎨 قوالب تغيير ألوان الطبقة اللامعة:
            </span>
            <select
              id="edCloneColorPresetSelect"
              aria-label="قالب ألوان الطبقة اللامعة"
              value={colorAdj.presetId || 'bright_royal_gold'}
              onChange={(e) => {
                const pId = e.target.value as CloneColorPresetId;
                const found = CLONE_COLOR_PRESETS.find((p) => p.id === pId);
                if (found) {
                  onUpdateConfig(
                    {
                      colorAdjustments: { ...found.adjustments },
                    },
                    {
                      regenerateBitmap: true,
                      actionLabel: `🎨 تطبيق ألوان الطبقة اللامعة: ${found.labelAr}`,
                    }
                  );
                }
              }}
              style={{
                width: '100%',
                background: '#141420',
                border: '1px solid rgba(124, 92, 255, 0.45)',
                borderRadius: '6px',
                padding: '5px 8px',
                color: '#f3e8ff',
                fontSize: '10px',
                fontWeight: 700,
              }}
            >
              {CLONE_COLOR_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.labelAr}
                </option>
              ))}
            </select>
          </div>

          {/* Live Color Adjustment Sliders */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              background: 'rgba(20, 20, 32, 0.85)',
              border: '1px solid rgba(124, 92, 255, 0.28)',
              borderRadius: '7px',
              padding: '7px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ fontSize: '9.5px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                🌈 تغيير درجة اللون ({Math.round(colorAdj.hueRotateDeg)}°)
              </span>
              <input
                type="range"
                id="edCloneHueRange"
                min="-180"
                max="180"
                step="1"
                aria-label="تغيير درجة لون الطبقة اللامعة"
                value={Math.round(colorAdj.hueRotateDeg)}
                onChange={(e) =>
                  onUpdateConfig(
                    {
                      colorAdjustments: {
                        ...colorAdj,
                        hueRotateDeg: Number(e.target.value),
                      },
                    },
                    { regenerateBitmap: true }
                  )
                }
                style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ fontSize: '9.5px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                ☀️ السطوع والتوهج ({Math.round(colorAdj.brightnessPct)}%)
              </span>
              <input
                type="range"
                id="edCloneBrightnessRange"
                min="60"
                max="240"
                step="2"
                aria-label="سطوع وتوهج الطبقة اللامعة"
                value={Math.round(colorAdj.brightnessPct)}
                onChange={(e) =>
                  onUpdateConfig(
                    {
                      colorAdjustments: {
                        ...colorAdj,
                        brightnessPct: Number(e.target.value),
                      },
                    },
                    { regenerateBitmap: true }
                  )
                }
                style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ fontSize: '9.5px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                🎨 تشبع الألوان ({Math.round(colorAdj.saturationPct)}%)
              </span>
              <input
                type="range"
                id="edCloneSaturationRange"
                min="0"
                max="280"
                step="2"
                aria-label="تشبع ألوان الطبقة اللامعة"
                value={Math.round(colorAdj.saturationPct)}
                onChange={(e) =>
                  onUpdateConfig(
                    {
                      colorAdjustments: {
                        ...colorAdj,
                        saturationPct: Number(e.target.value),
                      },
                    },
                    { regenerateBitmap: true }
                  )
                }
                style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '85px 1fr', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="color"
                  id="edCloneTintColorInput"
                  aria-label="لون الصبغة المضيئة"
                  value={colorAdj.tintColor || '#fde047'}
                  onChange={(e) =>
                    onUpdateConfig(
                      {
                        colorAdjustments: {
                          ...colorAdj,
                          tintColor: e.target.value,
                        },
                      },
                      { regenerateBitmap: true, actionLabel: 'تغيير لون صبغة الطبقة اللامعة' }
                    )
                  }
                  style={{ width: '26px', height: '22px', cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{ fontSize: '9px', color: '#cbd5e1' }}>لون الصبغة</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '9px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                  قوة الصبغة ({Math.round(colorAdj.tintStrengthPct)}%)
                </span>
                <input
                  type="range"
                  id="edCloneTintStrengthRange"
                  min="0"
                  max="100"
                  step="1"
                  aria-label="قوة صبغة اللون للطبقة اللامعة"
                  value={Math.round(colorAdj.tintStrengthPct)}
                  onChange={(e) =>
                    onUpdateConfig(
                      {
                        colorAdjustments: {
                          ...colorAdj,
                          tintStrengthPct: Number(e.target.value),
                        },
                      },
                      { regenerateBitmap: true }
                    )
                  }
                  style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>

          {/* Sweep Band Width & Angle when in sweep_reveal mode */}
          {(config.cloneAnimStyle || 'sweep_reveal') === 'sweep_reveal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span style={{ fontSize: '9.5px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                  زاوية شعاع الكشف ({Math.max(-85, Math.min(85, Math.round(config.beamAngleDeg)))}°)
                </span>
                <input
                  type="range"
                  min="-85"
                  max="85"
                  step="1"
                  aria-label="زاوية ميلان شعاع كشف الطبقة الملونة"
                  value={Math.max(-85, Math.min(85, Math.round(config.beamAngleDeg)))}
                  onChange={(e) =>
                    onUpdateConfig({ beamAngleDeg: Number(e.target.value) })
                  }
                  style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span style={{ fontSize: '9.5px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                  عرض مساحة اللمعة ({Math.round(config.beamWidthRatio * 100)}%)
                </span>
                <input
                  type="range"
                  min="6"
                  max="75"
                  step="1"
                  aria-label="عرض مساحة اللمعة الكاشفة"
                  value={Math.max(6, Math.min(75, Math.round(config.beamWidthRatio * 100)))}
                  onChange={(e) =>
                    onUpdateConfig({ beamWidthRatio: Number(e.target.value) / 100 })
                  }
                  style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* Opacity Control */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              background: 'rgba(124, 92, 255, 0.12)',
              border: '1px solid rgba(124, 92, 255, 0.38)',
              borderRadius: '7px',
              padding: '6px 8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap' }}>
                ✨ شفافية وقوة الطبقة اللامعة ({Math.round(config.shineOpacity ?? 100)}%)
              </span>
            </div>
            <input
              type="range"
              id="edShineOpacityRange"
              min="5"
              max="100"
              step="1"
              aria-label="شفافية وقوة اللمعة"
              value={Math.round(config.shineOpacity ?? 100)}
              onChange={(e) =>
                onUpdateConfig(
                  { shineOpacity: Number(e.target.value) },
                  { actionLabel: `ضبط شفافية وقوة الطبقة اللامعة (${e.target.value}%)` }
                )
              }
              style={{ width: '100%', accentColor: '#7c5cff', cursor: 'pointer' }}
            />
          </div>
        </div>
      ) : (
      <div
        style={{
          background: 'rgba(12, 12, 20, 0.75)',
          border: '1px solid rgba(124, 92, 255, 0.25)',
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
          <span style={{ fontSize: '9.5px', color: '#c084fc' }}>
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
              border: '1px solid rgba(124, 92, 255, 0.45)',
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
                border: '1px solid rgba(124, 92, 255, 0.45)',
                background: 'rgba(124, 92, 255, 0.16)',
                color: '#e9d5ff',
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

        {/* Preset Selector & Quick SVGA Style Pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
            <span style={{ fontSize: '9.5px', color: '#cbd5e1', fontWeight: 700 }}>
              قوالب اللمعة الاحترافية الأصلية (SVGA 2.0):
            </span>
            {config.presetId === 'custom_image' && (
              <button
                type="button"
                id="edRestoreProceduralShineBtn"
                onClick={() => {
                  const gold = SHINE_PRESETS[0];
                  onUpdateConfig(
                    {
                      presetId: gold.id,
                      colorPrimary: gold.colorPrimary,
                      colorSecondary: gold.colorSecondary,
                      beamAngleDeg: gold.beamAngleDeg,
                      beamWidthRatio: gold.beamWidthRatio,
                    },
                    {
                      regenerateBitmap: true,
                      actionLabel: '✨ تم استعادة شعاع اللمعة الاحترافي الأصلي (SVGA Specular)',
                    }
                  );
                }}
                style={{
                  background: 'rgba(124, 92, 255, 0.28)',
                  border: '1px solid #a78bfa',
                  color: '#ffffff',
                  borderRadius: '5px',
                  padding: '2px 7px',
                  fontSize: '9px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🔄 استعادة شعاع اللمعة الأصلي
              </button>
            )}
          </div>

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
              background: '#141420',
              border: '1px solid rgba(124, 92, 255, 0.45)',
              borderRadius: '6px',
              padding: '5px 8px',
              color: '#f8fafc',
              fontSize: '10.5px',
              fontWeight: 700,
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

        {/* Always-Visible Specular Beam Controls (Colors, Angle, Width) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div>
              <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>لون التوهج المعدني</span>
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
              <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>لون نواة الشعاع</span>
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
              زاوية الشعاع ({Math.max(-85, Math.min(85, Math.round(config.beamAngleDeg)))}°)
            </span>
            <input
              type="range"
              min="-85"
              max="85"
              step="1"
              aria-label="زاوية ميلان اللمعة"
              value={Math.max(-85, Math.min(85, Math.round(config.beamAngleDeg)))}
              onChange={(e) =>
                onUpdateConfig(
                  { beamAngleDeg: Number(e.target.value) },
                  { regenerateBitmap: true }
                )
              }
              style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <span style={{ fontSize: '9.5px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>
              عرض الشعاع ({Math.round(config.beamWidthRatio * 100)}%)
            </span>
            <input
              type="range"
              min="6"
              max="65"
              step="1"
              aria-label="عرض شعاع اللمعة"
              value={Math.max(6, Math.min(65, Math.round(config.beamWidthRatio * 100)))}
              onChange={(e) =>
                onUpdateConfig(
                  { beamWidthRatio: Number(e.target.value) / 100 },
                  { regenerateBitmap: true }
                )
              }
              style={{ flex: 1, accentColor: '#7c5cff', cursor: 'pointer' }}
            />
          </div>
        </div>

        {/* Shine Opacity / Transparency Control (شفافية وقوة اللمعة — يعلي الشفافية ويخففها بجودة كاملة) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            background: 'rgba(124, 92, 255, 0.12)',
            border: '1px solid rgba(124, 92, 255, 0.38)',
            borderRadius: '7px',
            padding: '6px 8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap' }}>
              ✨ شفافية وقوة اللمعة ({Math.round(config.shineOpacity ?? 100)}%)
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                id="edShineOpacityDownBtn"
                onClick={() => {
                  const nextOpa = Math.max(5, Math.round((config.shineOpacity ?? 100) - 10));
                  onUpdateConfig(
                    { shineOpacity: nextOpa },
                    { actionLabel: `تخفيف شفافية اللمعة إلى ${nextOpa}%` }
                  );
                }}
                style={{
                  background: '#161624',
                  border: '1px solid rgba(124, 92, 255, 0.45)',
                  color: '#e9d5ff',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                - تخفيف
              </button>
              <button
                type="button"
                id="edShineOpacityUpBtn"
                onClick={() => {
                  const nextOpa = Math.min(100, Math.round((config.shineOpacity ?? 100) + 10));
                  onUpdateConfig(
                    { shineOpacity: nextOpa },
                    { actionLabel: `تعزيز قوة وشفافية اللمعة إلى ${nextOpa}%` }
                  );
                }}
                style={{
                  background: 'rgba(124, 92, 255, 0.25)',
                  border: '1px solid rgba(124, 92, 255, 0.55)',
                  color: '#ffffff',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                + تعزيز
              </button>
            </div>
          </div>

          <input
            type="range"
            id="edShineOpacityRange"
            min="5"
            max="100"
            step="1"
            aria-label="شفافية وقوة اللمعة"
            value={Math.round(config.shineOpacity ?? 100)}
            onChange={(e) =>
              onUpdateConfig(
                { shineOpacity: Number(e.target.value) },
                { actionLabel: `ضبط شفافية وقوة اللمعة (${e.target.value}%)` }
              )
            }
            style={{ width: '100%', accentColor: '#7c5cff', cursor: 'pointer' }}
          />
        </div>
      </div>
      )}

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
