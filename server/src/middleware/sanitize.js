const xss = require('xss');

const SKIP_FIELDS = new Set(['password', 'new_password', 'confirm_password', 'token', 'refresh_token']);

const sanitizeValue = (key, value) => {
  if (typeof value === 'string') {
    return SKIP_FIELDS.has(key) ? value : xss(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item));
  }
  if (value && typeof value === 'object') {
    return sanitizeObject(value);
  }
  return value;
};

const sanitizeObject = (obj) => {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeValue(key, value);
  }
  return result;
};

const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    Object.assign(req.query, sanitizeObject(req.query));
  }
  if (req.params && typeof req.params === 'object') {
    Object.assign(req.params, sanitizeObject(req.params));
  }
  next();
};

module.exports = { sanitizeInput };
