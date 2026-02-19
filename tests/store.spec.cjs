const { test, expect } = require('@playwright/test');
const { completeTutorial, clickTab, brutalCleanup, seedCoins } = require('./utils.cjs');

test.describe('Store & Inventory', () => {

    test.beforeEach(async ({ page }) => {
        // Debug console logs from browser
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
        await page.goto('/');
    });

    test('Store Purchase and Inventory Management', async ({ page }) => {
        // Setup
        await page.getByPlaceholder('Enter your nickname').fill('Shopper');
        await page.getByRole('button', { name: 'Continue' }).click();

        await completeTutorial(page);
        
        // Inject Coins safely (wait for network idle or stable state)
        await page.waitForTimeout(500); 

        // Additional sanity check
        await brutalCleanup(page);

        // Seed Coins
        await seedCoins(page, 100);
        
        // wait for transaction to commit safely
        await page.waitForTimeout(500);
        
        await page.reload();
        await page.waitForTimeout(1000); // Wait for hydration
        await brutalCleanup(page);
        
        // Go to Store (Tab index 2)
        await clickTab(page, 2);
        
        // Debugging: Wait a bit for transition
        await page.waitForTimeout(500);

        await expect(page.getByText('Daily Shop')).toBeVisible();

        // Buy an item
        const firstItemCard = page.locator('.indicator .card').first();
        await expect(firstItemCard).toBeVisible();
        
        // Use dispatchEvent to bypass potential overlay blocking click interpretation
        console.log("Dispatching click to item card...");
        await firstItemCard.dispatchEvent('click'); 
        
        // Wait for item details modal to appear
        const modalBox = page.locator('.modal-box').filter({ hasText: /Buy|Need|Full|Sold/i }).first();
        
        // Check if modal appeared, if not retry with force click
        try {
            await expect(modalBox).toBeVisible({ timeout: 2000 });
        } catch {
            console.log("Modal did not appear, attempting force click...");
            await firstItemCard.click({ force: true });
            await expect(modalBox).toBeVisible({ timeout: 5000 });
        }

        const actionButton = modalBox.getByRole('button', { name: /Buy|Need|Full|Sold/i, includeHidden: true }).first();
        
        // Setup dialog listener before action
        page.once('dialog', async dialog => {
            console.log(`Alert appeared during purchase: ${dialog.message()}`);
            await dialog.dismiss(); 
        });

        // Use dispatchEvent for robust Svelte click
        await actionButton.evaluate(node => node.dispatchEvent(new Event('click', { bubbles: true })));
        
        // Allow time for purchase DB transaction
        await page.waitForTimeout(1000);
        
        // Force reload to ensure DB state is fetched fresh (handles liveQuery lag)
        await page.reload();
        await page.waitForTimeout(1000); // Wait for hydration
        
        await brutalCleanup(page);
        
        // Go to Inventory (Tab index 3)
        await clickTab(page, 3);
        
        // Check if we have an item
        const invItem = page.locator('.card.card-side').first();
        await expect(invItem).toBeVisible({ timeout: 10000 });

        // 4. Clean up: Delete item (to keep state clean)
        // Try to find the Remove button directly on the card to skip the View Modal
        const cardRemoveBtn = invItem.locator('button', { hasText: /Remove/i });
        
        // Use dispatchEvent because standard click sometimes fails on Svelte components with overlay issues
        await invItem.evaluate(node => node.dispatchEvent(new Event('click', { bubbles: true })));
        
        // Wait for EITHER the View Modal OR the Delete Confirmation Modal
        const viewModal = page.locator('dialog[open]').filter({ hasText: /Challenge/i }).first(); 
        
        // Retry opening if not visible
        try {
            await expect(viewModal).toBeVisible({ timeout: 2000 });
        } catch (e) {
            console.log("View modal did not open, retrying with force click...");
            await invItem.click({ force: true });
            await expect(viewModal).toBeVisible({ timeout: 5000 });
        }
        
        // Click Remove in View Modal
        await viewModal.getByRole('button', { name: /Remove/i }).click();

        // Now handle the Delete Confirmation Modal
        const deleteModal = page.locator('dialog[open]').filter({ hasText: /Remove/i }).last();
        await expect(deleteModal).toBeVisible({ timeout: 5000 });
        
        const confirmRemove = deleteModal.getByRole('button', { name: /Remove|Confirm/i }).last();
        await confirmRemove.click();
        
        // Check for empty state
        await expect(page.getByText('Empty Inventory', { exact: false })).toBeVisible();
    });

});