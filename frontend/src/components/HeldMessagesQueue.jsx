import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardHeader,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  Stack,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { fetchHeldMessages, processHeldMessage } from '../api/moderation';
import { useTranslation } from 'react-i18next';

const RISK_LEVEL_COLOR = {
  low: 'info',
  medium: 'warning',
  high: 'error',
};

// R-14: NGワードカテゴリの表示ラベルと色（構造化された保留理由をモデレーターに提示）
const NG_CATEGORY_META = {
  abuse: { label: '暴言', color: 'error' },
  threat: { label: '脅迫', color: 'error' },
  spam: { label: 'スパム', color: 'warning' },
};

// 保留理由(reasons配列)から、モデレーターに見せる価値のあるバッジ情報を抽出する
const extractReasonBadges = (reasons) => {
  if (!Array.isArray(reasons)) return [];
  const badges = [];
  reasons.forEach((r) => {
    if (r.type === 'ng_word_category' && Array.isArray(r.categories)) {
      r.categories.forEach((cat) => {
        const meta = NG_CATEGORY_META[cat] || { label: cat, color: 'default' };
        badges.push({ key: `ng-${cat}`, label: meta.label, color: meta.color });
      });
    } else if (r.type === 'multiple_links') {
      badges.push({ key: 'links', label: 'リンク多数', color: 'warning' });
    } else if (r.type === 'negative_sentiment') {
      badges.push({ key: 'sentiment', label: 'ネガティブ感情', color: 'warning' });
    } else if (r.type === 'repeated_chars') {
      badges.push({ key: 'repeated', label: '連続文字', color: 'info' });
    }
  });
  return badges;
};

export default function HeldMessagesQueue() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [messages, setMessages] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, expired: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHeldMessages(statusFilter);
      setMessages(data.messages || []);
      setCounts({
        pending: data.pending || 0,
        approved: data.approved || 0,
        rejected: data.rejected || 0,
        expired: data.expired || 0,
      });
    } catch (err) {
      setError(err?.message || t('held_messages_load_error', '保留メッセージの取得に失敗しました'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, t]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleAction = async (holdId, action) => {
    setProcessingId(holdId);
    setError(null);
    try {
      await processHeldMessage(holdId, action);
      setMessages((prev) => prev.filter((m) => m.id !== holdId));
    } catch (err) {
      setError(err?.message || t('held_messages_action_error', '処理に失敗しました'));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Card sx={{ borderRadius: 2 }}>
      <CardHeader
        title={t('held_messages_title', '保留メッセージキュー')}
        subheader={t('held_messages_subtitle', 'AIモデレーションで保留されたコメントを確認します')}
        action={
          <ToggleButtonGroup
            size="small"
            value={statusFilter}
            exclusive
            onChange={(e, value) => value && setStatusFilter(value)}
          >
            <ToggleButton value="pending">
              {t('held_messages_filter_pending', '保留中')} ({counts.pending})
            </ToggleButton>
            <ToggleButton value="approved">{t('held_messages_filter_approved', '承認済み')}</ToggleButton>
            <ToggleButton value="rejected">{t('held_messages_filter_rejected', '却下済み')}</ToggleButton>
            <ToggleButton value="all">{t('held_messages_filter_all', 'すべて')}</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      <CardContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : messages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            {t('held_messages_empty', '該当する保留メッセージはありません')}
          </Typography>
        ) : (
          <List>
            {messages.map((msg, index) => (
              <React.Fragment key={msg.id}>
                <ListItem
                  alignItems="flex-start"
                  secondaryAction={
                    msg.status === 'pending' ? (
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          color="success"
                          variant="outlined"
                          startIcon={<CheckCircleIcon />}
                          disabled={processingId === msg.id}
                          onClick={() => handleAction(msg.id, 'approve')}
                        >
                          {t('held_messages_approve', '承認')}
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          startIcon={<CancelIcon />}
                          disabled={processingId === msg.id}
                          onClick={() => handleAction(msg.id, 'reject')}
                        >
                          {t('held_messages_reject', '却下')}
                        </Button>
                      </Stack>
                    ) : null
                  }
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="subtitle2">{msg.user}</Typography>
                        <Chip size="small" label={msg.platform} variant="outlined" />
                        <Chip
                          size="small"
                          label={`${t('held_messages_risk', 'リスク')}: ${Math.round((msg.riskScore || 0) * 100)}%`}
                          color={RISK_LEVEL_COLOR[msg.holdLevel] || 'default'}
                        />
                        <Chip size="small" label={msg.holdReason} variant="outlined" />
                        {/* R-14: 構造化された保留理由バッジ（なぜ保留されたかを一目で把握） */}
                        {extractReasonBadges(msg.reasons).map((b) => (
                          <Chip key={b.key} size="small" label={b.label} color={b.color} />
                        ))}
                      </Stack>
                    }
                    secondary={msg.content}
                  />
                </ListItem>
                {index < messages.length - 1 && <Divider component="li" />}
              </React.Fragment>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}
