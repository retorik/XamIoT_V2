const API_BASE = 'https://apixam.holiceo.com';

export function getToken() {
  return localStorage.getItem('xamiot_admin_token') || '';
}

export function setToken(t) {
  if (t) localStorage.setItem('xamiot_admin_token', t);
  else localStorage.removeItem('xamiot_admin_token');
}

export async function apiFetch(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = token ?? getToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }

  if (!res.ok) {
    const err = new Error(data?.error || 'request_failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function adminLogin(email, password) {
  const data = await apiFetch('/admin/login', { method: 'POST', body: { email, password }, token: '' });
  if (data?.token) setToken(data.token);
  return data;
}

export async function adminMe() {
  return apiFetch('/admin/me');
}
