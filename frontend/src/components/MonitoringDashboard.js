import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  Paper,
  IconButton,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider
} from '@mui/material';
import {
  Memory,
  DeveloperBoard,
  Storage,
  NetworkCheck,
  Timeline,
  Warning,
  CheckCircle,
  Error,
  Info,
  Refresh,
  Settings,
  ShowChart,
  Speed,
  Assessment
} from '@mui/icons-material';
import { LineChart } from '@mui/x-charts/LineChart';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const MonitoringDashboard = () => {
  const [activeTab, setActiveTab] = useState('system');
  const [systemStats, setSystemStats] = useState(null);
  const [appStats, setAppStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const { t } = useTranslation();

  const rateLimitSummary = systemStats?.rateLimits || null;
  const rateLimitEntries = rateLimitSummary
    ? Object.entries(rateLimitSummary.byLimiter || {})
        .sort((a, b) => (b[1]?.total || 0) - (a[1]?.total || 0))
        .slice(0, 3)
    : [];

  // データ取得（axios経由で認証トークンを自動付与）
  const fetchJson = useCallback(async (url, contextLabel, signal) => {
    try {
      const response = await axios.get(url, { signal });
      return response.data;
    } catch (err) {
      const status = err.response?.status;
      throw new Error(`${contextLabel} fetch failed with status ${status ?? err.message}`);
    }
  }, []);

  const fetchData = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError(null);

      const [systemResult, appResult, logsResult, alertsResult] = await Promise.allSettled([
        fetchJson('/api/monitoring/system/stats', 'System stats', signal),
        fetchJson('/api/monitoring/app/stats', 'Application stats', signal),
        fetchJson('/api/monitoring/logs?limit=20', 'Logs', signal),
        fetchJson('/api/monitoring/alerts?limit=10', 'Alerts', signal)
      ]);

      let hasSuccess = false;
      const partialErrors = [];

      if (systemResult.status === 'fulfilled') {
        setSystemStats(systemResult.value.data);
        hasSuccess = true;
      } else {
        setSystemStats(null);
        partialErrors.push(systemResult.reason.message);
      }

      if (appResult.status === 'fulfilled') {
        setAppStats(appResult.value.data);
        hasSuccess = true;
      } else {
        setAppStats(null);
        partialErrors.push(appResult.reason.message);
      }

      if (logsResult.status === 'fulfilled') {
        setLogs(logsResult.value.data.logs || []);
        hasSuccess = true;
      } else {
        setLogs([]);
        partialErrors.push(logsResult.reason.message);
      }

      if (alertsResult.status === 'fulfilled') {
        setAlerts(alertsResult.value.data.alerts || []);
        hasSuccess = true;
      } else {
        setAlerts([]);
        partialErrors.push(alertsResult.reason.message);
      }

      if (!hasSuccess) {
        throw new Error(partialErrors.join(' / '));
      }

      if (partialErrors.length > 0) {
        setError(partialErrors.join('\n'));
      } else {
        setError(null);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      setError('データの取得に失敗しました');
      console.error('Monitoring data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);

    // 定期的にデータを更新
    const interval = setInterval(() => fetchData(controller.signal), 30000); // 30秒ごと
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchData]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const getStatusColor = (value, thresholds) => {
    if (value >= thresholds.warning) {
      return value >= thresholds.critical ? '#f44336' : '#ff9800';
    }
    return '#4caf50';
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  if (loading && !systemStats) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ ml: 2 }}>
          監視データを読み込み中...
        </Typography>
      </Box>
    );
  }

  if (!systemStats) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity={error ? 'error' : 'warning'}>
          <Typography variant="h6" gutterBottom>
            システム統計を取得できませんでした
          </Typography>
          {error}
          <Box sx={{ mt: 2 }}>
            <Button onClick={fetchData} variant="outlined">
              再試行
            </Button>
          </Box>
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2">{t('monitoring_dashboard_partial_error')}</Typography>
          <Typography variant="caption" display="block">{error}</Typography>
        </Alert>
      )}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h4" component="h1">
          <Assessment sx={{ mr: 1, verticalAlign: 'middle' }} />
          {t('monitoring_dashboard_title')}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={() => fetchData(new AbortController().signal)}
          disabled={loading}
        >
          {t('monitoring_dashboard_refresh')}
        </Button>
      </Box>

      <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 3 }}>
        <Tab
          label={
            <Box display="flex" alignItems="center">
              <Speed sx={{ mr: 1 }} />
              {t('monitoring_dashboard_tab_system')}
            </Box>
          }
          value="system"
        />
        <Tab
          label={
            <Box display="flex" alignItems="center">
              <ShowChart sx={{ mr: 1 }} />
              {t('monitoring_dashboard_tab_application')}
            </Box>
          }
          value="application"
        />
        <Tab
          label={
            <Box display="flex" alignItems="center">
              <Timeline sx={{ mr: 1 }} />
              {t('monitoring_dashboard_tab_logs')}
            </Box>
          }
          value="logs"
        />
        <Tab
          label={
            <Box display="flex" alignItems="center">
              <Warning sx={{ mr: 1 }} />
              {t('monitoring_dashboard_tab_alerts')}
              {alerts.filter(a => a.status === 'active').length > 0 && (
                <Chip
                  size="small"
                  color="error"
                  label={alerts.filter(a => a.status === 'active').length}
                  sx={{ ml: 1 }}
                />
              )}
            </Box>
          }
          value="alerts"
        />
      </Tabs>

      {/* システム監視タブ */}
      {activeTab === 'system' && systemStats && (
        <Grid container spacing={3}>
          {/* CPU使用率 */}
          <Grid item xs={12} md={6} lg={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      CPU使用率
                    </Typography>
                    <Typography variant="h4">
                      {systemStats.cpu.usage}%
                    </Typography>
                  </Box>
                  <DeveloperBoard sx={{ fontSize: 40, color: getStatusColor(systemStats.cpu.usage, { warning: 70, critical: 90 }) }} />
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={systemStats.cpu.usage}
                  sx={{
                    mt: 2,
                    height: 8,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getStatusColor(systemStats.cpu.usage, { warning: 70, critical: 90 })
                    }
                  }}
                />
                <Typography variant="body2" sx={{ mt: 1 }}>
                  コア数: {systemStats.cpu.cores}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* メモリ使用率 */}
          <Grid item xs={12} md={6} lg={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      メモリ使用率
                    </Typography>
                    <Typography variant="h4">
                      {systemStats.memory.usagePercent}%
                    </Typography>
                  </Box>
                  <Memory sx={{ fontSize: 40, color: getStatusColor(systemStats.memory.usagePercent, { warning: 80, critical: 90 }) }} />
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={systemStats.memory.usagePercent}
                  sx={{
                    mt: 2,
                    height: 8,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getStatusColor(systemStats.memory.usagePercent, { warning: 80, critical: 90 })
                    }
                  }}
                />
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {formatBytes(systemStats.memory.used)} / {formatBytes(systemStats.memory.total)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* ディスク使用率 */}
          <Grid item xs={12} md={6} lg={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      ディスク使用率
                    </Typography>
                    <Typography variant="h4">
                      {systemStats.disk[0]?.usePercent || 0}%
                    </Typography>
                  </Box>
                  <Storage sx={{ fontSize: 40, color: getStatusColor(systemStats.disk[0]?.usePercent || 0, { warning: 80, critical: 90 }) }} />
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={systemStats.disk[0]?.usePercent || 0}
                  sx={{
                    mt: 2,
                    height: 8,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getStatusColor(systemStats.disk[0]?.usePercent || 0, { warning: 80, critical: 90 })
                    }
                  }}
                />
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {formatBytes(systemStats.disk[0]?.used || 0)} / {formatBytes(systemStats.disk[0]?.size || 0)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* ネットワーク使用率 */}
          <Grid item xs={12} md={6} lg={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      ネットワーク
                    </Typography>
                    <Typography variant="h4">
                      {formatBytes(systemStats.network.totalRxBytes + systemStats.network.totalTxBytes)}
                    </Typography>
                  </Box>
                  <NetworkCheck sx={{ fontSize: 40, color: '#2196f3' }} />
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  受信: {formatBytes(systemStats.network.totalRxBytes)}
                </Typography>
                <Typography variant="body2">
                  送信: {formatBytes(systemStats.network.totalTxBytes)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* レートリミット統計 */}
          <Grid item xs={12} md={6} lg={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      レートリミット総数 / Total Rate Limit Hits
                    </Typography>
                    <Typography variant="h4">
                      {rateLimitSummary?.total ?? 0}
                    </Typography>
                  </Box>
                  <Warning sx={{ fontSize: 40, color: rateLimitSummary?.total ? '#ff9800' : '#4caf50' }} />
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  最終検知 / Last Triggered: {rateLimitSummary?.lastTriggeredAt ? new Date(rateLimitSummary.lastTriggeredAt).toLocaleString() : '未検知 / Not triggered'}
                </Typography>
                {rateLimitEntries.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      上位リミッター / Top Limiters
                    </Typography>
                    {rateLimitEntries.map(([limiterName, limiterStats]) => (
                      <Typography key={limiterName} variant="body2">
                        {limiterName}: {limiterStats.total} ({limiterStats.lastTriggeredAt ? new Date(limiterStats.lastTriggeredAt).toLocaleString() : '未検知'})
                      </Typography>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* システム情報 */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  システム情報
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2">
                      <strong>プラットフォーム:</strong> {systemStats.system.platform} {systemStats.system.arch}
                    </Typography>
                    <Typography variant="body2">
                      <strong>ホスト名:</strong> {systemStats.system.hostname}
                    </Typography>
                    <Typography variant="body2">
                      <strong>稼働時間:</strong> {formatUptime(systemStats.system.uptime)}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="body2">
                      <strong>Node.jsバージョン:</strong> {systemStats.system.nodeVersion}
                    </Typography>
                    <Typography variant="body2">
                      <strong>環境:</strong> {systemStats.system.environment}
                    </Typography>
                    <Typography variant="body2">
                      <strong>プロセス数:</strong> {systemStats.processes.total}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* アプリケーション監視タブ */}
      {activeTab === 'application' && appStats && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  アプリケーション統計
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <Typography variant="h4" color="primary">
                      {appStats.summary.totalComments}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      総コメント数
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Typography variant="h4" color="secondary">
                      {appStats.summary.totalModerated}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      モデレーション済み
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Typography variant="h4" color="success.main">
                      {appStats.summary.uniqueUsers}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      ユニークユーザー
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Typography variant="h4" color="info.main">
                      {appStats.summary.activeConnections}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      アクティブ接続
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* コメント統計チャート */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  コメント統計推移
                </Typography>
                <LineChart
                  height={300}
                  xAxis={[{ scaleType: 'point', data: (appStats.data ?? []).map(d => d.date) }]}
                  series={[
                    { data: (appStats.data ?? []).map(d => d.total_comments), label: 'コメント数', color: '#8884d8' },
                    { data: (appStats.data ?? []).map(d => d.moderated_comments), label: 'モデレーション数', color: '#82ca9d' },
                  ]}
                  margin={{ top: 20, right: 20, bottom: 30, left: 40 }}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ログタブ */}
      {activeTab === 'logs' && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  最近のログ
                </Typography>
                <List>
                  {logs.map((log, index) => (
                    <ListItem key={index} divider>
                      <ListItemIcon>
                        {log.level === 'error' && <Error color="error" />}
                        {log.level === 'warn' && <Warning color="warning" />}
                        {log.level === 'info' && <Info color="info" />}
                        {log.level === 'debug' && <CheckCircle color="success" />}
                      </ListItemIcon>
                      <ListItemText
                        primary={log.message}
                        secondary={`${log.timestamp} - ${log.source}`}
                      />
                    </ListItem>
                  ))}
                  {logs.length === 0 && (
                    <ListItem>
                      <ListItemText primary="ログがありません" />
                    </ListItem>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* アラートタブ */}
      {activeTab === 'alerts' && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  アラート一覧
                </Typography>
                <List>
                  {alerts.map((alert, index) => (
                    <ListItem key={index} divider>
                      <ListItemIcon>
                        {alert.severity === 'critical' && <Error color="error" />}
                        {alert.severity === 'warning' && <Warning color="warning" />}
                        {alert.severity === 'info' && <Info color="info" />}
                      </ListItemIcon>
                      <ListItemText
                        primary={alert.title}
                        secondary={`${alert.message} - ${alert.created_at}`}
                      />
                      <Chip
                        label={alert.status}
                        color={alert.status === 'active' ? 'error' : 'default'}
                        size="small"
                      />
                    </ListItem>
                  ))}
                  {alerts.length === 0 && (
                    <ListItem>
                      <ListItemText primary="アラートがありません" />
                    </ListItem>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* アラート詳細ダイアログ */}
      <Dialog open={!!selectedAlert} onClose={() => setSelectedAlert(null)} maxWidth="md" fullWidth>
        {selectedAlert && (
          <>
            <DialogTitle>
              アラート詳細
              <Chip
                label={selectedAlert.severity}
                color={selectedAlert.severity === 'critical' ? 'error' : 'warning'}
                sx={{ ml: 2 }}
              />
            </DialogTitle>
            <DialogContent>
              <Typography variant="h6" gutterBottom>
                {selectedAlert.title}
              </Typography>
              <Typography variant="body1" paragraph>
                {selectedAlert.message}
              </Typography>
              {selectedAlert.data && (
                <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(selectedAlert.data, null, 2)}
                  </pre>
                </Paper>
              )}
              <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                作成日時: {selectedAlert.created_at}
                {selectedAlert.acknowledged_at && (
                  <>
                    <br />
                    確認日時: {selectedAlert.acknowledged_at}
                    <br />
                    確認者: {selectedAlert.acknowledged_by}
                  </>
                )}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedAlert(null)}>閉じる</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default MonitoringDashboard;
