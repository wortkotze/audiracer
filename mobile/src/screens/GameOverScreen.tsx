import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Button } from '../components/Button';
import { GameOverStats, EngineType, CarModel } from '../types';
import { PlayerState } from '../services/multiplayerService';

interface GameOverScreenProps {
    stats: GameOverStats;
    selectedCar: CarModel | null;
    aiAnalysis: string;
    opponentState: PlayerState | null;
    isMultiplayer: boolean;
    onRematch: () => void;
    onExit: () => void;
}

export const GameOverScreen: React.FC<GameOverScreenProps> = ({
    stats, selectedCar, aiAnalysis, opponentState, isMultiplayer, onRematch, onExit
}) => {

    const waitingForOpponent = isMultiplayer && opponentState && !opponentState.isGameOver;

    if (waitingForOpponent) {
        return (
            <View className="flex-1 bg-black items-center justify-center p-8">
                <Text className="text-2xl text-white font-bold mb-4 animate-pulse">WAITING FOR RIVAL...</Text>
                <Text className="text-audi-grey mb-8">{opponentState.name} is still racing!</Text>
                <View className="w-16 h-16 border-4 border-audi-red border-t-transparent rounded-full animate-spin" />
            </View>
        );
    }

    const isWin = isMultiplayer && opponentState && stats.score > opponentState.score;

    return (
        <ScrollView className="flex-1 bg-black p-8 pt-16">
            <View className="items-center mb-8">
                <Text className="text-4xl font-bold text-audi-red mb-2 uppercase text-center">
                    {stats.reason === 'EMPTY_BATTERY' ? 'BATTERY DEPLETED' : (stats.reason === 'EMPTY_FUEL' ? 'OUT OF FUEL' : 'GAME OVER')}
                </Text>

                {isMultiplayer && opponentState && (
                    <View className="bg-white/10 p-4 rounded w-full mb-6 border border-white/20 items-center">
                        <Text className="text-xl font-bold mb-2 uppercase tracking-widest text-white">RACE RESULT</Text>
                        {isWin ? (
                            <Text className="text-green-500 font-bold text-2xl">🏆 YOU WON!</Text>
                        ) : (
                            <Text className="text-red-500 font-bold text-2xl">💀 DEFEAT</Text>
                        )}
                        <View className="flex-row justify-between w-full mt-4 bg-black/20 p-2 rounded">
                            <Text className="text-white">You: {stats.score}</Text>
                            <Text className="text-white">{opponentState.name}: {opponentState.score}</Text>
                        </View>
                    </View>
                )}

                <Text className="text-6xl font-bold text-white mb-6 font-mono">{stats.score}</Text>

                <View className="bg-white/10 p-6 rounded-lg w-full mb-6 border border-white/20">
                    <View className="flex-row justify-between mb-2">
                        <Text className="text-audi-grey">Distance</Text>
                        <Text className="text-white font-bold">{Math.floor(stats.distance)}m</Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                        <Text className="text-audi-grey">Vehicle</Text>
                        <Text className="text-white font-bold">{selectedCar?.name}</Text>
                    </View>
                    <View className="border-t border-white/20 pt-4 mt-4">
                        <Text className="text-xs text-audi-red uppercase font-bold mb-1">Race Analysis</Text>
                        <Text className="text-sm italic text-gray-300">"{aiAnalysis || 'Analyzing telemetry...'}"</Text>
                    </View>
                </View>

                <Button onPress={onRematch} fullWidth className="mb-4">
                    {isMultiplayer ? 'REMATCH' : 'RACE AGAIN'}
                </Button>

                <Button onPress={onExit} variant="secondary" fullWidth>
                    EXIT TO MENU
                </Button>
            </View>
        </ScrollView>
    );
};
