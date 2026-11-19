import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LiveChatWatchPanel from '../LiveChatWatchPanel';
import { getYouTubeWatches, startYouTubeWatch, stopYouTubeWatch } from '../../api/youtube';

// バックエンドには POST /api/youtube/watch があり、取り込んだコメントは
// モデレーション・保留キューまで流れる。しかし画面から呼ぶ手段が無く、
// 利用者はログイン後に**何をしてもコメントが1件も来ない**状態だった。
// ここでは「URLを貼って開始」が実APIに届くこと、失敗を成功に見せないことを固定する
const stableT = (_key, fallback) => fallback ?? _key;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

vi.mock('../../api/youtube', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    extractYouTubeVideoId: actual.extractYouTubeVideoId,
    getYouTubeWatches: vi.fn(),
    startYouTubeWatch: vi.fn(),
    stopYouTubeWatch: vi.fn(),
  };
});

const reasonError = (reason) => Object.assign(new Error(`Failed: ${reason}`), { reason });

describe('LiveChatWatchPanel', () => {
  beforeEach(() => {
    getYouTubeWatches.mockReset().mockResolvedValue({ enabled: true, watches: [] });
    startYouTubeWatch.mockReset().mockResolvedValue({ started: true });
    stopYouTubeWatch.mockReset().mockResolvedValue(undefined);
  });

  it('アドレスバーのURLを貼るだけで、動画IDに変換して監視開始APIを呼ぶ', async () => {
    const user = userEvent.setup();
    render(<LiveChatWatchPanel />);
    await user.type(screen.getByLabelText('YouTube の配信URLまたは動画ID'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s');
    getYouTubeWatches.mockResolvedValue({
      enabled: true,
      watches: [{ videoId: 'dQw4w9WgXcQ', startedAt: '2026-11-19T00:00:00Z' }],
    });
    await user.click(screen.getByRole('button', { name: '監視を開始' }));

    expect(startYouTubeWatch).toHaveBeenCalledWith('dQw4w9WgXcQ');
    expect(await screen.findByText('YouTube: dQw4w9WgXcQ')).toBeInTheDocument();
  });

  it('動画IDを取り出せない入力ではAPIを呼ばずに理由を示す', async () => {
    const user = userEvent.setup();
    render(<LiveChatWatchPanel />);
    await user.type(screen.getByLabelText('YouTube の配信URLまたは動画ID'), 'https://example.com/watch?v=abc');
    await user.click(screen.getByRole('button', { name: '監視を開始' }));

    expect(startYouTubeWatch).not.toHaveBeenCalled();
    expect(screen.getByText(/11文字の動画ID/)).toBeInTheDocument();
  });

  it('ライブ中でない動画は、失敗理由を利用者の言葉で示し一覧に載せない', async () => {
    startYouTubeWatch.mockRejectedValueOnce(reasonError('not_live'));
    const user = userEvent.setup();
    render(<LiveChatWatchPanel />);
    await user.type(screen.getByLabelText('YouTube の配信URLまたは動画ID'), 'dQw4w9WgXcQ');
    await user.click(screen.getByRole('button', { name: '監視を開始' }));

    expect(await screen.findByText(/現在ライブ配信中ではありません/)).toBeInTheDocument();
    expect(screen.queryByText('YouTube: dQw4w9WgXcQ')).not.toBeInTheDocument();
  });

  it('APIキー未設定（enabled:false）なら、開始前に設定方法を示す', async () => {
    getYouTubeWatches.mockResolvedValue({ enabled: false, watches: [] });
    render(<LiveChatWatchPanel />);
    expect(await screen.findByText(/YOUTUBE_API_KEY が未設定です/)).toBeInTheDocument();
  });

  it('監視中の配信を停止できる', async () => {
    getYouTubeWatches.mockResolvedValue({
      enabled: true,
      watches: [{ videoId: 'dQw4w9WgXcQ', startedAt: '2026-11-19T00:00:00Z' }],
    });
    const user = userEvent.setup();
    render(<LiveChatWatchPanel />);
    await user.click(await screen.findByRole('button', { name: '監視を停止 dQw4w9WgXcQ' }));

    await waitFor(() => expect(stopYouTubeWatch).toHaveBeenCalledWith('dQw4w9WgXcQ'));
  });
});
