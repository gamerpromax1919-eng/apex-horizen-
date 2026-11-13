import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CameraMode, CarDefinition, GameModeState, VehicleTelemetry } from '../config/types';

interface CameraRigProps {
  cameraMode: CameraMode;
  gameMode: GameModeState;
  car: CarDefinition;
  telemetryRef: React.RefObject<VehicleTelemetry>;
  photoFov?: number;
}

const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _desiredPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _velDir = new THREE.Vector3();

export function CameraRig({
  cameraMode,
  gameMode,
  car,
  telemetryRef,
  photoFov = 50,
}: CameraRigProps) {
  const { camera } = useThree();
  const smoothPos = useRef(new THREE.Vector3(0, 6, 175));
  const smoothLook = useRef(new THREE.Vector3(0, 2, 195));
  const trauma = useRef(0);
  const initialized = useRef(false);

  useFrame((state, rawDt) => {
    if (gameMode === 'photo') {
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, photoFov, 0.12);
        camera.updateProjectionMatrix();
      }
      return;
    }

    const dt = Math.min(0.05, rawDt);
    const t = telemetryRef.current;
    if (!t) return;

    _q.set(t.qx, t.qy, t.qz, t.qw);
    _fwd.set(0, 0, 1).applyQuaternion(_q).normalize();
    _right.set(1, 0, 0).applyQuaternion(_q).normalize();
    _up.set(0, 1, 0).applyQuaternion(_q).normalize();

    if (!initialized.current) {
      smoothPos.current.set(t.x - _fwd.x * 6.5, t.y + 2.4, t.z - _fwd.z * 6.5);
      smoothLook.current.set(t.x + _fwd.x * 10, t.y + 1.1, t.z + _fwd.z * 10);
      initialized.current = true;
    }

    // Accumulate trauma on collisions & rough off-road speed
    if (t.impactIntensity > 0.15) {
      trauma.current = Math.min(1, trauma.current + t.impactIntensity * 0.75);
    }
    const offroadRumble =
      t.surface !== 'asphalt' && t.surface !== 'wet_asphalt' && t.speedKmh > 60
        ? Math.min(0.18, (t.speedKmh - 60) / 480)
        : 0;
    trauma.current = Math.max(offroadRumble, trauma.current - dt * 2.2);

    // Title showcase turntable orbit
    if (gameMode === 'title') {
      const a = state.clock.elapsedTime * 0.22 + 0.85;
      _desiredPos.set(t.x + Math.sin(a) * 6.4, t.y + 1.9, t.z + Math.cos(a) * 6.4);
      _desiredLook.set(t.x - 0.6, t.y + 0.72, t.z);
      if (smoothPos.current.distanceToSquared(_desiredPos) > 16) {
        smoothPos.current.copy(_desiredPos);
        camera.position.copy(_desiredPos);
      } else {
        camera.position.lerp(_desiredPos, 1 - Math.exp(-5 * dt));
      }
      camera.lookAt(_desiredLook);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, 50, 0.15);
        camera.updateProjectionMatrix();
      }
      return;
    }

    // Replay trackside broadcast sweeping camera
    if (gameMode === 'replay') {
      const angle = state.clock.elapsedTime * 0.35;
      _desiredPos.set(t.x + Math.cos(angle) * 9.5, t.y + 3.4, t.z + Math.sin(angle) * 9.5);
      _desiredLook.set(t.x, t.y + 0.8, t.z);
      camera.position.lerp(_desiredPos, 1 - Math.exp(-6 * dt));
      camera.lookAt(_desiredLook);
      return;
    }

    const speedNorm = Math.min(1, t.speedKmh / 290);
    const nosBoost = t.nitrousActive ? 1 : 0;

    // Velocity-aligned drift camera swing
    const speedMag = Math.hypot(t.vx, t.vz);
    if (speedMag > 4) {
      _velDir.set(t.vx / speedMag, 0, t.vz / speedMag);
    } else {
      _velDir.copy(_fwd);
    }

    if (cameraMode === 'chase' || cameraMode === 'far_chase') {
      const dist = cameraMode === 'far_chase' ? 8.6 + speedNorm * 1.4 : 6.1 + speedNorm * 1.1;
      const height = cameraMode === 'far_chase' ? 2.85 : 2.15;
      const driftSwing = t.isDrifting ? 0.36 : 0.14;
      const armDir = _fwd.clone().lerp(_velDir, driftSwing).normalize();
      const lookAhead = _right.clone().multiplyScalar(-t.steerAngle * 2.2);

      _desiredPos
        .set(t.x, t.y + height, t.z)
        .addScaledVector(armDir, -dist)
        .addScaledVector(_right, t.steerAngle * 0.7);
      _desiredLook
        .set(t.x, t.y + 1.05, t.z)
        .addScaledVector(_fwd, 10 + speedNorm * 6)
        .add(lookAhead);

      const spring = 1 - Math.exp(-(cameraMode === 'far_chase' ? 9 : 12) * dt);
      smoothPos.current.lerp(_desiredPos, spring);
      smoothLook.current.lerp(_desiredLook, 1 - Math.exp(-16 * dt));
    } else if (cameraMode === 'hood') {
      _desiredPos
        .set(t.x, t.y + car.bodyHeightM * 0.78, t.z)
        .addScaledVector(_fwd, car.bodyLengthM * 0.12)
        .addScaledVector(_up, 0.32);
      _desiredLook.copy(_desiredPos).addScaledVector(_fwd, 22);
      smoothPos.current.copy(_desiredPos);
      smoothLook.current.copy(_desiredLook);
    } else if (cameraMode === 'bumper') {
      _desiredPos
        .set(t.x, t.y + 0.56, t.z)
        .addScaledVector(_fwd, car.bodyLengthM * 0.49);
      _desiredLook.copy(_desiredPos).addScaledVector(_fwd, 24);
      smoothPos.current.copy(_desiredPos);
      smoothLook.current.copy(_desiredLook);
    } else if (cameraMode === 'cockpit') {
      // Left-hand driver eye position inside interior
      _desiredPos
        .set(t.x, t.y + car.bodyHeightM * 0.64, t.z)
        .addScaledVector(_right, 0.32)
        .addScaledVector(_fwd, -0.08)
        .addScaledVector(_up, 0.18);
      _desiredLook
        .copy(_desiredPos)
        .addScaledVector(_fwd, 24)
        .addScaledVector(_right, -t.steerAngle * 3.5);
      smoothPos.current.copy(_desiredPos);
      smoothLook.current.copy(_desiredLook);
    }

    // Apply squared trauma shake + subtle high-speed vibration
    const shake = trauma.current * trauma.current * 0.32 + speedNorm * 0.015;
    const ox = (Math.sin(state.clock.elapsedTime * 57) * 0.6 + Math.cos(state.clock.elapsedTime * 41) * 0.4) * shake;
    const oy = (Math.cos(state.clock.elapsedTime * 63) * 0.7) * shake;

    camera.position.set(
      smoothPos.current.x + ox,
      smoothPos.current.y + oy,
      smoothPos.current.z
    );
    camera.lookAt(smoothLook.current);

    if (camera instanceof THREE.PerspectiveCamera) {
      const baseFov = cameraMode === 'cockpit' ? 68 : cameraMode === 'bumper' ? 72 : 60;
      const targetFov = baseFov + speedNorm * 14 + nosBoost * 8;
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-8 * dt));
      camera.updateProjectionMatrix();
    }
  });

  if (gameMode === 'photo') {
    const t = telemetryRef.current;
    return (
      <OrbitControls
        target={[t?.x ?? 0, (t?.y ?? 0) + 0.9, t?.z ?? 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={28}
        maxPolarAngle={Math.PI * 0.48}
      />
    );
  }

  return null;
}
