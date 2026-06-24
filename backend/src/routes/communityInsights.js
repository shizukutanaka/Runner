/**
 * Community Insights API Routes
 *
 * ソクラテス式問答から生まれた6つの新視点を提供するエンドポイント:
 *   1. 炎上リスクスコア（感情伝播）
 *   2. コミュニティ健全性スコア
 *   3. コンテキスト認識分析
 *   4. クリエイター文化プロファイル（チャンネルごとの許容度）
 *   5. サイレント離脱検知（常連の沈黙 = 衰退の最初の警告）
 *   6. モデレーター・トリアージ（医療的緊急度分類）
 */

const express   = require('express');
const router    = express.Router();
const detector  = require('../services/emotionalContagionDetector');
const health    = require('../services/communityHealthService');
const culture   = require('../services/creatorCultureService');
const departure = require('../services/silentDepartureDetector');
const triage    = require('../services/moderatorTriageService');
const logger    = require('../logger');

// ─────────────────────────────────────────
// 1. 炎上リスクスコア取得
//    GET /api/insights/risk/:platform/:channelId
// ─────────────────────────────────────────
router.get('/risk/:platform/:channelId', (req, res) => {
  try {
    const { platform, channelId } = req.params;

    const result = detector.evaluate(platform, channelId);
    res.json({ status: 200, data: result });

  } catch (err) {
    logger.error('[CommunityInsights] Risk evaluation error:', err);
    res.status(500).json({ status: 500, message: 'リスク評価に失敗しました' });
  }
});

// ─────────────────────────────────────────
// 2. コメントを炎上検知エンジンに取り込む
//    POST /api/insights/ingest
// ─────────────────────────────────────────
router.post('/ingest', (req, res) => {
  try {
    const comment = req.body;

    if (!comment || !comment.platform || !comment.content) {
      return res.status(400).json({
        status:  400,
        message: 'platform と content は必須です'
      });
    }

    const result = detector.ingest(comment);
    res.json({ status: 200, data: result });

  } catch (err) {
    logger.error('[CommunityInsights] Ingest error:', err);
    res.status(500).json({ status: 500, message: '取り込みに失敗しました' });
  }
});

// ─────────────────────────────────────────
// 3. チャンネルの健全性サマリー
//    GET /api/insights/health-summary/:platform/:channelId
// ─────────────────────────────────────────
router.get('/health-summary/:platform/:channelId', (req, res) => {
  try {
    const { platform, channelId } = req.params;
    const summary = detector.getHealthSummary(platform, channelId);

    if (!summary) {
      return res.json({
        status: 200,
        data: null,
        message: 'データが不足しています。コメントが蓄積されると表示されます。'
      });
    }

    res.json({ status: 200, data: summary });

  } catch (err) {
    logger.error('[CommunityInsights] Health summary error:', err);
    res.status(500).json({ status: 500, message: '健全性サマリーの取得に失敗しました' });
  }
});

// ─────────────────────────────────────────
// 4. コミュニティ健全性スコア（コメント配列から計算）
//    POST /api/insights/health-score
// ─────────────────────────────────────────
router.post('/health-score', (req, res) => {
  try {
    const { comments, windowSize } = req.body;

    if (!Array.isArray(comments)) {
      return res.status(400).json({
        status:  400,
        message: 'comments は配列で指定してください'
      });
    }

    // 入力サイズ制限（DoS対策）
    if (comments.length > 1000) {
      return res.status(400).json({
        status: 400,
        message: 'comments は最大1000件までです'
      });
    }

    const report = health.calculateHealth(comments, { windowSize });
    res.json({ status: 200, data: report });

  } catch (err) {
    logger.error('[CommunityInsights] Health score error:', err);
    res.status(500).json({ status: 500, message: '健全性スコアの計算に失敗しました' });
  }
});

