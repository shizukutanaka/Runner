const config = require('../config');
const logger = require('../logger');

class CacheService {
  constructor() {
    this.redisClient = null;
    this.memoryCache = new Map();
    this.maxMemoryItems = 1000;
    this.defaultTTL = 300; // 5 minutes
    this.statistics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };

    this.initialize();
  }

  async initialize() {
    const redisUrl = config.getEnv('REDIS_URL');

    if (redisUrl) {
      try {
        const { createClient } = require('redis');
        this.redisClient = createClient({
          url: redisUrl,
          socket: {
            connectTimeout: 5000,
            lazyConnect: true,
            reconnectStrategy: (retries) => {
              if (retries > 10) {
                logger.error('[CacheService] Max Redis reconnection attempts reached');
                return false;
              }
              return Math.min(retries * 100, 3000);
            }
          },
          retryDelayOnFailover: 100
        });

        this.redisClient.on('error', (err) => {
          logger.error('[CacheService] Redis error:', { error: err.message });
          this.statistics.errors++;
        });

        this.redisClient.on('connect', () => {
          logger.info('[CacheService] Connected to Redis');
        });

        this.redisClient.on('disconnect', () => {
          logger.warn('[CacheService] Disconnected from Redis, falling back to memory cache');
        });

        await this.redisClient.connect();
        logger.info('[CacheService] Redis cache initialized');
      } catch (error) {
        logger.error('[CacheService] Failed to connect to Redis, using memory cache only', {
          error: error.message
        });
        this.redisClient = null;
      }
    } else {
      logger.info('[CacheService] No Redis URL provided, using memory cache only');
    }

    // Clean up memory cache periodically
    this.cleanupTimer = setInterval(() => this.cleanupMemoryCache(), 60000); // Every minute
    this.cleanupTimer.unref(); // Don't keep the process (or Jest) alive just for this
  }

  // Get value from cache
  async get(key, options = {}) {
    const {
      fallback = null,
      deserialize = true,
      useMemoryOnly = false
    } = options;

    try {
      let value = null;

      // Try Redis first if available and not memory-only
      if (this.redisClient && !useMemoryOnly) {
        try {
          const redisValue = await this.redisClient.get(key);
          if (redisValue !== null) {
            value = deserialize ? JSON.parse(redisValue) : redisValue;
            this.statistics.hits++;
            return value;
          }
        } catch (error) {
          logger.warn('[CacheService] Redis get failed, trying memory cache', {
            key,
            error: error.message
          });
        }
      }

      // Try memory cache
      const memoryItem = this.memoryCache.get(key);
      if (memoryItem && memoryItem.expires > Date.now()) {
        this.statistics.hits++;
        return memoryItem.value;
      }

      // Remove expired item
      if (memoryItem) {
        this.memoryCache.delete(key);
      }

      this.statistics.misses++;

      // Execute fallback function if provided
      if (typeof fallback === 'function') {
        const fallbackValue = await fallback();
        if (fallbackValue !== null && fallbackValue !== undefined) {
          await this.set(key, fallbackValue, options);
          return fallbackValue;
        }
      }

      return null;
    } catch (error) {
      logger.error('[CacheService] Get operation failed', {
        key,
        error: error.message
      });
      this.statistics.errors++;
      return null;
    }
  }

  // Set value in cache
  async set(key, value, options = {}) {
    const {
      ttl = this.defaultTTL,
      serialize = true,
      useMemoryOnly = false,
      tags = []
    } = options;

    try {
      const serializedValue = serialize ? JSON.stringify(value) : value;
      const expires = Date.now() + (ttl * 1000);

      // Set in Redis if available and not memory-only
      if (this.redisClient && !useMemoryOnly) {
        try {
          await this.redisClient.setEx(key, ttl, serializedValue);

          // Store tags for cache invalidation
          if (tags.length > 0) {
            for (const tag of tags) {
              await this.redisClient.sAdd(`tag:${tag}`, key);
              await this.redisClient.expire(`tag:${tag}`, ttl * 2); // Tags live longer
            }
          }
        } catch (error) {
          logger.warn('[CacheService] Redis set failed, storing in memory only', {
            key,
            error: error.message
          });
        }
      }

      // Always store in memory cache as fallback
      if (this.memoryCache.size >= this.maxMemoryItems) {
        // Remove oldest items
        const entries = Array.from(this.memoryCache.entries());
        const sortedEntries = entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        const toRemove = Math.floor(this.maxMemoryItems * 0.2); // Remove 20%

        for (let i = 0; i < toRemove; i++) {
          this.memoryCache.delete(sortedEntries[i][0]);
        }
      }

      this.memoryCache.set(key, {
        value,
        expires,
        lastAccessed: Date.now(),
        tags
      });

      this.statistics.sets++;
      return true;
    } catch (error) {
      logger.error('[CacheService] Set operation failed', {
        key,
        error: error.message
      });
      this.statistics.errors++;
      return false;
    }
  }

  // Delete key from cache
  async delete(key) {
    try {
      let deleted = false;

      // Delete from Redis
      if (this.redisClient) {
        try {
          const result = await this.redisClient.del(key);
          deleted = result > 0;
        } catch (error) {
          logger.warn('[CacheService] Redis delete failed', {
            key,
            error: error.message
          });
        }
      }

      // Delete from memory cache
      if (this.memoryCache.delete(key)) {
        deleted = true;
      }

      if (deleted) {
        this.statistics.deletes++;
      }

      return deleted;
    } catch (error) {
      logger.error('[CacheService] Delete operation failed', {
        key,
        error: error.message
      });
      this.statistics.errors++;
      return false;
    }
  }

  // Delete keys by pattern
  async deletePattern(pattern) {
    try {
      let deletedCount = 0;

      // Delete from Redis using pattern
      if (this.redisClient) {
        try {
          const keys = await this.redisClient.keys(pattern);
          if (keys.length > 0) {
            const result = await this.redisClient.del(keys);
            deletedCount += result;
          }
        } catch (error) {
          logger.warn('[CacheService] Redis pattern delete failed', {
            pattern,
            error: error.message
          });
        }
      }

      // Delete from memory cache
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      for (const [key] of this.memoryCache) {
        if (regex.test(key)) {
          this.memoryCache.delete(key);
          deletedCount++;
        }
      }

      this.statistics.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      logger.error('[CacheService] Pattern delete operation failed', {
        pattern,
        error: error.message
      });
      this.statistics.errors++;
      return 0;
    }
  }

  // Delete keys by tag
  async deleteByTag(tag) {
    try {
      let deletedCount = 0;

      // Delete from Redis using tags
      if (this.redisClient) {
        try {
          const keys = await this.redisClient.sMembers(`tag:${tag}`);
          if (keys.length > 0) {
            const result = await this.redisClient.del(keys);
            deletedCount += result;
            // Clean up the tag set
            await this.redisClient.del(`tag:${tag}`);
          }
        } catch (error) {
          logger.warn('[CacheService] Redis tag delete failed', {
            tag,
            error: error.message
          });
        }
      }

      // Delete from memory cache by tag
      for (const [key, item] of this.memoryCache) {
        if (item.tags && item.tags.includes(tag)) {
          this.memoryCache.delete(key);
          deletedCount++;
        }
      }

      this.statistics.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      logger.error('[CacheService] Tag delete operation failed', {
        tag,
        error: error.message
      });
      this.statistics.errors++;
      return 0;
    }
  }

  // Increment a counter
  async increment(key, amount = 1, ttl = null) {
    try {
      let newValue = amount;

      // Increment in Redis
      if (this.redisClient) {
        try {
          newValue = await this.redisClient.incrBy(key, amount);
          if (ttl) {
            await this.redisClient.expire(key, ttl);
          }
        } catch (error) {
          logger.warn('[CacheService] Redis increment failed', {
            key,
            error: error.message
          });
        }
      }

      // Update memory cache
      const memoryItem = this.memoryCache.get(key);
      if (memoryItem) {
        memoryItem.value = (memoryItem.value || 0) + amount;
        memoryItem.lastAccessed = Date.now();
        newValue = memoryItem.value;
      } else {
        const expires = ttl ? Date.now() + (ttl * 1000) : Date.now() + (this.defaultTTL * 1000);
        this.memoryCache.set(key, {
          value: amount,
          expires,
          lastAccessed: Date.now(),
          tags: []
        });
      }

      return newValue;
    } catch (error) {
      logger.error('[CacheService] Increment operation failed', {
        key,
        error: error.message
      });
      this.statistics.errors++;
      return null;
    }
  }

  // Check if key exists
  async exists(key) {
    try {
      // Check Redis first
      if (this.redisClient) {
        try {
          const exists = await this.redisClient.exists(key);
          if (exists) return true;
        } catch (error) {
          logger.warn('[CacheService] Redis exists check failed', {
            key,
            error: error.message
          });
        }
      }

      // Check memory cache
      const memoryItem = this.memoryCache.get(key);
      if (memoryItem && memoryItem.expires > Date.now()) {
        return true;
      }

      // Clean up expired item
      if (memoryItem) {
        this.memoryCache.delete(key);
      }

      return false;
    } catch (error) {
      logger.error('[CacheService] Exists check failed', {
        key,
        error: error.message
      });
      this.statistics.errors++;
      return false;
    }
  }

  // Set expiration for a key
  async expire(key, ttl) {
    try {
      let success = false;

      // Set expiration in Redis
      if (this.redisClient) {
        try {
          const result = await this.redisClient.expire(key, ttl);
          success = result === 1;
        } catch (error) {
          logger.warn('[CacheService] Redis expire failed', {
            key,
            error: error.message
          });
        }
      }

      // Update expiration in memory cache
      const memoryItem = this.memoryCache.get(key);
      if (memoryItem) {
        memoryItem.expires = Date.now() + (ttl * 1000);
        success = true;
      }

      return success;
    } catch (error) {
      logger.error('[CacheService] Expire operation failed', {
        key,
        error: error.message
      });
      this.statistics.errors++;
      return false;
    }
  }

  // Get multiple keys at once
  async mget(keys, options = {}) {
    const results = {};

    for (const key of keys) {
      results[key] = await this.get(key, options);
    }

    return results;
  }

  // Set multiple keys at once
  async mset(keyValuePairs, options = {}) {
    const promises = [];

    for (const [key, value] of Object.entries(keyValuePairs)) {
      promises.push(this.set(key, value, options));
    }

    const results = await Promise.all(promises);
    return results.every(result => result === true);
  }

  // Clear all cache
  async clear() {
    try {
      // Clear Redis
      if (this.redisClient) {
        try {
          await this.redisClient.flushAll();
        } catch (error) {
          logger.warn('[CacheService] Redis clear failed', {
            error: error.message
          });
        }
      }

      // Clear memory cache
      this.memoryCache.clear();

      logger.info('[CacheService] Cache cleared');
      return true;
    } catch (error) {
      logger.error('[CacheService] Clear operation failed', {
        error: error.message
      });
      this.statistics.errors++;
      return false;
    }
  }

  // Get cache statistics
  getStatistics() {
    const hitRate = this.statistics.hits + this.statistics.misses > 0
      ? (this.statistics.hits / (this.statistics.hits + this.statistics.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.statistics,
      hitRate: `${hitRate}%`,
      memoryItems: this.memoryCache.size,
      memoryItemsMax: this.maxMemoryItems,
      redisConnected: !!this.redisClient?.isReady
    };
  }

  // Clean up expired items from memory cache
  cleanupMemoryCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, item] of this.memoryCache) {
      if (item.expires <= now) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('[CacheService] Memory cache cleanup completed', {
        cleanedItems: cleanedCount,
        remainingItems: this.memoryCache.size
      });
    }
  }

  // Warm up cache with common data
  async warmUp(warmUpFunction) {
    if (typeof warmUpFunction !== 'function') {
      throw new Error('Warm up function must be a function');
    }

    try {
      logger.info('[CacheService] Starting cache warm up');
      await warmUpFunction(this);
      logger.info('[CacheService] Cache warm up completed');
    } catch (error) {
      logger.error('[CacheService] Cache warm up failed', {
        error: error.message
      });
    }
  }

  // Cache decorator for functions
  cached(key, ttl = this.defaultTTL, options = {}) {
    return (target, propertyName, descriptor) => {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args) {
        const cacheKey = typeof key === 'function'
          ? key.apply(this, args)
          : `${key}:${JSON.stringify(args)}`;

        // Try to get from cache
        const cachedResult = await this.get(cacheKey, options);
        if (cachedResult !== null) {
          return cachedResult;
        }

        // Execute original method and cache result
        const result = await originalMethod.apply(this, args);
        await this.set(cacheKey, result, { ...options, ttl });

        return result;
      }.bind(this);

      return descriptor;
    };
  }

  // Close connections
  async close() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
        logger.info('[CacheService] Redis connection closed');
      }
      this.memoryCache.clear();
      logger.info('[CacheService] Cache service closed');
    } catch (error) {
      logger.error('[CacheService] Error closing cache service', {
        error: error.message
      });
    }
  }
}

module.exports = new CacheService();