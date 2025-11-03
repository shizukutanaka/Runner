import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Chip,
  Divider
} from '@mui/material';
import {
  Language as LanguageIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { SUPPORTED_LANGUAGES, getLanguageGroups, changeLanguage } from '../i18n';

/**
 * 言語スイッチャーコンポーネント
 * ユーザーが言語を切り替えられるドロップダウンメニューを提供
 */
const LanguageSwitcher = ({ variant = 'icon', size = 'medium' }) => {
  const { i18n } = useTranslation();
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);

  const currentLanguage = i18n.language;
  const languageGroups = getLanguageGroups();

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = async (langCode) => {
    if (langCode === currentLanguage) {
      handleClose();
      return;
    }

    setLoading(true);
    try {
      const success = await changeLanguage(langCode);
      if (success) {
        handleClose();
      }
    } catch (error) {
      console.error('言語変更エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // アイコンバリアントの場合
  if (variant === 'icon') {
    return (
      <>
        <IconButton
          size={size}
          onClick={handleClick}
          color="inherit"
          aria-label="言語設定"
          sx={{
            border: '1px solid',
            borderColor: 'rgba(255, 255, 255, 0.23)',
            borderRadius: 2,
            px: 1.5
          }}
        >
          <LanguageIcon fontSize={size} />
          <Typography variant="caption" sx={{ ml: 0.5 }}>
            {SUPPORTED_LANGUAGES[currentLanguage]?.nativeName || currentLanguage}
          </Typography>
        </IconButton>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleClose}
          PaperProps={{
            sx: { minWidth: 280, maxHeight: 400 }
          }}
        >
          {renderLanguageMenu()}
        </Menu>
      </>
    );
  }

  // ボタンバリアントの場合
  return (
    <>
      <Chip
        icon={<LanguageIcon />}
        label={SUPPORTED_LANGUAGES[currentLanguage]?.nativeName || currentLanguage}
        onClick={handleClick}
        variant="outlined"
        size={size}
        clickable
        disabled={loading}
      />

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        PaperProps={{
          sx: { minWidth: 280, maxHeight: 400 }
        }}
      >
        {renderLanguageMenu()}
      </Menu>
    </>
  );

  function renderLanguageMenu() {
    return (
      <>
        {/* 一般的な言語 */}
        {languageGroups.common.length > 0 && (
          <>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="overline" color="text.secondary">
                一般的な言語
              </Typography>
            </Box>
            {languageGroups.common.map(lang => renderLanguageItem(lang))}
            <Divider sx={{ my: 1 }} />
          </>
        )}

        {/* 欧州言語 */}
        {languageGroups.europe.length > 0 && (
          <>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="overline" color="text.secondary">
                欧州言語
              </Typography>
            </Box>
            {languageGroups.europe.map(lang => renderLanguageItem(lang))}
            <Divider sx={{ my: 1 }} />
          </>
        )}

        {/* アジア言語 */}
        {languageGroups.asia.length > 0 && (
          <>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="overline" color="text.secondary">
                アジア言語
              </Typography>
            </Box>
            {languageGroups.asia.map(lang => renderLanguageItem(lang))}
            <Divider sx={{ my: 1 }} />
          </>
        )}

        {/* RTL言語 */}
        {languageGroups.rtl.length > 0 && (
          <>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="overline" color="text.secondary">
                RTL言語
              </Typography>
            </Box>
            {languageGroups.rtl.map(lang => renderLanguageItem(lang))}
          </>
        )}
      </>
    );
  }

  function renderLanguageItem(lang) {
    const isSelected = lang.code === currentLanguage;
    const isRTL = lang.rtl;

    return (
      <MenuItem
        key={lang.code}
        onClick={() => handleLanguageChange(lang.code)}
        selected={isSelected}
        sx={{
          direction: isRTL ? 'rtl' : 'ltr',
          '&:hover': {
            backgroundColor: 'action.hover'
          }
        }}
      >
        <ListItemIcon sx={{ minWidth: 40 }}>
          {isSelected ? (
            <CheckIcon color="primary" fontSize="small" />
          ) : (
            <Box sx={{ fontSize: '1.2em' }}>{lang.flag}</Box>
          )}
        </ListItemIcon>

        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">
                {lang.nativeName}
              </Typography>
              {lang.name !== lang.nativeName && (
                <Typography variant="caption" color="text.secondary">
                  ({lang.name})
                </Typography>
              )}
            </Box>
          }
          secondary={
            isRTL && (
              <Chip
                label="RTL"
                size="small"
                variant="outlined"
                color="info"
                sx={{ fontSize: '0.7em', height: 20 }}
              />
            )
          }
        />

        {lang.code === currentLanguage && (
          <Chip
            label="現在の言語"
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontSize: '0.7em', height: 20 }}
          />
        )}
      </MenuItem>
    );
  }
};

export default LanguageSwitcher;
