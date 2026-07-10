/**
 * Context Analysis Panel — コンテキスト認識コメント分析
 *
 * ソクラテス式問答から生まれた視点:
 * 「同じコメントでも、前後の文脈次第で意味が変わるのに、
 *   単独で判定してよいのか？」
 * → 対象コメントを前後のコメントと合わせて評価し、文脈依存度を可視化する
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress,
  Card, CardContent, Stack, Chip, Divider,
} from '@mui/material';
import { Psychology as ContextIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import axios from 'axios';

const API = import.meta.env.VITE_API_BASE_URL || '/api';

const VERDICT_META = {
  safe:    { label: '安全',   color: 'success' },
  uncertain: { label: '要確認', color: 'warning' },
  risky:   { label: '危険',   color: 'error' },
};

export default function ContextAnalysisPanel() {
  const theme = useTheme();
  const [targetComment, setTargetComment] = useState('');
  const [contextText, setContextText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    if (!targetComment.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // 1行1コメントとして前後の文脈を分割
      const contextComments = contextText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((content) => ({ content }));

      const res = await axios.post(`${API}/insights/context-analysis`, {
        targetComment: { content: targetComment },
        contextComments,
      });
      setResult(res.data?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.message || 'コンテキスト分析に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const verdictMeta = result ? VERDICT_META[result.verdict] : null;

  return (
    <Card sx={{
      borderRadius: 2,
      border: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.background.paper,
    }}>
      <CardContent sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <ContextIcon sx={{ color: theme.palette.primary.main, fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight={700}>
            コンテキスト認識分析
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          単独では判断しづらいコメントを、前後の会話の流れを踏まえて再評価します。
        </Typography>

        <TextField
          label="判定したいコメント"
          value={targetComment}
          onChange={(e) => setTargetComment(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          size="small"
          sx={{ mb: 1.5 }}
        />
        <TextField
          label="前後の文脈コメント（1行に1件）"
          value={contextText}
          onChange={(e) => setContextText(e.target.value)}
          fullWidth
          multiline
          minRows={3}
          size="small"
          placeholder={'例:\n盛り上がってきましたね！\nこの後どうなるか楽しみです'}
          sx={{ mb: 1.5 }}
        />

        <Button
          variant="contained"
          size="small"
          onClick={handleAnalyze}
          disabled={loading || !targetComment.trim()}
        >
          {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : '分析する'}
        </Button>

        {error && (
          <Alert severity="warning" sx={{ mt: 1.5, py: 0.5, fontSize: '0.78rem' }}>
            {error}
          </Alert>
        )}

        {result && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
              <Chip
                size="small"
                label={verdictMeta.label}
                color={verdictMeta.color}
                sx={{ fontWeight: 700 }}
              />
              <Typography variant="caption" color="text.secondary">
                単独スコア {Math.round(result.baseScore * 100)} → 文脈考慮後 {Math.round(result.contextAdjusted * 100)}
                （依存度 {Math.round(result.contextDependency * 100)}pt）
              </Typography>
            </Stack>
            <Alert severity="info" sx={{ py: 0.5, fontSize: '0.78rem' }}>
              {result.insight}
            </Alert>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

ContextAnalysisPanel.propTypes = {};
