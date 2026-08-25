// D-7: 認証トークンを httpOnly Cookie で持たせる + CSRF対策。
//
// 以前はフロントが sessionStorage にトークンを置いていたため、XSSが一度でも
// 成立すればトークンをそのまま持ち出せた。httpOnly Cookie はJSから読めない。
//
// ---------------------------------------------------------------------------
// このテストが守る最重要の不変条件
// ---------------------------------------------------------------------------
// **Cookie認証とCSRF対策はセットでなければならない。**
// これまでCSRF対策が不要だったのは、認証が Authorization ヘッダーだけで成立して
// いたからである（ブラウザはクロスサイトで自動付与しない）。Cookieは自動付与される
// ため、Cookie認証を入れた瞬間に全ての状態変更エンドポイントがCSRF可能になる。
// 片方だけを残す変更が入ったらここで落ちる。
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

const CRED = { username: 'cookieuser', email: 'cookie@example.com', password: 'Passw0rd!x9AB' };
const ALLOWED_ORIGIN = 'http://localhost:5173'; // config.security.allowedOrigins の既定値

const cookieHeader = (res) => (res.headers['set-cookie'] || []);
const cookieNamed = (res, name) => cookieHeader(res).find((c) => c.startsWith(`${name}=`));
const jarFrom = (res) => cookieHeader(res).map((c) => c.split(';')[0]).join('; ');

