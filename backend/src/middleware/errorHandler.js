const logger = require('../config/logger');

// Custom error class so services/controllers can throw with an explicit
// HTTP status instead of the generic 500 fallback.
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Must be registered last, after all routes (see server.js).
// Relies on express-async-errors so thrown errors inside async route
// handlers are forwarded here automatically instead of crashing the process.
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  // Prisma unique constraint violation -> the double-booking race case
  if (err.code === 'P2002') {
    logger.warn('Unique constraint violation (likely a slot race)', { meta: err.meta });
    return res.status(409).json({
      error: 'This slot was just taken by another booking. Please pick a different slot.',
    });
  }

  if (statusCode >= 500) {
    logger.error(err.message, { stack: err.stack });
  }

  res.status(statusCode).json({ error: err.message || 'Internal server error' });
}

module.exports = { AppError, errorHandler };
