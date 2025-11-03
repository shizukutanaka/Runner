const Joi = require('joi');
const logger = require('../logger');

/**
 * Password strength levels
 */
const PASSWORD_STRENGTH = {
  WEAK: 'weak',
  MEDIUM: 'medium',
  STRONG: 'strong',
  VERY_STRONG: 'very_strong'
};

/**
 * Password policy configuration
 */
const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  preventCommonPasswords: true,
  preventSequentialChars: true,
  preventRepeatedChars: true,
  maxRepeatedChars: 3,
  preventPersonalInfo: true,
  historyCheck: true,
  maxHistorySize: 10
};

/**
 * Common weak passwords to reject
 */
const COMMON_PASSWORDS = new Set([
  'password', '123456', '123456789', 'qwerty', 'abc123', 'password123',
  'admin', 'administrator', 'root', 'user', 'guest', 'test', 'demo',
  'welcome', 'login', 'letmein', 'monkey', 'dragon', 'passw0rd',
  '12345678', 'iloveyou', 'princess', 'rockyou', '1234567', '12345',
  '1234567890', 'password1', '123123', 'football', 'baseball', 'welcome1',
  'admin123', 'root123', 'user123', 'guest123', 'test123', 'demo123'
]);

/**
 * Validates password strength and policy compliance
 * @param {string} password - Password to validate
 * @param {Object} options - Additional validation options
 * @returns {Object} Validation result with score and issues
 */
function validatePasswordStrength(password, options = {}) {
  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      strength: PASSWORD_STRENGTH.WEAK,
      score: 0,
      issues: ['Password is required']
    };
  }

  const issues = [];
  let score = 0;

  // Length check
  if (password.length < PASSWORD_POLICY.minLength) {
    issues.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters long`);
  } else if (password.length >= PASSWORD_POLICY.minLength) {
    score += 1;
  }

  if (password.length > PASSWORD_POLICY.maxLength) {
    issues.push(`Password must be no more than ${PASSWORD_POLICY.maxLength} characters long`);
  }

  // Character variety checks
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    issues.push('Password must contain at least one lowercase letter');
  } else if (PASSWORD_POLICY.requireLowercase) {
    score += 1;
  }

  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    issues.push('Password must contain at least one uppercase letter');
  } else if (PASSWORD_POLICY.requireUppercase) {
    score += 1;
  }

  if (PASSWORD_POLICY.requireNumbers && !/\d/.test(password)) {
    issues.push('Password must contain at least one number');
  } else if (PASSWORD_POLICY.requireNumbers) {
    score += 1;
  }

  if (PASSWORD_POLICY.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    issues.push('Password must contain at least one special character');
  } else if (PASSWORD_POLICY.requireSpecialChars) {
    score += 1;
  }

  // Common password check
  if (PASSWORD_POLICY.preventCommonPasswords && COMMON_PASSWORDS.has(password.toLowerCase())) {
    issues.push('Password is too common and easily guessable');
  }

  // Sequential characters check
  if (PASSWORD_POLICY.preventSequentialChars) {
    const sequentialPatterns = [
      /012|123|234|345|456|567|678|789|890/,
      /abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i,
      /qwe|rty|tyu|yui|uio|iop/i
    ];

    for (const pattern of sequentialPatterns) {
      if (pattern.test(password)) {
        issues.push('Password contains sequential characters');
        break;
      }
    }
  }

  // Repeated characters check
  if (PASSWORD_POLICY.preventRepeatedChars) {
    const repeatedPattern = new RegExp(`(.)\\1{${PASSWORD_POLICY.maxRepeatedChars},}`, 'g');
    if (repeatedPattern.test(password)) {
      issues.push(`Password contains more than ${PASSWORD_POLICY.maxRepeatedChars} repeated characters`);
    }
  }

  // Personal information check (if provided)
  if (options.personalInfo && PASSWORD_POLICY.preventPersonalInfo) {
    const personalInfo = Array.isArray(options.personalInfo)
      ? options.personalInfo
      : [options.personalInfo];

    for (const info of personalInfo) {
      if (info && password.toLowerCase().includes(info.toLowerCase())) {
        issues.push('Password contains personal information');
        break;
      }
    }
  }

  // Calculate strength
  let strength = PASSWORD_STRENGTH.WEAK;
  if (score >= 4 && issues.length === 0) {
    strength = PASSWORD_STRENGTH.VERY_STRONG;
  } else if (score >= 3 && issues.length === 0) {
    strength = PASSWORD_STRENGTH.STRONG;
  } else if (score >= 2 && issues.length <= 1) {
    strength = PASSWORD_STRENGTH.MEDIUM;
  }

  return {
    isValid: issues.length === 0,
    strength,
    score,
    issues
  };
}

/**
 * Checks if password has been used recently (password history)
 * @param {string} password - New password to check
 * @param {Array<string>} passwordHistory - Array of previous password hashes
 * @returns {boolean} True if password is not in history
 */
async function checkPasswordHistory(password, passwordHistory = []) {
  if (!PASSWORD_POLICY.historyCheck || passwordHistory.length === 0) {
    return true;
  }

  try {
    const bcrypt = require('bcrypt');

    for (const hash of passwordHistory.slice(0, PASSWORD_POLICY.maxHistorySize)) {
      const isMatch = await bcrypt.compare(password, hash);
      if (isMatch) {
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('[PasswordPolicy] Error checking password history', { error: error.message });
    return true; // Allow password change on error to avoid blocking users
  }
}

/**
 * Joi schema for password validation
 */
const passwordSchema = Joi.string()
  .min(PASSWORD_POLICY.minLength)
  .max(PASSWORD_POLICY.maxLength)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).*$/)
  .messages({
    'string.min': `Password must be at least ${PASSWORD_POLICY.minLength} characters long`,
    'string.max': `Password must be no more than ${PASSWORD_POLICY.maxLength} characters long`,
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  });

/**
 * Validates password confirmation
 * @param {string} password - Password
 * @param {string} confirmPassword - Password confirmation
 * @returns {Object} Validation result
 */
function validatePasswordConfirmation(password, confirmPassword) {
  if (password !== confirmPassword) {
    return {
      isValid: false,
      issues: ['Password confirmation does not match']
    };
  }

  return {
    isValid: true,
    issues: []
  };
}

/**
 * Comprehensive password validation middleware
 */
function validatePassword(options = {}) {
  return (req, res, next) => {
    const { password, confirmPassword, currentPassword } = req.body;
    const issues = [];

    // Validate password strength
    const strengthResult = validatePasswordStrength(password, options);
    if (!strengthResult.isValid) {
      issues.push(...strengthResult.issues);
    }

    // Validate password confirmation if provided
    if (confirmPassword !== undefined) {
      const confirmationResult = validatePasswordConfirmation(password, confirmPassword);
      if (!confirmationResult.isValid) {
        issues.push(...confirmationResult.issues);
      }
    }

    if (issues.length > 0) {
      logger.warn('[PasswordPolicy] Password validation failed', {
        endpoint: req.originalUrl,
        method: req.method,
        issues: issues.length
      });

      return res.status(400).json({
        error: 'Password validation failed',
        details: issues
      });
    }

    // Add strength information to request for downstream use
    req.passwordStrength = strengthResult;
    next();
  };
}

module.exports = {
  PASSWORD_STRENGTH,
  PASSWORD_POLICY,
  validatePasswordStrength,
  checkPasswordHistory,
  validatePasswordConfirmation,
  validatePassword,
  passwordSchema,
  COMMON_PASSWORDS
};
