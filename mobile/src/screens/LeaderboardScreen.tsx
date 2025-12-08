import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { Button } from '../components/Button';
import { highscoreService } from '../services/highscoreService';
import { HighScoreEntry } from '../types';

interface LeaderboardScreenProps {
    onBack: () => void;
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({ onBack }) => {
    const [scores, setScores] = useState<HighScoreEntry[]>([]);

    useEffect(() => {
        highscoreService.getTopScores().then(setScores);
    }, []);

    const renderItem = ({ item, index }: { item: HighScoreEntry, index: number }) => (
        <View className={`flex-row justify-between items-center p-3 mb-2 rounded ${index < 3 ? 'bg-white/10 border border-white/20' : 'bg-gray-900'}`}>
            <View className="flex-row items-center gap-3">
                <Text className={`font-mono font-bold w-6 text-center ${index === 0 ? 'text-yellow-400' : (index === 1 ? 'text-gray-300' : (index === 2 ? 'text-amber-600' : 'text-gray-500'))}`}>
                    #{index + 1}
                </Text>
                <Text className="text-white font-bold">{item.player_name}</Text>
            </View>
            <View className="items-end">
                <Text className="text-audi-red font-bold font-mono">{item.score.toLocaleString()}</Text>
                <Text className="text-xs text-gray-400">{Math.floor(item.distance)}m</Text>
            </View>
        </View>
    );

    return (
        <View className="flex-1 bg-black p-8 pt-16">
            <Text className="text-3xl font-bold text-white mb-8 text-center uppercase">Hall of Fame</Text>

            <View className="flex-1 bg-white/5 rounded-lg p-4 mb-4">
                {scores.length === 0 ? (
                    <Text className="text-gray-500 text-center italic mt-10">No records yet.</Text>
                ) : (
                    <FlatList
                        data={scores}
                        renderItem={renderItem}
                        keyExtractor={(item, i) => i.toString()}
                    />
                )}
            </View>

            <Button onPress={onBack} variant="secondary">BACK TO MENU</Button>
        </View>
    );
};
