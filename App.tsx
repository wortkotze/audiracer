import React, { useState, useEffect, useCallback } from 'react';
import { Garage } from './components/Garage';
import { GameCanvas } from './components/GameCanvas';
import { CarModel, GameState, PlayerConfig, EngineType, GameOverStats, HighScoreEntry } from './types';
import { Button } from './components/Button';
import { getPostRaceAnalysis } from './services/geminiService';

const App = () => {
  const [gameState, setGameState] = useState<GameState['screen']>('START');
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig | null>(null);
  const [selectedCar, setSelectedCar] = useState<CarModel | null>(null);
  const [raceStats, setRaceStats] = useState<GameOverStats>({ score: 0, distance: 0 });
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [strategyText, setStrategyText] = useState("");
  const [showStrategyToast, setShowStrategyToast] = useState(false);
  const [highScores, setHighScores] = useState<HighScoreEntry[]>([]);

  // Load High Scores on mount
  useEffect(() => {
    const saved = localStorage.getItem('audi_retro_scores');
    if (saved) {
        try {
            setHighScores(JSON.parse(saved));
        } catch (e) {
            console.error("Failed to load scores", e);
        }
    }
  }, []);

  const startGame = (car: CarModel, config: PlayerConfig, strategy: string) => {
    setSelectedCar(car);
    setPlayerConfig(config);
    setStrategyText(strategy);
    setShowStrategyToast(true);
    setGameState('RACING');
  };

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
    if (selectedCar) {
        setHighScores(prev => {
            const newEntry: HighScoreEntry = { 
                score: stats.score, 
                carName: selectedCar.name, 
                date: new Date().toLocaleDateString(),
                isNew: true
            };
            
            // Add new score, sort desc, take top 5
            const updated = [...prev.map(p => ({...p, isNew: false})), newEntry]
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);
            
            localStorage.setItem('audi_retro_scores', JSON.stringify(updated.map(u => {
                const { isNew, ...rest } = u; // Don't save internal flag
                return rest;
            })));
            return updated;
        });

        // Fetch analysis
        const text = await getPostRaceAnalysis(stats.score, stats.distance, selectedCar.name);
        setAiAnalysis(text);
    }
  }, [selectedCar]);

  const resetGame = () => {
    setGameState('GARAGE');
    setAiAnalysis("");
    setStrategyText("");
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col items-center justify-center overflow-hidden">
      
      {/* Intro Screen */}
      {gameState === 'START' && (
        <div className="text-center p-8 animate-fadeIn max-w-md">
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
           <p className="text-audi-grey mb-12 text-lg">
             Experience Vorsprung durch Technik in 8-bit.
           </p>
           <Button onClick={() => setGameState('GARAGE')} fullWidth className="bg-white text-black hover:bg-audi-lightGrey">
             ENTER GARAGE
           </Button>
           
           <div className="mt-8 text-xs text-audi-grey">
             © 2024 Audi Retro Concept. Unofficial Fan Art.
           </div>
        </div>
      )}

      {/* Garage Screen */}
      {gameState === 'GARAGE' && (
        <div className="w-full h-screen max-w-lg">
          <Garage onStartRace={startGame} />
        </div>
      )}

      {/* Game Running */}
      {gameState === 'RACING' && selectedCar && playerConfig && (
        <div className="relative w-full h-screen flex justify-center">
          
          <GameCanvas 
            carModel={selectedCar} 
            playerConfig={playerConfig} 
            onGameOver={handleGameOver} 
          />

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
      )}

      {/* Game Over Screen */}
      {gameState === 'GAMEOVER' && (
        <div className="text-center p-8 max-w-md animate-fadeIn w-full overflow-y-auto max-h-screen">
           <h2 className="text-4xl font-pixel text-audi-red mb-2">
             {raceStats.reason === 'EMPTY_BATTERY' ? 'BATTERY DEPLETED' : (raceStats.reason === 'EMPTY_FUEL' ? 'OUT OF FUEL' : 'GAME OVER')}
           </h2>
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
                       <div key={idx} className={`flex justify-between items-center text-sm p-2 rounded ${entry.isNew ? 'bg-audi-red text-white' : 'text-audi-grey'}`}>
                           <span className="font-mono w-6">{idx + 1}.</span>
                           <span className="flex-1 text-left truncate px-2">{entry.carName}</span>
                           <span className="font-bold font-pixel">{entry.score}</span>
                       </div>
                   ))}
                   {highScores.length === 0 && <p className="text-xs text-gray-500 italic">No records yet. Be the first.</p>}
               </div>
           </div>

           <Button onClick={resetGame} fullWidth>
             RACE AGAIN
           </Button>
        </div>
      )}
    </div>
  );
};

export default App;