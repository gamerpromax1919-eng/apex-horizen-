import { create } from 'zustand';
import {
  CAR_ROSTER,
  createDefaultCustomization,
  createDefaultTuning,
  createDefaultUpgrades,
  getCarById,
} from '../config/cars';
import type {
  AiRacerSnapshot,
  AudioMixerSettings,
  CameraMode,
  CarCustomization,
  DrivePreset,
  GameModeState,
  GamepadSettings,
  KeyBindings,
  QualityTier,
  SteeringAssistMode,
  TimeOfDayId,
  TrackId,
  TuningSetup,
  UpgradeLevels,
  VehicleTelemetry,
  WeatherId,
} from '../config/types';
import { DEFAULT_GAMEPAD_SETTINGS, DEFAULT_KEY_BINDINGS } from '../config/controls';
import { DRIVE_PRESET_PROFILE } from '../physics/pacejka';
import { createDefaultTelemetry } from '../physics/rapierWorld';
import type { CarModelSelection } from '../vehicle/carModels.config';

export interface ReplayFrame {
  timeSec: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  steerAngle: number;
  wheelSpin: number;
  speedKmh: number;
  braking: boolean;
  nitrousActive: boolean;
}

export interface DebugPhysicsOverrides {
  springScale: number;
  damperScale: number;
  gripScale: number;
  aeroScale: number;
  arbScale: number;
  thermalWear: boolean;
}

const STORAGE_KEY = 'horizon_apex_garage_v2';

interface PersistedProfile {
  carId: string;
  glbModelId: CarModelSelection;
  playerName: string;
  credits: number;
  xp: number;
  customizations: Record<string, CarCustomization>;
  tunings: Record<string, TuningSetup>;
  upgrades: Record<string, UpgradeLevels>;
  keyBindings: KeyBindings;
  gamepadSettings: GamepadSettings;
  steeringAssist: SteeringAssistMode;
}

function loadProfile(): PersistedProfile {
  const initialCar = CAR_ROSTER[0];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.carId) {
        return {
          carId: parsed.carId,
          glbModelId: parsed.glbModelId || 'auto',
          playerName: parsed.playerName || 'ApexDriver',
          credits: typeof parsed.credits === 'number' ? parsed.credits : 125000,
          xp: typeof parsed.xp === 'number' ? parsed.xp : 1200,
          customizations: parsed.customizations || { [initialCar.id]: createDefaultCustomization(initialCar) },
          tunings: parsed.tunings || { [initialCar.id]: createDefaultTuning(initialCar) },
          upgrades: parsed.upgrades || { [initialCar.id]: createDefaultUpgrades() },
          keyBindings: { ...DEFAULT_KEY_BINDINGS, ...(parsed.keyBindings || {}) },
          gamepadSettings: { ...DEFAULT_GAMEPAD_SETTINGS, ...(parsed.gamepadSettings || {}) },
          steeringAssist: parsed.steeringAssist || 'countersteer',
        };
      }
    }
  } catch {
    // ignore storage access issues
  }
  return {
    carId: initialCar.id,
    glbModelId: 'auto',
    playerName: 'ApexDriver',
    credits: 125000,
    xp: 1200,
    customizations: { [initialCar.id]: createDefaultCustomization(initialCar) },
    tunings: { [initialCar.id]: createDefaultTuning(initialCar) },
    upgrades: { [initialCar.id]: createDefaultUpgrades() },
    keyBindings: { ...DEFAULT_KEY_BINDINGS },
    gamepadSettings: { ...DEFAULT_GAMEPAD_SETTINGS },
    steeringAssist: 'countersteer',
  };
}

function detectInitialQualityTier(): { tier: QualityTier; isSoftwareGl: boolean } {
  if (typeof document === 'undefined') {
    return { tier: 'medium', isSoftwareGl: false };
  }
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) return { tier: 'low', isSoftwareGl: true };
    const ext = probe.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
    const gpu = String(probe.getParameter(param));
    probe.getExtension('WEBGL_lose_context')?.loseContext();
    const isSw = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    if (isSw) return { tier: 'low', isSoftwareGl: true };
    const cores = navigator.hardwareConcurrency || 4;
    if (cores >= 8) return { tier: 'high', isSoftwareGl: false };
    return { tier: 'medium', isSoftwareGl: false };
  } catch {
    return { tier: 'low', isSoftwareGl: true };
  }
}

const initialProfile = loadProfile();
const initialEnv = detectInitialQualityTier();

