const mongoose = require('mongoose');
const { roles } = require('../config');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: roles, required: true },
  phone: { type: String, trim: true },
  active: { type: Boolean, default: true },
  emailVerified: { type: Boolean, default: false },   // true after the owner proves access with an OTP
}, { timestamps: true });
module.exports = mongoose.model('User', schema);
