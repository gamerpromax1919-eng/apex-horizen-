import React, { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Box, Check, Cpu, Gauge, RotateCcw, Upload, Wrench, X } from 'lucide-react';
import { CAR_ROSTER, createDefaultTuning, getCarById } from '../config/cars';
import { applyTuningPreset, computeEffectiveSpecs } from '../physics/tuning';
import { CarModel } from '../vehicle/CarModel';
import { CAR_MODELS_CONFIG, type CarModelSelection } from '../vehicle/carModels.config';
import type {
  AeroKit,
  CarCustomization,
  EngineStage,
  LiveryStyle,
  PaintFinish,
  RimStyle,
  TireCompound,
  TuningSetup,
  UpgradeLevels,
} from '../config/types';

function ShowroomEnvironment() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = new RoomEnvironment();
    const rt = pmrem.fromScene(env, 0.04);
    scene.environment = rt.texture;
    env.dispose();
    invalidate();
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}

interface GarageModalProps {
  carId: string;
  glbModelId: CarModelSelection;
  customization: CarCustomization;
  tuning: TuningSetup;
  upgrades: UpgradeLevels;
  credits: number;
  isSoftwareGl: boolean;
  customGlbUrl: string | null;
  onSelectCar: (carId: string) => void;
  onSelectGlbModel: (modelId: CarModelSelection) => void;
  onUpdateCustomization: (c: CarCustomization) => void;
  onUpdateTuning: (t: TuningSetup) => void;
  onPurchaseUpgrade: (part: keyof UpgradeLevels) => void;
  onUploadGlb: (url: string | null) => void;
  onClose: () => void;
}

const PAINT_SWATCHES = [
  '#e11d48',
  '#f59e0b',
  '#eab308',
  '#10b981',
  '#06b6d4',
  '#2563eb',
  '#7c3aed',
  '#f8fafc',
  '#18181b',
  '#dc2626',
];

