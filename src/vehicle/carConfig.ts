import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface CarGlbMeshConfig {
  body: string[];
  glass: string[];
  wheelFL: string[];
  wheelFR: string[];
  wheelRL: string[];
  wheelRR: string[];
  caliperFL: string[];
  caliperFR: string[];
  caliperRL: string[];
  caliperRR: string[];
  discFL: string[];
  discFR: string[];
  discRL: string[];
  discRR: string[];
  headlights: string[];
  taillights: string[];
  reverseLights: string[];
  indicatorsLeft: string[];
  indicatorsRight: string[];
  interior: string[];
  spoiler: string[];
}

export const DEFAULT_CAR_GLB_MESH_CONFIG: CarGlbMeshConfig = {
  body: ['body', 'chassis', 'paint', 'car_body'],
  glass: ['glass', 'windshield', 'windows'],
  wheelFL: ['wheel_fl', 'wheelFL', 'fl_wheel'],
  wheelFR: ['wheel_fr', 'wheelFR', 'fr_wheel'],
  wheelRL: ['wheel_rl', 'wheelRL', 'rl_wheel'],
  wheelRR: ['wheel_rr', 'wheelRR', 'rr_wheel'],
  caliperFL: ['caliper_fl', 'caliperFL'],
  caliperFR: ['caliper_fr', 'caliperFR'],
  caliperRL: ['caliper_rl', 'caliperRL'],
  caliperRR: ['caliper_rr', 'caliperRR'],
  discFL: ['disc_fl', 'discFL', 'rotor_fl'],
  discFR: ['disc_fr', 'discFR', 'rotor_fr'],
  discRL: ['disc_rl', 'discRL', 'rotor_rl'],
  discRR: ['disc_rr', 'discRR', 'rotor_rr'],
  headlights: ['headlights', 'headlight_l', 'headlight_r'],
  taillights: ['taillights', 'taillight', 'brake_lights'],
  reverseLights: ['reverse_lights', 'reverse'],
  indicatorsLeft: ['indicator_l', 'blinker_l'],
  indicatorsRight: ['indicator_r', 'blinker_r'],
  interior: ['interior', 'cockpit', 'dashboard', 'seats'],
  spoiler: ['spoiler', 'wing', 'rear_wing'],
};

let cachedCarGlbUrl: string | null | undefined;
let cachedCarGlbScene: THREE.Group | null = null;
let statusCheckPromise: Promise<string | null> | null = null;

/**
 * Checks `/api/assets/car-model-status` so we never trigger a 404 console error
 * when `/public/models/car.glb` is absent, while seamlessly loading `/models/car.glb` if present.
 */
export async function checkDefaultCarGlbAvailable(): Promise<string | null> {
  if (cachedCarGlbUrl !== undefined) return cachedCarGlbUrl;
  if (!statusCheckPromise) {
    statusCheckPromise = (async () => {
      try {
        const res = await fetch('/api/assets/car-model-status');
        if (!res.ok) {
          cachedCarGlbUrl = null;
          return null;
        }
        const data = (await res.json()) as { exists?: boolean; url?: string };
        cachedCarGlbUrl = data.exists && data.url ? data.url : null;
        return cachedCarGlbUrl;
      } catch {
        cachedCarGlbUrl = null;
        return null;
      }
    })();
  }
  return statusCheckPromise;
}

export async function loadCarGlbGroup(url: string): Promise<THREE.Group | null> {
  if (url === '/models/car.glb' && cachedCarGlbScene) {
    return cachedCarGlbScene.clone(true);
  }
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene || gltf.scenes[0];
    if (!root) return null;
    if (url === '/models/car.glb') {
      cachedCarGlbScene = root.clone(true);
    }
    return root;
  } catch {
    return null;
  }
}

export function matchesMeshName(name: string, candidates: string[]): boolean {
  const lower = name.toLowerCase();
  return candidates.some((c) => lower.includes(c.toLowerCase()));
}

let cachedFlakeNormalTex: THREE.CanvasTexture | null = null;
export function getMetallicFlakeNormalTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedFlakeNormalTex) return cachedFlakeNormalTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const nx = 128 + (rand() - 0.5) * 32;
    const ny = 128 + (rand() - 0.5) * 32;
    img.data[i] = nx;
    img.data[i + 1] = ny;
    img.data[i + 2] = 248;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  cachedFlakeNormalTex = tex;
  return tex;
}

let cachedNumberTex: THREE.CanvasTexture | null = null;
export function getRacingNumberTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedNumberTex) return cachedNumberTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 124px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('07', 128, 134);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedNumberTex = tex;
  return tex;
}
