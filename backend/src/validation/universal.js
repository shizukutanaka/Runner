const Joi = require('joi');

/**
 * Universal validation schemas for production-grade input validation
 * Provides comprehensive, reusable validation schemas across all API endpoints
 */

// Base schemas for common field types
const schemas = {
  // ID fields
  id: Joi.string()
    .trim()
    .min(1)
    .max(255)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .messages({
      'string.pattern.base': 'ID must contain only alphanumeric characters, hyphens, and underscores',
      'string.min': 'ID must not be empty',
      'string.max': 'ID must not exceed 255 characters'
    }),

  uuid: Joi.string()
    .uuid({ version: ['uuidv4'] })
    .messages({
      'string.guid': 'Must be a valid UUID v4'
    }),

  // Platform identifiers
  platform: Joi.string()
    .valid('youtube', 'twitch', 'other')
    .messages({
      'any.only': 'Platform must be one of: youtube, twitch, other'
    }),

  // User-related fields
  username: Joi.string()
    .trim()
    .min(1)
    .max(255)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .messages({
      'string.pattern.base': 'Username must contain only alphanumeric characters, hyphens, and underscores'
    }),

  email: Joi.string()
    .trim()
    .email({ tlds: { allow: false } })
    .max(320)
    .messages({
      'string.email': 'Must be a valid email address',
      'string.max': 'Email must not exceed 320 characters'
    }),

  // Content fields
  content: Joi.string()
    .trim()
    .min(1)
    .max(10000)
    .messages({
      'string.min': 'Content must not be empty',
      'string.max': 'Content must not exceed 10,000 characters'
    }),

  shortContent: Joi.string()
    .trim()
    .min(1)
    .max(1000)
    .messages({
      'string.min': 'Content must not be empty',
      'string.max': 'Content must not exceed 1,000 characters'
    }),

  // Moderation fields
  moderationStatus: Joi.string()
    .valid('active', 'hidden', 'muted', 'banned', 'flagged', 'pending')
    .messages({
      'any.only': 'Status must be one of: active, hidden, muted, banned, flagged, pending'
    }),

  moderationAction: Joi.string()
    .valid('hide', 'mute', 'ban', 'approve', 'flag', 'warn')
    .messages({
      'any.only': 'Action must be one of: hide, mute, ban, approve, flag, warn'
    }),

  moderationReason: Joi.string()
    .trim()
    .max(1000)
    .messages({
      'string.max': 'Reason must not exceed 1,000 characters'
    }),

  // Numeric fields
  positiveInteger: Joi.number()
    .integer()
    .min(1)
    .messages({
      'number.min': 'Must be a positive integer',
      'number.integer': 'Must be an integer'
    }),

  nonNegativeInteger: Joi.number()
    .integer()
    .min(0)
    .messages({
      'number.min': 'Must be a non-negative integer',
      'number.integer': 'Must be an integer'
    }),

  percentage: Joi.number()
    .min(0)
    .max(100)
    .messages({
      'number.min': 'Percentage must be at least 0',
      'number.max': 'Percentage must not exceed 100'
    }),

  score: Joi.number()
    .min(0)
    .max(1)
    .messages({
      'number.min': 'Score must be at least 0',
      'number.max': 'Score must not exceed 1'
    }),

  // Date/Time fields
  timestamp: Joi.alternatives()
    .try(
      Joi.date().iso(),
      Joi.string().isoDate()
    )
    .messages({
      'alternatives.match': 'Must be a valid ISO date/time'
    }),

  // Pagination fields
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.min': 'Page must be at least 1',
      'number.integer': 'Page must be an integer'
    }),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(50)
    .messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit must not exceed 1,000',
      'number.integer': 'Limit must be an integer'
    }),

  offset: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .messages({
      'number.min': 'Offset must be non-negative',
      'number.integer': 'Offset must be an integer'
    }),

  // Sorting fields
  sortField: Joi.string()
    .trim()
    .max(50)
    .pattern(/^[a-zA-Z_]+$/)
    .messages({
      'string.pattern.base': 'Sort field must contain only letters and underscores',
      'string.max': 'Sort field must not exceed 50 characters'
    }),

  sortOrder: Joi.string()
    .valid('asc', 'desc', 'ASC', 'DESC')
    .default('desc')
    .messages({
      'any.only': 'Sort order must be asc or desc'
    }),

  // File fields
  fileName: Joi.string()
    .trim()
    .min(1)
    .max(255)
    .pattern(/^[a-zA-Z0-9_.-]+$/)
    .messages({
      'string.pattern.base': 'File name must contain only alphanumeric characters, dots, hyphens, and underscores',
      'string.max': 'File name must not exceed 255 characters'
    }),

  mimeType: Joi.string()
    .pattern(/^[a-z]+\/[a-z0-9+.-]+$/i)
    .messages({
      'string.pattern.base': 'Must be a valid MIME type'
    }),

  // URL fields
  url: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .max(2048)
    .messages({
      'string.uri': 'Must be a valid HTTP(S) URL',
      'string.max': 'URL must not exceed 2,048 characters'
    }),

  // Boolean fields
  boolean: Joi.boolean()
    .messages({
      'boolean.base': 'Must be a boolean value'
    }),

  // Language/Locale fields
  language: Joi.string()
    .length(2)
    .pattern(/^[a-z]{2}$/)
    .messages({
      'string.length': 'Language code must be 2 characters',
      'string.pattern.base': 'Language code must be lowercase letters'
    }),

  timezone: Joi.string()
    .max(50)
    .messages({
      'string.max': 'Timezone must not exceed 50 characters'
    }),

  // IP address
  ipAddress: Joi.alternatives()
    .try(
      Joi.string().ip({ version: ['ipv4', 'ipv6'] }),
      Joi.string().pattern(/^(\d{1,3}\.){3}\d{1,3}$/)
    )
    .messages({
      'alternatives.match': 'Must be a valid IP address'
    }),

  // Color fields
  hexColor: Joi.string()
    .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .messages({
      'string.pattern.base': 'Must be a valid hex color code'
    }),

  // Tags/Keywords
  tag: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .messages({
      'string.pattern.base': 'Tag must contain only alphanumeric characters, hyphens, and underscores',
      'string.max': 'Tag must not exceed 50 characters'
    }),

  tags: Joi.array()
    .items(Joi.string().trim().min(1).max(50))
    .max(20)
    .messages({
      'array.max': 'Cannot have more than 20 tags'
    }),

  // JSON fields
  jsonObject: Joi.object()
    .unknown(true)
    .messages({
      'object.base': 'Must be a valid JSON object'
    }),

  // Security-related
  token: Joi.string()
    .trim()
    .min(20)
    .max(1000)
    .messages({
      'string.min': 'Token must be at least 20 characters',
      'string.max': 'Token must not exceed 1,000 characters'
    })
};

