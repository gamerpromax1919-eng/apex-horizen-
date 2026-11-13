import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AiDriverManager, computeAiControlInput } from './ai/aiDriver';
import { AudioEngine } from './audio/AudioEngine';
import { getCarById } from './config/cars';
import { InputController } from './config/controls';
import type {
  CameraMode,
  CarDefinition,
  LobbyRoomState,
  RemotePlayerState,
  SharedCarConfig,
  TrackId,
  VehicleTelemetry,
} from './config/types';
import { TIME_OF_DAY_PROFILES, WEATHER_PROFILES } from './config/weather';
import { CameraRig } from './fx/CameraRig';
import { ParticlesAndSkids } from './fx/ParticlesAndSkids';
import { PostProcessingEffects } from './fx/PostProcessingEffects';
import { useMultiplayer } from './hooks/useMultiplayer';
import {
  createDefaultTelemetry,
  ensureRapierInitialized,
  RapierPhysicsWorld,
} from './physics/rapierWorld';
import { applyUpgradesToTuning } from './physics/tuning';
import { useGameStore, type ReplayFrame } from './store/gameStore';
import { TrackMeshes } from './track/TrackMeshes';
import { TRACKS } from './track/trackData';
import { DebugOverlay } from './ui/DebugOverlay';
import { GarageModal } from './ui/GarageModal';
import { LoadingScreen } from './ui/LoadingScreen';
import { MultiplayerModal } from './ui/MultiplayerModal';
import { PauseFinishModal } from './ui/PauseFinishModal';
import { PhotoReplayOverlay } from './ui/PhotoReplayOverlay';
import { RaceEngineerModal } from './ui/RaceEngineerModal';
import { RacingHud } from './ui/RacingHud';
import { TitleScreen } from './ui/TitleScreen';
import { WeatherModal } from './ui/WeatherModal';
import { CarModel } from './vehicle/CarModel';
import { SkyAndWeather } from './world/SkyAndWeather';
import { TerrainChunks } from './world/TerrainChunks';

const CAMERA_ORDER: CameraMode[] = ['chase', 'far_chase', 'hood', 'bumper', 'cockpit'];

interface SceneControllerProps {
  physicsRef: React.RefObject<RapierPhysicsWorld | null>;
  aiManagerRef: React.RefObject<AiDriverManager>;
  inputRef: React.RefObject<InputController>;
  audioRef: React.RefObject<AudioEngine>;
  telemetryRef: React.RefObject<VehicleTelemetry>;
  remotePlayersRef: React.RefObject<Map<string, RemotePlayerState>>;
  customGlbUrl: string | null;
  onModelStatusChange: (status: {
    loading: boolean;
    credit: string | null;
    loadedModelName: string | null;
  }) => void;
  photoFov: number;
  photoDofFocus: number;
  countdownSec: number;
  sendTelemetry: (t: VehicleTelemetry) => void;
}

