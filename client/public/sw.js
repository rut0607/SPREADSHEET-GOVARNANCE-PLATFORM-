/* eslint-disable no-restricted-globals */

// CRA fingerprints JS/CSS bundle filenames at build time, so they can't be listed
// here by name. Instead the app shell (HTML/manifest/offline page/icon) is
// precached on install, and the hashed bundles get picked up by the runtime
// cache-first handler below the first time they're requested.
const STATIC_CACHE = 'alambre-static-v1';
const API_CACHE = 'alambre-api-v1';
const OFFLINE_URL = '/offline.html';
const QUEUE_DB_NAME = 'alambre-offline-queue';
const QUEUE_STORE = 'requests';
const SYNC_TAG = 'sync-production-entries';

const APP_SHELL = ['/', '/index.html', '/manifest.json', '/offline.html', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

const openQueueDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(QUEUE_DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(QUEUE_STORE)) {
      request.result.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const queueRequest = async (entry) => {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getQueuedRequests = async () => {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const request = tx.objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const deleteQueuedRequest = async (id) => {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const replayQueue = async () => {
  const queued = await getQueuedRequests();
  for (const item of queued) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body
      });
      if (response.ok) {
        await deleteQueuedRequest(item.id);
      }
    } catch (error) {
      // Still offline or the request failed again — leave it queued for the next attempt.
    }
  }
};

const isProductionEntryPost = (request) =>
  request.method === 'POST' && new URL(request.url).pathname.endsWith('/api/production/entry');

const isApiRequest = (request) => new URL(request.url).pathname.includes('/api/');

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method === 'GET' && request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  if (isProductionEntryPost(request)) {
    event.respondWith(
      (async () => {
        const clonedForQueue = request.clone();
        try {
          return await fetch(request);
        } catch (error) {
          const body = await clonedForQueue.text();
          const headers = {};
          clonedForQueue.headers.forEach((value, key) => { headers[key] = value; });

          await queueRequest({ url: request.url, method: request.method, headers, body });

          if ('sync' in self.registration) {
            try { await self.registration.sync.register(SYNC_TAG); } catch (syncError) { /* best effort */ }
          }

          return new Response(
            JSON.stringify({ success: false, queued: true, message: 'Saved offline. Will submit when connection is restored.' }),
            { status: 202, headers: { 'Content-Type': 'application/json' } }
          );
        }
      })()
    );
    return;
  }

  if (isApiRequest(request) && request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (isApiRequest(request)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          if (response.ok) {
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }).catch(() => cached);
      })
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueue());
  }
});

// Fallback for browsers without Background Sync (e.g. iOS Safari): the page
// posts this message on its 'online' event so the queue still gets flushed.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'FLUSH_QUEUE') {
    event.waitUntil ? event.waitUntil(replayQueue()) : replayQueue();
  }
});
