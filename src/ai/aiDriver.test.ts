import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAiControlInput } from './aiDriver';
import { createDefaultTelemetry } from '../physics/rapierWorld';
import { computeRacingLine } from '../track/trackData';

test('AI driver steers along racing line and applies throttle on straights', () => {
  const line = computeRacingLine('festival_circuit');
  const self = createDefaultTelemetry('festival_circuit');
  self.x = line[0].x;
  self.z = line[0].z;
  self.yaw = Math.atan2(line[1].x - line[0].x, line[1].z - line[0].z);
  self.speedKmh = 45;

  const ctrl = computeAiControlInput(
    self,
    line,
    [],
    { id: 'ai-0', laneOffsetM: 0, basePace: 1.0 },
    0,
    'pro'
  );

  assert.ok(ctrl.throttle > 0.3, `Expected AI throttle > 0.3, got ${ctrl.throttle}`);
  assert.ok(Math.abs(ctrl.steer) <= 1);
});

test('AI driver brakes when entering tight corners above target speed', () => {
  const line = computeRacingLine('festival_circuit');
  // Pick highest curvature sample
  let sharpestIdx = 0;
  let maxK = 0;
  for (let i = 0; i < line.length; i++) {
    if (Math.abs(line[i].curvature) > maxK) {
      maxK = Math.abs(line[i].curvature);
      sharpestIdx = i;
    }
  }
  const entryIdx = (sharpestIdx - 5 + line.length) % line.length;
  const self = createDefaultTelemetry('festival_circuit');
  self.x = line[entryIdx].x;
  self.z = line[entryIdx].z;
  self.speedKmh = 260;

  const ctrl = computeAiControlInput(
    self,
    line,
    [],
    { id: 'ai-1', laneOffsetM: 0, basePace: 0.95 },
    0.5,
    'pro'
  );

  assert.ok(ctrl.brake > 0.2, `Expected AI to brake entering sharp corner, got ${ctrl.brake}`);
});
