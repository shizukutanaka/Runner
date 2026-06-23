/**
 * Community Health Widget
 *
 * ソクラテス式問答から生まれた2つの新視点を可視化:
 * 1. コミュニティ健全性スコア（単純な削除件数でなく多次元指標）
 * 2. 炎上リスクメーター（現在の雰囲気の危険度）
 */

import React, { useEffect, useState, useCallback, memo } from 'react';
import {
  Box, Paper, Typography, LinearProgress, Chip, Tooltip,
  Divider, Stack, useTheme, CircularProgress, Alert,
} from '@mui/material';
import {
  FavoriteOutlined as HeartIcon,
  WarningAmberOutlined as WarnIcon,
  CheckCircleOutline as OkIcon,
  ErrorOutline as CriticalIcon,
  TrendingUp as UpIcon,
  TrendingDown as DownIcon,
  TrendingFlat as FlatIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API = import.meta.env.VITE_API_BASE_URL || '/api';

// ─── リスクレベル定義 ──────────────────────────────────────
const RISK_META = {
  safe:     { label: '安全',   color: '#4caf50', bgColor: '#e8f5e9', Icon: OkIcon       },
  watch:    { label: '注意',   color: '#ff9800', bgColor: '#fff3e0', Icon: WarnIcon      },
  warning:  { label: '警告',   color: '#f44336', bgColor: '#fce4ec', Icon: WarnIcon      },
  critical: { label: '緊急',   color: '#b71c1c', bgColor: '#ffebee', Icon: CriticalIcon  },
};

const GRADE_META = {
  S: { color: '#1565c0', label: '非常に健全' },
  A: { color: '#2e7d32', label: '健全'       },
  B: { color: '#f57f17', label: '普通'       },
  C: { color: '#e65100', label: '要注意'     },
  D: { color: '#b71c1c', label: '要改善'     },
};

// ─── コンポーネント ──────────────────────────────────────────
function CommunityHealthWidget({ platform = 'youtube', channelId = 'default', comments = [] }) {
  const theme = useTheme();
  const [risk,    setRisk]    = useState(null);
  const [healthReport, setHealthReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const refresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const [riskRes, healthRes] = await Promise.allSettled([
        // 炎上リスク
        axios.get(`${API}/insights/risk/${platform}/${channelId}`),
        // 健全性スコア（直近100件のコメントを送る）
        comments.length > 0
          ? axios.post(`${API}/insights/health-score`, {
              comments: comments.slice(-100),
              windowSize: 50,
            })
          : Promise.resolve(null),
      ]);

      if (riskRes.status === 'fulfilled') {
        setRisk(riskRes.value?.data?.data ?? null);
      }
      if (healthRes.status === 'fulfilled' && healthRes.value) {
        setHealthReport(healthRes.value?.data?.data ?? null);
      }
    } catch (e) {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [platform, channelId, comments, loading]);

  // 30秒ごとに自動更新
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [platform, channelId]); // eslint-disable-line

  // コメントが大きく変化したときも更新
  const prevLen = React.useRef(0);
  useEffect(() => {
    const len = comments.length;
    if (len > 0 && Math.abs(len - prevLen.current) >= 10) {
      prevLen.current = len;
      refresh();
    }
  }, [comments.length]); // eslint-disable-line

  const riskMeta = RISK_META[risk?.level ?? 'safe'];
  const RiskIcon = riskMeta.Icon;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
      }}
    >
      {/* ヘッダー */}
      <Stack direction="row" alignItems="center" spacing={1} mb={2}>
        <HeartIcon sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>
          コミュニティ健全性
        </Typography>
        {loading && <CircularProgress size={14} sx={{ ml: 1 }} />}
      </Stack>

      {error && (
        <Alert severity="warning" sx={{ mb: 1.5, py: 0.5, borderRadius: 1.5, fontSize: '0.8rem' }}>
          {error}
        </Alert>
      )}

      {/* ─ 炎上リスクメーター ─ */}
      <Box
        sx={{
          p: 1.5,
          mb: 2,
          borderRadius: 1.5,
          backgroundColor: riskMeta.bgColor,
          border: `1px solid ${riskMeta.color}30`,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <RiskIcon sx={{ color: riskMeta.color, fontSize: 18 }} />
            <Typography variant="body2" fontWeight={600} sx={{ color: riskMeta.color }}>
              炎上リスク
            </Typography>
          </Stack>
          <Chip
            label={riskMeta.label}
            size="small"
            sx={{
              height: 22,
              fontSize: '0.72rem',
              fontWeight: 700,
              backgroundColor: riskMeta.color,
              color: '#fff',
            }}
          />
        </Stack>

        {risk && (
          <>
            <Tooltip title={`リスクスコア: ${risk.riskScore}`} placement="top" arrow>
              <LinearProgress
                variant="determinate"
                value={Math.round((risk.riskScore ?? 0) * 100)}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: `${riskMeta.color}25`,
                  '& .MuiLinearProgress-bar': { backgroundColor: riskMeta.color, borderRadius: 4 },
                }}
              />
            </Tooltip>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {risk.recommendation}
            </Typography>
          </>
        )}
        {!risk && !loading && (
          <Typography variant="caption" color="text.secondary">
            コメントが蓄積されると表示されます
          </Typography>
        )}
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* ─ コミュニティ健全性スコア ─ */}
      {healthReport ? (
        <>
          <Stack direction="row" alignItems="baseline" spacing={1} mb={1.5}>
            <Typography variant="h3" fontWeight={800} sx={{ color: GRADE_META[healthReport.grade]?.color ?? '#666' }}>
              {healthReport.score}
            </Typography>
            <Typography variant="caption" color="text.secondary">/ 100</Typography>
            <Chip
              label={`${healthReport.grade}  ${GRADE_META[healthReport.grade]?.label ?? ''}`}
              size="small"
              sx={{
                ml: 0.5,
                height: 22,
                fontSize: '0.72rem',
                fontWeight: 700,
                backgroundColor: GRADE_META[healthReport.grade]?.color ?? '#9e9e9e',
                color: '#fff',
              }}
            />
          </Stack>

          <Stack spacing={0.8} mb={1.5}>
            {Object.entries(healthReport.signals ?? {}).map(([key, val]) => (
              <SignalBar key={key} name={SIGNAL_LABELS[key] ?? key} value={val} />
            ))}
          </Stack>

          {healthReport.insight && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              💡 {healthReport.insight}
            </Typography>
          )}
          {healthReport.action && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: theme.palette.warning.dark }}>
              👉 {healthReport.action}
            </Typography>
          )}
        </>
      ) : (
        !loading && (
          <Typography variant="body2" color="text.secondary" align="center" py={1}>
            コメントを50件以上受信すると健全性スコアが計算されます
          </Typography>
        )
      )}
    </Paper>
  );
}

// ─ シグナルバー ─────────────────────────────────────────────
const SignalBar = memo(({ name, value }) => {
  const theme = useTheme();
  const pct   = Math.round((value ?? 0) * 100);
  const color = pct >= 70 ? '#4caf50' : pct >= 45 ? '#ff9800' : '#f44336';
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" mb={0.2}>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '70%' }}>
          {name}
        </Typography>
        <Typography variant="caption" fontWeight={600} sx={{ color }}>
          {pct}%
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 5,
          borderRadius: 3,
          backgroundColor: theme.palette.divider,
          '& .MuiLinearProgress-bar': { backgroundColor: color, borderRadius: 3 },
        }}
      />
    </Box>
  );
});

const SIGNAL_LABELS = {
  sentimentBalance:  'ポジティブ率',
  engagementDepth:   '発言の深さ',
  diversityScore:    '参加多様性',
  moderationLoad:    'モデレーション負荷低さ',
  returnUserRate:    'リピーター率',
  constructiveness:  '建設的会話率',
};

export default CommunityHealthWidget;
