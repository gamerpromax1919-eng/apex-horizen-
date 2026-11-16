import React from 'react';
import {
  AlertTriangle,
  Bot,
  Camera,
  CloudRain,
  Film,
  Pause,
  RotateCcw,
  Rewind,
  Users,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { TIME_OF_DAY_PROFILES, WEATHER_PROFILES } from '../config/weather';
import {
  ASPHALT_LOOP_POINTS,
  DIRT_LOOP_POINTS,
  DRIFT_PLAZA_CENTER,
  TRACKS,
} from '../track/trackData';
import type {
  AiRacerSnapshot,
  CameraMode,
  DrivePreset,
  LobbyRoomState,
  RemotePlayerState,
  TimeOfDayId,
  TrackId,
  VehicleTelemetry,
  WeatherId,
} from '../config/types';

interface RacingHudProps {
  telemetry: VehicleTelemetry;
  redlineRpm: number;
  cameraMode: CameraMode;
  drivePreset: DrivePreset;
  manualTransmission: boolean;
  absEnabled: boolean;
  tcsEnabled: boolean;
  escEnabled: boolean;
  weatherId: WeatherId;
  timeOfDayId: TimeOfDayId;
  trackId: TrackId;
  muted: boolean;
  rewindsRemaining: number;
  aiRacers: AiRacerSnapshot[];
  room: LobbyRoomState | null;
  localPlayerId: string | null;
  countdownSec: number;
  modelCredit?: string | null;
  testDriveCarName?: string | null;
  testDrivePriceCr?: number;
  canAffordTestDrive?: boolean;
  onExitTestDrive?: () => void;
  onBuyTestDriveCar?: () => void;
  onOpenGarage: () => void;
  onOpenWeather: () => void;
  onOpenMultiplayer: () => void;
  onOpenEngineer: () => void;
  onOpenPhoto: () => void;
  onCycleCamera: () => void;
  onCycleDrivePreset?: () => void;
  onResetCar: () => void;
  onRewind: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onSelectTrack: (trackId: TrackId) => void;
  onTouchInput?: (patch: { throttle?: number; brake?: number; steer?: number; handbrake?: boolean; nitrous?: boolean }) => void;
}

function toMapCoord(val: number): number {
  return ((val + 300) / 600) * 140;
}

function buildSvgPolyline(pts: Array<{ x: number; z: number }>): string {
  return pts.map((p) => `${toMapCoord(p.x).toFixed(1)},${toMapCoord(p.z).toFixed(1)}`).join(' ');
}

function formatMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '--:--.--';
  const totalSec = ms / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = (totalSec % 60).toFixed(2).padStart(5, '0');
  return `${mins}:${secs}`;
}

const ASPHALT_SVG_PTS = buildSvgPolyline([...ASPHALT_LOOP_POINTS, ASPHALT_LOOP_POINTS[0]]);
const DIRT_SVG_PTS = buildSvgPolyline([...DIRT_LOOP_POINTS, DIRT_LOOP_POINTS[0]]);

