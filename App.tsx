import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Garage } from './components/Garage';
import { GameCanvas } from './components/GameCanvas';
import { CarModel, GameState, PlayerConfig, EngineType, GameOverStats, HighScoreEntry } from './types';
import { Button } from './components/Button';
import { getPostRaceAnalysis } from './services/geminiService';
import { authService, UserProfile } from './services/authService';
import { multiplayerService, PlayerState } from './services/multiplayerService';
import { highscoreService } from './services/highscoreService';

const App = () => {
  const [gameState, setGameState] = useState<GameState['screen']>('LOGIN');
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig | null>(null);
  const [selectedCar, setSelectedCar] = useState<CarModel | null>(null);
  const [raceStats, setRaceStats] = useState<GameOverStats>({ score: 0, distance: 0 });
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [strategyText, setStrategyText] = useState("");
  const [showStrategyToast, setShowStrategyToast] = useState(false);
  const [highScores, setHighScores] = useState<HighScoreEntry[]>([]);

  // Initialize Global Debug Mode
  // @ts-ignore
  window.DEBUG_MODE = import.meta.env.VITE_DEBUG_MODE === 'true';

  // Auth & Multiplayer State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [lobbyId, setLobbyId] = useState("");
  const [inputLobbyId, setInputLobbyId] = useState("");
  const [opponentState, setOpponentState] = useState<PlayerState | null>(null);
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [globalPlayers, setGlobalPlayers] = useState<import('./services/multiplayerService').GlobalPlayerState[]>([]);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [countdown, setCountdown] = useState(3);

  // Check Auth on Mount
  useEffect(() => {
    const existingUser = authService.getUser();
    if (existingUser) {
      setUser(existingUser);
      setGameState('START');
      // Connect to Global Lobby
      multiplayerService.joinGlobalLobby(existingUser, (players) => {
        setGlobalPlayers(players);
      });
    } else {
      setGameState('LOGIN');
    }
  }, []);

  // Push Notifications Logic
  useEffect(() => {
    if (gameState === 'LOBBY') {
      Notification.requestPermission();
    }
  }, [gameState]);

  // Track previous counts for notifications
  const prevPlayerCount = useRef(0);
  const prevRaceCount = useRef(0);

  useEffect(() => {
    if (gameState !== 'LOBBY') return;

    const onlineCount = globalPlayers.length;
    const raceCount = globalPlayers.filter(p => p.status === 'HOSTING').length;

    // Notify on New Player
    if (onlineCount > prevPlayerCount.current && prevPlayerCount.current > 0) {
      if (document.visibilityState === 'hidden' && Notification.permission === 'granted') {
        new Notification("New Driver Online!", { body: "A new challenger has entered the lobby." });
      }
    }

    // Notify on New Race
    if (raceCount > prevRaceCount.current && prevRaceCount.current > 0) {
      if (document.visibilityState === 'hidden' && Notification.permission === 'granted') {
        new Notification("New Race Available!", { body: "A new race is being hosted. Join now!" });
      }
    }

    prevPlayerCount.current = onlineCount;
    prevRaceCount.current = raceCount;
  }, [globalPlayers, gameState]);

  // Load High Scores on mount
  // Load High Scores on mount
  useEffect(() => {
    highscoreService.getTopScores().then(scores => {
      setHighScores(scores);
    });
  }, []);

  const startGame = (car: CarModel, config: PlayerConfig, strategy: string) => {
    setSelectedCar(car);
    setPlayerConfig(config);
    setStrategyText(strategy);
    setShowStrategyToast(true);

    if (isMultiplayer) {
      setGameState('LOBBY');
    } else {
      setGameState('RACING');
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = (form.elements.namedItem('username') as HTMLInputElement).value;
    if (name) {
      authService.login(name).then(u => {
        setUser(u);
        setGameState('START');
        multiplayerService.joinGlobalLobby(u, (players) => {
          setGlobalPlayers(players);
        });
      });
    }
  };

  const createLobby = () => {
    console.log('Creating Lobby...');
    const newId = Math.random().toString(36).substring(2, 7).toUpperCase();
    // Update Global Status to HOSTING with Race Class
    multiplayerService.updateGlobalStatus('HOSTING', newId, selectedCar?.type);
    joinLobby(newId);
  };

  const handleStartRaceSequence = useCallback(() => {
    setGameState('COUNTDOWN');
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setGameState('RACING');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const joinLobby = (id: string) => {
    console.log('Joining Lobby:', id, user);
    if (!user) {
      console.error('User not logged in!');
      return;
    }
    setLobbyId(id);
    // Optimistic update: Show myself immediately
    setPlayers([{
      id: user.id,
      name: user.name,
      score: 0,
      distance: 0,
      lives: 3,
      isGameOver: false
    }]);

    multiplayerService.joinLobby(id, user, (updatedPlayers) => {
      // console.log('Lobby Update Received:', updatedPlayers);
      setPlayers(updatedPlayers);

      // Update Global Status if Lobby is Full (Host Only)
      if (updatedPlayers.length >= 2 && updatedPlayers.find(p => p.id === user.id)) {
        multiplayerService.updateGlobalStatus('FULL', id);
      }

      // Find opponent for GameCanvas (first one that isn't me)
      const opponent = updatedPlayers.find(p => p.id !== user.id);
      if (opponent && window.DEBUG_MODE) {
        console.log('Opponent Update in App:', opponent.distance);
      }
      setOpponentState(opponent || null);
    });

    // Listen for Start Signal
    multiplayerService.onStartRace(() => {
      handleStartRaceSequence();
    });

    // Listen for Restart Signal (Rematch)
    multiplayerService.onRestartRace(() => {
      setGameState('COUNTDOWN');
      setCountdown(3);
      setRaceStats({ score: 0, distance: 0, killCount: 0, reason: null });
      // Reset lives and other state if needed (GameCanvas handles its own reset on mount)
    });
  };

  const handleRematch = () => {
    if (isMultiplayer && lobbyId) {
      multiplayerService.restartRace(lobbyId);
      // Local reset
      setGameState('COUNTDOWN');
      setCountdown(3);
      setRaceStats({ score: 0, distance: 0, killCount: 0, reason: null });
    } else {
      resetGame();
    }
  };

  const handleReturnToLobby = () => {
    if (isMultiplayer) {
      multiplayerService.leaveLobby();
      multiplayerService.updateGlobalStatus('IDLE');
    }
    setLobbyId("");
    setPlayers([]);
    setOpponentState(null);
    setGameState('START');
  };

  // Multiplayer Broadcast Loop
  const lastBroadcastRef = useRef(0);
  useEffect(() => {
    if (gameState !== 'RACING' || !isMultiplayer || !user) return;

    const interval = setInterval(() => {
      // We need to access the current game state from GameCanvas... 
      // Ideally GameCanvas should report back, but for now we can just broadcast what we have.
      // Wait, App doesn't know the live distance/score from GameCanvas until GameOver.
      // We need to lift state up or pass a callback to GameCanvas to report progress.
      // For this prototype, let's modify GameCanvas to accept a `onProgress` callback.
    }, 100); // 10Hz

    return () => clearInterval(interval);
  }, [gameState, isMultiplayer, user]);

  // We need to add onProgress to GameCanvas
  const handleProgress = useCallback((score: number, distance: number, lives: number) => {
    if (isMultiplayer && user) {
      const now = performance.now();
      if (now - lastBroadcastRef.current > 100) { // Throttle 100ms
        multiplayerService.broadcastState({
          id: user.id,
          name: user.name,
          score,
          distance,
          lives,
          isGameOver: false
        });
        lastBroadcastRef.current = now;
      }
    }
  }, [isMultiplayer, user]);

  // Auto-hide toast after 4 seconds
  useEffect(() => {
    if (showStrategyToast) {
      const timer = setTimeout(() => setShowStrategyToast(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showStrategyToast]);

  const handleGameOver = useCallback(async (stats: GameOverStats) => {
    setRaceStats(stats);
    setGameState('GAMEOVER');

    // Save High Score Logic
    // Save High Score Logic
    if (user) {
      // Optimistic Update
      const newEntry: HighScoreEntry = {
        player_name: user.name,
        score: stats.score,
        distance: stats.distance,
        created_at: new Date().toISOString()
      };

      // Save to DB
      highscoreService.saveScore({
        player_name: user.name,
        score: stats.score,
        distance: stats.distance
      }).then(() => {
        // Refresh scores
        return highscoreService.getTopScores();
      }).then(setHighScores);

      // Fetch analysis
      if (selectedCar) {
        const text = await getPostRaceAnalysis(stats.score, stats.distance, selectedCar.name);
        setAiAnalysis(text);
      }

      // Broadcast Final State
      if (isMultiplayer && user) {
        multiplayerService.broadcastState({
          id: user.id,
          name: user.name,
          score: stats.score,
          distance: stats.distance,
          lives: 0, // Or whatever lives they had? Maybe 0 implies game over?
          isGameOver: true
        });
      }
    }
  }, [selectedCar, isMultiplayer, user]);

  const resetGame = () => {
    setGameState('GARAGE');
    setAiAnalysis("");
    setStrategyText("");
    setOpponentState(null);
    // Don't reset isMultiplayer to allow quick replay? Or reset it?
    // Let's keep it simple.
  };

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [isSfxEnabled, setIsSfxEnabled] = useState(() => {
    return localStorage.getItem('audi_racer_sfx') !== 'false';
  });
  const [isMusicEnabled, setIsMusicEnabled] = useState(() => {
    return localStorage.getItem('audi_racer_music') !== 'false';
  });

  const toggleSfx = () => {
    setIsSfxEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('audi_racer_sfx', String(newValue));
      return newValue;
    });
  };

  const toggleMusic = () => {
    setIsMusicEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('audi_racer_music', String(newValue));
      return newValue;
    });
  };

  // Update Name
  const handleNameChange = (newName: string) => {
    if (user && newName.trim()) {
      const updatedUser = { ...user, name: newName.trim().substring(0, 12) };
      setUser(updatedUser);
      authService.login(updatedUser.name); // Persist to auth service
    }
  };

  return (
    <div className="h-[100dvh] bg-black text-white font-sans flex flex-col items-center justify-center overflow-hidden">

      {/* Login Screen */}
      {gameState === 'LOGIN' && (
        <div className="text-center p-8 animate-fadeIn max-w-md w-full">
          <h1 className="text-4xl font-bold font-pixel mb-8 text-white">DRIVER ID</h1>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              name="username"
              type="text"
              placeholder="ENTER NAME"
              className="bg-gray-900 border border-audi-red text-white p-4 rounded text-center font-mono text-xl focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
              maxLength={12}
            />
            <Button onClick={() => { }} fullWidth>INITIALIZE</Button>
          </form>
        </div>
      )}

      {/* Intro Screen */}
      {gameState === 'START' && (
        <div className="text-center p-8 animate-fadeIn max-w-md relative z-10">
          {/* Logo: 4 Rectangles */}
          <svg className="w-32 h-12 mx-auto mb-8 text-white" viewBox="0 0 100 35" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="5" width="12" height="25" />
            <rect x="25" y="5" width="12" height="25" />
            <rect x="45" y="5" width="12" height="25" />
            <rect x="65" y="5" width="12" height="25" />
          </svg>

          <h1 className="text-4xl md:text-5xl font-bold font-pixel mb-4 tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
            RETRO RACER
          </h1>
          <p className="text-audi-grey mb-4 text-lg">
            Welcome, <span className="text-white font-bold">{user?.name}</span>
          </p>
          <div className="flex flex-col gap-4">
            <Button onClick={() => { setIsMultiplayer(false); setGameState('GARAGE'); }} fullWidth className="bg-white text-black hover:bg-audi-lightGrey">
              SOLO RACE
            </Button>
            <Button onClick={() => { setIsMultiplayer(true); setGameState('GARAGE'); }} fullWidth className="bg-audi-red text-white border-none">
              MULTIPLAYER
            </Button>
            <div className="flex gap-2">
              <Button onClick={() => setGameState('LEADERBOARD')} className="flex-1 bg-gray-800 text-white hover:bg-gray-700 text-xs">
                LEADERBOARD
              </Button>
              <Button onClick={() => setShowSettings(true)} className="flex-1 bg-gray-800 text-white hover:bg-gray-700 text-xs">
                SETTINGS
              </Button>
            </div>
          </div>

          <div className="mt-8 text-xs text-audi-grey">
            © 2024 Audi Retro Concept. Unofficial Fan Art.
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-gray-900 border border-white/20 p-8 rounded-lg max-w-sm w-full shadow-2xl">
            <h2 className="text-2xl font-pixel text-white mb-6 text-center">SETTINGS</h2>

            <div className="space-y-6">
              {/* Sound Toggles */}
              <div className="flex justify-between items-center">
                <span className="text-audi-grey">SFX</span>
                <button
                  onClick={toggleSfx}
                  className={`w-12 h-6 rounded-full p-1 transition-colors ${isSfxEnabled ? 'bg-audi-red' : 'bg-gray-600'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isSfxEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-audi-grey">Music</span>
                <button
                  onClick={toggleMusic}
                  className={`w-12 h-6 rounded-full p-1 transition-colors ${isMusicEnabled ? 'bg-audi-red' : 'bg-gray-600'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isMusicEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Name Change */}
              <div className="space-y-2">
                <label className="text-audi-grey text-sm">Driver Name</label>
                <input
                  type="text"
                  value={user?.name || ''}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full bg-black border border-white/20 p-2 rounded text-white font-mono text-center focus:border-audi-red outline-none"
                  maxLength={12}
                />
              </div>

              <Button onClick={() => setShowSettings(false)} fullWidth className="mt-8 bg-white text-black hover:bg-gray-200">
                CLOSE
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Screen */}
      {
        gameState === 'LEADERBOARD' && (
          <div className="w-full h-full p-8 flex flex-col items-center justify-center animate-fadeIn">
            <h2 className="text-3xl font-bold font-pixel mb-8 text-white">HALL OF FAME</h2>
            <div className="bg-white/10 p-6 rounded-lg w-full max-w-md mb-8 backdrop-blur-sm border border-white/10">
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {highScores.length === 0 ? (
                  <p className="text-center text-gray-500 italic">No records yet.</p>
                ) : (
                  highScores.map((score, i) => (
                    <div key={i} className={`flex justify-between items-center p-3 rounded ${i < 3 ? 'bg-white/10 border border-white/20' : 'bg-black/20'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`font-mono font-bold w-6 text-center ${i === 0 ? 'text-yellow-400' : (i === 1 ? 'text-gray-300' : (i === 2 ? 'text-amber-600' : 'text-gray-500'))}`}>
                          #{i + 1}
                        </span>
                        <span className="text-white font-bold">{score.player_name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-audi-red font-bold font-mono">{score.score.toLocaleString()}</div>
                        <div className="text-[10px] text-gray-400">{Math.floor(score.distance)}m</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <Button onClick={() => setGameState('START')} className="bg-white text-black hover:bg-gray-200">
              BACK TO MENU
            </Button>
          </div>
        )
      }

      {/* Garage Screen */}
      {
        gameState === 'GARAGE' && (
          <div className="w-full h-[100dvh] max-w-lg relative">
            <div className="absolute top-4 left-4 z-50">
              <button onClick={() => setGameState('START')} className="text-white text-sm hover:text-audi-red">← BACK</button>
            </div>
            <Garage onStartRace={startGame} />
          </div>
        )
      }

      {/* Lobby Screen */}
      {
        gameState === 'LOBBY' && (
          <div className="text-center p-8 animate-fadeIn max-w-md w-full">
            <h2 className="text-2xl font-bold font-pixel mb-8 text-white">GLOBAL LOBBY</h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* ONLINE DRIVERS */}
              <div className="bg-white/10 p-4 rounded-lg text-left">
                <h3 className="text-xs text-audi-grey mb-2 uppercase">Online Drivers ({globalPlayers.length})</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {globalPlayers.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <div className={`w-2 h-2 rounded-full ${p.status === 'RACING' ? 'bg-audi-red' : (p.status === 'HOSTING' ? 'bg-yellow-500' : 'bg-green-500')}`}></div>
                      <span className="text-white truncate">{p.name} {p.id === user?.id ? '(YOU)' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ACTIVE RACES */}
              <div className="bg-white/10 p-4 rounded-lg text-left">
                <h3 className="text-xs text-audi-grey mb-2 uppercase">Active Circuits</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {globalPlayers.filter(p => p.status === 'HOSTING' && p.lobbyId && p.id !== user?.id).map(p => {
                    const canJoin = p.raceClass === selectedCar?.type;
                    return (
                      <div key={p.lobbyId} className={`flex items-center justify-between bg-black/40 p-2 rounded ${!canJoin ? 'opacity-50' : ''}`}>
                        <div className="flex flex-col">
                          <span className="text-white text-xs font-mono">{p.name}'s Race</span>
                          <span className={`text-[10px] font-bold ${p.raceClass === EngineType.EV ? 'text-blue-400' : 'text-orange-400'}`}>
                            {p.raceClass === EngineType.EV ? '⚡ ELECTRIC' : '🔥 COMBUSTION'}
                          </span>
                        </div>
                        {canJoin ? (
                          <button
                            onClick={() => joinLobby(p.lobbyId!)}
                            className="bg-audi-red text-white text-[10px] px-2 py-1 rounded hover:bg-red-600"
                          >
                            JOIN
                          </button>
                        ) : (
                          <span className="text-[8px] text-red-500 font-bold uppercase border border-red-500 px-1 rounded">
                            {p.raceClass === EngineType.EV ? 'EV ONLY' : 'ICE ONLY'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {globalPlayers.filter(p => p.status === 'HOSTING').length === 0 && (
                    <p className="text-gray-500 text-xs italic">No active races.</p>
                  )}
                </div>
              </div>
            </div>

            {!lobbyId ? (
              <div className="flex flex-col gap-4">
                <div className="flex gap-4 justify-center">
                  <Button onClick={createLobby} className="bg-audi-red text-white hover:bg-red-600 flex-1">
                    HOST RACE
                  </Button>
                  <Button onClick={() => setGameState('GARAGE')} className="bg-gray-700 text-white hover:bg-gray-600 flex-1">
                    CHANGE CAR
                  </Button>
                </div>
                <div className="mt-4">
                  <Button onClick={handleReturnToLobby} className="bg-transparent text-gray-400 hover:text-white text-sm">
                    BACK TO MENU
                  </Button>
                </div>
                <div className="text-xs text-audi-grey">
                  OR ENTER CODE MANUALLY
                </div>
                <div className="flex gap-2">
                  <input
                    value={inputLobbyId}
                    onChange={(e) => setInputLobbyId(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    className="bg-black border border-white/20 text-white p-2 rounded flex-1 font-mono text-center uppercase"
                    maxLength={5}
                  />
                  <Button onClick={() => joinLobby(inputLobbyId)}>JOIN</Button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-audi-grey mb-2">LOBBY CODE</p>
                <div className="text-4xl font-mono font-bold text-white mb-8 tracking-widest">{lobbyId}</div>

                {/* Local Lobby Players */}
                <div className="bg-white/10 p-4 rounded-lg mb-6 text-left">
                  <h3 className="text-xs text-audi-grey mb-2 uppercase">Drivers in Room ({players.length})</h3>
                  <div className="space-y-2">
                    {players.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${p.id === user?.id ? 'bg-green-500' : 'bg-audi-red'} animate-pulse`}></div>
                        <span className="font-bold text-white">
                          {p.name} {p.id === user?.id ? '(YOU)' : ''}
                        </span>
                      </div>
                    ))}
                    {players.length < 2 && (
                      <div className="flex items-center gap-2 opacity-50">
                        <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                        <span className="text-gray-400 italic">Waiting for rival...</span>
                      </div>
                    )}
                  </div>
                </div>

                <Button onClick={() => {
                  multiplayerService.updateGlobalStatus('RACING', lobbyId);
                  multiplayerService.startRace(lobbyId);
                  handleStartRaceSequence();
                }} fullWidth className="bg-audi-red text-white animate-pulse">
                  START ENGINES
                </Button>
                <p className="text-[10px] text-audi-grey mt-2">Share this code with your rival</p>
              </div>
            )}
          </div>
        )
      }

      {/* Game Running */}
      {
        (gameState === 'RACING' || gameState === 'COUNTDOWN') && selectedCar && playerConfig && (
          <div className="relative w-full h-screen flex justify-center">

            <GameCanvas
              carModel={selectedCar}
              playerConfig={playerConfig}
              onGameOver={handleGameOver}
              opponentState={opponentState}
              onProgress={handleProgress}
              isRaceStarted={gameState === 'RACING'}
              isSfxEnabled={isSfxEnabled}
              isMusicEnabled={isMusicEnabled}
            />

            {/* COUNTDOWN OVERLAY */}
            {gameState === 'COUNTDOWN' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-50 pointer-events-none">
                <div className="flex gap-4 mb-8">
                  {[1, 2, 3].map((num) => (
                    <div key={num} className={`w-16 h-16 rounded-full border-4 border-black ${(3 - countdown + 1) >= num ? 'bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.8)]' : 'bg-gray-800'
                      }`}></div>
                  ))}
                </div>
                <div className="text-8xl font-black text-white font-mono animate-ping">
                  {countdown}
                </div>
              </div>
            )}

            {/* Strategy Toast - Centered Bottom, Non-Obtrusive */}
            {showStrategyToast && (
              <div className="absolute bottom-20 z-50 animate-slideUp">
                <div className="bg-gray-900/90 border border-audi-red px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
                  <div className="w-2 h-2 bg-audi-red rounded-full animate-pulse"></div>
                  <span className="text-sm font-bold text-white tracking-wide uppercase">
                    {strategyText}
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      }

      {/* Game Over Screen */}
      {
        gameState === 'GAMEOVER' && (
          <div className="text-center p-8 max-w-md animate-fadeIn w-full overflow-y-auto max-h-screen">

            {/* WAITING FOR OPPONENT */}
            {isMultiplayer && opponentState && !opponentState.isGameOver ? (
              <div className="flex flex-col items-center justify-center h-full">
                <h2 className="text-2xl font-pixel text-white mb-4 animate-pulse">WAITING FOR RIVAL...</h2>
                <div className="text-audi-grey mb-8">
                  {opponentState.name} is still racing!
                </div>
                <div className="w-16 h-16 border-4 border-audi-red border-t-transparent rounded-full animate-spin"></div>

                <div className="mt-8 p-4 bg-white/10 rounded w-full">
                  <p className="text-sm text-audi-grey">YOUR SCORE</p>
                  <p className="text-2xl font-bold text-white">{raceStats.score}</p>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-4xl font-pixel text-audi-red mb-2">
                  {raceStats.reason === 'EMPTY_BATTERY' ? 'BATTERY DEPLETED' : (raceStats.reason === 'EMPTY_FUEL' ? 'OUT OF FUEL' : 'GAME OVER')}
                </h2>

                {/* WINNER ANNOUNCEMENT */}
                {isMultiplayer && opponentState && (
                  <div className="mb-6 p-4 bg-white/10 rounded border border-white/20">
                    <h3 className="text-xl font-bold mb-2 uppercase tracking-widest">RACE RESULT</h3>
                    {raceStats.score > opponentState.score ? (
                      <div className="text-green-500 font-pixel text-2xl">🏆 YOU WON!</div>
                    ) : (
                      <div className="text-red-500 font-pixel text-2xl">💀 DEFEAT</div>
                    )}
                    <div className="flex justify-between mt-4 text-sm">
                      <span>You: {raceStats.score}</span>
                      <span>{opponentState.name}: {opponentState.score}</span>
                    </div>
                  </div>
                )}

                <div className="text-6xl font-bold mb-6 font-pixel">{raceStats.score}</div>

                <div className="bg-white/10 p-6 rounded-lg mb-6 text-left border border-white/20">
                  <div className="flex justify-between mb-2">
                    <span className="text-audi-grey">Distance</span>
                    <span className="font-bold">{raceStats.distance}m</span>
                  </div>
                  <div className="flex justify-between mb-4">
                    <span className="text-audi-grey">Vehicle</span>
                    <span className="font-bold">{selectedCar?.name}</span>
                  </div>

                  {selectedCar?.type === EngineType.EV && (
                    <div className="flex justify-between mb-4 text-audi-red">
                      <span className="">Zombies Eliminated</span>
                      <span className="font-bold">{raceStats.killCount || 0}</span>
                    </div>
                  )}

                  <div className="border-t border-white/20 pt-4 mt-4">
                    <p className="text-xs text-audi-red uppercase font-bold mb-1">Race Analysis</p>
                    <p className="text-sm italic text-gray-300">"{aiAnalysis || 'Analyzing telemetry...'}"</p>
                  </div>
                </div>

                {/* HIGH SCORE LIST */}
                <div className="mb-8">
                  <h3 className="text-audi-red font-bold font-pixel tracking-widest text-sm mb-4 border-b border-white/10 pb-2">TOP DRIVERS</h3>
                  <div className="space-y-2">
                    {highScores.map((entry, idx) => (
                      <div key={idx} className={`flex justify-between items-center text-sm p-2 rounded ${entry.player_name === user?.name ? 'bg-audi-red text-white' : 'text-audi-grey'}`}>
                        <span className="font-mono w-6">{idx + 1}.</span>
                        <span className="flex-1 text-left truncate px-2">{entry.player_name}</span>
                        <span className="font-bold font-pixel">{entry.score}</span>
                      </div>
                    ))}
                    {highScores.length === 0 && <p className="text-xs text-gray-500 italic">No records yet. Be the first.</p>}
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button
                    onClick={handleRematch}
                    fullWidth
                    className={`${isMultiplayer && !opponentState ? 'bg-gray-500 cursor-not-allowed' : 'bg-audi-red'} text-white`}
                    disabled={isMultiplayer && !opponentState}
                  >
                    {isMultiplayer ? (opponentState ? 'REMATCH' : 'OPPONENT LEFT') : 'RACE AGAIN'}
                  </Button>
                  <Button onClick={handleReturnToLobby} fullWidth className="bg-gray-700 text-white hover:bg-gray-600">
                    {isMultiplayer ? 'LOBBY' : 'MAIN MENU'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )
      }
    </div >
  );
};

export default App;