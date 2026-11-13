import type { DrivePreset, SteeringAssistMode, SurfaceType, TireCompound } from './types';

export interface PacejkaParams {
  B: number; // Stiffness factor
  C: number; // Shape factor
  E: number; // Curvature factor
}

export const LONGITUDINAL_PACEJKA: Record<TireCompound, PacejkaParams> = {
  street: { B: 10.5, C: 1.65, E: 0.95 },
  semislick: { B: 12.2, C: 1.72, E: 0.96 },
  slick: { B: 14.0, C: 1.78, E: 0.97 },
  offroad: { B: 8.2, C: 1.52, E: 0.85 },
};

export const LATERAL_PACEJKA: Record<TireCompound, PacejkaParams> = {
  street: { B: 8.6, C: 1.38, E: -0.22 },
  semislick: { B: 10.4, C: 1.45, E: -0.18 },
  slick: { B: 12.2, C: 1.52, E: -0.14 },
  offroad: { B: 6.8, C: 1.32, E: -0.35 },
};

export const TIRE_COMPOUND_STATS: Record<
  TireCompound,
  { label: string; dryGrip: number; wetGrip: number; dirtGrip: number; dragPenalty: number }
> = {
  street: { label: 'Sport Street', dryGrip: 1.0, wetGrip: 0.82, dirtGrip: 0.68, dragPenalty: 0.0 },
  semislick: { label: 'Semi-Slick', dryGrip: 1.14, wetGrip: 0.72, dirtGrip: 0.52, dragPenalty: 0.02 },
  slick: { label: 'Race Slick', dryGrip: 1.26, wetGrip: 0.48, dirtGrip: 0.36, dragPenalty: 0.04 },
  offroad: { label: 'Baja Offroad', dryGrip: 0.88, wetGrip: 0.86, dirtGrip: 1.18, dragPenalty: 0.06 },
};

export const SURFACE_FRICTION_BASE: Record<
  SurfaceType,
  { friction: number; drag: number; particle: 'smoke' | 'spray' | 'dust' | 'gravel' }
> = {
  asphalt: { friction: 1.05, drag: 1.0, particle: 'smoke' },
  wet_asphalt: { friction: 0.74, drag: 1.12, particle: 'spray' },
  curb: { friction: 0.96, drag: 1.06, particle: 'smoke' },
  dirt: { friction: 0.72, drag: 1.28, particle: 'dust' },
  gravel: { friction: 0.68, drag: 1.35, particle: 'gravel' },
  sand: { friction: 0.61, drag: 1.44, particle: 'dust' },
  grass: { friction: 0.56, drag: 1.54, particle: 'dust' },
  puddle: { friction: 0.42, drag: 1.52, particle: 'spray' },
};

export const DRIVE_PRESET_PROFILE: Record<
  DrivePreset,
  {
    label: string;
    gripScale: number;
    assistScale: number;
    steerAssist: number;
    defaultSteeringAssist: SteeringAssistMode;
    defaultAbs: boolean;
    defaultTcs: boolean;
    defaultEsc: boolean;
  }
> = {
  arcade: {
    label: 'Arcade',
    gripScale: 1.18,
    assistScale: 1.0,
    steerAssist: 0.45,
    defaultSteeringAssist: 'full',
    defaultAbs: true,
    defaultTcs: true,
    defaultEsc: true,
  },
  sim_lite: {
    label: 'Sim-Lite',
    gripScale: 1.02,
    assistScale: 0.65,
    steerAssist: 0.18,
    defaultSteeringAssist: 'countersteer',
    defaultAbs: true,
    defaultTcs: true,
    defaultEsc: false,
  },
  sim: {
    label: 'Simulation',
    gripScale: 0.94,
    assistScale: 0.25,
    steerAssist: 0.0,
    defaultSteeringAssist: 'off',
    defaultAbs: false,
    defaultTcs: false,
    defaultEsc: false,
  },
};

export const STEERING_ASSIST_PROFILES: Record<
  SteeringAssistMode,
  {
    label: string;
    description: string;
    countersteerGain: number;
    yawDampGain: number;
    speedSteerCurve: number;
  }
> = {
  off: {
    label: 'Off (Direct)',
    description: 'Raw steering input with zero countersteer or yaw correction.',
    countersteerGain: 0,
    yawDampGain: 0,
    speedSteerCurve: 0.007,
  },
  countersteer: {
    label: 'Countersteer',
    description: 'Blends subtle countersteer help during oversteer drifts while preserving angle.',
    countersteerGain: 0.48,
    yawDampGain: 0.2,
    speedSteerCurve: 0.0085,
  },
  stability: {
    label: 'Stability',
    description: 'Active yaw damping plus countersteer stabilization for high-speed cornering.',
    countersteerGain: 0.65,
    yawDampGain: 0.55,
    speedSteerCurve: 0.0095,
  },
  full: {
    label: 'Full Assist',
    description: 'Maximum corner-entry guidance, speed-sensitive lock & drift recovery.',
    countersteerGain: 0.85,
    yawDampGain: 0.85,
    speedSteerCurve: 0.011,
  },
};

export function magicFormula(x: number, B: number, C: number, D: number, E: number): number {
  const bx = B * x;
  const inner = bx - E * (bx - Math.atan(bx));
  return D * Math.sin(C * Math.atan(inner));
}

