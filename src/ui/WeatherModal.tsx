import React, { useState } from 'react';
import { CloudRain, Cpu, Gamepad2, Keyboard, Sliders, Sun, Volume2, X } from 'lucide-react';
import { TIME_OF_DAY_PROFILES, WEATHER_PROFILES } from '../config/weather';
import { STEERING_ASSIST_PROFILES } from '../physics/pacejka';
import type {
  AudioMixerSettings,
  DrivePreset,
  GamepadSettings,
  KeyBindings,
  QualityTier,
  SteeringAssistMode,
  TimeOfDayId,
  WeatherId,
} from '../config/types';

interface WeatherModalProps {
  weatherId: WeatherId;
  timeOfDayId: TimeOfDayId;
  drivePreset: DrivePreset;
  steeringAssist: SteeringAssistMode;
  gamepadSettings: GamepadSettings;
  connectedGamepadName: string | null;
  qualityTier: QualityTier;
  manualTransmission: boolean;
  absEnabled: boolean;
  tcsEnabled: boolean;
  escEnabled: boolean;
  audioMixer: AudioMixerSettings;
  keyBindings: KeyBindings;
  onSelectWeather: (w: WeatherId) => void;
  onSelectTimeOfDay: (t: TimeOfDayId) => void;
  onSelectDrivePreset: (p: DrivePreset) => void;
  onSelectSteeringAssist: (mode: SteeringAssistMode) => void;
  onUpdateGamepadSettings: (patch: Partial<GamepadSettings>) => void;
  onSelectQualityTier: (q: QualityTier) => void;
  onToggleManual: (m: boolean) => void;
  onUpdateAssists: (a: Partial<{ absEnabled: boolean; tcsEnabled: boolean; escEnabled: boolean }>) => void;
  onUpdateMixer: (m: Partial<AudioMixerSettings>) => void;
  onUpdateKeyBinding: (action: keyof KeyBindings, code: string) => void;
  onClose: () => void;
}

const KEY_LABELS: Array<{ key: keyof KeyBindings; label: string }> = [
  { key: 'throttle', label: 'Throttle' },
  { key: 'brake', label: 'Brake / Reverse' },
  { key: 'steerLeft', label: 'Steer Left' },
  { key: 'steerRight', label: 'Steer Right' },
  { key: 'handbrake', label: 'Handbrake' },
  { key: 'nitrous', label: 'Nitrous Oxide' },
  { key: 'shiftUp', label: 'Shift Up' },
  { key: 'shiftDown', label: 'Shift Down' },
  { key: 'camera', label: 'Cycle Camera' },
  { key: 'rewind', label: 'Rewind' },
  { key: 'reset', label: 'Reset to Road' },
];

