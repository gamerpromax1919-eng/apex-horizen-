import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CarDefinition, QualityTier, VehicleTelemetry, WeatherId } from '../config/types';
import { getGroundHeight } from '../track/trackData';

interface ParticlesAndSkidsProps {
  car: CarDefinition;
  weatherId: WeatherId;
  qualityTier: QualityTier;
  isSoftwareGl: boolean;
  telemetryRef: React.RefObject<VehicleTelemetry>;
}

interface ParticleSlot {
  active: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

interface SkidSlot {
  active: boolean;
  age: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function ParticlesAndSkids({
  car,
  weatherId,
  qualityTier,
  isSoftwareGl,
  telemetryRef,
}: ParticlesAndSkidsProps) {
  const maxParticles = isSoftwareGl || qualityTier === 'low' ? 60 : 180;
  const maxSkids = isSoftwareGl || qualityTier === 'low' ? 90 : 240;

  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const skidsRef = useRef<THREE.InstancedMesh>(null);

  const particlePool = useMemo<ParticleSlot[]>(
    () =>
      Array.from({ length: maxParticles }, () => ({
        active: false,
        age: 0,
        life: 1,
        x: 0,
        y: -500,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 0.3,
        r: 0.9,
        g: 0.9,
        b: 0.9,
      })),
    [maxParticles]
  );

  const skidPool = useMemo<SkidSlot[]>(
    () =>
      Array.from({ length: maxSkids }, () => ({
        active: false,
        age: 0,
        x: 0,
        y: -500,
        z: 0,
        yaw: 0,
      })),
    [maxSkids]
  );

  const pCursor = useRef(0);
  const sCursor = useRef(0);
  const emitAccum = useRef(0);
  const skidAccum = useRef(0);

  const spawnParticle = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    r: number,
    g: number,
    b: number
  ) => {
    const slot = particlePool[pCursor.current];
    pCursor.current = (pCursor.current + 1) % maxParticles;
    slot.active = true;
    slot.age = 0;
    slot.life = life;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.size = size;
    slot.r = r;
    slot.g = g;
    slot.b = b;
  };

