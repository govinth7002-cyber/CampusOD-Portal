const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  date: { type: String, required: true },           // YYYY-MM-DD (campus time)
  subject: { type: String, required: true },
  status: { type: String, enum: ['Present', 'Absent', 'OD', 'Leave'], required: true },
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ODRequest' },
});
schema.index({ student: 1, date: 1, subject: 1 }, { unique: true });
module.exports = mongoose.model('Attendance', schema);
