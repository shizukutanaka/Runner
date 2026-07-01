// Global test setup
const path = require('path');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_PATH = path.resolve(__dirname, '../data/test.db');
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-not-for-production-use-only';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-not-for-production-use-only-32chars';

// Prevent real OpenAI/Redis connections in unit tests
process.env.OPENAI_API_KEY = '';
process.env.REDIS_URL = '';

// Mock console methods in tests if needed
global.console = {
  ...console,
  // Uncomment to suppress logs in tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};