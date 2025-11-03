const Joi = require('joi');
const logger = require('../logger');
const { passwordSchema } = require('./passwordPolicy');

class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.details = details;
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

class ConflictError extends Error {
  constructor(message = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
  }
}

class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
  }
}

const commonSchemas = {
  id: Joi.string().trim().min(1).max(255),
  email: Joi.string().email().lowercase().trim(),
  url: Joi.string().uri(),
  timestamp: Joi.date().iso(),
  pagination: {
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    page: Joi.number().integer().min(1).default(1)
  },
  platform: Joi.string().valid('youtube', 'twitch').required(),
  status: Joi.string().valid('active', 'hidden', 'deleted', 'pending').default('active')
};

const commentSchemas = {
  create: Joi.object({
    platform: commonSchemas.platform,
    user: commonSchemas.id.required(),
    content: Joi.string().trim().min(1).max(2000).required(),
    timestamp: commonSchemas.timestamp
  }),
  update: Joi.object({
    content: Joi.string().trim().min(1).max(2000),
    status: commonSchemas.status,
    moderation_reason: Joi.string().trim().max(500).allow('', null)
  }),
  query: Joi.object({
    platform: Joi.string().valid('youtube', 'twitch'),
    user: commonSchemas.id,
    status: commonSchemas.status,
    limit: commonSchemas.pagination.limit,
    offset: commonSchemas.pagination.offset,
    search: Joi.string().trim().max(100),
    dateFrom: commonSchemas.timestamp,
    dateTo: commonSchemas.timestamp
  })
};

const userSchemas = {
  create: Joi.object({
    id: commonSchemas.id.required(),
    platform: commonSchemas.platform,
    username: Joi.string().trim().min(1).max(100).required(),
    status: commonSchemas.status
  }),
  update: Joi.object({
    username: Joi.string().trim().min(1).max(100),
    status: commonSchemas.status,
    warning_count: Joi.number().integer().min(0).max(10),
    ban_until: commonSchemas.timestamp.allow(null),
    mute_until: commonSchemas.timestamp.allow(null)
  }),
  register: Joi.object({
    username: Joi.string().trim().min(3).max(50).required(),
    email: commonSchemas.email.required(),
    password: passwordSchema.required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
      'any.only': 'Password confirmation does not match'
    })
  }),
  login: Joi.object({
    username: Joi.string().trim().required(),
    password: Joi.string().required(),
    rememberMe: Joi.boolean().default(false)
  }),
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: passwordSchema.required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
      'any.only': 'Password confirmation does not match'
    })
  }),
  resetPassword: Joi.object({
    token: Joi.string().required(),
    newPassword: passwordSchema.required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
      'any.only': 'Password confirmation does not match'
    })
  }),
  query: Joi.object({
    platform: Joi.string().valid('youtube', 'twitch'),
    status: commonSchemas.status,
    username: Joi.string().trim().max(100),
    limit: commonSchemas.pagination.limit,
    offset: commonSchemas.pagination.offset
  })
};

const moderationSchemas = {
  settings: Joi.object({
    platform: commonSchemas.platform,
    thresholds: Joi.object({
      spam: Joi.number().min(0).max(1),
      toxicity: Joi.number().min(0).max(1),
      severe_toxicity: Joi.number().min(0).max(1),
      identity_attack: Joi.number().min(0).max(1),
      insult: Joi.number().min(0).max(1),
      threat: Joi.number().min(0).max(1)
    }),
    banned_words: Joi.array().items(Joi.string().trim().min(1).max(100)).max(1000),
    regex_patterns: Joi.array().items(Joi.string().trim().min(1).max(200)).max(100)
  }),
  action: Joi.object({
    action: Joi.string().valid('approve', 'hide', 'delete', 'warn', 'timeout', 'ban').required(),
    reason: Joi.string().trim().max(500),
    duration: Joi.number().integer().min(1).max(86400) // seconds
  })
};

const validate = (schema, options = {}) => {
  const { abortEarly = false, allowUnknown = false, stripUnknown = true } = options;

  return (req, res, next) => {
    const validationOptions = { abortEarly, allowUnknown, stripUnknown };

    const { error, value } = schema.validate(req.body, validationOptions);

    if (error) {
      const details = error.details.map(detail => ({
        message: detail.message,
        path: detail.path,
        type: detail.type,
        context: detail.context
      }));

      logger.warn('[Validation] Request validation failed', {
        endpoint: req.originalUrl,
        method: req.method,
        errors: details
      });

      return next(new ValidationError('Validation failed', details));
    }

    req.body = value;
    next();
  };
};

const validateQuery = (schema, options = {}) => {
  const { abortEarly = false, allowUnknown = false, stripUnknown = true } = options;

  return (req, res, next) => {
    const validationOptions = { abortEarly, allowUnknown, stripUnknown };

    const { error, value } = schema.validate(req.query, validationOptions);

    if (error) {
      const details = error.details.map(detail => ({
        message: detail.message,
        path: detail.path,
        type: detail.type,
        context: detail.context
      }));

      logger.warn('[Validation] Query validation failed', {
        endpoint: req.originalUrl,
        method: req.method,
        errors: details
      });

      return next(new ValidationError('Query validation failed', details));
    }

    req.query = value;
    next();
  };
};

const validateParams = (schema, options = {}) => {
  const { abortEarly = false, allowUnknown = false, stripUnknown = true } = options;

  return (req, res, next) => {
    const validationOptions = { abortEarly, allowUnknown, stripUnknown };

    const { error, value } = schema.validate(req.params, validationOptions);

    if (error) {
      const details = error.details.map(detail => ({
        message: detail.message,
        path: detail.path,
        type: detail.type,
        context: detail.context
      }));

      logger.warn('[Validation] Params validation failed', {
        endpoint: req.originalUrl,
        method: req.method,
        errors: details
      });

      return next(new ValidationError('Parameter validation failed', details));
    }

    req.params = value;
    next();
  };
};

module.exports = {
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  commonSchemas,
  commentSchemas,
  userSchemas,
  moderationSchemas,
  validate,
  validateQuery,
  validateParams,
  Joi
};