// src/app/(dashboard)/statements/NetWorthStatementSection.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Scale, Landmark, PlusCircle, Coins, MinusCircle, Edit2 } from 'lucide-react';
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
import { formatCurrency, cn } from '@/lib/utils';
import { useDebtStore } from '@/store/debtStore';
import { useStatementStore } from '@/store/statementStore';
import type { StatementItem, DebtItem, OtherLiabilityItem } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import StatementItemFormPopover from '@/components/statements/StatementItemFormPopover';

interface NetWorthStatementSectionProps {
  isEditingAssetsLiabilities: boolean;
  onSaveEdits: () => void;
  assetItems: StatementItem[];
  otherLiabilityItems: OtherLiabilityItem[];
  setAssetItems: (items: StatementItem[]) => void;
  setOtherLiabilityItems: (items: OtherLiabilityItem[]) => void;
}

const AccordionTriggerWithSum = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof AccordionTrigger> & { label: string; sum: number; itemCount: number; icon?: React.ElementType; className?: string }
>(({ label, sum, itemCount, icon: Icon, className, children, ...props }, ref) => (
  <AccordionTrigger ref={ref} {...props} className={cn('hover:no-underline py-3 px-4 data-[state=open]:border-b data-[state=closed]:border-b-0', className)}>
    <div className="flex justify-between items-center w-full">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />} {label}
      </span>
      <div className="flex items-center gap-2 pr-2">
        {itemCount > 0 && <span className="text-[10px] text-muted-foreground bg-muted-foreground/10 px-1.5 py-0.5 rounded-full font-medium">({itemCount})</span>}
        <span className="font-semibold font-mono text-sm">{formatCurrency(sum)}</span>
      </div>
    </div>
  </AccordionTrigger>
));
AccordionTriggerWithSum.displayName = "AccordionTriggerWithSum";

