// Joiバリデーションスキーマ（settings API用）
const Joi = require('joi');

exports.userIdParam = Joi.object({
  userId: Joi.string().required(),
});

exports.commentIdParam = Joi.object({
  commentId: Joi.string().required(),
});

exports.setTheme = Joi.object({
  theme: Joi.string().valid('light', 'dark', 'system').required(),
});

exports.setLayout = Joi.object({
  layout: Joi.string().max(50).required(),
});

exports.setNotifications = Joi.object({
  enabled: Joi.boolean().required(),
  email: Joi.boolean(),
  push: Joi.boolean(),
  sound: Joi.boolean(),
  frequency: Joi.string().valid('real-time', 'hourly', 'daily', 'weekly'),
  preferences: Joi.object({
    mentions: Joi.boolean(),
    replies: Joi.boolean(),
    updates: Joi.boolean(),
    newsletter: Joi.boolean()
  })
});

exports.setDefaultLanguage = Joi.object({
  language: Joi.string().max(10).required(),
});

exports.setTimezone = Joi.object({
  timezone: Joi.string().max(50).required(),
});

exports.setDisplay = Joi.object({
  fontSize: Joi.string().valid('small', 'medium', 'large'),
  density: Joi.string().valid('compact', 'normal', 'comfortable'),
  theme: Joi.string().valid('light', 'dark', 'system'),
  showAvatars: Joi.boolean(),
  showImages: Joi.boolean(),
  showVideos: Joi.boolean(),
  showGifs: Joi.boolean(),
  autoPlayMedia: Joi.boolean(),
  reduceAnimations: Joi.boolean(),
  highContrast: Joi.boolean(),
});

exports.setAdminEmail = Joi.object({
  adminEmail: Joi.string().email().required(),
});

exports.manageApiKeys = Joi.object({
  action: Joi.string().valid('create', 'revoke', 'list', 'update').required(),
  keyName: Joi.string().max(100),
  permissions: Joi.array().items(Joi.string().valid('read', 'write', 'admin')),
  expiresIn: Joi.number().integer().min(1),
});

exports.setExternalIntegration = Joi.object({
  service: Joi.string().valid('slack', 'discord', 'google', 'microsoft', 'github', 'twitter').required(),
  action: Joi.string().valid('connect', 'disconnect', 'update').required(),
  credentials: Joi.object().optional(),
});

exports.setUICustomization = Joi.object({
  primaryColor: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  secondaryColor: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  fontFamily: Joi.string().max(100),
  borderRadius: Joi.number().min(0).max(64),
  boxShadow: Joi.string().max(100),
  animationSpeed: Joi.string().max(20),
  customCSS: Joi.string().max(2000),
  layout: Joi.object(),
});

exports.setAutoBackup = Joi.object({
  enabled: Joi.boolean().required(),
  frequency: Joi.string().valid('daily', 'weekly', 'monthly'),
  time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  maxBackups: Joi.number().integer().min(1),
  notifyOnSuccess: Joi.boolean(),
  notifyOnFailure: Joi.boolean(),
});

exports.exportSettings = Joi.object({
  format: Joi.string().valid('json', 'yaml', 'toml'),
  includeSensitive: Joi.boolean(),
});

exports.importSettings = Joi.object({
  settings: Joi.object().required(),
  merge: Joi.boolean(),
});

// コメント最大文字数設定
exports.setCommentMaxLength = Joi.object({
  maxLength: Joi.number().integer().min(1).max(10000).required(),
});

