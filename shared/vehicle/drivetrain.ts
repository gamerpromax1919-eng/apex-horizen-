import type { CarDefinition, DiffType, EngineStage, PowerCurveParams, TuningSetup } from './types';

export const STAGE_MULTIPLIERS: Record<EngineStage, { hp: number; weightDelta: number }> = {
  stock: { hp: 1.0, weightDelta: 0 },
  street: { hp: 1.12, weightDelta: -18 },
  sport: { hp: 1.26, weightDelta: -42 },
  race: { hp: 1.44, weightDelta: -75 },
  pro: { hp: 1.64, weightDelta: -110 },
};

const DEFAULT_POWER_CURVE: PowerCurveParams = {
  idleRpm: 950,
  peakTorqueRpmRatio: 0.62,
  curveWidth: 0.42,
  spoolRpmRatio: 0.34,
  highEndDropoff: 0.52,
};

export function computeTorqueAtRpm(
  car: CarDefinition & { powerCurve?: PowerCurveParams },
  tuning: TuningSetup,
  rpm: number
): number {
  const stage = STAGE_MULTIPLIERS[tuning.engineStage];
  const redline = Math.max(5500, Math.min(10500, tuning.revLimitRpm));
  const normRpm = Math.max(0, Math.min(1.05, rpm / redline));
  const curve = car.powerCurve ?? DEFAULT_POWER_CURVE;

  const boostFactor =
    car.archetype === 'ev'
      ? 1.0
      : 1.0 + Math.max(0, tuning.boostPsi - car.baseBoostPsi) * 0.022;

  const ecuFactor = 1.0 + tuning.ecuTimingDeg * 0.012;
  const peakCenter =
    car.archetype === 'ev'
      ? curve.peakTorqueRpmRatio
      : curve.peakTorqueRpmRatio + tuning.ecuTimingDeg * 0.012;

  let shape: number;
  if (car.archetype === 'ev') {
    shape =
      normRpm < 0.55
        ? 0.96 + 0.04 * (normRpm / 0.55)
        : 1.0 - (normRpm - 0.55) * curve.highEndDropoff;
  } else {
    const dist = (normRpm - peakCenter) / Math.max(0.2, curve.curveWidth);
    shape = Math.max(0.42, 1.0 - dist * dist * curve.highEndDropoff);
    if (tuning.boostPsi > 4 && normRpm < curve.spoolRpmRatio) {
      const spool = normRpm / Math.max(0.1, curve.spoolRpmRatio);
      shape *= 0.72 + 0.28 * spool;
    }
  }

  // Soft rev-limiter fuel cut above 97% redline
  if (normRpm > 0.97) {
    shape *= Math.max(0.15, 1 - (normRpm - 0.97) * 18);
  }

  const hpCalibration = Math.max(
    1.0,
    (car.baseHp * 7127) / Math.max(1, car.baseTorqueNm * redline * 0.78)
  );
  return Math.max(80, car.baseTorqueNm * hpCalibration * stage.hp * boostFactor * ecuFactor * shape);
}

export interface GearboxStepState {
  gear: number;
  rpm: number;
  shiftTimer: number;
  pendingGear: number | null;
  clutchEngagement: number;
  shifting: boolean;
}

export interface GearboxStepInput {
  dt: number;
  manualTransmission: boolean;
  throttle: number;
  brake: number;
  shiftUp: boolean;
  shiftDown: boolean;
  vForwardMs: number;
  drivenAvgOmega: number;
  tuning: TuningSetup;
  idleRpm?: number;
}

export function getGearRatioForGear(tuning: TuningSetup, gear: number): number {
  if (gear === -1) return 3.35;
  if (gear <= 0) return 0;
  return tuning.gearRatios[Math.max(0, Math.min(5, gear - 1))] ?? 1.0;
}