const NetWorthStatementSection: React.FC<NetWorthStatementSectionProps> = ({
  isEditingAssetsLiabilities,
  onSaveEdits,
}) => {
  const { assetItems, otherLiabilityItems, deleteAssetItem, deleteOtherLiabilityItem } = useStatementStore();
  const debts = useDebtStore(state => state.debts);
  const { toast } = useToast();

  const handleDeleteItem = (id: string, type: 'asset' | 'otherLiability', description: string) => {
    if (type === 'asset') {
      deleteAssetItem(id);
    } else {
      deleteOtherLiabilityItem(id);
    }
    toast({
      title: "Item Deleted",
      description: `Successfully deleted "${description || 'unnamed item'}" from statements.`,
    });
  };

  const renderItemRow = (item: StatementItem | OtherLiabilityItem, type: 'asset' | 'otherLiability') => (
    <TableRow key={item.id} className="hover:bg-muted/10 border-b border-border/30">
      <TableCell className="pl-4 py-2 font-medium text-xs text-foreground max-w-[200px] truncate">
        {item.description || <span className="text-muted-foreground/70 italic">Untitled Item</span>}
      </TableCell>
      <TableCell className="text-right font-mono text-xs py-2 pr-4 font-semibold">
        {formatCurrency(item.amount)}
      </TableCell>
      {isEditingAssetsLiabilities && (
        <TableCell className="w-[100px] py-1 text-right pr-4 shrink-0">
          <div className="flex items-center justify-end gap-1.5">
            <StatementItemFormPopover
              type={type}
              item={item}
              trigger={
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              }
            />

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-[90%] max-w-[380px] p-4 rounded-xl border border-border/60 bg-background">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-sm font-bold">Delete Statement Item?</AlertDialogTitle>
                  <AlertDialogDescription className="text-xs">
                    Are you sure you want to remove <strong>{item.description || 'this item'}</strong> valued at <strong>{formatCurrency(item.amount)}</strong>? This action is permanent.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex items-center justify-end gap-2 mt-4 pt-2 border-t border-border/40">
                  <AlertDialogCancel className="h-8 text-xs rounded-lg mt-0">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDeleteItem(item.id, type, item.description)} className="h-8 text-xs rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </TableCell>
      )}
    </TableRow>
  );

  const renderDerivedDebtRow = (debt: DebtItem) => (
    <TableRow key={debt.id} className="hover:bg-muted/10 border-b border-border/30">
      <TableCell className="pl-4 py-2 font-medium text-xs text-foreground max-w-[200px] truncate">{debt.description}</TableCell>
      <TableCell className="text-right font-mono text-xs py-2 pr-4 font-semibold">{formatCurrency(debt.principal)}</TableCell>
      {isEditingAssetsLiabilities && <TableCell className="w-[100px]"></TableCell>}
    </TableRow>
  );

  const shortTermDebts = useMemo(() => debts.filter(debt => debt.term === 'short'), [debts]);
  const longTermDebts = useMemo(() => debts.filter(debt => debt.term === 'long'), [debts]);
  const totalShortTermDebt = useMemo(() => shortTermDebts.reduce((sum, item) => sum + item.principal, 0), [shortTermDebts]);
  const totalLongTermDebt = useMemo(() => longTermDebts.reduce((sum, item) => sum + item.principal, 0), [longTermDebts]);
  const totalAssets = useMemo(() => assetItems.reduce((sum, item) => sum + item.amount, 0), [assetItems]);
  const totalOtherLiabilitiesValue = useMemo(() => otherLiabilityItems.reduce((sum, item) => sum + item.amount, 0), [otherLiabilityItems]);
  const totalLiabilities = totalShortTermDebt + totalLongTermDebt + totalOtherLiabilitiesValue;
  const netWorth = totalAssets - totalLiabilities;

  return (
    <Card className="shadow-md border border-border/60 overflow-hidden bg-card rounded-2xl flex flex-col min-h-[500px]">
      <CardHeader className="bg-muted/30 border-b border-border/40 py-5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Scale className="h-4.5 w-4.5 text-primary" /> Net Worth Statement
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
              Live snapshot comparing aggregate capital assets against combined long/short-term liabilities.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-5 flex-grow">
        <Accordion type="multiple" className="w-full space-y-3" defaultValue={['assets-accordion', 'liabilities-accordion']}>
          {/* ASSETS ACCORDION SECTION */}
          <AccordionItem value="assets-accordion" className="border border-border/50 bg-muted/10 rounded-xl overflow-hidden shadow-sm">
            <AccordionTriggerWithSum 
              label="Capital Assets" 
              sum={totalAssets} 
              itemCount={assetItems.length} 
              icon={Landmark} 
              className="hover:bg-muted/20 text-foreground transition" 
            />
            <AccordionContent className="p-0 bg-background">
              <ScrollArea className="max-h-[180px] w-full">
                <Table>
                  <TableBody>
                    {assetItems.map(item => renderItemRow(item, 'asset'))}
                    {assetItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={isEditingAssetsLiabilities ? 3 : 2} className="h-20 text-center text-xs text-muted-foreground">
                          No asset items recorded. Add items under Edit Mode.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
              {isEditingAssetsLiabilities && (
                <div className="flex items-center justify-center py-2.5 bg-muted/10 border-t border-dashed border-border/50">
                  <StatementItemFormPopover 
                    type="asset" 
                    trigger={
                      <Button variant="ghost" size="xs" className="h-7 text-xs font-semibold px-2.5 rounded-lg text-primary hover:text-primary hover:bg-primary/5 flex items-center gap-1.5">
                        <PlusCircle className="h-3.5 w-3.5" /> Add Asset Position
                      </Button>
                    }
                  />
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* LIABILITIES ACCORDION SECTION */}
          <AccordionItem value="liabilities-accordion" className="border border-border/50 bg-muted/10 rounded-xl overflow-hidden shadow-sm">
            <AccordionTriggerWithSum 
              label="Combined Liabilities" 
              sum={totalLiabilities} 
              itemCount={shortTermDebts.length + longTermDebts.length + otherLiabilityItems.length} 
              icon={Coins} 
              className="hover:bg-muted/20 text-foreground transition" 
            />
            <AccordionContent className="p-0 bg-background">
              <ScrollArea className="max-h-[250px] w-full">
                <Accordion type="multiple" className="w-full" defaultValue={['other-liabilities-accordion']}>
                  {/* Short Term Debts (Auto Calculated from Debt Module) */}
                  <AccordionItem value="short-term-debts-accordion" className="border-b border-border/20 px-3">
                    <AccordionTriggerWithSum 
                      label="Short-Term Debts (Amortized)" 
                      sum={totalShortTermDebt} 
                      itemCount={shortTermDebts.length} 
                      className="text-xs font-semibold py-2.5 text-muted-foreground border-none hover:bg-transparent" 
                    />
                    <AccordionContent className="pb-2">
                      {shortTermDebts.length > 0 ? (
                        <Table><TableBody>{shortTermDebts.map(debt => renderDerivedDebtRow(debt))}</TableBody></Table>
                      ) : (
                        <p className="text-center text-muted-foreground/80 py-2.5 text-[10px]">No short-term debts registered.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Long Term Debts (Auto Calculated from Debt Module) */}
                  <AccordionItem value="long-term-debts-accordion" className="border-b border-border/20 px-3">
                    <AccordionTriggerWithSum 
                      label="Long-Term Debts (Structured)" 
                      sum={totalLongTermDebt} 
                      itemCount={longTermDebts.length} 
                      className="text-xs font-semibold py-2.5 text-muted-foreground border-none hover:bg-transparent" 
                    />
                    <AccordionContent className="pb-2">
                      {longTermDebts.length > 0 ? (
                        <Table><TableBody>{longTermDebts.map(debt => renderDerivedDebtRow(debt))}</TableBody></Table>
                      ) : (
                        <p className="text-center text-muted-foreground/80 py-2.5 text-[10px]">No long-term debts registered.</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Other Custom Liabilities */}
                  <AccordionItem value="other-liabilities-accordion" className="border-b-0 px-3">
                    <AccordionTriggerWithSum 
                      label="Other Custom Liabilities" 
                      sum={totalOtherLiabilitiesValue} 
                      itemCount={otherLiabilityItems.length} 
                      className="text-xs font-semibold py-2.5 text-muted-foreground border-none hover:bg-transparent" 
                    />
                    <AccordionContent className="pb-2">
                      <Table>
                        <TableBody>
                          {otherLiabilityItems.map(item => renderItemRow(item, 'otherLiability'))}
                          {otherLiabilityItems.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={isEditingAssetsLiabilities ? 3 : 2} className="h-16 text-center text-xs text-muted-foreground/80">
                                No custom liabilities. Add items under Edit Mode.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                      {isEditingAssetsLiabilities && (
                        <div className="flex items-center justify-center py-2 mt-1.5 border-t border-dashed border-border/40">
                          <StatementItemFormPopover 
                            type="otherLiability" 
                            trigger={
                              <Button variant="ghost" size="xs" className="h-7 text-xs font-semibold px-2.5 rounded-lg text-primary hover:text-primary hover:bg-primary/5 flex items-center gap-1.5">
                                <MinusCircle className="h-3.5 w-3.5" /> Add Liability Record
                              </Button>
                            }
                          />
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </ScrollArea>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>

      <CardFooter className="p-5 border-t border-border/40 bg-muted/10 mt-auto">
        <div className="flex justify-between items-center w-full">
          <span className="text-sm font-bold text-foreground">Calculated Net Worth</span>
          <span className={cn(
            "font-mono font-bold text-base tracking-tight px-3 py-1 rounded-full",
            netWorth >= 0 ? 'text-navy dark:text-gold bg-navy-pale dark:bg-navy-mid' : 'text-foreground bg-muted'
          )}>
            {formatCurrency(netWorth)}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
};

export default NetWorthStatementSection;
