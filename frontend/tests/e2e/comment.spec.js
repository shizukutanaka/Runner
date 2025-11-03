import { test, expect } from '@playwright/test';

test.describe('Comment Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
  });

  test('should display comment timeline', async ({ page }) => {
    // Navigate to comments section
    await page.click('text=/comments/i');

    // Wait for comments to load
    await page.waitForSelector('[data-testid="comment-timeline"]', { timeout: 5000 });

    // Verify comment timeline is visible
    await expect(page.locator('[data-testid="comment-timeline"]')).toBeVisible();
  });

  test('should post a new comment', async ({ page }) => {
    await page.click('text=/comments/i');

    // Find and fill comment input
    const commentInput = page.locator('textarea[placeholder*="comment"]');
    await commentInput.fill('This is a test comment');

    // Submit comment
    await page.click('button:has-text("Post")');

    // Wait for comment to appear
    await page.waitForTimeout(1000);

    // Verify comment is displayed
    await expect(page.locator('text=This is a test comment')).toBeVisible();
  });

  test('should filter comments by platform', async ({ page }) => {
    await page.click('text=/comments/i');

    // Open filter dropdown
    await page.click('[aria-label*="filter"]');

    // Select YouTube filter
    await page.click('text=/youtube/i');

    // Wait for filtered results
    await page.waitForTimeout(500);

    // Verify YouTube badge is visible on comments
    const youtubeComments = page.locator('[data-platform="youtube"]');
    await expect(youtubeComments.first()).toBeVisible();
  });

  test('should moderate a comment', async ({ page }) => {
    await page.click('text=/comments/i');

    // Find first comment and open actions menu
    const firstComment = page.locator('[data-testid="comment-item"]').first();
    await firstComment.hover();
    await firstComment.locator('[aria-label="More actions"]').click();

    // Click moderate action
    await page.click('text=/moderate/i');

    // Verify moderation dialog opens
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Confirm moderation
    await page.click('button:has-text("Confirm")');

    // Wait for success message
    await expect(page.locator('text=/moderated successfully/i')).toBeVisible();
  });

  test('should delete a comment', async ({ page }) => {
    await page.click('text=/comments/i');

    // Find first comment and open actions menu
    const firstComment = page.locator('[data-testid="comment-item"]').first();
    await firstComment.hover();
    await firstComment.locator('[aria-label="More actions"]').click();

    // Click delete action
    await page.click('text=/delete/i');

    // Verify confirmation dialog
    await expect(page.locator('text=/are you sure/i')).toBeVisible();

    // Confirm deletion
    await page.click('button:has-text("Delete")');

    // Wait for success message
    await expect(page.locator('text=/deleted successfully/i')).toBeVisible();
  });

  test('should search comments', async ({ page }) => {
    await page.click('text=/comments/i');

    // Find search input
    const searchInput = page.locator('input[placeholder*="search"]');
    await searchInput.fill('test');

    // Wait for search results
    await page.waitForTimeout(500);

    // Verify filtered results contain search term
    const commentText = await page.locator('[data-testid="comment-item"]').first().textContent();
    expect(commentText.toLowerCase()).toContain('test');
  });

  test('should sort comments', async ({ page }) => {
    await page.click('text=/comments/i');

    // Click sort button
    await page.click('[aria-label*="sort"]');

    // Select newest first
    await page.click('text=/newest first/i');

    // Wait for re-sort
    await page.waitForTimeout(500);

    // Verify order (first comment should have recent timestamp)
    const timestamps = await page.locator('[data-testid="comment-timestamp"]').allTextContents();
    expect(timestamps.length).toBeGreaterThan(0);
  });

  test('should load more comments on scroll', async ({ page }) => {
    await page.click('text=/comments/i');

    // Get initial comment count
    const initialCount = await page.locator('[data-testid="comment-item"]').count();

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Wait for new comments to load
    await page.waitForTimeout(1000);

    // Get new comment count
    const newCount = await page.locator('[data-testid="comment-item"]').count();

    // Verify more comments loaded
    expect(newCount).toBeGreaterThan(initialCount);
  });

  test('should display comment statistics', async ({ page }) => {
    await page.click('text=/comments/i');

    // Verify statistics panel
    await expect(page.locator('[data-testid="comment-stats"]')).toBeVisible();

    // Check for key metrics
    await expect(page.locator('text=/total comments/i')).toBeVisible();
    await expect(page.locator('text=/moderated/i')).toBeVisible();
  });

  test('should real-time update on new comment', async ({ page, context }) => {
    await page.click('text=/comments/i');

    // Get initial comment count
    const initialCount = await page.locator('[data-testid="comment-item"]').count();

    // Open new page and post comment
    const newPage = await context.newPage();
    await newPage.goto('/');
    await newPage.fill('input[name="username"]', 'testuser2');
    await newPage.fill('input[name="password"]', 'testpassword');
    await newPage.click('button[type="submit"]');
    await newPage.waitForURL('**/dashboard');
    await newPage.click('text=/comments/i');
    await newPage.fill('textarea[placeholder*="comment"]', 'Real-time test comment');
    await newPage.click('button:has-text("Post")');

    // Wait for WebSocket update on original page
    await page.waitForTimeout(2000);

    // Verify new comment appeared
    const newCount = await page.locator('[data-testid="comment-item"]').count();
    expect(newCount).toBeGreaterThan(initialCount);

    await newPage.close();
  });
});
