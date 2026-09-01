#!/usr/bin/env node
/**
 * モデレーション検出性能の評価ハーネス（R-5b）
 *
 * 目的: 「NGワードを追加した」「回避対策を入れた」といった変更の効果を、
 * 印象ではなく**数値**で測る。difficulty 別に集計することで、
 * どの層（明示語/表記回避/語彙に頼らない攻撃/紛らわしい無害）が弱いかを可視化する。
 *
 * 使い方:
 *   node src/scripts/evaluateModeration.js            # 人間向けレポート
 *   node src/scripts/evaluateModeration.js --json     # 機械可読（CI用）
 *   node src/scripts/evaluateModeration.js --no-ai    # AI層を無効化して決定論層だけを測る
 *
 * **AI層（W-3 / Policy-as-Prompt）の効果測定の手順**:
 *   OPENAI_API_KEY を設定した上で、同じ評価セットに対して
 *     node src/scripts/evaluateModeration.js --no-ai   （決定論層のみ）
 *     node src/scripts/evaluateModeration.js           （AI層込み）
 *   を実行し、差分を見る。同一の物差しで測るので、Recallの上昇と
 *   Precisionの低下をそのまま比較できる。
 *   ここで見るべきは indirect（語彙に頼らない攻撃）の検知率で、
 *   決定論層は構造上ここを埋められない。
 *
 * 注意: WildGuardTestJP / AnswerCarefully 等の公開ベンチマークはライセンス/配布
 * 条件のため同梱していない。`src/data/moderation-eval-set.json` と同じ形式に
 * 変換すれば、そのまま差し替えて評価できる。
 */

const path = require('path');

// --no-ai: AI層を落として決定論層だけを測る。moderationService を読み込む前に
// isAvailable() を潰す必要があるため、require の順序に依存する
const disableAi = process.argv.includes('--no-ai');
if (disableAi) {
  // eslint-disable-next-line global-require
  const openaiService = require('../services/openaiService');
  openaiService.isAvailable = () => false;
}

// eslint-disable-next-line global-require
const openaiService = require('../services/openaiService');
const moderationService = require('../services/moderationService');

// レポートに「どの構成で測ったか」を必ず出す。これが無いと、キー未設定で出た
// 決定論層だけの数値を「AI込みの性能」と読み違える
const aiActive = openaiService.isAvailable();

const loadCases = (file) => {
  const target = file || path.join(__dirname, '..', 'data', 'moderation-eval-set.json');
  // eslint-disable-next-line global-require
  return require(target).cases;
};

// 検知されたとみなす条件。実運用の拒否判定（isSpam || isOffensive || score>=閾値）に合わせる
const isFlagged = (result) => Boolean(result.isOffensive || result.isSpam);

const metricsFrom = (rows) => {
  const tp = rows.filter((r) => r.expected === 'flag' && r.flagged).length;
  const fn = rows.filter((r) => r.expected === 'flag' && !r.flagged).length;
  const fp = rows.filter((r) => r.expected === 'pass' && r.flagged).length;
  const tn = rows.filter((r) => r.expected === 'pass' && !r.flagged).length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 = precision !== null && recall !== null && precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : null;
  return { tp, fn, fp, tn, precision, recall, f1, total: rows.length };
};

const evaluate = async (file) => {
  const cases = loadCases(file);
  const rows = [];
  for (const c of cases) {
    // eslint-disable-next-line no-await-in-loop
    const result = await moderationService.analyzeComment(c.text, 'youtube', 'evaluser', new Date().toISOString());
    // 語彙・パターンによる決定論的な根拠が一つも無いのに検知された場合、
    // それはAI層（toxicity判定 / Policy-as-Prompt）だけが拾ったということ
    const deterministicSignal = (result.flaggedWords || []).length > 0
      || Boolean(result.symbolSpam)
      || (result.linkCount || 0) >= 3;
    rows.push({
      ...c,
      flagged: isFlagged(result),
      score: result.score,
      categories: result.flaggedCategories || [],
      aiOnly: isFlagged(result) && !deterministicSignal,
      policyAdvisory: Boolean(result.policyAnalysis?.isViolation),
      correct: (c.expected === 'flag') === isFlagged(result)
    });
  }

  const byDifficulty = {};
  [...new Set(cases.map((c) => c.difficulty))].forEach((d) => {
    byDifficulty[d] = metricsFrom(rows.filter((r) => r.difficulty === d));
  });

  return { overall: metricsFrom(rows), byDifficulty, rows, aiActive, aiFlaggedCount: rows.filter((r) => r.aiOnly).length };
};

const pct = (v) => (v === null ? ' n/a ' : `${(v * 100).toFixed(1)}%`);

const report = (res) => {
  const o = res.overall;
  console.log('\n=== モデレーション検出性能（R-5b 評価ハーネス） ===\n');
  console.log(`構成: ${res.aiActive ? 'AI層 有効（決定論層 + toxicity + Policy-as-Prompt）' : 'AI層 無効（決定論層のみ）'}`);
  if (!res.aiActive) {
    console.log('  ※ OPENAI_API_KEY 未設定か --no-ai 指定。この数値は語彙・パターン層だけの性能です');
  } else {
    console.log(`  AI層だけが拾った件数: ${res.aiFlaggedCount}件（決定論的な根拠が無いのに検知されたもの）`);
  }
  console.log('');
  console.log(`全体: ${o.total}件  正解 ${o.tp + o.tn}/${o.total}`);
  console.log(`  Precision ${pct(o.precision)} / Recall ${pct(o.recall)} / F1 ${pct(o.f1)}`);
  console.log(`  TP:${o.tp}  FN:${o.fn}(見逃し)  FP:${o.fp}(誤検知)  TN:${o.tn}\n`);

  console.log('難易度別:');
  Object.entries(res.byDifficulty).forEach(([d, m]) => {
    const detected = m.tp + m.fn > 0 ? `検知率 ${pct(m.recall)}` : `誤検知 ${m.fp}/${m.total}`;
    console.log(`  ${d.padEnd(14)} ${String(m.total).padStart(2)}件  ${detected}`);
  });

  const misses = res.rows.filter((r) => !r.correct);
  if (misses.length > 0) {
    console.log('\n不正解の内訳:');
    misses.forEach((r) => {
      const kind = r.expected === 'flag' ? '見逃し' : '誤検知';
      console.log(`  [${kind}] (${r.difficulty}) ${r.id}: ${r.text.slice(0, 32)}`);
    });
  }
  console.log('');
};

if (require.main === module) {
  const asJson = process.argv.includes('--json');
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  evaluate(fileArg ? fileArg.split('=')[1] : undefined)
    .then((res) => {
      if (asJson) {
        console.log(JSON.stringify({
          aiActive: res.aiActive,
          aiFlaggedCount: res.aiFlaggedCount,
          overall: res.overall,
          byDifficulty: res.byDifficulty
        }, null, 2));
      } else {
        report(res);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('[EvaluateModeration] Failed:', err.message);
      process.exit(1);
    });
}

module.exports = {
  evaluate,
  isFlagged
};
