import { SHARED_GLB_MODELS } from '../../shared/cars.config';
import type { CarGlbModelId } from '../../shared/vehicle/types';

export type { CarGlbModelId };
export type CarModelSelection = 'auto' | CarGlbModelId | 'procedural';

export interface CarGlbModelConfig {
  id: CarGlbModelId;
  name: string;
  localFile: string;
  localUrl: string;
  remoteUrl: string;
  scale: number;
  targetLengthM: number;
  rotationFix: [number, number, number];
  draco: boolean;
  wheelNodeNames: {
    fl: string[];
    fr: string[];
    rl: string[];
    rr: string[];
  };
  paintMaterialNames: string[];
  glassMaterialNames: string[];
  tireMaterialNames: string[];
  headlightMaterialNames: string[];
  taillightMaterialNames: string[];
  credit: string;
}

export const CAR_MODELS_CONFIG: CarGlbModelConfig[] = [
  SHARED_GLB_MODELS.ferrari,
  SHARED_GLB_MODELS.porsche_911,
  SHARED_GLB_MODELS.concept_sport,
  SHARED_GLB_MODELS.dodge_challenger,
];

export function getCarModelConfig(id: CarGlbModelId): CarGlbModelConfig | undefined {
  return SHARED_GLB_MODELS[id];
}
