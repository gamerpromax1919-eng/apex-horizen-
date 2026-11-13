import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR_ROSTER, createDefaultTuning, createDefaultUpgrades } from '../config/cars';
import { ensureRapierInitialized, RapierPhysicsWorld } from './rapierWorld';

test('Rapier 120Hz vehicle accelerates forward under throttle and rewinds safely', async () => {
  await ensureRapierInitialized();
  const physics = new RapierPhysicsWorld();
  const car = CAR_ROSTER[0];
  const tuning = createDefaultTuning(car);
  const upgrades = createDefaultUpgrades();

  const handle = physics.spawnVehicle('player', car, tuning, upgrades, 'festival_circuit', 0, 'sim_lite');
  const startX = handle.telemetry.x;
  const startZ = handle.telemetry.z;

  const configs = new Map([
    [
      'player',
      {
        car,
        tuning,
        upgrades,
        input: {
          throttle: 1,
          brake: 0,
          steer: 0,
          handbrake: false,
          nitrous: true,
          shiftUp: false,
          shiftDown: false,
        },
        weatherId: 'clear_golden' as const,
        trackId: 'festival_circuit' as const,
        raceActive: true,
        frozen: false,
      },
    ],
  ]);

  // Simulate 2.4 seconds at 60Hz render ticks (each ticks multiple 120Hz physics steps)
  for (let i = 0; i < 144; i++) {
    physics.step(1 / 60, configs);
  }

  assert.ok(handle.telemetry.speedKmh > 40, `Expected acceleration > 40 km/h, got ${handle.telemetry.speedKmh}`);
  assert.ok(handle.telemetry.wheels.some((w) => w.grounded), 'At least one wheel must stay grounded');
  const distMoved = Math.hypot(handle.telemetry.x - startX, handle.telemetry.z - startZ);
  assert.ok(distMoved > 5, `Expected car to move > 5m, moved ${distMoved}`);

  // Rewind snapshot ring populated
  assert.ok(handle.rewindRing.length >= 10);
  const rewound = physics.triggerRewind('player');
  assert.equal(rewound, true);

  physics.dispose();
});
