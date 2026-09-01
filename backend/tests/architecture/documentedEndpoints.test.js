// API_DOCUMENTATION.md に載っているエンドポイントが実在すること。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// E-29 で通知のテンプレート／チャネル／イベント系7エンドポイントを削除し、
// 逆に notifications の既読化はドキュメントが `POST /:id/read` と書いていたのに
// 実装は `PUT /:id/read` だった（**ドキュメントの通りに叩くと404**）。
//
// 「実装は変えたがドキュメントは直し忘れた」を人間の注意力で防ぐのは無理なので、
// 突き合わせを機械にやらせる。
//
// なお `docs/FEATURE_AUDIT.md` や `docs/SUPERSEDED_SUMMARIES.md` が
// 存在しないファイルに言及しているのは**正しい**（何を削除したかの記録である）。
// ここで検査するのは「今こう使える」と書いている API_DOCUMENTATION.md だけ。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

// ドキュメントから `**METHOD `/api/...`**` の形を拾う（GET / PUT のような併記も割る）
const documented = () => {
  const md = fs.readFileSync(path.join(ROOT, 'API_DOCUMENTATION.md'), 'utf8');
  const out = [];
  for (const m of md.matchAll(/\*\*((?:GET|POST|PUT|PATCH|DELETE)(?:\s*\/\s*(?:GET|POST|PUT|PATCH|DELETE))*)\s+`(\/api\/[^`]+)`\*\*/g)) {
    for (const verb of m[1].split('/').map((v) => v.trim()).filter(Boolean)) {
      out.push({ verb, route: m[2] });
    }
  }
  return out;
};

// 実装側: routes/*.js の router.VERB('path') を、app.js のマウント先と合わせる
const implemented = () => {
  const app = fs.readFileSync(path.join(ROOT, 'backend/src/app.js'), 'utf8');
  const mounts = new Map(); // routerVariable -> mount path
  for (const m of app.matchAll(/app\.use\('(\/api\/[^']*)',\s*(\w+)/g)) {
    mounts.set(m[2], m[1]);
  }
  const varToFile = new Map();
  for (const m of app.matchAll(/const (\w+) = require\('\.\/routes\/(\w+)'\)/g)) {
    varToFile.set(m[1], m[2]);
  }
  // `app.use('/api/x', require('./routes/x'))` のインライン形式も拾う。
  // 変数経由だけを見ていると monitoring の12エンドポイントを丸ごと見落とす
  for (const m of app.matchAll(/app\.use\('(\/api\/[^']*)',\s*require\('\.\/routes\/(\w+)'\)\)/g)) {
    mounts.set(`__inline_${m[2]}`, m[1]);
    varToFile.set(`__inline_${m[2]}`, m[2]);
  }

  const set = new Set();
  for (const [variable, mount] of mounts) {
    const file = varToFile.get(variable);
    if (!file) continue;
    const p = path.join(ROOT, 'backend/src/routes', `${file}.js`);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      const full = `${mount}${m[2] === '/' ? '' : m[2]}`.replace(/\/$/, '') || mount;
      set.add(`${m[1].toUpperCase()} ${full}`);
    }
  }
  return set;
};

// `:id` の名前はドキュメントと実装で揺れるので正規化して比べる
const normalise = (key) => key.replace(/:[A-Za-z0-9_]+/g, ':param');

it('ドキュメントと実装の両方を読めている（テスト自体が空振りしていないこと）', () => {
  expect(documented().length).toBeGreaterThan(30);
  expect(implemented().size).toBeGreaterThan(30);
});

it('ドキュメントに載っているエンドポイントはすべて実在する', () => {
  const live = new Set([...implemented()].map(normalise));
  const missing = documented()
    .map(({ verb, route }) => `${verb} ${route}`)
    .filter((key) => !live.has(normalise(key)));
  // 失敗したら: 実装を消したならドキュメントからも消す。
  // メソッドが違うだけなら、**叩けるのは実装の方**なのでドキュメントを直す
  expect(missing).toEqual([]);
});
