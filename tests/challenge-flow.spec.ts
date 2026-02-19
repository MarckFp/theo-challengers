import { test, expect } from '@playwright/test';

test.describe('Challenge Flow', () => {
    
  test('User A sends challenge to User B', async ({ browser }) => {
    // --- USER A (SENDER) ---
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    
    // 1. Setup Sender
    await pageA.goto('/');
    await pageA.getByPlaceholder('Enter your nickname').fill('Sender');
    await pageA.getByRole('button', { name: 'Continue' }).click();

    // Skip Tutorial
    const tutorialDialogA = pageA.locator('dialog.modal-open');
    if (await tutorialDialogA.isVisible()) {
        const nextBtn = tutorialDialogA.getByRole('button', { name: 'Next' });
        while (await nextBtn.isVisible()) { await nextBtn.click(); }
        await tutorialDialogA.getByRole('button', { name: "Let's Play!" }).click();
    }
    
    // Inject Coins
    await pageA.evaluate(async () => {
         return new Promise((resolve) => {
            const req = indexedDB.open('TheoChallengersDB');
            req.onsuccess = (e: any) => {
                const db = e.target.result;
                const tx = db.transaction(['player'], 'readwrite');
                const store = tx.objectStore('player');
                store.getAll().onsuccess = (e: any) => {
                    const p = e.target.result[0];
                    if (p) {
                        p.coins = 50;
                        store.put(p);
                        resolve(true);
                    }
                }
            };
         });
    });
    await pageA.reload();

    // Buy Item
    await pageA.getByText('Store', { exact: true }).click();
    await pageA.locator('.card').filter({ hasText: '🏆' }).first().click();
    
    // Create Challenge
    await pageA.getByText('Inventory', { exact: true }).click();
    await pageA.locator('.card', { hasText: '🏆' }).first().click(); // Open view modal
    
    // Click "Challenge!" button
    // It has text "Challenge!" or "🚀"
    await pageA.getByRole('button', { name: 'Challenge', exact: false }).click();
    
    // Get Link
    const linkLocator = pageA.locator('.bg-base-200.break-all');
    await expect(linkLocator).toBeVisible();
    const challengeLink = await linkLocator.textContent();
    
    expect(challengeLink).toContain('?challenge=');
    
    // --- USER B (RECEIVER) ---
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    
    // 2. Setup Receiver with Link
    // When visiting the link, if not logged in, they hit Landing.
    // After login, the query param *should* be preserved or handled.
    // If the app replaces the URL on hydration, we might lose it.
    // Let's assume standard behavior stays on URL until handled.
    
    if (!challengeLink) throw new Error("Link not found");
    
    await pageB.goto(challengeLink);
    
    // Login Receiver
    await pageB.getByPlaceholder('Enter your nickname').fill('Receiver');
    await pageB.getByRole('button', { name: 'Continue' }).click();
    
    // Tutorial (Wait for it or skip)
    // The challenge modal might pop up OVER the tutorial or after?
    // Tutorial usually appears with a timeout of 500ms
    // Check `HomeTab.svelte` line 34.
    
    // Skip Tutorial B
    const tutorialDialogB = pageB.locator('.modal-box', { hasText: 'Welcome!' });
    // Wait for it to appear to handle it gracefully
    await tutorialDialogB.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    
    if (await tutorialDialogB.isVisible()) {
        const nextBtn = tutorialDialogB.getByRole('button', { name: 'Next' });
        while (await nextBtn.isVisible()) { await nextBtn.click(); }
        await tutorialDialogB.getByRole('button', { name: "Let's Play!" }).click();
    }
    
    // 3. Verify Challenge Request Modal
    // It should appear b/c of the URL parameter
    // The modal ID is `claim_request_modal`
    // It might be triggered in `HomeTab` effect.
    
    const requestModal = pageB.locator('dialog#claim_request_modal[open]');
    // Or check text "Challenge Request"
    await expect(pageB.getByText('Challenge Request')).toBeVisible();
    
    // Verify Sender Name
    await expect(pageB.getByText('Sender', { exact: false })).toBeVisible();
    
    // Accept
    await pageB.getByRole('button', { name: 'Accept Challenge' }).click();
    
    // 4. Verify Active Challenge List
    // Should see "Active Challenges" section
    // Or just check if the item card appears in Home Tab
    await expect(pageB.getByText('Active Challenges')).toBeVisible();
    
    // The "Challenge" card should be visible in the list
    // We don't know exact title easily, but we know it exists.
    const activeCards = pageB.locator('.card', { hasText: 'From: Sender' });
    await expect(activeCards.first()).toBeVisible();

    // Close contexts
    await contextA.close();
    await contextB.close();
  });
});
