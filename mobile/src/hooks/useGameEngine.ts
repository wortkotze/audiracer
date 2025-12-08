import { useRef, useEffect, useState } from 'react';
import { CarModel, EngineType, GameOverStats, PlayerConfig } from '../types';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { PlayerState } from '../services/multiplayerService';

// Constants
export const ROAD_WIDTH = 800;
export const CAMERA_HEIGHT = 150; // Camera height
export const PLAYER_Z = 300;     // Distance from camera to player
export const HORIZON_Y = GAME_HEIGHT * 0.35; // Horizon line Y position

export type EntityType = 'enemy_bmw' | 'enemy_merc' | 'enemy_toyota' | 'zombie' | 'projectile' | 'battery' | 'fuel';

export interface Entity {
    id: number;
    type: EntityType;
    lane: number; // -1 to 1
    z: number;    // 0 to 3000
    speed: number;
    active: boolean;
    hitFlash?: number;
}

export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
    size: number;
}

export const useGameEngine = (
    carModel: CarModel,
    isRaceStarted: boolean,
    onGameOver: (stats: GameOverStats) => void,
    onProgress?: (score: number, distance: number, lives: number) => void
) => {
    // Game State Ref (Mutable for Performance)
    const gameState = useRef({
        isPlaying: true,
        isCrashing: false,
        crashDriftDir: 0,
        gameOverReason: 'CRASH' as 'CRASH' | 'EMPTY_BATTERY' | 'EMPTY_FUEL',
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
        lives: 3,
        isGameOver: false,

        entities: [] as Entity[],
        projectiles: [] as Entity[],
        particles: [] as Particle[],

        keys: { left: false, right: false, up: false, down: false, shoot: false, handbrake: false, horn: false },
        lastTime: 0,
        lastShotTime: 0,
        startTime: performance.now(),
        entityCounter: 0
    });

    const [tick, setTick] = useState(0); // Trigger for React Render

    // Physics Update Function (called every frame)
    const updatePhysics = (deltaTime: number) => {
        const state = gameState.current;
        if (!state.isPlaying) return;

        // 1. Movement & Speed
        const HANDLING_SPEED = (carModel.stats.handling / 25000) * (1 + (state.speed / 500));

        if (!state.isCrashing) {
            const turnSpeed = state.keys.handbrake ? HANDLING_SPEED * 1.5 : HANDLING_SPEED;
            if (state.keys.left) state.playerX = Math.max(-0.75, state.playerX - turnSpeed * deltaTime);
            if (state.keys.right) state.playerX = Math.min(0.75, state.playerX + turnSpeed * deltaTime);

            // Handbrake Drag
            if (state.keys.handbrake) {
                state.speed = Math.max(0, state.speed * 0.96);
            }
        } else {
            state.playerX += state.crashDriftDir * (0.02 * (state.speed / 100)) * deltaTime;
        }

        // Acceleration
        const TARGET_SPEED = (state.keys.up && isRaceStarted) ? carModel.stats.speed * 3.2 : 0;
        const ACCEL = carModel.stats.accel / 1200;
        const BRAKE = 0.08;

        if (state.isCrashing) {
            state.speed *= 0.94;
            if (state.speed < 5) state.speed -= 0.5;
        } else {
            if (state.keys.down) {
                state.speed -= BRAKE * deltaTime;
            } else {
                if (state.speed < TARGET_SPEED) state.speed += ACCEL * deltaTime;
                else if (state.speed > TARGET_SPEED) state.speed -= 0.01 * deltaTime;
            }
        }
        if (state.speed < 0) state.speed = 0;
        state.distance += (state.speed / 1000) * deltaTime * 5;

        // 2. Resources
        if (!state.isCrashing && state.speed > 5) {
            const difficultyMultiplier = 1 + (state.distance / 20000);
            state.energy -= (state.speed / 300000) * deltaTime * difficultyMultiplier;

            if (state.energy <= 0) {
                state.gameOverReason = carModel.type === EngineType.EV ? 'EMPTY_BATTERY' : 'EMPTY_FUEL';
                state.isPlaying = false;
                state.isGameOver = true; // Fix type error in original code by adding isGameOver to state if missing or just use local var logic
                onGameOver({
                    score: Math.floor(state.distance + state.zombiesKilled * 100),
                    distance: Math.floor(state.distance),
                    killCount: state.zombiesKilled,
                    reason: state.gameOverReason
                });
            }
        }

        // 3. Spawning
        const spawnRate = 1.0 - Math.min(0.8, state.distance / 50000);
        if (Math.random() < (0.02 / spawnRate)) { // ~60fps -> 0.02 is ~1 per sec
            spawnEntity();
        }

        // 4. Update Entities (Z-movement)
        state.entities.forEach(ent => {
            // Move towards player (relative speed)
            // Relative Speed = PlayerSpeed - EntitySpeed
            // But in this pseudo-3D, we just move them closer by player speed
            // Actually, enemies have their own speed too (moving away or towards?)
            // Original code: ent.z -= (state.speed - ent.speed) * deltaTime * 0.05
            ent.z -= (state.speed - ent.speed) * deltaTime * 0.05;
        });

        // Remove out of bounds
        state.entities = state.entities.filter(ent => ent.z > 0 && ent.z < 4000);

        // 5. Collision Detection
        checkCollisions();

        // 6. Score
        state.score = Math.floor(state.distance + state.zombiesKilled * 100);

        // Flash & Shake
        if (state.flashTimer > 0) state.flashTimer--;
        if (state.shakeTimer > 0) state.shakeTimer--;

        // Notify Progress (Throttle?)
        if (onProgress && Math.random() < 0.1) {
            onProgress(state.score, state.distance, state.lives);
        }
    };

    const spawnEntity = () => {
        const state = gameState.current;
        const types: EntityType[] = ['enemy_bmw', 'enemy_merc', 'enemy_toyota', 'zombie', 'battery', 'fuel'];
        // Weights logic simplified for port
        const type = types[Math.floor(Math.random() * types.length)];
        const lane = (Math.random() * 2 - 1) * 0.8; // -0.8 to 0.8

        state.entities.push({
            id: ++state.entityCounter,
            type: type as any,
            lane,
            z: 3000, // Horizon spawn
            speed: type.includes('enemy') ? (Math.random() * 50 + 40) : 0, // Enemies move, static items don't
            active: true
        });
    };

    const checkCollisions = () => {
        const state = gameState.current;
        const playerWidth = 0.5; // Lane width approximation

        state.entities.forEach(ent => {
            if (!ent.active) return;
            if (ent.z < PLAYER_Z + 50 && ent.z > PLAYER_Z - 50) {
                // Z-overlap
                if (Math.abs(ent.lane - state.playerX) < playerWidth) {
                    // X-overlap
                    handleCollision(ent);
                }
            }
        });
    };

    const handleCollision = (ent: Entity) => {
        const state = gameState.current;
        if (state.flashTimer > 0) return; // Invulnerable

        if (ent.type === 'battery' || ent.type === 'fuel') {
            state.energy = Math.min(100, state.energy + 30);
            ent.active = false;
            // Play sound
        } else if (ent.type === 'zombie') {
            state.zombiesKilled++;
            state.energy = Math.min(100, state.energy + 5); // EV Bonus?
            ent.active = false;
            // Splat effect
        } else {
            // Crash with car
            if (state.speed > 50) {
                state.isCrashing = true;
                state.crashDriftDir = Math.random() > 0.5 ? 1 : -1;
                state.flashTimer = 120;
                state.lives--;
                state.shakeTimer = 20;

                // Bounce
                state.speed *= 0.5;

                ent.active = false; // Destroy enemy for simplicity or bounce them?

                if (state.lives <= 0) {
                    onGameOver({
                        score: state.score,
                        distance: state.distance,
                        reason: 'CRASH'
                    });
                }
            }
        }
    };

    const setInput = (key: keyof typeof gameState.current.keys, value: boolean) => {
        gameState.current.keys[key] = value;
    };

    return {
        gameState,
        setInput,
        updatePhysics,
        tick,
        setTick
    };
};
