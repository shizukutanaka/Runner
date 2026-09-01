import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HeldMessagesQueue from '../HeldMessagesQueue';
import { fetchHeldMessages } from '../../api/moderation';

// 保留キューのバッジは、**モデレーターが「なぜ保留されたか」を知る唯一の手段**である。
// バッジが壊れても画面は正常に見えるため、壊れたことに気づけない。
// R-14（構造化された理由の提示は判断を約7.4%高速化: arXiv:2406.04106）に基づき
// 追加した表示なので、その配線を固定する。
//
// 特に区別が必要なもの:
//   - つきまとい示唆（R-31）… 通報や証拠保全が要る可能性があり、他のthreatと対応が違う
//   - 標的型ハラスメント（R-33）… NG語を1つも含まないため、バッジが無いと
//     モデレーターは「なぜこれが保留されたのか」を全く理解できない
const stableT = (_key, fallback) => fallback;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));
vi.mock('../../api/moderation', () => ({
  fetchHeldMessages: vi.fn(),
  processHeldMessage: vi.fn()
}));

const held = (reasons) => ({
  messages: [{
    id: 1, user: 'viewer', platform: 'youtube', content: 'テスト',
    riskScore: 0.8, holdLevel: 'high', holdReason: 'テスト理由', status: 'pending',
    reasons
  }],
  pending: 1, approved: 0, rejected: 0, expired: 0
});

describe('保留キューの理由バッジ', () => {
  beforeEach(() => fetchHeldMessages.mockReset());

  it('NGワードのカテゴリを日本語ラベルで示す', async () => {
    fetchHeldMessages.mockResolvedValue(held([
      { type: 'ng_word_category', categories: ['abuse', 'threat'], words: ['死ね'] }
    ]));
    render(<HeldMessagesQueue />);
    await waitFor(() => expect(screen.getByText('暴言')).toBeInTheDocument());
    expect(screen.getByText('脅迫')).toBeInTheDocument();
  });

  it('つきまとい示唆を専用バッジで区別する（R-31）', async () => {
    fetchHeldMessages.mockResolvedValue(held([
      { type: 'ng_word_category', categories: ['threat'], words: ['stalking:knows_whereabouts'] }
    ]));
    render(<HeldMessagesQueue />);
    await waitFor(() => expect(screen.getByText('つきまとい示唆')).toBeInTheDocument());
  });

  it('語彙に頼らない標的型ハラスメントを名指しする（R-33）', async () => {
    fetchHeldMessages.mockResolvedValue(held([
      { type: 'ng_word_category', categories: ['abuse'], words: ['harassment:worthlessness_and_quit'] }
    ]));
    render(<HeldMessagesQueue />);
    await waitFor(() => expect(screen.getByText('活動の否定')).toBeInTheDocument());
  });

  it('Twitch AutoMod由来はカテゴリとレベルを示す（R-32）', async () => {
    fetchHeldMessages.mockResolvedValue(held([
      { type: 'twitch_automod', autoModReason: 'automod', category: 'aggression', level: 3 }
    ]));
    render(<HeldMessagesQueue />);
    await waitFor(() => expect(screen.getByText(/Twitch AutoMod: aggression Lv3/)).toBeInTheDocument());
  });

  it('AutoModの禁止語は該当語を見せる（何が引っかかったか分かるように）', async () => {
    fetchHeldMessages.mockResolvedValue(held([
      { type: 'twitch_automod', autoModReason: 'blocked_term', blockedTerms: ['ngword'] }
    ]));
    render(<HeldMessagesQueue />);
    await waitFor(() => expect(screen.getByText(/禁止語\(ngword\)/)).toBeInTheDocument());
  });

  it('レイド防御による自動隔離は理由（新規/同一内容）まで示す（R-25）', async () => {
    fetchHeldMessages.mockResolvedValue(held([
      { type: 'raid_defense', trigger: 'first_seen' }
    ]));
    render(<HeldMessagesQueue />);
    await waitFor(() => expect(screen.getByText(/レイド防御\(新規アカウント\)/)).toBeInTheDocument());
  });

  it('累犯は回数と推奨アクションを示す（R-26）', async () => {
    fetchHeldMessages.mockResolvedValue(held([
      { type: 'repeat_offender', violations: 3, escalation: 'ban_recommended' }
    ]));
    render(<HeldMessagesQueue />);
    await waitFor(() => expect(screen.getByText(/累犯3回・BAN推奨/)).toBeInTheDocument());
  });

  it('理由が無い場合でも落ちない', async () => {
    fetchHeldMessages.mockResolvedValue(held(undefined));
    render(<HeldMessagesQueue />);
    await waitFor(() => expect(screen.getByText('テスト理由')).toBeInTheDocument());
  });
});
