import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModeratorDashboard from '../ModeratorDashboard';
import { updateUser } from '../../api/users';
import { updateComment, deleteComment } from '../../api/comments';

// ---------------------------------------------------------------------------
// なぜこの画面のテストが最優先だったか
// ---------------------------------------------------------------------------
// 旧実装の `handleUserAction` / `handleCommentAction` は **APIを一切呼ばず**、
// ローカル状態だけを書き換えていた。モデレーターの画面ではコメントが消え
// 「BANしました」と表示されるが、**DBにもYouTube/Twitchにも何も起きていない**。
// 当人は発言を続けられる。つまり「モデレーションUIがモデレーションしていない」。
//
// この不具合の恐ろしさは**画面が正常に見えること**にある。
// 成功時も失敗時も見た目が同じなら、テスト以外に気づく方法が無い。
// したがってここで固定すべきは「見た目」ではなく **APIが実際に呼ばれること**、
// そして **失敗したときに成功したように見えないこと** である。
const stableT = (_key, fallback) => fallback ?? _key;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

vi.mock('../../api/users', () => ({ updateUser: vi.fn() }));
vi.mock('../../api/comments', () => ({ updateComment: vi.fn(), deleteComment: vi.fn() }));

const COMMENT = {
  id: 'c-1', user: 'viewer1', content: '対象コメント',
  platform: 'youtube', timestamp: new Date().toISOString(),
  status: 'visible', moderationScore: 0.4
};
// **配列は毎回同じ参照を返すこと。** 新しい配列リテラルを返すと
// `useEffect(..., [fetchedComments])` が毎レンダリング発火して
// setState→再レンダリングの無限ループになり、テストがハングする
// （実装側は useComments が安定参照を返す前提で書かれている）
const COMMENTS = [COMMENT];
vi.mock('../../hooks/useComments', () => ({
  useComments: () => ({ comments: COMMENTS, loading: false, error: null })
}));

describe('ModeratorDashboard のモデレーション操作', () => {
  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ success: true });
    updateComment.mockReset().mockResolvedValue({ success: true });
    deleteComment.mockReset().mockResolvedValue({ success: true });
  });

  const clickAction = async (label) => {
    const user = userEvent.setup();
    render(<ModeratorDashboard />);
    await screen.findByText('対象コメント');
    // ボタンは Tooltip の title からアクセシブル名を得る
    const btn = screen.getAllByRole('button', { name: label })[0];
    await user.click(btn);
  };

  it('画面が描画され、対象コメントが見える', async () => {
    render(<ModeratorDashboard />);
    await waitFor(() => expect(screen.getByText('対象コメント')).toBeInTheDocument());
  });

  it('「コメントを削除」は deleteComment を理由付きで呼ぶ', async () => {
    await clickAction('コメントを削除');
    await waitFor(() => expect(deleteComment).toHaveBeenCalled());
    const [id, payload] = deleteComment.mock.calls[0];
    expect(id).toBe('c-1');
    // 削除理由はバックエンドで必須。欠けると400で失敗する
    expect(payload).toHaveProperty('reason');
    expect(payload).toHaveProperty('reasonCategory');
  });

  it('「ユーザーをBAN」は updateUser を呼ぶ', async () => {
    await clickAction('ユーザーをBAN');
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    const [userId, payload] = updateUser.mock.calls[0];
    expect(userId).toBe('viewer1');
    expect(payload.action).toBe('ban');
  });

  it('「ユーザーをミュート」も updateUser を呼ぶ', async () => {
    await clickAction('ユーザーをミュート');
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(updateUser.mock.calls[0][1].action).toBe('mute');
  });

  it('APIが失敗したら成功したように見せない（最重要）', async () => {
    const rejected = Promise.reject(new Error('削除に失敗しました'));
    rejected.catch(() => {});
    deleteComment.mockReturnValue(rejected);

    await clickAction('コメントを削除');
    await waitFor(() => expect(deleteComment).toHaveBeenCalled());
    // 失敗しても対象コメントは残ったまま（消えて成功に見えてはいけない）
    expect(screen.getByText('対象コメント')).toBeInTheDocument();
  });
});

describe('ModeratorDashboard の実装が退行していないこと', () => {
  it('操作ハンドラがAPIクライアントを呼んでいる（ローカル状態だけを書き換えない）', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/ModeratorDashboard.js'), 'utf8'
    );
    // handleUserAction / handleCommentAction が実APIを呼ぶ形であること
    expect(src).toMatch(/await updateUser\(/);
    expect(src).toMatch(/await deleteComment\(/);
    expect(src).toMatch(/await updateComment\(/);
    // 失敗を握りつぶさず利用者に見せること
    expect(src).toMatch(/setActionError/);
  });
});
