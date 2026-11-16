import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Box,
  Car,
  Check,
  Cpu,
  Gauge,
  Lock,
  Play,
  RotateCcw,
  RotateCw,
  ShoppingCart,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import {
  CAR_ROSTER,
  PAINT_SWATCHES,
  createDefaultCustomization,
  createDefaultTuning,
  createDefaultUpgrades,
  getCarById,
} from '../config/cars';
import {
  UPGRADE_CATALOG,
  applyTuningPreset,
  computeEffectiveSpecs,
  computeShowroomStatBars,
  getCarUpgradeMaxStage,
  getUpgradeStageCost,
} from '../physics/tuning';
import { CarModel } from '../vehicle/CarModel';
import { CAR_MODELS_CONFIG, type CarModelSelection } from '../vehicle/carModels.config';
import type {
  AeroKit,
  CarClass,
  CarCustomization,
  EngineStage,
  LiveryStyle,
  PaintFinish,
  RimStyle,
  TireCompound,
  TuningSetup,
  UpgradeLevels,
} from '../config/types';

type CameraPresetId = 'hero' | 'side' | 'rear' | 'wheel';

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  hero: { label: '3/4', pos: [4.0, 1.62, 4.45], target: [0, 0.55, 0] },
  side: { label: 'Side', pos: [5.35, 1.32, 0.05], target: [0, 0.55, 0] },
  rear: { label: 'Rear', pos: [-2.85, 1.55, -4.55], target: [0, 0.62, -0.3] },
  wheel: { label: 'Wheel', pos: [2.75, 0.82, 2.25], target: [0.4, 0.42, 0.9] },
};

const RIM_SWATCHES = ['#cbd5e1', '#18181b', '#f59e0b', '#eab308', '#dc2626', '#38bdf8', '#f8fafc'];
const CALIPER_SWATCHES = ['#f59e0b', '#dc2626', '#0ea5e9', '#10b981', '#facc15', '#e2e8f0'];

const CLASS_BADGE_STYLES: Record<CarClass, string> = {
  B: 'bg-sky-500 text-slate-950',
  A: 'bg-emerald-500 text-slate-950',
  S1: 'bg-amber-500 text-slate-950',
  S2: 'bg-rose-500 text-white',
  X: 'bg-violet-500 text-white',
};

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

interface ShowroomCameraRigProps {
  presetId: CameraPresetId;
  presetVersion: number;
  autoOrbit: boolean;
  isSoftwareGl: boolean;
}

function ShowroomCameraRig({
  presetId,
  presetVersion,
  autoOrbit,
  isSoftwareGl,
}: ShowroomCameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera, invalidate } = useThree();
  const goalPosRef = useRef<THREE.Vector3 | null>(null);
  const goalTargetRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    const preset = CAMERA_PRESETS[presetId];
    if (isSoftwareGl) {
      camera.position.set(...preset.pos);
      if (controlsRef.current) {
        controlsRef.current.target.set(...preset.target);
        controlsRef.current.update();
      }
      invalidate();
      return;
    }
    goalPosRef.current = new THREE.Vector3(...preset.pos);
    goalTargetRef.current = new THREE.Vector3(...preset.target);
  }, [presetId, presetVersion, isSoftwareGl, camera, invalidate]);

  useFrame((_state, dt) => {
    if (!goalPosRef.current || !goalTargetRef.current) return;
    const alpha = 1 - Math.exp(-7 * Math.min(0.05, dt));
    camera.position.lerp(goalPosRef.current, alpha);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(goalTargetRef.current, alpha);
      controlsRef.current.update();
    }
    if (camera.position.distanceTo(goalPosRef.current) < 0.04) {
      goalPosRef.current = null;
      goalTargetRef.current = null;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      minDistance={2.8}
      maxDistance={8.5}
      minPolarAngle={0.22}
      maxPolarAngle={Math.PI * 0.48}
      autoRotate={autoOrbit && !isSoftwareGl}
      autoRotateSpeed={1.25}
      onStart={() => {
        goalPosRef.current = null;
        goalTargetRef.current = null;
      }}
    />
  );
}

