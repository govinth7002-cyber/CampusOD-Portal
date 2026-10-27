const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const ODRequest = require('../models/ODRequest');
const HostelExit = require('../models/HostelExit');
const Attendance = require('../models/Attendance');
const AuditLog = require('../models/AuditLog');
const { roles } = require('../config');
const { HttpError, asyncHandler } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/notify');

router.use(authenticate, requireRole('Admin'));

router.get('/users', asyncHandler(async (req, res) => {
  const users = await User.find().sort({ role: 1, name: 1 });
  res.json(users.map(u => ({ id: u._id, name: u.name, email: u.email, role: u.role, active: u.active, emailVerified: u.emailVerified })));
}));

router.post('/users', asyncHandler(async (req, res) => {
  const { name, email, role, password, rollNo, department, year, isHosteller, parentEmail } = req.body || {};
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '')) throw new HttpError(400, 'Enter a name and a valid email address.');
  if (!roles.includes(role)) throw new HttpError(400, 'Choose a valid role.');
  if (!password || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  let parent;
  if (role === 'Student') {
    if (!rollNo || !department || !year) throw new HttpError(400, 'Students need a roll number, department and year.');
    if (parentEmail) {
      const pu = await User.findOne({ email: parentEmail.toLowerCase().trim(), role: 'Parent' });
      parent = pu && await Parent.findOne({ user: pu._id });
      if (!parent) throw new HttpError(400, 'No parent account exists with that email. Create the parent first.');
    }
  }
  const user = await User.create({ name, email, role, passwordHash: await bcrypt.hash(password, 10) });
  try {
    if (role === 'Student') await Student.create({ user: user._id, rollNo, department, year: Number(year), isHosteller: !!isHosteller, parent: parent?._id });
    if (role === 'Parent') await Parent.create({ user: user._id, email: user.email });
  } catch (e) { await User.deleteOne({ _id: user._id }); throw e; }
  await audit(req.user.name, `Added user ${user.email} as ${role}`, 'User', user._id);
  res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role, active: true });
}));

router.patch('/users/:id', asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new HttpError(400, 'You cannot change your own account here.');
  const u = await User.findByIdAndUpdate(req.params.id, { $set: { active: !!req.body?.active } }, { new: true });
  if (!u) throw new HttpError(404, 'User not found.');
  await audit(req.user.name, `${u.active ? 'Activated' : 'Deactivated'} ${u.email}`, 'User', u._id);
  res.json({ id: u._id, active: u.active });
}));

router.get('/reports', asyncHandler(async (req, res) => {
  const [total, pending, approved, rejected, od, leave, exits, odDays] = await Promise.all([
    ODRequest.countDocuments(), ODRequest.countDocuments({ status: 'Pending' }), ODRequest.countDocuments({ status: 'Approved' }),
    ODRequest.countDocuments({ status: 'Rejected' }), ODRequest.countDocuments({ type: 'OD' }), ODRequest.countDocuments({ type: 'Leave' }),
    HostelExit.countDocuments(),
    Attendance.aggregate([{ $match: { status: 'OD' } }, { $group: { _id: { s: '$student', d: '$date' } } }, { $count: 'n' }]),
  ]);
  res.json({ total, byStatus: { Pending: pending, Approved: approved, Rejected: rejected }, byType: { OD: od, Leave: leave }, hostelExits: exits, odDaysCredited: odDays[0]?.n || 0 });
}));

router.get('/audit', asyncHandler(async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
  res.json(logs.map(l => ({ id: l._id, at: l.createdAt, actor: l.actor, action: l.action, entity: l.entity })));
}));
module.exports = router;
