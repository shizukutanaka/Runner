// レートリミッタの「使われていないのに存在する」面積をゼロに保つ。
//
// ---------------------------------------------------------------------------
// 背景
// ---------------------------------------------------------------------------
// このプロジェクトはレートリミッタを2系統持っていた。
// `middleware/rateLimiter.js` 側は 8種の limiters + `dynamicRateLimiter` +
// `ddosProtection` + `securityHeaders` を公開していたが、
// **実際に mount されていたのは auth と authWrite の2つだけ**だった。
//
// 未使用のリミッタは無害ではない:
//
//  - `dynamicRateLimiter` の tier（enterprise/pro/standard）は削除済みの
//    課金機構の遺物で、`req.user.tier` は決して設定されない。
//    「有料プランは制限が緩い」という**実在しない仕様**がコードに残る
//  - `ddosProtection` という名前は、単一プロセスの 50 req/s カウンタに対して
//    過大である。読んだ人が「DDoS対策済み」と信じる
//  - モジュール読み込み時に `REDIS_URL` で2本目の Redis 接続を開いていた。
//    security.js は別のキーを見るため、有効条件が一致しない
//
// 削除したものが「便利そうだから」と戻ってこないよう、面積そのものを固定する。
const rateLimiter = require('../../src/middleware/rateLimiter');
const fs = require('fs');
const path = require('path');

describe('rateLimiter の公開面', () => {
  it('公開するのは limiters だけ', () => {
    expect(Object.keys(rateLimiter).sort()).toEqual(['limiters']);
  });

  it('limiters は auth と authWrite のみ（未使用リミッタを増やさない）', () => {
    expect(Object.keys(rateLimiter.limiters).sort()).toEqual(['auth', 'authWrite']);
  });

  it('どちらもミドルウェア関数である', () => {
    expect(typeof rateLimiter.limiters.auth).toBe('function');
    expect(typeof rateLimiter.limiters.authWrite).toBe('function');
  });

  it('削除した「実在しない仕様」が戻っていない', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/middleware/rateLimiter.js'), 'utf8'
    )
      // 説明コメント自身が旧名を挙げているので、コード部分だけを見る
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/enterprise|dynamicRateLimiter|ddosProtection/);
    // Redis 接続を2本目として開かない（ストアの選択は security.js に集約）
    expect(src).not.toMatch(/createClient|REDIS_URL/);
  });
});

describe('ログイン保護は設定で無効化できないこと', () => {
  // security.js の3つは RATE_LIMIT_ENABLED=false で素通りになる。
  // ログインの総当たり防御まで一緒に消えると、本番で切れていても誰も気づかない。
  // この非対称は意図的な仕様であり、偶然ではないことをここで固定する。
  it('RATE_LIMIT_ENABLED=false でも auth リミッタは noop にならない', () => {
    const prev = process.env.RATE_LIMIT_ENABLED;
    process.env.RATE_LIMIT_ENABLED = 'false';
    jest.resetModules();
    try {
      const fresh = require('../../src/middleware/rateLimiter');
      const security = require('../../src/middleware/security');
      // 見分けは引数の数ではつかない（express-rate-limit も (req,res,next) の3引数）。
      // express-rate-limit のミドルウェアだけが `resetKey` を持つのでそれで判定する。
      // security.js 側は素通りの noopLimiter に差し替わる
      expect(security.generalRateLimit.resetKey).toBeUndefined();
      // 認証側は設定に関わらず本物のリミッタのまま
      expect(typeof fresh.limiters.auth.resetKey).toBe('function');
      expect(typeof fresh.limiters.authWrite.resetKey).toBe('function');
    } finally {
      if (prev === undefined) delete process.env.RATE_LIMIT_ENABLED;
      else process.env.RATE_LIMIT_ENABLED = prev;
      jest.resetModules();
    }
  });
});
