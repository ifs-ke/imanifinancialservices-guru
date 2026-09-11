// src/components/statements/StatementItemFormPopover.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useStatementStore } from '@/store/statementStore';
import type { StatementItem, OtherLiabilityItem } from '@/lib/types';
import { PlusCircle, Edit2, CheckCircle2 } from 'lucide-react';

interface StatementItemFormPopoverProps {
  type: 'asset' | 'otherLiability';
  item?: StatementItem | OtherLiabilityItem | null;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

export default function StatementItemFormPopover({ type, item, onSuccess, trigger }: StatementItemFormPopoverProps) {
  const { addAssetItem, addOtherLiabilityItem, updateAssetItem, updateOtherLiabilityItem } = useStatementStore();
  const { toast } = useToast();
  
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');

  useEffect(() => {
    if (item) {
      setDescription(item.description || '');
      setAmount(item.amount || 0);
    } else {
      setDescription('');
      setAmount('');
    }
  }, [item, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a description.",
        variant: "destructive"
      });
      return;
    }

    const itemAmount = amount === '' ? 0 : Number(amount);

    if (item) {
      // Edit Mode
      if (type === 'asset') {
        updateAssetItem({ id: item.id, description, amount: itemAmount });
      } else {
        updateOtherLiabilityItem({ id: item.id, description, amount: itemAmount });
      }
      toast({
        title: "Item Updated",
        description: `Successfully updated "${description}" to ${itemAmount}.`
      });
    } else {
      // Add Mode
      if (type === 'asset') {
        addAssetItem({ description, amount: itemAmount });
      } else {
        addOtherLiabilityItem({ description, amount: itemAmount });
      }
      toast({
        title: "Item Added",
        description: `Successfully added "${description}".`
      });
    }

    setIsOpen(false);
    if (onSuccess) onSuccess();
  };

  const formFields = (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <h4 className="font-bold text-xs text-foreground tracking-tight">
          {item ? `Edit ${type === 'asset' ? 'Asset' : 'Liability'}` : `Add ${type === 'asset' ? 'Asset' : 'Liability'}`}
        </h4>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {item ? 'Modify the description or valuation amount.' : 'Add a new record to your statement.'}
        </p>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold text-muted-foreground">Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === 'asset' ? "e.g. Cooperative Bank Shares" : "e.g. Sacco Loan Remaining"}
            className="h-8 text-xs px-2.5 rounded-lg"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] font-semibold text-muted-foreground">Valuation Amount (KES)</Label>
          <Input
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
            placeholder="0.00"
            className="h-8 text-xs px-2.5 rounded-lg font-mono"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setIsOpen(false)}
          className="h-8 text-xs px-3 rounded-lg"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="xs"
          className="h-8 text-xs px-3 rounded-lg"
        >
          Save
        </Button>
      </div>
    </form>
  );

  // If we are editing, we prefer using a centered Dialog Modal to avoid viewport truncation
  if (item) {
    return (
      <>
        <div onClick={() => setIsOpen(true)} className="cursor-pointer">
          {trigger || (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground">
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="w-[90%] sm:max-w-[340px] p-4 rounded-xl border border-border/60 bg-background shadow-lg z-50">
            <DialogTitle className="sr-only">Edit Statement Item</DialogTitle>
            {formFields}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Adding uses a sleek inline Popover
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-8 text-xs px-3 rounded-lg flex items-center gap-1.5 border-dashed">
            <PlusCircle className="h-3.5 w-3.5" /> Add Item
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[280px] p-3 shadow-lg border border-border/60 bg-popover rounded-xl z-50">
        {formFields}
      </PopoverContent>
    </Popover>
  );
}
