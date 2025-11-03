const crypto = require('crypto');
const logger = require('../logger');

/**
 * API Response Caching Middleware
 * Caches GET requests to improve performance
 */
class ResponseCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 500;
    this.defaultTTL = options.defaultTTL || 60 * 1000; // 1 minute
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };

    // Cleanup expired entries periodically
    setInterval(() => this.cleanup(), 30 * 1000); // Every 30 seconds
  }

  /**
   * Generate cache key from request
   */
  generateKey(req) {
    const components = [
      req.method,
      req.originalUrl || req.url,
      req.user?.id || 'anonymous',
      JSON.stringify(req.query),
      JSON.stringify(req.headers['accept'] || '')
    ];

    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }

  /**
   * Get cached response
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    entry.hits++;
    entry.lastAccessed = Date.now();

    return entry;
  }

  /**
   * Set cached response
   */
  set(key, data, ttl = this.defaultTTL) {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      hits: 0
    });

    this.stats.sets++;
  }

  /**
   * Evict least recently used entry
   */
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  invalidate(pattern) {
    let invalidated = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (pattern.test(entry.data.url)) {
        this.cache.delete(key);
        invalidated++;
      }
    }

    logger.debug('[ResponseCache] Cache invalidated', { pattern: pattern.toString(), count: invalidated });
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('[ResponseCache] All cache cleared', { entries: size });
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('[ResponseCache] Cleanup completed', { removed: cleaned });
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2)
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      sets: this.stats.sets,
      evictions: this.stats.evictions
    };
  }
}

const responseCache = new ResponseCache({
  maxSize: 1000,
  defaultTTL: 60 * 1000 // 1 minute
});

/**
 * Middleware factory for response caching
 */
const cacheMiddleware = (options = {}) => {
  const ttl = options.ttl || responseCache.defaultTTL;
  const skipCache = options.skipCache || (() => false);

  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip cache if specified
    if (skipCache(req)) {
      return next();
    }

    const cacheKey = responseCache.generateKey(req);
    const cached = responseCache.get(cacheKey);

    // Return cached response if available
    if (cached) {
      logger.debug('[ResponseCache] Cache hit', {
        url: req.originalUrl,
        hits: cached.hits
      });

      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Key', cacheKey.substring(0, 16));
      return res.status(cached.data.status).json(cached.data.body);
    }

    // Store original send function
    const originalSend = res.json.bind(res);

    // Override json method to cache response
    res.json = function(body) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        responseCache.set(cacheKey, {
          status: res.statusCode,
          body,
          url: req.originalUrl,
          headers: res.getHeaders()
        }, ttl);

        logger.debug('[ResponseCache] Response cached', {
          url: req.originalUrl,
          ttl: `${ttl}ms`
        });
      }

      res.set('X-Cache', 'MISS');
      return originalSend(body);
    };

    next();
  };
};

/**
 * Invalidation middleware for write operations
 */
const invalidateCache = (pattern) => {
  return (req, res, next) => {
    // Invalidate on successful write operations
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (pattern instanceof RegExp) {
          responseCache.invalidate(pattern);
        } else if (typeof pattern === 'string') {
          responseCache.invalidate(new RegExp(pattern));
        } else if (typeof pattern === 'function') {
          const computedPattern = pattern(req);
          responseCache.invalidate(new RegExp(computedPattern));
        }
      }
    });

    next();
  };
};

module.exports = {
  responseCache,
  cacheMiddleware,
  invalidateCache
};
