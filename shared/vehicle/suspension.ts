import type { TuningSetup } from './types';

export interface WeightTransferInput {
  massKg: number;
  longAccelMs2: number; // + forward accel, - braking
  latAccelMs2: number; // + right turn, - left turn
  cgHeightM: number; // distance of CoG above ground plane (~0.42-0.62m)
  wheelbaseM: number;
  trackWidthM: number;
  staticFrontRatio?: number; // default ~0.51
  frontArbRollShare?: number; // 0.35..0.65
}

export interface WeightTransferOutput {
  longG: number;
  latG: number;
  longLoadTransferN: number; // + transfers load to rear, - transfers load to front
  latLoadTransferFrontN: number; // + transfers load to right wheel
  latLoadTransferRearN: number;
  frontWeightPct: number; // 0..100
  wheelWeightDeltasN: [number, number, number, number]; // FL, FR, RL, RR
}

const GRAVITY = 9.81;

/**
 * Computes longitudinal (pitch) & lateral (roll) dynamic weight transfer across all 4 contact patches.
 */
export function computeDynamicWeightTransfer(input: WeightTransferInput): WeightTransferOutput {
  const staticFrontRatio = input.staticFrontRatio ?? 0.51;
  const rollShareFront = input.frontArbRollShare ?? 0.52;
  const totalWeightN = input.massKg * GRAVITY;

  // Longitudinal load transfer: dW_long = m * a_x * h_cg / L
  const rawLongTransfer =
    (input.massKg * input.longAccelMs2 * input.cgHeightM) / Math.max(1.8, input.wheelbaseM);
  const longLoadTransferN = Math.max(-totalWeightN * 0.34, Math.min(totalWeightN * 0.34, rawLongTransfer));

  // Lateral load transfer: dW_lat = m * a_y * h_cg / T
  const rawLatTransfer =
    (input.massKg * input.latAccelMs2 * input.cgHeightM) / Math.max(1.2, input.trackWidthM);
  const clampedLatTransfer = Math.max(-totalWeightN * 0.38, Math.min(totalWeightN * 0.38, rawLatTransfer));

  const latLoadTransferFrontN = clampedLatTransfer * rollShareFront;
  const latLoadTransferRearN = clampedLatTransfer * (1 - rollShareFront);

  // When braking (longAccel < 0), longLoadTransferN < 0 => front axle gains -longLoadTransferN
  const frontDynamicLoad = totalWeightN * staticFrontRatio - longLoadTransferN;
  const frontWeightPct = Math.max(15, Math.min(85, (frontDynamicLoad / totalWeightN) * 100));

  // Coordinate frame: +X is left (FL index 0, RL index 2), -X is right (FR index 1, RR index 3)
  // Lateral accel > 0 (accelerating right, turning right) shifts weight onto left wheels (FL/RL)
  const flDelta = -longLoadTransferN * 0.5 + latLoadTransferFrontN * 0.5;
  const frDelta = -longLoadTransferN * 0.5 - latLoadTransferFrontN * 0.5;
  const rlDelta = longLoadTransferN * 0.5 + latLoadTransferRearN * 0.5;
  const rrDelta = longLoadTransferN * 0.5 - latLoadTransferRearN * 0.5;

  return {
    longG: input.longAccelMs2 / GRAVITY,
    latG: input.latAccelMs2 / GRAVITY,
    longLoadTransferN,
    latLoadTransferFrontN,
    latLoadTransferRearN,
    frontWeightPct,
    wheelWeightDeltasN: [flDelta, frDelta, rlDelta, rrDelta],
  };
}

export interface SuspensionWheelInput {
  distToGroundM: number;
  prevCompressionM: number;
  dt: number;
  massKg: number;
  isTrophyArchetype: boolean;
  tuning: TuningSetup;
  dynamicTransferDeltaN?: number;
}

export interface SuspensionWheelOutput {
  grounded: boolean;
  compressionM: number;
  compressionRatio: number; // 0..1
  suspensionOffsetM: number;
  normalForceN: number;
}

export function solveWheelSuspension(input: SuspensionWheelInput): SuspensionWheelOutput {
  const rideHeightM = input.tuning.rideHeightMm * 0.001;
  const wheelRadiusM = input.isTrophyArchetype ? 0.43 : 0.34;
  const restSuspLen = (input.isTrophyArchetype ? 0.44 : 0.34) + rideHeightM;
  const maxTravel = 0.26;

  const springK = input.massKg * 34 * input.tuning.springStiffness;
  const bumpDamp = input.massKg * 3.4 * input.tuning.damperBump;
  const reboundDamp = input.massKg * 4.2 * input.tuning.damperRebound;

  const targetReach = restSuspLen + wheelRadiusM;
  const compDist = targetReach - input.distToGroundM;

  if (compDist <= 0) {
    return {
      grounded: false,
      compressionM: 0,
      compressionRatio: 0,
      suspensionOffsetM: -maxTravel * 0.45,
      normalForceN: 0,
    };
  }

  const clampedComp = Math.min(maxTravel, compDist);
  const compVel = (clampedComp - input.prevCompressionM) / Math.max(0.0005, input.dt);
  const dampC = compVel >= 0 ? bumpDamp : reboundDamp;
  const bumpStop =
    clampedComp > maxTravel * 0.85 ? (clampedComp - maxTravel * 0.85) * springK * 2.5 : 0;

  const baseForce = Math.max(0, clampedComp * springK + compVel * dampC + bumpStop);
  const transferBlend = (input.dynamicTransferDeltaN ?? 0) * 0.28;
  const normalForceN = Math.max(0, baseForce + transferBlend);

  return {
    grounded: true,
    compressionM: clampedComp,
    compressionRatio: clampedComp / maxTravel,
    suspensionOffsetM: clampedComp - restSuspLen * 0.35,
    normalForceN,
  };
}

export function applyAntiRollBars(
  forces: [number, number, number, number],
  compressions: [number, number, number, number],
  massKg: number,
  antiRollBar: number
): [number, number, number, number] {
  const antiRollK = massKg * 12 * antiRollBar;
  const arbFront = (compressions[0] - compressions[1]) * antiRollK;
  const arbRear = (compressions[2] - compressions[3]) * antiRollK;

  return [
    Math.max(0, forces[0] + arbFront),
    Math.max(0, forces[1] - arbFront),
    Math.max(0, forces[2] + arbRear),
    Math.max(0, forces[3] - arbRear),
  ];
}
