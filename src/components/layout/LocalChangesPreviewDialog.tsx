
// src/components/layout/LocalChangesPreviewDialog.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Loader2, Info, Save, XCircle, AlertTriangle, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription as UIAlertDescription } from "@/components/ui/alert"; // Renamed AlertDescription to avoid conflict
import type { SaveDataPayload } from '@/lib/schemas'; // For type casting

interface LocalChangesPreviewDialogProps {
  isOpen: boolean;
  payloadPreview: string | null; // Initial stringified payload
  onConfirm: (modifiedPayloadObject?: Record<string, any>) => Promise<void>; // Callback receives parsed object
  onCancel: () => void;
}

const LocalChangesPreviewDialog: React.FC<LocalChangesPreviewDialogProps> = ({
  isOpen,
  payloadPreview,
  onConfirm,
  onCancel,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [editablePayloadString, setEditablePayloadString] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && payloadPreview) {
      try {
        // Format the initial payload for better readability
        const parsed = JSON.parse(payloadPreview);
        setEditablePayloadString(JSON.stringify(parsed, null, 2));
      } catch (e) {
        setEditablePayloadString(payloadPreview); // Fallback to raw string if initial parse fails
      }
      setParseError(null); // Clear previous errors
    }
  }, [isOpen, payloadPreview]);

  const handleConfirmClick = async () => {
    setIsConfirming(true);
    setParseError(null);
    try {
      const modifiedPayloadObject = JSON.parse(editablePayloadString);
      // Type assertion for clarity, assuming SaveDataPayload is the expected structure
      await onConfirm(modifiedPayloadObject as SaveDataPayload);
      // Dialog closure will be handled by useSyncManager setting isPreviewingLocalChanges to false
    } catch (e: any) {
      setParseError(`Invalid JSON: ${e.message}. Please correct it or reset.`);
      setIsConfirming(false);
    }
    // Do not call setIsConfirming(false) here if onConfirm handles dialog closure,
    // but if onConfirm might fail and keep dialog open, then set it false in a finally block or on error.
    // For now, assuming onConfirm leads to dialog close by parent state change.
  };

  const handleReset = () => {
    if (payloadPreview) {
       try {
        const parsed = JSON.parse(payloadPreview);
        setEditablePayloadString(JSON.stringify(parsed, null, 2));
      } catch (e) {
        setEditablePayloadString(payloadPreview);
      }
    } else {
      setEditablePayloadString('');
    }
    setParseError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isConfirming) onCancel(); }}>
      <DialogContent className="max-w-2xl lg:max-w-3xl xl:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" /> Preview & Modify Local Changes
          </DialogTitle>
          <DialogDescription>
            Review the local data payload below. You can make direct modifications to the JSON.
            This action will attempt to save these (potentially modified) local changes to the cloud.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <UIAlertDescription>
            <strong>Warning:</strong> Editing raw JSON is powerful but risky. Ensure your changes maintain the correct data structure and types to avoid errors. Invalid JSON will prevent saving.
          </UIAlertDescription>
        </Alert>

        <div className="py-4 space-y-3 max-h-[60vh] flex flex-col">
          <p className="text-sm font-medium">Local Data Payload (Editable JSON):</p>
          <ScrollArea className="flex-grow rounded-md border bg-background">
            <Textarea
              value={editablePayloadString}
              onChange={(e) => {
                setEditablePayloadString(e.target.value);
                setParseError(null); // Clear parse error on edit
              }}
              className="text-xs font-mono p-2 h-full min-h-[250px] resize-none"
              placeholder="JSON payload data..."
            />
          </ScrollArea>
          {parseError && (
            <p className="text-xs text-destructive mt-1">{parseError}</p>
          )}
        </div>

        <DialogFooter className="mt-2">
            <Button variant="outline" onClick={handleReset} disabled={isConfirming}>
                 <RotateCcw className="mr-2 h-4 w-4" /> Reset to Original
            </Button>
            <div className="flex-grow"></div> {/* Spacer */}
            <Button variant="ghost" onClick={onCancel} disabled={isConfirming}>
                 <XCircle className="mr-2 h-4 w-4" /> Cancel Sync
            </Button>
            <Button onClick={handleConfirmClick} disabled={isConfirming || !editablePayloadString.trim() || !!parseError}>
              {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isConfirming ? 'Syncing...' : 'Confirm & Proceed with Sync'}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocalChangesPreviewDialog;
