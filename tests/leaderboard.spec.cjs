const { test, expect } = require('@playwright/test');
const { completeTutorial, clickTab, brutalCleanup } = require('./utils.cjs');

test.describe('Leaderboard', () => {

    test.beforeEach(async ({ page }) => {
        // Debug console logs from browser
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
        await page.goto('/');
    });

    test('Leaderboard Visibility', async ({ page }) => {
        await page.getByPlaceholder('Enter your nickname').fill('Champ');
        await page.getByRole('button', { name: 'Continue' }).click();

        await completeTutorial(page);
        
        await page.waitForTimeout(500); 

        // 1. Go to Leaderboard (Tab index 4)
        await clickTab(page, 4);
        
        // Debugging: Wait a bit for transition
        await page.waitForTimeout(1000);
        
        // Ensure "Leaderboard" text is visible on the page
        await expect(page.getByText('Leaderboard').first()).toBeVisible();

        // 2. Mock Data
        // Since we can't control the cloud backend in these local tests, we'll verify the component structure
        // If there are entries, they should appear as list items
        
        // Verify loading state or list
        const list = page.locator('ul');
        await expect(list).toBeVisible(); 
        
        // Check if user's own entry is highlighted or present (if cloud sync enabled/mocked)
        // For basic flow, just ensuring the tab loads without error is sufficient.
    });

});