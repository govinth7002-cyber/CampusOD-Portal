const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true },
  purpose: { type: String, enum: ['verify', 'reset'], required: true },
  codeHash: { type: String, required: true },   // HMAC of the code, never the code itself
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },  // MongoDB removes it after expiry
  lastSentAt: { type: Date, required: true },
});
schema.index({ email: 1, purpose: 1 }, { unique: true });
module.exports = mongoose.model('OtpCode', schema);
