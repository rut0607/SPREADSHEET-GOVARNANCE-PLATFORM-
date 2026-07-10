#!/usr/bin/env node

/**
 * Simple end-to-end smoke test for the Spreadsheet Governance Platform API.
 *
 * Usage:
 *   node scripts/e2e-test.js
 *
 * Environment variables:
 *   API_BASE_URL         Base URL of the running API (default: http://localhost:8000/api)
 *   HEALTH_CHECK_API_KEY  Same value as the server's HEALTH_CHECK_API_KEY env var — sent
 *                          as the x-api-key header for the health check. GET /api/health
 *                          requires either this header or an authenticated admin session
 *                          (see server/src/index.js), so without it the health check will
 *                          correctly report 401, not "healthy".
 *   E2E_ADMIN_EMAIL       Admin email used to log in for the authenticated checks
 *   E2E_ADMIN_PASSWORD    Admin password used to log in for the authenticated checks
 *
 * Each of HEALTH_CHECK_API_KEY and E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD is
 * independently optional — whichever aren't set have their checks reported as
 * SKIP (not FAIL), so this script still exits 0 in environments that only
 * have some of these credentials available.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api';
const HEALTH_CHECK_API_KEY = process.env.HEALTH_CHECK_API_KEY;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

const results = [];

const record = (name, status, detail) => {
  results.push({ name, status, detail });
  const label = status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : status === 'FAIL' ? '\x1b[31mFAIL\x1b[0m' : '\x1b[33mSKIP\x1b[0m';
  console.log(`[${label}] ${name}${detail ? ` - ${detail}` : ''}`);
};

const request = async (path, options = {}) => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response, leave body null
  }
  return { status: res.status, body };
};

const run = async () => {
  console.log(`Running E2E smoke tests against ${API_BASE_URL}\n`);

  // 1. Health endpoint — requires either x-api-key or an authenticated admin
  // session (see server/src/index.js), so this is skipped rather than failed
  // when no key is provided, same as the login-dependent checks below.
  if (!HEALTH_CHECK_API_KEY) {
    record('Health endpoint responds', 'SKIP', 'HEALTH_CHECK_API_KEY not set');
  } else {
    try {
      const { status, body } = await request('/health', { headers: { 'x-api-key': HEALTH_CHECK_API_KEY } });
      if (status === 200 && body?.success === true) {
        record('Health endpoint responds', 'PASS');
      } else {
        record('Health endpoint responds', 'FAIL', `status=${status}, body=${JSON.stringify(body)}`);
      }
    } catch (error) {
      record('Health endpoint responds', 'FAIL', error.message);
    }
  }

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    record('Login with admin credentials', 'SKIP', 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
    record('Roles endpoint returns data after login', 'SKIP', 'requires login');
    record('Spreadsheets endpoint returns data after login', 'SKIP', 'requires login');
    printSummary();
    return;
  }

  // 2. Login
  let token = null;
  try {
    const { status, body } = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    if (status === 200 && body?.success === true && body?.data?.token) {
      token = body.data.token;
      record('Login with admin credentials', 'PASS');
    } else {
      record('Login with admin credentials', 'FAIL', `status=${status}, body=${JSON.stringify(body)}`);
    }
  } catch (error) {
    record('Login with admin credentials', 'FAIL', error.message);
  }

  if (!token) {
    record('Roles endpoint returns data after login', 'SKIP', 'login did not succeed');
    record('Spreadsheets endpoint returns data after login', 'SKIP', 'login did not succeed');
    printSummary();
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 3. Roles endpoint
  try {
    const { status, body } = await request('/roles', { headers: authHeaders });
    if (status === 200 && body?.success === true && Array.isArray(body?.data?.roles)) {
      record('Roles endpoint returns data after login', 'PASS', `${body.data.roles.length} role(s)`);
    } else {
      record('Roles endpoint returns data after login', 'FAIL', `status=${status}, body=${JSON.stringify(body)}`);
    }
  } catch (error) {
    record('Roles endpoint returns data after login', 'FAIL', error.message);
  }

  // 4. Spreadsheets endpoint
  try {
    const { status, body } = await request('/spreadsheets', { headers: authHeaders });
    if (status === 200 && body?.success === true && Array.isArray(body?.data?.sources)) {
      record('Spreadsheets endpoint returns data after login', 'PASS', `${body.data.sources.length} source(s)`);
    } else {
      record('Spreadsheets endpoint returns data after login', 'FAIL', `status=${status}, body=${JSON.stringify(body)}`);
    }
  } catch (error) {
    record('Spreadsheets endpoint returns data after login', 'FAIL', error.message);
  }

  printSummary();
};

function printSummary() {
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log('\n--- Summary ---');
  console.log(`Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}`);

  if (failed > 0) {
    console.log('\nRESULT: FAIL');
    process.exit(1);
  } else {
    console.log('\nRESULT: PASS');
    process.exit(0);
  }
}

run().catch((error) => {
  console.error('E2E test script crashed:', error);
  process.exit(1);
});
