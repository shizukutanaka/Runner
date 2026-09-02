import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Badge,
  Button,
  TextField,
  InputAdornment,
  Divider,
  Stack,
  Paper,
  Tabs,
  Tab,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  Search as SearchIcon,
  Block as BlockIcon,
  VolumeOff as MuteIcon,
  Delete as DeleteIcon,
  Flag as FlagIcon,
  Person as PersonIcon,
  Chat as ChatIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useComments } from '../hooks/useComments';
import HeldMessagesQueue from './HeldMessagesQueue';
import { updateUser } from '../api/users';
import { updateComment, deleteComment, fetchAnalyticsOverview, fetchModerationActions } from '../api/comments';

export default function ModeratorDashboard({ platform = 'all' }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { comments: fetchedComments } = useComments(platform === 'all' ? undefined : platform);

  // 状態管理
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  // BAN/ミュートの失敗をモデレーターに見せるための状態（失敗を握りつぶさない）
  const [actionError, setActionError] = useState(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  // 画面上部の4枚のカード。
  //
  // ここは 1247 / 23 / 5 / 12 という**固定値**で初期化され、`setModerationStats` は
  // コード中で一度も呼ばれていなかった。つまり誰がどの環境で開いても同じ数字が出る、
  // 実データを一切反映しない飾りだった。モデレーターが最初に見る数字がこれである。
  //
  // 実際に集計できる値（総コメント数・フラグ数・BAN数・ミュート数）を
  // `/analytics/*` から取得する。取得できない項目は 0 ではなく null のままにし、
  // 表示側で「—」と出す。0件と「取得できていない」は違う意味だからである（E-25）。
  const [moderationStats, setModerationStats] = useState({
    totalComments: null,
    flaggedComments: null,
    bannedUsers: null,
    mutedUsers: null,
  });
  const [statsError, setStatsError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [activeTimeouts, setActiveTimeouts] = useState([]);
  const [selectedUserForTimeout, setSelectedUserForTimeout] = useState(null);
  const [timeoutDialogOpen, setTimeoutDialogOpen] = useState(false);
  // モデレーションアクション履歴。
  //
  // ここは以前 troll_user123 / spam_bot / offensive_user という**架空の3件**で
  // 初期化されていた。実行された事実のないBAN・ミュート・削除が、実績として
  // 画面に出ていたことになる（E-25 でアナリティクスに見つけたのと同じ種類の嘘）。
  //
  // E-38: その後「横断的な履歴APIが無いので、この画面の操作しか出せない」と
  // ここに書いていたが、**その但し書きの方が古くなっていた**。
  // 操作は全て監査記録に残っており、無かったのはAPIだけだった。
  // 現在は GET /api/analytics/moderation-actions から実履歴を読む
  // （下の useEffect）。空で始めるのは、取得できるまでの間だけである。
  const [recentActions, setRecentActions] = useState([]);

  // 最近のコメント（APIから取得したデータを表示用に変換）
  const [recentComments, setRecentComments] = useState([]);

  useEffect(() => {
    setRecentComments(
      fetchedComments.map((c) => ({
        id: c.id,
        user: c.user,
        content: c.content,
        platform: c.platform === 'youtube' ? 'YouTube' : c.platform === 'twitch' ? 'Twitch' : c.platform,
        timestamp: new Date(c.timestamp),
        status: c.status,
        riskScore: c.moderationScore || 0,
      }))
    );
  }, [fetchedComments]);

  useEffect(() => {
    let cancelled = false;
    fetchAnalyticsOverview()
      .then((data) => {
        if (cancelled) return;
        setModerationStats({
          totalComments: data.total,
          flaggedComments: data.moderated,
          bannedUsers: data.bannedUsers,
          mutedUsers: data.mutedUsers,
        });
        setStatsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        // 取得に失敗したことを隠さない。数字は null のままなので「—」が出る
        setStatsError(err?.message || '統計を取得できませんでした');
      });
    return () => { cancelled = true; };
  }, []);

  // E-38: 履歴はサーバから取る。
  // 以前は「横断的な履歴APIが無い」という理由でこの画面の操作しか出せず、
  // 再読み込みで消えていた。実際には操作は監査記録に残っており、
  // 足りなかったのはAPIだけだった
  useEffect(() => {
    let cancelled = false;
    fetchModerationActions(20)
      .then((actions) => {
        if (cancelled || !Array.isArray(actions)) return;
        setRecentActions(actions.map((a) => ({
          id: a.id,
          type: a.type,
          user: a.user,
          reason: a.reason,
          moderator: a.moderator,
          timestamp: new Date(a.timestamp),
          platform: a.platform === 'youtube' ? 'YouTube' : a.platform === 'twitch' ? 'Twitch' : (a.platform || '—'),
          // 3状態を保つ。null（記録なし）を false（届かなかった）に潰さない
          platformApplied: a.platformApplied
        })));
        setHistoryError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        // 取得できなかったことを隠さない。空の履歴を「操作なし」と偽らないため
        setHistoryError(err?.message || 'モデレーション履歴を取得できませんでした');
      });
    return () => { cancelled = true; };
  }, []);

  // 統計カードの表示。null（未取得）を 0 と偽らない
  const showStat = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString());

  // フィルタリングされたコメント
  const filteredComments = recentComments.filter(comment =>
    comment.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
    comment.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ユーザーアクション（BAN / ミュート）
  //
  // 旧実装は **APIを一切呼ばず**、ローカルの「最近のアクション」配列に
  // 実行済みの見た目だけを追加していた。モデレーターは「BANした」と表示を見るが
  // 実際には何も起きておらず、当人は発言し続けられる——モデレーションUIが
  // モデレーションしていない状態だった。実APIを呼び、結果に応じて表示する。
  const handleUserAction = async (action, userId, reason = '') => {
    setActionError(null);
    try {
      const result = await updateUser(userId, {
        action,
        reason: reason || `${action} by moderator`,
        duration: action === 'ban' ? 3600 : 300
      });

      // 成功したものだけを履歴に載せる
      setRecentActions(prev => [{
        id: Date.now(),
        type: action,
        user: userId,
        reason: reason || `${action} by moderator`,
        moderator: 'current_mod',
        timestamp: new Date(),
        platform: platform === 'all' ? 'YouTube' : platform,
        // プラットフォーム側へ反映できたかを併記する（できていなければ隠さない）
        platformApplied: action === 'ban' ? result?.platformBan?.ok === true : null
      }, ...prev.slice(0, 9)]);
    } catch (err) {
      // 失敗を成功に見せかけない
      setActionError(err?.message || `${action} に失敗しました`);
    }
  };

  // コメントアクション（削除 / 非表示）
  //
  // handleUserAction と同様、旧実装は **APIを呼ばずローカル状態だけを書き換えて**
  // いた。画面上はコメントが消えるが、DBにもプラットフォームにも何も起きない。
  // 実APIを呼び、成功した場合のみ表示を更新する。
  const handleCommentAction = async (action, commentId) => {
    setActionError(null);
    try {
      if (action === 'delete') {
        await deleteComment(commentId, { reason: 'moderator action', reasonCategory: 'other' });
      } else {
        await updateComment(commentId, { action: 'hidden' });
      }
      setRecentComments(prev =>
        prev.map(comment =>
          comment.id === commentId
            ? { ...comment, status: action === 'delete' ? 'deleted' : 'hidden' }
            : comment
        )
      );
    } catch (err) {
      setActionError(err?.message || `コメントの${action === 'delete' ? '削除' : '非表示'}に失敗しました`);
    }
  };

  // リスクスコアの色分け
  const getRiskColor = (score) => {
    if (score >= 0.8) return 'error';
    if (score >= 0.6) return 'warning';
    if (score >= 0.3) return 'info';
    return 'success';
  };

  // アクションタイプのアイコン
  const getActionIcon = (type) => {
    switch (type) {
      case 'ban': return <BlockIcon color="error" />;
      case 'mute': return <MuteIcon color="warning" />;
      case 'delete': return <DeleteIcon color="error" />;
      case 'flag': return <FlagIcon color="info" />;
      default: return <InfoIcon />;
    }
  };

  // 相対時間のフォーマット
  const formatRelativeTime = (date) => {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'たった今';
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    return date.toLocaleDateString();
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: 3 }}>
      {/* BAN/ミュートの失敗をモデレーターへ明示する。旧実装は失敗も成功も
          区別せず「実行済み」の見た目だけを出していた */}
      <Snackbar
        open={Boolean(actionError)}
        autoHideDuration={6000}
        onClose={() => setActionError(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      </Snackbar>
      <Typography variant="h4" gutterBottom sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        fontWeight: 600,
        mb: 3,
      }}>
        <SettingsIcon sx={{ color: theme.palette.primary.main }} />
        {t('moderator_dashboard_title', 'モデレーターダッシュボード')}
      </Typography>

      {statsError && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setStatsError(null)}>
          {statsError}（カードの数値は「—」と表示されます）
        </Alert>
      )}

      {/* 統計カード */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ChatIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" color="primary">
                  {showStat(moderationStats.totalComments)}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                総コメント数
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Badge badgeContent={moderationStats.flaggedComments ?? 0} color="error">
                  <FlagIcon color="warning" sx={{ mr: 1 }} />
                </Badge>
                <Typography variant="h6" color="warning.main">
                  {showStat(moderationStats.flaggedComments)}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                フラグ付きコメント
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <BlockIcon color="error" sx={{ mr: 1 }} />
                <Typography variant="h6" color="error.main">
                  {showStat(moderationStats.bannedUsers)}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                BANユーザー
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <MuteIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="h6" color="warning.main">
                  {showStat(moderationStats.mutedUsers)}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                ミュートユーザー
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* メインタブ */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="リアルタイム監視" />
          <Tab label="最近のアクション" />
          <Tab label="ユーザー管理" />
          <Tab label="保留メッセージキュー" />
        </Tabs>
      </Paper>

      {/* タブコンテンツ */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          {/* コメント監視パネル */}
          <Grid item xs={12} lg={8}>
            <Card sx={{ borderRadius: 2 }}>
              <CardHeader
                title="リアルタイムコメント監視"
                action={
                  <Stack direction="row" spacing={1}>
                    <TextField
                      size="small"
                      placeholder="ユーザー名またはコメントを検索..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon />
                          </InputAdornment>
                        ),
                      }}
                    />
                    <IconButton size="small">
                      <FilterIcon />
                    </IconButton>
                    <IconButton size="small">
                      <RefreshIcon />
                    </IconButton>
                  </Stack>
                }
              />
              <CardContent sx={{ p: 0 }}>
                <List>
                  {filteredComments.map((comment) => (
                    <React.Fragment key={comment.id}>
                      <ListItem
                        sx={{
                          bgcolor: comment.status === 'flagged' ? 'warning.light' : 'inherit',
                          opacity: comment.status === 'deleted' ? 0.5 : 1,
                        }}
                      >
                        <ListItemAvatar>
                          <Badge
                            overlap="circular"
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            badgeContent={
                              <Chip
                                size="small"
                                label={comment.platform}
                                color={comment.platform === 'YouTube' ? 'error' : 'primary'}
                                sx={{ fontSize: '0.6rem', height: 16 }}
                              />
                            }
                          >
                            <Avatar sx={{ bgcolor: theme.palette.primary.main }}>
                              <PersonIcon />
                            </Avatar>
                          </Badge>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="subtitle2" fontWeight="bold">
                                {comment.user}
                              </Typography>
                              <Chip
                                size="small"
                                label={`${(comment.riskScore * 100).toFixed(0)}%`}
                                color={getRiskColor(comment.riskScore)}
                                variant="outlined"
                              />
                              <Typography variant="caption" color="text.secondary">
                                {formatRelativeTime(comment.timestamp)}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Typography
                              variant="body2"
                              sx={{
                                textDecoration: comment.status === 'deleted' ? 'line-through' : 'none',
                                color: comment.status === 'deleted' ? 'text.disabled' : 'text.secondary',
                              }}
                            >
                              {comment.content}
                            </Typography>
                          }
                        />
                        <ListItemSecondaryAction>
                          <Stack direction="row" spacing={0.5}>
                            {comment.status !== 'deleted' && (
                              <>
                                <Tooltip title="ユーザーをBAN">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleUserAction('ban', comment.user, '不適切なコメント')}
                                  >
                                    <BlockIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="ユーザーをミュート">
                                  <IconButton
                                    size="small"
                                    color="warning"
                                    onClick={() => handleUserAction('mute', comment.user, '一時的な警告')}
                                  >
                                    <MuteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="コメントを削除">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleCommentAction('delete', comment.id)}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                            <Tooltip title="詳細を表示">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setSelectedUser(comment);
                                  setUserDialogOpen(true);
                                }}
                              >
                                <InfoIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </ListItemSecondaryAction>
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* クイックアクションパネル */}
          <Grid item xs={12} lg={4}>
            <Card sx={{ borderRadius: 2 }}>
              <CardHeader title="クイックアクション" />
              <CardContent>
                <Stack spacing={2}>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<BlockIcon />}
                    fullWidth
                  >
                    選択したユーザーをBAN
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={<MuteIcon />}
                    fullWidth
                  >
                    選択したユーザーをミュート
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<DeleteIcon />}
                    fullWidth
                  >
                    選択したコメントを削除
                  </Button>
                  <Divider />
                  <Typography variant="subtitle2" gutterBottom>
                    一括操作
                  </Typography>
                  <Button variant="text" size="small">
                    全てのフラグ付きコメントを表示
                  </Button>
                  <Button variant="text" size="small">
                    スパムコメントを一括削除
                  </Button>
                  <Button variant="text" size="small">
                    モデレーションレポートを表示
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeTab === 1 && (
        <Card sx={{ borderRadius: 2 }}>
          <CardHeader
            title="最近のモデレーションアクション"
            subheader="監査記録から取得した直近20件。この画面からの操作もその場で反映されます"
          />
          <CardContent>
            {historyError && (
              <Alert severity="warning" sx={{ mb: 2 }}>{historyError}</Alert>
            )}
            {!historyError && recentActions.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                まだ操作はありません。
              </Typography>
            )}
            <List>
              {recentActions.map((action) => (
                <ListItem key={action.id}>
                  <ListItemAvatar>
                    {getActionIcon(action.type)}
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2">
                          {action.user}
                        </Typography>
                        <Chip
                          size="small"
                          label={action.type}
                          color={
                            action.type === 'ban' ? 'error' :
                            action.type === 'mute' ? 'warning' :
                            action.type === 'delete' ? 'error' : 'info'
                          }
                        />
                        <Chip
                          size="small"
                          label={action.platform}
                          variant="outlined"
                          color={action.platform === 'YouTube' ? 'error' : 'primary'}
                        />
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          {action.reason} • {action.moderator} • {formatRelativeTime(action.timestamp)}
                        </Typography>
                        {/* BANがプラットフォーム側へ届いたかを必ず出す。
                            届いていない場合、当人は配信で発言し続けられる。
                            バックエンドは platformBan.ok を返しているのに、
                            画面はそれを捨てていた（R-28b の後半が見えていなかった） */}
                        {action.type === 'ban' && action.platformApplied === true && (
                          <Typography variant="caption" color="success.main">
                            プラットフォーム側にも反映済み
                          </Typography>
                        )}
                        {action.type === 'ban' && action.platformApplied === false && (
                          <Typography variant="caption" color="error.main">
                            ローカルのみ。プラットフォーム側には未反映（当人は配信で発言できます）
                          </Typography>
                        )}
                        {/* E-38: 記録が無い古い行を「未反映」と表示してはいけない。
                            届かなかった(false)と、記録が無い(null)は別のことである */}
                        {action.type === 'ban' && action.platformApplied === null && (
                          <Typography variant="caption" color="text.secondary">
                            プラットフォームへの反映結果は記録されていません
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {activeTab === 2 && (
        <Card sx={{ borderRadius: 2 }}>
          <CardHeader title="ユーザー管理" />
          <CardContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              詳細なユーザー管理機能はユーザーパネルから利用できます。
            </Typography>
            <Button variant="outlined" startIcon={<PersonIcon />}>
              ユーザーパネルを開く
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 3 && <HeldMessagesQueue />}
      <Dialog
        open={userDialogOpen}
        onClose={() => setUserDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          ユーザー詳細: {selectedUser?.user}
        </DialogTitle>
        <DialogContent>
          {selectedUser && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Avatar sx={{ width: 80, height: 80, mx: 'auto', mb: 2 }}>
                  <PersonIcon sx={{ fontSize: 40 }} />
                </Avatar>
                <Typography align="center" variant="h6">
                  {selectedUser.user}
                </Typography>
                <Chip
                  label={selectedUser.platform}
                  color={selectedUser.platform === 'YouTube' ? 'error' : 'primary'}
                  sx={{ display: 'block', mx: 'auto', mt: 1 }}
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle2" gutterBottom>
                  リスクスコア: {(selectedUser.riskScore * 100).toFixed(1)}%
                </Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  最終コメント: {formatRelativeTime(selectedUser.timestamp)}
                </Typography>
                <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
                  最新のコメント:
                </Typography>
                <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                  {selectedUser.content}
                </Paper>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialogOpen(false)}>閉じる</Button>
          <Button
            color="warning"
            startIcon={<MuteIcon />}
            onClick={() => {
              handleUserAction('mute', selectedUser.user);
              setUserDialogOpen(false);
            }}
          >
            ミュート
          </Button>
          <Button
            color="error"
            startIcon={<BlockIcon />}
            onClick={() => {
              handleUserAction('ban', selectedUser.user);
              setUserDialogOpen(false);
            }}
          >
            BAN
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
