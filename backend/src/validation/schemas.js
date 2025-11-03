const Joi = require('joi');

/**
 * Comprehensive validation schemas for all API inputs
 */

// Common validation patterns
const patterns = {
  id: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).max(100),
  username: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(3).max(30),
  platform: Joi.string().valid('youtube', 'twitch'),
  status: Joi.string().valid('active', 'hidden', 'muted', 'banned'),
  email: Joi.string().email(),
  url: Joi.string().uri(),
  timestamp: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000),
  offset: Joi.number().integer().min(0),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC')
};

// Comment schemas
const commentSchemas = {
  create: Joi.object({
    id: patterns.id.required(),
    platform: patterns.platform.required(),
    user: Joi.string().max(100).required(),
    content: Joi.string().max(5000).required(),
    timestamp: Joi.string().isoDate().required(),
    moderation_score: Joi.number().min(0).max(1),
    avatar_url: Joi.string().uri().max(500),
    background_color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
    highlight: Joi.boolean(),
    pinned: Joi.boolean()
  }),

  update: Joi.object({
    content: Joi.string().max(5000),
    status: patterns.status,
    moderation_reason: Joi.string().max(500),
    highlight: Joi.boolean(),
    pinned: Joi.boolean(),
    background_color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/),
    auto_archive: Joi.boolean()
  }).min(1),

  moderate: Joi.object({
    action: Joi.string().valid('approve', 'hide', 'mute', 'delete').required(),
    reason: Joi.string().max(500),
    duration: Joi.number().integer().min(0).max(365 * 24 * 60 * 60 * 1000) // Max 1 year
  }),

  query: Joi.object({
    platform: patterns.platform,
    user: Joi.string().max(100),
    status: patterns.status,
    limit: patterns.limit.default(100),
    offset: patterns.offset.default(0),
    sortBy: Joi.string().valid('timestamp', 'user', 'status', 'moderation_score').default('timestamp'),
    sortOrder: patterns.sortOrder.default('desc'),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    search: Joi.string().max(200)
  }),

  bulk: Joi.object({
    commentIds: Joi.array().items(patterns.id).min(1).max(100).required(),
    action: Joi.string().valid('hide', 'approve', 'delete', 'archive').required(),
    reason: Joi.string().max(500)
  })
};

// User schemas
const userSchemas = {
  create: Joi.object({
    id: patterns.id.required(),
    platform: patterns.platform.required(),
    username: patterns.username.required(),
    email: patterns.email,
    profile_image: Joi.string().uri().max(500),
    bio: Joi.string().max(1000),
    language: Joi.string().length(2),
    timezone: Joi.string().max(50)
  }),

  update: Joi.object({
    username: patterns.username,
    email: patterns.email,
    profile_image: Joi.string().uri().max(500),
    bio: Joi.string().max(1000),
    language: Joi.string().length(2),
    timezone: Joi.string().max(50),
    status: patterns.status,
    subscription: Joi.string().valid('free', 'premium', 'enterprise')
  }).min(1),

  moderate: Joi.object({
    action: Joi.string().valid('warn', 'mute', 'ban', 'unban').required(),
    reason: Joi.string().max(500).required(),
    duration: Joi.number().integer().min(0).max(365 * 24 * 60 * 60 * 1000),
    notifyUser: Joi.boolean().default(true)
  }),

  query: Joi.object({
    platform: patterns.platform,
    status: patterns.status,
    username: Joi.string().max(100),
    limit: patterns.limit.default(100),
    offset: patterns.offset.default(0),
    sortBy: Joi.string().valid('username', 'status', 'warning_count', 'ban_until').default('username'),
    sortOrder: patterns.sortOrder.default('asc')
  })
};

