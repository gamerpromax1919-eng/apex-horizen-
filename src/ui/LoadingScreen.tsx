import React from 'react';

interface LoadingScreenProps {
  progress: number;
  statusText?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  progress,
  statusText = 'Initializing 120 Hz Rapier Vehicle Dynamics...',
}) => {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090b10] text-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#111520] p-8 shadow-2xl">
        <div className="font-display font-bold italic text-3xl tracking-wider text-amber-400 mb-1">
          HORIZON APEX
        </div>
        <div className="text-xs uppercase tracking-[0.22em] text-slate-400 mb-6">
          Vehicle Dynamics Simulator
        </div>

        <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden mb-3">
          <div
            className="h-full bg-amber-500 transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
          <span>{statusText}</span>
          <span>{pct}%</span>
        </div>
      </div>
    </div>
  );
};
