/* CampusOD frontend: plain JavaScript. Screens follow the UI Design wireframes in the Review 1 deck. */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const hours = (a, b) => Math.round((new Date(b) - new Date(a)) / 36e5);
const dur = (a, b) => { const h = hours(a, b); return h >= 24 ? `${Math.floor(h / 24)} d${h % 24 ? ' ' + (h % 24) + ' h' : ''}` : `${h} h`; };
const range = q => `${fmt(q.fromTime)} – ${fmt(q.toTime)}`;
const pad = n => String(n).padStart(2, '0');
const localInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const tomorrowAt = h => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return localInput(d); };
function toast(msg, bad) { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }

const ROLES = {
  Student: [['overview', 'Dashboard'], ['new', 'New request'], ['mine', 'My requests'], ['attendance', 'Attendance'], ['notifs', 'Notifications']],
  Parent: [['notices', 'Request notices'], ['attendance', 'Ward attendance'], ['notifs', 'Notifications']],
  Faculty: [['pending', 'Pending requests'], ['history', 'Decided'], ['notifs', 'Notifications']],
  Warden: [['hostel', 'Hostel OD list'], ['notifs', 'Notifications']],
  Admin: [['reports', 'Reports'], ['users', 'Users'], ['audit', 'Audit log']],
};
const DEMO = [['Student', 'govinth@campus.edu', 'Demo@1234'], ['Parent', 'parent.govinth@campus.edu', 'Demo@1234'], ['Faculty', 'faculty@campus.edu', 'Demo@1234'], ['Warden', 'warden@campus.edu', 'Demo@1234'], ['Admin', 'admin@campus.edu', 'Admin@1234']];

let user = Auth.user, view = '', unread = 0, wards = [], wardId = null;
const chipFor = s => ({ Pending: 'warn', Approved: 'ok', Rejected: 'bad' }[s] || 'info');
const statusChip = s => `<span class="chip ${chipFor(s)}">${esc(s)}</span>`;
const exitChip = e => e ? `<span class="chip ${e === 'returned' ? 'info' : e === 'out' ? 'warn' : 'ok'}">${e === 'linked' ? 'Linked' : e === 'out' ? 'Out' : 'Returned'}</span>` : '';
const win = (title, body) => `<section class="window"><div class="titlebar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><h1>${esc(title)}</h1></div><div class="winbody">${body}</div></section>`;
const empty = t => `<div class="empty">${t}</div>`;
const errBox = e => `<div class="form-error" role="alert">${esc(e.message)}</div>`;

/* ---------- login (wireframe: logo, Email / Roll number, Password, Role, Login) ---------- */
let timer = null; const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
const okBox = t => `<div class="form-ok" role="status">${esc(t)}</div>`;
const outer = (title, body, foot = '') => `<div class="login-wrap">${win(title, body)}${foot}</div>`;

function renderLogin(msg = '', ok = '', prefill = '') {
  stopTimer();
  $('#root').innerHTML = outer('Login', `
      <div class="logo login-logo" aria-hidden="true">OD</div>
      <form id="loginForm" novalidate style="display:flex;flex-direction:column;gap:.9rem">
        <div class="field"><label for="email">Email / Roll number</label><input id="email" autocomplete="username" value="${esc(prefill)}"></div>
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="role">Role  ▾</label><select id="role">${Object.keys(ROLES).map(r => `<option>${r}</option>`).join('')}</select></div>
        <div id="loginMsg">${ok ? okBox(ok) : msg ? errBox({ message: msg }) : ''}</div>
        <button class="btn block" type="submit">Login</button>
        <button class="linkbtn" type="button" id="forgot">Forgot password?</button>
      </form>`, `
    
    <div class="demo-accounts">${DEMO.map(([r], i) => `<button type="button" data-demo="${i}">${r}</button>`).join('')}</div>`);
  document.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => { const [r, e, p] = DEMO[b.dataset.demo]; $('#email').value = e; $('#pw').value = p; $('#role').value = r; });
  $('#forgot').onclick = () => renderForgot($('#email').value.includes('@') ? $('#email').value.trim() : '');
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#loginForm button[type=submit]'); btn.disabled = true;
    try {
      const r = await api('POST', '/auth/login', { email: $('#email').value, password: $('#pw').value, role: $('#role').value });
      Auth.set(r.token, r.user); user = r.user; view = ROLES[user.role][0][0]; wards = []; wardId = null;
      await shell();
    } catch (err) {
      btn.disabled = false;
      if (err.code === 'EMAIL_NOT_VERIFIED') return startVerify($('#email').value.trim());
      $('#loginMsg').innerHTML = errBox(err);
    }
  };
}

