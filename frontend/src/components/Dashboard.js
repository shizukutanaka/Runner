import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Paper,
  Grid,
  Stack,
} from '@mui/material';
import {
  Timeline as TimelineIcon,
  People as PeopleIcon,
  Analytics as AnalyticsIcon,
  Settings as SettingsIcon,
  AdminPanelSettings as ModeratorIcon,
  MonitorHeart as MonitoringIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import CommentTimeline from './CommentTimeline';
import UserPanel from './UserPanel';
import AnalyticsPanel from './AnalyticsPanel';
import SettingsPanel from './SettingsPanel';
import ModeratorDashboard from './ModeratorDashboard';
import CommunityHealthWidget from './CommunityHealthWidget';
import SilentDepartureAlert from './SilentDepartureAlert';
import TriageQueue from './TriageQueue';
import MonitoringDashboard from './MonitoringDashboard';

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`dashboard-tabpanel-${index}`}
      aria-labelledby={`dashboard-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState(0);
  const { t } = useTranslation();

  const handleTabChange = useCallback((event, newValue) => {
    setTab(newValue);
  }, []);

  const timelineTab = useMemo(() => (
    <Grid container spacing={2} alignItems="flex-start">
      <Grid item xs={12} lg={9}>
        <CommentTimeline />
      </Grid>
      <Grid item xs={12} lg={3}>
        <Stack spacing={2}>
          <CommunityHealthWidget platform="youtube" channelId="default" />
          <SilentDepartureAlert platform="youtube" channelId="default" />
        </Stack>
      </Grid>
    </Grid>
  ), []); // eslint-disable-line react-hooks/exhaustive-deps

  const moderatorTab = useMemo(() => (
    <Grid container spacing={2} alignItems="flex-start">
      <Grid item xs={12} lg={8}>
        <ModeratorDashboard />
      </Grid>
      <Grid item xs={12} lg={4}>
        <TriageQueue platform="youtube" channelId="default" pendingComments={[]} />
      </Grid>
    </Grid>
  ), []);

  const tabs = useMemo(() => [
    { component: timelineTab,        label: t('dashboard_tab_timeline',  'Timeline'),  icon: <TimelineIcon /> },
    { component: moderatorTab,       label: t('dashboard_tab_moderator', 'Moderator'), icon: <ModeratorIcon /> },
    { component: <UserPanel />,      label: t('dashboard_tab_users',     'Users'),     icon: <PeopleIcon /> },
    { component: <AnalyticsPanel />, label: t('dashboard_tab_analytics', 'Analytics'), icon: <AnalyticsIcon /> },
    { component: <MonitoringDashboard />, label: t('dashboard_tab_monitoring', 'Monitoring'), icon: <MonitoringIcon /> },
    { component: <SettingsPanel />,  label: t('dashboard_tab_settings',  'Settings'),  icon: <SettingsIcon /> },
  ], [t, timelineTab, moderatorTab]);

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden', p: 0, m: 0, backgroundColor: 'transparent', boxShadow: 'none' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={tab} 
          onChange={handleTabChange} 
          aria-label="dashboard tabs"
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabs.map((tabItem, index) => (
            <Tab 
              key={index} 
              label={tabItem.label} 
              icon={tabItem.icon} 
              iconPosition="start"
              id={`dashboard-tab-${index}`}
              aria-controls={`dashboard-tabpanel-${index}`}
            />
          ))}
        </Tabs>
      </Box>
      {tabs.map((tabItem, index) => (
        <TabPanel key={index} value={tab} index={index}>
          {tabItem.component}
        </TabPanel>
      ))}
    </Paper>
  );
}
