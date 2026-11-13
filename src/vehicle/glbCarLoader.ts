import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  CAR_MODELS_CONFIG,
  getCarModelConfig,
  type CarGlbModelConfig,
  type CarModelSelection,
} from './carModels.config';

export interface WheelPivotRig {
  steerPivot: THREE.Group;
  spinPivot: THREE.Group;
  baseY: number;
}

export interface PreparedCarGlb {
  root: THREE.Group;
  wheels: [
    WheelPivotRig | null,
    WheelPivotRig | null,
    WheelPivotRig | null,
    WheelPivotRig | null,
  ];
  paintMaterials: THREE.MeshPhysicalMaterial[];
  glassMaterials: THREE.MeshPhysicalMaterial[];
  headlightMaterials: THREE.MeshStandardMaterial[];
  taillightMaterials: THREE.MeshStandardMaterial[];
  config: CarGlbModelConfig;
  loadedUrl: string;
  dimensions: { width: number; height: number; length: number };
}

const GSTATIC_DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
const LOCAL_DRACO_PATH = '/draco/';

const rawSceneCache = new Map<string, THREE.Group>();
const loggedUrls = new Set<string>();
let manifestPromise: Promise<Set<string>> | null = null;

export async function getLocalModelsManifest(): Promise<Set<string>> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    try {
      const res = await fetch('/api/assets/models-manifest');
      if (!res.ok) return new Set<string>();
      const data = (await res.json()) as { files?: string[] };
      return new Set(data.files ?? []);
    } catch {
      return new Set<string>();
    }
  })();
  return manifestPromise;
}

async function loadRawGltfWithDraco(url: string): Promise<THREE.Group> {
  const cached = rawSceneCache.get(url);
  if (cached) {
    return cached.clone(true);
  }

  const attemptLoad = async (decoderPath: string): Promise<THREE.Group> => {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(decoderPath);
    loader.setDRACOLoader(dracoLoader);
    try {
      const gltf = await loader.loadAsync(url);
      const scene = gltf.scene || gltf.scenes?.[0];
      if (!scene) {
        throw new Error(`GLTF at ${url} had no scene`);
      }
      return scene;
    } finally {
      dracoLoader.dispose();
    }
  };

  let scene: THREE.Group;
  try {
    scene = await attemptLoad(GSTATIC_DRACO_PATH);
  } catch (err) {
    // Retry once with local /draco/ decoder in case gstatic CDN is unreachable
    try {
      scene = await attemptLoad(LOCAL_DRACO_PATH);
    } catch {
      throw err;
    }
  }

  rawSceneCache.set(url, scene.clone(true));
  return scene;
}

function logSceneHierarchy(scene: THREE.Object3D, config: CarGlbModelConfig, url: string): void {
  if (loggedUrls.has(url)) return;
  loggedUrls.add(url);

  const nodeNames: string[] = [];
  const materialNames = new Set<string>();

  scene.traverse((obj) => {
    if (obj.name) nodeNames.push(obj.name);
    if (obj instanceof THREE.Mesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m?.name) materialNames.add(m.name);
      }
    }
  });

  console.log(`[CarGLB] Loaded "${config.name}" from ${url}`);
  console.log(`[CarGLB] Nodes (${nodeNames.length}):`, nodeNames);
  console.log(`[CarGLB] Materials (${materialNames.size}):`, Array.from(materialNames));
}

function matchesAny(name: string, candidates: string[]): boolean {
  const lower = name.toLowerCase();
  return candidates.some((c) => lower === c.toLowerCase() || lower.includes(c.toLowerCase()));
}

