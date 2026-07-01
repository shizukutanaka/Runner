const bcrypt = require('bcrypt');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const validator = require('validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const logger = require('../logger');
const { generateToken } = require('../middleware/auth');

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1時間

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
});

const sanitizeAccount = (account) => ({
  id: account.id,
  username: account.username,
  email: account.email,
  role: account.role,
  status: account.status,
  createdAt: account.created_at,
  lastLoginAt: account.last_login_at
});

// 新規モデレーター/管理者アカウント登録
exports.register = async (req, res, next) => {
  const { email, password } = req.body;
  const username = validator.escape(req.body.username.trim());

  try {
    const existing = await dbGet(
      'SELECT id FROM accounts WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing) {
      return next({ status: 409, message: 'このユーザー名またはメールアドレスは既に使用されています' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const id = uuidv4();

    // 最初に登録されたアカウントは管理者にする（他に管理者を作成する手段がないため）
    const { cnt } = await dbGet('SELECT COUNT(*) as cnt FROM accounts');
    const role = cnt === 0 ? 'admin' : 'moderator';

    await dbRun(
      `INSERT INTO accounts (id, username, email, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [id, username, email, passwordHash, role]
    );

    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [id]);
    logger.info('[Auth] Account registered', { id, username });

    res.status(201).json({
      success: true,
      user: sanitizeAccount(account),
      message: 'アカウントが作成されました'
    });
  } catch (err) {
    logger.error('[Auth] Registration failed', { error: err.message });
    next({ status: 500, message: 'アカウント登録中にエラーが発生しました', details: err });
  }
};

// ログイン
exports.login = async (req, res, next) => {
  const { username, password } = req.body;

  try {
    const account = await dbGet(
      'SELECT * FROM accounts WHERE username = ? OR email = ?',
      [username, username]
    );

    // タイミング攻撃対策: アカウントが存在しない場合もハッシュ比較のコストを揃える
    const passwordHash = account?.password_hash || '$2b$12$invalidsaltinvalidsaltinvalidsaltinvalidsalte';
    const passwordMatches = await bcrypt.compare(password, passwordHash);

    if (!account || !passwordMatches) {
      return next({ status: 401, message: 'ユーザー名またはパスワードが正しくありません' });
    }

    if (account.status !== 'active') {
      return next({ status: 403, message: 'このアカウントは無効化されています' });
    }

    await dbRun('UPDATE accounts SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [account.id]);

    const token = generateToken({ id: account.id, username: account.username, role: account.role });

    // セッションCookieも発行（既存の express-session ミドルウェアを利用）
    if (req.session) {
      req.session.userId = account.id;
    }

    logger.info('[Auth] Login successful', { id: account.id, username: account.username });

    res.json({
      success: true,
      token,
      user: sanitizeAccount(account),
      message: 'ログインしました'
    });
  } catch (err) {
    logger.error('[Auth] Login failed', { error: err.message });
    next({ status: 500, message: 'ログイン処理中にエラーが発生しました', details: err });
  }
};

// アカウント一覧取得（管理者用）
exports.listAccounts = async (req, res, next) => {
  try {
    const accounts = await dbAll('SELECT * FROM accounts ORDER BY created_at ASC');
    res.json({ success: true, accounts: accounts.map(sanitizeAccount) });
  } catch (err) {
    logger.error('[Auth] Listing accounts failed', { error: err.message });
    next({ status: 500, message: 'アカウント一覧の取得中にエラーが発生しました', details: err });
  }
};

// アカウントの役割変更（管理者用）
exports.setAccountRole = async (req, res, next) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['moderator', 'admin'].includes(role)) {
    return next({ status: 400, message: 'roleはmoderatorまたはadminを指定してください' });
  }

  try {
    const account = await dbGet('SELECT id FROM accounts WHERE id = ?', [id]);
    if (!account) {
      return next({ status: 404, message: 'アカウントが見つかりません' });
    }

    await dbRun('UPDATE accounts SET role = ? WHERE id = ?', [role, id]);
    logger.info('[Auth] Account role changed', { id, role, changedBy: req.user.id });

    res.json({ success: true, message: 'ロールを更新しました' });
  } catch (err) {
    logger.error('[Auth] Setting account role failed', { error: err.message });
    next({ status: 500, message: 'ロール更新中にエラーが発生しました', details: err });
  }
};

// 現在のアカウント情報取得
exports.me = async (req, res, next) => {
  try {
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [req.user.id]);
    if (!account) {
      return next({ status: 404, message: 'アカウントが見つかりません' });
    }
    res.json(sanitizeAccount(account));
  } catch (err) {
    logger.error('[Auth] Fetching current account failed', { error: err.message });
    next({ status: 500, message: 'アカウント情報の取得中にエラーが発生しました', details: err });
  }
};

// ログアウト（JWTはステートレスなためクライアント側でのトークン破棄が主。セッションも破棄する）
exports.logout = async (req, res) => {
  logger.info('[Auth] Logout', { id: req.user?.id });
  if (req.session) {
    req.session.destroy(() => {});
  }
  res.json({ success: true, message: 'ログアウトしました' });
};

// リフレッシュトークン（現状は未発行のため常に無効として扱う）
exports.refresh = async (req, res, next) => {
  return next({ status: 401, message: '無効なリフレッシュトークンです' });
};

// パスワードリセット要求（メール送信は未設定のため、トークン発行のみ実施）
exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;

  try {
    const account = await dbGet('SELECT id FROM accounts WHERE email = ?', [email]);

    // メール列挙攻撃を防ぐため、アカウントの有無に関わらず同じレスポンスを返す
    if (account) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

      await dbRun(
        'UPDATE accounts SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?',
        [tokenHash, expires, account.id]
      );

      logger.info('[Auth] Password reset token issued', { id: account.id });
      // 実際の実装ではここでメール送信サービスを呼び出す
    }

    res.json({ success: true, message: 'パスワードリセット手順を記載したメールを送信しました（該当アカウントが存在する場合）' });
  } catch (err) {
    logger.error('[Auth] Forgot-password failed', { error: err.message });
    next({ status: 500, message: 'パスワードリセット要求の処理中にエラーが発生しました', details: err });
  }
};

// パスワードリセット実行
exports.resetPassword = async (req, res, next) => {
  const { token, newPassword } = req.body;

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const account = await dbGet(
      'SELECT * FROM accounts WHERE reset_token_hash = ? AND reset_token_expires > CURRENT_TIMESTAMP',
      [tokenHash]
    );

    if (!account) {
      return next({ status: 400, message: 'リセットトークンが無効か期限切れです' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await dbRun(
      'UPDATE accounts SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL WHERE id = ?',
      [passwordHash, account.id]
    );

    logger.info('[Auth] Password reset completed', { id: account.id });
    res.json({ success: true, message: 'パスワードがリセットされました' });
  } catch (err) {
    logger.error('[Auth] Reset-password failed', { error: err.message });
    next({ status: 500, message: 'パスワードリセット中にエラーが発生しました', details: err });
  }
};

// パスワード変更（ログイン済みユーザー本人による変更）
exports.changePassword = async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [req.user.id]);
    if (!account) {
      return next({ status: 404, message: 'アカウントが見つかりません' });
    }

    const matches = await bcrypt.compare(currentPassword, account.password_hash);
    if (!matches) {
      return next({ status: 401, message: '現在のパスワードが正しくありません' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await dbRun('UPDATE accounts SET password_hash = ? WHERE id = ?', [passwordHash, account.id]);

    logger.info('[Auth] Password changed', { id: account.id });
    res.json({ success: true, message: 'パスワードを変更しました' });
  } catch (err) {
    logger.error('[Auth] Change-password failed', { error: err.message });
    next({ status: 500, message: 'パスワード変更中にエラーが発生しました', details: err });
  }
};

// 2段階認証(TOTP)の有効化: シークレット生成 + QRコード発行
exports.enable2FA = async (req, res, next) => {
  try {
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [req.user.id]);
    if (!account) {
      return next({ status: 404, message: 'アカウントが見つかりません' });
    }

    const secret = speakeasy.generateSecret({
      name: `CommentManager (${account.username})`
    });

    await dbRun('UPDATE accounts SET totp_secret = ? WHERE id = ?', [secret.base32, account.id]);

    const qrCode = await qrcode.toDataURL(secret.otpauth_url);

    logger.info('[Auth] 2FA secret generated', { id: account.id });
    res.json({ success: true, qrCode, secret: secret.base32 });
  } catch (err) {
    logger.error('[Auth] Enable-2FA failed', { error: err.message });
    next({ status: 500, message: '2段階認証の設定中にエラーが発生しました', details: err });
  }
};

// 2段階認証コードの検証
exports.verify2FA = async (req, res, next) => {
  const { code } = req.body;

  try {
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [req.user.id]);
    if (!account?.totp_secret) {
      return next({ status: 401, message: '2段階認証が設定されていません' });
    }

    const verified = speakeasy.totp.verify({
      secret: account.totp_secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) {
      return next({ status: 401, message: '認証コードが正しくありません' });
    }

    await dbRun('UPDATE accounts SET totp_enabled = 1 WHERE id = ?', [account.id]);

    res.json({ success: true, message: '2段階認証が有効化されました' });
  } catch (err) {
    logger.error('[Auth] Verify-2FA failed', { error: err.message });
    next({ status: 500, message: '2段階認証コードの検証中にエラーが発生しました', details: err });
  }
};
