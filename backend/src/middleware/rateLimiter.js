// 認証系エンドポイント専用のレートリミッタ。
//
// ---------------------------------------------------------------------------
// なぜこのファイルが小さいのか（旧版は約180行あった）
// ---------------------------------------------------------------------------
// このプロジェクトにはレートリミッタが2系統あった。`security.js` の
// `strict / general / api`（`RATE_LIMIT_ENABLED` で有効化）と、ここにあった
// `limiters` 8種 + `dynamicRateLimiter` + `ddosProtection` + `securityHeaders`。
//
// 実際にどこかへ **mount されていたのは `auth` と `authWrite` の2つだけ**で、
// 残りは一度も使われていなかった:
//
//   limiters.api / createComment / moderation / upload / export / websocket
//     → 参照0件
//   dynamicRateLimiter
//     → 参照0件。しかも `req.user.tier` の enterprise/pro/standard は
//       本セッションで削除した課金・マルチテナント機構の遺物で、
//       tier は決して設定されない。全員 free の枝に落ちるだけだった
//   ddosProtection
//     → 参照0件。加えて、単一プロセス内の 50 req/s カウンタを
//       「DDoS対策」と名付けるのは誤りである。分散攻撃はアプリに届く前の層で止める
//   securityHeaders
//     → 参照0件。`X-RateLimit-Policy: fixed-window` という、
//       何の制限も表していないヘッダを付けるだけだった
//
// さらに旧版はモジュール読み込み時に `REDIS_URL` で **2本目の Redis 接続**を
// 開いていた。`security.js` は別のキー（`RATE_LIMIT_STORE` / `RATE_LIMIT_REDIS_URL`）を
// 見るため、両者の有効条件は一致しない。既定（`RATE_LIMIT_STORE=memory`）のまま
// `REDIS_URL` だけ設定すると、認証用リミッタだけが Redis を使うという
// 説明のつかない状態になっていた。
//
// よって、実際に使われている2つだけを `security.js` の `createRateLimiter` の上に
// 残す。ストアの選択もクリーンアップも1箇所に集約される。
//
// ---------------------------------------------------------------------------
// `RATE_LIMIT_ENABLED` との関係（意図的な非対称）
// ---------------------------------------------------------------------------
// `security.js` の3つは `config.rateLimit.enabled` が false なら素通りになる。
// **ここの2つは設定に関わらず常に有効**である。ログインの総当たり防御は
// 「開発中は邪魔だから切る」種類の機能ではなく、切れる設定にしておくと
// 本番で切れていても誰も気づかないからである。
// この非対称はかつて「2系統の有効化条件の不一致」として短所に数えていたが、
// 挙動としては正しい。偶然そうなっていたものを、明示的な仕様にする。
const { createRateLimiter } = require('./security');

const WINDOW_MS = 15 * 60 * 1000;

const limiters = {
  // ログイン試行（総当たり防御）。15分に5回
  auth: createRateLimiter({
    windowMs: WINDOW_MS,
    max: 5,
    message: 'Too many login attempts. Please try again later.'
  }),

  // 登録・パスワードリセット・トークン更新。15分に20回。
  // ログインとカウンタを分けるのは、無関係なアカウント操作で
  // 総当たり防御の枠を食い潰させないため
  authWrite: createRateLimiter({
    windowMs: WINDOW_MS,
    max: 20,
    message: 'Too many requests. Please try again later.'
  })
};

module.exports = { limiters };
