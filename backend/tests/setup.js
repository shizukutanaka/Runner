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
const dbPath = path.resolve(__dirname, `../data/test-${runId}-${workerId}.db`);

// JEST_DB_RUN_ID が未設定のローカル実行では runId が 'local' 固定になるため、
// 連続実行すると前回のDBファイルが再利用され、残留データで重複登録409などの
// 偽陽性が出る。ワーカー起動時に必ず前回分を削除して、毎回まっさらな状態にする。
try {
  const fs = require('fs');
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const f = `${dbPath}${suffix}`;
    if (fs.existsSync(f)) fs.rmSync(f, { force: true });
  }
} catch (error) {
  // Windows で稀にハンドル残留(EBUSY)する場合があるが、その場合も
  // 実行は継続させる（残留データがあれば個別テストが検知する）
  console.warn(`[test-setup] could not remove stale test DB: ${error.message}`);
}

process.env.DATABASE_PATH = dbPath;
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