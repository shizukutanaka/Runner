// レート制限は本番でのみ既定有効になる（src/config.js の rateLimit.enabled）。
// テスト環境で無効なのは意図的な設計で、大量リクエストを送る他のテストが
// 429 で落ちるのを避けるためである。
//
// その結果、**セキュリティ制御であるレート制限自体のテストが1件も無い**状態だった。
// comments.test.js にあった唯一のテストは「E-14: レート制限機能が全体的に
// 無効化されているため成立しない」という理由で skip されていたが、
// E-14 は W-1 で解決済みであり、skipの理由は既に古くなっていた。
//
// このファイルは app を読み込む**前に** RATE_LIMIT_ENABLED=true を立てることで
// 実際のリミッターを起動する。jest はファイルごとにモジュールレジストリを
// 分けるので、他のテストの環境には影響しない。
process.env.RATE_LIMIT_ENABLED = 'true';
// 変数名は src/config.js が読むもの。config/index.js（削除済みの死んだモジュール）が
// 使っていた RATE_LIMIT_API_MAX ではない
process.env.RATE_LIMIT_MAX_REQUESTS = '5';
process.env.RATE_LIMIT_WINDOW_MS = '60000';

const request = require('supertest');
const app = require('../../src/app');

// /api のリミッターは skipSuccessfulRequests: true で構築されている
// （src/middleware/security.js）。つまり**成功したリクエストは数えない**、
// スループット制限ではなくブルートフォース対策としての設計である。
// したがって成功リクエストを連打しても429にはならない。ここでは失敗する
// リクエスト（認証なし→401）を送って、実際に効いていることを確かめる。
describe('レート制限（W-1でE-14を解決した機能の実動作）', () => {
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  it('失敗リクエストの連打は上限を超えると429になる（ブルートフォース対策）', async () => {
    const results = [];
    // 上限5に対し15回。express-rate-limit はIP単位なので直列で送る
    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/comments?platform=youtube'); // 認証なし→401
      results.push(res.statusCode);
    }
    expect(results.filter((c) => c === 401).length).toBeGreaterThan(0); // 数えられている
    expect(results.filter((c) => c === 429).length).toBeGreaterThan(0); // 打ち切られる
  }, 30000);

  it('429のレスポンスは理由が分かる形で返る（黙って切らない）', async () => {
    let limitedResponse = null;
    for (let i = 0; i < 15 && !limitedResponse; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/comments?platform=youtube');
      if (res.statusCode === 429) limitedResponse = res;
    }
    expect(limitedResponse).not.toBeNull();
    expect(JSON.stringify(limitedResponse.body).length).toBeGreaterThan(2);
  }, 30000);
});
