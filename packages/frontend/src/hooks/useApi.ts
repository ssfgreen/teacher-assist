import { useCallback, useState } from "react";

import { apiFetch } from "../api/client";

export function useApi<T>() {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (path: string, init?: RequestInit) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<T>(path, init);
      setData(response);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, error, loading, run };
}
