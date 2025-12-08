import './global.css'; // NativeWind
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context'; // Standard
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // Standard

import { GameState, UserProfile, CarModel, PlayerConfig, GameOverStats, EngineType } from './src/types';
import { authService } from './src/services/authService';
import { multiplayerService } from './src/services/multiplayerService';

// Screens & Components
import { LoginScreen } from './src/screens/LoginScreen';
import { StartScreen } from './src/screens/StartScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { GameOverScreen } from './src/screens/GameOverScreen';
import { Garage } from './src/components/Garage';
import { MobileGameCanvas } from './src/components/MobileGameCanvas';

export default function App() {
  const [gameState, setGameState] = useState<GameState['screen']>('LOGIN');
  const [user, setUser] = useState<UserProfile | null>(null);

  // Game Setup State
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig | null>(null);
  const [selectedCar, setSelectedCar] = useState<CarModel | null>(null);
  const [strategyText, setStrategyText] = useState("");

  // Race State
  const [raceStats, setRaceStats] = useState<GameOverStats>({ score: 0, distance: 0 });
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [lobbyId, setLobbyId] = useState("");
  const [opponentState, setOpponentState] = useState<any>(null); // Type accurately later

  // Init Auth
  useEffect(() => {
    authService.getUser().then(u => {
      if (u) {
        setUser(u);
        setGameState('START');
        // Connect Global Logic
        multiplayerService.joinGlobalLobby(u, (players) => {
          // Global update logic if needed at top level
        });
      } else {
        setGameState('LOGIN');
      }
    });
  }, []);

  const handleLogin = (u: UserProfile) => {
    setUser(u);
    setGameState('START');
    multiplayerService.joinGlobalLobby(u, () => { });
  };

  const startGame = (car: CarModel, config: PlayerConfig, strategy: string) => {
    setSelectedCar(car);
    setPlayerConfig(config);
    setStrategyText(strategy);

    if (isMultiplayer) {
      setGameState('LOBBY');
    } else {
      handleStartRaceSequence();
    }
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

  const handleGameOver = (stats: GameOverStats) => {
    setRaceStats(stats);
    setGameState('GAMEOVER');
    // Logic for saving score, AI analysis etc... similar to web
    // Simplified for now
  };

  const resetGame = () => {
    setGameState('GARAGE');
    setAiAnalysis("");
  };

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'black' }}>
        <StatusBar style="light" hidden={gameState === 'RACING'} />

        {gameState === 'LOGIN' && <LoginScreen onLogin={handleLogin} />}

        {gameState === 'START' && user && (
          <StartScreen
            user={user}
            onSolo={() => { setIsMultiplayer(false); setGameState('GARAGE'); }}
            onMultiplayer={() => { setIsMultiplayer(true); setGameState('GARAGE'); }}
            onLeaderboard={() => setGameState('LEADERBOARD')}
            onSettings={() => { }}
          />
        )}

        {gameState === 'GARAGE' && (
          <Garage onStartRace={startGame} onBack={() => setGameState('START')} />
        )}

        {gameState === 'LEADERBOARD' && (
          <LeaderboardScreen onBack={() => setGameState('START')} />
        )}

        {gameState === 'LOBBY' && user && (
          <LobbyScreen
            user={user}
            selectedCar={selectedCar}
            onStartRace={(id) => { setLobbyId(id); handleStartRaceSequence(); }}
            onBack={() => setGameState('GARAGE')}
            onChangeCar={() => setGameState('GARAGE')}
          />
        )}

        {(gameState === 'RACING' || gameState === 'COUNTDOWN') && selectedCar && playerConfig && (
          <View style={{ flex: 1 }}>
            <MobileGameCanvas
              carModel={selectedCar}
              playerConfig={playerConfig}
              onGameOver={handleGameOver}
              onProgress={() => { }}
              isRaceStarted={gameState === 'RACING'}
              isSfxEnabled={true}
              isMusicEnabled={true}
              opponentState={opponentState}
              countdown={countdown}
            />
            {gameState === 'COUNTDOWN' && (
              <View className="absolute inset-0 items-center justify-center bg-black/50">
                <Text className="text-9xl font-bold text-white font-mono">{countdown}</Text>
              </View>
            )}
          </View>
        )}

        {gameState === 'GAMEOVER' && (
          <GameOverScreen
            stats={raceStats}
            selectedCar={selectedCar}
            aiAnalysis={aiAnalysis}
            opponentState={opponentState}
            isMultiplayer={isMultiplayer}
            onRematch={resetGame}
            onExit={() => setGameState('START')}
          />
        )}

      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
