import test from 'node:test';
import assert from 'node:assert/strict';
import { solvePacejkaTire } from './pacejka';

test('Pacejka produces longitudinal acceleration force with positive slip ratio', () => {
  const out = solvePacejkaTire({
    normalLoadN: 3600,
    slipRatio: 0.12,
    slipAngleRad: 0,
    surfaceFriction: 1.0,
    compound: 'semislick',
    tireTempC: 82,
    tireWear: 1,
    useThermalWear: true,
    camberRad: -0.03,
    drivePreset: 'sim_lite',
  });
  assert.ok(out.fx > 2500, `expected strong positive Fx, got ${out.fx}`);
  assert.ok(Math.abs(out.fy) < 1e-6);
});

test('Pacejka friction ellipse clamps combined longitudinal + lateral force', () => {
  const pureLat = solvePacejkaTire({
    normalLoadN: 3600,
    slipRatio: 0,
    slipAngleRad: 0.14,
    surfaceFriction: 1.0,
    compound: 'slick',
    tireTempC: 82,
    tireWear: 1,
    useThermalWear: true,
    camberRad: -0.04,
    drivePreset: 'sim',
  });
  const combined = solvePacejkaTire({
    normalLoadN: 3600,
    slipRatio: 0.35,
    slipAngleRad: 0.14,
    surfaceFriction: 1.0,
    compound: 'slick',
    tireTempC: 82,
    tireWear: 1,
    useThermalWear: true,
    camberRad: -0.04,
    drivePreset: 'sim',
  });
  assert.ok(
    Math.abs(combined.fy) < Math.abs(pureLat.fy),
    'combined slip must trade off lateral grip for longitudinal slip'
  );
  assert.ok(combined.combinedUtilization >= 1.0);
});

test('Handbrake unloads rear lateral grip and Arcade preset yields higher peak grip than Sim', () => {
  const base = {
    normalLoadN: 3400,
    slipRatio: 0,
    slipAngleRad: 0.16,
    surfaceFriction: 1.0,
    compound: 'street' as const,
    tireTempC: 80,
    tireWear: 1,
    useThermalWear: false,
    camberRad: -0.02,
  };
  const arcade = solvePacejkaTire({ ...base, drivePreset: 'arcade' });
  const sim = solvePacejkaTire({ ...base, drivePreset: 'sim' });
  const hb = solvePacejkaTire({ ...base, drivePreset: 'sim', isRearHandbrake: true });

  assert.ok(arcade.peakGripN > sim.peakGripN);
  assert.ok(hb.peakGripN < sim.peakGripN * 0.5);
});
