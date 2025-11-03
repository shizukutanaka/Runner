const Joi = require('joi');
const logger = require('../logger');

// バリデーションエラーのフォーマット
const formatValidationErrors = (errors) => {
  return errors.details.map((detail) => ({
    field: detail.path.join('.'),
    message: detail.message,
    type: detail.type
  }));
};

// 汎用バリデーションミドルウェア
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = req[source];

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      logger.warn('[Validation] Request validation failed', {
        source,
        errors: formatValidationErrors(error),
        path: req.originalUrl,
        ip: req.ip
      });

      return res.status(400).json({
        status: 400,
        error: 'Validation failed',
        details: formatValidationErrors(error)
      });
    }

    // バリデート済みの値で上書き（型変換やデフォルト値適用済み）
    req[source] = value;
    next();
  };
};

// 共通のバリデーションルール
const commonSchemas = {
  id: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .max(100)
    .required()
    .messages({
      'string.pattern.base': 'ID must contain only alphanumeric characters, hyphens, and underscores',
      'string.max': 'ID must not exceed 100 characters'
    }),

  platform: Joi.string()
    .valid('youtube', 'twitch')
    .required()
    .messages({
      'any.only': 'Platform must be either youtube or twitch'
    }),

  status: Joi.string()
    .valid('visible', 'hidden', 'pending', 'flagged', 'archived')
    .messages({
      'any.only': 'Invalid status value'
    }),

  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0)
  }),

  search: Joi.string()
    .min(1)
    .max(200)
    .trim()
    .messages({
      'string.min': 'Search query must be at least 1 character',
      'string.max': 'Search query must not exceed 200 characters'
    })
};

// コメント関連のバリデーションスキーマ
const commentSchemas = {
  create: Joi.object({
    content: Joi.string()
      .min(1)
      .max(2000)
      .trim()
      .required()
      .messages({
        'string.empty': 'Comment content is required',
        'string.max': 'Comment must not exceed 2000 characters'
      }),

    user: Joi.string()
      .min(1)
      .max(100)
      .trim()
      .required()
      .messages({
        'string.empty': 'User is required',
        'string.max': 'User name must not exceed 100 characters'
      }),

    platform: commonSchemas.platform
  }),

  update: Joi.object({
    action: Joi.string()
      .valid('approve', 'reject', 'hide', 'archive', 'flag')
      .required()
      .messages({
        'any.only': 'Invalid action',
        'any.required': 'Action is required'
      }),

    reason: Joi.string()
      .max(500)
      .trim()
      .allow('', null)
      .messages({
        'string.max': 'Reason must not exceed 500 characters'
      })
  }),

  query: Joi.object({
    platform: Joi.string().valid('youtube', 'twitch'),
    status: commonSchemas.status,
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0),
    search: commonSchemas.search
  }),

  setAvatar: Joi.object({
    avatarUrl: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .max(500)
      .required()
      .messages({
        'string.uri': 'Avatar URL must be a valid HTTP/HTTPS URL',
        'string.max': 'Avatar URL must not exceed 500 characters'
      })
  }),

  setBackgroundColor: Joi.object({
    color: Joi.string()
      .pattern(/^#[0-9A-Fa-f]{6}$/)
      .required()
      .messages({
        'string.pattern.base': 'Color must be a valid hex color (e.g., #FF5733)'
      })
  }),

  setHighlight: Joi.object({
    highlight: Joi.boolean().required()
  }),

  setPin: Joi.object({
    pinned: Joi.boolean().required()
  }),

  setAutoArchive: Joi.object({
    autoArchive: Joi.boolean().required()
  }),

  setExternalShare: Joi.object({
    shared: Joi.boolean().required()
  }),

  setNotificationFrequency: Joi.object({
    frequency: Joi.string()
      .valid('immediate', 'hourly', 'daily', 'weekly', 'never')
      .required()
      .messages({
        'any.only': 'Invalid notification frequency'
      })
  }),

  summarize: Joi.object({
    comments: Joi.array()
      .items(
        Joi.object({
          content: Joi.string().required(),
          platform: Joi.string().required(),
          user: Joi.string().required()
        })
      )
      .min(1)
      .max(1000)
      .required()
      .messages({
        'array.min': 'At least one comment is required',
        'array.max': 'Cannot summarize more than 1000 comments at once'
      })
  }),

  autoAnswer: Joi.object({
    comment: Joi.string()
      .min(1)
      .max(2000)
      .trim()
      .required()
      .messages({
        'string.empty': 'Comment is required',
        'string.max': 'Comment must not exceed 2000 characters'
      }),

    context: Joi.array()
      .items(Joi.string().max(2000))
      .max(10)
      .default([])
      .messages({
        'array.max': 'Context cannot contain more than 10 items'
      })
  })
};

// ユーザー関連のバリデーションスキーマ
const userSchemas = {
  query: Joi.object({
    platform: Joi.string().valid('youtube', 'twitch'),
    status: Joi.string().valid('active', 'banned', 'warned', 'muted'),
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0),
    search: commonSchemas.search
  }),

  updateStatus: Joi.object({
    status: Joi.string()
      .valid('active', 'banned', 'warned', 'muted')
      .required(),

    duration: Joi.number()
      .integer()
      .min(1)
      .max(365 * 24 * 60 * 60 * 1000) // 最大1年
      .when('status', {
        is: Joi.valid('banned', 'muted'),
        then: Joi.required(),
        otherwise: Joi.forbidden()
      })
      .messages({
        'number.max': 'Duration cannot exceed 1 year'
      }),

    reason: Joi.string()
      .max(500)
      .trim()
      .messages({
        'string.max': 'Reason must not exceed 500 characters'
      })
  })
};

// 設定関連のバリデーションスキーマ
const settingsSchemas = {
  update: Joi.object({
    moderationThreshold: Joi.number()
      .min(0)
      .max(100)
      .messages({
        'number.min': 'Threshold must be at least 0',
        'number.max': 'Threshold must not exceed 100'
      }),

    bannedWords: Joi.array()
      .items(Joi.string().trim().min(1).max(100))
      .max(1000)
      .messages({
        'array.max': 'Cannot have more than 1000 banned words'
      }),

    autoModeration: Joi.boolean(),

    notificationSettings: Joi.object({
      email: Joi.boolean(),
      push: Joi.boolean(),
      frequency: Joi.string().valid('immediate', 'hourly', 'daily', 'weekly')
    })
  }).min(1).messages({
    'object.min': 'At least one setting must be provided'
  })
};

// パラメータバリデーション（URL params用）
const paramSchemas = {
  id: Joi.object({
    id: commonSchemas.id
  })
};

module.exports = {
  validate,
  commentSchemas,
  userSchemas,
  settingsSchemas,
  paramSchemas,
  commonSchemas
};