// Reusable "enter the 6-digit code" screen with a resend countdown.
function otpScreen({ title, email, info, extraFields = '', submitLabel, onSubmit, onResend }) {
  stopTimer();
  $('#root').innerHTML = outer(title, `
      <div class="logo login-logo" aria-hidden="true">OD</div>
      <form id="otpForm" novalidate style="display:flex;flex-direction:column;gap:.9rem">
        <div class="hint" id="otpInfo">${info}</div>
        <div class="field"><label for="otp">6-digit code</label><input id="otp" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······"></div>
        ${extraFields}
        <div id="otpMsg"></div>
        <button class="btn block" type="submit">${submitLabel}</button>
        <button class="btn outline block" type="button" id="resend">Resend code</button>
        <button class="linkbtn" type="button" id="back">Back to login</button>
      </form>`);
  $('#otp').focus(); $('#back').onclick = () => renderLogin();
  const resend = $('#resend');
  const countdown = sec => { stopTimer(); let n = sec; resend.disabled = true; const tick = () => { if (n <= 0) { stopTimer(); resend.disabled = false; resend.textContent = 'Resend code'; return; } resend.textContent = `Resend code in ${n}s`; n--; }; tick(); timer = setInterval(tick, 1000); };
  countdown(60);
  resend.onclick = async () => {
    resend.disabled = true;
    try { const r = await onResend(); $('#otpMsg').innerHTML = okBox('A new code was sent.'); countdown(r.resendAfterSec || 60); }
    catch (e) { $('#otpMsg').innerHTML = errBox(e); resend.disabled = false; }
  };
  $('#otpForm').onsubmit = async e => {
    e.preventDefault(); const btn = $('#otpForm button[type=submit]'); const code = $('#otp').value.trim();
    if (!/^\d{6}$/.test(code)) { $('#otpMsg').innerHTML = errBox({ message: 'Enter the 6-digit code from the email.' }); return; }
    btn.disabled = true;
    try { await onSubmit(code); } catch (er) { $('#otpMsg').innerHTML = errBox(er); btn.disabled = false; }
  };
}
const sentInfo = r => `We sent a 6-digit code to <b>${esc(r.sentTo)}</b>. It expires in ${r.expiresInMin} minutes.` +
  (r.delivery === 'console' ? '<br><span class="warnline">Email sending is not set up on this server yet, so the code was printed in the server terminal (where you ran <span class="mono">npm start</span>).</span>' : '');

// ---- verify email (shown when a new account signs in for the first time) ----
async function startVerify(email) {
  try {
    const r = await api('POST', '/auth/verify-email/send', { email });
    otpScreen({
      title: 'Verify Email', email, info: sentInfo(r), submitLabel: 'Verify email',
      onResend: () => api('POST', '/auth/verify-email/send', { email }),
      onSubmit: async code => { await api('POST', '/auth/verify-email/confirm', { email, otp: code }); renderLogin('', 'Email verified. Sign in to continue.', email); },
    });
  } catch (e) { renderLogin(e.message, '', email); }
}

