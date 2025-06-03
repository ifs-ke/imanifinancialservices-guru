
// src/app/(dashboard)/statements/NetWorthStatementSection.tsx
'use client';

import React, { useState, useEffect, ChangeEvent, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow, TableFooter as ShadTableFooter } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Scale, Landmark, PlusCircle, Coins, MinusCircle, Save } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from '@/lib/utils';
import { useDebtStore } from '@/store/debtStore';
import type { StatementItem, DebtItem, OtherLiabilityItem } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface NetWorthStatementSectionProps {
  isEditingAssetsLiabilities: boolean;
  onSaveEdits: () => void; 
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  setAssetItems: (items: StatementItem[]) => void;
  setOtherLiabilityItems: (items: OtherLiabilityItem[]) => void;
}

const generateId = (prefix: 'asset' | 'lia'): string => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const AccordionTriggerWithSum = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof AccordionTrigger> & { label: string; sum: number; itemCount: number; icon?: React.ElementType; className?: string }
>(({ label, sum, itemCount, icon: Icon, className, children, ...props }, ref) => (
    <AccordionTrigger ref={ref} {...props} className={`hover:no-underline py-3 px-4 data-[state=open]:border-b data-[state=closed]:border-b-0 ${className}`}>
      <div className="flex justify-between items-center w-full">
          <span className="flex items-center gap-2 text-base font-semibold">
            {Icon && <Icon className="h-4 w-4" />} {label}
          </span>
          <div className="flex items-center gap-2">
            {itemCount > 0 && <span className="text-xs text-muted-foreground">({itemCount} items)</span>}
            <span className="font-semibold font-mono text-base">{formatCurrency(sum)}</span>
          </div>
      </div>
    </AccordionTrigger>
));
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";


