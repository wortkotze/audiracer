import { CarModel, EngineType } from './types';

export const AUDI_COLORS = [
  { name: 'Ibis White', hex: '#FFFFFF' },
  { name: 'Mythos Black', hex: '#111111' },
  { name: 'Tangorot Metallic', hex: '#DC281E' },
  { name: 'Navarra Blue', hex: '#003366' },
  { name: 'Daytona Grey', hex: '#58595B' },
  { name: 'Kyalami Green', hex: '#6B8E23' } // Approximation for pixel art
];

export const RIMS_OPTIONS = [
  { id: 'classic', name: '5-Arm Design' },
  { id: 'sport', name: '10-Spoke Star' },
  { id: 'aero', name: 'Aero Blade (EV)' },
];

export const LIGHT_SIGNATURES = [
  { id: 'standard', name: 'Standard LED' },
  { id: 'matrix', name: 'Matrix LED' },
  { id: 'digital', name: 'Digital Matrix' },
  { id: 'laser', name: 'Laser Spot' }
];

export const CAR_MODELS: CarModel[] = [
  {
    id: 'rs6',
    name: 'Audi RS 6 Avant',
    type: EngineType.ICE,
    description: 'The ultimate high-performance station wagon. Brutal power, aggressive looks.',
    baseColor: '#58595B',
    stats: {
      speed: 85,
      handling: 70,
      accel: 80
    }
  },
  {
    id: 'r8',
    name: 'Audi R8 V10',
    type: EngineType.ICE,
    description: 'Born on the track. A mid-engine supercar with razor-sharp handling.',
    baseColor: '#FFFFFF',
    stats: {
      speed: 95,
      handling: 90,
      accel: 85
    }
  },
  {
    id: 'etron_gt',
    name: 'Audi RS e-tron GT',
    type: EngineType.EV,
    description: 'Electric performance art. Instant torque and futuristic design.',
    baseColor: '#DC281E',
    stats: {
      speed: 90,
      handling: 80,
      accel: 100 // Instant torque
    }
  },
  {
    id: 'q4',
    name: 'Audi Q4 e-tron',
    type: EngineType.EV,
    description: 'Versatile electric SUV. Balanced and reliable for the long haul.',
    baseColor: '#003366',
    stats: {
      speed: 65,
      handling: 60,
      accel: 70
    }
  }
];

export const GAME_WIDTH = 400;
export const GAME_HEIGHT = 700;