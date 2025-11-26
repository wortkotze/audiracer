import { CarModel, EngineType } from './types';

export const AUDI_COLORS = [
  { name: 'Pearl White', hex: '#FFFFFF' },
  { name: 'Midnight Black', hex: '#111111' },
  { name: 'Racing Red', hex: '#DC281E' },
  { name: 'Deep Blue', hex: '#003366' },
  { name: 'Graphite Grey', hex: '#58595B' },
  { name: 'Forest Green', hex: '#6B8E23' }
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
    name: 'GT Wagon',
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
    name: 'Apex Supercar',
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
    name: 'Thunder GT',
    type: EngineType.EV,
    description: 'Electric performance art. Instant torque and futuristic design.',
    baseColor: '#DC281E',
    stats: {
      speed: 90,
      handling: 80,
      accel: 100
    }
  },
  {
    id: 'q4',
    name: 'Velocity SUV',
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