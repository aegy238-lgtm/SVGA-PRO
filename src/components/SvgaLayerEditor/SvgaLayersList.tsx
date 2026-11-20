import React, { useState } from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  MoveUp,
  MoveDown,
  Trash2,
  Copy,
  FolderPlus,
  Ungroup,
  Search,
  Image as ImageIcon,
  Shapes,
  Type,
  CheckSquare,
  Square,
} from 'lucide-react';
import { SVGALayerItem } from './svgaTypes';

interface SvgaLayersListProps {
  layers: SVGALayerItem[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMoveLayer: (id: string, direction: 'up' | 'down') => void;
  onReorderLayer: (id: string, newIndex: number) => void;
  onDeleteLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onMergeLayers: (selectedIds: string[]) => void;
  isAr: boolean;
}

export const SvgaLayersList: React.FC<SvgaLayersListProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onMoveLayer,
  onReorderLayer,
  onDeleteLayer,
  onDuplicateLayer,
  onMergeLayers,
  isAr,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [multiSelectIds, setMultiSelectIds] = useState<string[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const targetIndex = layers.findIndex((l) => l.id === targetId);
    if (targetIndex !== -1) {
      onReorderLayer(draggedId, targetIndex);
    }
    setDraggedId(null);
  };

  const filteredLayers = layers.filter((l) =>
    l.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleMultiSelect = (id: string) => {
    setMultiSelectIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleMergeClick = () => {
    if (multiSelectIds.length >= 2) {
      onMergeLayers(multiSelectIds);
      setMultiSelectIds([]);
      setMultiSelectMode(false);
    }
  };

  return (
    <aside className="w-72 bg-[#12131a] border-r border-white/10 flex flex-col h-full text-slate-200 select-none">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between bg-[#181922]">
        <div className="flex items-center gap-2 font-bold text-sm text-purple-400">
          <Layers size={18} />
          <span>{isAr ? 'الطبقات' : 'Layers'} ({layers.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMultiSelectMode(!multiSelectMode)}
            className={`p-1.5 rounded text-xs transition ${
              multiSelectMode
                ? 'bg-purple-600 text-white'
                : 'bg-white/5 hover:bg-white/10 text-slate-400'
            }`}
            title={isAr ? 'تحديد متعدد للدمج' : 'Multi-select to merge'}
          >
            {multiSelectMode ? <CheckSquare size={14} /> : <Square size={14} />}
          </button>
        </div>
      </div>

      {/* Multi Select Merge Toolbar Banner */}
      {multiSelectMode && (
        <div className="p-2 bg-purple-900/40 border-b border-purple-500/30 flex items-center justify-between text-xs">
          <span className="text-purple-200">
            {isAr
              ? `تم تحديد ${multiSelectIds.length} طبقات`
              : `${multiSelectIds.length} selected`}
          </span>
          <button
            type="button"
            disabled={multiSelectIds.length < 2}
            onClick={handleMergeClick}
            className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-2.5 py-1 rounded font-semibold transition"
          >
            <FolderPlus size={13} />
            <span>{isAr ? 'دمج الطبقات' : 'Merge Layers'}</span>
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="p-2 border-b border-white/5">
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isAr ? 'بحث في الطبقات...' : 'Search layers...'}
            className="w-full bg-[#0a0b10] border border-white/10 rounded-md py-1 pl-8 pr-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      {/* Layers Tree */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-1">
        {filteredLayers.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-xs">
            {isAr ? 'لا توجد طبقات مطابقة' : 'No matching layers'}
          </div>
        ) : (
          filteredLayers.map((layer, index) => {
            const isSelected = selectedLayerId === layer.id;
            const isMultiChecked = multiSelectIds.includes(layer.id);

            return (
              <div
                key={layer.id}
                draggable={!searchTerm}
                onDragStart={(e) => handleDragStart(e, layer.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, layer.id)}
                onClick={() => {
                  if (multiSelectMode) {
                    toggleMultiSelect(layer.id);
                  } else {
                    onSelectLayer(layer.id);
                  }
                }}
                className={`group flex items-center justify-between px-2.5 py-2 rounded-md cursor-grab active:cursor-grabbing text-xs transition my-0.5 ${
                  isSelected
                    ? 'bg-purple-600/30 border border-purple-500/50 text-white'
                    : isMultiChecked
                    ? 'bg-purple-900/20 border border-purple-400/30 text-purple-200'
                    : 'hover:bg-white/5 text-slate-300'
                }`}
              >
                {/* Left side: icon & title */}
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                  {multiSelectMode && (
                    <input
                      type="checkbox"
                      checked={isMultiChecked}
                      onChange={() => toggleMultiSelect(layer.id)}
                      className="accent-purple-500 rounded cursor-pointer"
                    />
                  )}

                  <span className="text-slate-400 shrink-0">
                    {layer.type === 'image' ? (
                      <ImageIcon size={14} className="text-amber-400" />
                    ) : layer.type === 'text' ? (
                      <Type size={14} className="text-cyan-400" />
                    ) : (
                      <Shapes size={14} className="text-indigo-400" />
                    )}
                  </span>

                  <span className="truncate font-medium">{layer.name}</span>
                </div>

                {/* Right side: layer actions (Up, Down, Lock, Hide, Duplicate, Delete) */}
                <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                  {/* Layer Move Up / Down */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayer(layer.id, 'up');
                    }}
                    disabled={index === 0}
                    className="p-1 text-slate-400 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded"
                    title={isAr ? 'تقديم للقمة (لأعلى)' : 'Move Up'}
                  >
                    <MoveUp size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayer(layer.id, 'down');
                    }}
                    disabled={index === filteredLayers.length - 1}
                    className="p-1 text-slate-400 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded"
                    title={isAr ? 'تأخير للخلف (لأسفل)' : 'Move Down'}
                  >
                    <MoveDown size={12} />
                  </button>

                  {/* Visibility */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(layer.id);
                    }}
                    className={`p-1 rounded hover:bg-white/10 ${
                      layer.visible ? 'text-slate-300' : 'text-slate-600'
                    }`}
                    title={isAr ? 'إظهار / إخفاء' : 'Toggle Visibility'}
                  >
                    {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>

                  {/* Lock */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLock(layer.id);
                    }}
                    className={`p-1 rounded hover:bg-white/10 ${
                      layer.locked ? 'text-amber-400' : 'text-slate-600'
                    }`}
                    title={isAr ? 'قفل الطبقة' : 'Lock Layer'}
                  >
                    {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>

                  {/* Duplicate */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateLayer(layer.id);
                    }}
                    className="p-1 text-slate-400 hover:text-purple-300 hover:bg-white/10 rounded"
                    title={isAr ? 'نسخ الطبقة' : 'Duplicate Layer'}
                  >
                    <Copy size={12} />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLayer(layer.id);
                    }}
                    className="p-1 text-slate-400 hover:text-red-400 hover:bg-white/10 rounded"
                    title={isAr ? 'حذف الطبقة' : 'Delete Layer'}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
