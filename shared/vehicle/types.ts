export type CarClass = 'B' | 'A' | 'S1' | 'S2' | 'X';
export type DrivetrainType = 'RWD' | 'AWD' | 'FWD';
export type BodyArchetype =
  | 'hypercar'
  | 'supercar'
  | 'coupe'
  | 'jdm'
  | 'gt'
  | 'rally'
  | 'trophy'
  | 'muscle'
  | 'ev';

export type PaintFinish = 'metallic' | 'matte' | 'pearlescent' | 'carbon';
export type LiveryStyle =
  | 'none'
  | 'dual_stripe'
  | 'horizon_split'
  | 'carbon_hood'
  | 'racing_number';
export type RimStyle = 'forged_5' | 'mesh_multi' | 'aero_dish' | 'rally_fan';
export type AeroKit = 'stock' | 'street' | 'gt_wing';

export type EngineStage = 'stock' | 'street' | 'sport' | 'race' | 'pro';
export type TireCompound = 'street' | 'semislick' | 'slick' | 'offroad';
export type DiffType = 'open' | 'lsd' | 'locked';
export type DrivePreset = 'arcade' | 'sim_lite' | 'sim';
export type SteeringAssistMode = 'off' | 'countersteer' | 'stability' | 'full';
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export type WeatherId =
  | 'clear_golden'
  | 'overcast_dusk'
  | 'heavy_rain'
  | 'thunderstorm'
  | 'sandstorm';
export type TimeOfDayId = 'dawn' | 'noon' | 'golden_hour' | 'midnight';
export type SurfaceType =
  | 'asphalt'
  | 'wet_asphalt'
  | 'curb'
  | 'dirt'
  | 'grass'
  | 'sand'
  | 'gravel'
  | 'puddle';
export type TrackId = 'free_roam' | 'festival_circuit' | 'canyon_sprint' | 'baja_rally';

export type CarGlbModelId =
  | 'ferrari'
  | 'porsche_911'
  | 'concept_sport'
  | 'dodge_challenger';

export interface PowerCurveParams {
  idleRpm: number;
  peakTorqueRpmRatio: number; // 0..1 of redline
  curveWidth: number; // higher = broader torque band
  spoolRpmRatio: number; // turbo spool threshold
  highEndDropoff: number; // drop above peak
}

export interface CarUpgradeSlots {
  engineMaxStage: number; // 0..3
  tiresMaxLevel: number; // 0..3
  suspensionMaxLevel: number; // 0..3
  turboMaxLevel: number; // 0..3 (0 for EV)
  weightMaxLevel: number; // 0..3
  aeroMaxLevel: number; // 0..3
}

export interface WheelNodeNameMap {
  fl: string[];
  fr: string[];
  rl: string[];
  rr: string[];
}

export interface CarDefinition {
  id: string;
  name: string;
  manufacturer: string;
  year: number;
  category: string;
  archetype: BodyArchetype;
  drivetrain: DrivetrainType;
  baseWeightKg: number;
  baseHp: number;
  baseTorqueNm: number;
  baseRedlineRpm: number;
  baseBoostPsi: number;
  wheelbaseM: number;
  trackWidthM: number;
  bodyLengthM: number;
  bodyWidthM: number;
  bodyHeightM: number;
  comHeightOffsetM: number;
  defaultColor: string;
  defaultSecondary: string;
  defaultRimStyle: RimStyle;
  defaultAero: AeroKit;
  defaultTire: TireCompound;
  defaultGearRatios: [number, number, number, number, number, number];
  defaultFinalDrive: number;
  engineNoteBaseHz: number;
}

export interface SharedCarConfig extends CarDefinition {
  glbModelId: CarGlbModelId;
  glbUrl: string;
  fallbackGlbUrl: string;
  scale: number;
  wheelNodeNames: WheelNodeNameMap;
  tireGripMultiplier: number;
  downforceScale: number;
  dragAreaCdA: number;
  powerCurve: PowerCurveParams;
  upgradeSlots: CarUpgradeSlots;
  basePi: number;
  baseClass: CarClass;
}

export interface CarCustomization {
  primaryColor: string;
  secondaryColor: string;
  caliperColor: string;
  rimColor: string;
  paintFinish: PaintFinish;
  livery: LiveryStyle;
  rimStyle: RimStyle;
  aeroKit: AeroKit;
  windowTint: number;
}

