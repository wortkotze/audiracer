import { supabase } from './supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface PlayerState {
    id: string;
    name: string;
    score: number;
    distance: number;
    lives: number;
    isGameOver: boolean;
}

export interface GlobalPlayerState {
    id: string;
    name: string;
    status: 'IDLE' | 'HOSTING' | 'RACING' | 'FULL';
    lobbyId?: string;
    raceClass?: 'ICE' | 'EV';
    onlineAt: string;
}

class MultiplayerService {
    private channel: RealtimeChannel | null = null;
    private globalChannel: RealtimeChannel | null = null;
    private onPlayersUpdate: ((players: PlayerState[]) => void) | null = null;
    private currentUser: { id: string; name: string } | null = null;
    private onGlobalPlayersUpdate: ((players: GlobalPlayerState[]) => void) | null = null;

    private DEBUG_MODE = __DEV__;

    public joinGlobalLobby(
        user: { id: string; name: string },
        onUpdate: (players: GlobalPlayerState[]) => void
    ) {
        this.onGlobalPlayersUpdate = onUpdate;
        if (this.globalChannel) return;
        this.currentUser = user;

        this.globalChannel = supabase.channel('global-lobby', {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        this.globalChannel
            .on('presence', { event: 'sync' }, () => {
                const state = this.globalChannel?.presenceState();
                const players: GlobalPlayerState[] = [];
                if (state) {
                    Object.keys(state).forEach(key => {
                        const p = state[key][0] as any;
                        players.push({
                            id: p.user_id,
                            name: p.name,
                            status: p.status || 'IDLE',
                            lobbyId: p.lobbyId,
                            raceClass: p.raceClass,
                            onlineAt: p.online_at
                        });
                    });
                }
                this.onGlobalPlayersUpdate?.(players);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.updateGlobalStatus('IDLE');
                }
            });
    }

    public async updateGlobalStatus(status: 'IDLE' | 'HOSTING' | 'RACING' | 'FULL', lobbyId?: string, raceClass?: 'ICE' | 'EV') {
        if (this.globalChannel && this.currentUser) {
            await this.globalChannel.track({
                user_id: this.currentUser.id,
                name: this.currentUser.name,
                status,
                lobbyId,
                raceClass,
                online_at: new Date().toISOString(),
            });
        }
    }

    public startRace(lobbyId: string) {
        if (this.channel) {
            this.channel.send({
                type: 'broadcast',
                event: 'start_race',
                payload: {}
            });
        }
    }

    public restartRace(lobbyId: string) {
        if (this.channel) {
            this.channel.send({
                type: 'broadcast',
                event: 'restart_race',
                payload: {}
            });
        }
    }

    public onStartRace(callback: () => void) {
        if (this.channel) {
            this.channel.on('broadcast', { event: 'start_race' }, () => {
                console.log('Race Start Signal Received!');
                callback();
            });
        }
    }

    public onRestartRace(callback: () => void) {
        if (this.channel) {
            this.channel.on('broadcast', { event: 'restart_race' }, () => {
                console.log('Race Restart Signal Received!');
                callback();
            });
        }
    }
    private playerId: string | null = null;

    constructor() { }

    public joinLobby(lobbyId: string, player: { id: string, name: string }, onUpdate: (players: PlayerState[]) => void) {
        this.playerId = player.id;
        this.onPlayersUpdate = onUpdate;

        if (this.channel) this.leaveLobby();

        this.channel = supabase.channel(`room:${lobbyId}`, {
            config: {
                presence: {
                    key: player.id,
                },
                broadcast: { self: false }
            }
        });

        let currentPlayers: PlayerState[] = [];

        this.channel
            .on('broadcast', { event: 'player_update' }, (payload) => {
                if (this.DEBUG_MODE) console.log('RX Broadcast:', payload);
                const update = payload.payload as PlayerState;
                const idx = currentPlayers.findIndex(p => p.id === update.id);
                if (idx !== -1) {
                    currentPlayers[idx] = { ...currentPlayers[idx], ...update };
                } else {
                    currentPlayers.push(update);
                }
                this.onPlayersUpdate?.([...currentPlayers]);
            })
            .on('presence', { event: 'sync' }, () => {
                const newState = this.channel?.presenceState();
                if (this.DEBUG_MODE) console.log('Presence Sync:', newState);
                const presencePlayers: PlayerState[] = [];

                if (newState) {
                    Object.keys(newState).forEach(key => {
                        const p = newState[key][0] as any;
                        const existing = currentPlayers.find(cp => cp.id === p.user_id);

                        presencePlayers.push({
                            id: p.user_id,
                            name: p.name,
                            score: existing ? existing.score : (p.score || 0),
                            distance: existing ? existing.distance : (p.distance || 0),
                            lives: existing ? existing.lives : (p.lives ?? 3),
                            isGameOver: existing ? existing.isGameOver : (p.isGameOver || false)
                        });
                    });
                }
                currentPlayers = presencePlayers;
                this.onPlayersUpdate?.([...currentPlayers]);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.channel?.track({
                        user_id: player.id,
                        name: player.name,
                        online_at: new Date().toISOString()
                    });
                }
            });
    }

    public async broadcastState(state: PlayerState) {
        if (!this.channel) return;
        await this.channel.send({
            type: 'broadcast',
            event: 'player_update',
            payload: state
        });
    }

    public leaveLobby() {
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }
}

export const multiplayerService = new MultiplayerService();
