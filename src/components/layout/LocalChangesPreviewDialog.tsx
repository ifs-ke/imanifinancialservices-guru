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
import { Alert, AlertDescription as UIAlertDescription } from "@/components/ui/alert";
import type { SaveDataPayload } from '@/lib/schemas';

interface LocalChangesPreviewDialogProps {
  isOpen: boolean;
  payloadPreview: string | null;
  onConfirm: (modifiedPayloadObject?: Record<string, any>) => Promise<void>;
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
        const parsed = JSON.parse(payloadPreview);
        setEditablePayloadString(JSON.stringify(parsed, null, 2));
      } catch (e) {
        setEditablePayloadString(payloadPreview);
      }
      setParseError(null);
    }
  }, [isOpen, payloadPreview]);

  const handleConfirmClick = async () => {
    setIsConfirming(true);
    setParseError(null);
    try {
      const modifiedPayloadObject = JSON.parse(editablePayloadString);
      await onConfirm(modifiedPayloadObject as SaveDataPayload);
    } catch (e: any) {
      setParseError(`Invalid JSON: ${e.message}. Please correct it or reset.`);
    } finally {
      setIsConfirming(false);
    }
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
            <Info className="h-5 w-5 text-primary" /> Preview Changes to Sync
          </DialogTitle>
          <DialogDescription>
            The following data represents the changes (created, updated, deleted) that will be sent to the server. You can review or modify this data before syncing.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <UIAlertDescription>
            <strong>Warning:</strong> Editing raw JSON is an advanced feature. Ensure your changes maintain the correct data structure and types to avoid errors. Invalid JSON will prevent saving.
          </UIAlertDescription>
        </Alert>

        <div className="py-4 space-y-3 max-h-[60vh] flex flex-col">
          <p className="text-sm font-medium">Local Data Changes (Editable JSON):</p>
          <ScrollArea className="flex-grow rounded-md border bg-background">
            <Textarea
              value={editablePayloadString}
              onChange={(e) => {
                setEditablePayloadString(e.target.value);
                setParseError(null);
              }}
              className="text-xs font-mono p-2 h-full min-h-[250px] resize-none"
              placeholder="JSON payload of changes..."
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
            <div className="flex-grow"></div>
            <Button variant="ghost" onClick={onCancel} disabled={isConfirming}>
                 <XCircle className="mr-2 h-4 w-4" /> Cancel Sync
            </Button>
            <Button onClick={handleConfirmClick} disabled={isConfirming || !editablePayloadString.trim() || !!parseError}>
              {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isConfirming ? 'Syncing...' : 'Confirm & Sync Changes'}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocalChangesPreviewDialog;
