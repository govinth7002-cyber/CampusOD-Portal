const mongoose = require('mongoose');
module.exports = mongoose.model('AuditLog', new mongoose.Schema({
  actor: { type: String, required: true },
  action: { type: String, required: true },
  entity: String,
  entityId: String,
}, { timestamps: true }));
