// Maps well-known Prisma error codes to appropriate HTTP responses.
// See: https://www.prisma.io/docs/orm/reference/error-reference
const PRISMA_ERROR_MAP = {
  P1001: { status: 503, message: 'Database is currently unreachable. Please try again shortly.' },
  P1008: { status: 504, message: 'The database operation timed out. Please try again.' },
  P2025: { status: 404, message: 'The requested record was not found.' },
  P2002: { status: 409, message: 'A record with this value already exists.' }
};

// Call from a controller's catch block: if the error is one of the mapped
// Prisma codes, sends the matching response and returns true. Otherwise
// returns false so the caller's own generic error handling still runs —
// this is purely additive and never changes behavior for non-Prisma errors.
const handlePrismaError = (error, res) => {
  const mapped = error?.code && PRISMA_ERROR_MAP[error.code];
  if (!mapped) return false;
  res.status(mapped.status).json({ success: false, message: mapped.message });
  return true;
};

module.exports = { handlePrismaError, PRISMA_ERROR_MAP };