export const GarageModal: React.FC<GarageModalProps> = ({
  carId,
  glbModelId,
  customization,
  tuning,
  upgrades,
  credits,
  isSoftwareGl,
  customGlbUrl,
  onSelectCar,
  onSelectGlbModel,
  onUpdateCustomization,
  onUpdateTuning,
  onPurchaseUpgrade,
  onUploadGlb,
  onClose,
}) => {
  const [tab, setTab] = useState<'cars' | 'custom' | 'upgrades' | 'tuning'>('cars');
  const [showroomStatus, setShowroomStatus] = useState<{
    loading: boolean;
    credit: string | null;
    loadedModelName: string | null;
  }>({ loading: false, credit: null, loadedModelName: null });
  const car = getCarById(carId);
  const specs = useMemo(
    () => computeEffectiveSpecs(car, tuning, upgrades),
    [car, tuning, upgrades]
  );

  const dynoPaths = useMemo(() => {
    const curve = specs.dynoCurve;
    if (curve.length === 0) return { hpPath: '', tqPath: '' };
    const maxVal = Math.max(...curve.map((p) => Math.max(p.hp, p.torqueNm)), 600);
    const minRpm = curve[0].rpm;
    const maxRpm = curve[curve.length - 1].rpm;
    const mapX = (rpm: number) => 16 + ((rpm - minRpm) / Math.max(1, maxRpm - minRpm)) * 288;
    const mapY = (v: number) => 112 - (v / maxVal) * 96;
    const hpPath = curve
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${mapX(p.rpm).toFixed(1)} ${mapY(p.hp).toFixed(1)}`)
      .join(' ');
    const tqPath = curve
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${mapX(p.rpm).toFixed(1)} ${mapY(p.torqueNm).toFixed(1)}`)
      .join(' ');
    return { hpPath, tqPath };
  }, [specs]);

  const handleGlbFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onUploadGlb(url);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/78">
      <div className="w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl border border-white/15 bg-[#0e1118] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Wrench className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-display font-bold text-lg tracking-wide">
                HORIZON GARAGE &amp; DYNO TUNING
              </h2>
              <p className="text-xs text-slate-400">
                {car.manufacturer} {car.name} ({car.year}) · {car.drivetrain} · Class{' '}
                <span className="text-amber-400 font-bold">
                  {specs.carClass} {specs.piRating}
                </span>{' '}
                · <span className="text-emerald-400 font-mono">{credits.toLocaleString()} CR</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(['cars', 'custom', 'upgrades', 'tuning'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  tab === t
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-white/8 text-slate-300 hover:bg-white/14'
                }`}
              >
                {t === 'cars'
                  ? `Cars (${CAR_ROSTER.length})`
                  : t === 'custom'
                    ? 'Paint & Aero'
                    : t === 'upgrades'
                      ? 'Upgrades'
                      : 'Engine & Suspension'}
              </button>
            ))}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Garage"
              className="ml-2 p-2 rounded-lg bg-white/8 hover:bg-white/16 text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Live 3D Rotating Showroom Preview + Specs */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="h-52 rounded-xl border border-white/10 bg-[#080a10] overflow-hidden relative">
              <Canvas
                frameloop={isSoftwareGl ? 'demand' : 'always'}
                dpr={isSoftwareGl ? 1 : [1, 1.5]}
                camera={{ position: [4.0, 1.65, 4.5], fov: 42 }}
              >
                <color attach="background" args={['#090c14']} />
                <ShowroomEnvironment />
                <ambientLight intensity={0.85} />
                <directionalLight position={[6, 8, 5]} intensity={2.2} color="#fff7ed" />
                <directionalLight position={[-6, 4, -5]} intensity={1.1} color="#38bdf8" />
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                  <circleGeometry args={[3.4, 32]} />
                  <meshStandardMaterial color="#151b28" roughness={0.35} metalness={0.5} />
                </mesh>
                <CarModel
                  car={car}
                  customization={customization}
                  isSoftwareGl={isSoftwareGl}
                  glbModelId={glbModelId}
                  enableGlb
                  customGlbUrl={customGlbUrl}
                  onModelStatusChange={setShowroomStatus}
                  turntableSpin={!isSoftwareGl}
                  headlightsOn
                />
                <OrbitControls enablePan={false} minDistance={3.2} maxDistance={8.5} />
              </Canvas>
              {showroomStatus.loading && (
                <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400/40 text-[10px] font-mono text-amber-200 pointer-events-none">
                  Loading 3D GLB...
                </div>
              )}
              <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400 pointer-events-none">
                <span>3D SHOWROOM · DRAG TO ORBIT</span>
                {showroomStatus.loadedModelName && (
                  <span className="text-amber-300 truncate">{showroomStatus.loadedModelName}</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#141925] p-4">
              <div className="grid grid-cols-2 gap-3 text-sm tabular-nums">
                <div>
                  <div className="text-[11px] text-slate-400">Peak Power</div>
                  <div className="font-display font-bold text-xl text-amber-400">
                    {specs.peakHp} HP
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Peak Torque</div>
                  <div className="font-display font-bold text-xl text-sky-400">
                    {specs.peakTorqueNm} Nm
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">0–100 km/h</div>
                  <div className="font-mono font-bold text-slate-100">
                    {specs.zeroToHundredSec}s
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Est. Top Speed</div>
                  <div className="font-mono font-bold text-slate-100">{specs.topSpeedKmh} km/h</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Curb Weight</div>
                  <div className="font-mono font-bold text-slate-100">{specs.weightKg} kg</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Lateral Grip</div>
                  <div className="font-mono font-bold text-slate-100">{specs.lateralG} G</div>
                </div>
              </div>
            </div>

            {/* Live Dyno Chart */}
            <div className="rounded-xl border border-white/10 bg-[#141925] p-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" />
                  Live Engine Dyno Curve
                </span>
                <span className="text-[11px] text-slate-400">
                  <span className="text-amber-400">HP</span> /{' '}
                  <span className="text-sky-400">Nm</span>
                </span>
              </div>
              <svg viewBox="0 0 320 124" className="w-full h-28 bg-[#0b0e16] rounded-lg">
                <line x1="16" y1="112" x2="304" y2="112" stroke="#334155" strokeWidth="1" />
                <line x1="16" y1="16" x2="16" y2="112" stroke="#334155" strokeWidth="1" />
                <path d={dynoPaths.tqPath} fill="none" stroke="#38bdf8" strokeWidth="2.2" />
                <path d={dynoPaths.hpPath} fill="none" stroke="#f59e0b" strokeWidth="2.4" />
              </svg>
            </div>
          </div>

          {/* Right Column: Tab Content */}
          <div className="lg:col-span-8">
            {tab === 'cars' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CAR_ROSTER.map((c) => {
                  const selected = c.id === carId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelectCar(c.id)}
                      className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? 'border-amber-500 bg-amber-500/12'
                          : 'border-white/10 bg-[#141925] hover:bg-[#1a2030]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-display font-bold text-base text-slate-100">
                          {c.name}
                        </span>
                        {selected && <Check className="w-4 h-4 text-amber-400" />}
                      </div>
                      <div className="text-xs text-slate-400 mb-2">
                        {c.manufacturer} · {c.category} · {c.drivetrain}
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono text-slate-300 tabular-nums">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/25 inline-block"
                          style={{ backgroundColor: c.defaultColor }}
                        />
                        <span>{c.baseHp} HP</span>
                        <span>{c.baseTorqueNm} Nm</span>
                        <span>{c.baseWeightKg} kg</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {tab === 'custom' && (
              <div className="space-y-5">
                <div className="rounded-xl border border-white/10 bg-[#141925] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <Box className="w-4 h-4 text-amber-400" />
                      3D Chassis Model (.GLB Switcher)
                    </span>
                    {customGlbUrl && (
                      <button
                        type="button"
                        onClick={() => onUploadGlb(null)}
                        className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        Clear Custom Upload
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onUploadGlb(null);
                        onSelectGlbModel('auto');
                      }}
                      className={`px-3 py-2 rounded-lg text-xs font-medium text-left cursor-pointer border transition-colors ${
                        !customGlbUrl && glbModelId === 'auto'
                          ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-bold'
                          : 'border-white/10 bg-white/6 text-slate-300 hover:bg-white/12'
                      }`}
                    >
                      Auto (Ferrari First)
                    </button>
                    {CAR_MODELS_CONFIG.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onUploadGlb(null);
                          onSelectGlbModel(m.id);
                        }}
                        className={`px-3 py-2 rounded-lg text-xs font-medium text-left cursor-pointer border transition-colors ${
                          !customGlbUrl && glbModelId === m.id
                            ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-bold'
                            : 'border-white/10 bg-white/6 text-slate-300 hover:bg-white/12'
                        }`}
                      >
                        {m.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        onUploadGlb(null);
                        onSelectGlbModel('procedural');
                      }}
                      className={`px-3 py-2 rounded-lg text-xs font-medium text-left cursor-pointer border transition-colors ${
                        !customGlbUrl && glbModelId === 'procedural'
                          ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-bold'
                          : 'border-white/10 bg-white/6 text-slate-300 hover:bg-white/12'
                      }`}
                    >
                      Procedural Fallback
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/8 hover:bg-white/14 border border-white/12 text-xs cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-sky-400" />
                      <span>Upload Custom .GLB</span>
                      <input type="file" accept=".glb,.gltf" onChange={handleGlbFile} className="hidden" />
                    </label>
                    {showroomStatus.credit && (
                      <span className="text-[11px] text-slate-400">{showroomStatus.credit}</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#141925] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
                    Body Paint Color
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {PAINT_SWATCHES.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => onUpdateCustomization({ ...customization, primaryColor: col })}
                        aria-label={`Select paint ${col}`}
                        className={`w-9 h-9 rounded-lg border-2 cursor-pointer ${
                          customization.primaryColor === col
                            ? 'border-white scale-110'
                            : 'border-white/20'
                        }`}
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-white/10 bg-[#141925] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Paint Finish
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['metallic', 'matte', 'pearlescent', 'carbon'] as PaintFinish[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => onUpdateCustomization({ ...customization, paintFinish: f })}
                          className={`px-3 py-2 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                            customization.paintFinish === f
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'bg-white/8 text-slate-300 hover:bg-white/14'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#141925] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Livery Decal
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: 'none', label: 'Clean' },
                          { id: 'dual_stripe', label: 'Racing Stripes' },
                          { id: 'horizon_split', label: 'Two-Tone Roof' },
                          { id: 'carbon_hood', label: 'Carbon Hood' },
                          { id: 'racing_number', label: 'Race Number #07' },
                        ] as Array<{ id: LiveryStyle; label: string }>
                      ).map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => onUpdateCustomization({ ...customization, livery: l.id })}
                          className={`px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                            customization.livery === l.id
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'bg-white/8 text-slate-300 hover:bg-white/14'
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#141925] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Wheel Style
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: 'forged_5', label: 'Forged 5-Spoke' },
                          { id: 'mesh_multi', label: 'GT Multi-Mesh' },
                          { id: 'aero_dish', label: 'Aero Turbofan' },
                          { id: 'rally_fan', label: 'Baja Rally' },
                        ] as Array<{ id: RimStyle; label: string }>
                      ).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => onUpdateCustomization({ ...customization, rimStyle: r.id })}
                          className={`px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                            customization.rimStyle === r.id
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'bg-white/8 text-slate-300 hover:bg-white/14'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#141925] p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Rear Aero Spoiler
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'stock', label: 'Stock' },
                          { id: 'street', label: 'Lip' },
                          { id: 'gt_wing', label: 'GT Wing' },
                        ] as Array<{ id: AeroKit; label: string }>
                      ).map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => onUpdateCustomization({ ...customization, aeroKit: a.id })}
                          className={`px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                            customization.aeroKit === a.id
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'bg-white/8 text-slate-300 hover:bg-white/14'
                          }`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'upgrades' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(
                  [
                    { key: 'engine', label: 'Engine Internals', desc: '+14% HP & Redline per stage' },
                    { key: 'turbo', label: 'Twin-Scroll Turbo', desc: '+5 PSI peak boost per stage' },
                    { key: 'tires', label: 'Tire Compound', desc: 'Street → Semi → Racing Slicks' },
                    { key: 'suspension', label: 'Coilover Kit', desc: '+10% spring & damper authority' },
                    { key: 'weightReduction', label: 'Carbon Chassis', desc: '-65 kg curb weight per stage' },
                    { key: 'aero', label: 'Active Aero', desc: '+16% speed-squared downforce' },
                  ] as Array<{ key: keyof UpgradeLevels; label: string; desc: string }>
                ).map((u) => {
                  const lvl = upgrades[u.key] ?? 0;
                  return (
                    <div
                      key={u.key}
                      className="p-4 rounded-xl border border-white/10 bg-[#141925] flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-display font-bold text-sm text-slate-100">{u.label}</div>
                        <div className="text-xs text-slate-400">{u.desc}</div>
                        <div className="flex gap-1 mt-2">
                          {[1, 2, 3].map((step) => (
                            <span
                              key={step}
                              className={`w-6 h-1.5 rounded ${
                                lvl >= step ? 'bg-amber-500' : 'bg-white/12'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onPurchaseUpgrade(u.key)}
                        className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap"
                      >
                        Stage {lvl}/3
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'tuning' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {(['track_grip', 'drift', 'baja_rally', 'top_speed'] as const).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onUpdateTuning(applyTuningPreset(car, tuning, preset))}
                        className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/16 border border-white/10 text-xs font-semibold capitalize text-slate-200 cursor-pointer"
                      >
                        {preset.replace('_', ' ')} Preset
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateTuning(createDefaultTuning(car))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/16 text-xs text-slate-300 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Stock
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#141925] p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-amber-400" />
                      Engine Build Stage
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {(['stock', 'street', 'sport', 'race', 'pro'] as EngineStage[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => onUpdateTuning({ ...tuning, engineStage: st })}
                          className={`py-1.5 rounded text-[11px] font-semibold capitalize cursor-pointer ${
                            tuning.engineStage === st
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-white/8 text-slate-300 hover:bg-white/14'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-300 mb-2">Tire Compound</div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['street', 'semislick', 'slick', 'offroad'] as TireCompound[]).map((tc) => (
                        <button
                          key={tc}
                          type="button"
                          onClick={() => onUpdateTuning({ ...tuning, tireCompound: tc })}
                          className={`py-1.5 rounded text-[11px] font-semibold capitalize cursor-pointer ${
                            tuning.tireCompound === tc
                              ? 'bg-sky-500 text-slate-950'
                              : 'bg-white/8 text-slate-300 hover:bg-white/14'
                          }`}
                        >
                          {tc}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#141925] p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-xs">
                  {[
                    { key: 'boostPsi', label: 'Turbo Boost (PSI)', min: 0, max: 30, step: 0.5, unit: 'PSI' },
                    { key: 'revLimitRpm', label: 'Rev Limiter', min: 6500, max: 10500, step: 100, unit: 'RPM' },
                    { key: 'finalDrive', label: 'Final Drive Ratio', min: 2.8, max: 4.8, step: 0.05, unit: ':1' },
                    { key: 'nitrousShotHp', label: 'Nitrous Oxide Shot', min: 0, max: 320, step: 10, unit: 'HP' },
                    { key: 'lsdLock', label: 'LSD Differential Lock', min: 0.1, max: 1.0, step: 0.05, unit: '' },
                    { key: 'springStiffness', label: 'Spring Stiffness', min: 0.6, max: 1.6, step: 0.05, unit: 'x' },
                    { key: 'damperBump', label: 'Damper Bump', min: 0.6, max: 1.6, step: 0.05, unit: 'x' },
                    { key: 'damperRebound', label: 'Damper Rebound', min: 0.6, max: 1.6, step: 0.05, unit: 'x' },
                    { key: 'antiRollBar', label: 'Anti-Roll Bar', min: 0.5, max: 1.8, step: 0.05, unit: 'x' },
                    { key: 'camberDeg', label: 'Negative Camber', min: -5, max: 0, step: 0.2, unit: '°' },
                    { key: 'brakeBiasFront', label: 'Front Brake Bias', min: 0.4, max: 0.78, step: 0.02, unit: '' },
                    { key: 'aeroDownforce', label: 'Aero Downforce', min: 0.4, max: 2.0, step: 0.05, unit: 'x' },
                  ].map((s) => {
                    const val = tuning[s.key as keyof TuningSetup] as number;
                    return (
                      <label key={s.key} className="block">
                        <div className="flex justify-between text-slate-300 mb-1 tabular-nums">
                          <span>{s.label}</span>
                          <span className="font-mono text-amber-400">
                            {s.key === 'brakeBiasFront'
                              ? `${Math.round(val * 100)}% F`
                              : s.key === 'lsdLock'
                                ? `${Math.round(val * 100)}%`
                                : `${val} ${s.unit}`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={s.min}
                          max={s.max}
                          step={s.step}
                          value={val}
                          onChange={(e) =>
                            onUpdateTuning({
                              ...tuning,
                              [s.key]: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-amber-500"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
