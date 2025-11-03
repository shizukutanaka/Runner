const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const logger = require('../logger');
const { auditLogService } = require('../services/auditLog');

/**
 * Advanced security features for enterprise deployment
 */

/**
 * Two-Factor Authentication (2FA) Manager
 */
class TwoFactorAuthManager {
  constructor() {
    this.userSecrets = new Map(); // In production, store in database
  }

  /**
   * Generate 2FA secret for user
   */
  async generateSecret(userId, username) {
    const secret = speakeasy.generateSecret({
      name: `Comment Manager (${username})`,
      issuer: 'Comment Manager System',
      length: 32
    });

    this.userSecrets.set(userId, {
      secret: secret.base32,
      tempSecret: secret.base32,
      enabled: false,
      backupCodes: this.generateBackupCodes(),
      createdAt: new Date().toISOString()
    });

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    logger.info('[2FA] Secret generated for user', { userId });

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes: this.userSecrets.get(userId).backupCodes
    };
  }

  /**
   * Generate backup codes
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * Verify 2FA token
   */
  verifyToken(userId, token) {
    const userData = this.userSecrets.get(userId);

    if (!userData) {
      logger.warn('[2FA] No secret found for user', { userId });
      return false;
    }

    const secret = userData.enabled ? userData.secret : userData.tempSecret;

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2 // Allow 2 time steps of drift
    });

    if (verified) {
      logger.info('[2FA] Token verified successfully', { userId });
    } else {
      logger.warn('[2FA] Token verification failed', { userId });
    }

    return verified;
  }

  /**
   * Enable 2FA for user
   */
  enable2FA(userId, token) {
    if (!this.verifyToken(userId, token)) {
      return false;
    }

    const userData = this.userSecrets.get(userId);
    userData.enabled = true;
    userData.secret = userData.tempSecret;
    userData.enabledAt = new Date().toISOString();

    logger.info('[2FA] 2FA enabled for user', { userId });
    return true;
  }

  /**
   * Disable 2FA for user
   */
  disable2FA(userId, token) {
    if (!this.verifyToken(userId, token)) {
      return false;
    }

    const userData = this.userSecrets.get(userId);
    userData.enabled = false;

    logger.info('[2FA] 2FA disabled for user', { userId });
    return true;
  }

  /**
   * Verify backup code
   */
  verifyBackupCode(userId, code) {
    const userData = this.userSecrets.get(userId);

    if (!userData || !userData.enabled) {
      return false;
    }

    const index = userData.backupCodes.indexOf(code.toUpperCase());

    if (index === -1) {
      logger.warn('[2FA] Invalid backup code', { userId });
      return false;
    }

    // Remove used backup code
    userData.backupCodes.splice(index, 1);

    logger.info('[2FA] Backup code verified and consumed', {
      userId,
      remainingCodes: userData.backupCodes.length
    });

    return true;
  }

  /**
   * Check if 2FA is enabled for user
   */
  is2FAEnabled(userId) {
    const userData = this.userSecrets.get(userId);
    return userData?.enabled || false;
  }
}

/**
 * IP Whitelist Manager
 */
class IPWhitelistManager {
  constructor() {
    this.whitelist = new Map(); // userId -> [allowed IPs]
    this.globalWhitelist = new Set(); // Global allowed IPs
  }

  /**
   * Add IP to user whitelist
   */
  addUserIP(userId, ip, description = '') {
    if (!this.whitelist.has(userId)) {
      this.whitelist.set(userId, []);
    }

    const userIPs = this.whitelist.get(userId);

    if (!userIPs.find(entry => entry.ip === ip)) {
      userIPs.push({
        ip,
        description,
        addedAt: new Date().toISOString()
      });

      logger.info('[IPWhitelist] IP added to user whitelist', { userId, ip });
    }
  }

  /**
   * Remove IP from user whitelist
   */
  removeUserIP(userId, ip) {
    const userIPs = this.whitelist.get(userId);

    if (!userIPs) {
      return false;
    }

    const index = userIPs.findIndex(entry => entry.ip === ip);

    if (index !== -1) {
      userIPs.splice(index, 1);
      logger.info('[IPWhitelist] IP removed from user whitelist', { userId, ip });
      return true;
    }

    return false;
  }

  /**
   * Add IP to global whitelist
   */
  addGlobalIP(ip, description = '') {
    this.globalWhitelist.add(ip);
    logger.info('[IPWhitelist] IP added to global whitelist', { ip, description });
  }

  /**
   * Check if IP is whitelisted for user
   */
  isIPAllowed(userId, ip) {
    // Check global whitelist first
    if (this.globalWhitelist.has(ip)) {
      return true;
    }

    // Check user-specific whitelist
    const userIPs = this.whitelist.get(userId);

    if (!userIPs) {
      return true; // No whitelist = allow all
    }

    return userIPs.some(entry => entry.ip === ip);
  }

  /**
   * Get user whitelist
   */
  getUserWhitelist(userId) {
    return this.whitelist.get(userId) || [];
  }
}

/**
 * Session Security Manager
 */
class SessionSecurityManager {
  constructor() {
    this.activeSessions = new Map(); // sessionId -> session data
    this.userSessions = new Map(); // userId -> [sessionIds]
    this.maxSessionsPerUser = 5;
  }

