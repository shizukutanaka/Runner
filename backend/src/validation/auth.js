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

// D-7: リフレッシュトークンは httpOnly Cookie から読むのが主経路になったため、
// 本文での指定は**任意**にする。required のままだと、Cookieを持っている
// ブラウザからの `POST /users/refresh`（本文は空）が検証段階で400になり、
// Cookie方式のリフレッシュが一切成立しない。
// 本文が無い場合の「トークンが無い」判定はコントローラー側が401で返す
exports.refresh = Joi.object({
  refreshToken: Joi.string().optional()
});

exports.verify2FA = Joi.object({
  code: Joi.string().length(6).pattern(/^\d+$/).required()
});

exports.setRole = Joi.object({
  role: Joi.string().valid('moderator', 'admin').required()
});
