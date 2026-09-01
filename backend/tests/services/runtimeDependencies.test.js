// backend/src が require するパッケージが、すべて dependencies に宣言されていることを保証する。
//
// ---------------------------------------------------------------------------
// なぜこのテストが必要か（実害が2件出た）
// ---------------------------------------------------------------------------
// 代替ベースでのコンテナビルド検証（E-24）で、本番インストール
// （`npm ci --omit=dev`）のイメージが**起動即クラッシュ**することが分かった。
// 原因は `cookie-parser` と `ws` が dependencies に無かったこと。
// 開発環境では devDependencies の推移的依存として node_modules に存在するため
// 誰も気づかない——「手元では動くが本番では死ぬ」の典型形である。
// さらに `connect-redis` も未宣言で、compose が設定する SESSION_STORE=redis は
// **一度も実際に機能したことがなかった**（try/catchで静かにメモリへフォールバック）。
//
// このクラスのバグはテスト環境（devDependenciesが全部ある）では原理的に
// 検出できないため、宣言の照合そのものを検査する。
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const pkg = require('../../package.json');

const BUILTINS = new Set(require('module').builtinModules);

const collectRequires = (dir, found = new Set()) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { collectRequires(full, found); continue; }
    if (!e.name.endsWith('.js')) continue;
    const code = fs.readFileSync(full, 'utf8')
      // コメント行の require は対象外（例: backupService の `// const AWS = require('aws-sdk')`）
      .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    for (const m of code.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('node:')) continue;
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!BUILTINS.has(name)) found.add(name);
    }
  }
  return found;
};

describe('実行時依存が dependencies に揃っていること', () => {
  const used = collectRequires(SRC);
  const declared = new Set(Object.keys(pkg.dependencies || {}));

  it('src/ の require が1つ以上検出できている（検査自体の健全性）', () => {
    expect(used.size).toBeGreaterThan(10);
  });

  it('src/ が require する全パッケージが dependencies に宣言されている', () => {
    // 意図的な例外: @socket.io/redis-adapter は複数インスタンス間スケーリング用で、
    // 本製品は単一インスタンス専用（DEPLOYMENT_GUIDE.md 冒頭）。websocketScaling.js は
    // try/catch で明示的に単一インスタンスモードへフォールバックする設計であり、
    // 使ってはいけない機能のために依存を増やさない
    const INTENTIONALLY_ABSENT = new Set(['@socket.io/redis-adapter']);
    const missing = [...used].filter((p) => !declared.has(p) && !INTENTIONALLY_ABSENT.has(p)).sort();
    expect(missing).toEqual([]);
  });

  it('本番起動を壊した2件が宣言されている（回帰の名指し）', () => {
    ['cookie-parser', 'ws', 'connect-redis'].forEach((p) => {
      expect(declared.has(p)).toBe(true);
    });
  });

  it('prepare スクリプトが存在しない（--omit=dev インストールを壊すため）', () => {
    // "prepare": "husky install" は devDependency の husky を呼ぶため、
    // `npm ci --omit=dev` が exit 127 で必ず失敗していた（実測）。
    // フックを配線する .husky/ も存在せず、開発でも何もしていなかった
    expect(pkg.scripts.prepare).toBeUndefined();
  });
});
