const router = require('express').Router();
const Notification = require('../models/Notification');
const ODRequest = require('../models/ODRequest');
const HostelExit = require('../models/HostelExit');
const Student = require('../models/Student');
const { HttpError, asyncHandler } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const { summary } = require('../services/attendanceService');
const { notifyUser, audit } = require('../services/notify');
const { studentOf, wardsOf, canViewStudent, serializeRequests } = require('./helpers');

router.use(authenticate);

/* ---- notifications ---- */
router.get('/notifications', asyncHandler(async (req, res) => {
  const list = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ unread: list.filter(n => !n.read).length, items: list.map(n => ({ id: n._id, message: n.message, read: n.read, createdAt: n.createdAt })) });
}));
router.post('/notifications/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
}));

/* ---- students / wards / attendance ---- */
router.get('/me/profile', requireRole('Student'), asyncHandler(async (req, res) => {
  const s = await studentOf(req.user);
  res.json({ id: s._id, name: req.user.name, rollNo: s.rollNo, department: s.department, year: s.year, isHosteller: s.isHosteller });
}));
router.get('/parent/wards', requireRole('Parent'), asyncHandler(async (req, res) => {
  const wards = await wardsOf(req.user);
  res.json(wards.map(w => ({ id: w._id, name: w.user.name, rollNo: w.rollNo, department: w.department, year: w.year, isHosteller: w.isHosteller, advisor: w.advisor ? { name: w.advisor.name, email: w.advisor.email } : null })));
}));
router.get('/attendance/summary', asyncHandler(async (req, res) => {
  let id = req.query.studentId;
  if (req.user.role === 'Student' && !id) id = (await studentOf(req.user))._id;
  if (!id) throw new HttpError(400, 'studentId is required.');
  if (!(await canViewStudent(req.user, id))) throw new HttpError(403, 'You cannot view this student.');
  res.json(await summary(new (require('mongoose').Types.ObjectId)(String(id))));
}));

/* ---- hostel (Warden) ---- */
router.get('/hostel/list', requireRole('Warden', 'Admin'), asyncHandler(async (req, res) => {
  const exits = await HostelExit.find().sort({ createdAt: -1 }).limit(200);
  const reqs = await serializeRequests(await ODRequest.find({ _id: { $in: exits.map(e => e.request) } }));
  const byId = Object.fromEntries(reqs.map(r => [String(r.id), r]));
  res.json(exits.map(e => ({ exitId: e._id, status: e.status, outTime: e.outTime, inTime: e.inTime, request: byId[String(e.request)] }))
    .filter(x => x.request).sort((a, b) => new Date(a.request.fromTime) - new Date(b.request.fromTime)));
}));
async function mark(req, res, from, to, field, text) {
  const e = await HostelExit.findOneAndUpdate({ _id: req.params.id, status: from }, { $set: { status: to, [field]: new Date(), warden: req.user._id } }, { new: true });
  if (!e) throw new HttpError(409, `This exit is not ready to be marked ${to}.`);
  const r = await ODRequest.findById(e.request);
  r.timeline.push({ at: new Date(), text }); await r.save();
  const st = await Student.findById(e.student);
  await notifyUser(st.user, `${text} (${r.code}).`, r._id);
  await audit(req.user.name, text, 'HostelExit', e._id);
  res.json({ ok: true, status: e.status });
}
router.post('/hostel/:id/out', requireRole('Warden'), asyncHandler((req, res) => mark(req, res, 'linked', 'out', 'outTime', 'Warden marked you out of the hostel')));
router.post('/hostel/:id/return', requireRole('Warden'), asyncHandler((req, res) => mark(req, res, 'out', 'returned', 'inTime', 'Warden marked you returned to the hostel')));
module.exports = router;
