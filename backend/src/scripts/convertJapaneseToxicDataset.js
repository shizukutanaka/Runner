#!/usr/bin/env node
/**
 * 外部ベンチマーク変換ツール（R-34）
 *
 * 自作の評価セット（`src/data/moderation-eval-set.json`）は、
 * **パターンを書いた人間がケースも書いている**ため、そこで100%が出ても
 * 一般化の証拠にはならない。実際 R-33 の初版は自作セットで F1 100% を出しながら、
 * 想定外のチャット8件中5件を誤検知した。
 *
 * そこで外部の物差しを使う。このスクリプトは
 *   https://github.com/inspection-ai/japanese-toxic-dataset （Apache-2.0）
 * の `data/subset.csv` を評価ハーネスの形式へ変換する。
 * ANLP2022「日本語有害表現スキーマの提案と評価」のデータセットで、
 * 1文につき複数人がラベル（Not Toxic / Hard to Say / Toxic / Very Toxic）を付けている。
 *
 * データ本体はこのリポジトリに同梱しない（上流を都度取得する）。
 *
 * 使い方:
 *   git clone --depth 1 https://github.com/inspection-ai/japanese-toxic-dataset.git /tmp/jtox
 *   node src/scripts/convertJapaneseToxicDataset.js /tmp/jtox/data/subset.csv > /tmp/jtox-eval.json
 *   node src/scripts/evaluateModeration.js --file=/tmp/jtox-eval.json
 *
 * **開発用と検証用の分割（--split）**:
 *   検出ルールを外部セットを見ながら調整すると、そのセットは訓練データに変わり
 *   独立な検証の場を失う。第2の外部セットが手に入らない状況では、
 *   1つのセットを機械的に二分し、**片方だけを見て調整し、もう片方で報告する**。
 *     node src/scripts/convertJapaneseToxicDataset.js <csv> --split=dev  > dev.json
 *     node src/scripts/convertJapaneseToxicDataset.js <csv> --split=test > test.json
 *   分割は id の偶奇による（内容とは無関係な決定的規則なので、
 *   実行のたびに都合よく変わることがない）。
 *
 * ---------------------------------------------------------------------------
 * ラベル変換規則（結果を見る前に決めたもの。後から都合よく変えないこと）
 * ---------------------------------------------------------------------------
 *   flag : Toxic + Very Toxic が Not Toxic + Hard to Say を上回る
 *          （＝過半のアノテーターが有害と判断した）
 *   pass : Not Toxic が それ以外の合計を上回る
 *          （＝過半のアノテーターが無害と判断した）
 *   除外 : 上のどちらでもないもの（人間の判断が割れているケース）
 *
 * 判断が割れた文を除外するのは、**人間の合意が無いものを機械の正解として
 * 使わない**ため。除外件数は必ず標準エラーに出す（黙って捨てない）。
 *
 * 注意: このデータセットは一般的な日本語ウェブ文であり、配信チャットではない。
 * 本製品の検知層は配信チャットに向けて設計されているので、
 * ここでの数値は「別ドメインに当てたときにどうなるか」を測るものである。
 */

const fs = require('fs');

// カンマ区切り・引用符付きCSVの最小パーサ（依存を増やさないため自前）
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
};

const convert = (csvText, split = null) => {
  const rows = parseCsv(csvText).filter((r) => r.length > 1);
  const header = rows.shift();
  const idx = (name) => header.indexOf(name);
  const iText = idx('text');
  const iNot = idx('Not Toxic');
  const iHard = idx('Hard to Say');
  const iTox = idx('Toxic');
  const iVery = idx('Very Toxic');
  if ([iText, iNot, iHard, iTox, iVery].some((i) => i < 0)) {
    throw new Error('想定した列が見つかりません。上流のCSVスキーマが変わった可能性があります');
  }

  const cases = [];
  let skipped = 0;
  rows.forEach((r, n) => {
    const text = r[iText];
    if (!text) return;
    const notToxic = Number(r[iNot]) || 0;
    const hard = Number(r[iHard]) || 0;
    const toxic = (Number(r[iTox]) || 0) + (Number(r[iVery]) || 0);

    let expected = null;
    if (toxic > notToxic + hard) expected = 'flag';
    else if (notToxic > toxic + hard) expected = 'pass';

    if (!expected) { skipped += 1; return; }

    // --split: id の偶奇で dev / test に二分する。内容と無関係な決定的規則
    const rawId = Number(r[idx('id')]);
    if (split) {
      const bucket = Number.isFinite(rawId) ? (rawId % 2 === 0 ? 'dev' : 'test') : 'dev';
      if (bucket !== split) return;
    }

    cases.push({
      id: `jtox-${r[idx('id')] || n}`,
      text,
      expected,
      difficulty: expected === 'flag' ? 'external-toxic' : 'external-benign'
    });
  });

  return { cases, skipped };
};

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('使い方: node src/scripts/convertJapaneseToxicDataset.js <subset.csv>');
    process.exit(1);
  }
  const splitArg = process.argv.find((a) => a.startsWith('--split='));
  const split = splitArg ? splitArg.split('=')[1] : null;
  if (split && !['dev', 'test'].includes(split)) {
    console.error('--split は dev か test を指定してください');
    process.exit(1);
  }
  const { cases, skipped } = convert(fs.readFileSync(file, 'utf8'), split);
  const flag = cases.filter((c) => c.expected === 'flag').length;
  console.error(`[convert] ${split ? `[${split}] ` : ''}採用 ${cases.length}件（有害 ${flag} / 無害 ${cases.length - flag}）`);
  console.error(`[convert] 除外 ${skipped}件（アノテーターの判断が割れたもの）`);
  console.log(JSON.stringify({ cases }, null, 2));
}

module.exports = { convert, parseCsv };
