import React, { useState } from 'react';
import { View, Text, TextInput, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { Button } from '../components/Button';
import { authService } from '../services/authService';

interface LoginScreenProps {
    onLogin: (user: { name: string, id: string }) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
    const [name, setName] = useState('');

    const handleLogin = async () => {
        if (name.trim()) {
            const user = await authService.login(name.trim());
            onLogin(user);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1 bg-black items-center justify-center px-8"
        >
            <Text className="text-4xl font-bold text-white mb-8">DRIVER ID</Text>

            <View className="w-full max-w-sm space-y-4">
                <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="ENTER NAME"
                    placeholderTextColor="#666"
                    className="bg-gray-900 border border-audi-red text-white p-4 rounded text-center text-xl font-mono mb-4"
                    maxLength={12}
                    autoCapitalize="characters"
                />
                <Button onPress={handleLogin} fullWidth>INITIALIZE</Button>
            </View>
        </KeyboardAvoidingView>
    );
};
