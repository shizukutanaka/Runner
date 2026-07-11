// OpenAI Service for GPT-4o integration
const OpenAI = require('openai');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');

let openai = null;
let isAvailable = false;

// ─── インメモリキャッシュ (TTL付き) ───────────────────────────────────────
const _cache = new Map();
const CACHE_TTL_MS = {
  sentiment: 10 * 60 * 1000,   // 10分 - 同じテキストの感情分析は変わらない
  toxicity:  30 * 60 * 1000,   // 30分 - 毒性スコアは安定
  translate:  5 * 60 * 1000,   // 5分
  summarize:  3 * 60 * 1000,   // 3分 - コメントは変動
  chatbot:    0                  // キャッシュしない (文脈依存)
};

function _cacheKey(type, ...args) {
  const raw = JSON.stringify([type, ...args]);
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.value;
}

function _cacheSet(key, value, ttlMs) {
  if (ttlMs === 0) return;
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  // メモリ保護: 最大 1000 エントリ
  if (_cache.size > 1000) {
    const oldest = _cache.keys().next().value;
    _cache.delete(oldest);
  }
}

// ─── カスタムエラークラス ─────────────────────────────────────────────────
class OpenAIError extends Error {
  constructor(message, code = 'OPENAI_ERROR', retryable = false) {
    super(message);
    this.name = 'OpenAIError';
    this.code = code;
    this.retryable = retryable;
  }
}

class RateLimitError extends OpenAIError {
  constructor(message, retryAfter = null) {
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

// ─── コスト追跡 ──────────────────────────────────────────────────────────
const _initialCostTracker = () => ({
  totalCalls: 0,
  cachedHits: 0,
  errorCount: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  // GPT-4o 料金 (2025年: $2.5/1M input, $10/1M output)
  estimatedCostUSD: 0,
  byType: {}
});

let _costTracker = _initialCostTracker();

function resetCostTracking() {
  _costTracker = _initialCostTracker();
}

function _trackUsage(type, usage, fromCache = false) {
  _costTracker.totalCalls++;
  if (fromCache) { _costTracker.cachedHits++; return; }
  if (!usage) return;
  const inputTokens  = usage.prompt_tokens     || 0;
  const outputTokens = usage.completion_tokens  || 0;
  _costTracker.totalInputTokens  += inputTokens;
  _costTracker.totalOutputTokens += outputTokens;
  _costTracker.estimatedCostUSD  += (inputTokens / 1e6) * 2.5 + (outputTokens / 1e6) * 10;
  _costTracker.byType[type] = (_costTracker.byType[type] || 0) + 1;
}

function _trackError(type) {
  _costTracker.totalCalls++;
  _costTracker.errorCount++;
  _costTracker.byType[type] = (_costTracker.byType[type] || 0) + 1;
}

// ─── タイムアウト付き API 呼び出し ───────────────────────────────────────
const API_TIMEOUT_MS = 15_000;

async function _callWithTimeout(fn) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('OpenAI API timeout after 15s')),
      API_TIMEOUT_MS
    );
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// ─── エクスポネンシャルバックオフ付きリトライ ──────────────────────────────
async function _withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 503 || err.status >= 500
        || err.message?.includes('timeout');
      if (!isRetryable || attempt === maxRetries - 1) throw err;
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000);
      logger.warn(`[OpenAI] Retry ${attempt + 1}/${maxRetries} in ${delayMs}ms`, {
        error: err.message,
        status: err.status
      });
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// Initialize OpenAI client
function initializeOpenAI() {
  if (!config.services.openai.apiKey) {
    logger.warn('[OpenAI] API key not configured. AI features will be disabled.');
    return false;
  }

  try {
    openai = new OpenAI({
      apiKey: config.services.openai.apiKey
    });
    isAvailable = true;
    logger.info('[OpenAI] Client initialized successfully with model:', config.services.openai.model);
    return true;
  } catch (error) {
    logger.error('[OpenAI] Failed to initialize:', error.message);
    return false;
  }
}

