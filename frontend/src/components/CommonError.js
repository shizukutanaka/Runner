import { Alert, Box } from '@mui/material';
export default function CommonError({ message }) {
  return <Box sx={{ my: 2 }}><Alert severity="error">{message}</Alert></Box>;
}
