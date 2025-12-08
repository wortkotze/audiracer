import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { CarModel, PlayerConfig, EngineType } from '../types';
import { AUDI_COLORS, CAR_MODELS, RIMS_OPTIONS, LIGHT_SIGNATURES } from '../constants';
import { Button } from './Button';
import { Check, Zap, Fuel, ChevronRight, ChevronLeft, Lightbulb } from 'lucide-react-native';
import { getRaceStrategy } from '../services/geminiService';
import { cn } from '../utils/cn';

interface GarageProps {
    onStartRace: (car: CarModel, config: PlayerConfig, strategy: string) => void;
    onBack: () => void;
}

export const Garage: React.FC<GarageProps> = ({ onStartRace, onBack }) => {
    const [selectedCarIndex, setSelectedCarIndex] = useState(0);
    const [selectedColor, setSelectedColor] = useState(AUDI_COLORS[0].hex);
    const [selectedRims, setSelectedRims] = useState(RIMS_OPTIONS[0].id);
    const [selectedSignature, setSelectedSignature] = useState(LIGHT_SIGNATURES[0].id);
    const [strategy, setStrategy] = useState<string>("");
    const [loadingAi, setLoadingAi] = useState(false);

    const currentCar = CAR_MODELS[selectedCarIndex];

    const handleNextCar = () => {
        setSelectedCarIndex((prev) => (prev + 1) % CAR_MODELS.length);
    };

    const handlePrevCar = () => {
        setSelectedCarIndex((prev) => (prev - 1 + CAR_MODELS.length) % CAR_MODELS.length);
    };

    const handleStart = async () => {
        setLoadingAi(true);
        try {
            const config: PlayerConfig = {
                carId: currentCar.id,
                color: selectedColor,
                rims: selectedRims,
                lightSignature: selectedSignature
            };

            const aiText = await getRaceStrategy(currentCar, config);
            setStrategy(aiText);
            setLoadingAi(false);

            onStartRace(currentCar, config, aiText);
        } catch (e) {
            console.error('Error in handleStart:', e);
            setLoadingAi(false);
            // Allow start even if AI fails
            onStartRace(currentCar, {
                carId: currentCar.id,
                color: selectedColor,
                rims: selectedRims,
                lightSignature: selectedSignature
            }, "Ready to race!");
        }
    };

    // Improved CSS Shapes for Car Preview ported to RN
    const CarPreview = () => {
        const isSUV = currentCar.id === 'q4';
        const isWagon = currentCar.id === 'rs6';
        const isSport = currentCar.id === 'r8';
        const isSedan = currentCar.id === 'etron_gt';

        return (
            <View className="relative w-48 h-32 mx-auto mt-8 items-center justify-center">
                {/* Shadow */}
                <View className="absolute bottom-2 w-48 h-4 bg-black/60 rounded-[50%]" style={{ opacity: 0.6 }} />

                {/* Wheels */}
                <View className={cn("absolute left-0 w-6 h-10 bg-gray-900 rounded-sm translate-y-3 z-0", isSUV ? "bottom-10" : "bottom-8")}>
                    {[1, 2, 3, 4].map(i => <View key={i} className="w-full h-[1px] bg-gray-700 my-[2px]" />)}
                </View>
                <View className={cn("absolute right-0 w-6 h-10 bg-gray-900 rounded-sm translate-y-3 z-0", isSUV ? "bottom-10" : "bottom-8")}>
                    {[1, 2, 3, 4].map(i => <View key={i} className="w-full h-[1px] bg-gray-700 my-[2px]" />)}
                </View>

                {/* Main Body */}
                <View
                    className={cn(
                        "absolute z-10 flex items-center justify-center",
                        isSUV ? "bottom-10" : "bottom-8",
                        isSport ? "w-44" : "w-40",
                        isSUV ? "h-16" : "h-12"
                    )}
                    style={{
                        backgroundColor: selectedColor,
                        borderRadius: 8, // Simplified radius
                    }}
                >
                    {/* Roof Line - transformed */}
                    <View
                        className={cn(
                            "absolute bg-gray-900 border-2 border-gray-700",
                            isWagon ? "top-[-18px] w-36 h-6" : "",
                            isSUV ? "top-[-22px] w-32 h-8" : "",
                            isSport ? "top-[-14px] w-24 h-5" : "",
                            isSedan ? "top-[-16px] w-28 h-5" : "",
                        )}
                        style={{
                            transform: [{ skewX: '-5deg' }, { translateX: -50 }], // Manual centering tweak if needed, but nativewind handles alignment usually
                            left: '50%',
                            marginLeft: -10 // Approximate center offset due to width
                        }}
                    />

                    {/* Headlights */}
                    <View className="absolute left-1 top-2 flex flex-row gap-px">
                        <View className="w-1 h-1 bg-white" />
                    </View>
                    <View className="absolute right-1 top-2 flex flex-row gap-px">
                        <View className="w-1 h-1 bg-white" />
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View className="flex-1 bg-gray-900 pt-12 px-4 pb-4">
            <TouchableOpacity onPress={onBack} className="mb-4">
                <Text className="text-white text-sm">← BACK</Text>
            </TouchableOpacity>

            <View className="flex-row justify-between items-center mb-4">
                <Text className="text-2xl font-bold text-white">GARAGE</Text>
                <View className="flex-row items-center gap-2 px-3 py-1 bg-white/10 rounded-full">
                    {currentCar.type === EngineType.EV ? <Zap size={16} color="#FACC15" /> : <Fuel size={16} color="#DC281E" />}
                    <Text className="text-xs font-mono uppercase text-white">{currentCar.type}</Text>
                </View>
            </View>

            {/* Car Carousel */}
            <View className="bg-gray-800 rounded-xl p-6 border border-white/10 mb-4 items-center">
                <View className="flex-row justify-between items-center w-full mb-4 z-10">
                    <TouchableOpacity onPress={handlePrevCar} className="p-2 bg-white/10 rounded-full">
                        <ChevronLeft color="white" />
                    </TouchableOpacity>
                    <View className="items-center">
                        <Text className="text-lg font-bold text-white">{currentCar.name}</Text>
                        <Text className="text-[10px] text-audi-grey mt-1 text-center">{currentCar.description}</Text>
                    </View>
                    <TouchableOpacity onPress={handleNextCar} className="p-2 bg-white/10 rounded-full">
                        <ChevronRight color="white" />
                    </TouchableOpacity>
                </View>

                <CarPreview />

                {/* Stats */}
                <View className="flex-row justify-between w-full mt-8 gap-2">
                    {Object.entries(currentCar.stats).map(([key, value]) => (
                        <View key={key} className="items-center flex-1">
                            <View className="h-12 w-2 bg-black rounded-full overflow-hidden border border-white/10">
                                <View
                                    className="absolute bottom-0 w-full bg-audi-red"
                                    style={{ height: `${value}%` }}
                                />
                            </View>
                            <Text className="text-[8px] uppercase font-bold mt-2 text-gray-400">{key}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Configurator */}
            <ScrollView className="flex-1">
                {/* Color Picker */}
                <View className="mb-4">
                    <Text className="text-xs text-audi-grey font-bold mb-2 uppercase">Paint Finish</Text>
                    <View className="flex-row flex-wrap gap-2">
                        {AUDI_COLORS.map(c => (
                            <TouchableOpacity
                                key={c.name}
                                onPress={() => setSelectedColor(c.hex)}
                                className={cn("w-8 h-8 rounded-lg", selectedColor === c.hex ? "border-2 border-white scale-110" : "")}
                                style={{ backgroundColor: c.hex }}
                            >
                                {selectedColor === c.hex && <View className="flex-1 items-center justify-center">
                                    <Check size={12} color={['#FFFFFF', '#E5E5E5'].includes(c.hex) ? 'black' : 'white'} />
                                </View>}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Rims Picker */}
                <View className="mb-4">
                    <Text className="text-xs text-audi-grey font-bold mb-2 uppercase">Wheels</Text>
                    <View className="flex-row flex-wrap gap-2">
                        {RIMS_OPTIONS.map(rim => (
                            <TouchableOpacity
                                key={rim.id}
                                onPress={() => setSelectedRims(rim.id)}
                                className={cn("py-2 px-3 border rounded", selectedRims === rim.id ? "bg-white border-white" : "border-white/20")}
                            >
                                <Text className={cn("text-[10px] uppercase font-bold", selectedRims === rim.id ? "text-black" : "text-white/50")}>{rim.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </ScrollView>

            <View className="pt-2 border-t border-white/10">
                <Button onPress={handleStart} disabled={loadingAi} fullWidth variant="primary">
                    {loadingAi ? 'INITIALIZING...' : 'START ENGINE'}
                </Button>
            </View>
        </View>
    );
};
