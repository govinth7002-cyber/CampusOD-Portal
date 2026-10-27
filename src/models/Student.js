const mongoose = require('mongoose');
module.exports = mongoose.model('Student', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  rollNo: { type: String, required: true, unique: true, trim: true },
  department: { type: String, required: true, trim: true },
  year: { type: Number, required: true, min: 1, max: 6 },
  isHosteller: { type: Boolean, default: false },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent' },
  advisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));