// ─────────────────────────────────────────
// 5. コンテキスト認識コメント分析
//    POST /api/insights/context-analysis
//    直近N件の流れを踏まえてコメントを評価
// ─────────────────────────────────────────
router.post('/context-analysis', async (req, res) => {
  try {
    const { targetComment, contextComments = [] } = req.body;

    if (!targetComment || !targetComment.content) {
      return res.status(400).json({
        status:  400,
        message: 'targetComment.content は必須です'
      });
    }

    // 入力サイズ制限（DoS対策）
    if (contextComments.length > 200) {
      return res.status(400).json({
        status: 400,
        message: 'contextComments は最大200件までです'
      });
    }

    // 文脈なしの単純スコア
    const baseScore = _simpleSentimentScore(targetComment.content);

    // 文脈ありの調整スコア
    const contextScore = _contextAdjustedScore(targetComment, contextComments);

    // 文脈によって判断が変わる度合い（≒ コンテキスト依存度）
    const contextDependency = Math.abs(contextScore - baseScore);

    res.json({
      status: 200,
      data: {
        targetComment: targetComment.content,
        baseScore:          Math.round(baseScore       * 100) / 100,
        contextAdjusted:    Math.round(contextScore    * 100) / 100,
        contextDependency:  Math.round(contextDependency * 100) / 100,
        verdict: contextScore > 0.5 ? 'safe' : contextScore > 0.3 ? 'uncertain' : 'risky',
        insight: _contextInsight(baseScore, contextScore, contextComments.length),
        contextSize: contextComments.length,
        timestamp: new Date().toISOString(),
      }
    });

  } catch (err) {
    logger.error('[CommunityInsights] Context analysis error:', err);
    res.status(500).json({ status: 500, message: 'コンテキスト分析に失敗しました' });
  }
});

// ─────────────────────────────────────────
// 内部ヘルパー
// ─────────────────────────────────────────

// ルールベースのシンプルなセンチメントスコア（AIなしで高速）
function _simpleSentimentScore(text) {
  // 入力長制限（ReDoS対策）
  if (!text || text.length > 10000) {
    return 0.5; // 中立スコア
  }

  const pos = /すごい|最高|good|great|love|nice|thanks|ありがとう|楽しい|好き|笑|ｗ|草/i;
  const neg = /最悪|ひどい|bad|hate|クソ|うざい|死|消えろ|バカ|アホ|stupid/i;
  if (pos.test(text) && !neg.test(text)) return 0.75;
  if (neg.test(text) && !pos.test(text)) return 0.2;
  if (neg.test(text) && pos.test(text)) return 0.45;
  return 0.55;
}

// 文脈を考慮したスコア調整
function _contextAdjustedScore(target, context) {
  const base = _simpleSentimentScore(target.content);
  if (context.length === 0) return base;

  const contextSentiments = context.map(c => _simpleSentimentScore(c.content ?? ''));
  const avgContext = contextSentiments.reduce((a, b) => a + b, 0) / contextSentiments.length;

  // コンテキストが悪い（炎上中）なら、通常のコメントも低く評価
  // コンテキストが良い（盛り上がり中）なら、若干ネガティブなコメントは緩和
  const contextEffect = (avgContext - 0.5) * 0.3;
  return Math.max(0, Math.min(1, base + contextEffect));
}

function _contextInsight(base, adjusted, contextSize) {
  if (contextSize === 0) {
    return '文脈なしで評価しました。前後のコメントを提供するとより正確です。';
  }
  const diff = adjusted - base;
  if (Math.abs(diff) < 0.05) {
    return 'このコメントは前後の文脈に左右されない独立した内容です。';
  }
  if (diff > 0) {
    return `周囲の雰囲気（ポジティブ）を考慮するとスコアが ${Math.round(diff * 100)}pt 上昇しました。`;
  }
  return `周囲の雰囲気（ネガティブ傾向）を考慮するとスコアが ${Math.round(Math.abs(diff) * 100)}pt 低下しました。炎上連鎖に注意してください。`;
}

// ─────────────────────────────────────────
// 6. クリエイター文化プロファイル取得
//    GET /api/insights/culture/:platform/:channelId
// ─────────────────────────────────────────
router.get('/culture/:platform/:channelId', (req, res) => {
  try {
    const { platform, channelId } = req.params;
    const profile = culture.getProfile(platform, channelId);
    res.json({ status: 200, data: profile });
  } catch (err) {
    logger.error('[CommunityInsights] Culture get error:', err);
    res.status(500).json({ status: 500, message: '文化プロファイルの取得に失敗しました' });
  }
});

