import ConnectionStatus from './ConnectionStatus';

export default {
  title: 'Components/ConnectionStatus',
  component: ConnectionStatus,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: { type: 'select' },
      options: ['online', 'offline', 'connecting', 'reconnecting'],
      description: 'Current connection status',
    },
  },
};

export const Online = {
  args: {
    status: 'online',
  },
};

export const Offline = {
  args: {
    status: 'offline',
  },
};

export const Connecting = {
  args: {
    status: 'connecting',
  },
};

export const Reconnecting = {
  args: {
    status: 'reconnecting',
  },
};

export const AllStates = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      <ConnectionStatus status="online" />
      <ConnectionStatus status="offline" />
      <ConnectionStatus status="connecting" />
      <ConnectionStatus status="reconnecting" />
    </div>
  ),
};
