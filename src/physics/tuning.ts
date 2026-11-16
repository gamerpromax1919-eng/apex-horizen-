import {
  STAGE_MULTIPLIERS,
  computeTorqueAtRpm as sharedComputeTorqueAtRpm,
} from '../../shared/vehicle/drivetrain';
import { TIRE_COMPOUND_STATS } from '../../shared/vehicle/pacejka';
import { classifyCarPi } from '../../shared/cars.config';
import type {
  CarClass,
  CarDefinition,
  DynoPoint,
  EffectiveCarSpecs,
  EngineStage,
  SharedCarConfig,
  TuningSetup,
  UpgradeLevels,
} from '../config/types';

export { TIRE_COMPOUND_STATS };

export type TuningPresetId = 'balanced' | 'track_grip' | 'top_speed' | 'drift' | 'baja_rally';

export function applyUpgradesToTuning(
  car: CarDefinition & Partial<SharedCarConfig>,
  tuning: TuningSetup,
  upgrades: UpgradeLevels
): { effectiveCar: CarDefinition & Partial<SharedCarConfig>; effectiveTuning: TuningSetup } {
  const slots = car.upgradeSlots;
  const engLvl = Math.min(slots?.engineMaxStage ?? 3, upgrades.engine);
  const tireLvl = Math.min(slots?.tiresMaxLevel ?? 3, upgrades.tires);
  const suspLvl = Math.min(slots?.suspensionMaxLevel ?? 3, upgrades.suspension);
  const turboLvl = Math.min(slots?.turboMaxLevel ?? 3, upgrades.turbo);
  const weightLvl = Math.min(slots?.weightMaxLevel ?? 3, upgrades.weightReduction);
  const aeroLvl = Math.min(slots?.aeroMaxLevel ?? 3, upgrades.aero);

  const stages: EngineStage[] = ['stock', 'street', 'sport', 'race', 'pro'];
  const baseIdx = stages.indexOf(tuning.engineStage);
  const upgradedStage = stages[Math.min(4, Math.max(baseIdx, engLvl))];

  const effectiveWeight = Math.max(940, car.baseWeightKg - weightLvl * 48);

  const boostedPsi = Math.min(28, tuning.boostPsi + turboLvl * 3.5);
  const upgradedAero = Math.min(1.0, tuning.aeroDownforce + aeroLvl * 0.1);

  const tireMap: TuningSetup['tireCompound'][] = [tuning.tireCompound, 'street', 'semislick', 'slick'];
  const upgradedTire =
    tireLvl > 0 && tuning.tireCompound !== 'offroad'
      ? tireMap[Math.min(3, tireLvl)]
      : tuning.tireCompound;

  const effectiveCar: CarDefinition & Partial<SharedCarConfig> = {
    ...car,
    baseWeightKg: effectiveWeight,
  };

  const effectiveTuning: TuningSetup = {
    ...tuning,
    engineStage: upgradedStage,
    boostPsi: car.archetype === 'ev' ? 0 : boostedPsi,
    tireCompound: upgradedTire,
    springStiffness: Math.min(1.5, tuning.springStiffness + suspLvl * 0.08),
    damperBump: Math.min(1.5, tuning.damperBump + suspLvl * 0.07),
    damperRebound: Math.min(1.5, tuning.damperRebound + suspLvl * 0.07),
    aeroDownforce: upgradedAero,
  };

  return { effectiveCar, effectiveTuning };
}

