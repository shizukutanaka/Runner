// Configuration management with environment variables
require('dotenv').config();

const crypto = require('crypto');

// SESSION_SECRETが未設定だとexpress-session自体が"secret option required for sessions"で
// 例外を投げ、全リクエストが500になる（JWT_SECRETには既に開発用フォールバックがあるが、
// こちらには無かったため、.envを用意していない開発/検証環境でアプリが起動直後から
// 一切機能しなかった）。本番では引き続きvalidateConfig()が未設定を検出して起動を止める
const resolveSessionSecret = () => {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return undefined;
  }
  console.warn('[Config] SESSION_SECRET is missing. Using a randomly generated secret for development only. Sessions will not persist across restarts.');
  return crypto.randomBytes(32).toString('hex');
};

const sessionSecret = resolveSessionSecret();

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
    sessionSecret,
    encryptionKey: process.env.ENCRYPTION_KEY,
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    // middleware/security.js の validateOrigin と app.js の CORS チェック(isOriginAllowed)が
    // 参照する許可オリジン一覧。以前はこのキー自体が存在せず両者とも常に空配列/undefinedとなり、
    // Originヘッダーを送る実ブラウザからの正規リクエストが全て403で拒否されていた
    // （supertestはデフォルトでOriginヘッダーを送らないためテストでは検出されなかった）
    allowedOrigins: (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
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
    secret: sessionSecret,
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
      // モデレーションエンドポイントはチャットモデル（gpt-4o等）とは別系統のモデルを取る。
      // omni-moderation-latest は2024-09公開のGPT-4oベース後継で、旧 text-moderation-latest より
      // 多言語（日本語含む）精度が高くカテゴリも拡張されている。無料。
      moderationModel: process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest',
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
