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

  // Database
  database: {
    url: process.env.DATABASE_URL || 'sqlite:./data/database.db',
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
  }
};

module.exports = config;
