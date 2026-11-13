import React from 'react';
import { Camera, Pause, Play, X } from 'lucide-react';
import type { GameModeState } from '../config/types';

interface PhotoReplayOverlayProps {
  mode: GameModeState;
  photoFov: number;
  photoDofFocus: number;
  replayPlaying: boolean;
  replayIndex: number;
  replayLength: number;
  onChangeFov: (fov: number) => void;
  onChangeDof: (dof: number) => void;
  onToggleReplayPlay: () => void;
  onScrubReplay: (idx: number) => void;
  onExit: () => void;
}

export const PhotoReplayOverlay: React.FC<PhotoReplayOverlayProps> = ({
  mode,
  photoFov,
  photoDofFocus,
  replayPlaying,
  replayIndex,
  replayLength,
  onChangeFov,
  onChangeDof,
  onToggleReplayPlay,
  onScrubReplay,
  onExit,
}) => {
  if (mode !== 'photo' && mode !== 'replay') return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-xl rounded-2xl border border-white/15 bg-[#0b0d12]/92 p-4 shadow-2xl text-slate-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-display font-bold text-sm tracking-wider uppercase text-amber-400">
          <Camera className="w-4 h-4" />
          {mode === 'photo' ? 'Photo Mode · Drag to Orbit' : 'Race Replay Camera'}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          Exit
        </button>
      </div>

      {mode === 'photo' ? (
        <div className="grid grid-cols-2 gap-4 text-xs">
          <label className="block">
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Lens FOV</span>
              <span className="font-mono">{photoFov}°</span>
            </div>
            <input
              type="range"
              min={24}
              max={85}
              step={1}
              value={photoFov}
              onChange={(e) => onChangeFov(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500"
            />
          </label>
          <label className="block">
            <div className="flex justify-between text-slate-300 mb-1">
              <span>Depth of Field Focus</span>
              <span className="font-mono">{photoDofFocus.toFixed(3)}</span>
            </div>
            <input
              type="range"
              min={0.005}
              max={0.1}
              step={0.005}
              value={photoDofFocus}
              onChange={(e) => onChangeDof(parseFloat(e.target.value))}
              className="w-full accent-amber-500"
            />
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleReplayPlay}
            className="p-2 rounded-lg bg-amber-500 text-slate-950 cursor-pointer"
            aria-label={replayPlaying ? 'Pause Replay' : 'Play Replay'}
          >
            {replayPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(1, replayLength - 1)}
            value={replayIndex}
            onChange={(e) => onScrubReplay(parseInt(e.target.value, 10))}
            className="flex-1 accent-amber-500"
          />
          <span className="text-xs font-mono text-slate-300 tabular-nums">
            {replayIndex + 1}/{Math.max(1, replayLength)}
          </span>
        </div>
      )}
    </div>
  );
};
