import React, { useRef, useEffect } from 'react';
import { CarModel, PlayerConfig, EngineType, GameOverStats } from '../types';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

interface GameCanvasProps {
    carModel: CarModel;
    playerConfig: PlayerConfig;
    onGameOver: (stats: GameOverStats) => void;
    opponentState: import('../services/multiplayerService').PlayerState | null;
    onProgress: (score: number, distance: number, lives: number) => void;
    isRaceStarted: boolean;
    isSfxEnabled: boolean;
    isMusicEnabled: boolean;
}

type EntityType = 'enemy_bmw' | 'enemy_merc' | 'enemy_toyota' | 'zombie' | 'projectile' | 'battery' | 'fuel';

interface Entity {
    id: number;
    type: EntityType;
    lane: number; // -1 (left) to 1 (right)
    z: number;    // Depth: 0 (camera) to 3000 (horizon)
    speed: number; // KM/H
    active: boolean;
    hitFlash?: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
    size: number;
}

interface FloatingText {
    x: number;
    y: number;
    text: string;
    life: number;
    color: string;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ carModel, playerConfig, onGameOver, opponentState, onProgress, isRaceStarted = true, isSfxEnabled = true, isMusicEnabled = true }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameIdRef = useRef<number>(0);

    // Fix Stale Closure for Opponent State
    const opponentStateRef = useRef(opponentState);
    useEffect(() => {
        opponentStateRef.current = opponentState;
    }, [opponentState]);

    // Audio Context Refs
    const audioCtxRef = useRef<AudioContext | null>(null);
    const engineOscRef = useRef<OscillatorNode | null>(null);
    const engineGainRef = useRef<GainNode | null>(null);
    const engineFilterRef = useRef<BiquadFilterNode | null>(null);

    // Music Refs
    const musicOscRef = useRef<OscillatorNode | null>(null);
    const musicGainRef = useRef<GainNode | null>(null);
    const musicNextNoteTimeRef = useRef(0);
    const musicNoteIndexRef = useRef(0);
    const isMusicPlayingRef = useRef(false);
    const currentThemeRef = useRef('CITY');
    const fadeGainRef = useRef<GainNode | null>(null); // For Crossfading

    // Tire Screech Refs
    const tireNoiseNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const tireGainRef = useRef<GainNode | null>(null);

    // Constants for Perspective
    const HORIZON_Y = GAME_HEIGHT * 0.35;
    const PLAYER_Z = 300;
    const CAMERA_HEIGHT = 150;
    const ROAD_WIDTH = 800;

    const gameState = useRef({
        isPlaying: true,
        isCrashing: false,
        crashDriftDir: 0,
        gameOverReason: 'CRASH' as 'CRASH' | 'EMPTY_BATTERY' | 'EMPTY_FUEL',
        shakeTimer: 0,
        flashTimer: 0,
        crashTime: 0,

        speed: 0, // Start at 0
        score: 0,
        distance: 0,
        playerX: 0, // -1 to 1 (Lane position)
        isBraking: false,

        // Resource Stats (Energy or Fuel)
        energy: 100, // % (Used for both Fuel and Battery)
        zombiesKilled: 0,
        lives: 3,

        entities: [] as Entity[],
        projectiles: [] as Entity[],
        particles: [] as Particle[],
        floatingTexts: [] as FloatingText[],

        keys: { left: false, right: false, up: false, down: false, shoot: false },
        lastTime: 0,
        lastShotTime: 0,
        startTime: performance.now(),
        entityCounter: 0
    });

    // ----------------------------------------
    // Helper: Projection Math (World -> Screen)
    // ----------------------------------------
    const getScreenPos = (lane: number, z: number) => {
        const fov = 300;
        const scale = fov / (fov + z);

        // X Position: Center of screen + (Lane Offset * RoadWidth * Scale)
        const x = (GAME_WIDTH / 2) + (lane * (ROAD_WIDTH / 2)) * scale;

        // Y Position: Horizon + (CameraHeight * Scale)
        const y = HORIZON_Y + (CAMERA_HEIGHT * 4) * scale;

        return { x, y, scale };
    };

    // ----------------------------------------
    // Audio Engine
    // ----------------------------------------
    // ----------------------------------------
    // Audio Engine
    // ----------------------------------------
    const initAudio = () => {
        if (!isSfxEnabled && !isMusicEnabled) return;

        if (audioCtxRef.current) {
            if (audioCtxRef.current.state === 'suspended') {
                audioCtxRef.current.resume().catch(() => { });
            }
            return;
        }

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();

        // --- Engine Sound Setup ---
        if (isSfxEnabled) {
            const osc = audioCtxRef.current.createOscillator();
            const gain = audioCtxRef.current.createGain();
            const filter = audioCtxRef.current.createBiquadFilter();

            const isEV = carModel.type === EngineType.EV;

            // Filter Setup
            filter.type = 'lowpass';
            filter.frequency.value = isEV ? 800 : 200;
            filter.Q.value = 1;

            // Oscillator Setup
            osc.type = isEV ? 'sine' : 'sawtooth';
            osc.frequency.value = isEV ? 100 : 60;

            // Reduced Volume for comfort
            gain.gain.value = 0.0; // Start silent

            // Connect Chain: Osc -> Filter -> Gain -> Dest
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtxRef.current.destination);

            osc.start();

            engineOscRef.current = osc;
            engineGainRef.current = gain;
            engineFilterRef.current = filter;

            // --- Tire Screech Setup (Noise Buffer) ---
            const bufferSize = audioCtxRef.current.sampleRate * 2; // 2 seconds of noise
            const buffer = audioCtxRef.current.createBuffer(1, bufferSize, audioCtxRef.current.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = audioCtxRef.current.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;

            const tireGain = audioCtxRef.current.createGain();
            tireGain.gain.value = 0;

            // Bandpass for screech sound
            const tireFilter = audioCtxRef.current.createBiquadFilter();
            tireFilter.type = 'bandpass';
            tireFilter.frequency.value = 1000;
            tireFilter.Q.value = 1;

            noise.connect(tireFilter);
            tireFilter.connect(tireGain);
            tireGain.connect(audioCtxRef.current.destination);

            noise.start();

            tireNoiseNodeRef.current = noise;
            tireGainRef.current = tireGain;
        }
    };

    // Handle Sound Toggles
    useEffect(() => {
        if (audioCtxRef.current) {
            if (isSfxEnabled || isMusicEnabled) {
                audioCtxRef.current.resume().catch(() => { });
            } else {
                audioCtxRef.current.suspend().catch(() => { });
            }
        }
        // Mute Engine/Tire if SFX disabled
        if (engineGainRef.current) engineGainRef.current.gain.value = isSfxEnabled ? 0.015 : 0; // LOWERED BASE VOLUME FURTHER
        if (tireGainRef.current) tireGainRef.current.gain.value = 0;
    }, [isSfxEnabled, isMusicEnabled]);

    const updateEngineSound = (speed: number) => {
        if (!isSfxEnabled || !engineOscRef.current || !audioCtxRef.current || !engineFilterRef.current) return;

        // STOP AUDIO ON GAME OVER
        if (gameState.current.isGameOver || (gameState.current.lives <= 0)) {
            if (engineGainRef.current) engineGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.1);
            return;
        }

        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => { });

        const isEV = carModel.type === EngineType.EV;
        const t = audioCtxRef.current.currentTime;

        // --- Gear Logic ---
        // Simulate gears by modulo speed. 0-60, 60-120, 120-180...
        // Normalized RPM (0 to 1) within current gear
        let rpm = 0;
        let gear = 1;

        if (isEV) {
            // EV: Linear, one gear
            rpm = speed / 300;
        } else {
            // ICE: 5 Gears
            if (speed < 60) { rpm = speed / 60; gear = 1; }
            else if (speed < 110) { rpm = (speed - 60) / 50; gear = 2; }
            else if (speed < 160) { rpm = (speed - 110) / 50; gear = 3; }
            else if (speed < 220) { rpm = (speed - 160) / 60; gear = 4; }
            else { rpm = (speed - 220) / 80; gear = 5; } // Top gear
        }

        // Clamp RPM
        rpm = Math.max(0, Math.min(1, rpm));

        if (isEV) {
            // EV: Pitch glides up like a spaceship
            const targetFreq = 100 + (speed / 300 * 400); // Base on absolute speed for EV
            engineOscRef.current.frequency.setTargetAtTime(targetFreq, t, 0.1);
            engineFilterRef.current.frequency.setTargetAtTime(800 + (speed / 300 * 1000), t, 0.1);
        } else {
            // ICE: Pitch follows RPM
            const baseFreq = 60 + (gear * 10); // Higher gears start slightly higher pitch? Or lower? Real cars RPM drops.
            // Let's model RPM directly: Low RPM = 50Hz, High RPM = 150Hz
            const targetFreq = 50 + (rpm * 150);

            engineOscRef.current.frequency.setTargetAtTime(targetFreq, t, 0.1);
            // Filter mimics valve opening - opens wide at high RPM
            engineFilterRef.current.frequency.setTargetAtTime(200 + (rpm * 800), t, 0.1);
        }

        // Volume ducking when stopped
        const targetGain = speed > 5 ? 0.015 : 0.002; // LOWERED VOLUME to SUBTLE
        if (engineGainRef.current) {
            engineGainRef.current.gain.setTargetAtTime(targetGain, t, 0.2);
        }
    };

    // Tire Screech Update
    const updateTireSound = (speed: number, isSwerving: boolean) => {
        if (!isSfxEnabled || !tireGainRef.current || !audioCtxRef.current) return;

        const t = audioCtxRef.current.currentTime;
        const threshold = 120; // Only screech at high speeds

        if (isSwerving && speed > threshold) {
            // Volume increases with speed above threshold
            const intensity = Math.min((speed - threshold) / 100, 1);
            tireGainRef.current.gain.setTargetAtTime(intensity * 0.1, t, 0.1);
        } else {
            tireGainRef.current.gain.setTargetAtTime(0, t, 0.2); // Fade out quickly
        }
    };

    // Arcade Music Loop (Simple Arpeggio)
    const updateMusic = () => {
        if (!isMusicEnabled || !audioCtxRef.current) {
            if (isMusicPlayingRef.current && musicGainRef.current && audioCtxRef.current) {
                musicGainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.5);
                isMusicPlayingRef.current = false;
            }
            return;
        }

        const t = audioCtxRef.current.currentTime;

        // Init Music Node if needed (lazy init)
        if (!musicOscRef.current) {
            const osc = audioCtxRef.current.createOscillator();
            const gain = audioCtxRef.current.createGain();
            // Master Fader for music
            const fadeGain = audioCtxRef.current.createGain();

            osc.type = 'square';
            osc.connect(gain);
            gain.connect(fadeGain);
            fadeGain.connect(audioCtxRef.current.destination);
            osc.start();

            gain.gain.value = 0;
            fadeGain.gain.value = 1.0;

            musicOscRef.current = osc;
            musicGainRef.current = gain;
            fadeGainRef.current = fadeGain;
            musicNextNoteTimeRef.current = t;
        }

        // STOP MUSIC ON GAME OVER
        if (gameState.current.isGameOver || (gameState.current.lives <= 0)) {
            if (musicGainRef.current) musicGainRef.current.gain.setTargetAtTime(0, t, 0.5);
            return;
        }

        // --- ADAPTIVE THEME LOGIC ---
        // Check current theme - Cycle every 120,000m
        const dist = gameState.current.distance;
        const cycle = dist % 120000;
        let targetTheme = 'CITY';

        if (cycle < 20000) targetTheme = 'CITY';
        else if (cycle < 40000) targetTheme = 'DESERT';
        else if (cycle < 60000) targetTheme = 'SNOW';
        else if (cycle < 80000) targetTheme = 'MARS';
        else if (cycle < 100000) targetTheme = 'SYNTH';
        else targetTheme = 'MATRIX';

        // Crossfade on change
        if (targetTheme !== currentThemeRef.current) {
            currentThemeRef.current = targetTheme;
            // Quick fade out/in effect to transition
            if (fadeGainRef.current) {
                fadeGainRef.current.gain.setTargetAtTime(0, t, 0.5);
                setTimeout(() => {
                    if (fadeGainRef.current) fadeGainRef.current.gain.setTargetAtTime(1, audioCtxRef.current!.currentTime, 0.5);
                }, 500);
            }
        }

        // Schedule Notes
        let tempo = 0.15;
        let melody: number[] = [];

        switch (currentThemeRef.current) {
            case 'CITY':
                tempo = 0.15;
                melody = [220, 0, 220, 0, 220, 261, 329, 261, 196, 0, 196, 0, 261, 293, 261, 196];
                break;
            case 'DESERT':
                tempo = 0.16; // Slower, brooding
                // Phrygian Dominant-ish: E, F, G#, A, B, C, D
                melody = [329, 349, 415, 349, 329, 0, 293, 0, 329, 349, 329, 293, 246, 0, 329, 0];
                break;
            case 'SNOW':
                tempo = 0.14; // Bright
                // Major Pentatonic: C, D, E, G, A
                melody = [523, 0, 392, 0, 329, 392, 523, 587, 659, 587, 523, 392, 329, 0, 392, 0];
                break;
            case 'MARS':
                tempo = 0.20; // Slow, Heavy
                // Low Holst-inspired
                melody = [110, 110, 110, 123, 110, 0, 146, 0, 130, 130, 130, 123, 110, 0, 98, 0];
                break;
            case 'SYNTH':
                tempo = 0.13;
                melody = [146, 146, 293, 0, 146, 146, 261, 0, 130, 130, 261, 0, 130, 130, 220, 0];
                break;
            case 'MATRIX':
                tempo = 0.10;
                melody = [329, 440, 329, 415, 329, 392, 329, 349, 164, 0, 164, 0, 164, 0, 329, 0];
                break;
        }

        if (t >= musicNextNoteTimeRef.current) {
            const freq = melody[musicNoteIndexRef.current];
            if (musicOscRef.current && musicGainRef.current) {
                if (freq > 0) {
                    musicOscRef.current.frequency.setValueAtTime(freq, t);
                    musicGainRef.current.gain.setTargetAtTime(0.025, t, 0.02); // LOWERED MUSIC VOL (Was 0.05)
                } else {
                    musicGainRef.current.gain.setTargetAtTime(0, t, 0.02);
                }
            }

            musicNextNoteTimeRef.current = (musicNextNoteTimeRef.current + tempo);
            musicNoteIndexRef.current = (musicNoteIndexRef.current + 1) % melody.length;
        }

        isMusicPlayingRef.current = true;
    };

    // Call Audio Updates in Loop
    const updateAudio = (speed: number, isSwerving: boolean) => {
        updateEngineSound(speed);
        updateTireSound(speed, isSwerving);
        updateMusic();
    };

    const playSoundEffect = (type: 'shoot' | 'crash' | 'pickup' | 'empty' | 'explode') => {
        if (!isSfxEnabled || !audioCtxRef.current) return;
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => { });

        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        const t = audioCtxRef.current.currentTime;

        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);

        if (type === 'shoot') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(600, t);
            osc.frequency.exponentialRampToValueAtTime(150, t + 0.15);
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.15);
        } else if (type === 'crash') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, t);
            osc.frequency.exponentialRampToValueAtTime(20, t + 0.4);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.4);
        } else if (type === 'explode') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.linearRampToValueAtTime(40, t + 0.3);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc.start(t);
            osc.stop(t + 0.3);
        } else if (type === 'pickup') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, t);
            osc.frequency.linearRampToValueAtTime(1000, t + 0.2);
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
        } else if (type === 'empty') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.linearRampToValueAtTime(100, t + 0.5);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.5);
            osc.start(t);
            osc.stop(t + 0.5);
        }
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;

        // Expose Debug Helper for E2E
        if (import.meta.env.DEV) {
            // @ts-ignore
            window.debugCrash = () => {
                // @ts-ignore
                window.DEBUG_TRIGGER_CRASH = true;
                // @ts-ignore
                if (!window.debugLog) window.debugLog = [];
                // @ts-ignore
                window.debugLog.push('Debug Crash Requested via Global');
            };
        }

        // Reset State
        gameState.current = {
            isPlaying: true,
            isCrashing: false,
            crashDriftDir: 0,
            gameOverReason: 'CRASH',
            shakeTimer: 0,
            flashTimer: 0,
            crashTime: 0,
            speed: 0,
            score: 0,
            distance: 0,
            playerX: 0,
            isBraking: false,
            energy: 100,
            zombiesKilled: 0,
            lives: 3, // FIX: Initialize lives correctly on reset
            entities: [],
            projectiles: [],
            particles: [],
            floatingTexts: [],
            keys: { left: false, right: false, up: false, down: false, shoot: false },
            lastTime: 0,
            lastShotTime: 0,
            startTime: performance.now(),
            entityCounter: 0
        };

        // ----------------------------------------
        // Input Handling
        // ----------------------------------------
        const handleKeyDown = (e: KeyboardEvent) => {
            initAudio();
            if (gameState.current.isCrashing) return;

            switch (e.key) {
                case 'ArrowLeft': gameState.current.keys.left = true; break;
                case 'ArrowRight': gameState.current.keys.right = true; break;
                case 'ArrowUp': gameState.current.keys.up = true; break;
                case 'ArrowDown': gameState.current.keys.down = true; break;
                case ' ': gameState.current.keys.shoot = true; break;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            // FIX: Allow keys to be released even during countdown to prevent "stuck" keys
            switch (e.key) {
                case 'ArrowLeft': gameState.current.keys.left = false; break;
                case 'ArrowRight': gameState.current.keys.right = false; break;
                case 'ArrowUp': gameState.current.keys.up = false; break;
                case 'ArrowDown': gameState.current.keys.down = false; break;
                case ' ': gameState.current.keys.shoot = false; break;
            }
        };

        const handleTouchStart = (e: TouchEvent) => {
            if (!isRaceStarted) return; // LOCK INPUT
            initAudio();
            if (gameState.current.isCrashing) return;

            if (carModel.type === EngineType.EV && e.touches.length > 1) {
                gameState.current.keys.shoot = true;
            }

            const touchX = e.touches[0].clientX;
            if (touchX < window.innerWidth / 2) {
                gameState.current.keys.left = true;
                gameState.current.keys.right = false;
            } else {
                gameState.current.keys.right = true;
                gameState.current.keys.left = false;
            }

            // Auto accelerate on touch
            gameState.current.keys.up = true;
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (e.touches.length === 0) {
                gameState.current.keys.left = false;
                gameState.current.keys.right = false;
                gameState.current.keys.shoot = false;
                gameState.current.keys.up = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        canvas.addEventListener('touchstart', handleTouchStart);
        canvas.addEventListener('touchend', handleTouchEnd);


        // ----------------------------------------
        // Drawing Helpers
        // ----------------------------------------

        const getTheme = (dist: number) => {
            // Cycle every 120,000m (20km per theme)
            const cycle = dist % 120000;

            // 0-20k: Night City
            if (cycle < 20000) {
                return {
                    name: 'CITY',
                    skyTop: '#020617', skyBottom: '#1e1b4b',
                    roadColor: ['#111', '#222'],
                    ground: '#0f172a',
                    grid: false, gridColor: 'transparent',
                    fog: 0
                };
            }
            // 20-40k: Desert (Sunset)
            else if (cycle < 40000) {
                return {
                    name: 'DESERT',
                    skyTop: '#4a0404', skyBottom: '#f97316', // Red to Orange
                    roadColor: ['#292524', '#44403c'],
                    ground: '#78350f', // Brown
                    grid: false, gridColor: 'transparent',
                    fog: 0.02
                };
            }
            // 40-60k: Snow (Day/Grey)
            else if (cycle < 60000) {
                return {
                    name: 'SNOW',
                    skyTop: '#64748b', skyBottom: '#cbd5e1', // Grey to White
                    roadColor: ['#334155', '#475569'], // Blueish Asphalt
                    ground: '#f1f5f9', // White
                    grid: false, gridColor: 'transparent',
                    fog: 0.03
                };
            }
            // 60-80k: Mars (Red)
            else if (cycle < 80000) {
                return {
                    name: 'MARS',
                    skyTop: '#450a0a', skyBottom: '#7f1d1d',
                    roadColor: ['#451a03', '#78350f'],
                    ground: '#451a03',
                    grid: true, gridColor: '#ef4444',
                    fog: 0.1 // Dusty
                };
            }
            // 80-100k: Synthwave
            else if (cycle < 100000) {
                return {
                    name: 'SYNTH',
                    skyTop: '#2e003e', skyBottom: '#ff007f',
                    roadColor: ['#1a0b2e', '#2d1b4e'],
                    ground: '#120024',
                    grid: true, gridColor: '#ff00ff',
                    fog: 0.05
                };
            }
            // 100-120k: Matrix
            else {
                return {
                    name: 'MATRIX',
                    skyTop: '#000000', skyBottom: '#001a00',
                    roadColor: ['#000', '#001100'],
                    ground: '#000500',
                    grid: true, gridColor: '#00ff00',
                    fog: 0.1
                };
            }
        };

        const drawLandscape = (ctx: CanvasRenderingContext2D, theme: any) => {
            // Ground (Base Layer)
            ctx.fillStyle = theme.ground;
            ctx.fillRect(0, HORIZON_Y, GAME_WIDTH, GAME_HEIGHT);

            // Sky Gradient
            const grad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
            grad.addColorStop(0, theme.skyTop);
            grad.addColorStop(1, theme.skyBottom);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, GAME_WIDTH, HORIZON_Y + 5);

            // Parallax Offset
            const offset = (gameState.current.playerX * 30);

            // --- INGOLSTADT SKYLINE (Always Visible) ---
            // Adapt color based on theme
            let buildingColor = '#1e293b';
            let windowColor = '#fbbf24';
            let detailColor = '#334155';

            if (theme.name === 'MATRIX') { buildingColor = '#003300'; windowColor = '#00ff00'; detailColor = '#004400'; }
            else if (theme.name === 'SYNTH') { buildingColor = '#240046'; windowColor = '#ff00ff'; detailColor = '#3c096c'; }
            else if (theme.name === 'MARS') { buildingColor = '#450a0a'; windowColor = '#ef4444'; detailColor = '#7f1d1d'; }
            else if (theme.name === 'DESERT') { buildingColor = '#431407'; windowColor = '#fdba74'; detailColor = '#78350f'; }
            else if (theme.name === 'SNOW') { buildingColor = '#475569'; windowColor = '#94a3b8'; detailColor = '#64748b'; }

            ctx.fillStyle = buildingColor;

            const baseY = HORIZON_Y + 2;

            // Factory
            const factoryX = 50 - offset;
            ctx.fillRect(factoryX, baseY - 60, 40, 60);
            ctx.fillRect(factoryX + 50, baseY - 40, 60, 40);
            // Chimneys
            ctx.fillStyle = detailColor;
            ctx.fillRect(factoryX + 5, baseY - 100, 8, 40);
            ctx.fillRect(factoryX + 25, baseY - 90, 8, 30);

            // Audi Forum
            const museumX = 200 - offset;
            ctx.fillStyle = buildingColor; // Use main color
            ctx.beginPath();
            ctx.ellipse(museumX, baseY - 70, 45, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(museumX - 45, baseY - 70, 90, 70);

            // Glass Lines (Cyber look)
            ctx.fillStyle = theme.name === 'CITY' ? 'rgba(255,255,255,0.05)' : windowColor;
            ctx.globalAlpha = theme.name === 'CITY' ? 1.0 : 0.3;
            ctx.fillRect(museumX - 25, baseY - 70, 2, 70);
            ctx.fillRect(museumX, baseY - 70, 2, 70);
            ctx.fillRect(museumX + 25, baseY - 70, 2, 70);
            ctx.globalAlpha = 1.0;

            // Piazza
            const adminX = 350 - offset;
            ctx.fillStyle = detailColor;
            ctx.fillRect(adminX, baseY - 50, 80, 50);
            ctx.fillStyle = windowColor;
            ctx.fillRect(adminX + 10, baseY - 40, 5, 5);
            ctx.fillRect(adminX + 30, baseY - 40, 5, 5);

            // Grid Effect (Render here to be behind road but over ground)
            if (theme.grid) {
                ctx.strokeStyle = theme.gridColor;
                ctx.globalAlpha = 0.3;
                ctx.lineWidth = 1;

                // Vertical Lines (Perspective)
                for (let lx = -20; lx <= 20; lx += 2) {
                    const p1 = getScreenPos(lx, 3000);
                    const p2 = getScreenPos(lx, 0);
                    // Clip to horizon
                    if (p1.y >= HORIZON_Y) {
                        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                    }
                }
                // Horizontal Lines (Moving)
                const timeOffset = (performance.now() / 10) % 200;
                for (let lz = 0; lz < 3000; lz += 200) {
                    const z = lz - timeOffset;
                    if (z < 0) continue;
                    const pL = getScreenPos(-20, z);
                    const pR = getScreenPos(20, z);
                    ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.stroke();
                }
                ctx.globalAlpha = 1.0;
            }
        };

        const drawRoad = (ctx: CanvasRenderingContext2D, theme: any) => {
            // Draw asphalt slightly wider than playable area (-1.2 to 1.2)
            const ROAD_EDGE = 1.2;
            const horizonL = getScreenPos(-ROAD_EDGE, 3000);
            const horizonR = getScreenPos(ROAD_EDGE, 3000);
            const bottomL = getScreenPos(-ROAD_EDGE, -200);
            const bottomR = getScreenPos(ROAD_EDGE, -200);

            // Asphalt
            const roadGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, GAME_HEIGHT);
            roadGrad.addColorStop(0, theme.roadColor[0]);
            roadGrad.addColorStop(1, theme.roadColor[1]);
            ctx.fillStyle = roadGrad;

            ctx.beginPath();
            ctx.moveTo(bottomL.x, bottomL.y);
            ctx.lineTo(bottomR.x, bottomR.y);
            ctx.lineTo(horizonR.x, horizonR.y);
            ctx.lineTo(horizonL.x, horizonL.y);
            ctx.fill();

            // Markings
            const segmentLength = 200;
            const numSegments = 40;
            const distOffset = gameState.current.distance % (segmentLength * 2);

            const drawLine = (laneX: number, isDashed: boolean, color: string, widthRatio: number) => {
                for (let i = 0; i < numSegments; i++) {
                    const zStart = (i * segmentLength) - distOffset;
                    const zEnd = zStart + segmentLength;

                    if (zStart < -200 || zStart > 3500) continue;
                    if (isDashed && i % 2 !== 0) continue;

                    const p1 = getScreenPos(laneX - widthRatio, zStart);
                    const p2 = getScreenPos(laneX + widthRatio, zStart);
                    const p3 = getScreenPos(laneX + widthRatio, zEnd);
                    const p4 = getScreenPos(laneX - widthRatio, zEnd);

                    ctx.fillStyle = color;
                    if (!isDashed) {
                        // Curbs
                        const isRed = (Math.floor((zStart + gameState.current.distance) / segmentLength) % 2 === 0);
                        if (theme.name === 'MATRIX') ctx.fillStyle = isRed ? '#00cc00' : '#003300';
                        else if (theme.name === 'SYNTH') ctx.fillStyle = isRed ? '#ff00ff' : '#240046';
                        else if (theme.name === 'MARS') ctx.fillStyle = isRed ? '#ef4444' : '#7f1d1d';
                        else if (theme.name === 'DESERT') ctx.fillStyle = isRed ? '#f97316' : '#78350f';
                        else if (theme.name === 'SNOW') ctx.fillStyle = isRed ? '#ef4444' : '#94a3b8';
                        else ctx.fillStyle = isRed ? '#ef4444' : '#f8fafc';
                    }

                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.lineTo(p3.x, p3.y);
                    ctx.lineTo(p4.x, p4.y);
                    ctx.fill();
                }
            };

            let centerColor = 'rgba(255,255,255,0.4)';
            if (theme.name === 'MATRIX') centerColor = 'rgba(0,255,0,0.4)';
            else if (theme.name === 'SYNTH') centerColor = 'rgba(255,0,255,0.4)';
            else if (theme.name === 'MARS') centerColor = 'rgba(239,68,68,0.4)';

            drawLine(-1.0, false, '', 0.1); // Left Curb
            drawLine(1.0, false, '', 0.1); // Right Curb
            drawLine(0, true, centerColor, 0.02); // Center Line
        };

        const drawPlayer = (ctx: CanvasRenderingContext2D) => {
            const { x, y, scale } = getScreenPos(gameState.current.playerX, PLAYER_Z);
            const w = 180 * scale;
            const h = 100 * scale;

            const isBraking = gameState.current.isBraking;
            const isGracePeriod = (performance.now() - gameState.current.startTime) < 3000;

            // Slower blinking for grace period (200ms) to reduce "flicker" feel
            if (isGracePeriod && Math.floor(performance.now() / 200) % 2 === 0) {
                ctx.globalAlpha = 0.5;
            }

            // --- Shadow (Anti-Float) ---
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.ellipse(x, y - h * 0.1, w * 0.6, h * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();

            // --- Headlights (Projection) ---
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const beamLen = 350 * scale;

            const drawBeam = (bx: number) => {
                const grad = ctx.createLinearGradient(bx, y, bx, y - beamLen);
                grad.addColorStop(0, 'rgba(255,255,255,0.2)');
                grad.addColorStop(1, 'rgba(255,255,255,0)');

                ctx.fillStyle = grad;
                ctx.beginPath();
                if (playerConfig.lightSignature === 'laser') {
                    ctx.moveTo(bx - w * 0.02, y - h);
                    ctx.lineTo(bx + w * 0.02, y - h);
                    ctx.lineTo(bx + w * 0.1, y - h - beamLen * 1.5);
                    ctx.lineTo(bx - w * 0.1, y - h - beamLen * 1.5);
                } else {
                    ctx.moveTo(bx - w * 0.1, y - h);
                    ctx.lineTo(bx + w * 0.1, y - h);
                    ctx.lineTo(bx + w * 0.4, y - h - beamLen);
                    ctx.lineTo(bx - w * 0.4, y - h - beamLen);
                }
                ctx.fill();
            };
            drawBeam(x - w * 0.3);
            drawBeam(x + w * 0.3);
            ctx.restore();


            // --- Car Body ---

            // Create metallic gradient for body
            const bodyGrad = ctx.createLinearGradient(x - w / 2, y - h, x + w / 2, y - h);
            bodyGrad.addColorStop(0, playerConfig.color); // Darker side
            bodyGrad.addColorStop(0.2, '#ffffff'); // Shine
            bodyGrad.addColorStop(0.5, playerConfig.color);
            bodyGrad.addColorStop(0.8, '#ffffff'); // Shine
            bodyGrad.addColorStop(1, playerConfig.color);

            ctx.fillStyle = bodyGrad;

            // Main Chassis (Lower)
            ctx.beginPath();
            ctx.moveTo(x - w / 2, y - h * 0.2);
            ctx.lineTo(x + w / 2, y - h * 0.2);
            ctx.lineTo(x + w / 2, y - h * 0.6);
            ctx.lineTo(x - w / 2, y - h * 0.6);
            ctx.fill();

            // Roof / Cabin
            const cabinW = w * 0.7;
            const cabinH = h * 0.35;
            const cabinY = y - h * 0.6 - cabinH;

            ctx.fillStyle = playerConfig.color; // Roof color
            ctx.fillRect(x - cabinW / 2, cabinY, cabinW, cabinH);

            // Windshield (Rear Glass Reflection)
            const glassGrad = ctx.createLinearGradient(x, cabinY, x, cabinY + cabinH);
            glassGrad.addColorStop(0, '#1e293b');
            glassGrad.addColorStop(1, '#475569');
            ctx.fillStyle = glassGrad;

            // Trapezoid Glass
            ctx.beginPath();
            ctx.moveTo(x - cabinW * 0.4, cabinY + 2);
            ctx.lineTo(x + cabinW * 0.4, cabinY + 2);
            ctx.lineTo(x + cabinW * 0.5, cabinY + cabinH);
            ctx.lineTo(x - cabinW * 0.5, cabinY + cabinH);
            ctx.fill();

            // Glass Reflection Lines
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - cabinW * 0.3, cabinY + 5);
            ctx.lineTo(x - cabinW * 0.2, cabinY + cabinH - 5);
            ctx.stroke();

            // Side Mirrors
            ctx.fillStyle = playerConfig.color;
            ctx.fillRect(x - w * 0.55, y - h * 0.6, w * 0.05, h * 0.1);
            ctx.fillRect(x + w * 0.50, y - h * 0.6, w * 0.05, h * 0.1);

            // --- Grille / Rear Diffuser Area ---
            ctx.fillStyle = '#111';
            ctx.fillRect(x - w * 0.4, y - h * 0.3, w * 0.8, h * 0.2);

            // Exhausts
            ctx.fillStyle = '#999';
            const exW = w * 0.08;
            const exH = h * 0.08;
            if (carModel.type === EngineType.ICE) {
                ctx.fillRect(x - w * 0.35, y - h * 0.25, exW, exH); // Left
                ctx.fillRect(x + w * 0.35 - exW, y - h * 0.25, exW, exH); // Right
                ctx.fillStyle = '#000';
                ctx.fillRect(x - w * 0.35 + 2, y - h * 0.25 + 2, exW - 4, exH - 4);
                ctx.fillRect(x + w * 0.35 - exW + 2, y - h * 0.25 + 2, exW - 4, exH - 4);
            }

            // --- Taillights ---
            const drawLight = (lx: number, isRight: boolean) => {
                ctx.fillStyle = isBraking ? '#ff0000' : '#991b1b';
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = isBraking ? 25 : 5;

                const lightW = w * 0.35;
                const lightH = h * 0.12;
                const lightY = y - h * 0.5;

                if (playerConfig.lightSignature === 'digital') {
                    ctx.beginPath();
                    if (isRight) {
                        ctx.moveTo(lx, lightY);
                        ctx.lineTo(lx + lightW, lightY);
                        ctx.lineTo(lx + lightW - 5, lightY + lightH);
                        ctx.lineTo(lx, lightY + lightH);
                    } else {
                        ctx.moveTo(lx, lightY);
                        ctx.lineTo(lx - lightW, lightY);
                        ctx.lineTo(lx - lightW + 5, lightY + lightH);
                        ctx.lineTo(lx, lightY + lightH);
                    }
                    ctx.fill();
                } else if (playerConfig.lightSignature === 'matrix') {
                    const blockW = lightW / 4;
                    for (let k = 0; k < 4; k++) {
                        const offset = isRight ? k * blockW : -k * blockW - blockW;
                        ctx.fillRect(lx + offset, lightY, blockW - 2, lightH);
                    }
                } else {
                    // Standard Light Bar for E-Tron or solid for others
                    const offset = isRight ? 0 : -lightW;
                    ctx.fillRect(lx + offset, lightY, lightW, lightH);

                    // Center connection for E-Tron GT
                    if (carModel.id === 'etron_gt') {
                        ctx.fillRect(x - w * 0.1, lightY + 2, w * 0.2, 2);
                    }
                }
                ctx.shadowBlur = 0;
            };

            drawLight(x + w * 0.05, true);
            drawLight(x - w * 0.05, false);

            // --- Wheels ---
            const wheelY = y - h * 0.15;
            const wheelSize = h * 0.28;

            const drawWheel = (wx: number) => {
                ctx.save();
                ctx.translate(wx, wheelY);

                ctx.fillStyle = '#000';
                ctx.fillRect(-wheelSize, -wheelSize, wheelSize * 2, wheelSize * 2);

                ctx.fillStyle = '#1e293b'; // Tire
                ctx.fillRect(-wheelSize + 2, -wheelSize + 2, wheelSize * 2 - 4, wheelSize * 2 - 4);

                // Rim (Side view sliver)
                ctx.fillStyle = '#cbd5e1';
                const rimWidth = 4;
                if (wx < x) {
                    ctx.fillRect(-wheelSize, -wheelSize / 2, rimWidth, wheelSize);
                } else {
                    ctx.fillRect(wheelSize - rimWidth, -wheelSize / 2, rimWidth, wheelSize);
                }

                ctx.restore();
            };

            drawWheel(x - w * 0.42);
            drawWheel(x + w * 0.42);

            ctx.globalAlpha = 1.0;
        };

        const drawEntities = (ctx: CanvasRenderingContext2D) => {
            const sorted = [...gameState.current.entities, ...gameState.current.projectiles].sort((a, b) => b.z - a.z);

            sorted.forEach(ent => {
                if (!ent.active) return;
                const { x, y, scale } = getScreenPos(ent.lane, ent.z);

                const w = 180 * scale;
                const h = 100 * scale;

                if (ent.type === 'projectile') {
                    ctx.fillStyle = '#06b6d4';
                    ctx.shadowColor = '#06b6d4';
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.arc(x, y - h / 2, 10 * scale, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                } else if (ent.type === 'enemy_bmw') {
                    // BMW Style: Dark Blue, Wide, L-Lights
                    ctx.fillStyle = ent.hitFlash ? '#fff' : '#172554'; // Dark Blue
                    ctx.fillRect(x - w / 2, y - h * 0.85, w, h * 0.85);

                    // Cabin
                    ctx.fillStyle = '#1e3a8a';
                    ctx.fillRect(x - w * 0.35, y - h * 1.2, w * 0.7, h * 0.4);

                    // L-Lights
                    ctx.fillStyle = '#ef4444';
                    ctx.shadowColor = '#ef4444';
                    ctx.shadowBlur = 5;
                    // Left L
                    ctx.fillRect(x - w * 0.45, y - h * 0.5, w * 0.2, h * 0.06);
                    ctx.fillRect(x - w * 0.45, y - h * 0.5, w * 0.06, h * 0.15);
                    // Right L
                    ctx.fillRect(x + w * 0.25, y - h * 0.5, w * 0.2, h * 0.06);
                    ctx.fillRect(x + w * 0.39, y - h * 0.5, w * 0.06, h * 0.15);
                    ctx.shadowBlur = 0;

                    // Quad Exhausts
                    ctx.fillStyle = '#9ca3af';
                    ctx.beginPath();
                    ctx.arc(x - w * 0.3, y - h * 0.15, 3 * scale, 0, Math.PI * 2);
                    ctx.arc(x - w * 0.2, y - h * 0.15, 3 * scale, 0, Math.PI * 2);
                    ctx.arc(x + w * 0.2, y - h * 0.15, 3 * scale, 0, Math.PI * 2);
                    ctx.arc(x + w * 0.3, y - h * 0.15, 3 * scale, 0, Math.PI * 2);
                    ctx.fill();

                } else if (ent.type === 'enemy_merc') {
                    // Merc Style: Silver, Rounder, Tri-Lights
                    ctx.fillStyle = ent.hitFlash ? '#fff' : '#cbd5e1';

                    // Rounded Body shape
                    ctx.beginPath();
                    ctx.moveTo(x - w / 2, y - h * 0.2);
                    ctx.lineTo(x - w / 2, y - h * 0.7);
                    ctx.quadraticCurveTo(x - w / 2, y - h * 0.9, x, y - h * 0.9);
                    ctx.quadraticCurveTo(x + w / 2, y - h * 0.9, x + w / 2, y - h * 0.7);
                    ctx.lineTo(x + w / 2, y - h * 0.2);
                    ctx.fill();

                    // Cabin
                    ctx.fillStyle = '#94a3b8';
                    ctx.fillRect(x - w * 0.35, y - h * 1.2, w * 0.7, h * 0.4);

                    // Tri-Lights / Oval Lights
                    ctx.fillStyle = '#ef4444';
                    ctx.shadowColor = '#ef4444';
                    ctx.shadowBlur = 5;
                    ctx.beginPath();
                    ctx.ellipse(x - w * 0.3, y - h * 0.45, w * 0.12, h * 0.08, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(x + w * 0.3, y - h * 0.45, w * 0.12, h * 0.08, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    // Rectangular Dual Exhausts
                    ctx.fillStyle = '#475569';
                    ctx.fillRect(x - w * 0.35, y - h * 0.15, w * 0.1, h * 0.08);
                    ctx.fillRect(x + w * 0.25, y - h * 0.15, w * 0.1, h * 0.08);

                } else if (ent.type === 'enemy_toyota') {
                    // Toyota/Generic Style: White/Beige, Tall, Narrow
                    ctx.fillStyle = ent.hitFlash ? '#fff' : '#f1f5f9';
                    ctx.fillRect(x - w * 0.4, y - h * 0.9, w * 0.8, h * 0.9);

                    // Tall Cabin
                    ctx.fillStyle = '#e2e8f0';
                    ctx.fillRect(x - w * 0.35, y - h * 1.3, w * 0.7, h * 0.5);

                    // Vertical Lights
                    ctx.fillStyle = '#ef4444';
                    ctx.fillRect(x - w * 0.4, y - h * 0.7, w * 0.06, h * 0.3);
                    ctx.fillRect(x + w * 0.34, y - h * 0.7, w * 0.06, h * 0.3);

                    // Simple Bumper
                    ctx.fillStyle = '#cbd5e1';
                    ctx.fillRect(x - w * 0.4, y - h * 0.2, w * 0.8, h * 0.15);

                } else if (ent.type === 'zombie') {
                    const zw = w * 0.5; // Slightly wider
                    const zh = h * 1.2;
                    ctx.fillStyle = ent.hitFlash ? '#fff' : '#16a34a';
                    ctx.fillRect(x - zw / 2, y - zh, zw, zh);
                    ctx.fillStyle = '#14532d'; // Hair
                    ctx.fillRect(x - zw / 2, y - zh, zw, zh * 0.2);
                    ctx.fillStyle = '#16a34a'; // Arms
                    ctx.fillRect(x - w / 2, y - zh * 0.7, w, zh * 0.15);
                } else if (ent.type === 'battery') {
                    // Glow effect for visibility
                    const pulse = 1 + Math.sin(Date.now() / 200) * 0.2;
                    ctx.shadowColor = '#3b82f6';
                    ctx.shadowBlur = 20;

                    ctx.fillStyle = '#3b82f6';
                    const size = w * 0.6 * pulse; // Larger size

                    // Draw Bolt Shape
                    ctx.beginPath();
                    ctx.moveTo(x, y - h * 1.5);
                    ctx.lineTo(x + size / 2, y - h * 0.8);
                    ctx.lineTo(x, y - h * 0.8);
                    ctx.lineTo(x, y);
                    ctx.lineTo(x - size / 2, y - h * 0.7);
                    ctx.lineTo(x, y - h * 0.7);
                    ctx.fill();

                    ctx.shadowBlur = 0;
                } else if (ent.type === 'fuel') {
                    // Glow effect for visibility
                    const pulse = 1 + Math.sin(Date.now() / 200) * 0.2;
                    ctx.shadowColor = '#ef4444';
                    ctx.shadowBlur = 20;

                    ctx.fillStyle = '#ef4444';
                    const sizeW = w * 0.5 * pulse;
                    const sizeH = h * 0.8 * pulse;

                    // Draw Canister
                    ctx.fillRect(x - sizeW / 2, y - sizeH, sizeW, sizeH);
                    ctx.fillStyle = '#b91c1c';
                    ctx.fillRect(x - sizeW / 2, y - sizeH, sizeW, sizeH * 0.2); // Cap area
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${30 * scale}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillText('F', x, y - sizeH * 0.3);

                    ctx.shadowBlur = 0;
                }

                if (ent.hitFlash && ent.hitFlash > 0) ent.hitFlash--;
            });
        };

        const drawHUD = (ctx: CanvasRenderingContext2D) => {
            // Speed
            ctx.font = "bold 40px 'Orbitron'";
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'right';
            ctx.fillText(`${Math.floor(gameState.current.speed)}`, GAME_WIDTH - 20, 50);
            ctx.font = "14px 'Orbitron'";
            ctx.fillText("KM/H", GAME_WIDTH - 20, 65);

            // Distance
            ctx.font = "20px 'Orbitron'";
            ctx.fillStyle = '#aaa';
            ctx.fillText(`${Math.floor(gameState.current.distance)}m`, GAME_WIDTH - 20, 80);

            // Resource Bar (Energy or Fuel) - MOVED TO BOTTOM LEFT
            const energy = gameState.current.energy;
            const barY = GAME_HEIGHT - 40;

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(20, barY, 200, 20);

            // Color based on engine type
            const isEV = carModel.type === EngineType.EV;
            ctx.fillStyle = energy > 20 ? (isEV ? '#3b82f6' : '#f59e0b') : '#ef4444';
            ctx.fillRect(20, barY, 200 * (energy / 100), 20);

            ctx.font = "12px sans-serif";
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'left';
            ctx.fillText(isEV ? "BATTERY" : "FUEL", 25, barY + 15);

            // Zombies (EV Only) - Top Left
            if (isEV) {
                ctx.font = "bold 20px 'Orbitron'";
                ctx.fillStyle = '#4ade80';
                ctx.fillText(`💀 ${gameState.current.zombiesKilled}`, 20, 70);
            }

            // Draw Lives (Hearts) - Top Left
            const lives = gameState.current.lives;
            for (let i = 0; i < 3; i++) {
                ctx.font = "30px sans-serif"; // Larger font for symbol
                ctx.fillStyle = i < lives ? '#ef4444' : '#333'; // Darker grey for empty
                ctx.fillText('♥', 20 + i * 35, 45); // Use Black Heart Suit (U+2665) which respects color
            }

            // DEBUG OVERLAY
            if (window.DEBUG_MODE) {
                ctx.font = "12px monospace";
                ctx.fillStyle = "#fff";
                ctx.fillText(`Lives: ${gameState.current.lives}`, 20, 150);
                ctx.fillText(`Speed: ${Math.floor(gameState.current.speed)}`, 20, 165);
                ctx.fillText(`Crashing: ${gameState.current.isCrashing}`, 20, 180);
                ctx.fillText(`Opp Dist: ${Math.floor(opponentStateRef.current?.distance || 0)}`, 20, 210);
                ctx.fillText(`My Dist: ${Math.floor(gameState.current.distance)}`, 20, 225);
            }

            // Draw Opponent Delta (Multiplayer)
            const currentOpponent = opponentStateRef.current;
            if (currentOpponent) {
                const delta = Math.floor(gameState.current.distance - currentOpponent.distance);
                const isAhead = delta >= 0;
                const absDelta = Math.abs(delta);

                // Pill Background
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.roundRect(GAME_WIDTH - 140, 90, 120, 30, 15);
                ctx.fill();
                ctx.fillText(isAhead ? "AHEAD" : "BEHIND", GAME_WIDTH / 2, 55); // Above the pill

                ctx.restore();
            }
        };

        // ----------------------------------------
        // Game Logic Update
        // ----------------------------------------
        const update = (deltaTime: number) => {
            const state = gameState.current;
            if (!state.isPlaying) return;

            // --- 1. Movement & Speed ---

            // E2E Debug Helper: Trigger Crash Manually
            // @ts-ignore
            if (import.meta.env.DEV && window.DEBUG_TRIGGER_CRASH) {
                // @ts-ignore
                window.DEBUG_TRIGGER_CRASH = false;
                // @ts-ignore
                if (!window.debugLog) window.debugLog = [];
                // @ts-ignore
                window.debugLog.push('Crash Triggered via Global');

                // Force crash regardless of invulnerability for testing
                state.flashTimer = 0;

                if (!state.isGameOver) {
                    // Create explosion at player position
                    createExplosion(getScreenPos(state.playerX, PLAYER_Z).x, getScreenPos(state.playerX, PLAYER_Z).y);
                    playSoundEffect('explode');

                    state.flashTimer = 120; // 2 seconds invulnerability
                    state.speed *= 0.5; // Slow down

                    // Decrement Lives
                    if (state.lives > 0) {
                        state.lives--;
                        // @ts-ignore
                        window.debugLog.push('Lives Decremented to ' + state.lives);
                    }

                    if (state.lives <= 0) {
                        state.isPlaying = false;
                        state.isGameOver = true;
                        playSoundEffect('explode');
                        onGameOver({
                            score: Math.floor(state.distance + state.zombiesKilled * 100),
                            distance: Math.floor(state.distance),
                            killCount: state.zombiesKilled,
                            reason: 'CRASH'
                        });
                    }
                }
            }

            const HANDLING_SPEED = (carModel.stats.handling / 25000) * (1 + (state.speed / 500));

            // Steering - Clamped to 0.75 to ensure car stays within screen bounds
            if (!state.isCrashing) {
                if (state.keys.left) state.playerX = Math.max(-0.75, state.playerX - HANDLING_SPEED * deltaTime);
                if (state.keys.right) state.playerX = Math.min(0.75, state.playerX + HANDLING_SPEED * deltaTime);
            } else {
                state.playerX += state.crashDriftDir * (0.02 * (state.speed / 100)) * deltaTime;
            }

            // Acceleration / Braking
            // INCREASED MAX SPEED CAP: Multiplier 2.85 -> 3.2 for higher top speed
            // Acceleration / Braking
            // INCREASED MAX SPEED CAP: Multiplier 2.85 -> 3.2 for higher top speed
            // FIX: Prevent movement before race starts
            const TARGET_SPEED = (state.keys.up && isRaceStarted) ? carModel.stats.speed * 3.2 : (state.keys.down ? 0 : 0);

            // Decrement Flash Timer (Invulnerability)
            if (state.flashTimer > 0) state.flashTimer--;

            // FASTER ACCELERATION: Divisor reduced
            const ACCEL = carModel.stats.accel / 1200;
            const BRAKE = 0.08;

            if (state.isCrashing) {
                state.speed *= 0.94; // Faster decay (was 0.96)
                if (state.speed < 5) state.speed -= 0.5; // Force stop faster
            } else {
                if (state.keys.down) {
                    state.isBraking = true;
                    state.speed -= BRAKE * deltaTime;
                } else {
                    state.isBraking = false;
                    if (state.speed < TARGET_SPEED) state.speed += ACCEL * deltaTime;
                    else if (state.speed > TARGET_SPEED) {
                        state.speed -= 0.01 * deltaTime;
                    }
                }
            }

            if (state.speed < 0) state.speed = 0;

            state.distance += (state.speed / 1000) * deltaTime * 5;

            // --- 2. Resources (Energy or Fuel) ---
            if (!state.isCrashing && state.speed > 5) {
                // ICE cars consume fuel, EVs consume Battery
                state.energy -= (state.speed / 500000) * deltaTime;
                if (state.energy <= 0) {
                    playSoundEffect('empty');
                    state.gameOverReason = carModel.type === EngineType.EV ? 'EMPTY_BATTERY' : 'EMPTY_FUEL';
                    state.isCrashing = true;
                    state.crashTime = performance.now();
                }
            }

            // --- 3. Shooting (EV Only) ---
            if (carModel.type === EngineType.EV && state.keys.shoot && !state.isCrashing) {
                const now = performance.now();
                if (now - state.lastShotTime > 250 && state.energy > 3) {
                    state.lastShotTime = now;
                    state.energy -= 2.0;
                    playSoundEffect('shoot');
                    state.projectiles.push({
                        id: state.entityCounter++,
                        type: 'projectile',
                        lane: state.playerX,
                        z: PLAYER_Z + 100,
                        active: true,
                        speed: state.speed + 150
                    });
                }
            }

            // --- 4. Spawning Logic ---
            const diffLevel = Math.min(5, 1 + Math.floor(state.distance / 1000) * 0.5);
            const spawnChance = 0.005 * diffLevel;

            // Start delay logic: Wait 2000ms before spawning anything dangerous
            const timeSinceStart = performance.now() - state.startTime;
            const canSpawnEnemies = timeSinceStart > 2000;

            if (Math.random() < spawnChance && !state.isCrashing && state.speed > 20 && canSpawnEnemies) {
                const laneRoll = Math.random();
                const lane = laneRoll < 0.33 ? -0.8 : (laneRoll < 0.66 ? 0 : 0.8);

                let type: EntityType = 'enemy_bmw';

                // TRAFFIC SPEED LOGIC UPDATE
                // Enemies now drive at 80% - 95% of player speed
                let speed = Math.max(30, state.speed * (0.8 + Math.random() * 0.15));

                const isEV = carModel.type === EngineType.EV;
                const resourceType = isEV ? 'battery' : 'fuel';

                const entityTypeRoll = Math.random();

                // 20% Chance for Resource
                if (entityTypeRoll > 0.80) {
                    type = resourceType;
                    // Items move almost as fast as player (85%)
                    speed = state.speed * 0.85;
                }
                // 40% Chance for Zombies (EV only)
                else if (isEV && entityTypeRoll < 0.4) {
                    type = 'zombie';
                    speed = state.speed * 0.85 + 15;
                }
                // Otherwise Enemy Car
                else {
                    // New logic: 3 Types
                    const r = Math.random();
                    if (r < 0.33) type = 'enemy_bmw';
                    else if (r < 0.66) type = 'enemy_merc';
                    else type = 'enemy_toyota';
                }

                // Prevent overlap at spawn
                const overlap = state.entities.some(e => e.z > 2500 && Math.abs(e.lane - lane) < 0.5);
                if (!overlap) {
                    state.entities.push({
                        id: state.entityCounter++,
                        type,
                        lane,
                        z: 3000,
                        speed,
                        active: true
                    });
                }
            }

            // --- 5. Entity Updates ---
            const moveEntities = (ent: Entity) => {
                const relSpeed = state.speed - ent.speed;
                ent.z -= (relSpeed * deltaTime * 0.1);
                if (ent.z < -200) ent.active = false;
                if (ent.z > 3500) ent.active = false;
            };

            state.entities.forEach(moveEntities);

            state.projectiles.forEach(p => {
                p.z += 120 * deltaTime * 0.1;
                if (p.z > 3000) p.active = false;
            });


            // --- 6. Collision Detection ---
            const isGracePeriod = (performance.now() - state.startTime) < 3000;

            const checkHit = (aLane: number, aZ: number, bLane: number, bZ: number, widthThreshold: number) => {
                const zDist = Math.abs(aZ - bZ);
                const laneDist = Math.abs(aLane - bLane);
                // More generous Z-dist for high speed
                return zDist < 120 && laneDist < widthThreshold;
            };

            state.entities.forEach(ent => {
                if (!ent.active) return;

                // Pickups have wider collision threshold (0.6) for easier collecting
                const isPickup = ent.type === 'battery' || ent.type === 'fuel';
                const threshold = isPickup ? 0.7 : 0.45;

                if (checkHit(state.playerX, PLAYER_Z, ent.lane, ent.z, threshold)) {
                    if (isPickup) {
                        ent.active = false;
                        state.energy = Math.min(100, state.energy + 25);
                        playSoundEffect('pickup');
                        // Visual Feedback
                        state.floatingTexts.push({
                            x: getScreenPos(state.playerX, PLAYER_Z).x,
                            y: getScreenPos(state.playerX, PLAYER_Z).y - 50,
                            text: carModel.type === EngineType.EV ? '+25% CHARGE' : '+25% FUEL',
                            life: 1.0,
                            color: carModel.type === EngineType.EV ? '#4ade80' : '#f87171'
                        });

                    } else if (!isGracePeriod && !state.isCrashing && state.flashTimer <= 0) {
                        playSoundEffect('crash');
                        state.isCrashing = true;
                        state.crashTime = performance.now();
                        state.crashDriftDir = state.playerX < ent.lane ? -1 : 1;

                        state.shakeTimer = 30;
                        createExplosion(getScreenPos(state.playerX, PLAYER_Z).x, getScreenPos(state.playerX, PLAYER_Z).y);
                    }
                }
            });

            // Projectile Collisions
            state.projectiles.forEach(p => {
                if (!p.active) return;
                state.entities.forEach(ent => {
                    if (!ent.active || ent.type === 'battery' || ent.type === 'fuel') return;

                    // Projectiles have slightly wider hit detection for satisfaction
                    if (checkHit(p.lane, p.z, ent.lane, ent.z, 0.5)) {
                        p.active = false;
                        ent.active = false;
                        playSoundEffect('explode');
                        createExplosion(getScreenPos(ent.lane, ent.z).x, getScreenPos(ent.lane, ent.z).y);

                        if (ent.type === 'zombie') state.zombiesKilled++;
                        else state.score += 500;
                    }
                });
            });

            state.entities = state.entities.filter(e => e.active);
            state.projectiles = state.projectiles.filter(p => p.active);

            state.particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.02; // Slower fade
            });
            state.particles = state.particles.filter(p => p.life > 0);

            // Update Floating Texts
            state.floatingTexts.forEach(t => {
                t.y -= 1;
                t.life -= 0.02;
            });
            state.floatingTexts = state.floatingTexts.filter(t => t.life > 0);

            // Check End Game (Stopped after crash)
            // Check End Game (Stopped after crash)
            if (state.isCrashing) {
                // Relaxed condition: Speed < 5 instead of 2 to ensure we catch it
                if (state.speed < 5 && (performance.now() - state.crashTime > 1000)) {
                    // Decrement Lives
                    if (state.lives > 0) {
                        state.lives--;
                        state.isCrashing = false;
                        state.speed = 0;
                        state.playerX = 0; // Reset position
                        state.flashTimer = 60; // Invulnerable for ~1s (60 frames)

                        // Penalty or Refuel?
                        // If we ran out of fuel, give a second chance
                        if (state.gameOverReason === 'EMPTY_BATTERY' || state.gameOverReason === 'EMPTY_FUEL') {
                            state.energy = 25; // Emergency Refuel
                            state.gameOverReason = null;
                        } else {
                            state.energy = Math.max(0, state.energy - 10); // Penalty for collision
                        }

                        // Push back slightly
                        state.distance = Math.max(0, state.distance - 50);
                    } else {
                        state.isPlaying = false;
                        state.isGameOver = true; // FORCE FLAG
                        onGameOver({
                            score: Math.floor(state.distance + state.zombiesKilled * 100),
                            distance: Math.floor(state.distance),
                            killCount: state.zombiesKilled,
                            reason: state.gameOverReason
                        });
                    }
                }
            }

            // Report Progress
            if (onProgress) {
                onProgress(
                    Math.floor(state.distance + state.zombiesKilled * 100),
                    Math.floor(state.distance),
                    state.lives
                );
            }
        };

        const createExplosion = (x: number, y: number) => {
            for (let i = 0; i < 20; i++) {
                gameState.current.particles.push({
                    x, y,
                    vx: (Math.random() - 0.5) * 10,
                    vy: (Math.random() - 0.5) * 10,
                    life: 1.0,
                    color: Math.random() > 0.5 ? '#f87171' : '#fca5a5',
                    size: Math.random() * 6 + 3
                });
            }
        };

        // ----------------------------------------
        // Main Loop
        // ----------------------------------------
        const loop = (time: number) => {
            const dt = Math.min(time - gameState.current.lastTime, 50);
            gameState.current.lastTime = time;

            update(dt);

            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    let dx = 0, dy = 0;
                    if (gameState.current.shakeTimer > 0) {
                        gameState.current.shakeTimer--;
                        dx = (Math.random() - 0.5) * 10;
                        dy = (Math.random() - 0.5) * 10;
                    }

                    ctx.save();
                    ctx.translate(dx, dy);
                    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

                    const theme = getTheme(gameState.current.distance);
                    drawLandscape(ctx, theme);
                    drawRoad(ctx, theme);
                    drawEntities(ctx);
                    drawPlayer(ctx);

                    // Particles
                    gameState.current.particles.forEach(p => {
                        ctx.globalAlpha = p.life;
                        ctx.fillStyle = p.color;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                        ctx.fill();
                    });

                    // Floating Texts
                    gameState.current.floatingTexts.forEach(t => {
                        ctx.globalAlpha = t.life;
                        ctx.fillStyle = t.color;
                        ctx.font = "bold 20px 'Orbitron'";
                        ctx.textAlign = 'center';
                        ctx.shadowColor = 'black';
                        ctx.shadowBlur = 4;
                        ctx.fillText(t.text, t.x, t.y);
                        ctx.shadowBlur = 0;
                    });

                    ctx.globalAlpha = 1.0;

                    if (gameState.current.flashTimer > 0) {
                        gameState.current.flashTimer--;
                        ctx.fillStyle = `rgba(220, 38, 38, ${gameState.current.flashTimer / 20})`;
                        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
                    }

                    drawHUD(ctx);
                    ctx.restore();
                }
            }

            updateAudio(gameState.current.speed, Math.abs(gameState.current.playerX - (gameState.current.keys.left ? -0.75 : (gameState.current.keys.right ? 0.75 : gameState.current.playerX))) > 0.01 && gameState.current.speed > 50);

            // Update Debug State
            // @ts-ignore
            window.debugState = {
                lives: gameState.current.lives,
                distance: gameState.current.distance,
                isGameOver: gameState.current.isGameOver
            };

            frameIdRef.current = requestAnimationFrame(loop);
        };

        frameIdRef.current = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(frameIdRef.current);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            canvas?.removeEventListener('touchstart', handleTouchStart);
            canvas?.removeEventListener('touchend', handleTouchEnd);

            if (engineOscRef.current) {
                try { engineOscRef.current.stop(); } catch (e) { }
            }
        };
    }, [carModel, playerConfig, onGameOver, isRaceStarted]);

    return (
        <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="w-full h-full max-w-lg shadow-2xl bg-black touch-none"
        />
    );
};