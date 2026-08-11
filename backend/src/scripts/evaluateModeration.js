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
 *
 * 注意: WildGuardTestJP / AnswerCarefully 等の公開ベンチマークはライセンス/配布
 * 条件のため同梱していない。`src/data/moderation-eval-set.json` と同じ形式に
 * 変換すれば、そのまま差し替えて評価できる。
 */

const path = require('path');
const moderationService = require('../services/moderationService');

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
    rows.push({
      ...c,
      flagged: isFlagged(result),
      score: result.score,
      categories: result.flaggedCategories || [],
      correct: (c.expected === 'flag') === isFlagged(result)
    });
  }

  const byDifficulty = {};
  [...new Set(cases.map((c) => c.difficulty))].forEach((d) => {
    byDifficulty[d] = metricsFrom(rows.filter((r) => r.difficulty === d));
  });

  return { overall: metricsFrom(rows), byDifficulty, rows };
};

const pct = (v) => (v === null ? ' n/a ' : `${(v * 100).toFixed(1)}%`);

const report = (res) => {
  const o = res.overall;
  console.log('\n=== モデレーション検出性能（R-5b 評価ハーネス） ===\n');
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
        console.log(JSON.stringify({ overall: res.overall, byDifficulty: res.byDifficulty }, null, 2));
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

module.exports = { evaluate, metricsFrom, isFlagged };
