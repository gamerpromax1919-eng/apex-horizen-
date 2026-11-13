import React from 'react';
import { Bot, CloudRain, Play, Users, Wrench } from 'lucide-react';
import { getCarById } from '../config/cars';
import { computeEffectiveSpecs } from '../physics/tuning';
import type { DrivePreset, TuningSetup, UpgradeLevels } from '../config/types';

interface TitleScreenProps {
  carId: string;
  tuning: TuningSetup;
  upgrades: UpgradeLevels;
  drivePreset: DrivePreset;
  credits: number;
  modelCredit?: string | null;
  onStart: () => void;
  onOpenGarage: () => void;
  onOpenMultiplayer: () => void;
  onOpenWeather: () => void;
  onOpenEngineer: () => void;
}

const PRESET_LABELS: Record<DrivePreset, string> = {
  arcade: 'Arcade',
  sim_lite: 'Sim-Lite',
  sim: 'Simulation',
};

export const TitleScreen: React.FC<TitleScreenProps> = ({
  carId,
  tuning,
  upgrades,
  drivePreset,
  credits,
  modelCredit,
  onStart,
  onOpenGarage,
  onOpenMultiplayer,
  onOpenWeather,
  onOpenEngineer,
}) => {
  const car = getCarById(carId);
  const specs = computeEffectiveSpecs(car, tuning, upgrades);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      <div className="max-w-xl pointer-events-auto">
        <div className="inline-block px-6 py-5 rounded-xl border border-white/12 bg-[#0b0d12]/90">
          <svg
            viewBox="0 0 420 92"
            className="w-72 md:w-96 h-auto mb-3"
            role="img"
            aria-label="Horizon Apex"
          >
            <defs>
              <linearGradient id="apexAccent" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>
            <path d="M6 16 L32 16 L22 76 L0 76 Z" fill="url(#apexAccent)" />
            <path d="M38 16 L48 16 L38 76 L28 76 Z" fill="#f8fafc" fillOpacity="0.85" />
            <text
              x="64"
              y="46"
              fill="#f8fafc"
              fontFamily="Chakra Petch, sans-serif"
              fontWeight="700"
              fontStyle="italic"
              fontSize="36"
              letterSpacing="2"
            >
              HORIZON
            </text>
            <text
              x="64"
              y="78"
              fill="#f59e0b"
              fontFamily="Chakra Petch, sans-serif"
              fontWeight="700"
              fontStyle="italic"
              fontSize="26"
              letterSpacing="6"
            >
              APEX FESTIVAL
            </text>
          </svg>

          <p className="text-sm text-slate-300 leading-relaxed mb-5 max-w-md">
            120 Hz Pacejka tire dynamics, banked tarmac &amp; Baja canyon circuits, custom dyno builds, dynamic storm physics, and online multiplayer lobbies.
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mb-6 tabular-nums">
            <span className="text-slate-100 font-semibold">{car.name}</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-400 font-mono font-bold">
              {specs.carClass} {specs.piRating}
            </span>
            <span aria-hidden="true">·</span>
            <span>{specs.peakHp} HP</span>
            <span aria-hidden="true">·</span>
            <span>{car.drivetrain}</span>
            <span aria-hidden="true">·</span>
            <span>{PRESET_LABELS[drivePreset]}</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400 font-mono">{credits.toLocaleString()} CR</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="flex items-center gap-2.5 px-6 py-3 rounded-lg font-display font-bold text-base tracking-wide text-slate-950 bg-amber-500 hover:bg-amber-400 transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              Enter Open World
            </button>

            <button
              type="button"
              onClick={onOpenMultiplayer}
              className="flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-sm text-slate-100 bg-white/10 hover:bg-white/18 border border-white/15 transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4 text-sky-400" />
              Online Lobby
            </button>

            <button
              type="button"
              onClick={onOpenGarage}
              className="flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-sm text-slate-100 bg-white/10 hover:bg-white/18 border border-white/15 transition-colors cursor-pointer"
            >
              <Wrench className="w-4 h-4 text-amber-400" />
              Garage
            </button>

            <button
              type="button"
              onClick={onOpenEngineer}
              className="flex items-center gap-2 px-3.5 py-3 rounded-lg font-medium text-sm text-slate-100 bg-white/10 hover:bg-white/18 border border-white/15 transition-colors cursor-pointer"
              aria-label="Open AI Race Engineer"
            >
              <Bot className="w-4 h-4 text-violet-400" />
              Engineer
            </button>

            <button
              type="button"
              onClick={onOpenWeather}
              aria-label="Configure Weather and Physics Presets"
              className="flex items-center gap-2 px-3.5 py-3 rounded-lg font-medium text-sm text-slate-200 bg-white/8 hover:bg-white/15 border border-white/12 transition-colors cursor-pointer"
            >
              <CloudRain className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <div className="px-4 py-2 rounded-lg text-xs text-slate-300 tracking-wide border border-white/10 bg-[#0b0d12]/88">
          WASD / Arrows Drive · Space Handbrake · Shift NOS · Backspace Rewind · C Camera · P Photo · G Garage · H Engineer · V Weather · M Online
        </div>
        {modelCredit && (
          <div className="px-3 py-0.5 rounded bg-[#0b0d12]/78 text-[10px] text-slate-400">
            {modelCredit}
          </div>
        )}
      </div>
    </div>
  );
};
