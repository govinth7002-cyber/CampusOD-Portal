const Student = require('../models/Student');
const Parent = require('../models/Parent');
const HostelExit = require('../models/HostelExit');
const { HttpError } = require('../utils/http');

async function studentOf(user) {
  const s = await Student.findOne({ user: user._id });
  if (!s) throw new HttpError(404, 'No student profile is linked to this account.');
  return s;
}
async function wardsOf(user) {
  const p = await Parent.findOne({ user: user._id });
  return p ? Student.find({ parent: p._id }).populate('user', 'name').populate('advisor', 'name email') : [];
}
// Which student ids may this user read?
async function canViewStudent(user, studentId) {
  if (['Faculty', 'Admin', 'Warden'].includes(user.role)) return true;
  if (user.role === 'Student') return String((await studentOf(user))._id) === String(studentId);
  if (user.role === 'Parent') return (await wardsOf(user)).some(w => String(w._id) === String(studentId));
  return false;
}
async function serializeRequests(list) {
  const docs = await require('../models/ODRequest').populate(list, { path: 'student', populate: { path: 'user', select: 'name' } });
  const exits = await HostelExit.find({ request: { $in: docs.map(d => d._id) } });
  const exitBy = Object.fromEntries(exits.map(e => [String(e.request), e.status]));
  return docs.map(d => ({
    id: d._id, code: d.code, type: d.type, eventName: d.eventName, reason: d.reason, location: d.location,
    fromTime: d.fromTime, toTime: d.toTime, status: d.status, remarks: d.remarks, parentAck: d.parentAck,
    proofName: d.proofName || null, hasProof: !!d.proofFile, createdAt: d.createdAt, timeline: d.timeline,
    exit: exitBy[String(d._id)] || null,
    student: { id: d.student._id, name: d.student.user.name, rollNo: d.student.rollNo, isHosteller: d.student.isHosteller },
  }));
}
module.exports = { studentOf, wardsOf, canViewStudent, serializeRequests };
