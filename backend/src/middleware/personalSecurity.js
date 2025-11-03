const crypto = require('crypto');
const logger = require('../logger');
const { auditLogService } = require('../services/auditLog');

/**
 * Enhanced Security Middleware for Personal Use
 * Optimized for single-user or small team deployments with maximum security
 */

/**
 * Device Fingerprinting
 * Track and validate user devices for enhanced security
 */
class DeviceFingerprintManager {
  constructor() {
    this.trustedDevices = new Map(); // userId -> [device fingerprints]
    this.deviceSessions = new Map(); // fingerprint -> session data
  }

  /**
   * Generate device fingerprint
   */
  generateFingerprint(req) {
    const components = [
      req.headers['user-agent'] || '',
      req.headers['accept-language'] || '',
      req.headers['accept-encoding'] || '',
      req.ip || ''
    ];

    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Register trusted device
   */
  registerDevice(userId, fingerprint, metadata = {}) {
    if (!this.trustedDevices.has(userId)) {
      this.trustedDevices.set(userId, []);
    }

    const devices = this.trustedDevices.get(userId);

    const device = {
      fingerprint,
      name: metadata.name || 'Unknown Device',
      userAgent: metadata.userAgent,
      ip: metadata.ip,
      registeredAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      trusted: true
    };

    devices.push(device);

    logger.info('[DeviceFingerprint] Device registered', {
      userId,
      fingerprint: fingerprint.substring(0, 8),
      deviceName: device.name
    });

    return device;
  }

  /**
   * Check if device is trusted
   */
  isTrustedDevice(userId, fingerprint) {
    const devices = this.trustedDevices.get(userId);

    if (!devices) {
      return false;
    }

    const device = devices.find(d => d.fingerprint === fingerprint && d.trusted);

    if (device) {
      device.lastUsed = new Date().toISOString();
      return true;
    }

    return false;
  }

  /**
   * Get user devices
   */
  getUserDevices(userId) {
    return this.trustedDevices.get(userId) || [];
  }

  /**
   * Revoke device trust
   */
  revokeDevice(userId, fingerprint) {
    const devices = this.trustedDevices.get(userId);

    if (!devices) {
      return false;
    }

    const device = devices.find(d => d.fingerprint === fingerprint);

    if (device) {
      device.trusted = false;
      device.revokedAt = new Date().toISOString();

      logger.info('[DeviceFingerprint] Device trust revoked', {
        userId,
        fingerprint: fingerprint.substring(0, 8)
      });

      return true;
    }

    return false;
  }
}

/**
 * Geolocation-based Access Control
 * Restrict access based on geographic location
 */
class GeolocationAccessControl {
  constructor() {
    this.allowedCountries = new Set(); // ISO country codes
    this.blockedCountries = new Set();
    this.userLocationHistory = new Map(); // userId -> locations[]
  }

  /**
   * Set allowed countries (whitelist)
   */
  setAllowedCountries(countries = []) {
    this.allowedCountries = new Set(countries.map(c => c.toUpperCase()));
    logger.info('[GeolocationAccess] Allowed countries set', {
      countries: Array.from(this.allowedCountries)
    });
  }

  /**
   * Set blocked countries (blacklist)
   */
  setBlockedCountries(countries = []) {
    this.blockedCountries = new Set(countries.map(c => c.toUpperCase()));
    logger.info('[GeolocationAccess] Blocked countries set', {
      countries: Array.from(this.blockedCountries)
    });
  }

  /**
   * Check if location is allowed
   */
  isLocationAllowed(countryCode) {
    if (!countryCode) {
      return true; // Allow if location unknown (localhost)
    }

    const country = countryCode.toUpperCase();

    // Check blacklist first
    if (this.blockedCountries.has(country)) {
      return false;
    }

    // If whitelist exists, check it
    if (this.allowedCountries.size > 0) {
      return this.allowedCountries.has(country);
    }

    return true; // Allow by default if no restrictions
  }

