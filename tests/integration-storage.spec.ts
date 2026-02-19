import { test, expect } from '@playwright/test';

test.describe('Data Persistence', () => {

  test('Data Survives Reload', async ({ page }) => {
    // 1. Initial Visit & Setup
    await page.goto('/');
    await page.getByPlaceholder('Enter your nickname').fill('PersistentPlayer');
    await page.getByRole('button', { name: 'Continue' }).click();
    
    // Complete Tutorial
    const tutorialDialog = page.locator('dialog.modal-open');
    if (await tutorialDialog.isVisible()) {
        const nextBtn = tutorialDialog.getByRole('button', { name: 'Next' });
        while (await nextBtn.isVisible()) { await nextBtn.click(); }
        await tutorialDialog.getByRole('button', { name: "Let's Play!" }).click();
    }

    // 2. Perform Actions (Earn Coins)
    await page.getByText('Store').click();
    
    // Check initial coins
    const initialCoins = await page.locator('.badge-primary').first().textContent();
    // Usually '2'
    expect(initialCoins?.trim()).toBe('2');

    // 3. Reload Page
    await page.reload();

    // 4. Verify Same State
    // User should be logged in automatically (skipping Landing)
    await expect(page.getByText('Welcome back, PersistentPlayer!')).toBeVisible();
    
    // Coins should still be there
    const reloadedCoins = await page.locator('.badge-primary').first().textContent();
    expect(reloadedCoins?.trim()).toBe('2');

    // 5. Verify Tutorial doesn't show again
    // The tutorial check happens on load.
    // We expect NO tutorial modal.
    await expect(page.locator('dialog', { hasText: 'Welcome!' })).not.toBeVisible();
  });

});
