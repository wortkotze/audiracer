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

vi.mock('./services/geminiService', () => ({
    getPostRaceAnalysis: vi.fn().mockResolvedValue("Great race! You avoided many zombies.")
}));

// Mock Auth Service
vi.mock('./services/authService', () => ({
    authService: {
        getUser: vi.fn().mockReturnValue({ id: 'user1', name: 'User' }),
        login: vi.fn(),
        logout: vi.fn(),
        updateName: vi.fn()
    }
}));

// Mock Highscore Service
vi.mock('./services/highscoreService', () => ({
    highscoreService: {
        getTopScores: vi.fn().mockResolvedValue([]),
        saveScore: vi.fn().mockResolvedValue(true)
    }
}));

// Mock Multiplayer Service
const { mockJoinLobby, mockLeaveLobby, mockUpdateGlobalStatus, mockStartRace } = vi.hoisted(() => ({
    mockJoinLobby: vi.fn((id, user, cb) => {
        // Default behavior: 2 players
        cb([
            { id: 'user1', name: 'User', score: 0, distance: 0, lives: 3, isGameOver: false },
            { id: 'user2', name: 'Opponent', score: 0, distance: 0, lives: 3, isGameOver: false }
        ]);
    }),
    mockLeaveLobby: vi.fn(),
    mockUpdateGlobalStatus: vi.fn(),
    mockStartRace: vi.fn()
}));

vi.mock('./services/multiplayerService', () => ({
    multiplayerService: {
        joinLobby: mockJoinLobby,
        leaveLobby: mockLeaveLobby,
        updateGlobalStatus: mockUpdateGlobalStatus,
        startRace: mockStartRace,
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
        expect(screen.getByText('SOLO RACE')).toBeInTheDocument();
    });

    it('transitions to garage when enter button is clicked', () => {
        render(<App />);
        const enterButton = screen.getByText('SOLO RACE');
        fireEvent.click(enterButton);
        expect(screen.getByTestId('garage-component')).toBeInTheDocument();
    });

    it('transitions to racing state when race starts', async () => {
        render(<App />);
        // Navigate to Garage
        fireEvent.click(screen.getByText('SOLO RACE'));

        // Start Race
        fireEvent.click(screen.getByText('Start Race Mock'));

        // Check for GameCanvas and Strategy Toast
        expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
        expect(screen.getByText('Drive fast')).toBeInTheDocument();
    });

    it('transitions to game over state and displays stats', async () => {
        render(<App />);
        // Navigate to Garage -> Race
        fireEvent.click(screen.getByText('SOLO RACE'));
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
        fireEvent.click(screen.getByText('SOLO RACE'));
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
        mockJoinLobby.mockImplementation((id, user, cb) => {
            cb([
                { id: 'user1', name: 'User', score: 0, distance: 0, lives: 3, isGameOver: false },
                { id: 'user2', name: 'Opponent', score: 0, distance: 0, lives: 3, isGameOver: true } // Opponent already finished
            ]);
        });

        render(<App />);

        // 1. Navigate to Lobby (Enter Code)
        // The app starts at START screen. We need to go to LOBBY.
        // But wait, the current flow is: START -> LOBBY (if Multiplayer selected) or GARAGE (if Solo).
        // Actually, the "MULTIPLAYER" button on Start screen toggles the view.
        // Let's check App.tsx:
        // <Button onClick={() => setGameState('LOBBY')}>MULTIPLAYER</Button>

        // 1. Navigate to Lobby Flow
        const multiplayerBtn = screen.getByText('MULTIPLAYER');
        fireEvent.click(multiplayerBtn);

        // 2. Select Car (Mock Garage)
        fireEvent.click(screen.getByText('Start Race Mock'));

        // 3. Join Lobby
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

    it('disables "START ENGINES" button when only 1 player is in lobby', async () => {
        // OVERRIDE Mock for Single Player
        mockJoinLobby.mockImplementation((id, user, cb) => {
            cb([
                { id: 'user1', name: 'User', score: 0, distance: 0, lives: 3, isGameOver: false }
            ]);
        });

        render(<App />);

        // 1. Enter Multiplayer Mode (Goes to Garage first)
        const multiplayerBtn = screen.getByText('MULTIPLAYER');
        fireEvent.click(multiplayerBtn);

        // 2. Select Car (Mock Garage handles this via "Start Race Mock" button)
        fireEvent.click(screen.getByText('Start Race Mock'));

        // 3. Now we should be in LOBBY (Create or Join)
        // Wait, App.tsx logic: if isMultiplayer -> setGameState('LOBBY') -> checks lobbyId
        // If no lobbyId, it shows "HOST RACE" or "ENTER CODE".
        // We need to click "HOST RACE" or Join properly.

        // Let's verify what LOBBY shows initially.
        // It shows "HOST RACE" or "ENTER CODE MANUALLY".
        expect(screen.getByText('HOST RACE')).toBeInTheDocument();

        // 4. Create Lobby (Host)
        fireEvent.click(screen.getByText('HOST RACE'));

        // Now wait for Lobby ID screen where "START ENGINES" would be.
        // App.tsx calls createLobby -> calls wrapper -> sets lobbyId -> UI updates to "LOBBY CODE" screen.

        await waitFor(() => {
            // Button should be present but disabled
            const btn = screen.getByText('START ENGINES');
            expect(btn).toBeInTheDocument();
            expect(btn).toBeDisabled();
        });

        // Verify "Waiting" message
        expect(screen.getByText('Waiting for opponent...')).toBeInTheDocument();
    });
});
