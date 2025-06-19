
// src/components/layout/LocalChangesPreviewDialog.tsx
'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Loader2, Info, Save, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

interface LocalChangesPreviewDialogProps {
  isOpen: boolean;
  payloadPreview: string | null;
  onConfirm: () => Promise<void>; // Changed from () => Promise<boolean> as confirm often doesn't return value
  onCancel: () => void;
}

const LocalChangesPreviewDialog: React.FC<LocalChangesPreviewDialogProps> = ({
  isOpen,
  payloadPreview,
  onConfirm,
  onCancel,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirmClick = async () => {
    setIsConfirming(true);
    await onConfirm();
    setIsConfirming(false);
    // Dialog should be closed by useSyncManager setting isPreviewingLocalChanges to false
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-lg md:max-w-xl lg:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" /> Preview Local Changes
          </DialogTitle>
          <DialogDescription>
            You have local unsaved changes. Review the data below that will be sent to the server if you proceed with the sync.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-3 max-h-[60vh] flex flex-col">
          <p className="text-sm font-medium">Local Data Payload to be Sent:</p>
          <ScrollArea className="flex-grow rounded-md border bg-muted/30">
            <Textarea
              readOnly
              value={payloadPreview || "No payload data to display."}
              className="text-xs font-mono p-2 h-full min-h-[200px] resize-none"
            />
          </ScrollArea>
           <p className="text-xs text-muted-foreground text-center mt-2">
             Confirming will attempt to save these local changes to the cloud.
          </p>
        </div>
        <DialogFooter>
            <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
                 <XCircle className="mr-2 h-4 w-4" /> Cancel Sync
            </Button>
            <Button onClick={handleConfirmClick} disabled={isConfirming || !payloadPreview}>
              {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isConfirming ? 'Syncing...' : 'Proceed with Sync'}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocalChangesPreviewDialog;
