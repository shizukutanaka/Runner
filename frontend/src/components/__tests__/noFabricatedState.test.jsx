import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// E-25 / E-26 の同型バグを機械的に塞ぐ
// ---------------------------------------------------------------------------
// この製品は同じ嘘を2回作っている:
//
//   E-25  AnalyticsPanel が実在しないAPIを叩き、失敗するたび
//         ハードコードされたデモ数値（コメント1240件など）を表示していた
//   E-26  ModeratorDashboard の見出し4数字が 1247/23/5/12 の固定値で、
//         `setModerationStats` は一度も呼ばれていなかった。
//         履歴タブは troll_user123 等、架空の処罰3件で初期化されていた
//
// どちらも「利用者が最初に見る数字が、実データと無関係」という同じ形をしている。
// 人間のレビューでこれを毎回捕まえるのは無理なので、規則として固定する:
//
//   **初期値を持つ useState は、その setter が実際に呼ばれること。**
//
// 呼ばれない state は「更新されない初期値」＝画面に固定表示される飾りであり、
// 0 や空配列なら「常にゼロ件」という嘘、非ゼロなら捏造そのものになる。
// 飾りが要らないなら描画ごと削除する（感情分析タブはそうした。
// sentiment はDBに保存されておらず、集計する元データが存在しない）。
const COMPONENT_DIR = path.resolve(process.cwd(), 'src/components');

const sourceFiles = fs.readdirSync(COMPONENT_DIR)
  .filter((f) => /\.(js|jsx)$/.test(f) && !f.endsWith('.stories.jsx'))
  .map((f) => ({ name: f, src: fs.readFileSync(path.join(COMPONENT_DIR, f), 'utf8') }));

it('走査対象のコンポーネントが存在する（テスト自体が空振りしていないこと）', () => {
  expect(sourceFiles.length).toBeGreaterThan(10);
});

describe.each(sourceFiles)('$name', ({ src }) => {
  it('初期値つき useState の setter がすべて実際に呼ばれている', () => {
    const dead = [];
    const re = /const \[(\w+), (set\w+)\] = useState\(\s*([[{])/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const [, , setter, brace] = m;
      // 空の [] / {} は「まだ何も無い」の正直な表現なので対象外
      const rest = src.slice(m.index + m[0].length);
      if (/^\s*[\]}]\s*\)/.test(rest)) continue;
      const calls = (src.match(new RegExp(`\\b${setter}\\b`, 'g')) || []).length;
      if (calls <= 1) dead.push(`${setter}（初期値 ${brace}...）が定義以外で呼ばれていない`);
    }
    expect(dead).toEqual([]);
  });
});

describe('過去に実在した捏造データが戻っていないこと', () => {
  // コメントは除いて走査する。**この製品では実装だけでなく説明文にも
  // 旧データの名前が出てくる**（何を消したかを記録しているため）ので、
  // 素朴に grep すると自分の説明に引っかかって永遠に落ちる
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const all = sourceFiles.map((f) => stripComments(f.src)).join('\n');

  it.each([
    ['E-26 の架空ユーザー', /troll_user123|spam_bot|offensive_user/],
    ['E-26 の固定統計値', /totalComments:\s*1247/],
    ['E-25 のデモ数値', /getDemoStats|isDemoData/]
  ])('%s が存在しない', (_label, pattern) => {
    expect(all).not.toMatch(pattern);
  });
});
