// backend/tests/helpers/testHelpers.js
const request = require('supertest');
const { sequelize } = require('../../src/config/database');
const cacheService = require('../../src/services/cacheService');
const { logger } = require('../../src/utils/enhancedLogger');

/**
 * テストヘルパークラス
 */
class TestHelpers {
  constructor(app) {
    this.app = app;
    this.testUser = null;
    this.testToken = null;
    this.cleanupFunctions = [];
  }

  /**
   * テストユーザーを作成
   */
  async createTestUser(userData = {}) {
    const defaultUser = {
      email: 'test@example.com',
      password: 'TestPassword123',
      firstName: 'テスト',
      lastName: 'ユーザー',
      isActive: true,
      ...userData
    };

    // データベースに直接挿入（テスト用）
    const user = await sequelize.models.User.create(defaultUser);
    this.testUser = user;

    // クリーンアップ関数を登録
    this.cleanupFunctions.push(async () => {
      if (user) {
        await user.destroy({ force: true });
      }
    });

    return user;
  }

  /**
   * 認証トークンを取得
   */
  async getAuthToken(user = null) {
    const loginUser = user || this.testUser;

    if (!loginUser) {
      throw new Error('テストユーザーが設定されていません');
    }

    const response = await request(this.app)
      .post('/api/auth/login')
      .send({
        email: loginUser.email,
        password: 'TestPassword123'
      });

    if (response.status !== 200) {
      throw new Error(`認証に失敗しました: ${response.body.message}`);
    }

    this.testToken = response.body.token;
    return response.body.token;
  }

  /**
   * 認証付きリクエストを作成
   */
  async authenticatedRequest(method, url, data = null) {
    const token = this.testToken || await this.getAuthToken();

    let req = request(this.app)[method.toLowerCase()](url)
      .set('Authorization', `Bearer ${token}`);

    if (data && (method.toLowerCase() === 'post' || method.toLowerCase() === 'put' || method.toLowerCase() === 'patch')) {
      req = req.send(data);
    }

    return req;
  }

  /**
   * テストデータをクリーンアップ
   */
  async cleanup() {
    for (const cleanupFn of this.cleanupFunctions) {
      try {
        await cleanupFn();
      } catch (error) {
        logger.error('クリーンアップエラー:', error);
      }
    }
    this.cleanupFunctions = [];
  }

  /**
   * データベースをリセット
   */
  async resetDatabase() {
    try {
      // 外部キー制約を一時的に無効化
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

      // 全てのテーブルをリセット
      const tableNames = Object.keys(sequelize.models);
      for (const tableName of tableNames) {
        await sequelize.models[tableName].destroy({ where: {}, force: true });
      }

      // シーケンスをリセット（PostgreSQLの場合）
      if (sequelize.getDialect() === 'postgres') {
        for (const tableName of tableNames) {
          await sequelize.query(`ALTER SEQUENCE "${tableName}_id_seq" RESTART WITH 1`);
        }
      }

      // 外部キー制約を再有効化
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

      logger.info('データベースがリセットされました');
    } catch (error) {
      logger.error('データベースリセットエラー:', error);
      throw error;
    }
  }

  /**
   * キャッシュをクリア
   */
  async clearCache() {
    await cacheService.clear();
  }

  /**
   * レスポンスの検証ヘルパー
   */
  expectSuccessResponse(response, expectedData = null) {
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(response.body).toHaveProperty('success', true);

    if (expectedData) {
      expect(response.body).toMatchObject(expectedData);
    }

    return response.body;
  }

  /**
   * エラーレスポンスの検証ヘルパー
   */
  expectErrorResponse(response, expectedStatus = 400, expectedMessage = null) {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('success', false);

    if (expectedMessage) {
      expect(response.body.message).toContain(expectedMessage);
    }

    return response.body;
  }

  /**
   * ページネーション結果の検証ヘルパー
   */
  expectPaginatedResponse(response, expectedItems = []) {
    this.expectSuccessResponse(response);

    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('pagination');

    expect(response.body.pagination).toHaveProperty('page');
    expect(response.body.pagination).toHaveProperty('limit');
    expect(response.body.pagination).toHaveProperty('total');
    expect(response.body.pagination).toHaveProperty('totalPages');

    if (expectedItems.length > 0) {
      expect(response.body.data).toHaveLength(expectedItems.length);
    }

    return response.body;
  }

