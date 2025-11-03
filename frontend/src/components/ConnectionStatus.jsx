import React, { useState, useEffect } from 'react';
import { Box, Chip, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import SyncIcon from '@mui/icons-material/Sync';
import ErrorIcon from '@mui/icons-material/Error';
import { connectionManager } from '../ws';

const ConnectionStatus = () => {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastError, setLastError] = useState(null);
  const { t } = useTranslation();

  useEffect(() => {
    // 接続状態の変更を監視
    const handleStateChange = (state) => {
      setConnectionState(state);
      if (state === 'connected') {
        setLastError(null);
        setReconnectAttempts(0);
      }
    };

    const handleReconnecting = ({ attemptNumber }) => {
      setReconnectAttempts(attemptNumber);
    };

    const handleConnectionError = ({ error, attempts }) => {
      setLastError(error);
      setReconnectAttempts(attempts);
    };

    const handleReconnectFailed = () => {
      setConnectionState('failed');
    };

    // イベントリスナーを登録
    connectionManager.on('stateChange', handleStateChange);
    connectionManager.on('reconnecting', handleReconnecting);
    connectionManager.on('connectionError', handleConnectionError);
    connectionManager.on('reconnectFailed', handleReconnectFailed);

    // 初期状態を設定
    setConnectionState(connectionManager.getState());

    // クリーンアップ
    return () => {
      connectionManager.off?.('stateChange', handleStateChange);
      connectionManager.off?.('reconnecting', handleReconnecting);
      connectionManager.off?.('connectionError', handleConnectionError);
      connectionManager.off?.('reconnectFailed', handleReconnectFailed);
    };
  }, []);

  const getStatusConfig = () => {
    switch (connectionState) {
      case 'connected':
        return {
          label: t('connection_status_label_connected'),
          color: 'success',
          icon: <WifiIcon sx={{ fontSize: 16 }} />,
          tooltip: t('connection_status_tooltip_connected')
        };
      case 'reconnecting':
        return {
          label: t('connection_status_label_reconnecting', { attempts: reconnectAttempts }),
          color: 'warning',
          icon: <SyncIcon sx={{ fontSize: 16, animation: 'spin 1s linear infinite' }} />,
          tooltip: t('connection_status_tooltip_reconnecting', { attempts: reconnectAttempts })
        };
      case 'error':
        return {
          label: t('connection_status_label_error'),
          color: 'error',
          icon: <ErrorIcon sx={{ fontSize: 16 }} />,
          tooltip: lastError
            ? t('connection_status_tooltip_error_with_message', { error: lastError })
            : t('connection_status_tooltip_error')
        };
      case 'failed':
        return {
          label: t('connection_status_label_failed'),
          color: 'error',
          icon: <WifiOffIcon sx={{ fontSize: 16 }} />,
          tooltip: t('connection_status_tooltip_failed')
        };
      default:
        return {
          label: t('connection_status_label_disconnected'),
          color: 'default',
          icon: <WifiOffIcon sx={{ fontSize: 16 }} />,
          tooltip: t('connection_status_tooltip_disconnected')
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1400 }}>
      <Tooltip title={config.tooltip} arrow>
        <Chip
          icon={config.icon}
          label={config.label}
          color={config.color}
          size="small"
          variant="outlined"
          sx={{
            backdropFilter: 'blur(10px)',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            '& .MuiChip-icon': {
              marginLeft: '8px'
            }
          }}
        />
      </Tooltip>

      <style>
        {`
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </Box>
  );
};

export default ConnectionStatus;