  /**
   * Track user location
   */
  trackLocation(userId, location) {
    if (!this.userLocationHistory.has(userId)) {
      this.userLocationHistory.set(userId, []);
    }

    const history = this.userLocationHistory.get(userId);

    history.push({
      ...location,
      timestamp: new Date().toISOString()
    });

    // Keep only last 100 locations
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Detect suspicious location changes
   */
  detectSuspiciousLocation(userId, currentLocation) {
    const history = this.userLocationHistory.get(userId);

    if (!history || history.length === 0) {
      return false;
    }

    const lastLocation = history[history.length - 1];
    const timeDiff = Date.now() - new Date(lastLocation.timestamp).getTime();

    // Check for impossible travel (different country in < 1 hour)
    if (
      lastLocation.country !== currentLocation.country &&
      timeDiff < 60 * 60 * 1000 // 1 hour
    ) {
      logger.warn('[GeolocationAccess] Suspicious location change detected', {
        userId,
        from: lastLocation.country,
        to: currentLocation.country,
        timeDiff: `${timeDiff}ms`
      });

      return true;
    }

    return false;
  }
}

/**
 * Advanced Rate Limiting for Personal Use
 */
class PersonalRateLimiter {
  constructor() {
    this.userLimits = new Map(); // userId -> limit config
    this.requestCounts = new Map(); // userId -> timestamp[]
  }

  /**
   * Set user-specific rate limit
   */
  setUserLimit(userId, maxRequests, windowMs) {
    this.userLimits.set(userId, {
      maxRequests,
      windowMs,
      setAt: new Date().toISOString()
    });

    logger.info('[PersonalRateLimiter] User limit set', {
      userId,
      maxRequests,
      windowMs
    });
  }

  /**
   * Check rate limit
   */
  checkLimit(userId, defaultMax = 100, defaultWindow = 60000) {
    const now = Date.now();
    const userLimit = this.userLimits.get(userId);

    const maxRequests = userLimit?.maxRequests || defaultMax;
    const windowMs = userLimit?.windowMs || defaultWindow;
    const windowStart = now - windowMs;

    // Get or create request history
    if (!this.requestCounts.has(userId)) {
      this.requestCounts.set(userId, []);
    }

    const requests = this.requestCounts.get(userId);

    // Filter requests within window
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    this.requestCounts.set(userId, recentRequests);

    // Check limit
    if (recentRequests.length >= maxRequests) {
      logger.warn('[PersonalRateLimiter] Rate limit exceeded', {
        userId,
        requests: recentRequests.length,
        limit: maxRequests
      });

      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(recentRequests[0] + windowMs).toISOString()
      };
    }

    // Record this request
    recentRequests.push(now);

    return {
      allowed: true,
      remaining: maxRequests - recentRequests.length,
      resetAt: new Date(now + windowMs).toISOString()
    };
  }

  /**
   * Reset user limits (for trusted actions)
   */
  resetUserLimit(userId) {
    this.requestCounts.delete(userId);
    logger.info('[PersonalRateLimiter] User limit reset', { userId });
  }
}

/**
 * Suspicious Activity Detector
 */
class SuspiciousActivityDetector {
  constructor() {
    this.activityPatterns = new Map(); // userId -> activity[]
    this.suspicionScores = new Map(); // userId -> score
    this.threshold = 75; // Suspicion score threshold (0-100)
  }

  /**
   * Track user activity
   */
  trackActivity(userId, activity) {
    if (!this.activityPatterns.has(userId)) {
      this.activityPatterns.set(userId, []);
    }

    const patterns = this.activityPatterns.get(userId);

    patterns.push({
      ...activity,
      timestamp: new Date().toISOString()
    });

    // Keep only last 1000 activities
    if (patterns.length > 1000) {
      patterns.shift();
    }

    // Analyze for suspicious patterns
    this.analyzeSuspiciousPatterns(userId);
  }

  /**
   * Analyze suspicious patterns
   */
  analyzeSuspiciousPatterns(userId) {
    const patterns = this.activityPatterns.get(userId);

    if (!patterns || patterns.length < 10) {
      return 0;
    }

    let suspicionScore = 0;
    const recent = patterns.slice(-50); // Last 50 activities

    // Check for rapid repeated actions
    const actionTypes = recent.map(a => a.type);
    const uniqueActions = new Set(actionTypes);

    if (uniqueActions.size === 1 && actionTypes.length > 20) {
      suspicionScore += 30; // Repeated same action
    }

    // Check for rapid-fire requests
    const timestamps = recent.map(a => new Date(a.timestamp).getTime());
    const timeDiffs = timestamps.slice(1).map((t, i) => t - timestamps[i]);
    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;

    if (avgTimeDiff < 100) { // Less than 100ms between requests
      suspicionScore += 40; // Bot-like behavior
    }

    // Check for failed actions
    const failedActions = recent.filter(a => a.success === false);
    const failureRate = failedActions.length / recent.length;

    if (failureRate > 0.5) {
      suspicionScore += 20; // High failure rate
    }

    // Check for unusual access patterns
    const hours = recent.map(a => new Date(a.timestamp).getHours());
    const nightActivity = hours.filter(h => h >= 0 && h <= 5).length;

    if (nightActivity > recent.length * 0.7) {
      suspicionScore += 10; // Unusual time access
    }

    this.suspicionScores.set(userId, suspicionScore);

    if (suspicionScore >= this.threshold) {
      logger.warn('[SuspiciousActivity] High suspicion score detected', {
        userId,
        score: suspicionScore,
        threshold: this.threshold
      });
    }

    return suspicionScore;
  }

