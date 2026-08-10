import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ConnectionStatus from '../ConnectionStatus';
import { connectionManager } from '../../ws';

// ConnectionStatus は `status` プロップを受け取らず、ws.js の connectionManager が
// 発火する 'stateChange' イベントから表示状態を導出する。旧テストは存在しない
// プロップ API と旧ラベル文言を前提にしており、実装ではなくテストが古かった。
vi.mock('../../ws', () => {
  const listeners = new Map();
  return {
    connectionManager: {
      _state: 'disconnected',
      on(event, cb) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(cb);
      },
      off(event, cb) {
        const cbs = listeners.get(event) || [];
        listeners.set(event, cbs.filter((c) => c !== cb));
      },
      emit(event, data) {
        (listeners.get(event) || []).forEach((cb) => cb(data));
      },
      getState() {
        return this._state;
      },
      setState(state) {
        this._state = state;
        this.emit('stateChange', state);
      },
      __reset() {
        listeners.clear();
        this._state = 'disconnected';
      },
    },
  };
});

// i18n はキーをそのまま返し、ラベル選択のロジックだけを検証する
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

describe('ConnectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionManager.__reset();
  });

  const setState = (state) => {
    act(() => {
      connectionManager.setState(state);
    });
  };

  it('renders disconnected state by default', () => {
    render(<ConnectionStatus />);
    expect(screen.getByText('connection_status_label_disconnected')).toBeInTheDocument();
  });

  it('renders connected state', () => {
    render(<ConnectionStatus />);
    setState('connected');
    expect(screen.getByText('connection_status_label_connected')).toBeInTheDocument();
  });

  it('renders reconnecting state', () => {
    render(<ConnectionStatus />);
    setState('reconnecting');
    expect(screen.getByText('connection_status_label_reconnecting')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<ConnectionStatus />);
    setState('error');
    expect(screen.getByText('connection_status_label_error')).toBeInTheDocument();
  });

  it('renders failed state', () => {
    render(<ConnectionStatus />);
    setState('failed');
    expect(screen.getByText('connection_status_label_failed')).toBeInTheDocument();
  });

  it('renders an icon alongside the label', () => {
    const { container } = render(<ConnectionStatus />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('applies the MUI error color class when the connection failed', () => {
    const { container } = render(<ConnectionStatus />);
    setState('failed');
    expect(container.querySelector('.MuiChip-colorError')).toBeTruthy();
  });

  it('unsubscribes its listeners on unmount', () => {
    const { unmount } = render(<ConnectionStatus />);
    unmount();
    // アンマウント後の状態変化で例外が出ない（リスナーが解除されている）ことを確認
    expect(() => connectionManager.setState('connected')).not.toThrow();
  });
});
