const moderationService = require('../services/moderationService');
const db = require('../db');
const logger = require('../logger');

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
});

exports.moderateComment = async (req, res, next) => {
  const { content, platform, user, timestamp } = req.body;
  try {
    const result = await moderationService.analyzeComment(content, platform, user, timestamp);
    res.json({ status: 200, data: result, message: 'Moderation success' });
  } catch (err) {
    next({ status: 500, message: 'Moderation error', details: err });
  }
};

exports.updateSettings = (req, res, next) => {
  const { platform, thresholds, bannedWords, regexPatterns } = req.body;
  moderationService.updateSettings(platform, thresholds, bannedWords, regexPatterns)
    .then(() => res.json({ status: 200, data: null, message: 'Settings updated' }))
    .catch((err) => next({ status: 500, message: 'Settings update error', details: err }));
};

// AI判定閾値詳細設定
exports.setThresholds = (req, res, next) => {
  try {
    const { platform, thresholds } = req.body;
    // 実際の実装ではここで閾値設定を保存する処理を実装
    res.json({ status: 200, data: { platform, thresholds }, message: 'AI判定閾値を更新しました' });
  } catch (err) {
    next({ status: 500, message: '閾値設定の更新中にエラーが発生しました', details: err });
  }
};

// AI判定自動学習ON/OFF
exports.setAutoLearning = (req, res, next) => {
  try {
    const { enabled } = req.body;
    // 実際の実装では自動学習の有効/無効を切り替える処理を実装
    res.json({ status: 200, data: { autoLearning: enabled }, message: `自動学習を${enabled ? '有効' : '無効'}にしました` });
  } catch (err) {
    next({ status: 500, message: '自動学習設定の更新中にエラーが発生しました', details: err });
  }
};

// AI判定モデル切替
exports.switchModel = (req, res, next) => {
  try {
    const { modelName } = req.body;
    if (!modelName) {
      return next({ status: 400, message: 'モデル名を指定してください' });
    }
    // 実際の実装ではモデルを切り替える処理を実装
    res.json({ status: 200, data: { currentModel: modelName }, message: `AIモデルを${modelName}に切り替えました` });
  } catch (err) {
    next({ status: 500, message: 'モデル切替中にエラーが発生しました', details: err });
  }
};

// AI判定の再学習API
exports.retrainModel = async (req, res, next) => {
  try {
    const { trainingData } = req.body;
    if (!trainingData || !Array.isArray(trainingData)) {
      return next({ status: 400, message: '有効なトレーニングデータを指定してください' });
    }
    // 実際の実装ではモデルの再学習処理を実装
    // const modelInfo = await moderationService.retrainModel(trainingData);
    res.json({ 
      status: 200, 
      data: { /* modelInfo */ }, 
      message: 'AIモデルの再学習が完了しました' 
    });
  } catch (err) {
    next({ status: 500, message: 'モデルの再学習中にエラーが発生しました', details: err });
  }
};

// AI判定の説明表示
exports.getExplanation = (req, res, next) => {
  try {
    const { commentId } = req.params;
    // 実際の実装ではコメントIDに基づいて説明を取得
    const explanation = `コメントID: ${commentId} のAI判定根拠説明`;
    res.json({ status: 200, data: { explanation }, message: 'AI判定の説明を取得しました' });
  } catch (err) {
    next({ status: 500, message: '説明の取得中にエラーが発生しました', details: err });
  }
};

// AI判定結果のエクスポート
exports.exportResults = async (req, res, next) => {
  try {
    const { startDate, endDate, format = 'csv' } = req.query;
    // 実際の実装では指定期間の判定結果をエクスポート
    const exportUrl = `/exports/ai_results_${new Date().toISOString()}.${format}`;
    const exportData = {
      startDate,
      endDate,
      format,
      recordCount: 100, // ダミー値
      fileSize: '1.2MB' // ダミー値
    };
    res.json({ 
      status: 200, 
      data: { 
        downloadUrl: exportUrl,
        ...exportData
      }, 
      message: 'AI判定結果のエクスポートが完了しました' 
    });
  } catch (err) {
    next({ status: 500, message: 'エクスポート処理中にエラーが発生しました', details: err });
  }
};

// NGワード自動収集API
exports.collectBannedWords = async (req, res, next) => {
  try {
    const { source = 'auto', limit = 50 } = req.query;
    // 実際の実装ではNGワードを自動収集する処理を実装
    const collectedWords = Array(5).fill(0).map((_, i) => `collected-word-${i + 1}`);
    res.json({ 
      status: 200, 
      data: { 
        words: collectedWords,
        source,
        count: collectedWords.length,
        timestamp: new Date().toISOString()
      }, 
      message: 'NGワードを自動収集しました' 
    });
  } catch (err) {
    next({ status: 500, message: 'NGワードの収集中にエラーが発生しました', details: err });
  }
};

// NGワードごとの重み付け設定
exports.setWordWeights = (req, res, next) => {
  try {
    const { wordWeights } = req.body;
    if (!wordWeights || typeof wordWeights !== 'object') {
      return next({ status: 400, message: '有効な重み付けデータを指定してください' });
    }
    // 実際の実装ではNGワードの重みを保存する処理を実装
    res.json({ 
      status: 200, 
      data: { updatedCount: Object.keys(wordWeights).length }, 
      message: 'NGワードの重み付けを更新しました' 
    });
  } catch (err) {
    next({ status: 500, message: '重み付けの更新中にエラーが発生しました', details: err });
  }
};

// NGワードの履歴取得
exports.getBannedWordHistory = (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    // 実際の実装ではデータベースから履歴を取得
    const history = Array(10).fill(0).map((_, i) => ({
      id: offset + i + 1,
      word: `word${offset + i + 1}`,
      action: i % 3 === 0 ? 'added' : (i % 3 === 1 ? 'removed' : 'modified'),
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      modifiedBy: `user${i % 5 + 1}@example.com`
    }));
    res.json({ 
      status: 200, 
      data: { 
        history,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 100 // ダミーの総件数
        }
      }, 
      message: 'NGワードの履歴を取得しました' 
    });
  } catch (err) {
    next({ status: 500, message: '履歴の取得中にエラーが発生しました', details: err });
  }
};

// NGワードの外部連携API
exports.externalBannedWords = async (req, res, next) => {
  try {
    const { action, target, words } = req.body;
    if (!['import', 'export', 'sync'].includes(action)) {
      return next({ status: 400, message: '有効なアクションを指定してください' });
    }
    // 実際の実装では外部連携処理を実装
    const result = {
      action,
      target,
      wordCount: words ? words.length : 0,
      timestamp: new Date().toISOString(),
      status: 'completed'
    };
    res.json({ 
      status: 200, 
      data: result, 
      message: `NGワードの${action === 'import' ? 'インポート' : action === 'export' ? 'エクスポート' : '同期'}が完了しました` 
    });
  } catch (err) {
    next({ status: 500, message: '外部連携処理中にエラーが発生しました', details: err });
  }
};

// NGワードの自動翻訳API
exports.translateBannedWords = async (req, res, next) => {
  try {
    const { words, sourceLang = 'ja', targetLangs = ['en'] } = req.body;
    if (!words || !Array.isArray(words) || words.length === 0) {
      return next({ status: 400, message: '翻訳する単語を指定してください' });
    }
    // 実際の実装では翻訳サービスを呼び出す
    const translations = targetLangs.reduce((acc, lang) => {
      acc[lang] = words.map(word => `${word}_translated_to_${lang}`);
      return acc;
    }, {});
    res.json({ 
      status: 200, 
      data: { 
        sourceLang,
        targetLangs,
        translations,
        wordCount: words.length
      }, 
      message: 'NGワードの翻訳が完了しました' 
    });
  } catch (err) {
    next({ status: 500, message: '翻訳処理中にエラーが発生しました', details: err });
  }
};