function findWheelNodesByName(
  scene: THREE.Object3D,
  config: CarGlbModelConfig
): [THREE.Object3D | null, THREE.Object3D | null, THREE.Object3D | null, THREE.Object3D | null] {
  const slots: [
    THREE.Object3D | null,
    THREE.Object3D | null,
    THREE.Object3D | null,
    THREE.Object3D | null,
  ] = [null, null, null, null];

  const slotKeys: Array<keyof CarGlbModelConfig['wheelNodeNames']> = ['fl', 'fr', 'rl', 'rr'];
  scene.traverse((obj) => {
    const n = obj.name || '';
    if (!n || /steering/i.test(n)) return;
    slotKeys.forEach((key, idx) => {
      if (!slots[idx] && matchesAny(n, config.wheelNodeNames[key])) {
        slots[idx] = obj;
      }
    });
  });

  if (slots.every(Boolean)) {
    return slots;
  }

  // Secondary name-pattern scan ("wheel", "tire", "tyre", "rim") positioned into FL/FR/RL/RR
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const patternCandidates: Array<{ obj: THREE.Object3D; center: THREE.Vector3 }> = [];

  scene.traverse((obj) => {
    const n = obj.name || '';
    if (!n || /steering/i.test(n)) return;
    if (!/(wheel|tire|tyre|rim)/i.test(n)) return;
    // Skip child nodes if an ancestor was already captured as a wheel group
    let p = obj.parent;
    while (p) {
      if (p.name && /(wheel|tire|tyre|rim)/i.test(p.name) && !/steering/i.test(p.name)) {
        return;
      }
      p = p.parent;
    }
    box.setFromObject(obj);
    if (box.isEmpty()) return;
    box.getCenter(center);
    patternCandidates.push({ obj, center: center.clone() });
  });

  for (const cand of patternCandidates) {
    const idx =
      (cand.center.x >= 0 ? 0 : 1) + (cand.center.z >= 0 ? 0 : 2);
    if (!slots[idx]) {
      slots[idx] = cand.obj;
    }
  }

  return slots;
}

function detectWheelClustersByGeometry(
  scene: THREE.Object3D,
  totalBox: THREE.Box3
): [THREE.Mesh[], THREE.Mesh[], THREE.Mesh[], THREE.Mesh[]] {
  const clusters: [THREE.Mesh[], THREE.Mesh[], THREE.Mesh[], THREE.Mesh[]] = [[], [], [], []];
  const totalSize = new THREE.Vector3();
  const totalCenter = new THREE.Vector3();
  totalBox.getSize(totalSize);
  totalBox.getCenter(totalCenter);

  const mBox = new THREE.Box3();
  const mSize = new THREE.Vector3();
  const mCenter = new THREE.Vector3();

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const n = (obj.name || '').toLowerCase();
    if (/steering|windshield|window|glass|body|chassis|underbody|hood|boot|bumper|seat|cockpit/.test(n)) {
      return;
    }
    mBox.setFromObject(obj);
    if (mBox.isEmpty()) return;
    mBox.getSize(mSize);
    mBox.getCenter(mCenter);

    const relX = mCenter.x - totalCenter.x;
    const relZ = mCenter.z - totalCenter.z;
    const relY = mCenter.y - totalBox.min.y;

    // Must live in lower wheelhouse corners and have compact wheel-like dimensions
    const nearCornerX = Math.abs(relX) > totalSize.x * 0.24;
    const nearCornerZ = Math.abs(relZ) > totalSize.z * 0.16;
    const inWheelHeight = relY < totalSize.y * 0.45 && mBox.min.y < totalBox.min.y + totalSize.y * 0.3;
    const compactSize =
      mSize.x < 0.62 &&
      mSize.y > 0.08 &&
      mSize.y < 1.0 &&
      mSize.z > 0.08 &&
      mSize.z < 1.0 &&
      Math.max(mSize.y, mSize.z) / Math.max(0.05, Math.min(mSize.y, mSize.z)) < 1.65;

    if (nearCornerX && nearCornerZ && inWheelHeight && compactSize) {
      const idx = (relX >= 0 ? 0 : 1) + (relZ >= 0 ? 0 : 2);
      clusters[idx].push(obj);
    }
  });

  // Verify each corner cluster has realistic wheel outer bounds
  const cBox = new THREE.Box3();
  const cSize = new THREE.Vector3();
  return clusters.map((meshes) => {
    if (meshes.length === 0) return [];
    cBox.makeEmpty();
    for (const m of meshes) {
      cBox.expandByObject(m);
    }
    cBox.getSize(cSize);
    if (cSize.y < 0.35 || cSize.y > 1.05 || cSize.z < 0.35 || cSize.z > 1.05) {
      return [];
    }
    return meshes;
  }) as [THREE.Mesh[], THREE.Mesh[], THREE.Mesh[], THREE.Mesh[]];
}

