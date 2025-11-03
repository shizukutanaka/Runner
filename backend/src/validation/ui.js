// Joiバリデーションスキーマ（UI設定API用）
const Joi = require('joi');

const colorPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const supportedLanguages = ['ja', 'en', 'zh', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar'];
const safeFontFamilies = [
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  'Noto Sans JP',
  'sans-serif',
  'serif',
  'monospace'
];

const payloadWithin = (maxBytes) => (value, helpers) => {
  try {
    const json = JSON.stringify(value ?? {});
    if (!json) {
      return value;
    }
    const size = Buffer.byteLength(json, 'utf8');
    if (size > maxBytes) {
      return helpers.error('any.invalid');
    }
    return value;
  } catch (error) {
    return helpers.error('any.invalid');
  }
};

const forbidCssInjection = (value, helpers) => {
  if (/<\s*script/i.test(value)) {
    return helpers.error('string.pattern.base');
  }
  if (/expression\s*\(/i.test(value)) {
    return helpers.error('string.pattern.base');
  }
  if (/url\(\s*['"]?javascript:/i.test(value)) {
    return helpers.error('string.pattern.base');
  }
  return value;
};

exports.saveLayout = Joi.object({
  layout: Joi.object().custom(payloadWithin(16384)).required()
});

exports.setColorPattern = Joi.object({
  colors: Joi.object()
    .pattern(Joi.string().min(1).max(40), Joi.string().pattern(colorPattern))
    .min(1)
    .max(12)
    .required()
});

exports.setAccessibility = Joi.object({
  highContrast: Joi.boolean().optional(),
  reduceMotion: Joi.boolean().optional(),
  screenReader: Joi.boolean().optional(),
  focusHighlight: Joi.boolean().optional(),
  keyboardNavigation: Joi.boolean().optional()
}).min(1);

exports.setFont = Joi.object({
  font: Joi.string().valid(...safeFontFamilies).required()
});

exports.setZoom = Joi.object({
  zoom: Joi.number().min(0.5).max(2).precision(2).required()
});

exports.setAutoDarkMode = Joi.object({
  enabled: Joi.boolean().required()
});

exports.setBadge = Joi.object({
  badge: Joi.object({
    text: Joi.string().max(50).required(),
    color: Joi.string().pattern(colorPattern).default('#2563eb'),
    backgroundColor: Joi.string().pattern(colorPattern).default('#e2e8f0'),
    tooltip: Joi.string().max(120).allow('', null)
  }).required()
});

exports.setHelp = Joi.object({
  help: Joi.object({
    title: Joi.string().max(120).required(),
    description: Joi.string().max(500).allow('', null),
    url: Joi.string().uri({ scheme: ['https'] }).allow(null, ''),
    sections: Joi.array()
      .items(
        Joi.object({
          title: Joi.string().max(100).required(),
          body: Joi.string().max(4000).required()
        })
      )
      .max(20)
      .default([])
  }).required()
});

exports.setLanguage = Joi.object({
  language: Joi.string().valid(...supportedLanguages).required()
});

exports.setCustomCss = Joi.object({
  css: Joi.string().max(2000).custom(forbidCssInjection).allow('').default('')
});
