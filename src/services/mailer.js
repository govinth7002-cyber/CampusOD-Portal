const nodemailer = require('nodemailer');
const { smtp } = require('../config');
const { HttpError } = require('../utils/http');

const configured = !!smtp.host;
const transport = configured ? nodemailer.createTransport({
  host: smtp.host, port: smtp.port, secure: smtp.port === 465,
  auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
}) : null;

// Sends one email. Returns 'email' when really sent, or 'console' when SMTP is not configured
// (development mode: the full message, including any OTP, is printed in the server terminal).
async function deliver(to, subject, text) {
  if (!transport) { console.log(`\n[mail not configured: printing instead of sending]\nTo: ${to}\nSubject: ${subject}\n${text}\n`); return 'console'; }
  try { await transport.sendMail({ from: smtp.from, to, subject, text }); return 'email'; }
  catch (e) { console.error('[mail:error]', e.message); throw new HttpError(502, 'We could not send the email. Check the SMTP settings in .env and try again.'); }
}
// Fire-and-forget version for ordinary notifications (never throws).
const sendMail = async (to, subject, text) => { try { await deliver(to, subject, text); } catch { /* already logged */ } };
sendMail.strict = deliver;
sendMail.configured = configured;
module.exports = sendMail;
