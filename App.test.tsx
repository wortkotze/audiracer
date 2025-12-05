import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { CarModel, PlayerConfig, GameOverStats, EngineType } from './types';

// Mock child components to avoid complex rendering and dependencies
vi.mock('./components/Garage', () => ({
    Garage: ({ onStartRace }: { onStartRace: (car: CarModel, config: PlayerConfig, strategy: string) => void }) => (
        <div data-testid="garage-component">
            <button onClick={() => onStartRace(
                {
                    id: 'car1',
                    name: 'Test Car',
                    type: EngineType.ICE,
                    stats: { speed: 10, accel: 10, handling: 10 },
                    baseColor: 'red',
                    description: 'A fast car'
                } as CarModel,
                { carId: 'car1', color: 'red', rims: 'basic', lightSignature: 'standard' },
                "Drive fast"
            )}>
                Start Race Mock
            </button>
        </div>
    )
}));

vi.mock('./components/GameCanvas', () => ({
    GameCanvas: ({ onGameOver }: { onGameOver: (stats: GameOverStats) => void }) => (
        <div data-testid="game-canvas">
            <button onClick={() => onGameOver({ score: 1000, distance: 500, reason: 'CRASH' })}>
                Trigger Game Over
            </button>
        </div>
    )
}));

// Mock Gemini Service
vi.mock('./services/geminiService', () => ({
    getPostRaceAnalysis: vi.fn().mockResolvedValue("Great race! You avoided many zombies.")
}));

// Mock Multiplayer Service
const { mockJoinLobby, mockLeaveLobby, mockUpdateGlobalStatus } = vi.hoisted(() => ({
    mockJoinLobby: vi.fn(),
    mockLeaveLobby: vi.fn(),
    mockUpdateGlobalStatus: vi.fn()
}));

vi.mock('./services/multiplayerService', () => ({
    multiplayerService: {
        joinLobby: (id: string, user: any, cb: any) => {
            mockJoinLobby(id, user, cb);
            // Simulate successful join with opponent
            cb([
                { id: 'user1', name: 'User', score: 0, distance: 0, lives: 3, isGameOver: false },
                { id: 'user2', name: 'Opponent', score: 0, distance: 0, lives: 3, isGameOver: false }
            ]);
        },
        leaveLobby: mockLeaveLobby,
        updateGlobalStatus: mockUpdateGlobalStatus,
        onStartRace: vi.fn(),
        onRestartRace: vi.fn(),
        joinGlobalLobby: vi.fn(),
        broadcastState: vi.fn()
    }
}));

describe('App Component', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        window.localStorage.clear();
        vi.clearAllMocks();

        // Mock user in localStorage to match host in multiplayer mock
        const mockUser = { id: 'user1', name: 'User' };
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
            if (key === 'audiracer-user') return JSON.stringify(mockUser);
            return null;
        });
    });

    it('renders the start screen initially', () => {
        render(<App />);
        expect(screen.getByText('RETRO RACER')).toBeInTheDocument();
        expect(screen.getByText('ENTER GARAGE')).toBeInTheDocument();
    });

    it('transitions to garage when enter button is clicked', () => {
        render(<App />);
        const enterButton = screen.getByText('ENTER GARAGE');
        fireEvent.click(enterButton);
        expect(screen.getByTestId('garage-component')).toBeInTheDocument();
    });

    it('transitions to racing state when race starts', async () => {
        render(<App />);
        // Navigate to Garage
        fireEvent.click(screen.getByText('ENTER GARAGE'));

        // Start Race
        fireEvent.click(screen.getByText('Start Race Mock'));

        // Check for GameCanvas and Strategy Toast
        expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
        expect(screen.getByText('Drive fast')).toBeInTheDocument();
    });

    it('transitions to game over state and displays stats', async () => {
        render(<App />);
        // Navigate to Garage -> Race
        fireEvent.click(screen.getByText('ENTER GARAGE'));
        fireEvent.click(screen.getByText('Start Race Mock'));

        // Trigger Game Over
        fireEvent.click(screen.getByText('Trigger Game Over'));

        // Check Game Over Screen
        await waitFor(() => {
            expect(screen.getByText('GAME OVER')).toBeInTheDocument();
        });
        const scores = screen.getAllByText('1000');
        expect(scores.length).toBeGreaterThan(0); // Score appears in main display and high score list
        expect(screen.getByText('500m')).toBeInTheDocument(); // Distance
        expect(screen.getAllByText('Test Car').length).toBeGreaterThan(0); // Vehicle Name
    });

    it('resets to garage when race again is clicked', async () => {
        render(<App />);
        // Go to Game Over
        fireEvent.click(screen.getByText('ENTER GARAGE'));
        fireEvent.click(screen.getByText('Start Race Mock'));
        fireEvent.click(screen.getByText('Trigger Game Over'));

        // Wait for Game Over screen
        await waitFor(() => {
            expect(screen.getByText('RACE AGAIN')).toBeInTheDocument();
        });

        // Click Race Again
        fireEvent.click(screen.getByText('RACE AGAIN'));

        // Should be back in Garage
        expect(screen.getByTestId('garage-component')).toBeInTheDocument();
    });

    it('displays REMATCH and LOBBY buttons in multiplayer game over', async () => {
        render(<App />);

        // 1. Navigate to Lobby (Enter Code)
        // The app starts at START screen. We need to go to LOBBY.
        // But wait, the current flow is: START -> LOBBY (if Multiplayer selected) or GARAGE (if Solo).
        // Actually, the "MULTIPLAYER" button on Start screen toggles the view.
        // Let's check App.tsx:
        // <Button onClick={() => setGameState('LOBBY')}>MULTIPLAYER</Button>

        const multiplayerBtn = screen.getByText('MULTIPLAYER');
        fireEvent.click(multiplayerBtn);

        // 2. Join Lobby
        const input = screen.getByPlaceholderText('CODE');
        fireEvent.change(input, { target: { value: 'TEST' } });
        fireEvent.click(screen.getByText('JOIN'));

        // 3. Start Race (Host)
        // Wait for "START ENGINES" button to appear (simulated by mock callback)
        await waitFor(() => {
            expect(screen.getByText('START ENGINES')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText('START ENGINES'));

        // 4. Trigger Game Over
        // We need to wait for countdown to finish or manually trigger game over via mock
        // The mock GameCanvas has a button "Trigger Game Over"
        // Wait for GameCanvas to appear
        await waitFor(() => {
            expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Trigger Game Over'));

        // 5. Verify Buttons
        await waitFor(() => {
            expect(screen.getByText('REMATCH')).toBeInTheDocument();
            expect(screen.getByText('LOBBY')).toBeInTheDocument();
        });
    });
});
