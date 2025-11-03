const Joi = require('joi');

const planId = Joi.string().trim().max(100).required();
const userId = Joi.string().trim().max(64);
const url = Joi.string().uri({ allowRelative: false }).max(2048);

exports.subscriptionStatusQuery = Joi.object({
  userId: userId.optional()
});

exports.createCheckoutSession = Joi.object({
  planId,
  email: Joi.string().email().max(254).optional(),
  successUrl: url.optional(),
  cancelUrl: url.optional(),
  locale: Joi.string().trim().max(10).optional(),
  userId: userId.optional()
});

exports.createBillingPortalSession = Joi.object({
  returnUrl: url.optional(),
  userId: userId.optional()
});
