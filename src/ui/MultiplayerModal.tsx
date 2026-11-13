import React, { useState } from 'react';
import { Check, Flag, LogOut, Plus, Send, Users, X } from 'lucide-react';
import { getCarById } from '../config/cars';
import { TRACKS } from '../track/trackData';
import { WEATHER_PROFILES } from '../config/weather';
import type {
  LobbyRoomState,
  LobbyRoomSummary,
  TimeOfDayId,
  TrackId,
  WeatherId,
} from '../config/types';

interface MultiplayerModalProps {
  connected: boolean;
  playerId: string | null;
  playerName: string;
  rooms: LobbyRoomSummary[];
  currentRoom: LobbyRoomState | null;
  onChangePlayerName: (name: string) => void;
  onCreateRoom: (roomName: string, trackId: TrackId, weatherId: WeatherId) => void;
  onJoinRoom: (roomId: string) => void;
  onLeaveRoom: () => void;
  onToggleReady: (ready: boolean) => void;
  onUpdateRoomSettings: (settings: { trackId?: TrackId; weatherId?: WeatherId; timeOfDayId?: TimeOfDayId }) => void;
  onStartRace: () => void;
  onSendChat: (text: string) => void;
  onClose: () => void;
}

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  connected,
  playerId,
  playerName,
  rooms,
  currentRoom,
  onChangePlayerName,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onUpdateRoomSettings,
  onStartRace,
  onSendChat,
  onClose,
}) => {
  const [newRoomName, setNewRoomName] = useState('Apex Ranked Circuit');
  const [newTrack, setNewTrack] = useState<TrackId>('festival_circuit');
  const [newWeather, setNewWeather] = useState<WeatherId>('clear_golden');
  const [chatText, setChatText] = useState('');

  const localPlayer = currentRoom?.players.find((p) => p.id === playerId) ?? null;
  const isHost = currentRoom?.hostId === playerId;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/78">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-white/15 bg-[#0e1118] text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="font-display font-bold text-lg tracking-wide">
                ONLINE MULTIPLAYER LOBBIES
              </h2>
              <p className="text-xs text-slate-400">
                {connected
                  ? 'Connected to live WebSocket race server'
                  : 'Connecting to race server...'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Multiplayer"
            className="p-2 rounded-lg bg-white/8 hover:bg-white/16 text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!currentRoom ? (
            <>
              <div className="rounded-xl border border-white/10 bg-[#141925] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <label className="text-xs font-semibold text-slate-300">
                  Driver Callsign
                  <input
                    type="text"
                    maxLength={18}
                    value={playerName}
                    onChange={(e) => onChangePlayerName(e.target.value)}
                    className="mt-1 block w-full sm:w-64 px-3 py-2 rounded-lg bg-black/45 border border-white/12 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                </label>
                <div className="text-xs text-slate-400">
                  Join a public lobby below or host your own synced event.
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2.5">
                  Active Lobbies ({rooms.length})
                </div>
                <div className="space-y-2">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-white/10 bg-[#141925]"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-sm">{room.name}</span>
                          <span className="text-[11px] font-mono text-amber-400">{room.id}</span>
                          <span className="text-[11px] text-slate-400 capitalize">
                            · {room.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {TRACKS[room.trackId]?.name} · {WEATHER_PROFILES[room.weatherId]?.label} ·{' '}
                          {room.playerCount}/{room.maxPlayers} Drivers
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onJoinRoom(room.id)}
                        disabled={!connected || room.playerCount >= room.maxPlayers}
                        className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs cursor-pointer"
                      >
                        Join Race
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#141925] p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3">
                  <Plus className="w-4 h-4 text-amber-400" />
                  Host New Online Lobby
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Lobby Name"
                    className="px-3 py-2 rounded-lg bg-black/45 border border-white/12 text-xs text-slate-100"
                  />
                  <select
                    value={newTrack}
                    onChange={(e) => setNewTrack(e.target.value as TrackId)}
                    className="px-3 py-2 rounded-lg bg-black/45 border border-white/12 text-xs text-slate-100"
                  >
                    {Object.values(TRACKS).map((tr) => (
                      <option key={tr.id} value={tr.id} className="bg-slate-900">
                        {tr.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newWeather}
                    onChange={(e) => setNewWeather(e.target.value as WeatherId)}
                    className="px-3 py-2 rounded-lg bg-black/45 border border-white/12 text-xs text-slate-100"
                  >
                    {Object.values(WEATHER_PROFILES).map((w) => (
                      <option key={w.id} value={w.id} className="bg-slate-900">
                        {w.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onCreateRoom(newRoomName, newTrack, newWeather)}
                    disabled={!connected}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    Create Lobby
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              <div className="md:col-span-7 space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#141925] p-4 flex items-center justify-between">
                  <div>
                    <div className="font-display font-bold text-base">
                      {currentRoom.name}{' '}
                      <span className="text-xs font-mono text-amber-400">({currentRoom.id})</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {TRACKS[currentRoom.trackId]?.name} ·{' '}
                      {WEATHER_PROFILES[currentRoom.weatherId]?.label} · Status:{' '}
                      <span className="text-emerald-400 capitalize">{currentRoom.status}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-rose-500/20 text-xs text-rose-300 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Leave
                  </button>
                </div>

                {isHost && (
                  <div className="rounded-xl border border-white/10 bg-[#141925] p-3 grid grid-cols-2 gap-2.5">
                    <select
                      value={currentRoom.trackId}
                      onChange={(e) => onUpdateRoomSettings({ trackId: e.target.value as TrackId })}
                      className="px-3 py-2 rounded-lg bg-black/45 border border-white/12 text-xs"
                    >
                      {Object.values(TRACKS).map((tr) => (
                        <option key={tr.id} value={tr.id} className="bg-slate-900">
                          {tr.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={currentRoom.weatherId}
                      onChange={(e) =>
                        onUpdateRoomSettings({ weatherId: e.target.value as WeatherId })
                      }
                      className="px-3 py-2 rounded-lg bg-black/45 border border-white/12 text-xs"
                    >
                      {Object.values(WEATHER_PROFILES).map((w) => (
                        <option key={w.id} value={w.id} className="bg-slate-900">
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="rounded-xl border border-white/10 bg-[#141925] p-4 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                    Grid Drivers ({currentRoom.players.length}/{currentRoom.maxPlayers})
                  </div>
                  {currentRoom.players.map((p) => {
                    const car = getCarById(p.carId);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/35 text-xs"
                      >
                        <div>
                          <span className="font-semibold text-slate-100">{p.name}</span>
                          {p.isHost && (
                            <span className="ml-2 text-[10px] font-mono text-amber-400">HOST</span>
                          )}
                          <div className="text-[11px] text-slate-400">{car.name}</div>
                        </div>
                        <span
                          className={`font-mono font-bold ${
                            p.ready ? 'text-emerald-400' : 'text-slate-500'
                          }`}
                        >
                          {p.ready ? 'READY' : 'WAITING'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onToggleReady(!localPlayer?.ready)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm cursor-pointer ${
                      localPlayer?.ready
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-white/10 hover:bg-white/18 text-slate-100'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    {localPlayer?.ready ? 'Ready for Grid' : 'Ready Up'}
                  </button>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => {
                        onStartRace();
                        onClose();
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm cursor-pointer"
                    >
                      <Flag className="w-4 h-4" />
                      Launch Synced Race
                    </button>
                  )}
                </div>
              </div>

              <div className="md:col-span-5 rounded-xl border border-white/10 bg-[#141925] p-4 flex flex-col h-80">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Lobby Chat
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs mb-3">
                  {currentRoom.chat.map((c) => (
                    <div key={c.id} className="bg-black/30 rounded-lg px-2.5 py-1.5">
                      <span className="font-semibold text-amber-400">{c.sender}: </span>
                      <span className="text-slate-200">{c.text}</span>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chatText.trim()) return;
                    onSendChat(chatText);
                    setChatText('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Message lobby..."
                    className="flex-1 px-3 py-2 rounded-lg bg-black/45 border border-white/12 text-xs"
                  />
                  <button
                    type="submit"
                    aria-label="Send Chat"
                    className="p-2 rounded-lg bg-amber-500 text-slate-950 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
