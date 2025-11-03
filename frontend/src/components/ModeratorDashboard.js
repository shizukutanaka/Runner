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
  SentimentSatisfied as SentimentSatisfiedIcon,
  SentimentDissatisfied as SentimentDissatisfiedIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

export default function ModeratorDashboard({ platform = 'all' }) {
  const theme = useTheme();
  const { t } = useTranslation();

  // 状態管理
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [moderationStats, setModerationStats] = useState({
    totalComments: 1247,
    flaggedComments: 23,
    bannedUsers: 5,
    mutedUsers: 12,
    activeWarnings: 8,
  });
  const [activeTimeouts, setActiveTimeouts] = useState([]);
  const [timeoutReasons, setTimeoutReasons] = useState([]);
  const [selectedUserForTimeout, setSelectedUserForTimeout] = useState(null);
  const [timeoutDialogOpen, setTimeoutDialogOpen] = useState(false);
  const [recentActions, setRecentActions] = useState([
    {
      id: 1,
      type: 'ban',
      user: 'troll_user123',
      reason: 'スパム行為',
      moderator: 'mod_admin',
      timestamp: new Date(Date.now() - 300000),
      platform: 'YouTube',
    },
    {
      id: 2,
      type: 'mute',
      user: 'spam_bot',
      reason: '自動検知されたスパム',
      moderator: 'AI',
      timestamp: new Date(Date.now() - 600000),
      platform: 'Twitch',
    },
    {
      id: 3,
      type: 'delete',
      user: 'offensive_user',
      reason: '不適切なコメント',
      moderator: 'mod_john',
      timestamp: new Date(Date.now() - 900000),
      platform: 'YouTube',
    },
  ]);

  // モックデータ - 最近のコメント
  const [sentimentStats, setSentimentStats] = useState({
    totalAnalyzed: 0,
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    averageScore: 0,
    topPositiveKeywords: [],
    topNegativeKeywords: []
  });

  // フィルタリングされたコメント
  const filteredComments = recentComments.filter(comment =>
    comment.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
    comment.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ユーザーアクション
  const handleUserAction = (action, userId, reason = '') => {
    // 実際の実装ではAPIコール
    console.log(`${action} user:`, userId, reason);

    // モック: 最近のアクションに追加
    const newAction = {
      id: Date.now(),
      type: action,
      user: userId,
      reason: reason || `${action} by moderator`,
      moderator: 'current_mod',
      timestamp: new Date(),
      platform: platform === 'all' ? 'YouTube' : platform,
    };

    setRecentActions(prev => [newAction, ...prev.slice(0, 9)]); // 最新10件保持
  };

  // コメントアクション
  const handleCommentAction = (action, commentId) => {
    // 実際の実装ではAPIコール
    console.log(`${action} comment:`, commentId);

    setRecentComments(prev =>
      prev.map(comment =>
        comment.id === commentId
          ? { ...comment, status: action === 'delete' ? 'deleted' : 'hidden' }
          : comment
      )
    );
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

      {/* 統計カード */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ChatIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" color="primary">
                  {moderationStats.totalComments.toLocaleString()}
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
                <Badge badgeContent={moderationStats.flaggedComments} color="error">
                  <FlagIcon color="warning" sx={{ mr: 1 }} />
                </Badge>
                <Typography variant="h6" color="warning.main">
                  {moderationStats.flaggedComments}
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
                  {moderationStats.bannedUsers}
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
                  {moderationStats.mutedUsers}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                ミュートユーザー
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <SentimentSatisfiedIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="h6" color="success.main">
                  {sentimentStats.sentimentBreakdown?.positive || 0}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                ポジティブ感情
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <SentimentDissatisfiedIcon color="error" sx={{ mr: 1 }} />
                <Typography variant="h6" color="error.main">
                  {sentimentStats.sentimentBreakdown?.negative || 0}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                ネガティブ感情
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
          <Tab label="感情分析" />
          <Tab label="ユーザー管理" />
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
          <CardHeader title="最近のモデレーションアクション" />
          <CardContent>
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
        <Grid container spacing={3}>
          {/* 感情分析概要 */}
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius: 2 }}>
              <CardHeader title="感情分析概要" />
              <CardContent>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h4" sx={{ mb: 1 }}>
                    {sentimentStats.averageScore?.toFixed(2) || '0.00'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    平均感情スコア
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <Chip
                    icon={<SentimentSatisfiedIcon />}
                    label={`ポジティブ: ${sentimentStats.sentimentBreakdown?.positive || 0}`}
                    color="success"
                    variant="outlined"
                  />
                  <Chip
                    label={`ニュートラル: ${sentimentStats.sentimentBreakdown?.neutral || 0}`}
                    color="default"
                    variant="outlined"
                  />
                  <Chip
                    icon={<SentimentDissatisfiedIcon />}
                    label={`ネガティブ: ${sentimentStats.sentimentBreakdown?.negative || 0}`}
                    color="error"
                    variant="outlined"
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* 人気キーワード */}
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius: 2 }}>
              <CardHeader title="人気キーワード" />
              <CardContent>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2" gutterBottom sx={{ color: 'success.main' }}>
                      ポジティブ
                    </Typography>
                    <Box>
                      {(sentimentStats.topPositiveKeywords || []).slice(0, 3).map((keyword, index) => (
                        <Chip
                          key={index}
                          label={`${keyword.word} (${keyword.count})`}
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ mr: 1, mb: 1 }}
                        />
                      ))}
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2" gutterBottom sx={{ color: 'error.main' }}>
                      ネガティブ
                    </Typography>
                    <Box>
                      {(sentimentStats.topNegativeKeywords || []).slice(0, 3).map((keyword, index) => (
                        <Chip
                          key={index}
                          label={`${keyword.word} (${keyword.count})`}
                          size="small"
                          color="error"
                          variant="outlined"
                          sx={{ mr: 1, mb: 1 }}
                        />
                      ))}
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* 感情トレンド */}
          <Grid item xs={12}>
            <Card sx={{ borderRadius: 2 }}>
              <CardHeader title="感情トレンド" />
              <CardContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  直近の感情分析結果
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
                  {(sentimentStats.recentSentiments || []).map((sentiment, index) => (
                    <Paper
                      key={index}
                      sx={{
                        p: 2,
                        minWidth: 200,
                        borderRadius: 2,
                        border: 1,
                        borderColor: 
                          sentiment.sentiment === 'positive' ? 'success.light' :
                          sentiment.sentiment === 'negative' ? 'error.light' : 'grey.300'
                      }}
                    >
                      <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
                        "{sentiment.content.length > 30 ? sentiment.content.substring(0, 30) + '...' : sentiment.content}"
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {sentiment.sentiment === 'positive' && <SentimentSatisfiedIcon color="success" fontSize="small" />}
                        {sentiment.sentiment === 'negative' && <SentimentDissatisfiedIcon color="error" fontSize="small" />}
                        <Typography variant="caption" color="text.secondary">
                          {sentiment.sentiment} ({sentiment.score})
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {formatRelativeTime(new Date(sentiment.timestamp))}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeTab === 3 && (
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
