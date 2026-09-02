import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModeratorDashboard from '../ModeratorDashboard';
import { updateUser } from '../../api/users';
import { updateComment, deleteComment, fetchAnalyticsOverview, fetchModerationActions } from '../../api/comments';

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
vi.mock('../../api/comments', () => ({
  updateComment: vi.fn(), deleteComment: vi.fn(), fetchAnalyticsOverview: vi.fn(),
  fetchModerationActions: vi.fn()
}));

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
    fetchModerationActions.mockReset().mockResolvedValue([]);
    fetchAnalyticsOverview.mockReset().mockResolvedValue({
      total: 4321, moderated: 7, bannedUsers: 2, mutedUsers: 3
    });
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


// ---------------------------------------------------------------------------
// 上部の統計カードと「最近のアクション」タブ
// ---------------------------------------------------------------------------
// この画面には E-25（アナリティクスのデモデータ）と同じ嘘が2箇所残っていた:
//
//   1. `moderationStats` が 1247 / 23 / 5 / 12 で初期化され、
//      `setModerationStats` は**コード中で一度も呼ばれていなかった**。
//      誰がどの環境で開いても同じ数字が出る、実データ非依存の飾り。
//   2. `recentActions` が troll_user123 / spam_bot / offensive_user という
//      **架空のモデレーション履歴3件**で初期化されていた。
//      実行された事実のないBAN・ミュート・削除が実績として表示されていた。
describe('統計カードが実データを出すこと', () => {
  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ success: true });
    updateComment.mockReset().mockResolvedValue({ success: true });
    deleteComment.mockReset().mockResolvedValue({ success: true });
    fetchModerationActions.mockReset().mockResolvedValue([]);
    fetchAnalyticsOverview.mockReset().mockResolvedValue({
      total: 4321, moderated: 7, bannedUsers: 2, mutedUsers: 3
    });
  });

  it('APIの値を表示し、旧ハードコード値を表示しない', async () => {
    render(<ModeratorDashboard />);
    await waitFor(() => expect(screen.getByText('4,321')).toBeInTheDocument());
    // 旧固定値が残っていないこと
    expect(screen.queryByText('1,247')).not.toBeInTheDocument();
  });

  it('取得できない値は 0 ではなく「—」と表示する', async () => {
    fetchAnalyticsOverview.mockResolvedValue({
      total: 10, moderated: null, bannedUsers: null, mutedUsers: null
    });
    render(<ModeratorDashboard />);
    await waitFor(() => expect(screen.getByText('10')).toBeInTheDocument());
    // null は「—」。0 と表示すると「該当なし」と誤読される
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('統計の取得に失敗したら黙らず、数字も捏造しない', async () => {
    const rejected = Promise.reject(new Error('統計を取得できませんでした'));
    rejected.catch(() => {});
    fetchAnalyticsOverview.mockReturnValue(rejected);

    render(<ModeratorDashboard />);
    await waitFor(() => expect(screen.getByText(/統計を取得できませんでした/)).toBeInTheDocument());
    expect(screen.queryByText('1,247')).not.toBeInTheDocument();
  });
});

describe('モデレーション履歴に架空データを混ぜないこと', () => {
  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ success: true });
    updateComment.mockReset().mockResolvedValue({ success: true });
    deleteComment.mockReset().mockResolvedValue({ success: true });
    fetchModerationActions.mockReset().mockResolvedValue([]);
    fetchAnalyticsOverview.mockReset().mockResolvedValue({
      total: 1, moderated: 0, bannedUsers: 0, mutedUsers: 0
    });
  });

  const openHistoryTab = async () => {
    const user = userEvent.setup();
    render(<ModeratorDashboard />);
    await screen.findByText('対象コメント');
    await user.click(screen.getByRole('tab', { name: '最近のアクション' }));
  };

  it('操作していなければ履歴は空で、架空のユーザー名が出ない', async () => {
    await openHistoryTab();
    await screen.findByText('まだ操作はありません。');
    for (const fake of ['troll_user123', 'spam_bot', 'offensive_user']) {
      expect(screen.queryByText(fake)).not.toBeInTheDocument();
    }
  });

  it('プラットフォーム側へ反映できなかったBANをそう表示する（R-28b の後半）', async () => {
    // バックエンドは platformBan.ok=false を返している。これを画面が捨てると
    // 「ダッシュボードではBAN済みだが当人は発言し続けられる」状態が見えなくなる
    updateUser.mockResolvedValue({ platformBan: { ok: false, reason: 'author_channel_id_unknown' } });

    const user = userEvent.setup();
    render(<ModeratorDashboard />);
    await screen.findByText('対象コメント');
    await user.click(screen.getAllByRole('button', { name: 'ユーザーをBAN' })[0]);
    await waitFor(() => expect(updateUser).toHaveBeenCalled());

    await user.click(screen.getByRole('tab', { name: '最近のアクション' }));
    expect(await screen.findByText(/プラットフォーム側には未反映/)).toBeInTheDocument();
  });

  it('反映できたBANは反映済みと表示する', async () => {
    updateUser.mockResolvedValue({ platformBan: { ok: true } });

    const user = userEvent.setup();
    render(<ModeratorDashboard />);
    await screen.findByText('対象コメント');
    await user.click(screen.getAllByRole('button', { name: 'ユーザーをBAN' })[0]);
    await waitFor(() => expect(updateUser).toHaveBeenCalled());

    await user.click(screen.getByRole('tab', { name: '最近のアクション' }));
    expect(await screen.findByText(/プラットフォーム側にも反映済み/)).toBeInTheDocument();
  });
});


