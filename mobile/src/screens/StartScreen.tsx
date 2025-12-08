import React from 'react';
import { View, Text, Image } from 'react-native';
import { Button } from '../components/Button';
import { UserProfile } from '../services/authService';

interface StartScreenProps {
    user: UserProfile;
    onSolo: () => void;
    onMultiplayer: () => void;
    onLeaderboard: () => void;
    onSettings: () => void; // Optional
}

export const StartScreen: React.FC<StartScreenProps> = ({ user, onSolo, onMultiplayer, onLeaderboard }) => {
    return (
        <View className="flex-1 bg-black items-center justify-center p-8">
            {/* Logo Placeholder */}
            <View className="items-center mb-12">
                {/* We can use an Image here if we have one, or just Text */}
                <Text className="text-5xl font-bold font-pixel tracking-wider text-white mb-2">RETRO</Text>
                <Text className="text-5xl font-bold font-pixel tracking-wider text-audi-red">RACER</Text>
            </View>

            <Text className="text-audi-grey mb-8 text-lg">
                Welcome, <Text className="text-white font-bold">{user.name}</Text>
            </Text>

            <View className="w-full max-w-sm space-y-4 gap-4">
                <Button onPress={onSolo} variant="secondary" fullWidth>SOLO RACE</Button>
                <Button onPress={onMultiplayer} variant="primary" fullWidth>MULTIPLAYER</Button>
                <Button onPress={onLeaderboard} variant="outline" fullWidth>LEADERBOARD</Button>
            </View>

            <Text className="absolute bottom-8 text-xs text-audi-grey text-center">
                © 2024 Audi Retro Concept. Unofficial Fan Art.
            </Text>
        </View>
    );
};
