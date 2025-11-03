# Testing Infrastructure Installation Guide

Quick start guide for installing and running the new testing infrastructure.

## Prerequisites

- Node.js 18+ and npm 8+
- Git (for version control)

---

## Installation Steps

### 1. Install Frontend Dependencies

```bash
cd frontend
npm install
```

This will install:
- Vitest and testing libraries
- Playwright for E2E testing
- MSW for API mocking
- Storybook and addons

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

Jest and supertest are already configured.

### 3. Install Playwright Browsers

```bash
cd frontend
npx playwright install
```

This downloads Chromium, Firefox, and WebKit browsers for E2E testing.

### 4. Setup Environment Variables (Optional)

```bash
cd frontend
cp .env.example .env
```

To enable MSW in development, add to `.env`:
```bash
VITE_ENABLE_MSW=true
```

---

## Running Tests

### Frontend Unit Tests (Vitest)

```bash
cd frontend

# Run all tests
npm test

# Run with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

Coverage reports will be in `frontend/coverage/`

### Frontend E2E Tests (Playwright)

```bash
cd frontend

# Run all E2E tests (headless)
npm run test:e2e

# Run with browser visible
npm run test:e2e:headed

# Run with Playwright UI
npm run test:e2e:ui

# View test report
npm run test:e2e:report
```

### Backend Tests (Jest)

```bash
cd backend

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run only integration tests
npm run test:integration

# Run in watch mode
npm run test:watch
```

Coverage reports will be in `backend/coverage/`

### Storybook (Component Documentation)

```bash
cd frontend

# Start Storybook dev server
npm run storybook
# Opens at http://localhost:6006

# Build static Storybook
npm run build-storybook
```

---

## Verification

### Check Frontend Setup

```bash
cd frontend
npm test -- --run
npm run test:e2e
```

Expected results:
- Unit tests: All passing
- E2E tests: All passing or marked as skipped

### Check Backend Setup

```bash
cd backend
npm test
```

Expected results:
- All integration tests passing
- Coverage thresholds met (85-90%)

---

## Troubleshooting

### Issue: "Cannot find module 'vitest'"

**Solution**:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Issue: "Playwright executable doesn't exist"

**Solution**:
```bash
cd frontend
npx playwright install --with-deps
```

### Issue: MSW not intercepting requests

**Solution**:
1. Check `.env` has `VITE_ENABLE_MSW=true`
2. Restart dev server: `npm run dev`
3. Check browser console for MSW messages

### Issue: Jest tests timeout

**Solution**:
Increase timeout in test file:
```javascript
test('long running test', async () => {
  // test code
}, 30000); // 30 second timeout
```

Or globally in `jest.config.js`:
```javascript
module.exports = {
  testTimeout: 30000,
};
```

### Issue: E2E tests flaky

**Solution**:
Use proper wait mechanisms:
```javascript
// Good
await page.waitForSelector('button');
await expect(page.locator('button')).toBeVisible();

// Avoid
await page.waitForTimeout(1000); // fixed timeout
```

---

## Quick Reference

### Frontend Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run unit tests |
| `npm run test:ui` | Run with Vitest UI |
| `npm run test:coverage` | Generate coverage |
| `npm run test:e2e` | Run E2E tests |
| `npm run test:e2e:ui` | Run E2E with UI |
| `npm run storybook` | Start Storybook |

### Backend Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:coverage` | Generate coverage |
| `npm run test:integration` | Integration tests only |
| `npm run test:watch` | Watch mode |

---

## Coverage Thresholds

### Frontend
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

### Backend
- Lines: 90%
- Functions: 85%
- Branches: 85%
- Statements: 90%

---

## CI/CD Integration

Add to your CI pipeline:

```yaml
# Frontend Tests
- run: cd frontend && npm ci
- run: cd frontend && npm run test:coverage
- run: cd frontend && npx playwright install --with-deps
- run: cd frontend && npm run test:e2e

# Backend Tests
- run: cd backend && npm ci
- run: cd backend && npm run test:coverage
```

---

## Next Steps

1. Read [TESTING_GUIDE.md](./TESTING_GUIDE.md) for detailed testing patterns
2. Review [QUALITY_IMPROVEMENTS_SUMMARY.md](./QUALITY_IMPROVEMENTS_SUMMARY.md) for implementation details
3. Explore Storybook at http://localhost:6006
4. Write tests for new features following the examples

---

## Support

For issues or questions:
1. Check [TESTING_GUIDE.md](./TESTING_GUIDE.md) troubleshooting section
2. Review example test files in `tests/` directories
3. Open an issue on GitHub

Happy Testing! 🧪
