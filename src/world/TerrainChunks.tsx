import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { QualityTier, WeatherId } from '../config/types';
import {
  getAsphaltDistance,
  getDirtDistance,
  getGroundHeight,
  WORLD_PLAYABLE_RADIUS,
} from '../track/trackData';

interface TerrainChunksProps {
  weatherId: WeatherId;
  qualityTier: QualityTier;
  isSoftwareGl: boolean;
}

const CHUNK_GRID = 4; // 4x4 = 16 frustum-culled terrain chunks
const WORLD_SPAN = 960;
const CHUNK_SIZE = WORLD_SPAN / CHUNK_GRID;

export function TerrainChunks({ weatherId, qualityTier, isSoftwareGl }: TerrainChunksProps) {
  const segsPerChunk = isSoftwareGl || qualityTier === 'low' ? 18 : qualityTier === 'medium' ? 24 : 32;
  const isSandstorm = weatherId === 'sandstorm';

  const chunkGeometries = useMemo(() => {
    const out: Array<{ key: string; geo: THREE.BufferGeometry }> = [];
    const colGrass = new THREE.Color('#3b6232');
    const colSand = new THREE.Color('#b6895b');
    const colDirt = new THREE.Color('#7c573c');
    const colRock = new THREE.Color('#57534e');
    const colShoulder = new THREE.Color('#64686d');
    const tmp = new THREE.Color();

    for (let gz = 0; gz < CHUNK_GRID; gz++) {
      for (let gx = 0; gx < CHUNK_GRID; gx++) {
        const cx = -WORLD_SPAN * 0.5 + (gx + 0.5) * CHUNK_SIZE;
        const cz = -WORLD_SPAN * 0.5 + (gz + 0.5) * CHUNK_SIZE;
        const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segsPerChunk, segsPerChunk);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position as THREE.BufferAttribute;
        const colors = new Float32Array(pos.count * 3);

        for (let i = 0; i < pos.count; i++) {
          const wx = pos.getX(i) + cx;
          const wz = pos.getZ(i) + cz;
          const wy = getGroundHeight(wx, wz);
          pos.setXYZ(i, wx, wy, wz);

          const radial = Math.hypot(wx, wz);
          const asphaltDist = getAsphaltDistance(wx, wz);
          const dirtDist = getDirtDistance(wx, wz);

          if (radial > 305) {
            tmp.copy(colRock).lerp(colSand, 0.25);
          } else if (asphaltDist < 13) {
            tmp.copy(colShoulder);
          } else if (dirtDist < 11) {
            tmp.copy(colDirt);
          } else if (isSandstorm) {
            tmp.copy(colSand);
          } else {
            const blend = Math.max(0, Math.min(1, (wy - 2) / 14));
            tmp.copy(colGrass).lerp(colSand, blend * 0.6);
          }

          colors[i * 3] = tmp.r;
          colors[i * 3 + 1] = tmp.g;
          colors[i * 3 + 2] = tmp.b;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        out.push({ key: `${gx}-${gz}`, geo });
      }
    }
    return out;
  }, [segsPerChunk, isSandstorm]);

  // Instanced Pine Trees & Rocks outside roads
  const propCount = isSoftwareGl || qualityTier === 'low' ? 90 : qualityTier === 'medium' ? 160 : 260;

  const { treeMatrices, rockMatrices } = useMemo(() => {
    const tMats: THREE.Matrix4[] = [];
    const rMats: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    let seed = 4242;
    const rand = () => {
      seed = (seed * 48271) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < propCount * 2 && (tMats.length < propCount || rMats.length < propCount * 0.5); i++) {
      const angle = rand() * Math.PI * 2;
      const rad = 25 + rand() * (WORLD_PLAYABLE_RADIUS - 35);
      const x = Math.cos(angle) * rad;
      const z = Math.sin(angle) * rad;
      if (getAsphaltDistance(x, z) < 16 || getDirtDistance(x, z) < 12) continue;

      const y = getGroundHeight(x, z);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);

      if (tMats.length < propCount && i % 3 !== 0) {
        const s = 0.8 + rand() * 0.9;
        dummy.scale.set(s, s, s);
        dummy.position.y = y + 2.6 * s;
        dummy.updateMatrix();
        tMats.push(dummy.matrix.clone());
      } else if (rMats.length < Math.floor(propCount * 0.5)) {
        const s = 0.9 + rand() * 1.6;
        dummy.scale.set(s * 1.2, s * 0.75, s);
        dummy.position.y = y + 0.4 * s;
        dummy.updateMatrix();
        rMats.push(dummy.matrix.clone());
      }
    }

    return { treeMatrices: tMats, rockMatrices: rMats };
  }, [propCount]);

  const treeRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const windTimeUniform = useRef({ value: 0 });

  useFrame((state) => {
    windTimeUniform.current.value = state.clock.elapsedTime;
    if (treeRef.current && treeRef.current.userData.count !== treeMatrices.length) {
      treeMatrices.forEach((m, idx) => treeRef.current!.setMatrixAt(idx, m));
      treeRef.current.instanceMatrix.needsUpdate = true;
      treeRef.current.userData.count = treeMatrices.length;
    }
    if (rockRef.current && rockRef.current.userData.count !== rockMatrices.length) {
      rockMatrices.forEach((m, idx) => rockRef.current!.setMatrixAt(idx, m));
      rockRef.current.instanceMatrix.needsUpdate = true;
      rockRef.current.userData.count = rockMatrices.length;
    }
  });

  return (
    <group>
      {/* Frustum-culled Terrain Chunks */}
      {chunkGeometries.map((c) => (
        <mesh key={c.key} geometry={c.geo} receiveShadow={!isSoftwareGl} frustumCulled>
          <meshStandardMaterial vertexColors roughness={0.94} metalness={0.02} />
        </mesh>
      ))}

      {/* Instanced Foliage with Wind Sway in Vertex Shader */}
      {treeMatrices.length > 0 && (
        <instancedMesh
          ref={treeRef}
          args={[undefined, undefined, treeMatrices.length]}
          castShadow={!isSoftwareGl}
          frustumCulled={false}
        >
          <coneGeometry args={[1.9, 6.2, 6]} />
          <meshStandardMaterial
            color={isSandstorm ? '#78716c' : '#2d5a36'}
            roughness={0.88}
            onBeforeCompile={(shader) => {
              shader.uniforms.uWindTime = windTimeUniform.current;
              shader.vertexShader =
                'uniform float uWindTime;\n' +
                shader.vertexShader.replace(
                  '#include <begin_vertex>',
                  `
                  #include <begin_vertex>
                  float swayMask = clamp((position.y + 2.5) / 6.2, 0.0, 1.0);
                  transformed.x += sin(uWindTime * 1.8 + instanceMatrix[3][0] * 0.15) * 0.28 * swayMask;
                  transformed.z += cos(uWindTime * 1.4 + instanceMatrix[3][2] * 0.15) * 0.18 * swayMask;
                  `
                );
            }}
          />
        </instancedMesh>
      )}

      {/* Instanced Canyon Boulders */}
      {rockMatrices.length > 0 && (
        <instancedMesh
          ref={rockRef}
          args={[undefined, undefined, rockMatrices.length]}
          castShadow={!isSoftwareGl}
          receiveShadow={!isSoftwareGl}
          frustumCulled={false}
        >
          <dodecahedronGeometry args={[1.4, 0]} />
          <meshStandardMaterial color="#6b635b" roughness={0.92} />
        </instancedMesh>
      )}
    </group>
  );
}
