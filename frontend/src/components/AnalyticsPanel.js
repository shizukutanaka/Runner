import React from 'react';
import { Box, Typography, Paper, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function AnalyticsPanel() {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', p: { xs: 1, sm: 2 } }}>
      <Typography variant="h6" gutterBottom>
        {t('analytics_panel_title')}
      </Typography>
      <Paper sx={{ p: 2, mb: 2, bgcolor: theme.palette.background.paper }}>
        <Typography variant="body2">
          {t('analytics_panel_placeholder')}
        </Typography>
      </Paper>
    </Box>
  );
}
