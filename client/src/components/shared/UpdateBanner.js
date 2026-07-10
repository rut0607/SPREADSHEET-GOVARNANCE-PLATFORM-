import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

// Shown when index.js detects (via the 'app:update-available' custom event)
// that a new service worker has taken control — the page keeps running its
// old in-memory JS bundle until reloaded, even though the SW has already
// switched caches, so this prompts the user to do that explicitly.
const UpdateBanner = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setUpdateAvailable(true);
    window.addEventListener('app:update-available', handleUpdate);
    return () => window.removeEventListener('app:update-available', handleUpdate);
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-primary-600 text-white text-sm font-medium py-2 px-4 flex items-center justify-center gap-3">
      <span>A new version of the app is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-3 py-1 rounded-md transition-colors font-semibold flex-shrink-0"
      >
        <RefreshCw size={14} />
        Refresh to update
      </button>
    </div>
  );
};

export default UpdateBanner;
