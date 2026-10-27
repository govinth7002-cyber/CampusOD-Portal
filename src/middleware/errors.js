module.exports = {
  notFound: (req, res) => res.status(404).json({ error: 'Not found.' }),
  handler: (err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors).map(e => e.message).join(' ') });
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id.' });
    if (err.code === 11000) return res.status(409).json({ error: 'That value already exists.' });
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File is larger than 5 MB.' });
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong on the server.' : err.message, code: err.errorCode });
  },
};
