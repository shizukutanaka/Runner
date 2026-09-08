import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Register from '../Register';

// Login.test.jsx と同じ理由でテストが無かった画面（Register）を固定する。
// バックエンド側は登録直後に自動ログインする設計（`useAuth.register`が
// `apiRegister`成功後に`login`を続けて呼ぶ）ため、この画面自身は
// 「正しい入力でonRegisterを呼ぶ」「失敗を隠さない」ことだけを担保すればよい。
const stableT = (_key, fallback) => fallback ?? _key;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

describe('Register', () => {
  let onRegister;
  let onSwitchToLogin;

  beforeEach(() => {
    onRegister = vi.fn();
    onSwitchToLogin = vi.fn();
  });

  it('ユーザー名・メール・パスワードが揃うまで送信ボタンは無効', async () => {
    const user = userEvent.setup();
    render(<Register onRegister={onRegister} onSwitchToLogin={onSwitchToLogin} />);

    const submit = screen.getByRole('button', { name: 'アカウント作成' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('ユーザー名'), 'newmod');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('メールアドレス'), 'newmod@example.com');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/パスワード/), 'SecurePass123!');
    expect(submit).not.toBeDisabled();
  });

  it('送信すると前後の空白を取り除いたユーザー名・メールでonRegisterを呼ぶ', async () => {
    onRegister.mockResolvedValue({ user: { id: '1', role: 'moderator' } });
    const user = userEvent.setup();
    render(<Register onRegister={onRegister} onSwitchToLogin={onSwitchToLogin} />);

    await user.type(screen.getByLabelText('ユーザー名'), '  newmod  ');
    await user.type(screen.getByLabelText('メールアドレス'), '  newmod@example.com  ');
    await user.type(screen.getByLabelText(/パスワード/), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: 'アカウント作成' }));

    await waitFor(() => expect(onRegister).toHaveBeenCalledWith(
      'newmod', 'newmod@example.com', 'SecurePass123!'
    ));
  });

  it('登録に失敗したら（ユーザー名重複等）、成功したように見せず理由を表示する', async () => {
    onRegister.mockRejectedValue(new Error('このユーザー名またはメールアドレスは既に使用されています'));
    const user = userEvent.setup();
    render(<Register onRegister={onRegister} onSwitchToLogin={onSwitchToLogin} />);

    await user.type(screen.getByLabelText('ユーザー名'), 'existing');
    await user.type(screen.getByLabelText('メールアドレス'), 'existing@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: 'アカウント作成' }));

    expect(await screen.findByText('このユーザー名またはメールアドレスは既に使用されています'))
      .toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'アカウント作成' })).not.toBeDisabled());
  });

  it('送信中は入力欄が操作できない（多重送信の防止）', async () => {
    let resolveRegister;
    onRegister.mockReturnValue(new Promise((resolve) => { resolveRegister = resolve; }));
    const user = userEvent.setup();
    render(<Register onRegister={onRegister} onSwitchToLogin={onSwitchToLogin} />);

    await user.type(screen.getByLabelText('ユーザー名'), 'newmod');
    await user.type(screen.getByLabelText('メールアドレス'), 'newmod@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: 'アカウント作成' }));

    expect(screen.getByLabelText('ユーザー名')).toBeDisabled();
    expect(onRegister).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRegister({ user: { id: '1', role: 'moderator' } });
    });
    await waitFor(() => expect(screen.getByLabelText('ユーザー名')).not.toBeDisabled());
  });

  it('ログイン画面への切り替えリンクがonSwitchToLoginを呼ぶ', async () => {
    const user = userEvent.setup();
    render(<Register onRegister={onRegister} onSwitchToLogin={onSwitchToLogin} />);

    await user.click(screen.getByText('すでにアカウントをお持ちの方はこちら'));
    expect(onSwitchToLogin).toHaveBeenCalledTimes(1);
  });

  it('パスワードの要件（12文字以上・大小英数記号）をヒントとして表示する', () => {
    render(<Register onRegister={onRegister} onSwitchToLogin={onSwitchToLogin} />);
    expect(screen.getByText('12文字以上、大文字・小文字・数字・記号を含めてください')).toBeInTheDocument();
  });
});
