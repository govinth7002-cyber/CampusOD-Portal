const mongoose = require('mongoose');
module.exports = mongoose.model('Parent', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  phone: String,
  email: String,
}, { timestamps: true }));
