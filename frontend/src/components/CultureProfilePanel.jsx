/**
 * Culture Profile Panel — クリエイター文化プロファイル設定
 *
 * ソクラテス式問答から生まれた視点:
 * 「ゲーム実況の煽り合いと子ども向け教育チャンネルを同じ基準で判定するのは正しいか？」
 * → チャンネルごとに文化プロファイルを選び、モデレーションの許容度を調整する
 */

import React, { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Grid, Card, CardContent, MenuItem, Select,
  FormControl, InputLabel, Button, Alert, CircularProgress,
  Chip, Stack, Divider, Snackbar,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import axios from 'axios';

const API = import.meta.env.VITE_API_BASE_URL || '/api';

export default function CultureProfilePanel({ platform, channelId }) {
  const theme = useTheme();
  const [presets, setPresets] = useState([]);
  const [profile, setProfile] = useState(null);
  const [selectedType, setSelectedType] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [presetsRes, profileRes] = await Promise.all([
        axios.get(`${API}/insights/culture-presets`),
        axios.get(`${API}/insights/culture/${platform}/${channelId}`),
      ]);
      setPresets(presetsRes.data?.data ?? []);
      setProfile(profileRes.data?.data ?? null);
      setSelectedType(profileRes.data?.data?.cultureType ?? '');
    } catch (e) {
      setError('文化プロファイルの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [platform, channelId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!selectedType) return;
    setSaving(true);
    setError(null);
    try {
      const res = await axios.put(`${API}/insights/culture/${platform}/${channelId}`, {
        cultureType: selectedType,
      });
      setProfile(res.data?.data ?? null);
      setSuccess(true);
    } catch (e) {
      setError(e?.response?.data?.message || '文化プロファイルの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card sx={{
      borderRadius: 3,
      boxShadow: '0 1px 3px 0 rgba(23, 43, 77, 0.1)',
      border: `1px solid ${theme.palette.divider}`,
      overflow: 'visible',
    }}>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
          クリエイター文化プロファイル
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          チャンネルの文化に合わせてモデレーションの厳しさを調整します（例: ゲーム実況の煽り合いは許容、家族向けは厳格に）。
          設定はサーバーのメモリ上に保持され、再起動でリセットされます（永続化は未実装）。
        </Typography>

        {loading && <CircularProgress size={24} sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel id="culture-type-label">文化プロファイル</InputLabel>
                <Select
                  labelId="culture-type-label"
                  label="文化プロファイル"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                >
                  {presets.map((preset) => (
                    <MenuItem key={preset.id} value={preset.id}>
                      {preset.label}（{preset.strictness}）
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving || !selectedType || selectedType === profile?.cultureType}
                sx={{ mt: 2 }}
              >
                {saving ? '保存中…' : '保存'}
              </Button>
            </Grid>

            <Grid item xs={12} md={6}>
              {profile && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>現在の設定</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
                    <Chip size="small" label={`毒性感度 ×${profile.toxicityMultiplier}`} />
                    <Chip size="small" label={`自動拒否 ≥${profile.autoRejectScore}`} color="error" variant="outlined" />
                    <Chip size="small" label={`自動承認 ≤${profile.autoApproveScore}`} color="success" variant="outlined" />
                    {profile.isCustomized && <Chip size="small" label="カスタム調整あり" color="warning" />}
                  </Stack>
                  {profile.flags?.length > 0 && (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {profile.flags.map((flag) => (
                        <Chip key={flag} size="small" variant="outlined" label={flag} />
                      ))}
                    </Stack>
                  )}
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="caption" color="text.secondary">
                    {presets.find((p) => p.id === profile.cultureType)?.description}
                  </Typography>
                </Box>
              )}
            </Grid>
          </Grid>
        )}
      </CardContent>

      <Snackbar
        open={success}
        autoHideDuration={3000}
        onClose={() => setSuccess(false)}
        message="文化プロファイルを保存しました"
      />
    </Card>
  );
}

CultureProfilePanel.propTypes = {
  platform: PropTypes.string,
  channelId: PropTypes.string,
};

CultureProfilePanel.defaultProps = {
  platform: 'youtube',
  channelId: 'default',
};
