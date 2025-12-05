import { test, expect } from '@playwright/test';

test.describe('Lobby Mechanics', () => {
    test('should show online players', async ({ page }) => {
        await page.goto('/');

        // Login
        await page.getByPlaceholder('ENTER NAME').fill('TestDriver');
        await page.getByText('INITIALIZE').click();

        await page.getByText('MULTIPLAYER').click();

        // Select Car & Start (Go to Lobby)
        await page.getByText('START ENGINE').click();

        // Verify initial state
        await expect(page.getByText(/Online Drivers/)).toBeVisible();

        // Since we can't easily mock WebSocket/Supabase from Playwright without complex network interception,
        // we will verify the UI structure exists.
        // A true "mocked" test would require injecting a mock service into the window object.

        // For regression, verifying the UI elements are present is a good baseline.
        await expect(page.locator('input[placeholder="CODE"]')).toBeVisible();
        await expect(page.getByText('Active Circuits')).toBeVisible();
    });
});
