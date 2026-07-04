import { useState, useEffect, useCallback } from 'react';
import { login as apiLogin, logout as apiLogout, register as apiRegister, fetchCurrentAccount } from '../api/auth';
import { tokenStorage } from '../utils/tokenStorage';
import socket from '../ws';

export const useAuth = () => {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      if (!tokenStorage.get()) {
        setLoading(false);
        return;
      }
      try {
        const current = await fetchCurrentAccount();
        if (!cancelled) {
          setAccount(current);
        }
      } catch {
        if (!cancelled) {
          tokenStorage.remove();
          setAccount(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkSession();
    return () => { cancelled = true; };
  }, []);

  // ログイン確定後、WebSocketのroomに参加してリアルタイム更新を受け取れるようにする。
  // サーバー側は socket.on('authenticate') で user:/platform: room に、
  // socket.on('joinDashboard') で dashboard room に参加させる仕組みを持つが、
  // 従来はどちらも一度も送信されず配信が一切届いていなかった。
  // 再接続時にもroom参加が失われるため、'connect'イベントの度に再送する。
  useEffect(() => {
    if (!account?.id) {
      return undefined;
    }

    const joinRealtimeRooms = () => {
      socket.emit('authenticate', { userId: account.id });
      socket.emit('joinDashboard', 'default');
    };

    if (socket.connected) {
      joinRealtimeRooms();
    }
    socket.on('connect', joinRealtimeRooms);

    return () => {
      socket.off('connect', joinRealtimeRooms);
    };
  }, [account?.id]);

  const login = useCallback(async (username, password) => {
    setError(null);
    try {
      const result = await apiLogin(username, password);
      setAccount(result.user);
      return result;
    } catch (err) {
      setError(err);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setAccount(null);
  }, []);

  // 登録エンドポイントはトークンを返さないため、登録後に続けてログインする
  const register = useCallback(async (username, email, password) => {
    setError(null);
    try {
      await apiRegister(username, email, password);
      return await login(username, password);
    } catch (err) {
      setError(err);
      throw err;
    }
  }, [login]);

  return {
    account,
    isAuthenticated: !!account,
    loading,
    error,
    login,
    logout,
    register
  };
};
