import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  applyAntiRollBars,
  computeAxleDifferentialTorques,
  computeDynamicWeightTransfer,
  computeTorqueAtRpm,
  DRIVE_PRESET_PROFILE,
  getGearRatioForGear,
  solvePacejkaTire,
  solveWheelSuspension,
  STEERING_ASSIST_PROFILES,
  stepGearboxAndClutch,
} from '../../shared/vehicle';
import type { ControlSample } from '../config/controls';
import type {
  CarDefinition,
  DrivePreset,
  SharedCarConfig,
  SteeringAssistMode,
  SurfaceType,
  TrackId,
  TuningSetup,
  UpgradeLevels,
  VehicleTelemetry,
  WeatherId,
  WheelTelemetry,
} from '../config/types';
import { computeSurfacePhysics, WEATHER_PROFILES } from '../config/weather';
import {
  DENSE_ASPHALT_SPLINE,
  getGroundHeight,
  getGroundNormal,
  getNearestGuardrailDistance,
  getSurfaceType,
  TRACKS,
  WORLD_PLAYABLE_RADIUS,
} from '../track/trackData';
import { applyUpgradesToTuning } from './tuning';

export const FIXED_DT = 1 / 120;

let rapierReadyPromise: Promise<typeof RAPIER> | null = null;
export function ensureRapierInitialized(): Promise<typeof RAPIER> {
  if (!rapierReadyPromise) {
    rapierReadyPromise = RAPIER.init().then(() => RAPIER);
  }
  return rapierReadyPromise;
}

export interface RewindSnapshot {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  rpm: number;
  gear: number;
  nitrousCharge: number;
  nitrousHeat: number;
  wheelSpin: number;
  lap: number;
  checkpointIndex: number;
  sectorIndex: number;
  raceElapsedMs: number;
  lapStartMs: number;
  sectorStartMs: number;
}

export interface VehicleBodyHandle {
  id: string;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  telemetry: VehicleTelemetry;
  prevPose: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number };
  currPose: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number };
  prevSuspLen: [number, number, number, number];
  wheelOmegas: [number, number, number, number];
  wheelTemps: [number, number, number, number];
  wheelWear: [number, number, number, number];
  brakeTemps: [number, number, number, number];
  prevLongVel: number;
  prevLatVel: number;
  clutchEngagement: number;
  shiftTimer: number;
  pendingGear: number | null;
  driftChainTimer: number;
  driftSegmentActive: boolean;
  raceElapsedMs: number;
  lapStartMs: number;
  sectorStartMs: number;
  lastCheckpointDist: number;
  manualTransmission: boolean;
  absEnabled: boolean;
  tcsEnabled: boolean;
  escEnabled: boolean;
  steeringAssist: SteeringAssistMode;
  useThermalWear: boolean;
  debugGripScale: number;
  drivePreset: DrivePreset;
  massKg: number;
  rewindRing: RewindSnapshot[];
  rewindCooldown: number;
}

export function createEmptyWheelTelemetry(name: 'FL' | 'FR' | 'RL' | 'RR'): WheelTelemetry {
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
    brakeTempC: 90,
    wheelAngularVel: 0,
    steerAngleRad: 0,
  };
}

export function createDefaultTelemetry(trackId: TrackId): VehicleTelemetry {
  const track = TRACKS[trackId] ?? TRACKS.free_roam;
  const { x, z, yaw } = track.spawnPoint;
  const y = getGroundHeight(x, z) + 0.45;
  const halfYaw = yaw * 0.5;
  return {
    x,
    y,
    z,
    qx: 0,
    qy: Math.sin(halfYaw),
    qz: 0,
    qw: Math.cos(halfYaw),
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    pitch: 0,
    roll: 0,
    speedKmh: 0,
    rpm: 950,
    gear: 1,
    shifting: false,
    clutchEngagement: 1,
    longG: 0,
    latG: 0,
    frontWeightPct: 51,
    boostPsi: 0,
    nitrousCharge: 1.0,
    nitrousHeat: 0,
    nitrousOverheated: false,
    nitrousActive: false,
    steerAngle: 0,
    wheelSpin: 0,
    driftAngleDeg: 0,
    isDrifting: false,
    driftPoints: 0,
    driftCombo: 1,
    driftWallBonus: false,
    totalDriftScore: 0,
    surface: 'asphalt',
    gripFactor: 1.0,
    absActive: false,
    tcsActive: false,
    escActive: false,
    braking: false,
    reversing: false,
    indicatorLeft: false,
    indicatorRight: false,
    dirtLevel: 0,
    wetnessLevel: 0,
    damageLevel: 0,
    impactIntensity: 0,
    lap: 1,
    sectorIndex: 0,
    sectorTimesMs: [null, null, null],
    bestLapMs: null,
    checkpointIndex: 0,
    raceProgress: 0,
    racePosition: 1,
    totalRacers: 1,
    wrongWay: false,
    raceFinished: false,
    finishTimeMs: null,
    lapTimesMs: [],
    wheels: [
      createEmptyWheelTelemetry('FL'),
      createEmptyWheelTelemetry('FR'),
      createEmptyWheelTelemetry('RL'),
      createEmptyWheelTelemetry('RR'),
    ],
  };
}

