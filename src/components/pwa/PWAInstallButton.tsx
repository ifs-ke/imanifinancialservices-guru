// src/components/pwa/PWAInstallButton.tsx
'use client';

import React, { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Button } from '@/components/ui/button';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  collapsed?: boolean;
}

export function PWAInstallButton({
  className = '',
  variant = 'ghost',
  size = 'sm',
  collapsed = false,
}: PWAInstallButtonProps) {
  const { canInstall, isInstalled, isIOS, installApp } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled || !canInstall) {
    return null;
  }

  const handleClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else {
      await installApp();
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={className}
        title="Install IFS-Guru App"
        aria-label="Install App"
      >
        <Download className="h-4 w-4 shrink-0 text-primary" />
        {!collapsed && <span className="ml-2 truncate text-xs font-medium">Install App</span>}
      </Button>

      {/* iOS Safari Guided Install Dialog */}
      <Dialog open={showIOSModal} onOpenChange={setShowIOSModal}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Install IFS-Guru
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Add IFS-Guru to your iPhone or iPad home screen for an instant offline-first experience.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm text-foreground">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                <Share2 className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-xs text-foreground">1. Tap the Share button</p>
                <p className="text-xs text-muted-foreground">In Safari&apos;s bottom toolbar, tap the Share icon (box with upward arrow).</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border/50">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                <PlusSquare className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-xs text-foreground">2. Select &ldquo;Add to Home Screen&rdquo;</p>
                <p className="text-xs text-muted-foreground">Scroll down through the share sheet options and select Add to Home Screen.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button size="sm" variant="outline" onClick={() => setShowIOSModal(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PWAInstallButton;
