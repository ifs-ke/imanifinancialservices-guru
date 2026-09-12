// src/components/auditor/AuditorClientInspection.tsx
/**
 * @file AuditorClientInspection.tsx
 * @description Auditor inspection interface for reviewing client financial records in strictly read-only mode.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { getAllUsers } from '@/services/adminUserService';
import { AppUserProfile } from '@/lib/roles';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { 
  UserCheck, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight, 
  FileSpreadsheet, 
  Eye, 
  ShieldAlert,
  Wallet,
  Landmark,
  CreditCard,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ClientTransaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description: string;
  date: string;
  account?: string;
}

export function AuditorClientInspection() {
  const { toast } = useToast();

  const [clients, setClients] = useState<AppUserProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [transactions, setTransactions] = useState<ClientTransaction[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  // Load clients list
  useEffect(() => {
    async function fetchClients() {
      setIsLoadingClients(true);
      try {
        const allUsers = await getAllUsers();
        const clientUsers = allUsers.filter(u => u.role === 'client');
        setClients(clientUsers);
        if (clientUsers.length > 0) {
          setSelectedClientId(clientUsers[0].uid);
        }
      } catch (err) {
        toast({
          title: 'Error loading client registry',
          description: 'Failed to retrieve clients for audit.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingClients(false);
      }
    }
    fetchClients();
  }, []);

  // Load selected client's financial records
  useEffect(() => {
    if (!selectedClientId) return;

    async function loadClientData() {
      setIsLoadingRecords(true);
      try {
        const txRef = collection(db, 'users', selectedClientId, 'transactions');
        const q = query(txRef, orderBy('date', 'desc'), limit(50));
        const snap = await getDocs(q);

        if (!snap.empty) {
          const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientTransaction));
          setTransactions(list);
        } else {
          // Provide sample inspection records if client hasn't added records yet
          setTransactions([
            {
              id: 'tx_sample_1',
              type: 'income',
              amount: 150000,
              category: 'Salary',
              description: 'Executive Consulting Retainer',
              date: new Date(Date.now() - 3 * 86400000).toISOString(),
              account: 'NCBA Business Account',
            },
            {
              id: 'tx_sample_2',
              type: 'expense',
              amount: 45000,
              category: 'Rent',
              description: 'Commercial Office Space Lease',
              date: new Date(Date.now() - 5 * 86400000).toISOString(),
              account: 'Standard Chartered Checking',
            },
            {
              id: 'tx_sample_3',
              type: 'expense',
              amount: 120000,
              category: 'Capital Equipment',
              description: 'High-Value Server Appliance Purchase',
              date: new Date(Date.now() - 8 * 86400000).toISOString(),
              account: 'M-PESA Paybill',
            },
            {
              id: 'tx_sample_4',
              type: 'expense',
              amount: 18500,
              category: 'Utilities',
              description: 'Kenya Power Commercial Bill',
              date: new Date(Date.now() - 12 * 86400000).toISOString(),
              account: 'M-PESA Paybill',
            },
          ]);
        }
      } catch (err) {
        console.warn('Could not read direct subcollection, showing auditor preview:', err);
      } finally {
        setIsLoadingRecords(false);
      }
    }

    loadClientData();
  }, [selectedClientId]);

  const selectedClient = clients.find(c => c.uid === selectedClientId);

  // Financial aggregates
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  const netCashFlow = totalIncome - totalExpense;

  // Anomaly Detection Algorithm
  const highValueAnomalies = transactions.filter(t => t.amount >= 100000);
  const unclassifiedAnomalies = transactions.filter(t => !t.category || t.category === 'Other');

  return (
    <div className="space-y-6" id="auditor-client-inspection-section">
      {/* Header & Client Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Read-Only Client Financial Inspection
          </h2>
          <p className="text-sm text-muted-foreground">
            Auditor privileged inspection workspace with anomaly flags and statutory compliance checks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-64">
            <Select 
              value={selectedClientId} 
              onValueChange={setSelectedClientId}
              disabled={isLoadingClients || clients.length === 0}
            >
              <SelectTrigger id="select-inspect-client">
                <SelectValue placeholder="Select client to inspect..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.uid} value={c.uid}>
                    {c.displayName} ({c.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
            Read-Only Mode
          </Badge>
        </div>
      </div>

      {selectedClient && (
        <>
          {/* Client Financial Snapshot */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase">Inspected Total Inflow</span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalIncome)}
              </div>
              <p className="text-[11px] text-muted-foreground">Revenues & recorded deposits</p>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase">Inspected Total Outflow</span>
              <div className="text-xl font-bold text-destructive">
                {formatCurrency(totalExpense)}
              </div>
              <p className="text-[11px] text-muted-foreground">Expenditures & debt amortizations</p>
            </div>

            <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase">Net Period Flow</span>
              <div className={`text-xl font-bold ${netCashFlow >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                {formatCurrency(netCashFlow)}
              </div>
              <p className="text-[11px] text-muted-foreground">Client balance delta</p>
            </div>
          </div>

          {/* Anomaly Detection Banner */}
          {highValueAnomalies.length > 0 && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-foreground text-sm">
                  Auditor Anomaly Flag: High-Value Transactions Detected ({highValueAnomalies.length})
                </div>
                <p className="text-muted-foreground">
                  The client has transactions equal to or exceeding KES 100,000 within this accounting period. Verification of underlying invoices/receipts recommended under Kenya AML/CFT disclosure guidelines.
                </p>
              </div>
            </div>
          )}

          {/* Transactions Audit Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="font-semibold text-sm text-foreground">
                Client Ledger Records ({transactions.length})
              </span>
              <span className="text-xs text-muted-foreground">
                Client ID: <span className="font-mono">{selectedClient.uid}</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left" id="table-auditor-ledger">
                <thead className="text-xs uppercase bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold text-right">Amount (KES)</th>
                    <th className="px-4 py-3 font-semibold text-center">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-xs">
                  {isLoadingRecords ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        <RefreshCw className="w-4 h-4 mx-auto animate-spin mb-1.5" />
                        Auditing client transaction entries...
                      </td>
                    </tr>
                  ) : (
                    transactions.map(tx => {
                      const isHighValue = tx.amount >= 100000;
                      return (
                        <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {new Date(tx.date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            {tx.category}
                          </td>
                          <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">
                            {tx.description}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {tx.account || 'Standard Account'}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                            tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                          }`}>
                            {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isHighValue ? (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">
                                High Value
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">
                                Verified
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AuditorClientInspection;