// Reusable scratch vectors/quaternions for zero-GC 120Hz stepping
const _q = new THREE.Quaternion();
const _invQ = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _wheelWorldPos = new THREE.Vector3();
const _wheelHubVel = new THREE.Vector3();
const _wheelFwd = new THREE.Vector3();
const _wheelRight = new THREE.Vector3();
const _forceVec = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export class RapierPhysicsWorld {
  public world: RAPIER.World;
  public vehicles = new Map<string, VehicleBodyHandle>();
  public accumulator = 0;
  public alpha = 0;
  private rewindRecordAccum = 0;
  private simTimeSec = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.buildStaticWorldColliders();
  }

  private buildStaticWorldColliders(): void {
    // Soft lowered heightfield collider for upside-down / jump / chassis bottoming safety
    // Placed 0.14m beneath exact analytical spline road so wheels never hit polygon seams
    const nrows = 80;
    const ncols = 80;
    const size = 840;
    const heights = new Float32Array((nrows + 1) * (ncols + 1));
    for (let r = 0; r <= nrows; r++) {
      for (let c = 0; c <= ncols; c++) {
        const wx = (c / ncols - 0.5) * size;
        const wz = (r / nrows - 0.5) * size;
        heights[c * (nrows + 1) + r] = getGroundHeight(wx, wz) - 0.14;
      }
    }
    const hfDesc = RAPIER.ColliderDesc.heightfield(
      nrows,
      ncols,
      heights,
      { x: size, y: 1.0, z: size }
    )
      .setFriction(0.25)
      .setRestitution(0.05);
    this.world.createCollider(hfDesc);

    // Outer perimeter guardrail barrier segments around main circuit outer canyon ring
    const barrierSegments = 24;
    for (let i = 0; i < barrierSegments; i++) {
      const a0 = (i / barrierSegments) * Math.PI * 2;
      const a1 = ((i + 1) / barrierSegments) * Math.PI * 2;
      const midA = (a0 + a1) * 0.5;
      const r = WORLD_PLAYABLE_RADIUS + 4;
      const x = Math.cos(midA) * r;
      const z = Math.sin(midA) * r;
      const segLen = (2 * Math.PI * r) / barrierSegments + 4;
      const y = getGroundHeight(x, z) + 2;
      const wallDesc = RAPIER.ColliderDesc.cuboid(segLen * 0.5, 4.5, 1.5)
        .setTranslation(x, y, z)
        .setRotation({
          x: 0,
          y: Math.sin((-midA + Math.PI * 0.5) * 0.5),
          z: 0,
          w: Math.cos((-midA + Math.PI * 0.5) * 0.5),
        })
        .setRestitution(0.35)
        .setFriction(0.4);
      this.world.createCollider(wallDesc);
    }
  }

  public spawnVehicle(
    id: string,
    car: CarDefinition & Partial<SharedCarConfig>,
    tuning: TuningSetup,
    upgrades: UpgradeLevels,
    trackId: TrackId,
    spawnSlot = 0,
    drivePreset: DrivePreset = 'sim_lite'
  ): VehicleBodyHandle {
    const existing = this.vehicles.get(id);
    if (existing) {
      this.world.removeRigidBody(existing.body);
      this.vehicles.delete(id);
    }

    const { effectiveCar } = applyUpgradesToTuning(car, tuning, upgrades);
    const telemetry = createDefaultTelemetry(trackId);
    if (spawnSlot > 0) {
      const row = Math.floor(spawnSlot / 2);
      const col = spawnSlot % 2;
      const fwdX = Math.sin(telemetry.yaw);
      const fwdZ = Math.cos(telemetry.yaw);
      const rightX = Math.cos(telemetry.yaw);
      const rightZ = -Math.sin(telemetry.yaw);
      telemetry.x = telemetry.x - fwdX * row * 8.5 + rightX * (col === 0 ? -2.9 : 2.9);
      telemetry.z = telemetry.z - fwdZ * row * 8.5 + rightZ * (col === 0 ? -2.9 : 2.9);
      telemetry.y = getGroundHeight(telemetry.x, telemetry.z) + 0.45;
    }

    const massKg = Math.max(940, effectiveCar.baseWeightKg);
    const rbDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(telemetry.x, telemetry.y, telemetry.z)
      .setRotation({ x: telemetry.qx, y: telemetry.qy, z: telemetry.qz, w: telemetry.qw })
      .setLinearDamping(0.04)
      .setAngularDamping(0.18)
      .setAdditionalMassProperties(
        massKg,
        { x: 0, y: effectiveCar.comHeightOffsetM, z: 0 },
        {
          x: massKg * 1.45,
          y: massKg * 2.35,
          z: massKg * 0.55,
        },
        { x: 0, y: 0, z: 0, w: 1 }
      )
      .setCanSleep(false);

    const body = this.world.createRigidBody(rbDesc);

    const colDesc = RAPIER.ColliderDesc.cuboid(
      effectiveCar.bodyWidthM * 0.44,
      0.32,
      effectiveCar.bodyLengthM * 0.45
    )
      .setTranslation(0, 0.36, 0)
      .setRestitution(0.22)
      .setFriction(0.15)
      .setMass(0.01);
    const collider = this.world.createCollider(colDesc, body);

    const preset = DRIVE_PRESET_PROFILE[drivePreset];
    const pose = {
      x: telemetry.x,
      y: telemetry.y,
      z: telemetry.z,
      qx: telemetry.qx,
      qy: telemetry.qy,
      qz: telemetry.qz,
      qw: telemetry.qw,
    };

    const handle: VehicleBodyHandle = {
      id,
      body,
      collider,
      telemetry,
      prevPose: { ...pose },
      currPose: { ...pose },
      prevSuspLen: [0.3, 0.3, 0.3, 0.3],
      wheelOmegas: [0, 0, 0, 0],
      wheelTemps: [72, 72, 72, 72],
      wheelWear: [1, 1, 1, 1],
      brakeTemps: [85, 85, 85, 85],
      prevLongVel: 0,
      prevLatVel: 0,
      clutchEngagement: 1,
      shiftTimer: 0,
      pendingGear: null,
      driftChainTimer: 0,
      driftSegmentActive: false,
      raceElapsedMs: 0,
      lapStartMs: 0,
      sectorStartMs: 0,
      lastCheckpointDist: Infinity,
      manualTransmission: false,
      absEnabled: preset.defaultAbs,
      tcsEnabled: preset.defaultTcs,
      escEnabled: preset.defaultEsc,
      steeringAssist: preset.defaultSteeringAssist,
      useThermalWear: true,
      debugGripScale: 1.0,
      drivePreset,
      massKg,
      rewindRing: [],
      rewindCooldown: 0,
    };

    this.vehicles.set(id, handle);
    return handle;
  }

  public resetVehicleToRoad(
    id: string,
    trackId: TrackId,
    keepProgress = false
  ): void {
    const v = this.vehicles.get(id);
    if (!v) return;
    const t = v.telemetry;

    let targetX = TRACKS[trackId]?.spawnPoint.x ?? 0;
    let targetZ = TRACKS[trackId]?.spawnPoint.z ?? 185;
    let targetYaw = TRACKS[trackId]?.spawnPoint.yaw ?? Math.PI / 2;

    if (keepProgress) {
      let bestSq = Infinity;
      let bestIdx = 0;
      for (let i = 0; i < DENSE_ASPHALT_SPLINE.length; i++) {
        const pt = DENSE_ASPHALT_SPLINE[i];
        const dSq = (pt.x - t.x) ** 2 + (pt.z - t.z) ** 2;
        if (dSq < bestSq) {
          bestSq = dSq;
          bestIdx = i;
        }
      }
      const p0 = DENSE_ASPHALT_SPLINE[bestIdx];
      const p1 = DENSE_ASPHALT_SPLINE[(bestIdx + 1) % DENSE_ASPHALT_SPLINE.length];
      targetX = p0.x;
      targetZ = p0.z;
      targetYaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    } else {
      const fresh = createDefaultTelemetry(trackId);
      v.telemetry = fresh;
      v.raceElapsedMs = 0;
      v.lapStartMs = 0;
      v.sectorStartMs = 0;
    }

    const targetY = getGroundHeight(targetX, targetZ) + 0.48;
    const qy = Math.sin(targetYaw * 0.5);
    const qw = Math.cos(targetYaw * 0.5);

    v.body.setTranslation({ x: targetX, y: targetY, z: targetZ }, true);
    v.body.setRotation({ x: 0, y: qy, z: 0, w: qw }, true);
    v.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    v.wheelOmegas = [0, 0, 0, 0];
    v.prevLongVel = 0;
    v.prevLatVel = 0;
    v.telemetry.x = targetX;
    v.telemetry.y = targetY;
    v.telemetry.z = targetZ;
    v.telemetry.yaw = targetYaw;
    v.telemetry.speedKmh = 0;
    v.telemetry.longG = 0;
    v.telemetry.latG = 0;
    v.telemetry.wrongWay = false;
    v.prevPose = { x: targetX, y: targetY, z: targetZ, qx: 0, qy, qz: 0, qw };
    v.currPose = { ...v.prevPose };
  }

  public triggerRewind(id: string): boolean {
    const v = this.vehicles.get(id);
    if (!v || v.rewindRing.length < 4) return false;
    const targetIdx = Math.max(0, v.rewindRing.length - 25);
    const snap = v.rewindRing[targetIdx];
    v.rewindRing.length = targetIdx;

    v.body.setTranslation({ x: snap.x, y: snap.y, z: snap.z }, true);
    v.body.setRotation({ x: snap.qx, y: snap.qy, z: snap.qz, w: snap.qw }, true);
    v.body.setLinvel({ x: snap.vx, y: snap.vy, z: snap.vz }, true);
    v.body.setAngvel({ x: snap.wx, y: snap.wy, z: snap.wz }, true);

    v.telemetry.x = snap.x;
    v.telemetry.y = snap.y;
    v.telemetry.z = snap.z;
    v.telemetry.qx = snap.qx;
    v.telemetry.qy = snap.qy;
    v.telemetry.qz = snap.qz;
    v.telemetry.qw = snap.qw;
    v.telemetry.rpm = snap.rpm;
    v.telemetry.gear = snap.gear;
    v.telemetry.nitrousCharge = snap.nitrousCharge;
    v.telemetry.nitrousHeat = snap.nitrousHeat;
    v.telemetry.wheelSpin = snap.wheelSpin;
    v.telemetry.lap = snap.lap;
    v.telemetry.checkpointIndex = snap.checkpointIndex;
    v.telemetry.sectorIndex = snap.sectorIndex;
    v.raceElapsedMs = snap.raceElapsedMs;
    v.lapStartMs = snap.lapStartMs;
    v.sectorStartMs = snap.sectorStartMs;
    v.prevPose = {
      x: snap.x,
      y: snap.y,
      z: snap.z,
      qx: snap.qx,
      qy: snap.qy,
      qz: snap.qz,
      qw: snap.qw,
    };
    v.currPose = { ...v.prevPose };
    return true;
  }

  public step(
    dtRaw: number,
    configs: Map<
      string,
      {
        car: CarDefinition & Partial<SharedCarConfig>;
        tuning: TuningSetup;
        upgrades: UpgradeLevels;
        input: ControlSample;
        weatherId: WeatherId;
        trackId: TrackId;
        raceActive: boolean;
        frozen: boolean;
      }
    >
  ): void {
    const dt = Math.min(0.05, Math.max(0.0005, dtRaw));
    this.accumulator += dt;

    let stepped = false;
    while (this.accumulator >= FIXED_DT) {
      this.simTimeSec += FIXED_DT;
      this.rewindRecordAccum += FIXED_DT;

      for (const [id, v] of this.vehicles.entries()) {
        const tr = v.body.translation();
        const rot = v.body.rotation();
        v.prevPose.x = tr.x;
        v.prevPose.y = tr.y;
        v.prevPose.z = tr.z;
        v.prevPose.qx = rot.x;
        v.prevPose.qy = rot.y;
        v.prevPose.qz = rot.z;
        v.prevPose.qw = rot.w;

        const cfg = configs.get(id);
        if (cfg && !cfg.frozen) {
          this.stepSingleVehicle120Hz(
            v,
            cfg.input,
            cfg.car,
            cfg.tuning,
            cfg.upgrades,
            cfg.weatherId,
            cfg.trackId,
            cfg.raceActive
          );
        }
      }

      this.world.step();

      for (const [id, v] of this.vehicles.entries()) {
        const tr = v.body.translation();
        const rot = v.body.rotation();
        v.currPose.x = tr.x;
        v.currPose.y = tr.y;
        v.currPose.z = tr.z;
        v.currPose.qx = rot.x;
        v.currPose.qy = rot.y;
        v.currPose.qz = rot.z;
        v.currPose.qw = rot.w;

        if (this.rewindRecordAccum >= 0.1 && id === 'player') {
          const lv = v.body.linvel();
          const av = v.body.angvel();
          v.rewindRing.push({
            x: tr.x,
            y: tr.y,
            z: tr.z,
            qx: rot.x,
            qy: rot.y,
            qz: rot.z,
            qw: rot.w,
            vx: lv.x,
            vy: lv.y,
            vz: lv.z,
            wx: av.x,
            wy: av.y,
            wz: av.z,
            rpm: v.telemetry.rpm,
            gear: v.telemetry.gear,
            nitrousCharge: v.telemetry.nitrousCharge,
            nitrousHeat: v.telemetry.nitrousHeat,
            wheelSpin: v.telemetry.wheelSpin,
            lap: v.telemetry.lap,
            checkpointIndex: v.telemetry.checkpointIndex,
            sectorIndex: v.telemetry.sectorIndex,
            raceElapsedMs: v.raceElapsedMs,
            lapStartMs: v.lapStartMs,
            sectorStartMs: v.sectorStartMs,
          });
          if (v.rewindRing.length > 120) {
            v.rewindRing.shift();
          }
        }
      }

      if (this.rewindRecordAccum >= 0.1) {
        this.rewindRecordAccum = 0;
      }

      this.accumulator -= FIXED_DT;
      stepped = true;
    }

    this.alpha = this.accumulator / FIXED_DT;

    for (const v of this.vehicles.values()) {
      const a = stepped ? this.alpha : 1;
      const t = v.telemetry;
      t.x = v.prevPose.x + (v.currPose.x - v.prevPose.x) * a;
      t.y = v.prevPose.y + (v.currPose.y - v.prevPose.y) * a;
      t.z = v.prevPose.z + (v.currPose.z - v.prevPose.z) * a;
      _q.set(v.prevPose.qx, v.prevPose.qy, v.prevPose.qz, v.prevPose.qw);
      _invQ.set(v.currPose.qx, v.currPose.qy, v.currPose.qz, v.currPose.qw);
      _q.slerp(_invQ, a);
      t.qx = _q.x;
      t.qy = _q.y;
      t.qz = _q.z;
      t.qw = _q.w;
      _euler.setFromQuaternion(_q, 'YXZ');
      t.yaw = _euler.y;
      t.pitch = _euler.x;
      t.roll = _euler.z;
    }
  }

  private stepSingleVehicle120Hz(
    v: VehicleBodyHandle,
    input: ControlSample,
    rawCar: CarDefinition & Partial<SharedCarConfig>,
    rawTuning: TuningSetup,
    upgrades: UpgradeLevels,
    weatherId: WeatherId,
    trackId: TrackId,
    raceActive: boolean
  ): void {
    const dt = FIXED_DT;
    const t = v.telemetry;
    const { effectiveCar: car, effectiveTuning: tuning } = applyUpgradesToTuning(
      rawCar,
      rawTuning,
      upgrades
    );

    if (raceActive && !t.raceFinished) {
      v.raceElapsedMs += dt * 1000;
    }

    const pos = v.body.translation();
    const rot = v.body.rotation();
    const linvel = v.body.linvel();
    const angvel = v.body.angvel();

    _q.set(rot.x, rot.y, rot.z, rot.w);
    _fwd.set(0, 0, 1).applyQuaternion(_q).normalize();
    _right.set(1, 0, 0).applyQuaternion(_q).normalize();
    _up.set(0, 1, 0).applyQuaternion(_q).normalize();

    const vForward = linvel.x * _fwd.x + linvel.y * _fwd.y + linvel.z * _fwd.z;
    const vLateral = linvel.x * _right.x + linvel.y * _right.y + linvel.z * _right.z;
    const speedMs = Math.hypot(linvel.x, linvel.y, linvel.z);
    const speedKmh = speedMs * 3.6;

    const prevSpeedKmh = t.speedKmh;
    const decelSpike = (prevSpeedKmh - speedKmh) / dt;
    if (decelSpike > 180) {
      t.impactIntensity = Math.min(1, decelSpike / 450);
      t.damageLevel = Math.min(1, t.damageLevel + t.impactIntensity * 0.08);
    } else {
      t.impactIntensity = Math.max(0, t.impactIntensity - dt * 4.5);
    }

    t.vx = linvel.x;
    t.vy = linvel.y;
    t.vz = linvel.z;
    t.speedKmh = speedKmh;

    // 1. Speed-Sensitive Steering + Countersteer Assist + Ackermann Geometry
    const preset = DRIVE_PRESET_PROFILE[v.drivePreset];
    const assistProfile = STEERING_ASSIST_PROFILES[v.steeringAssist];
    const maxSteer = 0.56 / (1 + speedKmh * assistProfile.speedSteerCurve);
    const bodySlipRad = speedMs > 4 ? Math.atan2(vLateral, Math.max(1.5, Math.abs(vForward))) : 0;
    const countersteerHelp =
      speedMs > 5 && assistProfile.countersteerGain > 0
        ? Math.max(-0.28, Math.min(0.28, -bodySlipRad * assistProfile.countersteerGain))
        : 0;
    const targetSteer = Math.max(
      -maxSteer * 1.15,
      Math.min(
        maxSteer * 1.15,
        input.steer * maxSteer * (input.handbrake ? 1.15 : 1.0) + countersteerHelp
      )
    );
    t.steerAngle += (targetSteer - t.steerAngle) * (1 - Math.exp(-12 * dt));
    t.indicatorLeft = t.steerAngle > 0.14;
    t.indicatorRight = t.steerAngle < -0.14;

    const wheelBase = car.wheelbaseM;
    const halfTrack = car.trackWidthM * 0.5;
    let steerFL = t.steerAngle;
    let steerFR = t.steerAngle;
    if (Math.abs(t.steerAngle) > 0.005) {
      const turnRadius = wheelBase / Math.tan(Math.abs(t.steerAngle));
      const inner = Math.atan(wheelBase / Math.max(0.8, turnRadius - halfTrack));
      const outer = Math.atan(wheelBase / (turnRadius + halfTrack));
      if (t.steerAngle > 0) {
        steerFL = inner;
        steerFR = outer;
      } else {
        steerFL = -outer;
        steerFR = -inner;
      }
    }

    // 2. Shared Gearbox, Shift Time & Clutch Engagement
    const redline = Math.max(5500, Math.min(10500, tuning.revLimitRpm));
    const drivenAvgOmega =
      car.drivetrain === 'FWD'
        ? (v.wheelOmegas[0] + v.wheelOmegas[1]) * 0.5
        : car.drivetrain === 'RWD'
          ? (v.wheelOmegas[2] + v.wheelOmegas[3]) * 0.5
          : (v.wheelOmegas[0] + v.wheelOmegas[1] + v.wheelOmegas[2] + v.wheelOmegas[3]) * 0.25;

    const gearboxNext = stepGearboxAndClutch(
      {
        gear: t.gear,
        rpm: t.rpm,
        shiftTimer: v.shiftTimer,
        pendingGear: v.pendingGear,
        clutchEngagement: v.clutchEngagement,
        shifting: t.shifting,
      },
      {
        dt,
        manualTransmission: v.manualTransmission,
        throttle: input.throttle,
        brake: input.brake,
        shiftUp: input.shiftUp,
        shiftDown: input.shiftDown,
        vForwardMs: vForward,
        drivenAvgOmega,
        tuning,
        idleRpm: car.powerCurve?.idleRpm ?? 950,
      }
    );
    t.gear = gearboxNext.gear;
    t.rpm = gearboxNext.rpm;
    v.shiftTimer = gearboxNext.shiftTimer;
    v.pendingGear = gearboxNext.pendingGear;
    v.clutchEngagement = gearboxNext.clutchEngagement;
    t.clutchEngagement = gearboxNext.clutchEngagement;
    t.shifting = gearboxNext.shifting;

    const wheelRadiusM = car.archetype === 'trophy' ? 0.43 : 0.34;
    const activeRatio = getGearRatioForGear(tuning, t.gear);
    const totalDriveRatio = activeRatio * tuning.finalDrive;

    // 3. Engine RPM, Turbo & Nitrous (with heat/cooldown)
    const targetBoost =
      car.archetype === 'ev'
        ? 0
        : input.throttle > 0.12 && !t.shifting
          ? tuning.boostPsi * Math.min(1, t.rpm / (redline * 0.45)) * input.throttle
          : -4.2;
    t.boostPsi += (targetBoost - t.boostPsi) * (1 - Math.exp(-7 * dt));

    if (t.nitrousOverheated && t.nitrousHeat < 0.32) {
      t.nitrousOverheated = false;
    }
    const canNos =
      input.nitrous &&
      !t.nitrousOverheated &&
      t.nitrousCharge > 0.02 &&
      input.throttle > 0.1 &&
      t.gear >= 1 &&
      !t.shifting;
    t.nitrousActive = canNos;
    if (canNos) {
      t.nitrousCharge = Math.max(0, t.nitrousCharge - dt * 0.22);
      t.nitrousHeat = Math.min(1, t.nitrousHeat + dt * 0.34);
      if (t.nitrousHeat >= 0.99) t.nitrousOverheated = true;
    } else {
      t.nitrousHeat = Math.max(0, t.nitrousHeat - dt * 0.18);
      t.nitrousCharge = Math.min(1, t.nitrousCharge + dt * (t.isDrifting ? 0.085 : 0.032));
    }

    const baseEngineTorque = t.shifting ? 0 : computeTorqueAtRpm(car, tuning, t.rpm);
    const nosTorque = canNos ? (tuning.nitrousShotHp * 7127) / Math.max(3000, t.rpm) : 0;
    const rawEngineTorque =
      (baseEngineTorque + nosTorque) * (t.rpm > redline * 0.985 ? 0.25 : 1.0) * v.clutchEngagement;

    // 4. Aerodynamics + Dynamic Longitudinal/Lateral Weight Transfer
    const aeroDragCoeff = (car.dragAreaCdA ?? 2.15) * 0.16 + tuning.aeroDownforce * 0.18;
    const dragMag = 0.5 * 1.225 * aeroDragCoeff * 2.15 * vForward * Math.abs(vForward);
    const downforceN = tuning.aeroDownforce * (car.downforceScale ?? 1.0) * 1.15 * speedMs * speedMs;

    const rawLongAccel = (vForward - v.prevLongVel) / dt;
    const rawLatAccel = (vLateral - v.prevLatVel) / dt + vForward * angvel.y;
    v.prevLongVel = vForward;
    v.prevLatVel = vLateral;

    const cgHeightM = Math.max(0.32, 0.58 + car.comHeightOffsetM + tuning.rideHeightMm * 0.001);
    const wtTransfer = computeDynamicWeightTransfer({
      massKg: v.massKg,
      longAccelMs2: rawLongAccel,
      latAccelMs2: rawLatAccel,
      cgHeightM,
      wheelbaseM: wheelBase,
      trackWidthM: car.trackWidthM,
      staticFrontRatio: 0.51,
      frontArbRollShare: 0.52,
    });
    t.longG += (wtTransfer.longG - t.longG) * 0.28;
    t.latG += (wtTransfer.latG - t.latG) * 0.28;
    t.frontWeightPct += (wtTransfer.frontWeightPct - t.frontWeightPct) * 0.28;

    v.body.resetForces(true);
    v.body.resetTorques(true);

    v.body.addForce(
      {
        x: -_fwd.x * dragMag,
        y: -downforceN,
        z: -_fwd.z * dragMag,
      },
      true
    );

    // 5. Custom 4-Wheel Raycast Suspension + Weight Transfer + Pacejka Tire Forces
    const wheelLocalCoords: Array<[number, number, number]> = [
      [halfTrack, 0.08, wheelBase * 0.5],
      [-halfTrack, 0.08, wheelBase * 0.5],
      [halfTrack, 0.08, -wheelBase * 0.5],
      [-halfTrack, 0.08, -wheelBase * 0.5],
    ];
    const wheelSteers = [steerFL, steerFR, 0, 0];

    const suspForces: [number, number, number, number] = [0, 0, 0, 0];
    const compressions: [number, number, number, number] = [0, 0, 0, 0];
    const wheelWorldPositions: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ];

    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = wheelLocalCoords[i];
      _wheelWorldPos
        .set(pos.x, pos.y, pos.z)
        .addScaledVector(_right, lx)
        .addScaledVector(_up, ly)
        .addScaledVector(_fwd, lz);
      wheelWorldPositions[i].copy(_wheelWorldPos);

      const groundY = getGroundHeight(_wheelWorldPos.x, _wheelWorldPos.z);
      const distToGround = _wheelWorldPos.y - groundY;

      const surface = getSurfaceType(_wheelWorldPos.x, _wheelWorldPos.z, weatherId);
      const surfPhys = computeSurfacePhysics(
        surface,
        tuning.tireCompound,
        weatherId,
        speedKmh,
        tuning.rideHeightMm
      );

      const susp = solveWheelSuspension({
        distToGroundM: distToGround,
        prevCompressionM: v.prevSuspLen[i],
        dt,
        massKg: v.massKg,
        isTrophyArchetype: car.archetype === 'trophy',
        tuning,
        dynamicTransferDeltaN: wtTransfer.wheelWeightDeltasN[i],
      });

      v.prevSuspLen[i] = susp.compressionM;
      suspForces[i] = susp.normalForceN;
      compressions[i] = susp.compressionRatio;
      v.telemetry.wheels[i].grounded = susp.grounded;
      v.telemetry.wheels[i].suspensionOffsetM = susp.suspensionOffsetM;
      v.telemetry.wheels[i].compression = susp.compressionRatio;
      v.telemetry.wheels[i].surface = surface;
      v.telemetry.wheels[i].gripCoeff = surfPhys.grip * v.debugGripScale;
    }

    const arbForces = applyAntiRollBars(suspForces, compressions, v.massKg, tuning.antiRollBar);

    let throttleEff = input.throttle;
    if (t.gear === -1 && input.brake > 0.05) {
      throttleEff = -input.brake * 0.65;
    }
    const totalWheelTorque = rawEngineTorque * totalDriveRatio * 0.94 * throttleEff;
    const diffTorques = computeAxleDifferentialTorques({
      drivetrain: car.drivetrain,
      diffType: tuning.diffType,
      diffBiasRear: tuning.diffBiasRear,
      lsdLock: tuning.lsdLock,
      totalWheelTorqueNm: totalWheelTorque,
      wheelOmegas: v.wheelOmegas,
    });

    let anyTcsActive = false;
    let anyAbsActive = false;

    const absPulse = 0.55 + 0.45 * Math.sin(this.simTimeSec * Math.PI * 2 * 18);
    const camberRad = THREE.MathUtils.degToRad(tuning.camberDeg);
    const weather = WEATHER_PROFILES[weatherId];

    let avgGrip = 0;
    let groundedCount = 0;
    let offroadWheelCount = 0;

    for (let i = 0; i < 4; i++) {
      const wt = v.telemetry.wheels[i];
      const fNormal = arbForces[i];
      wt.normalLoadN = fNormal;
      wt.steerAngleRad = wheelSteers[i];

      const isFront = i < 2;
      const isRear = !isFront;
      let driveTorque = diffTorques[i];

      const brakingInput =
        t.gear === -1 ? input.throttle : input.brake > 0.01 && vForward > 0.4 ? input.brake : 0;
      const bias = isFront ? tuning.brakeBiasFront : 1 - tuning.brakeBiasFront;
      let brakeTorque = brakingInput * v.massKg * 3.1 * tuning.brakePressure * bias;
      if (isRear && input.handbrake) {
        brakeTorque += v.massKg * 4.5;
        driveTorque *= 0.15;
      }

      const wp = wheelWorldPositions[i];
      const rx = wp.x - pos.x;
      const ry = wp.y - pos.y;
      const rz = wp.z - pos.z;
      _wheelHubVel.set(
        linvel.x + (angvel.y * rz - angvel.z * ry),
        linvel.y + (angvel.z * rx - angvel.x * rz),
        linvel.z + (angvel.x * ry - angvel.y * rx)
      );

      const st = wheelSteers[i];
      const cs = Math.cos(st);
      const sn = Math.sin(st);
      _wheelFwd.copy(_fwd).multiplyScalar(cs).addScaledVector(_right, sn).normalize();
      _wheelRight.copy(_right).multiplyScalar(cs).addScaledVector(_fwd, -sn).normalize();

      const wVLong = _wheelHubVel.dot(_wheelFwd);
      const wVLat = _wheelHubVel.dot(_wheelRight);

      const wheelInertia = 1.45;
      const freeRollingOmega = wVLong / wheelRadiusM;

      const currentSlip =
        (v.wheelOmegas[i] * wheelRadiusM - wVLong) / Math.max(2.0, Math.abs(wVLong));
      if (v.absEnabled && brakingInput > 0.15 && currentSlip < -0.18 && speedMs > 3.5) {
        brakeTorque *= absPulse * 0.48;
        anyAbsActive = true;
      }

      if (
        v.tcsEnabled &&
        driveTorque * Math.sign(v.wheelOmegas[i] || 1) > 0 &&
        Math.abs(currentSlip) > 0.15 &&
        speedMs > 2.0
      ) {
        const tcsCut = Math.max(0.45, 1 - (Math.abs(currentSlip) - 0.15) * 2.2);
        driveTorque *= tcsCut;
        anyTcsActive = true;
      }

      if (wt.grounded && fNormal > 1) {
        groundedCount++;
        avgGrip += wt.gripCoeff;
        if (wt.surface !== 'asphalt' && wt.surface !== 'wet_asphalt' && wt.surface !== 'curb') {
          offroadWheelCount++;
        }

        const slipRatio =
          (v.wheelOmegas[i] * wheelRadiusM - wVLong) / Math.max(2.2, Math.abs(wVLong));
        const slipAngleRad = Math.atan2(wVLat, Math.max(2.2, Math.abs(wVLong)));

        const pacejka = solvePacejkaTire({
          normalLoadN: fNormal,
          slipRatio,
          slipAngleRad,
          surfaceFriction: wt.gripCoeff,
          compound: tuning.tireCompound,
          tireTempC: v.wheelTemps[i],
          tireWear: v.wheelWear[i],
          useThermalWear: v.useThermalWear,
          camberRad: i % 2 === 0 ? camberRad : -camberRad,
          drivePreset: v.drivePreset,
          isRearHandbrake: isRear && input.handbrake,
          carTireGripMultiplier: car.tireGripMultiplier,
        });

        wt.slipRatio = slipRatio;
        wt.slipAngleRad = slipAngleRad;
        wt.longForceN = pacejka.fx;
        wt.latForceN = pacejka.fy;

        const gNorm = getGroundNormal(wp.x, wp.z);
        const surfRes = computeSurfacePhysics(
          wt.surface,
          tuning.tireCompound,
          weatherId,
          speedKmh,
          tuning.rideHeightMm
        );
        const rollDrag =
          -Math.sign(wVLong) *
            Math.min(Math.abs(wVLong) * 40, fNormal * 0.014 * surfRes.rollingDrag) -
          wVLong * 1.2 * surfRes.rollingDrag;

        _forceVec
          .set(gNorm.nx * fNormal, gNorm.ny * fNormal, gNorm.nz * fNormal)
          .addScaledVector(_wheelFwd, pacejka.fx + rollDrag)
          .addScaledVector(_wheelRight, pacejka.fy);

        v.body.addForceAtPoint(_forceVec, wp, true);

        const brakeSign =
          Math.abs(v.wheelOmegas[i]) > 0.4 ? Math.sign(v.wheelOmegas[i]) : Math.sign(wVLong);
        const netWheelTorque = driveTorque - brakeTorque * brakeSign - pacejka.fx * wheelRadiusM;
        v.wheelOmegas[i] += (netWheelTorque / wheelInertia) * dt;
        if (speedMs < 0.8 && Math.abs(throttleEff) < 0.05) {
          v.wheelOmegas[i] *= Math.exp(-10 * dt);
        }

        const heatGen = (Math.abs(slipRatio) * 18 + Math.abs(slipAngleRad) * 14) * (speedMs / 25);
        v.wheelTemps[i] += (68 + heatGen - v.wheelTemps[i]) * dt * 0.25;
        v.wheelWear[i] = Math.max(0.45, v.wheelWear[i] - heatGen * 0.000018 * dt);
      } else {
        v.wheelOmegas[i] += (driveTorque / wheelInertia) * dt;
        v.wheelOmegas[i] *= Math.exp(-1.5 * dt);
        wt.slipRatio = 0;
        wt.slipAngleRad = 0;
        wt.longForceN = 0;
        wt.latForceN = 0;
      }

      const brakeEnergy = brakeTorque * Math.abs(v.wheelOmegas[i]) * 0.00028;
      v.brakeTemps[i] = Math.min(
        920,
        Math.max(
          80,
          v.brakeTemps[i] + brakeEnergy * dt - (v.brakeTemps[i] - 80) * (0.14 + speedMs * 0.015) * dt
        )
      );

      if (Math.abs(throttleEff) < 0.02 && brakingInput < 0.05 && wt.grounded) {
        v.wheelOmegas[i] += (freeRollingOmega - v.wheelOmegas[i]) * (1 - Math.exp(-8 * dt));
      }
      wt.tireTempC = v.wheelTemps[i];
      wt.tireWear = v.wheelWear[i];
      wt.brakeTempC = v.brakeTemps[i];
      wt.wheelAngularVel = v.wheelOmegas[i];
    }

    t.absActive = anyAbsActive;
    t.tcsActive = anyTcsActive;
    t.braking = input.brake > 0.05 && vForward > 0.3 && t.gear !== -1;
    t.reversing = t.gear === -1;

    // 6. ESC Electronic Stability Control & Steering Assist Yaw Damping
    const yawRate = angvel.y;
    t.driftAngleDeg = (Math.abs(bodySlipRad) * 180) / Math.PI;
    t.escActive = false;

    if (groundedCount >= 2 && speedMs > 6) {
      const desiredYawRate = (t.steerAngle * Math.min(28, speedMs)) / Math.max(2.2, wheelBase);
      const yawError = desiredYawRate - yawRate;
      if (v.escEnabled && Math.abs(bodySlipRad) > 0.24 && !input.handbrake) {
        t.escActive = true;
        v.body.addTorque({ x: 0, y: yawError * v.massKg * 1.45, z: 0 }, true);
      } else if (assistProfile.yawDampGain > 0 || preset.steerAssist > 0) {
        const assistWeight = Math.max(assistProfile.yawDampGain, preset.steerAssist);
        v.body.addTorque({ x: 0, y: yawError * v.massKg * 0.65 * assistWeight, z: 0 }, true);
      }
    }

    // Crosswind lateral weather force
    const centerSurf = getSurfaceType(pos.x, pos.z, weatherId);
    const centerPhys = computeSurfacePhysics(
      centerSurf,
      tuning.tireCompound,
      weatherId,
      speedKmh,
      tuning.rideHeightMm
    );
    v.body.addForce(
      { x: centerPhys.windForceX * v.massKg * 0.4, y: 0, z: centerPhys.windForceZ * v.massKg * 0.4 },
      true
    );

    t.surface = centerSurf;
    t.gripFactor = groundedCount > 0 ? avgGrip / groundedCount : centerPhys.grip;
    t.wheelSpin += ((v.wheelOmegas[2] + v.wheelOmegas[3]) * 0.5) * dt;

    if (offroadWheelCount > 0 && speedMs > 4) {
      t.dirtLevel = Math.min(1, t.dirtLevel + dt * 0.08 * (offroadWheelCount / 4));
    }
    if (weather.rainIntensity > 0.2) {
      t.wetnessLevel = Math.min(1, t.wetnessLevel + dt * 0.25 * weather.rainIntensity);
      t.dirtLevel = Math.max(0, t.dirtLevel - dt * 0.06 * weather.rainIntensity);
    } else {
      t.wetnessLevel = Math.max(0, t.wetnessLevel - dt * 0.08);
    }

    // 7. Drift Scoring
    const wallDist = getNearestGuardrailDistance(pos.x, pos.z);
    const wallBonus = wallDist < 5.5 && t.driftAngleDeg > 14 && speedKmh > 42;
    t.driftWallBonus = wallBonus;

    if (t.driftAngleDeg > 13 && speedKmh > 38 && groundedCount >= 2) {
      t.isDrifting = true;
      v.driftChainTimer = 2.6;
      v.driftSegmentActive = true;
      const basePts = t.driftAngleDeg * speedKmh * dt * 0.14 * (wallBonus ? 1.5 : 1.0);
      t.driftPoints += basePts;
      t.driftCombo = Math.min(5.0, 1 + Math.floor(t.driftPoints / 450) * 0.5);
    } else {
      t.isDrifting = false;
      if (v.driftSegmentActive) {
        v.driftChainTimer -= dt;
        if (v.driftChainTimer <= 0 || t.impactIntensity > 0.45) {
          if (t.impactIntensity <= 0.45) {
            t.totalDriftScore += t.driftPoints * t.driftCombo;
          }
          t.driftPoints = 0;
          t.driftCombo = 1;
          v.driftSegmentActive = false;
        }
      }
    }

    // 8. Playable Radius Guardrail Clamp
    const radialDist = Math.hypot(pos.x, pos.z);
    if (radialDist > WORLD_PLAYABLE_RADIUS) {
      const scale = WORLD_PLAYABLE_RADIUS / radialDist;
      v.body.setTranslation({ x: pos.x * scale, y: pos.y, z: pos.z * scale }, true);
    }

    // 9. Track Checkpoints & Lap/Sector Timing
    const track = TRACKS[trackId];
    if (raceActive && track && track.waypoints.length > 0 && !t.raceFinished) {
      const cp = track.waypoints[t.checkpointIndex];
      const nextCp = track.waypoints[(t.checkpointIndex + 1) % track.waypoints.length];
      const toCpX = cp.x - pos.x;
      const toCpZ = cp.z - pos.z;
      const distSq = toCpX * toCpX + toCpZ * toCpZ;

      const dirX = nextCp.x - cp.x;
      const dirZ = nextCp.z - cp.z;
      const dirLen = Math.hypot(dirX, dirZ) || 1;
      const fwdDot = (_fwd.x * dirX + _fwd.z * dirZ) / dirLen;
      t.wrongWay = speedKmh > 25 && fwdDot < -0.55;

      const totalCps = track.waypoints.length;
      const newSector = Math.min(2, Math.floor((t.checkpointIndex / totalCps) * 3));
      if (newSector !== t.sectorIndex) {
        const secMs = Math.round(v.raceElapsedMs - v.sectorStartMs);
        t.sectorTimesMs[t.sectorIndex] = secMs;
        v.sectorStartMs = v.raceElapsedMs;
        t.sectorIndex = newSector;
      }

      if (distSq < 23 * 23) {
        t.checkpointIndex += 1;
        if (t.checkpointIndex >= totalCps) {
          const finalSecMs = Math.round(v.raceElapsedMs - v.sectorStartMs);
          t.sectorTimesMs[2] = finalSecMs;
          v.sectorStartMs = v.raceElapsedMs;
          t.sectorIndex = 0;

          const lapTime = Math.round(v.raceElapsedMs - v.lapStartMs);
          t.lapTimesMs.push(lapTime);
          if (t.bestLapMs === null || lapTime < t.bestLapMs) {
            t.bestLapMs = lapTime;
          }
          v.lapStartMs = v.raceElapsedMs;
          t.checkpointIndex = 0;

          if (t.lap >= track.laps) {
            t.raceFinished = true;
            t.finishTimeMs = Math.round(v.raceElapsedMs);
          } else {
            t.lap += 1;
          }
        }
      }

      const totalSteps = track.laps * totalCps;
      const currentSteps = (t.lap - 1) * totalCps + t.checkpointIndex;
      t.raceProgress = t.raceFinished ? 1 : Math.min(0.999, currentSteps / Math.max(1, totalSteps));
    } else {
      t.wrongWay = false;
    }
  }

  public dispose(): void {
    this.vehicles.clear();
    this.world.free();
  }
}
