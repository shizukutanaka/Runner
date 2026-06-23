import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  useTheme,
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { useTranslation } from 'react-i18next';
import { getCommentStats } from '../api/comments';

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
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {subtitle}
        </Typography>
      )}
    </Paper>
  );
}

function getDemoStats() {
  return {
    total:          1240,
    newToday:       87,
    moderated:      124,
    moderationRate: 10,
    positiveRate:   62,
    activeUsers:    348,
    timelineLabels: ['0:00','2:00','4:00','6:00','8:00','10:00','12:00','14:00','16:00','18:00','20:00','22:00'],
    youtubeData:    [35, 28, 20, 18, 30, 55, 80, 95, 88, 102, 90, 75],
    twitchData:     [20, 15, 12, 10, 22, 40, 60, 72, 68,  80, 70, 58],
    sentimentData: [
      { id: 0, value: 620, label: 'ポジティブ', color: '#4caf50' },
      { id: 1, value: 420, label: 'ニュートラル', color: '#ff9800' },
      { id: 2, value: 200, label: 'ネガティブ', color: '#f44336' },
    ],
    moderationReasons: {
      labels: ['スパム', '暴言', '宣伝', '有害リンク'],
      counts: [54, 38, 22, 10],
    },
    platformLabels: ['YouTube', 'Twitch'],
    platformCounts: [820, 420],
  };
}

export default function AnalyticsPanel() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [timeframe, setTimeframe] = useState('24h');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setApiError(false);
    try {
      const data = await getCommentStats(timeframe);
      setStats(data?.data || data);
    } catch {
      setApiError(true);
      setStats(getDemoStats());
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const s = stats || getDemoStats();

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h6" fontWeight={600}>
          {t('analytics_panel_title', 'アナリティクス')}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>{t('timeframe', '期間')}</InputLabel>
          <Select
            value={timeframe}
            label={t('timeframe', '期間')}
            onChange={(e) => setTimeframe(e.target.value)}
          >
            <MenuItem value="1h">{t('last_1h', '過去1時間')}</MenuItem>
            <MenuItem value="24h">{t('last_24h', '過去24時間')}</MenuItem>
            <MenuItem value="7d">{t('last_7d', '過去7日間')}</MenuItem>
            <MenuItem value="30d">{t('last_30d', '過去30日間')}</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && (
        <>
          {apiError && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
              {t('showing_demo_data', 'APIが利用不可のため、デモデータを表示しています')}
            </Alert>
          )}

          {/* KPI カード */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={3}>
              <StatCard
                title={t('total_comments', '総コメント数')}
                value={(s.total ?? 0).toLocaleString()}
                subtitle={`+${s.newToday ?? 0} ${t('today', '今日')}`}
                color={theme.palette.primary.main}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                title={t('moderated', 'モデレーション済み')}
                value={(s.moderated ?? 0).toLocaleString()}
                subtitle={`${s.moderationRate ?? 0}%`}
                color={theme.palette.warning.main}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                title={t('positive_rate', 'ポジティブ率')}
                value={`${s.positiveRate ?? 0}%`}
                subtitle={t('sentiment_score', 'センチメント')}
                color="#4caf50"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                title={t('active_users', 'アクティブユーザー')}
                value={(s.activeUsers ?? 0).toLocaleString()}
                subtitle={t('unique_commenters', 'ユニーク投稿者')}
                color={theme.palette.secondary.main}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            {/* 時間別コメント数 */}
            <Grid item xs={12} md={8}>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  {t('comments_over_time', '時間別コメント数')}
                </Typography>
                <LineChart
                  height={220}
                  xAxis={[{ scaleType: 'point', data: s.timelineLabels ?? [] }]}
                  series={[
                    { data: s.youtubeData ?? [], label: 'YouTube', color: '#ff0000' },
                    { data: s.twitchData ?? [],  label: 'Twitch',  color: '#9147ff' },
                  ]}
                  margin={{ top: 10, right: 20, bottom: 30, left: 40 }}
                />
              </Paper>
            </Grid>

            {/* センチメント内訳 */}
            <Grid item xs={12} md={4}>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  {t('sentiment_breakdown', 'センチメント内訳')}
                </Typography>
                <PieChart
                  height={220}
                  series={[{
                    data: s.sentimentData ?? [],
                    innerRadius: 55,
                    outerRadius: 85,
                    highlightScope: { faded: 'global', highlighted: 'item' },
                  }]}
                  margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                />
              </Paper>
            </Grid>

            {/* モデレーション理由 */}
            <Grid item xs={12} md={6}>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  {t('moderation_reasons', 'モデレーション理由')}
                </Typography>
                <BarChart
                  height={200}
                  xAxis={[{ scaleType: 'band', data: s.moderationReasons?.labels ?? [] }]}
                  series={[{ data: s.moderationReasons?.counts ?? [], color: theme.palette.error.main }]}
                  margin={{ top: 10, right: 20, bottom: 40, left: 40 }}
                />
              </Paper>
            </Grid>

            {/* プラットフォーム分布 */}
            <Grid item xs={12} md={6}>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  {t('platform_distribution', 'プラットフォーム分布')}
                </Typography>
                <BarChart
                  height={200}
                  xAxis={[{ scaleType: 'band', data: s.platformLabels ?? [] }]}
                  series={[{
                    data: s.platformCounts ?? [],
                    color: theme.palette.primary.main,
                  }]}
                  margin={{ top: 10, right: 20, bottom: 40, left: 40 }}
                />
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
