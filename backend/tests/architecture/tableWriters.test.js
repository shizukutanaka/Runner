// 「読み手はいるが、書き手がいない」テーブルを機械的に検出する。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// E-36 で `moderation_history` が見つかった。ユーザー活動画面が履歴を読み、
// 「操作の総数 / BAN回数 / ミュート回数」を出していたのに、
// **そのテーブルに INSERT するコードは製品のどこにも無かった**。
// 昨日BANしたユーザーを開いても「操作0件」と出続けていた。
//
// 既存の `deadExports.test.js` はSQL中のテーブルが**スキーマに存在すること**を見る。
// `moderation_history` は CREATE TABLE されていたので通っていた。
// **「存在する」と「書かれている」は別である。**
//
// 同じ形を全部探したところ、さらに3件あった（E-37）:
//   ai_moderation_logs    読み手だけ（AI判定ログ画面は永久に空）
//   user_timeout_reasons  読み手だけ（理由テンプレートは永久に空）
//   analytics_snapshots / moderation_settings  読み手も書き手も無い
//
// ---------------------------------------------------------------------------
// 規則
// ---------------------------------------------------------------------------
// **SELECT されるテーブルには、INSERT / UPDATE / DELETE のいずれかが src に存在すること。**
//
// 書き手のない読み取りは「データが無い」ことを示さない。**配線が切れている**ことを示す。
// 外部が書き込む等の正当な理由があるものは READ_ONLY_BY_DESIGN に理由つきで明記すること。
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');

// 読み取り専用でよいテーブル。形式: テーブル名 => 理由
const READ_ONLY_BY_DESIGN = {
  // 現在は無し。追加するときは必ず「誰が書くのか」を書くこと。
};

const collect = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') collect(p, acc);
    } else if (entry.name.endsWith('.js')) {
      acc.push(p);
    }
  }
  return acc;
};

const files = collect(SRC);
const sources = files.map((f) => ({ file: path.relative(SRC, f), src: fs.readFileSync(f, 'utf8') }));

// スキーマに定義されているテーブル（db.js に限らず、自分でテーブルを作るサービスも拾う）
const schemaTables = new Set();
for (const { src } of sources) {
  for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi)) {
    schemaTables.add(m[1].toLowerCase());
  }
}

const readers = new Map();
const writers = new Map();
const record = (map, table, file) => {
  if (!map.has(table)) map.set(table, new Set());
  map.get(table).add(file);
};

for (const { file, src } of sources) {
  for (const m of src.matchAll(/\bFROM\s+([a-z_][a-z0-9_]*)/gi)) {
    if (schemaTables.has(m[1].toLowerCase())) record(readers, m[1].toLowerCase(), file);
  }
  for (const m of src.matchAll(/\bJOIN\s+([a-z_][a-z0-9_]*)/gi)) {
    if (schemaTables.has(m[1].toLowerCase())) record(readers, m[1].toLowerCase(), file);
  }
  for (const m of src.matchAll(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([a-z_][a-z0-9_]*)/gi)) {
    if (schemaTables.has(m[1].toLowerCase())) record(writers, m[1].toLowerCase(), file);
  }
  for (const m of src.matchAll(/UPDATE\s+([a-z_][a-z0-9_]*)\s+SET/gi)) {
    if (schemaTables.has(m[1].toLowerCase())) record(writers, m[1].toLowerCase(), file);
  }
  for (const m of src.matchAll(/DELETE\s+FROM\s+([a-z_][a-z0-9_]*)/gi)) {
    if (schemaTables.has(m[1].toLowerCase())) record(writers, m[1].toLowerCase(), file);
  }
}

describe('スキーマのテーブルに書き手がいること', () => {
  test('走査でテーブルとSQLを実際に見つけていること（空振り防止）', () => {
    expect(schemaTables.size).toBeGreaterThan(10);
    expect(readers.size).toBeGreaterThan(5);
    expect(writers.size).toBeGreaterThan(5);
  });

  test('SELECT されるテーブルには書き手が存在すること', () => {
    const orphans = [];
    for (const table of [...schemaTables].sort()) {
      if (!readers.has(table)) continue;      // 読まれていないものは次のテストで見る
      if (writers.has(table)) continue;
      if (READ_ONLY_BY_DESIGN[table]) continue;
      orphans.push(`${table}  <- 読み手: ${[...readers.get(table)].join(', ')}（書き手なし）`);
    }
    expect(orphans).toEqual([]);
  });

  test('読み手も書き手もいないテーブルがスキーマに残っていないこと', () => {
    const unused = [...schemaTables]
      .filter((t) => !readers.has(t) && !writers.has(t) && !READ_ONLY_BY_DESIGN[t])
      .sort();
    expect(unused).toEqual([]);
  });
});
