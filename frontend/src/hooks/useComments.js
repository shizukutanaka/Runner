import { useState, useEffect, useCallback } from 'react';
import { fetchComments } from '../api/comments';

const extractComments = (payload) => {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items;
  }

  return [];
};

export const useComments = (platform) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchComments(platform);
        if (!cancelled) {
          setComments(extractComments(response));
        }
      } catch (err) {
        if (!cancelled) {
          setComments([]);
          setError(err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [platform]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchComments(platform);
      setComments(extractComments(response));
    } catch (err) {
      setComments([]);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [platform]);

  return { comments, loading, error, refetch };
};
