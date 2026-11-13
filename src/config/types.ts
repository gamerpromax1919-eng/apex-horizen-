export type {
  AeroKit,
  BodyArchetype,
  CarClass,
  CarCustomization,
  CarDefinition,
  CarGlbModelId,
  CarUpgradeSlots,
  ControlSample,
  DiffType,
  DrivePreset,
  DrivetrainType,
  DynoPoint,
  EffectiveCarSpecs,
  EngineStage,
  GamepadSettings,
  LiveryStyle,
  PaintFinish,
  PowerCurveParams,
  QualityTier,
  RimStyle,
  SharedCarConfig,
  SteeringAssistMode,
  SurfaceType,
  TimeOfDayId,
  TireCompound,
  TrackId,
  TuningSetup,
  UpgradeLevels,
  VehicleTelemetry,
  WeatherId,
  WheelNodeNameMap,
  WheelTelemetry,
} from '../../shared/vehicle/types';

import type {
  CarCustomization,
  TimeOfDayId,
  TrackId,
  WeatherId,
} from '../../shared/vehicle/types';

export interface WeatherProfile {
  id: WeatherId;
  label: string;
  description: string;
  roadGripMultiplier: number;
  dirtGripMultiplier: number;
  rollingDragMultiplier: number;
  hydroplaneRisk: number;
  windSpeedKmh: number;
  windAngleRad: number;
  rainIntensity: number;
  dustIntensity: number;
  lightningFrequency: number;
  fogDensity: number;
  skyTint: string;
  fogColor: string;
  ambientBoost: number;
  roadRoughness: number;
  windshieldDrops: number;
}

export interface TimeOfDayProfile {
  id: TimeOfDayId;
  label: string;
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  sunColor: string;
  sunIntensity: number;
  hemiSkyColor: string;
  hemiGroundColor: string;
  hemiIntensity: number;
  skyTopColor: string;
  skyHorizonColor: string;
  headlightsOn: boolean;
  starIntensity: number;
  exposure: number;
}

export interface RemotePlayerState {
  id: string;
  name: string;
  carId: string;
  customization: CarCustomization;
  ready: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speedKmh: number;
  steerAngle: number;
  wheelSpin: number;
  gear: number;
  rpm: number;
  nitrousActive: boolean;
  lap: number;
  checkpointIndex: number;
  raceProgress: number;
  finished: boolean;
  finishTimeMs: number | null;
  isHost: boolean;
}

export interface AiRacerSnapshot {
  id: string;
  name: string;
  carId: string;
  customization: CarCustomization;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  yaw: number;
  speedKmh: number;
  steerAngle: number;
  wheelSpin: number;
  braking: boolean;
  nitrousActive: boolean;
  lap: number;
  checkpointIndex: number;
  raceProgress: number;
  finished: boolean;
  finishTimeMs: number | null;
}

export interface LobbyRoomSummary {
  id: string;
  name: string;
  trackId: TrackId;
  weatherId: WeatherId;
  timeOfDayId: TimeOfDayId;
  maxPlayers: number;
  playerCount: number;
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  laps: number;
}

export interface LobbyRoomState extends LobbyRoomSummary {
  hostId: string;
  countdownSec: number;
  raceStartTimeMs: number | null;
  players: RemotePlayerState[];
  chat: Array<{ id: string; sender: string; text: string; timestamp: number }>;
}

export type GameModeState = 'title' | 'playing' | 'paused' | 'gameover' | 'photo' | 'replay';
export type CameraMode = 'chase' | 'far_chase' | 'hood' | 'bumper' | 'cockpit';

export interface KeyBindings {
  throttle: string;
  brake: string;
  steerLeft: string;
  steerRight: string;
  handbrake: string;
  nitrous: string;
  shiftUp: string;
  shiftDown: string;
  camera: string;
  rewind: string;
  photoMode: string;
  replay: string;
  reset: string;
}

export interface AudioMixerSettings {
  master: number;
  engine: number;
  sfx: number;
  ambience: number;
  music: number;
  muted: boolean;
}
