import { useEffect } from 'react';
import socket from '../ws';

export function useRealtimeComments(onUpdate) {
  useEffect(() => {
    socket.on('commentUpdate', onUpdate);
    return () => {
      socket.off('commentUpdate', onUpdate);
    };
  }, [onUpdate]);
}
