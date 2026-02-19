const { test, expect } = require('@playwright/test');
const { completeTutorial, clickTab, brutalCleanup } = require('./utils.cjs');

test.describe('Settings & Profile', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.getByPlaceholder('Enter your nickname').fill('SettingsUser');
        await page.getByRole('button', { name: 'Continue' }).click();
        await completeTutorial(page);
        await page.waitForTimeout(500);
    });

    test('Theme Switching', async ({ page }) => {
        await clickTab(page, 4);
        
        const themeSelect = page.locator('select').nth(1); 
        await themeSelect.selectOption('cupcake');
        
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'cupcake');
        
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'cupcake');
    });

    test('Language Switching', async ({ page }) => {
        await clickTab(page, 4);
        
        const langSelect = page.locator('select').first();
        await langSelect.selectOption('es');
        
        await expect(page.getByRole('button', { name: /Cómo/i })).toBeVisible();
        
        await langSelect.selectOption('en');
        await expect(page.getByRole('button', { name: /How to Play/i })).toBeVisible();
    });

    test('Nickname Editing', async ({ page }) => {
        await clickTab(page, 4);
        
        // Use specific selector for the profile name header
        const nameHeader = page.locator('h2.text-3xl', { hasText: 'SettingsUser' });
        await expect(nameHeader).toBeVisible();
        await nameHeader.click();
        
        const input = page.locator('input[type="text"]').first();
        await expect(input).toBeVisible();
        await input.fill('NewName123');
        
        const saveBtn = page.locator('.btn-success');
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();
        
        await expect(input).toBeHidden();
        
        // Use strict check or class selector to avoid ambiguity with "Welcome back..."
        await expect(page.locator('h2.text-3xl', { hasText: 'NewName123' })).toBeVisible();
        
        await page.reload();
        await clickTab(page, 4);
        await expect(page.locator('h2.text-3xl', { hasText: 'NewName123' })).toBeVisible();
    });

});