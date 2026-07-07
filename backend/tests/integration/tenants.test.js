// 注意: routes/tenants.js は app.js に一切マウントされていない（未接続）。
// マルチテナント機能自体の本実装可否は製品判断のため（docs/FEATURE_AUDIT.md E-3参照）、
// 本テストはHTTP経由ではなくコントローラー関数を直接呼び出して安全ガードのみ検証する。
const tenantController = require('../../src/controllers/tenantController');
const db = require('../../src/db');

describe('Tenant Controller Safety Guard', () => {
  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (db && db.closeDatabase) {
      await db.closeDatabase();
    }
  });

  test('deleteTenant is disabled and never touches the database', async () => {
    const req = { params: { tenantId: 'any-tenant-id' } };
    const res = {};
    let calledWith = null;
    const next = (err) => { calledWith = err; };

    await tenantController.deleteTenant(req, res, next);

    expect(calledWith).toBeDefined();
    expect(calledWith.status).toBe(501);
    expect(calledWith.message).toContain('無効化');
  });
});
