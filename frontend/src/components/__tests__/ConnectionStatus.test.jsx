import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectionStatus from '../ConnectionStatus';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const translations = {
        'connection.online': 'Online',
        'connection.offline': 'Offline',
        'connection.connecting': 'Connecting...',
        'connection.reconnecting': 'Reconnecting...',
      };
      return translations[key] || key;
    },
  }),
}));

describe('ConnectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders online status correctly', () => {
    render(<ConnectionStatus status="online" />);

    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('renders offline status correctly', () => {
    render(<ConnectionStatus status="offline" />);

    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('renders connecting status correctly', () => {
    render(<ConnectionStatus status="connecting" />);

    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('renders reconnecting status correctly', () => {
    render(<ConnectionStatus status="reconnecting" />);

    expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
  });

  it('displays correct icon for online status', () => {
    const { container } = render(<ConnectionStatus status="online" />);

    const icon = container.querySelector('[data-testid*="icon"]');
    expect(icon).toBeTruthy();
  });

  it('applies correct styling for offline status', () => {
    const { container } = render(<ConnectionStatus status="offline" />);

    expect(container.firstChild).toHaveClass('MuiChip-colorError');
  });
});