export function applyTuningPreset(
  car: CarDefinition,
  current: TuningSetup,
  preset: TuningPresetId
): TuningSetup {
  const next: TuningSetup = {
    ...current,
    gearRatios: [...current.gearRatios] as [number, number, number, number, number, number],
  };

  switch (preset) {
    case 'balanced':
      next.engineStage = 'sport';
      next.boostPsi = Math.min(24, Math.max(car.baseBoostPsi, 14));
      next.ecuTimingDeg = 2;
      next.revLimitRpm = Math.min(9800, car.baseRedlineRpm + 300);
      next.finalDrive = car.defaultFinalDrive;
      next.rideHeightMm = 0;
      next.springStiffness = 1.05;
      next.damperBump = 0.95;
      next.damperRebound = 1.08;
      next.antiRollBar = 1.0;
      next.camberDeg = -1.8;
      next.tireCompound = 'semislick';
      next.aeroDownforce = 0.5;
      next.diffType = 'lsd';
      next.diffBiasRear = car.drivetrain === 'RWD' ? 1.0 : 0.65;
      next.lsdLock = 0.55;
      break;
    case 'track_grip':
      next.engineStage = 'race';
      next.boostPsi = 20;
      next.ecuTimingDeg = 4;
      next.revLimitRpm = Math.min(10000, car.baseRedlineRpm + 600);
      next.finalDrive = Number((car.defaultFinalDrive * 1.06).toFixed(2));
      next.rideHeightMm = -28;
      next.springStiffness = 1.38;
      next.damperBump = 1.25;
      next.damperRebound = 1.35;
      next.antiRollBar = 1.3;
      next.camberDeg = -3.2;
      next.tireCompound = 'slick';
      next.aeroDownforce = 0.92;
      next.diffType = 'lsd';
      next.diffBiasRear = car.drivetrain === 'RWD' ? 1.0 : 0.6;
      next.lsdLock = 0.72;
      break;
    case 'top_speed':
      next.engineStage = 'pro';
      next.boostPsi = 28;
      next.ecuTimingDeg = 6;
      next.revLimitRpm = 9800;
      next.finalDrive = 2.75;
      next.rideHeightMm = -35;
      next.springStiffness = 1.25;
      next.damperBump = 1.1;
      next.damperRebound = 1.2;
      next.antiRollBar = 1.15;
      next.camberDeg = -1.2;
      next.tireCompound = 'semislick';
      next.aeroDownforce = 0.12;
      next.nitrousShotHp = 200;
      break;
    case 'drift':
      next.engineStage = 'race';
      next.boostPsi = 22;
      next.ecuTimingDeg = 3;
      next.finalDrive = 4.15;
      next.rideHeightMm = -18;
      next.springStiffness = 1.15;
      next.damperBump = 1.05;
      next.damperRebound = 1.15;
      next.antiRollBar = 1.25;
      next.camberDeg = -4.2;
      next.tireCompound = 'street';
      next.aeroDownforce = 0.2;
      next.diffType = 'locked';
      next.diffBiasRear = 1.0;
      next.lsdLock = 0.96;
      next.brakeBiasFront = 0.7;
      break;
    case 'baja_rally':
      next.engineStage = 'race';
      next.boostPsi = 21;
      next.ecuTimingDeg = 2;
      next.finalDrive = 4.25;
      next.rideHeightMm = 52;
      next.springStiffness = 0.65;
      next.damperBump = 0.75;
      next.damperRebound = 0.85;
      next.antiRollBar = 0.75;
      next.camberDeg = -0.6;
      next.tireCompound = 'offroad';
      next.aeroDownforce = 0.35;
      next.diffType = 'lsd';
      next.diffBiasRear = car.drivetrain === 'RWD' ? 1.0 : 0.52;
      next.lsdLock = 0.8;
      break;
  }
  return next;
}

export function computeTorqueAtRpm(
  car: CarDefinition & Partial<SharedCarConfig>,
  tuning: TuningSetup,
  rpm: number
): number {
  return sharedComputeTorqueAtRpm(car, tuning, rpm);
}

export function computeDynoCurve(
  car: CarDefinition & Partial<SharedCarConfig>,
  tuning: TuningSetup
): DynoPoint[] {
  const points: DynoPoint[] = [];
  const startRpm = 1500;
  const endRpm = Math.max(6000, tuning.revLimitRpm);
  const steps = 16;

  for (let i = 0; i <= steps; i++) {
    const rpm = Math.round(startRpm + ((endRpm - startRpm) * i) / steps);
    const torqueNm = computeTorqueAtRpm(car, tuning, rpm);
    const hp = (torqueNm * rpm) / 7127;
    points.push({
      rpm,
      hp: Math.round(hp),
      torqueNm: Math.round(torqueNm),
    });
  }
  return points;
}

export function classifyPI(pi: number): CarClass {
  return classifyCarPi(pi);
}