export function stepGearboxAndClutch(
  state: GearboxStepState,
  input: GearboxStepInput
): GearboxStepState {
  const { dt } = input;
  const redline = Math.max(5500, Math.min(10500, input.tuning.revLimitRpm));
  const idleRpm = input.idleRpm ?? 950;

  let gear = state.gear;
  let shiftTimer = state.shiftTimer;
  let pendingGear = state.pendingGear;
  let shifting = false;

  if (shiftTimer > 0) {
    shiftTimer = Math.max(0, shiftTimer - dt);
    shifting = true;
    if (shiftTimer === 0 && pendingGear !== null) {
      gear = pendingGear;
      pendingGear = null;
      shifting = false;
    }
  } else {
    if (input.manualTransmission) {
      if (input.shiftUp && gear < 6) {
        pendingGear = gear === -1 ? 1 : gear + 1;
        shiftTimer = 0.115;
        shifting = true;
      } else if (input.shiftDown && gear > -1) {
        pendingGear = gear === 1 ? -1 : gear - 1;
        shiftTimer = 0.115;
        shifting = true;
      }
    } else {
      if (input.brake > 0.25 && input.vForwardMs < 1.1 && input.throttle < 0.1 && gear !== -1) {
        gear = -1;
      } else if (gear <= 0 && (input.throttle > 0.1 || input.vForwardMs > 0.6)) {
        gear = 1;
      } else if (gear >= 1) {
        if (state.rpm > redline * 0.94 && gear < 6 && input.throttle > 0.25) {
          pendingGear = gear + 1;
          shiftTimer = 0.105;
          shifting = true;
        } else if (state.rpm < redline * 0.36 && gear > 1 && input.vForwardMs > 4) {
          pendingGear = gear - 1;
          shiftTimer = 0.095;
          shifting = true;
        }
      }
    }
  }

  const activeRatio = getGearRatioForGear(input.tuning, gear);
  const totalDriveRatio = activeRatio * input.tuning.finalDrive;
  const drivenWheelRpm = (Math.abs(input.drivenAvgOmega) * 60) / (Math.PI * 2);

  // Clutch engagement: disengages during shifts, progressive slip during low-speed launch
  let targetClutch = 1.0;
  if (shifting || gear === 0) {
    targetClutch = 0.05;
  } else if (Math.abs(input.vForwardMs) < 5.5 && gear === 1) {
    const launchSlip = Math.min(1, Math.abs(input.vForwardMs) / 4.5);
    targetClutch = input.throttle > 0.15 ? 0.42 + 0.58 * launchSlip : 0.35 + 0.65 * launchSlip;
  }
  const clutchEngagement =
    state.clutchEngagement + (targetClutch - state.clutchEngagement) * (1 - Math.exp(-22 * dt));

  const clutchSlipRevBoost = (1 - clutchEngagement) * input.throttle * 1850;
  const revMatchBlip = shifting && pendingGear !== null && pendingGear < gear ? 950 : 0;
  const freeRevBoost = input.throttle * (shifting ? 450 : 650) + clutchSlipRevBoost + revMatchBlip;
  const wheelCoupledRpm = drivenWheelRpm * totalDriveRatio;

  const targetRpm = Math.max(
    idleRpm,
    Math.min(redline * 1.02, wheelCoupledRpm * clutchEngagement + idleRpm * (1 - clutchEngagement) + freeRevBoost)
  );
  const rpm = state.rpm + (targetRpm - state.rpm) * (1 - Math.exp(-16 * dt));

  return {
    gear,
    rpm,
    shiftTimer,
    pendingGear,
    clutchEngagement,
    shifting,
  };
}

export interface DifferentialInput {
  drivetrain: 'RWD' | 'FWD' | 'AWD';
  diffType: DiffType;
  diffBiasRear: number; // 0..1 (for AWD)
  lsdLock: number; // 0..1
  totalWheelTorqueNm: number;
  wheelOmegas: [number, number, number, number]; // FL, FR, RL, RR
}

export function computeAxleDifferentialTorques(
  input: DifferentialInput
): [number, number, number, number] {
  const rearSplit =
    input.drivetrain === 'RWD' ? 1.0 : input.drivetrain === 'FWD' ? 0.0 : input.diffBiasRear;
  const frontSplit = 1.0 - rearSplit;

  const diffLockCoeff =
    input.diffType === 'locked' ? 0.96 : input.diffType === 'lsd' ? input.lsdLock : 0.04;

  // Bias torque proportional to left/right wheel angular speed difference on each driven axle
  const frontOmegaDiff = input.wheelOmegas[0] - input.wheelOmegas[1];
  const rearOmegaDiff = input.wheelOmegas[2] - input.wheelOmegas[3];

  const frontBiasTorque = frontSplit > 0.05 ? -frontOmegaDiff * diffLockCoeff * 90 : 0;
  const rearBiasTorque = rearSplit > 0.05 ? -rearOmegaDiff * diffLockCoeff * 95 : 0;

  return [
    input.totalWheelTorqueNm * frontSplit * 0.5 + frontBiasTorque,
    input.totalWheelTorqueNm * frontSplit * 0.5 - frontBiasTorque,
    input.totalWheelTorqueNm * rearSplit * 0.5 + rearBiasTorque,
    input.totalWheelTorqueNm * rearSplit * 0.5 - rearBiasTorque,
  ];
}