describe('httpOnly Cookie 認証とCSRF対策（D-7）', () => {
  let loginRes;

  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await request(app).post('/api/users/register').send(CRED);
    loginRes = await request(app)
      .post('/api/users/login')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ username: CRED.username, password: CRED.password });
  }, 30000);

  afterAll(async () => {
    if (db && db.closeDatabase) await db.closeDatabase();
  });

  describe('Cookieの発行', () => {
    it('ログインは access_token と refresh_token を発行する', () => {
      expect(loginRes.status).toBe(200);
      expect(cookieNamed(loginRes, 'access_token')).toBeDefined();
      expect(cookieNamed(loginRes, 'refresh_token')).toBeDefined();
    });

    it('両方とも HttpOnly かつ SameSite=Strict である', () => {
      ['access_token', 'refresh_token'].forEach((name) => {
        const c = cookieNamed(loginRes, name);
        expect(c).toMatch(/HttpOnly/i);
        expect(c).toMatch(/SameSite=Strict/i);
      });
    });

    it('応答本文にもトークンを残す（APIクライアント互換のため）', () => {
      expect(loginRes.body.token).toBeTruthy();
      expect(loginRes.body.refreshToken).toBeTruthy();
    });
  });

  describe('Cookieだけで認証できること', () => {
    it('Authorizationヘッダー無しでもCookieで認証される', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Cookie', jarFrom(loginRes));
      expect(res.status).toBe(200);
      expect(res.body.username).toBe(CRED.username);
    });

    it('Cookieもヘッダーも無ければ401', async () => {
      expect((await request(app).get('/api/users/me')).status).toBe(401);
    });

    it('Authorizationヘッダー経路も引き続き使える（移行中の互換）', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${loginRes.body.token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('CSRF対策（Cookie認証と必ずセットであること）', () => {
    it('信頼できないOriginからのCookie付き状態変更は403で拒否される', async () => {
      const res = await request(app)
        .post('/api/users/logout')
        .set('Cookie', jarFrom(loginRes))
        .set('Origin', 'https://evil.example')
        .send({});
      expect(res.status).toBe(403);
    });

    it('Refererが信頼できない場合も拒否される（Originが無いケース）', async () => {
      const res = await request(app)
        .post('/api/users/logout')
        .set('Cookie', jarFrom(loginRes))
        .set('Referer', 'https://evil.example/attack.html')
        .send({});
      expect(res.status).toBe(403);
    });

    it('許可されたOriginからは通る', async () => {
      const fresh = await request(app)
        .post('/api/users/login')
        .set('Origin', ALLOWED_ORIGIN)
        .send({ username: CRED.username, password: CRED.password });
      const res = await request(app)
        .post('/api/users/logout')
        .set('Cookie', jarFrom(fresh))
        .set('Origin', ALLOWED_ORIGIN)
        .send({});
      expect(res.status).toBe(200);
    });

    // 実測して分かったこと: このアプリには csrfGuard より前段に
    // `validateOrigin`（middleware/security.js）があり、**メソッドや認証方式に関係なく**
    // 許可外Originのリクエストを弾く。csrfGuard はその内側の二重防御であって、
    // 最初の壁ではない。以下の2件はその前段の挙動を固定するもの。
    it('許可外OriginからのGETも前段のvalidateOriginが弾く（csrfGuardより厳しい）', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Cookie', jarFrom(loginRes))
        .set('Origin', 'https://evil.example');
      expect(res.status).toBe(403);
    });

    it('ヘッダー認証でも許可外Originなら前段で弾かれる', async () => {
      // 弾かれる側の確認なのでログアウトは成立しない＝トークンは消費されない
      const res = await request(app)
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .set('Origin', 'https://evil.example')
        .send({});
      expect(res.status).toBe(403);
    });
  });

  // 注意: ログインは `limiters.auth`（15分で5回）で保護されている。
  // このリミッターは middleware/rateLimiter.js 側にあり、
  // middleware/security.js と違って `config.rateLimit.enabled` を見ずに**常に有効**である。
  // そのためテスト環境でもログイン回数を抑える必要がある（実際に6回目が429になった）。
  // 以下はログイン回数が5回を超えないように構成してある。

  describe('リフレッシュ（ログアウトより先に検証する。ログアウトはトークンを無効化するため）', () => {
    it('Cookie のリフレッシュトークンだけで更新できる（本文不要）', async () => {
      // ログアウトは `refresh_token_hash` を NULL にするため、
      // **そのアカウントの全リフレッシュトークンが無効になる**。
      // 先行テストのログアウトで beforeAll のトークンは既に死んでいるので、
      // ここでは新しく発行し直す（ログイン回数は合計5回＝上限ちょうど）
      const fresh = await request(app)
        .post('/api/users/login')
        .set('Origin', ALLOWED_ORIGIN)
        .send({ username: CRED.username, password: CRED.password });
      const res = await request(app)
        .post('/api/users/refresh')
        .set('Cookie', jarFrom(fresh))
        .set('Origin', ALLOWED_ORIGIN)
        .send({});
      expect(res.status).toBe(200);
      expect(cookieNamed(res, 'access_token')).toBeDefined();
      // ローテーションされた新しいリフレッシュトークンで差し替わる
      expect(cookieNamed(res, 'refresh_token')).toBeDefined();
    });
  });

  describe('ログアウト', () => {
    it('Cookieを失効させる', async () => {
      const fresh = await request(app)
        .post('/api/users/login')
        .set('Origin', ALLOWED_ORIGIN)
        .send({ username: CRED.username, password: CRED.password });
      const res = await request(app)
        .post('/api/users/logout')
        .set('Cookie', jarFrom(fresh))
        .set('Origin', ALLOWED_ORIGIN)
        .send({});
      expect(res.status).toBe(200);
      // 空値 + 過去日付で上書きされる
      expect(cookieNamed(res, 'access_token')).toMatch(/access_token=;/);
      expect(cookieNamed(res, 'refresh_token')).toMatch(/refresh_token=;/);
    });

    it('Originを名乗らないリクエスト（curl等）は通る＝APIクライアントを壊さない', async () => {
      const fresh = await request(app)
        .post('/api/users/login')
        .send({ username: CRED.username, password: CRED.password });
      const res = await request(app)
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${fresh.body.token}`)
        .send({});
      expect(res.status).toBe(200);
    });
  });
});
