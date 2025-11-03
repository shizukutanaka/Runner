import React, { useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Button,
  Chip,
  Avatar,
  Menu,
  MenuItem,
  Paper,
  useTheme,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  PushPin as PushPinIcon,
  Delete as DeleteIcon,
  Reply as ReplyIcon,
  VideoLibrary as VideoLibraryIcon,
  Article as ArticleIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

const platformAvatar = (platform) => {
  const p = platform?.toLowerCase();
  if (p === 'youtube') return 'YT';
  if (p === 'twitch') return 'Tw';
  return 'N/A';
};

const platformColor = (platform, theme) => {
    const p = platform?.toLowerCase();
    if (p === 'youtube') return theme.palette.error.main;
    if (p === 'twitch') return theme.palette.secondary.main;
    return theme.palette.grey[500];
}

export default function CommentItem({ 
  comment,
  onPin,
  onDelete,
  onStatusChange,
  onGenerateReply,
  onSuggestRelatedVideos,
  onSuggestRelatedPapers,
  isReplying,
  aiReply,
  formatTimestamp,
  platformLabelMap
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMenuOpen = (event) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
  };

  const handleStatusSelect = (status) => {
    onStatusChange(comment.id, status);
    handleMenuClose();
  };

  const normalizedPlatform = comment.platform?.toLowerCase() || 'youtube';

  return (
    <Paper
      elevation={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        transition: 'background-color 0.2s, box-shadow 0.2s',
        '&:hover': {
          backgroundColor: theme.palette.action.hover,
          boxShadow: theme.shadows[1],
        },
        position: 'relative',
      }}
    >
      <Stack direction="row" spacing={2}>
        <Avatar sx={{ bgcolor: platformColor(normalizedPlatform, theme), width: 32, height: 32, fontSize: '0.8rem' }}>
          {platformAvatar(normalizedPlatform)}
        </Avatar>
        <Stack spacing={1} sx={{ flex: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {comment.user || t('anonymous_user', 'Anonymous')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatTimestamp(comment.timestamp)}
              </Typography>
            </Stack>
            <Box sx={{ position: 'absolute', top: 8, right: 8, opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s' }}>
              <IconButton size="small" onClick={handleMenuOpen} title={t('more_actions', 'More actions')}>
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Box>
          </Stack>

          <Typography variant="body2" color="text.primary" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {comment.content || comment.text}
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            {(comment.status && comment.status !== 'visible') && (
              <Chip size="small" label={t(`comment_status.${comment.status}`, comment.status)} />
            )}
            {(comment.presentation?.pinned ?? comment.pinned) && (
              <Chip size="small" color="primary" label={t('pinned', 'Pinned')} icon={<PushPinIcon />} />
            )}
          </Stack>

          {aiReply && (
            <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, bgcolor: 'background.default', borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                {t('ai_suggestion', 'AI Suggestion')}
              </Typography>
              <Typography variant="body2">{aiReply}</Typography>
            </Paper>
          )}

          <Box sx={{ pt: 1, opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s' }}>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button 
                size="small" 
                startIcon={<ReplyIcon />}
                onClick={() => onGenerateReply(comment.id, comment.content || comment.text)}
                disabled={isReplying}
              >
                {t('ai_reply', 'AI Reply')}
              </Button>
              <Button 
                size="small" 
                startIcon={<VideoLibraryIcon />}
                onClick={() => onSuggestRelatedVideos(comment)}
                title={t('suggest_related_videos', 'Suggest Related Videos')}
              >
                {t('related_videos', 'Related Videos')}
              </Button>
              <Button 
                size="small" 
                startIcon={<ArticleIcon />}
                onClick={() => onSuggestRelatedPapers(comment)}
                title={t('suggest_related_papers', 'Suggest Related Papers')}
              >
                {t('related_papers', 'Related Papers')}
              </Button>
            </Stack>
          </Box>

        </Stack>
      </Stack>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => onPin(comment.id)}>{t('pin_comment', 'Pin')}</MenuItem>
        <MenuItem onClick={() => onDelete(comment.id)} sx={{ color: 'error.main' }}>{t('delete_comment', 'Delete')}</MenuItem>
        <MenuItem onClick={() => handleStatusSelect('flagged')}>{t('flag_comment', 'Flag')}</MenuItem>
        <MenuItem onClick={() => handleStatusSelect('hidden')}>{t('hide_comment', 'Hide')}</MenuItem>
        <MenuItem onClick={() => handleStatusSelect('visible')}>{t('show_comment', 'Show')}</MenuItem>
      </Menu>
    </Paper>
  );
}
