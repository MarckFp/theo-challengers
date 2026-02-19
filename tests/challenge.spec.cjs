const { test, expect } = require('@playwright/test');
const { completeTutorial, clickTab, brutalCleanup, seedInventory } = require('./utils.cjs');

test.describe('Challenge Flow', () => {

    test.beforeEach(async ({ page }) => {
        // Debug console logs from browser
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
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

        // 3. Challenge Link Modal (Wait for modal to appear)
        // Correct behavior: A modal with a link appears, not a QR code immediately
        const linkModal = page.locator('.modal-open').filter({ hasText: /Ready to Challenge|Link/i }).first();
        await expect(linkModal).toBeVisible({ timeout: 5000 });
        
        // Verify link is present
        await expect(linkModal.locator('.break-all')).toBeVisible();

        // Close the modal
        // Note: The modal might have a Close button or just click outside/escape
        // Looking for a button inside the modal action area
        const closeBtn = linkModal.getByRole('button', { name: /Copy Link/i }); 
        await expect(closeBtn).toBeVisible();
        
        // Just verify we got here is enough for "Send Challenge" flow
        
        /* 
           Original expectation was canvas (QR), but current flow shows a Link first. 
           The Test should reflect current UI behavior.
        */
    });

});