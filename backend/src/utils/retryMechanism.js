const logger = require('../logger');

/**
 * Retry utility with exponential backoff and jitter
 */
class RetryMechanism {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 30000; // 30 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitter = options.jitter !== false; // Enable jitter by default
    this.retryCondition = options.retryCondition || this.defaultRetryCondition;
  }

  /**
   * Default retry condition - retry on network errors and 5xx status codes
   */
  defaultRetryCondition(error, attempt) {
    // Network errors
    if (error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET') {
      return true;
    }

    // HTTP status codes
    if (error.status || error.statusCode) {
      const status = error.status || error.statusCode;
      return status >= 500 || status === 429; // Server errors and rate limiting
    }

    // Timeout errors
    if (error.message && (
      error.message.includes('timeout') ||
      error.message.includes('TIMEOUT')
    )) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  calculateDelay(attempt) {
    const exponentialDelay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt);
    const delayWithCap = Math.min(exponentialDelay, this.maxDelay);

    if (this.jitter) {
      // Add random jitter (±25% of the delay)
      const jitterRange = delayWithCap * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      return Math.max(0, delayWithCap + jitter);
    }

    return delayWithCap;
  }

  /**
   * Execute function with retry logic
   */
  async execute(fn, context = {}) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn(attempt);

        if (attempt > 0) {
          logger.info('[RetryMechanism] Operation succeeded after retry', {
            attempt: attempt + 1,
            operation: context.operation || 'unknown',
            duration: context.startTime ? Date.now() - context.startTime : undefined
          });
        }

        return result;
      } catch (error) {
        lastError = error;

        const shouldRetry = attempt < this.maxRetries && this.retryCondition(error, attempt);

        if (!shouldRetry) {
          if (attempt > 0) {
            logger.warn('[RetryMechanism] Operation failed after all retries', {
              attempts: attempt + 1,
              operation: context.operation || 'unknown',
              error: error.message,
              finalError: true
            });
          }
          throw error;
        }

        const delay = this.calculateDelay(attempt);

        logger.warn('[RetryMechanism] Operation failed, retrying', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          delay: Math.round(delay),
          operation: context.operation || 'unknown',
          error: error.message
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * HTTP request retry wrapper
 */
class HttpRetry extends RetryMechanism {
  constructor(options = {}) {
    super({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      ...options
    });
  }

  defaultRetryCondition(error, attempt) {
    // Call parent retry condition
    if (super.defaultRetryCondition(error, attempt)) {
      return true;
    }

    // Additional HTTP-specific retry conditions
    if (error.status === 429) {
      // Rate limited - check Retry-After header if available
      const retryAfter = error.headers && error.headers['retry-after'];
      if (retryAfter) {
        const delay = parseInt(retryAfter) * 1000;
        if (!isNaN(delay) && delay > 0) {
          // Override the calculated delay
          this.overrideDelay = delay;
        }
      }
      return true;
    }

    return false;
  }

  calculateDelay(attempt) {
    if (this.overrideDelay) {
      const delay = this.overrideDelay;
      this.overrideDelay = null;
      return delay;
    }

    return super.calculateDelay(attempt);
  }
}

/**
 * Database operation retry wrapper
 */
class DatabaseRetry extends RetryMechanism {
  constructor(options = {}) {
    super({
      maxRetries: 5,
      baseDelay: 200,
      maxDelay: 5000,
      ...options
    });
  }

  defaultRetryCondition(error, attempt) {
    // SQLite busy errors
    if (error.code === 'SQLITE_BUSY' || error.message?.includes('database is locked')) {
      return true;
    }

    // Connection errors
    if (error.code === 'SQLITE_CANTOPEN' || error.message?.includes('unable to open database')) {
      return attempt < 2; // Only retry connection errors a few times
    }

    return super.defaultRetryCondition(error, attempt);
  }
}

/**
 * External API call retry wrapper
 */
class ApiRetry extends HttpRetry {
  constructor(options = {}) {
    super({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      ...options
    });
  }

  defaultRetryCondition(error, attempt) {
    if (super.defaultRetryCondition(error, attempt)) {
      return true;
    }

    // API-specific retry conditions
    if (error.status === 502 || error.status === 503 || error.status === 504) {
      // Gateway errors - likely temporary
      return true;
    }

    // YouTube/Twitch API quota exceeded (but not rate limited)
    if (error.status === 403 && error.message?.includes('quota')) {
      return false; // Don't retry quota exceeded
    }

    return false;
  }
}

/**
 * Retry-aware wrapper for functions that might fail
 */
async function withRetry(fn, options = {}, context = {}) {
  const retryMechanism = new RetryMechanism(options);
  return retryMechanism.execute(fn, context);
}

/**
 * Create a retry-enabled function
 */
function createRetryableFunction(fn, options = {}) {
  const retryMechanism = new RetryMechanism(options);

  return async function(...args) {
    return retryMechanism.execute(
      () => fn.apply(this, args),
      { operation: fn.name || 'anonymous' }
    );
  };
}

module.exports = {
  RetryMechanism,
  HttpRetry,
  DatabaseRetry,
  ApiRetry,
  withRetry,
  createRetryableFunction
};
