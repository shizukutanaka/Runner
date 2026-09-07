const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../logger');
const encryptionService = require('../services/encryptionService');

class ApiKeyManager {
  constructor() {
    this.activeKeys = new Map();
    this.revokedKeys = new Set();
  }

  // Generate a new API key
  generateApiKey(userId, permissions = ['read'], name = '', expiresIn = 365 * 24 * 60 * 60 * 1000) {
    try {
      const keyId = this.generateKeyId();
      const keySecret = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + expiresIn);

      const keyData = {
        keyId,
        userId,
        name,
        permissions,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        lastUsed: null,
        isActive: true,
        usageCount: 0
      };

      // Encrypt the key data
      const encryptedKeyData = encryptionService.encrypt(JSON.stringify(keyData));
      const signature = encryptionService.createSignature(encryptedKeyData);

      const fullKey = `${keyId}.${keySecret}.${encryptedKeyData}.${signature}`;

      // Store in memory (in production, store in database)
      this.activeKeys.set(keyId, {
        ...keyData,
        secretHash: this.hashSecret(keySecret),
        encryptedData: encryptedKeyData
      });

      logger.info('[ApiKeyManager] API key generated', {
        keyId,
        userId,
        permissions,
        expiresAt: expiresAt.toISOString()
      });

      return {
        keyId,
        name,
        permissions,
        fullKey,
        expiresAt: expiresAt.toISOString(),
        createdAt: keyData.createdAt
      };
    } catch (error) {
      logger.error('[ApiKeyManager] Failed to generate API key', { error: error.message });
      throw new Error('Failed to generate API key');
    }
  }

  // Verify an API key
  verifyApiKey(apiKey) {
    try {
      const parts = apiKey.split('.');
      if (parts.length !== 4) {
        return null;
      }

      const [keyId, keySecret, encryptedKeyData, signature] = parts;

      // Verify signature
      if (!encryptionService.verifySignature(encryptedKeyData, signature)) {
        logger.warn('[ApiKeyManager] Invalid API key signature', { keyId });
        return null;
      }

      // Check if key is revoked
      if (this.revokedKeys.has(keyId)) {
        logger.warn('[ApiKeyManager] Revoked API key used', { keyId });
        return null;
      }

      // Get stored key data
      const storedKey = this.activeKeys.get(keyId);
      if (!storedKey) {
        logger.warn('[ApiKeyManager] Unknown API key', { keyId });
        return null;
      }

      // Verify secret using timing-safe comparison
      const providedSecretHash = this.hashSecret(keySecret);
      if (!this.secureCompare(storedKey.secretHash, providedSecretHash)) {
        logger.warn('[ApiKeyManager] Invalid API key secret', { keyId });
        return null;
      }

      // Decrypt and verify key data
      const decryptedData = JSON.parse(encryptionService.decrypt(encryptedKeyData));

      // Check expiration
      if (new Date() > new Date(decryptedData.expiresAt)) {
        logger.warn('[ApiKeyManager] Expired API key used', { keyId });
        this.revokeApiKey(keyId);
        return null;
      }

      // Check if key is still active
      if (!decryptedData.isActive) {
        logger.warn('[ApiKeyManager] Inactive API key used', { keyId });
        return null;
      }

      // Update usage statistics
      storedKey.lastUsed = new Date().toISOString();
      storedKey.usageCount++;

      // Ensure limits are present for downstream consumers
      if (!Array.isArray(decryptedData.permissions)) {
        decryptedData.permissions = ['read'];
      }

      return {
        keyId,
        userId: decryptedData.userId,
        permissions: decryptedData.permissions,
        name: decryptedData.name,
        expiresAt: decryptedData.expiresAt
      };
    } catch (error) {
      logger.error('[ApiKeyManager] API key verification failed', { error: error.message });
      return null;
    }
  }

  // Revoke an API key
  revokeApiKey(keyId) {
    const key = this.activeKeys.get(keyId);
    if (key) {
      this.activeKeys.delete(keyId);
      this.revokedKeys.add(keyId);

      logger.info('[ApiKeyManager] API key revoked', { keyId });
      return true;
    }
    return false;
  }

  // Get all API keys for a user
  getUserApiKeys(userId) {
    const keys = [];
    for (const [keyId, keyData] of this.activeKeys.entries()) {
      if (keyData.userId === userId) {
        keys.push({
          keyId,
          name: keyData.name,
          permissions: keyData.permissions,
          createdAt: keyData.createdAt,
          expiresAt: keyData.expiresAt,
          lastUsed: keyData.lastUsed,
          usageCount: keyData.usageCount
        });
      }
    }
    return keys;
  }

  // Update API key permissions
  updateApiKeyPermissions(keyId, permissions) {
    const key = this.activeKeys.get(keyId);
    if (key) {
      key.permissions = permissions;
      // Re-encrypt the key data
      const keyData = {
        keyId,
        userId: key.userId,
        name: key.name,
        permissions,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        lastUsed: key.lastUsed,
        isActive: key.isActive,
        usageCount: key.usageCount
      };

      key.encryptedData = encryptionService.encrypt(JSON.stringify(keyData));

      logger.info('[ApiKeyManager] API key permissions updated', { keyId, permissions });
      return true;
    }
    return false;
  }

  // Generate a unique key ID
  generateKeyId() {
    return crypto.randomBytes(8).toString('hex');
  }

  hashSecret(secret) {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  secureCompare(expected, actual) {
    if (typeof expected !== 'string' || typeof actual !== 'string') {
      return false;
    }

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(actual, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  }

  // Remove expired or inactive keys
  purgeExpiredKeys() {
    const now = new Date();
    for (const [keyId, keyData] of this.activeKeys.entries()) {
      const expiresAt = keyData.expiresAt ? new Date(keyData.expiresAt) : null;
      if (!expiresAt || now > expiresAt || keyData.isActive === false) {
        this.revokeApiKey(keyId);
      }
    }
  }

  // Get API key statistics
  getStats() {
    this.purgeExpiredKeys();

    const stats = {
      totalActive: this.activeKeys.size,
      totalRevoked: this.revokedKeys.size,
      byPermission: {},
      recentlyUsed: 0
    };

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const [keyId, keyData] of this.activeKeys.entries()) {
      // Count by permission
      keyData.permissions.forEach((permission) => {
        stats.byPermission[permission] = (stats.byPermission[permission] || 0) + 1;
      });

      // Count recently used keys
      if (keyData.lastUsed && new Date(keyData.lastUsed) > oneWeekAgo) {
        stats.recentlyUsed++;
      }
    }

    return stats;
  }
}

