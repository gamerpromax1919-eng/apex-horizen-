import React, { useEffect, useRef, useState } from 'react';
import type { VehicleTelemetry } from '../config/types';
import type { DebugPhysicsOverrides } from '../store/gameStore';

interface DebugOverlayProps {
  telemetry: VehicleTelemetry;
  overrides: DebugPhysicsOverrides;
  fps: number;
  onUpdate: (patch: Partial<DebugPhysicsOverrides>) => void;
}

interface TelemetrySample {
  speedKmh: number;
  rpmNorm: number;
  slipFL: number;
  slipFR: number;
  slipRL: number;
  slipRR: number;
  compFL: number;
  compRL: number;
  longG: number;
  latG: number;
}

const HISTORY_LEN = 72;

function toPolyline(values: number[], width: number, height: number, minVal: number, maxVal: number): string {
  if (values.length < 2) return '';
  const span = Math.max(1e-4, maxVal - minVal);
  return values
    .map((v, idx) => {
      const x = (idx / Math.max(1, HISTORY_LEN - 1)) * width;
      const clamped = Math.max(0, Math.min(1, (v - minVal) / span));
      const y = height - clamped * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({
  telemetry,
  overrides,
  fps,
  onUpdate,
}) => {
  const historyRef = useRef<TelemetrySample[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    const sample: TelemetrySample = {
      speedKmh: telemetry.speedKmh,
      rpmNorm: Math.min(1, telemetry.rpm / 9500),
      slipFL: telemetry.wheels[0]?.slipRatio ?? 0,
      slipFR: telemetry.wheels[1]?.slipRatio ?? 0,
      slipRL: telemetry.wheels[2]?.slipRatio ?? 0,
      slipRR: telemetry.wheels[3]?.slipRatio ?? 0,
      compFL: telemetry.wheels[0]?.compression ?? 0,
      compRL: telemetry.wheels[2]?.compression ?? 0,
      longG: telemetry.longG ?? 0,
      latG: telemetry.latG ?? 0,
    };
    const arr = historyRef.current;
    arr.push(sample);
    if (arr.length > HISTORY_LEN) arr.shift();
    setTick((n) => (n + 1) % 100000);
  }, [telemetry]);

  const samples = historyRef.current;
  const speedPts = toPolyline(samples.map((s) => s.speedKmh), 196, 46, 0, 340);
  const rpmPts = toPolyline(samples.map((s) => s.rpmNorm), 196, 46, 0, 1);
  const slipFrontPts = toPolyline(samples.map((s) => (s.slipFL + s.slipFR) * 0.5), 196, 44, -0.6, 0.6);
  const slipRearPts = toPolyline(samples.map((s) => (s.slipRL + s.slipRR) * 0.5), 196, 44, -0.6, 0.6);
  const compFrontPts = toPolyline(samples.map((s) => s.compFL), 196, 44, 0, 1);
  const compRearPts = toPolyline(samples.map((s) => s.compRL), 196, 44, 0, 1);

  const gScale = 26; // 1.5G radius -> 39px inside 86x86 circle
  const curGx = 43 + Math.max(-1.6, Math.min(1.6, telemetry.latG ?? 0)) * gScale;
  const curGy = 43 - Math.max(-1.6, Math.min(1.6, telemetry.longG ?? 0)) * gScale;
  const frontPct = Math.round(telemetry.frontWeightPct ?? 51);
  const clutchPct = Math.round((telemetry.clutchEngagement ?? 1) * 100);

  return (
    <div
      data-testid="debug-overlay"
      className="fixed top-52 left-4 z-30 w-[336px] max-h-[calc(100vh-19.5rem)] overflow-y-auto rounded-xl border border-emerald-500/35 bg-[#090d14]/94 p-3 text-[11px] font-mono text-slate-200 shadow-xl pointer-events-auto"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2">
        <span className="font-bold text-emerald-400">120HZ TELEMETRY DEBUG</span>
        <span className="text-slate-400">{Math.round(fps)} FPS</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-2 text-[10px] text-slate-300 tabular-nums">
        <div>SPD: {telemetry.speedKmh.toFixed(1)}</div>
        <div>RPM: {Math.round(telemetry.rpm)}</div>
        <div>GEAR: {telemetry.gear === -1 ? 'R' : telemetry.gear}</div>
        <div>SURF: {telemetry.surface}</div>
        <div>GRIP: {(telemetry.gripFactor * 100).toFixed(0)}%</div>
        <div>CLUTCH: {clutchPct}%</div>
      </div>

      {/* Live Weight Transfer Bar & G-G Friction Circle */}
      <div className="grid grid-cols-[1fr_92px] gap-2.5 items-center border-t border-white/10 pt-2 mb-2.5">
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>WT F {frontPct}%</span>
            <span>R {100 - frontPct}%</span>
          </div>
          <div className="w-full h-2 rounded bg-slate-800 overflow-hidden flex">
            <div className="h-full bg-amber-400 transition-all duration-75" style={{ width: `${frontPct}%` }} />
            <div className="h-full bg-sky-400 transition-all duration-75" style={{ width: `${100 - frontPct}%` }} />
          </div>
          <div className="text-[10px] text-slate-300 tabular-nums">
            G: {(telemetry.latG ?? 0).toFixed(2)} Lat · {(telemetry.longG ?? 0).toFixed(2)} Long
          </div>
          <div className="text-[10px] text-slate-400 tabular-nums">
            Drift Angle: {telemetry.driftAngleDeg.toFixed(1)}°
          </div>
        </div>

        <svg
          width="86"
          height="86"
          viewBox="0 0 86 86"
          className="rounded-lg bg-[#0d131f] border border-white/10"
          aria-label="G-G Friction Circle"
        >
          <circle cx="43" cy="43" r="26" fill="none" stroke="rgba(148,163,184,0.22)" strokeDasharray="2 2" />
          <circle cx="43" cy="43" r="39" fill="none" stroke="rgba(148,163,184,0.12)" />
          <line x1="4" y1="43" x2="82" y2="43" stroke="rgba(148,163,184,0.16)" />
          <line x1="43" y1="4" x2="43" y2="82" stroke="rgba(148,163,184,0.16)" />
          {samples.slice(-18).map((s, idx) => {
            const tx = 43 + Math.max(-1.6, Math.min(1.6, s.latG)) * gScale;
            const ty = 43 - Math.max(-1.6, Math.min(1.6, s.longG)) * gScale;
            return (
              <circle
                key={idx}
                cx={tx}
                cy={ty}
                r="1.4"
                fill="#10b981"
                fillOpacity={(idx + 1) / 20}
              />
            );
          })}
          <circle cx={curGx} cy={curGy} r="3.2" fill="#f59e0b" stroke="#090d14" strokeWidth="1" />
        </svg>
      </div>

      {/* Live Rolling Telemetry Waveform Graphs */}
      <div className="space-y-2 border-t border-white/10 pt-2 mb-2.5" data-testid="debug-graphs">
        <div>
          <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
            <span className="text-sky-400">SPEED (km/h)</span>
            <span className="text-amber-400">ENGINE RPM</span>
          </div>
          <svg width="100%" height="46" viewBox="0 0 196 46" className="rounded bg-[#0d131f] border border-white/10">
            <polyline fill="none" stroke="#38bdf8" strokeWidth="1.5" points={speedPts} />
            <polyline fill="none" stroke="#f59e0b" strokeWidth="1.2" points={rpmPts} />
          </svg>
        </div>

        <div>
          <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
            <span className="text-emerald-400">SLIP F/R</span>
            <span className="text-violet-400">SUSP COMP F/R</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <svg width="100%" height="44" viewBox="0 0 196 44" className="rounded bg-[#0d131f] border border-white/10">
              <line x1="0" y1="22" x2="196" y2="22" stroke="rgba(148,163,184,0.18)" />
              <polyline fill="none" stroke="#34d399" strokeWidth="1.4" points={slipFrontPts} />
              <polyline fill="none" stroke="#fb7185" strokeWidth="1.4" points={slipRearPts} />
            </svg>
            <svg width="100%" height="44" viewBox="0 0 196 44" className="rounded bg-[#0d131f] border border-white/10">
              <polyline fill="none" stroke="#a78bfa" strokeWidth="1.4" points={compFrontPts} />
              <polyline fill="none" stroke="#facc15" strokeWidth="1.4" points={compRearPts} />
            </svg>
          </div>
        </div>
      </div>

      {/* Per-Wheel Table */}
      <div className="space-y-1 border-t border-white/10 pt-2 mb-2.5">
        <div className="grid grid-cols-5 text-[10px] text-slate-400">
          <span>WHL</span>
          <span>LOAD</span>
          <span>SR</span>
          <span>SA°</span>
          <span>COMP</span>
        </div>
        {telemetry.wheels.map((w) => (
          <div key={w.name} className="grid grid-cols-5 text-[10px] tabular-nums">
            <span className={w.grounded ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
              {w.name}
            </span>
            <span>{(w.normalLoadN / 1000).toFixed(1)}k</span>
            <span>{w.slipRatio.toFixed(2)}</span>
            <span>{((w.slipAngleRad * 180) / Math.PI).toFixed(1)}</span>
            <span>{Math.round(w.compression * 100)}%</span>
          </div>
        ))}
      </div>

      {/* Live Tunable Physics Sliders */}
      <div className="space-y-1.5 border-t border-white/10 pt-2">
        {[
          { key: 'gripScale', label: 'Tire Grip Scale', min: 0.5, max: 1.6 },
          { key: 'springScale', label: 'Spring Scale', min: 0.5, max: 1.8 },
          { key: 'damperScale', label: 'Damper Scale', min: 0.5, max: 1.8 },
          { key: 'aeroScale', label: 'Aero Downforce', min: 0.4, max: 2.0 },
          { key: 'arbScale', label: 'Anti-Roll Bar', min: 0.4, max: 2.0 },
        ].map((item) => {
          const val = overrides[item.key as keyof DebugPhysicsOverrides] as number;
          return (
            <label key={item.key} className="block">
              <div className="flex justify-between text-[10px] text-slate-300">
                <span>{item.label}</span>
                <span>{val.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={item.min}
                max={item.max}
                step={0.05}
                value={val}
                onChange={(e) =>
                  onUpdate({ [item.key]: parseFloat(e.target.value) } as Partial<DebugPhysicsOverrides>)
                }
                className="w-full accent-emerald-400 h-1.5"
              />
            </label>
          );
        })}

        <label className="flex items-center justify-between pt-1 cursor-pointer">
          <span className="text-[10px] text-slate-300">Tire Thermal &amp; Wear</span>
          <input
            type="checkbox"
            checked={overrides.thermalWear}
            onChange={(e) => onUpdate({ thermalWear: e.target.checked })}
            className="accent-emerald-400"
          />
        </label>
      </div>
    </div>
  );
};
