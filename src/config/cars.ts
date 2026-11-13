import {
  SHARED_CARS_CONFIG,
  createDefaultCustomizationFromConfig,
  createDefaultTuningFromConfig,
  createDefaultUpgradesFromConfig,
  getSharedCarById,
} from '../../shared/cars.config';
import type { CarCustomization, SharedCarConfig, TuningSetup, UpgradeLevels } from './types';

export const CAR_ROSTER: SharedCarConfig[] = SHARED_CARS_CONFIG;

export const PAINT_SWATCHES = [
  { name: 'Rosso Corsa', hex: '#dc2626' },
  { name: 'Solar Amber', hex: '#f59e0b' },
  { name: 'Cobalt Metallic', hex: '#2563eb' },
  { name: 'Emerald Track', hex: '#10b981' },
  { name: 'Glacier White', hex: '#f1f5f9' },
  { name: 'Obsidian Carbon', hex: '#18181b' },
  { name: 'Cyan Apex', hex: '#06b6d4' },
  { name: 'Baja Sunset', hex: '#ea580c' },
  { name: 'Crimson Velvet', hex: '#9f1239' },
  { name: 'Titanium Silver', hex: '#94a3b8' },
  { name: 'British Racing', hex: '#064e3b' },
  { name: 'Electric Gold', hex: '#eab308' },
];

export function getCarById(id: string): SharedCarConfig {
  return getSharedCarById(id);
}

export function createDefaultCustomization(car: SharedCarConfig): CarCustomization {
  return createDefaultCustomizationFromConfig(car);
}

export function createDefaultUpgrades(): UpgradeLevels {
  return createDefaultUpgradesFromConfig();
}

export function createDefaultTuning(car: SharedCarConfig): TuningSetup {
  return createDefaultTuningFromConfig(car);
}
