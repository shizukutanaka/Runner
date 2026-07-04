import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  TextField,
  Button,
  Snackbar,
  Stack,
  Tabs,
  Tab,
  InputAdornment,
  MenuItem,
  Select,
  FormControl,
  useTheme,
  Chip,
  Tooltip,
} from '@mui/material';
import { Virtuoso } from 'react-virtuoso';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useComments } from '../hooks/useComments';
import { useRealtimeComments } from '../hooks/useRealtimeComments';
import { postComment, updateComment, fetchAutoAnswer, fetchCommentsSummary, fetchComments } from '../api/comments';
import { useTranslation } from 'react-i18next';
import CommentItem from './CommentItem'; // 新しくインポート
import RelatedVideosDialog from './RelatedVideosDialog';
import RelatedPapersDialog from './RelatedPapersDialog';

const STATUS_VALUES = ['all', 'visible', 'hidden', 'flagged', 'deleted'];

const PLATFORM_VALUES = ['all', 'youtube', 'twitch'];

const DEBOUNCE_INTERVAL = 300;

const platformColors = {
  youtube: '#e3f2fd',
  twitch: '#f3e5f5',
};

const normalizePlatform = (value) => (value ? value.toLowerCase() : 'youtube');

const useDebouncedValue = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const normalizeFilters = (platformFilter, statusFilter) => {
  const payload = {};
  if (platformFilter && platformFilter !== 'all') {
    payload.platform = platformFilter;
  }
  if (statusFilter && statusFilter !== 'all') {
    payload.status = statusFilter;
  }
  return payload;
};

const useSearchComments = (platformFilter, statusFilter, searchTerm, refreshKey = 0) => {
  const [state, setState] = useState({ data: [], loading: false, error: null });
  const debouncedSearch = useDebouncedValue(searchTerm, DEBOUNCE_INTERVAL);

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      const hasFilters =
        platformFilter !== 'all' ||
        statusFilter !== 'all' ||
        debouncedSearch.trim().length > 0;

      if (!hasFilters) {
        setState((prev) => ({ ...prev, data: [], loading: false, error: null }));
        return;
      }

      setState({ data: [], loading: true, error: null });
      try {
        const filters = normalizeFilters(platformFilter, statusFilter);
        const searchOptions = {
          ...filters,
          search: debouncedSearch.trim() || undefined,
          limit: 100
        };

        const platformParam = searchOptions.platform ?? (platformFilter === 'all' ? undefined : platformFilter);
        const response = await fetchComments(platformParam, searchOptions);
        if (!cancelled) {
          const payload = response?.data?.items || response?.data || response;
          const normalized = Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload)
              ? payload
              : payload?.data?.items || [];
          setState({ data: normalized, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ data: [], loading: false, error: err });
        }
      }
    };

    fetch();
    return () => {
      cancelled = true;
    };
  }, [platformFilter, statusFilter, debouncedSearch, refreshKey]);

  return state;
};

const mapCommentResponse = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload?.data?.items) {
    return payload.data.items;
  }
  if (payload?.items) {
    return payload.items;
  }
  return [];
};

