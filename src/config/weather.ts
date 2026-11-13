import { TIRE_COMPOUND_STATS } from '../physics/tuning';
import type {
  SurfaceType,
  TimeOfDayId,
  TimeOfDayProfile,
  TireCompound,
  WeatherId,
  WeatherProfile,
} from './types';

export const WEATHER_PROFILES: Record<WeatherId, WeatherProfile> = {
  clear_golden: {
    id: 'clear_golden',
    label: 'Clear Sky',
    description: 'Dry tarmac, peak tire adhesion, crisp horizon visibility.',
    roadGripMultiplier: 1.0,
    dirtGripMultiplier: 0.92,
    rollingDragMultiplier: 1.0,
    hydroplaneRisk: 0,
    windSpeedKmh: 8,
    windAngleRad: 0.4,
    rainIntensity: 0,
    dustIntensity: 0.05,
    lightningFrequency: 0,
    fogDensity: 0.0012,
    skyTint: '#fb923c',
    fogColor: '#e8b994',
    ambientBoost: 1.0,
    roadRoughness: 0.72,
    windshieldDrops: 0,
  },
  overcast_dusk: {
    id: 'overcast_dusk',
    label: 'Cloudy Mist',
    description: 'Cool mountain cloud cover with lightly damp asphalt.',
    roadGripMultiplier: 0.93,
    dirtGripMultiplier: 0.95,
    rollingDragMultiplier: 1.03,
    hydroplaneRisk: 0.08,
    windSpeedKmh: 18,
    windAngleRad: 1.1,
    rainIntensity: 0.12,
    dustIntensity: 0,
    lightningFrequency: 0,
    fogDensity: 0.0026,
    skyTint: '#94a3b8',
    fogColor: '#7c8ba1',
    ambientBoost: 0.85,
    roadRoughness: 0.45,
    windshieldDrops: 0.15,
  },
  heavy_rain: {
    id: 'heavy_rain',
    label: 'Heavy Rain',
    description: 'Standing water on asphalt, mirror reflections, and hydroplaning risk.',
    roadGripMultiplier: 0.69,
    dirtGripMultiplier: 0.74,
    rollingDragMultiplier: 1.14,
    hydroplaneRisk: 0.48,
    windSpeedKmh: 28,
    windAngleRad: 2.2,
    rainIntensity: 0.78,
    dustIntensity: 0,
    lightningFrequency: 0.08,
    fogDensity: 0.0042,
    skyTint: '#475569',
    fogColor: '#3f4c5e',
    ambientBoost: 0.72,
    roadRoughness: 0.14,
    windshieldDrops: 0.75,
  },
  thunderstorm: {
    id: 'thunderstorm',
    label: 'Thunderstorm',
    description: 'Torrential downpour, gusting crosswinds, and lightning flashes.',
    roadGripMultiplier: 0.6,
    dirtGripMultiplier: 0.66,
    rollingDragMultiplier: 1.22,
    hydroplaneRisk: 0.76,
    windSpeedKmh: 58,
    windAngleRad: 1.57,
    rainIntensity: 1.0,
    dustIntensity: 0,
    lightningFrequency: 0.85,
    fogDensity: 0.0056,
    skyTint: '#1e293b',
    fogColor: '#212c3b',
    ambientBoost: 0.56,
    roadRoughness: 0.09,
    windshieldDrops: 1.0,
  },
  sandstorm: {
    id: 'sandstorm',
    label: 'Canyon Fog & Dust',
    description: 'Dense desert dust & fog reducing asphalt grip and visibility.',
    roadGripMultiplier: 0.76,
    dirtGripMultiplier: 0.94,
    rollingDragMultiplier: 1.1,
    hydroplaneRisk: 0,
    windSpeedKmh: 46,
    windAngleRad: 0.8,
    rainIntensity: 0,
    dustIntensity: 0.95,
    lightningFrequency: 0,
    fogDensity: 0.0052,
    skyTint: '#d97706',
    fogColor: '#b97e48',
    ambientBoost: 0.9,
    roadRoughness: 0.84,
    windshieldDrops: 0,
  },
};

