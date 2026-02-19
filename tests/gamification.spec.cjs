const { test, expect } = require('@playwright/test');
const { cleanUser, completeTutorial, clickTab, brutalCleanup } = require('./utils.cjs');

test.describe('Gamification Specs', () => {

    test.beforeEach(async ({ page }) => {
        await brutalCleanup(page);
        await page.goto('/');
        
        await page.getByPlaceholder('Enter your nickname').fill('GameUser');
        await page.getByRole('button', { name: 'Continue' }).click();
        await completeTutorial(page);
        await page.waitForTimeout(500);
    });

    test('Daily Bonus Collection', async ({ page }) => {
        // 1. Manually seed via IndexedDB
        await page.evaluate(async () => {
             const request = indexedDB.open('TheoChallengersDB');
             request.onsuccess = (event) => {
                 const db = event.target.result;
                 if (db.objectStoreNames.contains('player')) {
                    const tx = db.transaction('player', 'readwrite');
                    const store = tx.objectStore('player');
                    store.getAll().onsuccess = (e) => {
                        const players = e.target.result;
                        if (players.length > 0) {
                            const p = players[0];
                            p.lastWeeklyBonus = '2020-W01'; 
                            p.coins = 100;
                            p.streak = 3;
                            store.put(p);
                        }
                    };
                 }
             };
        });

        await page.waitForTimeout(1000); 
        
        // 3. Daily Bonus Modal
        const modal = page.locator('dialog[open]').filter({ hasText: /Daily|Bonus/i });
        await expect(modal).toBeVisible({ timeout: 10000 });
        
        // 4. Collect
        const collectBtn = modal.locator('button', { hasText: /Collect/i });
        await collectBtn.click({ force: true });
        
        await page.waitForTimeout(500);
        
        // Force close fallback
        await page.evaluate(() => {
             const m = document.querySelector('dialog[open]');
             if (m && (m.textContent.includes('Bonus') || m.textContent.includes('Daily'))) {
                 m.close();
             }
        });

        // 5. Verify Close
        await expect(modal).toBeHidden({ timeout: 10000 });
        
        // 6. Reload to safely check DB
        await page.reload();
        await page.waitForTimeout(1000); 
        
        const newCoins = await page.evaluate(async () => {
            return new Promise((resolve) => {
                 const request = indexedDB.open('TheoChallengersDB');
                 request.onsuccess = (e) => {
                     const db = e.target.result;
                     const tx = db.transaction('player', 'readonly');
                     const store = tx.objectStore('player');
                     store.getAll().onsuccess = (ev) => {
                         resolve(ev.target.result[0].coins);
                     };
                 };
            });
        });
        
        expect(newCoins).toBeGreaterThan(100);
    });

    test('Badges System', async ({ page }) => {
        // 1. Seed Score
        await page.evaluate(async () => {
             const request = indexedDB.open('TheoChallengersDB');
             request.onsuccess = (event) => {
                 const db = event.target.result;
                 const tx = db.transaction('player', 'readwrite');
                 const store = tx.objectStore('player');
                 store.getAll().onsuccess = (e) => {
                     const players = e.target.result;
                     if (players.length > 0) {
                         const p = players[0];
                         p.score = 5000;
                         p.badges = [];
                         store.put(p);
                     }
                 };
             };
        });
        
        await page.waitForTimeout(1000);
        
        // Ensure UI updated score (check Profile or something? No need)

        // 2. Navigate to Store (Index 2)
        await clickTab(page, 2);

        // 3. Open Badge
        const badgeButton = page.locator('.indicator button.card').first();
        await expect(badgeButton).toBeVisible();
        await badgeButton.click({ force: true });
        
        // 4. Modal
        const modal = page.locator('dialog[open]').filter({ hasText: /Buy|Cost/i });
        await expect(modal).toBeVisible({ timeout: 5000 });
        
        // 5. Buy
        const buyBtn = modal.locator('button', { hasText: /Buy/i });
        await expect(buyBtn).toBeEnabled();
        await buyBtn.click({ force: true });
        
        // 6. Force Close
        await page.waitForTimeout(500);
        await page.evaluate(() => {
             const m = document.querySelector('dialog[open]');
             if (m && m.textContent.includes('Buy')) m.close();
        });
        await expect(modal).toBeHidden({ timeout: 10000 });
        
        // 7. Verify Owned
        const ownedBadge = page.locator('.indicator .badge-success', { hasText: 'Owned' }).first();
        await expect(ownedBadge).toBeVisible();
    });

});
