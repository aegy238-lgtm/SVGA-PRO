import React from 'react';
import {
  Settings,
  Move,
  Maximize,
  RotateCw,
  Eye,
  Sliders,
  Upload,
  FlipHorizontal,
  FlipVertical,
  Wand2,
  Sparkles,
  Layers,
} from 'lucide-react';
import { SVGALayerItem } from './svgaTypes';

interface SvgaPropertiesPanelProps {
  layer: SVGALayerItem | null;
  onUpdateLayer: (updatedLayer: SVGALayerItem) => void;
  onReplaceLayerImage: (layerId: string, file: File) => void;
  onOpenChromaPen: (layer: SVGALayerItem) => void;
  isAr: boolean;
}

export const SvgaPropertiesPanel: React.FC<SvgaPropertiesPanelProps> = ({
  layer,
  onUpdateLayer,
  onReplaceLayerImage,
  onOpenChromaPen,
  isAr,
}) => {
  if (!layer) {
    return (
      <aside className="w-80 bg-[#12131a] border-l border-white/10 p-4 flex flex-col items-center justify-center text-center text-slate-500 text-xs select-none">
        <Sliders size={32} className="mb-2 opacity-40 text-purple-400" />
        <p className="font-medium text-slate-400">
          {isAr ? 'حدد طبقة لتعديل الخصائص' : 'Select a layer to edit properties'}
        </p>
        <p className="mt-1 text-[11px] text-slate-600">
          {isAr
            ? 'يمكنك التعديل على الموقع، التكبير، التدوير، أو استبدال الصورة'
            : 'Adjust position, scale, rotation, or replace images'}
        </p>
      </aside>
    );
  }

  const handleNudge = (axis: 'x' | 'y', delta: number) => {
    onUpdateLayer({
      ...layer,
      position: {
        ...layer.position,
        [axis]: layer.position[axis] + delta,
      },
    });
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onReplaceLayerImage(layer.id, file);
    }
  };

  return (
    <aside className="w-80 bg-[#12131a] border-l border-white/10 flex flex-col h-full text-slate-200 select-none overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between bg-[#181922]">
        <div className="flex items-center gap-2 font-bold text-sm text-purple-400">
          <Settings size={18} />
          <span>{isAr ? 'خصائص الطبقة' : 'Layer Properties'}</span>
        </div>
      </div>

      <div className="p-4 space-y-5 text-xs">
        {/* Layer Name */}
        <div>
          <label className="block text-slate-400 font-semibold mb-1">
            {isAr ? 'اسم الطبقة' : 'Layer Name'}
          </label>
          <input
            type="text"
            value={layer.name}
            onChange={(e) => onUpdateLayer({ ...layer, name: e.target.value })}
            className="w-full bg-[#0a0b10] border border-white/10 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-purple-500 font-medium"
          />
        </div>

        {/* Replace Image / Chroma Cutout (If Image Layer) */}
        {layer.type === 'image' && (
          <div className="p-3 bg-purple-950/20 border border-purple-500/20 rounded-lg space-y-2.5">
            <span className="block text-purple-300 font-bold flex items-center gap-1.5">
              <Sparkles size={14} />
              <span>{isAr ? 'أدوات الصور الاحترافية' : 'Image Tools'}</span>
            </span>

            {layer.imageSrc && (
              <div className="h-20 bg-black/40 rounded border border-white/10 flex items-center justify-center p-1">
                <img
                  src={layer.imageSrc}
                  alt={layer.name}
                  className="max-h-full max-w-full object-contain rounded"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              {/* Replace Image */}
              <label className="flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-1.5 px-2 rounded cursor-pointer transition text-[11px]">
                <Upload size={13} />
                <span>{isAr ? 'استبدال الصورة' : 'Replace Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="hidden"
                />
              </label>

              {/* Smart Chroma Cutout */}
              <button
                type="button"
                onClick={() => onOpenChromaPen(layer)}
                className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-1.5 px-2 rounded transition text-[11px]"
              >
                <Wand2 size={13} />
                <span>{isAr ? 'قلم تفريغ الكرومة' : 'Chroma Cutout'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Position (X, Y) */}
        <div>
          <span className="block text-slate-400 font-semibold mb-2 flex items-center gap-1">
            <Move size={14} className="text-purple-400" />
            <span>{isAr ? 'الموقع (Position)' : 'Position (X, Y)'}</span>
          </span>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0a0b10] border border-white/10 rounded p-2 flex items-center justify-between">
              <span className="text-slate-500 font-mono">X:</span>
              <input
                type="number"
                value={layer.position.x}
                onChange={(e) =>
                  onUpdateLayer({
                    ...layer,
                    position: { ...layer.position, x: Number(e.target.value) },
                  })
                }
                className="w-16 bg-transparent text-right font-mono focus:outline-none text-slate-200"
              />
            </div>
            <div className="bg-[#0a0b10] border border-white/10 rounded p-2 flex items-center justify-between">
              <span className="text-slate-500 font-mono">Y:</span>
              <input
                type="number"
                value={layer.position.y}
                onChange={(e) =>
                  onUpdateLayer({
                    ...layer,
                    position: { ...layer.position, y: Number(e.target.value) },
                  })
                }
                className="w-16 bg-transparent text-right font-mono focus:outline-none text-slate-200"
              />
            </div>
          </div>

          {/* Quick Nudge Buttons */}
          <div className="mt-2 flex items-center justify-between gap-1 text-[10px] text-slate-400 bg-white/5 p-1 rounded">
            <span>{isAr ? 'تحريك سريع:' : 'Quick Nudge:'}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleNudge('x', -10)}
                className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded font-mono"
              >
                -10
              </button>
              <button
                type="button"
                onClick={() => handleNudge('x', -1)}
                className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded font-mono"
              >
                -1
              </button>
              <button
                type="button"
                onClick={() => handleNudge('x', 1)}
                className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded font-mono"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => handleNudge('x', 10)}
                className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded font-mono"
              >
                +10
              </button>
            </div>
          </div>
        </div>

        {/* Scale (SX, SY) */}
        <div>
          <span className="block text-slate-400 font-semibold mb-2 flex items-center gap-1">
            <Maximize size={14} className="text-purple-400" />
            <span>{isAr ? 'الحجم والتكبير (%)' : 'Scale (%)'}</span>
          </span>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0a0b10] border border-white/10 rounded p-2 flex items-center justify-between">
              <span className="text-slate-500 font-mono">SX:</span>
              <input
                type="number"
                value={layer.scale.x}
                onChange={(e) =>
                  onUpdateLayer({
                    ...layer,
                    scale: { ...layer.scale, x: Number(e.target.value) },
                  })
                }
                className="w-16 bg-transparent text-right font-mono focus:outline-none text-slate-200"
              />
            </div>
            <div className="bg-[#0a0b10] border border-white/10 rounded p-2 flex items-center justify-between">
              <span className="text-slate-500 font-mono">SY:</span>
              <input
                type="number"
                value={layer.scale.y}
                onChange={(e) =>
                  onUpdateLayer({
                    ...layer,
                    scale: { ...layer.scale, y: Number(e.target.value) },
                  })
                }
                className="w-16 bg-transparent text-right font-mono focus:outline-none text-slate-200"
              />
            </div>
          </div>

          {/* Flip / Mirror buttons */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              type="button"
              onClick={() =>
                onUpdateLayer({
                  ...layer,
                  scale: { ...layer.scale, x: -layer.scale.x },
                })
              }
              className="flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 py-1 rounded text-slate-300 transition"
            >
              <FlipHorizontal size={13} />
              <span>{isAr ? 'انعكاس أفقي' : 'Flip H'}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateLayer({
                  ...layer,
                  scale: { ...layer.scale, y: -layer.scale.y },
                })
              }
              className="flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 py-1 rounded text-slate-300 transition"
            >
              <FlipVertical size={13} />
              <span>{isAr ? 'انعكاس رأسي' : 'Flip V'}</span>
            </button>
          </div>
        </div>

        {/* Rotation */}
        <div>
          <div className="flex items-center justify-between text-slate-400 font-semibold mb-1">
            <span className="flex items-center gap-1">
              <RotateCw size={14} className="text-purple-400" />
              <span>{isAr ? 'الدوران (درجة)' : 'Rotation (deg)'}</span>
            </span>
            <span className="font-mono text-purple-300">{layer.rotation}°</span>
          </div>

          <input
            type="range"
            min="0"
            max="360"
            value={layer.rotation}
            onChange={(e) => onUpdateLayer({ ...layer, rotation: Number(e.target.value) })}
            className="w-full accent-purple-500 cursor-pointer"
          />
        </div>

        {/* Opacity */}
        <div>
          <div className="flex items-center justify-between text-slate-400 font-semibold mb-1">
            <span className="flex items-center gap-1">
              <Eye size={14} className="text-purple-400" />
              <span>{isAr ? 'الشفافية (%)' : 'Opacity (%)'}</span>
            </span>
            <span className="font-mono text-purple-300">{layer.opacity}%</span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={layer.opacity}
            onChange={(e) => onUpdateLayer({ ...layer, opacity: Number(e.target.value) })}
            className="w-full accent-purple-500 cursor-pointer"
          />
        </div>
      </div>
    </aside>
  );
};
