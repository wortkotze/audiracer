import React, { useRef, useEffect } from 'react';
import { CarModel, PlayerConfig, EngineType, GameOverStats } from '../types';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

interface GameCanvasProps {
  carModel: CarModel;
  playerConfig: PlayerConfig;
  onGameOver: (stats: GameOverStats) => void;
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

export const GameCanvas: React.FC<GameCanvasProps> = ({ carModel, playerConfig, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIdRef = useRef<number>(0);
  
  // Audio Context Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);
  const engineFilterRef = useRef<BiquadFilterNode | null>(null);
  
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
  const initAudio = () => {
    if (audioCtxRef.current) {
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {});
        }
        return;
    }
    
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtxRef.current = new AudioContextClass();
    
    const osc = audioCtxRef.current.createOscillator();
    const gain = audioCtxRef.current.createGain();
    const filter = audioCtxRef.current.createBiquadFilter(); 
    
    const isEV = carModel.type === EngineType.EV;

    // Filter Setup
    filter.type = 'lowpass';
    filter.frequency.value = isEV ? 800 : 200; // Lower freq start for ICE rumble
    filter.Q.value = 1;

    // Oscillator Setup
    osc.type = isEV ? 'sine' : 'sawtooth'; // Sine for clean EV hum, Sawtooth for ICE grit
    osc.frequency.value = isEV ? 100 : 60; // Lower base rumble for ICE
    
    // Reduced Volume for comfort
    gain.gain.value = 0.02; // Start very quiet
    
    // Connect Chain: Osc -> Filter -> Gain -> Dest
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtxRef.current.destination);
    
    osc.start();
    
