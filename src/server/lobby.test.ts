import test from 'node:test';
import assert from 'node:assert/strict';
import { LobbyManager } from './lobby';

test('lobby room creation, idempotent join, ready toggle, and host migration', () => {
  const manager = new LobbyManager();
  const initialRooms = manager.listRooms();
  assert.ok(initialRooms.some((r) => r.id === 'HORIZON-01'));

  const created = manager.createRoom(
    { playerId: 'p1', name: 'Alice' },
    { name: 'Midnight Run', trackId: 'canyon_sprint', weatherId: 'thunderstorm' }
  );
  assert.equal(created.players.length, 1);
  assert.equal(created.hostId, 'p1');
  assert.equal(created.weatherId, 'thunderstorm');

  // Idempotent duplicate join does not create two players
  const dup = manager.joinRoom(created.id, { playerId: 'p1', name: 'Alice' });
  assert.equal(dup?.players.length, 1);

  // Second player joins
  const joined = manager.joinRoom(created.id, { playerId: 'p2', name: 'Bob' });
  assert.equal(joined?.players.length, 2);

  // Ready & countdown
  manager.updatePlayerConfig(created.id, 'p2', { ready: true });
  assert.equal(manager.getRoom(created.id)?.players[1].ready, true);

  const countdownRoom = manager.startCountdown(created.id, 'p1');
  assert.equal(countdownRoom?.status, 'countdown');
  assert.equal(countdownRoom?.countdownSec, 3);

  const racingRoom = manager.beginRace(created.id, 1000);
  assert.equal(racingRoom?.status, 'racing');

  // Host leaves -> migrates host to p2
  const afterLeave = manager.leaveRoom(created.id, 'p1');
  assert.equal(afterLeave?.hostId, 'p2');
  assert.equal(afterLeave?.players.length, 1);
});

test('telemetry updates and race finish transition room to finished when all players complete', () => {
  const manager = new LobbyManager();
  const room = manager.createRoom(
    { playerId: 'p1', name: 'Driver 1' },
    { name: 'Sprint Test', trackId: 'festival_circuit', weatherId: 'clear_golden' }
  );
  manager.startCountdown(room.id, 'p1');
  manager.beginRace(room.id, 5000);

  manager.updatePlayerTelemetry(room.id, 'p1', {
    x: 20,
    z: 185,
    speedKmh: 210,
    finished: true,
    finishTimeMs: 42300,
  });

  const updated = manager.getRoom(room.id);
  assert.equal(updated?.status, 'finished');
  assert.equal(updated?.players[0].finishTimeMs, 42300);
});
