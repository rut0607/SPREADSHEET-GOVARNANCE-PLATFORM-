import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

const DISMISSED_KEY = 'installPromptDismissed';

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      if (sessionStorage.getItem(DISMISSED_KEY)) return;
      setDeferredPrompt(event);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (!visible || !isMobile) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="bg-primary-600 text-white rounded-2xl shadow-lg p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center bg-accent-gradient font-bold">
          AC
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install Alambre Cables app for the best experience</p>
        </div>
        <button
          onClick={handleInstall}
          className="flex-shrink-0 bg-white text-primary-700 text-sm font-semibold px-3 py-2 rounded-lg"
          style={{ minHeight: 40 }}
        >
          Install
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 p-2 text-white/80 hover:text-white"
          style={{ minHeight: 40, minWidth: 40 }}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
