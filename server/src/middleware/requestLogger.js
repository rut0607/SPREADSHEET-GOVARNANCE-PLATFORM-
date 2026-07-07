const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'access.log');

const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const entry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      response_time_ms: Date.now() - startTime,
      user_id: req.user?.id || null,
      ip: req.ip
    };

    if (process.env.NODE_ENV === 'production') {
      try {
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, (err) => {
          if (err) console.error('Failed to write access log:', err.message);
        });
      } catch (error) {
        console.error('Failed to write access log:', error.message);
      }
    } else {
      console.log(
        `[${entry.timestamp}] ${entry.method} ${entry.path} ${entry.status} ${entry.response_time_ms}ms user=${entry.user_id || 'anon'} ip=${entry.ip}`
      );
    }
  });

  next();
};

module.exports = requestLogger;
