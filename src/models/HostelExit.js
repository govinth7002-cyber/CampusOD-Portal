const mongoose = require('mongoose');
module.exports = mongoose.model('HostelExit', new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ODRequest', required: true, unique: true },
  approval: { type: mongoose.Schema.Types.ObjectId, ref: 'Approval' },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  warden: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  outTime: Date,
  inTime: Date,
  status: { type: String, enum: ['linked', 'out', 'returned'], default: 'linked' },
}, { timestamps: true }));
