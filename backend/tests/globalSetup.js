// Jest globalSetup: 各テスト実行の前に共有 SQLite テストDBを削除して、
// 前回実行の残骸によるユニーク制約違反 (409 Conflict / SQLITE_CONSTRAINT) を防ぐ。
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../data/test.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  for (const f of [dbPath, `${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (err) {
      // Windows のファイルロックで消せない場合はスキップ（致命的ではない）
      if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err;
    }
  }
};
