import { computeAxleDifferentialTorques, computeTorqueAtRpm, getGearRatioForGear, STAGE_MULTIPLIERS, stepGearboxAndClutch } from './drivetrain';
import { computeGenericSurfaceGrip, computeSteerAndStability, solvePacejkaTire } from './pacejka';
import { applyAntiRollBars, computeDynamicWeightTransfer } from './suspension';
import type {
  ControlSample,
  DrivePreset,
  SharedCarConfig,
  SteeringAssistMode,
  SurfaceType,
  TuningSetup,
  UpgradeLevels,
  VehicleTelemetry,
  WheelTelemetry,
} from './types';

export const FIXED_DT = 1 / 120;

export interface HeadlessGroundSample {
  heightY: number;
  surface: SurfaceType;
  roadGripMult?: number;
  dirtGripMult?: number;
  hydroplaneRisk?: number;
}

export type HeadlessGroundQuery = (x: number, z: number) => HeadlessGroundSample;

export interface HeadlessVehicleState {
  x: number;
  y: number;
  z: number;
  vx: number; // world X velocity (m/s)
  vy: number;
  vz: number; // world Z velocity (m/s)
  yaw: number; // radians (0 = +Z)
  yawRate: number; // rad/s
  steerAngle: number;
  rpm: number;
  gear: number;
  shifting: boolean;
  shiftTimer: number;
  pendingGear: number | null;
  clutchEngagement: number;
  boostPsi: number;
  nitrousCharge: number;
  nitrousHeat: number;
  nitrousOverheated: boolean;
  nitrousActive: boolean;
  wheelOmegas: [number, number, number, number];
  wheelTemps: [number, number, number, number];
  wheelWear: [number, number, number, number];
  brakeTemps: [number, number, number, number];
  prevLongVel: number;
  prevLatVel: number;
  longG: number;
  latG: number;
  frontWeightPct: number;
  absActive: boolean;
  tcsActive: boolean;
  escActive: boolean;
  wheelSpin: number;
  simTimeSec: number;
  wheels: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry];
}

function makeDefaultWheel(name: 'FL' | 'FR' | 'RL' | 'RR'): WheelTelemetry {
  return {
    name,
    grounded: true,
    compression: 0.35,
    suspensionOffsetM: 0,
    normalLoadN: 3400,
    slipRatio: 0,
    slipAngleRad: 0,
    longForceN: 0,
    latForceN: 0,
    surface: 'asphalt',
    gripCoeff: 1.0,
    tireTempC: 72,
    tireWear: 1.0,
    brakeTempC: 85,
    wheelAngularVel: 0,
    steerAngleRad: 0,
  };
}

export function createHeadlessVehicleState(
  x = 0,
  y = 0.45,
  z = 0,
  yaw = 0
): HeadlessVehicleState {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    yawRate: 0,
    steerAngle: 0,
    rpm: 950,
    gear: 1,
    shifting: false,
    shiftTimer: 0,
    pendingGear: null,
    clutchEngagement: 1,
    boostPsi: 0,
    nitrousCharge: 1.0,
    nitrousHeat: 0,
    nitrousOverheated: false,
    nitrousActive: false,
    wheelOmegas: [0, 0, 0, 0],
    wheelTemps: [72, 72, 72, 72],
    wheelWear: [1, 1, 1, 1],
    brakeTemps: [85, 85, 85, 85],
    prevLongVel: 0,
    prevLatVel: 0,
    longG: 0,
    latG: 0,
    frontWeightPct: 51,
    absActive: false,
    tcsActive: false,
    escActive: false,
    wheelSpin: 0,
    simTimeSec: 0,
    wheels: [
      makeDefaultWheel('FL'),
      makeDefaultWheel('FR'),
      makeDefaultWheel('RL'),
      makeDefaultWheel('RR'),
    ],
  };
}

export interface HeadlessStepOptions {
  drivePreset?: DrivePreset;
  steeringAssist?: SteeringAssistMode;
  manualTransmission?: boolean;
  absEnabled?: boolean;
  tcsEnabled?: boolean;
  escEnabled?: boolean;
  useThermalWear?: boolean;
  upgrades?: UpgradeLevels;
  groundQuery?: HeadlessGroundQuery;
}

