import * as THREE from 'three';
import type { SurfaceType, TrackId, WeatherId } from '../config/types';

export interface RoadPoint {
  x: number;
  z: number;
  bankRad?: number;
}

export interface SplineSample {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  rx: number;
  rz: number;
  bankRad: number;
  curvature: number;
  targetSpeedMs: number;
  distAlong: number;
}

export interface TrackDefinition {
  id: TrackId;
  name: string;
  subtitle: string;
  surface: string;
  laps: number;
  waypoints: RoadPoint[];
  spawnPoint: { x: number; z: number; yaw: number };
}

export const ASPHALT_LOOP_POINTS: RoadPoint[] = [
  { x: 0, z: 185 },
  { x: 95, z: 185 },
  { x: 185, z: 155 },
  { x: 245, z: 85 },
  { x: 255, z: -10 },
  { x: 215, z: -105 },
  { x: 135, z: -175 },
  { x: 35, z: -195 },
  { x: -65, z: -165 },
  { x: -135, z: -95 },
  { x: -215, z: -85 },
  { x: -265, z: -15 },
  { x: -245, z: 85 },
  { x: -180, z: 160 },
  { x: -95, z: 185 },
];

export const DIRT_LOOP_POINTS: RoadPoint[] = [
  { x: -155, z: -70 },
  { x: -95, z: -25 },
  { x: -35, z: -55 },
  { x: 25, z: -115 },
  { x: 95, z: -95 },
  { x: 115, z: -25 },
  { x: 65, z: 45 },
  { x: -15, z: 70 },
  { x: -95, z: 55 },
  { x: -155, z: 10 },
];

export const DRIFT_PLAZA_CENTER = { x: 125, z: 65, radius: 42 };
export const FESTIVAL_PLAZA_CENTER = { x: 0, z: 185 };

export const PUDDLE_ZONES = [
  { x: 165, z: 168, radius: 11 },
  { x: 248, z: 25, radius: 13 },
  { x: 60, z: -190, radius: 12 },
  { x: -255, z: 35, radius: 14 },
  { x: -55, z: 185, radius: 10 },
];

export const ASPHALT_ROAD_HALF_WIDTH = 9.0;
export const DIRT_ROAD_HALF_WIDTH = 7.0;
export const WORLD_PLAYABLE_RADIUS = 380;

// Deterministic 2D hash & FBM value noise for natural terrain micro-undulations
function hash2(ix: number, iz: number): number {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm2D(x: number, z: number): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    val += amp * (valueNoise2D(x * freq, z * freq) * 2 - 1);
    freq *= 2.03;
    amp *= 0.5;
  }
  return val;
}

function buildCurve(pts: RoadPoint[]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p.x, 0, p.z)),
    true,
    'catmullrom',
    0.5
  );
}

export const ASPHALT_CURVE = buildCurve(ASPHALT_LOOP_POINTS);
export const DIRT_CURVE = buildCurve(DIRT_LOOP_POINTS);

function buildDenseSplineFromCurve(curve: THREE.CatmullRomCurve3, samples: number): RoadPoint[] {
  const out: RoadPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const p = curve.getPointAt(i / samples);
    out.push({ x: p.x, z: p.z });
  }
  return out;
}

export const DENSE_ASPHALT_SPLINE = buildDenseSplineFromCurve(ASPHALT_CURVE, 240);
export const DENSE_DIRT_SPLINE = buildDenseSplineFromCurve(DIRT_CURVE, 160);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function minDistanceAndSide(
  x: number,
  z: number,
  spline: RoadPoint[]
): { dist: number; signedSide: number; idx: number } {
  let minSq = Infinity;
  let bestIdx = 0;
  for (let i = 0; i < spline.length; i++) {
    const p = spline[i];
    const dx = x - p.x;
    const dz = z - p.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minSq) {
      minSq = dSq;
      bestIdx = i;
    }
  }
  const p = spline[bestIdx];
  const next = spline[(bestIdx + 1) % spline.length];
  const tx = next.x - p.x;
  const tz = next.z - p.z;
  const len = Math.hypot(tx, tz) || 1;
  const rx = -tz / len;
  const rz = tx / len;
  const signedSide = (x - p.x) * rx + (z - p.z) * rz;
  return { dist: Math.sqrt(minSq), signedSide, idx: bestIdx };
}

export function getAsphaltDistance(x: number, z: number): number {
  return minDistanceAndSide(x, z, DENSE_ASPHALT_SPLINE).dist;
}

export function getDirtDistance(x: number, z: number): number {
  return minDistanceAndSide(x, z, DENSE_DIRT_SPLINE).dist;
}

function computeSplineCurvatures(spline: RoadPoint[]): number[] {
  const n = spline.length;
  const curv: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const prev = spline[(i - 2 + n) % n];
    const curr = spline[i];
    const next = spline[(i + 2) % n];
    const v1x = curr.x - prev.x;
    const v1z = curr.z - prev.z;
    const v2x = next.x - curr.x;
    const v2z = next.z - curr.z;
    const l1 = Math.hypot(v1x, v1z) || 1;
    const l2 = Math.hypot(v2x, v2z) || 1;
    const cross = (v1x * v2z - v1z * v2x) / (l1 * l2);
    curv[i] = cross / ((l1 + l2) * 0.5);
  }
  return curv;
}

