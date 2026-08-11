// Global test setup
const path = require('path');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
// jestは maxWorkers='50%' で複数プロセス並列実行するため、単一の test.db を
// 共有すると並列書き込みで SQLITE_BUSY が発生し、無関係なテストが500になる。
// さらに forceExit で sqlite のハンドルが残るとWindowsでは前回のDBファイルを
// 削除できず（EBUSY）、残留データで重複登録409などの偽陽性が出る。
// → 「実行ごと × ワーカーごと」に一意なDBファイルを使い、両方を根本回避する。
const runId = process.env.JEST_DB_RUN_ID || 'local';
const workerId = process.env.JEST_WORKER_ID || '1';

// setup.js は setupFilesAfterEach 相当で「テストファイルごと」に評価されるため、
// ここでDBファイルを消すと同一ワーカー内の後続ファイルが使用中のDBを削除して
// 500エラーを起こす。またローカル実行では JEST_DB_RUN_ID がワーカーへ伝播せず
// runId が 'local' 固定になり、連続実行で前回データが残って409偽陽性が出る。
// → ワーカープロセス単位で一意なIDを globalThis にキャッシュし、
//   「実行ごと(pid) × ワーカーごと」に必ず新しいDBファイルを使う。
if (!globalThis.__RUNNER_TEST_DB_ID__) {
  globalThis.__RUNNER_TEST_DB_ID__ =
    runId === 'local' ? `p${process.pid}` : runId;
}
const dbId = globalThis.__RUNNER_TEST_DB_ID__;

process.env.DATABASE_PATH = path.resolve(__dirname, `../data/test-${dbId}-${workerId}.db`);
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-not-for-production-use-only';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-not-for-production-use-only-32chars';

// Prevent real OpenAI/Redis connections in unit tests
process.env.OPENAI_API_KEY = '';
process.env.REDIS_URL = '';

// Mock console methods in tests if needed
global.console = {
  ...console
  // Uncomment to suppress logs in tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};