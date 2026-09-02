import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPanel from '../SettingsPanel';
import { getSettings, updateSettings, getSlowMode, setSlowMode } from '../../api/settings';

// ---------------------------------------------------------------------------
// なぜこのテストか（E-39）
// ---------------------------------------------------------------------------
// 設定画面のスローモード欄は**存在していた**。しかし保存先が違っていた。
//
//   画面が書いていた場所      user_settings の `moderation.slowMode`
//   取り込みが読む場所        user_settings の `slowMode`（最上位）
//
// 保存APIは200を返し、画面のスイッチも動く。だが**判定は一切変わらない**。
// スローモードは `user_settings` の項目のうち唯一、実際に読まれて効くものなので、
// 「効く設定の唯一の入口が、効かない場所に書いていた」ことになる。
//
// したがってここで固定すべきは「スイッチが動くこと」ではなく、
// **専用APIが呼ばれること**（＝取り込みが読む場所に書くこと）、
// そして**保存に失敗したときに、成功したように見えないこと**である。
const stableT = (_key, fallback) => fallback ?? _key;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ account: { id: 'acct-1', username: 'mod' } })
}));

vi.mock('../../api/settings', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getSlowMode: vi.fn(),
  setSlowMode: vi.fn()
}));

vi.mock('../CultureProfilePanel', () => ({ default: () => <div>culture</div> }));

describe('スローモード設定が「実際に効く場所」に保存されること', () => {
  beforeEach(() => {
    getSettings.mockReset().mockResolvedValue({});
    updateSettings.mockReset().mockResolvedValue({});
    getSlowMode.mockReset().mockResolvedValue({ enabled: false, intervalSeconds: 30, platformSpecific: {} });
    setSlowMode.mockReset().mockResolvedValue({ enabled: true, intervalSeconds: 30 });
  });

  it('現在の設定を専用APIから読む', async () => {
    render(<SettingsPanel />);
    await waitFor(() => expect(getSlowMode).toHaveBeenCalledWith('acct-1'));
  });

  it('スイッチを入れると、汎用の設定APIではなく専用APIが呼ばれる', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await waitFor(() => expect(getSlowMode).toHaveBeenCalled());

    const toggle = await screen.findByLabelText('settings_slow_mode_enabled_label');
    await user.click(toggle);

    await waitFor(() => expect(setSlowMode).toHaveBeenCalledTimes(1));
    const [userId, payload] = setSlowMode.mock.calls[0];
    expect(userId).toBe('acct-1');
    expect(payload.enabled).toBe(true);

    // 汎用APIに moderation.slowMode として書いてはいけない。
    // そこは取り込みが読まない場所である
    const wroteToGeneric = updateSettings.mock.calls.some(
      ([, body]) => body?.moderation && 'slowMode' in body.moderation
    );
    expect(wroteToGeneric).toBe(false);
  });

  it('保存に失敗したら、成功したように見せない', async () => {
    setSlowMode.mockRejectedValueOnce(new Error('保存できません'));
    const user = userEvent.setup();
    render(<SettingsPanel />);
    await waitFor(() => expect(getSlowMode).toHaveBeenCalled());

    await user.click(await screen.findByLabelText('settings_slow_mode_enabled_label'));

    expect(await screen.findByText(/スローモード設定を保存できませんでした/)).toBeInTheDocument();
    expect(screen.queryByText(/保存しました/)).not.toBeInTheDocument();
  });

  it('現在の設定を取得できなかったら、既定値を「現在の設定」と偽らない', async () => {
    getSlowMode.mockRejectedValueOnce(new Error('取得できません'));
    render(<SettingsPanel />);

    expect(await screen.findByText(/現在のスローモード設定を取得できませんでした/)).toBeInTheDocument();
  });
});