export interface TireSolveInput {
  normalLoadN: number;
  slipRatio: number; // dimensionless (-1..1+)
  slipAngleRad: number; // radians
  surfaceFriction: number; // ~0.3..1.35
  compound: TireCompound;
  tireTempC: number;
  tireWear: number; // 0..1 (1 = fresh)
  useThermalWear: boolean;
  camberRad: number;
  drivePreset: DrivePreset;
  isRearHandbrake?: boolean;
  carTireGripMultiplier?: number;
}

export interface TireSolveOutput {
  fx: number; // Longitudinal force (N)
  fy: number; // Lateral force (N)
  peakGripN: number;
  combinedUtilization: number; // 0..1+
}

export function solvePacejkaTire(input: TireSolveInput): TireSolveOutput {
  const fz = Math.max(0, input.normalLoadN);
  if (fz <= 1) {
    return { fx: 0, fy: 0, peakGripN: 0, combinedUtilization: 0 };
  }

  // Load sensitivity: tire coefficient decreases slightly as vertical load increases above 3500 N
  const refLoad = 3500;
  const loadRatio = fz / refLoad;
  const loadSensitivity = Math.max(0.72, Math.min(1.16, 1.08 - 0.14 * Math.max(0, loadRatio - 1)));

  // Optimal tire temperature window ~75-95C
  let thermalFactor = 1.0;
  let wearFactor = 1.0;
  if (input.useThermalWear) {
    const tempDelta = Math.abs(input.tireTempC - 82);
    thermalFactor = Math.max(0.82, 1.03 - tempDelta * 0.0025);
    wearFactor = 0.78 + 0.22 * Math.max(0, Math.min(1, input.tireWear));
  }

  const preset = DRIVE_PRESET_PROFILE[input.drivePreset];
  const carGripScale = input.carTireGripMultiplier ?? 1.0;
  const mu =
    input.surfaceFriction *
    loadSensitivity *
    thermalFactor *
    wearFactor *
    preset.gripScale *
    carGripScale *
    (input.isRearHandbrake ? 0.34 : 1.0);

  const Dlong = fz * mu * 1.04;
  // Negative camber adds lateral bite up to ~4 deg
  const camberThrustFactor = 1.0 + Math.min(0.11, Math.abs(input.camberRad) * 1.4);
  const Dlat = fz * mu * camberThrustFactor;

  const pLong = LONGITUDINAL_PACEJKA[input.compound];
  const pLat = LATERAL_PACEJKA[input.compound];

  const clampedRatio = Math.max(-1.5, Math.min(1.5, input.slipRatio));
  const clampedAngle = Math.max(-1.2, Math.min(1.2, input.slipAngleRad));

  let fx = magicFormula(clampedRatio, pLong.B, pLong.C, Dlong, pLong.E);
  let fy = -magicFormula(clampedAngle, pLat.B, pLat.C, Dlat, pLat.E);

  // Combined slip via Friction Ellipse: (Fx/Dlong)^2 + (Fy/Dlat)^2 <= 1
  const nx = Dlong > 1 ? fx / Dlong : 0;
  const ny = Dlat > 1 ? fy / Dlat : 0;
  const util = Math.hypot(nx, ny);
  if (util > 1.0) {
    const inv = 1.0 / util;
    fx *= inv;
    fy *= inv;
  }

  return {
    fx,
    fy,
    peakGripN: Dlat,
    combinedUtilization: Math.min(1.5, util),
  };
}

/**
 * Pure surface grip calculation usable on both client & headless server.
 */
export function computeGenericSurfaceGrip(
  surface: SurfaceType,
  tireCompound: TireCompound,
  roadGripMult = 1.0,
  dirtGripMult = 1.0,
  hydroplaneRisk = 0,
  speedKmh = 0
): number {
  const tire = TIRE_COMPOUND_STATS[tireCompound];
  const baseSurf = SURFACE_FRICTION_BASE[surface];
  const isPaved = surface === 'asphalt' || surface === 'wet_asphalt' || surface === 'curb';
  const isWet = surface === 'wet_asphalt' || surface === 'puddle' || roadGripMult < 0.85;

  let baseTireGrip: number;
  if (surface === 'puddle') {
    baseTireGrip = tire.wetGrip * 0.6;
  } else if (isPaved) {
    baseTireGrip = isWet ? tire.wetGrip : tire.dryGrip;
  } else if (surface === 'dirt' || surface === 'gravel' || surface === 'sand') {
    baseTireGrip = tire.dirtGrip;
  } else {
    baseTireGrip = tire.dirtGrip * 0.8;
  }

  const weatherMod = isPaved ? roadGripMult : dirtGripMult;
  const slickPenalty = tireCompound === 'slick' ? 1.45 : tireCompound === 'semislick' ? 1.15 : 0.72;
  const speedRatio = Math.max(0, (speedKmh - 85) / 120);
  const hydro =
    (surface === 'puddle' ? 1.0 : isPaved ? hydroplaneRisk : 0) * speedRatio * slickPenalty;

  return Math.max(
    0.22,
    baseTireGrip * baseSurf.friction * weatherMod * (1 - Math.min(0.45, hydro * 0.55))
  );
}
