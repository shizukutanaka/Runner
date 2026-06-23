/**
 * Triage Queue — モデレーター・トリアージキュー
 *
 * ソクラテス式問答から生まれた視点:
 * 「医師は患者を到着順に診るか？ → トリアージで緊急度を分類する」
 */

import React, { useEffect, useState, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Paper, Typography, Stack, Chip, LinearProgress,
  Divider, Alert, CircularProgress, Button, Tooltip,
  List, ListItem, ListItemText, ListItemIcon, Badge, useTheme,
} from '@mui/material';
import {
  LocalHospital as TriageIcon,
  Circle as DotIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  AccessTime as SLAIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API = import.meta.env.VITE_API_BASE_URL || '/api';

const LEVEL_META = {
  EMERGENCY: { label: '緊急',  color: '#d32f2f', bg: '#ffebee', icon: '🔴' },
  URGENT:    { label: '要対応', color: '#f57c00', bg: '#fff3e0', icon: '🟠' },
  ROUTINE:   { label: '通常',  color: '#f9a825', bg: '#fffde7', icon: '🟡' },
  CAN_WAIT:  { label: '低優先', color: '#388e3c', bg: '#e8f5e9', icon: '🟢' },
};

// ─── サブコンポーネント ──────────────────────────────────
const TriageLevelSection = memo(({ level, items, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const theme = useTheme();
  const meta = LEVEL_META[level];

  if (items.length === 0) return null;

  return (
    <Box mb={1.5}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        onClick={() => setOpen(o => !o)}
        sx={{ cursor: 'pointer', py: 0.5, px: 1, borderRadius: 1, '&:hover': { bgcolor: theme.palette.action.hover } }}
      >
        <Stack direction="row" alignItems="center" spacing={0.8}>
          <Typography fontSize="1rem">{meta.icon}</Typography>
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: meta.color }}>
            {meta.label}
          </Typography>
          <Badge badgeContent={items.length} color="default"
            sx={{ '& .MuiBadge-badge': { bgcolor: meta.color, color: '#fff', fontSize: '0.65rem', minWidth: 18, height: 18 } }}
          >
            <Box width={8} />
          </Badge>
        </Stack>
        {open ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
      </Stack>

      {open && (
        <List dense disablePadding sx={{ pl: 1 }}>
          {items.map(item => (
            <ListItem
              key={item.commentId}
              disableGutters
              sx={{
                mb: 0.5,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                border: `1px solid ${meta.color}30`,
                backgroundColor: meta.bg,
              }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                <Tooltip title={`優先スコア: ${Math.round(item.priorityScore * 100)}`} arrow>
                  <Box
                    width={22} height={22}
                    borderRadius="50%"
                    bgcolor={meta.color}
                    display="flex" alignItems="center" justifyContent="center"
                  >
                    <Typography variant="caption" color="#fff" fontWeight={700} fontSize="0.6rem">
                      {Math.round(item.priorityScore * 100)}
                    </Typography>
                  </Box>
                </Tooltip>
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography variant="caption" noWrap sx={{ maxWidth: '90%', display: 'block' }}>
                    {item.content}
                  </Typography>
                }
                secondary={
                  <Typography variant="caption" color="text.disabled" fontSize="0.65rem">
                    @{item.user}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
});

// ─── メインコンポーネント ──────────────────────────────────
function TriageQueue({ platform = 'youtube', channelId = 'default', pendingComments = [] }) {
  const theme = useTheme();
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const runTriage = useCallback(async () => {
    if (pendingComments.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      // チャンネルのリスク状況も取得
      const [triageRes, riskRes] = await Promise.allSettled([
        axios.post(`${API}/insights/triage`, {
          pendingComments,
          channelContext: { platform, channelId },
        }),
        axios.get(`${API}/insights/risk/${platform}/${channelId}`),
      ]);

      if (triageRes.status === 'fulfilled') {
        const channelRisk = riskRes.status === 'fulfilled'
          ? riskRes.value?.data?.data
          : null;

        // チャンネルリスクを考慮して再トリアージ
        if (channelRisk) {
          const retriage = await axios.post(`${API}/insights/triage`, {
            pendingComments,
            channelContext: {
              platform,
              channelId,
              riskLevel: channelRisk.level,
              riskScore: channelRisk.riskScore,
            },
          });
          setResult(retriage.data?.data ?? null);
        } else {
          setResult(triageRes.value?.data?.data ?? null);
        }
      }
    } catch (e) {
      setError('トリアージの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [platform, channelId, pendingComments]);

  useEffect(() => {
    runTriage();
  }, [pendingComments.length]); // eslint-disable-line

  const summary = result?.summary;
  const hasUrgent = (summary?.emergency ?? 0) + (summary?.urgent ?? 0) > 0;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${hasUrgent ? '#f44336' : theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
        <TriageIcon sx={{ color: hasUrgent ? '#d32f2f' : theme.palette.primary.main, fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>
          モデレーター・トリアージ
        </Typography>
        {loading && <CircularProgress size={14} sx={{ ml: 'auto' }} />}
      </Stack>

      {error && (
        <Alert severity="warning" sx={{ mb: 1, py: 0.5, fontSize: '0.78rem', borderRadius: 1.5 }}>
          {error}
        </Alert>
      )}

      {pendingComments.length === 0 && (
        <Typography variant="body2" color="text.secondary" align="center" py={1}>
          対応待ちコメントがありません
        </Typography>
      )}

      {result && (
        <>
          {/* サマリーバー */}
          <Stack direction="row" spacing={0.8} mb={1.5} flexWrap="wrap">
            {Object.entries(LEVEL_META).map(([level, meta]) => {
              const count = result.summary?.[level.toLowerCase().replace('_', '')] ??
                            result.queues?.[level]?.length ?? 0;
              if (count === 0) return null;
              return (
                <Chip
                  key={level}
                  label={`${meta.icon} ${meta.label} ${count}`}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    backgroundColor: meta.color,
                    color: '#fff',
                  }}
                />
              );
            })}
          </Stack>

          {result.insight && (
            <Alert
              severity={result.summary?.emergency > 0 ? 'error' : result.summary?.urgent > 0 ? 'warning' : 'info'}
              sx={{ mb: 1.5, py: 0.5, fontSize: '0.78rem', borderRadius: 1.5 }}
            >
              {result.insight}
            </Alert>
          )}

          <Divider sx={{ mb: 1.5 }} />

          {/* キュー一覧 */}
          {Object.entries(result.queues ?? {}).map(([level, items]) => (
            <TriageLevelSection
              key={level}
              level={level}
              items={items}
              defaultOpen={level === 'EMERGENCY' || level === 'URGENT'}
            />
          ))}
        </>
      )}
    </Paper>
  );
}

TriageQueue.propTypes = {
  platform: PropTypes.string,
  channelId: PropTypes.string,
  pendingComments: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    content: PropTypes.string,
    user: PropTypes.string,
    platform: PropTypes.string,
    timestamp: PropTypes.string,
    toxicityScore: PropTypes.number,
    moderationScore: PropTypes.number,
  })),
};

TriageQueue.defaultProps = {
  platform: 'youtube',
  channelId: 'default',
  pendingComments: [],
};

export default TriageQueue;