// ---- forgot password: ask for email -> code + new password ----
function renderForgot(prefill = '') {
  stopTimer();
  $('#root').innerHTML = outer('Forgot Password', `
    <div class="logo login-logo" aria-hidden="true">OD</div>
    <form id="fpForm" novalidate style="display:flex;flex-direction:column;gap:.9rem">
      <p class="hint">Enter the email address of your account. We will email you a 6-digit code to reset your password.</p>
      <div class="field"><label for="fpEmail">Email</label><input id="fpEmail" type="email" autocomplete="username" value="${esc(prefill)}"></div>
      <div id="fpMsg"></div>
      <button class="btn block" type="submit">Send OTP</button>
      <button class="linkbtn" type="button" id="back">Back to login</button>
    </form>`);
  $('#fpEmail').focus(); $('#back').onclick = () => renderLogin();
  $('#fpForm').onsubmit = async e => {
    e.preventDefault(); const email = $('#fpEmail').value.trim(); const btn = $('#fpForm button[type=submit]'); btn.disabled = true;
    try { const r = await api('POST', '/auth/forgot-password', { email }); renderReset(email, r); }
    catch (er) { $('#fpMsg').innerHTML = errBox(er); btn.disabled = false; }
  };
}
function renderReset(email, r) {
  const fields = `
    <div class="field"><label for="np">New password (8+ characters, letters and a number)</label><input id="np" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="np2">Confirm new password</label><input id="np2" type="password" autocomplete="new-password"></div>`;
  otpScreen({
    title: 'Reset Password', email, info: sentInfo(r), extraFields: fields, submitLabel: 'Reset password',
    onResend: () => api('POST', '/auth/forgot-password', { email }),
    onSubmit: async code => {
      const a = $('#np').value, b = $('#np2').value;
      if (a.length < 8 || !/[A-Za-z]/.test(a) || !/\d/.test(a)) throw new Error('Password must be at least 8 characters and include a letter and a number.');
      if (a !== b) throw new Error('The two passwords do not match.');
      await api('POST', '/auth/reset-password', { email, otp: code, newPassword: a });
      renderLogin('', 'Password updated. Sign in with your new password.', email);
    },
  });
}
function signOut(msg) { Auth.clear(); user = null; renderLogin(msg); }

/* ---------- shell ---------- */
async function shell() {
  if (!user) return renderLogin();
  try { unread = (await api('GET', '/notifications')).unread; } catch (e) { if (e.status === 401) return signOut(e.message); }
  const r = user.role;
  $('#root').innerHTML = `<header class="topbar">
     <div class="brand"><div class="logo" aria-hidden="true">OD</div>CampusOD</div>
     <nav class="nav" aria-label="Sections">${ROLES[r].map(([k, l]) => `<button type="button" data-view="${k}" ${k === view ? 'aria-current="page"' : ''}>${l}${k === 'notifs' && unread ? `<span class="badge">${unread}</span>` : ''}</button>`).join('')}</nav>
     <div class="userbox"><span class="who">${esc(user.name)} · ${esc(r)}</span><button class="btn" id="out" type="button">Sign out</button></div>
   </header><main class="stage" id="main"><div class="loading">Loading…</div></main>`;
  document.querySelectorAll('.nav button').forEach(b => b.onclick = () => { view = b.dataset.view; shell(); });
  $('#out').onclick = () => signOut();
  const main = $('#main');
  try { await VIEWS[r][view](main); }
  catch (e) { if (e.status === 401) return signOut(e.message); main.innerHTML = win('Something went wrong', errBox(e)); }
}

