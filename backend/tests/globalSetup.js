// Jest globalSetup: テストDBの残骸によるユニーク制約違反 (409 Conflict /
// SQLITE_CONSTRAINT) や SQLITE_BUSY を防ぐ。
// Windowsでは forceExit で残った sqlite ハンドルにより前回のDBファイルを
// 削除できない (EBUSY/EPERM) ことがあるため、削除に頼らず「実行ごとに一意な
// DBファイル名」を採用し、削除はベストエフォートの掃除に留める。
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const dir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // この実行専用のDB識別子。ワーカープロセスは親のenvを継承するので
  // tests/setup.js 側で test-<runId>-<workerId>.db として利用される。
  process.env.JEST_DB_RUN_ID = `${Date.now()}`;

  // 過去実行の残骸をベストエフォートで掃除（ロック中のものはスキップ）
  const stale = fs
    .readdirSync(dir)
    .filter((f) => /^test[-.\d]*\.db(-journal|-wal|-shm)?$/.test(f))
    .map((f) => path.join(dir, f));

  for (const f of stale) {
    try {
      fs.unlinkSync(f);
    } catch (err) {
      if (err.code !== 'EBUSY' && err.code !== 'EPERM' && err.code !== 'ENOENT') throw err;
    }
  }
};
