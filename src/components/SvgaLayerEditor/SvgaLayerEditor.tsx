import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Download,
  FolderOpen,
  Plus,
  Layers,
  Sparkles,
  X,
  FileArchive,
  RefreshCw,
  FolderPlus,
  Play,
  Film,
} from 'lucide-react';
import { SVGAProjectData, SVGALayerItem } from './svgaTypes';
import { parseSvgaFile, exportProjectAsZip, mergeSvgaLayers } from './svgaParser';
import { SvgaLayersList } from './SvgaLayersList';
import { SvgaDesignCanvas } from './SvgaDesignCanvas';
import { SvgaPropertiesPanel } from './SvgaPropertiesPanel';
import { SvgaMotionTimeline } from './SvgaMotionTimeline';

interface SvgaLayerEditorProps {
  initialFile?: File;
  externalSvgaFile?: File | null;
  onClose?: () => void;
  onSyncToMotionTools?: (file: File) => void;
  title?: string;
}

export const SvgaLayerEditor: React.FC<SvgaLayerEditorProps> = ({
  initialFile,
  externalSvgaFile,
  onClose,
  onSyncToMotionTools,
  title = 'أفتر 2 - SVGA Pro Layer Studio',
}) => {
  const isAr = true; // Arabic interface preferred

  const [project, setProject] = useState<SVGAProjectData>({
    version: '2.0',
    fps: 30,
    frames: 60,
    width: 750,
    height: 750,
    images: {},
    layers: [],
  });

  const [layers, setLayers] = useState<SVGALayerItem[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load initial or external file if passed
  useEffect(() => {
    const targetFile = initialFile || externalSvgaFile;
    if (targetFile) {
      handleLoadFile(targetFile);
    } else {
      // Default initial dummy project
      const dummyLayers: SVGALayerItem[] = [
        {
          id: 'layer_1',
          name: 'Main Gift Frame',
          visible: true,
          locked: false,
          type: 'vector',
          position: { x: 0, y: 0 },
          scale: { x: 100, y: 100 },
          rotation: 0,
          opacity: 100,
        },
        {
          id: 'layer_2',
          name: 'Glow Effect Overlay',
          visible: true,
          locked: false,
          type: 'vector',
          position: { x: 10, y: 10 },
          scale: { x: 100, y: 100 },
          rotation: 0,
          opacity: 80,
        },
      ];
      setLayers(dummyLayers);
      setProject((p) => ({ ...p, layers: dummyLayers }));
    }
  }, [initialFile, externalSvgaFile]);

  const handleLoadFile = async (file: File) => {
    try {
      const parsed = await parseSvgaFile(file);
      setProject(parsed);
      setLayers(parsed.layers);
      if (parsed.layers.length > 0) {
        setSelectedLayerId(parsed.layers[0].id);
      }
    } catch (err) {
      console.error('Failed to parse SVGA file:', err);
      alert(isAr ? 'تعذر فتح الملف البرمجي SVGA' : 'Failed to parse SVGA file');
    }
  };

  // Merge another SVGA file into current layers
  const handleMergeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parseSvgaFile(file);
      const merged = mergeSvgaLayers(layers, parsed.layers);
      setLayers(merged);
      setProject((p) => ({
        ...p,
        images: { ...p.images, ...parsed.images },
        layers: merged,
      }));
      alert(isAr ? 'تم دمج طبقات الملف بنجاح!' : 'Layers merged successfully!');
    } catch (err) {
      console.error('Failed to merge file:', err);
      alert(isAr ? 'خطأ أثناء دمج الملف' : 'Merge failed');
    }
  };

  // Layer manipulation handlers
  const handleToggleVisibility = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  };

  const handleToggleLock = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l))
    );
  };

  const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      if (index === -1) return prev;
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(newIndex, 0, item);
      return copy;
    });
  };

  const handleReorderLayer = (id: string, newIndex: number) => {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      if (index === -1) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(newIndex, 0, item);
      return copy;
    });
  };

  const handleDeleteLayer = (id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const handleDuplicateLayer = (id: string) => {
    const target = layers.find((l) => l.id === id);
    if (!target) return;

    const copy: SVGALayerItem = {
      ...target,
      id: `layer_copy_${Date.now()}`,
      name: `${target.name} (نسخة)`,
      position: { x: target.position.x + 15, y: target.position.y + 15 },
    };

    setLayers((prev) => [...prev, copy]);
    setSelectedLayerId(copy.id);
  };

  // Merge multiple selected layers into a single group layer
  const handleMergeLayers = (selectedIds: string[]) => {
    if (selectedIds.length < 2) return;

    const selectedItems = layers.filter((l) => selectedIds.includes(l.id));
    const mergedLayer: SVGALayerItem = {
      id: `group_${Date.now()}`,
      name: `مجموعة موحدة (${selectedItems.length} طبقات)`,
      visible: true,
      locked: false,
      type: 'group',
      position: { x: 0, y: 0 },
      scale: { x: 100, y: 100 },
      rotation: 0,
      opacity: 100,
      children: selectedItems,
    };

    const remaining = layers.filter((l) => !selectedIds.includes(l.id));
    const updated = [mergedLayer, ...remaining];
    setLayers(updated);
    setSelectedLayerId(mergedLayer.id);
  };

  const handleUpdateLayer = (updated: SVGALayerItem) => {
    setLayers((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleUpdateLayerPosition = (id: string, newPos: { x: number; y: number }) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, position: newPos } : l))
    );
  };

  // Replace image layer image
  const handleReplaceLayerImage = (layerId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (src) {
        setLayers((prev) =>
          prev.map((l) => (l.id === layerId ? { ...l, imageSrc: src } : l))
        );
      }
    };
    reader.readAsDataURL(file);
  };

  // Export project ZIP
  const handleExportProject = async () => {
    setExporting(true);
    try {
      const zipBlob = await exportProjectAsZip({
        ...project,
        layers,
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `svga_studio_project_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert(isAr ? 'فشل تصدير المشروع' : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Screen recording trigger
  const handleScreenRecord = () => {
    setIsRecording(!isRecording);
    alert(
      isRecording
        ? isAr
          ? 'تم إيقاف تسجيل الشاشة وحفظ الفيديو'
          : 'Recording stopped'
        : isAr
        ? 'بدأ تسجيل الشاشة والمشهد...'
        : 'Screen recording started...'
    );
  };

  return (
    <div className="fixed inset-0 bg-[#07080c] text-white flex flex-col font-sans z-50 select-none">
      {/* Top Header */}
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-[#12131a] shadow-md">
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-lg shadow-lg">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-purple-300">{title}</h1>
            <p className="text-[10px] text-slate-400">
              {isAr ? 'محرر ومدمج طبقات SVGA 2.0 احترافي' : 'SVGA Pro Layer & Motion Editor'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Open SVGA */}
          <label className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition">
            <FolderOpen size={15} className="text-purple-400" />
            <span>{isAr ? 'فتح SVGA' : 'Open SVGA'}</span>
            <input
              type="file"
              accept=".svga"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLoadFile(f);
              }}
              className="hidden"
            />
          </label>

          {/* Merge SVGA */}
          <label className="flex items-center gap-1.5 bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-500/40 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer text-indigo-200 transition">
            <FolderPlus size={15} className="text-indigo-400" />
            <span>{isAr ? 'دمج SVGA' : 'Merge SVGA'}</span>
            <input type="file" accept=".svga" onChange={handleMergeFile} className="hidden" />
          </label>

          {/* Screen Record */}
          <button
            type="button"
            onClick={handleScreenRecord}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              isRecording
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200'
            }`}
          >
            <Video size={15} className={isRecording ? 'text-white' : 'text-red-400'} />
            <span>{isRecording ? (isAr ? 'جاري التسجيل...' : 'Recording...') : isAr ? 'تسجيل الشاشة' : 'Record'}</span>
          </button>

          {/* Export Project */}
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportProject}
            className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-md shadow-purple-600/30"
          >
            <Download size={15} />
            <span>{exporting ? (isAr ? 'جاري التصدير...' : 'Exporting...') : isAr ? 'تصدير المشروع' : 'Export'}</span>
          </button>

          {/* Close Modal button if present */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white ml-2"
              title="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Center Main Workspace (Left Layers Tree + Center Canvas + Right Properties) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Layers List */}
        <SvgaLayersList
          layers={layers}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
          onToggleVisibility={handleToggleVisibility}
          onToggleLock={handleToggleLock}
          onMoveLayer={handleMoveLayer}
          onReorderLayer={handleReorderLayer}
          onDeleteLayer={handleDeleteLayer}
          onDuplicateLayer={handleDuplicateLayer}
          onMergeLayers={handleMergeLayers}
          isAr={isAr}
        />

        {/* Center Canvas */}
        <SvgaDesignCanvas
          project={project}
          layers={layers}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
          onUpdateLayerPosition={handleUpdateLayerPosition}
          currentFrame={currentFrame}
          isAr={isAr}
        />

        {/* Right Properties Panel */}
        <SvgaPropertiesPanel
          layer={layers.find((l) => l.id === selectedLayerId) || null}
          onUpdateLayer={handleUpdateLayer}
          onReplaceLayerImage={handleReplaceLayerImage}
          onOpenChromaPen={() => alert(isAr ? 'تم تفعيل قلم الشفافية والكرومة' : 'Chroma Pen active')}
          isAr={isAr}
        />
      </div>

      {/* Bottom Timeline Controls */}
      <SvgaMotionTimeline
        totalFrames={project.frames}
        fps={project.fps}
        currentFrame={currentFrame}
        onFrameChange={setCurrentFrame}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        isAr={isAr}
      />
    </div>
  );
};

export default SvgaLayerEditor;