export default function CommentTimeline({ platform = 'youtube' }) {
  const theme = useTheme();
  const normalizedPlatform = normalizePlatform(platform);
  const { comments, loading, error, refetch } = useComments(normalizedPlatform);
  const [input, setInput] = useState('');
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [answeringId, setAnsweringId] = useState(null);
  const [aiAnswer, setAiAnswer] = useState({}); // { [commentId]: answer }
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [searchRefreshKey, setSearchRefreshKey] = useState(0);
  const [statusMenu, setStatusMenu] = useState({ anchor: null, commentId: null });
  const [statusError, setStatusError] = useState(null);
  const [relatedVideosDialog, setRelatedVideosDialog] = useState({ open: false, comment: null });
  const [relatedPapersDialog, setRelatedPapersDialog] = useState({ open: false, comment: null });
  const { t, i18n } = useTranslation();

  const {
    data: filteredComments,
    loading: searchLoading,
    error: searchError
  } = useSearchComments(platformFilter, statusFilter, searchTerm, searchRefreshKey);

  const statusTabs = useMemo(() => (
    STATUS_VALUES.map((value) => ({
      value,
      label: t(`comment_timeline_tab_${value}`)
    }))
  ), [t]);

  const platformOptions = useMemo(() => (
    PLATFORM_VALUES.map((value) => ({
      value,
      label: t(`platform_option_${value}`)
    }))
  ), [t]);

  const platformLabelMap = useMemo(() => (
    platformOptions.reduce((acc, option) => {
      acc[option.value] = option.label;
      return acc;
    }, {})
  ), [platformOptions]);

  const effectiveComments = useMemo(() => {
    const filteringActive =
      statusFilter !== 'all' ||
      platformFilter !== 'all' ||
      searchTerm.trim().length > 0;

    if (filteringActive) {
      return mapCommentResponse(filteredComments);
    }

    return comments;
  }, [filteredComments, comments, statusFilter, platformFilter, searchTerm]);

  const isFiltering =
    statusFilter !== 'all' ||
    platformFilter !== 'all' ||
    searchTerm.trim().length > 0;

  const hasResults = effectiveComments && effectiveComments.length > 0;

  const handleStatusChange = useCallback((event, value) => {
    if (value !== null) {
      setStatusFilter(value);
    }
  }, []);

  const handlePlatformChange = useCallback((event) => {
    setPlatformFilter(event.target.value);
  }, []);

  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setPlatformFilter('all');
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      setSearchRefreshKey((prev) => prev + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // リアルタイム更新受信（WebSocket）: 新規投稿・モデレーション更新の通知を受けたら
  // 一覧を再取得する。個々のコメントをローカルで手動マージするより単純かつ確実。
  const realtimeRefreshTimer = useRef(null);
  const handleRealtimeCommentUpdate = useCallback((comment) => {
    if (comment?.platform && normalizedPlatform && comment.platform !== normalizedPlatform) {
      return;
    }
    if (realtimeRefreshTimer.current) {
      clearTimeout(realtimeRefreshTimer.current);
    }
    realtimeRefreshTimer.current = setTimeout(() => {
      refetch();
      setSearchRefreshKey((prev) => prev + 1);
    }, DEBOUNCE_INTERVAL);
  }, [normalizedPlatform, refetch]);

  useRealtimeComments(handleRealtimeCommentUpdate);

  useEffect(() => () => {
    if (realtimeRefreshTimer.current) {
      clearTimeout(realtimeRefreshTimer.current);
    }
  }, []);

  const handleStatusMenuOpen = useCallback((event, commentId) => {
    setStatusMenu({ anchor: event.currentTarget, commentId });
  }, []);

  const handleStatusMenuClose = useCallback(() => {
    setStatusMenu({ anchor: null, commentId: null });
  }, []);

  const handleStatusUpdate = useCallback(async (commentId, newStatus) => {
    try {
      setStatusError(null);
      await updateComment(commentId, { action: newStatus });
      setSuccess(true);
      await refetch();
      setSearchRefreshKey((prev) => prev + 1);
    } catch (error) {
      setStatusError(error?.message || t('operation_failed'));
    }
  }, [refetch]);

  const formatTimestamp = useCallback((value) => {
    if (!value) {
      return t('timestamp_unknown', '時間情報なし');
    }
    try {
      return new Intl.DateTimeFormat(i18n.language || 'ja', {
        dateStyle: 'short',
        timeStyle: 'medium'
      }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }, [i18n.language, t]);

  // 最新コメント要約を定期取得
  React.useEffect(() => {
    let timer;
    async function updateSummary() {
      if (effectiveComments && effectiveComments.length > 0) {
        try {
          const summary = await fetchCommentsSummary(effectiveComments.slice(-30)); // 直近30件
          setSummaryText(summary);
        } catch (e) {
          setSummaryText(t('comment_summary_fetch_error'));
        }
      } else {
        setSummaryText(t('comment_summary_empty'));
      }
      timer = setTimeout(updateSummary, 12000); // 12秒ごとに更新
    }
    updateSummary();
    return () => clearTimeout(timer);
  }, [effectiveComments, t]);

  const handlePost = async () => {
    setPostError(null);
    if (!input.trim()) {
      setPostError(t('comment_input_required'));
      return;
    }
    setPostLoading(true);
    try {
      await postComment({ platform, user: 'demoUser', content: input });
      setInput('');
      setSuccess(true);
      await refetch(); // コメント再取得で即時反映
    } catch (e) {
      setPostError(t('comment_post_failed'));
    } finally {
      setPostLoading(false);
    }
  };

  const handlePin = useCallback(async (id) => {
    try {
      await updateComment(id, { action: 'pin' });
      setSuccess(true);
      await refetch();
    } catch (error) {
      setStatusError(error?.message || t('operation_failed'));
    }
  }, [refetch]);

  const handleDelete = useCallback(async (id) => {
    try {
      await updateComment(id, { action: 'delete' });
      setSuccess(true);
      await refetch();
    } catch (error) {
      setStatusError(error?.message || t('operation_failed'));
    }
  }, [refetch]);

  const handleSuggestRelatedVideos = useCallback((comment) => {
    setRelatedVideosDialog({ open: true, comment });
  }, []);

  const handleCloseRelatedVideosDialog = useCallback(() => {
    setRelatedVideosDialog({ open: false, comment: null });
  }, []);

  const handleSuggestRelatedPapers = useCallback((comment) => {
    setRelatedPapersDialog({ open: true, comment });
  }, []);

  const handleCloseRelatedPapersDialog = useCallback(() => {
    setRelatedPapersDialog({ open: false, comment: null });
  }, []);

  const handleGenerateReply = useCallback(async (commentId, content) => {
    setAnsweringId(commentId);
    try {
      const answer = await fetchAutoAnswer(content);
      setAiAnswer(prev => ({ ...prev, [commentId]: answer }));
    } catch (e) {
      setAiAnswer(prev => ({ ...prev, [commentId]: t('auto_answer_failed', 'AI応答の取得に失敗しました') }));
    } finally {
      setAnsweringId(null);
    }
  }, [t]);

  return (
    <Box sx={{ mb: 3 }}>
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          bgcolor: theme.palette.background.subtle,
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography variant="subtitle1" sx={{ color: theme.palette.text.primary, fontWeight: 600, mb: 1 }}>
          {t('ai_summary')}
        </Typography>
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, whiteSpace: 'pre-line' }}>
          {summaryText}
        </Typography>
      </Paper>

      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            {t('comment_timeline')}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            onClick={handleRefresh}
            startIcon={refreshing ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon fontSize="small" />}
            disabled={refreshing || loading || searchLoading}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 500 }}
          >
            {t('refresh_comments', 'コメントを更新')}
          </Button>
        </Stack>

        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 3 },
            mb: 3,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.background.default
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'center' }}
          >
            <TextField
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder={t('search_comments', 'コメントを検索')}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchTerm && (
                  <Button
                    size="small"
                    onClick={() => setSearchTerm('')}
                    sx={{ minWidth: 'auto', px: 0.5, textTransform: 'none' }}
                  >
                    {t('clear', 'クリア')}
                  </Button>
                ),
                onKeyDown: (event) => {
                  if (event.key === 'Escape') {
                    setSearchTerm('');
                  }
                }
              }}
              sx={{
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  '& fieldset': {
                    borderColor: theme.palette.divider,
                  },
                  '&:hover fieldset': {
                    borderColor: theme.palette.action.hover,
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: theme.palette.primary.main,
                    borderWidth: 2,
                  },
                },
              }}
            />

            <FormControl size="small" sx={{ minWidth: 140 }}>
              <Select
                value={platformFilter}
                onChange={handlePlatformChange}
                displayEmpty
                sx={{
                  borderRadius: 2,
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: theme.palette.divider,
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: theme.palette.primary.main,
                    borderWidth: 2,
                  }
                }}
              >
                {platformOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
            {['youtube', 'twitch'].map((platformKey) => (
              <Chip
                key={platformKey}
                size="small"
                clickable
                label={`${platformLabelMap[platformKey]}`}
                onClick={() => setPlatformFilter(platformKey)}
                color={platformFilter === platformKey ? 'primary' : 'default'}
                sx={{
                  fontWeight: platformFilter === platformKey ? 600 : 500,
                  borderRadius: 2
                }}
              />
            ))}
            <Chip
              size="small"
              clickable
              label={t('show_all_platforms', '全プラットフォーム')}
              onClick={() => setPlatformFilter('all')}
              color={platformFilter === 'all' ? 'primary' : 'default'}
              sx={{
                fontWeight: platformFilter === 'all' ? 600 : 500,
                borderRadius: 2
              }}
            />
          </Stack>

          <Tabs
            value={statusFilter}
            onChange={handleStatusChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ mt: 2 }}
          >
            {statusTabs.map((tab) => (
              <Tab
                key={tab.value}
                value={tab.value}
                label={tab.label}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.85rem'
                }}
              />
            ))}
          </Tabs>
        </Paper>

        <Stack direction="row" spacing={2} mb={3} alignItems="flex-start">
          <TextField
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={t('input_placeholder')}
            multiline
            rows={2}
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                '& fieldset': {
                  borderColor: theme.palette.divider,
                },
                '&:hover fieldset': {
                  borderColor: theme.palette.action.hover,
                },
                '&.Mui-focused fieldset': {
                  borderWidth: 2,
                  borderColor: theme.palette.primary.main,
                },
              },
            }}
          />
          <Button
            size="medium"
            variant="contained"
            onClick={handlePost}
            disabled={postLoading}
            sx={{
              px: 3,
              py: 1.5,
              borderRadius: 2,
              fontWeight: 500,
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': {
                boxShadow: '0 1px 2px 1px rgba(23, 43, 77, 0.2)',
                transform: 'none',
              },
              '&:active': {
                transform: 'scale(0.98)',
              },
            }}
          >
            {t('send')}
          </Button>
        </Stack>

        {postError && (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              borderRadius: 2,
              '& .MuiAlert-icon': {
                color: theme.palette.error.main,
              },
            }}
          >
            {postError}
          </Alert>
        )}

        {statusError && (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              borderRadius: 2,
              '& .MuiAlert-icon': {
                color: theme.palette.error.main,
              },
            }}
            onClose={() => setStatusError(null)}
          >
            {statusError}
          </Alert>
        )}

        {success && (
          <Snackbar
            open={success}
            autoHideDuration={2000}
            onClose={() => setSuccess(false)}
            message={t('operation_success')}
            sx={{
              '& .MuiSnackbarContent-root': {
                backgroundColor: theme.palette.success.main,
                color: theme.palette.success.contrastText,
                borderRadius: 2,
              },
            }}
          />
        )}

        {loading && !isFiltering && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
            <CircularProgress size={24} sx={{ color: theme.palette.primary.main }} />
          </Box>
        )}

        {(error || searchError) && (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              borderRadius: 2,
              '& .MuiAlert-icon': {
                color: theme.palette.error.main,
              },
            }}
          >
            {searchError?.message || error?.message || t('operation_failed')}
          </Alert>
        )}

        {searchLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
            <CircularProgress size={24} sx={{ color: theme.palette.primary.main }} />
          </Box>
        )}

        {isFiltering && !searchLoading && !loading && !hasResults && (
          <Paper
            elevation={0}
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: theme.palette.background.default,
              textAlign: 'center'
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 1 }}>
              {t('no_comments_found', '該当するコメントがありません')}
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 2 }}>
              {t('adjust_filters_prompt', '条件を変更するかフィルタをリセットしてください')}
            </Typography>
            <Button variant="outlined" size="small" onClick={resetFilters} sx={{ borderRadius: 2 }}>
              {t('reset_filters', 'フィルタをリセット')}
            </Button>
          </Paper>
        )}

        {hasResults ? (
          <Virtuoso
            style={{ height: '600px' }}
            totalCount={effectiveComments.length}
            overscan={5}
            itemContent={(index) => {
              const c = effectiveComments[index];
              if (!c) return null;
              return (
                <Box sx={{ pb: 2 }}>
                  <CommentItem
                    key={c.id}
                    comment={c}
                    onPin={handlePin}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusUpdate}
                    onGenerateReply={handleGenerateReply}
                    onSuggestRelatedVideos={handleSuggestRelatedVideos}
                    onSuggestRelatedPapers={handleSuggestRelatedPapers}
                    isReplying={answeringId === c.id}
                    aiReply={aiAnswer[c.id]}
                    formatTimestamp={formatTimestamp}
                    platformLabelMap={platformLabelMap}
                  />
                </Box>
              );
            }}
          />
        ) : null}
      </Box>

      {/* 関連動画ダイアログ */}
      <RelatedVideosDialog
        open={relatedVideosDialog.open}
        onClose={handleCloseRelatedVideosDialog}
        comment={relatedVideosDialog.comment}
        onVideoSelect={(_video) => {
          // 選択後の追加処理はここで実装
        }}
      />

      {/* 関連論文ダイアログ */}
      <RelatedPapersDialog
        open={relatedPapersDialog.open}
        onClose={handleCloseRelatedPapersDialog}
        comment={relatedPapersDialog.comment}
        onPaperSelect={(_paper) => {
          // 選択後の追加処理はここで実装
        }}
      />
    </Box>
  );
}
