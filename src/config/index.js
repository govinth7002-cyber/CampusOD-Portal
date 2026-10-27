require('dotenv').config();
module.exports = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/od_leave_system',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  tzOffsetMin: Number(process.env.TZ_OFFSET_MIN ?? 330),
  subjects: ['Data Structures', 'DBMS', 'Operating Systems', 'Web Technologies', 'Mathematics'],
  roles: ['Student', 'Parent', 'Faculty', 'Warden', 'Admin'],
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'CampusOD <no-reply@campus.edu>',
  },
};