export function computeEffectiveSpecs(
  car: CarDefinition & Partial<SharedCarConfig>,
  tuning: TuningSetup,
  upgrades?: UpgradeLevels
): EffectiveCarSpecs {
  const resolved = upgrades
    ? applyUpgradesToTuning(car, tuning, upgrades)
    : { effectiveCar: car, effectiveTuning: tuning };
  const effCar = resolved.effectiveCar;
  const effTune = resolved.effectiveTuning;

  const stage = STAGE_MULTIPLIERS[effTune.engineStage];
  const dynoCurve = computeDynoCurve(effCar, effTune);

  let peakHp = 0;
  let peakHpRpm = 6000;
  let peakTorqueNm = 0;
  let peakTorqueRpm = 4500;

  for (const pt of dynoCurve) {
    if (pt.hp > peakHp) {
      peakHp = pt.hp;
      peakHpRpm = pt.rpm;
    }
    if (pt.torqueNm > peakTorqueNm) {
      peakTorqueNm = pt.torqueNm;
      peakTorqueRpm = pt.rpm;
    }
  }

  const weightKg = Math.max(920, Math.round(effCar.baseWeightKg + stage.weightDelta));
  const powerToWeight = peakHp / (weightKg / 1000);

  const tireStats = TIRE_COMPOUND_STATS[effTune.tireCompound];
  const carGripBonus = effCar.tireGripMultiplier ?? 1.0;
  const downforceScale = effCar.downforceScale ?? 1.0;
  const camberBonus = Math.min(0.14, Math.abs(effTune.camberDeg) * 0.032);
  const downforceBonus = effTune.aeroDownforce * downforceScale * 0.18;
  const heightBonus =
    effTune.rideHeightMm < 0
      ? Math.abs(effTune.rideHeightMm) * 0.0015
      : -effTune.rideHeightMm * 0.002;
  const lateralG = Number(
    Math.max(
      0.85,
      Math.min(2.15, 0.98 * tireStats.dryGrip * carGripBonus + camberBonus + downforceBonus + heightBonus)
    ).toFixed(2)
  );

  const aeroDrag = 0.36 + effTune.aeroDownforce * 0.18 + tireStats.dragPenalty;
  const powerLimitedSpeed = Math.pow((peakHp * 745.7) / (0.65 * aeroDrag * 2.65), 1 / 3) * 3.6;
  const sixthGearRatio = Math.max(0.55, effTune.gearRatios[5]) * effTune.finalDrive;
  const gearLimitedSpeed = (effTune.revLimitRpm / sixthGearRatio) * 0.128;
  const topSpeedKmh = Math.round(Math.min(powerLimitedSpeed, gearLimitedSpeed));

  const tractionFactor =
    (effCar.drivetrain === 'AWD' ? 1.18 : 0.94) *
    (0.85 + tireStats.dryGrip * carGripBonus * 0.25) *
    (0.9 + (effTune.finalDrive - 2.5) * 0.06);
  const zeroToHundredSec = Number(
    Math.max(1.65, Math.min(7.5, 920 / (powerToWeight * tractionFactor))).toFixed(2)
  );

  const offroadScore = Math.round(
    Math.min(
      100,
      Math.max(
        15,
        (effTune.tireCompound === 'offroad' ? 52 : 18) +
          (effCar.drivetrain === 'AWD' ? 20 : 6) +
          Math.max(0, effTune.rideHeightMm) * 0.45 +
          (1.5 - effTune.springStiffness) * 14
      )
    )
  );

  const rawPi =
    430 +
    powerToWeight * 0.48 +
    (lateralG - 0.9) * 165 +
    (topSpeedKmh - 210) * 0.58 +
    (4.8 - zeroToHundredSec) * 38;
  const piRating = Math.round(Math.max(550, Math.min(999, rawPi)));

  return {
    peakHp,
    peakHpRpm,
    peakTorqueNm,
    peakTorqueRpm,
    weightKg,
    topSpeedKmh,
    zeroToHundredSec,
    lateralG,
    offroadScore,
    piRating,
    carClass: classifyPI(piRating),
    dynoCurve,
  };
}

export interface UpgradeCatalogItem {
  key: keyof UpgradeLevels;
  label: string;
  desc: string;
  stageCosts: [number, number, number];
}

