const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const CONNECT_TIMEOUT_MS = 10000;
const MAX_CONNECT_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectWithTimeout = () => Promise.race([
  prisma.$connect(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Database connection timed out after ${CONNECT_TIMEOUT_MS}ms`)), CONNECT_TIMEOUT_MS)
  )
]);

// Eagerly connects with retry + exponential backoff. Intended to be awaited
// once at server startup (see index.js) so the process never starts serving
// requests against a database it can't actually reach.
const connectWithRetry = async (attempt = 1) => {
  try {
    await connectWithTimeout();
    if (attempt > 1) console.log(`Database connected successfully on attempt ${attempt}/${MAX_CONNECT_ATTEMPTS}`);
    return true;
  } catch (error) {
    console.error(`Database connection attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed: ${error.message}`);

    if (attempt >= MAX_CONNECT_ATTEMPTS) {
      throw new Error(`Unable to connect to the database after ${MAX_CONNECT_ATTEMPTS} attempts: ${error.message}`);
    }

    const backoffMs = INITIAL_BACKOFF_MS * (2 ** (attempt - 1));
    console.log(`Retrying database connection in ${backoffMs}ms...`);
    await delay(backoffMs);
    return connectWithRetry(attempt + 1);
  }
};

prisma.connectWithRetry = connectWithRetry;

module.exports = prisma;
