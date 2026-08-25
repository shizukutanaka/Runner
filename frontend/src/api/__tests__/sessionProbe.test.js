import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// D-7 で実際に踏んだ無限リロードの回帰テスト。
//
// Cookie方式では「ログイン済みか」をJSから判定できないため、`useAuth` は起動時に
// 必ず `GET /users/me` を投げる。ログイン画面では当然401が返る。
// このとき axios のレスポンスインターセプタが
//   401 → リフレッシュ試行 → 失敗 → window.location.href = '/login'
// を実行すると、遷移先で再び `useAuth` が走り、**リロードが永久に繰り返される**。
// 実測でこの状態になり、画面が真っ白のまま `/login` へのナビゲーションを
// 繰り返していた（さらにリフレッシュ連打でレートリミットの429まで踏んだ）。
//
// 対策は2つで、このテストは両方を固定する:
//   1. セッション確認の問い合わせは `_isSessionProbe` を立てて再試行・遷移の対象外にする
//   2. 既に /login にいる場合は遷移しない
describe('セッション確認の401が無限ループにならないこと（D-7）', () => {
  let assignedHref;

  beforeEach(async () => {
    vi.resetModules();
    assignedHref = null;
    delete window.location;
    window.location = {
      pathname: '/login',
      get href() { return assignedHref; },
      set href(v) { assignedHref = v; }
    };
    // インターセプタを登録させる
    await import('../comments');
  });

  afterEach(() => {
    axios.interceptors.response.clear();
    axios.interceptors.request.clear();
  });

  const rejectWith = (config) => {
    const handlers = axios.interceptors.response.handlers.filter(Boolean);
    const onRejected = handlers[handlers.length - 1].rejected;
    return onRejected({ config, response: { status: 401 } });
  };

  it('セッション確認(_isSessionProbe)の401では /login へ遷移しない', async () => {
    await rejectWith({ url: '/api/users/me', _isSessionProbe: true }).catch(() => {});
    expect(assignedHref).toBeNull();
  });

  it('セッション確認の401ではリフレッシュを試みない（429の連打を防ぐ）', async () => {
    const config = { url: '/api/users/me', _isSessionProbe: true };
    await rejectWith(config).catch(() => {});
    // リフレッシュを試みていれば再試行フラグが立つ
    expect(config._retriedAfterRefresh).toBeUndefined();
  });

  it('/login にいる間は通常の401でも遷移しない（ループの余地を無くす）', async () => {
    await rejectWith({ url: '/api/comments' }).catch(() => {});
    expect(assignedHref).toBeNull();
  });

  it('/login 以外での通常の401は /login へ遷移する', async () => {
    window.location.pathname = '/dashboard';
    await rejectWith({ url: '/api/comments', _retriedAfterRefresh: true }).catch(() => {});
    expect(assignedHref).toBe('/login');
  });
});
