import { CAR_ROSTER, createDefaultCustomization } from '../config/cars';
import { TRACKS } from '../track/trackData';
import type {
  CarCustomization,
  LobbyRoomState,
  LobbyRoomSummary,
  RemotePlayerState,
  TimeOfDayId,
  TrackId,
  WeatherId,
} from '../config/types';

export interface CreateRoomInput {
  name: string;
  trackId: TrackId;
  weatherId: WeatherId;
  timeOfDayId?: TimeOfDayId;
  maxPlayers?: number;
}

export interface JoinPlayerInput {
  playerId: string;
  name: string;
  carId?: string;
  customization?: CarCustomization;
}

export class LobbyManager {
  private rooms = new Map<string, LobbyRoomState>();

  constructor() {
    // Seed a persistent public Horizon Festival lobby room ready for immediate drop-in
    const defaultCar = CAR_ROSTER[0];
    this.rooms.set('HORIZON-01', {
      id: 'HORIZON-01',
      name: 'Horizon Main Festival',
      trackId: 'festival_circuit',
      weatherId: 'clear_golden',
      timeOfDayId: 'golden_hour',
      maxPlayers: 8,
      playerCount: 0,
      status: 'lobby',
      laps: TRACKS.festival_circuit.laps,
      hostId: '',
      countdownSec: 0,
      raceStartTimeMs: null,
      players: [],
      chat: [
        {
          id: 'sys-welcome',
          sender: 'Race Control',
          text: 'Horizon Main Festival lobby is open. Ready up to launch a synced race.',
          timestamp: Date.now(),
        },
      ],
    });
  }

  listRooms(): LobbyRoomSummary[] {
    return Array.from(this.rooms.values()).map((r) => ({
      id: r.id,
      name: r.name,
      trackId: r.trackId,
      weatherId: r.weatherId,
      timeOfDayId: r.timeOfDayId,
      maxPlayers: r.maxPlayers,
      playerCount: r.players.length,
      status: r.status,
      laps: r.laps,
    }));
  }

  getRoom(roomId: string): LobbyRoomState | undefined {
    return this.rooms.get(roomId);
  }

  createRoom(host: JoinPlayerInput, config: CreateRoomInput): LobbyRoomState {
    const code = Math.random().toString(36).slice(2, 7).toUpperCase();
    const roomId = `APEX-${code}`;
    const track = TRACKS[config.trackId] ?? TRACKS.festival_circuit;
    const room: LobbyRoomState = {
      id: roomId,
      name: config.name.trim() || `${host.name}'s Lobby`,
      trackId: track.id,
      weatherId: config.weatherId ?? 'clear_golden',
      timeOfDayId: config.timeOfDayId ?? 'golden_hour',
      maxPlayers: Math.max(2, Math.min(12, config.maxPlayers ?? 8)),
      playerCount: 0,
      status: 'lobby',
      laps: track.laps,
      hostId: host.playerId,
      countdownSec: 0,
      raceStartTimeMs: null,
      players: [],
      chat: [],
    };
    this.rooms.set(roomId, room);
    return this.joinRoom(roomId, host)!;
  }

  joinRoom(roomId: string, playerInput: JoinPlayerInput): LobbyRoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Idempotent check: prevent duplicate player entry on reconnect
    const existing = room.players.find((p) => p.id === playerInput.playerId);
    if (existing) {
      existing.name = playerInput.name;
      return room;
    }

    if (room.players.length >= room.maxPlayers) {
      return null;
    }

    const car = CAR_ROSTER.find((c) => c.id === playerInput.carId) ?? CAR_ROSTER[0];
    const track = TRACKS[room.trackId] ?? TRACKS.festival_circuit;
    const slotIndex = room.players.length;
    // Grid stagger on spawn
    const row = Math.floor(slotIndex / 2);
    const col = slotIndex % 2;
    const fwdX = Math.sin(track.spawnPoint.yaw);
    const fwdZ = Math.cos(track.spawnPoint.yaw);
    const rightX = Math.cos(track.spawnPoint.yaw);
    const rightZ = -Math.sin(track.spawnPoint.yaw);

    const spawnX = track.spawnPoint.x - fwdX * row * 8 + rightX * (col === 0 ? -2.8 : 2.8);
    const spawnZ = track.spawnPoint.z - fwdZ * row * 8 + rightZ * (col === 0 ? -2.8 : 2.8);

    if (!room.hostId || !room.players.some((p) => p.id === room.hostId)) {
      room.hostId = playerInput.playerId;
    }

    const player: RemotePlayerState = {
      id: playerInput.playerId,
      name: playerInput.name.trim() || 'Driver',
      carId: car.id,
      customization: playerInput.customization ?? createDefaultCustomization(car),
      ready: false,
      x: spawnX,
      y: 0,
      z: spawnZ,
      yaw: track.spawnPoint.yaw,
      pitch: 0,
      roll: 0,
      speedKmh: 0,
      steerAngle: 0,
      wheelSpin: 0,
      gear: 1,
      rpm: 950,
      nitrousActive: false,
      lap: 1,
      checkpointIndex: 0,
      raceProgress: 0,
      finished: false,
      finishTimeMs: null,
      isHost: room.hostId === playerInput.playerId,
    };