// リンクブロック設定の取得
exports.getLinkBlockSettings = (req, res, next) => {
  try {
    // 実際の実装ではデータベースから設定を取得
    const linkBlockSettings = {
      enabled: true,
      blockedDomains: [
        'spam-site.com',
        'malicious-link.net',
        'scam-domain.org',
        'phishing-site.ru'
      ],
      suspiciousDomains: [
        'free-gift.com',
        'win-prize.net',
        'cheap-deals.org'
      ],
      blockedPatterns: [
        'bit.ly',
        'tinyurl.com',
        'goo.gl',
        't.co'
      ],
      allowedDomains: [
        'youtube.com',
        'youtu.be',
        'twitch.tv',
        'twitter.com',
        'instagram.com',
        'facebook.com',
        'discord.com',
        'github.com'
      ],
      maxLinksPerComment: 3,
      autoFlagSuspiciousLinks: true,
      autoBlockHighRiskLinks: true
    };

    res.json({
      status: 200,
      data: linkBlockSettings,
      message: 'リンクブロック設定を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'リンクブロック設定の取得中にエラーが発生しました', details: err });
  }
};

// リンクブロック設定の更新
exports.updateLinkBlockSettings = (req, res, next) => {
  try {
    const {
      enabled,
      blockedDomains,
      suspiciousDomains,
      blockedPatterns,
      allowedDomains,
      maxLinksPerComment,
      autoFlagSuspiciousLinks,
      autoBlockHighRiskLinks
    } = req.body;

    // バリデーション
    if (typeof enabled !== 'boolean') {
      return next({ status: 400, message: 'enabledはboolean型で指定してください' });
    }

    if (maxLinksPerComment !== undefined && (!Number.isInteger(maxLinksPerComment) || maxLinksPerComment < 0)) {
      return next({ status: 400, message: 'maxLinksPerCommentは0以上の整数で指定してください' });
    }

    // 実際の実装ではデータベースに保存
    const updatedSettings = {
      enabled,
      blockedDomains: blockedDomains || [],
      suspiciousDomains: suspiciousDomains || [],
      blockedPatterns: blockedPatterns || [],
      allowedDomains: allowedDomains || [],
      maxLinksPerComment: maxLinksPerComment || 3,
      autoFlagSuspiciousLinks: autoFlagSuspiciousLinks !== undefined ? autoFlagSuspiciousLinks : true,
      autoBlockHighRiskLinks: autoBlockHighRiskLinks !== undefined ? autoBlockHighRiskLinks : true
    };

    res.json({
      status: 200,
      data: updatedSettings,
      message: 'リンクブロック設定を更新しました'
    });
  } catch (err) {
    next({ status: 500, message: 'リンクブロック設定の更新中にエラーが発生しました', details: err });
  }
};

// リンクブロック統計の取得
exports.getLinkBlockStats = (req, res, next) => {
  try {
    const { period = '24h' } = req.query;

    // 実際の実装ではデータベースから統計を取得
    const stats = {
      period,
      totalLinksDetected: 1247,
      blockedLinks: 89,
      suspiciousLinks: 156,
      allowedLinks: 1002,
      topBlockedDomains: [
        { domain: 'spam-site.com', count: 45 },
        { domain: 'bit.ly', count: 23 },
        { domain: 'malicious-link.net', count: 21 }
      ],
      topSuspiciousDomains: [
        { domain: 'free-gift.com', count: 34 },
        { domain: 'win-prize.net', count: 28 },
        { domain: 'cheap-deals.org', count: 19 }
      ],
      recentBlockedLinks: [
        {
          url: 'https://spam-site.com/free-money',
          domain: 'spam-site.com',
          detectedAt: new Date(Date.now() - 300000).toISOString(),
          reason: 'blocked_domain'
        },
        {
          url: 'https://bit.ly/3abc123',
          domain: 'bit.ly',
          detectedAt: new Date(Date.now() - 600000).toISOString(),
          reason: 'blocked_pattern'
        }
      ]
    };

    res.json({
      status: 200,
      data: stats,
      message: 'リンクブロック統計を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'リンクブロック統計の取得中にエラーが発生しました', details: err });
  }
};

// カスタムフィルタ設定の取得
exports.getCustomFilters = (req, res, next) => {
  try {
    // 実際の実装ではデータベースから設定を取得
    const customFilters = [
      {
        id: 'custom-spam-1',
        name: 'カスタムスパムフィルタ',
        patterns: ['広告', '宣伝', '無料プレゼント'],
        action: 'flag',
        severity: 'medium',
        enabled: true,
        caseSensitive: false,
        matchType: 'contains',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 'custom-regex-1',
        name: '正規表現フィルタ',
        patterns: [/follow.*back/i, /like.*subscribe/i],
        action: 'block',
        severity: 'high',
        enabled: true,
        caseSensitive: false,
        matchType: 'regex',
        createdAt: new Date(Date.now() - 43200000).toISOString(),
        updatedAt: new Date(Date.now() - 1800000).toISOString()
      }
    ];

    res.json({
      status: 200,
      data: {
        defaultFilters: [
          {
            id: 'spam-patterns',
            name: 'スパムパターン',
            description: '一般的なスパムパターンを検出',
            action: 'flag',
            severity: 'medium',
            enabled: true
          },
          {
            id: 'offensive-language',
            name: '不適切表現',
            description: '不適切な表現を検出',
            action: 'block',
            severity: 'high',
            enabled: true
          },
          {
            id: 'repeated-chars',
            name: '繰り返し文字',
            description: '過度な文字繰り返しを検出',
            action: 'flag',
            severity: 'low',
            enabled: true
          }
        ],
        customFilters: customFilters,
        totalFilters: 3 + customFilters.length
      },
      message: 'カスタムフィルタ設定を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'カスタムフィルタ設定の取得中にエラーが発生しました', details: err });
  }
};

// カスタムフィルタの作成
exports.createCustomFilter = (req, res, next) => {
  try {
    const {
      name,
      patterns,
      action,
      severity,
      caseSensitive,
      matchType,
      description
    } = req.body;

    // バリデーション
    if (!name || !patterns || !Array.isArray(patterns) || patterns.length === 0) {
      return next({ status: 400, message: 'フィルタ名とパターンは必須です' });
    }

    if (!['flag', 'block', 'allow'].includes(action)) {
      return next({ status: 400, message: 'actionはflag, block, allowのいずれかで指定してください' });
    }

    if (!['low', 'medium', 'high'].includes(severity)) {
      return next({ status: 400, message: 'severityはlow, medium, highのいずれかで指定してください' });
    }

    if (!['exact', 'contains', 'regex'].includes(matchType)) {
      return next({ status: 400, message: 'matchTypeはexact, contains, regexのいずれかで指定してください' });
    }

    // 実際の実装ではデータベースに保存
    const newFilter = {
      id: `custom-${Date.now()}`,
      name,
      description: description || '',
      patterns: patterns.map(p => typeof p === 'string' ? p : p.toString()),
      action,
      severity,
      enabled: true,
      caseSensitive: caseSensitive || false,
      matchType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res.json({
      status: 201,
      data: newFilter,
      message: 'カスタムフィルタを作成しました'
    });
  } catch (err) {
    next({ status: 500, message: 'カスタムフィルタの作成中にエラーが発生しました', details: err });
  }
};

// カスタムフィルタの更新
exports.updateCustomFilter = (req, res, next) => {
  try {
    const { filterId } = req.params;
    const updates = req.body;

    // バリデーション
    if (updates.action && !['flag', 'block', 'allow'].includes(updates.action)) {
      return next({ status: 400, message: 'actionはflag, block, allowのいずれかで指定してください' });
    }

    if (updates.severity && !['low', 'medium', 'high'].includes(updates.severity)) {
      return next({ status: 400, message: 'severityはlow, medium, highのいずれかで指定してください' });
    }

    if (updates.matchType && !['exact', 'contains', 'regex'].includes(updates.matchType)) {
      return next({ status: 400, message: 'matchTypeはexact, contains, regexのいずれかで指定してください' });
    }

    // 実際の実装ではデータベースを更新
    const updatedFilter = {
      id: filterId,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    res.json({
      status: 200,
      data: updatedFilter,
      message: 'カスタムフィルタを更新しました'
    });
  } catch (err) {
    next({ status: 500, message: 'カスタムフィルタの更新中にエラーが発生しました', details: err });
  }
};

// カスタムフィルタの削除
exports.deleteCustomFilter = (req, res, next) => {
  try {
    const { filterId } = req.params;

    // 実際の実装ではデータベースから削除
    res.json({
      status: 200,
      data: { filterId },
      message: 'カスタムフィルタを削除しました'
    });
  } catch (err) {
    next({ status: 500, message: 'カスタムフィルタの削除中にエラーが発生しました', details: err });
  }
};

// カスタムフィルタのテスト
exports.testCustomFilter = (req, res, next) => {
  try {
    const { content, filters } = req.body;

    if (!content) {
      return next({ status: 400, message: 'テストするコンテンツを指定してください' });
    }

    // 実際の実装では指定されたフィルタを適用してテスト
    const testResult = {
      content,
      matches: [
        {
          filterId: 'test-filter-1',
          filterName: 'テストフィルタ',
          matchedText: 'spam',
          action: 'flag',
          severity: 'medium'
        }
      ],
      hasMatches: true,
      recommendedAction: 'flag',
      score: 30
    };

    res.json({
      status: 200,
      data: testResult,
      message: 'フィルタテストが完了しました'
    });
  } catch (err) {
    next({ status: 500, message: 'フィルタテスト中にエラーが発生しました', details: err });
  }
};

// カスタムフィルタ統計の取得
exports.getCustomFilterStats = (req, res, next) => {
  try {
    const { period = '24h' } = req.query;

    // 実際の実装ではデータベースから統計を取得
    const stats = {
      period,
      totalMatches: 456,
      blockedByFilters: 123,
      flaggedByFilters: 89,
      topMatchingFilters: [
        { filterId: 'spam-patterns', filterName: 'スパムパターン', matches: 67 },
        { filterId: 'offensive-language', filterName: '不適切表現', matches: 45 },
        { filterId: 'custom-spam-1', filterName: 'カスタムスパムフィルタ', matches: 34 }
      ],
      recentMatches: [
        {
          filterId: 'spam-patterns',
          filterName: 'スパムパターン',
          matchedText: 'free money',
          content: 'Get free money now!',
          matchedAt: new Date(Date.now() - 180000).toISOString(),
          action: 'flag'
        },
        {
          filterId: 'offensive-language',
          filterName: '不適切表現',
          matchedText: 'damn',
          content: 'This is damn good!',
          matchedAt: new Date(Date.now() - 300000).toISOString(),
          action: 'block'
        }
      ]
    };

    res.json({
      status: 200,
      data: stats,
      message: 'カスタムフィルタ統計を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'カスタムフィルタ統計の取得中にエラーが発生しました', details: err });
  }
};

// 感情分析API
exports.analyzeSentiment = (req, res, next) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      return next({ status: 400, message: '有効なcontentを指定してください' });
    }

    // 実際の実装ではOpenAI/Google APIを使用
    // ここでは簡易的な分析を使用
    const sentimentKeywords = {
      positive: ['素晴らしい', 'すごい', '最高', '良い', '好き', '楽しい', '面白い', 'great', 'awesome', 'amazing', 'good', 'love', 'fun'],
      negative: ['最悪', '嫌い', 'つまらない', '悪い', '悲しい', '怒り', 'bad', 'terrible', 'hate', 'boring', 'sad', 'angry']
    };

    const lowerContent = content.toLowerCase();
    let positiveScore = 0;
    let negativeScore = 0;

    sentimentKeywords.positive.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = lowerContent.match(regex);
      if (matches) positiveScore += matches.length;
    });

    sentimentKeywords.negative.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = lowerContent.match(regex);
      if (matches) negativeScore += matches.length;
    });

    // 感情スコア計算（0-1）
    let score = 0.5;
    if (positiveScore > 0 || negativeScore > 0) {
      score = (positiveScore + 0.5) / (positiveScore + negativeScore + 1);
      score = Math.max(0, Math.min(1, score));
    }

    let sentiment;
    if (score > 0.7) sentiment = 'positive';
    else if (score < 0.3) sentiment = 'negative';
    else sentiment = 'neutral';

    const result = {
      content,
      sentiment,
      score: Math.round(score * 100) / 100,
      confidence: 0.85,
      keywords: {
        positive: positiveScore,
        negative: negativeScore
      },
      analysis: {
        totalWords: content.split(' ').length,
        hasEmoji: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(content),
        language: content.match(/[\u{3040}-\u{309F}\u{30A0}-\u{30FF}]/u) ? 'ja' : 'en'
      }
    };

    res.json({
      status: 200,
      data: result,
      message: '感情分析が完了しました'
    });
  } catch (err) {
    next({ status: 500, message: '感情分析中にエラーが発生しました', details: err });
  }
};

// 感情分析統計の取得
exports.getSentimentStats = (req, res, next) => {
  try {
    const { period = '24h', platform } = req.query;

    // 実際の実装ではデータベースから統計を取得
    const stats = {
      period,
      platform: platform || 'all',
      totalAnalyzed: 1247,
      sentimentBreakdown: {
        positive: 587,
        neutral: 498,
        negative: 162
      },
      averageScore: 0.62,
      trend: {
        positive: 47.1,
        neutral: 39.9,
        negative: 13.0
      },
      intensityBreakdown: {
        high: 234,
        medium: 456,
        low: 557
      },
      topPositiveKeywords: [
        { word: 'すごい', count: 89 },
        { word: '楽しい', count: 76 },
        { word: '面白い', count: 65 }
      ],
      topNegativeKeywords: [
        { word: 'つまらない', count: 34 },
        { word: '悪い', count: 28 },
        { word: '最悪', count: 19 }
      ],
      recentSentiments: [
        {
          content: '素晴らしい配信ですね！',
          sentiment: 'positive',
          score: 0.89,
          timestamp: new Date(Date.now() - 300000).toISOString()
        },
        {
          content: 'ちょっとつまらないかも',
          sentiment: 'negative',
          score: 0.21,
          timestamp: new Date(Date.now() - 600000).toISOString()
        }
      ]
    };

    res.json({
      status: 200,
      data: stats,
      message: '感情分析統計を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: '感情分析統計の取得中にエラーが発生しました', details: err });
  }
};

// AIチャットボットAPI
exports.generateChatbotResponse = (req, res, next) => {
  try {
    const { content, context, userId, platform } = req.body;

    if (!content || typeof content !== 'string') {
      return next({ status: 400, message: '有効なcontentを指定してください' });
    }

    // 実際の実装ではOpenAI APIやカスタムモデルを使用
    // ここでは簡易的な応答生成を使用

    // 基本的なキーワードベースの応答
    const lowerContent = content.toLowerCase();
    let response = '';
    let confidence = 0.5;
    let type = 'general';
    let category = 'unknown';

    // FAQ応答
    if (lowerContent.includes('schedule') || lowerContent.includes('スケジュール') || lowerContent.includes('時間')) {
      response = '配信スケジュールはダッシュボードの「スケジュール」タブで確認できます。毎週火曜日と金曜日の20時からです！';
      confidence = 0.9;
      type = 'faq';
      category = 'schedule';
    } else if (lowerContent.includes('ban') || lowerContent.includes('解除')) {
      response = 'ユーザーのBAN解除は「ユーザー管理」から対象ユーザーを選択して操作してください。';
      confidence = 0.8;
      type = 'faq';
      category = 'moderation';
    } else if (lowerContent.includes('setting') || lowerContent.includes('設定')) {
      response = '設定は右上のギアアイコンからアクセスできます。';
      confidence = 0.7;
      type = 'faq';
      category = 'settings';
    } else if (lowerContent.includes('donate') || lowerContent.includes('投げ銭')) {
      response = 'サポートありがとうございます！ https://streamlabs.com/streamer/tip';
      confidence = 0.9;
      type = 'recommendation';
      category = 'donation';
    } else if (lowerContent.includes('merch') || lowerContent.includes('グッズ')) {
      response = '公式グッズはこちらから！ https://store.streamer.com';
      confidence = 0.8;
      type = 'recommendation';
      category = 'merchandise';
    } else if (lowerContent.match(/^(hi|hello|hey|こんにちは|こんばんは)/i)) {
      const greetings = [
        'こんにちは！配信を見に来てくれてありがとう！',
        'Hello! Thanks for joining the stream!',
        'おはようございます！今日も一緒に楽しみましょう！'
      ];
      response = greetings[Math.floor(Math.random() * greetings.length)];
      confidence = 0.8;
      type = 'greeting';
      category = 'interaction';
    } else if (lowerContent.match(/^(thanks?|thank you|ありがとう)/i)) {
      const thanks = [
        'どういたしまして！引き続き楽しんでくださいね！',
        "You're welcome! Glad you're enjoying the stream!",
        'こちらこそありがとう！あなたのサポートが力になります！'
      ];
      response = thanks[Math.floor(Math.random() * thanks.length)];
      confidence = 0.8;
      type = 'thanks';
      category = 'interaction';
    } else {
      // デフォルト応答
      const defaults = [
        'ご質問ありがとうございます！詳しくはチャットで質問してくださいね。',
        'それは面白い質問です！配信中に答えさせていただきます。',
        'わかりました！その件については後ほど詳しくお話ししますね。'
      ];
      response = defaults[Math.floor(Math.random() * defaults.length)];
      confidence = 0.3;
      type = 'default';
      category = 'general';
    }

    const result = {
      content,
      response,
      confidence: Math.round(confidence * 100) / 100,
      type,
      category,
      context: context || {},
      userId,
      platform: platform || 'unknown',
      timestamp: new Date().toISOString(),
      suggestedActions: type === 'recommendation' ? ['view_link', 'interact'] : []
    };

    res.json({
      status: 200,
      data: result,
      message: 'チャットボット応答を生成しました'
    });
  } catch (err) {
    next({ status: 500, message: 'チャットボット応答生成中にエラーが発生しました', details: err });
  }
};

// チャットボット設定の取得
exports.getChatbotSettings = (req, res, next) => {
  try {
    // 実際の実装ではデータベースから設定を取得
    const chatbotSettings = {
      enabled: true,
      autoRespond: true,
      confidenceThreshold: 0.7,
      maxResponsesPerMinute: 10,
      supportedLanguages: ['ja', 'en'],
      customResponses: [
        {
          id: 'custom-1',
          trigger: 'schedule',
          response: '配信スケジュールは毎週火曜日と金曜日の20時からです！',
          enabled: true
        },
        {
          id: 'custom-2',
          trigger: 'discord',
          response: 'Discordサーバー: discord.gg/invite',
          enabled: true
        }
      ],
      personality: {
        tone: 'friendly',
        formality: 'casual',
        humor: 'moderate'
      },
      integration: {
        openai: false,
        customModel: false,
        fallbackToDefault: true
      }
    };

    res.json({
      status: 200,
      data: chatbotSettings,
      message: 'チャットボット設定を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'チャットボット設定の取得中にエラーが発生しました', details: err });
  }
};

// チャットボット設定の更新
exports.updateChatbotSettings = (req, res, next) => {
  try {
    const {
      enabled,
      autoRespond,
      confidenceThreshold,
      maxResponsesPerMinute,
      supportedLanguages,
      personality,
      integration
    } = req.body;

    // バリデーション
    if (typeof enabled !== 'boolean') {
      return next({ status: 400, message: 'enabledはboolean型で指定してください' });
    }

    if (confidenceThreshold !== undefined && (confidenceThreshold < 0 || confidenceThreshold > 1)) {
      return next({ status: 400, message: 'confidenceThresholdは0-1の範囲で指定してください' });
    }

    // 実際の実装ではデータベースに保存
    const updatedSettings = {
      enabled,
      autoRespond: autoRespond !== undefined ? autoRespond : true,
      confidenceThreshold: confidenceThreshold || 0.7,
      maxResponsesPerMinute: maxResponsesPerMinute || 10,
      supportedLanguages: supportedLanguages || ['ja', 'en'],
      personality: personality || { tone: 'friendly', formality: 'casual', humor: 'moderate' },
      integration: integration || { openai: false, customModel: false, fallbackToDefault: true }
    };

    res.json({
      status: 200,
      data: updatedSettings,
      message: 'チャットボット設定を更新しました'
    });
  } catch (err) {
    next({ status: 500, message: 'チャットボット設定の更新中にエラーが発生しました', details: err });
  }
};

// チャットボット統計の取得
exports.getChatbotStats = (req, res, next) => {
  try {
    const { period = '24h' } = req.query;

    // 実際の実装ではデータベースから統計を取得
    const stats = {
      period,
      totalInteractions: 892,
      successfulResponses: 756,
      failedResponses: 136,
      averageConfidence: 0.72,
      responseTypes: {
        faq: 234,
        recommendation: 156,
        greeting: 198,
        general: 168
      },
      topTriggers: [
        { trigger: 'schedule', count: 89 },
        { trigger: 'discord', count: 76 },
        { trigger: 'donate', count: 65 }
      ],
      recentInteractions: [
        {
          user: 'viewer123',
          input: '配信スケジュールは？',
          response: '配信スケジュールはダッシュボードの「スケジュール」タブで確認できます。',
          confidence: 0.9,
          timestamp: new Date(Date.now() - 300000).toISOString()
        },
        {
          user: 'fan456',
          input: 'グッズ買いたい',
          response: '公式グッズはこちらから！ https://store.streamer.com',
          confidence: 0.8,
          timestamp: new Date(Date.now() - 600000).toISOString()
        }
      ]
    };

    res.json({
      status: 200,
      data: stats,
      message: 'チャットボット統計を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'チャットボット統計の取得中にエラーが発生しました', details: err });
  }
};

// 翻訳API
// 従来はハードコードされたEN⇔JA語彙のモック（未収録語は"[from→to] text"という
// 機械翻訳風の偽装文字列を返すのみ）だった。openaiService.translateText()に
// 実際に動くLLMベースの翻訳が既に存在していたため、そちらへ配線し直した
// （docs/RESEARCH_IMPROVEMENTS.md R-10）。OpenAIキー未設定/失敗時は原文を
// available:false付きで返し、偽の翻訳結果を返さないようにする
exports.translateText = async (req, res, next) => {
  try {
    const { text, fromLang, toLang, quality = 'balanced' } = req.body;

    if (!text || typeof text !== 'string') {
      return next({ status: 400, message: '有効なtextを指定してください' });
    }

    if (!fromLang || !toLang) {
      return next({ status: 400, message: 'fromLangとtoLangを指定してください' });
    }

    const openaiService = require('../services/openaiService');
    const translation = await openaiService.translateText(text, toLang);

    const result = {
      originalText: text,
      translatedText: translation.translatedText,
      fromLanguage: fromLang,
      toLanguage: toLang,
      confidence: translation.error ? 0 : 0.9,
      quality,
      model: translation.model,
      available: !translation.error,
      timestamp: new Date().toISOString(),
      error: translation.error
    };

    res.json({
      status: 200,
      data: result,
      message: translation.error ? '翻訳サービスが利用できないため原文を返しました' : 'テキストを翻訳しました'
    });
  } catch (err) {
    next({ status: 500, message: '翻訳中にエラーが発生しました', details: err });
  }
};

// 自動翻訳API（言語検出は簡易版のまま維持、翻訳本体はopenaiServiceへ配線 — R-10）
exports.autoTranslate = async (req, res, next) => {
  try {
    const { text, targetLanguages = ['en'], quality = 'balanced' } = req.body;

    if (!text || typeof text !== 'string') {
      return next({ status: 400, message: '有効なtextを指定してください' });
    }

    const detectedLang = moderationService.detectLanguage(text).language;

    const openaiService = require('../services/openaiService');

    const translations = await Promise.all(targetLanguages.map(async (targetLang) => {
      if (detectedLang === targetLang) {
        return {
          targetLanguage: targetLang,
          translatedText: text,
          confidence: 1.0,
          skipped: true,
          reason: 'same_language'
        };
      }

      const translation = await openaiService.translateText(text, targetLang);

      return {
        targetLanguage: targetLang,
        translatedText: translation.translatedText,
        confidence: translation.error ? 0 : 0.9,
        quality,
        available: !translation.error,
        error: translation.error
      };
    }));

    const result = {
      originalText: text,
      detectedLanguage: detectedLang,
      translations,
      timestamp: new Date().toISOString()
    };

    res.json({
      status: 200,
      data: result,
      message: '自動翻訳が完了しました'
    });
  } catch (err) {
    next({ status: 500, message: '自動翻訳中にエラーが発生しました', details: err });
  }
};

// 翻訳設定の取得
exports.getTranslationSettings = (req, res, next) => {
  try {
    // 実際の実装ではデータベースから設定を取得
    const translationSettings = {
      enabled: true,
      autoDetectLanguage: true,
      defaultTargetLanguages: ['en'],
      quality: 'balanced',
      supportedLanguages: [
        'en', 'ja', 'zh', 'ko', 'es', 'fr', 'de', 'pt', 'ru', 'ar',
        'hi', 'th', 'vi', 'it', 'nl', 'sv', 'da', 'no', 'fi', 'pl', 'tr'
      ],
      apiSettings: {
        provider: 'google', // 'google', 'deepl', 'azure'
        apiKeyConfigured: false,
        rateLimitPerMinute: 30,
        cacheEnabled: true,
        cacheTTL: 3600
      },
      moderationSettings: {
        translateOffensiveContent: true,
        flagUntranslatableContent: false,
        autoModerateTranslatedContent: false
      }
    };

    res.json({
      status: 200,
      data: translationSettings,
      message: '翻訳設定を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: '翻訳設定の取得中にエラーが発生しました', details: err });
  }
};

// 翻訳設定の更新
exports.updateTranslationSettings = (req, res, next) => {
  try {
    const {
      enabled,
      autoDetectLanguage,
      defaultTargetLanguages,
      quality,
      apiSettings,
      moderationSettings
    } = req.body;

    // バリデーション
    if (typeof enabled !== 'boolean') {
      return next({ status: 400, message: 'enabledはboolean型で指定してください' });
    }

    if (quality && !['fast', 'balanced', 'high'].includes(quality)) {
      return next({ status: 400, message: 'qualityはfast, balanced, highのいずれかで指定してください' });
    }

    // 実際の実装ではデータベースに保存
    const updatedSettings = {
      enabled,
      autoDetectLanguage: autoDetectLanguage !== undefined ? autoDetectLanguage : true,
      defaultTargetLanguages: defaultTargetLanguages || ['en'],
      quality: quality || 'balanced',
      apiSettings: apiSettings || {
        provider: 'google',
        apiKeyConfigured: false,
        rateLimitPerMinute: 30,
        cacheEnabled: true,
        cacheTTL: 3600
      },
      moderationSettings: moderationSettings || {
        translateOffensiveContent: true,
        flagUntranslatableContent: false,
        autoModerateTranslatedContent: false
      }
    };

    res.json({
      status: 200,
      data: updatedSettings,
      message: '翻訳設定を更新しました'
    });
  } catch (err) {
    next({ status: 500, message: '翻訳設定の更新中にエラーが発生しました', details: err });
  }
};

// 翻訳統計の取得
exports.getTranslationStats = (req, res, next) => {
  try {
    const { period = '24h' } = req.query;

    // 実際の実装ではデータベースから統計を取得
    const stats = {
      period,
      totalTranslations: 1247,
      successfulTranslations: 1189,
      failedTranslations: 58,
      averageConfidence: 0.78,
      languagePairs: [
        { from: 'ja', to: 'en', count: 456 },
        { from: 'en', to: 'ja', count: 334 },
        { from: 'zh', to: 'en', count: 223 },
        { from: 'ko', to: 'en', count: 189 }
      ],
      topSourceLanguages: [
        { language: 'ja', count: 567 },
        { language: 'en', count: 423 },
        { language: 'zh', count: 156 },
        { language: 'ko', count: 101 }
      ],
      recentTranslations: [
        {
          originalText: 'こんにちは',
          translatedText: 'hello',
          fromLanguage: 'ja',
          toLanguage: 'en',
          confidence: 0.95,
          timestamp: new Date(Date.now() - 300000).toISOString()
        },
        {
          originalText: 'Thank you',
          translatedText: 'ありがとう',
          fromLanguage: 'en',
          toLanguage: 'ja',
          confidence: 0.92,
          timestamp: new Date(Date.now() - 600000).toISOString()
        }
      ],
      performance: {
        averageResponseTime: 0.8, // seconds
        cacheHitRate: 0.65,
        apiErrorRate: 0.02
      }
    };

    res.json({
      status: 200,
      data: stats,
      message: '翻訳統計を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: '翻訳統計の取得中にエラーが発生しました', details: err });
  }
};

// AIモデレーションAPI
exports.performAIModeration = async (req, res, next) => {
  try {
    const { content, provider = 'openai' } = req.body;

    if (!content || typeof content !== 'string') {
      return next({ status: 400, message: '有効なcontentを指定してください' });
    }

    if (provider !== 'openai') {
      return res.json({
        status: 200,
        data: {
          provider,
          available: false,
          content,
          error: `Provider "${provider}" is not yet implemented`
        },
        message: 'AIモデレーションを実行しました'
      });
    }

    const openaiService = require('../services/openaiService');
    const result = await openaiService.detectToxicContent(content);

    res.json({
      status: 200,
      data: {
        provider,
        available: !result.error,
        model: result.model,
        content,
        score: result.score || 0,
        categories: result.categories || {},
        flagged: result.isToxic || false,
        timestamp: new Date().toISOString(),
        error: result.error
      },
      message: 'AIモデレーションを実行しました'
    });
  } catch (err) {
    next({ status: 500, message: 'AIモデレーション実行中にエラーが発生しました', details: err });
  }
};

// 複数プロバイダーAIモデレーションAPI
exports.performMultiProviderAIModeration = async (req, res, next) => {
  try {
    const { content, providers = ['openai'] } = req.body;

    if (!content || typeof content !== 'string') {
      return next({ status: 400, message: '有効なcontentを指定してください' });
    }

    if (!Array.isArray(providers) || providers.length === 0) {
      return next({ status: 400, message: 'providersは配列で指定してください' });
    }

    const openaiService = require('../services/openaiService');
    const results = await Promise.all(providers.map(async (provider) => {
      if (provider !== 'openai') {
        return { provider, available: false, content, error: `Provider "${provider}" is not yet implemented` };
      }
      const result = await openaiService.detectToxicContent(content);
      return {
        provider,
        available: !result.error,
        model: result.model,
        content,
        score: result.score || 0,
        categories: result.categories || {},
        flagged: result.isToxic || false,
        error: result.error
      };
    }));

    const availableResults = results.filter(r => r.available);
    const aggregatedResult = {
      content,
      providers: results,
      aggregatedScore: availableResults.length
        ? availableResults.reduce((sum, r) => sum + r.score, 0) / availableResults.length
        : 0,
      overallFlagged: availableResults.some(r => r.flagged),
      consensusLevel: availableResults.length && availableResults.filter(r => r.flagged).length >= availableResults.length / 2 ? 'medium' : 'low',
      timestamp: new Date().toISOString()
    };

    res.json({
      status: 200,
      data: aggregatedResult,
      message: '複数プロバイダーAIモデレーションを実行しました'
    });
  } catch (err) {
    next({ status: 500, message: '複数プロバイダーAIモデレーション実行中にエラーが発生しました', details: err });
  }
};

// AIモデレーション設定の取得
exports.getAIModerationSettings = (req, res, next) => {
  try {
    // 実際の実装ではデータベースから設定を取得
    const aiSettings = {
      enabled: true,
      primaryProvider: 'openai',
      fallbackProviders: ['google', 'azure'],
      enabledProviders: ['openai', 'google'],
      confidenceThreshold: 0.7,
      autoModerateHighConfidence: true,
      requireConsensus: false,
      cacheEnabled: true,
      cacheTTL: 3600,
      rateLimitPerMinute: 60,
      apiKeys: {
        openai: false, // APIキーが設定されているかどうか
        google: false,
        azure: false
      },
      moderationCategories: {
        hate: { enabled: true, threshold: 0.8, action: 'block' },
        harassment: { enabled: true, threshold: 0.7, action: 'flag' },
        sexual: { enabled: true, threshold: 0.9, action: 'block' },
        violence: { enabled: true, threshold: 0.8, action: 'block' },
        'self-harm': { enabled: true, threshold: 0.9, action: 'block' }
      },
      integrationSettings: {
        combineWithRules: true,
        overrideRuleDecisions: false,
        logAllRequests: true,
        alertOnFailures: true
      }
    };

    res.json({
      status: 200,
      data: aiSettings,
      message: 'AIモデレーション設定を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'AIモデレーション設定の取得中にエラーが発生しました', details: err });
  }
};

// AIモデレーション設定の更新
exports.updateAIModerationSettings = (req, res, next) => {
  try {
    const {
      enabled,
      primaryProvider,
      fallbackProviders,
      enabledProviders,
      confidenceThreshold,
      autoModerateHighConfidence,
      requireConsensus,
      cacheEnabled,
      cacheTTL,
      rateLimitPerMinute,
      moderationCategories,
      integrationSettings
    } = req.body;

    // バリデーション
    if (typeof enabled !== 'boolean') {
      return next({ status: 400, message: 'enabledはboolean型で指定してください' });
    }

    if (primaryProvider && !['openai', 'google', 'azure'].includes(primaryProvider)) {
      return next({ status: 400, message: 'primaryProviderはopenai, google, azureのいずれかで指定してください' });
    }

    if (confidenceThreshold !== undefined && (confidenceThreshold < 0 || confidenceThreshold > 1)) {
      return next({ status: 400, message: 'confidenceThresholdは0-1の範囲で指定してください' });
    }

    // 実際の実装ではデータベースに保存
    const updatedSettings = {
      enabled,
      primaryProvider: primaryProvider || 'openai',
      fallbackProviders: fallbackProviders || [],
      enabledProviders: enabledProviders || ['openai'],
      confidenceThreshold: confidenceThreshold || 0.7,
      autoModerateHighConfidence: autoModerateHighConfidence !== undefined ? autoModerateHighConfidence : true,
      requireConsensus: requireConsensus || false,
      cacheEnabled: cacheEnabled !== undefined ? cacheEnabled : true,
      cacheTTL: cacheTTL || 3600,
      rateLimitPerMinute: rateLimitPerMinute || 60,
      moderationCategories: moderationCategories || {},
      integrationSettings: integrationSettings || {}
    };

    res.json({
      status: 200,
      data: updatedSettings,
      message: 'AIモデレーション設定を更新しました'
    });
  } catch (err) {
    next({ status: 500, message: 'AIモデレーション設定の更新中にエラーが発生しました', details: err });
  }
};

// AIモデレーション統計の取得
exports.getAIModerationStats = (req, res, next) => {
  try {
    const { period = '24h', provider } = req.query;

    // 実際の実装ではデータベースから統計を取得
    const stats = {
      period,
      provider: provider || 'all',
      totalRequests: 3456,
      successfulRequests: 3321,
      failedRequests: 135,
      averageScore: 0.23,
      averageConfidence: 0.78,
      flaggedContent: 789,
      blockedContent: 234,
      providerBreakdown: {
        openai: {
          requests: 1456,
          successRate: 0.96,
          averageScore: 0.25,
          flaggedRate: 0.22
        },
        google: {
          requests: 1234,
          successRate: 0.94,
          averageScore: 0.21,
          flaggedRate: 0.19
        },
        azure: {
          requests: 766,
          successRate: 0.92,
          averageScore: 0.24,
          flaggedRate: 0.25
        }
      },
      categoryBreakdown: {
        hate: { count: 456, averageScore: 0.67 },
        harassment: { count: 678, averageScore: 0.45 },
        sexual: { count: 234, averageScore: 0.78 },
        violence: { count: 345, averageScore: 0.56 },
        'self-harm': { count: 76, averageScore: 0.89 }
      },
      performance: {
        averageResponseTime: 0.45, // seconds
        cacheHitRate: 0.67,
        errorRate: 0.04,
        throughput: 120 // requests per minute
      },
      recentActivity: [
        {
          content: 'This is inappropriate content',
          provider: 'openai',
          score: 0.89,
          flagged: true,
          categories: { 'hate': 0.8, 'harassment': 0.6 },
          timestamp: new Date(Date.now() - 300000).toISOString()
        },
        {
          content: 'Normal conversation',
          provider: 'google',
          score: 0.12,
          flagged: false,
          categories: { 'toxicity': 0.1 },
          timestamp: new Date(Date.now() - 600000).toISOString()
        }
      ]
    };

    res.json({
      status: 200,
      data: stats,
      message: 'AIモデレーション統計を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'AIモデレーション統計の取得中にエラーが発生しました', details: err });
  }
};

// AIモデレーションAPIの状態チェック
exports.checkAIModerationStatus = (req, res, next) => {
  try {
    // APIキーの設定状態をチェック
    const status = {
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        available: true,
        lastChecked: new Date().toISOString()
      },
      google: {
        configured: !!process.env.GOOGLE_API_KEY,
        available: true,
        lastChecked: new Date().toISOString()
      },
      azure: {
        configured: !!process.env.AZURE_API_KEY,
        available: true,
        lastChecked: new Date().toISOString()
      },
      overall: {
        anyConfigured: !!(process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.AZURE_API_KEY),
        primaryAvailable: !!process.env.OPENAI_API_KEY,
        fallbackAvailable: !!(process.env.GOOGLE_API_KEY || process.env.AZURE_API_KEY)
      }
    };

    res.json({
      status: 200,
      data: status,
      message: 'AIモデレーションAPIの状態を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'AIモデレーションAPI状態チェック中にエラーが発生しました', details: err });
  }
};

// メッセージ保留設定の取得
exports.getMessageHoldSettings = (req, res, next) => {
  try {
    // 実際の実装ではデータベースから設定を取得
    const holdSettings = {
      enabled: true,
      holdConditions: {
        aiScoreThreshold: 0.6,
        suspiciousKeywords: ['urgent', 'emergency', 'winner', 'prize', 'million', 'billion'],
        maxLinksForHold: 2,
        repeatedCharsThreshold: 4,
        negativeSentimentThreshold: 0.8
      },
      holdDurations: {
        low_risk: 300,
        medium_risk: 1800,
        high_risk: 3600
      },
      autoActions: {
        autoApproveThreshold: 0.3,
        autoRejectThreshold: 0.9,
        enableAutoApprove: false,
        enableAutoReject: true
      },
      queueSettings: {
        maxQueueSize: 1000,
        cleanupIntervalHours: 24,
        autoCleanupEnabled: true
      },
      notificationSettings: {
        notifyOnHold: true,
        notifyOnExpire: true,
        notifyThreshold: 50 // キューが50件を超えたら通知
      }
    };

    res.json({
      status: 200,
      data: holdSettings,
      message: 'メッセージ保留設定を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'メッセージ保留設定の取得中にエラーが発生しました', details: err });
  }
};

// メッセージ保留設定の更新
exports.updateMessageHoldSettings = (req, res, next) => {
  try {
    const {
      enabled,
      holdConditions,
      holdDurations,
      autoActions,
      queueSettings,
      notificationSettings
    } = req.body;

    // バリデーション
    if (typeof enabled !== 'boolean') {
      return next({ status: 400, message: 'enabledはboolean型で指定してください' });
    }

    // 実際の実装ではデータベースに保存
    const updatedSettings = {
      enabled,
      holdConditions: holdConditions || {},
      holdDurations: holdDurations || {},
      autoActions: autoActions || {},
      queueSettings: queueSettings || {},
      notificationSettings: notificationSettings || {}
    };

    res.json({
      status: 200,
      data: updatedSettings,
      message: 'メッセージ保留設定を更新しました'
    });
  } catch (err) {
    next({ status: 500, message: 'メッセージ保留設定の更新中にエラーが発生しました', details: err });
  }
};

// 保留メッセージの取得（キュー表示）
const HELD_MESSAGE_SORT_COLUMNS = new Set(['created_at', 'risk_score', 'hold_until', 'status']);

const mapHeldMessageRow = (row) => ({
  id: row.id,
  messageId: row.message_id,
  content: row.content,
  user: row.user,
  platform: row.platform,
  holdReason: row.hold_reason,
  riskScore: row.risk_score,
  holdLevel: row.hold_level,
  holdUntil: row.hold_until,
  status: row.status,
  createdAt: row.created_at,
  processedAt: row.processed_at,
  processedBy: row.processed_by,
  reasons: row.reasons ? JSON.parse(row.reasons) : []
});

exports.getHeldMessages = async (req, res, next) => {
  try {
    const { status = 'pending', limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const sortColumn = HELD_MESSAGE_SORT_COLUMNS.has(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const whereClause = status === 'all' ? '' : 'WHERE status = ?';
    const whereParams = status === 'all' ? [] : [status];

    const rows = await dbAll(
      `SELECT * FROM held_messages ${whereClause} ORDER BY ${sortColumn} ${sortDirection} LIMIT ? OFFSET ?`,
      [...whereParams, safeLimit, safeOffset]
    );

    const countsByStatus = await dbAll(
      'SELECT status, COUNT(*) as cnt FROM held_messages GROUP BY status'
    );
    const counts = Object.fromEntries(countsByStatus.map(r => [r.status, r.cnt]));

    const messages = rows.map(mapHeldMessageRow);

    res.json({
      status: 200,
      data: {
        messages,
        total: messages.length,
        pending: counts.pending || 0,
        approved: counts.approved || 0,
        rejected: counts.rejected || 0,
        expired: counts.expired || 0,
        pagination: {
          limit: safeLimit,
          offset: safeOffset,
          hasMore: messages.length === safeLimit
        }
      },
      message: '保留メッセージを取得しました'
    });
  } catch (err) {
    next({ status: 500, message: '保留メッセージの取得中にエラーが発生しました', details: err });
  }
};

// 保留メッセージに対するアクション（承認/拒否）
exports.processHeldMessage = async (req, res, next) => {
  try {
    const { holdId } = req.params;
    const { action, reason, notes, moderator } = req.body;

    // バリデーション
    if (!['approve', 'reject', 'escalate'].includes(action)) {
      return next({ status: 400, message: 'actionはapprove, reject, escalateのいずれかで指定してください' });
    }

    const held = await dbGet('SELECT * FROM held_messages WHERE id = ?', [holdId]);
    if (!held) {
      return next({ status: 404, message: '保留メッセージが見つかりません' });
    }
    if (held.status !== 'pending') {
      return next({ status: 409, message: 'このメッセージは既に処理済みです' });
    }

    const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'escalated';
    const processedAt = new Date().toISOString();
    const moderatorId = moderator || req.user?.id || 'unknown';

    if (action === 'approve') {
      const { v4: uuidv4 } = require('uuid');
      await dbRun(
        `INSERT INTO comments (id, platform, user, content, timestamp, status, moderator)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [uuidv4(), held.platform, held.user, held.content, processedAt, moderatorId]
      );
    }

    await dbRun(
      `UPDATE held_messages
       SET status = ?, processed_at = ?, processed_by = ?, process_reason = ?, process_notes = ?
       WHERE id = ?`,
      [newStatus, processedAt, moderatorId, reason || '', notes || '', holdId]
    );

    res.json({
      status: 200,
      data: {
        holdId: parseInt(holdId, 10),
        action,
        reason: reason || '',
        notes: notes || '',
        moderator: moderatorId,
        processedAt
      },
      message: `メッセージを${action === 'approve' ? '承認' : action === 'reject' ? '拒否' : 'エスカレート'}しました`
    });
  } catch (err) {
    next({ status: 500, message: '保留メッセージの処理中にエラーが発生しました', details: err });
  }
};

// 保留メッセージの一括処理
exports.bulkProcessHeldMessages = async (req, res, next) => {
  try {
    const { holdIds, action, reason, notes, moderator } = req.body;

    // バリデーション
    if (!Array.isArray(holdIds) || holdIds.length === 0) {
      return next({ status: 400, message: 'holdIdsは配列で指定してください' });
    }
    if (holdIds.length > 200) {
      return next({ status: 400, message: 'holdIdsは最大200件までです' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return next({ status: 400, message: 'actionはapproveまたはrejectで指定してください' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const processedAt = new Date().toISOString();
    const moderatorId = moderator || req.user?.id || 'unknown';
    const { v4: uuidv4 } = require('uuid');

    let processed = 0;
    for (const holdId of holdIds) {
      const held = await dbGet('SELECT * FROM held_messages WHERE id = ? AND status = ?', [holdId, 'pending']);
      if (!held) continue;

      if (action === 'approve') {
        await dbRun(
          `INSERT INTO comments (id, platform, user, content, timestamp, status, moderator)
           VALUES (?, ?, ?, ?, ?, 'active', ?)`,
          [uuidv4(), held.platform, held.user, held.content, processedAt, moderatorId]
        );
      }

      await dbRun(
        `UPDATE held_messages
         SET status = ?, processed_at = ?, processed_by = ?, process_reason = ?, process_notes = ?
         WHERE id = ?`,
        [newStatus, processedAt, moderatorId, reason || '', notes || '', holdId]
      );
      processed++;
    }

    res.json({
      status: 200,
      data: {
        processed,
        requested: holdIds.length,
        action,
        reason: reason || '',
        notes: notes || '',
        moderator: moderatorId,
        processedAt
      },
      message: `${processed}件のメッセージを${action === 'approve' ? '承認' : '拒否'}しました`
    });
  } catch (err) {
    next({ status: 500, message: '保留メッセージの一括処理中にエラーが発生しました', details: err });
  }
};

// 保留メッセージの統計取得
exports.getMessageHoldStats = async (req, res, next) => {
  try {
    const { period = '24h' } = req.query;
    const periodHours = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 }[period] || 24;
    const since = new Date(Date.now() - periodHours * 3600000).toISOString();

    const [statusRows, reasonRows, levelRows, avgRow] = await Promise.all([
      dbAll('SELECT status, COUNT(*) as cnt FROM held_messages WHERE created_at >= ? GROUP BY status', [since]),
      dbAll('SELECT hold_reason, COUNT(*) as cnt FROM held_messages WHERE created_at >= ? GROUP BY hold_reason', [since]),
      dbAll('SELECT hold_level, COUNT(*) as cnt FROM held_messages WHERE created_at >= ? GROUP BY hold_level', [since]),
      dbGet(
        `SELECT AVG((julianday(processed_at) - julianday(created_at)) * 86400000) as avgMs
         FROM held_messages WHERE processed_at IS NOT NULL AND created_at >= ?`,
        [since]
      )
    ]);

    const queueStatus = { total: 0, pending: 0, approved: 0, rejected: 0, escalated: 0, expired: 0 };
    statusRows.forEach(r => { queueStatus[r.status] = r.cnt; queueStatus.total += r.cnt; });

    const holdReasons = {};
    reasonRows.forEach(r => { holdReasons[r.hold_reason || 'unknown'] = r.cnt; });

    const riskLevels = { low: 0, medium: 0, high: 0 };
    levelRows.forEach(r => { if (r.hold_level in riskLevels) riskLevels[r.hold_level] = r.cnt; });

    const approvalRate = (queueStatus.approved + queueStatus.rejected) > 0
      ? queueStatus.approved / (queueStatus.approved + queueStatus.rejected)
      : null;

    res.json({
      status: 200,
      data: {
        period,
        queueStatus,
        holdReasons,
        riskLevels,
        processingStats: {
          averageProcessingTimeMs: avgRow?.avgMs != null ? Math.round(avgRow.avgMs) : null,
          approvalRate
        }
      },
      message: 'メッセージ保留統計を取得しました'
    });
  } catch (err) {
    next({ status: 500, message: 'メッセージ保留統計の取得中にエラーが発生しました', details: err });
  }
};

// コメントごとのAI閾値設定
exports.setCommentAIThreshold = (req, res, next) => {
  const { id } = req.params;
  const {
    threshold,
    enabled,
    customSettings,
    reason
  } = req.body;

  const moderatorId = req.user?.id || 'system';

  // バリデーション
  const Joi = require('joi');
  const thresholdSchema = Joi.object({
    threshold: Joi.number().min(0).max(1).optional(),
    enabled: Joi.boolean().optional(),
    customSettings: Joi.object().optional(),
    reason: Joi.string().max(500).optional()
  });

  const { error, value } = thresholdSchema.validate({
    threshold,
    enabled,
    customSettings,
    reason
  });

  if (error) {
    return next({ status: 400, message: 'Invalid threshold settings', details: error.details });
  }

  // 現在の設定を取得
  db.get('SELECT ai_threshold_score, ai_threshold_enabled, ai_threshold_custom_settings FROM comments WHERE id = ?', [id], (err, current) => {
    if (err) {
      return next({ status: 500, message: 'Database error', details: err });
    }

    if (!current) {
      return next({ status: 404, message: 'Comment not found' });
    }

    // 更新するフィールドを構築
    const updateFields = [];
    const params = [];

    if (value.threshold !== undefined) {
      updateFields.push('ai_threshold_score = ?');
      params.push(value.threshold);
    }

    if (value.enabled !== undefined) {
      updateFields.push('ai_threshold_enabled = ?');
      params.push(value.enabled ? 1 : 0);
    }

    if (value.customSettings !== undefined) {
      updateFields.push('ai_threshold_custom_settings = ?');
      params.push(JSON.stringify(value.customSettings));
    }

    updateFields.push('ai_override_moderator_id = ?');
    params.push(moderatorId);

    updateFields.push('ai_override_timestamp = CURRENT_TIMESTAMP');
    params.push(id);

    if (updateFields.length <= 2) { // moderator_idとtimestamp以外に更新がない場合
      return next({ status: 400, message: 'No threshold settings to update' });
    }

    const sql = `UPDATE comments SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(sql, params, function(err) {
      if (err) {
        return next({ status: 500, message: 'Failed to update comment AI threshold', details: err });
      }

      // 履歴を記録
      const historySql = `
        INSERT INTO ai_threshold_history
        (comment_id, moderator_id, action, old_threshold, new_threshold, old_settings, new_settings, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(historySql, [
        id,
        moderatorId,
        'update',
        current.ai_threshold_score,
        value.threshold !== undefined ? value.threshold : current.ai_threshold_score,
        current.ai_threshold_custom_settings,
        value.customSettings !== undefined ? JSON.stringify(value.customSettings) : current.ai_threshold_custom_settings,
        value.reason || 'Manual threshold adjustment'
      ], function(histErr) {
        if (histErr) {
          logger.warn('[AI Threshold] Failed to record history:', histErr);
        }

        res.json({
          status: 200,
          data: {
            commentId: id,
            threshold: value.threshold !== undefined ? value.threshold : current.ai_threshold_score,
            enabled: value.enabled !== undefined ? value.enabled : Boolean(current.ai_threshold_enabled),
            customSettings: value.customSettings !== undefined ? value.customSettings : (current.ai_threshold_custom_settings ? JSON.parse(current.ai_threshold_custom_settings) : null),
            moderatorId,
            overrideTimestamp: new Date().toISOString()
          },
          message: 'Comment AI threshold updated'
        });
      });
    });
  });
};

// コメントごとのAI閾値取得
exports.getCommentAIThreshold = (req, res, next) => {
  const { id } = req.params;

  const sql = `
    SELECT
      ai_threshold_score,
      ai_threshold_enabled,
      ai_threshold_custom_settings,
      ai_override_moderator_id,
      ai_override_timestamp
    FROM comments WHERE id = ?
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      return next({ status: 500, message: 'Database error', details: err });
    }

    if (!row) {
      return next({ status: 404, message: 'Comment not found' });
    }

    res.json({
      status: 200,
      data: {
        threshold: row.ai_threshold_score || 0.5,
        enabled: Boolean(row.ai_threshold_enabled),
        customSettings: row.ai_threshold_custom_settings ? JSON.parse(row.ai_threshold_custom_settings) : null,
        lastModifiedBy: row.ai_override_moderator_id,
        lastModifiedAt: row.ai_override_timestamp
      },
      message: 'Comment AI threshold retrieved'
    });
  });
};

// ユーザーのデフォルトAI閾値設定
exports.setUserDefaultAIThreshold = (req, res, next) => {
  const { id } = req.params;
  const {
    threshold,
    enabled,
    settings,
    reason
  } = req.body;

  const moderatorId = req.user?.id || 'system';

  // バリデーション
  const Joi = require('joi');
  const userThresholdSchema = Joi.object({
    threshold: Joi.number().min(0).max(1).optional(),
    enabled: Joi.boolean().optional(),
    settings: Joi.object().optional(),
    reason: Joi.string().max(500).optional()
  });

  const { error, value } = userThresholdSchema.validate({
    threshold,
    enabled,
    settings,
    reason
  });

  if (error) {
    return next({ status: 400, message: 'Invalid user threshold settings', details: error.details });
  }

  // 現在の設定を取得
  db.get('SELECT ai_default_threshold, ai_threshold_enabled, ai_threshold_settings FROM users WHERE id = ?', [id], (err, current) => {
    if (err) {
      return next({ status: 500, message: 'Database error', details: err });
    }

    if (!current) {
      return next({ status: 404, message: 'User not found' });
    }

    // 更新するフィールドを構築
    const updateFields = [];
    const params = [];

    if (value.threshold !== undefined) {
      updateFields.push('ai_default_threshold = ?');
      params.push(value.threshold);
    }

    if (value.enabled !== undefined) {
      updateFields.push('ai_threshold_enabled = ?');
      params.push(value.enabled ? 1 : 0);
    }

    if (value.settings !== undefined) {
      updateFields.push('ai_threshold_settings = ?');
      params.push(JSON.stringify(value.settings));
    }

    params.push(id);

    if (updateFields.length === 0) {
      return next({ status: 400, message: 'No threshold settings to update' });
    }

    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(sql, params, function(err) {
      if (err) {
        return next({ status: 500, message: 'Failed to update user default AI threshold', details: err });
      }

      // 履歴を記録
      const historySql = `
        INSERT INTO ai_threshold_history
        (user_id, moderator_id, action, old_threshold, new_threshold, old_settings, new_settings, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(historySql, [
        id,
        moderatorId,
        'update',
        current.ai_default_threshold,
        value.threshold !== undefined ? value.threshold : current.ai_default_threshold,
        current.ai_threshold_settings,
        value.settings !== undefined ? JSON.stringify(value.settings) : current.ai_threshold_settings,
        value.reason || 'Manual threshold adjustment'
      ], function(histErr) {
        if (histErr) {
          logger.warn('[AI Threshold] Failed to record user history:', histErr);
        }

        res.json({
          status: 200,
          data: {
            userId: id,
            threshold: value.threshold !== undefined ? value.threshold : current.ai_default_threshold,
            enabled: value.enabled !== undefined ? value.enabled : Boolean(current.ai_threshold_enabled),
            settings: value.settings !== undefined ? value.settings : (current.ai_threshold_settings ? JSON.parse(current.ai_threshold_settings) : null),
            moderatorId
          },
          message: 'User default AI threshold updated'
        });
      });
    });
  });
};

// AI閾値設定のバッチ更新
exports.batchUpdateAIThreshold = (req, res, next) => {
  const { updates, reason } = req.body;
  const moderatorId = req.user?.id || 'system';

  if (!Array.isArray(updates) || updates.length === 0) {
    return next({ status: 400, message: 'Updates array is required and must not be empty' });
  }

  if (updates.length > 100) {
    return next({ status: 400, message: 'Maximum 100 updates allowed per batch' });
  }

  // バリデーション
  const Joi = require('joi');
  const updateSchema = Joi.object({
    commentId: Joi.string().required(),
    threshold: Joi.number().min(0).max(1).optional(),
    enabled: Joi.boolean().optional(),
    customSettings: Joi.object().optional()
  });

  const errors = [];
  const validUpdates = [];

  updates.forEach((update, index) => {
    const { error, value } = updateSchema.validate(update);
    if (error) {
      errors.push({ index, message: error.details[0].message });
    } else {
      validUpdates.push(value);
    }
  });

  if (errors.length > 0) {
    return next({ status: 400, message: 'Invalid updates', details: errors });
  }

  // バッチ更新を実行
  let completed = 0;
  let failed = 0;
  const results = [];

  const processUpdate = (update) => {
    return new Promise((resolve, reject) => {
      // 現在の設定を取得
      db.get('SELECT ai_threshold_score, ai_threshold_enabled, ai_threshold_custom_settings FROM comments WHERE id = ?',
        [update.commentId], (err, current) => {
        if (err || !current) {
          failed++;
          results.push({ commentId: update.commentId, success: false, error: 'Comment not found' });
          return resolve();
        }

        // 更新を実行
        const updateFields = [];
        const params = [];

        if (update.threshold !== undefined) {
          updateFields.push('ai_threshold_score = ?');
          params.push(update.threshold);
        }

        if (update.enabled !== undefined) {
          updateFields.push('ai_threshold_enabled = ?');
          params.push(update.enabled ? 1 : 0);
        }

        if (update.customSettings !== undefined) {
          updateFields.push('ai_threshold_custom_settings = ?');
          params.push(JSON.stringify(update.customSettings));
        }

        updateFields.push('ai_override_moderator_id = ?');
        params.push(moderatorId);

        updateFields.push('ai_override_timestamp = CURRENT_TIMESTAMP');
        params.push(update.commentId);

        if (updateFields.length > 2) { // moderator_idとtimestamp以外に更新がある場合
          const sql = `UPDATE comments SET ${updateFields.join(', ')} WHERE id = ?`;

          db.run(sql, params, function(err) {
            if (err) {
              failed++;
              results.push({ commentId: update.commentId, success: false, error: err.message });
            } else {
              completed++;
              results.push({ commentId: update.commentId, success: true });

              // 履歴を記録
              const historySql = `
                INSERT INTO ai_threshold_history
                (comment_id, moderator_id, action, old_threshold, new_threshold, old_settings, new_settings, reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `;

              db.run(historySql, [
                update.commentId,
                moderatorId,
                'batch_update',
                current.ai_threshold_score,
                update.threshold !== undefined ? update.threshold : current.ai_threshold_score,
                current.ai_threshold_custom_settings,
                update.customSettings !== undefined ? JSON.stringify(update.customSettings) : current.ai_threshold_custom_settings,
                reason || 'Batch threshold update'
              ]);
            }
            resolve();
          });
        } else {
          failed++;
          results.push({ commentId: update.commentId, success: false, error: 'No changes to update' });
          resolve();
        }
      });
    });
  };

  // すべての更新を順次実行
  const promises = validUpdates.map(processUpdate);

  Promise.all(promises).then(() => {
    res.json({
      status: 200,
      data: {
        total: updates.length,
        completed,
        failed,
        results
      },
      message: `Batch update completed: ${completed} succeeded, ${failed} failed`
    });
  }).catch(err => {
    next({ status: 500, message: 'Batch update failed', details: err });
  });
};
