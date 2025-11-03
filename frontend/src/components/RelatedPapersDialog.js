import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Card,
  CardContent,
  Stack,
  Chip,
  Box,
  Alert,
  CircularProgress,
  useTheme,
  Tabs,
  Tab,
  Grid,
  Divider,
  Link,
} from '@mui/material';
import {
  Close as CloseIcon,
  Launch as LaunchIcon,
  Article as ArticleIcon,
  Science as ScienceIcon,
  School as SchoolIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { findRelatedPapersFromComments } from '../api/papers';

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString();
  } catch (error) {
    return dateString;
  }
};

const truncateText = (text, maxLength = 200) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export default function RelatedPapersDialog({
  open,
  onClose,
  comment,
  onPaperSelect
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [relatedPapers, setRelatedPapers] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [sources] = useState(['arxiv', 'pubmed']);

  useEffect(() => {
    if (open && comment) {
      fetchRelatedPapers();
    }
  }, [open, comment]);

  const fetchRelatedPapers = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await findRelatedPapersFromComments([comment], sources[activeTab]);

      if (response.status === 200 && response.data) {
        setRelatedPapers(response.data);
      } else {
        setError(response.message || t('failed_to_fetch_papers', '論文の取得に失敗しました'));
      }
    } catch (err) {
      setError(err.message || t('failed_to_fetch_papers', '論文の取得に失敗しました'));
    } finally {
      setLoading(false);
    }
  };

  const handlePaperClick = (paper) => {
    if (onPaperSelect) {
      onPaperSelect(paper);
    }

    // 論文のURLを開く
    const url = paper.pubmedUrl || paper.doiUrl || paper.htmlUrl || paper.pdfUrl;
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleClose = () => {
    setRelatedPapers([]);
    setError(null);
    setActiveTab(0);
    onClose();
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    if (comment) {
      fetchRelatedPapers();
    }
  };

  const renderPaperCard = (paper) => (
    <Card key={paper.id || paper.pmid || paper.arxivId} sx={{ cursor: 'pointer', '&:hover': { boxShadow: 2 } }}>
      <CardContent onClick={() => handlePaperClick(paper)}>
        <Typography variant="h6" gutterBottom sx={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          lineHeight: 1.3
        }}>
          {paper.title}
        </Typography>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          {paper.authors?.slice(0, 3).join(', ')}
          {paper.authors?.length > 3 && ` 他${paper.authors.length - 3}人`}
        </Typography>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          {paper.journal || 'arXiv'} • {formatDate(paper.publishedAt)}
        </Typography>

        <Typography variant="body2" sx={{
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          mb: 2
        }}>
          {truncateText(paper.abstract || paper.summary)}
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          {paper.keywords?.slice(0, 3).map((keyword, index) => (
            <Chip
              key={index}
              label={keyword}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem' }}
            />
          ))}
          {paper.meshTerms?.slice(0, 3).map((term, index) => (
            <Chip
              key={`mesh-${index}`}
              label={term}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontSize: '0.7rem' }}
            />
          ))}
        </Stack>

        {paper.doi && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            DOI: {paper.doi}
          </Typography>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
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
            {t('related_papers', '関連論文')}
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
          {t('related_papers_description', 'コメントから抽出した関連論文の提案')}
        </Typography>

        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{ mt: 2 }}
          variant="fullWidth"
        >
          <Tab
            icon={<ScienceIcon />}
            label="arXiv"
            iconPosition="start"
          />
          <Tab
            icon={<SchoolIcon />}
            label="PubMed"
            iconPosition="start"
          />
        </Tabs>
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

        {!loading && !error && relatedPapers.length === 0 && (
          <Alert severity="info" sx={{ m: 2 }}>
            {t('no_related_papers_found', '関連論文が見つかりませんでした')}
          </Alert>
        )}

        {!loading && !error && relatedPapers.length > 0 && (
          <Stack spacing={2} sx={{ p: 2 }}>
            {relatedPapers.map(renderPaperCard)}
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
