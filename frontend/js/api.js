/* Tiny fetch wrapper for the CampusOD REST API. Token lives in sessionStorage (cleared when the tab closes). */
const API_BASE = '/api';
const Auth = {
  get token() { try { return sessionStorage.getItem('campusod.token'); } catch { return null; } },
  set(token, user) { try { sessionStorage.setItem('campusod.token', token); sessionStorage.setItem('campusod.user', JSON.stringify(user)); } catch {} },
  get user() { try { return JSON.parse(sessionStorage.getItem('campusod.user')); } catch { return null; } },
  clear() { try { sessionStorage.removeItem('campusod.token'); sessionStorage.removeItem('campusod.user'); } catch {} },
};
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (Auth.token) opts.headers.Authorization = 'Bearer ' + Auth.token;
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(API_BASE + path, opts); } catch { throw new Error('Cannot reach the server. Check that the backend is running.'); }
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status; err.code = data?.code;
    throw err;
  }
  return data;
}
async function downloadProof(id, name) {
  const res = await fetch(`${API_BASE}/requests/${id}/proof`, { headers: { Authorization: 'Bearer ' + Auth.token } });
  if (!res.ok) throw new Error('Could not download the document.');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name || 'proof' });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
