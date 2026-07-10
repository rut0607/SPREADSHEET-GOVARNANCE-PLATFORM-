import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/mobile.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Only register in production builds — in dev, the service worker's caching
// fights webpack-dev-server's hot reloading (a stale/cached response gets
// served for hot-update chunks, which then fail to parse as JS).
if ('serviceWorker' in navigator) {
  if (process.env.NODE_ENV === 'production') {
    // sw.js calls skipWaiting()+clients.claim() on every update, so a new worker
    // takes control almost immediately rather than sitting in a "waiting" state —
    // the reliable signal for "an update just happened" is controllerchange, not
    // the installing worker's statechange. Guard against firing this on the very
    // first-ever registration (no prior controller) by capturing whether a
    // controller already existed before this page load registered anything.
    const hadControllerAtLoad = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadControllerAtLoad) {
        window.dispatchEvent(new CustomEvent('app:update-available'));
      }
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          window.addEventListener('online', () => {
            registration.active?.postMessage({ type: 'FLUSH_QUEUE' });
          });
        })
        .catch((error) => {
          console.error('Service worker registration failed:', error);
        });
    });
  } else {
    // Self-heal dev environments that still have a service worker installed
    // from before this NODE_ENV guard existed — otherwise it keeps serving
    // stale cached content indefinitely and no code change here can reach it.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    if (window.caches) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
    }
  }
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
