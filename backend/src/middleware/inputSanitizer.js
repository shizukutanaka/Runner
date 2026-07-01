const validator = require('validator');
const xss = require('xss');
const logger = require('../logger');

// Custom XSS options for strict sanitization
const xssOptions = {
  whiteList: {
    a: ['href', 'title', 'target'],
    b: [],
    i: [],
    em: [],
    strong: [],
    p: [],
    br: [],
    ul: [],
    ol: [],
    li: [],
    blockquote: [],
    code: [],
    pre: []
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
  onIgnoreTagAttr: (tag, name, value) => {
    // Log suspicious attributes
    logger.warn('[Sanitizer] Suspicious attribute detected', {
      tag,
      attribute: name,
      value: value.substring(0, 100)
    });
    return '';
  }
};

// SQL injection patterns
const sqlInjectionPatterns = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|DECLARE|CAST|CONVERT)\b)/gi,
  /(--|#|\/\*|\*\/)/g,
  /(\bOR\b\s*\d+\s*=\s*\d+)/gi,
  /(\bAND\b\s*\d+\s*=\s*\d+)/gi,
  /(';|";|`;)/g
];

// NoSQL injection patterns
const noSqlInjectionPatterns = [
  /\$where/gi,
  /\$regex/gi,
  /\$ne/gi,
  /\$gt/gi,
  /\$lt/gi,
  /\$exists/gi,
  /\$type/gi,
  /\$in/gi,
  /\$nin/gi,
  /\$or/gi,
  /\$and/gi,
  /\$not/gi,
  /\$mod/gi,
  /\$elemMatch/gi,
  /\$size/gi
];

// Command injection patterns
const commandInjectionPatterns = [
  /[;&|`$(){}[\]<>\\]/g,
  /\b(cat|ls|rm|mv|cp|mkdir|touch|chmod|chown|sudo|su|wget|curl|nc|netcat|python|perl|ruby|php|node|bash|sh|zsh|powershell)\b/gi
];

// Path traversal patterns
const pathTraversalPatterns = [
  /\.\.\//g,
  /\.\.%2f/gi,
  /\.\.%5c/gi,
  /\.\.\\/g,
  /%2e%2e/gi,
  /\.\./g
];

// Sanitize input based on type
const sanitizeInput = (input, type = 'text') => {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input !== 'string') {
    return input;
  }

  let sanitized = input;

  // Basic trimming and normalization
  sanitized = sanitized.trim();
  sanitized = validator.stripLow(sanitized); // Remove ASCII control characters

  switch (type) {
    case 'email':
      sanitized = validator.normalizeEmail(sanitized) || '';
      if (!validator.isEmail(sanitized)) {
        logger.warn('[Sanitizer] Invalid email detected', { input: input.substring(0, 50) });
        return null;
      }
      break;

    case 'url':
      if (!validator.isURL(sanitized, { require_protocol: true })) {
        logger.warn('[Sanitizer] Invalid URL detected', { input: input.substring(0, 100) });
        return null;
      }
      break;

    case 'username':
      // Allow alphanumeric, underscore, dash, dot
      sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '');
      sanitized = validator.escape(sanitized);
      if (sanitized.length < 3 || sanitized.length > 30) {
        return null;
      }
      break;

    case 'comment':
      // Apply XSS protection for comments
      sanitized = xss(sanitized, xssOptions);
      // Check for injection patterns
      for (const pattern of sqlInjectionPatterns) {
        if (pattern.test(sanitized)) {
          logger.warn('[Sanitizer] SQL injection pattern detected');
          sanitized = sanitized.replace(pattern, '');
        }
      }
      break;

    case 'search':
      // Sanitize search queries
      sanitized = validator.escape(sanitized);
      sanitized = sanitized.replace(/[^\w\s.-]/g, '');
      break;

    case 'json':
      try {
        // Validate JSON structure
        const parsed = JSON.parse(sanitized);
        // Re-stringify to remove any extra properties
        sanitized = JSON.stringify(parsed);
      } catch (e) {
        logger.warn('[Sanitizer] Invalid JSON detected');
        return null;
      }
      break;

    case 'path':
      // Prevent path traversal
      for (const pattern of pathTraversalPatterns) {
        if (pattern.test(sanitized)) {
          logger.warn('[Sanitizer] Path traversal attempt detected');
          return null;
        }
      }
      sanitized = validator.escape(sanitized);
      break;

    case 'command':
      // Prevent command injection
      for (const pattern of commandInjectionPatterns) {
        if (pattern.test(sanitized)) {
          logger.warn('[Sanitizer] Command injection attempt detected');
          return null;
        }
      }
      break;

    case 'mongoId':
      // Validate MongoDB ObjectId
      if (!validator.isMongoId(sanitized)) {
        return null;
      }
      break;

    case 'uuid':
      // Validate UUID
      if (!validator.isUUID(sanitized)) {
        return null;
      }
      break;

    case 'integer':
      if (!validator.isInt(sanitized)) {
        return null;
      }
      sanitized = parseInt(sanitized, 10);
      break;

    case 'float':
      if (!validator.isFloat(sanitized)) {
        return null;
      }
      sanitized = parseFloat(sanitized);
      break;

    case 'boolean':
      sanitized = validator.toBoolean(sanitized);
      break;

    case 'date':
      if (!validator.isISO8601(sanitized)) {
        return null;
      }
      break;

    case 'html':
      // Strict HTML sanitization
      sanitized = xss(sanitized, xssOptions);
      break;

    default:
      // Default text sanitization
      sanitized = validator.escape(sanitized);
      break;
  }

  // Check for NoSQL injection patterns in all types
  for (const pattern of noSqlInjectionPatterns) {
    if (pattern.test(sanitized)) {
      logger.warn('[Sanitizer] NoSQL injection pattern detected');
      if (typeof sanitized === 'string') {
        sanitized = sanitized.replace(pattern, '');
      }
    }
  }

  return sanitized;
};

// Middleware to sanitize request body
const sanitizeBody = (fields = {}) => {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return next();
    }

    const sanitized = {};
    const errors = [];

    for (const [field, type] of Object.entries(fields)) {
      if (req.body[field] !== undefined) {
        const clean = sanitizeInput(req.body[field], type);
        if (clean === null && req.body[field] !== null) {
          errors.push(`Invalid ${field}`);
        } else {
          sanitized[field] = clean;
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        status: 400,
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace body with sanitized version
    req.body = { ...req.body, ...sanitized };
    next();
  };
};

// Middleware to sanitize query parameters
const sanitizeQuery = (fields = {}) => {
  return (req, res, next) => {
    if (!req.query || typeof req.query !== 'object') {
      return next();
    }

    const sanitized = {};
    const errors = [];

    for (const [field, type] of Object.entries(fields)) {
      if (req.query[field] !== undefined) {
        const clean = sanitizeInput(req.query[field], type);
        if (clean === null && req.query[field] !== null) {
          errors.push(`Invalid ${field}`);
        } else {
          sanitized[field] = clean;
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        status: 400,
        error: 'Invalid query parameters',
        details: errors
      });
    }

    // Replace query with sanitized version
    req.query = { ...req.query, ...sanitized };
    next();
  };
};

// Sanitize file uploads
const sanitizeFile = (file) => {
  if (!file) return null;

  // Sanitize filename
  let filename = file.originalname || file.name || '';
  filename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

  // Check for double extensions
  if (filename.match(/\.[^.]+\.[^.]+$/)) {
    logger.warn('[Sanitizer] Double extension detected in filename', { filename });
    return null;
  }

  // Check for dangerous extensions
  const dangerousExtensions = [
    'exe', 'dll', 'bat', 'cmd', 'sh', 'ps1', 'app',
    'vb', 'vbs', 'js', 'jar', 'scr', 'msi'
  ];

  const ext = filename.split('.').pop().toLowerCase();
  if (dangerousExtensions.includes(ext)) {
    logger.warn('[Sanitizer] Dangerous file extension detected', { filename, extension: ext });
    return null;
  }

  // Check MIME type
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'application/pdf',
    'text/plain',
    'text/csv'
  ];

  if (file.mimetype && !allowedMimeTypes.includes(file.mimetype)) {
    logger.warn('[Sanitizer] Invalid MIME type detected', { mimetype: file.mimetype });
    return null;
  }

  return {
    ...file,
    originalname: filename
  };
};

// Content Security Policy generator
const generateCSP = () => {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    connectSrc: ["'self'", 'wss:', 'https:'],
    mediaSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: true
  };
};

module.exports = {
  sanitizeInput,
  sanitizeBody,
  sanitizeQuery,
  sanitizeFile,
  generateCSP
};