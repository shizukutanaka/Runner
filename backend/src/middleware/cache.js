const cache = new Map();
const logger = require('../logger');

const DEFAULT_TTL = 60000; // 1 minute
const MAX_CACHE_SIZE = 100;

class CacheEntry {
  constructor(data, ttl = DEFAULT_TTL) {
    this.data = data;
    this.expiresAt = Date.now() + ttl;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }
}

const getCacheKey = (req) => {
  return `${req.method}:${req.originalUrl || req.url}`;
};

const cleanupExpiredEntries = () => {
  for (const [key, entry] of cache.entries()) {
    if (entry.isExpired()) {
      cache.delete(key);
    }
  }

  if (cache.size > MAX_CACHE_SIZE) {
    const entriesToRemove = cache.size - MAX_CACHE_SIZE;
    const keys = Array.from(cache.keys());
    for (let i = 0; i < entriesToRemove; i++) {
      cache.delete(keys[i]);
    }
  }
};

const cacheMiddleware = (options = {}) => {
  const { ttl = DEFAULT_TTL, skip = () => false } = options;

  return (req, res, next) => {
    if (req.method !== 'GET' || skip(req)) {
      return next();
    }

    const key = getCacheKey(req);
    const cached = cache.get(key);

    if (cached && !cached.isExpired()) {
      logger.debug('[Cache] Hit', { key });
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }

    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200) {
        cache.set(key, new CacheEntry(data, ttl));
        logger.debug('[Cache] Store', { key });
        res.setHeader('X-Cache', 'MISS');
        cleanupExpiredEntries();
      }
      return originalJson(data);
    };

    next();
  };
};

const invalidateCache = (pattern) => {
  if (!pattern) {
    cache.clear();
    logger.info('[Cache] Cleared all entries');
    return;
  }

  const regex = new RegExp(pattern);
  for (const key of cache.keys()) {
    if (regex.test(key)) {
      cache.delete(key);
    }
  }
  logger.info('[Cache] Invalidated pattern', { pattern });
};

module.exports = {
  cacheMiddleware,
  invalidateCache
};