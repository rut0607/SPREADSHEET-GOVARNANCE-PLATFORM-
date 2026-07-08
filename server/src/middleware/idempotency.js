const NodeCache = require('node-cache');

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

// Dedicated cache instance (separate from services/cacheService.js) so
// idempotency keys never collide with unrelated app-level caching.
const idempotencyCache = new NodeCache({
  stdTTL: IDEMPOTENCY_TTL_SECONDS,
  checkperiod: 600,
  useClones: false
});

// Opt-in: only activates when the client sends an Idempotency-Key header.
// On a repeat submission with the same key, replays the cached response
// instead of re-running the handler — protects against double-taps and
// client-side network retries producing duplicate records.
const idempotency = (req, res, next) => {
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  const cached = idempotencyCache.get(key);
  if (cached) {
    res.setHeader('Idempotent-Replay', 'true');
    return res.status(cached.status).json(cached.body);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 500) {
      idempotencyCache.set(key, { status: res.statusCode, body });
    }
    return originalJson(body);
  };

  next();
};

module.exports = idempotency;
