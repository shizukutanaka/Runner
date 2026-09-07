// NODE_ENV を設定し忘れたときに、安全な側へ倒れることを検査する（E-41）。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// `config.environment` は `process.env.NODE_ENV || 'development'` だった。
// つまり **NODE_ENV を設定し忘れると「開発モード」になる**。
// そして開発モードには次の分岐がある:
//
//   middleware/auth.js       トークンが無い要求を **role:'admin' として通す**
//   middleware/errorHandler  500応答にスタックトレースを載せる
//
// 組み合わせると、`NODE_ENV` を設定せずに本番で `node src/server.js` を実行した瞬間、
// **認証なしで誰でも管理者として全APIを叩ける**。
// Dockerfile と docker-compose は production を明示しているので容器経由は安全だが、
// 「設定し忘れ」が最悪の結果につながる既定値は、それ自体が欠陥である。
//
// 既定値は**分からないときに閉じる側**でなければならない。
// 開発モードが欲しい人は NODE_ENV=development と明示する（nodemon は既にそうしている）。
describe('環境の既定値が安全側であること（E-41）', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;
  const ORIGINAL_ENC = process.env.ENCRYPTION_KEY;

  // production 判定になると validateConfig() が ENCRYPTION_KEY 等の必須
  // シークレットを要求する（これ自体は正しい既存の安全策）。ここで検査したいのは
  // 「NODE_ENV の既定値」と「認証バイパスの発火条件」なので、その必須シークレット
  // 自体は満たしておき、無関係な validateConfig の失敗でテストが落ちないようにする。
  // JWT_SECRET / SESSION_SECRET は tests/setup.js が既に設定済み
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-not-for-production-32chars';
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
    process.env.ENCRYPTION_KEY = ORIGINAL_ENC;
    jest.resetModules();
  });

  it('NODE_ENV が未設定なら production 扱いになる（development ではない）', () => {
    jest.resetModules();
    delete process.env.NODE_ENV;
    // eslint-disable-next-line global-require
    const config = require('../../src/config');
    expect(config.environment).toBe('production');
  });

  it('NODE_ENV 未設定では、トークン無しの要求が管理者として通らない', () => {
    jest.resetModules();
    delete process.env.NODE_ENV;
    // eslint-disable-next-line global-require
    const { authenticateToken } = require('../../src/middleware/auth');

    let status = null;
    let nextCalled = false;
    const req = { headers: {}, cookies: {} };
    const res = {
      status(code) { status = code; return this; },
      json() { return this; }
    };
    authenticateToken(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(status).toBe(401);
    expect(req.user).toBeUndefined();
  });

  it('NODE_ENV=development を明示したときだけ、開発用の通過が働く', () => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    // eslint-disable-next-line global-require
    const { authenticateToken } = require('../../src/middleware/auth');

    let nextCalled = false;
    const req = { headers: {}, cookies: {} };
    const res = { status() { return this; }, json() { return this; } };
    authenticateToken(req, res, () => { nextCalled = true; });

    // 開発者が明示的に選んだ場合の利便性は残す。
    // ただし「意図して選んだ」ことが前提である
    expect(nextCalled).toBe(true);
    expect(req.user.role).toBe('admin');
  });

  it('NODE_ENV=production では通らない', () => {
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    // eslint-disable-next-line global-require
    const { authenticateToken } = require('../../src/middleware/auth');

    let status = null;
    let nextCalled = false;
    const req = { headers: {}, cookies: {} };
    const res = { status(code) { status = code; return this; }, json() { return this; } };
    authenticateToken(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(status).toBe(401);
  });
});
