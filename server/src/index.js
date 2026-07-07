const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const compression = require('compression');
const morgan = require('morgan');
const helmet = require('helmet');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { sanitizeInput } = require('./middleware/sanitize');
const requestLogger = require('./middleware/requestLogger');

dotenv.config();

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

app.use(helmet());
app.use(compression());
app.use(morgan('dev'));
app.use(requestLogger);
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use('/api', generalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);

app.get('/api/health', (req, res) => {
  if (req.headers['x-api-key'] !== healthCheckApiKey) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  res.json({
    success: true,
    message: 'Spreadsheet Governance Platform API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
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

// Only bind the port and start background jobs when run directly (`node src/index.js`),
// not when this module is `require()`d by tests via supertest.
if (require.main === module) {
  const { startScheduledSync } = require('./services/syncService');
  startScheduledSync();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });
}

module.exports = app;