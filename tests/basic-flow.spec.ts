import { test, expect } from '@playwright/test';

test.describe('Basic User Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure fresh state
    await page.goto('/');
  });

  // Helper to get past tutorial
  async function completeTutorial(page: any) {
    const tutorialDialog = page.locator('dialog.modal-open');
    if (await tutorialDialog.isVisible()) {
        const nextBtn = tutorialDialog.getByRole('button', { name: 'Next' });
        while (await nextBtn.isVisible()) {
            await nextBtn.click();
        }
        const finishBtn = tutorialDialog.getByRole('button', { name: "Let's Play!" });
        if (await finishBtn.isVisible()) {
            await finishBtn.click();
        }
    }
  }

  test('New Player Onboarding and Tutorial', async ({ page }) => {
    // 1. Landing Page
    await expect(page.locator('h1')).toContainText('Theo Challengers');
    
    // Fill form
    await page.getByPlaceholder('Enter your nickname').fill('TestPlayer');
    await page.getByRole('button', { name: 'Continue' }).click();

    // 2. Tutorial Modal
    // It should appear automatically for new players
    const tutorialDialog = page.locator('.modal-box', { hasText: 'Welcome!' });
    await expect(tutorialDialog).toBeVisible();

    // Click Next through tutorial steps
    const nextBtn = page.getByRole('button', { name: 'Next' });
    
    // Expect multiple clicks
    await nextBtn.click(); // 1
    await nextBtn.click(); // 2
    await nextBtn.click(); // 3
    await nextBtn.click(); // 4
    await nextBtn.click(); // 5 - last one before finish

    const finishBtn = page.getByRole('button', { name: "Let's Play!" });
    await expect(finishBtn).toBeVisible();
    await finishBtn.click();

    // 3. Home Dashboard
    await expect(page.getByText('Welcome back, TestPlayer!')).toBeVisible();
    
    // Check Coins (starts with 2)
    // The badge is usually close to the user name or top right
    const coinsBadge = page.locator('.badge', { hasText: '2' }).first(); 
    await expect(coinsBadge).toBeVisible();
  });

  test('Store Purchase and Inventory Management', async ({ page }) => {
    
    await page.getByPlaceholder('Enter your nickname').fill('Shopper');
    await page.getByRole('button', { name: 'Continue' }).click();

    await completeTutorial(page);

    // Inject Coins to ensure purchase capability
    await page.evaluate(async () => {
         return new Promise((resolve, reject) => {
            const req = indexedDB.open('TheoChallengersDB');
            req.onsuccess = (e: any) => {
                const db = e.target.result;
                const tx = db.transaction(['player'], 'readwrite');
                const store = tx.objectStore('player');
                // getall wrapper
                const request = store.getAll();
                request.onsuccess = () => {
                    const players = request.result;
                    if (players.length > 0) {
                        const p = players[0];
                        p.coins = 100; // Rich!
                        store.put(p);
                        
                        // Wait for transaction complete
                        tx.oncomplete = () => resolve(true);
                    } else {
                        resolve(false);
                    }
                }
            };
            req.onerror = () => reject('DB Error');
         });
    });
    
    await page.reload();

    // Go to Store Tab (using partial text or icon if text hidden on mobile)
    // The tab bar usually has text.
    await page.getByText('Store', { exact: true }).click();
    
    // Check store loaded
    await expect(page.getByText('Daily Shop')).toBeVisible();

    // Buy First Item
    // We target the first card that represents an item (not badge)
    // Items have a cost.
    const buyButton = page.locator('.card').filter({ hasText: '🏆' }).first();
    await buyButton.click();
    
    // It might shake if failed, or update state if success.
    // If successful, the item is marked purchased.
    // We verify by checking inventory.
    
    await page.getByText('Inventory', { exact: true }).click();
    
    // Should see an item there
    const invItems = page.locator('.card', { hasText: '🏆' }); 
    await expect(invItems.first()).toBeVisible();

    // Test Deletion
    await invItems.first().click(); // Opens View Modal
    
    const removeBtn = page.getByRole('button', { name: 'Remove Item' });
    await removeBtn.click();
    
    // Confirm delete modal
    await expect(page.getByText('Remove Item?')).toBeVisible();
    
    const confirmBtn = page.getByRole('button', { name: 'Remove', exact: true }).last(); 
    await confirmBtn.click();
    
    // Should be empty now
    await expect(page.getByText('Empty Inventory')).toBeVisible();
  });

  test('Profile Reset', async ({ page }) => {
    // Setup player
    await page.getByPlaceholder('Enter your nickname').fill('Resetter');
    await page.getByRole('button', { name: 'Continue' }).click();
    await completeTutorial(page);
    
    // Go to Profile
    await page.getByText('Profile', { exact: true }).click();
    
    // Scroll down to Reset Data
    const resetBtn = page.getByText('Reset Data');
    await resetBtn.scrollIntoViewIfNeeded();
    await resetBtn.click();
    
    // Confirm Modal
    await expect(page.getByText('Danger Zone!')).toBeVisible();
    
    const deleteConfirmBtn = page.getByRole('button', { name: 'Yes, Delete Everything' });
    await deleteConfirmBtn.click();
    
    // User should be back on Landing Page
    await expect(page.locator('h1')).toContainText('Theo Challengers');
    await expect(page.getByPlaceholder('Enter your nickname')).toBeVisible();
  });
});
