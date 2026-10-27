const crypto = require('crypto');
const OtpCode = require('../models/OtpCode');
const sendMail = require('./mailer');
const { jwtSecret } = require('../config');
const { HttpError } = require('../utils/http');

const TTL_MIN = 10, COOLDOWN_S = 60, MAX_ATTEMPTS = 5;
const lastCodes = {};   // only filled when NODE_ENV === 'test', so the smoke test can read the code
const hash = (email, purpose, code) => crypto.createHmac('sha256', jwtSecret).update(`${email}|${purpose}|${code}`).digest('hex');
const mask = e => { const [n, d] = String(e).split('@'); return `${n.slice(0, 2)}${'*'.repeat(Math.max(1, n.length - 2))}@${d}`; };

const TEXT = {
  verify: { subject: 'Verify your CampusOD email', line: 'Use this code to verify your email address' },
  reset: { subject: 'Reset your CampusOD password', line: 'Use this code to reset your password' },
};

// Creates and emails a new 6-digit code. Returns { sent:false } during the resend cooldown (no new email).
async function issue(user, purpose) {
  const email = user.email;
  const existing = await OtpCode.findOne({ email, purpose });
  if (existing && Date.now() - existing.lastSentAt.getTime() < COOLDOWN_S * 1000) return { sent: false };
  const code = String(crypto.randomInt(100000, 1000000));
  await OtpCode.findOneAndUpdate({ email, purpose }, { $set: { codeHash: hash(email, purpose, code), attempts: 0, expiresAt: new Date(Date.now() + TTL_MIN * 60000), lastSentAt: new Date() } }, { upsert: true });
  if (process.env.NODE_ENV === 'test') lastCodes[`${email}|${purpose}`] = code;
  const t = TEXT[purpose];
  await sendMail.strict(email, t.subject, `Hello ${user.name},\n\n${t.line}: ${code}\n\nThe code expires in ${TTL_MIN} minutes. If you did not ask for it, you can ignore this email.\n\nCampusOD`);
  return { sent: true };
}

// Throws a 400 unless the code is right. A used code is deleted.
async function check(email, purpose, code) {
  email = String(email || '').toLowerCase().trim();
  const bad = () => new HttpError(400, 'Invalid or expired code.');
  const rec = await OtpCode.findOne({ email, purpose });
  if (!rec || rec.expiresAt < new Date() || !/^\d{6}$/.test(String(code || ''))) throw bad();
  if (rec.attempts >= MAX_ATTEMPTS) { await rec.deleteOne(); throw new HttpError(400, 'Too many wrong attempts. Request a new code.'); }
  const a = Buffer.from(hash(email, purpose, String(code))), b = Buffer.from(rec.codeHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { rec.attempts += 1; await rec.save(); throw bad(); }
  await rec.deleteOne();
}
module.exports = { issue, check, mask, lastCodes, TTL_MIN, COOLDOWN_S };
