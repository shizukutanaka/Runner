const Stripe = require('stripe');
const config = require('../config');
const db = require('../db');
const logger = require('../logger');

let stripeClient = null;

const STRIPE_API_VERSION = '2024-06-20';

const createError = (message, { code = 'STRIPE_ERROR', status = 500 } = {}) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
};

const ensureStripeConfigured = () => {
  const { services } = config || {};
  const stripeConfig = services?.stripe;

  if (!stripeConfig || !stripeConfig.secretKey) {
    throw createError('Stripe integration is not configured', {
      code: 'STRIPE_NOT_CONFIGURED',
      status: 503
    });
  }

  return stripeConfig;
};

const getStripeClient = () => {
  if (!stripeClient) {
    const stripeConfig = ensureStripeConfigured();
    stripeClient = new Stripe(stripeConfig.secretKey, {
      apiVersion: STRIPE_API_VERSION
    });
  }
  return stripeClient;
};

const getPlansMap = () => {
  const { services } = config || {};
  const stripeConfig = services?.stripe;
  return stripeConfig?.plans || {};
};

const getPlan = (planId) => {
  const plans = getPlansMap();
  return plans[planId] || null;
};

const getPlanIds = () => {
  return Object.keys(getPlansMap());
};

const findPlanByPriceId = (priceId) => {
  if (!priceId) {
    return null;
  }
  const plans = getPlansMap();
  return Object.entries(plans).find(([, plan]) => plan?.priceId === priceId) || null;
};

const toISOString = (epochSeconds) => {
  if (!epochSeconds) {
    return null;
  }
  return new Date(epochSeconds * 1000).toISOString();
};

const getUserSubscriptionRecord = (userId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT user_id, stripe_customer_id, stripe_subscription_id, plan_id, status,
              current_period_start, current_period_end, cancel_at, cancel_at_period_end,
              metadata, created_at, updated_at
         FROM user_subscriptions
        WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        let metadata = null;
        try {
          metadata = row.metadata ? JSON.parse(row.metadata) : null;
        } catch (parseErr) {
          logger.warn('[StripeService] Failed to parse subscription metadata', {
            userId,
            error: parseErr.message
          });
        }

        resolve({
          userId: row.user_id,
          stripeCustomerId: row.stripe_customer_id,
          stripeSubscriptionId: row.stripe_subscription_id,
          planId: row.plan_id,
          status: row.status,
          currentPeriodStart: row.current_period_start,
          currentPeriodEnd: row.current_period_end,
          cancelAt: row.cancel_at,
          cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
          metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }
    );
  });
};

const upsertSubscriptionRecord = async ({
  userId,
  planId,
  stripeCustomerId,
  stripeSubscriptionId,
  status,
  currentPeriodStart,
  currentPeriodEnd,
  cancelAt,
  cancelAtPeriodEnd,
  metadata
}) => {
  const serializedMetadata = metadata ? JSON.stringify(metadata) : null;
  const timestamp = new Date().toISOString();

  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO user_subscriptions (
        user_id,
        stripe_customer_id,
        stripe_subscription_id,
        plan_id,
        status,
        current_period_start,
        current_period_end,
        cancel_at,
        cancel_at_period_end,
        metadata,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        plan_id = excluded.plan_id,
        status = excluded.status,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at = excluded.cancel_at,
        cancel_at_period_end = excluded.cancel_at_period_end,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at`,
      [
        userId,
        stripeCustomerId,
        stripeSubscriptionId,
        planId,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAt,
        cancelAtPeriodEnd ? 1 : 0,
        serializedMetadata,
        timestamp,
        timestamp
      ],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });

  await new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET subscription = ? WHERE id = ?',
      [planId || null, userId],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
};

const markSubscriptionCancelled = async ({ userId, status, cancelAt }) => {
  const timestamp = new Date().toISOString();

  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE user_subscriptions
          SET status = ?,
              cancel_at = ?,
              cancel_at_period_end = 1,
              updated_at = ?
        WHERE user_id = ?`,
      [status || 'canceled', cancelAt, timestamp, userId],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });

  await new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET subscription = NULL WHERE id = ?',
      [userId],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
};

const normalizeSuccessUrl = (inputUrl) => {
  if (!inputUrl) {
    return null;
  }
  if (inputUrl.includes('{CHECKOUT_SESSION_ID}')) {
    return inputUrl;
  }
  const separator = inputUrl.includes('?') ? '&' : '?';
  return `${inputUrl}${separator}session_id={CHECKOUT_SESSION_ID}`;
};

const createCheckoutSession = async ({
  userId,
  planId,
  email,
  successUrl,
  cancelUrl,
  locale
}) => {
  const stripeConfig = ensureStripeConfigured();
  const plan = getPlan(planId);

  if (!plan) {
    throw createError(`Unknown plan identifier: ${planId}`, {
      code: 'INVALID_PLAN',
      status: 400
    });
  }

  if (!plan.priceId) {
    throw createError(`Stripe price is not configured for plan: ${planId}`, {
      code: 'PLAN_PRICE_MISSING',
      status: 400
    });
  }

  const existingSubscription = await getUserSubscriptionRecord(userId);

  if (!existingSubscription?.stripeCustomerId && !email) {
    throw createError('Email address is required for creating a new Stripe subscription', {
      code: 'EMAIL_REQUIRED',
      status: 400
    });
  }

  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: plan.priceId,
        quantity: 1
      }
    ],
    customer: existingSubscription?.stripeCustomerId || undefined,
    customer_email: existingSubscription?.stripeCustomerId ? undefined : email,
    client_reference_id: userId,
    allow_promotion_codes: true,
    success_url: normalizeSuccessUrl(successUrl) || normalizeSuccessUrl(stripeConfig.successUrl),
    cancel_url: cancelUrl || stripeConfig.cancelUrl,
    metadata: {
      userId,
      planId
    },
    subscription_data: {
      metadata: {
        userId,
        planId
      }
    },
    locale: locale || undefined
  });

  logger.info('[StripeService] Checkout session created', {
    userId,
    planId,
    sessionId: session.id
  });

  return session;
};

