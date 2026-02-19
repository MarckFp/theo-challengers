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

    test('Weekly Bonus Collection', async ({ page }) => {
        // 1. Manually seed via IndexedDB with correct DB name
        await page.evaluate(async () => {
             return new Promise((resolve, reject) => {
                 const request = indexedDB.open('theochallenguers');
                 request.onerror = () => reject(request.error); 
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
                                p.tutorialSeen = true; // explicitly set seen
                                store.put(p);
                            }
                        };
                        tx.oncomplete = () => resolve();
                     } else {
                        resolve();
                     }
                 };
             });
        });

        // 2. Reload to ensure app state picks up the DB change
        await page.reload();
        await page.waitForTimeout(2000); 
        
        // 3. Weekly Bonus Modal
        // The modal should open automatically on load
        const modal = page.locator('dialog[open]').filter({ hasText: /Weekly Bonus|Daily|Bonus/i });
        await expect(modal).toBeVisible({ timeout: 15000 });
        
        // 4. Collect
        const collectBtn = modal.locator('button', { hasText: /Collect/i });
        // Wait for button to be stable
        await expect(collectBtn).toBeEnabled();
        await collectBtn.click({ force: true });
        
        // Wait for DB write - reload page to ensure consistency
        await page.waitForTimeout(1000);
        await page.reload();
        await page.waitForTimeout(1000);
        
        // 6. Verify Coins in DB
        // Ensure page is stable
        await page.waitForLoadState('networkidle');
        const newCoins = await page.evaluate(async () => {
            return new Promise((resolve) => {
                 const request = indexedDB.open('theochallenguers'); // Correct DB name
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
             return new Promise((resolve, reject) => {
                 const request = indexedDB.open('theochallenguers'); // Correct DB name
                 request.onerror = () => reject(request.error);
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
                             p.tutorialSeen = true; // explicitly set seen
                             // Prevent bonus modal from appearing
                             p.lastWeeklyBonus = '2099-W01'; 
                             store.put(p);
                         }
                     };
                     tx.oncomplete = () => resolve();
                 };
             });
        });
        
        // Reload to ensure state is fresh
        await page.reload();
        await page.waitForTimeout(2000);

        // Force close any unexpected modals (like Tutorial or Bonus) that might block clicks
        await page.evaluate(() => {
            document.querySelectorAll('dialog[open]').forEach(d => d.close());
            document.querySelectorAll('.modal-open').forEach(m => m.classList.remove('modal-open'));
        });
        
        // 2. Navigate to Store (Index 2)
        await clickTab(page, 2);

        // 3. Switch to Badges Sub-Tab
        // We need to click the "Badges" tab. 
        // Based on I18N, it's "Badges Store".
        const badgesTab = page.getByRole('button', { name: /Badges/i });
        await expect(badgesTab).toBeVisible();
        await badgesTab.click();
        await page.waitForTimeout(500); // Animation

        // 4. Open Badge
        // Click the first card in the grid (Badges grid)
        await expect(page.locator('.indicator').first()).toBeVisible();
        const badgeButton = page.locator('.indicator button.card').first();
        await expect(badgeButton).toBeVisible();
        await badgeButton.click({ force: true });
        
        // 5. Modal
        // Wait for modal expecting "Buy" or similar
        const modal = page.locator('.modal.modal-open');
        await expect(modal).toBeVisible({ timeout: 5000 });
        // Badges buy button usually just "Unlock" or has price?
        // Let's look for any primary button.
        const buyBtn = modal.locator('button.btn-secondary', { hasText: /Buy|Unlock|Cost/i });
        await expect(buyBtn).toBeVisible();
        await buyBtn.click({ force: true });
        
        // 6. Force Close if needed
        await page.waitForTimeout(500);
        await page.evaluate(() => {
             const m = document.querySelector('.modal-open');
             if (m) m.classList.remove('modal-open');
        });
        
        // 7. Verify Owned
        // The badge should now have "Owned" indicator
        const ownedBadge = page.locator('.indicator .badge-success', { hasText: /Owned/i }).first();
        await expect(ownedBadge).toBeVisible();
    });

});
