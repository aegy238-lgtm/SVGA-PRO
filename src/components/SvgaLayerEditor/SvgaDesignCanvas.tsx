import React, { useRef, useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Grid, Image as ImageIcon } from 'lucide-react';
import { SVGALayerItem, SVGAProjectData } from './svgaTypes';

interface SvgaDesignCanvasProps {
  project: SVGAProjectData;
  layers: SVGALayerItem[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onUpdateLayerPosition: (id: string, newPos: { x: number; y: number }) => void;
  currentFrame: number;
  isAr: boolean;
}

export const SvgaDesignCanvas: React.FC<SvgaDesignCanvasProps> = ({
  project,
  layers,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayerPosition,
  currentFrame,
  isAr,
}) => {
  const [zoom, setZoom] = useState(100); // %
  const [bgColor, setBgColor] = useState<'transparent' | '#000000' | '#ffffff' | '#00ff00'>('transparent');
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; startPosX: number; startPosY: number } | null>(null);

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);

  const handleMouseDown = (e: React.MouseEvent, layer: SVGALayerItem) => {
    e.stopPropagation();
    if (layer.locked || !layer.visible) return;

    onSelectLayer(layer.id);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPosX: layer.position.x,
      startPosY: layer.position.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current || !selectedLayerId) return;

    const scaleFactor = zoom / 100;
    const deltaX = (e.clientX - dragStartRef.current.x) / scaleFactor;
    const deltaY = (e.clientY - dragStartRef.current.y) / scaleFactor;

    onUpdateLayerPosition(selectedLayerId, {
      x: Math.round(dragStartRef.current.startPosX + deltaX),
      y: Math.round(dragStartRef.current.startPosY + deltaY),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  return (
    <main
      className="flex-1 bg-[#090a0f] relative overflow-hidden flex flex-col select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={() => onSelectLayer(null)}
    >
      {/* Top Canvas Toolbar */}
      <div className="h-10 bg-[#12131a] border-b border-white/10 px-4 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-400">
            {project.width} × {project.height} px
          </span>
          <span className="bg-purple-900/40 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-mono">
            Frame: {currentFrame} / {project.frames}
          </span>
        </div>

        {/* Canvas Background Controls & Zoom */}
        <div className="flex items-center gap-3">
          {/* Background switcher */}
          <div className="flex items-center gap-1 bg-[#0a0b10] p-1 rounded-md border border-white/10">
            <button
              type="button"
              onClick={() => setBgColor('transparent')}
              className={`w-4 h-4 rounded border ${
                bgColor === 'transparent' ? 'border-purple-500 scale-110' : 'border-white/20'
              }`}
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%)',
                backgroundSize: '8px 8px',
                backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
              }}
              title={isAr ? 'خلفية شفافة' : 'Transparent'}
            />
            <button
              type="button"
              onClick={() => setBgColor('#000000')}
              className={`w-4 h-4 rounded bg-black border ${
                bgColor === '#000000' ? 'border-purple-500 scale-110' : 'border-white/20'
              }`}
              title={isAr ? 'خلفية سوداء' : 'Black'}
            />
            <button
              type="button"
              onClick={() => setBgColor('#ffffff')}
              className={`w-4 h-4 rounded bg-white border ${
                bgColor === '#ffffff' ? 'border-purple-500 scale-110' : 'border-white/20'
              }`}
              title={isAr ? 'خلفية بيضاء' : 'White'}
            />
            <button
              type="button"
              onClick={() => setBgColor('#00ff00')}
              className={`w-4 h-4 rounded bg-[#00ff00] border ${
                bgColor === '#00ff00' ? 'border-purple-500 scale-110' : 'border-white/20'
              }`}
              title={isAr ? 'كرومة خضراء' : 'Green Screen'}
            />
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-[#0a0b10] px-2 py-0.5 rounded-md border border-white/10">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(25, z - 25))}
              className="hover:text-purple-400 p-1"
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="font-mono text-[11px] w-12 text-center">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(800, z + 25))}
              className="hover:text-purple-400 p-1"
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(100)}
              className="hover:text-purple-400 p-1 border-l border-white/10 ml-1 pl-1"
              title="Reset Zoom"
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Workspace Container */}
      <div className="flex-1 relative flex items-center justify-center p-8 overflow-auto">
        <div
          style={{
            width: `${project.width}px`,
            height: `${project.height}px`,
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'center center',
            backgroundColor: bgColor === 'transparent' ? undefined : bgColor,
            backgroundImage:
              bgColor === 'transparent'
                ? 'linear-gradient(45deg, #181920 25%, transparent 25%), linear-gradient(-45deg, #181920 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #181920 75%), linear-gradient(-45deg, transparent 75%, #181920 75%)'
                : undefined,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }}
          className="relative border border-white/20 shadow-2xl transition-transform duration-75 rounded-sm"
        >
          {/* Render Layers */}
          {layers.map((layer) => {
            if (!layer.visible) return null;

            const isSelected = selectedLayerId === layer.id;

            return (
              <div
                key={layer.id}
                onMouseDown={(e) => handleMouseDown(e, layer)}
                style={{
                  position: 'absolute',
                  left: `${layer.position.x}px`,
                  top: `${layer.position.y}px`,
                  transform: `scale(${layer.scale.x / 100}, ${layer.scale.y / 100}) rotate(${layer.rotation}deg)`,
                  opacity: layer.opacity / 100,
                  cursor: layer.locked ? 'not-allowed' : 'move',
                  userSelect: 'none',
                }}
                className={`relative group ${
                  isSelected ? 'outline-2 outline-purple-500 outline-dashed' : ''
                }`}
              >
                {/* Layer Image/Graphics Content */}
                {layer.type === 'image' && layer.imageSrc ? (
                  <img
                    src={layer.imageSrc}
                    alt={layer.name}
                    draggable={false}
                    className="max-w-none pointer-events-none"
                  />
                ) : (
                  <div className="p-4 bg-purple-600/20 border border-purple-400/50 rounded flex items-center justify-center text-xs text-purple-200">
                    <span className="font-semibold">{layer.name}</span>
                  </div>
                )}

                {/* Selected Layer Bounding Box & Handles */}
                {isSelected && (
                  <div className="absolute inset-0 border-2 border-purple-500 pointer-events-none">
                    <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-purple-600 rounded-full" />
                    <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-purple-600 rounded-full" />
                    <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-purple-600 rounded-full" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-purple-600 rounded-full" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
};
