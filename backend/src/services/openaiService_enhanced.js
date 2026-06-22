// Enhanced OpenAI Service with Caching, Rate Limiting, and Retry Logic
const OpenAI = require('openai');
const config = require('../config');
const logger = require('../logger');

let openai = null;
let isAvailable = false;

// Redis client for caching (if available)
let redisClient = null;
let cacheAvailable = false;

// Rate limiting state
const rateLimitState = {
  requests: [],
  tokens: {
    total: 0,
    window: 60000 // 1 minute window
  },
  limits: {
    requestsPerMinute: 60,
    tokensPerMinute: 90000 // TPM limit
  }
};

// Cost tracking
const costTracking = {
  totalTokens: 0,
  totalCost: 0,
  requestCount: 0,
  errorCount: 0,
  cacheHits: 0,
  cacheMisses: 0
};

// Model pricing (per 1k tokens)
const MODEL_PRICING = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }
};

// Custom error classes
class OpenAIError extends Error {
  constructor(message, code, retryable = false) {
    super(message);
    this.name = 'OpenAIError';
    this.code = code;
    this.retryable = retryable;
  }
}

class RateLimitError extends OpenAIError {
  constructor(message, retryAfter = 60) {
    super(message, 'RATE_LIMIT_EXCEEDED', true);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

class TimeoutError extends OpenAIError {
  constructor(message) {
    super(message, 'TIMEOUT', true);
    this.name = 'TimeoutError';
  }
}

class QuotaExceededError extends OpenAIError {
  constructor(message) {
    super(message, 'QUOTA_EXCEEDED', false);
    this.name = 'QuotaExceededError';
  }
}

// Initialize Redis cache
async function initializeCache() {
  if (!config.redis || !config.redis.url) {
    logger.info('[OpenAI] Redis not configured, caching disabled');
    return false;
  }

  try {
    const { createClient } = require('redis');
    redisClient = createClient({ url: config.redis.url });

    redisClient.on('error', (err) => {
      logger.error('[OpenAI Cache] Redis error:', err.message);
      cacheAvailable = false;
    });

    redisClient.on('ready', () => {
      logger.info('[OpenAI Cache] Redis connected');
      cacheAvailable = true;
    });

    await redisClient.connect();
    return true;
  } catch (error) {
    logger.warn('[OpenAI Cache] Failed to initialize Redis:', error.message);
    return false;
  }
}

// Initialize OpenAI client
async function initializeOpenAI() {
  if (!config.services.openai.apiKey) {
    logger.warn('[OpenAI] API key not configured. AI features will be disabled.');
    return false;
  }

  try {
    openai = new OpenAI({
      apiKey: config.services.openai.apiKey,
      timeout: 30000, // 30 second timeout
      maxRetries: 0 // We handle retries manually
    });
    isAvailable = true;
    logger.info('[OpenAI] Client initialized successfully with model:', config.services.openai.model);

    // Initialize cache
    await initializeCache();

    return true;
  } catch (error) {
    logger.error('[OpenAI] Failed to initialize:', error.message);
    return false;
  }
}

// Generate cache key
function getCacheKey(operation, params) {
  const crypto = require('crypto');
  const data = JSON.stringify({ operation, ...params });
  return `openai:${operation}:${crypto.createHash('md5').update(data).digest('hex')}`;
}

// Get from cache
async function getFromCache(key) {
  if (!cacheAvailable || !redisClient) {
    return null;
  }

  try {
    const cached = await redisClient.get(key);
    if (cached) {
      costTracking.cacheHits++;
      logger.debug('[OpenAI Cache] Hit:', key);
      return JSON.parse(cached);
    }
    costTracking.cacheMisses++;
    return null;
  } catch (error) {
    logger.warn('[OpenAI Cache] Get error:', error.message);
    return null;
  }
}

// Set to cache
async function setToCache(key, value, ttl = 3600) {
  if (!cacheAvailable || !redisClient) {
    return false;
  }

  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
    logger.debug('[OpenAI Cache] Set:', key, `TTL: ${ttl}s`);
    return true;
  } catch (error) {
    logger.warn('[OpenAI Cache] Set error:', error.message);
    return false;
  }
}

// Check rate limits
function checkRateLimit() {
  const now = Date.now();
  const windowStart = now - rateLimitState.tokens.window;

  // Clean old requests
  rateLimitState.requests = rateLimitState.requests.filter(
    req => req.timestamp > windowStart
  );

  // Check request rate
  if (rateLimitState.requests.length >= rateLimitState.limits.requestsPerMinute) {
    const oldestRequest = rateLimitState.requests[0];
    const retryAfter = Math.ceil((oldestRequest.timestamp + rateLimitState.tokens.window - now) / 1000);
    throw new RateLimitError(
      `Rate limit exceeded: ${rateLimitState.limits.requestsPerMinute} requests per minute`,
      retryAfter
    );
  }

  // Check token rate
  const tokensInWindow = rateLimitState.requests.reduce((sum, req) => sum + (req.tokens || 0), 0);
  if (tokensInWindow >= rateLimitState.limits.tokensPerMinute) {
    throw new RateLimitError(
      `Token limit exceeded: ${rateLimitState.limits.tokensPerMinute} tokens per minute`,
      60
    );
  }

  return true;
}

// Record request
function recordRequest(tokens = 0) {
  rateLimitState.requests.push({
    timestamp: Date.now(),
    tokens
  });
}

// Calculate cost
function calculateCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o'];
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return inputCost + outputCost;
}

