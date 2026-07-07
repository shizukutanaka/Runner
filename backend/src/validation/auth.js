const Joi = require('joi');
const { passwordSchema } = require('../utils/passwordPolicy');

exports.register = Joi.object({
  username: Joi.string().min(3).max(100).required(),
  email: Joi.string().email().required(),
  password: passwordSchema.required()
});

exports.login = Joi.object({
  username: Joi.string().max(255).required(),
  password: Joi.string().max(128).required()
});

exports.forgotPassword = Joi.object({
  email: Joi.string().email().required()
});

exports.resetPassword = Joi.object({
  token: Joi.string().required(),
  newPassword: passwordSchema.required()
});

exports.changePassword = Joi.object({
  currentPassword: Joi.string().max(128).required(),
  newPassword: passwordSchema.required()
});

exports.refresh = Joi.object({
  refreshToken: Joi.string().required()
});

exports.verify2FA = Joi.object({
  code: Joi.string().length(6).pattern(/^\d+$/).required()
});

exports.setRole = Joi.object({
  role: Joi.string().valid('moderator', 'admin').required()
});
