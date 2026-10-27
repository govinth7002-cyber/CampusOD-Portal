const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Student = require('../models/Student');
const { jwtSecret, jwtExpiresIn } = require('../config');
const { HttpError, asyncHandler } = require('../utils/http');
const { authenticate } = require('../middleware/auth');
const { audit, notifyUser } = require('../services/notify');
const otp = require('../services/otpService');
const sendMail = require('../services/mailer');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sign-in attempts. Try again in a few minutes.' } });
const publicUser = u => ({ id: u._id, name: u.name, email: u.email, role: u.role });

router.post('/login', limiter, asyncHandler(async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) throw new HttpError(400, 'Enter your email (or roll number) and password.');
  const id = String(email).trim();
  let user;
  if (id.includes('@')) user = await User.findOne({ email: id.toLowerCase() }).select('+passwordHash');
  else { // roll number
    const s = await Student.findOne({ rollNo: new RegExp('^' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') });
    user = s && await User.findById(s.user).select('+passwordHash');
  }
  if (!user || !user.active || !(await bcrypt.compare(String(password), user.passwordHash))) throw new HttpError(401, 'Email or password is incorrect.');
  if (!user.emailVerified) throw new HttpError(403, 'Please verify your email address first.', 'EMAIL_NOT_VERIFIED');
  if (role && role !== user.role) throw new HttpError(401, `This account is not a ${role} account. Choose ${user.role}.`);
  const token = jwt.sign({ sub: user._id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
  await audit(user.name, 'Signed in', 'User', user._id);
  res.json({ token, user: publicUser(user) });
}));

/* ---------- email verification and password reset (one-time codes sent by email) ---------- */
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many code requests. Try again in a few minutes.' } });
const cleanEmail = v => String(v || '').toLowerCase().trim();
const needEmail = v => { const e = cleanEmail(v); if (!/^\S+@\S+\.\S+$/.test(e)) throw new HttpError(400, 'Enter a valid email address.'); return e; };
const strongEnough = p => typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
// The reply never says whether the address has an account.
const generic = email => ({ ok: true, sentTo: otp.mask(email), delivery: sendMail.configured ? 'email' : 'console', expiresInMin: otp.TTL_MIN, resendAfterSec: otp.COOLDOWN_S });

router.post('/verify-email/send', otpLimiter, asyncHandler(async (req, res) => {
  const email = needEmail(req.body?.email);
  const u = await User.findOne({ email });
  if (u && u.active && !u.emailVerified) await otp.issue(u, 'verify');
  res.json(generic(email));
}));
router.post('/verify-email/confirm', otpLimiter, asyncHandler(async (req, res) => {
  const email = needEmail(req.body?.email);
  await otp.check(email, 'verify', req.body?.otp);
  const u = await User.findOneAndUpdate({ email, active: true }, { $set: { emailVerified: true } });
  if (!u) throw new HttpError(400, 'Invalid or expired code.');
  await audit(u.name, 'Verified email', 'User', u._id);
  res.json({ ok: true });
}));
router.post('/forgot-password', otpLimiter, asyncHandler(async (req, res) => {
  const email = needEmail(req.body?.email);
  const u = await User.findOne({ email });
  if (u && u.active) await otp.issue(u, 'reset');
  res.json(generic(email));
}));
router.post('/reset-password', otpLimiter, asyncHandler(async (req, res) => {
  const email = needEmail(req.body?.email);
  if (!strongEnough(req.body?.newPassword)) throw new HttpError(400, 'Password must be at least 8 characters and include a letter and a number.');
  await otp.check(email, 'reset', req.body?.otp);
  const u = await User.findOne({ email, active: true });
  if (!u) throw new HttpError(400, 'Invalid or expired code.');
  u.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
  u.emailVerified = true;               // they just proved they own the mailbox
  await u.save();
  await audit(u.name, 'Reset password with email code', 'User', u._id);
  await notifyUser(u._id, 'Your password was changed. If this was not you, contact the admin office.');
  res.json({ ok: true });
}));

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
module.exports = router;
