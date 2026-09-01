import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  CircularProgress,
  Alert,
  useTheme,
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { useTranslation } from 'react-i18next';
import { fetchAnalyticsOverview } from '../api/comments';

// ---------------------------------------------------------------------------
// このパネルの経緯（重要）
// ---------------------------------------------------------------------------
// 以前このコンポーネントは `getCommentStats()` 経由で `/api/comments/stats` を
// 叩いていたが、**そのエンドポイントはバックエンドに存在しない**。
// つまり毎回404を受け取り、catch節で `getDemoStats()` にフォールバックして
// ハードコードされた数値（コメント1240件・感情620/420/200 等）を表示していた。
// 「デモデータを表示しています」というバナーは出ていたものの、
// **このタブは一度も実データを表示したことがなかった**。
//
// 現在は実在する分析エンドポイント（/analytics/stats・/graph・/moderation）を
// 合成して表示する。バックエンドが持っていない指標は**捏造せず、描画しない**:
//   - 感情分布の円グラフ … 感情の集計APIが存在しない
//   - プラットフォーム別の棒グラフ … 取り込み元別の集計APIが存在しない
//   - モデレーション理由別の内訳 … 理由別の集計APIが存在しない
//   - 「今日の新規」「ポジティブ率」 … 対応するデータが無い
//   - 期間セレクタ … /graph は直近7日固定でパラメータを受け取らない
// これらが必要なら、まずバックエンドに集計を実装すること。
// UIだけ先に置くと、また偽の数字を表示することになる。

function StatCard({ title, value, subtitle, color }) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{ p: 2.5, borderRadius: 2, border: `1px solid ${theme.palette.divider}`, height: '100%' }}
    >
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {title}
      </Typography>
      <Typography variant="h4" fontWeight={700} sx={{ color: color || 'text.primary' }}>
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
}

// 値が無いことを 0 と偽らない。取得できていない指標は「—」で示す
const show = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString());

export default function AnalyticsPanel() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setStats(await fetchAnalyticsOverview());
    } catch (err) {
      // デモデータへのフォールバックはしない。取得できないなら、そう表示する
      setStats(null);
      setLoadError(err?.message || t('analytics_load_failed', '分析データを取得できませんでした'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const s = stats;
  const hasTimeline = Boolean(s?.timelineLabels?.length);
  const statusEntries = s?.byStatus ? Object.entries(s.byStatus) : [];

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
        {t('analytics_panel_title', 'アナリティクス')}
      </Typography>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && loadError && (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {loadError}
        </Alert>
      )}

      {!loading && !loadError && s && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={3}>
              <StatCard
                title={t('total_comments', '総コメント数')}
                value={show(s.total)}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                title={t('moderated_comments', 'モデレーション対象')}
                value={show(s.moderated)}
                subtitle={s.moderationRate === null ? undefined : `${s.moderationRate}%`}
                color={theme.palette.warning.main}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                title={t('active_users', 'アクティブユーザー')}
                value={show(s.activeUsers)}
                color={theme.palette.success.main}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                title={t('banned_users', 'BAN済みユーザー')}
                value={show(s.bannedUsers)}
                color={theme.palette.error.main}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} md={7}>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="subtitle2" gutterBottom>
                  {t('daily_comments_and_bans', '日別のコメント数とBAN数（直近7日）')}
                </Typography>
                {hasTimeline ? (
                  <LineChart
                    height={280}
                    xAxis={[{ scaleType: 'point', data: s.timelineLabels }]}
                    series={[
                      { data: s.timelineComments ?? [], label: t('comments', 'コメント'), color: theme.palette.primary.main },
                      { data: s.timelineBans ?? [], label: 'BAN', color: theme.palette.error.main },
                    ]}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
                    {t('no_data_yet', 'まだデータがありません')}
                  </Typography>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} md={5}>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="subtitle2" gutterBottom>
                  {t('comments_by_status', 'ステータス別コメント数')}
                </Typography>
                {statusEntries.length > 0 ? (
                  <BarChart
                    height={280}
                    xAxis={[{ scaleType: 'band', data: statusEntries.map(([k]) => k) }]}
                    series={[{ data: statusEntries.map(([, v]) => v), color: theme.palette.primary.main }]}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
                    {t('no_data_yet', 'まだデータがありません')}
                  </Typography>
                )}
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
