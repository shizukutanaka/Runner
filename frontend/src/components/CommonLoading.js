import { CircularProgress, Box } from '@mui/material';
export default function CommonLoading() {
  return <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}><CircularProgress /></Box>;
}
