// src/components/layout/DataSyncMismatchDialog.tsx
'use client';

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, UploadCloud, DownloadCloud } from 'lucide-react';

interface DataSyncMismatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onForceSave: () => Promise<boolean>; // Function to force save local data
  onForceFetch: () => Promise<boolean>; // Function to force fetch server data
}

const DataSyncMismatchDialog: React.FC<DataSyncMismatchDialogProps> = ({
  isOpen,
  onClose,
  onForceSave,
  onForceFetch,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const handleForceSaveClick = async () => {
    setIsSaving(true);
    const success = await onForceSave();
    setIsSaving(false);
    if (success) onClose(); // Close dialog only if operation succeeded
  };

  const handleForceFetchClick = async () => {
    setIsFetching(true);
    const success = await onForceFetch();
    setIsFetching(false);
    if (success) onClose(); // Close dialog only if operation succeeded
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Data Sync Conflict
          </AlertDialogTitle>
          <AlertDialogDescription>
            The data saved locally in your browser doesn't match the data stored in the cloud. This can happen if changes were made on another device or if a previous sync failed.
            <br /><br />
            Please choose how to resolve this conflict:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-4">
          <p className="text-sm font-medium">Resolution Options:</p>
          <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={handleForceSaveClick} disabled={isSaving || isFetching} className="flex-1">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  {isSaving ? 'Saving Local...' : 'Keep Local & Overwrite Cloud'}
              </Button>
              <Button onClick={handleForceFetchClick} disabled={isSaving || isFetching} className="flex-1" variant="destructive">
                  {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
                   {isFetching ? 'Loading Server...' : 'Discard Local & Load Cloud'}
               </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
             Choosing 'Load Cloud' will discard any unsaved local changes made since the last successful sync.
          </p>
        </div>
        {/* No explicit Cancel/Action needed in footer, actions are buttons above */}
        <AlertDialogFooter>
            <AlertDialogCancel onClick={onClose} disabled={isSaving || isFetching}>Decide Later</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DataSyncMismatchDialog;

