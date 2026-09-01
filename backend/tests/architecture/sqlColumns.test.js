// SQLが参照する列がスキーマに存在すること（単一テーブルのクエリに限る）。
//
// ---------------------------------------------------------------------------
// なぜテーブル検査だけでは足りなかったか
// ---------------------------------------------------------------------------
// E-29 で「SQLが参照するテーブルはスキーマに存在すること」を機械検査にした。
// その直後に E-30 が出た:
//
//   SELECT DATE(created_at) ... FROM comments WHERE created_at >= ?
//
// `comments` は実在する。だが `created_at` という列は無い（実体は `timestamp`）。
// このため監視ダッシュボードの「アプリケーション統計」は毎回500で、
// **一度も表示されたことがなかった**。テーブル名だけ見るガードは素通りさせる。
//
// ---------------------------------------------------------------------------
// なぜ「単一テーブル」に限るのか
// ---------------------------------------------------------------------------
// JOIN があると、列がどちらのテーブルのものか静的には決めきれない。
// 曖昧なものまで拾うと誤検知が増え、**誤検知の多いガードは無視されて死ぬ**。
// 確実に判定できる範囲だけを検査し、それ以外は見送る。
// 見送った分は E-29 の実エンドポイント検査（missingTables.test.js）で拾う。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const collect = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') collect(p, acc);
    } else if (entry.name.endsWith('.js')) acc.push(p);
  }
  return acc;
};

const srcFiles = collect(path.join(ROOT, 'src'));

// スキーマ: CREATE TABLE 本体の列 + ensureColumnDefinitions による後付けの列
const buildSchema = () => {
  const tables = new Map();
  for (const p of srcFiles) {
    const src = fs.readFileSync(p, 'utf8');

    for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\s*\);/g)) {
      const cols = new Set(tables.get(m[1]) || []);
      for (const line of m[2].split('\n')) {
        const col = line.trim().match(/^([a-z_][a-z0-9_]*)\s+/i);
        if (!col) continue;
        const name = col[1].toUpperCase();
        // 制約行（PRIMARY KEY (...), FOREIGN KEY ..., UNIQUE(...)）は列ではない
        if (['PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT'].includes(name)) continue;
        cols.add(col[1].toLowerCase());
      }
      tables.set(m[1], cols);
    }

    for (const m of src.matchAll(/ensureColumnDefinitions\('(\w+)',\s*\[([\s\S]*?)\n\s*\]\)/g)) {
      const cols = new Set(tables.get(m[1]) || []);
      for (const c of m[2].matchAll(/name:\s*'(\w+)'/g)) cols.add(c[1].toLowerCase());
      tables.set(m[1], cols);
    }
  }
  return tables;
};

const SCHEMA = buildSchema();

// SQL 予約語・関数名など、列名として扱ってはいけないもの
const NOT_COLUMNS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'as', 'by',
  'group', 'order', 'limit', 'offset', 'desc', 'asc', 'case', 'when', 'then',
  'else', 'end', 'count', 'sum', 'avg', 'min', 'max', 'distinct', 'date',
  'datetime', 'like', 'between', 'set', 'values', 'into', 'insert', 'update',
  'delete', 'join', 'left', 'inner', 'on', 'having', 'union', 'all', 'length',
  'coalesce', 'cast', 'strftime', 'json_extract', 'lower', 'upper', 'round',
  'now', 'current_timestamp', 'default', 'replace', 'conflict', 'do', 'nothing',
  'abs', 'ifnull', 'nullif', 'substr', 'trim', 'total', 'group_concat',
  'julianday', 'printf', 'instr', 'iif', 'random', 'hex', 'typeof'
]);

const STRINGS = /`([^`]*)`|'([^'\n]*)'|"([^"\n]*)"/g;

it('スキーマを読めている（テスト自体が空振りしていないこと）', () => {
  expect(SCHEMA.size).toBeGreaterThan(10);
  expect(SCHEMA.get('comments').has('timestamp')).toBe(true);
  // 後付けの列も拾えていること
  expect(SCHEMA.get('comments').has('author_channel_id')).toBe(true);
});

it('単一テーブルのSQLが参照する列はスキーマに存在する', () => {
  const offenders = [];

  for (const p of srcFiles) {
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(STRINGS)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      if (!/^\s*SELECT\b/i.test(raw)) continue;

      // `${whereClause}` のような差し込みと、SQL内の文字列リテラル
      // （`WHEN status = 'active'` の 'active'）は列名ではない。
      // 消してから識別子を拾わないと、その中身を列と誤認する
      const sql = raw
        .replace(/\$\{[^}]*\}/g, ' ')
        .replace(/'[^']*'/g, ' ')
        .replace(/"[^"]*"/g, ' ');

      // FROM が1つ、JOIN もサブクエリも別名も無いものだけを見る
      const froms = [...sql.matchAll(/\bFROM\s+([a-z_][a-z0-9_]*)/gi)];
      if (froms.length !== 1) continue;
      if (/\bJOIN\b/i.test(sql)) continue;
      // テーブル別名（`FROM comments c`）は列の所属が曖昧になるので見送る。
      // ただし `FROM comments WHERE ...` の WHERE を別名と誤認しないこと——
      // ここを素朴に書くと**検査対象がほぼ空になり、ガードが常に通る**
      if (/\bFROM\s+[a-z_][a-z0-9_]*\s+(?!WHERE|GROUP|ORDER|LIMIT|HAVING|UNION|JOIN|LEFT|INNER|ON|AS\b)[a-z_]/i.test(sql)) continue;
      if (sql.includes('(SELECT')) continue;

      const table = froms[0][1].toLowerCase();
      const cols = SCHEMA.get(table);
      if (!cols) continue; // テーブル自体の不在は E-29 のガードの担当

      // `AS x` で定義した別名は列ではない。しかも `GROUP BY x` / `ORDER BY x` と
      // 後から再登場するので、**クエリ全体の別名を先に集めてから**除外する
      const aliases = new Set(
        [...sql.matchAll(/\bAS\s+([a-z_][a-z0-9_]*)/gi)].map((a) => a[1].toLowerCase())
      );

      for (const idm of sql.matchAll(/\b([a-z_][a-z0-9_]*)\b/gi)) {
        const id = idm[1].toLowerCase();
        if (NOT_COLUMNS.has(id) || id === table) continue;
        if (aliases.has(id)) continue;      // このクエリ内で定義された別名
        if (SCHEMA.has(id)) continue;       // 他のテーブル名
        if (cols.has(id)) continue;         // 実在する列
        offenders.push(`${path.relative(ROOT, p)} → ${table}.${id}`);
      }
    }
  }

  expect([...new Set(offenders)]).toEqual([]);
});