// ---------------------------------------------------------------------------
// モデレーション履歴パネル（E-38）
// ---------------------------------------------------------------------------
// このパネルは以前「サーバ側に横断的な履歴APIが無い」という理由で、
// **その画面で実行した分しか出せなかった**（再読み込みで消える）。
// 実際には操作は監査記録に残っており、無かったのはAPIだけだった。
//
// もう一つ固定するのは **BANがプラットフォームへ届いたかの3状態**である:
//   true=届いた / false=届かなかった / null=記録が無い（古い行）。
// null を false として描くと、**古い記録を「未反映」と誤って断言する**ことになる。
describe('モデレーション履歴パネルがサーバの記録を出すこと', () => {
  const ACTIONS = [
    {
      id: 'audit-1', type: 'ban', user: 'troll_a', platform: 'youtube',
      reason: '繰り返しの迷惑行為', moderator: 'mod_x',
      timestamp: new Date().toISOString(), platformApplied: false, platformReason: 'author_channel_id_unknown'
    },
    {
      id: 'audit-2', type: 'ban', user: 'troll_b', platform: 'twitch',
      reason: '古い記録', moderator: 'mod_y',
      timestamp: new Date().toISOString(), platformApplied: null, platformReason: null
    },
    {
      id: 'audit-3', type: 'mute', user: 'noisy_c', platform: 'youtube',
      reason: '警告1回目', moderator: 'mod_x',
      timestamp: new Date().toISOString(), platformApplied: null, platformReason: null
    }
  ];

  beforeEach(() => {
    updateUser.mockReset().mockResolvedValue({ success: true });
    updateComment.mockReset().mockResolvedValue({ success: true });
    deleteComment.mockReset().mockResolvedValue({ success: true });
    fetchAnalyticsOverview.mockReset().mockResolvedValue({
      total: 1, moderated: 0, bannedUsers: 0, mutedUsers: 0
    });
    fetchModerationActions.mockReset().mockResolvedValue(ACTIONS);
  });

  const openHistory = async () => {
    const user = userEvent.setup();
    render(<ModeratorDashboard platform="all" />);
    await user.click(await screen.findByRole('tab', { name: '最近のアクション' }));
  };

  it('サーバから取得した操作が表示される（この画面で実行した分に限られない）', async () => {
    await openHistory();
    expect(await screen.findByText('troll_a')).toBeInTheDocument();
    expect(screen.getByText('noisy_c')).toBeInTheDocument();
    expect(screen.getByText(/繰り返しの迷惑行為/)).toBeInTheDocument();
  });

  it('プラットフォームへ届かなかったBANは、そう明示される', async () => {
    await openHistory();
    expect(await screen.findByText(/プラットフォーム側には未反映/)).toBeInTheDocument();
  });

  it('記録が無いBANを「未反映」と断言しない', async () => {
    await openHistory();
    await screen.findByText('troll_b');
    // 未反映の断言は troll_a の分の1件だけであること
    expect(screen.getAllByText(/プラットフォーム側には未反映/)).toHaveLength(1);
    expect(screen.getByText(/反映結果は記録されていません/)).toBeInTheDocument();
  });

  it('取得に失敗したら、空の履歴を「操作なし」と偽らない', async () => {
    fetchModerationActions.mockRejectedValueOnce(new Error('履歴API停止中'));
    await openHistory();
    expect(await screen.findByText(/履歴API停止中/)).toBeInTheDocument();
    expect(screen.queryByText('まだ操作はありません。')).not.toBeInTheDocument();
  });
});
