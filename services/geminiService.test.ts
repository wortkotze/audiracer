import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CarModel, EngineType, PlayerConfig } from '../types';

// Mock the GoogleGenAI class
const { mockGenerateContent } = vi.hoisted(() => {
    return { mockGenerateContent: vi.fn() };
});

vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: class {
            models = {
                generateContent: mockGenerateContent
            };
            constructor(args: any) { }
        }
    };
});

describe('GeminiService', () => {
    const mockCar: CarModel = {
        id: 'test-car',
        name: 'Test Car',
        type: EngineType.ICE,
        description: 'Test Description',
        baseColor: '#000000',
        stats: { speed: 50, handling: 50, accel: 50 }
    };

    const mockConfig: PlayerConfig = {
        carId: 'test-car',
        color: '#000000',
        rims: 'standard',
        lightSignature: 'standard'
    };

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.API_KEY = 'test-api-key';
    });

    afterEach(() => {
        delete process.env.API_KEY;
    });

    describe('getRaceStrategy', () => {
        it('returns strategy when API call is successful', async () => {
            mockGenerateContent.mockResolvedValue({ text: 'Drive fast!' });
            const { getRaceStrategy } = await import('./geminiService');

            const strategy = await getRaceStrategy(mockCar, mockConfig);
            expect(strategy).toBe('Drive fast!');
            expect(mockGenerateContent).toHaveBeenCalled();
        });

        it('returns fallback message when API call fails', async () => {
            mockGenerateContent.mockRejectedValue(new Error('API Error'));
            const { getRaceStrategy } = await import('./geminiService');

            const strategy = await getRaceStrategy(mockCar, mockConfig);
            expect(strategy).toBe('Communications interference. Race hard.');
        });

        it('returns offline message when API key is missing', async () => {
            delete process.env.API_KEY;
            vi.resetModules(); // Reset again to pick up no key
            const { getRaceStrategy } = await import('./geminiService');

            const strategy = await getRaceStrategy(mockCar, mockConfig);
            expect(strategy).toBe('System Offline. Drive carefully.');
        });
    });

    describe('getPostRaceAnalysis', () => {
        it('returns analysis when API call is successful', async () => {
            mockGenerateContent.mockResolvedValue({ text: 'Great race!' });
            const { getPostRaceAnalysis } = await import('./geminiService');

            const analysis = await getPostRaceAnalysis(1000, 500, 'Test Car');
            expect(analysis).toBe('Great race!');
        });

        it('returns fallback message when API call fails', async () => {
            mockGenerateContent.mockRejectedValue(new Error('API Error'));
            const { getPostRaceAnalysis } = await import('./geminiService');

            const analysis = await getPostRaceAnalysis(1000, 500, 'Test Car');
            expect(analysis).toBe('Race Complete.');
        });
    });
});
