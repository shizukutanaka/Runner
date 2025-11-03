import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login form', async ({ page }) => {
    // Check if login form elements are present
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for empty fields', async ({ page }) => {
    // Click submit without filling fields
    await page.click('button[type="submit"]');

    // Check for validation errors
    await expect(page.locator('text=/required/i')).toBeVisible();
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // Fill in login credentials
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpassword');

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for navigation or success indicator
    await page.waitForURL('**/dashboard', { timeout: 5000 });

    // Verify successful login
    await expect(page.locator('text=/dashboard/i')).toBeVisible();
  });

  test('should show error message for invalid credentials', async ({ page }) => {
    // Fill in invalid credentials
    await page.fill('input[name="username"]', 'invaliduser');
    await page.fill('input[name="password"]', 'wrongpassword');

    // Submit the form
    await page.click('button[type="submit"]');

    // Check for error message
    await expect(page.locator('text=/invalid credentials/i')).toBeVisible();
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"]');
    const toggleButton = page.locator('[aria-label*="password"]');

    // Initially password should be hidden
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle button
    await toggleButton.click();

    // Password should be visible
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide
    await toggleButton.click();

    // Password should be hidden again
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should handle remember me checkbox', async ({ page }) => {
    const rememberCheckbox = page.locator('input[type="checkbox"][name*="remember"]');

    // Check the remember me checkbox
    await rememberCheckbox.check();
    await expect(rememberCheckbox).toBeChecked();

    // Uncheck it
    await rememberCheckbox.uncheck();
    await expect(rememberCheckbox).not.toBeChecked();
  });

  test('should navigate to forgot password page', async ({ page }) => {
    // Click forgot password link
    await page.click('text=/forgot password/i');

    // Verify navigation
    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.locator('text=/reset password/i')).toBeVisible();
  });

  test('should be accessible', async ({ page }) => {
    // Check for proper labels
    await expect(page.locator('label[for="username"]')).toBeVisible();
    await expect(page.locator('label[for="password"]')).toBeVisible();

    // Check focus management
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement.tagName);
    expect(focusedElement).toBeTruthy();
  });

  test('should work on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Verify form is still accessible
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();

    // Fill and submit
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
  });
});
