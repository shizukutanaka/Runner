import { useState, useEffect } from 'react';
import { fetchUser, fetchUserHistory } from '../api/users';

export const useUser = (id) => {
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // id が未選択（null）のまま呼ばれると `GET /api/users/null` と
    // `/api/users/null/history` を叩き、404 を error に積んでいた。
    // UserPanel はマウント直後この状態で始まるため、毎回必ず起きていた。
    if (!id) {
      setUser(null);
      setHistory([]);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchUser(id),
      fetchUserHistory(id)
    ])
      .then(([user, history]) => {
        if (cancelled) return;
        setUser(user);
        setHistory(history);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id]);

  return { user, history, loading, error };
};
