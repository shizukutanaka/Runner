/**
 * Moderator Triage Service（モデレーター・トリアージ）
 *
 * 【ソクラテス式問答から生まれた視点】
 * Q: 「モデレーターはどこから手をつけるべきか？」
 * A: 「全ての通報コメントを順番に見る」
 * Q: 「緊急案件と通常案件を同じキューに並べるのか？
 *       救急病院で医師は患者を到着順に診るか？」
 * → 発見: 医療のトリアージ概念をコメントモデレーションに適用すべき
 *
 * Q: 「最も有害なコメントを先に見ればよいのでは？」
 * Q: 「毒性スコアが高くても、すでに炎上が収束していたら？
 *       逆に低スコアでも拡散中なら緊急では？」
 * → 新視点: 毒性単体でなく「状況の緊急性」で分類する
 *
 * トリアージ4段階（医療ERモデルを援用）:
 *   🔴 EMERGENCY  — 今すぐ介入（炎上拡大中・バイラル・重大違反）
 *   🟠 URGENT     — 30分以内に対応（悪化傾向・繰り返し違反者）
 *   🟡 ROUTINE    — 通常業務（個別の問題コメント）
 *   🟢 CAN_WAIT   — 余裕時に確認（低リスク・自動解決可能性あり）
 */

const logger = require('../logger');

// ─── 優先度スコアの重み ──────────────────────────────────
const PRIORITY_WEIGHTS = {
  toxicity:        0.25,  // 毒性そのもの
  spreadRisk:      0.30,  // 拡散リスク（返信数・類似コメント数）
  riskTrend:       0.25,  // チャンネルリスクレベル（炎上中かどうか）
  recidivism:      0.15,  // 繰り返し違反者
  impactMultiplier: 0.05, // 投稿者の影響力（Super Chat・常連度）
};

// ─── トリアージレベル定義 ──────────────────────────────
const TRIAGE_LEVELS = {
  EMERGENCY: {
    id:          'EMERGENCY',
    label:       '緊急',
    color:       '#d32f2f',
    icon:        '🔴',
    description: '今すぐ介入が必要。炎上拡大中または重大規約違反',
    slaMinutes:  5,
  },
  URGENT: {
    id:          'URGENT',
    label:       '要対応',
    color:       '#f57c00',
    icon:        '🟠',
    description: '30分以内に対応。悪化傾向または繰り返し違反',
    slaMinutes:  30,
  },
  ROUTINE: {
    id:          'ROUTINE',
    label:       '通常',
    color:       '#f9a825',
    icon:        '🟡',
    description: '通常業務での対応で十分',
    slaMinutes:  240,
  },
  CAN_WAIT: {
    id:          'CAN_WAIT',
    label:       '低優先',
    color:       '#388e3c',
    icon:        '🟢',
    description: '余裕時に確認。自動処理で解決可能かもしれない',
    slaMinutes:  1440,
  },
};

class ModeratorTriageService {

