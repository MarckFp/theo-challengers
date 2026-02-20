const { test, expect } = require('@playwright/test');
const { resetAppState, completeTutorial, clickTab } = require('./utils.cjs');

test.describe('Onboarding & Profile', () => {

    test.beforeEach(async ({ page }) => {
        await resetAppState(page);
        await page.goto('/');
    });

    test('New Player Onboarding and Tutorial', async ({ page }) => {
        // 1. Landing Page
        await expect(page.locator('h1')).toContainText('Theo Challengers');
        
        // Fill nickname
        await page.getByPlaceholder('Enter your nickname').fill('TestPlayer');
        await page.getByRole('button', { name: 'Continue' }).click();

        // 2. Tutorial Modal
        await completeTutorial(page);

        // 3. Home Dashboard
        await expect(page.getByText('Welcome back, TestPlayer!')).toBeVisible();
        
        // Check Coins (starts with 2, might be 3 if weekly bonus collected)
        const coinsStat = page.locator('.stat', { hasText: 'Coins' }).locator('.stat-value');
        const coinsText = await coinsStat.innerText();
        expect(parseInt(coinsText)).toBeGreaterThanOrEqual(2);
    });

    test('Profile Reset', async ({ page }) => {
        await page.getByPlaceholder('Enter your nickname').fill('Resetter');
        await page.getByRole('button', { name: 'Continue' }).click();
        await completeTutorial(page);
        
        // Go to Profile (Tab index 4)
        await clickTab(page, 4);
        
        const resetBtn = page.getByText('Reset Data');
        await expect(resetBtn).toBeVisible();
        await resetBtn.scrollIntoViewIfNeeded();
        await resetBtn.click({ force: true });
        
        // Wait for modal animation
        await page.waitForTimeout(500);
        
        await expect(page.getByText('Danger Zone!')).toBeVisible();
        
        const deleteBtn = page.getByRole('button', { name: 'Yes, Delete Everything' });
        await deleteBtn.click();
        
        // Back to Landing
        await expect(page.locator('h1')).toContainText('Theo Challengers');
    });

});