// コメント自動翻訳設定
exports.setAutoTranslation = Joi.object({
  enabled: Joi.boolean().required(),
  targetLanguage: Joi.string()
    .valid('ja', 'en', 'zh', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar')
    .default('ja'),
  sourceLanguage: Joi.string()
    .valid('auto', 'ja', 'en', 'zh', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar')
    .default('auto'),
  provider: Joi.string().valid('google', 'azure', 'aws').default('google'),
  usageLimitPerHour: Joi.number().integer().min(0).max(1000).default(120),
  fallbackLanguages: Joi.array()
    .items(Joi.string().valid('ja', 'en', 'zh', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar'))
    .max(5)
    .default([]),
  notifyOnFailure: Joi.boolean().default(false),
});

// コメントピン固定数設定
exports.setPinLimit = Joi.object({
  limit: Joi.number().integer().min(1).max(100).required(),
});

// コメント自動削除時間設定
exports.setAutoDeleteTime = Joi.object({
  hours: Joi.number().integer().min(0).max(8760).required(),
});

// NGワード自動追加設定
exports.setAutoNGWordAddition = Joi.object({
  enabled: Joi.boolean().required(),
  threshold: Joi.number().min(0.1).max(1.0),
  minOccurrences: Joi.number().integer().min(1),
  excludedWords: Joi.array().items(Joi.string().max(50)),
});

// AI閾値個別設定
exports.setIndividualAIThreshold = Joi.object({
  commentId: Joi.string().required(),
  threshold: Joi.number().min(0).max(1).required(),
});

// ユーザーごとのテーマ設定
exports.setUserTheme = Joi.object({
  theme: Joi.string().valid('light', 'dark', 'system', 'custom').required(),
  primaryColor: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  secondaryColor: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
});

// ユーザーごとのBAN理由記録
exports.setBanReason = Joi.object({
  targetUserId: Joi.string().required(),
  reason: Joi.string().max(500).required(),
  duration: Joi.string().valid('1h', '6h', '12h', '1d', '3d', '7d', '30d', 'permanent'),
  moderatorNotes: Joi.string().max(1000),
});

// ユーザーごとのミュート期間設定
exports.setUserMuteDuration = Joi.object({
  targetUserId: Joi.string().required(),
  duration: Joi.string().valid('5m', '15m', '30m', '1h', '6h', '12h', '1d', '3d').required(),
  reason: Joi.string().max(500),
});

// ユーザーごとのコメント色設定
exports.setUserCommentColor = Joi.object({
  targetUserId: Joi.string().required(),
  color: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).required(),
  applyTo: Joi.string().valid('all', 'youtube', 'twitch'),
});

// コメントごとのリアクション設定
exports.setCommentReaction = Joi.object({
  commentId: Joi.string().required(),
  reactionType: Joi.string().valid('like', 'dislike', 'love', 'laugh', 'angry', 'sad', 'surprise').required(),
});

// コメントごとのタグ付与
exports.setCommentTag = Joi.object({
  commentId: Joi.string().required(),
  tag: Joi.string().max(50).required(),
});

// AI判定ログ取得
exports.getAIModerationLogs = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

// コメント編集履歴取得
exports.getCommentEditHistory = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

// スローモード設定
exports.updateSlowModeSettings = Joi.object({
  enabled: Joi.boolean().required(),
  intervalSeconds: Joi.number().integer().min(0).max(300),
  platformSpecific: Joi.object({
    youtube: Joi.object({
      enabled: Joi.boolean(),
      intervalSeconds: Joi.number().integer().min(0).max(300)
    }),
    twitch: Joi.object({
      enabled: Joi.boolean(),
      intervalSeconds: Joi.number().integer().min(0).max(300)
    })
  })
});

// 設定ごとの自動復元
exports.setAutoRestore = Joi.object({
  enabled: Joi.boolean().required(),
  restorePoints: Joi.number().integer().min(1).max(100),
  frequency: Joi.string().valid('manual', 'hourly', 'daily', 'weekly'),
  maxRestores: Joi.number().integer().min(1).max(50),
});

// 設定ごとのアクセス権限設定
exports.setAccessPermissions = Joi.object({
  permissions: Joi.object({
    read: Joi.array().items(Joi.string()),
    write: Joi.array().items(Joi.string()),
    admin: Joi.array().items(Joi.string())
  }),
  roles: Joi.array().items(Joi.string()),
  restrictions: Joi.object({
    ipWhitelist: Joi.array().items(Joi.string()),
    timeRestrictions: Joi.object(),
    rateLimits: Joi.object(),
    featureAccess: Joi.object()
  })
});

// 設定ごとの通知設定
exports.setNotificationSettings = Joi.object({
  emailNotifications: Joi.object(),
  pushNotifications: Joi.object(),
  inAppNotifications: Joi.object(),
  webhookNotifications: Joi.object(),
  thresholds: Joi.object()
});

// 設定ごとのUIテーマ設定
exports.setUIThemeSettings = Joi.object({
  themePresets: Joi.array().items(Joi.object()),
  customThemes: Joi.array().items(Joi.object()),
  defaultTheme: Joi.string().valid('light', 'dark', 'system', 'custom'),
  allowCustomThemes: Joi.boolean()
});

// 設定ごとの自動適用
exports.setAutoApply = Joi.object({
  enabled: Joi.boolean().required(),
  triggers: Joi.array().items(Joi.string()),
  conditions: Joi.object(),
  actions: Joi.array().items(Joi.string())
});

// 設定ごとの有効期限設定
exports.setExpirationSettings = Joi.object({
  settingsExpiration: Joi.object(),
  passwordExpiration: Joi.object(),
  sessionExpiration: Joi.object(),
  tokenExpiration: Joi.object(),
  cleanupSettings: Joi.object()
});

// 設定の自動復元実行
exports.executeAutoRestore = Joi.object({
  restorePoint: Joi.string().required(),
  categories: Joi.array().items(Joi.string())
});

// アクセス権限チェック
exports.checkAccessPermission = Joi.object({
  action: Joi.string().required(),
  resource: Joi.string().required()
});

// 設定の有効期限チェック
exports.checkExpirationStatus = Joi.object({
  category: Joi.string().valid('settings', 'password', 'session', 'tokens')
});
