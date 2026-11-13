import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CarCustomization,
  LobbyRoomState,
  LobbyRoomSummary,
  RemotePlayerState,
  TimeOfDayId,
  TrackId,
  VehicleTelemetry,
  WeatherId,
} from '../config/types';

interface UseMultiplayerOptions {
  onRoomUpdate?: (room: LobbyRoomState | null) => void;
  onRemoteDelta?: (playerId: string, delta: Partial<RemotePlayerState>) => void;
  onCountdown?: (sec: number) => void;
}

export function useMultiplayer(options: UseMultiplayerOptions) {
  const [connected, setConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<LobbyRoomSummary[]>([]);
  const [currentRoom, setCurrentRoom] = useState<LobbyRoomState | null>(null);
  const [countdownSec, setCountdownSec] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const send = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    let closedByCleanup = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closedByCleanup) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (evt) => {
        let msg: any;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case 'welcome':
            setPlayerId(msg.playerId);
            setRooms(msg.rooms || []);
            break;
          case 'rooms:list':
            setRooms(msg.rooms || []);
            break;
          case 'room:state':
            setCurrentRoom(msg.room || null);
            setCountdownSec(msg.room?.countdownSec || 0);
            optionsRef.current.onRoomUpdate?.(msg.room || null);
            break;
          case 'room:left':
            setCurrentRoom(null);
            setCountdownSec(0);
            optionsRef.current.onRoomUpdate?.(null);
            break;
          case 'race:countdown':
            setCountdownSec(msg.countdownSec || 0);
            optionsRef.current.onCountdown?.(msg.countdownSec || 0);
            break;
          case 'player:delta':
            if (msg.playerId && msg.telemetry) {
              optionsRef.current.onRemoteDelta?.(msg.playerId, msg.telemetry);
            }
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!closedByCleanup) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const createRoom = useCallback(
    (
      playerName: string,
      carId: string,
      customization: CarCustomization,
      roomName: string,
      trackId: TrackId,
      weatherId: WeatherId
    ) => {
      send({
        type: 'room:create',
        playerName,
        carId,
        customization,
        roomName,
        trackId,
        weatherId,
      });
    },
    [send]
  );

  const joinRoom = useCallback(
    (
      roomId: string,
      playerName: string,
      carId: string,
      customization: CarCustomization
    ) => {
      send({
        type: 'room:join',
        roomId,
        playerName,
        carId,
        customization,
      });
    },
    [send]
  );

  const leaveRoom = useCallback(() => {
    send({ type: 'room:leave' });
  }, [send]);

  const updatePlayerConfig = useCallback(
    (updates: { carId?: string; customization?: CarCustomization; ready?: boolean }) => {
      send({ type: 'player:config', ...updates });
    },
    [send]
  );

  const updateRoomSettings = useCallback(
    (settings: { trackId?: TrackId; weatherId?: WeatherId; timeOfDayId?: TimeOfDayId }) => {
      send({ type: 'room:settings', ...settings });
    },
    [send]
  );

  const startRace = useCallback(() => {
    send({ type: 'race:start' });
  }, [send]);

  const sendChat = useCallback(
    (text: string) => {
      send({ type: 'room:chat', text });
    },
    [send]
  );

  const sendTelemetry = useCallback(
    (t: VehicleTelemetry) => {
      if (!currentRoom) return;
      send({
        type: 'player:telemetry',
        telemetry: {
          x: Number(t.x.toFixed(2)),
          y: Number(t.y.toFixed(2)),
          z: Number(t.z.toFixed(2)),
          yaw: Number(t.yaw.toFixed(3)),
          pitch: Number(t.pitch.toFixed(3)),
          roll: Number(t.roll.toFixed(3)),
          speedKmh: Math.round(t.speedKmh),
          steerAngle: Number(t.steerAngle.toFixed(3)),
          wheelSpin: Number(t.wheelSpin.toFixed(2)),
          gear: t.gear,
          rpm: Math.round(t.rpm),
          nitrousActive: t.nitrousActive,
          lap: t.lap,
          checkpointIndex: t.checkpointIndex,
          raceProgress: Number(t.raceProgress.toFixed(3)),
          finished: t.raceFinished,
          finishTimeMs: t.finishTimeMs,
        },
      });
    },
    [currentRoom, send]
  );

  return {
    connected,
    playerId,
    rooms,
    currentRoom,
    countdownSec,
    createRoom,
    joinRoom,
    leaveRoom,
    updatePlayerConfig,
    updateRoomSettings,
    startRace,
    sendChat,
    sendTelemetry,
  };
}
