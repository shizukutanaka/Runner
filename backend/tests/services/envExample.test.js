// `.env.example` に書かれたキーが、実際にコードから読まれることを保証する。
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
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', '..', 'src');
const ENV_EXAMPLE = path.join(__dirname, '..', '..', '.env.example');

const readSourceTree = (dir) => {
  let out = '';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out += readSourceTree(full);
    else if (entry.name.endsWith('.js')) out += fs.readFileSync(full, 'utf8');
  }
  return out;
};

const envKeys = () => fs.readFileSync(ENV_EXAMPLE, 'utf8')
  .split('\n')
  .map((line) => line.trim().match(/^([A-Z][A-Z0-9_]*)=/))
  .filter(Boolean)
  .map((m) => m[1]);

describe('.env.example が現実と一致していること', () => {
  const source = readSourceTree(SRC_DIR);
  const keys = envKeys();

  it('キーが1つ以上ある（ファイルの読み取り自体が壊れていないことの確認）', () => {
    expect(keys.length).toBeGreaterThan(10);
  });

  it('すべてのキーが backend/src のどこかから読まれている', () => {
    const unused = keys.filter((k) => !source.includes(k));
    // 失敗時にどのキーが浮いているか分かるようにする
    expect(unused).toEqual([]);
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
