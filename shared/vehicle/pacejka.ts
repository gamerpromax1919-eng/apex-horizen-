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
  asphalt: { friction: 1.08, drag: 1.0, particle: 'smoke' },
  wet_asphalt: { friction: 0.78, drag: 1.1, particle: 'spray' },
  curb: { friction: 0.98, drag: 1.05, particle: 'smoke' },
  dirt: { friction: 0.78, drag: 1.22, particle: 'dust' },
  gravel: { friction: 0.74, drag: 1.28, particle: 'gravel' },
  sand: { friction: 0.66, drag: 1.36, particle: 'dust' },
  grass: { friction: 0.65, drag: 1.32, particle: 'dust' },
  puddle: { friction: 0.48, drag: 1.44, particle: 'spray' },
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
    gripScale: 1.24,
    assistScale: 1.0,
    steerAssist: 0.68,
    defaultSteeringAssist: 'full',
    defaultAbs: true,
    defaultTcs: true,
    defaultEsc: true,
  },
  sim_lite: {
    label: 'Sim-Lite',
    gripScale: 1.1,
    assistScale: 0.72,
    steerAssist: 0.38,
    defaultSteeringAssist: 'countersteer',
    defaultAbs: true,
    defaultTcs: true,
    defaultEsc: true,
  },
  sim: {
    label: 'Simulation',
    gripScale: 0.98,
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
    speedSteerCurve: 0.011,
  },
  countersteer: {
    label: 'Countersteer',
    description: 'Smooth speed-sensitive lock + active countersteer help to catch slides.',
    countersteerGain: 0.62,
    yawDampGain: 0.42,
    speedSteerCurve: 0.014,
  },
  stability: {
    label: 'Stability',
    description: 'Active yaw damping plus countersteer stabilization for effortless high-speed cornering.',
    countersteerGain: 0.76,
    yawDampGain: 0.7,
    speedSteerCurve: 0.016,
  },
  full: {
    label: 'Full Assist',
    description: 'Maximum corner-entry guidance, speed-sensitive lock & drift recovery.',
    countersteerGain: 0.9,
    yawDampGain: 0.92,
    speedSteerCurve: 0.018,
  },
};

export interface SteerAndStabilityInput {
  dt: number;
  rawSteer: number;
  handbrake: boolean;
  prevSteerAngle: number;
  speedMs: number;
  vForward: number;
  vLateral: number;
  yawRate: number;
  wheelbaseM: number;
  surfaceGrip: number;
  massKg: number;
  drivePreset: DrivePreset;
  steeringAssist: SteeringAssistMode;
  escEnabled: boolean;
}

export interface SteerAndStabilityOutput {
  steerAngle: number;
  bodySlipRad: number;
  yawStabilityTorqueNm: number;
  escActive: boolean;
}

/**
 * Computes progressive speed-sensitive steering, corrected countersteer assist
 * (+X left / +Z forward / +Y up right-handed frame), and grip-capped yaw stabilization.
 */
export function computeSteerAndStability(
  input: SteerAndStabilityInput
): SteerAndStabilityOutput {
  const { dt, rawSteer, handbrake, prevSteerAngle, speedMs, vForward, vLateral, yawRate } = input;
  const speedKmh = speedMs * 3.6;
  const preset = DRIVE_PRESET_PROFILE[input.drivePreset];
  const assistProfile = STEERING_ASSIST_PROFILES[input.steeringAssist];

  // Speed-sensitive lock: ~31 deg at crawl, ~10 deg at 85 km/h, ~5.5 deg at 170 km/h, ~3.6 deg at 260 km/h
  const speedTerm =
    Math.pow(Math.max(0, speedKmh) / 46, 1.15) * (0.65 + assistProfile.speedSteerCurve * 56);
  const maxSteer = 0.54 / (1 + speedTerm);

  // In +Z-fwd, +X-left frame: spinning LEFT (+yaw) puts velocity to RIGHT (-X) => vLateral < 0 => bodySlipRad < 0.
  // Countersteering out of a LEFT spin requires steering RIGHT (steer < 0), i.e., +bodySlipRad direction.
  const bodySlipRad =
    speedMs > 3.5 ? Math.atan2(vLateral, Math.max(2.0, Math.abs(vForward))) : 0;
  const slipDeadband = 0.055;
  const excessSlip =
    Math.abs(bodySlipRad) > slipDeadband
      ? Math.sign(bodySlipRad) * (Math.abs(bodySlipRad) - slipDeadband)
      : 0;
  const countersteerOffset =
    speedMs > 5 && assistProfile.countersteerGain > 0
      ? Math.max(-0.34, Math.min(0.34, excessSlip * assistProfile.countersteerGain))
      : 0;

  const hbScale = handbrake ? 1.18 : 1.0;
  const targetSteer = Math.max(
    -maxSteer * 1.18,
    Math.min(maxSteer * 1.18, rawSteer * maxSteer * hbScale + countersteerOffset)
  );

  // Smooth progressive turn-in (~8.5/s) so digital keys carve smoothly, fast return-to-center (~15/s)
  const isCenteringOrReversing =
    Math.abs(targetSteer) < Math.abs(prevSteerAngle) || targetSteer * prevSteerAngle < 0;
  const steerRate = isCenteringOrReversing ? 15.0 : 8.5;
  const steerAngle =
    prevSteerAngle + (targetSteer - prevSteerAngle) * (1 - Math.exp(-steerRate * dt));

  let yawStabilityTorqueNm = 0;
  let escActive = false;

  if (speedMs > 5.5) {
    // Ackermann yaw target capped strictly by physical lateral tire capacity (mu * g * 1.25 / v)
    const kinematicYawRate = (steerAngle * Math.min(22, speedMs)) / Math.max(2.2, input.wheelbaseM);
    const maxPhysicalYaw =
      (Math.max(0.45, input.surfaceGrip) * 9.81 * 1.25) / Math.max(5.5, speedMs);
    const desiredYawRate = Math.max(-maxPhysicalYaw, Math.min(maxPhysicalYaw, kinematicYawRate));
    const yawError = desiredYawRate - yawRate;

    const excessiveSlip = Math.abs(bodySlipRad) > 0.16;
    const excessiveYaw = Math.abs(yawRate) > maxPhysicalYaw * 1.15;

    if (input.escEnabled && (excessiveSlip || excessiveYaw) && !handbrake) {
      escActive = true;
      yawStabilityTorqueNm = yawError * input.massKg * 1.75;
    } else if (assistProfile.yawDampGain > 0 || preset.steerAssist > 0) {
      const assistWeight = Math.max(assistProfile.yawDampGain, preset.steerAssist);
      yawStabilityTorqueNm = yawError * input.massKg * 0.65 * assistWeight;
    }
  }

  return {
    steerAngle,
    bodySlipRad,
    yawStabilityTorqueNm,
    escActive,
  };
}

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