export const TIME_OF_DAY_PROFILES: Record<TimeOfDayId, TimeOfDayProfile> = {
  dawn: {
    id: 'dawn',
    label: 'Dawn',
    sunElevationDeg: 14,
    sunAzimuthDeg: 70,
    sunColor: '#fdba74',
    sunIntensity: 1.85,
    hemiSkyColor: '#93c5fd',
    hemiGroundColor: '#4338ca',
    hemiIntensity: 0.75,
    skyTopColor: '#38598b',
    skyHorizonColor: '#f6ad7b',
    headlightsOn: true,
    starIntensity: 0.15,
    exposure: 1.08,
  },
  noon: {
    id: 'noon',
    label: 'Midday',
    sunElevationDeg: 64,
    sunAzimuthDeg: 150,
    sunColor: '#fffbeb',
    sunIntensity: 2.55,
    hemiSkyColor: '#7dd3fc',
    hemiGroundColor: '#78716c',
    hemiIntensity: 0.9,
    skyTopColor: '#1d6fa5',
    skyHorizonColor: '#bae6fd',
    headlightsOn: false,
    starIntensity: 0,
    exposure: 1.12,
  },
  golden_hour: {
    id: 'golden_hour',
    label: 'Golden Hour',
    sunElevationDeg: 19,
    sunAzimuthDeg: 245,
    sunColor: '#fbbf24',
    sunIntensity: 2.35,
    hemiSkyColor: '#a5b4fc',
    hemiGroundColor: '#9a3412',
    hemiIntensity: 0.82,
    skyTopColor: '#253b6e',
    skyHorizonColor: '#f59e0b',
    headlightsOn: false,
    starIntensity: 0.05,
    exposure: 1.12,
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    sunElevationDeg: 28,
    sunAzimuthDeg: 310,
    sunColor: '#93c5fd',
    sunIntensity: 0.65,
    hemiSkyColor: '#1e293b',
    hemiGroundColor: '#090d16',
    hemiIntensity: 0.42,
    skyTopColor: '#050814',
    skyHorizonColor: '#172542',
    headlightsOn: true,
    starIntensity: 1.0,
    exposure: 1.24,
  },
};

export interface SurfacePhysicsResult {
  grip: number;
  rollingDrag: number;
  windForceX: number;
  windForceZ: number;
  hydroplaning: boolean;
  particleKind: 'smoke' | 'spray' | 'dust' | 'gravel';
}

export const SURFACE_FRICTION_BASE: Record<SurfaceType, { friction: number; drag: number; particle: 'smoke' | 'spray' | 'dust' | 'gravel' }> = {
  asphalt: { friction: 1.05, drag: 1.0, particle: 'smoke' },
  wet_asphalt: { friction: 0.74, drag: 1.12, particle: 'spray' },
  curb: { friction: 0.96, drag: 1.06, particle: 'smoke' },
  dirt: { friction: 0.72, drag: 1.28, particle: 'dust' },
  gravel: { friction: 0.68, drag: 1.35, particle: 'gravel' },
  sand: { friction: 0.61, drag: 1.44, particle: 'dust' },
  grass: { friction: 0.56, drag: 1.54, particle: 'dust' },
  puddle: { friction: 0.42, drag: 1.52, particle: 'spray' },
};

export function computeSurfacePhysics(
  surface: SurfaceType,
  tireCompound: TireCompound,
  weatherId: WeatherId,
  speedKmh: number,
  rideHeightMm: number
): SurfacePhysicsResult {
  const weather = WEATHER_PROFILES[weatherId];
  const tire = TIRE_COMPOUND_STATS[tireCompound];
  const baseSurf = SURFACE_FRICTION_BASE[surface];

  const isWet = weather.rainIntensity > 0.3 || surface === 'wet_asphalt' || surface === 'puddle';
  const isPaved = surface === 'asphalt' || surface === 'wet_asphalt' || surface === 'curb';

  let baseTireGrip: number;
  if (surface === 'puddle') {
    baseTireGrip = tire.wetGrip * 0.6;
  } else if (isPaved) {
    baseTireGrip = isWet ? tire.wetGrip : tire.dryGrip;
  } else if (surface === 'dirt' || surface === 'gravel' || surface === 'sand') {
    baseTireGrip = tire.dirtGrip;
  } else {
    baseTireGrip = tire.dirtGrip * 0.8;
  }

  const weatherMod = isPaved ? weather.roadGripMultiplier : weather.dirtGripMultiplier;

  const slickPenalty = tireCompound === 'slick' ? 1.45 : tireCompound === 'semislick' ? 1.15 : 0.72;
  const speedRatio = Math.max(0, (speedKmh - 85) / 120);
  const hydroplaneIntensity =
    (surface === 'puddle' ? 1.0 : isPaved ? weather.hydroplaneRisk : 0) *
    speedRatio *
    slickPenalty;
  const hydroplaning = hydroplaneIntensity > 0.32;

  const grip = Math.max(
    0.22,
    baseTireGrip * baseSurf.friction * weatherMod * (1 - Math.min(0.45, hydroplaneIntensity * 0.55))
  );

  const clearancePenalty = !isPaved && rideHeightMm < 0 ? Math.abs(rideHeightMm) * 0.008 : 0;
  const rollingDrag = baseSurf.drag * weather.rollingDragMultiplier + clearancePenalty;

  const windMs = weather.windSpeedKmh / 3.6;
  const windForceMag = windMs * windMs * 0.0045;
  const windForceX = Math.cos(weather.windAngleRad) * windForceMag;
  const windForceZ = Math.sin(weather.windAngleRad) * windForceMag;

  return {
    grip,
    rollingDrag,
    windForceX,
    windForceZ,
    hydroplaning,
    particleKind: isWet && isPaved ? 'spray' : baseSurf.particle,
  };
}
