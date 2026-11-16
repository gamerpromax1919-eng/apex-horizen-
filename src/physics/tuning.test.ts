import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAR_ROSTER,
  STARTER_OWNED_CAR_IDS,
  createDefaultTuning,
  createDefaultUpgrades,
} from '../config/cars';
import {
  applyTuningPreset,
  applyUpgradesToTuning,
  computeEffectiveSpecs,
  computeShowroomStatBars,
  getCarUpgradeMaxStage,
  getUpgradeStageCost,
} from './tuning';

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

test('applyUpgradesToTuning clamps EV boostPsi to 0 and upgradeSlots enforce turboMaxLevel', () => {
  const evCar = CAR_ROSTER.find((c) => c.archetype === 'ev');
  assert.ok(evCar);
  assert.equal(getCarUpgradeMaxStage(evCar, 'turbo'), 0);
  assert.equal(getCarUpgradeMaxStage(evCar, 'engine'), 3);
  const tune = createDefaultTuning(evCar);
  const res = applyUpgradesToTuning(evCar, tune, { ...createDefaultUpgrades(), turbo: 3 });
  assert.equal(res.effectiveTuning.boostPsi, 0);
});

test('computeShowroomStatBars produces 0..100 bars with positive deltas when upgraded', () => {
  const car = CAR_ROSTER[2];
  const tune = createDefaultTuning(car);
  const stockUpgrades = createDefaultUpgrades();
  const stockSpecs = computeEffectiveSpecs(car, tune, stockUpgrades);
  const modSpecs = computeEffectiveSpecs(car, tune, {
    ...stockUpgrades,
    engine: 3,
    tires: 3,
    weightReduction: 3,
  });

  const bars = computeShowroomStatBars(modSpecs, stockSpecs);
  assert.equal(bars.length, 4);
  assert.deepEqual(
    bars.map((b) => b.key),
    ['power', 'handling', 'weight', 'speed']
  );
  for (const bar of bars) {
    assert.ok(bar.score >= 8 && bar.score <= 100);
    assert.ok(bar.delta > 0, `Expected positive upgrade delta for ${bar.key}, got ${bar.delta}`);
  }
});

test('Car prices, starter ownership, and ascending upgrade stage costs are valid', () => {
  assert.ok(STARTER_OWNED_CAR_IDS.length >= 2);
  for (const id of STARTER_OWNED_CAR_IDS) {
    assert.ok(CAR_ROSTER.some((c) => c.id === id), `Starter car ${id} missing from roster`);
  }
  for (const car of CAR_ROSTER) {
    assert.ok(car.priceCr >= 35000 && car.priceCr <= 500000);
  }
  const s1 = getUpgradeStageCost('engine', 1);
  const s2 = getUpgradeStageCost('engine', 2);
  const s3 = getUpgradeStageCost('engine', 3);
  assert.ok(s1 > 0 && s2 > s1 && s3 > s2);
});