function prepareNormalizedScene(
  rawScene: THREE.Group,
  config: CarGlbModelConfig,
  loadedUrl: string,
  isSoftwareGl: boolean
): PreparedCarGlb {
  logSceneHierarchy(rawScene, config, loadedUrl);

  const root = new THREE.Group();
  const modelHolder = new THREE.Group();
  modelHolder.add(rawScene);
  root.add(modelHolder);

  // 1. Apply configured initial rotation fix
  modelHolder.rotation.set(config.rotationFix[0], config.rotationFix[1], config.rotationFix[2]);
  root.updateMatrixWorld(true);

  // 2. Align longest horizontal dimension to Z axis
  const rawBox = new THREE.Box3().setFromObject(modelHolder);
  const rawSize = new THREE.Vector3();
  rawBox.getSize(rawSize);
  if (rawSize.x > rawSize.z * 1.15) {
    modelHolder.rotation.y += Math.PI / 2;
    root.updateMatrixWorld(true);
    rawBox.setFromObject(modelHolder);
    rawBox.getSize(rawSize);
  }

  // 3. Verify front faces +Z when front/rear wheel or "frente" markers exist
  const flNamed = findWheelNodesByName(modelHolder, config);
  if (flNamed[0] && flNamed[2]) {
    const flPos = new THREE.Box3().setFromObject(flNamed[0]).getCenter(new THREE.Vector3());
    const rlPos = new THREE.Box3().setFromObject(flNamed[2]).getCenter(new THREE.Vector3());
    if (flPos.z < rlPos.z) {
      modelHolder.rotation.y += Math.PI;
      root.updateMatrixWorld(true);
    }
  } else {
    // Check named front cues ("frente", "headlight", "windshield")
    let frontZSum = 0;
    let frontCount = 0;
    modelHolder.traverse((obj) => {
      const n = (obj.name || '').toLowerCase();
      if (/frente|headlight|front_bumper|grille/.test(n)) {
        const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
        frontZSum += c.z;
        frontCount++;
      }
    });
    if (frontCount > 0 && frontZSum / frontCount < 0) {
      modelHolder.rotation.y += Math.PI;
      root.updateMatrixWorld(true);
    }
  }

  // 4. Normalize scale to targetLengthM (~4.4 m) and sit min.y at y = 0 centered in X/Z
  const orientedBox = new THREE.Box3().setFromObject(modelHolder);
  const orientedSize = new THREE.Vector3();
  orientedBox.getSize(orientedSize);
  const lengthAxis = Math.max(0.01, orientedSize.z);
  const scaleFactor = (config.targetLengthM * config.scale) / lengthAxis;
  modelHolder.scale.multiplyScalar(scaleFactor);
  root.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(modelHolder);
  const scaledCenter = new THREE.Vector3();
  const scaledSize = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  scaledBox.getSize(scaledSize);

  modelHolder.position.x -= scaledCenter.x;
  modelHolder.position.z -= scaledCenter.z;
  modelHolder.position.y -= scaledBox.min.y;
  root.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(modelHolder);

  // 5. Detect wheels (explicit names -> name patterns -> geometry heuristic) and wrap in clean pivots
  const wheelPivots: [
    WheelPivotRig | null,
    WheelPivotRig | null,
    WheelPivotRig | null,
    WheelPivotRig | null,
  ] = [null, null, null, null];

  const namedWheels = findWheelNodesByName(modelHolder, config);
  const wheelMeshSet = new Set<THREE.Object3D>();
  const wheelTargets: Array<THREE.Object3D[]> = [[], [], [], []];

  if (namedWheels.filter(Boolean).length === 4) {
    namedWheels.forEach((w, idx) => {
      if (w) {
        wheelTargets[idx] = [w];
        w.traverse((child) => wheelMeshSet.add(child));
      }
    });
  } else {
    const geoClusters = detectWheelClustersByGeometry(modelHolder, finalBox);
    for (let i = 0; i < 4; i++) {
      if (namedWheels[i]) {
        wheelTargets[i] = [namedWheels[i]!];
        namedWheels[i]!.traverse((child) => wheelMeshSet.add(child));
      } else if (geoClusters[i].length > 0) {
        wheelTargets[i] = geoClusters[i];
        geoClusters[i].forEach((m) => wheelMeshSet.add(m));
      }
    }
  }

  const wBox = new THREE.Box3();
  const wCenter = new THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    const targets = wheelTargets[i];
    if (targets.length === 0) continue;

    wBox.makeEmpty();
    for (const obj of targets) {
      wBox.expandByObject(obj);
    }
    if (wBox.isEmpty()) continue;
    wBox.getCenter(wCenter);

    const steerPivot = new THREE.Group();
    steerPivot.name = `pivot_steer_${i}`;
    steerPivot.position.copy(wCenter);
    root.add(steerPivot);

    const spinPivot = new THREE.Group();
    spinPivot.name = `pivot_spin_${i}`;
    steerPivot.add(spinPivot);

    root.updateMatrixWorld(true);
    for (const obj of targets) {
      spinPivot.attach(obj);
    }

    wheelPivots[i] = {
      steerPivot,
      spinPivot,
      baseY: steerPivot.position.y,
    };
  }

  // 6. Upgrade materials (Physical clearcoat paint, transmission glass, emissive lights, rubber tires)
  const paintMaterials: THREE.MeshPhysicalMaterial[] = [];
  const glassMaterials: THREE.MeshPhysicalMaterial[] = [];
  const headlightMaterials: THREE.MeshStandardMaterial[] = [];
  const taillightMaterials: THREE.MeshStandardMaterial[] = [];

  const materialUpgradeCache = new Map<THREE.Material, THREE.Material>();

  const upgradeSingleMaterial = (
    orig: THREE.Material,
    mesh: THREE.Mesh
  ): THREE.Material => {
    const cached = materialUpgradeCache.get(orig);
    if (cached) return cached;

    const matName = orig.name || '';
    const meshName = mesh.name || '';
    const stdOrig = orig as THREE.MeshStandardMaterial;
    const isWheelMesh = wheelMeshSet.has(mesh);

    // Check Paint (exclude semi-transparent outer clear-shell "coat" on Porsche)
    const isClearCoatOverlay =
      matName.toLowerCase() === 'coat' && (orig.transparent || orig.opacity < 0.85);
    if (
      !isClearCoatOverlay &&
      !isWheelMesh &&
      (matchesAny(matName, config.paintMaterialNames) ||
        (config.paintMaterialNames.length === 0 &&
          /paint|car_body|body_color/i.test(matName)))
    ) {
      const phys = new THREE.MeshPhysicalMaterial({
        color: stdOrig.color ? stdOrig.color.clone() : new THREE.Color('#e11d48'),
        metalness: 0.72,
        roughness: 0.22,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.35,
      });
      phys.name = matName || 'upgraded_paint';
      paintMaterials.push(phys);
      materialUpgradeCache.set(orig, phys);
      return phys;
    }

    // Check Glass
    if (
      matchesAny(matName, config.glassMaterialNames) ||
      matchesAny(meshName, ['glass', 'windshield', 'window']) ||
      (orig.transparent && orig.opacity < 0.7 && !/light|lamp|license|logo/i.test(matName))
    ) {
      const glass = new THREE.MeshPhysicalMaterial({
        color: '#0c1524',
        metalness: 0.1,
        roughness: 0.06,
        transmission: isSoftwareGl ? 0 : 0.72,
        ior: 1.5,
        transparent: true,
        opacity: isSoftwareGl ? 0.58 : 0.42,
        envMapIntensity: 1.5,
      });
      glass.name = matName || 'upgraded_glass';
      glassMaterials.push(glass);
      materialUpgradeCache.set(orig, glass);
      return glass;
    }

    // Check Taillights
    if (
      matchesAny(matName, config.taillightMaterialNames) ||
      /taillight|brake_light|lights_red/i.test(matName + '_' + meshName)
    ) {
      const tail = new THREE.MeshStandardMaterial({
        color: '#7f1d1d',
        emissive: new THREE.Color('#ef4444'),
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.2,
        envMapIntensity: 1.2,
      });
      tail.name = matName || 'upgraded_taillight';
      taillightMaterials.push(tail);
      materialUpgradeCache.set(orig, tail);
      return tail;
    }

    // Check Headlights
    if (
      matchesAny(matName, config.headlightMaterialNames) ||
      /headlight|projector/i.test(matName + '_' + meshName)
    ) {
      const head = new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        emissive: new THREE.Color('#e0f2fe'),
        emissiveIntensity: 1.8,
        roughness: 0.15,
        metalness: 0.25,
        envMapIntensity: 1.4,
      });
      head.name = matName || 'upgraded_headlight';
      headlightMaterials.push(head);
      materialUpgradeCache.set(orig, head);
      return head;
    }

    // Check Tires (high-roughness dark rubber)
    if (
      matchesAny(matName, config.tireMaterialNames) ||
      /tire|tyre|rubber/i.test(matName + '_' + meshName)
    ) {
      const tire = new THREE.MeshStandardMaterial({
        color: '#14161a',
        roughness: 0.88,
        metalness: 0.05,
        envMapIntensity: 0.45,
        map: stdOrig.map ?? null,
        normalMap: stdOrig.normalMap ?? null,
      });
      tire.name = matName || 'upgraded_tire';
      materialUpgradeCache.set(orig, tire);
      return tire;
    }

    // Standard material enhancement: ensure envMapIntensity for crisp IBL reflections
    if ('envMapIntensity' in stdOrig) {
      stdOrig.envMapIntensity = 1.15;
    }
    materialUpgradeCache.set(orig, orig);
    return orig;
  };

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = !isSoftwareGl;
    obj.receiveShadow = !isSoftwareGl;
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => upgradeSingleMaterial(m, obj));
    } else if (obj.material) {
      obj.material = upgradeSingleMaterial(obj.material, obj);
    }
  });

  // Fallback: if no paint material matched by name (e.g. an uploaded generic GLB), promote largest non-wheel opaque mesh material
  if (paintMaterials.length === 0) {
    let bestMesh: THREE.Mesh | null = null;
    let bestVol = 0;
    const tmpB = new THREE.Box3();
    const tmpS = new THREE.Vector3();
    modelHolder.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || wheelMeshSet.has(obj)) return;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!mat || mat.transparent) return;
      tmpB.setFromObject(obj);
      tmpB.getSize(tmpS);
      const vol = tmpS.x * tmpS.y * tmpS.z;
      if (vol > bestVol) {
        bestVol = vol;
        bestMesh = obj;
      }
    });
    if (bestMesh) {
      const m = bestMesh as THREE.Mesh;
      const phys = new THREE.MeshPhysicalMaterial({
        color: '#e11d48',
        metalness: 0.72,
        roughness: 0.22,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.35,
      });
      m.material = phys;
      paintMaterials.push(phys);
    }
  }

  return {
    root,
    wheels: wheelPivots,
    paintMaterials,
    glassMaterials,
    headlightMaterials,
    taillightMaterials,
    config,
    loadedUrl,
    dimensions: {
      width: scaledSize.x,
      height: scaledSize.y,
      length: scaledSize.z,
    },
  };
}

