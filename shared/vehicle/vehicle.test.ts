import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARED_CARS_CONFIG,
  createDefaultTuningFromConfig,
  createDefaultUpgradesFromConfig,
  getSharedCarById,
} from '../cars.config';
import {
  computeAxleDifferentialTorques,
  computeDynamicWeightTransfer,
  computeSteerAndStability,
  createHeadlessVehicleState,
  solvePacejkaTire,
  stepHeadlessVehicle120Hz,
} from './index';

test('cars.config.ts provides unified metadata, GLB URLs, power curves, and PI ratings for all 10 vehicles', () => {
  assert.equal(SHARED_CARS_CONFIG.length, 10);
  for (const car of SHARED_CARS_CONFIG) {
    assert.ok(car.id.length > 0);
    assert.ok(car.glbUrl.startsWith('/models/'));
    assert.ok(car.fallbackGlbUrl.startsWith('https://'));
    assert.ok(car.scale > 0);
    assert.ok(car.wheelNodeNames.fl.length > 0 && car.wheelNodeNames.rr.length > 0);
    assert.equal(car.defaultGearRatios.length, 6);
    assert.ok(car.baseWeightKg >= 1200 && car.baseWeightKg <= 1650);
    assert.ok(car.basePi >= 580 && car.basePi <= 999);
    assert.ok(['B', 'A', 'S1', 'S2', 'X'].includes(car.baseClass));
  }
});

test('Headless 120 Hz physics accelerates smoothly and executes realistic gear upshifts', () => {
  const car = getSharedCarById('solstice-gtr');
  const tuning = createDefaultTuningFromConfig(car);
  const upgrades = createDefaultUpgradesFromConfig();
  const state = createHeadlessVehicleState(0, 0.45, 0, 0);

  for (let i = 0; i < 540; i++) {
    stepHeadlessVehicle120Hz(
      state,
      car,
      tuning,
      {
        throttle: 1,
        brake: 0,
        steer: 0,
        handbrake: false,
        nitrous: false,
        shiftUp: false,
        shiftDown: false,
      },
      { drivePreset: 'sim_lite', upgrades }
    );
  }

  const speedKmh = Math.hypot(state.vx, state.vz) * 3.6;
  assert.ok(speedKmh > 110, `Expected >110 km/h after 4.5s WOT, got ${speedKmh.toFixed(1)}`);
  assert.ok(state.gear >= 2, `Expected upshift to gear >= 2, got ${state.gear}`);
  assert.ok(state.z > 60, `Expected forward +Z travel > 60m, got ${state.z.toFixed(1)}`);
});

test('Dynamic weight transfer shifts normal load forward under braking and laterally when cornering', () => {
  const brakingTransfer = computeDynamicWeightTransfer({
    massKg: 1400,
    longAccelMs2: -9.81,
    latAccelMs2: 0,
    cgHeightM: 0.45,
    wheelbaseM: 2.7,
    trackWidthM: 1.65,
  });
  assert.ok(brakingTransfer.longG < -0.9);
  assert.ok(brakingTransfer.frontWeightPct > 60, `Expected front weight % > 60, got ${brakingTransfer.frontWeightPct}`);
  assert.ok(brakingTransfer.wheelWeightDeltasN[0] > 0 && brakingTransfer.wheelWeightDeltasN[2] < 0);

  const cornerTransfer = computeDynamicWeightTransfer({
    massKg: 1400,
    longAccelMs2: 0,
    latAccelMs2: 9.81,
    cgHeightM: 0.45,
    wheelbaseM: 2.7,
    trackWidthM: 1.65,
  });
  assert.ok(cornerTransfer.latG > 0.9);
  assert.ok(cornerTransfer.wheelWeightDeltasN[0] > 0);
  assert.ok(cornerTransfer.wheelWeightDeltasN[1] < 0);
});

test('Differential locked vs open responds to wheel speed delta and ABS prevents full wheel lockup', () => {
  const open = computeAxleDifferentialTorques({
    drivetrain: 'RWD',
    diffType: 'open',
    diffBiasRear: 1,
    lsdLock: 0.5,
    totalWheelTorqueNm: 800,
    wheelOmegas: [40, 40, 65, 35],
  });
  const locked = computeAxleDifferentialTorques({
    drivetrain: 'RWD',
    diffType: 'locked',
    diffBiasRear: 1,
    lsdLock: 0.95,
    totalWheelTorqueNm: 800,
    wheelOmegas: [40, 40, 65, 35],
  });
  assert.ok(locked[3] > open[3], 'Locked diff should transfer more torque to slower/grippier wheel');

  // Verify ABS prevents instant 0 omega lockup during heavy braking from 130 km/h
  const car = getSharedCarById('apex-911-rs');
  const tuning = createDefaultTuningFromConfig(car);
  const absOn = createHeadlessVehicleState(0, 0.45, 0, 0);
  const absOff = createHeadlessVehicleState(0, 0.45, 0, 0);
  absOn.vz = 36;
  absOff.vz = 36;
  absOn.wheelOmegas = [36 / 0.34, 36 / 0.34, 36 / 0.34, 36 / 0.34];
  absOff.wheelOmegas = [...absOn.wheelOmegas];

  for (let i = 0; i < 45; i++) {
    stepHeadlessVehicle120Hz(
      absOn,
      car,
      tuning,
      { throttle: 0, brake: 1, steer: 0, handbrake: false, nitrous: false, shiftUp: false, shiftDown: false },
      { drivePreset: 'sim', absEnabled: true }
    );
    stepHeadlessVehicle120Hz(
      absOff,
      car,
      tuning,
      { throttle: 0, brake: 1, steer: 0, handbrake: false, nitrous: false, shiftUp: false, shiftDown: false },
      { drivePreset: 'sim', absEnabled: false }
    );
  }
  const minSlipAbsOn = Math.min(...absOn.wheels.map((w) => w.slipRatio));
  const minSlipAbsOff = Math.min(...absOff.wheels.map((w) => w.slipRatio));
  assert.ok(
    minSlipAbsOn > minSlipAbsOff,
    `ABS on (${minSlipAbsOn.toFixed(2)}) should preserve higher wheel speed than ABS off (${minSlipAbsOff.toFixed(2)})`
  );
});

