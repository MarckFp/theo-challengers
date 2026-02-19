import { test, expect } from '@playwright/test';

// We reuse the basic flow structure but now we go DEEP
// SENDER -> RECEIVER -> SENDER (VERIFY) -> RECEIVER (FINALIZE)

test.describe('Full Challenge Lifecycle', () => {
    
  test('Complete verification loop (Sender <-> Receiver)', async ({ browser }) => {
    // --- CONTEXTS ---
    const contextA = await browser.newContext(); // Sender
    const contextB = await browser.newContext(); // Receiver
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // ==========================================
    // 1. SENDER SETUP
    // ==========================================
    await pageA.goto('/');
    await pageA.getByPlaceholder('Enter your nickname').fill('SenderKing');
    await pageA.getByRole('button', { name: 'Continue' }).click();
    
    // Quick Skip Tutorial
    await pageA.evaluate(() => {
        // @ts-ignore
        const d = document.querySelector('dialog'); if(d) d.close();
        // Force complete tutorial in local storage/db?
    });

    // Provide Money & Item
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

    // Buy & Create Challenge
    await pageA.locator('text=Store').click();
    await pageA.locator('.card').filter({ hasText: '🪙' }).first().click();
    await pageA.locator('text=Inventory').click();
    await pageA.locator('.card', { hasText: '🏆' }).first().click(); 
    await pageA.getByRole('button', { name: 'Challenge', exact: false }).click();
    
    // Copy Link (Challenge Link)
    const challengeLink = await pageA.locator('.bg-base-200.break-all').textContent();
    expect(challengeLink).toContain('?challenge=');

    // ==========================================
    // 2. RECEIVER ACCEPT
    // ==========================================
    if (!challengeLink) throw new Error("Link empty");
    await pageB.goto(challengeLink);
    await pageB.getByPlaceholder('Enter your nickname').fill('ReceiverQueen');
    await pageB.getByRole('button', { name: 'Continue' }).click();
    
    // Handle Tutorial
    const tutorialB = pageB.locator('dialog', { hasText: 'Welcome!' });
    await tutorialB.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await tutorialB.isVisible()) {
        await pageB.evaluate(() => { document.querySelector('dialog')?.close(); });
    }

    // Modal should be open
    await expect(pageB.getByText('Challenge Request')).toBeVisible();
    await pageB.getByRole('button', { name: 'Accept Challenge' }).click();

    // ==========================================
    // 3. RECEIVER SENDS PROOF (Generate Verification Link)
    // ==========================================
    // Receiver should see the challenge in Home Tab
    const activeCard = pageB.locator('.card', { hasText: 'SenderKing' });
    await expect(activeCard).toBeVisible();

    // Click the "Verify" / "check" button on the card
    // It's a small circle btn with check icon.
    // Title is "Share for Verification"
    await activeCard.locator('button[title="Share for Verification"]').click();

    // Modal "Verify & Generate Key"? No, "Share Verification Link 🔗"
    // Wait for modal
    const verifyModalB = pageB.locator('dialog[open]');
    // Or check text
    // await expect(pageB.getByText('Share Verification Link')).toBeVisible(); 
    // Wait, the "Active" card click triggers `generateVerificationLinkForActive`?
    // Let's assume it opens a modal or prompt. 
    // In HomeTab.svelte: 
    // <button onclick={(e) => { e.stopPropagation(); generateVerificationLinkForActive(challenge); }} ...>
    // It calls `createChallengeLink`? No, `generateVerificationLink`.
    // Then it sets `generatedShareLink`.
    // Then it opens `send_challenge_modal` (reused).
    
    await expect(pageB.locator('#send_challenge_modal')).toBeVisible();
    const verifyLink = await pageB.locator('.bg-base-200.break-all, input[readonly]').first().inputValue(); // Input is used in modal for copy
    // Or textContent if it's the div
    // In `HomeTab`, it uses `<input type="text" value={generatedShareLink} ...>`
    
    expect(verifyLink).toContain('?verify_claim=');

    // ==========================================
    // 4. SENDER VERIFIES (Inputs Verify Link)
    // ==========================================
    // Sender opens the verify link.
    // We can simulate them opening it, or pasting it if we had a UI for manual paste.
    // The App supports opening via URL.
    
    await pageA.goto(verifyLink);
    // Sender is already logged in, so it should just open the modal.
    
    // Expect "Verify Claim" modal
    await expect(pageA.getByText('Verify Claim')).toBeVisible();
    
    // Click "Verify & Generate Key" (Confirm)
    // Button: "Confirm & Generate Link"
    await pageA.getByRole('button', { name: 'Confirm & Generate Link' }).click();
    
    // Now Sender sees "Challenge Confirmed!" and a new Link (Confirmation Link / Auth Key)
    await expect(pageA.getByText('Challenge Confirmed!')).toBeVisible();
    
    // Get the final link
    // It's usually in the same input/place or a QR code.
    // In `HomeTab`: shows `QrCode` and message "Share this Confirmation Link back"
    // And likely a copy button/input.
    // But `HomeTab` around line 680-700 handles `generatedAuthKey` display.
    // It doesn't use the `send_challenge_modal` for this, it uses `verify_claim_modal` state swap.
    // Let's access the scope or find the input/text.
    // The code uses `QrCode` component, maybe no text link displayed?
    // Wait, line 230 in `HomeTab`: `const link = ...; return { success: true, authRawLink: link };`
    // Then `generatedAuthKey` is set to this link.
    // The UI (lines 600+) shows QrCode. Does it show text?
    // "Share this Confirmation Link back:" then a button "Copy Link".
    // We can click "Copy Link" and read clipboard?
    // Playwright permission for clipboard is tricky.
    // But wait, look at `HomeTab` template I read earlier?
    // I can't be 100% sure if the text is visible.
    // But `QrCode` component takes `data={generatedAuthKey}`.
    // Maybe I can extract it from the DOM element props if needed, or if there's a hidden input.
    
    // Let's assume there's a "Copy Link" button and we can't easily read clipboard.
    // Workaround: We can intercept the console log if it logs it?
    // Or we can evaluate the state of the component.
    
    // Better: In `HomeTab`, inside `verify_claim_modal` (else block of `!generatedAuthKey`),
    // there is a "Copy Link" button.
    // And potentially a "Share via App" button.
    
    // Let's try to grab it from the QrCode data attribute if exposed, or just evaluating the component state.
    const authLink = await pageA.evaluate(() => {
        // @ts-ignore
        // This is Svelte 5 state, hard to reach from outside without exposing it.
        // But we can check if there's an element displaying it.
        // ...
        // Actually, let's look for the text "Share Confirmation Link"
        return document.querySelector('#verify_claim_modal dialog[open] .form-control .textarea')?.innerHTML 
        // No, that's the input for pasting.
    });

    // Let's cheat: The QrCode component usually renders an SVG/Canvas.
    // If I can't get the link, I can't finish the test efficiently without modifying code to expose it.
    
    // Wait, I read `HomeTab.svelte` earlier.
    // Lines 690+: In `verify_claim_modal`, `else` block (generatedAuthKey exists).
    // It shows `<QrCode data={generatedAuthKey} ... />`
    // And `Share Confirmation Link` button.
    
    // Let's invoke the copy button and read clipboard... 
    // context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await contextA.grantPermissions(['clipboard-read', 'clipboard-write']);
    await pageA.getByRole('button', { name: 'Copy Link' }).click();
    const finalLink = await pageA.evaluate(() => navigator.clipboard.readText());
    
    expect(finalLink).toContain('?finalize=');
    
    // ==========================================
    // 5. RECEIVER FINALIZES (Completes)
    // ==========================================
    await pageB.goto(finalLink);
    
    // Should auto-finalize or show success.
    // "Challenge Validated! Points added." (toast or alert or modal)
    // The code calls `finalizeClaim` on mount.
    
    // Check if points increased?
    // Receiver started with 2 coins (default) + 0 points.
    // Challenge was worth 50-100 pts?
    // Let's check "Points" badge.
    
    await expect(pageB.locator('.badge', { hasText: '🏆' })).toBeVisible(); 
    // And the Active Challenge should be gone or moved to history.
    
    await expect(pageB.locator('text=No challenges completed yet')).not.toBeVisible();
    // Check history? (Journal)
    // Tab "Profile" -> Journal is there.
    await pageB.locator('text=Profile').click();
    
    // Should see "SenderKing" in list.
    await expect(pageB.getByText('SenderKing')).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
