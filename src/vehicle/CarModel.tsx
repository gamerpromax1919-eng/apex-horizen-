import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CarCustomization, CarDefinition, VehicleTelemetry } from '../config/types';
import {
  getMetallicFlakeNormalTexture,
  getRacingNumberTexture,
} from './carConfig';
import type { CarModelSelection } from './carModels.config';
import { loadCarGlbWithCascade, type PreparedCarGlb } from './glbCarLoader';

export interface CarModelProps {
  car: CarDefinition;
  customization: CarCustomization;
  telemetry?: VehicleTelemetry;
  telemetryRef?: React.RefObject<VehicleTelemetry>;
  headlightsOn?: boolean;
  isPlayer?: boolean;
  isSoftwareGl?: boolean;
  showLightCones?: boolean;
  glbModelId?: CarModelSelection;
  enableGlb?: boolean;
  customGlbUrl?: string | null;
  onModelStatusChange?: (status: {
    loading: boolean;
    credit: string | null;
    loadedModelName: string | null;
  }) => void;
  /** Static override pose (used in garage showroom or remote/ghost vehicles) */
  pose?: {
    x: number;
    y: number;
    z: number;
    qx?: number;
    qy?: number;
    qz?: number;
    qw?: number;
    yaw?: number;
    pitch?: number;
    roll?: number;
    steerAngle?: number;
    wheelSpin?: number;
    braking?: boolean;
    reversing?: boolean;
    nitrousActive?: boolean;
  };
  ghostOpacity?: number;
  turntableSpin?: boolean;
}

const _tmpColor = new THREE.Color();
const _dirtColor = new THREE.Color('#6b4f35');
const _flakeScale = new THREE.Vector2(0.06, 0.06);

interface ErrorBoundaryState {
  hasError: boolean;
}