export const UPGRADE_CATALOG: UpgradeCatalogItem[] = [
  {
    key: 'engine',
    label: 'Engine Internals',
    desc: '+14% HP & higher redline per stage',
    stageCosts: [4500, 9500, 18000],
  },
  {
    key: 'turbo',
    label: 'Twin-Scroll Turbo',
    desc: '+3.5 PSI peak boost per stage',
    stageCosts: [5000, 11000, 21000],
  },
  {
    key: 'tires',
    label: 'Tire Compound',
    desc: 'Street → Semi-Slick → Racing Slicks',
    stageCosts: [3800, 8200, 15500],
  },
  {
    key: 'suspension',
    label: 'Coilover Kit',
    desc: '+8% spring & damper authority',
    stageCosts: [3200, 7000, 13000],
  },
  {
    key: 'weightReduction',
    label: 'Carbon Chassis',
    desc: '-48 kg curb weight per stage',
    stageCosts: [4200, 9200, 17500],
  },
  {
    key: 'aero',
    label: 'Active Aero',
    desc: '+10% speed-squared downforce',
    stageCosts: [3000, 6800, 12500],
  },
];

export function getCarUpgradeMaxStage(
  car: Partial<SharedCarConfig>,
  part: keyof UpgradeLevels
): number {
  const slots = car.upgradeSlots;
  if (!slots) return 3;
  switch (part) {
    case 'engine':
      return slots.engineMaxStage;
    case 'tires':
      return slots.tiresMaxLevel;
    case 'suspension':
      return slots.suspensionMaxLevel;
    case 'turbo':
      return slots.turboMaxLevel;
    case 'weightReduction':
      return slots.weightMaxLevel;
    case 'aero':
      return slots.aeroMaxLevel;
  }
}

export function getUpgradeStageCost(part: keyof UpgradeLevels, targetStage: number): number {
  if (targetStage <= 0) return 0;
  const item = UPGRADE_CATALOG.find((u) => u.key === part);
  if (!item) return 5000;
  return item.stageCosts[Math.min(2, Math.max(0, targetStage - 1))];
}

export type ShowroomStatKey = 'power' | 'handling' | 'weight' | 'speed';

export interface ShowroomStatBar {
  key: ShowroomStatKey;
  label: string;
  score: number; // 0..100
  baselineScore: number; // 0..100
  delta: number;
  valueLabel: string;
}

function clampScore(v: number): number {
  return Math.round(Math.max(8, Math.min(100, v)));
}

function scorePower(hp: number): number {
  return clampScore(((hp - 320) / 1080) * 88 + 12);
}

function scoreHandling(lateralG: number): number {
  return clampScore(((lateralG - 0.85) / 0.85) * 88 + 12);
}

function scoreWeightLightness(weightKg: number): number {
  // Lower curb weight yields a higher lightness/agility bar score
  return clampScore(((1720 - weightKg) / 760) * 86 + 14);
}

function scoreTopSpeed(topSpeedKmh: number): number {
  return clampScore(((topSpeedKmh - 200) / 230) * 88 + 12);
}

export function computeShowroomStatBars(
  specs: EffectiveCarSpecs,
  baselineSpecs?: EffectiveCarSpecs
): ShowroomStatBar[] {
  const base = baselineSpecs ?? specs;
  const p = scorePower(specs.peakHp);
  const bp = scorePower(base.peakHp);

  const h = scoreHandling(specs.lateralG);
  const bh = scoreHandling(base.lateralG);

  const w = scoreWeightLightness(specs.weightKg);
  const bw = scoreWeightLightness(base.weightKg);

  const s = scoreTopSpeed(specs.topSpeedKmh);
  const bs = scoreTopSpeed(base.topSpeedKmh);

  return [
    {
      key: 'power',
      label: 'Power',
      score: p,
      baselineScore: bp,
      delta: p - bp,
      valueLabel: `${specs.peakHp} HP`,
    },
    {
      key: 'handling',
      label: 'Handling',
      score: h,
      baselineScore: bh,
      delta: h - bh,
      valueLabel: `${specs.lateralG.toFixed(2)} G`,
    },
    {
      key: 'weight',
      label: 'Weight',
      score: w,
      baselineScore: bw,
      delta: w - bw,
      valueLabel: `${specs.weightKg} kg`,
    },
    {
      key: 'speed',
      label: 'Speed',
      score: s,
      baselineScore: bs,
      delta: s - bs,
      valueLabel: `${specs.topSpeedKmh} km/h`,
    },
  ];
}

