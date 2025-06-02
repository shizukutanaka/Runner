const moderationService = require('../services/moderationService');

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
