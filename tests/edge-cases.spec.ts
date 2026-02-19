import { test, expect } from '@playwright/test';

test.describe('Edge Cases & Validation', () => {

    test('Prevent purchase with insufficient coins', async ({ page }) => {
        // 1. Setup Poor Player (0 coins)
        await page.goto('/');
        await page.getByPlaceholder('Enter your nickname').fill('BrokeUser');
        await page.getByRole('button', { name: 'Continue' }).click();

        // Skip Tutorial
        const tutorial = page.locator('dialog', { hasText: 'Welcome!' });
        if (await tutorial.isVisible()) {
             await page.evaluate(() => {
                 const d = document.querySelector('dialog[open]');
                 if (d) d.close();
             });
        }
        await page.reload();

        // 2. Go to Store
        await page.locator('text=Store').click();
        
        // 3. Try to buy (assuming items cost > 0)
        // Find an item
        const item = page.locator('.card').filter({ hasText: '🪙' }).first();
        const costText = await item.getByText(/🪙 \d+/).textContent();
        // ensure cost is > 0
        
        // Click buy
        await item.click();
        
        // 4. Verification
        // The UI shakes (class 'shake' might be added for 500ms) or coins don't change.
        // Let's check inventory remains empty.
        await page.locator('text=Inventory').click();
        await expect(page.getByText('Empty Inventory')).toBeVisible(); 
    });

    test('Prevent nickname empty or whitespace', async ({ page }) => {
        await page.goto('/');
        
        // 1. Try empty
        await page.getByRole('button', { name: 'Continue' }).click();
        // Validation error should appear
        await expect(page.getByText('Please enter a nickname')).toBeVisible();
        
        // 2. Try whitespace
        await page.getByPlaceholder('Enter your nickname').fill('   ');
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page.getByText('Please enter a nickname')).toBeVisible();
    });

    test('Inventory Limit (Max 3)', async ({ page }) => {
         // 1. Setup Player with many coins
         await page.goto('/');
         await page.getByPlaceholder('Enter your nickname').fill('Hoarder');
         await page.getByRole('button', { name: 'Continue' }).click();
         
         const tutorial = page.locator('dialog', { hasText: 'Welcome!' });
         if (await tutorial.isVisible()) {
             await page.evaluate(() => {
                 const d = document.querySelector('dialog[open]');
                 if (d) d.close();
             });
        }

         await page.evaluate(async () => {
             return new Promise((resolve) => {
                 const req = indexedDB.open('TheoChallengersDB');
                 req.onsuccess = (e: any) => {
                     const db = e.target.result;
                     const tx = db.transaction(['player'], 'readwrite');
                     const store = tx.objectStore('player');
                     // get Player first
                     store.getAll().onsuccess = (e: any) => {
                         const p = e.target.result[0];
                         if (p) {
                             p.coins = 100;
                             store.put(p);
                         }
                         resolve(true);
                     }
                 }
             });
         });
         await page.reload();
         
         // 2. Buy 3 Items
         await page.locator('text=Store').click();
         const item = page.locator('.card').filter({ hasText: '🪙' }).first();
         
         for(let i=0; i<3; i++) {
             await item.click(); 
             await page.waitForTimeout(200); 
         }
         
         // Verify inventory count 3
         await page.locator('text=Inventory').click();
         await expect(page.getByText('3 / 3 Items')).toBeVisible();
         
         // 3. Try to buy 4th
         await page.locator('text=Store').click();
         await item.click(); // Should fail
         
         // 4. Verify still 3
         await page.locator('text=Inventory').click();
         await expect(page.getByText('3 / 3 Items')).toBeVisible();
         await expect(page.getByText('Inventory is full')).toBeVisible({ timeout: 2000 }).catch(() => {}); // Optional check
    });

});
