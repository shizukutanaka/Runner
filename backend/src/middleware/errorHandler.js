module.exports = (err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  const details = err.details || undefined;

  if (!isProd) {
    console.error('[ErrorHandler]', err);
  }
  res.status(status).json({
    status,
    message,
    ...(details && { details })
  });
};
