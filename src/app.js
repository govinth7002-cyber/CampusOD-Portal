const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { notFound, handler } = require('./middleware/errors');

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null, 'style-src': ["'self'", 'https:', "'unsafe-inline'"], 'font-src': ["'self'", 'https:', 'data:'] } },
}));
app.use(cors());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/misc'));
app.use('/api', notFound);

// Frontend (static)
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(handler);
module.exports = app;