  /**
   * Get user suspicion score
   */
  getSuspicionScore(userId) {
    return this.suspicionScores.get(userId) || 0;
  }

  /**
   * Is user suspicious
   */
  isSuspicious(userId) {
    return this.getSuspicionScore(userId) >= this.threshold;
  }

  /**
   * Reset suspicion score
   */
  resetScore(userId) {
    this.suspicionScores.delete(userId);
    this.activityPatterns.delete(userId);
    logger.info('[SuspiciousActivity] Score reset', { userId });
  }
}

// Initialize managers
const deviceFingerprint = new DeviceFingerprintManager();
const geolocationAccess = new GeolocationAccessControl();
const personalRateLimiter = new PersonalRateLimiter();
const suspiciousActivity = new SuspiciousActivityDetector();

/**
 * Middleware: Device fingerprint validation
 */
const validateDeviceFingerprint = (req, res, next) => {
  const userId = req.user?.id;

  if (!userId) {
    return next();
  }

  const fingerprint = deviceFingerprint.generateFingerprint(req);

  if (!deviceFingerprint.isTrustedDevice(userId, fingerprint)) {
    logger.warn('[PersonalSecurity] Untrusted device access attempt', {
      userId,
      fingerprint: fingerprint.substring(0, 8),
      ip: req.ip
    });

    // Log audit trail
    auditLogService.log({
      action: 'untrusted_device_access',
      actor: userId,
      resource: 'device',
      success: false,
      metadata: { fingerprint: fingerprint.substring(0, 8) }
    });

    return res.status(403).json({
      error: 'Device not trusted',
      requiresVerification: true,
      fingerprint: fingerprint.substring(0, 8)
    });
  }

  req.deviceFingerprint = fingerprint;
  next();
};

/**
 * Middleware: Geolocation access control
 */
const checkGeolocation = (req, res, next) => {
  const userId = req.user?.id;
  const countryCode = req.headers['cf-ipcountry'] || req.headers['x-country-code'];

  if (!geolocationAccess.isLocationAllowed(countryCode)) {
    logger.warn('[PersonalSecurity] Access denied by geolocation', {
      userId,
      country: countryCode,
      ip: req.ip
    });

    return res.status(403).json({
      error: 'Access denied from this location'
    });
  }

  if (userId && countryCode) {
    const location = { country: countryCode, ip: req.ip };

    if (geolocationAccess.detectSuspiciousLocation(userId, location)) {
      // Alert but don't block
      logger.warn('[PersonalSecurity] Suspicious location detected', {
        userId,
        country: countryCode
      });
    }

    geolocationAccess.trackLocation(userId, location);
  }

  next();
};

/**
 * Middleware: Personal rate limiter
 */
const personalRateLimit = (maxRequests = 100, windowMs = 60000) => {
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;

    const result = personalRateLimiter.checkLimit(userId, maxRequests, windowMs);

    if (!result.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: result.resetAt
      });
    }

    res.set('X-RateLimit-Remaining', result.remaining);
    res.set('X-RateLimit-Reset', result.resetAt);

    next();
  };
};

/**
 * Middleware: Suspicious activity detection
 */
const detectSuspiciousActivity = (req, res, next) => {
  const userId = req.user?.id;

  if (!userId) {
    return next();
  }

  // Track this activity
  suspiciousActivity.trackActivity(userId, {
    type: req.method + ':' + req.path,
    success: true, // Will be updated in response
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  // Check suspicion score
  if (suspiciousActivity.isSuspicious(userId)) {
    logger.warn('[PersonalSecurity] Suspicious user detected', {
      userId,
      score: suspiciousActivity.getSuspicionScore(userId)
    });

    // Add extra verification requirement
    req.requiresExtraVerification = true;
  }

  next();
};

module.exports = {
  deviceFingerprint,
  geolocationAccess,
  personalRateLimiter,
  suspiciousActivity,
  validateDeviceFingerprint,
  checkGeolocation,
  personalRateLimit,
  detectSuspiciousActivity
};