const ASPHALT_CURVATURES = computeSplineCurvatures(DENSE_ASPHALT_SPLINE);
const DIRT_CURVATURES = computeSplineCurvatures(DENSE_DIRT_SPLINE);

export function getRoadBankAngle(x: number, z: number): number {
  const info = minDistanceAndSide(x, z, DENSE_ASPHALT_SPLINE);
  if (info.dist > ASPHALT_ROAD_HALF_WIDTH + 4) return 0;
  const k = ASPHALT_CURVATURES[info.idx] ?? 0;
  // Subtle realistic corner banking up to ~5.5 degrees
  return Math.max(-0.095, Math.min(0.095, k * 4.5));
}

export function getGroundHeight(x: number, z: number): number {
  const radial = Math.sqrt(x * x + z * z);
  const fbmHills = fbm2D(x * 0.0055, z * 0.0055) * 6.8 + fbm2D(x * 0.018, z * 0.018) * 1.4;
  const rollingHills =
    Math.sin(x * 0.014) * Math.cos(z * 0.013) * 3.8 +
    Math.sin((x + z) * 0.008) * 2.8 +
    fbmHills;

  const mountainFactor = smoothstep(285, 520, radial);
  const ridgeDetail =
    (Math.sin(Math.atan2(z, x) * 9) * 0.5 + 0.5) * 26 +
    Math.cos(x * 0.022 + z * 0.019) * 10;
  const perimeterHeight = mountainFactor * (48 + ridgeDetail);
  const northBank = smoothstep(40, -180, z) * 4.0;

  let rawH = rollingHills + northBank + perimeterHeight;

  const asphaltInfo = minDistanceAndSide(x, z, DENSE_ASPHALT_SPLINE);
  const asphaltFlatten =
    1 - smoothstep(ASPHALT_ROAD_HALF_WIDTH + 1.5, ASPHALT_ROAD_HALF_WIDTH + 22, asphaltInfo.dist);

  const bankAngle =
    asphaltInfo.dist < ASPHALT_ROAD_HALF_WIDTH + 3
      ? Math.max(-0.095, Math.min(0.095, (ASPHALT_CURVATURES[asphaltInfo.idx] ?? 0) * 4.5))
      : 0;
  const roadCamberY =
    Math.max(-ASPHALT_ROAD_HALF_WIDTH, Math.min(ASPHALT_ROAD_HALF_WIDTH, asphaltInfo.signedSide)) *
    Math.sin(bankAngle);
  const roadElevation = northBank * 0.65 + Math.sin(x * 0.008) * 1.4 + roadCamberY;
  rawH = rawH * (1 - asphaltFlatten) + roadElevation * asphaltFlatten;

  const dxP = x - DRIFT_PLAZA_CENTER.x;
  const dzP = z - DRIFT_PLAZA_CENTER.z;
  const plazaDist = Math.sqrt(dxP * dxP + dzP * dzP);
  const plazaFlatten =
    1 - smoothstep(DRIFT_PLAZA_CENTER.radius, DRIFT_PLAZA_CENTER.radius + 18, plazaDist);
  rawH = rawH * (1 - plazaFlatten) + 0.4 * plazaFlatten;

  const dirtInfo = minDistanceAndSide(x, z, DENSE_DIRT_SPLINE);
  const dirtFlatten =
    1 - smoothstep(DIRT_ROAD_HALF_WIDTH, DIRT_ROAD_HALF_WIDTH + 14, dirtInfo.dist);
  const dirtElevation =
    northBank * 0.52 +
    Math.sin(x * 0.008) * 1.1 +
    Math.sin(x * 0.028) * Math.cos(z * 0.028) * 1.05;
  rawH = rawH * (1 - dirtFlatten * 0.85) + dirtElevation * (dirtFlatten * 0.85);

  return rawH;
}

export function getGroundNormal(x: number, z: number): { nx: number; ny: number; nz: number } {
  const eps = 0.55;
  const hL = getGroundHeight(x - eps, z);
  const hR = getGroundHeight(x + eps, z);
  const hD = getGroundHeight(x, z - eps);
  const hU = getGroundHeight(x, z + eps);
  const nx = hL - hR;
  const ny = 2 * eps;
  const nz = hD - hU;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return { nx: nx / len, ny: ny / len, nz: nz / len };
}

