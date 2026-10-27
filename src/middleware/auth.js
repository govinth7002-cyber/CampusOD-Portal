const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { jwtSecret } = require('../config');
const { HttpError, asyncHandler } = require('../utils/http');

const authenticate = asyncHandler(async (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw new HttpError(401, 'Please sign in.');
  let payload;
  try { payload = jwt.verify(token, jwtSecret); } catch { throw new HttpError(401, 'Your session has expired. Please sign in again.'); }
  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new HttpError(401, 'This account is not active.');
  req.user = user;
  next();
});
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have access to this action.'));
module.exports = { authenticate, requireRole };
