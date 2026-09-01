// 「書いたが誰も呼ばない」コードを機械的に検出する。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// 本セッションで同じ形の欠陥を4度見つけている:
//
//   E-18  `config/index.js`（406行）— Node の解決順で `config.js` が勝つため死んでいた
//   E-20  `.env.example` の6割 — 設定しても読む側が居なかった
//   E-27  レートリミッタ8種のうち6種 — 一度も mount されていなかった
//   E-28  commentsController の15ハンドラ（1,410行）— ルート無し、かつ
//         参照している8テーブルがスキーマに存在しない
//
// 未使用コードは「無害な余分」ではない。読んだ人が
// 「この機能はある（あとは繋ぐだけ）」と信じる。E-28 の通報機能は
// テーブルが無いので繋いでも動かないが、コードだけ見れば完成して見えた。
//
// そこで、**src の公開エクスポートは src か tests のどこかから参照されること**を
// 規則にする。参照されないものは削除するか、内部関数に降格すること。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

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

const srcFiles = collect(path.join(ROOT, 'src'));
const allFiles = [...srcFiles, ...collect(path.join(ROOT, 'tests'))];
const texts = new Map(allFiles.map((p) => [p, fs.readFileSync(p, 'utf8')]));

// `exports.foo =` と `module.exports = { foo, bar }` の両方を拾う
const exportedNames = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/^exports\.(\w+)\s*=/gm)) names.add(m[1]);
  const block = src.match(/module\.exports\s*=\s*\{([^}]*)\}/);
  if (block) {
    for (const part of block[1].split(',')) {
      const name = part.split(':')[0].trim();
      if (/^\w+$/.test(name)) names.add(name);
    }
  }
  return [...names];
};

const referencedElsewhere = (name, ownPath) => {
  const re = new RegExp(`\\b${name}\\b`);
  for (const [p, text] of texts) {
    if (p === ownPath) continue;
    if (re.test(text)) return true;
  }
  return false;
};

it('走査対象が存在する（テスト自体が空振りしていないこと）', () => {
  expect(srcFiles.length).toBeGreaterThan(30);
});

describe('src の公開エクスポートは必ずどこかから参照される', () => {
  it('参照されないエクスポートが無い', () => {
    const offenders = [];
    for (const p of srcFiles) {
      for (const name of exportedNames(texts.get(p))) {
        if (!referencedElsewhere(name, p)) {
          offenders.push(`${path.relative(ROOT, p)} → ${name}`);
        }
      }
    }
    // 失敗したら: そのエクスポートを削除するか、
    // module.exports から外して内部関数に降格する。
    // 「将来使うかもしれない」は理由にならない（git log に残る）
    expect(offenders).toEqual([]);
  });
});

describe('SQLで参照するテーブルがスキーマに存在すること', () => {
  // E-28 の15ハンドラは、存在しない8テーブルを参照していた。
  // ルーティングされていなかったので誰も気づかなかったが、
  // 繋いだ瞬間に "no such table" で落ちる代物だった。
  //
  // 走査対象は**SQLらしき文字列リテラルの中だけ**に限る。
  // ソース全体を素朴に走査すると、コメントの日本語混じりの英文
  // （"UPDATE user ..."）や `Object.entries(of)` のような並びを
  // テーブル名と誤認する。誤検知だらけのガードは、いずれ無視されて死ぬ。
  const CREATE_TABLE = /CREATE TABLE IF NOT EXISTS (\w+)/g;
  const known = new Set();
  for (const p of srcFiles) {
    for (const m of texts.get(p).matchAll(CREATE_TABLE)) known.add(m[1]);
  }
  // `ON CONFLICT(...) DO UPDATE SET` の SET はテーブル名ではない
  const IGNORED = new Set(['sqlite_master', 'sqlite_sequence', 'set']);

  it('スキーマを読めている（テスト自体が空振りしていないこと）', () => {
    expect(known.size).toBeGreaterThan(10);
    expect(known.has('comments')).toBe(true);
  });

  it('存在しないテーブルを参照している箇所が無い', () => {
    // SQL文らしい文字列（SELECT/INSERT/UPDATE/DELETE で始まる）だけを見る
    const STRINGS = /`([^`]*)`|'([^'\n]*)'|"([^"\n]*)"/g;
    const SQL_HEAD = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i;
    const offenders = [];
    for (const p of srcFiles) {
      const missing = new Set();
      for (const m of texts.get(p).matchAll(STRINGS)) {
        const literal = m[1] ?? m[2] ?? m[3] ?? '';
        if (!SQL_HEAD.test(literal)) continue;
        for (const t of literal.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_]*)/gi)) {
          const table = t[1].toLowerCase();
          if (!known.has(table) && !IGNORED.has(table)) missing.add(table);
        }
      }
      if (missing.size) offenders.push(`${path.relative(ROOT, p)} → ${[...missing].join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });
});
