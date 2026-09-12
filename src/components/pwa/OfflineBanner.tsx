// src/components/pwa/OfflineBanner.tsx
'use client';

import React from 'react';
import { useSyncManager } from '@/hooks/useSyncManager';
import { WifiOff, RefreshCw, CheckCircle, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function OfflineBanner() {
  const { isOffline, pendingOfflineCount, syncStatus, drainOfflineQueue } = useSyncManager();
  const [isDismissed, setIsDismissed] = React.useState(false);

  // If online and no pending mutations, hide banner
  if (!isOffline && pendingOfflineCount === 0) {
    return null;
  }

  if (isDismissed && isOffline) {
    // Show a minimal floating status badge when dismissed
    return (
      <div
        onClick={() => setIsDismissed(false)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/90 text-amber-950 dark:bg-amber-500 dark:text-black shadow-lg text-xs font-semibold cursor-pointer backdrop-blur-sm transition-transform hover:scale-105"
        role="status"
        aria-live="polite"
      >
        <WifiOff className="h-3.5 w-3.5" />
        <span>Offline</span>
        {pendingOfflineCount > 0 && (
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/20 font-mono">
            {pendingOfflineCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <aside
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-xl shadow-2xl rounded-2xl border border-amber-500/30 bg-card/95 backdrop-blur-md p-3.5 flex items-center justify-between gap-3 text-card-foreground animate-in fade-in slide-in-from-bottom-3 duration-300"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
          {isOffline ? <WifiOff className="h-4 w-4" /> : <Database className="h-4 w-4 text-primary" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-xs tracking-tight text-foreground">
              {isOffline ? 'Offline Mode' : 'Network Reconnected'}
            </span>
            {pendingOfflineCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                {pendingOfflineCount} change{pendingOfflineCount > 1 ? 's' : ''} queued
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {isOffline
              ? 'Changes are safely stored locally and will synchronize automatically once reconnected.'
              : 'Syncing local changes with Cloud Firestore...'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!isOffline && pendingOfflineCount > 0 && (
          <Button
            size="sm"
            onClick={() => drainOfflineQueue()}
            disabled={syncStatus === 'syncing'}
            className="h-7 px-2.5 text-xs font-semibold rounded-lg gap-1.5"
          >
            <RefreshCw className={`h-3 w-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            Sync Now
          </Button>
        )}
        <button
          onClick={() => setIsDismissed(true)}
          className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 rounded-md"
          aria-label="Dismiss offline banner"
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}

export default OfflineBanner;
