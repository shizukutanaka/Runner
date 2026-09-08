import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import TriageQueue from '../TriageQueue';

// E-31で「Dashboard.jsがTriageQueueへ空配列を固定で渡していた」欠陥を直したが、
// TriageQueue自身にはテストが無かった。ここで固定するのは:
//   1. 対応待ちが無ければAPIを叩かない（無駄打ちしない）
//   2. 対応待ちがあれば /insights/triage を叩き、結果（キュー内訳・件数）を描画する
//   3. 取得に失敗したら、成功したように見せず理由を表示する
//   4. チャンネルリスクが取れた場合は、それを踏まえて再トリアージした結果を使う
//      （risk取得が失敗しても、最初のトリアージ結果はそのまま使える）
vi.mock('axios');

const PENDING_COMMENTS = [
  { id: 'c1', content: 'ひどい', user: 'u1', platform: 'youtube', timestamp: new Date().toISOString(), moderationScore: 0.9 }
];

const TRIAGE_RESPONSE = {
  data: {
    data: {
      queues: {
        EMERGENCY: [{ commentId: 'c1', content: 'ひどい', user: 'u1', priorityScore: 0.95 }],
        URGENT: [], ROUTINE: [], CAN_WAIT: []
      },
      summary: { emergency: 1, urgent: 0 },
      insight: '緊急度の高いコメントが1件あります'
    }
  }
};

describe('TriageQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('対応待ちコメントが無ければ、APIを一切呼ばない', () => {
    render(<TriageQueue pendingComments={[]} />);
    expect(screen.getByText('対応待ちコメントがありません')).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('対応待ちがあれば /insights/triage を呼び、結果を描画する', async () => {
    axios.get.mockResolvedValue({ data: { data: { level: 'high', riskScore: 0.8 } } });
    axios.post.mockResolvedValue(TRIAGE_RESPONSE);

    render(<TriageQueue platform="youtube" channelId="ch1" pendingComments={PENDING_COMMENTS} />);

    expect(await screen.findByText('緊急度の高いコメントが1件あります')).toBeInTheDocument();
    expect(screen.getByText('ひどい')).toBeInTheDocument();
    expect(screen.getByText('@u1')).toBeInTheDocument();

    // 最初のリクエストで送るペイロードは、渡されたpendingCommentsそのもの
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/insights/triage'),
      expect.objectContaining({ pendingComments: PENDING_COMMENTS })
    );
  });

  it('チャンネルリスクが取得できたら、それを踏まえて再トリアージする', async () => {
    axios.get.mockResolvedValue({ data: { data: { level: 'high', riskScore: 0.8 } } });
    axios.post.mockResolvedValue(TRIAGE_RESPONSE);

    render(<TriageQueue platform="youtube" channelId="ch1" pendingComments={PENDING_COMMENTS} />);
    await screen.findByText('緊急度の高いコメントが1件あります');

    // 初回トリアージ + risk込みの再トリアージで、triageへのPOSTは2回
    expect(axios.post).toHaveBeenCalledTimes(2);
    const secondCallBody = axios.post.mock.calls[1][1];
    expect(secondCallBody.channelContext).toMatchObject({ riskLevel: 'high', riskScore: 0.8 });
  });

  it('チャンネルリスクの取得に失敗しても、最初のトリアージ結果をそのまま使う', async () => {
    axios.get.mockRejectedValue(new Error('risk unavailable'));
    axios.post.mockResolvedValue(TRIAGE_RESPONSE);

    render(<TriageQueue platform="youtube" channelId="ch1" pendingComments={PENDING_COMMENTS} />);

    expect(await screen.findByText('緊急度の高いコメントが1件あります')).toBeInTheDocument();
    // riskが無いので再トリアージは発生せず、triageへのPOSTは1回だけ
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('取得に失敗したら、成功したように見せず理由を表示する', async () => {
    axios.get.mockRejectedValue(new Error('risk unavailable'));
    axios.post.mockRejectedValue(new Error('network error'));

    render(<TriageQueue platform="youtube" channelId="ch1" pendingComments={PENDING_COMMENTS} />);

    expect(await screen.findByText('トリアージの取得に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('緊急度の高いコメントが1件あります')).not.toBeInTheDocument();
  });

  it('対応待ちの件数がゼロから増えると、その時点でAPIを呼ぶ', async () => {
    axios.get.mockResolvedValue({ data: { data: null } });
    axios.post.mockResolvedValue(TRIAGE_RESPONSE);

    const { rerender } = render(<TriageQueue pendingComments={[]} />);
    expect(axios.post).not.toHaveBeenCalled();

    rerender(<TriageQueue pendingComments={PENDING_COMMENTS} />);
    await waitFor(() => expect(axios.post).toHaveBeenCalled());
  });
});