// Retry with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry non-retryable errors
      if (error instanceof OpenAIError && !error.retryable) {
        throw error;
      }

      // Check if it's an OpenAI API error
      if (error.status) {
        // 429 Rate Limit
        if (error.status === 429) {
          const retryAfter = error.headers?.['retry-after'] || (initialDelay * Math.pow(2, attempt)) / 1000;
          if (attempt < maxRetries) {
            const delay = retryAfter * 1000;
            logger.warn(`[OpenAI] Rate limited, retrying in ${retryAfter}s (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new RateLimitError('Rate limit exceeded after retries', retryAfter);
        }

        // 500-599 Server errors (retryable)
        if (error.status >= 500 && error.status < 600) {
          if (attempt < maxRetries) {
            const delay = initialDelay * Math.pow(2, attempt);
            logger.warn(`[OpenAI] Server error ${error.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new OpenAIError(`Server error after ${maxRetries} retries`, 'SERVER_ERROR', false);
        }

        // 400-499 Client errors (not retryable except 429)
        if (error.status >= 400 && error.status < 500) {
          if (error.status === 402) {
            throw new QuotaExceededError('OpenAI quota exceeded');
          }
          throw new OpenAIError(error.message || 'Client error', 'CLIENT_ERROR', false);
        }
      }

      // Network/timeout errors (retryable)
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.name === 'AbortError') {
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          logger.warn(`[OpenAI] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new TimeoutError('Request timed out after retries');
      }

      // Unknown error
      if (attempt >= maxRetries) {
        throw new OpenAIError(
          `Failed after ${maxRetries} retries: ${error.message}`,
          'UNKNOWN_ERROR',
          false
        );
      }
    }
  }

  throw lastError;
}

// Analyze comment sentiment using GPT-4o with caching
async function analyzeSentiment(text, language = 'auto', options = {}) {
  const startTime = Date.now();

  if (!isAvailable) {
    await initializeOpenAI();
    if (!isAvailable) {
      return {
        sentiment: 'neutral',
        score: 0.5,
        confidence: 0,
        error: 'OpenAI not available',
        cached: false
      };
    }
  }

  try {
    // Check cache first
    const cacheKey = getCacheKey('sentiment', { text, language });
    const cached = await getFromCache(cacheKey);
    if (cached) {
      logger.info(`[OpenAI] Sentiment analysis cache hit (${Date.now() - startTime}ms)`);
      return { ...cached, cached: true };
    }

    // Check rate limit
    checkRateLimit();

    const prompt = `Analyze the sentiment of the following comment and respond in JSON format.
Language: ${language === 'auto' ? 'Detect automatically' : language}

Comment: "${text}"

Respond with ONLY valid JSON in this exact format:
{
  "sentiment": "positive|negative|neutral",
  "score": 0.0-1.0,
  "intensity": "very_negative|negative|neutral|positive|very_positive",
  "confidence": 0.0-1.0,
  "language": "detected language code",
  "emotions": ["emotion1", "emotion2"],
  "toxicity": 0.0-1.0
}`;

    const result = await retryWithBackoff(async () => {
      const completion = await openai.chat.completions.create({
        model: config.services.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a multilingual sentiment analysis expert. Analyze sentiment accurately across languages including English, Japanese, Chinese, Korean, Spanish, French, German, and others. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 200,
        response_format: { type: 'json_object' }
      });

      return completion;
    }, options.maxRetries || 3);

    const parsed = JSON.parse(result.choices[0].message.content);
    const tokens = result.usage.total_tokens;
    const cost = calculateCost(config.services.openai.model, result.usage.prompt_tokens, result.usage.completion_tokens);

    // Update tracking
    recordRequest(tokens);
    costTracking.totalTokens += tokens;
    costTracking.totalCost += cost;
    costTracking.requestCount++;

    const response = {
      sentiment: parsed.sentiment || 'neutral',
      score: parsed.score || 0.5,
      intensity: parsed.intensity || 'neutral',
      confidence: parsed.confidence || 0.7,
      language: parsed.language || 'unknown',
      emotions: parsed.emotions || [],
      toxicity: parsed.toxicity || 0,
      model: config.services.openai.model,
      usage: result.usage,
      cost,
      latency: Date.now() - startTime,
      cached: false
    };

    // Cache the result (1 hour TTL)
    await setToCache(cacheKey, response, 3600);

    logger.info(`[OpenAI] Sentiment analysis completed (${response.latency}ms, ${tokens} tokens, $${cost.toFixed(6)})`);

    return response;

  } catch (error) {
    costTracking.errorCount++;

    if (error instanceof OpenAIError) {
      logger.error(`[OpenAI] ${error.name}:`, error.message);
      throw error;
    }

    logger.error('[OpenAI] Sentiment analysis failed:', error.message);
    return {
      sentiment: 'neutral',
      score: 0.5,
      confidence: 0,
      error: error.message,
      cached: false,
      latency: Date.now() - startTime
    };
  }
}

// Get cost tracking statistics
function getCostStats() {
  return {
    ...costTracking,
    averageCostPerRequest: costTracking.requestCount > 0
      ? costTracking.totalCost / costTracking.requestCount
      : 0,
    cacheHitRate: (costTracking.cacheHits + costTracking.cacheMisses) > 0
      ? (costTracking.cacheHits / (costTracking.cacheHits + costTracking.cacheMisses)) * 100
      : 0,
    errorRate: costTracking.requestCount > 0
      ? (costTracking.errorCount / costTracking.requestCount) * 100
      : 0
  };
}

// Reset cost tracking
function resetCostTracking() {
  costTracking.totalTokens = 0;
  costTracking.totalCost = 0;
  costTracking.requestCount = 0;
  costTracking.errorCount = 0;
  costTracking.cacheHits = 0;
  costTracking.cacheMisses = 0;
  logger.info('[OpenAI] Cost tracking reset');
}

// Detect toxic content using GPT-4o (with caching)
async function detectToxicContent(text, options = {}) {
  const startTime = Date.now();

  if (!isAvailable) {
    await initializeOpenAI();
    if (!isAvailable) {
      return {
        isToxic: false,
        score: 0,
        categories: {},
        error: 'OpenAI not available'
      };
    }
  }

  try {
    // Check cache
    const cacheKey = getCacheKey('toxicity', { text });
    const cached = await getFromCache(cacheKey);
    if (cached) {
      logger.info(`[OpenAI] Toxicity detection cache hit (${Date.now() - startTime}ms)`);
      return { ...cached, cached: true };
    }

    // Check rate limit
    checkRateLimit();

    // Use OpenAI's Moderation API (most accurate for toxicity)
    const result = await retryWithBackoff(async () => {
      return await openai.moderations.create({ input: text });
    }, options.maxRetries || 3);

    const moderation = result.results[0];

    const response = {
      isToxic: moderation.flagged,
      score: Math.max(...Object.values(moderation.category_scores)),
      categories: moderation.category_scores,
      details: moderation.categories,
      model: 'text-moderation-latest',
      latency: Date.now() - startTime,
      cached: false
    };

    // Cache result (1 hour TTL)
    await setToCache(cacheKey, response, 3600);

    costTracking.requestCount++;
    logger.info(`[OpenAI] Toxicity detection completed (${response.latency}ms)`);

    return response;

  } catch (error) {
    costTracking.errorCount++;

    if (error instanceof OpenAIError) {
      logger.error(`[OpenAI] ${error.name}:`, error.message);
      throw error;
    }

    logger.error('[OpenAI] Toxicity detection failed:', error.message);
    return {
      isToxic: false,
      score: 0,
      categories: {},
      error: error.message,
      latency: Date.now() - startTime
    };
  }
}

// Export all functionality
module.exports = {
  isAvailable: () => isAvailable,
  initializeOpenAI,
  analyzeSentiment,
  detectToxicContent,
  getCostStats,
  resetCostTracking,
  // Error classes
  OpenAIError,
  RateLimitError,
  TimeoutError,
  QuotaExceededError
};
