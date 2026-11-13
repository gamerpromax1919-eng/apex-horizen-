import React from 'react';
import { Film, Home, Play, RotateCcw, Trophy } from 'lucide-react';
import type { AiRacerSnapshot, GameModeState, VehicleTelemetry } from '../config/types';

interface PauseFinishModalProps {
  gameMode: GameModeState;
  telemetry: VehicleTelemetry;
  aiRacers: AiRacerSnapshot[];
  rewardCredits: number;
  rewardXp: number;
  hasReplay: boolean;
  onResume: () => void;
  onRestart: () => void;
  onWatchReplay: () => void;
  onBackToTitle: () => void;
}

function formatTime(ms: number | null): string {
  if (ms === null || ms <= 0) return '--:--.--';
  const totalSec = ms / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = (totalSec % 60).toFixed(2).padStart(5, '0');
  return `${mins}:${secs}`;
}

export const PauseFinishModal: React.FC<PauseFinishModalProps> = ({
  gameMode,
  telemetry,
  aiRacers,
  rewardCredits,
  rewardXp,
  hasReplay,
  onResume,
  onRestart,
  onWatchReplay,
  onBackToTitle,
}) => {
  if (gameMode !== 'paused' && gameMode !== 'gameover') return null;

  const isFinish = gameMode === 'gameover';

  const standings = [
    {
      id: 'player',
      name: 'You',
      progress: telemetry.raceProgress,
      finishTimeMs: telemetry.finishTimeMs,
      isPlayer: true,
    },
    ...aiRacers.map((ai) => ({
      id: ai.id,
      name: ai.name,
      progress: ai.raceProgress,
      finishTimeMs: ai.finishTimeMs,
      isPlayer: false,
    })),
  ].sort((a, b) => {
    if (a.finishTimeMs !== null && b.finishTimeMs !== null) {
      return a.finishTimeMs - b.finishTimeMs;
    }
    if (a.finishTimeMs !== null) return -1;
    if (b.finishTimeMs !== null) return 1;
    return b.progress - a.progress;
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/78">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0e1118] text-slate-100 p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          {isFinish && <Trophy className="w-6 h-6 text-amber-400" />}
          <h2 className="font-display font-bold text-2xl tracking-wide">
            {isFinish ? `FINISHED P${telemetry.racePosition}` : 'SESSION PAUSED'}
          </h2>
        </div>

        {isFinish && (
          <div className="space-y-3 mb-5">
            <div className="rounded-xl border border-white/10 bg-[#141925] p-4 grid grid-cols-2 gap-3 text-sm tabular-nums">
              <div>
                <div className="text-xs text-slate-400">Finish Time</div>
                <div className="font-mono font-bold text-amber-400">
                  {formatTime(telemetry.finishTimeMs)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Best Lap</div>
                <div className="font-mono font-bold text-emerald-400">
                  {formatTime(telemetry.bestLapMs)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Drift Score</div>
                <div className="font-mono font-bold text-slate-100">
                  {Math.round(telemetry.totalDriftScore)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Rewards Earned</div>
                <div className="font-mono font-bold text-sky-400">
                  +{rewardCredits.toLocaleString()} CR / +{rewardXp} XP
                </div>
              </div>
            </div>

            {standings.length > 1 && (
              <div className="rounded-xl border border-white/10 bg-[#141925] p-3 space-y-1.5 text-xs">
                {standings.slice(0, 6).map((row, idx) => (
                  <div
                    key={row.id}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded ${
                      row.isPlayer ? 'bg-amber-500/15 text-amber-300 font-bold' : 'text-slate-300'
                    }`}
                  >
                    <span>
                      P{idx + 1} · {row.name}
                    </span>
                    <span className="font-mono">
                      {row.finishTimeMs !== null
                        ? formatTime(row.finishTimeMs)
                        : `${Math.round(row.progress * 100)}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {!isFinish && (
            <button
              type="button"
              onClick={onResume}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              Resume Driving
            </button>
          )}

          {hasReplay && (
            <button
              type="button"
              onClick={onWatchReplay}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 font-semibold text-sm cursor-pointer"
            >
              <Film className="w-4 h-4" />
              Watch Race Replay
            </button>
          )}

          <button
            type="button"
            onClick={onRestart}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-white/10 hover:bg-white/18 text-slate-100 font-semibold text-sm cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            {isFinish ? 'Race Again' : 'Restart Event'}
          </button>

          <button
            type="button"
            onClick={onBackToTitle}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-white/6 hover:bg-white/12 text-slate-300 font-medium text-sm cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Return to Title Screen
          </button>
        </div>
      </div>
    </div>
  );
};
