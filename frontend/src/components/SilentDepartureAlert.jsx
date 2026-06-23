/**
 * Silent Departure Alert — サイレント離脱アラート
 *
 * ソクラテス式問答から生まれた視点:
 * 「コミュニティ衰退の最初の警告は、常連が静かになること」
 * → 炭鉱のカナリア: 鳴き止んだとき危険が来る
 */

import React, { useEffect, useState, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Paper, Typography, Stack, Chip, Tooltip,
  LinearProgress, Alert, CircularProgress, useTheme,
  List, ListItem, ListItemText, Divider,
} from '@mui/material';
import {
  VolumeOff as SilentIcon,
  TrendingDown as DeclineIcon,
  CheckCircleOutline as StableIcon,
  Warning as WarnIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API = import.meta.env.VITE_API_BASE_URL || '/api';

const TREND_META = {
  stable:   { label: '安定',    color: '#4caf50', Icon: StableIcon  },
  declining:{ label: '低下中',  color: '#ff9800', Icon: DeclineIcon },
  critical: { label: '深刻',    color: '#d32f2f', Icon: WarnIcon    },
};

const RISK_COLOR = (risk) => {
  if (risk < 0.15) return '#4caf50';
  if (risk < 0.35) return '#ff9800';
  if (risk < 0.60) return '#f44336';
  return '#b71c1c';
};

// ─── サブコンポーネント ──────────────────────────────────
const SilentUserRow = memo(({ user }) => (
  <ListItem disableGutters sx={{ py: 0.25 }}>
    <ListItemText
      primary={
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary" sx={{ maxWidth: '65%' }} noWrap>
            @{user.userId}
          </Typography>
          <Chip
            label={`${user.daysSilent}日間沈黙`}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.65rem',
              fontWeight: 600,
              backgroundColor: user.daysSilent >= 7 ? '#f44336' : '#ff9800',
              color: '#fff',
            }}
          />
        </Stack>
      }
    />
  </ListItem>
));

// ─── メインコンポーネント ──────────────────────────────────
function SilentDepartureAlert({ platform = 'youtube', channelId = 'default' }) {
  const theme = useTheme();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API}/insights/silent-departure/${platform}/${channelId}`);
      setData(res.data?.data ?? null);
    } catch (e) {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [platform, channelId]);

  // 60秒ごとに更新（離脱検知は分単位でOK）
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, [platform, channelId]); // eslint-disable-line

  const trendMeta  = TREND_META[data?.trend ?? 'stable'];
  const TrendIcon  = trendMeta.Icon;
  const riskColor  = RISK_COLOR(data?.departureRisk ?? 0);
  const riskPct    = Math.round((data?.departureRisk ?? 0) * 100);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${data?.trend === 'critical' ? '#d32f2f' : theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
        <SilentIcon sx={{ color: riskColor, fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>
          常連ユーザー離脱検知
        </Typography>
        {loading && <CircularProgress size={14} sx={{ ml: 'auto' }} />}
      </Stack>

      {error && (
        <Alert severity="warning" sx={{ mb: 1, py: 0.5, fontSize: '0.78rem', borderRadius: 1.5 }}>
          {error}
        </Alert>
      )}

      {data ? (
        <>
          {/* リスクメーター */}
          <Box
            sx={{
              p: 1.5, mb: 1.5, borderRadius: 1.5,
              backgroundColor: `${riskColor}15`,
              border: `1px solid ${riskColor}40`,
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.8}>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <TrendIcon sx={{ fontSize: 16, color: trendMeta.color }} />
                <Typography variant="body2" fontWeight={600} sx={{ color: trendMeta.color }}>
                  離脱リスク
                </Typography>
              </Stack>
              <Chip
                label={trendMeta.label}
                size="small"
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, backgroundColor: trendMeta.color, color: '#fff' }}
              />
            </Stack>

            <Tooltip title={`離脱リスク: ${riskPct}%`} placement="top" arrow>
              <LinearProgress
                variant="determinate"
                value={riskPct}
                sx={{
                  height: 7, borderRadius: 4,
                  backgroundColor: `${riskColor}25`,
                  '& .MuiLinearProgress-bar': { backgroundColor: riskColor, borderRadius: 4 },
                }}
              />
            </Tooltip>

            <Stack direction="row" justifyContent="space-between" mt={0.5}>
              <Typography variant="caption" color="text.secondary">
                常連{data.regularUserCount}名中{data.silentUserCount}名が沈黙
              </Typography>
              <Typography variant="caption" fontWeight={600} sx={{ color: riskColor }}>
                {riskPct}%
              </Typography>
            </Stack>
          </Box>

          {/* インサイト */}
          {data.insight && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              💡 {data.insight}
            </Typography>
          )}
          {data.action && (
            <Typography variant="caption" sx={{ display: 'block', mb: 1, color: theme.palette.warning.dark }}>
              👉 {data.action}
            </Typography>
          )}

          {/* 沈黙ユーザーリスト（上位5名） */}
          {data.silentUsers?.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.disabled" fontWeight={600} mb={0.5} display="block">
                沈黙中の常連ユーザー（上位{Math.min(5, data.silentUsers.length)}名）
              </Typography>
              <List dense disablePadding>
                {data.silentUsers.slice(0, 5).map(u => (
                  <SilentUserRow key={u.userId} user={u} />
                ))}
              </List>
            </>
          )}

          {data.silentUsers?.length === 0 && data.regularUserCount > 0 && (
            <Typography variant="body2" color="success.main" align="center" py={0.5}>
              全常連ユーザーが活発です
            </Typography>
          )}
        </>
      ) : (
        !loading && (
          <Typography variant="body2" color="text.secondary" align="center" py={1}>
            コメントが蓄積されると常連ユーザーを追跡します
          </Typography>
        )
      )}
    </Paper>
  );
}

SilentDepartureAlert.propTypes = {
  platform: PropTypes.string,
  channelId: PropTypes.string,
};

SilentDepartureAlert.defaultProps = {
  platform: 'youtube',
  channelId: 'default',
};

export default SilentDepartureAlert;