/* ---------- shared pieces ---------- */
function reqCard(q, extra = '') {
  return `<article class="card" data-id="${q.id}">
    <div class="top"><div><b>${esc(q.eventName)}</b> <span class="mono muted">${esc(q.code)}</span></div><div style="display:flex;gap:.4rem;flex-wrap:wrap">${statusChip(q.status)}${exitChip(q.exit)}</div></div>
    <dl class="facts">
      <div><dt>Student</dt><dd>${esc(q.student.name)} · ${esc(q.student.rollNo)}${q.student.isHosteller ? ' · Hosteller' : ''}</dd></div>
      <div><dt>Type</dt><dd>${q.type === 'OD' ? 'On-Duty (OD)' : 'Leave'}</dd></div>
      <div><dt>When</dt><dd>${range(q)} (${dur(q.fromTime, q.toTime)})</dd></div>
      <div><dt>Location</dt><dd>${esc(q.location || 'Not given')}</dd></div>
      <div style="grid-column:1/-1"><dt>Reason</dt><dd>${esc(q.reason)}</dd></div>
      ${q.hasProof ? `<div><dt>Proof</dt><dd><button class="btn outline small" data-proof="${q.id}" data-name="${esc(q.proofName)}">${esc(q.proofName)}</button></dd></div>` : ''}
      ${q.remarks ? `<div style="grid-column:1/-1"><dt>Faculty remarks</dt><dd>${esc(q.remarks)}</dd></div>` : ''}
    </dl>${extra}</article>`;
}
const detailBtn = q => `<button class="btn outline small" data-detail="${q.id}">View timeline</button>`;
function bind(root, list) {
  root.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => openDetail(list.find(q => q.id === b.dataset.detail)));
  root.querySelectorAll('[data-proof]').forEach(b => b.onclick = () => downloadProof(b.dataset.proof, b.dataset.name).catch(e => toast(e.message, true)));
}
function modal(title, body) {
  const o = document.createElement('div'); o.className = 'overlay';
  o.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">${win(title, body + '<button class="btn outline" type="button" id="closeM">Close</button>')}</div>`;
  document.body.appendChild(o);
  const key = e => e.key === 'Escape' && close(); const close = () => { o.remove(); document.removeEventListener('keydown', key); };
  document.addEventListener('keydown', key); $('#closeM', o).onclick = close; o.onclick = e => { if (e.target === o) close(); }; $('#closeM', o).focus();
  return o;
}
function openDetail(q) {
  modal(`${q.code} · Timeline`, `<div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start"><div><b>${esc(q.eventName)}</b><p class="muted">${esc(q.student.name)} · ${range(q)}</p></div>${statusChip(q.status)}</div>
    <ol class="timeline">${[...q.timeline].reverse().map(h => `<li><div>${esc(h.text)}<br><time>${fmt(h.at)}</time></div></li>`).join('')}</ol>`);
}
function attendanceBlock(a) {
  if (!a.subjects.length) return empty('No attendance records yet.');
  return `<div class="card"><h2>Overall · ${a.overall}%</h2>
   ${a.subjects.map(x => `<div class="attrow"><span>${esc(x.subject)}</span><div class="bar ${x.percent < 75 ? 'low' : x.percent < 85 ? 'mid' : ''}" role="img" aria-label="${x.percent}% present"><i style="width:${x.percent}%"></i></div><span class="mono">${x.present}/${x.total}</span></div>`).join('')}
   <p class="hint">Approved OD days count as present automatically. Leave does not.</p></div>`;
}
async function notifsView(m) {
  const n = await api('GET', '/notifications');
  m.innerHTML = win('Notifications', n.items.length ? `<ul class="timeline">${n.items.map(x => `<li><div>${x.read ? '' : '<span class="chip info">New</span> '}${esc(x.message)}<br><time>${fmt(x.createdAt)}</time></div></li>`).join('')}</ul>` : empty('No notifications yet. They appear when a request is submitted or decided.'));
  if (n.unread) { await api('POST', '/notifications/read-all'); unread = 0; const b = $('.nav .badge'); if (b) b.remove(); }
}