test('Shared Pacejka combined slip friction ellipse trades off lateral grip under heavy longitudinal slip', () => {
  const pureLat = solvePacejkaTire({
    normalLoadN: 3600,
    slipRatio: 0,
    slipAngleRad: 0.15,
    surfaceFriction: 1.0,
    compound: 'semislick',
    tireTempC: 82,
    tireWear: 1,
    useThermalWear: true,
    camberRad: -0.03,
    drivePreset: 'sim_lite',
  });
  const combined = solvePacejkaTire({
    normalLoadN: 3600,
    slipRatio: 0.45,
    slipAngleRad: 0.15,
    surfaceFriction: 1.0,
    compound: 'semislick',
    tireTempC: 82,
    tireWear: 1,
    useThermalWear: true,
    camberRad: -0.03,
    drivePreset: 'sim_lite',
  });
  assert.ok(Math.abs(combined.fy) < Math.abs(pureLat.fy));
});

test('Countersteer assist steers opposite to oversteer spin and ESC opposes excessive yaw', () => {
  // Left spin (vLateral < 0 in +X-left frame) must steer RIGHT (< 0) to catch slide
  let prev = 0;
  let leftSpin = computeSteerAndStability({
    dt: 1 / 120,
    rawSteer: 0,
    handbrake: false,
    prevSteerAngle: prev,
    speedMs: 28,
    vForward: 26,
    vLateral: -10,
    yawRate: 0.9,
    wheelbaseM: 2.7,
    surfaceGrip: 1.05,
    massKg: 1400,
    drivePreset: 'sim_lite',
    steeringAssist: 'countersteer',
    escEnabled: true,
  });
  for (let i = 0; i < 12; i++) {
    prev = leftSpin.steerAngle;
    leftSpin = computeSteerAndStability({
      dt: 1 / 120,
      rawSteer: 0,
      handbrake: false,
      prevSteerAngle: prev,
      speedMs: 28,
      vForward: 26,
      vLateral: -10,
      yawRate: 0.9,
      wheelbaseM: 2.7,
      surfaceGrip: 1.05,
      massKg: 1400,
      drivePreset: 'sim_lite',
      steeringAssist: 'countersteer',
      escEnabled: true,
    });
  }
  assert.ok(leftSpin.steerAngle < -0.05, `Expected right countersteer (< -0.05), got ${leftSpin.steerAngle}`);
  assert.equal(leftSpin.escActive, true);
  assert.ok(leftSpin.yawStabilityTorqueNm < 0, 'ESC should apply negative yaw torque to arrest +yaw spin');

  // Right spin (vLateral > 0) must steer LEFT (> 0)
  prev = 0;
  let rightSpin = computeSteerAndStability({
    dt: 1 / 120,
    rawSteer: 0,
    handbrake: false,
    prevSteerAngle: prev,
    speedMs: 28,
    vForward: 26,
    vLateral: 10,
    yawRate: -0.9,
    wheelbaseM: 2.7,
    surfaceGrip: 1.05,
    massKg: 1400,
    drivePreset: 'sim_lite',
    steeringAssist: 'countersteer',
    escEnabled: true,
  });
  for (let i = 0; i < 12; i++) {
    prev = rightSpin.steerAngle;
    rightSpin = computeSteerAndStability({
      dt: 1 / 120,
      rawSteer: 0,
      handbrake: false,
      prevSteerAngle: prev,
      speedMs: 28,
      vForward: 26,
      vLateral: 10,
      yawRate: -0.9,
      wheelbaseM: 2.7,
      surfaceGrip: 1.05,
      massKg: 1400,
      drivePreset: 'sim_lite',
      steeringAssist: 'countersteer',
      escEnabled: true,
    });
  }
  assert.ok(rightSpin.steerAngle > 0.05, `Expected left countersteer (> 0.05), got ${rightSpin.steerAngle}`);
  assert.ok(rightSpin.yawStabilityTorqueNm > 0);
});