/**
 * Composite schemas for complex validation scenarios
 */
const compositeSchemas = {
  // Comment validation
  createComment: Joi.object({
    platform: schemas.platform.required(),
    user: schemas.username.required(),
    content: schemas.content.required(),
    timestamp: schemas.timestamp.optional(),
    metadata: schemas.jsonObject.optional()
  }),

  updateComment: Joi.object({
    id: schemas.id.required(),
    content: schemas.content.optional(),
    status: schemas.moderationStatus.optional(),
    moderationReason: schemas.moderationReason.optional()
  }),

  // User validation
  createUser: Joi.object({
    username: schemas.username.required(),
    email: schemas.email.optional(),
    platform: schemas.platform.required(),
    metadata: schemas.jsonObject.optional()
  }),

  updateUser: Joi.object({
    id: schemas.id.required(),
    username: schemas.username.optional(),
    email: schemas.email.optional(),
    status: schemas.moderationStatus.optional()
  }),

  // Moderation validation
  moderateComment: Joi.object({
    commentId: schemas.id.required(),
    action: schemas.moderationAction.required(),
    moderatorId: schemas.id.required(),
    reason: schemas.moderationReason.optional(),
    metadata: schemas.jsonObject.optional()
  }),

  // Query parameters validation
  listQuery: Joi.object({
    page: schemas.page.optional(),
    limit: schemas.limit.optional(),
    sortBy: schemas.sortField.optional(),
    sortOrder: schemas.sortOrder.optional(),
    platform: schemas.platform.optional(),
    status: schemas.moderationStatus.optional(),
    search: schemas.shortContent.optional()
  }),

  // Settings validation
  updateSettings: Joi.object({
    language: schemas.language.optional(),
    timezone: schemas.timezone.optional(),
    theme: Joi.string().valid('light', 'dark', 'auto').optional(),
    notifications: schemas.boolean.optional(),
    metadata: schemas.jsonObject.optional()
  })
};

/**
 * Middleware factory for request validation
 * @param {Object} schema - Joi schema to validate against
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
        timestamp: new Date().toISOString()
      });
    }

    // Replace request property with validated value
    req[property] = value;
    next();
  };
};

/**
 * Sanitize and validate user input
 * @param {any} value - Value to sanitize
 * @param {Object} schema - Joi schema
 * @returns {Object} { valid: boolean, value: any, error: string }
 */
const sanitizeInput = (value, schema) => {
  const { error, value: sanitized } = schema.validate(value, {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  return {
    valid: !error,
    value: error ? null : sanitized,
    error: error ? error.details.map(d => d.message).join(', ') : null
  };
};

module.exports = {
  schemas,
  compositeSchemas,
  validate,
  sanitizeInput
};
