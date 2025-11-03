const crypto = require('crypto');
const logger = require('../logger');

class CSRFProtection {
  constructor() {
    this.tokens = new Map();
    this.tokenExpiry = 60 * 60 * 1000; // 1 hour
    this.cleanupInterval = 5 * 60 * 1000; // 5 minutes

    // Periodic cleanup
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  generateToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.tokenExpiry;

    this.tokens.set(sessionId, { token, expiresAt });

    logger.debug('[CSRF] Token generated', { sessionId: sessionId.substring(0, 8) });
    return token;
  }

  verifyToken(sessionId, token) {
    const stored = this.tokens.get(sessionId);

    if (!stored) {
      logger.warn('[CSRF] No token found for session', { sessionId: sessionId.substring(0, 8) });
      return false;
    }

    if (Date.now() > stored.expiresAt) {
      this.tokens.delete(sessionId);
      logger.warn('[CSRF] Token expired', { sessionId: sessionId.substring(0, 8) });
      return false;
    }

    if (stored.token !== token) {
      logger.warn('[CSRF] Token mismatch', { sessionId: sessionId.substring(0, 8) });
      return false;
    }

    return true;
  }

  rotateToken(sessionId) {
    this.tokens.delete(sessionId);
    return this.generateToken(sessionId);
  }

  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, { expiresAt }] of this.tokens.entries()) {
      if (now > expiresAt) {
        this.tokens.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('[CSRF] Cleaned expired tokens', { count: cleaned });
    }
  }

  invalidateSession(sessionId) {
    this.tokens.delete(sessionId);
    logger.debug('[CSRF] Session invalidated', { sessionId: sessionId.substring(0, 8) });
  }
}

const csrfProtection = new CSRFProtection();

// Middleware to generate CSRF token
const csrfTokenGenerator = (req, res, next) => {
  const sessionId = req.session?.id || req.sessionID;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session required for CSRF protection' });
  }

  // Generate new token if doesn't exist
  if (!csrfProtection.tokens.has(sessionId)) {
    const token = csrfProtection.generateToken(sessionId);
    res.locals.csrfToken = token;
  } else {
    res.locals.csrfToken = csrfProtection.tokens.get(sessionId).token;
  }

  next();
};

// Middleware to verify CSRF token
const csrfVerifier = (req, res, next) => {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const sessionId = req.session?.id || req.sessionID;
  const token = req.headers['x-csrf-token'] || req.body?._csrf;

  if (!sessionId) {
    logger.warn('[CSRF] No session ID found', {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip
    });
    return res.status(403).json({ error: 'CSRF validation failed: No session' });
  }

  if (!token) {
    logger.warn('[CSRF] No CSRF token provided', {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      sessionId: sessionId.substring(0, 8)
    });
    return res.status(403).json({ error: 'CSRF validation failed: Token required' });
  }

  if (!csrfProtection.verifyToken(sessionId, token)) {
    logger.warn('[CSRF] Token verification failed', {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      sessionId: sessionId.substring(0, 8)
    });
    return res.status(403).json({ error: 'CSRF validation failed: Invalid token' });
  }

  // Rotate token after successful verification for added security
  const newToken = csrfProtection.rotateToken(sessionId);
  res.set('X-CSRF-Token', newToken);
  res.locals.csrfToken = newToken;

  next();
};

// Endpoint to get CSRF token
const getCsrfToken = (req, res) => {
  const sessionId = req.session?.id || req.sessionID;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session required' });
  }

  const token = csrfProtection.generateToken(sessionId);

  res.json({
    csrfToken: token,
    expiresIn: csrfProtection.tokenExpiry / 1000 // in seconds
  });
};

module.exports = {
  csrfProtection,
  csrfTokenGenerator,
  csrfVerifier,
  getCsrfToken
};
