import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TrackId, WeatherId } from '../config/types';
import { WEATHER_PROFILES } from '../config/weather';
import {
  ASPHALT_ROAD_HALF_WIDTH,
  DENSE_ASPHALT_SPLINE,
  DENSE_DIRT_SPLINE,
  DIRT_ROAD_HALF_WIDTH,
  DRIFT_PLAZA_CENTER,
  getGroundHeight,
  getRoadBankAngle,
  PUDDLE_ZONES,
  TRACKS,
} from './trackData';

interface TrackMeshesProps {
  trackId: TrackId;
  weatherId: WeatherId;
  activeCheckpoint: number;
  isSoftwareGl: boolean;
}

function createAsphaltTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#22262e';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt aggregate noise
  for (let i = 0; i < 4200; i++) {
    const x = (Math.sin(i * 19.3) * 0.5 + 0.5) * 512;
    const y = (Math.cos(i * 47.1) * 0.5 + 0.5) * 512;
    const v = 28 + (i % 24);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // White edge lines
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(18, 0, 10, 512);
  ctx.fillRect(484, 0, 10, 512);

  // Dashed yellow center line
  ctx.fillStyle = '#facc15';
  for (let y = 16; y < 512; y += 64) {
    ctx.fillRect(252, y, 8, 34);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 78);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildRibbonGeometry(
  spline: Array<{ x: number; z: number }>,
  halfWidth: number,
  yOffset: number,
  useBanking: boolean
): THREE.BufferGeometry {
  const n = spline.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const curr = spline[i % n];
    const next = spline[(i + 1) % n];
    const tx = next.x - curr.x;
    const tz = next.z - curr.z;
    const len = Math.hypot(tx, tz) || 1;
    const rx = -tz / len;
    const rz = tx / len;

    const bank = useBanking ? getRoadBankAngle(curr.x, curr.z) : 0;
    const camberLift = halfWidth * Math.sin(bank);

    const lx = curr.x - rx * halfWidth;
    const lz = curr.z - rz * halfWidth;
    const rxp = curr.x + rx * halfWidth;
    const rzp = curr.z + rz * halfWidth;

    const ly = getGroundHeight(lx, lz) + yOffset - camberLift * 0.35;
    const ry = getGroundHeight(rxp, rzp) + yOffset + camberLift * 0.35;

    positions.push(lx, ly, lz, rxp, ry, rzp);
    uvs.push(0, i / n, 1, i / n);

    if (i < n) {
      const b = i * 2;
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildCurbGeometry(spline: Array<{ x: number; z: number }>, sideSign: 1 | -1): THREE.BufferGeometry {
  const n = spline.length;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const innerR = ASPHALT_ROAD_HALF_WIDTH - 0.1;
  const outerR = ASPHALT_ROAD_HALF_WIDTH + 1.05;

  for (let i = 0; i <= n; i++) {
    const curr = spline[i % n];
    const next = spline[(i + 1) % n];
    const tx = next.x - curr.x;
    const tz = next.z - curr.z;
    const len = Math.hypot(tx, tz) || 1;
    const rx = (-tz / len) * sideSign;
    const rz = (tx / len) * sideSign;

    const x0 = curr.x + rx * innerR;
    const z0 = curr.z + rz * innerR;
    const x1 = curr.x + rx * outerR;
    const z1 = curr.z + rz * outerR;

    const y0 = getGroundHeight(x0, z0) + 0.08;
    const y1 = getGroundHeight(x1, z1) + 0.13;

    positions.push(x0, y0, z0, x1, y1, z1);
    const isRed = i % 2 === 0;
    const cr = isRed ? 0.86 : 0.94;
    const cg = isRed ? 0.16 : 0.95;
    const cb = isRed ? 0.16 : 0.96;
    colors.push(cr, cg, cb, cr, cg, cb);

    if (i < n) {
      const b = i * 2;
      if (sideSign > 0) {
        indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      } else {
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function TrackMeshes({ trackId, weatherId, activeCheckpoint, isSoftwareGl }: TrackMeshesProps) {
  const weather = WEATHER_PROFILES[weatherId];
  const isRainy = weather.rainIntensity > 0.3;

  const asphaltTex = useMemo(() => createAsphaltTexture(), []);
  const asphaltGeo = useMemo(
    () => buildRibbonGeometry(DENSE_ASPHALT_SPLINE, ASPHALT_ROAD_HALF_WIDTH, 0.08, true),
    []
  );
  const dirtGeo = useMemo(
    () => buildRibbonGeometry(DENSE_DIRT_SPLINE, DIRT_ROAD_HALF_WIDTH, 0.07, false),
    []
  );
  const curbOuterGeo = useMemo(() => buildCurbGeometry(DENSE_ASPHALT_SPLINE, 1), []);
  const curbInnerGeo = useMemo(() => buildCurbGeometry(DENSE_ASPHALT_SPLINE, -1), []);

  // Guardrail posts & rails (every 3rd spline sample along outer edge)
  const guardrailTransforms = useMemo(() => {
    const out: Array<{ pos: [number, number, number]; yaw: number }> = [];
    const n = DENSE_ASPHALT_SPLINE.length;
    for (let i = 0; i < n; i += 4) {
      const p0 = DENSE_ASPHALT_SPLINE[i];
      const p1 = DENSE_ASPHALT_SPLINE[(i + 2) % n];
      const tx = p1.x - p0.x;
      const tz = p1.z - p0.z;
      const len = Math.hypot(tx, tz) || 1;
      const rx = -tz / len;
      const rz = tx / len;
      const gx = p0.x + rx * (ASPHALT_ROAD_HALF_WIDTH + 2.1);
      const gz = p0.z + rz * (ASPHALT_ROAD_HALF_WIDTH + 2.1);
      const gy = getGroundHeight(gx, gz) + 0.55;
      out.push({ pos: [gx, gy, gz], yaw: Math.atan2(tx, tz) });
    }
    return out;
  }, []);

  const guardrailRef = useRef<THREE.InstancedMesh>(null);
  const spectatorRef = useRef<THREE.InstancedMesh>(null);
  const checkpointRingRef = useRef<THREE.Mesh>(null);

  useMemo(() => {
    // Applied cleanly via useEffect/frame or inline setup below
  }, []);

  // Populate guardrail & spectator instanced meshes once mounted
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((state) => {
    if (guardrailRef.current && guardrailRef.current.userData.populated !== true) {
      guardrailTransforms.forEach((g, idx) => {
        dummy.position.set(g.pos[0], g.pos[1], g.pos[2]);
        dummy.rotation.set(0, g.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        guardrailRef.current!.setMatrixAt(idx, dummy.matrix);
      });
      guardrailRef.current.instanceMatrix.needsUpdate = true;
      guardrailRef.current.userData.populated = true;
    }

    if (spectatorRef.current && spectatorRef.current.userData.populated !== true) {
      const palette = ['#ef4444', '#38bdf8', '#f59e0b', '#e2e8f0', '#22c55e', '#a855f7'];
      const col = new THREE.Color();
      for (let i = 0; i < 64; i++) {
        const row = i % 2;
        const bx = -22 + (i % 32) * 1.4;
        const bz = 200 + row * 1.8;
        const by = getGroundHeight(bx, bz) + 2.1 + row * 0.9;
        dummy.position.set(bx, by, bz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        spectatorRef.current.setMatrixAt(i, dummy.matrix);
        col.set(palette[i % palette.length]);
        spectatorRef.current.setColorAt(i, col);
      }
      spectatorRef.current.instanceMatrix.needsUpdate = true;
      if (spectatorRef.current.instanceColor) spectatorRef.current.instanceColor.needsUpdate = true;
      spectatorRef.current.userData.populated = true;
    }

    if (checkpointRingRef.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.05;
      checkpointRingRef.current.scale.set(s, s, s);
    }
  });

  // Tire stacks & braking markers at major corners
  const brakingMarkers = useMemo(() => {
    return [
      { idx: 30, label: '150' },
      { idx: 90, label: '100' },
      { idx: 155, label: '50' },
      { idx: 210, label: '100' },
    ].map((m) => {
      const p = DENSE_ASPHALT_SPLINE[m.idx];
      const next = DENSE_ASPHALT_SPLINE[(m.idx + 1) % DENSE_ASPHALT_SPLINE.length];
      const tx = next.x - p.x;
      const tz = next.z - p.z;
      const len = Math.hypot(tx, tz) || 1;
      const rx = -tz / len;
      const rz = tx / len;
      const x = p.x + rx * (ASPHALT_ROAD_HALF_WIDTH + 2.8);
      const z = p.z + rz * (ASPHALT_ROAD_HALF_WIDTH + 2.8);
      return {
        pos: [x, getGroundHeight(x, z) + 1.4, z] as [number, number, number],
        yaw: Math.atan2(tx, tz),
      };
    });
  }, []);

  const track = TRACKS[trackId];
  const cpPoint =
    track && track.waypoints.length > 0
      ? track.waypoints[activeCheckpoint % track.waypoints.length]
      : null;

  const startY = getGroundHeight(0, 185);
  const plazaY = getGroundHeight(DRIFT_PLAZA_CENTER.x, DRIFT_PLAZA_CENTER.z);

  return (
    <group>
      {/* Banked Main Asphalt Circuit */}
      <mesh geometry={asphaltGeo} receiveShadow={!isSoftwareGl}>
        <meshStandardMaterial
          map={asphaltTex}
          color={isRainy ? '#94a3b8' : '#ffffff'}
          roughness={weather.roadRoughness}
          metalness={isRainy ? 0.42 : 0.08}
        />
      </mesh>

      {/* Apex Red/White Curbs */}
      <mesh geometry={curbOuterGeo} receiveShadow={!isSoftwareGl}>
        <meshStandardMaterial vertexColors roughness={0.62} />
      </mesh>
      <mesh geometry={curbInnerGeo} receiveShadow={!isSoftwareGl}>
        <meshStandardMaterial vertexColors roughness={0.62} />
      </mesh>

      {/* Baja Rally Dirt & Gravel Loop */}
      <mesh geometry={dirtGeo} receiveShadow={!isSoftwareGl}>
        <meshStandardMaterial color="#8b5a36" roughness={0.94} metalness={0.02} />
      </mesh>

      {/* Drift & Gymkhana Asphalt Pad */}
      <mesh position={[DRIFT_PLAZA_CENTER.x, plazaY + 0.06, DRIFT_PLAZA_CENTER.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={!isSoftwareGl}>
        <circleGeometry args={[DRIFT_PLAZA_CENTER.radius, 40]} />
        <meshStandardMaterial
          color="#242933"
          roughness={weather.roadRoughness}
          metalness={isRainy ? 0.38 : 0.06}
        />
      </mesh>

      {/* Rain Puddles (mirror-like sheen when raining) */}
      {isRainy &&
        PUDDLE_ZONES.map((p, i) => (
          <mesh
            key={i}
            position={[p.x, getGroundHeight(p.x, p.z) + 0.11, p.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[p.radius, 24]} />
            <meshPhysicalMaterial
              color="#334155"
              roughness={0.04}
              metalness={0.7}
              clearcoat={1}
              transparent
              opacity={0.78}
            />
          </mesh>
        ))}

      {/* Instanced Metallic Guardrails */}
      <instancedMesh
        ref={guardrailRef}
        args={[undefined, undefined, guardrailTransforms.length]}
        castShadow={!isSoftwareGl}
      >
        <boxGeometry args={[0.25, 0.72, 6.2]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.75} roughness={0.35} />
      </instancedMesh>

      {/* Braking Marker Boards */}
      {brakingMarkers.map((b, i) => (
        <group key={i} position={b.pos} rotation={[0, b.yaw, 0]}>
          <mesh>
            <boxGeometry args={[0.14, 1.3, 0.9]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.18, 0.55, 0.95]} />
            <meshStandardMaterial color="#dc2626" roughness={0.45} />
          </mesh>
        </group>
      ))}

      {/* Start/Finish Horizon Festival Gantry */}
      <group position={[14, startY, 185]}>
        <mesh position={[0, 7.6, -11]}>
          <boxGeometry args={[1.4, 15.2, 1.4]} />
          <meshStandardMaterial color="#18181b" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 7.6, 11]}>
          <boxGeometry args={[1.4, 15.2, 1.4]} />
          <meshStandardMaterial color="#18181b" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 14.5, 0]}>
          <boxGeometry args={[1.8, 2.2, 24]} />
          <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[-0.95, 14.5, 0]}>
          <boxGeometry args={[0.12, 1.4, 20]} />
          <meshStandardMaterial color="#ff5a1f" emissive="#ff5a1f" emissiveIntensity={2.6} />
        </mesh>
        {/* Checkered Start Line */}
        {Array.from({ length: 8 }).map((_, idx) => (
          <mesh
            key={idx}
            position={[idx % 2 === 0 ? -0.45 : 0.45, 0.13, -7 + idx * 2]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.9, 1.8]} />
            <meshStandardMaterial color={idx % 2 === 0 ? '#f8fafc' : '#0f172a'} roughness={0.55} />
          </mesh>
        ))}
      </group>

      {/* Highway Bridge Arch at Far Straight (x ~ 35, z ~ -195) */}
      <group position={[35, getGroundHeight(35, -195), -195]}>
        <mesh position={[0, 6.2, -12]}>
          <boxGeometry args={[2.2, 12.4, 2.2]} />
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 6.2, 12]}>
          <boxGeometry args={[2.2, 12.4, 2.2]} />
          <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 12.2, 0]}>
          <boxGeometry args={[4.5, 1.6, 28]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.45} />
        </mesh>
      </group>

      {/* Festival Grandstand + Instanced Spectator Crowd */}
      <group position={[0, startY, 201]}>
        <mesh position={[0, 2.2, 0]} castShadow={!isSoftwareGl}>
          <boxGeometry args={[48, 4.4, 6.5]} />
          <meshStandardMaterial color="#1e293b" roughness={0.75} />
        </mesh>
        <mesh position={[0, 6.2, 2.2]}>
          <boxGeometry args={[50, 0.5, 8]} />
          <meshStandardMaterial color="#e11d48" emissive="#be123c" emissiveIntensity={0.7} />
        </mesh>
      </group>
      <instancedMesh ref={spectatorRef} args={[undefined, undefined, 64]}>
        <boxGeometry args={[0.55, 1.35, 0.45]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>

      {/* Active Checkpoint Holographic Gate */}
      {cpPoint && (
        <mesh
          ref={checkpointRingRef}
          position={[cpPoint.x, getGroundHeight(cpPoint.x, cpPoint.z) + 4.5, cpPoint.z]}
        >
          <torusGeometry args={[6.4, 0.28, 12, 32]} />
          <meshStandardMaterial
            color="#38bdf8"
            emissive="#0ea5e9"
            emissiveIntensity={3.2}
            transparent
            opacity={0.85}
          />
        </mesh>
      )}
    </group>
  );
}
