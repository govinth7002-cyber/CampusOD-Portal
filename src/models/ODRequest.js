const mongoose = require('mongoose');
const eventSchema = new mongoose.Schema({ at: { type: Date, default: Date.now }, text: String }, { _id: false });
module.exports = mongoose.model('ODRequest', new mongoose.Schema({
  code: { type: String, unique: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  type: { type: String, enum: ['OD', 'Leave'], required: true },
  eventName: { type: String, required: true, trim: true, maxlength: 120 },
  reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 500 },
  location: { type: String, trim: true, maxlength: 120 },
  fromTime: { type: Date, required: true },
  toTime: { type: Date, required: true },
  proofFile: String,          // stored file name inside /uploads
  proofName: String,          // original file name shown to users
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending', index: true },
  remarks: String,
  parentAck: { type: Boolean, default: false },
  parentAckAt: Date,
  timeline: [eventSchema],
}, { timestamps: true }));
