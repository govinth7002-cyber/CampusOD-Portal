const mongoose = require('mongoose');
const Counter = mongoose.model('Counter', new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }));
// Returns 1001, 1002, ... for name "request"
Counter.next = async name => 1000 + (await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true, upsert: true })).seq;
module.exports = Counter;
