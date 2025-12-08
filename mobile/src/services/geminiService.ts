import { GoogleGenAI } from "@google/genai";
import { CarModel, PlayerConfig } from "../types";

// In React Native/Expo, use process.env.EXPO_PUBLIC_... or similar
const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

let ai: GoogleGenAI | null = null;
if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
}

export const getRaceStrategy = async (car: CarModel, config: PlayerConfig): Promise<string> => {
    if (!ai) return "System Offline. Drive carefully.";

    const prompt = `
    You are a chief race engineer for Audi Sport.
    The driver has selected a ${car.name} (${car.type} Engine).
    Color: ${config.color}. Rims: ${config.rims}.
    
    Stats: 
    Speed: ${car.stats.speed}/100
    Handling: ${car.stats.handling}/100
    Acceleration: ${car.stats.accel}/100

    Give a short, punchy, 2-sentence advice for an arcade pixel racing game. 
    Mention the car's specific strength (e.g. if EV mention torque/battery, if RS6 mention power).
    Keep it encouraging.
  `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp', // Or whatever model is available
            contents: prompt,
        });
        return response.text || "Good luck, driver.";
    } catch (error) {
        console.error("Gemini Error", error);
        return "Communications interference. Race hard.";
    }
};

export const getPostRaceAnalysis = async (score: number, distance: number, carName: string): Promise<string> => {
    if (!ai) return "Race complete. Data uploaded.";

    const prompt = `
    The player finished an arcade race in an ${carName}.
    Score: ${score}.
    Distance: ${distance} meters.
    
    Give a short 1-sentence witty comment about their driving. 
    If score is low (<1000), be gently sarcastic about needing driving lessons.
    If score is high (>5000), praise them as an Audi Legend.
  `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: prompt,
        });
        return response.text || "Race Complete.";
    } catch (error) {
        return "Race Complete.";
    }
};
