import { useEffect, useCallback } from 'react';
import socket, { connectionManager } from '../ws';

/**
 * リアルタイムコメント更新をWebSocket経由で受信するフック
 * バッチ更新（batchUpdate）と個別更新（commentUpdate）の両方に対応
 *
 * @param {function} onUpdate - 新着コメント受信時のコールバック
 * @param {function} [onConnectionChange] - 接続状態変化時のコールバック
 */
export function useRealtimeComments(onUpdate, onConnectionChange = null) {
  // 個別コメント更新ハンドラー
  const handleCommentUpdate = useCallback((data) => {
    if (data?.type === 'new' && data?.data) {
      onUpdate(data.data);
    }
  }, [onUpdate]);

  // バッチ更新ハンドラー（複数コメントをまとめて受信）
  const handleBatchUpdate = useCallback((batch) => {
    if (!batch?.messages?.length) return;
    batch.messages
      .filter(m => m.type === 'commentUpdate' && m.data?.data)
      .forEach(m => onUpdate(m.data.data));
  }, [onUpdate]);

  useEffect(() => {
    socket.on('commentUpdate', handleCommentUpdate);
    socket.on('batchUpdate',   handleBatchUpdate);

    return () => {
      socket.off('commentUpdate', handleCommentUpdate);
      socket.off('batchUpdate',   handleBatchUpdate);
    };
  }, [handleCommentUpdate, handleBatchUpdate]);

  // 接続状態の監視（省略可能）
  useEffect(() => {
    if (!onConnectionChange) return;

    const handleStateChange = (state) => onConnectionChange(state);
    connectionManager.on('stateChange', handleStateChange);

    return () => connectionManager.off('stateChange', handleStateChange);
  }, [onConnectionChange]);
}
