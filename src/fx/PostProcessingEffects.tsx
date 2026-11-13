import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  SMAA,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import type { GameModeState, QualityTier, VehicleTelemetry } from '../config/types';

interface PostProcessingEffectsProps {
  qualityTier: QualityTier;
  isSoftwareGl: boolean;
  gameMode: GameModeState;
  telemetryRef: React.RefObject<VehicleTelemetry>;
  photoDofFocus?: number;
}

export function PostProcessingEffects({
  qualityTier,
  isSoftwareGl,
  gameMode,
  telemetryRef,
  photoDofFocus = 0.02,
}: PostProcessingEffectsProps) {
  // Strictly skip heavy multi-pass postprocessing on Software WebGL or Low quality tier
  if (isSoftwareGl || qualityTier === 'low') {
    return null;
  }

  const speedKmh = telemetryRef.current?.speedKmh ?? 0;
  const nos = telemetryRef.current?.nitrousActive ? 1 : 0;
  const highSpeedFactor = Math.max(0, (speedKmh - 140) / 180) + nos * 0.45;
  const caOffset = new THREE.Vector2(
    0.00035 * highSpeedFactor,
    0.00022 * highSpeedFactor
  );

  const useDof = gameMode === 'photo' || qualityTier === 'ultra';

  return (
    <EffectComposer multisampling={qualityTier === 'ultra' ? 4 : 0}>
      <SMAA />
      <Bloom
        intensity={0.48}
        luminanceThreshold={0.92}
        luminanceSmoothing={0.35}
        mipmapBlur
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={caOffset}
        radialModulation={false}
        modulationOffset={0.15}
      />
      <Vignette eskil={false} offset={0.22} darkness={0.42} />
      {useDof && gameMode === 'photo' ? (
        <DepthOfField focusDistance={photoDofFocus} focalLength={0.04} bokehScale={3.5} />
      ) : (
        <></>
      )}
    </EffectComposer>
  );
}
