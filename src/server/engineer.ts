import { GoogleGenAI } from '@google/genai';

export type EngineerRoleId = 'suspension_telemetry' | 'weather_tires' | 'drift_gearing';

export interface EngineerChatTurn {
  role: 'user' | 'model';
  text: string;
}

export interface EngineerChatRequest {
  roleId: EngineerRoleId;
  history: EngineerChatTurn[];
  message: string;
  telemetryContext?: string;
}

const ROLE_INSTRUCTIONS: Record<EngineerRoleId, string> = {
  suspension_telemetry:
    'You are Marcus Chen, Lead Vehicle Dynamics & Suspension Engineer for Horizon Apex. Give concise, actionable advice on spring stiffness, bump/rebound damping, anti-roll bars, camber, brake bias, and Pacejka tire slip behavior.',
  weather_tires:
    'You are Elena Novak, Trackside Weather & Tire Strategist for Horizon Apex. Focus on tire compounds (street, semi-slick, slick, offroad), hydroplaning thresholds, wet asphalt grip, thermal degradation, and ride height clearance.',
  drift_gearing:
    'You are Kenji Takahashi, Drivetrain, Gearing & Drift Tuning Specialist for Horizon Apex. Advise on final drive, 6-speed gear spacing, LSD lock percentages, RWD/AWD torque split, handbrake initiation, and turbo/NOS power delivery.',
};

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function runRaceEngineerChat(req: EngineerChatRequest): Promise<{
  reply: string;
  roleId: EngineerRoleId;
}> {
  const ai = getGeminiClient();
  const baseInstruction =
    ROLE_INSTRUCTIONS[req.roleId] ?? ROLE_INSTRUCTIONS.suspension_telemetry;
  const fullInstruction = req.telemetryContext
    ? `${baseInstruction}\n\nCurrent Driver & Car Telemetry Context:\n${req.telemetryContext}\n\nKeep answers practical, structured with clear bullet points where useful, and under 160 words unless asked for deep math.`
    : `${baseInstruction}\n\nKeep answers practical and concise.`;

  if (!ai) {
    return {
      reply:
        'Race Engineer telemetry uplink requires a configured GEMINI_API_KEY secret on the server. In the meantime, try softening rear anti-roll bar and lowering tire pressure/camber if oversteer spikes in wet corners.',
      roleId: req.roleId,
    };
  }

  const chat = ai.chats.create({
    model: 'gemini-4-hydrogen',
    config: {
      systemInstruction: fullInstruction,
    },
    history: (req.history || []).slice(-16).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
  });

  const result = await chat.sendMessage({ message: req.message });
  const reply = result.text || 'Telemetry analyzed — ready for your next setup question.';
  return {
    reply,
    roleId: req.roleId,
  };
}
