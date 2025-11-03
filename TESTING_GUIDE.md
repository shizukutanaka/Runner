# Testing Guide

This document provides comprehensive information about the testing infrastructure for the YouTube & Twitch Comment Manager project.

## Table of Contents

- [Overview](#overview)
- [Frontend Testing](#frontend-testing)
- [Backend Testing](#backend-testing)
- [Running Tests](#running-tests)
- [Coverage Requirements](#coverage-requirements)
- [Best Practices](#best-practices)

---

## Overview

The project uses a multi-layered testing approach:

- **Frontend**: Vitest for unit/component tests, Playwright for E2E tests, Storybook for component documentation
- **Backend**: Jest for unit and integration tests
- **API Mocking**: MSW (Mock Service Worker) for frontend API mocking

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend Unit | Vitest | Component and utility testing |
| Frontend E2E | Playwright | End-to-end user flow testing |
| Frontend Mocking | MSW | API request mocking |
| Frontend Docs | Storybook | Component catalog and documentation |
| Backend Unit/Integration | Jest | API and service testing |

---

## Frontend Testing

### 1. Vitest Configuration

**Location**: `frontend/vite.config.js`

**Features**:
- Fast test execution (3-5x faster than Jest)
- Native ES modules support
- Component testing with jsdom
- Coverage reporting with v8

**Setup File**: `frontend/src/test/setup.js`
- Includes React Testing Library configuration
- Mocks for browser APIs (matchMedia, IntersectionObserver, etc.)
- MSW server integration for API mocking

### 2. Test Structure

Component tests should be placed in `__tests__` directories:

```
frontend/src/components/
├── ComponentName.jsx
└── __tests__/
    └── ComponentName.test.jsx
```

### 3. Example Test

```javascript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    render(<MyComponent />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Clicked')).toBeInTheDocument();
  });
});
```

### 4. Playwright E2E Tests

**Location**: `frontend/tests/e2e/`

**Configuration**: `frontend/playwright.config.js`

**Features**:
- Cross-browser testing (Chromium, Firefox, WebKit)
- Mobile viewport testing
- Automatic screenshots and videos on failure
- Parallel test execution

**Example E2E Test**:

```javascript
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
  await page.goto('/');

  await page.fill('input[name="username"]', 'testuser');
  await page.fill('input[name="password"]', 'testpass');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/.*dashboard/);
});
```

### 5. MSW (Mock Service Worker)

**Location**: `frontend/src/mocks/`

**Files**:
- `handlers.js` - API endpoint handlers
- `browser.js` - Browser worker setup
- `server.js` - Node server setup (for Vitest)

**Usage**:

Enable MSW in development by setting environment variable:
```bash
VITE_ENABLE_MSW=true npm run dev
```

MSW is automatically enabled in Vitest tests via setup file.

### 6. Storybook

**Location**: `frontend/.storybook/`

**Purpose**: Component catalog and interactive documentation

**Features**:
- Component isolation
- Interactive props editing
- Theme switching (light/dark)
- Accessibility testing
- Visual regression baseline

**Example Story**:

```javascript
import MyComponent from './MyComponent';

export default {
  title: 'Components/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],
};

export const Default = {
  args: {
    text: 'Hello World',
  },
};

export const WithIcon = {
  args: {
    text: 'Hello',
    icon: 'check',
  },
};
```

---

## Backend Testing

### 1. Jest Configuration

**Location**: `backend/jest.config.js`

**Coverage Thresholds**:
- Branches: 85%
- Functions: 85%
- Lines: 90%
- Statements: 90%

### 2. Test Structure

```
backend/tests/
├── api/              # API endpoint tests
├── integration/      # Integration tests
├── middleware/       # Middleware tests
├── services/         # Service layer tests
├── unit/            # Unit tests
└── setup.js         # Test setup
```

### 3. Integration Tests

**Created Tests**:
- `tests/integration/comments.test.js` - Comment management API
- `tests/integration/notifications.test.js` - Notification system
- `tests/integration/auth.test.js` - Authentication flows

**Example**:

```javascript
const request = require('supertest');
const app = require('../../src/app');

describe('Comments API', () => {
  let authToken;

  beforeAll(async () => {
    // Setup authentication
    const res = await request(app)
      .post('/api/users/login')
      .send({ username: 'test', password: 'test' });
    authToken = res.body.token;
  });

  test('should create comment', async () => {
    const res = await request(app)
      .post('/api/comments')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'Test comment' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
  });
});
```

---

## Running Tests

### Frontend

```bash
cd frontend

# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui

# Run E2E tests
npm run test:e2e

# Run E2E tests in headed mode
npm run test:e2e:headed

# Run E2E tests with UI
npm run test:e2e:ui

# View E2E test report
npm run test:e2e:report

# Start Storybook
npm run storybook

# Build Storybook
npm run build-storybook
```

### Backend

```bash
cd backend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run only integration tests
npm run test:integration

# Run only unit tests
npm run test:unit

# Run only E2E tests
npm run test:e2e
```

---

## Coverage Requirements

### Frontend (Vitest)

**Target Coverage**: 80%
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

**Excluded**:
- `node_modules/`
- `src/test/`
- Configuration files
- `main.jsx`
- `index.css`

### Backend (Jest)

**Target Coverage**: 90%
- Lines: 90%
- Functions: 85%
- Branches: 85%
- Statements: 90%

**Excluded**:
- `node_modules/`
- `src/scripts/`
- `src/config/`
- `src/server.js`

---

## Best Practices

### General

1. **Write tests first** (TDD when possible)
2. **Keep tests isolated** - Each test should be independent
3. **Use descriptive test names** - Clearly state what is being tested
4. **Follow AAA pattern** - Arrange, Act, Assert
5. **Mock external dependencies** - Use MSW, vi.mock(), or jest.mock()

### Frontend Testing

1. **Test user behavior, not implementation**
   ```javascript
   // Good
   await user.click(screen.getByRole('button', { name: /submit/i }));

   // Avoid
   wrapper.find('.submit-button').simulate('click');
   ```

2. **Use accessible queries**
   - Prefer: `getByRole`, `getByLabelText`, `getByText`
   - Avoid: `getByTestId`, `getByClassName`

3. **Test loading and error states**

4. **Mock API calls with MSW** instead of mocking fetch directly

5. **Keep tests fast** - Use fake timers when needed

### Backend Testing

1. **Test API contracts** - Verify request/response structure

2. **Test error cases** - Don't just test happy paths

3. **Use supertest for HTTP testing** - Clean, readable API tests

4. **Clean up after tests**
   ```javascript
   afterEach(async () => {
     await cleanDatabase();
   });
   ```

5. **Test security**
   - Authentication/authorization
   - Input validation
   - XSS/SQL injection prevention

### E2E Testing

1. **Focus on critical user journeys**
   - Login/logout flows
   - Core feature workflows
   - Payment flows (if applicable)

2. **Use page objects** for complex pages

3. **Handle flakiness**
   - Use `waitFor` instead of fixed timeouts
   - Retry failed tests
   - Take screenshots on failure

4. **Keep E2E tests minimal** - They're slower and more brittle

### Storybook

1. **Document all component variants**

2. **Include interaction tests** using `@storybook/testing-library`

3. **Test accessibility** with a11y addon

4. **Keep stories simple** - One concern per story

---

## Continuous Integration

### GitHub Actions (if configured)

```yaml
- name: Frontend Tests
  run: |
    cd frontend
    npm ci
    npm run test:coverage
    npm run test:e2e

- name: Backend Tests
  run: |
    cd backend
    npm ci
    npm run test:coverage
```

### Pre-commit Hooks

Tests automatically run on commit via husky (if configured):

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:unit"
    }
  }
}
```

---

## Troubleshooting

### Common Issues

**Issue**: Tests timeout
**Solution**: Increase `testTimeout` in config or use `test.setTimeout()`

**Issue**: MSW not intercepting requests
**Solution**: Ensure worker is started before tests, check handler URLs

**Issue**: Playwright browser not found
**Solution**: Run `npx playwright install`

**Issue**: Coverage not meeting threshold
**Solution**: Add more test cases or adjust thresholds temporarily

**Issue**: Flaky E2E tests
**Solution**: Use proper wait mechanisms, avoid fixed timeouts

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [MSW Documentation](https://mswjs.io/)
- [Storybook Documentation](https://storybook.js.org/)
- [Jest Documentation](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)

---

## Contributing

When adding new features:

1. Write tests first (TDD)
2. Ensure coverage thresholds are met
3. Update this guide if adding new test patterns
4. Run full test suite before submitting PR

## Questions?

Contact the development team or open an issue on GitHub.
