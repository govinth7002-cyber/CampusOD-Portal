class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.errorCode = code; }
}
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { HttpError, asyncHandler };