interface GarageModalProps {
  carId: string;
  ownedCarIds: string[];
  testDriveCarId: string | null;
  glbModelId: CarModelSelection;
  customizations: Record<string, CarCustomization>;
  tunings: Record<string, TuningSetup>;
  upgrades: Record<string, UpgradeLevels>;
  purchasedUpgrades: Record<string, UpgradeLevels>;
  credits: number;
  isSoftwareGl: boolean;
  customGlbUrl: string | null;
  onSelectCar: (carId: string) => void;
  onBuyCar: (carId: string) => boolean;
  onStartTestDrive: (carId: string) => void;
  onSelectGlbModel: (modelId: CarModelSelection) => void;
  onUpdateCustomization: (c: CarCustomization, targetCarId?: string) => void;
  onUpdateTuning: (t: TuningSetup, targetCarId?: string) => void;
  onPurchaseUpgrade: (part: keyof UpgradeLevels, targetCarId?: string) => boolean;
  onSetUpgradeStage: (part: keyof UpgradeLevels, stage: number, targetCarId?: string) => void;
  onUploadGlb: (url: string | null) => void;
  onClose: () => void;
}

type RosterFilter = 'all' | 'owned' | 'exotic' | 'track' | 'offroad';

export const GarageModal: React.FC<GarageModalProps> = ({
  carId,
  ownedCarIds,
  testDriveCarId,
  glbModelId,
  customizations,
  tunings,
  upgrades,
  purchasedUpgrades,
  credits,
  isSoftwareGl,
  customGlbUrl,
  onSelectCar,
  onBuyCar,
  onStartTestDrive,
  onSelectGlbModel,
  onUpdateCustomization,
  onUpdateTuning,
  onPurchaseUpgrade,
  onSetUpgradeStage,
  onUploadGlb,
  onClose,
}) => {
  const [tab, setTab] = useState<'cars' | 'custom' | 'upgrades' | 'tuning'>('cars');
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all');
  const [inspectedCarId, setInspectedCarId] = useState<string>(carId);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('hero');
  const [cameraPresetVersion, setCameraPresetVersion] = useState(0);
  const [turntableOn, setTurntableOn] = useState(!isSoftwareGl);
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null);
  const [showroomStatus, setShowroomStatus] = useState<{
    loading: boolean;
    credit: string | null;
    loadedModelName: string | null;
  }>({ loading: false, credit: null, loadedModelName: null });

  useEffect(() => {
    setInspectedCarId(carId);
  }, [carId]);

  const car = getCarById(inspectedCarId);
  const isOwned = ownedCarIds.includes(inspectedCarId);
  const isEquipped = inspectedCarId === carId && testDriveCarId !== inspectedCarId;

  const customization = useMemo(
    () => customizations[inspectedCarId] ?? createDefaultCustomization(car),
    [customizations, inspectedCarId, car]
  );
  const tuning = useMemo(
    () => tunings[inspectedCarId] ?? createDefaultTuning(car),
    [tunings, inspectedCarId, car]
  );
  const carUpgrades = useMemo(
    () => upgrades[inspectedCarId] ?? createDefaultUpgrades(),
    [upgrades, inspectedCarId]
  );
  const carPurchasedUpgrades = useMemo(
    () => purchasedUpgrades[inspectedCarId] ?? createDefaultUpgrades(),
    [purchasedUpgrades, inspectedCarId]
  );

  const baselineSpecs = useMemo(
    () => computeEffectiveSpecs(car, createDefaultTuning(car), createDefaultUpgrades()),
    [car]
  );
  const specs = useMemo(
    () => computeEffectiveSpecs(car, tuning, carUpgrades),
    [car, tuning, carUpgrades]
  );
  const statBars = useMemo(
    () => computeShowroomStatBars(specs, baselineSpecs),
    [specs, baselineSpecs]
  );
  const piDelta = specs.piRating - baselineSpecs.piRating;

  const filteredRoster = useMemo(() => {
    return CAR_ROSTER.filter((c) => {
      if (rosterFilter === 'owned') return ownedCarIds.includes(c.id);
      if (rosterFilter === 'exotic') {
        return c.category === 'Hypercar' || c.category === 'Supercar' || c.category === 'EV Hypercar';
      }
      if (rosterFilter === 'track') {
        return c.category === 'Track GT' || c.category === 'JDM Street' || c.category === 'Drift Spec';
      }
      if (rosterFilter === 'offroad') {
        return (
          c.category === 'Rally Trophy' ||
          c.category === 'Rally Hatch' ||
          c.category === 'Muscle GT'
        );
      }
      return true;
    });
  }, [rosterFilter, ownedCarIds]);

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

  const handleBuyInspected = () => {
    const ok = onBuyCar(inspectedCarId);
    if (ok) {
      setPurchaseNotice(`Purchased & equipped ${car.name}!`);
      setTimeout(() => setPurchaseNotice(null), 2600);
    } else {
      setPurchaseNotice(`Need ${(car.priceCr - credits).toLocaleString()} more CR to buy ${car.name}.`);
      setTimeout(() => setPurchaseNotice(null), 2600);
    }
  };

  const handleSelectRosterCard = (id: string) => {
    setInspectedCarId(id);
    if (ownedCarIds.includes(id)) {
      onSelectCar(id);
    }
  };

  const handleSelectCameraPreset = (preset: CameraPresetId) => {
    setCameraPreset(preset);
    setCameraPresetVersion((v) => v + 1);
  };

  return (
    <div
      data-testid="garage-modal"
      className="fixed inset-0 z-40 flex items-center justify-center p-3 md:p-4 bg-black/82"
    >
      <div className="w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-white/15 bg-[#0e1118] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Wrench className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h2 className="font-display font-bold text-lg tracking-wide flex items-center gap-2">
                <span>HORIZON GARAGE &amp; SHOWROOM</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/10 text-slate-300">
                  {ownedCarIds.length}/{CAR_ROSTER.length} OWNED
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {car.manufacturer} {car.name} ({car.year}) · {car.drivetrain} ·{' '}
                <span className="text-amber-400 font-bold">
                  {specs.carClass} {specs.piRating}
                </span>{' '}
                ·{' '}
                <span data-testid="garage-credits" className="text-emerald-400 font-mono font-semibold">
                  {credits.toLocaleString()} CR
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['cars', 'custom', 'upgrades', 'tuning'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  tab === t
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-white/8 text-slate-300 hover:bg-white/14'
                }`}
              >
                {t === 'cars'
                  ? `Car Roster (${CAR_ROSTER.length})`
                  : t === 'custom'
                    ? 'Paint & Aero'
                    : t === 'upgrades'
                      ? 'Upgrades'
                      : 'Dyno Tuning'}
              </button>
            ))}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Garage"
              className="ml-1 p-2 rounded-lg bg-white/8 hover:bg-white/16 text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: 3D Turntable Showroom + Class/PI + Stat Bars + Action CTA */}
          <div className="lg:col-span-4 flex flex-col gap-2.5">
            <div className="h-48 rounded-xl border border-white/12 bg-[#07090f] overflow-hidden relative">
              <Canvas
                frameloop={isSoftwareGl ? 'demand' : 'always'}
                dpr={isSoftwareGl ? 1 : [1, 1.5]}
                camera={{ position: CAMERA_PRESETS.hero.pos, fov: 40 }}
              >
                <color attach="background" args={['#080b12']} />
                <ShowroomEnvironment />
                <ambientLight intensity={0.75} />
                <hemisphereLight args={['#cbd5e1', '#1e293b', 0.65]} />
                <directionalLight position={[6, 8, 5]} intensity={2.4} color="#fff7ed" />
                <directionalLight position={[-6, 4, -5]} intensity={1.2} color="#38bdf8" />

                {/* Brushed Graphite Showroom Turntable & Accent Ring */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.025, 0]}>
                  <cylinderGeometry args={[3.35, 3.45, 0.05, 48]} />
                  <meshStandardMaterial color="#161d2b" roughness={0.32} metalness={0.62} />
                </mesh>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
                  <ringGeometry args={[3.15, 3.24, 64]} />
                  <meshBasicMaterial color="#f59e0b" transparent opacity={0.55} />
                </mesh>
                {/* Soft Ground Contact Shadow under vehicle */}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
                  <circleGeometry args={[2.15, 32]} />
                  <meshBasicMaterial color="#000000" transparent opacity={0.42} depthWrite={false} />
                </mesh>

                <CarModel
                  car={car}
                  customization={customization}
                  isSoftwareGl={isSoftwareGl}
                  glbModelId={glbModelId}
                  enableGlb
                  customGlbUrl={customGlbUrl}
                  onModelStatusChange={setShowroomStatus}
                  turntableSpin={turntableOn && !isSoftwareGl}
                  headlightsOn
                />
                <ShowroomCameraRig
                  presetId={cameraPreset}
                  presetVersion={cameraPresetVersion}
                  autoOrbit={turntableOn}
                  isSoftwareGl={isSoftwareGl}
                />
              </Canvas>

              {/* Top Overlay: Loading + Turntable Toggle */}
              <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                <span className="px-2 py-0.5 rounded bg-black/70 border border-white/10 text-[10px] font-mono text-slate-300">
                  {isOwned ? 'GARAGE OWNED' : `DEALER · ${car.priceCr.toLocaleString()} CR`}
                </span>
                <button
                  type="button"
                  onClick={() => setTurntableOn((v) => !v)}
                  aria-label="Toggle Turntable Spin"
                  className={`pointer-events-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                    turntableOn
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                      : 'bg-black/70 border-white/15 text-slate-300'
                  }`}
                >
                  <RotateCw className="w-3 h-3" />
                  <span>{turntableOn ? 'SPIN ON' : 'SPIN OFF'}</span>
                </button>
              </div>

              {showroomStatus.loading && (
                <div className="absolute top-10 right-2.5 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400/40 text-[10px] font-mono text-amber-200 pointer-events-none">
                  Loading 3D GLB...
                </div>
              )}

              {/* Bottom Overlay: Camera Angle Presets */}
              <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 shrink-0">
                  {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((pid) => (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => handleSelectCameraPreset(pid)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors whitespace-nowrap ${
                        cameraPreset === pid
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                          : 'bg-black/70 text-slate-300 border-white/12 hover:bg-black/90'
                      }`}
                    >
                      {CAMERA_PRESETS[pid].label}
                    </button>
                  ))}
                </div>
                {showroomStatus.loadedModelName && (
                  <span className="text-[10px] font-mono text-amber-300 truncate pointer-events-none hidden sm:inline">
                    {showroomStatus.loadedModelName}
                  </span>
                )}
              </div>
            </div>

            {/* Class / PI Rating + Stat Bars (Power, Handling, Weight, Speed) */}
            <div className="rounded-xl border border-white/10 bg-[#141925] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-white/10">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    {car.manufacturer} · {car.category}
                  </div>
                  <div className="font-display font-bold text-base text-slate-50 leading-tight">
                    {car.name}
                  </div>
                </div>
                <div
                  data-testid="garage-pi-badge"
                  className="flex items-center rounded-lg overflow-hidden border border-white/15 tabular-nums shrink-0"
                >
                  <span
                    className={`px-2.5 py-1 font-display font-bold text-sm ${CLASS_BADGE_STYLES[specs.carClass]}`}
                  >
                    {specs.carClass}
                  </span>
                  <span className="px-2.5 py-1 bg-[#0b0e16] font-mono font-bold text-sm text-slate-100">
                    {specs.piRating}
                    {piDelta !== 0 && (
                      <span
                        className={`ml-1 text-[11px] ${
                          piDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {piDelta > 0 ? `+${piDelta}` : piDelta}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* 4 Normalized Physics Stat Bars */}
              <div className="space-y-2.5" data-testid="garage-stat-bars">
                {statBars.map((bar) => (
                  <div key={bar.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="text-slate-300 font-semibold">{bar.label}</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-slate-100 font-bold">{bar.valueLabel}</span>
                        {bar.delta !== 0 && (
                          <span
                            className={`text-[10px] font-bold ${
                              bar.delta > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            ({bar.delta > 0 ? `+${bar.delta}` : bar.delta})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 w-full rounded bg-white/10 overflow-hidden relative">
                      <div
                        className="h-full bg-amber-500 transition-all duration-150"
                        style={{ width: `${Math.min(bar.score, bar.baselineScore)}%` }}
                      />
                      {bar.delta > 0 && (
                        <div
                          className="h-full bg-emerald-400 absolute top-0 transition-all duration-150"
                          style={{
                            left: `${bar.baselineScore}%`,
                            width: `${bar.delta}%`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-xs tabular-nums">
                <div>
                  <div className="text-[10px] text-slate-400">Torque</div>
                  <div className="font-mono font-bold text-sky-400">{specs.peakTorqueNm} Nm</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">0–100 km/h</div>
                  <div className="font-mono font-bold text-slate-100">{specs.zeroToHundredSec}s</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Drivetrain</div>
                  <div className="font-mono font-bold text-amber-300">{car.drivetrain}</div>
                </div>
              </div>
            </div>

            {/* Primary Showroom Actions: Buy / Equip & Test Drive */}
            <div className="rounded-xl border border-white/10 bg-[#141925] p-3 space-y-2">
              {purchaseNotice && (
                <div className="px-2.5 py-1.5 rounded bg-amber-500/15 border border-amber-400/35 text-xs text-amber-200">
                  {purchaseNotice}
                </div>
              )}
              <div className="flex items-center gap-2">
                {isOwned ? (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCar(inspectedCarId);
                      onClose();
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs tracking-wide cursor-pointer whitespace-nowrap"
                  >
                    <Car className="w-4 h-4" />
                    {isEquipped ? 'DRIVE EQUIPPED' : 'EQUIP & DRIVE'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleBuyInspected}
                    disabled={credits < car.priceCr}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-display font-bold text-xs tracking-wide cursor-pointer whitespace-nowrap ${
                      credits >= car.priceCr
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        : 'bg-white/10 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    BUY · {car.priceCr.toLocaleString()} CR
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onStartTestDrive(inspectedCarId)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-display font-bold text-xs tracking-wide cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  TEST DRIVE
                </button>
              </div>
            </div>

            {/* Live Dyno Chart */}
            <div className="rounded-xl border border-white/10 bg-[#141925] p-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" />
                  Live Engine Dyno Curve
                </span>
                <span className="text-[11px] text-slate-400">
                  <span className="text-amber-400">HP</span> /{' '}
                  <span className="text-sky-400">Nm</span>
                </span>
              </div>
              <svg viewBox="0 0 320 110" className="w-full h-20 bg-[#0b0e16] rounded-lg">
                <line x1="16" y1="100" x2="304" y2="100" stroke="#334155" strokeWidth="1" />
                <line x1="16" y1="10" x2="16" y2="100" stroke="#334155" strokeWidth="1" />
                <path d={dynoPaths.tqPath} fill="none" stroke="#38bdf8" strokeWidth="2.2" />
                <path d={dynoPaths.hpPath} fill="none" stroke="#f59e0b" strokeWidth="2.4" />
              </svg>
            </div>
          </div>

          {/* Right Column: Tab Content */}
          <div className="lg:col-span-8">
            {tab === 'cars' && (
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'all', label: `All (${CAR_ROSTER.length})` },
                        { id: 'owned', label: `Owned (${ownedCarIds.length})` },
                        { id: 'exotic', label: 'Hyper & Super' },
                        { id: 'track', label: 'Track & JDM' },
                        { id: 'offroad', label: 'Rally & Muscle' },
                      ] as Array<{ id: RosterFilter; label: string }>
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setRosterFilter(f.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          rosterFilter === f.id
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'bg-white/8 text-slate-300 hover:bg-white/14'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Click any vehicle to inspect in 3D Showroom or Test Drive
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredRoster.map((c) => {
                    const selected = c.id === inspectedCarId;
                    const carOwned = ownedCarIds.includes(c.id);
                    const carEquipped = c.id === carId && testDriveCarId !== c.id;
                    const cSpecs = computeEffectiveSpecs(
                      c,
                      tunings[c.id] ?? createDefaultTuning(c),
                      upgrades[c.id] ?? createDefaultUpgrades()
                    );
                    const cColor = (customizations[c.id] ?? createDefaultCustomization(c)).primaryColor;

                    return (
                      <div
                        key={c.id}
                        className={`p-4 rounded-xl border transition-colors flex flex-col justify-between gap-3 ${
                          selected
                            ? 'border-amber-500 bg-amber-500/12'
                            : 'border-white/10 bg-[#141925] hover:bg-[#192030]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectRosterCard(c.id)}
                          className="text-left w-full cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div>
                              <span className="font-display font-bold text-base text-slate-100 block leading-snug">
                                {c.name}
                              </span>
                              <span className="text-xs text-slate-400">
                                {c.manufacturer} · {c.category} · {c.drivetrain}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-display font-bold ${CLASS_BADGE_STYLES[cSpecs.carClass]}`}
                              >
                                {cSpecs.carClass} {cSpecs.piRating}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-xs font-mono text-slate-300 tabular-nums mt-2">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/25 inline-block"
                                style={{ backgroundColor: cColor }}
                              />
                              <span>{cSpecs.peakHp} HP</span>
                              <span>{cSpecs.weightKg} kg</span>
                              <span>{cSpecs.topSpeedKmh} km/h</span>
                            </div>
                            {carOwned ? (
                              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" />
                                {carEquipped ? 'EQUIPPED' : 'OWNED'}
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-amber-300">
                                {c.priceCr.toLocaleString()} CR
                              </span>
                            )}
                          </div>
                        </button>

                        <div className="flex items-center gap-2 pt-2 border-t border-white/8">
                          {carOwned ? (
                            <button
                              type="button"
                              onClick={() => {
                                setInspectedCarId(c.id);
                                onSelectCar(c.id);
                              }}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                carEquipped
                                  ? 'bg-amber-500 text-slate-950 font-bold'
                                  : 'bg-white/10 hover:bg-white/18 text-slate-200'
                              }`}
                            >
                              {carEquipped ? 'Equipped' : 'Equip Car'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setInspectedCarId(c.id);
                                const ok = onBuyCar(c.id);
                                if (!ok) {
                                  setPurchaseNotice(
                                    `Need ${(c.priceCr - credits).toLocaleString()} more CR for ${c.name}.`
                                  );
                                  setTimeout(() => setPurchaseNotice(null), 2600);
                                }
                              }}
                              disabled={credits < c.priceCr}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                                credits >= c.priceCr
                                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                  : 'bg-white/8 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              Buy {c.priceCr.toLocaleString()} CR
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onStartTestDrive(c.id)}
                            aria-label={`Test Drive ${c.name}`}
                            className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/35 text-sky-200 text-xs font-semibold cursor-pointer"
                          >
                            Test Drive
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'custom' && (
              <div className="space-y-4">
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
                      Auto (Matched Chassis)
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
                      Procedural Chassis
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

                <div className="rounded-xl border border-white/10 bg-[#141925] p-4 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Body Paint Color
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {PAINT_SWATCHES.map((swatch) => (
                      <button
                        key={swatch.hex}
                        type="button"
                        title={swatch.name}
                        onClick={() =>
                          onUpdateCustomization(
                            { ...customization, primaryColor: swatch.hex },
                            inspectedCarId
                          )
                        }
                        aria-label={`Select paint ${swatch.name}`}
                        className={`w-8 h-8 rounded-lg border-2 cursor-pointer ${
                          customization.primaryColor === swatch.hex
                            ? 'border-white scale-110'
                            : 'border-white/20'
                        }`}
                        style={{ backgroundColor: swatch.hex }}
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
                          onClick={() =>
                            onUpdateCustomization({ ...customization, paintFinish: f }, inspectedCarId)
                          }
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
                          onClick={() =>
                            onUpdateCustomization({ ...customization, livery: l.id }, inspectedCarId)
                          }
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

                  <div className="rounded-xl border border-white/10 bg-[#141925] p-4 space-y-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                        Wheel Style &amp; Rim Finish
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
                            onClick={() =>
                              onUpdateCustomization(
                                { ...customization, rimStyle: r.id },
                                inspectedCarId
                              )
                            }
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

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div>
                        <div className="text-[11px] text-slate-400 mb-1">Rim Color</div>
                        <div className="flex gap-1.5">
                          {RIM_SWATCHES.map((rc) => (
                            <button
                              key={rc}
                              type="button"
                              aria-label={`Select rim color ${rc}`}
                              onClick={() =>
                                onUpdateCustomization(
                                  { ...customization, rimColor: rc },
                                  inspectedCarId
                                )
                              }
                              className={`w-5 h-5 rounded-full border cursor-pointer ${
                                customization.rimColor === rc ? 'border-white scale-115' : 'border-white/25'
                              }`}
                              style={{ backgroundColor: rc }}
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400 mb-1">Caliper</div>
                        <div className="flex gap-1.5">
                          {CALIPER_SWATCHES.map((cc) => (
                            <button
                              key={cc}
                              type="button"
                              aria-label={`Select caliper color ${cc}`}
                              onClick={() =>
                                onUpdateCustomization(
                                  { ...customization, caliperColor: cc },
                                  inspectedCarId
                                )
                              }
                              className={`w-5 h-5 rounded-full border cursor-pointer ${
                                customization.caliperColor === cc ? 'border-white scale-115' : 'border-white/25'
                              }`}
                              style={{ backgroundColor: cc }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#141925] p-4 space-y-3">
                    <div>
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
                            onClick={() =>
                              onUpdateCustomization(
                                { ...customization, aeroKit: a.id },
                                inspectedCarId
                              )
                            }
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

                    <label className="block text-xs">
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>Window Tint</span>
                        <span className="font-mono text-amber-400">
                          {Math.round(customization.windowTint * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={0.95}
                        step={0.05}
                        value={customization.windowTint}
                        onChange={(e) =>
                          onUpdateCustomization(
                            { ...customization, windowTint: parseFloat(e.target.value) },
                            inspectedCarId
                          )
                        }
                        className="w-full accent-amber-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {tab === 'upgrades' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#141925] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300">
                    Purchasing parts permanently unlocks stages for{' '}
                    <span className="text-slate-100 font-semibold">{car.name}</span> and updates
                    real vehicle physics mass, grip, boost &amp; aero.
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">
                    Balance: {credits.toLocaleString()} CR
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {UPGRADE_CATALOG.map((u) => {
                    const maxSlot = getCarUpgradeMaxStage(car, u.key);
                    const equippedLvl = Math.min(maxSlot, carUpgrades[u.key] ?? 0);
                    const unlockedLvl = Math.min(maxSlot, carPurchasedUpgrades[u.key] ?? 0);
                    const nextLockedStage = unlockedLvl < maxSlot ? unlockedLvl + 1 : null;
                    const nextCost = nextLockedStage ? getUpgradeStageCost(u.key, nextLockedStage) : 0;
                    const canAfford = credits >= nextCost;

                    return (
                      <div
                        key={u.key}
                        className="p-4 rounded-xl border border-white/10 bg-[#141925] flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-display font-bold text-sm text-slate-100 flex items-center gap-2">
                              <span>{u.label}</span>
                              {maxSlot === 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-slate-400 flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5" />
                                  N/A
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">{u.desc}</div>
                          </div>
                          <span className="font-mono text-xs text-amber-300 font-bold shrink-0">
                            {maxSlot === 0 ? 'LOCKED' : `Stg ${equippedLvl}/${maxSlot}`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex gap-1">
                            {Array.from({ length: maxSlot + 1 }).map((_, stIdx) => {
                              const unlocked = stIdx <= unlockedLvl;
                              const active = stIdx === equippedLvl;
                              return (
                                <button
                                  key={stIdx}
                                  type="button"
                                  disabled={!unlocked}
                                  onClick={() => onSetUpgradeStage(u.key, stIdx, inspectedCarId)}
                                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-colors ${
                                    active
                                      ? 'bg-amber-500 text-slate-950 cursor-pointer'
                                      : unlocked
                                        ? 'bg-white/14 text-slate-200 hover:bg-white/22 cursor-pointer'
                                        : 'bg-white/5 text-slate-600 cursor-not-allowed'
                                  }`}
                                >
                                  {stIdx === 0 ? 'Stk' : `S${stIdx}`}
                                </button>
                              );
                            })}
                          </div>

                          {maxSlot > 0 && (
                            <button
                              type="button"
                              disabled={nextLockedStage !== null && !canAfford}
                              onClick={() => {
                                const ok = onPurchaseUpgrade(u.key, inspectedCarId);
                                if (!ok && nextLockedStage) {
                                  setPurchaseNotice(
                                    `Need ${(nextCost - credits).toLocaleString()} more CR for ${u.label} S${nextLockedStage}.`
                                  );
                                  setTimeout(() => setPurchaseNotice(null), 2400);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap transition-colors ${
                                nextLockedStage === null
                                  ? 'bg-white/12 hover:bg-white/20 text-slate-100 cursor-pointer'
                                  : canAfford
                                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                                    : 'bg-white/8 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              {nextLockedStage !== null
                                ? `Buy S${nextLockedStage} · ${nextCost.toLocaleString()} CR`
                                : 'Maxed · Cycle'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                        onClick={() =>
                          onUpdateTuning(applyTuningPreset(car, tuning, preset), inspectedCarId)
                        }
                        className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/16 border border-white/10 text-xs font-semibold capitalize text-slate-200 cursor-pointer"
                      >
                        {preset.replace('_', ' ')} Preset
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateTuning(createDefaultTuning(car), inspectedCarId)}
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
                          onClick={() =>
                            onUpdateTuning({ ...tuning, engineStage: st }, inspectedCarId)
                          }
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
                          onClick={() =>
                            onUpdateTuning({ ...tuning, tireCompound: tc }, inspectedCarId)
                          }
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
                            onUpdateTuning(
                              {
                                ...tuning,
                                [s.key]: parseFloat(e.target.value),
                              },
                              inspectedCarId
                            )
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