// Analyze comment sentiment using GPT-4o
async function analyzeSentiment(text, language = 'auto') {
  const startTime = Date.now();

  if (!isAvailable) {
    initializeOpenAI();
    if (!isAvailable) {
      return { sentiment: 'neutral', score: 0.5, confidence: 0, cached: false, error: 'OpenAI not available' };
    }
  }

  // キャッシュ確認
  const cacheKey = _cacheKey('sentiment', text, language);
  const cached = _cacheGet(cacheKey);
  if (cached) {
    _trackUsage('sentiment', null, true);
    return { ...cached, fromCache: true, cached: true, latency: Date.now() - startTime };
  }

  try {
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

    const completion = await _withRetry(() => _callWithTimeout(() =>
      openai.chat.completions.create({
        model: config.services.openai.model,
        messages: [
          { role: 'system', content: 'You are a multilingual sentiment analysis expert. Always respond with valid JSON only.' },
          { role: 'user',   content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 200,
        response_format: { type: 'json_object' }
      })
    ));

    const result = JSON.parse(completion.choices[0].message.content);
    const output = {
      sentiment:  result.sentiment  || 'neutral',
      score:      result.score      || 0.5,
      intensity:  result.intensity  || 'neutral',
      confidence: result.confidence || 0.7,
      language:   result.language   || 'unknown',
      emotions:   result.emotions   || [],
      toxicity:   result.toxicity   || 0,
      model: config.services.openai.model,
      usage: completion.usage
    };

    _cacheSet(cacheKey, output, CACHE_TTL_MS.sentiment);
    _trackUsage('sentiment', completion.usage);
    return { ...output, cached: false, latency: Date.now() - startTime };

  } catch (error) {
    logger.error('[OpenAI] Sentiment analysis failed:', error.message);
    _trackError('sentiment');
    return { sentiment: 'neutral', score: 0.5, confidence: 0, cached: false, error: error.message };
  }
}

// Detect toxic content using GPT-4o
async function detectToxicContent(text) {
  const startTime = Date.now();

  if (!isAvailable) {
    initializeOpenAI();
    if (!isAvailable) {
      return { isToxic: false, score: 0, categories: {}, cached: false, error: 'OpenAI not available' };
    }
  }

  const cacheKey = _cacheKey('toxicity', text);
  const cached = _cacheGet(cacheKey);
  if (cached) {
    _trackUsage('toxicity', null, true);
    return { ...cached, fromCache: true, cached: true, latency: Date.now() - startTime };
  }

  try {
    const moderationModel = config.services.openai.moderationModel;
    const moderation = await _withRetry(() => _callWithTimeout(() =>
      openai.moderations.create({ model: moderationModel, input: text })
    ));

    const result = moderation.results[0];
    const output = {
      isToxic:    result.flagged,
      score:      Math.max(...Object.values(result.category_scores)),
      categories: result.category_scores,
      details:    result.categories,
      model:      moderationModel
    };

    _cacheSet(cacheKey, output, CACHE_TTL_MS.toxicity);
    _trackUsage('toxicity', null);
    return { ...output, cached: false, latency: Date.now() - startTime };

  } catch (error) {
    logger.error('[OpenAI] Toxicity detection failed:', error.message);
    _trackError('toxicity');
    return { isToxic: false, score: 0, categories: {}, cached: false, error: error.message };
  }
}

// Generate AI response for chatbot
async function generateChatbotResponse(userMessage, context = {}) {
  if (!isAvailable) {
    initializeOpenAI();
    if (!isAvailable) {
      return {
        response: 'AI assistant is currently unavailable.',
        confidence: 0,
        error: 'OpenAI not available'
      };
    }
  }

  try {
    const systemPrompt = `You are a helpful, friendly chatbot for a live streaming platform.
- Respond naturally and concisely
- Be supportive and engaging
- Use the streamer's context when available
- Detect the user's language and respond in the same language
- Keep responses under 200 characters unless more detail is needed`;

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add context if available
    if (context.previousMessages && context.previousMessages.length > 0) {
      context.previousMessages.forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    messages.push({ role: 'user', content: userMessage });

    const completion = await _withRetry(() => _callWithTimeout(() =>
      openai.chat.completions.create({
        model: config.services.openai.model,
        messages,
        temperature: 0.8,
        max_tokens: 150
      })
    ));

    const output = {
      response:   completion.choices[0].message.content,
      confidence: 0.8,
      model: config.services.openai.model,
      usage: completion.usage
    };
    _trackUsage('chatbot', completion.usage);
    return output;

  } catch (error) {
    logger.error('[OpenAI] Chatbot response generation failed:', error.message);
    _trackError('chatbot');
    return { response: 'Sorry, I couldn\'t process your message right now.', confidence: 0, error: error.message };
  }
}

// Summarize multiple comments
async function summarizeComments(comments, options = {}) {
  if (!isAvailable) {
    initializeOpenAI();
    if (!isAvailable) {
      return {
        summary: 'AI summarization is currently unavailable.',
        error: 'OpenAI not available'
      };
    }
  }

  try {
    const commentsText = comments
      .map((c, i) => `${i + 1}. ${c.author}: ${c.content}`)
      .join('\n');

    const prompt = `Summarize the following live stream comments in 2-3 concise sentences.
Capture the main topics, sentiment, and notable interactions.
${options.language ? `Respond in ${options.language}.` : 'Respond in the predominant language of the comments.'}

Comments:
${commentsText}`;

    const cacheKey = _cacheKey('summarize', commentsText);
    const cached = _cacheGet(cacheKey);
    if (cached) {
      _trackUsage('summarize', null, true);
      return { ...cached, fromCache: true };
    }

    const completion = await _withRetry(() => _callWithTimeout(() =>
      openai.chat.completions.create({
        model: config.services.openai.model,
        messages: [
          { role: 'system', content: 'You are an expert at analyzing and summarizing live chat conversations. Be concise and capture the essence of the discussion.' },
          { role: 'user',   content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 200
      })
    ));

    const output = {
      summary:      completion.choices[0].message.content,
      commentCount: comments.length,
      model: config.services.openai.model,
      usage: completion.usage
    };
    _cacheSet(cacheKey, output, CACHE_TTL_MS.summarize);
    _trackUsage('summarize', completion.usage);
    return output;

  } catch (error) {
    logger.error('[OpenAI] Comment summarization failed:', error.message);
    _trackError('summarize');
    return { summary: 'Failed to generate summary.', error: error.message };
  }
}

// Translate text
async function translateText(text, targetLanguage) {
  if (!isAvailable) {
    initializeOpenAI();
    if (!isAvailable) {
      return {
        translatedText: text,
        error: 'OpenAI not available'
      };
    }
  }

  try {
    const prompt = `Translate the following text to ${targetLanguage}. Maintain the tone and context.

Text: "${text}"

Respond with ONLY the translation, no explanations.`;

    const cacheKey = _cacheKey('translate', text, targetLanguage);
    const cached = _cacheGet(cacheKey);
    if (cached) {
      _trackUsage('translate', null, true);
      return { ...cached, fromCache: true };
    }

    const completion = await _withRetry(() => _callWithTimeout(() =>
      openai.chat.completions.create({
        model: config.services.openai.model,
        messages: [
          { role: 'system', content: 'You are a professional translator. Provide accurate, natural translations while preserving meaning and tone.' },
          { role: 'user',   content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    ));

    const output = {
      translatedText:  completion.choices[0].message.content.trim(),
      sourceLanguage:  'auto-detected',
      targetLanguage,
      model: config.services.openai.model,
      usage: completion.usage
    };
    _cacheSet(cacheKey, output, CACHE_TTL_MS.translate);
    _trackUsage('translate', completion.usage);
    return output;

  } catch (error) {
    logger.error('[OpenAI] Translation failed:', error.message);
    _trackError('translate');
    return { translatedText: text, error: error.message };
  }
}

// コスト統計を取得（監視・モニタリング用）
function getCostStats() {
  const { totalCalls, cachedHits, errorCount, totalInputTokens, totalOutputTokens, estimatedCostUSD } = _costTracker;

  return {
    ..._costTracker,
    cacheHits: cachedHits,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCost: estimatedCostUSD,
    requestCount: totalCalls,
    cacheMisses: Math.max(totalCalls - cachedHits, 0),
    averageCostPerRequest: totalCalls > 0 ? estimatedCostUSD / totalCalls : 0,
    cacheHitRate: totalCalls > 0 ? (cachedHits / totalCalls) * 100 : 0,
    errorRate: totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0,
    cacheSize: _cache.size
  };
}

// Initialize on module load
initializeOpenAI();

module.exports = {
  isAvailable:            () => isAvailable,
  analyzeSentiment,
  detectToxicContent,
  generateChatbotResponse,
  summarizeComments,
  translateText,
  getCostStats,
  resetCostTracking,
  initializeOpenAI,
  OpenAIError,
  RateLimitError,
  TimeoutError,
  QuotaExceededError
};
