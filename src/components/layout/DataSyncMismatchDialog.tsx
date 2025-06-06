// src/components/layout/DataSyncMismatchDialog.tsx
'use client';

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, UploadCloud, DownloadCloud, Eye, EyeOff } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '../ui/separator';

interface DataSyncMismatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onForceSave: () => Promise<boolean>;
  onForceFetch: () => Promise<boolean>;
  localDataPreview?: string | null;
  serverDataPreview?: string | null;
}

const DataSyncMismatchDialog: React.FC<DataSyncMismatchDialogProps> = ({
  isOpen,
  onClose,
  onForceSave,
  onForceFetch,
  localDataPreview,
  serverDataPreview,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [showDataDetails, setShowDataDetails] = useState(false);

  const handleForceSaveClick = async () => {
    setIsSaving(true);
    const success = await onForceSave();
    setIsSaving(false);
    if (success) onClose();
  };

  const handleForceFetchClick = async () => {
    setIsFetching(true);
    const success = await onForceFetch();
    setIsFetching(false);
    if (success) onClose();
  };

  const canShowDetails = !!localDataPreview || !!serverDataPreview;

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) setShowDataDetails(false); onClose();}}>
      <AlertDialogContent className="max-w-lg md:max-w-xl lg:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Data Sync Conflict
          </AlertDialogTitle>
          <AlertDialogDescription>
            The data saved locally in your browser doesn&apos;t match the data stored in the cloud. This can happen if changes were made on another device or if a previous sync failed.
            Please choose how to resolve this conflict.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-4">
          <p className="text-sm font-medium">Resolution Options:</p>
          <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="sm"
                onClick={handleForceSaveClick}
                disabled={isSaving || isFetching}
                className="flex-1 w-full sm:w-auto"
              >
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  {isSaving ? 'Saving Local...' : 'Keep Local & Overwrite Cloud'}
              </Button>
              <Button
                size="sm"
                onClick={handleForceFetchClick}
                disabled={isSaving || isFetching}
                className="flex-1 w-full sm:w-auto"
                variant="outline"
              >
                  {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
                   {isFetching ? 'Loading Cloud...' : 'Discard Local & Load Cloud'}
               </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
             Choosing &apos;Load Cloud&apos; will discard any unsaved local changes made since the last successful sync. Choosing &apos;Keep Local&apos; will overwrite the data currently in the cloud.
          </p>

          {canShowDetails && (
            <>
              <Separator className="my-3" />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDataDetails(!showDataDetails)}
                className="w-full"
              >
                {showDataDetails ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                {showDataDetails ? 'Hide Data Details' : 'View Data Details'}
              </Button>
            </>
          )}

          {showDataDetails && (
            <div className="mt-3 space-y-3 max-h-[40vh] overflow-y-auto">
              {localDataPreview && (
                <div>
                  <h4 className="text-xs font-semibold mb-1 text-muted-foreground">Local Data Snapshot (What client tried to save or current local state):</h4>
                  <ScrollArea className="h-32 w-full rounded-md border bg-muted/30">
                    <Textarea
                      readOnly
                      value={localDataPreview}
                      className="text-xs font-mono p-2 h-full"
                      rows={8}
                    />
                  </ScrollArea>
                </div>
              )}
              {serverDataPreview ? (
                <div>
                  <h4 className="text-xs font-semibold mb-1 text-muted-foreground">Server Data Snapshot (What server has or sent):</h4>
                   <ScrollArea className="h-32 w-full rounded-md border bg-muted/30">
                    <Textarea
                      readOnly
                      value={serverDataPreview}
                      className="text-xs font-mono p-2 h-full"
                      rows={8}
                    />
                  </ScrollArea>
                </div>
              ) : (
                 localDataPreview && ( // Only show this message if local preview IS available but server isn't
                    <p className="text-xs text-muted-foreground text-center p-2 border rounded-md">
                        Server data preview is not available for this type of conflict (e.g., a save conflict where the server doesn&apos;t return its full state).
                    </p>
                 )
              )}
              {!localDataPreview && !serverDataPreview && (
                <p className="text-xs text-muted-foreground text-center p-2 border rounded-md">
                    Detailed data preview not available for this conflict instance.
                </p>
              )}
            </div>
          )}
        </div>
        <AlertDialogFooter>
            <AlertDialogCancel onClick={onClose} disabled={isSaving || isFetching}>Decide Later</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DataSyncMismatchDialog;
