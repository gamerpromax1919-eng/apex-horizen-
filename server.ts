import fs from 'node:fs';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { LobbyManager } from './src/server/lobby';
import { runRaceEngineerChat, type EngineerChatTurn, type EngineerRoleId } from './src/server/engineer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json());

  const lobby = new LobbyManager();
  const clientMeta = new Map<WebSocket, { playerId: string; roomId: string | null }>();
  const countdownTimers = new Map<string, NodeJS.Timeout>();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: lobby.listRooms().length });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: lobby.listRooms() });
  });

  app.get('/api/assets/car-model-status', (_req, res) => {
    const publicGlb = path.resolve(__dirname, 'public', 'models', 'car.glb');
    const exists = fs.existsSync(publicGlb);
    res.json({ exists, url: exists ? '/models/car.glb' : null });
  });

  app.get('/api/assets/models-manifest', (_req, res) => {
    const modelsDir = path.resolve(__dirname, 'public', 'models');
    let files: string[] = [];
    try {
      if (fs.existsSync(modelsDir)) {
        files = fs
          .readdirSync(modelsDir)
          .filter((f) => f.toLowerCase().endsWith('.glb') || f.toLowerCase().endsWith('.gltf'));
      }
    } catch {
      files = [];
    }
    res.json({ files });
  });

  app.post('/api/engineer/chat', async (req, res) => {
    try {
      const { roleId, history, message, telemetryContext } = (req.body || {}) as {
        roleId?: EngineerRoleId;
        history?: EngineerChatTurn[];
        message?: string;
        telemetryContext?: string;
      };
      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Message is required.' });
        return;
      }
      const data = await runRaceEngineerChat({
        roleId: roleId || 'suspension_telemetry',
        history: Array.isArray(history) ? history : [],
        message: message.trim(),
        telemetryContext,
      });
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reach Race Engineer AI.';
      res.status(500).json({ error: msg });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcastToRoom(roomId: string, payload: unknown, exclude?: WebSocket) {
    const encoded = JSON.stringify(payload);
    for (const [ws, meta] of clientMeta.entries()) {
      if (meta.roomId === roomId && ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(encoded);
      }
    }
  }

  function broadcastRoomList() {
    const encoded = JSON.stringify({ type: 'rooms:list', rooms: lobby.listRooms() });
    for (const [ws] of clientMeta.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoded);
      }
    }
  }

  function clearRoomTimer(roomId: string) {
    const existing = countdownTimers.get(roomId);
    if (existing) {
      clearInterval(existing);
      countdownTimers.delete(roomId);
    }
  }

  wss.on('connection', (ws) => {
    const playerId = `drv-${Math.random().toString(36).slice(2, 9)}`;
    clientMeta.set(ws, { playerId, roomId: null });

    ws.send(
      JSON.stringify({
        type: 'welcome',
        playerId,
        rooms: lobby.listRooms(),
      })
    );

    ws.on('message', (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const meta = clientMeta.get(ws);
      if (!meta) return;

      switch (msg.type) {
        case 'rooms:get': {
          ws.send(JSON.stringify({ type: 'rooms:list', rooms: lobby.listRooms() }));
          break;
        }

        case 'room:create': {
          if (meta.roomId) {
            const left = lobby.leaveRoom(meta.roomId, meta.playerId);
            if (left) broadcastToRoom(meta.roomId, { type: 'room:state', room: left });
          }
          const room = lobby.createRoom(
            {
              playerId: meta.playerId,
              name: String(msg.playerName || 'Driver'),
              carId: msg.carId,
              customization: msg.customization,
            },
            {
              name: String(msg.roomName || 'Horizon Race Lobby'),
              trackId: msg.trackId || 'festival_circuit',
              weatherId: msg.weatherId || 'clear_golden',
              timeOfDayId: msg.timeOfDayId || 'golden_hour',
            }
          );
          meta.roomId = room.id;
          ws.send(JSON.stringify({ type: 'room:state', room }));
          broadcastRoomList();
          break;
        }

        case 'room:join': {
          const targetId = String(msg.roomId || 'HORIZON-01');
          if (meta.roomId && meta.roomId !== targetId) {
            const left = lobby.leaveRoom(meta.roomId, meta.playerId);
            if (left) broadcastToRoom(meta.roomId, { type: 'room:state', room: left });
          }
          const room = lobby.joinRoom(targetId, {
            playerId: meta.playerId,
            name: String(msg.playerName || 'Driver'),
            carId: msg.carId,
            customization: msg.customization,
          });
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found or full.' }));
            return;
          }
          meta.roomId = room.id;
          broadcastToRoom(room.id, { type: 'room:state', room });
          broadcastRoomList();
          break;
        }

        case 'room:leave': {
          if (!meta.roomId) return;
          const oldId = meta.roomId;
          meta.roomId = null;
          const updated = lobby.leaveRoom(oldId, meta.playerId);
          if (!updated || updated.players.length === 0) {
            clearRoomTimer(oldId);
          }
          if (updated) {
            broadcastToRoom(oldId, { type: 'room:state', room: updated });
          }
          ws.send(JSON.stringify({ type: 'room:left', roomId: oldId }));
          broadcastRoomList();
          break;
        }

        case 'player:config': {
          if (!meta.roomId) return;
          const updated = lobby.updatePlayerConfig(meta.roomId, meta.playerId, {
            carId: msg.carId,
            customization: msg.customization,
            ready: msg.ready,
          });
          if (updated) broadcastToRoom(meta.roomId, { type: 'room:state', room: updated });
          break;
        }

        case 'room:settings': {
          if (!meta.roomId) return;
          const updated = lobby.updateRoomSettings(meta.roomId, meta.playerId, {
            trackId: msg.trackId,
            weatherId: msg.weatherId,
            timeOfDayId: msg.timeOfDayId,
          });
          if (updated) {
            broadcastToRoom(meta.roomId, { type: 'room:state', room: updated });
            broadcastRoomList();
          }
          break;
        }

        case 'race:start': {
          if (!meta.roomId) return;
          const roomId = meta.roomId;
          const room = lobby.startCountdown(roomId, meta.playerId);
          if (!room) return;

          clearRoomTimer(roomId);
          broadcastToRoom(roomId, { type: 'room:state', room });
          broadcastRoomList();

          let sec = 3;
          const timer = setInterval(() => {
            const current = lobby.getRoom(roomId);
            if (!current || current.status !== 'countdown') {
              clearRoomTimer(roomId);
              return;
            }
            sec -= 1;
            if (sec > 0) {
              current.countdownSec = sec;
              broadcastToRoom(roomId, { type: 'race:countdown', countdownSec: sec });
            } else {
              clearRoomTimer(roomId);
              const started = lobby.beginRace(roomId);
              if (started) {
                broadcastToRoom(roomId, { type: 'room:state', room: started });
                broadcastRoomList();
              }
            }
          }, 1000);
          countdownTimers.set(roomId, timer);
          break;
        }

        case 'race:reset': {
          if (!meta.roomId) return;
          const updated = lobby.returnToLobby(meta.roomId, meta.playerId);
          if (updated) {
            clearRoomTimer(meta.roomId);
            broadcastToRoom(meta.roomId, { type: 'room:state', room: updated });
            broadcastRoomList();
          }
          break;
        }

        case 'player:telemetry': {
          if (!meta.roomId) return;
          const updated = lobby.updatePlayerTelemetry(meta.roomId, meta.playerId, msg.telemetry || {});
          if (updated) {
            broadcastToRoom(
              meta.roomId,
              {
                type: 'player:delta',
                playerId: meta.playerId,
                telemetry: msg.telemetry,
                status: updated.status,
              },
              ws
            );
            if (updated.status === 'finished') {
              broadcastToRoom(meta.roomId, { type: 'room:state', room: updated });
            }
          }
          break;
        }

        case 'room:chat': {
          if (!meta.roomId) return;
          const room = lobby.getRoom(meta.roomId);
          const sender = room?.players.find((p) => p.id === meta.playerId)?.name || 'Driver';
          const updated = lobby.addChatMessage(meta.roomId, sender, String(msg.text || ''));
          if (updated) {
            broadcastToRoom(meta.roomId, { type: 'room:state', room: updated });
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      const meta = clientMeta.get(ws);
      if (meta?.roomId) {
        const updated = lobby.leaveRoom(meta.roomId, meta.playerId);
        if (!updated || updated.players.length === 0) {
          clearRoomTimer(meta.roomId);
        }
        if (updated) {
          broadcastToRoom(meta.roomId, { type: 'room:state', room: updated });
        }
        broadcastRoomList();
      }
      clientMeta.delete(ws);
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Horizon Apex server listening on http://localhost:${PORT}`);
  });
}

startServer();
