const mongoose = require('mongoose');
module.exports = mongoose.model('Notification', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'ODRequest' },
  message: { type: String, required: true },
  channel: { type: String, enum: ['in-app', 'email'], default: 'in-app' },
  read: { type: Boolean, default: false },
}, { timestamps: true }));
