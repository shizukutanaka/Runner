const request = require('supertest');
const app = require('../../src/app');
const stripeService = require('../../src/services/stripeService');
const db = require('../../src/db');
const { generateToken } = require('../../src/middleware/auth');

jest.mock('../../src/services/stripeService');
jest.mock('../../src/db');

describe('Billing API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: 'user'
  };

  // authenticateToken()はJWT検証のみでDB参照は無いため（jest.mock('../../src/db')とも無関係に）
  // 実際に検証可能な署名済みトークンが必要。以前はリテラル文字列'mock-jwt-token'で
  // 常にInvalid tokenとして401になっていた
  const mockAuthToken = generateToken(mockUser);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/billing/plans', () => {
    it('should return list of available plans', async () => {
      const mockPlans = [
        {
          id: 'professional',
          name: 'Professional',
          currency: 'jpy',
          interval: 'month',
          seats: 10,
          monthlyAmount: 12000,
          oneTimeAmount: 36000,
          hasPrice: true,
          priceId: 'price_xxx',
          summary: { ja: 'テストプラン', en: 'Test plan' },
          features: []
        }
      ];

      stripeService.listPlans = jest.fn().mockReturnValue(mockPlans);

      const response = await request(app)
        .get('/api/billing/plans')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(200);

      expect(response.body.status).toBe(200);
      expect(response.body.data.plans).toEqual(mockPlans);
      expect(stripeService.listPlans).toHaveBeenCalled();
    });

    it('should return 503 if Stripe is not configured', async () => {
      stripeService.listPlans = jest.fn().mockImplementation(() => {
        const error = new Error('Stripe integration is not configured');
        error.status = 503;
        throw error;
      });

      const response = await request(app)
        .get('/api/billing/plans')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(503);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/billing/subscription', () => {
    it('should return user subscription status', async () => {
      const mockSubscription = {
        subscription: {
          userId: 'user-123',
          stripeCustomerId: 'cus_xxx',
          stripeSubscriptionId: 'sub_xxx',
          planId: 'professional',
          status: 'active',
          currentPeriodStart: '2025-01-01T00:00:00.000Z',
          currentPeriodEnd: '2025-02-01T00:00:00.000Z',
          cancelAt: null,
          cancelAtPeriodEnd: false
        },
        plan: {
          id: 'professional',
          name: 'Professional',
          currency: 'jpy',
          interval: 'month',
          seats: 10
        }
      };

      stripeService.getSubscriptionStatus = jest.fn().mockResolvedValue(mockSubscription);

      const response = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(200);

      expect(response.body.status).toBe(200);
      expect(response.body.data.subscription).toEqual(mockSubscription);
      expect(stripeService.getSubscriptionStatus).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return null if user has no subscription', async () => {
      stripeService.getSubscriptionStatus = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .expect(200);

      expect(response.body.data.subscription).toBeNull();
    });
  });

  describe('POST /api/billing/checkout', () => {
    it('should create checkout session', async () => {
      const checkoutData = {
        planId: 'professional',
        email: 'test@example.com',
        successUrl: 'http://localhost:5173/billing/success',
        cancelUrl: 'http://localhost:5173/billing/cancel',
        locale: 'ja'
      };

      const mockSession = {
        id: 'cs_xxx',
        url: 'https://checkout.stripe.com/c/pay/cs_xxx'
      };

      stripeService.createCheckoutSession = jest.fn().mockResolvedValue(mockSession);

      const response = await request(app)
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .send(checkoutData)
        .expect(200);

      expect(response.body.status).toBe(200);
      expect(response.body.data.sessionId).toBe(mockSession.id);
      expect(response.body.data.url).toBe(mockSession.url);
      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith({
        userId: mockUser.id,
        ...checkoutData
      });
    });

    it('should return 400 for invalid plan ID', async () => {
      stripeService.createCheckoutSession = jest.fn().mockImplementation(() => {
        const error = new Error('Unknown plan identifier: invalid');
        error.status = 400;
        throw error;
      });

      const response = await request(app)
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .send({
          planId: 'invalid',
          email: 'test@example.com'
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when email is missing for new subscription', async () => {
      stripeService.createCheckoutSession = jest.fn().mockImplementation(() => {
        const error = new Error('Email address is required for creating a new Stripe subscription');
        error.status = 400;
        throw error;
      });

      const response = await request(app)
        .post('/api/billing/checkout')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .send({
          planId: 'professional'
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/billing/portal', () => {
    it('should create billing portal session', async () => {
      const portalData = {
        returnUrl: 'http://localhost:5173/settings/billing'
      };

      const mockSession = {
        url: 'https://billing.stripe.com/p/session/xxx'
      };

      stripeService.createBillingPortalSession = jest.fn().mockResolvedValue(mockSession);

      const response = await request(app)
        .post('/api/billing/portal')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .send(portalData)
        .expect(200);

      expect(response.body.status).toBe(200);
      expect(response.body.data.url).toBe(mockSession.url);
      expect(stripeService.createBillingPortalSession).toHaveBeenCalledWith({
        userId: mockUser.id,
        returnUrl: portalData.returnUrl
      });
    });

    it('should return 404 when customer record not found', async () => {
      stripeService.createBillingPortalSession = jest.fn().mockImplementation(() => {
        const error = new Error('Stripe customer record not found for the user');
        error.status = 404;
        throw error;
      });

      const response = await request(app)
        .post('/api/billing/portal')
        .set('Authorization', `Bearer ${mockAuthToken}`)
        .send({
          returnUrl: 'http://localhost:5173/settings/billing'
        })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/billing/webhook', () => {
    it('should handle checkout.session.completed event', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_xxx',
            customer: 'cus_xxx',
            subscription: 'sub_xxx',
            metadata: {
              userId: 'user-123',
              planId: 'professional'
            }
          }
        }
      };

      stripeService.constructWebhookEvent = jest.fn().mockReturnValue(mockEvent);
      stripeService.processWebhookEvent = jest.fn().mockResolvedValue('checkout.session.completed');

      const response = await request(app)
        .post('/api/billing/webhook')
        .set('stripe-signature', 'mock-signature')
        .send(mockEvent)
        .expect(200);

      expect(response.body.received).toBe(true);
      expect(response.body.type).toBe('checkout.session.completed');
      expect(stripeService.constructWebhookEvent).toHaveBeenCalled();
      expect(stripeService.processWebhookEvent).toHaveBeenCalledWith(mockEvent);
    });

    it('should return 400 when signature header is missing', async () => {
      const response = await request(app)
        .post('/api/billing/webhook')
        .send({})
        .expect(400);

      expect(response.body.status).toBe(400);
      expect(response.body.message).toContain('Stripe署名ヘッダーが見つかりません');
    });

    it('should return 400 for invalid webhook signature', async () => {
      stripeService.constructWebhookEvent = jest.fn().mockImplementation(() => {
        const error = new Error('Invalid Stripe webhook signature');
        error.status = 400;
        throw error;
      });

      const response = await request(app)
        .post('/api/billing/webhook')
        .set('stripe-signature', 'invalid-signature')
        .send({})
        .expect(400);

      expect(response.body.status).toBe(400);
    });
  });
});
