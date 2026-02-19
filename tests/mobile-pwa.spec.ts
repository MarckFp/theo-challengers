import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test.describe('PWA/Mobile Specifics', () => {

    test.use({ 
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
        // Simulating iOS Safari
    });

    test('Mobile Navigation', async ({ page }) => {
        // 1. Visit
        await page.goto('/');
        
        // Login
        await page.getByPlaceholder('Enter your nickname').fill('MobileUser');
        await page.getByRole('button', { name: 'Continue' }).click();

        // 2. Check Layout
        // Should have "Mobile Bottom Navigation" visible (.fixed.bottom-4)
        // Usually hidden on desktop (md:hidden)
        const mobileNav = page.locator('.fixed.bottom-4'); 
        await expect(mobileNav).toBeVisible();
        
        // 3. Navigate tabs via mobile menu
        await mobileNav.getByRole('button').nth(1).click(); // Leaderboard (2nd)
        await expect(page.locator('text=Leaderboard')).toBeVisible();
        
        await mobileNav.getByRole('button').nth(3).click(); // Inventory (4th)
        await expect(page.locator('text=Your Inventory')).toBeVisible();
        
        // 4. Verify Active Tab Indicator
        // The active button should have 'text-primary' class
        const invBtn = mobileNav.getByRole('button').nth(3);
        await expect(invBtn).toHaveClass(/text-primary/);
    });

    test('PWA Install Prompt Logic (manifest)', async ({ page }) => {
        await page.goto('/');
        
        const manifest = await page.getAttribute('link[rel="manifest"]', 'href');
        expect(manifest).toBeTruthy();
        
        // Check theme color
        const themeColor = await page.getAttribute('meta[name="theme-color"]', 'content');
        expect(themeColor).toBeTruthy();
    });

});