const apiKeyManager = new ApiKeyManager();


const resolveJwtSecret = () => {
  const isProduction = config.environment === 'production';
  const secret = config.getEnv('JWT_SECRET');

  if (isProduction) {
    if (!secret || secret.length < 32) {
      throw new Error('[Auth] JWT_SECRET must be at least 32 characters long in production');
    }
  } else {
    // 開発環境用のランダムシークレット生成
    if (!secret || secret.length < 32) {
      const crypto = require('crypto');
      const randomSecret = crypto.randomBytes(32).toString('hex');
      logger.warn('[Auth] JWT_SECRET is missing or weak. Using randomly generated secret for development only.');
      logger.warn('[Auth] IMPORTANT: Set JWT_SECRET in .env for persistent tokens across restarts.');
      return randomSecret;
    }
  }

  return secret;
};

const JWT_SECRET = resolveJwtSecret();
const TOKEN_EXPIRY = config.getEnv('JWT_EXPIRY', '24h');

const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    logger.warn('[Auth] Token verification failed', { error: error.message });
    return null;
  }
};

const authenticateToken = (req, res, next) => {
  // D-7: httpOnly Cookie を優先し、Authorization ヘッダーも受け付ける。
  // Cookieを先に見るのはブラウザからのアクセスを正とするため。ヘッダー経路は
  // APIクライアントとの互換のために残している（詳細は middleware/authCookies.js）
  // eslint-disable-next-line global-require
  const { readAccessToken } = require('./authCookies');
  const { token, source } = readAccessToken(req);
  req.authSource = source;

  if (!token) {
    // 開発時の便宜として、トークン無しの要求を通す。
    //
    // E-41: コメントは以前「limited permissions」と書いてあったが、
    // 実際に付与しているのは **admin** である。制限どころか最大権限なので、
    // どの環境でこれが働くのかが決定的に重要になる。
    // `config.environment` の既定値は production に変えた（config.js 参照）。
    // NODE_ENV=development と**明示した場合にだけ**ここを通る。
    if (config.environment === 'development') {
      logger.warn('[Auth] Anonymous request granted admin (development mode)', {
        method: req.method,
        endpoint: req.originalUrl
      });
      req.user = { id: 'dev-admin', role: 'admin', permissions: ['admin'] };
      return next();
    }
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    // 401: 認証情報自体が無効（403は「認証済みだが権限不足」の場合に使用）
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
};

// 役割の序列。**ここに無い名前を requireRole に渡してはいけない。**
//
// E-40: 以前この表は `{ admin: 3, moderator: 2, user: 1, guest: 0 }` で、
// 判定は `roleHierarchy[requiredRole] || 0` だった。
// ところがルートは12箇所で `requireRole('analyst')` を使っている。
// `analyst` は表に無いので要求レベルは **0** になり、
// **認証さえ通れば誰でも通過する**ガードになっていた。
// 役割名を1文字打ち間違えても同じことが起きる。
//
// 認可は「分からないときは閉じる」でなければならない。
// 未知の役割名は 0 に丸めず、拒否する（下の requireRole を参照）。
const ROLE_HIERARCHY = { guest: 0, user: 1, analyst: 2, moderator: 3, admin: 4 };

const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role;

    // 要求側の役割名が表に無いのは**プログラムの誤り**である。
    // 素通りさせると誰も気づけないので、閉じたうえで大きく記録する
    if (!(requiredRole in ROLE_HIERARCHY)) {
      logger.error('[Auth] Unknown required role; denying', { requiredRole, endpoint: req.originalUrl });
      return res.status(403).json({ error: 'Role check misconfigured' });
    }

    // 持ち主側の役割名が表に無い場合も閉じる。
    // 「知らない役割＝最低権限」に丸めると、綴りの違いが権限昇格になりうる
    if (!userRole || !(userRole in ROLE_HIERARCHY)) {
      logger.warn('[Auth] Unknown user role; denying', {
        userId: req.user.id,
        userRole,
        requiredRole,
        endpoint: req.originalUrl
      });
      return res.status(403).json({ error: `Role '${requiredRole}' required` });
    }

    const userLevel = ROLE_HIERARCHY[userRole];
    const requiredLevel = ROLE_HIERARCHY[requiredRole];

    if (userLevel < requiredLevel) {
      logger.warn('[Auth] Insufficient permissions', {
        userId: req.user.id,
        userRole,
        requiredRole,
        endpoint: req.originalUrl
      });
      return res.status(403).json({ error: `Role '${requiredRole}' required` });
    }

    next();
  };
};

const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userPermissions = req.user.permissions || [];
    if (!userPermissions.includes(permission) && !userPermissions.includes('admin')) {
      logger.warn('[Auth] Insufficient permissions', {
        userId: req.user.id,
        required: permission,
        available: userPermissions,
        endpoint: req.originalUrl
      });
      return res.status(403).json({ error: `Permission '${permission}' required` });
    }

    next();
  };
};

const createApiKey = (userId, permissions = ['read']) => {
  return generateToken({
    id: userId,
    type: 'api_key',
    permissions,
    createdAt: new Date().toISOString()
  });
};

module.exports = {
  ROLE_HIERARCHY,
  generateToken,
  authenticateToken,
  requireRole
};
