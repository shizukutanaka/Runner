import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

// E-15 の回帰テスト。
//
// `POST /api/comments/summary` は `{ summary, statistics }` という**オブジェクト**を返す。
// CommentTimeline はこれをそのまま state に入れ、JSX の `{summaryText}` で
// 子として描画しようとしていた。**Reactはオブジェクトを子として描画できず例外を投げ、
// エラーバウンダリが無かったためツリー全体がアンマウントされ、
// ダッシュボードがホワイトスクリーンになった。**
// 「タブが1つ壊れる」ではなく「アプリ全体が消える」形の障害だった。
//
// 修正は `typeof summary === 'string' ? summary : (summary?.summary ?? '')`。
// ここでは(1)その防御が残っていること (2)オブジェクトを子にすると実際に落ちること
// の両方を固定する。

const SRC = path.resolve(process.cwd(), 'src/components/CommentTimeline.js');

describe('要約の描画（E-15 ホワイトスクリーン回帰）', () => {
  it('オブジェクトを直接 state に入れない防御が残っている', () => {
    const src = fs.readFileSync(SRC, 'utf8');
    // 文字列以外が来たら .summary を取り出す形になっていること
    expect(src).toMatch(/typeof summary === 'string'/);
    expect(src).toMatch(/summary\?\.summary/);
  });

  it('前提の確認: オブジェクトを子として描画すると実際に例外になる', () => {
    const Bad = () => <div>{{ summary: 'x', statistics: {} }}</div>;
    // これが投げなくなったら、上の防御は不要になったということ（Reactの仕様変更）
    expect(() => render(<Bad />)).toThrow();
  });

  it('文字列なら問題なく描画できる', () => {
    const Good = () => <div>{'要約テキスト'}</div>;
    const { getByText } = render(<Good />);
    expect(getByText('要約テキスト')).toBeInTheDocument();
  });
});