    engineOscRef.current = osc;
    engineGainRef.current = gain;
    engineFilterRef.current = filter;
  };

  const updateEngineSound = (speed: number) => {
      if (!engineOscRef.current || !audioCtxRef.current || !engineFilterRef.current) return;
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {});

      const isEV = carModel.type === EngineType.EV;
      
      const speedFactor = speed / 300; // 0 to 1 range roughly
      
      const t = audioCtxRef.current.currentTime;

      if (isEV) {
          // EV: Pitch glides up like a spaceship
          const targetFreq = 100 + (speedFactor * 400); 
          engineOscRef.current.frequency.setTargetAtTime(targetFreq, t, 0.2);
          // Filter opens up for "whine"
          engineFilterRef.current.frequency.setTargetAtTime(800 + (speedFactor * 1000), t, 0.2);
      } else {
          // ICE: Pitch rises but stays deeper
          const targetFreq = 50 + (speedFactor * 200);
          engineOscRef.current.frequency.setTargetAtTime(targetFreq, t, 0.2);
          // Filter mimics valve opening
          engineFilterRef.current.frequency.setTargetAtTime(200 + (speedFactor * 600), t, 0.2);
      }
      
      // Volume ducking when stopped, but max volume capped lower than before
      const targetGain = speed > 5 ? 0.04 : 0.01; 
      if (engineGainRef.current) {
           engineGainRef.current.gain.setTargetAtTime(targetGain, t, 0.5);
      }
  };

  const playSoundEffect = (type: 'shoot' | 'crash' | 'pickup' | 'empty' | 'explode') => {
      if (!audioCtxRef.current) return;
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {});

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

      switch(e.key) {
        case 'ArrowLeft': gameState.current.keys.left = true; break;
        case 'ArrowRight': gameState.current.keys.right = true; break;
        case 'ArrowUp': gameState.current.keys.up = true; break;
        case 'ArrowDown': gameState.current.keys.down = true; break;
        case ' ': gameState.current.keys.shoot = true; break;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      switch(e.key) {
        case 'ArrowLeft': gameState.current.keys.left = false; break;
        case 'ArrowRight': gameState.current.keys.right = false; break;
        case 'ArrowUp': gameState.current.keys.up = false; break;
        case 'ArrowDown': gameState.current.keys.down = false; break;
        case ' ': gameState.current.keys.shoot = false; break;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
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
    
    const drawLandscape = (ctx: CanvasRenderingContext2D) => {
        // Sky Gradient (Dark Night)
        const grad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y);
        grad.addColorStop(0, '#020617'); 
        grad.addColorStop(1, '#1e1b4b'); 
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, GAME_WIDTH, HORIZON_Y + 5); 

        // Parallax Offset
        const offset = (gameState.current.playerX * 30);

        // --- INGOLSTADT SKYLINE ---
        ctx.fillStyle = '#1e293b'; 
        
        const baseY = HORIZON_Y + 2;

        // Factory
        const factoryX = 50 - offset;
        ctx.fillRect(factoryX, baseY - 60, 40, 60);
        ctx.fillRect(factoryX + 50, baseY - 40, 60, 40);
        // Chimneys
        ctx.fillStyle = '#334155';
        ctx.fillRect(factoryX + 5, baseY - 100, 8, 40);
        ctx.fillRect(factoryX + 25, baseY - 90, 8, 30);
        
        // Audi Forum
        const museumX = 200 - offset;
        ctx.fillStyle = '#475569'; 
        ctx.beginPath();
        ctx.ellipse(museumX, baseY - 70, 45, 10, 0, 0, Math.PI * 2); 
        ctx.fill();
        ctx.fillRect(museumX - 45, baseY - 70, 90, 70); 

        // Glass Lines
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(museumX - 25, baseY - 70, 2, 70);
        ctx.fillRect(museumX, baseY - 70, 2, 70);
        ctx.fillRect(museumX + 25, baseY - 70, 2, 70);

        // Piazza
        const adminX = 350 - offset;
        ctx.fillStyle = '#334155';
        ctx.fillRect(adminX, baseY - 50, 80, 50);
        ctx.fillStyle = '#fbbf24'; 
        ctx.fillRect(adminX + 10, baseY - 40, 5, 5);
        ctx.fillRect(adminX + 30, baseY - 40, 5, 5);
    };

    const drawRoad = (ctx: CanvasRenderingContext2D) => {
        // Draw asphalt slightly wider than playable area (-1.2 to 1.2)
        const ROAD_EDGE = 1.2;
        const horizonL = getScreenPos(-ROAD_EDGE, 3000); 
        const horizonR = getScreenPos(ROAD_EDGE, 3000);
        const bottomL = getScreenPos(-ROAD_EDGE, -200); 
        const bottomR = getScreenPos(ROAD_EDGE, -200);

        // Ground
        ctx.fillStyle = '#0f172a'; 
        ctx.fillRect(0, HORIZON_Y, GAME_WIDTH, GAME_HEIGHT);

        // Asphalt
        const roadGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, GAME_HEIGHT);
        roadGrad.addColorStop(0, '#111');
        roadGrad.addColorStop(1, '#222');
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
                    ctx.fillStyle = isRed ? '#ef4444' : '#f8fafc';
                }

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.lineTo(p3.x, p3.y);
                ctx.lineTo(p4.x, p4.y);
                ctx.fill();
            }
        };

        drawLine(-1.0, false, '', 0.1); // Left Curb
        drawLine(1.0, false, '', 0.1); // Right Curb
        drawLine(0, true, 'rgba(255,255,255,0.4)', 0.02); // Center Line
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
        ctx.ellipse(x, y - h*0.1, w*0.6, h*0.1, 0, 0, Math.PI*2);
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
                 ctx.moveTo(bx - w*0.02, y - h);
                 ctx.lineTo(bx + w*0.02, y - h);
                 ctx.lineTo(bx + w*0.1, y - h - beamLen * 1.5);
                 ctx.lineTo(bx - w*0.1, y - h - beamLen * 1.5);
            } else {
                 ctx.moveTo(bx - w*0.1, y - h);
                 ctx.lineTo(bx + w*0.1, y - h);
                 ctx.lineTo(bx + w*0.4, y - h - beamLen);
                 ctx.lineTo(bx - w*0.4, y - h - beamLen);
            }
            ctx.fill();
        };
        drawBeam(x - w*0.3);
        drawBeam(x + w*0.3);
        ctx.restore();


        // --- Car Body ---
        
        // Create metallic gradient for body
        const bodyGrad = ctx.createLinearGradient(x - w/2, y - h, x + w/2, y - h);
        bodyGrad.addColorStop(0, playerConfig.color); // Darker side
        bodyGrad.addColorStop(0.2, '#ffffff'); // Shine
        bodyGrad.addColorStop(0.5, playerConfig.color);
        bodyGrad.addColorStop(0.8, '#ffffff'); // Shine
        bodyGrad.addColorStop(1, playerConfig.color);

        ctx.fillStyle = bodyGrad;
        
        // Main Chassis (Lower)
        ctx.beginPath();
        ctx.moveTo(x - w/2, y - h*0.2);
        ctx.lineTo(x + w/2, y - h*0.2);
        ctx.lineTo(x + w/2, y - h*0.6);
        ctx.lineTo(x - w/2, y - h*0.6);
        ctx.fill();

        // Roof / Cabin
        const cabinW = w * 0.7;
        const cabinH = h * 0.35;
        const cabinY = y - h*0.6 - cabinH;
        
        ctx.fillStyle = playerConfig.color; // Roof color
        ctx.fillRect(x - cabinW/2, cabinY, cabinW, cabinH);

        // Windshield (Rear Glass Reflection)
        const glassGrad = ctx.createLinearGradient(x, cabinY, x, cabinY + cabinH);
        glassGrad.addColorStop(0, '#1e293b');
        glassGrad.addColorStop(1, '#475569');
        ctx.fillStyle = glassGrad;
        
        // Trapezoid Glass
        ctx.beginPath();
        ctx.moveTo(x - cabinW*0.4, cabinY + 2);
        ctx.lineTo(x + cabinW*0.4, cabinY + 2);
        ctx.lineTo(x + cabinW*0.5, cabinY + cabinH);
        ctx.lineTo(x - cabinW*0.5, cabinY + cabinH);
        ctx.fill();

        // Glass Reflection Lines
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - cabinW*0.3, cabinY + 5);
        ctx.lineTo(x - cabinW*0.2, cabinY + cabinH - 5);
        ctx.stroke();

        // Side Mirrors
        ctx.fillStyle = playerConfig.color;
        ctx.fillRect(x - w*0.55, y - h*0.6, w*0.05, h*0.1);
        ctx.fillRect(x + w*0.50, y - h*0.6, w*0.05, h*0.1);

        // --- Grille / Rear Diffuser Area ---
        ctx.fillStyle = '#111';
        ctx.fillRect(x - w*0.4, y - h*0.3, w*0.8, h*0.2);
        
        // Exhausts
        ctx.fillStyle = '#999';
        const exW = w * 0.08;
        const exH = h * 0.08;
        if (carModel.type === EngineType.ICE) {
            ctx.fillRect(x - w*0.35, y - h*0.25, exW, exH); // Left
            ctx.fillRect(x + w*0.35 - exW, y - h*0.25, exW, exH); // Right
            ctx.fillStyle = '#000';
            ctx.fillRect(x - w*0.35 + 2, y - h*0.25 + 2, exW-4, exH-4);
            ctx.fillRect(x + w*0.35 - exW + 2, y - h*0.25 + 2, exW-4, exH-4);
        }

        // --- Taillights ---
        const drawLight = (lx: number, isRight: boolean) => {
            ctx.fillStyle = isBraking ? '#ff0000' : '#991b1b';
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = isBraking ? 25 : 5;
            
            const lightW = w * 0.35;
            const lightH = h * 0.12;
            const lightY = y - h*0.5;
            
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
                for(let k=0; k<4; k++) {
                   const offset = isRight ? k*blockW : -k*blockW - blockW;
                   ctx.fillRect(lx + offset, lightY, blockW-2, lightH);
                }
            } else {
                // Standard Light Bar for E-Tron or solid for others
                const offset = isRight ? 0 : -lightW;
                ctx.fillRect(lx + offset, lightY, lightW, lightH);
                
                // Center connection for E-Tron GT
                if (carModel.id === 'etron_gt') {
                     ctx.fillRect(x - w*0.1, lightY + 2, w*0.2, 2);
                }
            }
            ctx.shadowBlur = 0;
        };
        
        drawLight(x + w*0.05, true);
        drawLight(x - w*0.05, false);

        // --- Wheels ---
        const wheelY = y - h*0.15;
        const wheelSize = h * 0.28;
        
        const drawWheel = (wx: number) => {
             ctx.save();
             ctx.translate(wx, wheelY);
             
             ctx.fillStyle = '#000';
             ctx.fillRect(-wheelSize, -wheelSize, wheelSize*2, wheelSize*2);
             
             ctx.fillStyle = '#1e293b'; // Tire
             ctx.fillRect(-wheelSize + 2, -wheelSize + 2, wheelSize*2 - 4, wheelSize*2 - 4);
             
             // Rim (Side view sliver)
             ctx.fillStyle = '#cbd5e1';
             const rimWidth = 4;
             if (wx < x) {
                 ctx.fillRect(-wheelSize, -wheelSize/2, rimWidth, wheelSize);
             } else {
                 ctx.fillRect(wheelSize-rimWidth, -wheelSize/2, rimWidth, wheelSize);
             }

             ctx.restore();
        };

        drawWheel(x - w*0.42);
        drawWheel(x + w*0.42);

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
                ctx.arc(x, y - h/2, 10 * scale, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else if (ent.type === 'enemy_bmw') {
                // BMW Style: Dark Blue, Wide, L-Lights
                ctx.fillStyle = ent.hitFlash ? '#fff' : '#172554'; // Dark Blue
                ctx.fillRect(x - w/2, y - h*0.85, w, h*0.85);

                // Cabin
                ctx.fillStyle = '#1e3a8a';
                ctx.fillRect(x - w*0.35, y - h*1.2, w*0.7, h*0.4);

                // L-Lights
                ctx.fillStyle = '#ef4444';
                ctx.shadowColor = '#ef4444';
                ctx.shadowBlur = 5;
                // Left L
                ctx.fillRect(x - w*0.45, y - h*0.5, w*0.2, h*0.06); 
                ctx.fillRect(x - w*0.45, y - h*0.5, w*0.06, h*0.15); 
                // Right L
                ctx.fillRect(x + w*0.25, y - h*0.5, w*0.2, h*0.06); 
                ctx.fillRect(x + w*0.39, y - h*0.5, w*0.06, h*0.15); 
                ctx.shadowBlur = 0;

                // Quad Exhausts
                ctx.fillStyle = '#9ca3af';
                ctx.beginPath();
                ctx.arc(x - w*0.3, y - h*0.15, 3*scale, 0, Math.PI*2);
                ctx.arc(x - w*0.2, y - h*0.15, 3*scale, 0, Math.PI*2);
                ctx.arc(x + w*0.2, y - h*0.15, 3*scale, 0, Math.PI*2);
                ctx.arc(x + w*0.3, y - h*0.15, 3*scale, 0, Math.PI*2);
                ctx.fill();

            } else if (ent.type === 'enemy_merc') {
                // Merc Style: Silver, Rounder, Tri-Lights
                ctx.fillStyle = ent.hitFlash ? '#fff' : '#cbd5e1';
                
                // Rounded Body shape
                ctx.beginPath();
                ctx.moveTo(x - w/2, y - h*0.2);
                ctx.lineTo(x - w/2, y - h*0.7);
                ctx.quadraticCurveTo(x - w/2, y - h*0.9, x, y - h*0.9);
                ctx.quadraticCurveTo(x + w/2, y - h*0.9, x + w/2, y - h*0.7);
                ctx.lineTo(x + w/2, y - h*0.2);
                ctx.fill();

                // Cabin
                ctx.fillStyle = '#94a3b8';
                ctx.fillRect(x - w*0.35, y - h*1.2, w*0.7, h*0.4);
                
                // Tri-Lights / Oval Lights
                ctx.fillStyle = '#ef4444';
                ctx.shadowColor = '#ef4444';
                ctx.shadowBlur = 5;
                ctx.beginPath();
                ctx.ellipse(x - w*0.3, y - h*0.45, w*0.12, h*0.08, 0, 0, Math.PI*2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(x + w*0.3, y - h*0.45, w*0.12, h*0.08, 0, 0, Math.PI*2);
                ctx.fill();
                ctx.shadowBlur = 0;
                
                // Rectangular Dual Exhausts
                ctx.fillStyle = '#475569';
                ctx.fillRect(x - w*0.35, y - h*0.15, w*0.1, h*0.08);
                ctx.fillRect(x + w*0.25, y - h*0.15, w*0.1, h*0.08);

            } else if (ent.type === 'enemy_toyota') {
                // Toyota/Generic Style: White/Beige, Tall, Narrow
                ctx.fillStyle = ent.hitFlash ? '#fff' : '#f1f5f9';
                ctx.fillRect(x - w*0.4, y - h*0.9, w*0.8, h*0.9);

                // Tall Cabin
                ctx.fillStyle = '#e2e8f0';
                ctx.fillRect(x - w*0.35, y - h*1.3, w*0.7, h*0.5);

                // Vertical Lights
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(x - w*0.4, y - h*0.7, w*0.06, h*0.3);
                ctx.fillRect(x + w*0.34, y - h*0.7, w*0.06, h*0.3);

                // Simple Bumper
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(x - w*0.4, y - h*0.2, w*0.8, h*0.15);

            } else if (ent.type === 'zombie') {
                const zw = w * 0.5; // Slightly wider
                const zh = h * 1.2;
                ctx.fillStyle = ent.hitFlash ? '#fff' : '#16a34a';
                ctx.fillRect(x - zw/2, y - zh, zw, zh);
                ctx.fillStyle = '#14532d'; // Hair
                ctx.fillRect(x - zw/2, y - zh, zw, zh*0.2);
                ctx.fillStyle = '#16a34a'; // Arms
                ctx.fillRect(x - w/2, y - zh*0.7, w, zh*0.15);
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
                ctx.lineTo(x + size/2, y - h * 0.8);
                ctx.lineTo(x, y - h * 0.8);
                ctx.lineTo(x, y);
                ctx.lineTo(x - size/2, y - h * 0.7);
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
                ctx.fillRect(x - sizeW/2, y - sizeH, sizeW, sizeH);
                ctx.fillStyle = '#b91c1c';
                ctx.fillRect(x - sizeW/2, y - sizeH, sizeW, sizeH * 0.2); // Cap area
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${30*scale}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText('F', x, y - sizeH * 0.3);

                ctx.shadowBlur = 0;
            }

            if (ent.hitFlash && ent.hitFlash > 0) ent.hitFlash--;
        });
    };

    const drawHUD = (ctx: CanvasRenderingContext2D) => {
        ctx.font = "bold 30px 'Orbitron'";
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 5;
        ctx.fillText(`${Math.floor(gameState.current.speed)} KM/H`, GAME_WIDTH - 20, 50);
        ctx.shadowBlur = 0;
        
        ctx.font = "20px 'Orbitron'";
        ctx.fillStyle = '#aaa';
        ctx.fillText(`${Math.floor(gameState.current.distance)}m`, GAME_WIDTH - 20, 80);

        // Resource Bar (Energy or Fuel)
        const energy = gameState.current.energy;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(20, 20, 200, 20);
        
        // Color based on engine type
        const isEV = carModel.type === EngineType.EV;
        ctx.fillStyle = energy > 20 ? (isEV ? '#3b82f6' : '#f59e0b') : '#ef4444';
        ctx.fillRect(20, 20, 200 * (energy / 100), 20);
        
        ctx.font = "12px sans-serif";
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(isEV ? "BATTERY" : "FUEL", 25, 35);
        
        if (isEV) {
            ctx.font = "bold 20px 'Orbitron'";
            ctx.fillStyle = '#4ade80';
            ctx.fillText(`💀 ${gameState.current.zombiesKilled}`, 20, 70);
        }
    };

    // ----------------------------------------
    // Game Logic Update
    // ----------------------------------------
    const update = (deltaTime: number) => {
        const state = gameState.current;
        if (!state.isPlaying) return;

        // --- 1. Movement & Speed ---
        const HANDLING_SPEED = (carModel.stats.handling / 25000) * (1 + (state.speed/500)); 
        
        // Steering - Clamped to 0.75 to ensure car stays within screen bounds
        if (!state.isCrashing) {
            if (state.keys.left) state.playerX = Math.max(-0.75, state.playerX - HANDLING_SPEED * deltaTime);
            if (state.keys.right) state.playerX = Math.min(0.75, state.playerX + HANDLING_SPEED * deltaTime);
        } else {
            state.playerX += state.crashDriftDir * (0.02 * (state.speed / 100)) * deltaTime;
        }

        // Acceleration / Braking
        // INCREASED MAX SPEED CAP: Multiplier 2.5 -> 2.85 to reach ~242km/h (85 * 2.85 = 242.25)
        const TARGET_SPEED = state.keys.up ? carModel.stats.speed * 2.85 : (state.keys.down ? 0 : 0);
        
        // FASTER ACCELERATION: Divisor reduced
        const ACCEL = carModel.stats.accel / 1200; 
        const BRAKE = 0.08;

        if (state.isCrashing) {
            state.speed *= 0.96; 
            if (state.speed < 1) state.speed -= 0.1;
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

                 } else if (!isGracePeriod && !state.isCrashing) {
                     playSoundEffect('crash');
                     state.isCrashing = true;
                     state.crashTime = performance.now();
                     state.crashDriftDir = state.playerX < ent.lane ? -1 : 1;
                     
                     state.shakeTimer = 30;
                     state.flashTimer = 15;
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
        if (state.isCrashing) {
             if (state.speed < 2 && (performance.now() - state.crashTime > 1500)) {
                 state.isPlaying = false;
                 onGameOver({
                     score: Math.floor(state.distance + state.zombiesKilled * 100),
                     distance: Math.floor(state.distance),
                     killCount: state.zombiesKilled,
                     reason: state.gameOverReason
                 });
             }
        }
    };

    const createExplosion = (x: number, y: number) => {
        for(let i=0; i<20; i++) {
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
                
                drawLandscape(ctx);
                drawRoad(ctx);
                drawEntities(ctx);
                drawPlayer(ctx);
                
                // Particles
                gameState.current.particles.forEach(p => {
                    ctx.globalAlpha = p.life;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
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

        updateEngineSound(gameState.current.speed);
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
            try { engineOscRef.current.stop(); } catch(e){}
        }
    };
  }, [carModel, playerConfig, onGameOver]);

  return (
    <canvas 
        ref={canvasRef} 
        width={GAME_WIDTH} 
        height={GAME_HEIGHT}
        className="w-full h-full max-w-lg shadow-2xl bg-black touch-none"
    />
  );
};