  /**
   * コメントリストをトリアージ分類する
   *
   * @param {Object[]} pendingComments  - 対応待ちコメント配列
   * @param {Object}   channelContext   - チャンネルの現在状態
   *   channelContext.riskLevel         - 'safe'|'watch'|'warning'|'critical'
   *   channelContext.riskScore         - 0–1
   *   channelContext.departureRisk     - 0–1（常連離脱リスク）
   * @param {Object}   options
   * @returns {Object} トリアージ結果
   */
  triage(pendingComments = [], channelContext = {}, options = {}) {
    if (pendingComments.length === 0) {
      return this._emptyResult();
    }

    const scored = pendingComments.map(comment =>
      this._scoreComment(comment, channelContext)
    );

    const queues = {
      EMERGENCY: [],
      URGENT:    [],
      ROUTINE:   [],
      CAN_WAIT:  [],
    };

    for (const item of scored) {
      queues[item.triageLevel].push(item);
    }

    // 各キュー内はスコア降順でソート
    for (const level of Object.keys(queues)) {
      queues[level].sort((a, b) => b.priorityScore - a.priorityScore);
    }

    const totalPending = pendingComments.length;
    const emergencyCount = queues.EMERGENCY.length;

    return {
      queues,
      summary: {
        total:     totalPending,
        emergency: emergencyCount,
        urgent:    queues.URGENT.length,
        routine:   queues.ROUTINE.length,
        canWait:   queues.CAN_WAIT.length,
      },
      channelRisk:    channelContext.riskLevel ?? 'safe',
      insight:        this._insight(queues, channelContext),
      suggestedFocus: this._suggestedFocus(queues, channelContext),
      levels:         TRIAGE_LEVELS,
      timestamp:      new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────
  // 個別コメントの優先度スコア計算
  // ─────────────────────────────────────────
  _scoreComment(comment, channelContext) {
    // 毒性成分（0–1）
    const toxicity = Math.max(
      comment.toxicityScore   ?? 0,
      comment.moderationScore ? comment.moderationScore / 100 : 0,
      this._keywordToxicity(comment.content ?? '')
    );

    // 拡散リスク（返信・類似コメントの多さ）
    const spreadRisk = this._spreadRisk(comment);

    // チャンネルリスクトレンド
    const riskTrend = this._channelRiskScore(channelContext);

    // 繰り返し違反者スコア
    const recidivism = this._recidivismScore(comment);

    // 影響力（Super Chat・常連・多フォロワー）
    const impactMultiplier = this._impactScore(comment);

    // 加重合計
    const priorityScore = Math.min(1,
      toxicity         * PRIORITY_WEIGHTS.toxicity        +
      spreadRisk       * PRIORITY_WEIGHTS.spreadRisk       +
      riskTrend        * PRIORITY_WEIGHTS.riskTrend        +
      recidivism       * PRIORITY_WEIGHTS.recidivism       +
      impactMultiplier * PRIORITY_WEIGHTS.impactMultiplier
    );

    const triageLevel = this._classifyLevel(priorityScore, channelContext, comment, toxicity);

    return {
      commentId:     comment.id,
      content:       comment.content,
      user:          comment.user,
      platform:      comment.platform,
      timestamp:     comment.timestamp,
      priorityScore: Math.round(priorityScore * 100) / 100,
      triageLevel,
      triageMeta:    TRIAGE_LEVELS[triageLevel],
      signals: {
        toxicity:         Math.round(toxicity         * 100) / 100,
        spreadRisk:       Math.round(spreadRisk       * 100) / 100,
        riskTrend:        Math.round(riskTrend        * 100) / 100,
        recidivism:       Math.round(recidivism       * 100) / 100,
        impactMultiplier: Math.round(impactMultiplier * 100) / 100,
      },
    };
  }

  // ─────────────────────────────────────────
  // シグナル計算
  // ─────────────────────────────────────────

  _keywordToxicity(text) {
    const critical = /死ね|殺す|爆発|消えろ|バカ死ね|kill yourself|go die|kys/i;
    const high     = /クソ|最悪|ゴミ|うざい|バカ|アホ|stupid|idiot|moron|hate|loser/i;
    const medium   = /嫌い|ウザい|つまらない|下手|ダサい|worst|boring|trash/i;
    if (critical.test(text)) return 0.9;
    if (high.test(text))     return 0.65;
    if (medium.test(text))   return 0.35;
    return 0;
  }

  _spreadRisk(comment) {
    // 返信数・リアクション・類似コメント密度から推定
    const replyCount    = comment.replyCount    ?? 0;
    const likeCount     = comment.likeCount     ?? 0;
    const similarCount  = comment.similarCount  ?? 0; // 同一ユーザーの連投など

    const replyScore   = Math.min(1, replyCount   / 20);  // 20返信で最大
    const likeScore    = Math.min(1, likeCount     / 50);  // 50いいねで最大
    const similarScore = Math.min(1, similarCount  / 5);   // 5連投で最大

    return replyScore * 0.5 + likeScore * 0.3 + similarScore * 0.2;
  }

  _channelRiskScore(context) {
    const levelMap = { safe: 0, watch: 0.35, warning: 0.65, critical: 1.0 };
    return levelMap[context.riskLevel ?? 'safe'] ?? 0;
  }

  _recidivismScore(comment) {
    // violationHistory があれば過去違反回数に基づくスコア
    const violations = comment.violationCount ?? comment.violationHistory?.length ?? 0;
    return Math.min(1, violations / 5); // 5回違反で最大スコア
  }

  _impactScore(comment) {
    // Super Chat・常連・多フォロワーのコメントは影響力が大きい
    let score = 0;
    if (comment.isSuperChat || comment.isMember) score += 0.5;
    if (comment.subscriberCount > 10000)          score += 0.3;
    if (comment.isRegularCommenter)               score += 0.2;
    return Math.min(1, score);
  }

  // ─────────────────────────────────────────
  // トリアージレベル分類
  // ─────────────────────────────────────────
  _classifyLevel(score, context, comment, rawToxicity = 0) {
    const channelCritical = context.riskLevel === 'critical';
    const channelWarning  = context.riskLevel === 'warning';

    // ファストパス: 毒性が極めて高い場合は重み計算を問わず緊急以上
    if (rawToxicity >= 0.85) return 'EMERGENCY';
    if (rawToxicity >= 0.65) return 'URGENT';

    // チャンネルが炎上中かつ毒性ある → 一段階引き上げ
    if (channelCritical && score >= 0.35) return 'EMERGENCY';
    if (channelWarning  && score >= 0.55) return 'EMERGENCY';

    // チャンネルが警戒中は低スコアでもURGENTに昇格
    if (channelCritical && score >= 0.20) return 'URGENT';

    if (score >= 0.70) return 'EMERGENCY';
    if (score >= 0.50) return 'URGENT';
    if (score >= 0.30) return 'ROUTINE';
    return 'CAN_WAIT';
  }

  // ─────────────────────────────────────────
  // インサイトと推奨フォーカス
  // ─────────────────────────────────────────
  _insight(queues, context) {
    const { EMERGENCY, URGENT } = queues;
    if (EMERGENCY.length === 0 && URGENT.length === 0) {
      return '現在、緊急対応が必要なコメントはありません。通常業務で対応できます。';
    }
    if (EMERGENCY.length > 5) {
      return `緊急案件が${EMERGENCY.length}件あります。チャンネルの状況が深刻です。追加モデレーターの投入を検討してください。`;
    }
    if (EMERGENCY.length > 0) {
      return `緊急案件${EMERGENCY.length}件から対応を開始してください。要対応${URGENT.length}件がその後に続きます。`;
    }
    return `要対応案件が${URGENT.length}件あります。30分以内に処理することをお勧めします。`;
  }

  _suggestedFocus(queues, context) {
    const first = queues.EMERGENCY[0] ?? queues.URGENT[0] ?? queues.ROUTINE[0];
    if (!first) return null;

    return {
      level:         first.triageLevel,
      commentId:     first.commentId,
      priorityScore: first.priorityScore,
      reason:        `最優先案件: スコア${Math.round(first.priorityScore * 100)}点（${first.triageMeta.description}）`,
    };
  }

  _emptyResult() {
    return {
      queues: { EMERGENCY: [], URGENT: [], ROUTINE: [], CAN_WAIT: [] },
      summary: { total: 0, emergency: 0, urgent: 0, routine: 0, canWait: 0 },
      channelRisk:    'safe',
      insight:        '対応待ちコメントはありません。',
      suggestedFocus: null,
      levels:         TRIAGE_LEVELS,
      timestamp:      new Date().toISOString(),
    };
  }
}

module.exports = new ModeratorTriageService();
module.exports.ModeratorTriageService = ModeratorTriageService;
module.exports.TRIAGE_LEVELS = TRIAGE_LEVELS;
