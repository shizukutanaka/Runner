const logger = require('../logger');

/**
 * サーキットブレーカーパターンの実装
 * 外部システムやリソース集約的な操作の障害から保護
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5; // 連続失敗回数の閾値
    this.successThreshold = options.successThreshold || 2; // 半開状態からの回復に必要な成功回数
    this.timeout = options.timeout || 60000; // 開状態から半開状態への移行時間（ミリ秒）
    this.monitoringPeriod = options.monitoringPeriod || 10000; // モニタリング期間

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = null;
    this.lastFailureTime = null;

    // 統計情報
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      lastStateChange: new Date().toISOString()
    };
  }

  /**
   * サーキットブレーカーを通じて関数を実行
   */
  async execute(fn, fallback = null) {
    this.stats.totalCalls++;

    // 開状態の場合
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        this.stats.rejectedCalls++;
        logger.warn(`[CircuitBreaker:${this.name}] Circuit is OPEN, request rejected`, {
          nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
          failureCount: this.failureCount
        });

        if (fallback) {
          return fallback();
        }

        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }

      // タイムアウト経過後、半開状態に移行
      this.toHalfOpen();
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);

      if (fallback) {
        logger.info(`[CircuitBreaker:${this.name}] Using fallback`, { error: error.message });
        return fallback();
      }

      throw error;
    }
  }

  /**
   * 成功時の処理
   */
  onSuccess() {
    this.stats.successfulCalls++;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        this.toClosed();
      }
    } else {
      this.failureCount = 0;
    }
  }

  /**
   * 失敗時の処理
   */
  onFailure(error) {
    this.stats.failedCalls++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.warn(`[CircuitBreaker:${this.name}] Operation failed`, {
      error: error.message,
      failureCount: this.failureCount,
      state: this.state
    });

    if (this.state === 'HALF_OPEN') {
      this.toOpen();
    } else if (this.failureCount >= this.failureThreshold) {
      this.toOpen();
    }
  }

  /**
   * 閉状態に移行（正常動作）
   */
  toClosed() {
    const previousState = this.state;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.stats.lastStateChange = new Date().toISOString();

    logger.info(`[CircuitBreaker:${this.name}] State changed to CLOSED`, {
      previousState,
      stats: this.stats
    });
  }

  /**
   * 開状態に移行（障害検出）
   */
  toOpen() {
    const previousState = this.state;
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + this.timeout;
    this.stats.lastStateChange = new Date().toISOString();

    logger.error(`[CircuitBreaker:${this.name}] State changed to OPEN`, {
      previousState,
      failureCount: this.failureCount,
      nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
      stats: this.stats
    });
  }

  /**
   * 半開状態に移行（回復試行）
   */
  toHalfOpen() {
    const previousState = this.state;
    this.state = 'HALF_OPEN';
    this.successCount = 0;
    this.stats.lastStateChange = new Date().toISOString();

    logger.info(`[CircuitBreaker:${this.name}] State changed to HALF_OPEN`, {
      previousState,
      stats: this.stats
    });
  }

  /**
   * 現在の状態を取得
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      stats: this.stats,
      nextAttemptTime: this.nextAttemptTime ? new Date(this.nextAttemptTime).toISOString() : null
    };
  }

  /**
   * サーキットブレーカーをリセット
   */
  reset() {
    logger.info(`[CircuitBreaker:${this.name}] Manual reset triggered`);
    this.toClosed();
  }
}

/**
 * 複数のサーキットブレーカーを管理
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * サーキットブレーカーを作成または取得
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options));
    }
    return this.breakers.get(name);
  }

  /**
   * 全サーキットブレーカーの状態を取得
   */
  getAllStates() {
    const states = {};
    for (const [name, breaker] of this.breakers.entries()) {
      states[name] = breaker.getState();
    }
    return states;
  }

  /**
   * 全サーキットブレーカーをリセット
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    logger.info('[CircuitBreakerManager] All circuit breakers reset');
  }

  /**
   * 特定のサーキットブレーカーをリセット
   */
  reset(name) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    } else {
      logger.warn(`[CircuitBreakerManager] Circuit breaker not found: ${name}`);
    }
  }

  /**
   * ヘルスチェック用のレポート生成
   */
  getHealthReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalBreakers: this.breakers.size,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      breakers: []
    };

    for (const [name, breaker] of this.breakers.entries()) {
      const state = breaker.getState();
      report.breakers.push(state);

      if (state.state === 'CLOSED') {
        report.healthy++;
      } else if (state.state === 'HALF_OPEN') {
        report.degraded++;
      } else {
        report.unhealthy++;
      }
    }

    return report;
  }
}

const circuitBreakerManager = new CircuitBreakerManager();

module.exports = {
  CircuitBreaker,
  CircuitBreakerManager,
  circuitBreakerManager
};
