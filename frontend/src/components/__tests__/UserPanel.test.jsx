import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserPanel from '../UserPanel';
import { fetchUsers, updateUser, fetchUser, fetchUserHistory } from '../../api/users';

// ---------------------------------------------------------------------------
// なぜこの画面か
// ---------------------------------------------------------------------------
// UserPanel は BAN 専用の確認ダイアログを持つ「BANするための画面」である。
// バックエンドは BAN のとき `data.platformBan` で
// 「YouTube側にも反映できたか」を返している（usersController の R-28b）が、
// この画面は**戻り値を捨てていた**。
//
// 結果として、プラットフォームへの書き戻しが失敗しても一覧のバッジが
// `banned` に変わるだけで、成功と区別がつかない。
// R-28b が塞いだはずの穴——「ダッシュボードではBAN済みだが、当人は配信で
// 発言し続けられる」——が、UI 側にそのまま残っていたことになる。
//
// バックエンドが正しく報告していても、画面が捨てれば利用者には届かない。
// 因果鎖③（プラットフォームへの反映）の検証は、⑤（記録・表示）まで見て初めて閉じる。
const stableT = (key, arg) => (typeof arg === 'string' ? arg : key);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

vi.mock('../../api/users', () => ({
  fetchUsers: vi.fn(),
  updateUser: vi.fn(),
  fetchUser: vi.fn(),
  fetchUserHistory: vi.fn()
}));

const USER = { id: 'u-1', username: 'viewer1', platform: 'youtube', status: 'active' };

// UserPanel は検索を300msデバウンスしており、その再描画が
// クリックと競合すると「押したはずのボタンが差し替わっている」ことがある。
// ボタンの並び順に頼らず、**ダイアログが開いたことを待ってから、
// ダイアログの中のボタンを押す**ことで順序に依存しないようにする。
const openBanDialogAndConfirm = async () => {
  const user = userEvent.setup();
  render(<UserPanel />);
  await screen.findByText('viewer1');

  const [openButton] = await screen.findAllByRole('button', { name: 'user_panel_action_ban' });
  await user.click(openButton);

  const dialog = await screen.findByRole('dialog');
  // `get` ではなく `find` を使う。デバウンス由来の再描画がこの2行の間に
  // 挟まると `get` は一度きりで諦めてしまい、稀に落ちる
  await user.click(await within(dialog).findByRole('button', { name: 'user_panel_action_ban' }));
  return user;
};

describe('UserPanel の BAN', () => {
  beforeEach(() => {
    fetchUsers.mockReset().mockResolvedValue({ users: [USER] });
    fetchUser.mockReset().mockResolvedValue(USER);
    fetchUserHistory.mockReset().mockResolvedValue([]);
    updateUser.mockReset().mockResolvedValue({ platformBan: { ok: true } });
  });

  it('確認ダイアログのBANで updateUser が呼ばれる', async () => {
    await openBanDialogAndConfirm();
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(updateUser.mock.calls[0][1]).toEqual({ action: 'ban' });
  });

  it('【最重要】プラットフォームに反映できなかったBANを成功と見せない', async () => {
    updateUser.mockResolvedValue({ platformBan: { ok: false, reason: 'author_channel_id_unknown' } });
    await openBanDialogAndConfirm();
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(await screen.findByText(/プラットフォーム側には反映できていません/)).toBeInTheDocument();
    // 理由も出す（何が起きたか分からない警告は行動につながらない）
    expect(screen.getByText(/author_channel_id_unknown/)).toBeInTheDocument();
  });

  it('反映できた場合は警告を出さない', async () => {
    await openBanDialogAndConfirm();
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    // 再読み込みまで待つ。検索のデバウンスで余分に呼ばれることがあるので回数は下限で見る
    await waitFor(() => expect(fetchUsers.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText(/反映できていません/)).not.toBeInTheDocument();
  });

  it('BAN自体が失敗したらエラーを出す', async () => {
    const rejected = Promise.reject(new Error('403'));
    rejected.catch(() => {});
    updateUser.mockReturnValue(rejected);
    await openBanDialogAndConfirm();
    expect(await screen.findByText('user_panel_action_error')).toBeInTheDocument();
  });
});

describe('ユーザー未選択のとき無意味なリクエストを投げないこと', () => {
  beforeEach(() => {
    fetchUsers.mockReset().mockResolvedValue({ users: [] });
    fetchUser.mockReset().mockResolvedValue(null);
    fetchUserHistory.mockReset().mockResolvedValue([]);
    updateUser.mockReset();
  });

  it('一覧が空なら /users/:id を叩かない（旧実装は id=null で404を2本出していた）', async () => {
    render(<UserPanel />);
    await screen.findByText('ユーザーが見つかりません');
    expect(fetchUser).not.toHaveBeenCalled();
    expect(fetchUserHistory).not.toHaveBeenCalled();
  });
});
