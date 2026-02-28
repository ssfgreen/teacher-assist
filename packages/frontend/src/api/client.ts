const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.text();
    if (body) {
      let parsed: { error?: string; message?: string } | null = null;
      try {
        parsed = JSON.parse(body) as { error?: string; message?: string };
      } catch {
        parsed = null;
      }

      const message = parsed?.error ?? parsed?.message;
      throw new Error(message || body);
    }
    throw new Error(`Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
