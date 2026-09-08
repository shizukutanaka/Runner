// `.env.example` に書かれたキーと、コードが実際に読むキーが
// 両方向で一致することを保証する。
//
// ---------------------------------------------------------------------------
// なぜこのテストが必要か
// ---------------------------------------------------------------------------
// 監査時点で `.env.example` の **139キー中84キー（60%）がどこからも読まれて
// いなかった**。GDPR設定一式、サーキットブレーカー、アラート閾値、
// CSRF/2FA/セッションハイジャック検知のトグル、削除済み課金機能の20キーなど。
// 利用者は `ALERT_CPU_USAGE` や `GDPR_DATA_RETENTION_COMMENTS` を設定して、
// 何も起きないことに気づけない。
//
// 同種の腐敗は「機能を削除したのに設定例に残る」形で必ず再発する
// （実際、課金機能を削除した後もStripeの20キーが残っていた）。
// 人手の再監査に頼らず、機械が落とすようにする。
//
// E-52: 上の「書かれているキーが読まれるか」だけを`source.includes(k)`という
// **裸の部分文字列一致**で判定していたのは、実は片方向のガードとしても甘かった。
// `.includes()`はキー名が別の単語の一部としてたまたま出現しただけでも
// 「参照あり」と誤判定する（deadExports.test.jsで見つかったのと同じ形の穴、E-51）。
// 実例: 架空のキー`SUPPORT_EMAIL`（当時は`.env.example`に無かった）で試したところ、
// たまたま`settingsController.js`に本物の`process.env.SUPPORT_EMAIL`があったため
// 偶然「参照あり」を返した——これは本物の参照だったが、原理上は無関係な文字列が
// 部分一致しただけでも同じ結果になりうる。`process.env.KEY`／`getEnv('KEY'`という
// **実際のアクセス形**でしか「参照あり」と認めないよう厳格化した。
//
// この過程で**逆方向の欠落**も見つかった。コードは`process.env.SMTP_HOST`等
// **19個のキー**を実際に読んでいるのに、`.env.example`には一度も書かれていなかった
// （SMTP_*・SESSION_REDIS_*・SESSION_NAME・BCRYPT_ROUNDS・DATABASE_URL・
// TRUST_PROXY・ALLOWED_ORIGINS等）。利用者はこれらの存在を知りようがなく、
// 設定例のコメントが`ALLOWED_ORIGINS`を指示していながら、そのキー自体は
// 設定例に存在しないという矛盾も起きていた。「書かれているキーは読まれる」
// だけでなく「読まれるキーは書かれている」も機械検査する
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', '..', 'src');
const ENV_EXAMPLE = path.join(__dirname, '..', '..', '.env.example');

const collectJsFiles = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') collectJsFiles(full, acc);
    } else if (entry.name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
};

const envKeys = () => fs.readFileSync(ENV_EXAMPLE, 'utf8')
  .split('\n')
  .map((line) => line.trim().match(/^([A-Z][A-Z0-9_]*)=/))
  .filter(Boolean)
  .map((m) => m[1]);

// 実際のアクセス形（`process.env.KEY` / `process.env['KEY']` / `getEnv('KEY'`）に
// 一致するキーだけを「読まれている」とみなす。裸の部分文字列一致はしない
const readEnvKeysFromSource = (files) => {
  const found = new Map(); // KEY -> Set<file>
  const add = (key, file) => {
    if (!found.has(key)) found.set(key, new Set());
    found.get(key).add(file);
  };
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) add(m[1], file);
    for (const m of text.matchAll(/process\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g)) add(m[1], file);
    for (const m of text.matchAll(/getEnv\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g)) add(m[1], file);
  }
  return found;
};

describe('.env.example が現実と一致していること', () => {
  const files = collectJsFiles(SRC_DIR);
  const keys = envKeys();
  const readKeys = readEnvKeysFromSource(files);

  it('キーが1つ以上ある（ファイルの読み取り自体が壊れていないことの確認）', () => {
    expect(keys.length).toBeGreaterThan(10);
  });

  it('走査でキーの参照を実際に見つけていること（空振り防止）', () => {
    expect(readKeys.size).toBeGreaterThan(10);
    expect(readKeys.has('JWT_SECRET')).toBe(true);
  });

  it('すべてのキーが backend/src のどこかから、実際のアクセス形で読まれている', () => {
    const unused = keys.filter((k) => !readKeys.has(k));
    // 失敗時にどのキーが浮いているか分かるようにする
    expect(unused).toEqual([]);
  });

  it('backend/src が読むキーは、すべて .env.example に書かれている', () => {
    const documented = new Set(keys);
    const undocumented = [...readKeys.keys()]
      .filter((k) => !documented.has(k))
      .sort()
      .map((k) => `${k}  <- ${[...readKeys.get(k)].map((f) => path.relative(SRC_DIR, f)).join(', ')}`);
    expect(undocumented).toEqual([]);
  });

  it('削除済み機能の設定が残っていない（課金・マルチテナント）', () => {
    const removed = keys.filter((k) => /^STRIPE_|TENANT/.test(k));
    expect(removed).toEqual([]);
  });

  it('秘密鍵の例が空である（うっかり値を配らない）', () => {
    const content = fs.readFileSync(ENV_EXAMPLE, 'utf8');
    ['JWT_SECRET', 'SESSION_SECRET', 'ENCRYPTION_KEY'].forEach((k) => {
      expect(content).toMatch(new RegExp(`^${k}=\\s*$`, 'm'));
    });
  });
});
