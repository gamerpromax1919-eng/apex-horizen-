import { create } from 'zustand';
import {
  CAR_ROSTER,
  STARTER_OWNED_CAR_IDS,
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
import { getCarUpgradeMaxStage, getUpgradeStageCost } from '../physics/tuning';
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
  ownedCarIds: string[];
  glbModelId: CarModelSelection;
  playerName: string;
  credits: number;
  xp: number;
  customizations: Record<string, CarCustomization>;
  tunings: Record<string, TuningSetup>;
  upgrades: Record<string, UpgradeLevels>;
  purchasedUpgrades: Record<string, UpgradeLevels>;
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
        const ownedSet = new Set<string>(
          Array.isArray(parsed.ownedCarIds) && parsed.ownedCarIds.length > 0
            ? parsed.ownedCarIds
            : STARTER_OWNED_CAR_IDS
        );
        ownedSet.add(parsed.carId);
        const upgradesMap: Record<string, UpgradeLevels> = parsed.upgrades || {
          [initialCar.id]: createDefaultUpgrades(),
        };
        return {
          carId: parsed.carId,
          ownedCarIds: Array.from(ownedSet),
          glbModelId: parsed.glbModelId || 'auto',
          playerName: parsed.playerName || 'ApexDriver',
          credits: typeof parsed.credits === 'number' ? parsed.credits : 125000,
          xp: typeof parsed.xp === 'number' ? parsed.xp : 1200,
          customizations: parsed.customizations || { [initialCar.id]: createDefaultCustomization(initialCar) },
          tunings: parsed.tunings || { [initialCar.id]: createDefaultTuning(initialCar) },
          upgrades: upgradesMap,
          purchasedUpgrades: parsed.purchasedUpgrades || upgradesMap,
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
    ownedCarIds: [...STARTER_OWNED_CAR_IDS],
    glbModelId: 'auto',
    playerName: 'ApexDriver',
    credits: 125000,
    xp: 1200,
    customizations: { [initialCar.id]: createDefaultCustomization(initialCar) },
    tunings: { [initialCar.id]: createDefaultTuning(initialCar) },
    upgrades: { [initialCar.id]: createDefaultUpgrades() },
    purchasedUpgrades: { [initialCar.id]: createDefaultUpgrades() },
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
  ownedCarIds: string[];
  testDriveCarId: string | null;
  preTestDriveCarId: string | null;
  glbModelId: CarModelSelection;
  activeModelCredit: string | null;
  playerName: string;
  credits: number;
  xp: number;
  customizations: Record<string, CarCustomization>;
  tunings: Record<string, TuningSetup>;
  upgrades: Record<string, UpgradeLevels>;
  purchasedUpgrades: Record<string, UpgradeLevels>;
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
  buyCar: (carId: string) => boolean;
  startTestDrive: (carId: string) => void;
  exitTestDrive: () => void;
  setGlbModelId: (modelId: CarModelSelection) => void;
  setActiveModelCredit: (credit: string | null) => void;
  setPlayerName: (name: string) => void;
  updateCustomization: (c: CarCustomization, targetCarId?: string) => void;
  updateTuning: (t: TuningSetup, targetCarId?: string) => void;
  purchaseUpgrade: (part: keyof UpgradeLevels, targetCarId?: string) => boolean;
  setUpgradeStage: (part: keyof UpgradeLevels, stage: number, targetCarId?: string) => void;
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
    // Never persist temporary unowned test-drive car as active equipped car
    const activeOwnedCarId =
      state.testDriveCarId && !state.ownedCarIds.includes(state.testDriveCarId)
        ? state.preTestDriveCarId && state.ownedCarIds.includes(state.preTestDriveCarId)
          ? state.preTestDriveCarId
          : state.ownedCarIds[0] ?? state.carId
        : state.carId;
    const payload: PersistedProfile = {
      carId: activeOwnedCarId,
      ownedCarIds: state.ownedCarIds,
      glbModelId: state.glbModelId,
      playerName: state.playerName,
      credits: state.credits,
      xp: state.xp,
      customizations: state.customizations,
      tunings: state.tunings,
      upgrades: state.upgrades,
      purchasedUpgrades: state.purchasedUpgrades,
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
  ownedCarIds: initialProfile.ownedCarIds,
  testDriveCarId: null,
  preTestDriveCarId: null,
  glbModelId: initialProfile.glbModelId,
  activeModelCredit: null,
  playerName: initialProfile.playerName,
  credits: initialProfile.credits,
  xp: initialProfile.xp,
  customizations: initialProfile.customizations,
  tunings: initialProfile.tunings,
  upgrades: initialProfile.upgrades,
  purchasedUpgrades: initialProfile.purchasedUpgrades,
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
  escEnabled: true,
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
    const purchasedUpgrades = {
      ...s.purchasedUpgrades,
      [carId]: s.purchasedUpgrades[carId] ?? createDefaultUpgrades(),
    };
    set({
      carId,
      testDriveCarId: null,
      preTestDriveCarId: null,
      customizations,
      tunings,
      upgrades,
      purchasedUpgrades,
    });
    persist(get());
  },

  buyCar: (carId) => {
    const car = getCarById(carId);
    const s = get();
    if (s.ownedCarIds.includes(carId)) {
      get().selectCar(carId);
      return true;
    }
    if (s.credits < car.priceCr) {
      return false;
    }
    const nextOwned = [...s.ownedCarIds, carId];
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
    const purchasedUpgrades = {
      ...s.purchasedUpgrades,
      [carId]: s.purchasedUpgrades[carId] ?? createDefaultUpgrades(),
    };
    set({
      credits: s.credits - car.priceCr,
      ownedCarIds: nextOwned,
      carId,
      testDriveCarId: null,
      preTestDriveCarId: null,
      customizations,
      tunings,
      upgrades,
      purchasedUpgrades,
    });
    persist(get());
    return true;
  },

  startTestDrive: (carId) => {
    const car = getCarById(carId);
    const s = get();
    const restoreId = s.testDriveCarId ? s.preTestDriveCarId : s.carId;
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
    const purchasedUpgrades = {
      ...s.purchasedUpgrades,
      [carId]: s.purchasedUpgrades[carId] ?? createDefaultUpgrades(),
    };
    set({
      carId,
      testDriveCarId: carId,
      preTestDriveCarId: restoreId ?? s.ownedCarIds[0] ?? CAR_ROSTER[0].id,
      customizations,
      tunings,
      upgrades,
      purchasedUpgrades,
      activeModal: 'none',
      gameMode: 'playing',
    });
  },

  exitTestDrive: () => {
    const s = get();
    const targetId =
      s.preTestDriveCarId && s.ownedCarIds.includes(s.preTestDriveCarId)
        ? s.preTestDriveCarId
        : s.ownedCarIds[0] ?? CAR_ROSTER[0].id;
    set({
      carId: targetId,
      testDriveCarId: null,
      preTestDriveCarId: null,
    });
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

  updateCustomization: (c, targetCarId) => {
    const s = get();
    const id = targetCarId ?? s.carId;
    set({ customizations: { ...s.customizations, [id]: c } });
    persist(get());
  },

  updateTuning: (t, targetCarId) => {
    const s = get();
    const id = targetCarId ?? s.carId;
    set({ tunings: { ...s.tunings, [id]: t } });
    persist(get());
  },

  purchaseUpgrade: (part, targetCarId) => {
    const s = get();
    const id = targetCarId ?? s.carId;
    const car = getCarById(id);
    const maxSlot = getCarUpgradeMaxStage(car, part);
    if (maxSlot <= 0) return false;

    const currEquipped = s.upgrades[id] ?? createDefaultUpgrades();
    const currPurchased = s.purchasedUpgrades[id] ?? createDefaultUpgrades();
    const unlockedMax = Math.min(maxSlot, currPurchased[part] ?? 0);

    // If next stage is already unlocked, install it at zero cost
    const nextTarget = currEquipped[part] + 1;
    if (nextTarget <= unlockedMax) {
      set({
        upgrades: {
          ...s.upgrades,
          [id]: { ...currEquipped, [part]: nextTarget },
        },
      });
      persist(get());
      return true;
    }

    // Buy the next locked stage up to maxSlot
    if (unlockedMax < maxSlot) {
      const stageToBuy = unlockedMax + 1;
      const cost = getUpgradeStageCost(part, stageToBuy);
      if (s.credits < cost) return false;
      set({
        credits: s.credits - cost,
        upgrades: {
          ...s.upgrades,
          [id]: { ...currEquipped, [part]: stageToBuy },
        },
        purchasedUpgrades: {
          ...s.purchasedUpgrades,
          [id]: { ...currPurchased, [part]: stageToBuy },
        },
      });
      persist(get());
      return true;
    }

    // Already unlocked up to maxSlot: cycle back to stock (0) for fine PI class balancing
    const cycled = (currEquipped[part] + 1) % (maxSlot + 1);
    set({
      upgrades: {
        ...s.upgrades,
        [id]: { ...currEquipped, [part]: cycled },
      },
    });
    persist(get());
    return true;
  },

  setUpgradeStage: (part, stage, targetCarId) => {
    const s = get();
    const id = targetCarId ?? s.carId;
    const car = getCarById(id);
    const maxSlot = getCarUpgradeMaxStage(car, part);
    const currEquipped = s.upgrades[id] ?? createDefaultUpgrades();
    const currPurchased = s.purchasedUpgrades[id] ?? createDefaultUpgrades();
    const unlockedMax = Math.min(maxSlot, currPurchased[part] ?? 0);
    const clamped = Math.max(0, Math.min(unlockedMax, stage));
    set({
      upgrades: {
        ...s.upgrades,
        [id]: { ...currEquipped, [part]: clamped },
      },
    });
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
