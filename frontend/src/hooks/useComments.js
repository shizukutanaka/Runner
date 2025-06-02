import { useState, useEffect } from 'react';
import { fetchComments } from '../api/comments';

export const useComments = (platform) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchComments(platform)
      .then(setComments)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [platform]);

  return { comments, loading, error };
};
