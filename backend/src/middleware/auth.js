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
      keyData.permissions.forEach(permission => {
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
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    // Development mode: allow anonymous access with limited permissions
    if (config.environment === 'development') {
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

const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role || 'user';
    const roleHierarchy = { admin: 3, moderator: 2, user: 1, guest: 0 };
    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

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

class TenantManager {
  constructor() {
    this.tenants = new Map();
    this.tenantLimits = {
      free: {
        maxComments: 1000,
        maxModerators: 1,
        maxUsers: 100,
        retentionDays: 7,
        maxStorage: 5 * 1024 * 1024 * 1024 // 5GB
      },
      premium: {
        maxComments: 10000,
        maxUsers: 1000,
        maxModerators: 5,
        retentionDays: 30,
        maxStorage: 50 * 1024 * 1024 * 1024 // 50GB
      },
      enterprise: {
        maxComments: 100000,
        maxUsers: 10000,
        maxModerators: 20,
        retentionDays: 90,
        maxStorage: 200 * 1024 * 1024 * 1024 // 200GB
      }
    };
  }

  // Create a new tenant
  createTenant(ownerId, plan = 'free', metadata = {}) {
    const tenantId = this.generateTenantId();
    const tenantKey = crypto.randomBytes(32).toString('hex');

    const selectedPlan = this.tenantLimits[plan] ? plan : 'free';
    const planLimits = this.tenantLimits[selectedPlan];

    const tenant = {
      id: tenantId,
      ownerId,
      plan: selectedPlan,
      key: tenantKey,
      status: 'active',
      limits: { ...planLimits },
      metadata,
      createdAt: new Date().toISOString(),
      lastAccess: new Date().toISOString(),
      usage: {
        commentsCount: 0,
        usersCount: 0,
        moderatorsCount: 0,
        storageUsed: 0
      }
    };

    this.tenants.set(tenantId, tenant);

    logger.info('[TenantManager] Tenant created', {
      tenantId,
      ownerId,
      plan,
      limits: tenant.limits
    });

    return {
      tenantId,
      tenantKey,
      plan,
      limits: tenant.limits
    };
  }

  // Verify tenant access
  verifyTenant(tenantId, tenantKey) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return null;
    }

    if (tenant.key !== tenantKey) {
      logger.warn('[TenantManager] Invalid tenant key', { tenantId });
      return null;
    }

    if (tenant.status !== 'active') {
      logger.warn('[TenantManager] Inactive tenant accessed', { tenantId, status: tenant.status });
      return null;
    }

    // Update last access
    tenant.lastAccess = new Date().toISOString();

    return {
      tenantId,
      plan: tenant.plan,
      limits: tenant.limits,
      metadata: tenant.metadata
    };
  }

  // Check if tenant can perform action
  canPerformAction(tenantId, action, amount = 1) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return false;
    }

    switch (action) {
      case 'add_comment':
        return tenant.limits.maxComments
          ? tenant.usage.commentsCount + amount <= tenant.limits.maxComments
          : true;
      case 'add_user':
        return tenant.limits.maxUsers
          ? tenant.usage.usersCount + amount <= tenant.limits.maxUsers
          : true;
      case 'add_moderator':
        return tenant.limits.maxModerators
          ? tenant.usage.moderatorsCount + amount <= tenant.limits.maxModerators
          : true;
      case 'store_data':
        return tenant.limits.maxStorage
          ? tenant.usage.storageUsed + amount <= tenant.limits.maxStorage
          : true;
      default:
        return false;
    }
  }

  // Update tenant usage
  updateUsage(tenantId, action, amount = 1) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return false;
    }

    switch (action) {
      case 'add_comment':
        tenant.usage.commentsCount += amount;
        break;
      case 'add_user':
        tenant.usage.usersCount += amount;
        break;
      case 'add_moderator':
        tenant.usage.moderatorsCount += amount;
        break;
      case 'store_data':
        tenant.usage.storageUsed += amount;
        break;
      default:
        return false;
    }

    return true;
  }

  // Upgrade tenant plan
  upgradeTenant(tenantId, newPlan) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return false;
    }

    const planKey = this.tenantLimits[newPlan] ? newPlan : tenant.plan;
    const oldPlan = tenant.plan;
    tenant.plan = planKey;
    tenant.limits = { ...this.tenantLimits[planKey] };

    logger.info('[TenantManager] Tenant upgraded', {
      tenantId,
      oldPlan,
      newPlan: planKey,
      newLimits: tenant.limits
    });

    return true;
  }

  // Get tenant statistics
  getTenantStats(tenantId) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      return null;
    }

    const safePercent = (value, limit) => {
      if (!limit || limit <= 0) {
        return 0;
      }
      return (value / limit) * 100;
    };

    const limits = tenant.limits || {};

    return {
      id: tenant.id,
      plan: tenant.plan,
      status: tenant.status,
      usage: tenant.usage,
      limits,
      createdAt: tenant.createdAt,
      lastAccess: tenant.lastAccess,
      utilization: {
        commentsPercent: safePercent(tenant.usage.commentsCount, limits.maxComments),
        usersPercent: safePercent(tenant.usage.usersCount, limits.maxUsers),
        moderatorsPercent: safePercent(tenant.usage.moderatorsCount, limits.maxModerators),
        storagePercent: safePercent(tenant.usage.storageUsed, limits.maxStorage)
      }
    };
  }

  // Generate unique tenant ID
  generateTenantId() {
    return `tenant_${crypto.randomBytes(8).toString('hex')}`;
  }
}

const tenantManager = new TenantManager();

module.exports = {
  generateToken,
  verifyToken,
  authenticateToken,
  requireRole,
  requirePermission,
  createApiKey,
  apiKeyManager,
  tenantManager
};
