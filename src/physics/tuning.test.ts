import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR_ROSTER, createDefaultTuning, createDefaultUpgrades } from '../config/cars';
import { applyTuningPreset, applyUpgradesToTuning, computeEffectiveSpecs } from './tuning';

test('Upgrades reduce curb weight, boost HP and elevate PI rating', () => {
  const car = CAR_ROSTER[1];
  const stockTune = createDefaultTuning(car);
  const stockUpgrades = createDefaultUpgrades();
  const stockSpecs = computeEffectiveSpecs(car, stockTune, stockUpgrades);

  const upgraded = {
    ...stockUpgrades,
    engine: 3,
    turbo: 3,
    tires: 3,
    weightReduction: 3,
    aero: 2,
  };
  const modSpecs = computeEffectiveSpecs(car, stockTune, upgraded);

  assert.ok(modSpecs.peakHp > stockSpecs.peakHp, 'Upgrades must raise HP');
  assert.ok(modSpecs.weightKg < stockSpecs.weightKg, 'Weight reduction must lower curb mass');
  assert.ok(modSpecs.piRating > stockSpecs.piRating, 'PI rating must increase');
  assert.ok(modSpecs.dynoCurve.length >= 15);
});

test('Tuning presets reconfigure tire compound, ride height and differential behavior', () => {
  const car = CAR_ROSTER[2];
  const base = createDefaultTuning(car);
  const drift = applyTuningPreset(car, base, 'drift');
  const rally = applyTuningPreset(car, base, 'baja_rally');

  assert.equal(drift.diffType, 'locked');
  assert.ok(drift.lsdLock >= 0.9);
  assert.equal(rally.tireCompound, 'offroad');
  assert.ok(rally.rideHeightMm > 30);
});

test('applyUpgradesToTuning clamps EV boostPsi to 0', () => {
  const evCar = CAR_ROSTER.find((c) => c.archetype === 'ev');
  assert.ok(evCar);
  const tune = createDefaultTuning(evCar);
  const res = applyUpgradesToTuning(evCar, tune, { ...createDefaultUpgrades(), turbo: 3 });
  assert.equal(res.effectiveTuning.boostPsi, 0);
});
