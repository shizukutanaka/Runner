// Joiバリデーションスキーマ（settings API用）
const Joi = require('joi');

exports.setTheme = Joi.object({
  theme: Joi.string().valid('light', 'dark', 'system').required(),
});

exports.setLayout = Joi.object({
  layout: Joi.string().max(50).required(),
});

exports.setNotifications = Joi.object({
  notifications: Joi.boolean().required(),
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
