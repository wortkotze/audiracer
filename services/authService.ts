import { supabase } from './supabaseClient';

export interface UserProfile {
    id: string;
    name: string;
}

const STORAGE_KEY = 'audi_retro_user';

export const authService = {
    login: async (name: string): Promise<UserProfile> => {
        // For now, we just generate a random ID and store the name locally.
        // In the future, we could insert this into a 'users' table in Supabase.

        let user = authService.getUser();

        if (!user || user.name !== name) {
            user = {
                id: crypto.randomUUID(),
                name: name
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        }

        return user;
    },

    getUser: (): UserProfile | null => {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    },

    logout: () => {
        localStorage.removeItem(STORAGE_KEY);
    }
};