/* ---------- screens ---------- */
const VIEWS = {
  Student: {
    // wireframe: three outlined count boxes, "Event / Date / Status" table, "+ New OD / Leave Request"
    async overview(m) {
      const [p, mine, att] = await Promise.all([api('GET', '/me/profile'), api('GET', '/requests/mine'), api('GET', '/attendance/summary')]);
      const c = s => mine.filter(q => q.status === s).length;
      m.innerHTML = win('Student Dashboard', `
        <p class="muted">${esc(p.name)} · ${esc(p.rollNo)} · ${esc(p.department)} year ${p.year}${p.isHosteller ? ' · Hostel resident' : ''}</p>
        <div class="stats">
          <div class="stat pending"><div class="n">${c('Pending')}</div><div class="l">Pending</div></div>
          <div class="stat approved"><div class="n">${c('Approved')}</div><div class="l">Approved</div></div>
          <div class="stat rejected"><div class="n">${c('Rejected')}</div><div class="l">Rejected</div></div>
          <div class="stat"><div class="n">${att.overall}%</div><div class="l">Attendance</div></div>
        </div>
        <div class="thead">Event / Date / Status</div>
        <div class="rows">${mine.length ? mine.slice(0, 6).map(q => `<button class="row click" type="button" data-detail="${q.id}"><span class="main"><b>${esc(q.eventName)}</b><br><span class="hint">${range(q)}</span></span><span class="side">${statusChip(q.status)}</span></button>`).join('') : empty('You have not applied yet. Start with a new request.')}</div>
        ${mine.length > 6 ? '<button class="btn outline" type="button" id="all">View all requests</button>' : ''}
        <button class="btn block" type="button" id="go">+ New OD / Leave Request</button>`);
      $('#go').onclick = () => { view = 'new'; shell(); }; const all = $('#all'); if (all) all.onclick = () => { view = 'mine'; shell(); };
      bind(m, mine);
    },
    // wireframe order: Type + Event name, Reason, From + To, Location, Upload proof, Submit
    async new(m) {
      const p = await api('GET', '/me/profile');
      m.innerHTML = win('New OD / Leave Request', `<form id="f" novalidate style="display:flex;flex-direction:column;gap:1rem">
          <div class="grid2">
            <div class="field"><label for="type">Type  ▾</label><select id="type"><option value="OD">On-Duty (OD)</option><option value="Leave">Leave</option></select></div>
            <div class="field"><label for="event">Event name</label><input id="event" maxlength="120" placeholder="e.g. State Hackathon"><span class="err" id="e-event"></span></div>
          </div>
          <div class="field"><label for="reason">Reason</label><textarea id="reason" maxlength="500" placeholder="Why do you need this OD or leave?"></textarea><span class="err" id="e-reason"></span></div>
          <div class="grid2">
            <div class="field"><label for="from">From</label><input id="from" type="datetime-local" value="${tomorrowAt(9)}"><span class="err" id="e-from"></span></div>
            <div class="field"><label for="to">To</label><input id="to" type="datetime-local" value="${tomorrowAt(17)}"><span class="err" id="e-to"></span></div>
          </div>
          <div class="field"><label for="loc">Location</label><input id="loc" maxlength="120" placeholder="Venue and city"></div>
          <label class="upload" for="proof" style="position:relative"><span aria-hidden="true">⬆</span><span id="proofName">Upload proof (PDF / image, max 5 MB)</span><input id="proof" type="file" accept=".pdf,image/png,image/jpeg,image/webp"></label>
          ${p.isHosteller ? '<p class="hint">You are a hostel resident. If this is approved, the warden receives it automatically and it counts as your exit permission.</p>' : ''}
          <div id="formErr"></div>
          <button class="btn block" type="submit">Submit Request</button>
        </form>`);
      $('#proof').onchange = () => { $('#proofName').textContent = $('#proof').files[0]?.name || 'Upload proof (PDF / image, max 5 MB)'; };
      $('#f').onsubmit = async e => {
        e.preventDefault(); let ok = true; const v = id => $('#' + id).value.trim();
        const err = (id, t) => { $('#e-' + id).textContent = t; if (t) ok = false; };
        err('event', v('event') ? '' : 'Enter the event name.'); err('reason', v('reason').length >= 10 ? '' : 'Give a reason of at least 10 characters.');
        err('from', v('from') ? '' : 'Choose a start.'); err('to', !v('to') ? 'Choose an end.' : (v('from') && new Date(v('to')) <= new Date(v('from')) ? 'End must be after the start.' : ''));
        if (!ok) return;
        const fd = new FormData();
        fd.append('type', v('type')); fd.append('eventName', v('event')); fd.append('reason', v('reason')); fd.append('location', v('loc'));
        fd.append('fromTime', new Date(v('from')).toISOString()); fd.append('toTime', new Date(v('to')).toISOString());
        const f = $('#proof').files[0]; if (f) fd.append('proof', f);
        const btn = $('#f button[type=submit]'); btn.disabled = true;
        try { await api('POST', '/requests', fd); toast('Request submitted. Your parent has been notified.'); view = 'mine'; shell(); }
        catch (er) { $('#formErr').innerHTML = errBox(er); btn.disabled = false; }
      };
    },
    async mine(m) {
      const mine = await api('GET', '/requests/mine');
      m.innerHTML = win('My Requests', mine.length ? `<div class="cards">${mine.map(q => reqCard(q, `<div class="btns">${detailBtn(q)}</div>`)).join('')}</div>` : empty('No requests yet.'));
      bind(m, mine);
    },
    async attendance(m) { const a = await api('GET', '/attendance/summary'); m.innerHTML = win('Attendance', attendanceBlock(a)); },
    notifs: notifsView,
  },

  Parent: {
    // wireframe: "Your ward has applied for OD" card with Event / Reason / Duration / Status, Acknowledge + Contact
    async notices(m) {
      await loadWards();
      if (!wards.length) { m.innerHTML = win('Parent – Request Notice', empty('No student is linked to your account yet. Ask the admin office.')); return; }
      const list = await api('GET', `/requests/ward?studentId=${wardId}`);
      const w = wards.find(x => x.id === wardId);
      const statusText = q => q.status === 'Pending' ? 'Awaiting faculty' : q.status;
      m.innerHTML = win('Parent – Request Notice', `${wardPicker()}
        ${list.length ? `<div class="cards">${list.map(q => `<article class="card">
          <h2>Your ward has applied for ${q.type === 'OD' ? 'OD' : 'leave'}</h2>
          <div class="lines"><span>Student:  <b>${esc(q.student.name)}</b></span><span>Event:  <b>${esc(q.eventName)}</b></span><span>Reason:  <b>${esc(q.reason)}</b></span><span>Duration:  <b>${dur(q.fromTime, q.toTime)}</b> <span class="hint">(${range(q)})</span></span><span>Status:  ${statusChip(statusText(q))}</span>${q.remarks ? `<span>Faculty remarks:  <b>${esc(q.remarks)}</b></span>` : ''}</div>
          <div class="btns">${q.parentAck ? '<span class="chip ok">You acknowledged</span>' : `<button class="btn good" data-ack="${q.id}">Acknowledge</button>`}<button class="btn grey" data-contact="1">Contact</button>${detailBtn(q)}</div></article>`).join('')}</div>` : empty('No requests from your ward.')}`);
      bind(m, list); bindPicker();
      m.querySelectorAll('[data-ack]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api('POST', `/requests/${b.dataset.ack}/acknowledge`); toast('Acknowledged'); shell(); } catch (e) { toast(e.message, true); b.disabled = false; } });
      m.querySelectorAll('[data-contact]').forEach(b => b.onclick = () => modal('Contact', w.advisor ? `<p>Faculty advisor for ${esc(w.name)}:</p><p><b>${esc(w.advisor.name)}</b></p><p class="mono">${esc(w.advisor.email)}</p>` : '<p class="muted">No faculty advisor is assigned yet. Ask the admin office.</p>'));
    },
    async attendance(m) {
      await loadWards();
      if (!wards.length) { m.innerHTML = win('Ward Attendance', empty('No student is linked to your account yet.')); return; }
      const a = await api('GET', `/attendance/summary?studentId=${wardId}`);
      m.innerHTML = win('Ward Attendance · ' + wards.find(x => x.id === wardId).name, wardPicker() + attendanceBlock(a)); bindPicker();
    },
    notifs: notifsView,
  },

  Faculty: {
    // wireframe: student + event, Approve / Reject, Remarks, Submit decision
    async pending(m) {
      const p = await api('GET', '/requests?status=Pending');
      m.innerHTML = win('Faculty – Pending Requests', p.length ? `<div class="cards">${p.map(q => `<article class="card" data-card="${q.id}">
          <div class="top"><div><b>${esc(q.student.name)}</b> <span class="mono muted">${esc(q.student.rollNo)}</span><br><span>${esc(q.eventName)}</span> <span class="mono muted">${esc(q.code)}</span></div><span class="hint">Parent: ${q.parentAck ? 'acknowledged' : 'not yet acknowledged'}</span></div>
          <div class="lines"><span class="hint">${q.type === 'OD' ? 'OD' : 'Leave'} · ${range(q)} (${dur(q.fromTime, q.toTime)})${q.location ? ' · ' + esc(q.location) : ''}</span><span>${esc(q.reason)}</span>${q.hasProof ? `<span><button class="btn outline small" data-proof="${q.id}" data-name="${esc(q.proofName)}">${esc(q.proofName)}</button></span>` : ''}</div>
          <div class="btns"><button class="btn toggle approve" type="button" data-pick="Approved" aria-pressed="false">Approve</button><button class="btn toggle reject" type="button" data-pick="Rejected" aria-pressed="false">Reject</button></div>
          <div class="field"><label for="rm-${q.id}">Remarks (required to reject)</label><input id="rm-${q.id}" maxlength="140"></div>
          <span class="hint" id="er-${q.id}" style="color:var(--red)"></span>
          <button class="btn block" type="button" data-submit="${q.id}" disabled>Submit decision</button></article>`).join('')}</div>` : empty('All caught up. New requests appear here.'));
      bind(m, p);
      m.querySelectorAll('[data-card]').forEach(card => {
        const id = card.dataset.card; let pick = null; const submit = $('[data-submit]', card);
        card.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { pick = b.dataset.pick; card.querySelectorAll('[data-pick]').forEach(x => x.setAttribute('aria-pressed', x === b)); submit.disabled = false; });
        submit.onclick = async () => {
          const remarks = $('#rm-' + id).value.trim();
          if (pick === 'Rejected' && !remarks) { $('#er-' + id).textContent = 'Add a remark so the student knows why.'; return; }
          submit.disabled = true;
          try { await api('POST', `/requests/${id}/decision`, { decision: pick, remarks }); toast(pick === 'Approved' ? 'Approved. Warden and attendance updated.' : 'Rejected'); shell(); }
          catch (e) { $('#er-' + id).textContent = e.message; submit.disabled = false; }
        };
      });
    },
    async history(m) {
      const p = await api('GET', '/requests?status=decided');
      m.innerHTML = win('Faculty – Decided Requests', p.length ? `<div class="cards">${p.map(q => reqCard(q, `<div class="btns">${detailBtn(q)}</div>`)).join('')}</div>` : empty('Nothing decided yet.')); bind(m, p);
    },
    notifs: notifsView,
  },

  Warden: {
    // wireframe: "Student / Out – In / Exit" list with Linked / Pending chips and the note about no second out-pass
    async hostel(m) {
      const l = await api('GET', '/hostel/list');
      m.innerHTML = win('Warden – Hostel OD List', `<div class="thead">Student  /  Out – In  /  Exit</div>
        ${l.length ? `<div class="rows">${l.map(x => { const q = x.request; return `<div class="row"><span class="main"><b>${esc(q.student.name)}</b> <span class="mono muted">${esc(q.student.rollNo)}</span><br><span class="hint">${range(q)} · ${esc(q.eventName)}</span></span><span class="side">${exitChip(x.status)}${x.status === 'linked' ? `<button class="btn outline small" data-out="${x.exitId}">Mark out</button>` : x.status === 'out' ? `<button class="btn outline small" data-back="${x.exitId}">Mark returned</button>` : ''}</span></div>`; }).join('')}</div>` : empty('No approved hostel ODs yet.')}
        <p class="hint"><i>Approved hostel ODs act as the exit permission – no second out-pass form.</i></p>`);
      const act = (attr, path) => m.querySelectorAll(`[data-${attr}]`).forEach(b => b.onclick = async () => { b.disabled = true; try { await api('POST', `/hostel/${b.dataset[attr]}/${path}`); shell(); } catch (e) { toast(e.message, true); b.disabled = false; } });
      act('out', 'out'); act('back', 'return');
    },
    notifs: notifsView,
  },

  Admin: {
    async reports(m) {
      const r = await api('GET', '/admin/reports'), tot = r.total || 1;
      const bar = (l, n, c) => `<div class="hbar"><span>${l}</span><div class="bar"><i style="width:${n / tot * 100}%;background:${c}"></i></div><span class="mono">${n}</span></div>`;
      m.innerHTML = win('Admin – Reports', `<div class="stats"><div class="stat"><div class="n">${r.total}</div><div class="l">Total requests</div></div><div class="stat pending"><div class="n">${r.byStatus.Pending}</div><div class="l">Awaiting decision</div></div><div class="stat"><div class="n">${r.hostelExits}</div><div class="l">Hostel exits linked</div></div><div class="stat approved"><div class="n">${r.odDaysCredited}</div><div class="l">OD days credited</div></div></div>
        <div class="split"><div class="card"><h2>By status</h2>${bar('Pending', r.byStatus.Pending, 'var(--amber)')}${bar('Approved', r.byStatus.Approved, 'var(--green)')}${bar('Rejected', r.byStatus.Rejected, 'var(--red)')}</div>
        <div class="card"><h2>By type</h2>${bar('OD', r.byType.OD, 'var(--teal)')}${bar('Leave', r.byType.Leave, 'var(--teal)')}</div></div>`);
    },
    async users(m) {
      const users = await api('GET', '/admin/users');
      m.innerHTML = win('Admin – Users', `<form class="card" id="uf" novalidate><h2>Add user</h2><div class="grid2">
          <div class="field"><label for="un">Name</label><input id="un" maxlength="80"></div>
          <div class="field"><label for="ue">Email</label><input id="ue" type="email" maxlength="120"></div>
          <div class="field"><label for="ur">Role  ▾</label><select id="ur">${Object.keys(ROLES).map(r => `<option>${r}</option>`).join('')}</select></div>
          <div class="field"><label for="up">Temporary password (8+ characters)</label><input id="up" type="password" autocomplete="new-password"></div>
        </div>
        <div class="grid2" id="stuFields" hidden>
          <div class="field"><label for="us-roll">Roll number</label><input id="us-roll"></div>
          <div class="field"><label for="us-dept">Department</label><input id="us-dept" value="CSE"></div>
          <div class="field"><label for="us-year">Year</label><input id="us-year" type="number" min="1" max="6" value="1"></div>
          <div class="field"><label for="us-par">Parent email (existing parent account)</label><input id="us-par" type="email"></div>
          <div class="field"><label for="us-host">Hostel resident</label><select id="us-host"><option value="">No</option><option value="1">Yes</option></select></div>
        </div>
        <p class="hint">The new user must verify this email address with a one-time code the first time they sign in, so use an address they can open.</p><div id="uErr"></div><div><button class="btn" type="submit">Add user</button></div></form>
        <div class="card"><h2>${users.length} users</h2><div class="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td>${esc(u.name)}</td><td class="mono">${esc(u.email)}</td><td><span class="chip info">${esc(u.role)}</span></td><td><span class="chip ${u.active ? 'ok' : 'off'}">${u.active ? 'Active' : 'Inactive'}</span> <span class="chip ${u.emailVerified ? 'info' : 'warn'}">${u.emailVerified ? 'Email verified' : 'Email not verified'}</span></td><td>${u.id === user.id ? '' : `<button class="btn outline small" data-toggle="${u.id}" data-active="${u.active ? 1 : ''}">${u.active ? 'Deactivate' : 'Activate'}</button>`}</td></tr>`).join('')}</tbody></table></div></div>`);
      $('#ur').onchange = () => { $('#stuFields').hidden = $('#ur').value !== 'Student'; };
      $('#uf').onsubmit = async e => {
        e.preventDefault(); const v = id => $('#' + id).value.trim();
        const body = { name: v('un'), email: v('ue'), role: $('#ur').value, password: $('#up').value };
        if (body.role === 'Student') Object.assign(body, { rollNo: v('us-roll'), department: v('us-dept'), year: v('us-year'), parentEmail: v('us-par'), isHosteller: !!$('#us-host').value });
        try { await api('POST', '/admin/users', body); toast('User added'); shell(); } catch (er) { $('#uErr').innerHTML = errBox(er); }
      };
      m.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => { try { await api('PATCH', `/admin/users/${b.dataset.toggle}`, { active: !b.dataset.active }); shell(); } catch (er) { toast(er.message, true); } });
    },
    async audit(m) {
      const a = await api('GET', '/admin/audit');
      m.innerHTML = win('Admin – Audit Log', `<div class="tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th></tr></thead><tbody>${a.map(x => `<tr><td class="mono">${fmt(x.at)}</td><td>${esc(x.actor)}</td><td>${esc(x.action)}</td></tr>`).join('')}</tbody></table></div>`);
    },
  },
};

async function loadWards() { if (!wards.length) { wards = await api('GET', '/parent/wards'); wardId = wardId || wards[0]?.id; } }
const wardPicker = () => wards.length > 1 ? `<div class="field" style="max-width:260px"><label for="ward">Ward</label><select id="ward">${wards.map(w => `<option value="${w.id}" ${w.id === wardId ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>` : '';
const bindPicker = () => { const s = $('#ward'); if (s) s.onchange = () => { wardId = s.value; shell(); }; };

if (user && Auth.token) { view = ROLES[user.role]?.[0][0]; shell(); } else renderLogin();
