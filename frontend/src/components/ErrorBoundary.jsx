import React from 'react';
import {
  Alert,
  AlertTitle,
  Button,
  Container,
  Paper,
  Typography,
  Box,
  Collapse,
  IconButton,
  Chip,
  Stack,
  Divider,
  Link
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import BugReportIcon from '@mui/icons-material/BugReport';
import HomeIcon from '@mui/icons-material/Home';
import ContactSupportIcon from '@mui/icons-material/ContactSupport';
import { withTranslation } from 'react-i18next';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      showDetails: false,
      retryCount: 0,
      lastErrorTime: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    const now = Date.now();
    const timeSinceLastError = this.state.lastErrorTime
      ? now - this.state.lastErrorTime
      : Infinity;

    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
      retryCount: 0, // エラー発生時はリトライカウントをリセット
      lastErrorTime: now
    }));

    // エラーログをサーバーに送信
    this.logErrorToService(error, errorInfo);

    // 連続エラーの場合はより詳細なログを記録
    if (timeSinceLastError < 30000) { // 30秒以内の連続エラー
      console.warn('[ErrorBoundary] Rapid consecutive errors detected', {
        timeSinceLastError,
        errorCount: this.state.errorCount + 1
      });
    }
  }

  logErrorToService = (error, errorInfo) => {
    try {
      const errorReport = {
        message: error.toString(),
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        errorBoundary: 'main',
        errorId: this.generateErrorId(),
        sessionId: this.getSessionId(),
        buildVersion: this.getBuildVersion(),
        userId: this.getCurrentUserId()
      };

      // 本番環境でのみエラーレポートを送信
      if (import.meta.env.PROD && window.gtag) {
        // Google Analytics 4 イベントとして記録
        window.gtag('event', 'exception', {
          description: errorReport.message,
          fatal: true,
          error_id: errorReport.errorId,
          custom_map: {
            error_boundary: errorReport.errorBoundary,
            build_version: errorReport.buildVersion
          }
        });
      }

      // 開発環境ではコンソールに詳細ログを出力
      if (import.meta.env.DEV) {
        console.group('🚨 Error Boundary - Error Details');
        console.error('Error Message:', errorReport.message);
        console.error('Error Stack:', errorReport.stack);
        console.error('Component Stack:', errorReport.componentStack);
        console.error('Error Context:', {
          timestamp: errorReport.timestamp,
          url: errorReport.url,
          userAgent: errorReport.userAgent,
          errorId: errorReport.errorId
        });
        console.groupEnd();
      }
    } catch (err) {
      console.error('Failed to log error to service:', err);
    }
  };

  generateErrorId = () => {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  getSessionId = () => {
    let sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('session_id', sessionId);
    }
    return sessionId;
  };

  getBuildVersion = () => {
    return import.meta.env.VITE_APP_VERSION || 'unknown';
  };

  getCurrentUserId = () => {
    // 実際のユーザーID取得ロジックをここに実装
    return localStorage.getItem('user_id') || 'anonymous';
  };

  handleReset = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1
    }));

    // 複数回の失敗時はページリロードを提案
    if (this.state.errorCount >= 3) {
      this.showReloadSuggestion();
    }
  };

  showReloadSuggestion = () => {
    const { t } = this.props;
    if (confirm(t('error_boundary_reload_prompt'))) {
      window.location.reload();
    }
  };

  handleReportError = () => {
    const { t } = this.props;
    const { error, errorInfo } = this.state;
    const errorReport = {
      message: error?.toString() || 'Unknown error',
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    // エラーレポート用のメール本文を生成
    const mailtoLink = `mailto:support@example.com?subject=${encodeURIComponent(t('error_boundary_report_subject'))}&body=${encodeURIComponent(
      `${t('error_boundary_report_heading')}

${t('error_boundary_report_error_detail')}
${errorReport.message}

${t('error_boundary_report_timestamp')}: ${errorReport.timestamp}
URL: ${errorReport.url}
${t('error_boundary_report_user_agent')}: ${errorReport.userAgent}

${t('error_boundary_report_stack_trace')}:
${errorReport.stack || t('error_boundary_report_none')}

${t('error_boundary_report_component_stack')}:
${errorReport.componentStack || t('error_boundary_report_none')}

${t('error_boundary_report_footer')}`
    )}`;

    window.open(mailtoLink);
  };

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <Container maxWidth="md" sx={{ mt: 4, px: { xs: 2, sm: 3 } }}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, sm: 4 },
              borderRadius: 3,
              border: `2px solid #f44336`,
              bgcolor: '#fafafa',
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '4px',
                bgcolor: '#f44336'
              }
            }}
          >
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <ErrorOutlineIcon
                sx={{
                  fontSize: { xs: 48, sm: 64 },
                  color: '#f44336',
                  mb: 2,
                }}
              />

              <Alert
                severity="error"
                sx={{
                  mb: 3,
                  borderRadius: 2,
                  '& .MuiAlert-icon': {
                    color: '#f44336',
                    fontSize: { xs: 20, sm: 24 }
                  },
                }}
              >
                <AlertTitle sx={{ fontWeight: 600, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  {t('error_boundary_title')}
                </AlertTitle>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {t('error_boundary_description')}
                </Typography>
              </Alert>
            </Box>

            {/* エラー統計情報 */}
            <Box sx={{ mb: 3 }}>
              <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap">
                <Chip
                  label={t('error_boundary_chip_error_count', { count: this.state.errorCount })}
                  color="error"
                  variant="outlined"
                  size="small"
                />
                <Chip
                  label={t('error_boundary_chip_retry_count', { count: this.state.retryCount })}
                  color="warning"
                  variant="outlined"
                  size="small"
                />
                <Chip
                  label={t('error_boundary_chip_error_id', { id: this.generateErrorId() })}
                  color="info"
                  variant="outlined"
                  size="small"
                />
              </Stack>
            </Box>

            {/* エラー詳細の展開/折りたたみ */}
            {import.meta.env.DEV && (
              <>
                <Box sx={{ textAlign: 'center', mb: 3 }}>
                  <Button
                    variant="outlined"
                    onClick={() => this.setState({ showDetails: !this.state.showDetails })}
                    startIcon={this.state.showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 500,
                    }}
                  >
                    {this.state.showDetails ? t('error_boundary_hide_details') : t('error_boundary_show_details')}
                  </Button>
                </Box>

                <Collapse in={this.state.showDetails}>
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" gutterBottom sx={{ color: '#333', fontWeight: 600 }}>
                      {t('error_boundary_details_heading')}
                    </Typography>

                    {this.state.error && (
                      <Paper
                        sx={{
                          p: 2,
                          mb: 2,
                          bgcolor: '#f5f5f5',
                          borderRadius: 2,
                          border: '1px solid #e0e0e0',
                          overflow: 'auto',
                        }}
                      >
                        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                          {t('error_boundary_error_message_label')}
                        </Typography>
                        <Typography
                          variant="body2"
                          component="pre"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                        >
                          {this.state.error.toString()}
                        </Typography>
                      </Paper>
                    )}

                    {this.state.error?.stack && (
                      <Paper
                        sx={{
                          p: 2,
                          mb: 2,
                          bgcolor: '#f5f5f5',
                          borderRadius: 2,
                          border: '1px solid #e0e0e0',
                          overflow: 'auto',
                          maxHeight: 200,
                        }}
                      >
                        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                          {t('error_boundary_stack_trace_label')}
                        </Typography>
                        <Typography
                          variant="body2"
                          component="pre"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                        >
                          {this.state.error.stack}
                        </Typography>
                      </Paper>
                    )}

                    {this.state.errorInfo && (
                      <Paper
                        sx={{
                          p: 2,
                          bgcolor: '#f5f5f5',
                          borderRadius: 2,
                          border: '1px solid #e0e0e0',
                          overflow: 'auto',
                          maxHeight: 300,
                        }}
                      >
                        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
                          {t('error_boundary_component_stack_label')}
                        </Typography>
                        <Typography
                          variant="body2"
                          component="pre"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.7rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                        >
                          {this.state.errorInfo.componentStack}
                        </Typography>
                      </Paper>
                    )}
                  </Box>
                </Collapse>
              </>
            )}

            <Divider sx={{ my: 3 }} />

            {/* アクションボタン */}
            <Box sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<RefreshIcon />}
                onClick={this.handleReset}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  px: 3,
                }}
              >
                {t('error_boundary_action_retry')}
              </Button>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<BugReportIcon />}
                onClick={this.handleReportError}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  px: 3,
                }}
              >
                {t('error_boundary_action_report')}
              </Button>
              <Button
                variant="text"
                color="primary"
                startIcon={<HomeIcon />}
                onClick={() => window.location.href = '/'}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                }}
              >
                {t('error_boundary_action_home')}
              </Button>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="textSecondary">
                {t('error_boundary_support_text')}
              </Typography>
              <Button
                variant="text"
                startIcon={<ContactSupportIcon />}
                onClick={this.handleReportError}
              >
                {t('error_boundary_action_contact_support')}
              </Button>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="caption" color="textSecondary">
                {t('error_boundary_footer_note')}
              </Typography>
              <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 1 }}>
                <Link
                  href="mailto:support@example.com"
                  underline="hover"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    color: 'primary.main',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  <ContactSupportIcon fontSize="small" />
                  サポートに連絡
                </Link>
                <Link
                  href="https://docs.example.com/troubleshooting"
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    color: 'primary.main',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  トラブルシューティングガイド
                </Link>
              </Stack>
            </Box>
          </Paper>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
