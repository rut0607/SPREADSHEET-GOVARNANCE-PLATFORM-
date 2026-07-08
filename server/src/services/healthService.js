const prisma = require('../config/prisma');
const { supabaseAdmin } = require('../config/supabase');
const { notifyAdmins } = require('./pushService');

const MEMORY_WARNING_MB = 400;
const CACHE_TTL_MS = 30 * 1000;
const INTERNAL_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const CONSECUTIVE_FAILURES_FOR_ALERT = 3;

const serverStartTime = Date.now();
let cachedResult = null;
let cachedAt = 0;
let consecutiveDbFailures = 0;

const checkDatabase = async () => {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', response_time_ms: Date.now() - start };
  } catch (error) {
    return { status: 'down', response_time_ms: Date.now() - start, error: error.message };
  }
};

const checkStorage = async () => {
  const start = Date.now();
  try {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    const { error } = await supabaseAdmin.storage.from(bucket).list('', { limit: 1 });
    if (error) throw new Error(error.message);
    return { status: 'healthy', response_time_ms: Date.now() - start };
  } catch (error) {
    return { status: 'down', response_time_ms: Date.now() - start, error: error.message };
  }
};

const checkMemory = () => {
  const used = process.memoryUsage();
  const rssMb = Math.round(used.rss / 1024 / 1024);
  return {
    status: rssMb > MEMORY_WARNING_MB ? 'warning' : 'healthy',
    rss_mb: rssMb,
    heap_used_mb: Math.round(used.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(used.heapTotal / 1024 / 1024)
  };
};

const getUptime = () => Math.floor((Date.now() - serverStartTime) / 1000);

// Best-effort: if the database is genuinely down, the admin push-subscription
// lookup this depends on may itself fail — it's wrapped internally in
// pushService so that never throws, but it does mean this can silently no-op
// during a real outage. The console.error below is the reliable signal.
const alertAdminsDatabaseDown = async (failureCount) => {
  await notifyAdmins({
    title: 'Database Unreachable',
    body: `The database has failed ${failureCount} consecutive health checks.`
  });
};

const performHealthCheck = async () => {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  const memory = checkMemory();

  if (database.status === 'down') {
    consecutiveDbFailures += 1;
    if (consecutiveDbFailures >= CONSECUTIVE_FAILURES_FOR_ALERT) {
      console.error(`CRITICAL: Database unreachable for ${consecutiveDbFailures} consecutive health checks.`);
      alertAdminsDatabaseDown(consecutiveDbFailures).catch(() => {});
    }
  } else {
    consecutiveDbFailures = 0;
  }

  const isDegraded = storage.status === 'down' || memory.status === 'warning';

  const result = {
    status: database.status === 'down' ? 'down' : (isDegraded ? 'degraded' : 'healthy'),
    uptime_seconds: getUptime(),
    timestamp: new Date().toISOString(),
    services: { database, storage, memory }
  };

  cachedResult = result;
  cachedAt = Date.now();
  return result;
};

const checkHealth = async ({ force = false } = {}) => {
  if (!force && cachedResult && (Date.now() - cachedAt) < CACHE_TTL_MS) {
    return cachedResult;
  }
  return performHealthCheck();
};

const getLastHealthCheck = () => cachedResult;

let intervalHandle = null;
const startInternalHealthChecks = () => {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    checkHealth({ force: true }).catch((error) => console.error('Internal health check failed:', error.message));
  }, INTERNAL_CHECK_INTERVAL_MS);
  intervalHandle.unref?.();
};

const stopInternalHealthChecks = () => {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
};

module.exports = {
  checkHealth,
  getUptime,
  getLastHealthCheck,
  startInternalHealthChecks,
  stopInternalHealthChecks
};
