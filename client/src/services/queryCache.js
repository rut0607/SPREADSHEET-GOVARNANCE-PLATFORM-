const memCache = {};
const TTL = {};

const get = (key) => {
  if (!memCache[key]) return null;
  if (TTL[key] && Date.now() > TTL[key]) {
    delete memCache[key];
    delete TTL[key];
    return null;
  }
  return memCache[key];
};

const set = (key, value, ttlSeconds = 60) => {
  memCache[key] = value;
  TTL[key] = Date.now() + ttlSeconds * 1000;
};

const del = (key) => {
  delete memCache[key];
  delete TTL[key];
};

const clear = () => {
  Object.keys(memCache).forEach(k => delete memCache[k]);
  Object.keys(TTL).forEach(k => delete TTL[k]);
};

export default { get, set, del, clear };