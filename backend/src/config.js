// Configuration management with environment variables
require('dotenv').config();

const config = {
  // Application
  app: {
    name: process.env.APP_NAME || 'YouTube & Twitch Comment Manager',
    version: process.env.APP_VERSION || '2.1.0',
    port: parseInt(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || 'development',
    debug: process.env.DEBUG_MODE === 'true'
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiry: process.env.JWT_EXPIRY || '15m',
    sessionSecret: process.env.SESSION_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    helmetEnabled: process.env.HELMET_ENABLED !== 'false'
  },

  // Server (HTTPサーバー/プロキシ関連)
  server: {
    port: parseInt(process.env.PORT) || 3000,
    trustProxy: process.env.TRUST_PROXY === 'true'
  },

  // Session (express-session用)
  session: {
    name: process.env.SESSION_NAME || 'runner.sid',
    secret: process.env.SESSION_SECRET,
    rolling: process.env.SESSION_ROLLING === 'true',
    cookie: {
      secure: process.env.SESSION_COOKIE_SECURE === 'true',
      httpOnly: process.env.SESSION_COOKIE_HTTPONLY !== 'false',
      sameSite: process.env.SESSION_COOKIE_SAMESITE || 'strict',
      maxAge: parseInt(process.env.SESSION_MAX_AGE) || 86400000,
      domain: process.env.SESSION_COOKIE_DOMAIN || undefined
    }
  },

  // Session Store (Redisセッションストアを使う場合)
  sessionStore: {
    type: process.env.SESSION_STORE || 'memory',
    redisUrl: process.env.SESSION_REDIS_URL,
    redisPrefix: process.env.SESSION_REDIS_PREFIX || 'runner:sess:'
  },

  // Database
  database: {
    url: process.env.DATABASE_URL || 'sqlite:./data/database.db',
    path: process.env.DATABASE_PATH || (process.env.DATABASE_URL || 'sqlite:./data/database.db').replace(/^sqlite:/, ''),
    poolSize: parseInt(process.env.DB_POOL_SIZE) || 5
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: parseInt(process.env.CACHE_TTL) || 300
  },

  // AI Services
  services: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      enabled: process.env.ENABLE_AI_MODERATION !== 'false'
    },
    youtube: {
      apiKey: process.env.YOUTUBE_API_KEY,
      pollingInterval: parseInt(process.env.YOUTUBE_POLLING_INTERVAL) || 5000,
      maxResults: parseInt(process.env.YOUTUBE_MAX_RESULTS) || 100
    },
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
      pollingInterval: parseInt(process.env.TWITCH_POLLING_INTERVAL) || 3000,
      maxResults: parseInt(process.env.TWITCH_MAX_RESULTS) || 50
    }
  },

  // Moderation
  moderation: {
    rejectionScore: parseInt(process.env.MODERATION_REJECTION_SCORE) || 60,
    maxCommentLength: parseInt(process.env.MAX_COMMENT_LENGTH) || 2000
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },

  // Features
  features: {
    aiModeration: process.env.ENABLE_AI_MODERATION !== 'false',
    realTimeSync: process.env.ENABLE_REAL_TIME_SYNC !== 'false',
    analytics: process.env.ENABLE_ANALYTICS !== 'false'
  },

  // config.app.env のエイリアス（一部モジュールが config.environment を参照するため）
  environment: process.env.NODE_ENV || 'development',

  // 環境変数を直接取得するヘルパー（デフォルト値対応）
  getEnv(key, defaultValue) {
    return process.env[key] !== undefined ? process.env[key] : defaultValue;
  }
};

// ─── 設定検証 ────────────────────────────────────────────
const validateConfig = () => {
  const errors = [];

  // 本番環境では必須のセキュリティ設定
  if (config.app.env === 'production') {
    if (!config.security.jwtSecret) {
      errors.push('JWT_SECRET is required in production');
    }
    if (!config.security.sessionSecret) {
      errors.push('SESSION_SECRET is required in production');
    }
    if (!config.security.encryptionKey) {
      errors.push('ENCRYPTION_KEY is required in production');
    }
  }

  // JWT_SECRET の強度確認 (全環境)
  if (config.security.jwtSecret && config.security.jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  // 警告レベル: API連携が無効化される可能性
  const warnings = [];
  if (!config.services.openai.apiKey) {
    warnings.push('OPENAI_API_KEY not set - AI moderation will be disabled');
  }
  if (!config.services.youtube.apiKey) {
    warnings.push('YOUTUBE_API_KEY not set - YouTube integration will be disabled');
  }
  if (!config.services.twitch.clientId || !config.services.twitch.clientSecret) {
    warnings.push('TWITCH_CLIENT_ID/SECRET not set - Twitch integration will be disabled');
  }

  // エラーがあれば起動を中止
  if (errors.length > 0) {
    throw new Error(`[Config] Validation failed:\n  ${errors.join('\n  ')}`);
  }

  // 警告は表示のみ
  if (warnings.length > 0 && config.app.env !== 'test') {
    console.warn('[Config] Warnings:\n  ' + warnings.join('\n  '));
  }
};

// テスト環境以外では起動時に検証
if (config.app.env !== 'test') {
  validateConfig();
}

module.exports = config;
module.exports.validateConfig = validateConfig;
