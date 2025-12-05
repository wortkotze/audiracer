import { test, expect } from '@playwright/test';

test('full race flow', async ({ page }) => {
    await page.goto('/');

    // Login
    await page.getByPlaceholder('ENTER NAME').fill('TestDriver');
    await page.getByText('INITIALIZE').click();

    // Enter Garage
    await page.getByText('SOLO RACE').click();
    await expect(page.getByText('GARAGE')).toBeVisible();

    // Select a car (verify navigation works)
    const carName = await page.locator('h3').textContent();
    await page.getByTestId('next-car').click();
    await expect(page.locator('h3')).not.toHaveText(carName!);

    // Start Race
    await page.getByText('START ENGINE').click();

    // Wait for race to start (Canvas visible)
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });

    // Verify strategy toast appears (mocked or real API response)
    await expect(page.locator('.animate-slideUp')).toBeVisible();
});

test('multiplayer navigation', async ({ page }) => {
    await page.goto('/');

    // Login
    await page.getByPlaceholder('ENTER NAME').fill('TestDriver');
    await page.getByText('INITIALIZE').click();

    // Click Multiplayer
    await page.getByText('MULTIPLAYER').click();

    // Select Car & Start (Go to Lobby)
    await page.getByText('START ENGINE').click();

    // Verify Lobby Screen
    await expect(page.locator('input[placeholder="CODE"]')).toBeVisible();
    await expect(page.getByText(/Online Drivers/)).toBeVisible();
    await expect(page.getByText('Active Circuits')).toBeVisible();

    // Verify Host Button
    await expect(page.getByText('HOST NEW RACE')).toBeVisible();
});
