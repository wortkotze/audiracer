import React, { useState } from 'react';
import { CarModel, PlayerConfig, EngineType } from '../types';
import { AUDI_COLORS, CAR_MODELS, RIMS_OPTIONS, LIGHT_SIGNATURES } from '../constants';
import { Button } from './Button';
import { Check, Zap, Fuel, ChevronRight, ChevronLeft, Lightbulb } from 'lucide-react';
import { getRaceStrategy } from '../services/geminiService';

interface GarageProps {
    onStartRace: (car: CarModel, config: PlayerConfig, strategy: string) => void;
}

export const Garage: React.FC<GarageProps> = ({ onStartRace }) => {
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
        }
    };

    // Improved CSS Shapes for Car Preview
    const CarPreview = () => {
        const isSUV = currentCar.id === 'q4';
        const isWagon = currentCar.id === 'rs6';
        const isSport = currentCar.id === 'r8';
        const isSedan = currentCar.id === 'etron_gt';

        // Dynamic width/height based on type
        const carWidth = isSport ? 'w-44' : 'w-40';
        const carHeight = isSUV ? 'h-16' : 'h-12';
        const bottomPos = isSUV ? 'bottom-10' : 'bottom-8';

        return (
            <div className="relative w-48 h-32 mx-auto mt-4 transition-all duration-300">
                {/* Shadow */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-48 h-4 bg-black/60 blur-md rounded-[50%]" />

                {/* Wheels (Tires View - Front/Rear Perspective) */}
                {/* Moved to left-0 and right-0 to ensure they stick out from the body (Stance) */}
                {/* Moved DOWN with translate-y-3 to hit the ground */}
                <div className={`absolute ${bottomPos} left-0 w-6 h-10 bg-gray-900 rounded-sm translate-y-3 flex flex-col justify-between py-[2px] opacity-100 shadow-xl z-0`}>
                    {/* Tread Pattern */}
                    <div className="w-full h-[1px] bg-gray-700"></div>
                    <div className="w-full h-[1px] bg-gray-700"></div>
                    <div className="w-full h-[1px] bg-gray-700"></div>
                    <div className="w-full h-[1px] bg-gray-700"></div>
                </div>
                <div className={`absolute ${bottomPos} right-0 w-6 h-10 bg-gray-900 rounded-sm translate-y-3 flex flex-col justify-between py-[2px] opacity-100 shadow-xl z-0`}>
                    {/* Tread Pattern */}
                    <div className="w-full h-[1px] bg-gray-700"></div>
                    <div className="w-full h-[1px] bg-gray-700"></div>
                    <div className="w-full h-[1px] bg-gray-700"></div>
                    <div className="w-full h-[1px] bg-gray-700"></div>
                </div>

                {/* Main Body */}
                <div
                    className={`absolute ${bottomPos} left-1/2 -translate-x-1/2 ${carWidth} ${carHeight} transition-colors duration-300 flex items-center justify-center shadow-inner z-10`}
                    style={{
                        backgroundColor: selectedColor,
                        borderRadius: isSport ? '20px 20px 4px 4px' : '8px 8px 4px 4px',
                    }}
                >
                    {/* Roof Line / Greenhouse */}
                    <div
                        className={`absolute bg-gray-900 border-2 border-gray-700/50 
                    ${isWagon ? 'top-[-18px] w-36 h-6 rounded-t-sm' : ''}
                    ${isSUV ? 'top-[-22px] w-32 h-8 rounded-t-lg' : ''}
                    ${isSport ? 'top-[-14px] w-24 h-5 rounded-t-full' : ''}
                    ${isSedan ? 'top-[-16px] w-28 h-5 rounded-t-xl' : ''}
                    left-1/2 -translate-x-1/2 skew-x-[-5deg]
                `}
                    />

                    {/* Roof Rails for RS6 */}
                    {isWagon && (
                        <div className="absolute top-[-20px] w-36 h-1 border-x border-t border-gray-400 opacity-50 left-1/2 -translate-x-1/2" />
                    )}

                    {/* R8 Side Blade (Visible edges) */}
                    {isSport && (
                        <>
                            <div className="absolute top-1 right-2 w-2 h-8 bg-black/20" />
                            <div className="absolute top-1 left-2 w-2 h-8 bg-black/20" />
                        </>
                    )}

                    {/* Grill/Front Detail (Stylized) */}
                    <div className="absolute bottom-1 w-2/3 h-4 bg-black/20 rounded-b-md"></div>

                    {/* Headlights (Front View Simulation) */}
                    <div className="absolute left-1 top-2 flex gap-px">
                        <div className="w-1 h-1 bg-white shadow-[0_0_5px_white]"></div>
                    </div>
                    <div className="absolute right-1 top-2 flex gap-px">
                        <div className="w-1 h-1 bg-white shadow-[0_0_5px_white]"></div>
                    </div>

                    {/* Taillights Preview (Overlaid for configuration feedback) */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full flex justify-between px-2 opacity-90">
                        {/* Left Light */}
                        <div className="flex gap-[1px]">
                            {selectedSignature === 'matrix' ? (
                                <>
                                    <div className="w-[3px] h-2 bg-red-500 shadow-[0_0_5px_red]"></div>
                                    <div className="w-[3px] h-2 bg-red-500 shadow-[0_0_5px_red]"></div>
                                    <div className="w-[3px] h-2 bg-red-500 shadow-[0_0_5px_red]"></div>
                                </>
                            ) : selectedSignature === 'digital' ? (
                                <div className="text-[10px] text-red-500 font-bold leading-none scale-x-[-1]">&lt;&lt;&lt;</div>
                            ) : (
                                <div className="w-8 h-2 bg-red-500 rounded-sm shadow-[0_0_5px_red]"></div>
                            )}
                        </div>

                        {/* Right Light */}
                        <div className="flex gap-[1px]">
                            {selectedSignature === 'matrix' ? (
                                <>
                                    <div className="w-[3px] h-2 bg-red-500 shadow-[0_0_5px_red]"></div>
                                    <div className="w-[3px] h-2 bg-red-500 shadow-[0_0_5px_red]"></div>
                                    <div className="w-[3px] h-2 bg-red-500 shadow-[0_0_5px_red]"></div>
                                </>
                            ) : selectedSignature === 'digital' ? (
                                <div className="text-[10px] text-red-500 font-bold leading-none">&gt;&gt;&gt;</div>
                            ) : (
                                <div className="w-8 h-2 bg-red-500 rounded-sm shadow-[0_0_5px_red]"></div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full max-w-lg mx-auto p-4 animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-pixel font-bold text-white">GARAGE</h2>
                <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full">
                    {currentCar.type === EngineType.EV ? <Zap className="text-yellow-400 w-4 h-4" /> : <Fuel className="text-audi-red w-4 h-4" />}
                    <span className="text-xs font-mono uppercase">{currentCar.type}</span>
                </div>
            </div>

            {/* Car Carousel */}
            <div className="relative bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-6 border border-white/10 mb-4 shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 rounded-xl pointer-events-none"></div>

                <div className="flex justify-between items-center mb-4 relative z-10">
                    <button onClick={handlePrevCar} data-testid="prev-car" className="p-2 hover:bg-white/10 rounded-full transition"><ChevronLeft /></button>
                    <div className="text-center">
                        <h3 className="text-lg font-bold tracking-wide">{currentCar.name}</h3>
                        <p className="text-[10px] text-audi-grey mt-1">{currentCar.description}</p>
                    </div>
                    <button onClick={handleNextCar} data-testid="next-car" className="p-2 hover:bg-white/10 rounded-full transition"><ChevronRight /></button>
                </div>

                <CarPreview />

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mt-8 relative z-10">
                    {Object.entries(currentCar.stats).map(([key, value]) => (
                        <div key={key} className="text-center">
                            <div className="h-12 w-2 bg-black mx-auto rounded-full relative overflow-hidden border border-white/10">
                                <div
                                    className="absolute bottom-0 w-full bg-audi-red transition-all duration-500 shadow-[0_0_10px_#F50537]"
                                    style={{ height: `${value}%` }}
                                />
                            </div>
                            <span className="text-[8px] uppercase font-bold mt-2 block tracking-wider text-gray-400">{key}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Configurator */}
            <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">

                {/* Color Picker */}
                <div>
                    <label className="text-[10px] uppercase text-audi-grey font-bold mb-2 block flex items-center gap-2">
                        Paint Finish <span className="h-px bg-white/20 flex-1"></span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {AUDI_COLORS.map(c => (
                            <button
                                key={c.name}
                                onClick={() => setSelectedColor(c.hex)}
                                className={`w-8 h-8 rounded-lg shadow-lg transition-transform ${selectedColor === c.hex ? 'scale-110 ring-2 ring-white ring-offset-1 ring-offset-black' : 'hover:scale-105'}`}
                                style={{ backgroundColor: c.hex }}
                                title={c.name}
                            >
                                {selectedColor === c.hex && <Check className={`w-4 h-4 mx-auto ${['#FFFFFF', '#E5E5E5'].includes(c.hex) ? 'text-black' : 'text-white'}`} />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Rims Picker */}
                <div>
                    <label className="text-[10px] uppercase text-audi-grey font-bold mb-2 block flex items-center gap-2">
                        Wheels <span className="h-px bg-white/20 flex-1"></span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {RIMS_OPTIONS.map(rim => (
                            <button
                                key={rim.id}
                                onClick={() => setSelectedRims(rim.id)}
                                className={`text-[9px] py-2 px-1 border rounded transition-all uppercase tracking-tight ${selectedRims === rim.id ? 'bg-white text-black border-white font-bold' : 'bg-transparent border-white/20 text-white/50 hover:border-white/50'}`}
                            >
                                {rim.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Light Signature Picker */}
                <div>
                    <label className="text-[10px] uppercase text-audi-grey font-bold mb-2 block flex items-center gap-2">
                        Light Signature <span className="h-px bg-white/20 flex-1"></span>
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {LIGHT_SIGNATURES.map(sig => (
                            <button
                                key={sig.id}
                                onClick={() => setSelectedSignature(sig.id)}
                                className={`flex flex-col items-center justify-center gap-1 text-[8px] py-2 px-1 border rounded transition-all uppercase tracking-tight ${selectedSignature === sig.id ? 'bg-audi-red text-white border-audi-red font-bold' : 'bg-transparent border-white/20 text-white/50 hover:border-white/50'}`}
                            >
                                <Lightbulb className="w-3 h-3" />
                                {sig.name.split(' ')[0]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Action */}
            <div className="mt-4 pt-2 border-t border-white/10">
                <Button onClick={handleStart} disabled={loadingAi} fullWidth variant="primary">
                    {loadingAi ? 'INITIALIZING...' : 'START ENGINE'}
                </Button>
            </div>
        </div>
    );
};