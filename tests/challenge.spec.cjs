const { test, expect } = require('@playwright/test');
const { resetAppState, completeTutorial, clickTab, brutalCleanup, seedInventory } = require('./utils.cjs');

test.describe('Challenge Flow', () => {

    test.beforeEach(async ({ page }) => {
        // Debug console logs from browser
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
        await resetAppState(page);
        await page.goto('/');
    });

    test('Send Challenge', async ({ page }) => {
        await page.getByPlaceholder('Enter your nickname').fill('Hero');
        await page.getByRole('button', { name: 'Continue' }).click();

        await completeTutorial(page);
        
        await page.waitForTimeout(500); 

        // Seed Inventory
        await seedInventory(page);
        
        // wait for transaction to commit safely
        await page.waitForTimeout(500);
        
        await page.reload();
        await page.waitForTimeout(1000); // Wait for hydration
        await brutalCleanup(page);
        
        // Go to Inventory (Tab index 3)
        await clickTab(page, 3);
        
        // Check if item is present
        const invItem = page.locator('.card.card-side').first();
        await expect(invItem).toBeVisible({ timeout: 10000 });
        
        // Use dispatchEvent because standard click sometimes fails on Svelte components with overlay issues
        await invItem.evaluate(node => node.dispatchEvent(new Event('click', { bubbles: true })));
        
        // Wait for View Modal
        const viewModal = page.locator('dialog[open]').filter({ hasText: /Challenge/i }).first(); 
        await expect(viewModal).toBeVisible({ timeout: 5000 });
        
        // Send Challenge
        // The button text might be "Challenge!" (fallback) or localized
        await viewModal.getByRole('button', { name: /Challenge/i }).click();

          // 3. Challenge share modal (current behavior uses share actions)
        const createLinkBtn = page.getByRole('button', { name: /Create Challenge Link/i });
        await expect(createLinkBtn).toBeVisible({ timeout: 5000 });
        await createLinkBtn.click();

        await expect(page.getByRole('button', { name: /Show QR/i })).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('button', { name: /Share via App/i })).toBeVisible({ timeout: 5000 });
    });

});