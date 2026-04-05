// lib/auth.ts — Auth côté client (localStorage)

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('xamiot_token');
}

export function setToken(token: string) {
  localStorage.setItem('xamiot_token', token);
}

export function getUser(): { id: string; email: string; first_name?: string; last_name?: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('xamiot_user') || 'null');
  } catch {
    return null;
  }
}

export function setUser(user: Record<string, any>) {
  localStorage.setItem('xamiot_user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('xamiot_token');
  localStorage.removeItem('xamiot_user');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
