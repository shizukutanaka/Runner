import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Snackbar,
  Stack,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Card,
  CardContent,
  Divider,
  Chip,
  IconButton,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Palette as PaletteIcon,
  Notifications as NotificationsIcon,
  Security as SecurityIcon,
  Translate as TranslateIcon,
  SmartToy as ChatbotIcon,
  ExpandMoreIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';

export default function SettingsPanel({ platform = 'YouTube' }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('moderation');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // 設定の初期化
  useEffect(() => {
    loadSettings();
  }, [platform]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // 実際の実装ではAPIから設定を取得
      const defaultSettings = {
        moderation: {
          commentMaxLength: 500,
          autoTranslation: {
            enabled: false,
            targetLanguage: 'ja',
            sourceLanguage: 'auto'
          },
          pinLimit: 10,
          autoDeleteTime: 24,
          autoNGWord: {
            enabled: false,
            threshold: 0.8,
            minOccurrences: 3
          }
        },
        ai: {
          individualThresholds: {},
          modelVersion: 'gpt-3.5-turbo'
        },
        ui: {
          theme: 'light',
          primaryColor: '#2563eb',
          secondaryColor: '#7c3aed'
        },
        notifications: {
          enabled: true,
          email: true,
          push: true,
          sound: true
        },
        security: {
          banHistory: {},
          userMuteSettings: {},
          userCommentColors: {}
        }
      };
      setSettings(defaultSettings);
    } catch (err) {
      setError('settings_load_error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (category, data) => {
    setLoading(true);
    try {
      // 実際の実装ではAPIに保存
      setSettings(prev => ({
        ...prev,
        [category]: { ...prev[category], ...data }
      }));
      setSuccess(true);
    } catch (err) {
      setError('settings_save_error');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'moderation', label: t('settings_tab_moderation'), icon: <SecurityIcon /> },
    { id: 'ai', label: t('settings_tab_ai'), icon: <SettingsIcon /> },
    { id: 'chatbot', label: 'AIチャットボット', icon: <ChatbotIcon /> },
    { id: 'ui', label: t('settings_tab_ui'), icon: <PaletteIcon /> },
    { id: 'notifications', label: t('settings_tab_notifications'), icon: <NotificationsIcon /> },
    { id: 'translation', label: t('settings_tab_translation'), icon: <TranslateIcon /> }
  ];

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 1, sm: 2 } }}>
      <Typography variant="h4" gutterBottom sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        fontWeight: 600,
        color: theme.palette.text.primary,
        letterSpacing: '-0.025em',
        mb: 4,
      }}>
        <SettingsIcon sx={{ color: theme.palette.primary.main }} />
        {t('settings_title')}
      </Typography>

      {loading && <CircularProgress sx={{ m: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{t(error)}</Alert>}

      {/* タブナビゲーション */}
      <Box sx={{ borderBottom: `2px solid ${theme.palette.divider}`, mb: 3 }}>
        <Stack direction="row" spacing={0} sx={{ overflowX: 'auto' }}>
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'contained' : 'text'}
              startIcon={tab.icon}
              onClick={() => setActiveTab(tab.id)}
              sx={{
                borderRadius: 0,
                px: 3,
                py: 2,
                minWidth: 'auto',
                fontWeight: activeTab === tab.id ? 600 : 500,
                color: activeTab === tab.id ? theme.palette.primary.contrastText : theme.palette.text.secondary,
                backgroundColor: activeTab === tab.id ? theme.palette.primary.main : 'transparent',
                borderBottom: activeTab === tab.id ? `3px solid ${theme.palette.primary.main}` : '3px solid transparent',
                '&:hover': {
                  backgroundColor: activeTab === tab.id ? theme.palette.primary.dark : theme.palette.action.hover,
                  transform: 'none',
                },
                '& .MuiButton-startIcon': {
                  color: activeTab === tab.id ? theme.palette.primary.contrastText : theme.palette.text.secondary,
                },
              }}
            >
              {tab.label}
            </Button>
          ))}
        </Stack>
      </Box>

      {/* モデレーション設定 */}
      {activeTab === 'moderation' && (
        <Card sx={{
          borderRadius: 3,
          boxShadow: '0 1px 3px 0 rgba(23, 43, 77, 0.1)',
          border: `1px solid ${theme.palette.divider}`,
          overflow: 'visible',
        }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              {t('settings_moderation_section_title')}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('settings_comment_max_length_label')}
                  type="number"
                  value={settings.moderation?.commentMaxLength || 500}
                  onChange={(e) => handleSave('moderation', { commentMaxLength: parseInt(e.target.value) })}
                  InputProps={{ inputProps: { min: 1, max: 10000 } }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('settings_pin_limit_label')}
                  type="number"
                  value={settings.moderation?.pinLimit || 10}
                  onChange={(e) => handleSave('moderation', { pinLimit: parseInt(e.target.value) })}
                  InputProps={{ inputProps: { min: 1, max: 100 } }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('settings_auto_delete_hours_label')}
                  type="number"
                  value={settings.moderation?.autoDeleteTime || 24}
                  onChange={(e) => handleSave('moderation', { autoDeleteTime: parseInt(e.target.value) })}
                  InputProps={{ inputProps: { min: 0, max: 8760 } }}
                />
              </Grid>
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" gutterBottom>{t('settings_auto_ng_word_title')}</Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.moderation?.autoNGWord?.enabled || false}
                        onChange={(e) => handleSave('moderation', {
                          autoNGWord: {
                            ...settings.moderation?.autoNGWord,
                            enabled: e.target.checked
                          }
                        })}
                      />
                    }
                    label={t('settings_enabled_label')}
                  />
                  <TextField
                    label={t('settings_threshold_label')}
                    type="number"
                    size="small"
                    value={settings.moderation?.autoNGWord?.threshold || 0.8}
                    onChange={(e) => handleSave('moderation', {
                      autoNGWord: {
                        ...settings.moderation?.autoNGWord,
                        threshold: parseFloat(e.target.value)
                      }
                    })}
                    InputProps={{ inputProps: { min: 0.1, max: 1.0, step: 0.1 } }}
                    sx={{ width: 100 }}
                  />
                  <TextField
                    label={t('settings_min_occurrences_label')}
                    type="number"
                    size="small"
                    value={settings.moderation?.autoNGWord?.minOccurrences || 3}
                    onChange={(e) => handleSave('moderation', {
                      autoNGWord: {
                        ...settings.moderation?.autoNGWord,
                        minOccurrences: parseInt(e.target.value)
                      }
                    })}
                    InputProps={{ inputProps: { min: 1 } }}
                    sx={{ width: 120 }}
                  />
                </Stack>
              </Grid>

              {/* スローモード設定 */}
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" gutterBottom>{t('settings_slow_mode_title')}</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={settings.moderation?.slowMode?.enabled || false}
                          onChange={(e) => handleSave('moderation', {
                            slowMode: {
                              ...settings.moderation?.slowMode,
                              enabled: e.target.checked
                            }
                          })}
                        />
                      }
                      label={t('settings_slow_mode_enabled_label')}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label={t('settings_slow_mode_interval_label')}
                      type="number"
                      value={settings.moderation?.slowMode?.intervalSeconds || 30}
                      onChange={(e) => handleSave('moderation', {
                        slowMode: {
                          ...settings.moderation?.slowMode,
                          intervalSeconds: parseInt(e.target.value)
                        }
                      })}
                      InputProps={{ inputProps: { min: 0, max: 300 } }}
                      helperText={t('settings_slow_mode_interval_help')}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Typography variant="body2" color="text.secondary">
                      {t('settings_slow_mode_description')}
                    </Typography>
                  </Grid>
                </Grid>

                {/* プラットフォーム別設定 */}
                <Accordion sx={{ mt: 2 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle2">{t('settings_slow_mode_platform_specific')}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" gutterBottom sx={{ fontWeight: 600 }}>
                          YouTube
                        </Typography>
                        <Stack direction="row" spacing={2} alignItems="center">
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={settings.moderation?.slowMode?.platformSpecific?.youtube?.enabled || false}
                                onChange={(e) => handleSave('moderation', {
                                  slowMode: {
                                    ...settings.moderation?.slowMode,
                                    platformSpecific: {
                                      ...settings.moderation?.slowMode?.platformSpecific,
                                      youtube: {
                                        ...settings.moderation?.slowMode?.platformSpecific?.youtube,
                                        enabled: e.target.checked
                                      }
                                    }
                                  }
                                })}
                              />
                            }
                            label={t('settings_enabled_label')}
                          />
                          <TextField
                            size="small"
                            label={t('settings_slow_mode_interval_label')}
                            type="number"
                            value={settings.moderation?.slowMode?.platformSpecific?.youtube?.intervalSeconds || 30}
                            onChange={(e) => handleSave('moderation', {
                              slowMode: {
                                ...settings.moderation?.slowMode,
                                platformSpecific: {
                                  ...settings.moderation?.slowMode?.platformSpecific,
                                  youtube: {
                                    ...settings.moderation?.slowMode?.platformSpecific?.youtube,
                                    intervalSeconds: parseInt(e.target.value)
                                  }
                                }
                              }
                            })}
                            InputProps={{ inputProps: { min: 0, max: 300 } }}
                            sx={{ width: 120 }}
                          />
                        </Stack>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Typography variant="body2" gutterBottom sx={{ fontWeight: 600 }}>
                          Twitch
                        </Typography>
                        <Stack direction="row" spacing={2} alignItems="center">
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={settings.moderation?.slowMode?.platformSpecific?.twitch?.enabled || false}
                                onChange={(e) => handleSave('moderation', {
                                  slowMode: {
                                    ...settings.moderation?.slowMode,
                                    platformSpecific: {
                                      ...settings.moderation?.slowMode?.platformSpecific,
                                      twitch: {
                                        ...settings.moderation?.slowMode?.platformSpecific?.twitch,
                                        enabled: e.target.checked
                                      }
                                    }
                                  }
                                })}
                              />
                            }
                            label={t('settings_enabled_label')}
                          />
                          <TextField
                            size="small"
                            label={t('settings_slow_mode_interval_label')}
                            type="number"
                            value={settings.moderation?.slowMode?.platformSpecific?.twitch?.intervalSeconds || 30}
                            onChange={(e) => handleSave('moderation', {
                              slowMode: {
                                ...settings.moderation?.slowMode,
                                platformSpecific: {
                                  ...settings.moderation?.slowMode?.platformSpecific,
                                  twitch: {
                                    ...settings.moderation?.slowMode?.platformSpecific?.twitch,
                                    intervalSeconds: parseInt(e.target.value)
                                  }
                                }
                              }
                            })}
                            InputProps={{ inputProps: { min: 0, max: 300 } }}
                            sx={{ width: 120 }}
                          />
                        </Stack>
                      </Grid>
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
      {activeTab === 'ai' && (
        <Card sx={{
          borderRadius: 3,
          boxShadow: '0 1px 3px 0 rgba(23, 43, 77, 0.1)',
          border: `1px solid ${theme.palette.divider}`,
          overflow: 'visible',
        }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              {t('settings_ai_section_title')}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('settings_ai_model_version_label')}
                  value={settings.ai?.modelVersion || 'gpt-3.5-turbo'}
                  onChange={(e) => handleSave('ai', { modelVersion: e.target.value })}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1" gutterBottom>{t('settings_ai_individual_threshold_title')}</Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  {t('settings_ai_individual_threshold_description')}
                </Alert>
                <Button variant="outlined" size="small">
                  {t('settings_ai_open_threshold_button')}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* AIチャットボット設定 */}
      {activeTab === 'chatbot' && (
        <Card sx={{
          borderRadius: 3,
          boxShadow: '0 1px 3px 0 rgba(23, 43, 77, 0.1)',
          border: `1px solid ${theme.palette.divider}`,
          overflow: 'visible',
        }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              AIチャットボット設定
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.chatbot?.enabled || false}
                      onChange={(e) => handleSave('chatbot', { enabled: e.target.checked })}
                    />
                  }
                  label="AIチャットボットを有効にする"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.chatbot?.autoRespond || false}
                      onChange={(e) => handleSave('chatbot', { autoRespond: e.target.checked })}
                    />
                  }
                  label="自動応答を有効にする"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="信頼度閾値"
                  type="number"
                  value={settings.chatbot?.confidenceThreshold || 0.7}
                  onChange={(e) => handleSave('chatbot', { confidenceThreshold: parseFloat(e.target.value) })}
                  InputProps={{ inputProps: { min: 0, max: 1, step: 0.1 } }}
                  helperText="この値以上の信頼度で自動応答します"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="1分あたりの最大応答数"
                  type="number"
                  value={settings.chatbot?.maxResponsesPerMinute || 10}
                  onChange={(e) => handleSave('chatbot', { maxResponsesPerMinute: parseInt(e.target.value) })}
                  InputProps={{ inputProps: { min: 1, max: 50 } }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>対応言語</InputLabel>
                  <Select
                    multiple
                    value={settings.chatbot?.supportedLanguages || ['ja', 'en']}
                    onChange={(e) => handleSave('chatbot', { supportedLanguages: e.target.value })}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => (
                          <Chip key={value} label={value} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    <MenuItem value="ja">日本語</MenuItem>
                    <MenuItem value="en">English</MenuItem>
                    <MenuItem value="zh">中文</MenuItem>
                    <MenuItem value="ko">한국어</MenuItem>
                    <MenuItem value="es">Español</MenuItem>
                    <MenuItem value="fr">Français</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* パーソナリティ設定 */}
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" gutterBottom>
                  パーソナリティ設定
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <FormControl fullWidth>
                      <InputLabel>トーン</InputLabel>
                      <Select
                        value={settings.chatbot?.personality?.tone || 'friendly'}
                        onChange={(e) => handleSave('chatbot', {
                          personality: {
                            ...settings.chatbot?.personality,
                            tone: e.target.value
                          }
                        })}
                      >
                        <MenuItem value="friendly">フレンドリー</MenuItem>
                        <MenuItem value="professional">プロフェッショナル</MenuItem>
                        <MenuItem value="casual">カジュアル</MenuItem>
                        <MenuItem value="enthusiastic">熱狂的</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FormControl fullWidth>
                      <InputLabel>敬語レベル</InputLabel>
                      <Select
                        value={settings.chatbot?.personality?.formality || 'casual'}
                        onChange={(e) => handleSave('chatbot', {
                          personality: {
                            ...settings.chatbot?.personality,
                            formality: e.target.value
                          }
                        })}
                      >
                        <MenuItem value="formal">丁寧語</MenuItem>
                        <MenuItem value="casual">普通</MenuItem>
                        <MenuItem value="informal">くだけた</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FormControl fullWidth>
                      <InputLabel>ユーモア度</InputLabel>
                      <Select
                        value={settings.chatbot?.personality?.humor || 'moderate'}
                        onChange={(e) => handleSave('chatbot', {
                          personality: {
                            ...settings.chatbot?.personality,
                            humor: e.target.value
                          }
                        })}
                      >
                        <MenuItem value="none">なし</MenuItem>
                        <MenuItem value="low">低め</MenuItem>
                        <MenuItem value="moderate">適度</MenuItem>
                        <MenuItem value="high">高め</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Grid>

              {/* カスタム応答 */}
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle1" gutterBottom>
                  カスタム応答設定
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  特定のキーワードに対するカスタム応答を設定できます。
                </Alert>
                <Button variant="outlined" size="small">
                  カスタム応答を編集
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* UI設定 */}
      {activeTab === 'ui' && (
        <Card sx={{
          borderRadius: 3,
          boxShadow: '0 1px 3px 0 rgba(23, 43, 77, 0.1)',
          border: `1px solid ${theme.palette.divider}`,
          overflow: 'visible',
        }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              {t('settings_ui_section_title')}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>{t('settings_theme_label')}</InputLabel>
                  <Select
                    value={settings.ui?.theme || 'light'}
                    label={t('settings_theme_label')}
                    onChange={(e) => handleSave('ui', { theme: e.target.value })}
                  >
                    <MenuItem value="light">{t('settings_theme_option_light')}</MenuItem>
                    <MenuItem value="dark">{t('settings_theme_option_dark')}</MenuItem>
                    <MenuItem value="system">{t('settings_theme_option_system')}</MenuItem>
                    <MenuItem value="custom">{t('settings_theme_option_custom')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('settings_primary_color_label')}
                  type="color"
                  value={settings.ui?.primaryColor || '#2563eb'}
                  onChange={(e) => handleSave('ui', { primaryColor: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('settings_secondary_color_label')}
                  type="color"
                  value={settings.ui?.secondaryColor || '#7c3aed'}
                  onChange={(e) => handleSave('ui', { secondaryColor: e.target.value })}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* 通知設定 */}
      {activeTab === 'notifications' && (
        <Card sx={{
          borderRadius: 3,
          boxShadow: '0 1px 3px 0 rgba(23, 43, 77, 0.1)',
          border: `1px solid ${theme.palette.divider}`,
          overflow: 'visible',
        }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              {t('settings_notifications_section_title')}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.notifications?.enabled || false}
                      onChange={(e) => handleSave('notifications', { enabled: e.target.checked })}
                    />
                  }
                  label={t('settings_notifications_enabled_label')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.notifications?.email || false}
                      onChange={(e) => handleSave('notifications', { email: e.target.checked })}
                    />
                  }
                  label={t('settings_notifications_email_label')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.notifications?.push || false}
                      onChange={(e) => handleSave('notifications', { push: e.target.checked })}
                    />
                  }
                  label={t('settings_notifications_push_label')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.notifications?.sound || false}
                      onChange={(e) => handleSave('notifications', { sound: e.target.checked })}
                    />
                  }
                  label={t('settings_notifications_sound_label')}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* 翻訳設定 */}
      {activeTab === 'translation' && (
        <Card sx={{
          borderRadius: 3,
          boxShadow: '0 1px 3px 0 rgba(23, 43, 77, 0.1)',
          border: `1px solid ${theme.palette.divider}`,
          overflow: 'visible',
        }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              {t('settings_translation_section_title')}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={settings.moderation?.autoTranslation?.enabled || false}
                      onChange={(e) => handleSave('moderation', {
                        autoTranslation: {
                          ...settings.moderation?.autoTranslation,
                          enabled: e.target.checked
                        }
                      })}
                    />
                  }
                  label={t('settings_translation_auto_label')}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>{t('settings_translation_target_language_label')}</InputLabel>
                  <Select
                    value={settings.moderation?.autoTranslation?.targetLanguage || 'ja'}
                    label={t('settings_translation_target_language_label')}
                    onChange={(e) => handleSave('moderation', {
                      autoTranslation: {
                        ...settings.moderation?.autoTranslation,
                        targetLanguage: e.target.value
                      }
                    })}
                  >
                    <MenuItem value="ja">{t('japanese')}</MenuItem>
                    <MenuItem value="en">{t('english')}</MenuItem>
                    <MenuItem value="zh">{t('chinese')}</MenuItem>
                    <MenuItem value="ko">{t('korean')}</MenuItem>
                    <MenuItem value="es">{t('spanish')}</MenuItem>
                    <MenuItem value="fr">{t('french')}</MenuItem>
                    <MenuItem value="de">{t('german')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>{t('settings_translation_source_language_label')}</InputLabel>
                  <Select
                    value={settings.moderation?.autoTranslation?.sourceLanguage || 'auto'}
                    label={t('settings_translation_source_language_label')}
                    onChange={(e) => handleSave('moderation', {
                      autoTranslation: {
                        ...settings.moderation?.autoTranslation,
                        sourceLanguage: e.target.value
                      }
                    })}
                  >
                    <MenuItem value="auto">{t('settings_language_auto_detect')}</MenuItem>
                    <MenuItem value="ja">{t('japanese')}</MenuItem>
                    <MenuItem value="en">{t('english')}</MenuItem>
                    <MenuItem value="zh">{t('chinese')}</MenuItem>
                    <MenuItem value="ko">{t('korean')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      <Snackbar
        open={success}
        autoHideDuration={3000}
        onClose={() => setSuccess(false)}
        message={t('settings_save_success')}
      />
    </Box>
  );
}
