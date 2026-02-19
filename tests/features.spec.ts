import { test, expect } from '@playwright/test';

test.describe('Feature Tests', () => {

  test('Leaderboard Ranking', async ({ page }) => {
    await page.goto('/');

    // 1. Seed DB with multiple players
    await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
           const req = indexedDB.open('TheoChallengersDB');
           req.onsuccess = (e: any) => {
               const db = e.target.result;
               const tx = db.transaction(['player', 'leaderboard'], 'readwrite');
               
               // Create main player
               const pStore = tx.objectStore('player');
               pStore.add({ nickname: 'Hero', score: 100, coins: 0 }); // Rank 2
               
               // Create competitors in leaderboard store directly 
               // (assuming app syncs or reads from leaderboard table for the tab)
               const lStore = tx.objectStore('leaderboard');
               lStore.add({ nickname: 'TopPlayer', score: 500 }); // Rank 1
               lStore.add({ nickname: 'Hero', score: 100 });      // Rank 2
               lStore.add({ nickname: 'Newbie', score: 10 });     // Rank 3
               
               tx.oncomplete = () => resolve(true);
           };
        });
    });

    await page.reload();
    
    // Login as Hero if needed (if app checks strictly for local player)
    // The seeds above might need adjustment depending on how your app identifies "Me"
    // Usually it takes the first player in 'player' table as "Me".
    
    // Check if we are logged in (Hero)
    await expect(page.getByText('Hero')).toBeVisible();

    // Go to Leaderboard
    await page.getByText('Leaderboard').click();
    
    // Check Ranks
    // We expect 3 items.
    const rows = page.locator('.tab-content .card'); 
    // The selector might need to be more specific based on your LeaderboardTab structure
    // Let's look for names.
    
    await expect(page.getByText('TopPlayer')).toBeVisible();
    await expect(page.getByText('Newbie')).toBeVisible();
    
    // Verify Order? 
    // Playwright locator('text=TopPlayer') should be visually above 'Hero' if sorted.
    // simpler: check if the first stats row is TopPlayer
    // Assuming the layout is a list of cards/rows:
    const firstRank = page.locator('.card', { hasText: '1' }).first(); 
    await expect(firstRank).toContainText('TopPlayer');
  });

  test('Weekly Bonus Logic', async ({ page }) => {
    // 1. Seed a player who last visited > 1 week ago
    await page.goto('/');
    
    await page.evaluate(async () => {
        return new Promise((resolve) => {
           const req = indexedDB.open('TheoChallengersDB');
           req.onsuccess = (e: any) => {
               const db = e.target.result;
               const tx = db.transaction(['player'], 'readwrite');
               const store = tx.objectStore('player');
               store.add({ 
                   nickname: 'BonusHunter', 
                   coins: 5, 
                   streak: 6,
                   lastWeeklyBonus: '2020-W01', // Very old date
                   tutorialSeen: true 
               });
               tx.oncomplete = () => resolve(true);
           };
        });
    });

    await page.reload();

    // 2. Expect Bonus Modal
    // The logic in Home.svelte checks `lastWeeklyBonus !== currentWeekId`
    // It sets `isDailyBonusOpen = true`
    // We need to find the modal or text "Weekly Bonus!"
    await expect(page.getByText('Weekly Bonus!')).toBeVisible();
    
    // 3. Collect
    await page.getByRole('button', { name: 'Collect' }).click();
    
    // 4. Verify Coins Increased
    // Streak 6 -> Bonus is +2 coins (Total 7) or +1? 
    // Code says: if s >= 7 (+3), else if s >= 3 (+2).
    // So 5 + 2 = 7.
    const coinsBadge = page.locator('.badge', { hasText: '7' });
    await expect(coinsBadge).toBeVisible();
  });

  test('Settings: Theme and Language', async ({ page }) => {
    await page.goto('/');
    
    // Login
    await page.getByPlaceholder('Enter your nickname').fill('SettingsTester');
    await page.getByRole('button', { name: 'Continue' }).click();
    
    // Skip Tutorial
    await page.locator('button', { hasText: "Let's Play!" }).click({ timeout: 5000 }).catch(() => {
        // Fallback if "Let's Play" isn't visible immediately (step through)
        // Ignoring for brevity, usually tutorial appears fast.
    });

    // Go to Profile
    await page.getByText('Profile').click();

    // 1. Change Theme
    // Check initial (default might be dark or system)
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark'); // Assuming default

    // Select 'cupcake'
    await page.getByRole('combobox').nth(1).selectOption('cupcake'); // 2nd select is theme
    
    // Verify
    await expect(html).toHaveAttribute('data-theme', 'cupcake');

    // 2. Change Language
    // Select 'Español'
    await page.getByRole('combobox').first().selectOption('es'); // 1st select is lang
    
    // Verify Text Update
    // "Profile" should become "Perfil" (or whatever translation is)
    // Or check the "Badges" or "Settings" headers.
    // Let's check "Theme" label -> "Tema"
    await expect(page.getByText('Tema')).toBeVisible(); 
  });

});
