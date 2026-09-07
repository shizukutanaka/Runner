// 権限チェックが本当に権限を制限していることを検査する（E-40）。
//
// ---------------------------------------------------------------------------
// なぜ必要か
// ---------------------------------------------------------------------------
// E-32 で「成功を返しながら何もしていないAPI」を消した。同じ形は認可にもある——
// **通しているように見えて、実際には何も制限していないガード**である。
//
// `middleware/auth.js` の `requireRole` は、役割を数値の序列に直して比べる:
//
//     const roleHierarchy = { admin: 3, moderator: 2, user: 1, guest: 0 };
//     const requiredLevel = roleHierarchy[requiredRole] || 0;
//
// ところが実際のルートは **`requireRole('analyst')`** を12箇所で使っている。
// `analyst` は序列表に無い。よって `requiredLevel` は `|| 0` で **0** になり、
// **認証さえ通れば誰でも通過する**。役割名を1文字打ち間違えても同じことが起きる。
//
// これは「失敗したら閉じる」の逆——**知らない役割名は素通り**という設計である。
// 認可のガードは、分からないときこそ閉じなければならない。
//
// ---------------------------------------------------------------------------
// このテストが固定すること
// ---------------------------------------------------------------------------
//   1. 低い役割は、高い役割を要求するエンドポイントを通れない
//   2. ルートが使う役割名は、すべて序列表に存在する（未知の役割名を作らせない）
//   3. 正規の役割は従来どおり通れる（締めすぎて壊していないこと）
const path = require('path');
const fs = require('fs');
const request = require('supertest');
const app = require('../../src/app');
const { generateToken } = require('../../src/middleware/auth');

const as = (role) => generateToken({ id: `role-${role}`, username: `role-${role}`, role });

describe('役割による制限が実際に効くこと（E-40）', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 1200));
  });

  it('guest は analyst 相当のエンドポイントを通れない', async () => {
    // GET /api/analytics/stats は requireRole('analyst') で守られている。
    // 序列表に analyst が無かった頃、この要求は「レベル0以上」＝
    // **認証済みなら誰でも**という意味になっていた
    const res = await request(app)
      .get('/api/analytics/stats')
      .set('Authorization', `Bearer ${as('guest')}`);
    expect(res.status).toBe(403);
  });

  it('guest は moderator / admin のエンドポイントも通れない', async () => {
    const mod = await request(app)
      .get('/api/analytics/moderation-actions')
      .set('Authorization', `Bearer ${as('guest')}`);
    expect(mod.status).toBe(403);

    const adm = await request(app)
      .get('/api/settings/user/role-guest')
      .set('Authorization', `Bearer ${as('guest')}`);
    expect(adm.status).toBe(403);
  });

  it('moderator は analyst 相当を通れるが、admin 専用は通れない', async () => {
    const ok = await request(app)
      .get('/api/analytics/stats')
      .set('Authorization', `Bearer ${as('moderator')}`);
    expect(ok.status).toBe(200);

    const denied = await request(app)
      .get('/api/settings/user/role-moderator')
      .set('Authorization', `Bearer ${as('moderator')}`);
    expect(denied.status).toBe(403);
  });

  it('admin は通れる（締めすぎて壊していないこと）', async () => {
    const res = await request(app)
      .get('/api/analytics/stats')
      .set('Authorization', `Bearer ${as('admin')}`);
    expect(res.status).toBe(200);
  });

  it('未知の役割を持つトークンは通れない（知らないものは閉じる）', async () => {
    const res = await request(app)
      .get('/api/analytics/stats')
      .set('Authorization', `Bearer ${as('wizard')}`);
    expect(res.status).toBe(403);
  });

  it('状態を変えるルートは、役割を要求するか自己申請として明示されていること', () => {
    // 認可の穴は「書き忘れ」で生まれる。新しい書き込みエンドポイントが
    // 役割指定なしで増えたら、ここで落ちる。
    // 例外は**本人が自分に対して行う操作**だけで、役割で守れない
    // （ログイン前だったり、役割に関係なく自分には許される）
    const SELF_SERVICE = new Set([
      'POST auth.js /register',
      'POST auth.js /login',
      'POST auth.js /logout',
      'POST auth.js /refresh',
      'POST auth.js /forgot-password',
      'POST auth.js /reset-password',
      'PUT auth.js /change-password',
      'POST auth.js /enable-2fa'
    ]);

    const routesDir = path.resolve(__dirname, '../../src/routes');
    const unguarded = [];

    for (const file of fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'))) {
      const lines = fs.readFileSync(path.join(routesDir, file), 'utf8').split('\n');
      let routerRole = null;

      lines.forEach((line, i) => {
        const global = /router\.use\(\s*requireRole\(\s*['"]([^'"]+)['"]/.exec(line);
        if (global) routerRole = global[1];

        const route = /router\.(post|put|patch|delete)\(\s*['"]([^'"]+)['"]/.exec(line);
        if (!route) return;

        // 引数が複数行に渡ることがあるので数行まとめて見る
        const chunk = lines.slice(i, i + 4).join(' ');
        const inline = /requireRole\(\s*['"]([^'"]+)['"]/.exec(chunk);
        if (inline || routerRole) return;

        const key = `${route[1].toUpperCase()} ${file} ${route[2]}`;
        if (!SELF_SERVICE.has(key)) unguarded.push(key);
      });
    }

    expect(unguarded).toEqual([]);
  });

  it('ルートが要求する役割名は、すべて序列表に存在する', () => {
    // 打ち間違いや新設した役割名が「レベル0＝無制限」に化けるのを防ぐ。
    // 序列表に無い名前を requireRole に渡した時点で、ここが落ちる
    const { ROLE_HIERARCHY } = require('../../src/middleware/auth');
    expect(ROLE_HIERARCHY).toBeDefined();

    const routesDir = path.resolve(__dirname, '../../src/routes');
    const used = new Set();
    for (const file of fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(routesDir, file), 'utf8');
      for (const m of src.matchAll(/requireRole\(\s*['"]([^'"]+)['"]/g)) {
        used.add(m[1]);
      }
    }

    expect(used.size).toBeGreaterThan(0);
    const unknown = [...used].filter((r) => !(r in ROLE_HIERARCHY)).sort();
    expect(unknown).toEqual([]);
  });
});
