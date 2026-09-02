// フロントエンドの「書いたが誰も import しない」API関数を機械的に検出する。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// バックエンドには E-28 以来 `tests/architecture/deadExports.test.js` があるが、
// フロントエンドには同じ規則が無かった。その結果 E-33 の時点で
// `src/api/` に **一度も import されない関数が29個**（333行）残っていた。
// 大半は `api/settings.js` の個別設定API（setTheme / setPinLimit / setBanReason …）で、
// 画面は汎用の `updateSettings` 一本しか使っていない。
//
// 未使用コードは無害ではない。読んだ人が「この機能は画面から使える」と信じる。
// 実際には対応するUIが存在しないので、繋がっているのは関数名だけである。
//
// ---------------------------------------------------------------------------
// 規則
// ---------------------------------------------------------------------------
// **`src/api/` と `src/hooks/` の名前つきエクスポートは、どこかから import されること。**
//
// 名前の grep ではなく **import 文を解析する**。これは意図的である。
// 設計中、名前一致で数えていたときに `api/settings.js` の `setTimezone` が
// `utils/localeManager.js` の**無関係な同名メソッド**に一致し、
// 未使用なのに「使用中」と判定されていた。
// ガードは「通ること」ではなく「本物の不具合で落ちること」で検証すること。
//
// 対応する import の形は3つ:
//   1. `import { x } from './api/settings'`
//   2. `const { x } = await import('./auth')`（循環import回避の動的import）
//   3. `vi.mock('./api/moderation', ...)`（モジュールごと差し替えるテスト）
import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const SCAN_DIRS = ['api', 'hooks'];

const collect = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') collect(p, acc);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
};

// 拡張子を落としてモジュールの同一性キーにする
const moduleKey = (file) => file.replace(/\.(js|jsx)$/, '');

const importedNamesByModule = (files) => {
  const map = new Map();
  const add = (target, names) => {
    if (!map.has(target)) map.set(target, new Set());
    names.forEach((n) => map.get(target).add(n));
  };

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const dir = path.dirname(file);

    const named = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = named.exec(src))) {
      const names = m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      add(moduleKey(path.resolve(dir, m[2])), names);
    }

    const dynamic = /(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = dynamic.exec(src))) {
      const names = m[1].split(',').map((n) => n.trim().split(':')[0].trim()).filter(Boolean);
      add(moduleKey(path.resolve(dir, m[2])), names);
    }

    const mocked = /vi\.mock\(\s*['"]([^'"]+)['"]/g;
    while ((m = mocked.exec(src))) {
      add(moduleKey(path.resolve(dir, m[1])), ['*MODULE_MOCKED*']);
    }
  }
  return map;
};

describe('src/api と src/hooks に import されないエクスポートが無いこと', () => {
  const allFiles = collect(SRC);
  const targets = SCAN_DIRS.flatMap((d) => collect(path.join(SRC, d)));

  test('走査対象が空でないこと（ガードが空振りしていないこと）', () => {
    expect(allFiles.length).toBeGreaterThan(20);
    expect(targets.length).toBeGreaterThan(3);
  });

  test('すべての名前つきエクスポートがどこかから import されていること', () => {
    const imported = importedNamesByModule(allFiles);
    const orphans = [];

    for (const file of targets) {
      const used = imported.get(moduleKey(file)) || new Set();
      if (used.has('*MODULE_MOCKED*')) continue;
      const src = fs.readFileSync(file, 'utf8');
      const exp = /^export\s+(?:const|function|async function)\s+([A-Za-z0-9_]+)/gm;
      let m;
      while ((m = exp.exec(src))) {
        if (!used.has(m[1])) {
          orphans.push(`${path.relative(SRC, file)} :: ${m[1]}`);
        }
      }
    }

    expect(orphans).toEqual([]);
  });
});