export function getSurfaceType(x: number, z: number, weatherId: WeatherId): SurfaceType {
  const isRainy = weatherId === 'heavy_rain' || weatherId === 'thunderstorm';

  if (isRainy) {
    for (const p of PUDDLE_ZONES) {
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz <= p.radius * p.radius) {
        return 'puddle';
      }
    }
  }

  const dxP = x - DRIFT_PLAZA_CENTER.x;
  const dzP = z - DRIFT_PLAZA_CENTER.z;
  if (dxP * dxP + dzP * dzP <= DRIFT_PLAZA_CENTER.radius * DRIFT_PLAZA_CENTER.radius) {
    return isRainy ? 'wet_asphalt' : 'asphalt';
  }

  const asphaltDist = getAsphaltDistance(x, z);
  if (asphaltDist <= ASPHALT_ROAD_HALF_WIDTH - 0.8) {
    return isRainy ? 'wet_asphalt' : 'asphalt';
  }
  if (asphaltDist <= ASPHALT_ROAD_HALF_WIDTH + 0.9) {
    return 'curb';
  }
  if (asphaltDist <= ASPHALT_ROAD_HALF_WIDTH + 3.2) {
    return 'gravel';
  }

  const dirtDist = getDirtDistance(x, z);
  if (dirtDist <= DIRT_ROAD_HALF_WIDTH) {
    return weatherId === 'sandstorm' ? 'sand' : 'dirt';
  }
  if (dirtDist <= DIRT_ROAD_HALF_WIDTH + 2.4) {
    return 'gravel';
  }

  if (weatherId === 'sandstorm') {
    return 'sand';
  }
  return 'grass';
}

export function getNearestGuardrailDistance(x: number, z: number): number {
  const asphaltInfo = minDistanceAndSide(x, z, DENSE_ASPHALT_SPLINE);
  // Guardrails sit at ASPHALT_ROAD_HALF_WIDTH + 1.8m on outer straights/corners
  return Math.abs(ASPHALT_ROAD_HALF_WIDTH + 1.8 - asphaltInfo.dist);
}

export function computeRacingLine(trackId: TrackId): SplineSample[] {
  const isDirt = trackId === 'baja_rally';
  const spline = isDirt ? DENSE_DIRT_SPLINE : DENSE_ASPHALT_SPLINE;
  const curvs = isDirt ? DIRT_CURVATURES : ASPHALT_CURVATURES;
  const n = spline.length;
  const out: SplineSample[] = [];
  let dist = 0;

  for (let i = 0; i < n; i++) {
    const prev = spline[(i - 1 + n) % n];
    const curr = spline[i];
    const next = spline[(i + 1) % n];
    if (i > 0) dist += Math.hypot(curr.x - prev.x, curr.z - prev.z);

    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    const ntx = tx / len;
    const ntz = tz / len;
    const rx = -ntz;
    const rz = ntx;

    const k = Math.abs(curvs[i] ?? 0);
    // Max lateral acceleration ~13 m/s^2 on asphalt, ~8.5 on dirt
    const maxLatA = isDirt ? 8.5 : 13.5;
    const vCap = isDirt ? 46 : 74;
    const targetSpeedMs = Math.min(vCap, Math.sqrt(maxLatA / Math.max(0.0028, k)));

    out.push({
      x: curr.x,
      y: getGroundHeight(curr.x, curr.z),
      z: curr.z,
      tx: ntx,
      tz: ntz,
      rx,
      rz,
      bankRad: getRoadBankAngle(curr.x, curr.z),
      curvature: curvs[i] ?? 0,
      targetSpeedMs,
      distAlong: dist,
    });
  }
  return out;
}

function sampleCheckpoints(spline: RoadPoint[], count: number): RoadPoint[] {
  const out: RoadPoint[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i / count) * spline.length) % spline.length;
    out.push(spline[idx]);
  }
  return out;
}

export const TRACKS: Record<TrackId, TrackDefinition> = {
  free_roam: {
    id: 'free_roam',
    name: 'Open World Cruise',
    subtitle: 'Explore the festival circuit, drift plaza & Baja canyon',
    surface: 'Mixed Asphalt & Dirt',
    laps: 0,
    waypoints: [],
    spawnPoint: { x: 0, z: 185, yaw: Math.PI / 2 },
  },
  festival_circuit: {
    id: 'festival_circuit',
    name: 'Horizon Festival Circuit',
    subtitle: 'High-speed tarmac loop with banked corners & stadium chicane',
    surface: 'Asphalt Circuit',
    laps: 2,
    waypoints: sampleCheckpoints(DENSE_ASPHALT_SPLINE, 12),
    spawnPoint: { x: -12, z: 185, yaw: Math.PI / 2 },
  },
  canyon_sprint: {
    id: 'canyon_sprint',
    name: 'Sierra Canyon Sprint',
    subtitle: 'Point-to-point flat-out dash from Festival Plaza to North Ridge',
    surface: 'Highway Asphalt',
    laps: 1,
    waypoints: DENSE_ASPHALT_SPLINE.slice(8, 120).filter((_, i) => i % 11 === 0),
    spawnPoint: { x: 0, z: 185, yaw: Math.PI / 2 },
  },
  baja_rally: {
    id: 'baja_rally',
    name: 'Baja Arroyo Scramble',
    subtitle: 'Technical gravel & red-clay offroad stage',
    surface: 'Dirt & Gravel',
    laps: 2,
    waypoints: sampleCheckpoints(DENSE_DIRT_SPLINE, 10),
    spawnPoint: { x: -155, z: -70, yaw: 0.72 },
  },
};
