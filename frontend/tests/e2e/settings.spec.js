import { test, expect } from '@playwright/test';

test.describe('Settings Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');

    // Navigate to settings
    await page.click('[aria-label="Settings"]');
    await page.waitForSelector('[data-testid="settings-panel"]');
  });

  test('should display settings panel', async ({ page }) => {
    // Verify settings panel is visible
    await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible();

    // Check for main setting sections
    await expect(page.locator('text=/general settings/i')).toBeVisible();
    await expect(page.locator('text=/notification settings/i')).toBeVisible();
  });

  test('should update user profile', async ({ page }) => {
    // Click on profile tab
    await page.click('text=/profile/i');

    // Update display name
    const displayNameInput = page.locator('input[name="displayName"]');
    await displayNameInput.clear();
    await displayNameInput.fill('Updated Test User');

    // Save changes
    await page.click('button:has-text("Save")');

    // Wait for success message
    await expect(page.locator('text=/saved successfully/i')).toBeVisible();
  });

  test('should change theme', async ({ page }) => {
    // Find theme toggle
    const themeToggle = page.locator('[aria-label*="theme"]');

    // Get current theme
    const isDark = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    });

    // Toggle theme
    await themeToggle.click();

    // Wait for theme change
    await page.waitForTimeout(500);

    // Verify theme changed
    const newIsDark = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    });

    expect(newIsDark).not.toBe(isDark);
  });

  test('should update notification preferences', async ({ page }) => {
    // Click on notifications tab
    await page.click('text=/notifications/i');

    // Toggle email notifications
    const emailToggle = page.locator('input[name="emailNotifications"]');
    await emailToggle.click();

    // Toggle push notifications
    const pushToggle = page.locator('input[name="pushNotifications"]');
    await pushToggle.click();

    // Save changes
    await page.click('button:has-text("Save")');

    // Verify success
    await expect(page.locator('text=/preferences updated/i')).toBeVisible();
  });

  test('should change language', async ({ page }) => {
    // Click language switcher
    await page.click('[aria-label*="language"]');

    // Select Japanese
    await page.click('text=/日本語/i');

    // Wait for language change
    await page.waitForTimeout(1000);

    // Verify UI language changed (check for Japanese text)
    await expect(page.locator('text=/設定/i')).toBeVisible();
  });

  test('should configure moderation settings', async ({ page }) => {
    // Click on moderation tab
    await page.click('text=/moderation/i');

    // Enable auto-moderation
    const autoModToggle = page.locator('input[name="autoModeration"]');
    await autoModToggle.check();

    // Set sensitivity level
    await page.selectOption('select[name="sensitivityLevel"]', 'medium');

    // Add blocked words
    const blockedWordsInput = page.locator('input[name="blockedWords"]');
    await blockedWordsInput.fill('spam, test');

    // Save settings
    await page.click('button:has-text("Save")');

    // Verify success
    await expect(page.locator('text=/moderation settings saved/i')).toBeVisible();
  });

  test('should manage API integrations', async ({ page }) => {
    // Click on integrations tab
    await page.click('text=/integrations/i');

    // Connect YouTube
    const youtubeConnect = page.locator('button:has-text("Connect YouTube")');
    await youtubeConnect.click();

    // Verify authorization dialog or redirect
    await expect(page.locator('text=/authorize/i')).toBeVisible();
  });

  test('should export data', async ({ page }) => {
    // Click on data tab
    await page.click('text=/data/i');

    // Click export button
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export Data")');

    // Wait for download
    const download = await downloadPromise;

    // Verify download started
    expect(download.suggestedFilename()).toContain('export');
  });

  test('should change password', async ({ page }) => {
    // Click on security tab
    await page.click('text=/security/i');

    // Fill password change form
    await page.fill('input[name="currentPassword"]', 'testpassword');
    await page.fill('input[name="newPassword"]', 'newpassword123');
    await page.fill('input[name="confirmPassword"]', 'newpassword123');

    // Submit password change
    await page.click('button:has-text("Change Password")');

    // Verify success
    await expect(page.locator('text=/password changed/i')).toBeVisible();
  });

  test('should enable two-factor authentication', async ({ page }) => {
    // Click on security tab
    await page.click('text=/security/i');

    // Enable 2FA
    await page.click('button:has-text("Enable 2FA")');

    // Verify QR code is displayed
    await expect(page.locator('[data-testid="qr-code"]')).toBeVisible();

    // Enter verification code
    await page.fill('input[name="verificationCode"]', '123456');

    // Confirm 2FA setup
    await page.click('button:has-text("Verify")');
  });

  test('should reset settings to default', async ({ page }) => {
    // Find reset button
    await page.click('button:has-text("Reset to Default")');

    // Confirm reset in dialog
    await expect(page.locator('text=/are you sure/i')).toBeVisible();
    await page.click('button:has-text("Confirm")');

    // Verify reset success
    await expect(page.locator('text=/settings reset/i')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    // Click on profile tab
    await page.click('text=/profile/i');

    // Clear required field
    const displayNameInput = page.locator('input[name="displayName"]');
    await displayNameInput.clear();

    // Try to save
    await page.click('button:has-text("Save")');

    // Verify validation error
    await expect(page.locator('text=/required/i')).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Verify settings panel adapts to mobile
    await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible();

    // Verify tabs are accessible
    await page.click('text=/notifications/i');
    await expect(page.locator('input[name="emailNotifications"]')).toBeVisible();
  });
});
