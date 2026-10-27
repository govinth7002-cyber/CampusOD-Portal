/* End-to-end smoke test against a REAL MongoDB. Usage: npm test
   WARNING: it re-seeds the database named in MONGODB_URI (use a throwaway database). */
process.env.NODE_ENV = 'test';
const assert = require('assert');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const otp = require('../src/services/otpService');
const { seedData, DEMO_PASSWORD, ADMIN_PASSWORD } = require('./seed');

let base, passed = 0;
const step = async (name, fn) => { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; } };
const call = async (method, path, { token, body, form } = {}) => {
  const headers = {}; if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const login = async (email, password = DEMO_PASSWORD) => (await call('POST', '/api/auth/login', { body: { email, password } })).data.token;

(async () => {
  await connectDB(); await seedData();
  const server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`;
  let student, faculty, warden, parent, admin, reqId, before;
  console.log('CampusOD smoke test');

  await step('login works and wrong password is rejected', async () => {
    student = await login('govinth@campus.edu'); faculty = await login('faculty@campus.edu'); warden = await login('warden@campus.edu');
    parent = await login('parent.govinth@campus.edu'); admin = await login('admin@campus.edu', ADMIN_PASSWORD);
    assert(student && faculty && warden && parent && admin);
    assert.strictEqual((await call('POST', '/api/auth/login', { body: { email: 'govinth@campus.edu', password: 'nope' } })).status, 401);
  });
  await step('API needs a token and enforces roles', async () => {
    assert.strictEqual((await call('GET', '/api/requests/mine')).status, 401);
    assert.strictEqual((await call('GET', '/api/admin/users', { token: student })).status, 403);
    assert.strictEqual((await call('GET', '/api/requests', { token: student })).status, 403);
  });
  await step('student request validation', async () => {
    const f = new FormData(); f.append('type', 'OD'); f.append('eventName', 'X'); f.append('reason', 'short');
    assert.strictEqual((await call('POST', '/api/requests', { token: student, form: f })).status, 400);
  });
  await step('attendance baseline', async () => { before = (await call('GET', '/api/attendance/summary', { token: student })).data; assert(before.total > 0); });
  await step('student submits OD with proof', async () => {
    const f = new FormData(); const d = n => new Date(Date.now() + n * 864e5 + 3 * 36e5);
    f.append('type', 'OD'); f.append('eventName', 'Smoke Hackathon'); f.append('reason', 'Representing the college in a hackathon.'); f.append('location', 'Chennai');
    f.append('fromTime', d(3).toISOString()); f.append('toTime', d(4).toISOString());
    f.append('proof', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'invite.pdf');
    const r = await call('POST', '/api/requests', { token: student, form: f });
    assert.strictEqual(r.status, 201, JSON.stringify(r.data)); assert.strictEqual(r.data.status, 'Pending'); assert(r.data.hasProof); reqId = r.data.id;
  });
  await step('parent and faculty were notified', async () => {
    const p = (await call('GET', '/api/notifications', { token: parent })).data; assert(p.items.some(n => n.message.includes('Smoke Hackathon')));
    const f = (await call('GET', '/api/notifications', { token: faculty })).data; assert(f.items.some(n => n.message.includes('Smoke Hackathon')));
  });
  await step('parent sees request and acknowledges', async () => {
    const list = (await call('GET', '/api/requests/ward', { token: parent })).data; assert(list.some(r => r.id === reqId));
    const r = await call('POST', `/api/requests/${reqId}/acknowledge`, { token: parent }); assert.strictEqual(r.status, 200); assert(r.data.parentAck);
  });
  await step('another student cannot read it', async () => {
    const other = await login('ananya@campus.edu'); assert.strictEqual((await call('GET', `/api/requests/${reqId}`, { token: other })).status, 404);
  });
  await step('rejecting needs a remark', async () => {
    assert.strictEqual((await call('POST', `/api/requests/${reqId}/decision`, { token: faculty, body: { decision: 'Rejected' } })).status, 400);
  });
  await step('faculty approves; second decision is refused', async () => {
    const r = await call('POST', `/api/requests/${reqId}/decision`, { token: faculty, body: { decision: 'Approved', remarks: 'Good luck' } });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.data.status, 'Approved'); assert.strictEqual(r.data.exit, 'linked');
    assert.strictEqual((await call('POST', `/api/requests/${reqId}/decision`, { token: faculty, body: { decision: 'Rejected', remarks: 'x' } })).status, 409);
  });
  await step('attendance now credits OD days', async () => {
    const a = (await call('GET', '/api/attendance/summary', { token: student })).data;
    assert(a.total > before.total, 'new OD days should add attendance rows'); assert(a.subjects.every(s => s.od >= 1));
  });
  await step('warden list, mark out, mark returned', async () => {
    const l = (await call('GET', '/api/hostel/list', { token: warden })).data; const x = l.find(e => e.request.id === reqId); assert(x && x.status === 'linked');
    assert.strictEqual((await call('POST', `/api/hostel/${x.exitId}/return`, { token: warden })).status, 409);
    assert.strictEqual((await call('POST', `/api/hostel/${x.exitId}/out`, { token: warden })).status, 200);
    assert.strictEqual((await call('POST', `/api/hostel/${x.exitId}/return`, { token: warden })).status, 200);
  });
  await step('proof download is authorised', async () => {
    const ok = await fetch(`${base}/api/requests/${reqId}/proof`, { headers: { Authorization: 'Bearer ' + faculty } }); assert.strictEqual(ok.status, 200);
    const other = await login('ananya@campus.edu'); const no = await fetch(`${base}/api/requests/${reqId}/proof`, { headers: { Authorization: 'Bearer ' + other } }); assert.strictEqual(no.status, 404);
  });
  await step('admin reports, users and audit log', async () => {
    const r = (await call('GET', '/api/admin/reports', { token: admin })).data; assert(r.total >= 6 && r.byStatus.Approved >= 3);
    assert((await call('GET', '/api/admin/users', { token: admin })).data.length >= 9);
    assert((await call('GET', '/api/admin/audit', { token: admin })).data.length > 0);
    const nu = await call('POST', '/api/admin/users', { token: admin, body: { name: 'New Faculty', email: 'newfac@campus.edu', role: 'Faculty', password: 'Secret@123' } });
    assert.strictEqual(nu.status, 201);
  });
  await step('new account must verify its email with a code before first login', async () => {
    const lg = (email, password) => call('POST', '/api/auth/login', { body: { email, password } });
    const r = await lg('newfac@campus.edu', 'Secret@123'); assert.strictEqual(r.status, 403); assert.strictEqual(r.data.code, 'EMAIL_NOT_VERIFIED');
    assert((await call('POST', '/api/auth/verify-email/send', { body: { email: 'newfac@campus.edu' } })).data.ok);
    const code = otp.lastCodes['newfac@campus.edu|verify']; assert(/^\d{6}$/.test(code));
    assert.strictEqual((await call('POST', '/api/auth/verify-email/confirm', { body: { email: 'newfac@campus.edu', otp: '000000' } })).status, 400);
    assert.strictEqual((await call('POST', '/api/auth/verify-email/confirm', { body: { email: 'newfac@campus.edu', otp: code } })).status, 200);
    assert.strictEqual((await lg('newfac@campus.edu', 'Secret@123')).status, 200);
  });
  await step('forgot password: code by email, then reset', async () => {
    const lg = (password) => call('POST', '/api/auth/login', { body: { email: 'govinth@campus.edu', password } });
    const f = await call('POST', '/api/auth/forgot-password', { body: { email: 'govinth@campus.edu' } }); assert(f.data.ok);
    const unknown = await call('POST', '/api/auth/forgot-password', { body: { email: 'nobody@campus.edu' } }); assert.strictEqual(unknown.status, 200);
    const code = otp.lastCodes['govinth@campus.edu|reset']; assert(code);
    assert.strictEqual((await call('POST', '/api/auth/reset-password', { body: { email: 'govinth@campus.edu', otp: code, newPassword: 'short' } })).status, 400);
    assert.strictEqual((await call('POST', '/api/auth/reset-password', { body: { email: 'govinth@campus.edu', otp: '123456', newPassword: 'NewPass123' } })).status, 400);
    assert.strictEqual((await call('POST', '/api/auth/reset-password', { body: { email: 'govinth@campus.edu', otp: code, newPassword: 'NewPass123' } })).status, 200);
    assert.strictEqual((await lg(DEMO_PASSWORD)).status, 401);
    assert.strictEqual((await lg('NewPass123')).status, 200);
  });
  console.log(`\n${passed} steps passed${process.exitCode ? ', some FAILED' : ''}`);
  server.close(); await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
