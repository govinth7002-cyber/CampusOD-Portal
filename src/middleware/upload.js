const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { HttpError } = require('../utils/http');
const dir = path.join(__dirname, '..', '..', 'uploads');
const ok = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
module.exports = multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => ok.includes(file.mimetype) ? cb(null, true) : cb(new HttpError(400, 'Upload a PDF or an image (PNG, JPG, WebP).')),
});
module.exports.dir = dir;
