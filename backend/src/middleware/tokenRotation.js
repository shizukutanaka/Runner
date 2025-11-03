const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');

class TokenRotationManager {
  constructor() {
    this.refreshTokens = new Map();
    this.tokenFamily = new Map(); // Track token families for security
    this.maxRefreshTokenAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    this.accessTokenExpiry = '15m';
    this.refreshTokenExpiry = '7d';

    // Cleanup expired tokens periodically
    setInterval(() => this.cleanup(), 60 * 60 * 1000); // Every hour
  }

  generateTokenPair(payload) {
    const jwtSecret = config.getEnv('JWT_SECRET');

    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters');
    }

    const accessToken = jwt.sign(
      { ...payload, type: 'access' },
      jwtSecret,
      { expiresIn: this.accessTokenExpiry }
    );

    const refreshToken = crypto.randomBytes(32).toString('hex');
    const familyId = crypto.randomBytes(16).toString('hex');

    const refreshTokenData = {
      userId: payload.id,
      familyId,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.maxRefreshTokenAge,
      used: false
    };

    this.refreshTokens.set(refreshToken, refreshTokenData);
    this.tokenFamily.set(familyId, [refreshToken]);

    logger.info('[TokenRotation] Token pair generated', {
      userId: payload.id,
      familyId: familyId.substring(0, 8)
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900 // 15 minutes in seconds
    };
  }

  async refreshAccessToken(refreshToken) {
    const tokenData = this.refreshTokens.get(refreshToken);

    if (!tokenData) {
      logger.warn('[TokenRotation] Invalid refresh token used');
      throw new Error('Invalid refresh token');
    }

    if (tokenData.used) {
      // Possible token reuse attack - invalidate entire family
      logger.error('[TokenRotation] Refresh token reuse detected', {
        familyId: tokenData.familyId.substring(0, 8),
        userId: tokenData.userId
      });
      this.invalidateTokenFamily(tokenData.familyId);
      throw new Error('Token reuse detected - all tokens invalidated');
    }

    if (Date.now() > tokenData.expiresAt) {
      this.refreshTokens.delete(refreshToken);
      logger.warn('[TokenRotation] Expired refresh token used', {
        userId: tokenData.userId
      });
      throw new Error('Refresh token expired');
    }

    // Mark old token as used
    tokenData.used = true;

    // Generate new token pair
    const jwtSecret = config.getEnv('JWT_SECRET');
    const newAccessToken = jwt.sign(
      { id: tokenData.userId, type: 'access' },
      jwtSecret,
      { expiresIn: this.accessTokenExpiry }
    );

    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    const newRefreshTokenData = {
      userId: tokenData.userId,
      familyId: tokenData.familyId,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.maxRefreshTokenAge,
      used: false
    };

    this.refreshTokens.set(newRefreshToken, newRefreshTokenData);

    // Add to family
    const family = this.tokenFamily.get(tokenData.familyId) || [];
    family.push(newRefreshToken);
    this.tokenFamily.set(tokenData.familyId, family);

    logger.info('[TokenRotation] Token refreshed', {
      userId: tokenData.userId,
      familyId: tokenData.familyId.substring(0, 8)
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900
    };
  }

  invalidateTokenFamily(familyId) {
    const family = this.tokenFamily.get(familyId) || [];

    family.forEach(token => {
      this.refreshTokens.delete(token);
    });

    this.tokenFamily.delete(familyId);

    logger.info('[TokenRotation] Token family invalidated', {
      familyId: familyId.substring(0, 8),
      tokensInvalidated: family.length
    });
  }

  invalidateUserTokens(userId) {
    let invalidated = 0;

    for (const [token, data] of this.refreshTokens.entries()) {
      if (data.userId === userId) {
        this.invalidateTokenFamily(data.familyId);
        invalidated++;
      }
    }

    logger.info('[TokenRotation] User tokens invalidated', {
      userId,
      familiesInvalidated: invalidated
    });
  }

  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [token, data] of this.refreshTokens.entries()) {
      if (now > data.expiresAt || data.used) {
        this.refreshTokens.delete(token);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('[TokenRotation] Cleaned expired tokens', { count: cleaned });
    }
  }

  getStats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    let used = 0;

    for (const [token, data] of this.refreshTokens.entries()) {
      if (data.used) {
        used++;
      } else if (now > data.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.refreshTokens.size,
      active,
      expired,
      used,
      families: this.tokenFamily.size
    };
  }
}

const tokenRotationManager = new TokenRotationManager();

// Middleware to refresh token
const tokenRefreshMiddleware = async (req, res, next) => {
  const refreshToken = req.body?.refreshToken || req.headers['x-refresh-token'];

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    const tokens = await tokenRotationManager.refreshAccessToken(refreshToken);
    res.json(tokens);
  } catch (error) {
    logger.warn('[TokenRotation] Token refresh failed', {
      error: error.message,
      ip: req.ip
    });
    res.status(401).json({ error: error.message });
  }
};

module.exports = {
  tokenRotationManager,
  tokenRefreshMiddleware
};
