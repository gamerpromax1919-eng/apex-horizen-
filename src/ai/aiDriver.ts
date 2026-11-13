import type { ControlSample } from '../config/controls';
import { CAR_ROSTER, createDefaultCustomization, createDefaultTuning, createDefaultUpgrades } from '../config/cars';
import type {
  AiRacerSnapshot,
  CarCustomization,
  CarDefinition,
  TrackId,
  TuningSetup,
  UpgradeLevels,
  VehicleTelemetry,
} from '../config/types';
import { computeRacingLine, type SplineSample } from '../track/trackData';

export type AiDifficulty = 'rookie' | 'pro' | 'unbeatable';

export interface AiRosterAgent {
  id: string;
  name: string;
  car: CarDefinition;
  customization: CarCustomization;
  tuning: TuningSetup;
  upgrades: UpgradeLevels;
  laneOffsetM: number;
  basePace: number;
  lastProgress: number;
  stuckTimer: number;
}

const AI_NAMES = [
  'Kira Sato',
  'Mateo Cruz',
  'Elena Vance',
  'Liam Sterling',
  'Soren Lindqvist',
  'Nadia Volkova',
  'Devon Brooks',
];

export function computeAiControlInput(
  self: VehicleTelemetry,
  racingLine: SplineSample[],
  otherVehicles: Array<{ id: string; x: number; z: number; raceProgress: number }>,
  agent: {
    id: string;
    laneOffsetM: number;
    basePace: number;
  },
  playerProgress: number,
  difficulty: AiDifficulty
): ControlSample {
  if (racingLine.length === 0) {
    return {
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      nitrous: false,
      shiftUp: false,
      shiftDown: false,
    };
  }

  // Find closest point on racing line
  let bestIdx = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < racingLine.length; i++) {
    const p = racingLine[i];
    const dSq = (p.x - self.x) ** 2 + (p.z - self.z) ** 2;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = i;
    }
  }

  // Look ahead proportional to speed
  const lookAheadSteps = Math.max(3, Math.min(14, Math.round(3 + (self.speedKmh / 35))));
  const targetSample = racingLine[(bestIdx + lookAheadSteps) % racingLine.length];
  const brakingLookSample = racingLine[(bestIdx + lookAheadSteps + 5) % racingLine.length];

  // Lateral collision avoidance & overtaking lane shift
  let avoidOffset = agent.laneOffsetM;
  const fwdX = Math.sin(self.yaw);
  const fwdZ = Math.cos(self.yaw);
  const rightX = Math.cos(self.yaw);
  const rightZ = -Math.sin(self.yaw);

  for (const other of otherVehicles) {
    if (other.id === agent.id) continue;
    const dx = other.x - self.x;
    const dz = other.z - self.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 14 && dist > 0.5) {
      const ahead = dx * fwdX + dz * fwdZ;
      const side = dx * rightX + dz * rightZ;
      if (ahead > 0 && ahead < 13 && Math.abs(side) < 3.4) {
        avoidOffset += side >= 0 ? -3.4 : 3.4;
      }
    }
  }
  avoidOffset = Math.max(-5.2, Math.min(5.2, avoidOffset));

  const targetX = targetSample.x + targetSample.rx * avoidOffset;
  const targetZ = targetSample.z + targetSample.rz * avoidOffset;

  const toTargetX = targetX - self.x;
  const toTargetZ = targetZ - self.z;
  const desiredYaw = Math.atan2(toTargetX, toTargetZ);
  let yawErr = desiredYaw - self.yaw;
  while (yawErr > Math.PI) yawErr -= Math.PI * 2;
  while (yawErr < -Math.PI) yawErr += Math.PI * 2;

  const steer = Math.max(-1, Math.min(1, yawErr * 1.65));

  // Target speed from curvature + difficulty + light rubber-banding
  const diffMult = difficulty === 'rookie' ? 0.78 : difficulty === 'pro' ? 0.93 : 1.04;
  const rubberBand = Math.max(0.88, Math.min(1.12, 1 + (playerProgress - self.raceProgress) * 0.45));
  const cornerTargetMs =
    Math.min(targetSample.targetSpeedMs, brakingLookSample.targetSpeedMs) *
    agent.basePace *
    diffMult *
    rubberBand;

  const currentSpeedMs = self.speedKmh / 3.6;
  const speedDiff = cornerTargetMs - currentSpeedMs;

  let throttle = 0;
  let brake = 0;
  if (speedDiff > 1.5) {
    throttle = Math.min(1, 0.45 + speedDiff * 0.14);
  } else if (speedDiff < -3.5) {
    brake = Math.min(1, Math.abs(speedDiff + 2.5) * 0.14);
  } else {
    throttle = 0.35;
  }

  // Straight-line nitrous usage for pro/unbeatable AI
  const nitrous =
    difficulty !== 'rookie' &&
    Math.abs(yawErr) < 0.08 &&
    speedDiff > 8 &&
    self.speedKmh > 90 &&
    self.nitrousCharge > 0.35;

  return {
    throttle,
    brake,
    steer,
    handbrake: false,
    nitrous,
    shiftUp: false,
    shiftDown: false,
  };
}

export class AiDriverManager {
  public agents: AiRosterAgent[] = [];
  public racingLine: SplineSample[] = [];

  public buildRoster(count: number, trackId: TrackId, playerCarId: string): AiRosterAgent[] {
    this.racingLine = computeRacingLine(trackId === 'free_roam' ? 'festival_circuit' : trackId);
    const pool = CAR_ROSTER.filter((c) => c.id !== playerCarId);
    const n = Math.max(0, Math.min(7, count));
    const list: AiRosterAgent[] = [];

    for (let i = 0; i < n; i++) {
      const car = pool[i % pool.length];
      const cust = createDefaultCustomization(car);
      cust.livery = i % 2 === 0 ? 'dual_stripe' : 'racing_number';
      list.push({
        id: `ai-${i}`,
        name: AI_NAMES[i % AI_NAMES.length],
        car,
        customization: cust,
        tuning: createDefaultTuning(car),
        upgrades: createDefaultUpgrades(),
        laneOffsetM: ((i % 3) - 1) * 2.2,
        basePace: 0.94 + (i % 4) * 0.03,
        lastProgress: 0,
        stuckTimer: 0,
      });
    }

    this.agents = list;
    return list;
  }

  public toSnapshots(vehicles: Map<string, { telemetry: VehicleTelemetry }>): AiRacerSnapshot[] {
    const out: AiRacerSnapshot[] = [];
    for (const agent of this.agents) {
      const v = vehicles.get(agent.id);
      if (!v) continue;
      const t = v.telemetry;
      out.push({
        id: agent.id,
        name: agent.name,
        carId: agent.car.id,
        customization: agent.customization,
        x: t.x,
        y: t.y,
        z: t.z,
        qx: t.qx,
        qy: t.qy,
        qz: t.qz,
        qw: t.qw,
        yaw: t.yaw,
        speedKmh: t.speedKmh,
        steerAngle: t.steerAngle,
        wheelSpin: t.wheelSpin,
        braking: t.braking,
        nitrousActive: t.nitrousActive,
        lap: t.lap,
        checkpointIndex: t.checkpointIndex,
        raceProgress: t.raceProgress,
        finished: t.raceFinished,
        finishTimeMs: t.finishTimeMs,
      });
    }
    return out;
  }
}