    room.players.push(player);
    room.playerCount = room.players.length;
    return room;
  }

  leaveRoom(roomId: string, playerId: string): LobbyRoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.players = room.players.filter((p) => p.id !== playerId);
    room.playerCount = room.players.length;

    if (room.players.length === 0) {
      if (roomId !== 'HORIZON-01') {
        this.rooms.delete(roomId);
        return null;
      }
      room.status = 'lobby';
      room.hostId = '';
      room.countdownSec = 0;
      room.raceStartTimeMs = null;
      return room;
    }

    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
    }
    return room;
  }

  updatePlayerConfig(
    roomId: string,
    playerId: string,
    updates: { carId?: string; customization?: CarCustomization; ready?: boolean }
  ): LobbyRoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;

    if (updates.carId) player.carId = updates.carId;
    if (updates.customization) player.customization = updates.customization;
    if (typeof updates.ready === 'boolean') player.ready = updates.ready;
    return room;
  }

  updateRoomSettings(
    roomId: string,
    requesterId: string,
    settings: { trackId?: TrackId; weatherId?: WeatherId; timeOfDayId?: TimeOfDayId }
  ): LobbyRoomState | null {
    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== requesterId) return null;

    if (settings.trackId && TRACKS[settings.trackId]) {
      room.trackId = settings.trackId;
      room.laps = TRACKS[settings.trackId].laps;
    }
    if (settings.weatherId) room.weatherId = settings.weatherId;
    if (settings.timeOfDayId) room.timeOfDayId = settings.timeOfDayId;
    return room;
  }

  startCountdown(roomId: string, requesterId: string): LobbyRoomState | null {
    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== requesterId) return null;
    if (room.status === 'countdown' || room.status === 'racing') return room;

    room.status = 'countdown';
    room.countdownSec = 3;
    const track = TRACKS[room.trackId] ?? TRACKS.festival_circuit;
    const fwdX = Math.sin(track.spawnPoint.yaw);
    const fwdZ = Math.cos(track.spawnPoint.yaw);
    const rightX = Math.cos(track.spawnPoint.yaw);
    const rightZ = -Math.sin(track.spawnPoint.yaw);

    room.players.forEach((p, idx) => {
      const row = Math.floor(idx / 2);
      const col = idx % 2;
      p.x = track.spawnPoint.x - fwdX * row * 8 + rightX * (col === 0 ? -2.8 : 2.8);
      p.z = track.spawnPoint.z - fwdZ * row * 8 + rightZ * (col === 0 ? -2.8 : 2.8);
      p.yaw = track.spawnPoint.yaw;
      p.speedKmh = 0;
      p.lap = 1;
      p.checkpointIndex = 0;
      p.raceProgress = 0;
      p.finished = false;
      p.finishTimeMs = null;
    });
    return room;
  }

  beginRace(roomId: string, nowMs = Date.now()): LobbyRoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.status = 'racing';
    room.countdownSec = 0;
    room.raceStartTimeMs = nowMs;
    return room;
  }

  updatePlayerTelemetry(
    roomId: string,
    playerId: string,
    telemetry: Partial<RemotePlayerState>
  ): LobbyRoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;

    if (typeof telemetry.x === 'number') player.x = telemetry.x;
    if (typeof telemetry.y === 'number') player.y = telemetry.y;
    if (typeof telemetry.z === 'number') player.z = telemetry.z;
    if (typeof telemetry.yaw === 'number') player.yaw = telemetry.yaw;
    if (typeof telemetry.pitch === 'number') player.pitch = telemetry.pitch;
    if (typeof telemetry.roll === 'number') player.roll = telemetry.roll;
    if (typeof telemetry.speedKmh === 'number') player.speedKmh = telemetry.speedKmh;
    if (typeof telemetry.steerAngle === 'number') player.steerAngle = telemetry.steerAngle;
    if (typeof telemetry.wheelSpin === 'number') player.wheelSpin = telemetry.wheelSpin;
    if (typeof telemetry.gear === 'number') player.gear = telemetry.gear;
    if (typeof telemetry.rpm === 'number') player.rpm = telemetry.rpm;
    if (typeof telemetry.nitrousActive === 'boolean') player.nitrousActive = telemetry.nitrousActive;
    if (typeof telemetry.lap === 'number') player.lap = telemetry.lap;
    if (typeof telemetry.checkpointIndex === 'number') player.checkpointIndex = telemetry.checkpointIndex;
    if (typeof telemetry.raceProgress === 'number') player.raceProgress = telemetry.raceProgress;

    if (telemetry.finished && !player.finished) {
      player.finished = true;
      player.finishTimeMs =
        typeof telemetry.finishTimeMs === 'number'
          ? telemetry.finishTimeMs
          : room.raceStartTimeMs
            ? Date.now() - room.raceStartTimeMs
            : 0;
      if (room.players.every((p) => p.finished)) {
        room.status = 'finished';
      }
    }
    return room;
  }

  returnToLobby(roomId: string, requesterId: string): LobbyRoomState | null {
    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== requesterId) return null;
    room.status = 'lobby';
    room.countdownSec = 0;
    room.raceStartTimeMs = null;
    room.players.forEach((p) => {
      p.ready = false;
      p.finished = false;
      p.finishTimeMs = null;
      p.raceProgress = 0;
    });
    return room;
  }

  addChatMessage(roomId: string, sender: string, text: string): LobbyRoomState | null {
    const room = this.rooms.get(roomId);
    if (!room || !text.trim()) return null;
    room.chat = [
      ...room.chat.slice(-29),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender,
        text: text.trim().slice(0, 180),
        timestamp: Date.now(),
      },
    ];
    return room;
  }
}
