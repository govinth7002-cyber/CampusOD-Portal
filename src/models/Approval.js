const mongoose = require('mongoose');
module.exports = mongoose.model('Approval', new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ODRequest', required: true, index: true },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  decision: { type: String, enum: ['Approved', 'Rejected'], required: true },
  remarks: String,
  decidedAt: { type: Date, default: Date.now },
}));