// ─────────────────────────────────────────
// 7. クリエイター文化プロファイル設定
//    PUT /api/insights/culture/:platform/:channelId
// ─────────────────────────────────────────
router.put('/culture/:platform/:channelId', (req, res) => {
  try {
    const { platform, channelId } = req.params;
    const { cultureType, customOverrides = {} } = req.body;

    if (!cultureType) {
      return res.status(400).json({
        status:  400,
        message: 'cultureType は必須です（family/educational/entertainment/gaming/mature）'
      });
    }

    const profile = culture.setProfile(platform, channelId, cultureType, customOverrides);
    res.json({ status: 200, data: profile });
  } catch (err) {
    logger.error('[CommunityInsights] Culture set error:', err);
    const status = err.message?.includes('Unknown culture type') ? 400 : 500;
    res.status(status).json({ status, message: err.message });
  }
});

// ─────────────────────────────────────────
// 8. 文化プリセット一覧
//    GET /api/insights/culture-presets
// ─────────────────────────────────────────
router.get('/culture-presets', (req, res) => {
  try {
    res.json({ status: 200, data: culture.listPresets() });
  } catch (err) {
    logger.error('[CommunityInsights] Culture presets error:', err);
    res.status(500).json({ status: 500, message: 'プリセット一覧の取得に失敗しました' });
  }
});

// ─────────────────────────────────────────
// 9. モデレーションスコアを文化調整
//    POST /api/insights/culture-adjust
// ─────────────────────────────────────────
router.post('/culture-adjust', (req, res) => {
  try {
    const { platform, channelId, rawScore, context = {} } = req.body;

    if (rawScore == null || typeof rawScore !== 'number') {
      return res.status(400).json({
        status:  400,
        message: 'rawScore（数値）は必須です'
      });
    }

    const result = culture.adjustScore(platform ?? 'youtube', channelId ?? 'default', rawScore, context);
    res.json({ status: 200, data: result });
  } catch (err) {
    logger.error('[CommunityInsights] Culture adjust error:', err);
    res.status(500).json({ status: 500, message: 'スコア調整に失敗しました' });
  }
});

// ─────────────────────────────────────────
// 10. サイレント離脱検知
//     GET /api/insights/silent-departure/:platform/:channelId
// ─────────────────────────────────────────
router.get('/silent-departure/:platform/:channelId', (req, res) => {
  try {
    const { platform, channelId } = req.params;
    const result = departure.analyze(platform, channelId);
    res.json({ status: 200, data: result });
  } catch (err) {
    logger.error('[CommunityInsights] Silent departure error:', err);
    res.status(500).json({ status: 500, message: 'サイレント離脱分析に失敗しました' });
  }
});

// ─────────────────────────────────────────
// 11. コメントアクティビティを離脱検知エンジンに記録
//     POST /api/insights/record-activity
// ─────────────────────────────────────────
router.post('/record-activity', (req, res) => {
  try {
    const { platform, channelId, userId, timestamp } = req.body;

    if (!platform || !userId) {
      return res.status(400).json({
        status:  400,
        message: 'platform と userId は必須です'
      });
    }

    departure.record(platform, channelId ?? 'default', userId, timestamp);
    res.json({ status: 200, data: { recorded: true } });
  } catch (err) {
    logger.error('[CommunityInsights] Record activity error:', err);
    res.status(500).json({ status: 500, message: 'アクティビティ記録に失敗しました' });
  }
});

// ─────────────────────────────────────────
// 12. モデレーター・トリアージキュー
//     POST /api/insights/triage
// ─────────────────────────────────────────
router.post('/triage', (req, res) => {
  try {
    const { pendingComments = [], channelContext = {}, options = {} } = req.body;

    if (!Array.isArray(pendingComments)) {
      return res.status(400).json({
        status:  400,
        message: 'pendingComments は配列で指定してください'
      });
    }

    // 入力サイズ制限（DoS対策）
    if (pendingComments.length > 500) {
      return res.status(400).json({
        status: 400,
        message: 'pendingComments は最大500件までです'
      });
    }

    const result = triage.triage(pendingComments, channelContext, options);
    res.json({ status: 200, data: result });
  } catch (err) {
    logger.error('[CommunityInsights] Triage error:', err);
    res.status(500).json({ status: 500, message: 'トリアージに失敗しました' });
  }
});

module.exports = router;