function SceneController({
  physicsRef,
  aiManagerRef,
  inputRef,
  audioRef,
  telemetryRef,
  remotePlayersRef,
  customGlbUrl,
  onModelStatusChange,
  photoFov,
  photoDofFocus,
  countdownSec,
  sendTelemetry,
}: SceneControllerProps) {
  const { gl, advance } = useThree();
  const gameMode = useGameStore((s) => s.gameMode);
  const activeModal = useGameStore((s) => s.activeModal);
  const carId = useGameStore((s) => s.carId);
  const glbModelId = useGameStore((s) => s.glbModelId);
  const customizations = useGameStore((s) => s.customizations);
  const tunings = useGameStore((s) => s.tunings);
  const upgrades = useGameStore((s) => s.upgrades);
  const weatherId = useGameStore((s) => s.weatherId);
  const timeOfDayId = useGameStore((s) => s.timeOfDayId);
  const trackId = useGameStore((s) => s.trackId);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const qualityTier = useGameStore((s) => s.qualityTier);
  const isSoftwareGl = useGameStore((s) => s.isSoftwareGl);
  const aiRacers = useGameStore((s) => s.aiRacers);
  const bestLapGhost = useGameStore((s) => s.bestLapGhost);

  const car = getCarById(carId);
  const customization = customizations[carId]!;
  const tuning = tunings[carId]!;
  const carUpgrades = upgrades[carId]!;
  const tod = TIME_OF_DAY_PROFILES[timeOfDayId];
  const weather = WEATHER_PROFILES[weatherId];
  const headlightsOn = tod.headlightsOn || weather.rainIntensity > 0.35;
  const showLightCones = weather.fogDensity > 0.0025 || tod.headlightsOn;

  const hudSyncAccum = useRef(0);
  const netSyncAccum = useRef(0);
  const replayRecordAccum = useRef(0);
  const currentLapFrames = useRef<ReplayFrame[]>([]);
  const fullRaceFrames = useRef<ReplayFrame[]>([]);
  const lastRecordedLap = useRef(1);
  const ghostPoseRef = useRef<{ x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number } | null>(null);
  const fpsAccum = useRef({ frames: 0, elapsed: 0 });
  const prevFinishState = useRef(false);

  // Software-WebGL afterDraw pacing so SwiftShader never starves DOM/Playwright
  useEffect(() => {
    if (!isSoftwareGl) return;
    let alive = true;
    const rawGl = gl.getContext();
    let timerId: number | null = null;

    const scheduleNext = () => {
      if (!alive) return;
      if (rawGl && typeof (rawGl as WebGL2RenderingContext).fenceSync === 'function') {
        const gl2 = rawGl as WebGL2RenderingContext;
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl2.flush();
        const pollFence = () => {
          if (!alive) {
            if (sync) gl2.deleteSync(sync);
            return;
          }
          if (!sync) {
            timerId = window.setTimeout(tick, 80);
            return;
          }
          const status = gl2.clientWaitSync(sync, 0, 0);
          if (status === gl2.TIMEOUT_EXPIRED) {
            timerId = window.setTimeout(pollFence, 16);
          } else {
            gl2.deleteSync(sync);
            timerId = window.setTimeout(tick, 70);
          }
        };
        pollFence();
      } else {
        timerId = window.setTimeout(tick, 85);
      }
    };

    const tick = () => {
      if (!alive) return;
      advance(performance.now());
      scheduleNext();
    };

    timerId = window.setTimeout(tick, 50);
    return () => {
      alive = false;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [isSoftwareGl, gl, advance]);

  // Physics, AI, Ghost, Replay & Audio Simulation Loop
  useFrame((_state, rawDt) => {
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    const store = useGameStore.getState();
    const physics = physicsRef.current;
    if (!physics) return;

    fpsAccum.current.frames += 1;
    fpsAccum.current.elapsed += dt;
    if (fpsAccum.current.elapsed >= 0.5) {
      store.setFps(fpsAccum.current.frames / fpsAccum.current.elapsed);
      fpsAccum.current.frames = 0;
      fpsAccum.current.elapsed = 0;
    }

    const frozen =
      store.gameMode !== 'playing' ||
      store.activeModal !== 'none' ||
      countdownSec > 0;

    // Replay playback scrubbing
    if (store.gameMode === 'replay' && store.lastRaceReplay.length > 0) {
      const frames = store.lastRaceReplay;
      let idx = store.replayIndex;
      if (store.replayPlaying) {
        idx = (idx + 1) % frames.length;
        store.setReplayState(true, idx);
      }
      const f = frames[Math.min(idx, frames.length - 1)];
      if (f && telemetryRef.current) {
        telemetryRef.current.x = f.x;
        telemetryRef.current.y = f.y;
        telemetryRef.current.z = f.z;
        telemetryRef.current.qx = f.qx;
        telemetryRef.current.qy = f.qy;
        telemetryRef.current.qz = f.qz;
        telemetryRef.current.qw = f.qw;
        telemetryRef.current.steerAngle = f.steerAngle;
        telemetryRef.current.wheelSpin = f.wheelSpin;
        telemetryRef.current.speedKmh = f.speedKmh;
        telemetryRef.current.braking = f.braking;
        telemetryRef.current.nitrousActive = f.nitrousActive;
      }
      return;
    }

    const playerHandle = physics.vehicles.get('player');
    if (!playerHandle) return;

    // Sync driver assist & debug override flags
    playerHandle.manualTransmission = store.manualTransmission;
    playerHandle.absEnabled = store.absEnabled;
    playerHandle.tcsEnabled = store.tcsEnabled;
    playerHandle.escEnabled = store.escEnabled;
    playerHandle.steeringAssist = store.steeringAssist;
    playerHandle.drivePreset = store.drivePreset;
    playerHandle.useThermalWear = store.debugOverrides.thermalWear;
    playerHandle.debugGripScale = store.debugOverrides.gripScale;

    const dbg = store.debugOverrides;
    const tunedWithDebug = {
      ...tuning,
      springStiffness: tuning.springStiffness * dbg.springScale,
      damperBump: tuning.damperBump * dbg.damperScale,
      damperRebound: tuning.damperRebound * dbg.damperScale,
      aeroDownforce: tuning.aeroDownforce * dbg.aeroScale,
      antiRollBar: tuning.antiRollBar * dbg.arbScale,
    };

    const stepConfigs = new Map<
      string,
      {
        car: CarDefinition & Partial<SharedCarConfig>;
        tuning: typeof tuning;
        upgrades: typeof carUpgrades;
        input: ReturnType<InputController['sample']>;
        weatherId: typeof weatherId;
        trackId: typeof trackId;
        raceActive: boolean;
        frozen: boolean;
      }
    >();

    const playerInput = inputRef.current.sample(
      store.keyBindings,
      store.gamepadSettings,
      playerHandle.telemetry.speedKmh
    );
    stepConfigs.set('player', {
      car,
      tuning: tunedWithDebug,
      upgrades: carUpgrades,
      input: playerInput,
      weatherId,
      trackId,
      raceActive: TRACKS[trackId].laps > 0,
      frozen,
    });

    // Build AI vehicle configs
    const aiAgents = aiManagerRef.current.agents;
    const allPosList: Array<{ id: string; x: number; z: number; raceProgress: number }> = [
      {
        id: 'player',
        x: playerHandle.telemetry.x,
        z: playerHandle.telemetry.z,
        raceProgress: playerHandle.telemetry.raceProgress,
      },
    ];
    for (const agent of aiAgents) {
      const vh = physics.vehicles.get(agent.id);
      if (vh) {
        allPosList.push({
          id: agent.id,
          x: vh.telemetry.x,
          z: vh.telemetry.z,
          raceProgress: vh.telemetry.raceProgress,
        });
      }
    }

    for (const agent of aiAgents) {
      const vh = physics.vehicles.get(agent.id);
      if (!vh) continue;
      const aiInput = computeAiControlInput(
        vh.telemetry,
        aiManagerRef.current.racingLine,
        allPosList,
        agent,
        playerHandle.telemetry.raceProgress,
        store.aiDifficulty
      );
      stepConfigs.set(agent.id, {
        car: agent.car,
        tuning: agent.tuning,
        upgrades: agent.upgrades,
        input: aiInput,
        weatherId,
        trackId,
        raceActive: TRACKS[trackId].laps > 0,
        frozen,
      });
    }

    // Step Rapier at 120 Hz fixed timestep
    if (!frozen) {
      physics.step(dt, stepConfigs);

      // Compute race standings
      const sorted = [...allPosList].sort((a, b) => b.raceProgress - a.raceProgress);
      const pIdx = sorted.findIndex((r) => r.id === 'player');
      playerHandle.telemetry.racePosition = pIdx >= 0 ? pIdx + 1 : 1;
      playerHandle.telemetry.totalRacers = sorted.length;

      // Dual-rumble tactile feedback on impacts, ABS pulsing, and offroad chatter
      if (playerHandle.telemetry.impactIntensity > 0.3) {
        inputRef.current.triggerRumble(
          playerHandle.telemetry.impactIntensity * 0.7,
          playerHandle.telemetry.impactIntensity,
          120
        );
      } else if (playerHandle.telemetry.absActive) {
        inputRef.current.triggerRumble(0.32, 0.15, 70);
      }
    }

    // Update live telemetry reference
    telemetryRef.current = playerHandle.telemetry;

    // Audio synthesizer update
    audioRef.current.update(
      playerHandle.telemetry,
      car.engineNoteBaseHz,
      weatherId,
      store.audioMixer,
      frozen
    );

    // Record ghost & replay frames (~20 Hz)
    if (!frozen) {
      replayRecordAccum.current += dt;
      if (replayRecordAccum.current >= 0.05) {
        replayRecordAccum.current = 0;
        const pt = playerHandle.telemetry;
        const frame: ReplayFrame = {
          timeSec: playerHandle.raceElapsedMs * 0.001,
          x: pt.x,
          y: pt.y,
          z: pt.z,
          qx: pt.qx,
          qy: pt.qy,
          qz: pt.qz,
          qw: pt.qw,
          steerAngle: pt.steerAngle,
          wheelSpin: pt.wheelSpin,
          speedKmh: pt.speedKmh,
          braking: pt.braking,
          nitrousActive: pt.nitrousActive,
        };
        currentLapFrames.current.push(frame);
        fullRaceFrames.current.push(frame);
        if (fullRaceFrames.current.length > 1800) {
          fullRaceFrames.current.shift();
        }
        if (pt.lap > lastRecordedLap.current) {
          if (store.bestLapGhost.length === 0 || pt.lapTimesMs.at(-1) === pt.bestLapMs) {
            store.setBestLapGhost([...currentLapFrames.current]);
          }
          currentLapFrames.current = [];
          lastRecordedLap.current = pt.lap;
        }
      }
    }

    // Best lap ghost lookup
    if (bestLapGhost.length > 2 && TRACKS[trackId].laps > 0 && !frozen) {
      const lapTimeSec = (playerHandle.raceElapsedMs - playerHandle.lapStartMs) * 0.001;
      const gIdx = Math.min(bestLapGhost.length - 1, Math.floor(lapTimeSec * 20));
      const gf = bestLapGhost[gIdx];
      if (gf) {
        ghostPoseRef.current = {
          x: gf.x,
          y: gf.y,
          z: gf.z,
          qx: gf.qx,
          qy: gf.qy,
          qz: gf.qz,
          qw: gf.qw,
        };
      }
    } else {
      ghostPoseRef.current = null;
    }

    // Detect race finish
    if (playerHandle.telemetry.raceFinished && !prevFinishState.current) {
      prevFinishState.current = true;
      store.awardRaceFinish(
        playerHandle.telemetry.racePosition,
        playerHandle.telemetry.totalDriftScore
      );
      store.setLastRaceReplay([...fullRaceFrames.current]);
      store.setGameMode('gameover');
    } else if (!playerHandle.telemetry.raceFinished) {
      prevFinishState.current = false;
    }

    // Throttled UI state sync (~15 Hz)
    hudSyncAccum.current += dt;
    if (hudSyncAccum.current >= 0.066) {
      hudSyncAccum.current = 0;
      store.setTelemetry({
        ...playerHandle.telemetry,
        wheels: [
          { ...playerHandle.telemetry.wheels[0] },
          { ...playerHandle.telemetry.wheels[1] },
          { ...playerHandle.telemetry.wheels[2] },
          { ...playerHandle.telemetry.wheels[3] },
        ],
      });
      if (aiAgents.length > 0) {
        store.setAiRacers(aiManagerRef.current.toSnapshots(physics.vehicles));
      } else if (store.aiRacers.length > 0) {
        store.setAiRacers([]);
      }
    }

    // Multiplayer delta broadcast (~16 Hz)
    netSyncAccum.current += dt;
    if (netSyncAccum.current >= 0.06 && !frozen) {
      netSyncAccum.current = 0;
      sendTelemetry(playerHandle.telemetry);
    }
  });

  const remoteList = Array.from(remotePlayersRef.current?.values() ?? []);

  return (
    <>
      <SkyAndWeather
        weatherId={weatherId}
        timeOfDayId={timeOfDayId}
        qualityTier={qualityTier}
        isSoftwareGl={isSoftwareGl}
        telemetryRef={telemetryRef}
      />

      <TerrainChunks
        weatherId={weatherId}
        qualityTier={qualityTier}
        isSoftwareGl={isSoftwareGl}
      />

      <TrackMeshes
        trackId={trackId}
        weatherId={weatherId}
        activeCheckpoint={telemetryRef.current?.checkpointIndex ?? 0}
        isSoftwareGl={isSoftwareGl}
      />

      {/* Local Player Car */}
      <CarModel
        car={car}
        customization={customization}
        telemetryRef={telemetryRef}
        headlightsOn={headlightsOn}
        showLightCones={showLightCones}
        isPlayer
        enableGlb
        glbModelId={glbModelId}
        isSoftwareGl={isSoftwareGl}
        customGlbUrl={customGlbUrl}
        onModelStatusChange={onModelStatusChange}
      />

      {/* AI Opponents (Using Same Rapier + Pacejka Physics) */}
      {aiRacers.map((ai) => (
        <CarModel
          key={ai.id}
          car={getCarById(ai.carId)}
          customization={ai.customization}
          headlightsOn={headlightsOn}
          isSoftwareGl={isSoftwareGl}
          pose={ai}
        />
      ))}

      {/* Remote Multiplayer Opponents */}
      {remoteList.map((rp) => (
        <CarModel
          key={rp.id}
          car={getCarById(rp.carId)}
          customization={rp.customization}
          headlightsOn={headlightsOn}
          isSoftwareGl={isSoftwareGl}
          pose={rp}
        />
      ))}

      {/* Best Lap Ghost Car */}
      {ghostPoseRef.current && gameMode === 'playing' && (
        <CarModel
          car={car}
          customization={customization}
          isSoftwareGl={isSoftwareGl}
          pose={ghostPoseRef.current}
          ghostOpacity={0.32}
        />
      )}

      {/* Pooled Tire Smoke, Dirt Dust, Gravel, Rain Spray, Sparks & Skid Marks */}
      <ParticlesAndSkids
        car={car}
        weatherId={weatherId}
        qualityTier={qualityTier}
        isSoftwareGl={isSoftwareGl}
        telemetryRef={telemetryRef}
      />

      {/* Multi-View Spring-Arm & Broadcast Camera Rig */}
      <CameraRig
        cameraMode={cameraMode}
        gameMode={gameMode}
        car={car}
        telemetryRef={telemetryRef}
        photoFov={photoFov}
      />

      {/* Tiered Postprocessing */}
      <PostProcessingEffects
        qualityTier={qualityTier}
        isSoftwareGl={isSoftwareGl}
        gameMode={gameMode}
        telemetryRef={telemetryRef}
        photoDofFocus={photoDofFocus}
      />
    </>
  );
}

export default function App() {
  const loaded = useGameStore((s) => s.loaded);
  const loadProgress = useGameStore((s) => s.loadProgress);
  const isSoftwareGl = useGameStore((s) => s.isSoftwareGl);
  const qualityTier = useGameStore((s) => s.qualityTier);
  const gameMode = useGameStore((s) => s.gameMode);
  const activeModal = useGameStore((s) => s.activeModal);
  const carId = useGameStore((s) => s.carId);
  const glbModelId = useGameStore((s) => s.glbModelId);
  const activeModelCredit = useGameStore((s) => s.activeModelCredit);
  const playerName = useGameStore((s) => s.playerName);
  const credits = useGameStore((s) => s.credits);
  const customizations = useGameStore((s) => s.customizations);
  const tunings = useGameStore((s) => s.tunings);
  const upgrades = useGameStore((s) => s.upgrades);
  const drivePreset = useGameStore((s) => s.drivePreset);
  const steeringAssist = useGameStore((s) => s.steeringAssist);
  const gamepadSettings = useGameStore((s) => s.gamepadSettings);
  const weatherId = useGameStore((s) => s.weatherId);
  const timeOfDayId = useGameStore((s) => s.timeOfDayId);
  const trackId = useGameStore((s) => s.trackId);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const manualTransmission = useGameStore((s) => s.manualTransmission);
  const absEnabled = useGameStore((s) => s.absEnabled);
  const tcsEnabled = useGameStore((s) => s.tcsEnabled);
  const escEnabled = useGameStore((s) => s.escEnabled);
  const rewindsRemaining = useGameStore((s) => s.rewindsRemaining);
  const telemetry = useGameStore((s) => s.telemetry);
  const aiRacers = useGameStore((s) => s.aiRacers);
  const lastRaceReplay = useGameStore((s) => s.lastRaceReplay);
  const replayPlaying = useGameStore((s) => s.replayPlaying);
  const replayIndex = useGameStore((s) => s.replayIndex);
  const audioMixer = useGameStore((s) => s.audioMixer);
  const keyBindings = useGameStore((s) => s.keyBindings);
  const debugOverrides = useGameStore((s) => s.debugOverrides);
  const fps = useGameStore((s) => s.fps);
  const lastRewardCredits = useGameStore((s) => s.lastRewardCredits);
  const lastRewardXp = useGameStore((s) => s.lastRewardXp);

  const setLoaded = useGameStore((s) => s.setLoaded);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const setActiveModal = useGameStore((s) => s.setActiveModal);
  const selectCar = useGameStore((s) => s.selectCar);
  const setGlbModelId = useGameStore((s) => s.setGlbModelId);
  const setActiveModelCredit = useGameStore((s) => s.setActiveModelCredit);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const updateCustomization = useGameStore((s) => s.updateCustomization);
  const updateTuning = useGameStore((s) => s.updateTuning);
  const purchaseUpgrade = useGameStore((s) => s.purchaseUpgrade);
  const setDrivePreset = useGameStore((s) => s.setDrivePreset);
  const setSteeringAssist = useGameStore((s) => s.setSteeringAssist);
  const setGamepadSettings = useGameStore((s) => s.setGamepadSettings);
  const setWeatherId = useGameStore((s) => s.setWeatherId);
  const setTimeOfDayId = useGameStore((s) => s.setTimeOfDayId);
  const setTrackId = useGameStore((s) => s.setTrackId);
  const setCameraMode = useGameStore((s) => s.setCameraMode);
  const setManualTransmission = useGameStore((s) => s.setManualTransmission);
  const setAssists = useGameStore((s) => s.setAssists);
  const setQualityTier = useGameStore((s) => s.setQualityTier);
  const consumeRewind = useGameStore((s) => s.consumeRewind);
  const resetRewinds = useGameStore((s) => s.resetRewinds);
  const setReplayState = useGameStore((s) => s.setReplayState);
  const setAudioMixer = useGameStore((s) => s.setAudioMixer);
  const setKeyBinding = useGameStore((s) => s.setKeyBinding);
  const setDebugOverrides = useGameStore((s) => s.setDebugOverrides);

  const [customGlbUrl, setCustomGlbUrl] = useState<string | null>(null);
  const [glbLoading, setGlbLoading] = useState(false);
  const [photoFov, setPhotoFov] = useState(50);
  const [photoDofFocus, setPhotoDofFocus] = useState(0.02);

  const handleModelStatusChange = useCallback(
    (status: { loading: boolean; credit: string | null; loadedModelName: string | null }) => {
      setGlbLoading(status.loading);
      setActiveModelCredit(status.credit);
    },
    [setActiveModelCredit]
  );

  const physicsRef = useRef<RapierPhysicsWorld | null>(null);
  const aiManagerRef = useRef<AiDriverManager>(new AiDriverManager());
  const inputRef = useRef<InputController>(new InputController());
  const audioRef = useRef<AudioEngine>(new AudioEngine());
  const telemetryRef = useRef<VehicleTelemetry>(createDefaultTelemetry(trackId));
  const remotePlayersRef = useRef<Map<string, RemotePlayerState>>(new Map());

  const car = getCarById(carId);
  const customization = customizations[carId]!;
  const tuning = tunings[carId]!;
  const carUpgrades = upgrades[carId]!;

  const showDebug = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  }, []);

  // Sync body[data-state] for inspection & styling
  useEffect(() => {
    document.body.dataset.state = gameMode;
  }, [gameMode]);

  // Spawn player & AI grid cleanly into Rapier world
  const rebuildGrid = useCallback(
    (targetTrackId: TrackId) => {
      const physics = physicsRef.current;
      if (!physics) return;
      const s = useGameStore.getState();
      const c = getCarById(s.carId);
      const t = s.tunings[s.carId]!;
      const u = s.upgrades[s.carId]!;

      // Clear previous AI vehicles
      for (const old of aiManagerRef.current.agents) {
        const vh = physics.vehicles.get(old.id);
        if (vh) {
          physics.world.removeRigidBody(vh.body);
          physics.vehicles.delete(old.id);
        }
      }

      const playerHandle = physics.spawnVehicle(
        'player',
        c,
        t,
        u,
        targetTrackId,
        0,
        s.drivePreset
      );
      telemetryRef.current = playerHandle.telemetry;

      if (TRACKS[targetTrackId].laps > 0) {
        const agents = aiManagerRef.current.buildRoster(s.aiCount, targetTrackId, s.carId);
        agents.forEach((agent, idx) => {
          physics.spawnVehicle(
            agent.id,
            agent.car,
            agent.tuning,
            agent.upgrades,
            targetTrackId,
            idx + 1,
            'sim_lite'
          );
        });
      } else {
        aiManagerRef.current.agents = [];
      }

      resetRewinds();
    },
    [resetRewinds]
  );

  // Initialize Rapier WASM + Physics World once on boot
  useEffect(() => {
    let mounted = true;
    setLoaded(false, 0.25);

    ensureRapierInitialized().then(() => {
      if (!mounted) return;
      setLoaded(false, 0.7);
      const world = new RapierPhysicsWorld();
      physicsRef.current = world;
      rebuildGrid(useGameStore.getState().trackId);

      inputRef.current.attach();
      setLoaded(true, 1.0);

      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        setGameMode('playing');
      }
    });

    return () => {
      mounted = false;
      inputRef.current.detach();
      physicsRef.current?.dispose();
      physicsRef.current = null;
      audioRef.current.dispose();
    };
  }, [rebuildGrid, setGameMode, setLoaded]);

  // Multiplayer integration
  const mp = useMultiplayer({
    onRoomUpdate: useCallback(
      (room: LobbyRoomState | null) => {
        const nextMap = new Map<string, RemotePlayerState>();
        if (room) {
          room.players.forEach((p) => {
            if (p.id !== mp.playerId) nextMap.set(p.id, p);
          });
          setWeatherId(room.weatherId);
          setTimeOfDayId(room.timeOfDayId);
          if (room.trackId !== useGameStore.getState().trackId) {
            setTrackId(room.trackId);
            rebuildGrid(room.trackId);
          }
          if (room.status === 'countdown' || room.status === 'racing') {
            setActiveModal('none');
            setGameMode('playing');
          }
        }
        remotePlayersRef.current = nextMap;
      },
      [rebuildGrid, setActiveModal, setGameMode, setTimeOfDayId, setTrackId, setWeatherId]
    ),
    onRemoteDelta: useCallback((pid: string, delta: Partial<RemotePlayerState>) => {
      const existing = remotePlayersRef.current.get(pid);
      if (existing) {
        remotePlayersRef.current.set(pid, { ...existing, ...delta });
      }
    }, []),
  });

  const handleStart = useCallback(() => {
    audioRef.current.unlock();
    setGameMode('playing');
  }, [setGameMode]);

  const handleSelectTrack = useCallback(
    (nextTrack: TrackId) => {
      setTrackId(nextTrack);
      rebuildGrid(nextTrack);
    },
    [rebuildGrid, setTrackId]
  );

  const handleCycleCamera = useCallback(() => {
    const idx = CAMERA_ORDER.indexOf(cameraMode);
    setCameraMode(CAMERA_ORDER[(idx + 1) % CAMERA_ORDER.length]);
  }, [cameraMode, setCameraMode]);

  const handleRewind = useCallback(() => {
    const physics = physicsRef.current;
    if (!physics) return;
    if (consumeRewind()) {
      physics.triggerRewind('player');
    }
  }, [consumeRewind]);

  const handleResetCar = useCallback(() => {
    physicsRef.current?.resetVehicleToRoad('player', trackId, true);
  }, [trackId]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const kb = useGameStore.getState().keyBindings;
      if (e.code === 'Escape') {
        if (activeModal !== 'none') {
          setActiveModal('none');
        } else if (gameMode === 'photo' || gameMode === 'replay') {
          setGameMode('playing');
        } else if (gameMode === 'playing') {
          setGameMode('paused');
        } else if (gameMode === 'paused') {
          setGameMode('playing');
        }
        return;
      }

      if (e.code === 'KeyG') {
        setActiveModal(activeModal === 'garage' ? 'none' : 'garage');
      } else if (e.code === 'KeyV') {
        setActiveModal(activeModal === 'weather' ? 'none' : 'weather');
      } else if (e.code === 'KeyM') {
        setActiveModal(activeModal === 'multiplayer' ? 'none' : 'multiplayer');
      } else if (e.code === 'KeyH') {
        setActiveModal(activeModal === 'engineer' ? 'none' : 'engineer');
      } else if (e.code === kb.camera && gameMode === 'playing' && activeModal === 'none') {
        handleCycleCamera();
      } else if (e.code === kb.reset && gameMode === 'playing' && activeModal === 'none') {
        handleResetCar();
      } else if (e.code === kb.rewind && gameMode === 'playing' && activeModal === 'none') {
        handleRewind();
      } else if (e.code === kb.photoMode && activeModal === 'none') {
        setGameMode(gameMode === 'photo' ? 'playing' : 'photo');
      } else if (e.code === 'KeyX' && gameMode === 'playing' && activeModal === 'none') {
        setManualTransmission(!manualTransmission);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeModal,
    gameMode,
    handleCycleCamera,
    handleResetCar,
    handleRewind,
    manualTransmission,
    setActiveModal,
    setGameMode,
    setManualTransmission,
  ]);

  const effective = useMemo(
    () => applyUpgradesToTuning(car, tuning, carUpgrades),
    [car, tuning, carUpgrades]
  );

  const canvasDpr: number | [number, number] = isSoftwareGl
    ? 1
    : qualityTier === 'ultra'
      ? [1, 2]
      : qualityTier === 'high'
        ? [1, 1.5]
        : 1;

  if (!loaded) {
    return <LoadingScreen progress={loadProgress} />;
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090b10]">
      {/* Primary 3D R3F Open World Viewport */}
      <Canvas
        shadows={!isSoftwareGl && qualityTier !== 'low'}
        dpr={canvasDpr}
        frameloop={isSoftwareGl ? 'never' : 'always'}
        gl={{
          antialias: qualityTier !== 'low' && !isSoftwareGl,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: TIME_OF_DAY_PROFILES[timeOfDayId].exposure,
          powerPreference: 'high-performance',
        }}
        camera={{ fov: 60, near: 0.25, far: 1400, position: [0, 4, 178] }}
      >
        <SceneController
          physicsRef={physicsRef}
          aiManagerRef={aiManagerRef}
          inputRef={inputRef}
          audioRef={audioRef}
          telemetryRef={telemetryRef}
          remotePlayersRef={remotePlayersRef}
          customGlbUrl={customGlbUrl}
          onModelStatusChange={handleModelStatusChange}
          photoFov={photoFov}
          photoDofFocus={photoDofFocus}
          countdownSec={mp.countdownSec}
          sendTelemetry={mp.sendTelemetry}
        />
      </Canvas>

      {/* Non-blocking 3D GLB Loading Indicator */}
      {glbLoading && (
        <div className="fixed top-4 right-4 z-30 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-[#0b0d12]/90 text-xs font-mono text-amber-300 pointer-events-none">
          Loading 3D vehicle model...
        </div>
      )}

      {/* Title Screen */}
      {gameMode === 'title' && activeModal === 'none' && (
        <TitleScreen
          carId={carId}
          tuning={tuning}
          upgrades={carUpgrades}
          drivePreset={drivePreset}
          credits={credits}
          modelCredit={activeModelCredit}
          onStart={handleStart}
          onOpenGarage={() => setActiveModal('garage')}
          onOpenMultiplayer={() => setActiveModal('multiplayer')}
          onOpenWeather={() => setActiveModal('weather')}
          onOpenEngineer={() => setActiveModal('engineer')}
        />
      )}

      {/* Driving HUD */}
      {gameMode === 'playing' && activeModal === 'none' && (
        <RacingHud
          telemetry={telemetry}
          redlineRpm={effective.effectiveTuning.revLimitRpm}
          cameraMode={cameraMode}
          manualTransmission={manualTransmission}
          absEnabled={absEnabled}
          tcsEnabled={tcsEnabled}
          escEnabled={escEnabled}
          weatherId={weatherId}
          timeOfDayId={timeOfDayId}
          trackId={trackId}
          muted={audioMixer.muted}
          rewindsRemaining={rewindsRemaining}
          aiRacers={aiRacers}
          room={mp.currentRoom}
          localPlayerId={mp.playerId}
          countdownSec={mp.countdownSec}
          modelCredit={activeModelCredit}
          onOpenGarage={() => setActiveModal('garage')}
          onOpenWeather={() => setActiveModal('weather')}
          onOpenMultiplayer={() => setActiveModal('multiplayer')}
          onOpenEngineer={() => setActiveModal('engineer')}
          onOpenPhoto={() => setGameMode('photo')}
          onCycleCamera={handleCycleCamera}
          onResetCar={handleResetCar}
          onRewind={handleRewind}
          onToggleMute={() => setAudioMixer({ muted: !audioMixer.muted })}
          onPause={() => setGameMode('paused')}
          onSelectTrack={handleSelectTrack}
          onTouchInput={(patch) => inputRef.current.setTouchInput(patch)}
        />
      )}

      {/* ?debug=1 Live Telemetry & Physics Sliders */}
      {showDebug && gameMode === 'playing' && (
        <DebugOverlay
          telemetry={telemetry}
          overrides={debugOverrides}
          fps={fps}
          onUpdate={setDebugOverrides}
        />
      )}

      {/* Photo Mode & Replay Controls */}
      <PhotoReplayOverlay
        mode={gameMode}
        photoFov={photoFov}
        photoDofFocus={photoDofFocus}
        replayPlaying={replayPlaying}
        replayIndex={replayIndex}
        replayLength={lastRaceReplay.length}
        onChangeFov={setPhotoFov}
        onChangeDof={setPhotoDofFocus}
        onToggleReplayPlay={() => setReplayState(!replayPlaying, replayIndex)}
        onScrubReplay={(idx) => setReplayState(false, idx)}
        onExit={() => setGameMode('playing')}
      />

      {/* Garage & Dyno Modal */}
      {activeModal === 'garage' && (
        <GarageModal
          carId={carId}
          glbModelId={glbModelId}
          customization={customization}
          tuning={tuning}
          upgrades={carUpgrades}
          credits={credits}
          isSoftwareGl={isSoftwareGl}
          customGlbUrl={customGlbUrl}
          onSelectCar={(id) => {
            selectCar(id);
            setTimeout(() => rebuildGrid(trackId), 0);
          }}
          onSelectGlbModel={setGlbModelId}
          onUpdateCustomization={updateCustomization}
          onUpdateTuning={updateTuning}
          onPurchaseUpgrade={purchaseUpgrade}
          onUploadGlb={setCustomGlbUrl}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* Weather, Physics Presets, Audio Mixer & Controls Modal */}
      {activeModal === 'weather' && (
        <WeatherModal
          weatherId={weatherId}
          timeOfDayId={timeOfDayId}
          drivePreset={drivePreset}
          steeringAssist={steeringAssist}
          gamepadSettings={gamepadSettings}
          connectedGamepadName={inputRef.current.getConnectedGamepadName()}
          qualityTier={qualityTier}
          manualTransmission={manualTransmission}
          absEnabled={absEnabled}
          tcsEnabled={tcsEnabled}
          escEnabled={escEnabled}
          audioMixer={audioMixer}
          keyBindings={keyBindings}
          onSelectWeather={setWeatherId}
          onSelectTimeOfDay={setTimeOfDayId}
          onSelectDrivePreset={setDrivePreset}
          onSelectSteeringAssist={setSteeringAssist}
          onUpdateGamepadSettings={setGamepadSettings}
          onSelectQualityTier={setQualityTier}
          onToggleManual={setManualTransmission}
          onUpdateAssists={setAssists}
          onUpdateMixer={setAudioMixer}
          onUpdateKeyBinding={setKeyBinding}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* Gemini Multi-Turn Race Engineer Modal */}
      {activeModal === 'engineer' && (
        <RaceEngineerModal
          car={car}
          tuning={tuning}
          weatherId={weatherId}
          telemetry={telemetry}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* Online Multiplayer Lobby Modal */}
      {activeModal === 'multiplayer' && (
        <MultiplayerModal
          connected={mp.connected}
          playerId={mp.playerId}
          playerName={playerName}
          rooms={mp.rooms}
          currentRoom={mp.currentRoom}
          onChangePlayerName={setPlayerName}
          onCreateRoom={(roomName, tr, w) =>
            mp.createRoom(playerName, carId, customization, roomName, tr, w)
          }
          onJoinRoom={(roomId) => mp.joinRoom(roomId, playerName, carId, customization)}
          onLeaveRoom={mp.leaveRoom}
          onToggleReady={(ready) => mp.updatePlayerConfig({ ready, carId, customization })}
          onUpdateRoomSettings={mp.updateRoomSettings}
          onStartRace={mp.startRace}
          onSendChat={mp.sendChat}
          onClose={() => setActiveModal('none')}
        />
      )}

      {/* Pause & Race Finish Standings Modal */}
      <PauseFinishModal
        gameMode={gameMode}
        telemetry={telemetry}
        aiRacers={aiRacers}
        rewardCredits={lastRewardCredits}
        rewardXp={lastRewardXp}
        hasReplay={lastRaceReplay.length > 5}
        onResume={() => setGameMode('playing')}
        onRestart={() => {
          rebuildGrid(trackId);
          setGameMode('playing');
        }}
        onWatchReplay={() => {
          setReplayState(true, 0);
          setGameMode('replay');
        }}
        onBackToTitle={() => {
          rebuildGrid(trackId);
          setGameMode('title');
        }}
      />
    </div>
  );
}
