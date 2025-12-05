import { test, expect } from '@playwright/test';

test('game over and restart flow', async ({ page }) => {
    test.setTimeout(60000); // Allow up to 60s for the fuel to run out

    // 1. Start the app
    await page.goto('/');

    // 2. Enter Garage
    await page.getByText('ENTER GARAGE').click();
    await expect(page.getByText('GARAGE')).toBeVisible();

    // 3. Start Race
    await page.getByText('START ENGINE').click();
    await expect(page.locator('canvas')).toBeVisible();

    // 4. Drive and wait for Crash (or Fuel empty, but crash is faster)
    // We must press ArrowUp to accelerate, otherwise speed is 0 and nothing spawns.
    await page.keyboard.down('ArrowUp');

    // Wait for Game Over. 
    // Spawning starts after 2s. 
    // Speed needs to be > 20.
    // With ArrowUp, we reach speed > 20 quickly.
    // Spawn chance is low but should happen within 30s.
    await expect(page.getByText('GAME OVER')).toBeVisible({ timeout: 45000 });

    // Release key
    await page.keyboard.up('ArrowUp');

    // 5. Verify Game Over stats
    await expect(page.getByText('Distance')).toBeVisible();
    await expect(page.getByText('Vehicle')).toBeVisible();

    // 6. Click Race Again
    await page.getByText('RACE AGAIN').click();

    // 7. Verify back in Garage
    await expect(page.getByText('GARAGE')).toBeVisible();
    await expect(page.locator('canvas')).not.toBeVisible();
});
