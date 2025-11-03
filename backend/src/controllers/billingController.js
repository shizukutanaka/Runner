const stripeService = require('../services/stripeService');
const logger = require('../logger');

const respond = (res, data, message = '') => {
  res.json({
    status: 200,
    data,
    message: message || undefined
  });
};

const handleControllerError = (error, next, fallbackMessage) => {
  if (!error) {
    return next({
      status: 500,
      message: fallbackMessage
    });
  }

  if (error.status) {
    return next(error);
  }

  logger.error('[BillingController] Unexpected error', {
    error: error.message
  });

  return next({
    status: 500,
    message: fallbackMessage,
    details: error.message
  });
};

exports.listPlans = async (req, res, next) => {
  try {
    const plans = stripeService.listPlans();
    respond(res, { plans }, 'プラン一覧を取得しました');
  } catch (error) {
    handleControllerError(error, next, 'プラン情報の取得中にエラーが発生しました');
  }
};

exports.getSubscriptionStatus = async (req, res, next) => {
  try {
    const targetUserId = req.user?.role === 'admin' && req.query?.userId
      ? req.query.userId
      : req.user?.id;

    if (!targetUserId) {
      return next({ status: 400, message: 'ユーザー識別子が必要です' });
    }

    const status = await stripeService.getSubscriptionStatus(targetUserId);
    respond(res, { subscription: status }, 'サブスクリプション状態を取得しました');
  } catch (error) {
    handleControllerError(error, next, 'サブスクリプション状態の取得中にエラーが発生しました');
  }
};

exports.createCheckoutSession = async (req, res, next) => {
  try {
    const {
      planId,
      email,
      successUrl,
      cancelUrl,
      locale,
      userId: requestedUserId
    } = req.body;

    const userId = req.user?.role === 'admin' && requestedUserId
      ? requestedUserId
      : req.user?.id;

    if (!userId) {
      return next({ status: 400, message: 'ユーザー識別子が必要です' });
    }

    const session = await stripeService.createCheckoutSession({
      userId,
      planId,
      email,
      successUrl,
      cancelUrl,
      locale
    });

    respond(res, { sessionId: session.id, url: session.url }, 'チェックアウトセッションを作成しました');
  } catch (error) {
    handleControllerError(error, next, 'チェックアウトセッションの作成に失敗しました');
  }
};

exports.createBillingPortalSession = async (req, res, next) => {
  try {
    const { returnUrl, userId: requestedUserId } = req.body;

    const userId = req.user?.role === 'admin' && requestedUserId
      ? requestedUserId
      : req.user?.id;

    if (!userId) {
      return next({ status: 400, message: 'ユーザー識別子が必要です' });
    }

    const session = await stripeService.createBillingPortalSession({ userId, returnUrl });
    respond(res, { url: session.url }, '請求ポータルセッションを作成しました');
  } catch (error) {
    handleControllerError(error, next, '請求ポータルの生成に失敗しました');
  }
};

exports.handleWebhook = async (req, res) => {
  try {
    const event = req.stripeEvent || (() => {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        const error = new Error('Stripe署名ヘッダーが見つかりません');
        error.status = 400;
        throw error;
      }

      const payload = req.rawBody || req.body;
      return stripeService.constructWebhookEvent(payload, signature);
    })();

    const handledType = await stripeService.processWebhookEvent(event);

    logger.info('[BillingController] Stripe webhook handled', {
      eventType: event.type,
      handledType
    });

    res.json({ received: true, type: event.type, handledType });
  } catch (error) {
    logger.warn('[BillingController] Stripe webhook processing failed', {
      error: error.message
    });
    const status = error.status || 400;
    res.status(status).json({
      status,
      message: error.message || 'Webhookの処理に失敗しました'
    });
  }
};