  useFrame((_state, rawDt) => {
    const dt = Math.min(0.05, rawDt);
    const t = telemetryRef.current;
    if (!t) return;

    _q.set(t.qx, t.qy, t.qz, t.qw);
    _fwd.set(0, 0, 1).applyQuaternion(_q).normalize();
    _right.set(1, 0, 0).applyQuaternion(_q).normalize();

    const halfTrack = car.trackWidthM * 0.5;
    const halfWb = car.wheelbaseM * 0.5;
    const isRainy = weatherId === 'heavy_rain' || weatherId === 'thunderstorm';

    emitAccum.current += dt;
    skidAccum.current += dt;

    // Emit wheel particles (smoke, dust, gravel, rain spray) + exhaust pops
    if (emitAccum.current > 0.032 && t.speedKmh > 8) {
      emitAccum.current = 0;
      for (let i = 0; i < 4; i++) {
        const w = t.wheels[i];
        if (!w.grounded) continue;
        const side = i % 2 === 0 ? halfTrack : -halfTrack;
        const fore = i < 2 ? halfWb : -halfWb;
        const wx = t.x + _right.x * side + _fwd.x * fore;
        const wz = t.z + _right.z * side + _fwd.z * fore;
        const wy = getGroundHeight(wx, wz) + 0.16;

        const heavySlip = Math.abs(w.slipAngleRad) > 0.2 || Math.abs(w.slipRatio) > 0.25;
        const offroad = w.surface === 'dirt' || w.surface === 'sand' || w.surface === 'gravel' || w.surface === 'grass';

        if ((isRainy || w.surface === 'puddle') && t.speedKmh > 35 && i >= 2) {
          spawnParticle(
            wx,
            wy + 0.1,
            wz,
            -t.vx * 0.18 + (Math.random() - 0.5) * 1.4,
            1.6 + Math.random() * 1.8,
            -t.vz * 0.18 + (Math.random() - 0.5) * 1.4,
            0.55,
            0.42,
            0.78,
            0.88,
            0.96
          );
        } else if (offroad && t.speedKmh > 20) {
          const isGravel = w.surface === 'gravel';
          spawnParticle(
            wx,
            wy + 0.08,
            wz,
            (Math.random() - 0.5) * 1.8,
            1.2 + Math.random() * 1.5,
            (Math.random() - 0.5) * 1.8,
            0.75,
            isGravel ? 0.22 : 0.52,
            isGravel ? 0.55 : 0.72,
            isGravel ? 0.5 : 0.58,
            isGravel ? 0.44 : 0.41
          );
        } else if (heavySlip && (w.surface === 'asphalt' || w.surface === 'curb' || w.surface === 'wet_asphalt')) {
          spawnParticle(
            wx,
            wy + 0.1,
            wz,
            (Math.random() - 0.5) * 1.4,
            0.9 + Math.random() * 1.1,
            (Math.random() - 0.5) * 1.4,
            0.9,
            0.55,
            0.88,
            0.9,
            0.94
          );
        }
      }

      // Collision sparks burst
      if (t.impactIntensity > 0.25) {
        for (let k = 0; k < 6; k++) {
          spawnParticle(
            t.x + (Math.random() - 0.5) * 1.4,
            t.y + 0.45,
            t.z + (Math.random() - 0.5) * 2.2,
            (Math.random() - 0.5) * 12,
            2 + Math.random() * 6,
            (Math.random() - 0.5) * 12,
            0.4,
            0.14,
            1.0,
            0.68,
            0.15
          );
        }
      }
    }

    // Skid mark decals behind rear wheels during drift/hard braking
    const rearSlipping =
      t.isDrifting ||
      Math.abs(t.wheels[2].slipRatio) > 0.26 ||
      Math.abs(t.wheels[2].slipAngleRad) > 0.18;
    if (skidAccum.current > 0.028 && rearSlipping && t.speedKmh > 18 && !isRainy) {
      skidAccum.current = 0;
      for (const side of [halfTrack, -halfTrack]) {
        const wx = t.x + _right.x * side - _fwd.x * halfWb;
        const wz = t.z + _right.z * side - _fwd.z * halfWb;
        const slot = skidPool[sCursor.current];
        sCursor.current = (sCursor.current + 1) % maxSkids;
        slot.active = true;
        slot.age = 0;
        slot.x = wx;
        slot.y = getGroundHeight(wx, wz) + 0.095;
        slot.z = wz;
        slot.yaw = t.yaw;
      }
    }

    // Update particle instances
    const pMesh = particlesRef.current;
    if (pMesh) {
      for (let i = 0; i < maxParticles; i++) {
        const p = particlePool[i];
        if (p.active) {
          p.age += dt;
          if (p.age >= p.life) {
            p.active = false;
            _dummy.position.set(0, -500, 0);
            _dummy.scale.set(0.001, 0.001, 0.001);
          } else {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            p.vy *= Math.exp(-1.5 * dt);
            const prog = p.age / p.life;
            const scale = p.size * (0.65 + prog * 1.65) * (1 - prog * 0.45);
            _dummy.position.set(p.x, p.y, p.z);
            _dummy.rotation.set(0, 0, 0);
            _dummy.scale.set(scale, scale, scale);
            _color.setRGB(p.r, p.g, p.b);
            pMesh.setColorAt(i, _color);
          }
        } else {
          _dummy.position.set(0, -500, 0);
          _dummy.scale.set(0.001, 0.001, 0.001);
        }
        _dummy.updateMatrix();
        pMesh.setMatrixAt(i, _dummy.matrix);
      }
      pMesh.instanceMatrix.needsUpdate = true;
      if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
    }

    // Update skid marks
    const sMesh = skidsRef.current;
    if (sMesh) {
      for (let i = 0; i < maxSkids; i++) {
        const s = skidPool[i];
        if (s.active) {
          s.age += dt;
          if (s.age > 14) {
            s.active = false;
            _dummy.position.set(0, -500, 0);
            _dummy.scale.set(0.001, 0.001, 0.001);
          } else {
            const fade = Math.max(0.05, 1 - s.age / 14);
            _dummy.position.set(s.x, s.y, s.z);
            _dummy.rotation.set(-Math.PI / 2, 0, s.yaw);
            _dummy.scale.set(0.28, 1.05 * fade, 1);
          }
        } else {
          _dummy.position.set(0, -500, 0);
          _dummy.scale.set(0.001, 0.001, 0.001);
        }
        _dummy.updateMatrix();
        sMesh.setMatrixAt(i, _dummy.matrix);
      }
      sMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={particlesRef} args={[undefined, undefined, maxParticles]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial transparent opacity={0.58} roughness={0.95} depthWrite={false} />
      </instancedMesh>

      <instancedMesh ref={skidsRef} args={[undefined, undefined, maxSkids]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#09090b" transparent opacity={0.52} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
