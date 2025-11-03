const crypto = require('crypto');
const logger = require('../logger');
const stripeService = require('../services/stripeService');

/**
 * Webhook Security and Validation
 * Implements HMAC signature verification and replay attack prevention
 */

class WebhookSecurityManager {
  constructor() {
    this.webhooks = new Map(); // webhookId -> config
    this.processedEvents = new Set(); // For replay attack prevention
    this.maxProcessedEvents = 10000;
    this.eventExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Register webhook
   */
  registerWebhook(config) {
    const webhookId = crypto.randomBytes(16).toString('hex');

    const webhook = {
      id: webhookId,
      url: config.url,
      secret: config.secret || this.generateSecret(),
      events: config.events || [],
      enabled: config.enabled !== false,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      deliveryCount: 0,
      failureCount: 0
    };

    this.webhooks.set(webhookId, webhook);

    logger.info('[WebhookSecurity] Webhook registered', {
      webhookId,
      url: webhook.url,
      events: webhook.events
    });

    return webhook;
  }

  /**
   * Generate webhook secret
   */
  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate HMAC signature
   */
  generateSignature(payload, secret, algorithm = 'sha256') {
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verifySignature(payload, signature, secret, algorithm = 'sha256') {
    const expectedSignature = this.generateSignature(payload, secret, algorithm);

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Verify webhook request
   */
  verifyWebhookRequest(req, webhookId) {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      logger.warn('[WebhookSecurity] Unknown webhook', { webhookId });
      return { valid: false, error: 'Unknown webhook' };
    }

    if (!webhook.enabled) {
      logger.warn('[WebhookSecurity] Disabled webhook', { webhookId });
      return { valid: false, error: 'Webhook disabled' };
    }

    // Verify signature
    const signature = req.headers['x-webhook-signature'] ||
                     req.headers['x-hub-signature-256'];

    if (!signature) {
      logger.warn('[WebhookSecurity] Missing signature', { webhookId });
      return { valid: false, error: 'Missing signature' };
    }

    try {
      const isValid = this.verifySignature(req.body, signature, webhook.secret);

      if (!isValid) {
        webhook.failureCount++;
        logger.warn('[WebhookSecurity] Invalid signature', { webhookId });
        return { valid: false, error: 'Invalid signature' };
      }
    } catch (error) {
      logger.error('[WebhookSecurity] Signature verification error', {
        webhookId,
        error: error.message
      });
      return { valid: false, error: 'Signature verification failed' };
    }

    // Verify timestamp to prevent replay attacks
    const timestamp = req.headers['x-webhook-timestamp'];

    if (timestamp) {
      const requestTime = parseInt(timestamp, 10);
      const now = Date.now();
      const age = now - requestTime;

      if (age > this.eventExpiry) {
        logger.warn('[WebhookSecurity] Request too old', {
          webhookId,
          age: `${age}ms`
        });
        return { valid: false, error: 'Request expired' };
      }

      if (age < -60000) { // Request from future (1 minute tolerance)
        logger.warn('[WebhookSecurity] Request from future', {
          webhookId,
          age: `${age}ms`
        });
        return { valid: false, error: 'Invalid timestamp' };
      }
    }

    // Check for duplicate events (replay attack prevention)
    const eventId = req.headers['x-webhook-event-id'] || req.body?.id;

    if (eventId) {
      if (this.processedEvents.has(eventId)) {
        logger.warn('[WebhookSecurity] Duplicate event detected', {
          webhookId,
          eventId
        });
        return { valid: false, error: 'Duplicate event' };
      }

      this.markEventProcessed(eventId);
    }

    // Update webhook stats
    webhook.lastUsed = new Date().toISOString();
    webhook.deliveryCount++;

    return { valid: true, webhook };
  }

  /**
   * Mark event as processed
   */
  markEventProcessed(eventId) {
    this.processedEvents.add(eventId);

    // Limit set size
    if (this.processedEvents.size > this.maxProcessedEvents) {
      const iterator = this.processedEvents.values();
      this.processedEvents.delete(iterator.next().value);
    }
  }

  /**
   * Send webhook
   */
  async sendWebhook(webhookId, event, data) {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook || !webhook.enabled) {
      return { success: false, error: 'Webhook not available' };
    }

    // Check if webhook is subscribed to this event
    if (webhook.events.length > 0 && !webhook.events.includes(event)) {
      return { success: false, error: 'Not subscribed to event' };
    }

    const payload = {
      id: crypto.randomBytes(16).toString('hex'),
      event,
      timestamp: Date.now(),
      data
    };

    const signature = this.generateSignature(payload, webhook.secret);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Webhook-Timestamp': payload.timestamp.toString(),
          'X-Webhook-Event-ID': payload.id,
          'User-Agent': 'Comment-Manager-Webhook/1.0'
        },
        body: JSON.stringify(payload),
        timeout: 10000 // 10 seconds
      });

      if (!response.ok) {
        webhook.failureCount++;
        logger.error('[WebhookSecurity] Webhook delivery failed', {
          webhookId,
          status: response.status,
          url: webhook.url
        });

        return {
          success: false,
          error: `HTTP ${response.status}`,
          status: response.status
        };
      }

      webhook.lastUsed = new Date().toISOString();
      webhook.deliveryCount++;

      logger.info('[WebhookSecurity] Webhook delivered successfully', {
        webhookId,
        event,
        url: webhook.url
      });

      return { success: true, response: await response.json().catch(() => ({})) };
    } catch (error) {
      webhook.failureCount++;
      logger.error('[WebhookSecurity] Webhook delivery error', {
        webhookId,
        error: error.message,
        url: webhook.url
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Update webhook
   */
  updateWebhook(webhookId, updates) {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      return null;
    }

    if (updates.url) webhook.url = updates.url;
    if (updates.events) webhook.events = updates.events;
    if (updates.enabled !== undefined) webhook.enabled = updates.enabled;
    if (updates.secret) webhook.secret = updates.secret;

    logger.info('[WebhookSecurity] Webhook updated', { webhookId });

    return webhook;
  }

  /**
   * Delete webhook
   */
  deleteWebhook(webhookId) {
    const deleted = this.webhooks.delete(webhookId);

    if (deleted) {
      logger.info('[WebhookSecurity] Webhook deleted', { webhookId });
    }

    return deleted;
  }

  /**
   * Get webhook stats
   */
  getWebhookStats(webhookId) {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      return null;
    }

    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      enabled: webhook.enabled,
      createdAt: webhook.createdAt,
      lastUsed: webhook.lastUsed,
      deliveryCount: webhook.deliveryCount,
      failureCount: webhook.failureCount,
      successRate: webhook.deliveryCount > 0
        ? ((webhook.deliveryCount - webhook.failureCount) / webhook.deliveryCount * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * List all webhooks
   */
  listWebhooks() {
    return Array.from(this.webhooks.values()).map(webhook => ({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      enabled: webhook.enabled,
      deliveryCount: webhook.deliveryCount,
      failureCount: webhook.failureCount
    }));
  }
}

const webhookSecurity = new WebhookSecurityManager();

/**
 * Middleware: Verify webhook signature
 */
const verifyWebhookSignature = (req, res, next) => {
  const webhookId = req.params.webhookId || req.body?.webhookId;

  if (!webhookId) {
    return res.status(400).json({ error: 'Webhook ID required' });
  }

  const verification = webhookSecurity.verifyWebhookRequest(req, webhookId);

  if (!verification.valid) {
    return res.status(403).json({ error: verification.error });
  }

  req.webhook = verification.webhook;
  next();
};

/**
 * Middleware: Rate limit webhooks
 */
const webhookRateLimit = (maxPerMinute = 60) => {
  const requests = new Map(); // webhookId -> timestamps[]

  return (req, res, next) => {
    const webhookId = req.webhook?.id;

    if (!webhookId) {
      return next();
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // Get recent requests
    const timestamps = requests.get(webhookId) || [];
    const recentRequests = timestamps.filter(t => t > oneMinuteAgo);

    if (recentRequests.length >= maxPerMinute) {
      logger.warn('[WebhookSecurity] Rate limit exceeded', {
        webhookId,
        requests: recentRequests.length
      });

      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: 60
      });
    }

    // Record this request
    recentRequests.push(now);
    requests.set(webhookId, recentRequests);

    next();
  };
};

const verifyStripeWebhook = (req, res, next) => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    logger.warn('[WebhookSecurity] Missing Stripe signature header');
    return res.status(400).json({ status: 400, message: 'Stripe署名ヘッダーが必要です' });
  }

  const payload = req.rawBody || req.body;

  if (!payload) {
    logger.warn('[WebhookSecurity] Stripe webhook payload missing');
    return res.status(400).json({ status: 400, message: 'Webhookの内容が不足しています' });
  }

  try {
    const event = stripeService.constructWebhookEvent(payload, signature);
    req.stripeEvent = event;
    next();
  } catch (error) {
    const status = error.status || 400;
    logger.warn('[WebhookSecurity] Stripe webhook verification failed', {
      error: error.message
    });
    res.status(status).json({ status, message: error.message || 'Stripe webhookの検証に失敗しました' });
  }
};

module.exports = {
  webhookSecurity,
  verifyWebhookSignature,
  webhookRateLimit,
  verifyStripeWebhook
};