// Settings schemas
const settingsSchemas = {
  moderationThresholds: Joi.object({
    platform: patterns.platform.required(),
    thresholds: Joi.object({
      autoHide: Joi.number().min(0).max(1).default(0.8),
      autoMute: Joi.number().min(0).max(1).default(0.9),
      flagForReview: Joi.number().min(0).max(1).default(0.6)
    }).required(),
    bannedWords: Joi.array().items(Joi.string().max(100)).max(1000),
    regexPatterns: Joi.array().items(Joi.string().max(500)).max(100),
    enableAI: Joi.boolean().default(true),
    notifyOnFlag: Joi.boolean().default(true)
  }),

  userPreferences: Joi.object({
    userId: patterns.id.required(),
    theme: Joi.string().valid('light', 'dark', 'auto').default('auto'),
    language: Joi.string().length(2).default('en'),
    timezone: Joi.string().max(50),
    notifications: Joi.object({
      email: Joi.boolean().default(true),
      push: Joi.boolean().default(false),
      frequency: Joi.string().valid('realtime', 'hourly', 'daily').default('realtime')
    }),
    display: Joi.object({
      commentsPerPage: Joi.number().integer().min(10).max(200).default(50),
      autoRefresh: Joi.boolean().default(true),
      refreshInterval: Joi.number().integer().min(5000).max(300000).default(30000)
    })
  }),

  query: Joi.object({
    userId: patterns.id,
    platform: patterns.platform
  })
};

// Notification schemas
const notificationSchemas = {
  create: Joi.object({
    title: Joi.string().max(200).required(),
    message: Joi.string().max(1000).required(),
    type: Joi.string().valid('moderation', 'system', 'alert', 'info').default('system'),
    level: Joi.string().valid('info', 'warning', 'error', 'critical').default('info'),
    metadata: Joi.object().max(50) // Max 50 keys
  }),

  update: Joi.object({
    read: Joi.boolean()
  }),

  query: Joi.object({
    read: Joi.boolean(),
    type: Joi.string().valid('moderation', 'system', 'alert', 'info'),
    level: Joi.string().valid('info', 'warning', 'error', 'critical'),
    limit: patterns.limit.default(50),
    offset: patterns.offset.default(0),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().min(Joi.ref('startDate'))
  })
};

// Analytics schemas
const analyticsSchemas = {
  query: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    platform: patterns.platform,
    granularity: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
    metrics: Joi.array().items(
      Joi.string().valid(
        'total_comments',
        'moderated_comments',
        'active_users',
        'banned_users',
        'response_time',
        'moderation_accuracy'
      )
    ).min(1)
  }),

  export: Joi.object({
    format: Joi.string().valid('json', 'csv', 'xlsx').required(),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    includeMetrics: Joi.array().items(Joi.string()).max(20)
  })
};

// Authentication schemas
const authSchemas = {
  login: Joi.object({
    username: patterns.username.required(),
    password: Joi.string().min(8).max(128).required(),
    rememberMe: Joi.boolean().default(false)
  }),

  register: Joi.object({
    username: patterns.username.required(),
    email: patterns.email.required(),
    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.pattern.base': 'Password must contain uppercase, lowercase, number and special character'
      }),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required()
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().length(64).required()
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
  })
};

// Webhook schemas
const webhookSchemas = {
  create: Joi.object({
    url: patterns.url.required(),
    events: Joi.array()
      .items(Joi.string().valid('comment.created', 'comment.moderated', 'user.banned', 'user.warned'))
      .min(1)
      .required(),
    secret: Joi.string().min(16).max(64),
    enabled: Joi.boolean().default(true),
    headers: Joi.object().pattern(
      Joi.string().max(100),
      Joi.string().max(500)
    ).max(10)
  }),

  update: Joi.object({
    url: patterns.url,
    events: Joi.array().items(Joi.string()).min(1),
    enabled: Joi.boolean(),
    headers: Joi.object().pattern(
      Joi.string().max(100),
      Joi.string().max(500)
    ).max(10)
  }).min(1)
};

/**
 * Validation middleware factory
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    req[property] = value;
    next();
  };
};

module.exports = {
  commentSchemas,
  userSchemas,
  settingsSchemas,
  notificationSchemas,
  analyticsSchemas,
  authSchemas,
  webhookSchemas,
  validate,
  patterns
};