  /**
   * Create new session
   */
  createSession(userId, sessionData) {
    const sessionId = crypto.randomBytes(32).toString('hex');

    this.activeSessions.set(sessionId, {
      userId,
      ...sessionData,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    });

    // Track user sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, []);
    }

    const sessions = this.userSessions.get(userId);
    sessions.push(sessionId);

    // Enforce max sessions per user
    if (sessions.length > this.maxSessionsPerUser) {
      const oldestSession = sessions.shift();
      this.destroySession(oldestSession);
    }

    logger.info('[SessionSecurity] Session created', {
      userId,
      sessionId: sessionId.substring(0, 8)
    });

    return sessionId;
  }

  /**
   * Validate session
   */
  validateSession(sessionId, userAgent, ip) {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Check for session hijacking
    if (session.userAgent && session.userAgent !== userAgent) {
      logger.warn('[SessionSecurity] User-Agent mismatch detected', {
        sessionId: sessionId.substring(0, 8),
        expected: session.userAgent,
        received: userAgent
      });
      this.destroySession(sessionId);
      return null;
    }

    if (session.ip && session.ip !== ip) {
      logger.warn('[SessionSecurity] IP address change detected', {
        sessionId: sessionId.substring(0, 8),
        expected: session.ip,
        received: ip
      });
      // Don't automatically destroy - might be legitimate IP change
      // Log for review
    }

    // Update last activity
    session.lastActivity = new Date().toISOString();

    return session;
  }

  /**
   * Destroy session
   */
  destroySession(sessionId) {
    const session = this.activeSessions.get(sessionId);

    if (!session) {
      return false;
    }

    this.activeSessions.delete(sessionId);

    // Remove from user sessions
    const userSessions = this.userSessions.get(session.userId);
    if (userSessions) {
      const index = userSessions.indexOf(sessionId);
      if (index !== -1) {
        userSessions.splice(index, 1);
      }
    }

    logger.info('[SessionSecurity] Session destroyed', {
      userId: session.userId,
      sessionId: sessionId.substring(0, 8)
    });

    return true;
  }

  /**
   * Destroy all user sessions
   */
  destroyUserSessions(userId) {
    const sessions = this.userSessions.get(userId) || [];

    sessions.forEach(sessionId => {
      this.activeSessions.delete(sessionId);
    });

    this.userSessions.delete(userId);

    logger.info('[SessionSecurity] All user sessions destroyed', {
      userId,
      count: sessions.length
    });
  }

  /**
   * Get active sessions for user
   */
  getUserSessions(userId) {
    const sessionIds = this.userSessions.get(userId) || [];

    return sessionIds.map(sessionId => {
      const session = this.activeSessions.get(sessionId);
      return {
        sessionId: sessionId.substring(0, 8),
        ...session
      };
    });
  }

  /**
   * Cleanup expired sessions
   */
  cleanupExpiredSessions(maxAge = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const lastActivity = new Date(session.lastActivity).getTime();

      if (now - lastActivity > maxAge) {
        this.destroySession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('[SessionSecurity] Expired sessions cleaned', { count: cleaned });
    }
  }
}

// Initialize managers
const twoFactorAuth = new TwoFactorAuthManager();
const ipWhitelist = new IPWhitelistManager();
const sessionSecurity = new SessionSecurityManager();

// Cleanup expired sessions every hour
setInterval(() => {
  sessionSecurity.cleanupExpiredSessions();
}, 60 * 60 * 1000);

/**
 * Middleware: Require 2FA
 */
const require2FA = (req, res, next) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!twoFactorAuth.is2FAEnabled(userId)) {
    return next();
  }

  const token = req.headers['x-2fa-token'] || req.body?.twoFactorToken;

  if (!token) {
    return res.status(403).json({
      error: '2FA token required',
      require2FA: true
    });
  }

  const verified = twoFactorAuth.verifyToken(userId, token) ||
                   twoFactorAuth.verifyBackupCode(userId, token);

  if (!verified) {
    logger.warn('[2FA] Authentication failed', { userId, ip: req.ip });
    return res.status(403).json({ error: 'Invalid 2FA token' });
  }

  next();
};

/**
 * Middleware: IP Whitelist check
 */
const checkIPWhitelist = (req, res, next) => {
  const userId = req.user?.id;
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  if (!userId || ipWhitelist.isIPAllowed(userId, ip)) {
    return next();
  }

  logger.warn('[IPWhitelist] Unauthorized IP access attempt', {
    userId,
    ip,
    endpoint: req.originalUrl
  });

  return res.status(403).json({
    error: 'Access denied: IP not whitelisted'
  });
};

/**
 * Middleware: Session validation
 */
const validateSession = (req, res, next) => {
  const sessionId = req.sessionID;
  const userAgent = req.headers['user-agent'];
  const ip = req.ip;

  const session = sessionSecurity.validateSession(sessionId, userAgent, ip);

  if (!session) {
    return res.status(401).json({
      error: 'Invalid or expired session'
    });
  }

  req.secureSession = session;
  next();
};

module.exports = {
  twoFactorAuth,
  ipWhitelist,
  sessionSecurity,
  require2FA,
  checkIPWhitelist,
  validateSession
};
