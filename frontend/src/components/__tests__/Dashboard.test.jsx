import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import Dashboard from '../Dashboard';

// ---------------------------------------------------------------------------
// なぜこの画面か
// ---------------------------------------------------------------------------
// Dashboard は全タブの親であり、子に何を渡すかを決める唯一の場所である。
// そして `TriageQueue` には **`pendingComments={[]}` という空配列リテラル**が
// 直接書かれていた。
//
// トリアージは「どのコメントから見るべきか」を優先度順に並べる機能で、
// バックエンドのサービスも画面側の300行も動く。にもかかわらず
// **入力が常に空なので、一度も何かを表示したことがない**。
// 画面には見出しとタブが出るので、機能があるようには見える。
//
// これは E-26（架空の統計値）と同じ「動いているように見えるが動いていない」で、
// 見え方が逆——捏造ではなく、常に空——なだけである。
// どちらも、実データが流れていることをテストでしか確かめられない。
const stableT = (key, fallback) => fallback ?? key;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

// 子コンポーネントは重いので、受け取った props を出すだけの替え玉にする。
// ここで見たいのは「Dashboard が何を渡すか」だけである
vi.mock('../CommentTimeline', () => ({ default: () => <div>timeline</div> }));
vi.mock('../UserPanel', () => ({ default: () => <div>users</div> }));
vi.mock('../AnalyticsPanel', () => ({ default: () => <div>analytics</div> }));
vi.mock('../SettingsPanel', () => ({ default: () => <div>settings</div> }));
vi.mock('../ModeratorDashboard', () => ({ default: () => <div>moderator</div> }));
vi.mock('../MonitoringDashboard', () => ({ default: () => <div>monitoring</div> }));
vi.mock('../CommunityHealthWidget', () => ({ default: () => <div>health</div> }));
vi.mock('../SilentDepartureAlert', () => ({ default: () => <div>departure</div> }));
vi.mock('../ContextAnalysisPanel', () => ({ default: () => <div>context</div> }));
vi.mock('../TriageQueue', () => ({
  default: ({ pendingComments }) => (
    <div data-testid="triage">{`triage:${pendingComments.length}`}</div>
  )
}));

const COMMENT = {
  id: 'c-1', user: 'viewer1', content: '対象コメント',
  platform: 'youtube', timestamp: new Date().toISOString(),
  status: 'visible', moderationScore: 0.8
};
const COMMENTS = [COMMENT];
vi.mock('../../hooks/useComments', () => ({
  useComments: () => ({ comments: COMMENTS, loading: false, error: null })
}));

describe('Dashboard が子に実データを渡すこと', () => {
  beforeEach(() => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { data: {} } });
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: {} } });
  });

  it('モデレータータブの TriageQueue に取得済みコメントが渡る', async () => {
    render(<Dashboard />);
    // モデレータータブは2番目。TabPanel は非表示タブを描画しないので切り替える
    const tab = await screen.findByRole('tab', { name: /Moderator/i });
    tab.click();

    await waitFor(() => {
      expect(screen.getByTestId('triage')).toHaveTextContent('triage:1');
    });
  });

  it('空配列リテラルが直接書かれていない', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/Dashboard.js'), 'utf8'
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // `pendingComments={[]}` に戻ると、トリアージは再び永久に空になる
    expect(src).not.toMatch(/pendingComments=\{\[\]\}/);
  });
});
