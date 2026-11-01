import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Upload, X, Play, Pause, RefreshCw, Settings, FileImage } from 'lucide-react';

export const ShineEffectSystem: React.FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(2);
  const [angle, setAngle] = useState(45);
  const [shineProps, setShineProps] = useState({ length: 50, width: 20, opacity: 0.5 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  // Shine Effect Logic
  const drawShine = (ctx: CanvasRenderingContext2D, width: number, height: number, progress: number) => {
    const angleRad = (angle * Math.PI) / 180;
    const x = -width + progress * (width * 2);
    
    ctx.save();
    ctx.rotate(angleRad);
    
    // Create Gradient for soft edges
    const gradient = ctx.createLinearGradient(-shineProps.width, 0, shineProps.width, 0);
    gradient.addColorStop(0, `rgba(255,255,255,0)`);
    gradient.addColorStop(0.5, `rgba(255,255,255,${shineProps.opacity})`);
    gradient.addColorStop(1, `rgba(255,255,255,0)`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, -height, shineProps.width, height * 3);
    ctx.restore();
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedFile) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      drawShine(ctx, canvas.width, canvas.height, (Date.now() % (duration * 1000)) / (duration * 1000));
      animationRef.current = requestAnimationFrame(animate);
    };
    img.src = URL.createObjectURL(selectedFile);
  };

  useEffect(() => {
    if (selectedFile) animate();
    return () => cancelAnimationFrame(animationRef.current!);
  }, [selectedFile, duration, angle, shineProps]);

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'shine-effect.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 p-6 overflow-y-auto text-white">
      {/* ... (Header & Upload remains same) ... */}
      <div className="mt-6 bg-black rounded-xl p-4 flex justify-center items-center h-96 border border-slate-800">
        <canvas ref={canvasRef} className="max-h-full max-w-full" />
      </div>
      
      <div className="mt-6 flex justify-center gap-4">
        <button onClick={handleExport} className="bg-green-600 hover:bg-green-500 px-8 py-3 rounded-xl font-bold flex items-center gap-2">
          <FileImage /> تصدير الصورة
        </button>
      </div>
      {/* ... (Controls remain same) ... */}
    </div>
  );
};
