const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const ODRequest = require('../models/ODRequest');
const { HttpError, asyncHandler } = require('../utils/http');
const { authenticate, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const svc = require('../services/requestService');
const { studentOf, wardsOf, canViewStudent, serializeRequests } = require('./helpers');

router.use(authenticate);

// Student: create (multipart/form-data with optional "proof" file)
router.post('/', requireRole('Student'), upload.single('proof'), asyncHandler(async (req, res) => {
  const student = await studentOf(req.user);
  const r = await svc.createRequest(req.user, student, req.body, req.file);
  res.status(201).json((await serializeRequests([r]))[0]);
}));

// Student: my requests
router.get('/mine', requireRole('Student'), asyncHandler(async (req, res) => {
  const s = await studentOf(req.user);
  res.json(await serializeRequests(await ODRequest.find({ student: s._id }).sort({ createdAt: -1 })));
}));

// Parent: requests of my wards (optional ?studentId=)
router.get('/ward', requireRole('Parent'), asyncHandler(async (req, res) => {
  const wards = await wardsOf(req.user);
  let ids = wards.map(w => w._id);
  if (req.query.studentId) ids = ids.filter(id => String(id) === req.query.studentId);
  res.json(await serializeRequests(await ODRequest.find({ student: { $in: ids } }).sort({ createdAt: -1 })));
}));

// Faculty / Admin: all requests, optional ?status=
router.get('/', requireRole('Faculty', 'Admin'), asyncHandler(async (req, res) => {
  const q = {};
  if (['Pending', 'Approved', 'Rejected'].includes(req.query.status)) q.status = req.query.status;
  if (req.query.status === 'decided') q.status = { $ne: 'Pending' };
  const sort = q.status === 'Pending' ? { createdAt: 1 } : { createdAt: -1 };
  res.json(await serializeRequests(await ODRequest.find(q).sort(sort).limit(200)));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const r = await ODRequest.findById(req.params.id);
  if (!r || !(await canViewStudent(req.user, r.student))) throw new HttpError(404, 'Request not found.');
  res.json((await serializeRequests([r]))[0]);
}));

// Faculty: approve or reject
router.post('/:id/decision', requireRole('Faculty'), asyncHandler(async (req, res) => {
  const r = await svc.decide(req.user, req.params.id, req.body?.decision, req.body?.remarks);
  res.json((await serializeRequests([r]))[0]);
}));

// Parent: acknowledge
router.post('/:id/acknowledge', requireRole('Parent'), asyncHandler(async (req, res) => {
  const wards = await wardsOf(req.user);
  const r = await svc.acknowledge(req.user, req.params.id, wards.map(w => w._id));
  res.json((await serializeRequests([r]))[0]);
}));

// Authorised download of the proof document
router.get('/:id/proof', asyncHandler(async (req, res) => {
  const r = await ODRequest.findById(req.params.id);
  if (!r || !r.proofFile || !(await canViewStudent(req.user, r.student))) throw new HttpError(404, 'No document found.');
  const file = path.join(require('../middleware/upload').dir, path.basename(r.proofFile));
  if (!fs.existsSync(file)) throw new HttpError(404, 'The file is no longer available.');
  res.download(file, r.proofName || r.proofFile);
}));
module.exports = router;
