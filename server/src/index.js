const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const helmet = require('helmet');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { sanitizeInput } = require('./middleware/sanitize');
const requestLogger = require('./middleware/requestLogger');
const { shutdownMiddleware, setShuttingDown } = require('./middleware/shutdown');
const { authenticate, requireAdmin } = require('./middleware/auth');
const prisma = require('./config/prisma');
const healthService = require('./services/healthService');

const validateEnv = require('./config/validateEnv');
validateEnv();

const app = express();
const PORT = process.env.PORT || 8000;

let healthCheckApiKey = process.env.HEALTH_CHECK_API_KEY;
if (!healthCheckApiKey) {
  healthCheckApiKey = crypto.randomBytes(24).toString('hex');
  console.warn(`HEALTH_CHECK_API_KEY not set — generated one for this run: ${healthCheckApiKey}`);
  console.warn('Set HEALTH_CHECK_API_KEY in your .env to keep this key stable across restarts.');
}

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again in 15 minutes.'
  }
});

// Private LAN ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x) are only trusted
// as CORS origins outside production, so phone/tablet testing over a local
// network works without hand-editing CLIENT_URL every time the IP changes.
const isPrivateLanOrigin = (origin) => {
  try {
    const { hostname } = new URL(origin);
    return (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  } catch (error) {
    return false;
  }
};

const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:3000';

app.use(helmet());
app.use(compression());
app.use(morgan('dev'));
app.use(requestLogger);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === allowedOrigin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && isPrivateLanOrigin(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key']
}));
app.use('/api', generalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);
app.use(shutdownMiddleware);

// Accessible two ways: external monitoring tools (uptime checks, etc.) use
// the x-api-key header; the admin System Health page uses the normal signed-in
// session (Bearer token), since it can't hold a server secret in the bundle.
app.get('/api/health', async (req, res, next) => {
  const hasValidApiKey = req.headers['x-api-key'] === healthCheckApiKey;

  const respond = async () => {
    try {
      const result = await healthService.checkHealth();
      res.status(result.status === 'down' ? 503 : 200).json({
        success: result.status !== 'down',
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  if (hasValidApiKey) return respond();

  authenticate(req, res, () => requireAdmin(req, res, respond));
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/spreadsheets', require('./routes/spreadsheets'));
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/versions', require('./routes/versions'));
app.use('/api/google-sheets', require('./routes/googleSheets'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/system', require('./routes/system'));
app.use('/api/machines', require('./routes/machines'));
app.use('/api/production', require('./routes/production'));
app.use('/api/push', require('./routes/push'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/downtime', require('./routes/downtime'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30000;

// Only bind the port and start background jobs when run directly (`node src/index.js`),
// not when this module is `require()`d by tests via supertest.
if (require.main === module) {
  const { startScheduledSync, isSchedulerEligible } = require('./services/syncService');
  const alertService = require('./services/alertService');

  const startServer = async () => {
    try {
      await prisma.connectWithRetry();
    } catch (error) {
      console.error('Fatal: could not establish a database connection on startup.');
      console.error(error.message);
      process.exit(1);
    }

    startScheduledSync();
    healthService.startInternalHealthChecks();
    if (isSchedulerEligible()) {
      alertService.startAlertService();
    }

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });

    const shutdown = async (signal) => {
      const shutdownStart = Date.now();
      console.log(`Received ${signal}. Starting graceful shutdown...`);
      setShuttingDown(true);

      const forceExitTimer = setTimeout(() => {
        console.error(`Graceful shutdown did not complete within ${GRACEFUL_SHUTDOWN_TIMEOUT_MS}ms — forcing exit.`);
        process.exit(1);
      }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

      try {
        healthService.stopInternalHealthChecks();
        alertService.stopAlertService();

        // Stops accepting new connections; waits for in-flight requests to finish.
        await new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });

        await prisma.$disconnect();

        clearTimeout(forceExitTimer);
        console.log(`Graceful shutdown complete in ${Date.now() - shutdownStart}ms (signal: ${signal}). Exiting cleanly.`);
        process.exit(0);
      } catch (error) {
        clearTimeout(forceExitTimer);
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  };

  startServer();
}

module.exports = app;