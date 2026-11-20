import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Repeat, Scissors, Clock } from 'lucide-react';

interface SvgaMotionTimelineProps {
  totalFrames: number;
  fps: number;
  currentFrame: number;
  onFrameChange: (frame: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  isAr: boolean;
}

export const SvgaMotionTimeline: React.FC<SvgaMotionTimelineProps> = ({
  totalFrames,
  fps,
  currentFrame,
  onFrameChange,
  isPlaying,
  onTogglePlay,
  isAr,
}) => {
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(totalFrames || 60);
  const [isLooping, setIsLooping] = useState(true);

  const durationSec = (totalFrames / (fps || 30)).toFixed(2);
  const currentSec = (currentFrame / (fps || 30)).toFixed(2);

  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const currentFrameRef = useRef<number>(currentFrame);
  currentFrameRef.current = currentFrame;

  // Smooth frame updates loop without skipping or backward frame stuttering
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    const interval = 1000 / (fps || 30);

    const step = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const elapsed = timestamp - lastTimeRef.current;

      if (elapsed >= interval) {
        lastTimeRef.current = timestamp - (elapsed % interval);
        currentFrameRef.current = currentFrameRef.current >= trimEnd ? (isLooping ? trimStart : trimEnd) : currentFrameRef.current + 1;
        onFrameChange(currentFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, fps, trimEnd, trimStart, isLooping, onFrameChange]);

  return (
    <footer className="h-28 bg-[#12131a] border-t border-white/10 px-4 flex flex-col justify-between py-2 text-slate-200 select-none">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between">
        {/* Playback Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onFrameChange(trimStart)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded text-slate-300"
            title={isAr ? 'البداية' : 'Jump to Start'}
          >
            <SkipBack size={15} />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="p-2 bg-purple-600 hover:bg-purple-500 rounded-full text-white shadow-lg shadow-purple-600/30 transition transform active:scale-95"
            title={isPlaying ? (isAr ? 'إيقاف مؤقت' : 'Pause') : isAr ? 'تشغيل' : 'Play'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => onFrameChange(trimEnd)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded text-slate-300"
            title={isAr ? 'النهاية' : 'Jump to End'}
          >
            <SkipForward size={15} />
          </button>

          <button
            type="button"
            onClick={() => setIsLooping(!isLooping)}
            className={`p-1.5 rounded transition ${
              isLooping ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50' : 'bg-white/5 text-slate-500'
            }`}
            title={isAr ? 'تكرار مستمر (Loop)' : 'Toggle Loop'}
          >
            <Repeat size={15} />
          </button>
        </div>

        {/* Time Counter */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-purple-400 font-bold bg-purple-900/30 px-2.5 py-1 rounded border border-purple-500/30 flex items-center gap-1.5">
            <Clock size={13} />
            <span>
              {currentSec}s / {durationSec}s
            </span>
          </span>
          <span className="text-slate-400 text-[11px]">
            {currentFrame} / {totalFrames} {isAr ? 'فريم' : 'f'}
          </span>
        </div>
      </div>

      {/* Frame Scrubber & Trim Handles Slider */}
      <div className="space-y-1">
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={totalFrames || 60}
            value={currentFrame}
            onChange={(e) => onFrameChange(Number(e.target.value))}
            className="w-full h-2 bg-[#090a0f] rounded-lg appearance-none cursor-pointer accent-purple-500 border border-white/10"
          />
        </div>

        {/* Trim start & trim end indicator bar */}
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-1">
            <Scissors size={11} className="text-purple-400" />
            <span>
              {isAr ? 'بداية القص:' : 'Trim In:'} Frame {trimStart}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span>
              {isAr ? 'نهاية القص:' : 'Trim Out:'} Frame {trimEnd}
            </span>
            <Scissors size={11} className="text-purple-400" />
          </div>
        </div>
      </div>
    </footer>
  );
};