export async function loadCarGlbWithCascade(
  selection: CarModelSelection,
  customGlbUrl: string | null,
  isSoftwareGl: boolean
): Promise<PreparedCarGlb | null> {
  if (customGlbUrl) {
    const customConfig: CarGlbModelConfig = {
      id: 'ferrari',
      name: 'Custom GLB',
      localFile: 'custom.glb',
      localUrl: customGlbUrl,
      remoteUrl: customGlbUrl,
      scale: 1,
      targetLengthM: 4.4,
      rotationFix: [0, 0, 0],
      draco: true,
      wheelNodeNames: {
        fl: ['wheel_fl', 'wheelfl', 'fl_wheel'],
        fr: ['wheel_fr', 'wheelfr', 'fr_wheel'],
        rl: ['wheel_rl', 'wheelrl', 'rl_wheel'],
        rr: ['wheel_rr', 'wheelrr', 'rr_wheel'],
      },
      paintMaterialNames: ['Body_Color', 'body', 'paint', 'chassis', 'car_body'],
      glassMaterialNames: ['Glass_Gray', 'glass', 'window', 'windshield'],
      tireMaterialNames: ['Tires', 'tire', 'rubber'],
      headlightMaterialNames: ['Projector_Glass', 'headlight', 'lights'],
      taillightMaterialNames: ['Taillight_Glass', 'taillight', 'brake'],
      credit: 'Custom Uploaded 3D Vehicle Model',
    };
    try {
      const raw = await loadRawGltfWithDraco(customGlbUrl);
      return prepareNormalizedScene(raw, customConfig, customGlbUrl, isSoftwareGl);
    } catch (err) {
      console.warn('[CarGLB] Failed to load custom GLB, falling back to cascade:', err);
    }
  }

  if (selection === 'procedural') {
    return null;
  }

  const manifest = await getLocalModelsManifest();

  // Order candidates: requested selection first (if explicit), followed by full fallback order
  const orderedConfigs: CarGlbModelConfig[] = [];
  if (selection !== 'auto') {
    const chosen = getCarModelConfig(selection);
    if (chosen) orderedConfigs.push(chosen);
  }
  for (const cfg of CAR_MODELS_CONFIG) {
    if (!orderedConfigs.some((c) => c.id === cfg.id)) {
      orderedConfigs.push(cfg);
    }
  }

  for (const cfg of orderedConfigs) {
    const candidateUrls: string[] = [];
    if (manifest.has(cfg.localFile)) {
      candidateUrls.push(cfg.localUrl);
    }
    candidateUrls.push(cfg.remoteUrl);

    for (const url of candidateUrls) {
      try {
        const raw = await loadRawGltfWithDraco(url);
        return prepareNormalizedScene(raw, cfg, url, isSoftwareGl);
      } catch (err) {
        console.warn(`[CarGLB] Source failed (${cfg.id} @ ${url}), trying next fallback:`, err);
      }
    }
  }

  console.warn('[CarGLB] All GLB sources failed, using procedural car fallback.');
  return null;
}
