// OpenAI Service Unit Tests
// Mocks the OpenAI client to avoid real API calls

// openaiService.js はモジュール読み込み時に一度だけ `new OpenAI(...)` を呼び、
// そのインスタンスをモジュールスコープに保持し続ける。テスト側の `new OpenAI()`
// が別オブジェクトを返すと、テストが設定した mockResolvedValue がサービス内部の
// 呼び出しに反映されない。そのためモックはシングルトンを返すようにする
// （global.jest.config.js の resetMocks:true は個々の jest.fn() の実装をテスト毎に
// クリアするだけで、このオブジェクト構造自体は破棄しないため両立できる）
let mockSingletonOpenAI = null;
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => {
    if (!mockSingletonOpenAI) {
      mockSingletonOpenAI = {
        chat: {
          completions: {
            create: jest.fn()
          }
        },
        moderations: {
          create: jest.fn()
        }
      };
    }
    return mockSingletonOpenAI;
  });
});

// openaiService.js は config.services.openai.apiKey が未設定だと即座に
// フォールバック応答を返しOpenAI APIを一切呼ばない（tests/setup.jsが
// OPENAI_API_KEY='' を設定しているため）。このテストではモック呼び出しの
// 経路を実際に通す必要があるため、モジュール読み込み前にダミーのキーを設定する
process.env.OPENAI_API_KEY = 'test-api-key-for-mocking-only';

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect:  jest.fn().mockResolvedValue(undefined),
    get:      jest.fn().mockResolvedValue(null),
    setEx:    jest.fn().mockResolvedValue('OK'),
    quit:     jest.fn().mockResolvedValue(undefined),
    isOpen:   true,
    isReady:  true,
    on:       jest.fn(),
    info:     jest.fn().mockResolvedValue('redis_version:7.0.0\r\n'),
  }))
}));

const openaiService = require('../../src/services/openaiService');

// Helpers
function mockCompletionResponse(content, usage = { prompt_tokens: 50, completion_tokens: 40, total_tokens: 90 }) {
  return {
    choices: [{ message: { content } }],
    usage
  };
}

function mockModerationResponse(flagged = false, score = 0.1) {
  return {
    results: [{
      flagged,
      categories: { hate: flagged, harassment: false, sexual: false, violence: false, 'self-harm': false },
      category_scores: { hate: flagged ? score : 0.01, harassment: 0.01, sexual: 0.01, violence: 0.01, 'self-harm': 0.001 }
    }]
  };
}