export const WeatherModal: React.FC<WeatherModalProps> = ({
  weatherId,
  timeOfDayId,
  drivePreset,
  steeringAssist,
  gamepadSettings,
  connectedGamepadName,
  qualityTier,
  manualTransmission,
  absEnabled,
  tcsEnabled,
  escEnabled,
  audioMixer,
  keyBindings,
  onSelectWeather,
  onSelectTimeOfDay,
  onSelectDrivePreset,
  onSelectSteeringAssist,
  onUpdateGamepadSettings,
  onSelectQualityTier,
  onToggleManual,
  onUpdateAssists,
  onUpdateMixer,
  onUpdateKeyBinding,
  onClose,
}) => {
  const [rebindingKey, setRebindingKey] = useState<keyof KeyBindings | null>(null);

  const handleCaptureKey = (e: React.KeyboardEvent, action: keyof KeyBindings) => {
    e.preventDefault();
    e.stopPropagation();
    onUpdateKeyBinding(action, e.code);
    setRebindingKey(null);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/78">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-white/15 bg-[#0e1118] text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <CloudRain className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="font-display font-bold text-lg tracking-wide">
                WEATHER, PHYSICS &amp; SYSTEM SETTINGS
              </h2>
              <p className="text-xs text-slate-400">
                Real-time Pacejka weather adhesion, steering assists, analog gamepad &amp; controls
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Settings"
            className="p-2 rounded-lg bg-white/8 hover:bg-white/16 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Weather */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
              Weather Condition &amp; Surface Grip
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {Object.values(WEATHER_PROFILES).map((w) => {
                const active = w.id === weatherId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onSelectWeather(w.id)}
                    className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                      active
                        ? 'border-sky-400 bg-sky-500/15'
                        : 'border-white/10 bg-[#141925] hover:bg-[#1a2030]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-display font-bold text-sm">{w.label}</span>
                      <span className="text-[11px] font-mono text-sky-300">
                        {Math.round(w.roadGripMultiplier * 100)}% Grip
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-snug">{w.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time of Day */}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
              <Sun className="w-4 h-4 text-amber-400" />
              Time of Day
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {Object.values(TIME_OF_DAY_PROFILES).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTimeOfDay(t.id)}
                  className={`p-3 rounded-xl border text-center cursor-pointer ${
                    t.id === timeOfDayId
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200 font-bold'
                      : 'border-white/10 bg-[#141925] text-slate-300 hover:bg-[#1a2030]'
                  }`}
                >
                  <div className="text-sm">{t.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {t.headlightsOn ? 'Headlights Auto-On' : 'Daylight'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Drive Preset, Steering Assist & Gamepad Analog */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-[#141925] p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <Sliders className="w-4 h-4 text-amber-400" />
                Handling Realism &amp; Steering Assist
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'arcade', label: 'Arcade' },
                    { id: 'sim_lite', label: 'Sim-Lite' },
                    { id: 'sim', label: 'Sim' },
                  ] as Array<{ id: DrivePreset; label: string }>
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectDrivePreset(p.id)}
                    className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                      drivePreset === p.id
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-white/8 text-slate-300 hover:bg-white/14'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div>
                <div className="text-[11px] text-slate-400 mb-1.5">Steering Assist Mode</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(['off', 'countersteer', 'stability', 'full'] as SteeringAssistMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onSelectSteeringAssist(mode)}
                      className={`py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer ${
                        steeringAssist === mode
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : 'bg-white/8 text-slate-300 hover:bg-white/14'
                      }`}
                    >
                      {STEERING_ASSIST_PROFILES[mode].label.split(' ')[0]}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                  {STEERING_ASSIST_PROFILES[steeringAssist].description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <label className="flex items-center justify-between p-2 rounded bg-white/5 cursor-pointer">
                  <span>ABS Braking</span>
                  <input
                    type="checkbox"
                    checked={absEnabled}
                    onChange={(e) => onUpdateAssists({ absEnabled: e.target.checked })}
                    className="accent-amber-500"
                  />
                </label>
                <label className="flex items-center justify-between p-2 rounded bg-white/5 cursor-pointer">
                  <span>Traction Control</span>
                  <input
                    type="checkbox"
                    checked={tcsEnabled}
                    onChange={(e) => onUpdateAssists({ tcsEnabled: e.target.checked })}
                    className="accent-amber-500"
                  />
                </label>
                <label className="flex items-center justify-between p-2 rounded bg-white/5 cursor-pointer">
                  <span>Stability (ESC)</span>
                  <input
                    type="checkbox"
                    checked={escEnabled}
                    onChange={(e) => onUpdateAssists({ escEnabled: e.target.checked })}
                    className="accent-amber-500"
                  />
                </label>
                <label className="flex items-center justify-between p-2 rounded bg-white/5 cursor-pointer">
                  <span>Manual Gearbox</span>
                  <input
                    type="checkbox"
                    checked={manualTransmission}
                    onChange={(e) => onToggleManual(e.target.checked)}
                    className="accent-amber-500"
                  />
                </label>
              </div>
            </div>

            {/* Gamepad Analog Calibration & Graphics / Audio */}
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-[#141925] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                    <Gamepad2 className="w-4 h-4 text-sky-400" />
                    Gamepad Analog Calibration
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-[160px]">
                    {connectedGamepadName ?? 'No pad active'}
                  </span>
                </div>

                {[
                  {
                    key: 'deadzone',
                    label: 'Stick Deadzone',
                    min: 0.02,
                    max: 0.25,
                    step: 0.01,
                    fmt: (v: number) => `${Math.round(v * 100)}%`,
                  },
                  {
                    key: 'steerSensitivity',
                    label: 'Steer Linearity (Gamma)',
                    min: 0.6,
                    max: 2.0,
                    step: 0.05,
                    fmt: (v: number) => `${v.toFixed(2)}`,
                  },
                  {
                    key: 'speedSensitiveSteering',
                    label: 'High-Speed Steer Damping',
                    min: 0,
                    max: 1.0,
                    step: 0.05,
                    fmt: (v: number) => `${Math.round(v * 100)}%`,
                  },
                ].map((item) => {
                  const val = gamepadSettings[item.key as keyof GamepadSettings] as number;
                  return (
                    <label key={item.key} className="block text-xs">
                      <div className="flex justify-between text-slate-300">
                        <span>{item.label}</span>
                        <span className="font-mono">{item.fmt(val)}</span>
                      </div>
                      <input
                        type="range"
                        min={item.min}
                        max={item.max}
                        step={item.step}
                        value={val}
                        onChange={(e) =>
                          onUpdateGamepadSettings({
                            [item.key]: parseFloat(e.target.value),
                          } as Partial<GamepadSettings>)
                        }
                        className="w-full accent-sky-400 h-1.5"
                      />
                    </label>
                  );
                })}

                <label className="flex items-center justify-between pt-1 text-xs cursor-pointer">
                  <span className="text-slate-300">Dual-Rumble Feedback</span>
                  <input
                    type="checkbox"
                    checked={gamepadSettings.rumbleEnabled}
                    onChange={(e) => onUpdateGamepadSettings({ rumbleEnabled: e.target.checked })}
                    className="accent-sky-400"
                  />
                </label>
              </div>

              {/* Graphics Quality & Audio Mixer */}
              <div className="rounded-xl border border-white/10 bg-[#141925] p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  Graphics Tier &amp; Audio Mixer
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['low', 'medium', 'high', 'ultra'] as QualityTier[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onSelectQualityTier(q)}
                      className={`py-1.5 rounded text-xs font-semibold capitalize cursor-pointer ${
                        qualityTier === q
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-white/8 text-slate-300 hover:bg-white/14'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div className="space-y-2 text-xs pt-1">
                  {[
                    { key: 'master', label: 'Master Volume' },
                    { key: 'engine', label: 'Engine & Turbo' },
                    { key: 'sfx', label: 'Tires & Impacts' },
                    { key: 'ambience', label: 'Wind & Rain' },
                  ].map((m) => (
                    <label key={m.key} className="block">
                      <div className="flex justify-between text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <Volume2 className="w-3 h-3 text-slate-400" />
                          {m.label}
                        </span>
                        <span className="font-mono">
                          {Math.round((audioMixer[m.key as keyof AudioMixerSettings] as number) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={audioMixer[m.key as keyof AudioMixerSettings] as number}
                        onChange={(e) =>
                          onUpdateMixer({ [m.key]: parseFloat(e.target.value) } as Partial<AudioMixerSettings>)
                        }
                        className="w-full accent-sky-400 h-1.5"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Key Bindings */}
          <div className="rounded-xl border border-white/10 bg-[#141925] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
              <Keyboard className="w-4 h-4 text-violet-400" />
              Key Bindings (Click Any Button &amp; Press New Key)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
              {KEY_LABELS.map((item) => {
                const isCapturing = rebindingKey === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setRebindingKey(item.key)}
                    onKeyDown={isCapturing ? (e) => handleCaptureKey(e, item.key) : undefined}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer ${
                      isCapturing
                        ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                        : 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-200'
                    }`}
                  >
                    <span className="text-slate-400">{item.label}</span>
                    <span className="font-mono font-bold">
                      {isCapturing ? 'Press key...' : keyBindings[item.key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