const DEFAULT_GROUND_QUERY: HeadlessGroundQuery = () => ({
  heightY: 0,
  surface: 'asphalt',
  roadGripMult: 1.0,
  dirtGripMult: 1.0,
  hydroplaneRisk: 0,
});

/**
 * Pure 120 Hz headless 4-wheel Pacejka + weight-transfer vehicle dynamics step.
 * Runs identically in Node.js (server/bots/tests) and browser without DOM/WebGL/Rapier WASM.
 */
export function stepHeadlessVehicle120Hz(
  state: HeadlessVehicleState,
  car: SharedCarConfig,
  tuning: TuningSetup,
  input: ControlSample,
  opts: HeadlessStepOptions = {}
): HeadlessVehicleState {
  const dt = FIXED_DT;
  state.simTimeSec += dt;

  const drivePreset = opts.drivePreset ?? 'sim_lite';
  const steeringAssist =
    opts.steeringAssist ?? (drivePreset === 'arcade' ? 'full' : drivePreset === 'sim' ? 'off' : 'countersteer');
  const absEnabled = opts.absEnabled ?? drivePreset !== 'sim';
  const tcsEnabled = opts.tcsEnabled ?? drivePreset !== 'sim';
  const escEnabled = opts.escEnabled ?? drivePreset !== 'sim';
  const useThermalWear = opts.useThermalWear ?? true;
  const groundQuery = opts.groundQuery ?? DEFAULT_GROUND_QUERY;

  const stage = STAGE_MULTIPLIERS[tuning.engineStage];
  const upgradeWeightDelta = (opts.upgrades?.weightReduction ?? 0) * 48;
  const massKg = Math.max(920, car.baseWeightKg - upgradeWeightDelta + stage.weightDelta);

  const sinY = Math.sin(state.yaw);
  const cosY = Math.cos(state.yaw);
  // +Z local forward in world frame: (sinY, cosY); +X local left: (cosY, -sinY)
  const fwdX = sinY;
  const fwdZ = cosY;
  const rightX = cosY;
  const rightZ = -sinY;

  const vForward = state.vx * fwdX + state.vz * fwdZ;
  const vLateral = state.vx * rightX + state.vz * rightZ;
  const speedMs = Math.hypot(state.vx, state.vz);
  const speedKmh = speedMs * 3.6;

  // 1. Speed-sensitive steering + corrected countersteer + grip-capped yaw stabilization
  const centerGroundPre = groundQuery(state.x, state.z);
  const centerGripPre = computeGenericSurfaceGrip(
    centerGroundPre.surface,
    tuning.tireCompound,
    centerGroundPre.roadGripMult ?? 1,
    centerGroundPre.dirtGripMult ?? 1,
    centerGroundPre.hydroplaneRisk ?? 0,
    speedKmh
  );
  const steerStab = computeSteerAndStability({
    dt,
    rawSteer: input.steer,
    handbrake: input.handbrake,
    prevSteerAngle: state.steerAngle,
    speedMs,
    vForward,
    vLateral,
    yawRate: state.yawRate,
    wheelbaseM: car.wheelbaseM,
    surfaceGrip: centerGripPre,
    massKg,
    drivePreset,
    steeringAssist,
    escEnabled,
  });
  state.steerAngle = steerStab.steerAngle;

  const wheelBase = car.wheelbaseM;
  const halfTrack = car.trackWidthM * 0.5;
  let steerFL = state.steerAngle;
  let steerFR = state.steerAngle;
  if (Math.abs(state.steerAngle) > 0.005) {
    const turnRadius = wheelBase / Math.tan(Math.abs(state.steerAngle));
    const inner = Math.atan(wheelBase / Math.max(0.8, turnRadius - halfTrack));
    const outer = Math.atan(wheelBase / (turnRadius + halfTrack));
    if (state.steerAngle > 0) {
      steerFL = inner;
      steerFR = outer;
    } else {
      steerFL = -outer;
      steerFR = -inner;
    }
  }

  // 2. Gearbox, Shift Time & Clutch
  const drivenAvgOmega =
    car.drivetrain === 'FWD'
      ? (state.wheelOmegas[0] + state.wheelOmegas[1]) * 0.5
      : car.drivetrain === 'RWD'
        ? (state.wheelOmegas[2] + state.wheelOmegas[3]) * 0.5
        : (state.wheelOmegas[0] + state.wheelOmegas[1] + state.wheelOmegas[2] + state.wheelOmegas[3]) *
          0.25;

  const gearNext = stepGearboxAndClutch(
    {
      gear: state.gear,
      rpm: state.rpm,
      shiftTimer: state.shiftTimer,
      pendingGear: state.pendingGear,
      clutchEngagement: state.clutchEngagement,
      shifting: state.shifting,
    },
    {
      dt,
      manualTransmission: Boolean(opts.manualTransmission),
      throttle: input.throttle,
      brake: input.brake,
      shiftUp: input.shiftUp,
      shiftDown: input.shiftDown,
      vForwardMs: vForward,
      drivenAvgOmega,
      tuning,
      idleRpm: car.powerCurve.idleRpm,
    }
  );
  state.gear = gearNext.gear;
  state.rpm = gearNext.rpm;
  state.shiftTimer = gearNext.shiftTimer;
  state.pendingGear = gearNext.pendingGear;
  state.clutchEngagement = gearNext.clutchEngagement;
  state.shifting = gearNext.shifting;

  // 3. Engine Torque, Boost & NOS
  const redline = Math.max(5500, Math.min(10500, tuning.revLimitRpm));
  const targetBoost =
    car.archetype === 'ev'
      ? 0
      : input.throttle > 0.12 && !state.shifting
        ? tuning.boostPsi * Math.min(1, state.rpm / (redline * 0.45)) * input.throttle
        : -4.2;
  state.boostPsi += (targetBoost - state.boostPsi) * (1 - Math.exp(-7 * dt));

  if (state.nitrousOverheated && state.nitrousHeat < 0.32) {
    state.nitrousOverheated = false;
  }
  const canNos =
    input.nitrous &&
    !state.nitrousOverheated &&
    state.nitrousCharge > 0.02 &&
    input.throttle > 0.1 &&
    state.gear >= 1 &&
    !state.shifting;
  state.nitrousActive = canNos;
  if (canNos) {
    state.nitrousCharge = Math.max(0, state.nitrousCharge - dt * 0.22);
    state.nitrousHeat = Math.min(1, state.nitrousHeat + dt * 0.34);
    if (state.nitrousHeat >= 0.99) state.nitrousOverheated = true;
  } else {
    state.nitrousHeat = Math.max(0, state.nitrousHeat - dt * 0.18);
    state.nitrousCharge = Math.min(1, state.nitrousCharge + dt * 0.032);
  }

  const baseTorque = state.shifting ? 0 : computeTorqueAtRpm(car, tuning, state.rpm);
  const nosTorque = canNos ? (tuning.nitrousShotHp * 7127) / Math.max(3000, state.rpm) : 0;
  const rawEngineTorque =
    (baseTorque + nosTorque) * (state.rpm > redline * 0.985 ? 0.25 : 1.0) * state.clutchEngagement;

  const activeRatio = getGearRatioForGear(tuning, state.gear);
  const totalDriveRatio = activeRatio * tuning.finalDrive;

  // 4. Aerodynamics + Weight Transfer
  const aeroDragCoeff = car.dragAreaCdA * 0.16 + tuning.aeroDownforce * 0.18;
  const dragForce = 0.5 * 1.225 * aeroDragCoeff * 2.15 * vForward * Math.abs(vForward);
  const downforceN = tuning.aeroDownforce * car.downforceScale * 1.15 * speedMs * speedMs;

  const longAccel = (vForward - state.prevLongVel) / dt;
  const latAccel = (vLateral - state.prevLatVel) / dt + vForward * state.yawRate;
  state.prevLongVel = vForward;
  state.prevLatVel = vLateral;

  const cgHeightM = Math.max(0.32, 0.58 + car.comHeightOffsetM + tuning.rideHeightMm * 0.001);
  const wtTransfer = computeDynamicWeightTransfer({
    massKg,
    longAccelMs2: longAccel,
    latAccelMs2: -latAccel,
    cgHeightM,
    wheelbaseM: wheelBase,
    trackWidthM: car.trackWidthM,
    staticFrontRatio: 0.51,
    frontArbRollShare: 0.56,
  });
  state.longG = wtTransfer.longG;
  state.latG = wtTransfer.latG;
  state.frontWeightPct = wtTransfer.frontWeightPct;

  const baseStaticLoads: [number, number, number, number] = [
    massKg * 9.81 * 0.255 + downforceN * 0.24,
    massKg * 9.81 * 0.255 + downforceN * 0.24,
    massKg * 9.81 * 0.245 + downforceN * 0.26,
    massKg * 9.81 * 0.245 + downforceN * 0.26,
  ];
  const rawLoads: [number, number, number, number] = [
    Math.max(150, baseStaticLoads[0] + wtTransfer.wheelWeightDeltasN[0]),
    Math.max(150, baseStaticLoads[1] + wtTransfer.wheelWeightDeltasN[1]),
    Math.max(150, baseStaticLoads[2] + wtTransfer.wheelWeightDeltasN[2]),
    Math.max(150, baseStaticLoads[3] + wtTransfer.wheelWeightDeltasN[3]),
  ];
  const compressions: [number, number, number, number] = [
    Math.min(1, rawLoads[0] / (massKg * 4.8)),
    Math.min(1, rawLoads[1] / (massKg * 4.8)),
    Math.min(1, rawLoads[2] / (massKg * 4.8)),
    Math.min(1, rawLoads[3] / (massKg * 4.8)),
  ];
  const suspForces = applyAntiRollBars(rawLoads, compressions, massKg, tuning.antiRollBar);

  // 5. Differential Torque Split + Per-Wheel Pacejka Forces
  let throttleEff = input.throttle;
  if (state.gear === -1 && input.brake > 0.05) {
    throttleEff = -input.brake * 0.65;
  }
  const totalWheelTorque = rawEngineTorque * totalDriveRatio * 0.94 * throttleEff;
  const diffTorques = computeAxleDifferentialTorques({
    drivetrain: car.drivetrain,
    diffType: tuning.diffType,
    diffBiasRear: tuning.diffBiasRear,
    lsdLock: tuning.lsdLock,
    totalWheelTorqueNm: totalWheelTorque,
    wheelOmegas: state.wheelOmegas,
  });

  const wheelRadiusM = car.archetype === 'trophy' ? 0.43 : 0.34;
  const wheelLocalCoords: Array<[number, number]> = [
    [halfTrack, wheelBase * 0.5],
    [-halfTrack, wheelBase * 0.5],
    [halfTrack, -wheelBase * 0.5],
    [-halfTrack, -wheelBase * 0.5],
  ];
  const wheelSteers = [steerFL, steerFR, 0, 0];
  const absPulse = 0.55 + 0.45 * Math.sin(state.simTimeSec * Math.PI * 2 * 18);
  const camberRad = (tuning.camberDeg * Math.PI) / 180;

  let sumFwdForce = -dragForce;
  let sumLatForce = 0;
  let sumYawTorque = 0;
  let anyAbs = false;
  let anyTcs = false;

  for (let i = 0; i < 4; i++) {
    const wt = state.wheels[i];
    const [lx, lz] = wheelLocalCoords[i];
    const wx = state.x + rightX * lx + fwdX * lz;
    const wz = state.z + rightZ * lx + fwdZ * lz;
    const gSample = groundQuery(wx, wz);

    const gripCoeff = computeGenericSurfaceGrip(
      gSample.surface,
      tuning.tireCompound,
      gSample.roadGripMult ?? 1,
      gSample.dirtGripMult ?? 1,
      gSample.hydroplaneRisk ?? 0,
      speedKmh
    );

    const fNormal = suspForces[i];
    wt.grounded = true;
    wt.normalLoadN = fNormal;
    wt.compression = compressions[i];
    wt.surface = gSample.surface;
    wt.gripCoeff = gripCoeff;
    wt.steerAngleRad = wheelSteers[i];

    // Hub velocity in vehicle frame (u_x = right, u_z = forward)
    const hubVForward = vForward - state.yawRate * lx;
    const hubVRight = vLateral + state.yawRate * lz;

    const st = wheelSteers[i];
    const cs = Math.cos(st);
    const sn = Math.sin(st);
    const wVLong = hubVForward * cs + hubVRight * sn;
    const wVLat = hubVRight * cs - hubVForward * sn;

    let driveTorque = diffTorques[i];
    const isFront = i < 2;
    const isRear = !isFront;
    const brakingInput =
      state.gear === -1 ? input.throttle : input.brake > 0.01 && vForward > 0.4 ? input.brake : 0;
    const bias = isFront ? tuning.brakeBiasFront : 1 - tuning.brakeBiasFront;
    let brakeTorque = brakingInput * massKg * 3.1 * tuning.brakePressure * bias;
    if (isRear && input.handbrake) {
      brakeTorque += massKg * 4.5;
      driveTorque *= 0.15;
    }

    const currentSlip =
      (state.wheelOmegas[i] * wheelRadiusM - wVLong) / Math.max(2.0, Math.abs(wVLong));
    if (absEnabled && brakingInput > 0.15 && currentSlip < -0.18 && speedMs > 3.5) {
      brakeTorque *= absPulse * 0.48;
      anyAbs = true;
    }
    if (
      tcsEnabled &&
      driveTorque * Math.sign(state.wheelOmegas[i] || 1) > 0 &&
      speedMs > 2.0
    ) {
      let tcsCut = 1.0;
      if (Math.abs(currentSlip) > 0.20) {
        tcsCut = Math.max(0.38, 1 - (Math.abs(currentSlip) - 0.20) * 1.8);
      }
      if (Math.abs(steerStab.bodySlipRad) > 0.24 && input.throttle > 0.25) {
        tcsCut = Math.min(tcsCut, Math.max(0.55, 1 - (Math.abs(steerStab.bodySlipRad) - 0.24) * 1.4));
      }
      if (tcsCut < 0.99) {
        driveTorque *= tcsCut;
        anyTcs = true;
      }
    }

    const slipRatio =
      (state.wheelOmegas[i] * wheelRadiusM - wVLong) / Math.max(2.2, Math.abs(wVLong));
    const slipAngleRad = Math.atan2(wVLat, Math.max(2.2, Math.abs(wVLong)));

    const rearStabilityMult = isRear && !input.handbrake ? 1.07 : 1.0;
    const pacejka = solvePacejkaTire({
      normalLoadN: fNormal,
      slipRatio,
      slipAngleRad,
      surfaceFriction: gripCoeff,
      compound: tuning.tireCompound,
      tireTempC: state.wheelTemps[i],
      tireWear: state.wheelWear[i],
      useThermalWear,
      camberRad: i % 2 === 0 ? camberRad : -camberRad,
      drivePreset,
      isRearHandbrake: isRear && input.handbrake,
      carTireGripMultiplier: car.tireGripMultiplier * rearStabilityMult,
    });

    wt.slipRatio = slipRatio;
    wt.slipAngleRad = slipAngleRad;
    wt.longForceN = pacejka.fx;
    wt.latForceN = pacejka.fy;

    const surfRollingDrag = gSample.surface === 'asphalt' ? 1.0 : gSample.surface === 'wet_asphalt' ? 1.15 : 1.45;
    const rollDrag =
      -Math.sign(wVLong) * Math.min(Math.abs(wVLong) * 40, fNormal * 0.014 * surfRollingDrag) -
      wVLong * 1.2 * surfRollingDrag;
    const fxWheel = pacejka.fx + rollDrag;
    const fyWheel = pacejka.fy;

    // Rotate wheel forces back to chassis frame
    const fChassisFwd = fxWheel * cs - fyWheel * sn;
    const fChassisRight = fxWheel * sn + fyWheel * cs;

    sumFwdForce += fChassisFwd;
    sumLatForce += fChassisRight;
    // Torque around +Y (yaw): r x F => lz * fChassisRight - lx * fChassisFwd
    sumYawTorque += lz * fChassisRight - lx * fChassisFwd;

    const wheelInertia = 1.45;
    const brakeSign =
      Math.abs(state.wheelOmegas[i]) > 0.4 ? Math.sign(state.wheelOmegas[i]) : Math.sign(wVLong);
    const netWheelTorque = driveTorque - brakeTorque * brakeSign - pacejka.fx * wheelRadiusM;
    state.wheelOmegas[i] += (netWheelTorque / wheelInertia) * dt;
    if (speedMs < 0.8 && Math.abs(throttleEff) < 0.05) {
      state.wheelOmegas[i] *= Math.exp(-10 * dt);
    }
    if (Math.abs(throttleEff) < 0.02 && brakingInput < 0.05) {
      const freeRolling = wVLong / wheelRadiusM;
      state.wheelOmegas[i] += (freeRolling - state.wheelOmegas[i]) * (1 - Math.exp(-8 * dt));
    }

    const heatGen = (Math.abs(slipRatio) * 18 + Math.abs(slipAngleRad) * 14) * (speedMs / 25);
    state.wheelTemps[i] += (68 + heatGen - state.wheelTemps[i]) * dt * 0.25;
    state.wheelWear[i] = Math.max(0.45, state.wheelWear[i] - heatGen * 0.000018 * dt);
    wt.tireTempC = state.wheelTemps[i];
    wt.tireWear = state.wheelWear[i];
    wt.wheelAngularVel = state.wheelOmegas[i];
  }

  state.absActive = anyAbs;
  state.tcsActive = anyTcs;
  state.escActive = steerStab.escActive;

  // 6. ESC & Yaw Assist Stability Torque
  sumYawTorque += steerStab.yawStabilityTorqueNm;

  // Integrate rigid body velocity & yaw in world coordinates
  const worldForceX = fwdX * sumFwdForce + rightX * sumLatForce;
  const worldForceZ = fwdZ * sumFwdForce + rightZ * sumLatForce;
  const yawInertia = massKg * 2.55;

  state.vx += (worldForceX / massKg) * dt;
  state.vz += (worldForceZ / massKg) * dt;
  state.yawRate += (sumYawTorque / yawInertia) * dt;
  state.yawRate *= Math.exp(-0.25 * dt);
  state.yaw += state.yawRate * dt;
  state.x += state.vx * dt;
  state.z += state.vz * dt;
  const centerGround = groundQuery(state.x, state.z);
  state.y = centerGround.heightY + 0.45;
  state.wheelSpin += ((state.wheelOmegas[2] + state.wheelOmegas[3]) * 0.5) * dt;

  return state;
}

export function telemetryFromHeadlessState(state: HeadlessVehicleState): Partial<VehicleTelemetry> {
  return {
    x: state.x,
    y: state.y,
    z: state.z,
    vx: state.vx,
    vy: state.vy,
    vz: state.vz,
    yaw: state.yaw,
    speedKmh: Math.hypot(state.vx, state.vz) * 3.6,
    rpm: state.rpm,
    gear: state.gear,
    shifting: state.shifting,
    clutchEngagement: state.clutchEngagement,
    longG: state.longG,
    latG: state.latG,
    frontWeightPct: state.frontWeightPct,
    boostPsi: state.boostPsi,
    nitrousCharge: state.nitrousCharge,
    nitrousHeat: state.nitrousHeat,
    nitrousOverheated: state.nitrousOverheated,
    nitrousActive: state.nitrousActive,
    steerAngle: state.steerAngle,
    wheelSpin: state.wheelSpin,
    absActive: state.absActive,
    tcsActive: state.tcsActive,
    escActive: state.escActive,
    wheels: state.wheels,
  };
}
