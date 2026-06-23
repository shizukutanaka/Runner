/**
 * Community Insights API Routes
 *
 * ソクラテス式問答から生まれた3つの新視点を提供するエンドポイント:
 *   1. 炎上リスクスコア（感情伝播）
 *   2. コミュニティ健全性スコア
 *   3. コンテキスト認識分析
 */

const express  = require('express');
const router   = express.Router();
const detector = require('../services/emotionalContagionDetector');
const health   = require('../services/communityHealthService');
const logger   = require('../logger');

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

module.exports = router;
