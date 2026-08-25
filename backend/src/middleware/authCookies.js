const config = require('../config');
const logger = require('../logger');

/**
 * D-7: 認証トークンを httpOnly Cookie で持たせる。
 *
 * 従来はフロントが sessionStorage にトークンを保存していたため、
 * XSSが一度でも成立すればトークンをそのまま持ち出せた。
 * httpOnly Cookie はJavaScriptから読めないので、この持ち出し経路が塞がる。
 *
 * ---------------------------------------------------------------------------
 * **なぜ同時にCSRF対策が必須なのか**
 * ---------------------------------------------------------------------------
 * これまでCSRF対策が不要だったのは、認証が `Authorization` ヘッダーだけで
 * 成立していたからである。ブラウザはクロスサイトのリクエストに
 * このヘッダーを自動付与しない。一方 **Cookie は自動付与される**。
 * つまりCookie認証を入れた瞬間、全ての状態変更エンドポイントがCSRF可能になる。
 * 本ファイルの `csrfGuard` を同時に導入するのはそのため。
 *
 * 二重防御にしてある:
 *   1. SameSite=Strict — 現代のブラウザはクロスサイト送信時にCookieを付けない
 *   2. Origin/Referer 検証 — Cookieで認証された状態変更リクエストに対して、
 *      送信元が自分自身であることを確認する（1が効かない古い環境への保険）
 *
 * 移行方針: `Authorization` ヘッダー経由の認証も**残す**。
 * APIクライアントやテストが即座に壊れないようにするためで、
 * ブラウザ（フロントエンド）だけがCookie経路に移る。
 */

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

// 状態を変えるメソッドだけがCSRFの対象。GET/HEAD/OPTIONSは対象外
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const isProduction = () => (process.env.NODE_ENV || 'development') === 'production';

const baseCookieOptions = () => ({
  httpOnly: true,
  // 本番はHTTPS前提。開発/テストでは Secure を付けるとブラウザがCookieを保存しない
  secure: isProduction(),
  sameSite: 'strict',
  path: '/'
});

/**
 * ログイン・リフレッシュ成功時にトークンをCookieへ載せる。
 * 有効期限はJWT/リフレッシュトークンの寿命に合わせる。
 */
const setAuthCookies = (res, { token, refreshToken }) => {
  const opts = baseCookieOptions();
  if (token) {
    res.cookie(ACCESS_COOKIE, token, {
      ...opts,
      maxAge: config.jwt?.accessTokenMaxAgeMs || 15 * 60 * 1000
    });
  }
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...opts,
      maxAge: config.jwt?.refreshTokenMaxAgeMs || 7 * 24 * 60 * 60 * 1000
    });
  }
};

const clearAuthCookies = (res) => {
  const opts = baseCookieOptions();
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
};

/**
 * リクエストからアクセストークンを取り出す。
 * Cookie を先に見るのは、ブラウザからのアクセスを正とするため。
 * ヘッダー経路は APIクライアント・テスト互換のために残している。
 */
const readAccessToken = (req) => {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return { token: fromCookie, source: 'cookie' };

  const authHeader = req.headers.authorization;
  const fromHeader = authHeader && authHeader.split(' ')[1];
  if (fromHeader) return { token: fromHeader, source: 'header' };

  return { token: null, source: null };
};

const readRefreshToken = (req) => req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || null;

/**
 * 許可された送信元かどうか。config.security.allowedOrigins と突き合わせる。
 * Origin が無いリクエスト（curl や同一オリジンの一部ナビゲーション）は、
 * そもそもブラウザのクロスサイト攻撃ではないので通す。
 */
const isTrustedOrigin = (origin) => {
  if (!origin) return true;
  const allowed = config.security?.allowedOrigins || [];
  return allowed.includes(origin);
};

/**
 * CSRFガード。**Cookieで認証されたリクエストにのみ適用する。**
 * ヘッダー認証のリクエストはCSRFの対象外なので素通しする
 * （ブラウザが勝手に Authorization を付けることはないため）。
 */
const csrfGuard = (req, res, next) => {
  if (!STATE_CHANGING_METHODS.has(req.method)) return next();

  // Cookieを持っていないリクエストはCSRFになり得ない
  if (!req.cookies?.[ACCESS_COOKIE] && !req.cookies?.[REFRESH_COOKIE]) return next();

  const origin = req.headers.origin
    || (req.headers.referer ? new URL(req.headers.referer).origin : null);

  if (isTrustedOrigin(origin)) return next();

  logger.warn('[CSRF] Rejected cookie-authenticated state change from untrusted origin', {
    origin, method: req.method, path: req.originalUrl
  });
  return next({
    status: 403,
    code: 'CSRF_ORIGIN_REJECTED',
    message: '許可されていない送信元からのリクエストです'
  });
};

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  setAuthCookies,
  clearAuthCookies,
  readAccessToken,
  readRefreshToken,
  csrfGuard
};