export interface GameStoreState {
  loaded: boolean;
  loadProgress: number;
  isSoftwareGl: boolean;
  qualityTier: QualityTier;
  gameMode: GameModeState;
  activeModal: 'none' | 'garage' | 'weather' | 'multiplayer' | 'engineer' | 'controls';
  carId: string;
  glbModelId: CarModelSelection;
  activeModelCredit: string | null;
  playerName: string;
  credits: number;
  xp: number;
  customizations: Record<string, CarCustomization>;
  tunings: Record<string, TuningSetup>;
  upgrades: Record<string, UpgradeLevels>;
  drivePreset: DrivePreset;
  steeringAssist: SteeringAssistMode;
  gamepadSettings: GamepadSettings;
  weatherId: WeatherId;
  timeOfDayId: TimeOfDayId;
  trackId: TrackId;
  cameraMode: CameraMode;
  manualTransmission: boolean;
  absEnabled: boolean;
  tcsEnabled: boolean;
  escEnabled: boolean;
  rewindsRemaining: number;
  aiCount: number;
  aiDifficulty: 'rookie' | 'pro' | 'unbeatable';
  telemetry: VehicleTelemetry;
  aiRacers: AiRacerSnapshot[];
  bestLapGhost: ReplayFrame[];
  lastRaceReplay: ReplayFrame[];
  replayPlaying: boolean;
  replayIndex: number;
  audioMixer: AudioMixerSettings;
  keyBindings: KeyBindings;
  debugOverrides: DebugPhysicsOverrides;
  fps: number;
  lastRewardCredits: number;
  lastRewardXp: number;

  setLoaded: (loaded: boolean, progress: number) => void;
  setQualityTier: (tier: QualityTier) => void;
  setGameMode: (mode: GameModeState) => void;
  setActiveModal: (modal: GameStoreState['activeModal']) => void;
  selectCar: (carId: string) => void;
  setGlbModelId: (modelId: CarModelSelection) => void;
  setActiveModelCredit: (credit: string | null) => void;
  setPlayerName: (name: string) => void;
  updateCustomization: (c: CarCustomization) => void;
  updateTuning: (t: TuningSetup) => void;
  purchaseUpgrade: (part: keyof UpgradeLevels) => void;
  setDrivePreset: (preset: DrivePreset) => void;
  setSteeringAssist: (mode: SteeringAssistMode) => void;
  setGamepadSettings: (patch: Partial<GamepadSettings>) => void;
  setWeatherId: (w: WeatherId) => void;
  setTimeOfDayId: (t: TimeOfDayId) => void;
  setTrackId: (tr: TrackId) => void;
  setCameraMode: (cam: CameraMode) => void;
  setManualTransmission: (m: boolean) => void;
  setAssists: (a: Partial<{ absEnabled: boolean; tcsEnabled: boolean; escEnabled: boolean }>) => void;
  setTelemetry: (t: VehicleTelemetry) => void;
  setAiRacers: (racers: AiRacerSnapshot[]) => void;
  setAiDifficulty: (d: GameStoreState['aiDifficulty']) => void;
  consumeRewind: () => boolean;
  resetRewinds: () => void;
  awardRaceFinish: (position: number, driftScore: number) => void;
  setBestLapGhost: (frames: ReplayFrame[]) => void;
  setLastRaceReplay: (frames: ReplayFrame[]) => void;
  setReplayState: (playing: boolean, index: number) => void;
  setAudioMixer: (m: Partial<AudioMixerSettings>) => void;
  setKeyBinding: (action: keyof KeyBindings, code: string) => void;
  setDebugOverrides: (d: Partial<DebugPhysicsOverrides>) => void;
  setFps: (fps: number) => void;
}

