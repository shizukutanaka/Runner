import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Alert, AlertTitle, Box, Collapse, IconButton, LinearProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';

const ALERT_FETCH_INTERVAL = 20000; // 20 seconds

const CriticalAlertsBanner = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    let isMounted = true;
    let intervalId;

    const fetchAlerts = async () => {
      try {
        setLoading(true);
        setError(null);

        // axios経由で呼ぶことで認証トークン(Bearer)がインターセプター経由で自動付与される
        // (api/comments.jsに登録済み。生fetch()ではヘッダーが付かず本番で常に401していた)
        const response = await axios.get('/api/monitoring/alerts', {
          params: { status: 'active', severity: 'critical', limit: 5 },
          timeout: 15000
        });

        if (!isMounted) {
          return;
        }

        const activeAlerts = response.data?.data?.alerts ?? [];
        setAlerts(activeAlerts);
        setVisible(true);
      } catch (err) {
        if (!isMounted || err.code === 'ERR_CANCELED') {
          return;
        }

        // 権限不足(moderatorがadmin限定エンドポイントを叩いた場合)は
        // 想定内の挙動なので、驚かせる赤いエラーバナーは出さず静かに何も表示しない
        if (err.response?.status === 403 || err.response?.status === 401) {
          setAlerts([]);
          return;
        }

        console.error('[CriticalAlertsBanner] Fetch error:', err);
        setError({
          key: err?.message ? 'critical_alerts_fetch_error_with_detail' : 'critical_alerts_fetch_error',
          params: err?.message ? { detail: err.message } : undefined
        });
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAlerts();
    intervalId = setInterval(fetchAlerts, ALERT_FETCH_INTERVAL);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  if (!visible) {
    return null;
  }

  const hasAlerts = alerts.length > 0;
  const errorMessage = error ? t(error.key, error.params) : null;

  return (
    <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1500, px: 2, pt: 1 }}>
      <Collapse in={hasAlerts || Boolean(errorMessage)}>
        <Alert
          severity={hasAlerts ? 'error' : 'warning'}
          variant="filled"
          action={(
            <IconButton
              aria-label={t('critical_alerts_dismiss')}
              size="small"
              onClick={() => setVisible(false)}
              sx={{ color: '#fff' }}
            >
              <CloseIcon fontSize="inherit" />
            </IconButton>
          )}
          sx={{ boxShadow: 3 }}
        >
          <AlertTitle>
            {hasAlerts
              ? t('critical_alerts_active_title')
              : t('critical_alerts_error_title')}
          </AlertTitle>
          {hasAlerts ? (
            <Box component="ul" sx={{ pl: 3, mb: 0 }}>
              {alerts.map((alert) => (
                <Box component="li" key={alert.id} sx={{ mb: 0.5 }}>
                  <strong>{alert.title}</strong>: {alert.message}
                </Box>
              ))}
            </Box>
          ) : (
            errorMessage
          )}
        </Alert>
      </Collapse>
      {loading && <LinearProgress color="error" />}
    </Box>
  );
};

export default CriticalAlertsBanner;
