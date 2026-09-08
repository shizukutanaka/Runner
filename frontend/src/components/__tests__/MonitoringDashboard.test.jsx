import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import MonitoringDashboard from '../MonitoringDashboard';

// E-29・E-30で監視系のバックエンドは直したが、フロントの
// MonitoringDashboard.js自体にはテストが無かった。ここで固定するのは:
//   1. 4本の並列取得（system/app/logs/alerts）が正しいURLへ行くこと
//   2. 全滅したら「取得できませんでした」という失敗を隠さない画面になり、
//      再試行ボタンで再取得できること
//   3. 一部だけ失敗しても、取れた分はきちんと表示し、
//      失敗したことも隠さず警告として出すこと（部分成功≠全成功の見た目にしない）
//   4. 取得したCPU使用率等の実データがそのまま出ること（架空の数字を出さない）
vi.mock('axios');

// MonitoringDashboard.js は t(key) をフォールバック無しで呼ぶ箇所がある
// （例: t('monitoring_dashboard_partial_error')）。他コンポーネントで使っている
// `t = (key, fallback) => fallback ?? key` はこの場合キーそのものを返してしまい、
// 「本物の翻訳文が出ているか」ではなく「モックの退化動作」を検証することになる。
// 実際に src/locales/ja.json にある文言で裏付ける。
const JA_STRINGS = {
  monitoring_dashboard_partial_error: '一部の監視データの取得に失敗しました。最新の情報を表示するには再試行してください。',
};
const t = (key, fallback) => JA_STRINGS[key] ?? fallback ?? key;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));

const SYSTEM_STATS = {
  cpu: { usage: 42, cores: 8 },
  memory: { usagePercent: 55, used: 4 * 1024 ** 3, total: 8 * 1024 ** 3 },
  disk: [{ usePercent: 60, used: 100 * 1024 ** 3, size: 200 * 1024 ** 3 }],
  network: { totalRxBytes: 1024, totalTxBytes: 2048 },
  system: { platform: 'linux', arch: 'x64', hostname: 'runner-host', uptime: 3661, nodeVersion: 'v20.0.0', environment: 'test' },
  processes: { total: 12 },
  rateLimits: { byLimiter: {} }
};

const ok = (data) => Promise.resolve({ data: { data } });
const fail = () => Promise.reject(new Error('network error'));

const urlOf = (call) => call[0];

describe('MonitoringDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('起動時にsystem/app/logs/alertsの4本を正しいURLへ並列取得する', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/system/stats')) return ok(SYSTEM_STATS);
      if (url.includes('/app/stats')) return ok({ summary: {} });
      if (url.includes('/logs')) return ok({ logs: [] });
      if (url.includes('/alerts')) return ok({ alerts: [] });
      return fail();
    });

    render(<MonitoringDashboard />);
    await screen.findByText('42%');

    const calledUrls = axios.get.mock.calls.map(urlOf);
    expect(calledUrls.some((u) => u.includes('/api/monitoring/system/stats'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/api/monitoring/app/stats'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/api/monitoring/logs'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/api/monitoring/alerts'))).toBe(true);
  });

  it('取得した実データ（CPU使用率・コア数）をそのまま表示する', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/system/stats')) return ok(SYSTEM_STATS);
      return ok({ summary: {}, logs: [], alerts: [] });
    });

    render(<MonitoringDashboard />);

    expect(await screen.findByText('42%')).toBeInTheDocument();
    expect(screen.getByText('コア数: 8')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
  });

  it('4本すべて失敗したら、失敗を隠さず再試行ボタンを出す', async () => {
    axios.get.mockImplementation(() => fail());

    render(<MonitoringDashboard />);

    expect(await screen.findByText('システム統計を取得できませんでした')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: '再試行' });
    expect(retryButton).toBeInTheDocument();

    // 何も取れていないのに、CPU使用率等の数字が捏造されて出ていないこと
    expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument();
  });

  it('再試行ボタンを押すと、再度4本取得し直す', async () => {
    axios.get.mockImplementation(() => fail());
    const user = userEvent.setup();
    render(<MonitoringDashboard />);
    await screen.findByRole('button', { name: '再試行' });

    const callsBeforeRetry = axios.get.mock.calls.length;
    axios.get.mockImplementation((url) => {
      if (url.includes('/system/stats')) return ok(SYSTEM_STATS);
      return ok({ summary: {}, logs: [], alerts: [] });
    });

    await user.click(screen.getByRole('button', { name: '再試行' }));

    await screen.findByText('42%');
    expect(axios.get.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });

  it('一部だけ失敗しても、取れた分は表示し、失敗したことも隠さない', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/system/stats')) return ok(SYSTEM_STATS);
      if (url.includes('/app/stats')) return ok({ summary: {} });
      // logs / alerts は失敗させる
      return fail();
    });

    render(<MonitoringDashboard />);

    // 取れたsystem statsは実データのまま表示される
    expect(await screen.findByText('42%')).toBeInTheDocument();
    // 全滅時の画面（再試行ボタンのみの大きな失敗表示）にはならない
    expect(screen.queryByText('システム統計を取得できませんでした')).not.toBeInTheDocument();
    // それでいて、一部が失敗したことは警告として出る（実際の日本語文言で検証する）
    expect(screen.getByText(
      '一部の監視データの取得に失敗しました。最新の情報を表示するには再試行してください。'
    )).toBeInTheDocument();
  });
});
