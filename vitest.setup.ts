import '@testing-library/jest-dom';
import { vi } from 'vitest';
console.log('vitest.setup.ts loaded');

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value.toString();
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

// Mock AudioContext
const audioContextMock = {
    createOscillator: () => ({
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        type: 'sine',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
    }),
    createGain: () => ({
        connect: vi.fn(),
        gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }
    }),
    createBiquadFilter: () => ({
        connect: vi.fn(),
        frequency: { value: 0, setTargetAtTime: vi.fn() },
        Q: { value: 0 }
    }),
    createBuffer: () => ({
        getChannelData: () => new Float32Array(1024)
    }),
    createBufferSource: () => ({
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        buffer: null,
        loop: false
    }),
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
};

Object.defineProperty(window, 'AudioContext', {
    writable: true,
    value: vi.fn().mockImplementation(() => audioContextMock),
});

Object.defineProperty(window, 'webkitAudioContext', {
    writable: true,
    value: vi.fn().mockImplementation(() => audioContextMock),
});

// Mock Notification API
Object.defineProperty(window, 'Notification', {
    writable: true,
    value: class {
        static permission = 'granted';
        static requestPermission = vi.fn().mockResolvedValue('granted');
        constructor() { }
    },
});
