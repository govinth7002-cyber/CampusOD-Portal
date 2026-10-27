const Notification = require('../models/Notification');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const sendMail = require('./mailer');

async function notifyUser(userId, message, requestId, { email = false } = {}) {
  if (!userId) return;
  await Notification.create({ user: userId, request: requestId, message });
  if (email) {
    const u = await User.findById(userId);
    if (u?.email) sendMail(u.email, 'CampusOD update', message); // fire and forget
  }
}
async function notifyRole(role, message, requestId) {
  const users = await User.find({ role, active: true }).select('_id');
  await Promise.all(users.map(u => notifyUser(u._id, message, requestId)));
}
const audit = (actor, action, entity, entityId) => AuditLog.create({ actor, action, entity, entityId: entityId && String(entityId) });
module.exports = { notifyUser, notifyRole, audit };
