const Attendance = require('../models/Attendance');
const { subjects } = require('../config');
const { dayKeys } = require('../utils/dates');

// Mark every subject on every covered day as OD (counts as present) or Leave (counts as absent).
async function applyApprovedRequest(request) {
  const status = request.type === 'OD' ? 'OD' : 'Leave';
  const days = dayKeys(request.fromTime, request.toTime);
  const ops = [];
  for (const date of days) for (const subject of subjects) {
    ops.push({ updateOne: { filter: { student: request.student, date, subject }, update: { $set: { status, request: request._id } }, upsert: true } });
  }
  if (ops.length) await Attendance.bulkWrite(ops);
  return days.length;
}

async function summary(studentId) {
  const rows = await Attendance.aggregate([
    { $match: { student: studentId } },
    { $group: { _id: { subject: '$subject', status: '$status' }, n: { $sum: 1 } } },
  ]);
  const by = {};
  for (const r of rows) {
    const s = (by[r._id.subject] ??= { subject: r._id.subject, total: 0, present: 0, od: 0 });
    s.total += r.n;
    if (r._id.status === 'Present' || r._id.status === 'OD') s.present += r.n;
    if (r._id.status === 'OD') s.od += r.n;
  }
  const list = Object.values(by).sort((a, b) => a.subject.localeCompare(b.subject)).map(s => ({ ...s, percent: s.total ? Math.round(s.present / s.total * 1000) / 10 : 0 }));
  const total = list.reduce((a, s) => a + s.total, 0), present = list.reduce((a, s) => a + s.present, 0);
  return { overall: total ? Math.round(present / total * 1000) / 10 : 0, total, present, subjects: list };
}
module.exports = { applyApprovedRequest, summary };