export const RacingHud: React.FC<RacingHudProps> = ({
  telemetry,
  redlineRpm,
  cameraMode,
  drivePreset,
  manualTransmission,
  absEnabled,
  tcsEnabled,
  escEnabled,
  weatherId,
  timeOfDayId,
  trackId,
  muted,
  rewindsRemaining,
  aiRacers,
  room,
  localPlayerId,
  countdownSec,
  modelCredit,
  testDriveCarName,
  testDrivePriceCr,
  canAffordTestDrive,
  onExitTestDrive,
  onBuyTestDriveCar,
  onOpenGarage,
  onOpenWeather,
  onOpenMultiplayer,
  onOpenEngineer,
  onOpenPhoto,
  onCycleCamera,
  onCycleDrivePreset,
  onResetCar,
  onRewind,
  onToggleMute,
  onPause,
  onSelectTrack,
  onTouchInput,
}) => {
  const weather = WEATHER_PROFILES[weatherId];
  const tod = TIME_OF_DAY_PROFILES[timeOfDayId];
  const track = TRACKS[trackId];
  const rpmRatio = Math.min(1, telemetry.rpm / Math.max(4000, redlineRpm));
  const speedRounded = Math.round(telemetry.speedKmh);
  const gearLabel =
    telemetry.gear === -1 ? 'R' : telemetry.gear === 0 ? 'N' : String(telemetry.gear);

  const remoteOpponents: RemotePlayerState[] =
    room?.players.filter((p) => p.id !== localPlayerId) ?? [];

  const activeWaypoint =
    track.waypoints.length > 0 ? track.waypoints[telemetry.checkpointIndex % track.waypoints.length] : null;

  const isTouchDevice =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const highSpeedRatio = Math.max(0, Math.min(1, (telemetry.speedKmh - 190) / 140));
  const showSpeedLines = highSpeedRatio > 0.08 || telemetry.nitrousActive;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3.5 md:p-5">
      {/* Subtle Edge Speed Lines at Very High Speed or NOS */}
      {showSpeedLines && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, transparent 58%, rgba(255,255,255,${
              (highSpeedRatio * 0.1 + (telemetry.nitrousActive ? 0.08 : 0)).toFixed(3)
            }) 100%)`,
          }}
        />
      )}

      {/* Windshield Rain Droplets Overlay in Rain / Storm */}
      {weather.windshieldDrops > 0.15 && (
        <svg
          className="fixed inset-0 w-full h-full pointer-events-none"
          style={{ opacity: weather.windshieldDrops * 0.42 }}
          aria-hidden="true"
        >
          <defs>
            <pattern id="rainDrops" width="180" height="180" patternUnits="userSpaceOnUse">
              <circle cx="28" cy="34" r="2.2" fill="#e2e8f0" fillOpacity="0.45" />
              <circle cx="94" cy="68" r="3.1" fill="#e2e8f0" fillOpacity="0.35" />
              <circle cx="142" cy="24" r="1.8" fill="#cbd5e1" fillOpacity="0.45" />
              <circle cx="52" cy="128" r="2.8" fill="#e2e8f0" fillOpacity="0.32" />
              <circle cx="156" cy="142" r="2.1" fill="#cbd5e1" fillOpacity="0.4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#rainDrops)" />
        </svg>
      )}

      {/* Top Row: Minimap (Left) | Race / Sectors / Drift Banner (Center) | Toolbar (Right) */}
      <div className="flex items-start justify-between gap-3 relative z-10">
        {/* Top-Left: Live Open-World Radar Minimap */}
        <div className="pointer-events-auto rounded-xl border border-white/12 p-2.5 flex flex-col gap-1.5 bg-[#0b0d12]/88">
          <svg
            viewBox="0 0 140 140"
            className="w-28 h-28 md:w-36 md:h-36 rounded-lg bg-[#111622]"
            aria-label="Open World Minimap"
          >
            <circle
              cx={toMapCoord(DRIFT_PLAZA_CENTER.x)}
              cy={toMapCoord(DRIFT_PLAZA_CENTER.z)}
              r={(DRIFT_PLAZA_CENTER.radius / 600) * 140}
              fill="rgba(245, 158, 11, 0.16)"
              stroke="rgba(245, 158, 11, 0.45)"
              strokeWidth="1"
            />
            <polyline
              points={DIRT_SVG_PTS}
              fill="none"
              stroke="#92623a"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <polyline
              points={ASPHALT_SVG_PTS}
              fill="none"
              stroke="#64748b"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            {activeWaypoint && (
              <circle
                cx={toMapCoord(activeWaypoint.x)}
                cy={toMapCoord(activeWaypoint.z)}
                r="4"
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth="1.2"
              />
            )}
            {aiRacers.map((ai) => (
              <circle
                key={ai.id}
                cx={toMapCoord(ai.x)}
                cy={toMapCoord(ai.z)}
                r="2.9"
                fill="#f43f5e"
                stroke="#0b0d12"
                strokeWidth="0.9"
              />
            ))}
            {remoteOpponents.map((opp) => (
              <circle
                key={opp.id}
                cx={toMapCoord(opp.x)}
                cy={toMapCoord(opp.z)}
                r="3.4"
                fill="#38bdf8"
                stroke="#0b0d12"
                strokeWidth="1"
              />
            ))}
            <g
              transform={`translate(${toMapCoord(telemetry.x).toFixed(1)}, ${toMapCoord(
                telemetry.z
              ).toFixed(1)}) rotate(${((-telemetry.yaw * 180) / Math.PI + 180).toFixed(1)})`}
            >
              <polygon
                points="0,-5.5 4,4.5 0,2.5 -4,4.5"
                fill="#f59e0b"
                stroke="#0b0d12"
                strokeWidth="0.9"
              />
            </g>
          </svg>

          <div className="flex items-center justify-between text-[11px] text-slate-300 tabular-nums px-0.5">
            <span className="capitalize">{telemetry.surface.replace('_', ' ')}</span>
            <span>Grip {Math.round(telemetry.gripFactor * 100)}%</span>
          </div>
        </div>

        {/* Top-Center: Track Selector / Race Position / Sector Splits / Drift Banner */}
        <div className="flex flex-col items-center gap-2 pointer-events-auto">
          <div className="flex flex-wrap items-center justify-center gap-2.5 px-4 py-2 rounded-lg border border-white/12 text-xs text-slate-200 tabular-nums bg-[#0b0d12]/88">
            <label htmlFor="hud-track-select" className="sr-only">
              Active Event
            </label>
            <select
              id="hud-track-select"
              value={trackId}
              onChange={(e) => {
                onSelectTrack(e.target.value as TrackId);
                e.currentTarget.blur();
              }}
              className="bg-transparent text-amber-400 font-display font-bold tracking-wide focus:outline-none cursor-pointer"
            >
              {Object.values(TRACKS).map((tr) => (
                <option key={tr.id} value={tr.id} className="bg-slate-900 text-slate-100">
                  {tr.name}
                </option>
              ))}
            </select>
            <span aria-hidden="true" className="text-slate-600">|</span>
            <span>{weather.label}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{tod.label}</span>
            {track.laps > 0 && (
              <>
                <span aria-hidden="true" className="text-slate-600">|</span>
                <span className="font-mono font-bold text-amber-300">
                  P{telemetry.racePosition}/{telemetry.totalRacers}
                </span>
                <span className="font-mono font-bold text-slate-100">
                  Lap {telemetry.lap}/{track.laps}
                </span>
                <span className="text-slate-400">
                  CP {telemetry.checkpointIndex}/{track.waypoints.length}
                </span>
              </>
            )}
          </div>

          {track.laps > 0 && (
            <div className="hidden md:flex items-center gap-3 px-3 py-1 rounded-md border border-white/10 bg-[#0b0d12]/82 text-[11px] font-mono text-slate-300 tabular-nums">
              <span>S1 {formatMs(telemetry.sectorTimesMs[0])}</span>
              <span>S2 {formatMs(telemetry.sectorTimesMs[1])}</span>
              <span>S3 {formatMs(telemetry.sectorTimesMs[2])}</span>
              <span className="text-emerald-400">Best {formatMs(telemetry.bestLapMs)}</span>
            </div>
          )}

          {testDriveCarName && (
            <div
              data-testid="hud-test-drive-banner"
              className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg border border-sky-400/50 bg-[#0b101b]/92 text-xs text-sky-100"
            >
              <span className="font-display font-bold tracking-wide text-sky-300">
                TEST DRIVE · {testDriveCarName}
              </span>
              {typeof testDrivePriceCr === 'number' && onBuyTestDriveCar && (
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={!canAffordTestDrive}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onBuyTestDriveCar();
                  }}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                    canAffordTestDrive
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                      : 'bg-white/10 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Buy {testDrivePriceCr.toLocaleString()} CR
                </button>
              )}
              {onExitTestDrive && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onExitTestDrive();
                  }}
                  className="px-2.5 py-0.5 rounded bg-white/12 hover:bg-white/22 text-[11px] font-semibold text-slate-100 cursor-pointer"
                >
                  End Test Drive
                </button>
              )}
            </div>
          )}

          {telemetry.wrongWay && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-rose-500/60 bg-rose-950/90 text-rose-200 font-display font-bold text-sm tracking-wider">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              WRONG WAY
            </div>
          )}

          {telemetry.isDrifting && (
            <div className="px-4 py-1.5 rounded-lg border border-amber-500/45 bg-[#0b0d12]/90 font-display font-bold text-sm text-amber-400 tracking-wide tabular-nums">
              DRIFT +{Math.round(telemetry.driftPoints)} · x{telemetry.driftCombo.toFixed(1)}{' '}
              {telemetry.driftWallBonus ? '· CLOSE CALL!' : ''} · {Math.round(telemetry.driftAngleDeg)}°
            </div>
          )}
        </div>

        {/* Top-Right: Action Toolbar */}
        <div className="pointer-events-auto flex items-center gap-1 p-1.5 rounded-xl border border-white/12 bg-[#0b0d12]/88">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenGarage();
            }}
            aria-label="Garage and Tuning (G)"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Wrench className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden lg:inline">Garage</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenWeather();
            }}
            aria-label="Weather and Assists (V)"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
          >
            <CloudRain className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden lg:inline">Weather</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenEngineer();
            }}
            aria-label="AI Race Engineer (H)"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Bot className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden lg:inline">Engineer</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenMultiplayer();
            }}
            aria-label="Online Multiplayer Lobby (M)"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-100 hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">
              {room ? `Lobby (${room.players.length})` : 'Online'}
            </span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenPhoto();
            }}
            aria-label="Photo Mode (P)"
            className="p-2 rounded-lg text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Film className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onCycleCamera();
            }}
            aria-label={`Cycle Camera (${cameraMode})`}
            className="p-2 rounded-lg text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRewind();
            }}
            aria-label={`Rewind (${rewindsRemaining} left)`}
            className="p-2 rounded-lg text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
            title={`Rewind [Backspace] (${rewindsRemaining} left)`}
          >
            <Rewind className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onResetCar();
            }}
            aria-label="Reset Car to Road (R)"
            className="p-2 rounded-lg text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            className="p-2 rounded-lg text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause Game (Esc)"
            className="p-2 rounded-lg text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Race Countdown */}
      {countdownSec > 0 && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-10 py-6 rounded-2xl border border-amber-500/40 bg-[#0b0d12]/90 font-display font-bold text-6xl text-amber-400 tabular-nums">
            {countdownSec}
          </div>
        </div>
      )}

      {/* Touch Controls on Mobile Devices */}
      {isTouchDevice && onTouchInput && (
        <div className="flex justify-between items-end pointer-events-auto px-2 pb-2">
          <div className="flex gap-2">
            <button
              type="button"
              onTouchStart={() => onTouchInput({ steer: 1 })}
              onTouchEnd={() => onTouchInput({ steer: 0 })}
              className="w-14 h-14 rounded-xl bg-white/15 border border-white/20 text-white font-bold"
            >
              ◀
            </button>
            <button
              type="button"
              onTouchStart={() => onTouchInput({ steer: -1 })}
              onTouchEnd={() => onTouchInput({ steer: 0 })}
              className="w-14 h-14 rounded-xl bg-white/15 border border-white/20 text-white font-bold"
            >
              ▶
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onTouchStart={() => onTouchInput({ handbrake: true })}
              onTouchEnd={() => onTouchInput({ handbrake: false })}
              className="px-3 h-14 rounded-xl bg-amber-500/25 border border-amber-400/40 text-amber-200 text-xs font-bold"
            >
              HB
            </button>
            <button
              type="button"
              onTouchStart={() => onTouchInput({ brake: 1 })}
              onTouchEnd={() => onTouchInput({ brake: 0 })}
              className="w-14 h-14 rounded-xl bg-rose-500/30 border border-rose-400/40 text-rose-100 text-xs font-bold"
            >
              BRK
            </button>
            <button
              type="button"
              onTouchStart={() => onTouchInput({ throttle: 1 })}
              onTouchEnd={() => onTouchInput({ throttle: 0 })}
              className="w-16 h-14 rounded-xl bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-xs font-bold"
            >
              GAS
            </button>
          </div>
        </div>
      )}

      {/* Bottom Row: Drift Score & Rewinds (Left) | Speedometer & Telemetry (Right) */}
      <div className="flex items-end justify-between gap-4 relative z-10">
        <div className="hidden sm:flex flex-col items-start gap-1">
          {modelCredit && (
            <div className="px-2.5 py-1 rounded border border-white/10 bg-[#0b0d12]/78 text-[10px] text-slate-400">
              {modelCredit}
            </div>
          )}
          <div className="flex items-center gap-3 px-3.5 py-2 rounded-lg border border-white/10 bg-[#0b0d12]/84 text-xs text-slate-300 tabular-nums">
            <span>Drift {Math.round(telemetry.totalDriftScore)}</span>
            <span aria-hidden="true">·</span>
            <span>Cam: {cameraMode.replace('_', ' ')}</span>
            <span aria-hidden="true">·</span>
            <span>{manualTransmission ? 'Manual [E/Q]' : 'Auto [X]'}</span>
            <span aria-hidden="true">·</span>
            <span>Rewinds: {rewindsRemaining}</span>
          </div>
        </div>

        <div className="ml-auto rounded-xl border border-white/12 bg-[#0b0d12]/90 px-5 py-3.5 min-w-[272px]">
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <div>
              <div
                data-testid="hud-speed"
                className="font-display font-bold text-4xl leading-none text-slate-50 tabular-nums"
              >
                {speedRounded}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 mt-1">KM/H</div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right tabular-nums">
                <div className="flex items-center justify-end gap-1.5">
                  {onCycleDrivePreset && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onCycleDrivePreset();
                      }}
                      title="Click to cycle handling mode (Arcade / Sim-Lite / Sim)"
                      className="pointer-events-auto px-1.5 py-0.5 rounded bg-white/10 hover:bg-amber-500/25 border border-white/12 text-[10px] font-bold uppercase tracking-wide text-amber-300 cursor-pointer transition-colors"
                    >
                      {drivePreset === 'arcade' ? 'Arcade' : drivePreset === 'sim' ? 'Sim' : 'Sim-Lite'}
                    </button>
                  )}
                  <span className="text-xs font-mono text-sky-400">
                    {telemetry.boostPsi > 0
                      ? `+${telemetry.boostPsi.toFixed(1)} PSI`
                      : `${telemetry.boostPsi.toFixed(1)} VAC`}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] font-mono">
                  <span
                    className={
                      telemetry.absActive
                        ? 'text-amber-400 font-bold'
                        : absEnabled
                          ? 'text-slate-400'
                          : 'text-slate-600'
                    }
                  >
                    ABS
                  </span>
                  <span
                    className={
                      telemetry.tcsActive
                        ? 'text-amber-400 font-bold'
                        : tcsEnabled
                          ? 'text-slate-400'
                          : 'text-slate-600'
                    }
                  >
                    TCS
                  </span>
                  <span
                    className={
                      telemetry.escActive
                        ? 'text-amber-400 font-bold'
                        : escEnabled
                          ? 'text-slate-400'
                          : 'text-slate-600'
                    }
                  >
                    ESC
                  </span>
                </div>
              </div>

              <div className="w-11 h-11 rounded-lg bg-amber-500 flex items-center justify-center font-display font-bold text-2xl text-slate-950 tabular-nums">
                {gearLabel}
              </div>
            </div>
          </div>

          {/* RPM Bar */}
          <div className="w-full h-2.5 rounded bg-white/10 overflow-hidden mb-1.5">
            <div
              className="h-full transition-all duration-75"
              style={{
                width: `${Math.round(rpmRatio * 100)}%`,
                backgroundColor:
                  rpmRatio > 0.88 ? '#ef4444' : rpmRatio > 0.72 ? '#f59e0b' : '#f8fafc',
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
            <span>{Math.round(telemetry.rpm)} RPM</span>
            <span
              className={
                telemetry.nitrousOverheated
                  ? 'text-rose-400 font-bold'
                  : telemetry.nitrousActive
                    ? 'text-sky-400 font-bold'
                    : 'text-slate-400'
              }
            >
              {telemetry.nitrousOverheated
                ? 'NOS COOLING'
                : `NOS ${Math.round(telemetry.nitrousCharge * 100)}%`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
