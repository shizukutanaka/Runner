import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../Login';

// ---------------------------------------------------------------------------
// なぜこの画面にテストが無かったのか、なぜ必要か
// ---------------------------------------------------------------------------
// `docs/STRENGTHS_WEAKNESSES.md` は Login / Register / MonitoringDashboard /
// TriageQueue を「テストが無い画面」として繰り返し記録してきた。読んでみると
// コード自体は素直だが、**素直に見えることと壊れていないことは別**という
// のが本セッション全体の教訓（E-31・E-38等）である。ここで固定すべきは:
//   1. 空欄では送信できない（誤操作でAPIを叩かない）
//   2. 送信中はボタンが多重送信を防ぐ状態になる
//   3. 失敗したら「成功したように見えない」（E-25/E-26系の教訓の裏返し）
//   4. ユーザー名の前後空白を送信前に取り除く（バックエンドの
//      register/loginは前後空白を要求しない）
const stableT = (_key, fallback) => fallback ?? _key;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

describe('Login', () => {
  let onLogin;
  let onSwitchToRegister;

  beforeEach(() => {
    onLogin = vi.fn();
    onSwitchToRegister = vi.fn();
  });

  it('ユーザー名かパスワードが空の間、送信ボタンは無効', async () => {
    const user = userEvent.setup();
    render(<Login onLogin={onLogin} />);

    const submit = screen.getByRole('button', { name: 'ログイン' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('ユーザー名またはメールアドレス'), 'mod1');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('パスワード'), 'pass');
    expect(submit).not.toBeDisabled();
  });

  it('送信すると前後の空白を取り除いたユーザー名でonLoginを呼ぶ', async () => {
    onLogin.mockResolvedValue({ user: { id: '1' } });
    const user = userEvent.setup();
    render(<Login onLogin={onLogin} />);

    await user.type(screen.getByLabelText('ユーザー名またはメールアドレス'), '  mod1  ');
    await user.type(screen.getByLabelText('パスワード'), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('mod1', 'SecurePass123!'));
  });

  it('送信に失敗したら、成功したように見せず理由を表示する', async () => {
    onLogin.mockRejectedValue(new Error('ユーザー名またはパスワードが正しくありません'));
    const user = userEvent.setup();
    render(<Login onLogin={onLogin} />);

    await user.type(screen.getByLabelText('ユーザー名またはメールアドレス'), 'mod1');
    await user.type(screen.getByLabelText('パスワード'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByText('ユーザー名またはパスワードが正しくありません')).toBeInTheDocument();
    // ボタンは再び押せる状態に戻り、失敗を隠さない
    await waitFor(() => expect(screen.getByRole('button', { name: 'ログイン' })).not.toBeDisabled());
  });

  it('送信中はローディング表示になり、入力欄が操作できない（多重送信の防止）', async () => {
    let resolveLogin;
    onLogin.mockReturnValue(new Promise((resolve) => { resolveLogin = resolve; }));
    const user = userEvent.setup();
    render(<Login onLogin={onLogin} />);

    await user.type(screen.getByLabelText('ユーザー名またはメールアドレス'), 'mod1');
    await user.type(screen.getByLabelText('パスワード'), 'SecurePass123!');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(screen.getByLabelText('ユーザー名またはメールアドレス')).toBeDisabled();
    expect(screen.getByLabelText('パスワード')).toBeDisabled();
    expect(onLogin).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLogin({ user: { id: '1' } });
    });
    await waitFor(() => expect(screen.getByLabelText('ユーザー名またはメールアドレス')).not.toBeDisabled());
  });

  it('登録画面への切り替えリンクがonSwitchToRegisterを呼ぶ', async () => {
    const user = userEvent.setup();
    render(<Login onLogin={onLogin} onSwitchToRegister={onSwitchToRegister} />);

    await user.click(screen.getByText('アカウントをお持ちでない方はこちら'));
    expect(onSwitchToRegister).toHaveBeenCalledTimes(1);
  });

  it('onSwitchToRegisterが渡されなければ、切り替えリンクは表示されない', () => {
    render(<Login onLogin={onLogin} />);
    expect(screen.queryByText('アカウントをお持ちでない方はこちら')).not.toBeInTheDocument();
  });
});
