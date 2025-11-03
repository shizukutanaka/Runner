const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const PROJECT_ROOT = path.resolve(__dirname, '../..');

const getEnv = (key, defaultValue) => {
  const value = process.env[key];
  if (value == null || value === '') {
    return defaultValue;
  }
  return value;
};

const getNumber = (key, defaultValue, min = 0) => {
  return toNumber(getEnv(key), { key, defaultValue, min });
};

const toNumber = (rawValue, { key, defaultValue, min = 0 }) => {
  if (rawValue == null || rawValue === '') {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`[Config] Invalid numeric value for ${key}: ${rawValue}`);
  }

  return parsed;
};

const parseList = (raw, fallback = []) => {
  if (raw == null || raw === '') {
    return [...fallback];
  }

  if (Array.isArray(raw)) {
    return raw.map((item) => item.trim()).filter(Boolean);
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const toUniqueList = (values) => Array.from(new Set(values.filter(Boolean)));

const parseTrustProxy = () => {
  const raw = getEnv('TRUST_PROXY');
  if (raw == null || raw === '') {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  return raw;
};

const getBoolean = (key, defaultValue = true) => {
  const value = getEnv(key);
  if (value == null) {
    return defaultValue;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
  }
  return Boolean(value);
};

const parseSameSite = (rawValue) => {
  if (!rawValue) {
    return 'lax';
  }

  const normalized = rawValue.toString().trim().toLowerCase();
  if (['lax', 'strict', 'none'].includes(normalized)) {
    return normalized;
  }

  throw new Error(`[Config] Invalid SESSION_COOKIE_SAMESITE value: ${rawValue}`);
};

const buildSessionConfig = (enforceHttps) => {
  const isProduction = (process.env.NODE_ENV || 'development') === 'production';
  const rawSecret = getEnv('SESSION_SECRET');

  // 開発環境用のランダムシークレット生成（起動ごとに変わるため、セッション永続化には注意）
  const crypto = require('crypto');
  const fallbackSecret = crypto.randomBytes(32).toString('hex');

  if (isProduction && (!rawSecret || rawSecret.trim().length < 32)) {
    throw new Error('[Config] SESSION_SECRET must be at least 32 characters in production');
  }

  if (!isProduction && (!rawSecret || rawSecret.trim().length < 32)) {
    console.warn('[Config] SESSION_SECRET is missing or weak. Using randomly generated secret for development only.');
    console.warn('[Config] IMPORTANT: Set SESSION_SECRET in .env for persistent sessions across restarts.');
  }

  const sessionSecret = rawSecret && rawSecret.trim().length >= 32 ? rawSecret.trim() : fallbackSecret;

  const cookieSecureEnv = getEnv('SESSION_COOKIE_SECURE');
  const cookieSecure = cookieSecureEnv != null
    ? getBoolean('SESSION_COOKIE_SECURE', false)
    : enforceHttps || isProduction;

  const sameSite = parseSameSite(getEnv('SESSION_COOKIE_SAMESITE', cookieSecure ? 'none' : 'lax'));

  if (sameSite === 'none' && !cookieSecure) {
    console.warn('[Config] SESSION_COOKIE_SAMESITE set to "none" without secure cookie. Forcing secure=true.');
  }

  const maxAge = toNumber(getEnv('SESSION_COOKIE_MAX_AGE'), {
    key: 'SESSION_COOKIE_MAX_AGE',
    defaultValue: 12 * 60 * 60 * 1000,
    min: 5 * 60 * 1000
  });

  const cookieDomain = getEnv('SESSION_COOKIE_DOMAIN');

  const cookie = {
    secure: sameSite === 'none' ? true : cookieSecure,
    sameSite,
    httpOnly: true,
    maxAge
  };

  if (cookieDomain) {
    cookie.domain = cookieDomain.trim();
  }

  return {
    name: getEnv('SESSION_NAME', 'runner.sid'),
    secret: sessionSecret,
    rolling: getBoolean('SESSION_ROLLING', false),
    cookie
  };
};

const parseRateLimitConfig = () => {
  const enabled = getBoolean('RATE_LIMIT_ENABLED', true);
  let store = (getEnv('RATE_LIMIT_STORE', 'memory') || 'memory').toString().trim().toLowerCase();
  let redisUrl = getEnv('RATE_LIMIT_REDIS_URL', getEnv('REDIS_URL'));
  if (redisUrl) {
    redisUrl = redisUrl.trim();
  }
  const redisPrefix = getEnv('RATE_LIMIT_REDIS_PREFIX', 'runner:ratelimit:');

  if (store === 'redis' && (!redisUrl || redisUrl === '')) {
    const logger = require('../logger');
    logger.warn('[Config] RATE_LIMIT_STORE is set to redis but RATE_LIMIT_REDIS_URL is missing. Falling back to in-memory rate limiter.');
    store = 'memory';
  }

  return {
    enabled,
    store,
    redisUrl: store === 'redis' ? redisUrl : null,
    redisPrefix,
    strict: {
      windowMs: getNumber('RATE_LIMIT_STRICT_WINDOW_MS', 5 * 60 * 1000, 1000),
      max: getNumber('RATE_LIMIT_STRICT_MAX', 10, 1)
    },
    general: {
      windowMs: getNumber('RATE_LIMIT_GENERAL_WINDOW_MS', 15 * 60 * 1000, 1000),
      max: getNumber('RATE_LIMIT_GENERAL_MAX', 100, 1)
    },
    api: {
      windowMs: getNumber('RATE_LIMIT_API_WINDOW_MS', 60 * 1000, 1000),
      max: getNumber('RATE_LIMIT_API_MAX', 60, 1)
    }
  };
};

const parseSessionStore = () => {
  const supportedStores = new Set(['memory', 'redis']);
  const requestedStore = (getEnv('SESSION_STORE', 'memory') || 'memory').toString().trim().toLowerCase();

  if (!supportedStores.has(requestedStore)) {
    throw new Error(`[Config] Unsupported SESSION_STORE value: ${requestedStore}`);
  }

  const redisUrl = getEnv('SESSION_REDIS_URL', getEnv('REDIS_URL'));
  const prefix = getEnv('SESSION_REDIS_PREFIX', 'runner:sess:');

  if (requestedStore === 'redis' && (!redisUrl || redisUrl.trim() === '')) {
    console.warn('[Config] SESSION_STORE is set to redis but no SESSION_REDIS_URL / REDIS_URL provided. Falling back to in-memory store.');
    return {
      type: 'memory'
    };
  }

  return {
    type: requestedStore,
    redisUrl: redisUrl && redisUrl.trim() !== '' ? redisUrl.trim() : null,
    prefix: prefix && prefix.trim() !== '' ? prefix.trim() : 'runner:sess:'
  };
};

const requireEnv = (key) => {
  const value = process.env[key];
  if (value == null || value.trim() === '') {
    throw new Error(`[Config] Missing required environment variable: ${key}`);
  }
  return value;
};

const coercePort = (value, fallback) => {
  if (value == null || value === '') {
    return fallback;
  }
  const portNumber = Number(value);
  if (!Number.isInteger(portNumber) || portNumber <= 0 || portNumber > 65535) {
    throw new Error(`[Config] Invalid PORT value: ${value}`);
  }
  return portNumber;
};

const resolveDatabasePath = () => {
  const customPath = getEnv('DATABASE_PATH');
  const dbPath = customPath
    ? path.isAbsolute(customPath)
      ? customPath
      : path.resolve(PROJECT_ROOT, customPath)
    : path.resolve(PROJECT_ROOT, 'data', 'comments.db');
  const directory = path.dirname(dbPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return dbPath;
};

const validateEnvVars = () => {
  const requiredKeys = ['OPENAI_API_KEY', 'YOUTUBE_API_KEY', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'];
  const missing = requiredKeys.filter((key) => !process.env[key] || process.env[key].trim() === '');

  if (missing.length === 0) {
    return;
  }

  if ((process.env.NODE_ENV || 'development') === 'production') {
    throw new Error(`[Config] Missing required environment variables in production: ${missing.join(', ')}`);
  }

  const logger = require('../logger');
  logger.warn('[Config] Missing environment variables. Related integrations will be disabled.', { missing });
};

const defaultLocalOrigins = [
  'http://localhost:3000',
  'http://localhost:4000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4000',
  'http://127.0.0.1:5173',
  'https://localhost:3000',
  'https://localhost:4000',
  'https://localhost:5173',
  'https://127.0.0.1:3000',
  'https://127.0.0.1:4000',
  'https://127.0.0.1:5173'
];

const configuredOrigins = parseList(getEnv('FRONTEND_ALLOWED_ORIGINS'), []);
const legacyFrontendUrl = getEnv('FRONTEND_URL');
const allowedOrigins = toUniqueList([
  ...defaultLocalOrigins,
  ...configuredOrigins,
  legacyFrontendUrl
]);

const enforceHttps = getBoolean('ENFORCE_HTTPS', false);
const session = buildSessionConfig(enforceHttps);
const sessionStore = parseSessionStore();
const rateLimit = parseRateLimitConfig();

const stripeOneTimeMultiplier = 3;

const baseMonthlyMinAmount = getNumber('STRIPE_PLAN_MIN_MONTHLY_AMOUNT', 12000, 0);
const professionalMonthlyAmount = getNumber('STRIPE_PLAN_PROFESSIONAL_MONTHLY_AMOUNT', baseMonthlyMinAmount, 0);
const enterpriseMonthlyAmount = getNumber('STRIPE_PLAN_ENTERPRISE_MONTHLY_AMOUNT', professionalMonthlyAmount, 0);

const defaultStripePlans = {
  professional: {
    id: 'professional',
    name: 'Professional',
    priceId: getEnv('STRIPE_PRICE_ID_PROFESSIONAL', ''),
    currency: getEnv('STRIPE_PLAN_PROFESSIONAL_CURRENCY', getEnv('STRIPE_PLAN_CURRENCY', 'jpy')),
    interval: getEnv('STRIPE_PLAN_PROFESSIONAL_INTERVAL', getEnv('STRIPE_PLAN_INTERVAL', 'month')),
    seats: getNumber('STRIPE_PLAN_PROFESSIONAL_SEATS', 10, 1),
    monthlyAmount: professionalMonthlyAmount,
    oneTimeAmount: professionalMonthlyAmount * stripeOneTimeMultiplier,
    oneTimePriceId: getEnv('STRIPE_PRICE_ID_PROFESSIONAL_ONETIME', ''),
    summary: {
      ja: '中規模ストリーミング運用チーム向けの標準プラン',
      en: 'Standard plan designed for mid-sized streaming operation teams'
    },
    features: [
      { ja: 'モデレーター最大10名まで追加可能', en: 'Add up to 10 moderators' },
      { ja: '主要プラットフォームのリアルタイム統合', en: 'Real-time integration for major platforms' },
      { ja: 'AIモデレーションと自動レポート機能', en: 'AI moderation with automated reporting' },
      { ja: '30日間のコメント履歴保持', en: '30-day comment history retention' }
    ]
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceId: getEnv('STRIPE_PRICE_ID_ENTERPRISE', ''),
    currency: getEnv('STRIPE_PLAN_ENTERPRISE_CURRENCY', getEnv('STRIPE_PLAN_CURRENCY', 'jpy')),
    interval: getEnv('STRIPE_PLAN_ENTERPRISE_INTERVAL', getEnv('STRIPE_PLAN_INTERVAL', 'month')),
    seats: getNumber('STRIPE_PLAN_ENTERPRISE_SEATS', 50, 1),
    monthlyAmount: enterpriseMonthlyAmount,
    oneTimeAmount: enterpriseMonthlyAmount * stripeOneTimeMultiplier,
    oneTimePriceId: getEnv('STRIPE_PRICE_ID_ENTERPRISE_ONETIME', ''),
    summary: {
      ja: '大規模配信組織と上場企業向けの拡張プラン',
      en: 'Extended plan for large-scale teams and enterprise governance'
    },
    features: [
      { ja: '専任サクセスマネージャー対応', en: 'Dedicated customer success manager' },
      { ja: '拡張監査ログとSLAサポート', en: 'Extended audit logs with SLA-backed support' },
      { ja: 'コメント履歴無制限ストレージ', en: 'Unlimited comment history storage' },
      { ja: 'シングルサインオンと詳細な権限管理', en: 'Single sign-on with granular role management' }
    ]
  }
};

const stripeConfig = {
  secretKey: getEnv('STRIPE_SECRET_KEY', ''),
  webhookSecret: getEnv('STRIPE_WEBHOOK_SECRET', ''),
  successUrl: getEnv('STRIPE_SUCCESS_URL', 'http://localhost:5173/billing/success'),
  cancelUrl: getEnv('STRIPE_CANCEL_URL', 'http://localhost:5173/billing/cancel'),
  billingPortalReturnUrl: getEnv('STRIPE_BILLING_PORTAL_RETURN_URL', 'http://localhost:5173/settings/billing'),
  minimumMonthlyAmount: baseMonthlyMinAmount,
  oneTimeMultiplier: stripeOneTimeMultiplier,
  plans: defaultStripePlans
};

const config = {
  environment: process.env.NODE_ENV || 'development',
  server: {
    port: coercePort(process.env.PORT, 4000),
    trustProxy: parseTrustProxy()
  },
  session,
  sessionStore,
  rateLimit,
  database: {
    path: resolveDatabasePath()
  },
  logging: {
    level: getEnv('LOG_LEVEL', 'info')
  },
  security: {
    allowedOrigins,
    corsMaxAge: toNumber(getEnv('CORS_MAX_AGE'), { key: 'CORS_MAX_AGE', defaultValue: 86400 }),
    requestTimeoutMs: toNumber(getEnv('REQUEST_TIMEOUT_MS'), {
      key: 'REQUEST_TIMEOUT_MS',
      defaultValue: 30000
    }),
    enforceHttps
  },
  automation: {
    analyticsSnapshot: {
      enabled: getBoolean('AUTOMATION_ANALYTICS_SNAPSHOT_ENABLED', true),
      schedule: getEnv('AUTOMATION_ANALYTICS_SNAPSHOT_CRON', '*/5 * * * *')
    }
  },
  services: {
    openai: {
      apiKey: getEnv('OPENAI_API_KEY') || null,
      model: getEnv('OPENAI_MODEL', 'gpt-4o-mini')
    },
    stripe: stripeConfig,
    youtube: {
      apiKey: getEnv('YOUTUBE_API_KEY') || null
    },
    twitch: {
      clientId: getEnv('TWITCH_CLIENT_ID') || null,
      clientSecret: getEnv('TWITCH_CLIENT_SECRET') || null
    }
  },
  getEnv,
  getBoolean,
  requireEnv
};

validateEnvVars();

module.exports = config;