  /**
   * 遅延実行ヘルパー
   */
  async wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  /**
   * ランダム文字列生成
   */
  generateRandomString(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * ランダムメールアドレス生成
   */
  generateRandomEmail() {
    return `test.${Date.now()}.${this.generateRandomString(5)}@example.com`;
  }

  /**
   * モックデータ生成
   */
  generateMockData(type) {
    const mockData = {
      user: {
        email: this.generateRandomEmail(),
        password: 'TestPassword123',
        firstName: 'テスト',
        lastName: 'ユーザー',
        isActive: true
      },
      comment: {
        content: `これはテストコメントです。${this.generateRandomString(20)}`,
        isApproved: true
      },
      notification: {
        title: `テスト通知 ${this.generateRandomString(10)}`,
        message: `これはテスト通知メッセージです。${this.generateRandomString(30)}`,
        type: 'info'
      }
    };

    return mockData[type] || {};
  }

  /**
   * パフォーマンステストヘルパー
   */
  async measurePerformance(operation, iterations = 100) {
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await operation();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1000000); // ミリ秒に変換
    }

    const average = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

    return {
      average: Math.round(average * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      median: Math.round(median * 100) / 100,
      iterations,
      unit: 'ms'
    };
  }

  /**
   * メモリ使用量測定ヘルパー
   */
  measureMemoryUsage() {
    const usage = process.memoryUsage();

    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      unit: 'MB'
    };
  }

  /**
   * データベースクエリ実行時間測定ヘルパー
   */
  async measureQueryTime(queryFn) {
    const start = process.hrtime.bigint();
    const result = await queryFn();
    const end = process.hrtime.bigint();

    return {
      result,
      executionTime: Number(end - start) / 1000000, // ミリ秒
      unit: 'ms'
    };
  }

  /**
   * テストデータベースのセットアップ
   */
  async setupTestDatabase() {
    try {
      // テスト用データベースのマイグレーション実行
      await sequelize.getMigrator().up();

      // テスト用初期データの作成
      await this.createInitialTestData();

      logger.info('テストデータベースがセットアップされました');
    } catch (error) {
      logger.error('テストデータベースセットアップエラー:', error);
      throw error;
    }
  }

  /**
   * 初期テストデータの作成
   */
  async createInitialTestData() {
    // テスト用の管理者ユーザー作成
    const adminUser = await this.createTestUser({
      email: 'admin@test.com',
      firstName: '管理者',
      lastName: 'テスト',
      roleId: 1 // 管理者ロール
    });

    // テスト用の一般ユーザー作成
    const regularUser = await this.createTestUser({
      email: 'user@test.com',
      firstName: '一般',
      lastName: 'ユーザー',
      roleId: 2 // 一般ユーザーロール
    });

    // テスト用のコメントデータ作成
    if (sequelize.models.Comment) {
      await sequelize.models.Comment.create({
        content: 'これはテストコメントです。',
        userId: regularUser.id,
        isApproved: true
      });
    }

    // テスト用の通知データ作成
    if (sequelize.models.Notification) {
      await sequelize.models.Notification.create({
        title: 'テスト通知',
        message: 'これはテスト通知です。',
        userId: regularUser.id,
        type: 'info'
      });
    }
  }

  /**
   * APIレスポンス時間の測定
   */
  async measureApiResponseTime(method, url, data = null) {
    const start = process.hrtime.bigint();

    let req = request(this.app)[method.toLowerCase()](url);

    if (data && (method.toLowerCase() === 'post' || method.toLowerCase() === 'put' || method.toLowerCase() === 'patch')) {
      req = req.send(data);
    }

    const response = await req;

    const end = process.hrtime.bigint();

    return {
      status: response.status,
      responseTime: Number(end - start) / 1000000, // ミリ秒
      unit: 'ms',
      size: JSON.stringify(response.body).length
    };
  }

  /**
   * テストアサーションの拡張ヘルパー
   */
  expectValidTimestamp(timestamp) {
    expect(timestamp).toBeDefined();
    expect(new Date(timestamp).getTime()).not.toBeNaN();
  }

  expectValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  }

  expectValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    expect(email).toMatch(emailRegex);
  }

  expectValidPassword(password) {
    expect(password).toBeDefined();
    expect(password.length).toBeGreaterThanOrEqual(8);
    expect(password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/);
  }
}

/**
 * グローバルテストヘルパーインスタンス
 */
let testHelpersInstance = null;

const getTestHelpers = (app) => {
  if (!testHelpersInstance) {
    testHelpersInstance = new TestHelpers(app);
  }
  return testHelpersInstance;
};

module.exports = {
  TestHelpers,
  getTestHelpers
};
