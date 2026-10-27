const app = require('./src/app');
const connectDB = require('./src/config/db');
const { port, mongoUri, jwtSecret } = require('./src/config');

(async () => {
  if (jwtSecret === 'dev-only-secret-change-me') console.warn('WARNING: set JWT_SECRET in .env before deploying.');
  try { await connectDB(); } catch (e) { console.error(`Could not connect to MongoDB at ${mongoUri}\n${e.message}`); process.exit(1); }
  console.log('MongoDB connected');
  // Accounts created before email verification existed stay usable.
  await require('./src/models/User').updateMany({ emailVerified: { $exists: false } }, { $set: { emailVerified: true } });
  app.listen(port, () => console.log(`CampusOD running at http://localhost:${port}`));
})();
