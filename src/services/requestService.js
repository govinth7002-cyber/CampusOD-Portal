const ODRequest = require('../models/ODRequest');
const Approval = require('../models/Approval');
const HostelExit = require('../models/HostelExit');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Counter = require('../models/Counter');
const { HttpError } = require('../utils/http');
const { durationText } = require('../utils/dates');
const { notifyUser, notifyRole, audit } = require('./notify');
const { applyApprovedRequest } = require('./attendanceService');

const ev = text => ({ at: new Date(), text });

async function createRequest(user, student, data, file) {
  const { type, eventName, reason, location, fromTime, toTime } = data;
  if (!['OD', 'Leave'].includes(type)) throw new HttpError(400, 'Type must be OD or Leave.');
  if (!eventName?.trim()) throw new HttpError(400, 'Event name is required.');
  if (!reason || reason.trim().length < 10) throw new HttpError(400, 'Reason must be at least 10 characters.');
  const from = new Date(fromTime), to = new Date(toTime);
  if (isNaN(from) || isNaN(to)) throw new HttpError(400, 'Valid from and to times are required.');
  if (to <= from) throw new HttpError(400, 'End time must be after the start time.');

  const code = 'OD-' + await Counter.next('request');
  const req = await ODRequest.create({
    code, student: student._id, type, eventName: eventName.trim(), reason: reason.trim(), location: location?.trim(),
    fromTime: from, toTime: to, proofFile: file?.filename, proofName: file?.originalname,
    timeline: [ev(`Request submitted by ${user.name}`), ev('Parent notified with reason and duration')],
  });
  const msg = `${user.name} applied for ${type}: ${req.eventName} (${durationText(from, to)}). Reason: ${req.reason}`;
  const parent = student.parent && await Parent.findById(student.parent);
  if (parent) await notifyUser(parent.user, msg, req._id, { email: true });
  await notifyRole('Faculty', `New ${type} request ${code} from ${user.name}: ${req.eventName}`, req._id);
  await notifyUser(user._id, `Your request ${code} was submitted and is waiting for faculty approval.`, req._id);
  await audit(user.name, 'Submitted request', 'ODRequest', req._id);
  return req;
}

async function decide(faculty, requestId, decision, remarks) {
  if (!['Approved', 'Rejected'].includes(decision)) throw new HttpError(400, 'Decision must be Approved or Rejected.');
  if (decision === 'Rejected' && !remarks?.trim()) throw new HttpError(400, 'A remark is required to reject a request.');
  // Atomic status flip: only one decision can win.
  const req = await ODRequest.findOneAndUpdate({ _id: requestId, status: 'Pending' }, { $set: { status: decision, remarks: remarks?.trim() || '' } }, { new: true });
  if (!req) {
    const exists = await ODRequest.exists({ _id: requestId });
    throw new HttpError(exists ? 409 : 404, exists ? 'This request has already been decided.' : 'Request not found.');
  }
  const student = await Student.findById(req.student).populate('user');
  const approval = await Approval.create({ request: req._id, faculty: faculty._id, decision, remarks: remarks?.trim() });
  req.timeline.push(ev(`${decision} by ${faculty.name}${remarks?.trim() ? ': ' + remarks.trim() : ''}`));

  await notifyUser(student.user._id, `Your request ${req.code} was ${decision.toLowerCase()}.${remarks?.trim() ? ' Remarks: ' + remarks.trim() : ''}`, req._id, { email: true });
  const parent = student.parent && await Parent.findById(student.parent);
  if (parent) await notifyUser(parent.user, `${student.user.name}'s request ${req.code} (${req.eventName}) was ${decision.toLowerCase()}.`, req._id, { email: true });

  if (decision === 'Approved') {
    if (student.isHosteller) {
      await HostelExit.create({ request: req._id, approval: approval._id, student: student._id, status: 'linked' });
      req.timeline.push(ev('Warden received the hostel list; OD linked as exit permission'));
      await notifyRole('Warden', `${student.user.name} (${student.rollNo}) is approved for ${req.eventName}. Exit permission linked.`, req._id);
    }
    const days = await applyApprovedRequest(req);
    req.timeline.push(ev(`Attendance updated: ${req.type === 'OD' ? 'OD' : 'Leave'} marked for ${days} day(s)`));
  }
  await req.save();
  await audit(faculty.name, `${decision} request`, 'ODRequest', req._id);
  return req;
}

async function acknowledge(user, requestId, wardIds) {
  const req = await ODRequest.findById(requestId);
  if (!req || !wardIds.some(id => String(id) === String(req.student))) throw new HttpError(404, 'Request not found.');
  if (!req.parentAck) {
    req.parentAck = true; req.parentAckAt = new Date(); req.timeline.push(ev('Parent acknowledged the request'));
    await req.save();
    const student = await Student.findById(req.student);
    await notifyUser(student.user, `Your parent acknowledged ${req.code}.`, req._id);
    await audit(user.name, 'Acknowledged request', 'ODRequest', req._id);
  }
  return req;
}

module.exports = { createRequest, decide, acknowledge };