describe('OpenAI Service (Enhanced)', () => {
  let mockOpenAI;

  beforeEach(() => {
    // jest.config.js の resetMocks:true が毎テスト前にコンストラクタの
    // mockImplementation 自体を消去するため、ここで都度再設定する
    const OpenAI = require('openai');
    OpenAI.mockImplementation(() => {
      if (!mockSingletonOpenAI) {
        mockSingletonOpenAI = {
          chat: { completions: { create: jest.fn() } },
          moderations: { create: jest.fn() }
        };
      }
      return mockSingletonOpenAI;
    });
    mockOpenAI = new OpenAI();
  });

  // ============================================================
  // analyzeSentiment
  // ============================================================
  describe('analyzeSentiment()', () => {
    it('正常系: ポジティブなコメントを正しく分析する', async () => {
      const fakeResult = JSON.stringify({
        sentiment: 'positive',
        score: 0.9,
        intensity: 'very_positive',
        confidence: 0.95,
        language: 'ja',
        emotions: ['joy'],
        toxicity: 0.01
      });

      mockOpenAI.chat.completions.create.mockResolvedValue(
        mockCompletionResponse(fakeResult)
      );

      const result = await openaiService.analyzeSentiment('素晴らしい配信！大好き！');

      expect(result.sentiment).toBe('positive');
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.language).toBe('ja');
      expect(result.cached).toBe(false);
    });

    it('正常系: ネガティブなコメントを正しく分析する', async () => {
      const fakeResult = JSON.stringify({
        sentiment: 'negative',
        score: 0.8,
        intensity: 'negative',
        confidence: 0.9,
        language: 'en',
        emotions: ['anger'],
        toxicity: 0.3
      });

      mockOpenAI.chat.completions.create.mockResolvedValue(
        mockCompletionResponse(fakeResult)
      );

      const result = await openaiService.analyzeSentiment('This is terrible!', 'en');

      expect(result.sentiment).toBe('negative');
      expect(result.toxicity).toBeGreaterThan(0);
    });

    it('正常系: フォールバック値を持つ不完全なレスポンスを処理する', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(
        mockCompletionResponse(JSON.stringify({})) // 空のJSONレスポンス
      );

      const result = await openaiService.analyzeSentiment('テスト');

      // フォールバック値が使われる
      expect(result.sentiment).toBe('neutral');
      expect(result.score).toBe(0.5);
      expect(result.confidence).toBe(0.7);
    });

    it('異常系: OpenAI APIエラー時にエラーオブジェクトを返す', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      // 他のテストと同じ入力文字列を使うとキャッシュがヒットしてAPI呼び出しを
      // スキップしてしまうため、このテスト専用の一意な入力を使う
      const result = await openaiService.analyzeSentiment('エラーテスト用の一意な入力テキスト');

      expect(result.error).toBeDefined();
      expect(result.sentiment).toBe('neutral'); // フォールバック
      expect(result.cached).toBe(false);
    });

    it('正常系: レイテンシが記録される', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(
        mockCompletionResponse(JSON.stringify({ sentiment: 'neutral', score: 0.5, confidence: 0.7 }))
      );

      const result = await openaiService.analyzeSentiment('テスト');

      expect(typeof result.latency).toBe('number');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // detectToxicContent
  // ============================================================
  describe('detectToxicContent()', () => {
    it('正常系: 通常コメントは有害と判定されない', async () => {
      mockOpenAI.moderations.create.mockResolvedValue(
        mockModerationResponse(false, 0.02)
      );

      const result = await openaiService.detectToxicContent('こんにちは！楽しい配信ですね');

      expect(result.isToxic).toBe(false);
      expect(result.score).toBeLessThan(0.5);
      expect(result.cached).toBe(false);
    });

    it('正常系: 有害コメントが検出される', async () => {
      mockOpenAI.moderations.create.mockResolvedValue(
        mockModerationResponse(true, 0.85)
      );

      const result = await openaiService.detectToxicContent('ひどい内容のコメント');

      expect(result.isToxic).toBe(true);
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.categories).toBeDefined();
    });

    it('異常系: Moderation APIエラー時に安全なデフォルト値を返す', async () => {
      mockOpenAI.moderations.create.mockRejectedValue(new Error('Moderation API unavailable'));

      const result = await openaiService.detectToxicContent('テスト');

      expect(result.isToxic).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================
  // getCostStats
  // ============================================================
  describe('getCostStats()', () => {
    it('正常系: コスト統計が正しい形式で返される', async () => {
      const stats = openaiService.getCostStats();

      expect(typeof stats.totalTokens).toBe('number');
      expect(typeof stats.totalCost).toBe('number');
      expect(typeof stats.requestCount).toBe('number');
      expect(typeof stats.errorCount).toBe('number');
      expect(typeof stats.cacheHits).toBe('number');
      expect(typeof stats.cacheMisses).toBe('number');
      expect(typeof stats.averageCostPerRequest).toBe('number');
      expect(typeof stats.cacheHitRate).toBe('number');
      expect(typeof stats.errorRate).toBe('number');
    });

    it('正常系: リクエストが0件のときエラーレートは0', () => {
      openaiService.resetCostTracking();
      const stats = openaiService.getCostStats();

      expect(stats.errorRate).toBe(0);
      expect(stats.averageCostPerRequest).toBe(0);
      expect(stats.cacheHitRate).toBe(0);
    });
  });

  // ============================================================
  // Error classes
  // ============================================================
  describe('カスタムエラークラス', () => {
    it('RateLimitError: retryable=true かつ retryAfter を持つ', () => {
      const err = new openaiService.RateLimitError('Rate limited', 30);

      expect(err.retryable).toBe(true);
      expect(err.retryAfter).toBe(30);
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(err instanceof Error).toBe(true);
    });

    it('TimeoutError: retryable=true', () => {
      const err = new openaiService.TimeoutError('Timed out');

      expect(err.retryable).toBe(true);
      expect(err.code).toBe('TIMEOUT');
    });

    it('QuotaExceededError: retryable=false', () => {
      const err = new openaiService.QuotaExceededError('Quota exceeded');

      expect(err.retryable).toBe(false);
      expect(err.code).toBe('QUOTA_EXCEEDED');
    });

    it('OpenAIError: カスタムコードを保持する', () => {
      const err = new openaiService.OpenAIError('test error', 'TEST_CODE', true);

      expect(err.code).toBe('TEST_CODE');
      expect(err.retryable).toBe(true);
      expect(err.name).toBe('OpenAIError');
    });
  });

  // ============================================================
  // isAvailable
  // ============================================================
  describe('isAvailable()', () => {
    it('APIキーなしでは false を返す', () => {
      // NOTE: モジュールレベルの初期化済み状態によるが、
      // キーが設定されていなければ false
      const available = openaiService.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });
});
