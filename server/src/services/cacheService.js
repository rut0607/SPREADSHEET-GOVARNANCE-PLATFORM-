const NodeCache = require('node-cache');

const cache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
  useClones: false
});

const get = (key) => cache.get(key);

const set = (key, value, ttl = 300) => cache.set(key, value, ttl);

const del = (key) => cache.del(key);

const flush = () => cache.flushAll();

const delPattern = (pattern) => {
  const keys = cache.keys();
  const matching = keys.filter(key => key.includes(pattern));
  matching.forEach(key => cache.del(key));
  return matching.length;
};

module.exports = { get, set, del, flush, delPattern };