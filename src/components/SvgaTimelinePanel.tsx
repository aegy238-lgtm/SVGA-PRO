import React from 'react';
import {
  Play,
  Pause,
  ChevronDown,
  ChevronRight,
  Diamond,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Type,
  Hexagon,
  Trash2,
  SlidersHorizontal,
  Clock,
  Link2,
  Scissors,
} from 'lucide-react';
import {
  AnimatableProperty,
  LayerPropertyKeyframes,
  LayerTransform,
  SpriteFrameRange,
} from '../utils/svgaEditorLogic';

export interface TimelineSpriteLayerItem {
  spriteIdx: number;
  id: string;
  displayNum: number;
  key: string;
  matteKey?: string;
  span: {
    firstFrame: number;
    lastFrame: number;
    activeCount: number;
    isStatic: boolean;
  };
}

export interface TimelineAddedLayerItem {
  id: string;
  assetKey: string;
  name: string;
  width: number;
  height: number;
  inFrame: number;
  outFrame: number;
}

export interface TimelineShapeLayerItem {
  id: string;
  assetKey: string;
  type: 'rectangle' | 'ellipse' | 'polygon' | 'path' | 'text';
  name: string;
  color: string;
  inFrame: number;
  outFrame: number;
}

interface SvgaTimelinePanelProps {
  docName: string;
  playing: boolean;
  onTogglePlay: () => void;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  durationSec: number;
  rulerMarks: string[];
  rulerRef: React.RefObject<HTMLDivElement | null>;
  onScrubFromClientX: (clientX: number) => void;
  onSetCurrentFrame: (frame: number) => void;
  selectedTarget: string;
  onSelectTarget: (target: string, assetKey: string | null) => void;
  docTrackExpanded: boolean;
  onToggleDocTrackExpanded: () => void;
  expandedTimelineLayerIds: Set<string>;
  onToggleLayerExpand: (layerId: string) => void;
  hiddenLayerIds: Set<string>;
  onToggleLayerVisibility: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  scaleLinked: boolean;
  onToggleScaleLinked: () => void;
  spriteLayers: TimelineSpriteLayerItem[];
  addedLayers: TimelineAddedLayerItem[];
  shapes: TimelineShapeLayerItem[];
  spriteFrameRanges: Record<number, SpriteFrameRange>;
  layerKeyframes: Record<string, LayerPropertyKeyframes>;
  getEffectiveTransform: (layerId: string, assetKey: string | undefined, frame: number) => LayerTransform;
  onUpdateLayerTransform: (
    layerId: string,
    assetKey: string | null,
    patch: Partial<LayerTransform>,
    actionDesc?: string
  ) => void;
  onTogglePropertyKeyframe: (
    layerId: string,
    prop: AnimatableProperty | 'all',
    atFrame?: number
  ) => void;
  onStartLayerBarDrag: (
    e: React.PointerEvent<HTMLElement>,
    layerId: string,
    mode: 'move' | 'trimStart' | 'trimEnd',
    currentIn: number,
    currentOut: number,
    currentOffset?: number
  ) => void;
  onSplitOrTrimLayerAtCurrentFrame: (layerId: string, mode: 'trimIn' | 'trimOut') => void;
}

