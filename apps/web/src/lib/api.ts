const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface FetchOptions {
  method?: string;
  body?: any;
  token?: string;
}

export async function api<T = any>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.error || `Request failed: ${res.status}`);
  }

  return json.data;
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('oghub_token');
}

export function setStoredToken(token: string): void {
  localStorage.setItem('oghub_token', token);
}

export function clearStoredToken(): void {
  localStorage.removeItem('oghub_token');
}