const NetWorthStatementSection: React.FC<NetWorthStatementSectionProps> = ({
  isEditingAssetsLiabilities,
  onSaveEdits,
  assetItems: initialAssetItems, 
  otherLiabilityItems: initialOtherLiabilityItems, 
  setAssetItems: persistAssetItems, 
  setOtherLiabilityItems: persistOtherLiabilityItems, 
}) => {
  const debts = useDebtStore(state => state.debts);
  const { toast } = useToast();

  const [editingAssets, setEditingAssets] = useState<StatementItem[]>(initialAssetItems);
  const [editingOtherLiabilities, setEditingOtherLiabilities] = useState<OtherLiabilityItem[]>(initialOtherLiabilityItems);
  const [itemToDelete, setItemToDelete] = useState<{ item: StatementItem | OtherLiabilityItem; type: 'asset' | 'otherLiability' } | null>(null);

  useEffect(() => {
    if (!isEditingAssetsLiabilities) {
      setEditingAssets([...initialAssetItems.map(item => ({ ...item }))]);
      setEditingOtherLiabilities([...initialOtherLiabilityItems.map(item => ({ ...item }))]);
    }
  }, [initialAssetItems, initialOtherLiabilityItems, isEditingAssetsLiabilities]);


  const handleInternalSave = () => {
    persistAssetItems(editingAssets);
    persistOtherLiabilityItems(editingOtherLiabilities);
    onSaveEdits(); 
    toast({ title: 'Net Worth Items Saved', description: 'Assets and Other Liabilities have been updated.' });
  };

  const handleItemChange = ( e: ChangeEvent<HTMLInputElement>, id: string, type: 'asset' | 'otherLiability', field: 'description' | 'amount' ) => {
    const value = field === 'amount' ? parseFloat(e.target.value) || 0 : e.target.value;
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;
    setState(prev => prev.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleAddItemClick = (type: 'asset' | 'otherLiability') => {
    const newItem: StatementItem | OtherLiabilityItem = { id: generateId(type), description: '', amount: 0 };
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;
    setState(prev => [...prev, newItem]);
  };

  const handleDeleteClick = (item: StatementItem | OtherLiabilityItem, type: 'asset' | 'otherLiability') => {
     setItemToDelete({ item, type });
  };

  const confirmDeleteItem = () => {
    if (!itemToDelete) return;
    const { item: itemToRemove, type } = itemToDelete;
    const setState = type === 'asset' ? setEditingAssets : setEditingOtherLiabilities;
    setState(prev => prev.filter(item => item.id !== itemToRemove.id));
    setItemToDelete(null);
    toast({ title: `${type === 'asset' ? 'Asset' : 'Liability'} Item Marked for Deletion`, description: 'Save changes to persist.' });
  };

  const renderEditableRow = (item: StatementItem | OtherLiabilityItem, type: 'asset' | 'otherLiability') => (
    <TableRow key={item.id} className="text-sm">
      <TableCell className="pl-2 py-1.5">
        {isEditingAssetsLiabilities ? (<Input type="text" value={item.description} onChange={(e) => handleItemChange(e, item.id, type, 'description')} placeholder="Description" className="h-8"/>) : (item.description)}
      </TableCell>
      <TableCell className="text-right font-mono py-1.5">
        {isEditingAssetsLiabilities ? (<Input type="number" step="0.01" value={item.amount.toString()} onChange={(e) => handleItemChange(e, item.id, type, 'amount')} placeholder="Amount" className="h-8 text-right w-32"/>) : (formatCurrency(item.amount))}
      </TableCell>
      {isEditingAssetsLiabilities && (
         <TableCell className="w-[50px] py-1.5 pr-2 text-right">
           <AlertDialog open={itemToDelete?.item.id === item.id} onOpenChange={(open) => !open && setItemToDelete(null)}>
             <AlertDialogTrigger asChild>
               <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-7 w-7" onClick={() => handleDeleteClick(item, type)}>
                 <Trash2 className="h-4 w-4" /><span className="sr-only">Delete Item</span>
               </Button>
             </AlertDialogTrigger>
             {itemToDelete?.item.id === item.id && (
                <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>Delete: <strong>{itemToDelete.item.description || '(No description)'} ({formatCurrency(itemToDelete.item.amount)})</strong>?</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteItem}>Delete</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
             )}
           </AlertDialog>
         </TableCell>
      )}
    </TableRow>
  );
  
  const renderDerivedDebtRow = (debt: DebtItem) => (
    <TableRow key={debt.id} className="text-sm">
        <TableCell className="pl-2 py-1.5">{debt.description}</TableCell>
        <TableCell className="text-right font-mono py-1.5">{formatCurrency(debt.principal)}</TableCell>
        {isEditingAssetsLiabilities && <TableCell></TableCell>}
    </TableRow>
  );

  const shortTermDebts = useMemo(() => debts.filter(debt => debt.term === 'short'), [debts]);
  const longTermDebts = useMemo(() => debts.filter(debt => debt.term === 'long'), [debts]);
  const totalShortTermDebt = useMemo(() => shortTermDebts.reduce((sum, item) => sum + item.principal, 0), [shortTermDebts]);
  const totalLongTermDebt = useMemo(() => longTermDebts.reduce((sum, item) => sum + item.principal, 0), [longTermDebts]);
  const totalAssets = useMemo(() => editingAssets.reduce((sum, item) => sum + item.amount, 0), [editingAssets]);
  const totalOtherLiabilitiesValue = useMemo(() => editingOtherLiabilities.reduce((sum, item) => sum + item.amount, 0), [editingOtherLiabilities]);
  const totalLiabilities = totalShortTermDebt + totalLongTermDebt + totalOtherLiabilitiesValue;
  const netWorth = totalAssets - totalLiabilities;

  return (
    <Card className="lg:col-span-1 shadow-md flex flex-col">
      <CardHeader className="p-6">
        <CardTitle className="flex items-center gap-2"><Scale className="text-primary h-5 w-5" />Net Worth Statement</CardTitle>
        <CardDescription>Assets vs. Liabilities {isEditingAssetsLiabilities ? '(Editing Mode)' : ''}</CardDescription>
         {isEditingAssetsLiabilities && (
            <div className="pt-2">
                <Button onClick={handleInternalSave} size="sm"><Save className="mr-2 h-4 w-4"/> Save Net Worth Items</Button>
            </div>
        )}
      </CardHeader>
       <CardContent className="p-6 pt-0 flex-grow">
         <Accordion type="multiple" className="w-full" defaultValue={[]}> {/* Default to collapsed */}
             <AccordionItem value="assets-accordion" className="border-b-0 mb-2 rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
                <AccordionTriggerWithSum label="Assets" sum={totalAssets} itemCount={editingAssets.length} icon={Landmark} className="text-primary hover:text-primary-foreground data-[state=open]:border-b data-[state=closed]:border-b-0" />
                <AccordionContent className="p-0">
                    <ScrollArea className="h-[200px] w-full">
                        <Table>
                            <TableBody>
                                {editingAssets.map(item => renderEditableRow(item, 'asset'))}
                                {editingAssets.length === 0 && !isEditingAssetsLiabilities && (
                                    <TableRow><TableCell colSpan={isEditingAssetsLiabilities ? 3: 2} className="h-24 text-center text-muted-foreground">No assets recorded.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                    {isEditingAssetsLiabilities && (<div className="text-center py-2 border-t border-dashed mt-1"><Button variant="ghost" size="sm" onClick={() => handleAddItemClick('asset')}><PlusCircle className="mr-2 h-4 w-4" /> Add Asset Item</Button></div>)}
                </AccordionContent>
             </AccordionItem>
             
             <AccordionItem value="liabilities-accordion" className="border-b-0 mb-2 rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
                <AccordionTriggerWithSum label="Liabilities" sum={totalLiabilities} itemCount={shortTermDebts.length + longTermDebts.length + editingOtherLiabilities.length} icon={Coins} className="text-destructive hover:text-destructive-foreground data-[state=open]:border-b data-[state=closed]:border-b-0" />
                <AccordionContent className="p-0">
                    <ScrollArea className="h-[250px] w-full">
                        <Accordion type="multiple" className="w-full pl-4 border-l ml-2" defaultValue={[]}> {/* Default nested to collapsed */}
                            <AccordionItem value="short-term-debts-accordion" className="border-b-0">
                                <AccordionTriggerWithSum label="Short-Term Debts" sum={totalShortTermDebt} itemCount={shortTermDebts.length} className="text-sm font-medium text-muted-foreground hover:no-underline py-2 data-[state=open]:border-b data-[state=closed]:border-b-0" />
                                <AccordionContent className="pb-0 pl-2">
                                    {shortTermDebts.length > 0 ? (<Table><TableBody>{shortTermDebts.map(debt => renderDerivedDebtRow(debt))}</TableBody></Table>) : (<p className="text-center text-muted-foreground py-2 text-xs">No short-term debts.</p>)}
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="long-term-debts-accordion" className="border-b-0">
                                <AccordionTriggerWithSum label="Long-Term Debts" sum={totalLongTermDebt} itemCount={longTermDebts.length} className="text-sm font-medium text-muted-foreground hover:no-underline py-2 data-[state=open]:border-b data-[state=closed]:border-b-0" />
                                <AccordionContent className="pb-0 pl-2">
                                    {longTermDebts.length > 0 ? (<Table><TableBody>{longTermDebts.map(debt => renderDerivedDebtRow(debt))}</TableBody></Table>) : (<p className="text-center text-muted-foreground py-2 text-xs">No long-term debts.</p>)}
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value="other-liabilities-accordion" className="border-b-0">
                                <AccordionTriggerWithSum label="Other Liabilities" sum={totalOtherLiabilitiesValue} itemCount={editingOtherLiabilities.length} className="text-sm font-medium text-muted-foreground hover:no-underline py-2 data-[state=open]:border-b data-[state=closed]:border-b-0" />
                                <AccordionContent className="pb-0 pl-2">
                                    <Table><TableBody>{editingOtherLiabilities.map(item => renderEditableRow(item, 'otherLiability'))}</TableBody></Table>
                                    {isEditingAssetsLiabilities && (<div className="text-center py-2 border-t border-dashed mt-1"><Button variant="ghost" size="sm" onClick={() => handleAddItemClick('otherLiability')}><MinusCircle className="mr-2 h-4 w-4" /> Add Other Liability</Button></div>)}
                                    {editingOtherLiabilities.length === 0 && !isEditingAssetsLiabilities && (<p className="text-center text-muted-foreground py-4 text-sm">No other liabilities.</p>)}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </ScrollArea>
                </AccordionContent>
             </AccordionItem>
        </Accordion>
        </CardContent>
        <CardFooter className="p-6 pt-4 border-t mt-auto">
            <div className="flex justify-between items-center text-lg font-bold w-full">
                <span>Net Worth</span>
                <span className={`font-mono ${netWorth >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatCurrency(netWorth)}</span>
            </div>
        </CardFooter>
    </Card>
  )
};

export default NetWorthStatementSection;
    