export const SvgaTimelinePanel: React.FC<SvgaTimelinePanelProps> = ({
  docName,
  playing,
  onTogglePlay,
  currentFrame,
  totalFrames,
  fps,
  durationSec,
  rulerMarks,
  rulerRef,
  onScrubFromClientX,
  onSetCurrentFrame,
  selectedTarget,
  onSelectTarget,
  docTrackExpanded,
  onToggleDocTrackExpanded,
  expandedTimelineLayerIds,
  onToggleLayerExpand,
  hiddenLayerIds,
  onToggleLayerVisibility,
  onDeleteLayer,
  scaleLinked,
  onToggleScaleLinked,
  spriteLayers,
  addedLayers,
  shapes,
  spriteFrameRanges,
  layerKeyframes,
  getEffectiveTransform,
  onUpdateLayerTransform,
  onTogglePropertyKeyframe,
  onStartLayerBarDrag,
  onSplitOrTrimLayerAtCurrentFrame,
}) => {
  const playheadPercent =
    totalFrames > 1 ? Math.min(100, Math.max(0, (currentFrame / (totalFrames - 1)) * 100)) : 0;

  const clientXToFrame = (clientX: number, trackEl: HTMLElement): number => {
    const rect = trackEl.getBoundingClientRect();
    const usableW = Math.max(1, rect.width - 36);
    const relX = clientX - (rect.left + 18);
    const ratio = Math.max(0, Math.min(1, relX / usableW));
    return Math.min(totalFrames - 1, Math.max(0, Math.round(ratio * (totalFrames - 1))));
  };

  const renderPropertyKeyframeTrack = (
    layerId: string,
    prop: AnimatableProperty,
    kfMap: Record<number, any> | undefined,
    accentColor = '#f59e0b'
  ) => {
    const frames = Object.keys(kfMap || {})
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const hasAtCurrent = kfMap && kfMap[currentFrame] !== undefined;

    return (
      <div
        onClick={(e) => {
          const clickedF = clientXToFrame(e.clientX, e.currentTarget);
          onSetCurrentFrame(clickedF);
        }}
        onDoubleClick={(e) => {
          const clickedF = clientXToFrame(e.clientX, e.currentTarget);
          onSetCurrentFrame(clickedF);
          onTogglePropertyKeyframe(layerId, prop, clickedF);
        }}
        title="اضغط للانتقال للفريم · دبل كليك لإضافة/حذف نقطة تحريك (Keyframe) لهذه الميزة"
        style={{
          flex: 1,
          padding: '0 18px',
          position: 'relative',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '2px',
            background: frames.length > 0 ? 'rgba(245, 158, 11, 0.35)' : '#191926',
          }}
        />
        {/* Quick +◆ button on the track at current playhead position */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePropertyKeyframe(layerId, prop, currentFrame);
          }}
          title={
            hasAtCurrent
              ? `حذف نقطة التحريك (${prop}) عند الفريم ${currentFrame}`
              : `إضافة نقطة تحريك (${prop}) عند الفريم ${currentFrame}`
          }
          style={{
            position: 'absolute',
            left: '4px',
            background: hasAtCurrent ? 'rgba(245,158,11,0.2)' : 'rgba(124,92,255,0.14)',
            border: `1px solid ${hasAtCurrent ? '#f59e0b' : '#323248'}`,
            color: hasAtCurrent ? '#fbbf24' : '#9898ac',
            borderRadius: '4px',
            fontSize: '9px',
            padding: '0 4px',
            height: '16px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            cursor: 'pointer',
            zIndex: 3,
          }}
        >
          <span>{hasAtCurrent ? '◆' : '+◇'}</span>
        </button>

        {/* Render connecting segment between first and last keyframe */}
        {frames.length >= 2 && (
          <div
            style={{
              position: 'absolute',
              left: `calc(18px + (100% - 36px) * ${frames[0] / Math.max(1, totalFrames - 1)})`,
              width: `calc((100% - 36px) * ${(frames[frames.length - 1] - frames[0]) / Math.max(1, totalFrames - 1)})`,
              height: '3px',
              background: 'rgba(245, 158, 11, 0.45)',
              borderRadius: '2px',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Render individual diamond points on this property row */}
        {frames.map((kf) => {
          const pct = totalFrames > 1 ? (kf / (totalFrames - 1)) * 100 : 0;
          const isCurrent = kf === currentFrame;
          return (
            <div
              key={kf}
              onClick={(e) => {
                e.stopPropagation();
                onSetCurrentFrame(kf);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTogglePropertyKeyframe(layerId, prop, kf);
              }}
              title={`نقطة تحريك ${prop} @ Frame ${kf} (كليك للانتقال · كليك يمين للحذف)`}
              style={{
                position: 'absolute',
                left: `calc(18px + (100% - 36px) * ${pct / 100})`,
                transform: 'translateX(-50%) rotate(45deg)',
                width: isCurrent ? '9px' : '7px',
                height: isCurrent ? '9px' : '7px',
                background: isCurrent ? '#fde047' : accentColor,
                border: '1px solid #ffffff',
                boxShadow: isCurrent ? '0 0 6px #f59e0b' : 'none',
                cursor: 'pointer',
                zIndex: 4,
              }}
            />
          );
        })}
      </div>
    );
  };

  const renderTimelineTransformSubrows = (
    layerId: string,
    assetKey: string | null,
    t: LayerTransform
  ) => {
    const pkf: LayerPropertyKeyframes = layerKeyframes[layerId] || {};
    const hasPosKf = pkf.position?.[currentFrame] !== undefined;
    const hasScaleKf = pkf.scale?.[currentFrame] !== undefined;
    const hasRotKf = pkf.rotation?.[currentFrame] !== undefined;
    const hasOpaKf = pkf.opacity?.[currentFrame] !== undefined;
    const hasAnyKfAtCurrent = hasPosKf || hasScaleKf || hasRotKf || hasOpaKf;

    const allKfFrames = Array.from(
      new Set([
        ...Object.keys(pkf.position || {}).map(Number),
        ...Object.keys(pkf.scale || {}).map(Number),
        ...Object.keys(pkf.rotation || {}).map(Number),
        ...Object.keys(pkf.opacity || {}).map(Number),
      ])
    ).sort((a, b) => a - b);

    return (
      <>
        {/* Master Transform header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '26px',
            minHeight: '26px',
            borderBottom: '1px solid #14141d',
            background: '#0d0d14',
          }}
        >
          <div
            style={{
              width: '280px',
              minWidth: '280px',
              padding: '0 8px 0 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRight: '1px solid #1b1b26',
              height: '100%',
              color: '#a78bfa',
              fontSize: '11px',
              gap: '4px',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              <SlidersHorizontal size={11} />
              <span>Transform</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => onSplitOrTrimLayerAtCurrentFrame(layerId, 'trimIn')}
                title="قص بداية الشريط عند الفريم الحالي (Trim Start to Playhead)"
                style={{
                  background: '#171724',
                  border: '1px solid #28283c',
                  color: '#a0a0b8',
                  borderRadius: '4px',
                  padding: '1px 5px',
                  fontSize: '9px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                [ قص البداية
              </button>
              <button
                type="button"
                onClick={() => onSplitOrTrimLayerAtCurrentFrame(layerId, 'trimOut')}
                title="قص نهاية الشريط عند الفريم الحالي (Trim End to Playhead)"
                style={{
                  background: '#171724',
                  border: '1px solid #28283c',
                  color: '#a0a0b8',
                  borderRadius: '4px',
                  padding: '1px 5px',
                  fontSize: '9px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                قص النهاية ]
              </button>
              <button
                type="button"
                onClick={() => onTogglePropertyKeyframe(layerId, 'all', currentFrame)}
                title="إضافة/حذف نقطة تحريك لجميع الخصائص عند الفريم الحالي"
                style={{
                  background: hasAnyKfAtCurrent ? 'rgba(245,158,11,0.18)' : 'transparent',
                  border: `1px solid ${hasAnyKfAtCurrent ? '#f59e0b' : '#2c2c3e'}`,
                  borderRadius: '4px',
                  padding: '1px 5px',
                  color: hasAnyKfAtCurrent ? '#fbbf24' : '#9e9eb0',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  fontSize: '9px',
                  whiteSpace: 'nowrap',
                }}
              >
                <Diamond size={9} />
                <span>+All</span>
              </button>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              padding: '0 18px',
              position: 'relative',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div style={{ width: '100%', height: '1px', background: '#1e1e2c' }} />
            {allKfFrames.map((kf) => {
              const pct = totalFrames > 1 ? (kf / (totalFrames - 1)) * 100 : 0;
              return (
                <div
                  key={kf}
                  onClick={() => onSetCurrentFrame(kf)}
                  title={`Keyframe @ Frame ${kf}`}
                  style={{
                    position: 'absolute',
                    left: `calc(18px + (100% - 36px) * ${pct / 100})`,
                    transform: 'translateX(-50%) rotate(45deg)',
                    width: '6px',
                    height: '6px',
                    background: '#a78bfa',
                    border: '1px solid #fff',
                    cursor: 'pointer',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* 1. Position X/Y row with dedicated keyframe button & track */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '26px',
            minHeight: '26px',
            borderBottom: '1px solid #14141d',
            background: '#0b0b12',
          }}
        >
          <div
            style={{
              width: '280px',
              minWidth: '280px',
              padding: '0 8px 0 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRight: '1px solid #1b1b26',
              height: '100%',
              fontSize: '11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button
                type="button"
                aria-label={`Add Position keyframe for ${layerId}`}
                onClick={() => onTogglePropertyKeyframe(layerId, 'position', currentFrame)}
                title="إضافة/حذف نقطة تحريك Position عند الفريم الحالي"
                style={{
                  background: hasPosKf ? 'rgba(245,158,11,0.22)' : '#151522',
                  border: `1px solid ${hasPosKf ? '#f59e0b' : '#2b2b3d'}`,
                  color: hasPosKf ? '#fbbf24' : '#8e8ea0',
                  borderRadius: '4px',
                  width: '18px',
                  height: '18px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <Diamond size={10} />
              </button>
              <span
                onClick={() => onTogglePropertyKeyframe(layerId, 'position', currentFrame)}
                style={{
                  color: hasPosKf ? '#fde047' : '#b0b0c4',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: hasPosKf ? 600 : 400,
                }}
              >
                <Clock size={10} /> Position
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: '#7e7e90', fontSize: '10px' }}>X</span>
              <input
                type="number"
                step="1"
                value={t.x}
                onChange={(e) =>
                  onUpdateLayerTransform(
                    layerId,
                    assetKey,
                    { x: Number(e.target.value) },
                    'Updated Position X'
                  )
                }
                style={{
                  width: '44px',
                  background: '#14141e',
                  border: '1px solid #232334',
                  borderRadius: '4px',
                  padding: '1px 4px',
                  textAlign: 'right',
                  fontSize: '11px',
                }}
              />
              <span style={{ color: '#7e7e90', fontSize: '10px' }}>Y</span>
              <input
                type="number"
                step="1"
                value={t.y}
                onChange={(e) =>
                  onUpdateLayerTransform(
                    layerId,
                    assetKey,
                    { y: Number(e.target.value) },
                    'Updated Position Y'
                  )
                }
                style={{
                  width: '44px',
                  background: '#14141e',
                  border: '1px solid #232334',
                  borderRadius: '4px',
                  padding: '1px 4px',
                  textAlign: 'right',
                  fontSize: '11px',
                }}
              />
            </div>
          </div>
          {renderPropertyKeyframeTrack(layerId, 'position', pkf.position, '#f59e0b')}
        </div>

        {/* 2. Scale SX/SY row with dedicated keyframe button & track */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '26px',
            minHeight: '26px',
            borderBottom: '1px solid #14141d',
            background: '#0b0b12',
          }}
        >
          <div
            style={{
              width: '280px',
              minWidth: '280px',
              padding: '0 8px 0 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRight: '1px solid #1b1b26',
              height: '100%',
              fontSize: '11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button
                type="button"
                aria-label={`Add Scale keyframe for ${layerId}`}
                onClick={() => onTogglePropertyKeyframe(layerId, 'scale', currentFrame)}
                title="إضافة/حذف نقطة تحريك Scale عند الفريم الحالي"
                style={{
                  background: hasScaleKf ? 'rgba(56,189,248,0.22)' : '#151522',
                  border: `1px solid ${hasScaleKf ? '#38bdf8' : '#2b2b3d'}`,
                  color: hasScaleKf ? '#38bdf8' : '#8e8ea0',
                  borderRadius: '4px',
                  width: '18px',
                  height: '18px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <Diamond size={10} />
              </button>
              <span
                onClick={() => onTogglePropertyKeyframe(layerId, 'scale', currentFrame)}
                style={{
                  color: hasScaleKf ? '#38bdf8' : '#b0b0c4',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: hasScaleKf ? 600 : 400,
                }}
              >
                <Clock size={10} /> Scale
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <button
                type="button"
                onClick={onToggleScaleLinked}
                style={{
                  background: 0,
                  border: 0,
                  color: scaleLinked ? '#a78bfa' : '#555',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <Link2 size={11} />
              </button>
              <span style={{ color: '#7e7e90', fontSize: '10px' }}>X</span>
              <input
                type="number"
                value={t.sx}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onUpdateLayerTransform(
                    layerId,
                    assetKey,
                    scaleLinked ? { sx: v, sy: v } : { sx: v },
                    'Updated Scale'
                  );
                }}
                style={{
                  width: '38px',
                  background: '#14141e',
                  border: '1px solid #232334',
                  borderRadius: '4px',
                  padding: '1px 3px',
                  textAlign: 'right',
                  fontSize: '11px',
                }}
              />
              <span style={{ color: '#6e6e80', fontSize: '10px' }}>%</span>
              <span style={{ color: '#7e7e90', fontSize: '10px', marginLeft: '1px' }}>Y</span>
              <input
                type="number"
                value={t.sy}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onUpdateLayerTransform(
                    layerId,
                    assetKey,
                    scaleLinked ? { sx: v, sy: v } : { sy: v },
                    'Updated Scale'
                  );
                }}
                style={{
                  width: '38px',
                  background: '#14141e',
                  border: '1px solid #232334',
                  borderRadius: '4px',
                  padding: '1px 3px',
                  textAlign: 'right',
                  fontSize: '11px',
                }}
              />
              <span style={{ color: '#6e6e80', fontSize: '10px' }}>%</span>
            </div>
          </div>
          {renderPropertyKeyframeTrack(layerId, 'scale', pkf.scale, '#38bdf8')}
        </div>

        {/* 3. Rotation R row with dedicated keyframe button & track */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '26px',
            minHeight: '26px',
            borderBottom: '1px solid #14141d',
            background: '#0b0b12',
          }}
        >
          <div
            style={{
              width: '280px',
              minWidth: '280px',
              padding: '0 8px 0 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRight: '1px solid #1b1b26',
              height: '100%',
              fontSize: '11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button
                type="button"
                aria-label={`Add Rotation keyframe for ${layerId}`}
                onClick={() => onTogglePropertyKeyframe(layerId, 'rotation', currentFrame)}
                title="إضافة/حذف نقطة تحريك Rotation عند الفريم الحالي"
                style={{
                  background: hasRotKf ? 'rgba(52,211,153,0.22)' : '#151522',
                  border: `1px solid ${hasRotKf ? '#34d399' : '#2b2b3d'}`,
                  color: hasRotKf ? '#34d399' : '#8e8ea0',
                  borderRadius: '4px',
                  width: '18px',
                  height: '18px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <Diamond size={10} />
              </button>
              <span
                onClick={() => onTogglePropertyKeyframe(layerId, 'rotation', currentFrame)}
                style={{
                  color: hasRotKf ? '#34d399' : '#b0b0c4',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: hasRotKf ? 600 : 400,
                }}
              >
                <Clock size={10} /> Rotation
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#7e7e90', fontSize: '10px' }}>R</span>
              <input
                type="number"
                value={t.rotation}
                onChange={(e) =>
                  onUpdateLayerTransform(
                    layerId,
                    assetKey,
                    { rotation: Number(e.target.value) },
                    'Updated Rotation'
                  )
                }
                style={{
                  width: '48px',
                  background: '#14141e',
                  border: '1px solid #232334',
                  borderRadius: '4px',
                  padding: '1px 4px',
                  textAlign: 'right',
                  fontSize: '11px',
                }}
              />
              <span style={{ color: '#6e6e80', fontSize: '10px' }}>°</span>
            </div>
          </div>
          {renderPropertyKeyframeTrack(layerId, 'rotation', pkf.rotation, '#34d399')}
        </div>

        {/* 4. Opacity O row with dedicated keyframe button & track */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '26px',
            minHeight: '26px',
            borderBottom: '1px solid #14141d',
            background: '#0b0b12',
          }}
        >
          <div
            style={{
              width: '280px',
              minWidth: '280px',
              padding: '0 8px 0 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderRight: '1px solid #1b1b26',
              height: '100%',
              fontSize: '11px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button
                type="button"
                aria-label={`Add Opacity keyframe for ${layerId}`}
                onClick={() => onTogglePropertyKeyframe(layerId, 'opacity', currentFrame)}
                title="إضافة/حذف نقطة تحريك Opacity عند الفريم الحالي"
                style={{
                  background: hasOpaKf ? 'rgba(244,114,182,0.22)' : '#151522',
                  border: `1px solid ${hasOpaKf ? '#f472b6' : '#2b2b3d'}`,
                  color: hasOpaKf ? '#f472b6' : '#8e8ea0',
                  borderRadius: '4px',
                  width: '18px',
                  height: '18px',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <Diamond size={10} />
              </button>
              <span
                onClick={() => onTogglePropertyKeyframe(layerId, 'opacity', currentFrame)}
                style={{
                  color: hasOpaKf ? '#f472b6' : '#b0b0c4',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: hasOpaKf ? 600 : 400,
                }}
              >
                <Clock size={10} /> Opacity
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  color: '#a78bfa',
                  background: 'rgba(124,92,255,0.18)',
                  padding: '0 4px',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}
              >
                O
              </span>
              <input
                type="number"
                min="0"
                max="100"
                value={t.opacity}
                onChange={(e) =>
                  onUpdateLayerTransform(
                    layerId,
                    assetKey,
                    { opacity: Math.max(0, Math.min(100, Number(e.target.value))) },
                    'Updated Opacity'
                  )
                }
                style={{
                  width: '48px',
                  background: '#14141e',
                  border: '1px solid #232334',
                  borderRadius: '4px',
                  padding: '1px 4px',
                  textAlign: 'right',
                  fontSize: '11px',
                }}
              />
              <span style={{ color: '#6e6e80', fontSize: '10px' }}>%</span>
            </div>
          </div>
          {renderPropertyKeyframeTrack(layerId, 'opacity', pkf.opacity, '#f472b6')}
        </div>
      </>
    );
  };

  // Interactive draggable & trimmable timeline bar for any layer
  const renderInteractiveLayerBar = (
    layerId: string,
    assetKey: string | null,
    inFrame: number,
    outFrame: number,
    offsetFrames: number,
    isSel: boolean,
    activeColor: string,
    idleColor: string
  ) => {
    const clampedIn = Math.max(0, Math.min(totalFrames - 1, inFrame));
    const clampedOut = Math.max(clampedIn, Math.min(totalFrames - 1, outFrame));
    const startPct = totalFrames > 1 ? (clampedIn / (totalFrames - 1)) * 100 : 0;
    const endPct = totalFrames > 1 ? (clampedOut / (totalFrames - 1)) * 100 : 100;
    const widthPct = Math.max(2.5, endPct - startPct);

    return (
      <div
        onClick={(e) => {
          onSelectTarget(layerId, assetKey);
          onScrubFromClientX(e.clientX);
        }}
        style={{
          flex: 1,
          padding: '0 18px',
          position: 'relative',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '15px',
            position: 'relative',
            background: '#13131d',
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectTarget(layerId, assetKey);
              onStartLayerBarDrag(e, layerId, 'move', clampedIn, clampedOut, offsetFrames);
            }}
            title={`اسحب بالماوس لتحريك توقيت الطبقة (F${clampedIn}–F${clampedOut}) أو اسحب الأطراف لقص الشريط`}
            style={{
              position: 'absolute',
              left: `${startPct}%`,
              width: `${widthPct}%`,
              top: 0,
              bottom: 0,
              borderRadius: '4px',
              background: isSel ? activeColor : idleColor,
              border: isSel ? '1px solid #fde047' : '1px solid rgba(255,255,255,0.12)',
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
            }}
          >
            {/* Left Trim Handle */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectTarget(layerId, assetKey);
                onStartLayerBarDrag(e, layerId, 'trimStart', clampedIn, clampedOut, offsetFrames);
              }}
              title="اسحب لقص بداية ظهور الطبقة (In Frame)"
              style={{
                width: '7px',
                height: '100%',
                background: isSel ? '#f59e0b' : 'rgba(255,255,255,0.28)',
                cursor: 'ew-resize',
                borderTopLeftRadius: '3px',
                borderBottomLeftRadius: '3px',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '9px',
                color: 'rgba(255,255,255,0.85)',
                padding: '0 4px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              F{clampedIn}–{clampedOut}
            </span>
            {/* Right Trim Handle */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectTarget(layerId, assetKey);
                onStartLayerBarDrag(e, layerId, 'trimEnd', clampedIn, clampedOut, offsetFrames);
              }}
              title="اسحب لقص نهاية ظهور الطبقة (Out Frame)"
              style={{
                width: '7px',
                height: '100%',
                background: isSel ? '#f59e0b' : 'rgba(255,255,255,0.28)',
                cursor: 'ew-resize',
                borderTopRightRadius: '3px',
                borderBottomRightRadius: '3px',
                flexShrink: 0,
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        height: '255px',
        minHeight: '255px',
        background: '#0b0b10',
        borderTop: '1px solid #1b1b26',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top Timeline Transport + Time Ruler */}
      <div
        style={{
          height: '40px',
          minHeight: '40px',
          borderBottom: '1px solid #1b1b26',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: '280px',
            minWidth: '280px',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            borderRight: '1px solid #1b1b26',
            height: '100%',
          }}
        >
          <button
            type="button"
            id="edPlayPause"
            onClick={onTogglePlay}
            style={{
              width: '30px',
              height: '26px',
              borderRadius: '6px',
              border: '1px solid #252536',
              background: '#14141e',
              color: '#e8e8ee',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <span
            style={{
              padding: '3px 7px',
              borderRadius: '6px',
              background: '#14141e',
              border: '1px solid #222230',
              fontWeight: 600,
              fontSize: '11px',
              color: '#e8e8ee',
            }}
          >
            {(currentFrame / fps).toFixed(2)}s
          </span>
          <span style={{ color: '#6e6e80' }}>/</span>
          <span
            style={{
              padding: '3px 7px',
              borderRadius: '6px',
              background: '#14141e',
              border: '1px solid #222230',
              fontWeight: 600,
              fontSize: '11px',
              color: '#a0a0b2',
            }}
          >
            {durationSec.toFixed(2)}s
          </span>
          {selectedTarget !== 'DOCUMENT' && (
            <button
              type="button"
              onClick={() => onSplitOrTrimLayerAtCurrentFrame(selectedTarget, 'trimOut')}
              title="قص شريط الطبقة المحددة عند الفريم الحالي"
              style={{
                marginLeft: 'auto',
                background: 'rgba(245,158,11,0.15)',
                border: '1px solid rgba(245,158,11,0.4)',
                color: '#fbbf24',
                borderRadius: '5px',
                padding: '2px 6px',
                fontSize: '10px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <Scissors size={10} /> قص
            </button>
          )}
          <span style={{ marginLeft: selectedTarget === 'DOCUMENT' ? 'auto' : '2px', color: '#7e7e90', fontSize: '10px' }}>
            F{currentFrame}/{totalFrames - 1}
          </span>
        </div>

        <div
          ref={rulerRef}
          onPointerDown={(e) => {
            onScrubFromClientX(e.clientX);
            const move = (ev: PointerEvent) => onScrubFromClientX(ev.clientX);
            const up = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
          style={{
            flex: 1,
            height: '100%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 18px',
            cursor: 'ew-resize',
          }}
        >
          {rulerMarks.map((m, idx) => (
            <span
              key={idx}
              style={{
                color: '#88889a',
                fontSize: '11px',
                fontWeight: 600,
                pointerEvents: 'none',
              }}
            >
              {m}
            </span>
          ))}

          <div
            style={{
              position: 'absolute',
              left: `calc(18px + (100% - 36px) * ${playheadPercent / 100})`,
              top: '8px',
              transform: 'translateX(-50%)',
              zIndex: 10,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                background: '#7c5cff',
                color: '#fff',
                fontWeight: 700,
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '5px',
                boxShadow: '0 2px 8px rgba(124,92,255,0.5)',
              }}
            >
              {currentFrame}
            </div>
            <div
              style={{
                width: '2px',
                height: '250px',
                background: '#7c5cff',
              }}
            />
          </div>
        </div>
      </div>

      {/* Scrollable Timeline Tracks */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            height: '24px',
            minHeight: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #161620',
            padding: '0 12px',
            color: '#7e7e90',
            fontSize: '11px',
          }}
        >
          <span>
            Layers ({spriteLayers.length + addedLayers.length + shapes.length} tracks)
          </span>
          <span style={{ fontSize: '10px', color: '#9898b0' }}>
            اضغط &gt; لإظهار نقاط التحريك (◆) قصاد كل ميزة · اسحب أطراف الشريط بالماوس لقص أو تحريك التوقيت
          </span>
        </div>

        {/* 1. DOCUMENT MASTER TIMELINE TRACK */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '28px',
            minHeight: '28px',
            borderBottom: '1px solid #15151e',
            background: selectedTarget === 'DOCUMENT' ? '#141422' : 'transparent',
          }}
        >
          <div
            id="timelineDocRow"
            onClick={() => {
              onSelectTarget('DOCUMENT', null);
              onToggleDocTrackExpanded();
            }}
            style={{
              width: '280px',
              minWidth: '280px',
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              borderRight: '1px solid #1b1b26',
              height: '100%',
            }}
          >
            {docTrackExpanded ? (
              <ChevronDown size={12} color="#7e7e90" />
            ) : (
              <ChevronRight size={12} color="#7e7e90" />
            )}
            <Diamond size={11} color="#a78bfa" />
            <span
              style={{
                fontWeight: 600,
                color: '#e8e8ee',
                fontSize: '11px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {docName} (Master)
            </span>
          </div>
          <div style={{ flex: 1, padding: '0 18px', display: 'flex', alignItems: 'center' }}>
            <div
              onClick={(e) => onScrubFromClientX(e.clientX)}
              style={{
                width: '100%',
                height: '13px',
                borderRadius: '4px',
                background: 'linear-gradient(90deg, #6d28d9, #7c5cff)',
                opacity: 0.85,
                cursor: 'pointer',
              }}
            />
          </div>
        </div>

        {docTrackExpanded &&
          renderTimelineTransformSubrows(
            'DOCUMENT',
            null,
            getEffectiveTransform('DOCUMENT', undefined, currentFrame)
          )}

        {/* 2. ADDED SHAPE / TEXT LAYERS IN TIMELINE */}
        {shapes.map((sh) => {
          const isExp = expandedTimelineLayerIds.has(sh.id);
          const isSel = selectedTarget === sh.id;
          const isHidden = hiddenLayerIds.has(sh.id);
          const t = getEffectiveTransform(sh.id, sh.assetKey, currentFrame);
          return (
            <React.Fragment key={sh.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '28px',
                  minHeight: '28px',
                  borderBottom: '1px solid #15151e',
                  background: isSel ? '#171728' : 'transparent',
                  opacity: isHidden ? 0.45 : 1,
                }}
              >
                <div
                  onClick={() => onSelectTarget(sh.id, null)}
                  style={{
                    width: '280px',
                    minWidth: '280px',
                    padding: '0 10px 0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    borderRight: '1px solid #1b1b26',
                    height: '100%',
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLayerExpand(sh.id);
                    }}
                    style={{
                      background: 0,
                      border: 0,
                      color: '#7e7e90',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {isExp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLayerVisibility(sh.id);
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
                    {isHidden ? <EyeOff size={11} /> : <Eye size={11} />}
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
                      fontSize: '11px',
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
                      onDeleteLayer(sh.id);
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
                {renderInteractiveLayerBar(
                  sh.id,
                  null,
                  sh.inFrame,
                  sh.outFrame,
                  0,
                  isSel,
                  '#7c5cff',
                  '#5b21b6'
                )}
              </div>
              {isExp && renderTimelineTransformSubrows(sh.id, null, t)}
            </React.Fragment>
          );
        })}

        {/* 3. ADDED IMAGE LAYERS IN TIMELINE */}
        {addedLayers.map((al) => {
          const isExp = expandedTimelineLayerIds.has(al.id);
          const isSel = selectedTarget === al.id;
          const isHidden = hiddenLayerIds.has(al.id);
          const t = getEffectiveTransform(al.id, al.assetKey, currentFrame);
          return (
            <React.Fragment key={al.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '28px',
                  minHeight: '28px',
                  borderBottom: '1px solid #15151e',
                  background: isSel ? '#171728' : 'transparent',
                  opacity: isHidden ? 0.45 : 1,
                }}
              >
                <div
                  onClick={() => onSelectTarget(al.id, null)}
                  style={{
                    width: '280px',
                    minWidth: '280px',
                    padding: '0 10px 0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    borderRight: '1px solid #1b1b26',
                    height: '100%',
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLayerExpand(al.id);
                    }}
                    style={{
                      background: 0,
                      border: 0,
                      color: '#7e7e90',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {isExp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLayerVisibility(al.id);
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
                    {isHidden ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                  <ImageIcon size={12} color="#a78bfa" />
                  <span
                    style={{
                      flex: 1,
                      fontWeight: 500,
                      color: '#e8e8ee',
                      fontSize: '11px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {al.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLayer(al.id);
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
                {renderInteractiveLayerBar(
                  al.id,
                  null,
                  al.inFrame,
                  al.outFrame,
                  0,
                  isSel,
                  '#7c5cff',
                  '#6d28d9'
                )}
              </div>
              {isExp && renderTimelineTransformSubrows(al.id, al.assetKey, t)}
            </React.Fragment>
          );
        })}

        {/* 4. ALL DECOMPOSED SVGA SPRITE LAYERS IN TIMELINE (#N down to #1) */}
        {spriteLayers.map((sl) => {
          const isExp = expandedTimelineLayerIds.has(sl.id);
          const isSel = selectedTarget === sl.id;
          const isHidden = hiddenLayerIds.has(sl.id);
          const customRange = spriteFrameRanges[sl.spriteIdx];
          const inFrame = customRange ? customRange.inFrame : sl.span.firstFrame;
          const outFrame = customRange ? customRange.outFrame : sl.span.lastFrame;
          const offsetFrames = customRange ? customRange.offsetFrames : 0;

          return (
            <React.Fragment key={sl.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '28px',
                  minHeight: '28px',
                  borderBottom: '1px solid #15151e',
                  background: isSel ? '#171728' : 'transparent',
                  opacity: isHidden ? 0.45 : 1,
                }}
              >
                <div
                  onClick={() => onSelectTarget(sl.id, sl.key)}
                  style={{
                    width: '280px',
                    minWidth: '280px',
                    padding: '0 10px 0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    borderRight: '1px solid #1b1b26',
                    height: '100%',
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Expand Transform track for #${sl.displayNum} ${sl.key}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLayerExpand(sl.id);
                    }}
                    title="Expand Transform track"
                    style={{
                      background: 0,
                      border: 0,
                      color: '#7e7e90',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {isExp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLayerVisibility(sl.id);
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
                    {isHidden ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                  <ImageIcon size={12} color={isSel ? '#a78bfa' : '#8e8ea0'} />
                  <span style={{ color: '#a78bfa', fontSize: '10px', fontWeight: 700 }}>
                    #{sl.displayNum}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontWeight: 600,
                      color: '#e8e8ee',
                      fontSize: '11px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sl.key}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLayer(sl.id);
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
                {renderInteractiveLayerBar(
                  sl.id,
                  sl.key,
                  inFrame,
                  outFrame,
                  offsetFrames,
                  isSel,
                  '#7c5cff',
                  '#475066'
                )}
              </div>
              {isExp &&
                renderTimelineTransformSubrows(
                  sl.id,
                  sl.key,
                  getEffectiveTransform(sl.id, sl.key, currentFrame)
                )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
