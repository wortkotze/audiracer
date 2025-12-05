import { supabase } from './supabaseClient';
import { HighScoreEntry } from '../types';

export const highscoreService = {
    getTopScores: async (limit: number = 10): Promise<HighScoreEntry[]> => {
        const { data, error } = await supabase
            .from('highscores')
            .select('*')
            .order('score', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching highscores:', error);
            return [];
        }

        return data || [];
    },

    saveScore: async (entry: Omit<HighScoreEntry, 'id' | 'created_at'>): Promise<void> => {
        const { error } = await supabase
            .from('highscores')
            .insert([entry]);

        if (error) {
            console.error('Error saving highscore:', error);
        }
    }
};
