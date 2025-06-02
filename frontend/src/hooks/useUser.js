import { useState, useEffect } from 'react';
import { fetchUser, fetchUserHistory } from '../api/users';

export const useUser = (id) => {
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchUser(id),
      fetchUserHistory(id)
    ])
      .then(([user, history]) => {
        setUser(user);
        setHistory(history);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  return { user, history, loading, error };
};