export class CarModelErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[CarModelErrorBoundary] Caught rendering error, falling back:', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function CarModelInner({
  car,
  customization,
  telemetry,
  telemetryRef,
  headlightsOn = false,
  isPlayer = false,
  isSoftwareGl = false,
  showLightCones = false,
  glbModelId = 'auto',
  enableGlb = isPlayer,
  customGlbUrl = null,
  onModelStatusChange,
  pose,
  ghostOpacity,
  turntableSpin = false,
}: CarModelProps) {
  const { invalidate } = useThree();
  const rootRef = useRef<THREE.Group>(null);
  const visualOffsetRef = useRef<THREE.Group>(null);
  const bodyBounceRef = useRef<THREE.Group>(null);
  const wheelGroupsRef = useRef<Array<THREE.Group | null>>([null, null, null, null]);
  const wheelSpinRefs = useRef<Array<THREE.Group | null>>([null, null, null, null]);
  const discMeshesRef = useRef<Array<THREE.Mesh | null>>([null, null, null, null]);
  const nosFlamesRef = useRef<THREE.Group>(null);
  const headlightTarget = useMemo(() => new THREE.Object3D(), []);
  const headlightSpotL = useRef<THREE.SpotLight>(null);
  const headlightSpotR = useRef<THREE.SpotLight>(null);

  const [preparedGlb, setPreparedGlb] = useState<PreparedCarGlb | null>(null);

  const brakeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const reverseMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const indLMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const indRMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const headMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const paintMatRef = useRef<THREE.MeshPhysicalMaterial>(null);

  const isGhost = typeof ghostOpacity === 'number' && ghostOpacity < 1;
  const shouldUseGlb = enableGlb && !isGhost && (glbModelId !== 'procedural' || Boolean(customGlbUrl));
  const hasWorldPose = Boolean(pose || telemetry || telemetryRef);

  // Cascading GLB load with Draco support, traversal log, wheel extraction & fallback
  useEffect(() => {
    let active = true;
    if (!shouldUseGlb) {
      setPreparedGlb(null);
      onModelStatusChange?.({ loading: false, credit: null, loadedModelName: null });
      return;
    }

    onModelStatusChange?.({ loading: true, credit: null, loadedModelName: null });

    loadCarGlbWithCascade(glbModelId, customGlbUrl, isSoftwareGl)
      .then((res) => {
        if (!active) return;
        setPreparedGlb(res);
        invalidate();
        onModelStatusChange?.({
          loading: false,
          credit: res ? res.config.credit : null,
          loadedModelName: res ? res.config.name : null,
        });
      })
      .catch((err) => {
        console.warn('[CarModel] Cascading GLB load error:', err);
        if (!active) return;
        setPreparedGlb(null);
        invalidate();
        onModelStatusChange?.({ loading: false, credit: null, loadedModelName: null });
      });

    return () => {
      active = false;
    };
  }, [shouldUseGlb, glbModelId, customGlbUrl, isSoftwareGl, onModelStatusChange, invalidate]);

  const dims = useMemo(() => {
    const isTrophy = car.archetype === 'trophy';
    const isHyper = car.archetype === 'hypercar' || car.archetype === 'supercar';
    const len = car.bodyLengthM;
    const wid = car.bodyWidthM;
    const hgt = car.bodyHeightM;
    const wheelR = isTrophy ? 0.43 : 0.34;
    const wheelW = isTrophy ? 0.34 : 0.28;
    const halfTrack = car.trackWidthM * 0.5;
    const halfWb = car.wheelbaseM * 0.5;
    const rideH = isTrophy ? 0.36 : isHyper ? 0.16 : 0.21;
    const hoodSlope = isHyper ? 0.18 : 0.1;
    return { len, wid, hgt, wheelR, wheelW, halfTrack, halfWb, rideH, hoodSlope, isTrophy, isHyper };
  }, [car]);

  const flakeNormal = useMemo(() => (isSoftwareGl ? null : getMetallicFlakeNormalTexture()), [isSoftwareGl]);
  const numberTex = useMemo(() => getRacingNumberTexture(), []);

  // Paint physical material configuration
  const paintConfig = useMemo(() => {
    let metalness = 0.72;
    let roughness = 0.22;
    let clearcoat = 1.0;
    let clearcoatRoughness = 0.06;
    if (customization.paintFinish === 'matte') {
      metalness = 0.25;
      roughness = 0.68;
      clearcoat = 0.08;
      clearcoatRoughness = 0.55;
    } else if (customization.paintFinish === 'pearlescent') {
      metalness = 0.84;
      roughness = 0.16;
      clearcoat = 1.0;
      clearcoatRoughness = 0.04;
    } else if (customization.paintFinish === 'carbon') {
      metalness = 0.55;
      roughness = 0.34;
      clearcoat = 0.75;
      clearcoatRoughness = 0.12;
    }
    return { metalness, roughness, clearcoat, clearcoatRoughness };
  }, [customization.paintFinish]);

  // Apply Garage paint color, finish & window tint to upgraded GLB materials
  useEffect(() => {
    if (!preparedGlb) return;
    for (const mat of preparedGlb.paintMaterials) {
      mat.color.set(customization.primaryColor);
      mat.metalness = paintConfig.metalness;
      mat.roughness = paintConfig.roughness;
      mat.clearcoat = paintConfig.clearcoat;
      mat.clearcoatRoughness = paintConfig.clearcoatRoughness;
      mat.normalMap = flakeNormal;
      mat.normalScale.copy(_flakeScale);
      mat.envMapIntensity = 1.35;
      mat.needsUpdate = true;
    }
    for (const glass of preparedGlb.glassMaterials) {
      glass.transmission = isSoftwareGl
        ? 0
        : Math.max(0.15, 0.75 - customization.windowTint * 0.55);
      glass.opacity = isSoftwareGl
        ? 0.48 + customization.windowTint * 0.4
        : 0.35 + customization.windowTint * 0.45;
      glass.needsUpdate = true;
    }
    invalidate();
  }, [preparedGlb, customization.primaryColor, customization.windowTint, paintConfig, flakeNormal, isSoftwareGl, invalidate]);

  const localWheelRot = useRef<[number, number, number, number]>([0, 0, 0, 0]);

  useFrame((state, dt) => {
    const root = rootRef.current;
    if (!root) return;

    if (turntableSpin) {
      root.rotation.y += dt * 0.38;
      if (preparedGlb) {
        for (const h of preparedGlb.headlightMaterials) {
          h.emissiveIntensity = headlightsOn ? 3.5 : 0.4;
        }
        for (const tl of preparedGlb.taillightMaterials) {
          tl.emissiveIntensity = headlightsOn ? 1.5 : 0.4;
        }
      }
      return;
    }

    const t = telemetryRef?.current ?? telemetry;

    if (pose) {
      root.position.set(pose.x, pose.y, pose.z);
      if (
        typeof pose.qx === 'number' &&
        typeof pose.qy === 'number' &&
        typeof pose.qz === 'number' &&
        typeof pose.qw === 'number'
      ) {
        root.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw);
      } else {
        root.rotation.set(pose.pitch ?? 0, pose.yaw ?? 0, pose.roll ?? 0, 'YXZ');
      }
    } else if (t) {
      root.position.set(t.x, t.y, t.z);
      root.quaternion.set(t.qx, t.qy, t.qz, t.qw);
    }

    const speedSpin = pose?.wheelSpin ?? t?.wheelSpin ?? 0;
    const steerFallback = pose?.steerAngle ?? t?.steerAngle ?? 0;
    const braking = pose?.braking ?? t?.braking ?? false;
    const reversing = pose?.reversing ?? t?.reversing ?? false;
    const safeDt = Math.min(0.05, dt);

    if (preparedGlb) {
      // Drive extracted GLB wheel pivots from Rapier wheel telemetry
      for (let i = 0; i < 4; i++) {
        const rig = preparedGlb.wheels[i];
        const wt = t?.wheels[i];
        if (!rig) continue;

        const suspY = wt ? (wt.suspensionOffsetM + 0.047) * 0.55 : 0;
        rig.steerPivot.position.y = rig.baseY + suspY;
        const steer = i < 2 ? (wt ? wt.steerAngleRad : steerFallback) : 0;
        rig.steerPivot.rotation.y = steer;

        if (wt) {
          localWheelRot.current[i] += wt.wheelAngularVel * safeDt;
          rig.spinPivot.rotation.x = localWheelRot.current[i];
        } else {
          rig.spinPivot.rotation.x = speedSpin;
        }
      }

      // Dynamic dirt / wet sheen on GLB paint materials
      if (t) {
        _tmpColor.set(customization.primaryColor);
        if (t.dirtLevel > 0.01) {
          _tmpColor.lerp(_dirtColor, t.dirtLevel * 0.48);
        }
        const cc = Math.max(
          0.05,
          paintConfig.clearcoat * (1 - t.dirtLevel * 0.72) + t.wetnessLevel * 0.35
        );
        const rg = Math.min(
          0.9,
          paintConfig.roughness + t.dirtLevel * 0.42 - t.wetnessLevel * 0.12
        );
        for (const mat of preparedGlb.paintMaterials) {
          mat.color.copy(_tmpColor);
          mat.clearcoat = cc;
          mat.roughness = rg;
        }
      }

      // Dynamic GLB headlights & brake/taillights
      for (const tl of preparedGlb.taillightMaterials) {
        tl.emissiveIntensity = braking ? 6.0 : headlightsOn ? 1.8 : 0.9;
      }
      for (const hl of preparedGlb.headlightMaterials) {
        hl.emissiveIntensity = headlightsOn ? 4.5 : 0.45;
      }
    } else {
      // Procedural fallback wheel animation
      for (let i = 0; i < 4; i++) {
        const wg = wheelGroupsRef.current[i];
        const ws = wheelSpinRefs.current[i];
        const wt = t?.wheels[i];
        if (wg) {
          const suspY = wt ? (wt.suspensionOffsetM + 0.047) * 0.5 : 0;
          wg.position.y = dims.wheelR + suspY;
          const steer = i < 2 ? (wt ? wt.steerAngleRad : steerFallback) : 0;
          wg.rotation.y = steer;
        }
        if (ws) {
          if (wt) {
            localWheelRot.current[i] += wt.wheelAngularVel * safeDt;
            ws.rotation.x = localWheelRot.current[i];
          } else {
            ws.rotation.x = speedSpin;
          }
        }
        const disc = discMeshesRef.current[i];
        if (disc && wt) {
          const mat = disc.material as THREE.MeshStandardMaterial;
          const glow = Math.max(0, Math.min(1, (wt.brakeTempC - 260) / 480));
          mat.emissive.setRGB(glow * 1.4, glow * 0.34, glow * 0.04);
          mat.emissiveIntensity = glow * 3.2;
        }
      }

      if (paintMatRef.current && t && !isGhost) {
        _tmpColor.set(customization.primaryColor);
        if (t.dirtLevel > 0.01) {
          _tmpColor.lerp(_dirtColor, t.dirtLevel * 0.48);
        }
        paintMatRef.current.color.copy(_tmpColor);
        paintMatRef.current.clearcoat = Math.max(
          0.05,
          paintConfig.clearcoat * (1 - t.dirtLevel * 0.72) + t.wetnessLevel * 0.35
        );
        paintMatRef.current.roughness = Math.min(
          0.9,
          paintConfig.roughness + t.dirtLevel * 0.42 - t.wetnessLevel * 0.12
        );
      }

      if (bodyBounceRef.current && t) {
        const vib =
          t.damageLevel > 0.05 ? Math.sin(state.clock.elapsedTime * 34) * t.damageLevel * 0.012 : 0;
        bodyBounceRef.current.rotation.z = vib;
      }

      const indBlink = Math.sin(state.clock.elapsedTime * 9) > 0;
      const indL = (t?.indicatorLeft ?? false) && indBlink;
      const indR = (t?.indicatorRight ?? false) && indBlink;

      if (brakeMatRef.current) {
        brakeMatRef.current.emissiveIntensity = braking ? 5.5 : headlightsOn ? 1.4 : 0.4;
      }
      if (reverseMatRef.current) {
        reverseMatRef.current.emissiveIntensity = reversing ? 4.2 : 0.05;
      }
      if (indLMatRef.current) {
        indLMatRef.current.emissiveIntensity = indL ? 4.5 : 0.05;
      }
      if (indRMatRef.current) {
        indRMatRef.current.emissiveIntensity = indR ? 4.5 : 0.05;
      }
      if (headMatRef.current) {
        headMatRef.current.emissiveIntensity = headlightsOn ? 4.5 : 0.5;
      }
    }

    if (headlightSpotL.current) {
      headlightSpotL.current.target = headlightTarget;
    }
    if (headlightSpotR.current) {
      headlightSpotR.current.target = headlightTarget;
    }

    const nosOn = pose?.nitrousActive ?? t?.nitrousActive ?? false;
    if (nosFlamesRef.current) {
      nosFlamesRef.current.visible = nosOn;
      if (nosOn) {
        const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 55) * 0.25;
        nosFlamesRef.current.scale.set(1, 1, pulse);
      }
    }
  });

  const rimColor = customization.rimColor;
  const secColor = customization.secondaryColor;
  const calColor = customization.caliperColor;
  const visualYOffset = hasWorldPose ? -0.49 : 0;

  const wheelPositions: Array<[number, number, number]> = [
    [dims.halfTrack, dims.wheelR, dims.halfWb],
    [-dims.halfTrack, dims.wheelR, dims.halfWb],
    [dims.halfTrack, dims.wheelR, -dims.halfWb],
    [-dims.halfTrack, dims.wheelR, -dims.halfWb],
  ];

  const spokeCount =
    customization.rimStyle === 'mesh_multi'
      ? 10
      : customization.rimStyle === 'rally_fan'
        ? 8
        : customization.rimStyle === 'aero_dish'
          ? 3
          : 5;

  if (preparedGlb && !isGhost) {
    const glbW = preparedGlb.dimensions.width;
    const glbL = preparedGlb.dimensions.length;
    return (
      <group ref={rootRef}>
        <group ref={visualOffsetRef} position={[0, visualYOffset, 0]}>
          <primitive object={preparedGlb.root} />
          <primitive object={headlightTarget} position={[0, 0.25, 28]} />

          {/* NOS Exhaust Flames */}
          <group ref={nosFlamesRef} visible={false}>
            <mesh position={[0.28, 0.28, -glbL * 0.52]} rotation={[-Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.09, 0.65, 10]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.88} />
            </mesh>
            <mesh position={[-0.28, 0.28, -glbL * 0.52]} rotation={[-Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.09, 0.65, 10]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.88} />
            </mesh>
          </group>

          {/* Volumetric Headlight Cones in Fog / Rain / Night */}
          {headlightsOn && showLightCones && (
            <>
              <mesh
                position={[glbW * 0.34, 0.48, glbL * 0.5 + 4.5]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <coneGeometry args={[1.45, 9, 16, 1, true]} />
                <meshBasicMaterial
                  color="#dbeafe"
                  transparent
                  opacity={0.075}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <mesh
                position={[-glbW * 0.34, 0.48, glbL * 0.5 + 4.5]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <coneGeometry args={[1.45, 9, 16, 1, true]} />
                <meshBasicMaterial
                  color="#dbeafe"
                  transparent
                  opacity={0.075}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </>
          )}

          {/* Real Headlight SpotLights */}
          {isPlayer && headlightsOn && !isSoftwareGl && (
            <>
              <spotLight
                ref={headlightSpotL}
                position={[glbW * 0.34, 0.62, glbL * 0.49]}
                angle={0.48}
                penumbra={0.55}
                intensity={42}
                distance={65}
                color="#eef6ff"
              />
              <spotLight
                ref={headlightSpotR}
                position={[-glbW * 0.34, 0.62, glbL * 0.49]}
                angle={0.48}
                penumbra={0.55}
                intensity={42}
                distance={65}
                color="#eef6ff"
              />
            </>
          )}
        </group>
      </group>
    );
  }

  // Procedural fallback vehicle
  return (
    <group ref={rootRef}>
      <group ref={visualOffsetRef} position={[0, visualYOffset, 0]}>
        <primitive object={headlightTarget} position={[0, 0.2, 28]} />

        <group ref={bodyBounceRef}>
          <mesh
            position={[0, dims.rideH + 0.22, 0]}
            castShadow={!isSoftwareGl && !isGhost}
            receiveShadow={!isSoftwareGl && !isGhost}
          >
            <boxGeometry args={[dims.wid * 0.96, dims.hgt * 0.36, dims.len * 0.94]} />
            <meshPhysicalMaterial
              ref={paintMatRef}
              color={isGhost ? '#38bdf8' : customization.primaryColor}
              metalness={isGhost ? 0.2 : paintConfig.metalness}
              roughness={isGhost ? 0.3 : paintConfig.roughness}
              clearcoat={isGhost ? 0 : paintConfig.clearcoat}
              clearcoatRoughness={paintConfig.clearcoatRoughness}
              normalMap={isGhost ? null : flakeNormal}
              normalScale={_flakeScale}
              transparent={isGhost}
              opacity={ghostOpacity ?? 1}
            />
          </mesh>

          <mesh
            position={[0, dims.rideH + dims.hgt * 0.34, dims.len * 0.24]}
            rotation={[dims.hoodSlope, 0, 0]}
            castShadow={!isSoftwareGl && !isGhost}
          >
            <boxGeometry args={[dims.wid * 0.88, dims.hgt * 0.2, dims.len * 0.38]} />
            <meshPhysicalMaterial
              color={
                isGhost
                  ? '#38bdf8'
                  : customization.livery === 'carbon_hood'
                    ? '#18181b'
                    : customization.primaryColor
              }
              metalness={customization.livery === 'carbon_hood' ? 0.5 : paintConfig.metalness}
              roughness={customization.livery === 'carbon_hood' ? 0.3 : paintConfig.roughness}
              clearcoat={paintConfig.clearcoat}
              transparent={isGhost}
              opacity={ghostOpacity ?? 1}
            />
          </mesh>

          <mesh
            position={[0, dims.rideH + dims.hgt * 0.38, -dims.len * 0.24]}
            castShadow={!isSoftwareGl && !isGhost}
          >
            <boxGeometry args={[dims.wid * 0.9, dims.hgt * 0.24, dims.len * 0.34]} />
            <meshPhysicalMaterial
              color={isGhost ? '#38bdf8' : customization.primaryColor}
              metalness={paintConfig.metalness}
              roughness={paintConfig.roughness}
              clearcoat={paintConfig.clearcoat}
              transparent={isGhost}
              opacity={ghostOpacity ?? 1}
            />
          </mesh>

          <mesh
            position={[0, dims.rideH + dims.hgt * 0.62, -dims.len * 0.03]}
            castShadow={!isSoftwareGl && !isGhost}
          >
            <boxGeometry args={[dims.wid * 0.72, dims.hgt * 0.32, dims.len * 0.42]} />
            <meshPhysicalMaterial
              color={
                isGhost
                  ? '#38bdf8'
                  : customization.livery === 'horizon_split'
                    ? secColor
                    : customization.primaryColor
              }
              metalness={paintConfig.metalness}
              roughness={paintConfig.roughness}
              clearcoat={paintConfig.clearcoat}
              transparent={isGhost}
              opacity={ghostOpacity ?? 1}
            />
          </mesh>

          <mesh position={[0, dims.rideH + dims.hgt * 0.6, -dims.len * 0.02]}>
            <boxGeometry args={[dims.wid * 0.74, dims.hgt * 0.24, dims.len * 0.45]} />
            <meshPhysicalMaterial
              color="#0b1322"
              metalness={0.15}
              roughness={0.08}
              transmission={isSoftwareGl || isGhost ? 0 : Math.max(0.1, 0.68 - customization.windowTint * 0.5)}
              transparent
              opacity={isGhost ? (ghostOpacity ?? 0.35) : 0.48 + customization.windowTint * 0.42}
            />
          </mesh>

          {!isGhost && (
            <group position={[0, dims.rideH + 0.36, 0.08]}>
              <mesh position={[0, 0.14, 0.42]}>
                <boxGeometry args={[dims.wid * 0.64, 0.22, 0.34]} />
                <meshStandardMaterial color="#111827" roughness={0.8} />
              </mesh>
              <mesh position={[0.32, 0.22, 0.26]} rotation={[0.28, 0, 0]}>
                <torusGeometry args={[0.14, 0.022, 8, 20]} />
                <meshStandardMaterial color="#1f2937" roughness={0.55} />
              </mesh>
              <mesh position={[0.32, 0.12, -0.25]}>
                <boxGeometry args={[0.36, 0.48, 0.22]} />
                <meshStandardMaterial color="#1e293b" roughness={0.85} />
              </mesh>
              <mesh position={[-0.32, 0.12, -0.25]}>
                <boxGeometry args={[0.36, 0.48, 0.22]} />
                <meshStandardMaterial color="#1e293b" roughness={0.85} />
              </mesh>
            </group>
          )}

          {!isGhost && customization.livery === 'dual_stripe' && (
            <>
              <mesh position={[0.16, dims.rideH + dims.hgt * 0.79, -0.05]}>
                <boxGeometry args={[0.12, 0.02, dims.len * 0.88]} />
                <meshStandardMaterial color={secColor} roughness={0.3} />
              </mesh>
              <mesh position={[-0.16, dims.rideH + dims.hgt * 0.79, -0.05]}>
                <boxGeometry args={[0.12, 0.02, dims.len * 0.88]} />
                <meshStandardMaterial color={secColor} roughness={0.3} />
              </mesh>
            </>
          )}

          {!isGhost && customization.livery === 'racing_number' && numberTex && (
            <>
              <mesh position={[dims.wid * 0.485, dims.rideH + 0.26, 0.05]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[0.52, 0.52]} />
                <meshStandardMaterial map={numberTex} transparent />
              </mesh>
              <mesh position={[-dims.wid * 0.485, dims.rideH + 0.26, 0.05]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[0.52, 0.52]} />
                <meshStandardMaterial map={numberTex} transparent />
              </mesh>
            </>
          )}

          <mesh position={[0, dims.rideH + 0.04, dims.len * 0.48]}>
            <boxGeometry args={[dims.wid * 0.98, 0.06, 0.24]} />
            <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[0, dims.rideH + 0.05, -dims.len * 0.48]}>
            <boxGeometry args={[dims.wid * 0.94, 0.1, 0.22]} />
            <meshStandardMaterial color="#0f172a" roughness={0.55} metalness={0.4} />
          </mesh>

          {customization.aeroKit !== 'stock' && (
            <group position={[0, dims.rideH + dims.hgt * 0.58, -dims.len * 0.43]}>
              <mesh position={[0, customization.aeroKit === 'gt_wing' ? 0.22 : 0.06, 0]} castShadow={!isSoftwareGl && !isGhost}>
                <boxGeometry
                  args={[
                    dims.wid * (customization.aeroKit === 'gt_wing' ? 0.98 : 0.82),
                    0.045,
                    customization.aeroKit === 'gt_wing' ? 0.28 : 0.16,
                  ]}
                />
                <meshStandardMaterial color={secColor} roughness={0.3} metalness={0.6} />
              </mesh>
              {customization.aeroKit === 'gt_wing' && (
                <>
                  <mesh position={[dims.wid * 0.28, 0.11, 0]}>
                    <boxGeometry args={[0.04, 0.22, 0.12]} />
                    <meshStandardMaterial color="#111827" roughness={0.4} metalness={0.7} />
                  </mesh>
                  <mesh position={[-dims.wid * 0.28, 0.11, 0]}>
                    <boxGeometry args={[0.04, 0.22, 0.12]} />
                    <meshStandardMaterial color="#111827" roughness={0.4} metalness={0.7} />
                  </mesh>
                </>
              )}
            </group>
          )}

          <mesh position={[dims.wid * 0.32, dims.rideH + 0.28, dims.len * 0.475]}>
            <boxGeometry args={[0.28, 0.09, 0.05]} />
            <meshStandardMaterial
              ref={headMatRef}
              color="#f8fafc"
              emissive="#e0f2fe"
              emissiveIntensity={headlightsOn ? 4.5 : 0.5}
            />
          </mesh>
          <mesh position={[-dims.wid * 0.32, dims.rideH + 0.28, dims.len * 0.475]}>
            <boxGeometry args={[0.28, 0.09, 0.05]} />
            <meshStandardMaterial
              color="#f8fafc"
              emissive="#e0f2fe"
              emissiveIntensity={headlightsOn ? 4.5 : 0.5}
            />
          </mesh>

          {headlightsOn && showLightCones && !isGhost && (
            <>
              <mesh
                position={[dims.wid * 0.32, dims.rideH + 0.22, dims.len * 0.48 + 4.5]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <coneGeometry args={[1.45, 9, 16, 1, true]} />
                <meshBasicMaterial
                  color="#dbeafe"
                  transparent
                  opacity={0.075}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <mesh
                position={[-dims.wid * 0.32, dims.rideH + 0.22, dims.len * 0.48 + 4.5]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <coneGeometry args={[1.45, 9, 16, 1, true]} />
                <meshBasicMaterial
                  color="#dbeafe"
                  transparent
                  opacity={0.075}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </>
          )}

          {isPlayer && headlightsOn && !isSoftwareGl && (
            <>
              <spotLight
                ref={headlightSpotL}
                position={[dims.wid * 0.32, dims.rideH + 0.36, dims.len * 0.49]}
                angle={0.46}
                penumbra={0.55}
                intensity={42}
                distance={68}
                color="#eff6ff"
              />
              <spotLight
                ref={headlightSpotR}
                position={[-dims.wid * 0.32, dims.rideH + 0.36, dims.len * 0.49]}
                angle={0.46}
                penumbra={0.55}
                intensity={42}
                distance={68}
                color="#eff6ff"
              />
            </>
          )}

          <mesh position={[0, dims.rideH + 0.3, -dims.len * 0.475]}>
            <boxGeometry args={[dims.wid * 0.78, 0.08, 0.05]} />
            <meshStandardMaterial
              ref={brakeMatRef}
              color="#991b1b"
              emissive="#ef4444"
              emissiveIntensity={0.4}
            />
          </mesh>

          <mesh position={[0, dims.rideH + 0.21, -dims.len * 0.476]}>
            <boxGeometry args={[0.32, 0.045, 0.05]} />
            <meshStandardMaterial
              ref={reverseMatRef}
              color="#f8fafc"
              emissive="#ffffff"
              emissiveIntensity={0.05}
            />
          </mesh>

          <mesh position={[dims.wid * 0.42, dims.rideH + 0.28, -dims.len * 0.472]}>
            <boxGeometry args={[0.1, 0.06, 0.06]} />
            <meshStandardMaterial
              ref={indLMatRef}
              color="#f59e0b"
              emissive="#fbbf24"
              emissiveIntensity={0.05}
            />
          </mesh>
          <mesh position={[-dims.wid * 0.42, dims.rideH + 0.28, -dims.len * 0.472]}>
            <boxGeometry args={[0.1, 0.06, 0.06]} />
            <meshStandardMaterial
              ref={indRMatRef}
              color="#f59e0b"
              emissive="#fbbf24"
              emissiveIntensity={0.05}
            />
          </mesh>

          <mesh position={[0.26, dims.rideH + 0.09, -dims.len * 0.48]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.14, 10]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[-0.26, dims.rideH + 0.09, -dims.len * 0.48]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.14, 10]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.25} />
          </mesh>
          <group ref={nosFlamesRef} visible={false}>
            <mesh position={[0.26, dims.rideH + 0.09, -dims.len * 0.56]} rotation={[-Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.09, 0.65, 10]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.88} />
            </mesh>
            <mesh position={[-0.26, dims.rideH + 0.09, -dims.len * 0.56]} rotation={[-Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.09, 0.65, 10]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.88} />
            </mesh>
          </group>
        </group>

        {wheelPositions.map((wp, idx) => (
          <group
            key={idx}
            ref={(el) => {
              wheelGroupsRef.current[idx] = el;
            }}
            position={wp}
          >
            <mesh position={[idx % 2 === 0 ? -0.05 : 0.05, 0.04, -0.09]}>
              <boxGeometry args={[0.1, 0.14, 0.12]} />
              <meshStandardMaterial color={calColor} roughness={0.3} metalness={0.6} />
            </mesh>

            <group
              ref={(el) => {
                wheelSpinRefs.current[idx] = el;
              }}
            >
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow={!isSoftwareGl && !isGhost}>
                <cylinderGeometry args={[dims.wheelR, dims.wheelR, dims.wheelW, 18]} />
                <meshStandardMaterial
                  color={isGhost ? '#38bdf8' : '#18181b'}
                  roughness={0.88}
                  transparent={isGhost}
                  opacity={ghostOpacity ?? 1}
                />
              </mesh>

              <mesh
                ref={(el) => {
                  discMeshesRef.current[idx] = el;
                }}
                rotation={[0, 0, Math.PI / 2]}
                position={[idx % 2 === 0 ? -0.03 : 0.03, 0, 0]}
              >
                <cylinderGeometry args={[dims.wheelR * 0.56, dims.wheelR * 0.56, 0.03, 16]} />
                <meshStandardMaterial color="#64748b" metalness={0.85} roughness={0.3} />
              </mesh>

              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[dims.wheelR * 0.62, dims.wheelR * 0.62, dims.wheelW + 0.015, 14]} />
                <meshStandardMaterial color={rimColor} metalness={0.82} roughness={0.22} />
              </mesh>

              {Array.from({ length: spokeCount }).map((_, sIdx) => {
                const a = (sIdx / spokeCount) * Math.PI * 2;
                return (
                  <mesh
                    key={sIdx}
                    position={[
                      idx % 2 === 0 ? dims.wheelW * 0.49 : -dims.wheelW * 0.49,
                      Math.cos(a) * dims.wheelR * 0.3,
                      Math.sin(a) * dims.wheelR * 0.3,
                    ]}
                    rotation={[a, 0, 0]}
                  >
                    <boxGeometry args={[0.025, dims.wheelR * 0.52, 0.035]} />
                    <meshStandardMaterial color={rimColor} metalness={0.85} roughness={0.2} />
                  </mesh>
                );
              })}
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

export function CarModel(props: CarModelProps) {
  return (
    <CarModelErrorBoundary
      fallback={
        <CarModelInner
          {...props}
          enableGlb={false}
          glbModelId="procedural"
          customGlbUrl={null}
        />
      }
    >
      <CarModelInner {...props} />
    </CarModelErrorBoundary>
  );
}
