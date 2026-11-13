import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Trash2, X } from 'lucide-react';
import type { CarDefinition, TuningSetup, VehicleTelemetry, WeatherId } from '../config/types';
import { WEATHER_PROFILES } from '../config/weather';

type EngineerRoleId = 'suspension_telemetry' | 'weather_tires' | 'drift_gearing';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface RaceEngineerModalProps {
  car: CarDefinition;
  tuning: TuningSetup;
  weatherId: WeatherId;
  telemetry: VehicleTelemetry;
  onClose: () => void;
}

const ROLES: Array<{ id: EngineerRoleId; name: string; title: string }> = [
  {
    id: 'suspension_telemetry',
    name: 'Marcus Chen',
    title: 'Suspension & Telemetry',
  },
  {
    id: 'weather_tires',
    name: 'Elena Novak',
    title: 'Weather & Tire Strategy',
  },
  {
    id: 'drift_gearing',
    name: 'Kenji Takahashi',
    title: 'Drift & Gearing',
  },
];

const QUICK_PROMPTS = [
  'How should I adjust springs and ARB for wet tarmac?',
  'Recommend gear ratios and LSD lock for smoother drifts.',
  'Why am I losing front grip under heavy braking?',
];

export const RaceEngineerModal: React.FC<RaceEngineerModalProps> = ({
  car,
  tuning,
  weatherId,
  telemetry,
  onClose,
}) => {
  const [roleId, setRoleId] = useState<EngineerRoleId>('suspension_telemetry');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'intro',
      role: 'model',
      text: `Radio check! I have live telemetry for your ${car.name} (${car.drivetrain}) on ${WEATHER_PROFILES[weatherId].label}. Ask me anything about suspension, Pacejka tire slip, gearing, or weather setup.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!textOverride) setInput('');
    setLoading(true);
    setError(null);

    const telemetryContext = [
      `Car: ${car.manufacturer} ${car.name} (${car.drivetrain}, ${car.baseWeightKg}kg)`,
      `Weather: ${WEATHER_PROFILES[weatherId].label} | Surface under car: ${telemetry.surface} | Grip: ${Math.round(telemetry.gripFactor * 100)}%`,
      `Tuning: Compound=${tuning.tireCompound}, Boost=${tuning.boostPsi}PSI, Springs=${tuning.springStiffness}x, Bump=${tuning.damperBump}x, Rebound=${tuning.damperRebound}x, ARB=${tuning.antiRollBar}x, Camber=${tuning.camberDeg}deg, BrakeBias=${Math.round(tuning.brakeBiasFront * 100)}%F, LSD=${Math.round(tuning.lsdLock * 100)}%, FinalDrive=${tuning.finalDrive}`,
      `Live Speed: ${Math.round(telemetry.speedKmh)} km/h | Best Lap: ${telemetry.bestLapMs ? `${(telemetry.bestLapMs / 1000).toFixed(2)}s` : 'N/A'}`,
    ].join('\n');

    try {
      const res = await fetch('/api/engineer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId,
          history: messages.filter((m) => m.id !== 'intro').map((m) => ({ role: m.role, text: m.text })),
          message: text,
          telemetryContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response from Race Engineer.');
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/78">
      <div className="w-full max-w-3xl h-[82vh] flex flex-col rounded-2xl border border-white/15 bg-[#0e1118] text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-violet-400" />
            <div>
              <h2 className="font-display font-bold text-lg tracking-wide">
                PIT WALL RACE ENGINEER
              </h2>
              <p className="text-xs text-slate-400">
                Multi-turn AI telemetry &amp; setup strategist · Live car context attached
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: 'intro',
                    role: 'model',
                    text: `Thread cleared. Ready with telemetry for ${car.name}.`,
                  },
                ])
              }
              title="Clear Chat History"
              className="p-2 rounded-lg bg-white/8 hover:bg-white/16 text-slate-300 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Race Engineer"
              className="p-2 rounded-lg bg-white/8 hover:bg-white/16 text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Role Selector */}
        <div className="px-6 py-3 border-b border-white/10 bg-[#121622] flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRoleId(r.id)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                roleId === r.id
                  ? 'border-violet-400 bg-violet-500/20 text-violet-200 font-semibold'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {r.name} · <span className="text-slate-400">{r.title}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Multi-Turn Conversation Thread */}
        <div
          data-testid="engineer-thread"
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[82%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-amber-500 text-slate-950 font-medium'
                    : 'bg-[#171c2b] border border-white/10 text-slate-100'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-xl px-4 py-3 text-xs font-mono text-violet-300 bg-[#171c2b] border border-violet-500/30">
                Analyzing chassis &amp; Pacejka telemetry...
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-xl px-4 py-2.5 text-xs bg-rose-950/70 border border-rose-500/40 text-rose-200">
              {error}
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {/* Quick Prompts + Composer */}
        <div className="px-6 py-4 border-t border-white/10 bg-[#121622] space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void sendMessage(q)}
                className="px-2.5 py-1 rounded-md bg-white/6 hover:bg-white/12 border border-white/10 text-[11px] text-slate-300 cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your Race Engineer about setup, tires, rain grip, or gearing..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-black/45 border border-white/12 text-sm text-slate-100 focus:outline-none focus:border-violet-400"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white font-semibold text-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
