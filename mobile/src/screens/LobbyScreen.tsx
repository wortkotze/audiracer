import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Button } from '../components/Button';
import { multiplayerService, GlobalPlayerState, PlayerState } from '../services/multiplayerService';
import { EngineType, CarModel } from '../types';
import { cn } from '../utils/cn';
import { UserProfile } from '../services/authService';

interface LobbyScreenProps {
    user: UserProfile;
    selectedCar: CarModel | null;
    onStartRace: (lobbyId: string) => void;
    onBack: () => void;
    onChangeCar: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({ user, selectedCar, onStartRace, onBack, onChangeCar }) => {
    const [globalPlayers, setGlobalPlayers] = useState<GlobalPlayerState[]>([]);
    const [activeLobbyId, setActiveLobbyId] = useState("");
    const [inputLobbyId, setInputLobbyId] = useState("");
    const [roomPlayers, setRoomPlayers] = useState<PlayerState[]>([]);

    // Connect to Global
    useEffect(() => {
        multiplayerService.joinGlobalLobby(user, (players) => {
            setGlobalPlayers(players);
        });
        return () => {
            // Cleanup? Global lobby persists usually, but we could leave strict mode
        };
    }, [user]);

    // Join Room Logic
    const joinLobby = (id: string) => {
        if (!user) return;
        setActiveLobbyId(id);

        // Optimistic
        setRoomPlayers([{
            id: user.id,
            name: user.name,
            score: 0,
            distance: 0,
            lives: 3,
            isGameOver: false
        }]);

        multiplayerService.joinLobby(id, user, (updatedPlayers) => {
            setRoomPlayers(updatedPlayers);
            if (updatedPlayers.length >= 2 && updatedPlayers.find(p => p.id === user.id)) {
                multiplayerService.updateGlobalStatus('FULL', id);
            }
        });

        multiplayerService.onStartRace(() => {
            onStartRace(id);
        });
    };

    const createLobby = () => {
        const newId = Math.random().toString(36).substring(2, 7).toUpperCase();
        multiplayerService.updateGlobalStatus('HOSTING', newId, selectedCar?.type);
        joinLobby(newId);
    };

    const handleLeaveLobby = () => {
        multiplayerService.leaveLobby();
        multiplayerService.updateGlobalStatus('IDLE');
        setActiveLobbyId("");
        setRoomPlayers([]);
    };

    const handleStartHosting = () => {
        if (activeLobbyId) {
            multiplayerService.updateGlobalStatus('RACING', activeLobbyId);
            multiplayerService.startRace(activeLobbyId);
            onStartRace(activeLobbyId);
        }
    };

    if (activeLobbyId) {
        // INSIDE A ROOM
        return (
            <View className="flex-1 bg-black p-8 pt-16 items-center">
                <Text className="text-audi-grey text-xs uppercase mb-2">Lobby Code</Text>
                <Text className="text-4xl font-mono font-bold text-white mb-8 tracking-widest">{activeLobbyId}</Text>

                <View className="w-full bg-white/10 rounded-lg p-4 mb-6">
                    <Text className="text-xs text-audi-grey mb-2 uppercase">Drivers ({roomPlayers.length})</Text>
                    {roomPlayers.map(p => (
                        <View key={p.id} className="flex-row items-center gap-2 mb-2">
                            <View className={cn("w-2 h-2 rounded-full", p.id === user.id ? "bg-green-500" : "bg-audi-red")} />
                            <Text className="text-white font-bold">{p.name} {p.id === user.id ? '(YOU)' : ''}</Text>
                        </View>
                    ))}
                    {roomPlayers.length < 2 && (
                        <Text className="text-gray-500 italic text-sm mt-2">Waiting for opponent...</Text>
                    )}
                </View>

                <View className="flex-1 justify-center w-full">
                    {user.id === roomPlayers[0]?.id && (
                        <Button
                            onPress={handleStartHosting}
                            disabled={roomPlayers.length < 2}
                            className={roomPlayers.length < 2 ? "opacity-50" : ""}
                        >
                            START ENGINES
                        </Button>
                    )}
                    {user.id !== roomPlayers[0]?.id && (
                        <Text className="text-center text-white animate-pulse">Waiting for host to start...</Text>
                    )}
                </View>

                <TouchableOpacity onPress={handleLeaveLobby} className="mt-4">
                    <Text className="text-gray-500">LEAVE LOBBY</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // GLOBAL LOBBY VIEW
    const activeRaces = globalPlayers.filter(p => p.status === 'HOSTING' && p.lobbyId && p.id !== user.id);

    return (
        <View className="flex-1 bg-black p-4 pt-16">
            <Text className="text-2xl font-bold font-pixel text-white mb-8 text-center">GLOBAL LOBBY</Text>

            <View className="flex-row gap-4 mb-6 h-48">
                {/* Online Drivers */}
                <View className="flex-1 bg-white/10 rounded-lg p-3">
                    <Text className="text-xs text-audi-grey mb-2 uppercase">Online ({globalPlayers.length})</Text>
                    <ScrollView>
                        {globalPlayers.map(p => (
                            <View key={p.id} className="flex-row items-center gap-2 mb-1">
                                <View className={cn("w-2 h-2 rounded-full", p.status === 'RACING' ? 'bg-audi-red' : (p.status === 'HOSTING' ? 'bg-yellow-500' : 'bg-green-500'))} />
                                <Text className="text-white text-xs" numberOfLines={1}>{p.name}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>

                {/* Active Races */}
                <View className="flex-1 bg-white/10 rounded-lg p-3">
                    <Text className="text-xs text-audi-grey mb-2 uppercase">Active Races</Text>
                    <ScrollView>
                        {activeRaces.length === 0 ? <Text className="text-gray-500 text-xs italic">No races.</Text> : null}
                        {activeRaces.map(p => {
                            const canJoin = p.raceClass === selectedCar?.type;
                            return (
                                <TouchableOpacity
                                    key={p.lobbyId}
                                    disabled={!canJoin}
                                    onPress={() => joinLobby(p.lobbyId!)}
                                    className={cn("bg-black/40 p-2 rounded mb-2 border", canJoin ? "border-transparent" : "opacity-50 border-red-900")}
                                >
                                    <Text className="text-white text-[10px] font-bold">{p.name}'s Race</Text>
                                    <Text className={cn("text-[8px] font-bold", p.raceClass === EngineType.EV ? "text-blue-400" : "text-orange-400")}>
                                        {p.raceClass === EngineType.EV ? '⚡ EV' : '🔥 ICE'}
                                    </Text>
                                    {!canJoin && <Text className="text-[8px] text-red-500 uppercase">Class Mismatch</Text>}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>

            <View className="space-y-4">
                <View className="flex-row gap-4">
                    <Button onPress={createLobby} className="flex-1" variant="primary">HOST RACE</Button>
                    <Button onPress={onChangeCar} className="flex-1 bg-gray-700" variant="secondary">CHANGE CAR</Button>
                </View>

                <Text className="text-center text-audi-grey text-xs mt-4">OR ENTER CODE</Text>
                <View className="flex-row gap-2">
                    <TextInput
                        value={inputLobbyId}
                        onChangeText={t => setInputLobbyId(t.toUpperCase())}
                        placeholder="CODE"
                        placeholderTextColor="#666"
                        className="flex-1 bg-gray-900 border border-white/20 text-white p-3 rounded text-center font-mono uppercase"
                        maxLength={5}
                    />
                    <Button onPress={() => joinLobby(inputLobbyId)}>JOIN</Button>
                </View>

                <TouchableOpacity onPress={onBack} className="mt-4 self-center">
                    <Text className="text-gray-400 text-xs">BACK TO MENU</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};
