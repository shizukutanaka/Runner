import { CircularProgress, Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function CommonLoading({ messageKey = 'loading' }) {
  const { t } = useTranslation();
  const message = messageKey ? t(messageKey) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', my: 3 }}>
      <CircularProgress />
      {message && (
        <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
          {message}
        </Typography>
      )}
    </Box>
  );
}