export interface UpgradeLevels {
  engine: number; // 0..3
  tires: number; // 0..3
  suspension: number; // 0..3
  turbo: number; // 0..3
  weightReduction: number; // 0..3
  aero: number; // 0..3
}

export interface TuningSetup {
  engineStage: EngineStage;
  boostPsi: number;
  ecuTimingDeg: number;
  revLimitRpm: number;
  nitrousShotHp: number;
  finalDrive: number;
  gearRatios: [number, number, number, number, number, number];
  diffType: DiffType;
  diffBiasRear: number;
  lsdLock: number;
  rideHeightMm: number;
  springStiffness: number;
  damperBump: number;
  damperRebound: number;
  antiRollBar: number;
  camberDeg: number;
  brakeBiasFront: number;
  brakePressure: number;
  tireCompound: TireCompound;
  aeroDownforce: number;
}

export interface DynoPoint {
  rpm: number;
  hp: number;
  torqueNm: number;
}

export interface EffectiveCarSpecs {
  peakHp: number;
  peakHpRpm: number;
  peakTorqueNm: number;
  peakTorqueRpm: number;
  weightKg: number;
  topSpeedKmh: number;
  zeroToHundredSec: number;
  lateralG: number;
  offroadScore: number;
  piRating: number;
  carClass: CarClass;
  dynoCurve: DynoPoint[];
}

export interface GamepadSettings {
  deadzone: number; // 0.02..0.25
  steerSensitivity: number; // 0.6..2.0 (gamma shaping)
  speedSensitiveSteering: number; // 0..1
  triggerSensitivity: number; // 0.7..1.5
  rumbleEnabled: boolean;
}

export interface ControlSample {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  nitrous: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
}

export interface WheelTelemetry {
  name: 'FL' | 'FR' | 'RL' | 'RR';
  grounded: boolean;
  compression: number; // 0..1
  suspensionOffsetM: number;
  normalLoadN: number;
  slipRatio: number;
  slipAngleRad: number;
  longForceN: number;
  latForceN: number;
  surface: SurfaceType;
  gripCoeff: number;
  tireTempC: number;
  tireWear: number; // 0..1 (1 = fresh)
  brakeTempC: number;
  wheelAngularVel: number;
  steerAngleRad: number;
}

export interface VehicleTelemetry {
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
  yaw: number;
  pitch: number;
  roll: number;
  speedKmh: number;
  rpm: number;
  gear: number; // -1 = R, 0 = N, 1..6
  shifting: boolean;
  clutchEngagement: number; // 0..1
  longG: number; // longitudinal G (+ accel, - brake)
  latG: number; // lateral G (+ right, - left)
  frontWeightPct: number; // 0..100 dynamic front axle load %
  boostPsi: number;
  nitrousCharge: number; // 0..1
  nitrousHeat: number; // 0..1
  nitrousOverheated: boolean;
  nitrousActive: boolean;
  steerAngle: number;
  wheelSpin: number;
  driftAngleDeg: number;
  isDrifting: boolean;
  driftPoints: number;
  driftCombo: number;
  driftWallBonus: boolean;
  totalDriftScore: number;
  surface: SurfaceType;
  gripFactor: number;
  absActive: boolean;
  tcsActive: boolean;
  escActive: boolean;
  braking: boolean;
  reversing: boolean;
  indicatorLeft: boolean;
  indicatorRight: boolean;
  dirtLevel: number; // 0..1 accumulated off-road dirt
  wetnessLevel: number; // 0..1 rain sheen
  damageLevel: number; // 0..1
  impactIntensity: number; // 0..1 transient shock for camera shake & sparks
  lap: number;
  sectorIndex: number; // 0..2
  sectorTimesMs: [number | null, number | null, number | null];
  bestLapMs: number | null;
  checkpointIndex: number;
  raceProgress: number;
  racePosition: number;
  totalRacers: number;
  wrongWay: boolean;
  raceFinished: boolean;
  finishTimeMs: number | null;
  lapTimesMs: number[];
  wheels: [WheelTelemetry, WheelTelemetry, WheelTelemetry, WheelTelemetry];
}