function persist(state: GameStoreState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: PersistedProfile = {
      carId: state.carId,
      glbModelId: state.glbModelId,
      playerName: state.playerName,
      credits: state.credits,
      xp: state.xp,
      customizations: state.customizations,
      tunings: state.tunings,
      upgrades: state.upgrades,
      keyBindings: state.keyBindings,
      gamepadSettings: state.gamepadSettings,
      steeringAssist: state.steeringAssist,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  loaded: false,
  loadProgress: 0,
  isSoftwareGl: initialEnv.isSoftwareGl,
  qualityTier: initialEnv.tier,
  gameMode: 'title',
  activeModal: 'none',
  carId: initialProfile.carId,
  glbModelId: initialProfile.glbModelId,
  activeModelCredit: null,
  playerName: initialProfile.playerName,
  credits: initialProfile.credits,
  xp: initialProfile.xp,
  customizations: initialProfile.customizations,
  tunings: initialProfile.tunings,
  upgrades: initialProfile.upgrades,
  drivePreset: 'sim_lite',
  steeringAssist: initialProfile.steeringAssist,
  gamepadSettings: initialProfile.gamepadSettings,
  weatherId: 'clear_golden',
  timeOfDayId: 'golden_hour',
  trackId: 'free_roam',
  cameraMode: 'chase',
  manualTransmission: false,
  absEnabled: true,
  tcsEnabled: true,
  escEnabled: false,
  rewindsRemaining: 3,
  aiCount: 5,
  aiDifficulty: 'pro',
  telemetry: createDefaultTelemetry('free_roam'),
  aiRacers: [],
  bestLapGhost: [],
  lastRaceReplay: [],
  replayPlaying: false,
  replayIndex: 0,
  audioMixer: {
    master: 0.72,
    engine: 0.85,
    sfx: 0.78,
    ambience: 0.55,
    music: 0.25,
    muted: false,
  },
  keyBindings: initialProfile.keyBindings,
  debugOverrides: {
    springScale: 1.0,
    damperScale: 1.0,
    gripScale: 1.0,
    aeroScale: 1.0,
    arbScale: 1.0,
    thermalWear: true,
  },
  fps: 60,
  lastRewardCredits: 0,
  lastRewardXp: 0,

  setLoaded: (loaded, loadProgress) => set({ loaded, loadProgress }),
  setQualityTier: (qualityTier) => set({ qualityTier }),
  setGameMode: (gameMode) => set({ gameMode }),
  setActiveModal: (activeModal) => set({ activeModal }),

  selectCar: (carId) => {
    const car = getCarById(carId);
    const s = get();
    const customizations = {
      ...s.customizations,
      [carId]: s.customizations[carId] ?? createDefaultCustomization(car),
    };
    const tunings = {
      ...s.tunings,
      [carId]: s.tunings[carId] ?? createDefaultTuning(car),
    };
    const upgrades = {
      ...s.upgrades,
      [carId]: s.upgrades[carId] ?? createDefaultUpgrades(),
    };
    set({ carId, customizations, tunings, upgrades });
    persist(get());
  },

  setGlbModelId: (glbModelId) => {
    set({ glbModelId });
    persist(get());
  },

  setActiveModelCredit: (activeModelCredit) => set({ activeModelCredit }),

  setPlayerName: (playerName) => {
    set({ playerName });
    persist(get());
  },

  updateCustomization: (c) => {
    const s = get();
    set({ customizations: { ...s.customizations, [s.carId]: c } });
    persist(get());
  },

  updateTuning: (t) => {
    const s = get();
    set({ tunings: { ...s.tunings, [s.carId]: t } });
    persist(get());
  },

  purchaseUpgrade: (part) => {
    const s = get();
    const curr = s.upgrades[s.carId] ?? createDefaultUpgrades();
    const nextLvl = (curr[part] + 1) % 4;
    const nextUpgrades = { ...curr, [part]: nextLvl };
    set({ upgrades: { ...s.upgrades, [s.carId]: nextUpgrades } });
    persist(get());
  },

  setDrivePreset: (drivePreset) => {
    const profile = DRIVE_PRESET_PROFILE[drivePreset];
    set({
      drivePreset,
      absEnabled: profile.defaultAbs,
      tcsEnabled: profile.defaultTcs,
      escEnabled: profile.defaultEsc,
      steeringAssist: profile.defaultSteeringAssist,
    });
    persist(get());
  },

  setSteeringAssist: (steeringAssist) => {
    set({ steeringAssist });
    persist(get());
  },

  setGamepadSettings: (patch) => {
    set((s) => ({ gamepadSettings: { ...s.gamepadSettings, ...patch } }));
    persist(get());
  },

  setWeatherId: (weatherId) => set({ weatherId }),
  setTimeOfDayId: (timeOfDayId) => set({ timeOfDayId }),
  setTrackId: (trackId) => set({ trackId }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setManualTransmission: (manualTransmission) => set({ manualTransmission }),
  setAssists: (a) => set((s) => ({ ...s, ...a })),
  setTelemetry: (telemetry) => set({ telemetry }),
  setAiRacers: (aiRacers) => set({ aiRacers }),
  setAiDifficulty: (aiDifficulty) => set({ aiDifficulty }),

  consumeRewind: () => {
    const rem = get().rewindsRemaining;
    if (rem <= 0) return false;
    set({ rewindsRemaining: rem - 1 });
    return true;
  },
  resetRewinds: () => set({ rewindsRemaining: 3 }),

  awardRaceFinish: (position, driftScore) => {
    const posBonus = Math.max(5000, (8 - position) * 6000);
    const driftBonus = Math.round(driftScore * 0.5);
    const earnedCr = posBonus + driftBonus;
    const earnedXp = Math.round(earnedCr * 0.12);
    set((s) => ({
      credits: s.credits + earnedCr,
      xp: s.xp + earnedXp,
      lastRewardCredits: earnedCr,
      lastRewardXp: earnedXp,
    }));
    persist(get());
  },

  setBestLapGhost: (bestLapGhost) => set({ bestLapGhost }),
  setLastRaceReplay: (lastRaceReplay) => set({ lastRaceReplay }),
  setReplayState: (replayPlaying, replayIndex) => set({ replayPlaying, replayIndex }),
  setAudioMixer: (m) => set((s) => ({ audioMixer: { ...s.audioMixer, ...m } })),
  setKeyBinding: (action, code) => {
    set((s) => ({ keyBindings: { ...s.keyBindings, [action]: code } }));
    persist(get());
  },
  setDebugOverrides: (d) => set((s) => ({ debugOverrides: { ...s.debugOverrides, ...d } })),
  setFps: (fps) => set({ fps }),
}));
