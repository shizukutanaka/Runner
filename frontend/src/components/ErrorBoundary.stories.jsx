import ErrorBoundary from './ErrorBoundary';
import { Button } from '@mui/material';

const ThrowError = () => {
  throw new Error('Test error for ErrorBoundary');
};

export default {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['autodocs'],
};

export const Default = {
  render: () => (
    <ErrorBoundary>
      <div style={{ padding: '20px' }}>
        <h2>Normal content when no error occurs</h2>
        <p>This content renders normally inside the ErrorBoundary.</p>
      </div>
    </ErrorBoundary>
  ),
};

export const WithError = {
  render: () => (
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  ),
};

export const InteractiveError = {
  render: () => {
    const ThrowOnClick = () => {
      const [shouldThrow, setShouldThrow] = React.useState(false);

      if (shouldThrow) {
        throw new Error('Error triggered by user interaction');
      }

      return (
        <div style={{ padding: '20px' }}>
          <h2>Click the button to trigger an error</h2>
          <Button
            variant="contained"
            color="error"
            onClick={() => setShouldThrow(true)}
          >
            Throw Error
          </Button>
        </div>
      );
    };

    return (
      <ErrorBoundary>
        <ThrowOnClick />
      </ErrorBoundary>
    );
  },
};

export const NestedErrors = {
  render: () => (
    <ErrorBoundary>
      <div style={{ padding: '20px' }}>
        <h2>Outer ErrorBoundary</h2>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  ),
};
