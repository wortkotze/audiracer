import { supabase } from './supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../types';

const STORAGE_KEY = 'audi_retro_user';

export const authService = {
    login: async (name: string): Promise<UserProfile> => {
        let user = await authService.getUser();

        if (!user || user.name !== name) {
            user = {
                id: crypto.randomUUID(), // React Native needs a polyfill for crypto.randomUUID or we use a uuid library.
                name: name
            };
            // Simple uuid calc if crypto not available
            if (!user.id) {
                user.id = Math.random().toString(36).substring(2) + Date.now().toString(36);
            }
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        }

        return user;
    },

    getUser: async (): Promise<UserProfile | null> => {
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            return null;
        }
    },

    logout: async () => {
        await AsyncStorage.removeItem(STORAGE_KEY);
    }
};
