import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Card,
  CardMedia,
  CardContent,
  Stack,
  Chip,
  Box,
  Alert,
  CircularProgress,
  useTheme,
} from '@mui/material';
import {
  Close as CloseIcon,
  Launch as LaunchIcon,
  ThumbUp as ThumbUpIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { findRelatedVideosFromComments } from '../api/youtube';

const formatDuration = (duration) => {
  if (!duration) return 'N/A';

  // ISO 8601 duration format (PT4M13S) を変換
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return duration;

  const hours = parseInt(match[1] || 0);
  const minutes = parseInt(match[2] || 0);
  const seconds = parseInt(match[3] || 0);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatNumber = (num) => {
  if (!num) return '0';
  return new Intl.NumberFormat().format(num);
};

export default function RelatedVideosDialog({
  open,
  onClose,
  comment,
  onVideoSelect
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [relatedVideos, setRelatedVideos] = useState([]);

  useEffect(() => {
    if (open && comment) {
      fetchRelatedVideos();
    }
  }, [open, comment]);

  const fetchRelatedVideos = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await findRelatedVideosFromComments([comment]);

      if (response.status === 200 && response.data) {
        setRelatedVideos(response.data);
      } else {
        setError(response.message || t('failed_to_fetch_videos', '動画の取得に失敗しました'));
      }
    } catch (err) {
      setError(err.message || t('failed_to_fetch_videos', '動画の取得に失敗しました'));
    } finally {
      setLoading(false);
    }
  };

  const handleVideoClick = (video) => {
    if (onVideoSelect) {
      onVideoSelect(video);
    }
    // YouTube動画ページを開く
    window.open(`https://www.youtube.com/watch?v=${video.videoId}`, '_blank');
  };

  const handleClose = () => {
    setRelatedVideos([]);
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          height: '80vh',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            {t('related_videos', '関連動画')}
          </Typography>
          <Button
            onClick={handleClose}
            startIcon={<CloseIcon />}
            size="small"
          >
            {t('close', '閉じる')}
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {t('related_videos_description', 'コメントから抽出した関連動画の提案')}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ flex: 1, overflow: 'auto', p: 0 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && relatedVideos.length === 0 && (
          <Alert severity="info" sx={{ m: 2 }}>
            {t('no_related_videos_found', '関連動画が見つかりませんでした')}
          </Alert>
        )}

        {!loading && !error && relatedVideos.length > 0 && (
          <Stack spacing={2} sx={{ p: 2 }}>
            {relatedVideos.map((video) => (
              <Card key={video.videoId} sx={{ cursor: 'pointer', '&:hover': { boxShadow: 2 } }}>
                <Stack direction="row" onClick={() => handleVideoClick(video)}>
                  <CardMedia
                    component="img"
                    sx={{ width: 160, height: 90, objectFit: 'cover' }}
                    image={video.thumbnailUrl}
                    alt={video.title}
                  />
                  <CardContent sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" gutterBottom sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: 1.2
                    }}>
                      {video.title}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {video.channelTitle}
                    </Typography>

                    <Stack direction="row" spacing={1} alignItems="center">
                      {video.viewCount && (
                        <Chip
                          icon={<VisibilityIcon />}
                          label={formatNumber(video.viewCount)}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {video.likeCount && (
                        <Chip
                          icon={<ThumbUpIcon />}
                          label={formatNumber(video.likeCount)}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {video.duration && (
                        <Chip
                          label={formatDuration(video.duration)}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Stack>

                    <Typography variant="caption" color="text.secondary" sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      mt: 1
                    }}>
                      {video.description}
                    </Typography>
                  </CardContent>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          {t('close', '閉じる')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