const createBillingPortalSession = async ({ userId, returnUrl }) => {
  const stripeConfig = ensureStripeConfigured();
  const stripe = getStripeClient();
  const record = await getUserSubscriptionRecord(userId);

  if (!record || !record.stripeCustomerId) {
    throw createError('Stripe customer record not found for the user', {
      code: 'CUSTOMER_NOT_FOUND',
      status: 404
    });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: record.stripeCustomerId,
    return_url: returnUrl || stripeConfig.billingPortalReturnUrl
  });

  logger.info('[StripeService] Billing portal session created', {
    userId,
    customerId: record.stripeCustomerId
  });

  return session;
};

const listPlans = () => {
  const plans = getPlansMap();
  return Object.entries(plans).map(([id, plan]) => ({
    id,
    name: plan.name,
    currency: plan.currency,
    interval: plan.interval,
    seats: plan.seats,
    summary: plan.summary,
    features: plan.features,
    monthlyAmount: plan.monthlyAmount,
    oneTimeAmount: plan.oneTimeAmount,
    hasPrice: Boolean(plan.priceId),
    priceId: plan.priceId,
    oneTimePriceId: plan.oneTimePriceId || null
  }));
};

const getSubscriptionStatus = async (userId) => {
  const record = await getUserSubscriptionRecord(userId);
  if (!record) {
    return null;
  }

  const plan = record.planId ? getPlan(record.planId) : null;

  return {
    subscription: record,
    plan: plan
      ? {
          id: record.planId,
          name: plan.name,
          currency: plan.currency,
          interval: plan.interval,
          seats: plan.seats,
          summary: plan.summary,
          features: plan.features
        }
      : null
  };
};

const handleCheckoutCompleted = async (session) => {
  const stripe = getStripeClient();
  const userId = session.metadata?.userId;
  const planIdFromMetadata = session.metadata?.planId;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!userId || !subscriptionId) {
    logger.warn('[StripeService] Checkout session missing userId or subscriptionId', {
      sessionId: session.id
    });
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const planMatch = findPlanByPriceId(priceId);
  const planId = planMatch ? planMatch[0] : planIdFromMetadata;

  await upsertSubscriptionRecord({
    userId,
    planId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodStart: toISOString(subscription.current_period_start),
    currentPeriodEnd: toISOString(subscription.current_period_end),
    cancelAt: toISOString(subscription.cancel_at),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    metadata: {
      priceId,
      latestInvoice: subscription.latest_invoice || null
    }
  });

  logger.info('[StripeService] Subscription activated from checkout', {
    userId,
    planId,
    subscriptionId: subscription.id
  });
};

const handleSubscriptionUpdated = async (subscription) => {
  const userId = subscription.metadata?.userId;
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const planMatch = findPlanByPriceId(priceId);
  const planId = planMatch ? planMatch[0] : undefined;

  if (!userId) {
    logger.warn('[StripeService] Subscription update without user metadata', {
      subscriptionId: subscription.id
    });
    return;
  }

  await upsertSubscriptionRecord({
    userId,
    planId,
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodStart: toISOString(subscription.current_period_start),
    currentPeriodEnd: toISOString(subscription.current_period_end),
    cancelAt: toISOString(subscription.cancel_at),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    metadata: {
      priceId,
      latestInvoice: subscription.latest_invoice || null
    }
  });

  logger.info('[StripeService] Subscription updated', {
    userId,
    planId,
    subscriptionId: subscription.id,
    status: subscription.status
  });
};

const handleSubscriptionDeleted = async (subscription) => {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    logger.warn('[StripeService] Subscription deletion without user metadata', {
      subscriptionId: subscription.id
    });
    return;
  }

  await markSubscriptionCancelled({
    userId,
    status: subscription.status,
    cancelAt: toISOString(subscription.canceled_at) || new Date().toISOString()
  });

  logger.info('[StripeService] Subscription cancelled', {
    userId,
    subscriptionId: subscription.id
  });
};

const processWebhookEvent = async (event) => {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      return 'checkout.session.completed';
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      return event.type;
    case 'customer.subscription.deleted':
    case 'customer.subscription.cancelled':
      await handleSubscriptionDeleted(event.data.object);
      return event.type;
    default:
      logger.debug('[StripeService] Webhook event ignored', { eventType: event.type });
      return 'ignored';
  }
};

const constructWebhookEvent = (payload, signature) => {
  const stripeConfig = ensureStripeConfigured();
  if (!stripeConfig.webhookSecret) {
    throw createError('Stripe webhook secret is not configured', {
      code: 'WEBHOOK_SECRET_MISSING',
      status: 503
    });
  }

  const stripe = getStripeClient();

  try {
    return stripe.webhooks.constructEvent(payload, signature, stripeConfig.webhookSecret);
  } catch (error) {
    logger.warn('[StripeService] Failed to construct webhook event', {
      error: error.message
    });
    throw createError('Invalid Stripe webhook signature', {
      code: 'WEBHOOK_SIGNATURE_INVALID',
      status: 400
    });
  }
};

module.exports = {
  ensureStripeConfigured,
  getPlansMap,
  getPlan,
  getPlanIds,
  listPlans,
  createCheckoutSession,
  createBillingPortalSession,
  getSubscriptionStatus,
  processWebhookEvent,
  constructWebhookEvent
};
