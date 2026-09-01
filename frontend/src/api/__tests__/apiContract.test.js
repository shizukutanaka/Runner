import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// フロントが叩くURLが、バックエンドに実在するルートと一致することを保証する。
//
// ---------------------------------------------------------------------------
// なぜこのテストが必要か
// ---------------------------------------------------------------------------
// フロント・バックエンド間の契約は**どちらのテストも通るのに壊れている**ことがある。
// 実際にこのリポジトリで2件の実害が出ている:
//   - E-15: `/comments/summary` の戻り値の形が想定と違い、ダッシュボードが
//     ホワイトスクリーンでクラッシュした（Reactがオブジェクトを子として描画できず全滅）
//   - 監査時点で `searchComments` / `getCommentStats` / `moderateComment` /
//     `addCommentReaction` / `addCommentTag` の5関数が、**存在しないエンドポイント**を
//     叩いていた（UIから未使用だったため誰も気づかなかった）。呼べば必ず404
//
// URLの綴りひとつで壊れる結合を、機械的に照合する。
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BACKEND = path.join(ROOT, 'backend');

const backendRoutes = () => {
  const app = fs.readFileSync(path.join(BACKEND, 'src/app.js'), 'utf8');
  const vars = {};
  for (const m of app.matchAll(/const (\w+) = require\('\.\/routes\/(\w+)'\)/g)) vars[m[1]] = m[2];

  const mounts = [];
  for (const m of app.matchAll(/app\.use\(\s*'(\/api\/[^']+)'\s*,\s*(\w+)\s*\)/g)) {
    if (vars[m[2]]) mounts.push([m[1], vars[m[2]]]);
  }
  for (const m of app.matchAll(/app\.use\(\s*'(\/api\/[^']+)'\s*,\s*require\('\.\/routes\/(\w+)'\)\s*\)/g)) {
    mounts.push([m[1], m[2]]);
  }

  const routes = new Set();
  for (const [prefix, file] of mounts) {
    const p = path.join(BACKEND, 'src/routes', `${file}.js`);
    if (!fs.existsSync(p)) continue;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      const full = (prefix + m[2]).replace(/\/\//g, '/').replace(/\/$/, '') || '/';
      routes.add(`${m[1].toUpperCase()} ${full.replace(/:[A-Za-z_]+/g, ':p')}`);
    }
  }
  return routes;
};

const frontendCalls = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'mocks') continue;
      frontendCalls(full, out);
      continue;
    }
    if (!/\.(js|jsx)$/.test(e.name)) continue;
    const code = fs.readFileSync(full, 'utf8');
    for (const m of code.matchAll(/axios\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]*)/g)) {
      const url = m[2]
        .replace('${API_BASE_URL}', '/api')
        .replace('${API}', '/api')
        .replace(/\$\{[^}]+\}/g, ':p')
        .split('?')[0]
        .replace(/\/$/, '');
      if (url.startsWith('/api')) out.push({ call: `${m[1].toUpperCase()} ${url}`, file: e.name });
    }
  }
  return out;
};

describe('フロント・バックエンドのAPI契約', () => {
  const routes = backendRoutes();
  const calls = frontendCalls(path.resolve(__dirname, '..', '..'));

  it('バックエンドのルートを収集できている（検査自体の健全性）', () => {
    expect(routes.size).toBeGreaterThan(50);
  });

  it('フロントの呼び出しを収集できている（検査自体の健全性）', () => {
    expect(calls.length).toBeGreaterThan(20);
  });

  it('フロントが叩く全URLがバックエンドに実在する', () => {
    const missing = [...new Set(
      calls.filter((c) => !routes.has(c.call)).map((c) => `${c.call}  (${c.file})`)
    )].sort();
    expect(missing).toEqual([]);
  });
});
