import { useState, useEffect, useCallback } from 'react';
import { login as apiLogin, logout as apiLogout, fetchCurrentAccount } from '../api/auth';
import { tokenStorage } from '../utils/tokenStorage';

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

  return {
    account,
    isAuthenticated: !!account,
    loading,
    error,
    login,
    logout
  };
};
