const mongoose = require('mongoose');
const { mongoUri } = require('./index');
module.exports = async function connectDB(uri = mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
};
