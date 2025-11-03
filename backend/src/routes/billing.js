const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const validate = require('../middleware/validation');
const billingSchema = require('../validation/billing');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { verifyStripeWebhook } = require('../middleware/webhookSecurity');

router.post(
  '/webhook',
  verifyStripeWebhook,
  billingController.handleWebhook
);

router.use(authenticateToken);

router.get('/plans', requireRole('user'), billingController.listPlans);
router.get(
  '/subscription',
  requireRole('user'),
  validate({ query: billingSchema.subscriptionStatusQuery }),
  billingController.getSubscriptionStatus
);
router.post(
  '/checkout',
  requireRole('user'),
  validate({ body: billingSchema.createCheckoutSession }),
  billingController.createCheckoutSession
);
router.post(
  '/portal',
  requireRole('user'),
  validate({ body: billingSchema.createBillingPortalSession }),
  billingController.createBillingPortalSession
);

module.exports = router;
